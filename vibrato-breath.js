'use strict';
// Training helpers: pitch movements are indicative only, not medical measurements.
(function () {
  const el=id=>document.getElementById(id);
  const $mode=el('vibratoMode');
  const profiles={
    free:{name:'자유 비브라토',tip:'편안하게 유지하면서 실제 음정이 어떻게 움직이는지 관찰하세요.',rate:null,depth:null},
    slow:{name:'느린 비브라토',tip:'처음에는 느리고 작은 움직임으로 시작하세요. 억지로 목을 흔들지 마세요.',rate:3,depth:30},
    natural:{name:'일정한 비브라토',tip:'작고 규칙적인 음정 변화를 관찰하세요. 꼭 목표 숫자를 달성할 필요는 없습니다.',rate:5,depth:40},
    quick:{name:'속도 높이기',tip:'편안한 상태에서만 서서히 속도를 높이세요. 소리가 경직되면 천천히 돌아오세요.',rate:6.5,depth:35},
    narrow:{name:'좁은 폭',tip:'기준 음정에서 아주 작게 움직여 보세요. 음정 중심이 이동하지 않도록 관찰하세요.',rate:5,depth:20},
    wide:{name:'넓은 폭',tip:'폭을 크게 억지로 늘리지 마세요. 목에 부담이 없는 범위에서만 시도하세요.',rate:4,depth:70},
    steady:{name:'한 음 안정화',tip:'비브라토 대신 흔들림을 줄여 음정을 평탄하게 유지하는 연습입니다.',rate:0,depth:0}
  };
  const vib={active:false,start:0,end:0,samples:[],lastRate:null,lastDepth:null,sessionStart:0};
  let breath=null,frame=0;
  function limit(id,min,max){let v=Number(el(id).value);if(!Number.isFinite(v))v=min;v=Math.round(Math.min(max,Math.max(min,v)));el(id).value=v;return v;}
  function currentProfile(){return profiles[$mode.value]||profiles.natural;}
  function resetVibrato(){
    vib.active=false;vib.samples=[];vib.lastRate=null;vib.lastDepth=null;
    el('vibratoButton').textContent='비브라토 연습 시작';
    el('vibratoDetectedRate').textContent='-- Hz';el('vibratoDetectedDepth').textContent='-- cent';
    el('vibratoElapsed').textContent='00:00';el('vibratoFeedback').textContent='마이크를 켜면 음정의 변화가 분석됩니다. 음정 신호가 안정적일 때만 속도를 표시합니다.';
  }
  function changeProfile(){
    const p=currentProfile();el('vibratoGoal').textContent=p.name;el('vibratoTip').textContent=p.tip;
    if(p.rate!==null){el('vibratoRate').value=p.rate;el('vibratoDepth').value=Math.max(10,p.depth||10);}
    setLabels();
  }
  function setLabels(){el('vibratoRateLabel').textContent=Number(el('vibratoRate').value).toFixed(1)+' Hz';el('vibratoDepthLabel').textContent='±'+el('vibratoDepth').value+' cent';}
  function estimateVibrato(){
    const a=vib.samples;if(a.length<16)return null;
    const end=a[a.length-1].t,start=end-1800;
    const segment=a.filter(p=>p.t>=start);
    if(segment.length<16 || end-segment[0].t<1100)return null;
    // Remove pitch drift (sustained note may slowly rise/fall), measure the residual in cents.
    const x0=segment[0].t,meanX=segment.reduce((s,v)=>s+v.t-x0,0)/segment.length;
    const meanY=segment.reduce((s,v)=>s+v.midi*100,0)/segment.length;
    let cov=0,varX=0;
    for(const p of segment){const x=p.t-x0-meanX;cov+=x*(p.midi*100-meanY);varX+=x*x;}
    const slope=varX?cov/varX:0;
    let filtered=segment.map(p=>({t:p.t,y:p.midi*100-meanY-slope*(p.t-x0-meanX)}));
    // Three-point smoothing suppresses single-sample pitch detector jitter.
    filtered=filtered.map((p,i)=>({t:p.t,y:(filtered[Math.max(0,i-1)].y+p.y+filtered[Math.min(filtered.length-1,i+1)].y+p.y)/4}));
    const vals=filtered.map(p=>p.y).sort((a,b)=>a-b);
    const pct=q=>vals[Math.max(0,Math.min(vals.length-1,Math.round((vals.length-1)*q)))];
    const depth=(pct(.9)-pct(.1))/2;
    if(depth<5 || depth>180)return {depth:Math.round(depth),rate:null};
    const turns=[];
    for(let i=2;i<filtered.length-2;i++){
      const prev=filtered[i-1].y,mid=filtered[i].y,next=filtered[i+1].y;
      const peak=mid>prev && mid>=next;
      const trough=mid<prev && mid<=next;
      if(!(peak||trough))continue;
      const kind=peak?'max':'min',point=filtered[i];
      if(Math.abs(point.y)<Math.max(5,depth*.23))continue;
      const last=turns[turns.length-1];
      if(last && last.kind===kind){if((kind==='max'&&point.y>last.y)||(kind==='min'&&point.y<last.y))turns[turns.length-1]={...point,kind};continue;}
      if(last && point.t-last.t<55)continue;
      turns.push({...point,kind});
    }
    const periods=[];
    for(let i=2;i<turns.length;i++){
      const period=turns[i].t-turns[i-2].t;
      if(period>=125&&period<=500)periods.push(period);
    }
    if(periods.length<3)return {depth:Math.round(depth),rate:null};
    periods.sort((a,b)=>a-b);
    const rate=1000/periods[Math.floor(periods.length/2)];
    return {depth:Math.round(depth),rate:rate>=2&&rate<=8?rate:null};
  }
  function samplePitch(t,midi){
    if(!Number.isFinite(midi))return;
    if(vib.samples.length && Math.abs(midi-vib.samples[vib.samples.length-1].midi)>1.7){vib.samples=[];return;}
    vib.samples.push({t,midi});vib.samples=vib.samples.filter(p=>t-p.t<2200);
    if(vib.samples.length%3!==0)return;
    const result=estimateVibrato();if(!result)return;
    vib.lastDepth=result.depth;vib.lastRate=result.rate;
    el('vibratoDetectedDepth').textContent='±'+result.depth+' cent';
    el('vibratoDetectedRate').textContent=result.rate===null?'불규칙':result.rate.toFixed(1)+' Hz';
    if(result.rate!==null){
      const goal=Number(el('vibratoRate').value),depth=Number(el('vibratoDepth').value);
      el('vibratoFeedback').textContent=`현재 약 ${result.rate.toFixed(1)}Hz · ±${result.depth}cent. 목표 속도 ${goal.toFixed(1)}Hz / 폭 ±${depth}cent (참고용)`;
      el('scoreValue').textContent=result.rate.toFixed(1)+'Hz';
    }else el('vibratoFeedback').textContent='음정 변화가 일정하지 않아 속도를 추정하지 못했습니다. 편안한 발성으로 천천히 연습하세요.';
  }
  function noPitch(t){vib.samples=vib.samples.filter(p=>t-p.t<600);}
  function startVib(){
    if(!state.running){setNotice('비브라토 훈련을 시작하려면 먼저 마이크를 켜주세요.');return;}
    if(vib.active){finishVib(false);return;}
    resetVibrato();vib.active=true;vib.sessionStart=state.lastElapsed;vib.end=state.lastElapsed+limit('vibratoDuration',3,180)*1000;
    el('vibratoButton').textContent='비브라토 연습 중단';setNotice('편안한 한 음을 유지하고 그래프를 관찰해 보세요.');
  }
  function finishVib(done){
    if(!vib.active)return;
    vib.active=false;el('vibratoButton').textContent='비브라토 다시 연습하기';
    if(done){
      if(vib.lastRate!==null)recordHistory('비브라토 · '+currentProfile().name,vib.lastRate.toFixed(1)+'Hz / ±'+vib.lastDepth+'cent');
      setNotice('비브라토 연습 완료! 측정치는 참고용이며 목에 무리가 가면 쉬어 주세요.');
    }else setNotice('비브라토 연습을 중단했습니다.');
  }
  function drawVibratoGuide(context,opt){
    if(state.mode!=='vibrato')return;
    const p=currentProfile(),r=p.rate===null?Number(el('vibratoRate').value):p.rate;
    const d=p.depth===null?Number(el('vibratoDepth').value):p.depth;
    const base=Number(el('vibratoRoot').value),s=Math.max(120,Math.min(300,opt.w/3));
    context.save();context.strokeStyle='#80ede2';context.lineWidth=2.5;context.globalAlpha=.88;
    context.beginPath();
    for(let px=opt.l;px<=opt.w-opt.r;px+=2){
      const t=opt.start+(px-opt.l)/(opt.w-opt.r-opt.l)*12000;
      const target=base+(p.rate===0?0:(d/100)*Math.sin(2*Math.PI*r*t/1000));
      if(px===opt.l)context.moveTo(px,opt.y(target));else context.lineTo(px,opt.y(target));
    }
    context.stroke();context.restore();
  }
  function breathConfig(){
    return {in:limit('breathIn',1,60),hold:limit('breathHold',0,60),out:limit('breathOut',1,120),rest:limit('breathRest',0,60),repeat:limit('breathRepeats',1,30)};
  }
  function pretty(s){const n=Math.max(0,Math.ceil(s));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function saveBreath(){
    const c=breathConfig();
    el('breathDuration').textContent='총 '+pretty((c.in+c.hold+c.out+c.rest)*c.repeat)+' · '+c.repeat+'회 반복';
    try{localStorage.setItem('voiceline-breath-v1',JSON.stringify(c));}catch(_){}
  }
  function stagesOf(c){const items=[];for(let i=0;i<c.repeat;i++)for(const stage of [{key:'in',label:'들이쉬기'},{key:'hold',label:'편안히 유지'},{key:'out',label:'천천히 내쉬기'},{key:'rest',label:'쉬기'}])if(c[stage.key]>0)items.push({duration:c[stage.key]*1000,name:stage.label,cycle:i+1,key:stage.key});return items;}
  function cancelBreath(){if(frame)cancelAnimationFrame(frame);frame=0;breath=null;el('breathStart').textContent='호흡 훈련 시작';el('breathStage').textContent='준비';el('breathCountdown').textContent='00:00';el('breathProgress').style.width='0%';el('breathCycle').textContent='호흡 시간을 설정한 뒤 시작하세요';el('breathOrb').removeAttribute('data-stage');}
  function paintBreath(now){
    if(!breath || breath.paused)return;
    const delta=now-breath.time;breath.time=now;breath.elapsed+=Math.max(0,Math.min(delta,250));
    let t=breath.elapsed,i=0;
    while(i<breath.stages.length && t>=breath.stages[i].duration){t-=breath.stages[i].duration;i++;}
    if(i===breath.stages.length){
      const repeats=breath.config.repeat;cancelBreath();el('breathStage').textContent='완료';el('breathCycle').textContent=repeats+'회 호흡 연습 완료';el('breathCountdown').textContent='00:00';el('breathProgress').style.width='100%';recordHistory('호흡 훈련',repeats+'회 · '+pretty(breathDoneDuration)+' 연습');return;
    }
    const stage=breath.stages[i];const remaining=Math.max(0,(stage.duration-t)/1000);
    el('breathStage').textContent=stage.name;el('breathCountdown').textContent=pretty(remaining);
    el('breathCycle').textContent=`${stage.cycle} / ${breath.config.repeat}회 · ${stage.name}`;
    el('breathOrb').dataset.stage=stage.key;
    el('breathProgress').style.width=(breath.elapsed/breath.total*100).toFixed(2)+'%';
    frame=requestAnimationFrame(paintBreath);
  }
  let breathDoneDuration=0;
  function startPauseBreath(){
    if(breath){
      if(!breath.paused){breath.paused=true;if(frame)cancelAnimationFrame(frame);el('breathStart').textContent='호흡 훈련 재개';el('breathStage').textContent='일시정지';}
      else{breath.paused=false;breath.time=performance.now();el('breathStart').textContent='일시정지';frame=requestAnimationFrame(paintBreath);}
      return;
    }
    saveBreath();const c=breathConfig(),stages=stagesOf(c),total=stages.reduce((s,p)=>s+p.duration,0);
    breath={config:c,stages,total,elapsed:0,time:performance.now(),paused:false};breathDoneDuration=total/1000;
    el('breathStart').textContent='일시정지';frame=requestAnimationFrame(paintBreath);
  }
  function modeChanged(mode){
    const micNeeded=mode==='vibrato';el('vibratoButton').disabled=!state.running;
    if(mode==='breath')saveBreath();
  }
  function micStarted(){el('vibratoButton').disabled=false;}
  function micStopped(){el('vibratoButton').disabled=true;if(vib.active)finishVib(false);}
  function update(elapsed){if(vib.active){const duration=(elapsed-vib.sessionStart)/1000;el('vibratoElapsed').textContent=pretty(duration);if(elapsed>=vib.end)finishVib(true);}}
  $mode.addEventListener('change',changeProfile);
  for(const id of ['vibratoRate','vibratoDepth'])el(id).addEventListener('input',setLabels);
  el('vibratoRoot').addEventListener('change',()=>{resetVibrato();drawChart(state.lastElapsed);});
  el('vibratoButton').addEventListener('click',startVib);
  for(const id of ['breathIn','breathHold','breathOut','breathRest','breathRepeats'])el(id).addEventListener('change',saveBreath);
  document.querySelectorAll('[data-breath-preset]').forEach(btn=>btn.addEventListener('click',()=>{
    const p={easy:[3,0,4,2],even:[4,0,4,2],long:[4,0,6,3]}[btn.dataset.breathPreset];
    if(!p)return;['breathIn','breathHold','breathOut','breathRest'].forEach((id,i)=>el(id).value=p[i]);saveBreath();
  }));
  el('breathStart').addEventListener('click',startPauseBreath);el('breathReset').addEventListener('click',cancelBreath);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&breath&&!breath.paused)startPauseBreath();});
  try{const saved=JSON.parse(localStorage.getItem('voiceline-breath-v1'));if(saved)for(const [key,id] of Object.entries({in:'breathIn',hold:'breathHold',out:'breathOut',rest:'breathRest',repeat:'breathRepeats'}))if(Number.isFinite(saved[key]))el(id).value=saved[key];}catch(_){}
  changeProfile();saveBreath();
  window.VoiceLineExtra={resetVibrato,modeChanged,micStarted,micStopped,addPitch:samplePitch,noPitch,drawVibratoGuide,update,cancelBreath,estimateVibrato};
})();
