'use strict';
/* Phrase listening and response use one timeline. Only response time is scored. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VoiceLineGuideTraining=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const PATTERNS=Object.freeze({
  five:{label:'5음 왕복 · 도레미파솔',steps:[0,2,4,5,7,5,4,2,0],tip:'음과 음 사이를 편안하게 연결하세요.'},
  triad:{label:'3화음 왕복 · 도미솔',steps:[0,4,7,4,0],tip:'도약한 음을 먼저 떠올리고 따라 부르세요.'},
  minor:{label:'단조 왕복',steps:[0,2,3,5,7,5,3,2,0],tip:'장조와 다른 세 번째 음의 높이에 집중하세요.'},
  down:{label:'5음 하행 · 솔파미레도',steps:[7,5,4,2,0],tip:'높은 음에서 아래로 내려와 시작음에 도착합니다.'},
  arpeggio:{label:'옥타브 아르페지오',steps:[0,4,7,12,7,4,0],tip:'넓은 음역은 편안한 시작음에서 연습하세요.'},
  octave:{label:'옥타브 왕복',steps:[0,12,0,12,0],tip:'같은 음 이름의 낮은 음과 높은 음을 구별하세요.'},
  chromatic:{label:'반음 왕복',steps:[0,1,2,3,4,3,2,1,0],tip:'작은 반음 차이를 듣고 천천히 이동하세요.'},
  thirds:{label:'3도 연결',steps:[0,4,2,5,4,7,5,9,7],tip:'올라가는 음과 내려오는 음을 번갈아 연결합니다.'},
  octaveScale:{label:'한 옥타브 음계 왕복',steps:[0,2,4,5,7,9,11,12,11,9,7,5,4,2,0],tip:'한 구절이 길면 빠르기를 올리거나 짧은 패턴을 고르세요.'},
  return:{label:'기준음으로 돌아오기',steps:[0,2,0,4,0,5,0,7,0],tip:'다른 음을 부른 뒤 같은 시작음으로 돌아오세요.'},
  step3:{label:'단계별 왕복 · 3반음',span:3,steps:[0,1,2,3,2,1,0],tip:'반음씩 올라갔다 내려옵니다. 연습 설정에서 한 음을 2·3·4초 유지할 수도 있습니다.'},
  step5:{label:'단계별 왕복 · 5반음',span:5,steps:[0,1,2,3,4,5,4,3,2,1,0],tip:'한 반음씩 차근차근 이동합니다. 편안한 시작음에서 연습하세요.'},
  step7:{label:'단계별 왕복 · 7반음',span:7,steps:[0,1,2,3,4,5,6,7,6,5,4,3,2,1,0],tip:'반음 단위로 7반음 범위를 왕복합니다. 필요하면 중간에 숨을 편안하게 쉬세요.'},
  step12:{label:'단계별 왕복 · 12반음',span:12,steps:[0,1,2,3,4,5,6,7,8,9,10,11,12,11,10,9,8,7,6,5,4,3,2,1,0],tip:'한 옥타브를 반음씩 왕복합니다. 짧은 패턴부터 익힌 뒤 연습하세요.'},
  smooth3:{label:'연속 슬라이드 · 3반음',span:3,smooth:true,steps:[0,3,0],tip:'6초 동안 부드럽게 올라간 뒤 6초 동안 내려옵니다. 음을 끊지 않고 이어보세요.'},
  smooth5:{label:'연속 슬라이드 · 5반음',span:5,smooth:true,steps:[0,5,0],tip:'한 음씩 끊지 말고 목표 곡선을 따라 12초 동안 왕복합니다.'},
  smooth7:{label:'연속 슬라이드 · 7반음',span:7,smooth:true,steps:[0,7,0],tip:'음 사이를 부드럽게 연결합니다. 무리하지 않는 시작음을 선택하세요.'},
  smooth12:{label:'연속 슬라이드 · 12반음',span:12,smooth:true,steps:[0,12,0],tip:'한 옥타브를 연속으로 왕복합니다. 편안한 음역에서 시작하세요.'}
 });
 for(const p of Object.values(PATTERNS)){Object.freeze(p.steps);Object.freeze(p);}
 const SOUNDS=Object.freeze({piano:'피아노',hum:'부드러운 허밍 톤',vowel:'밝은 모음 톤'});
 const DEFAULTS=Object.freeze({pattern:'five',root:60,bpm:80,noteSeconds:0,rounds:3,shift:1,sound:'piano',volume:70,tolerance:50});
 const TIMING=Object.freeze({prepare:1800,handoff:3000,rest:1400});
 const number=(value,fallback,min,max)=>Number.isFinite(Number(value))&&value!==''&&value!==null?clamp(Math.round(Number(value)),min,max):fallback;
 function normalize(value={}){
  if(!value||typeof value!=='object')value={};
  const pattern=Object.hasOwn(PATTERNS,value.pattern)?value.pattern:DEFAULTS.pattern;
  const entry=PATTERNS[pattern],max=entry.span?0:Math.max(...entry.steps);
  return {pattern,root:number(value.root,DEFAULTS.root,36,94-max),bpm:number(value.bpm,DEFAULTS.bpm,50,120),
   noteSeconds:[0,2,3,4].includes(Number(value.noteSeconds))?Number(value.noteSeconds):0,
   rounds:number(value.rounds,DEFAULTS.rounds,1,5),shift:[-1,0,1].includes(Number(value.shift))?Number(value.shift):DEFAULTS.shift,
   sound:Object.hasOwn(SOUNDS,value.sound)?value.sound:DEFAULTS.sound,
   volume:number(value.volume,DEFAULTS.volume,0,100),tolerance:[35,50,75].includes(Number(value.tolerance))?Number(value.tolerance):DEFAULTS.tolerance};
 }
 function restore(value,legacy){
  if(value&&typeof value==='object'&&Object.hasOwn(PATTERNS,value.pattern))return normalize(value);
  if(legacy&&typeof legacy==='object'&&[3,5,7,12].includes(legacy.glideSpan)){
   const smooth=legacy.glideStyle==='smooth',span=legacy.glideStyle?legacy.glideSpan:3;
   return normalize({pattern:(smooth?'smooth':'step')+span,root:legacy.root,rounds:1,shift:0,
    noteSeconds:smooth?0:[2,3,4].includes(legacy.glideStepSeconds)?legacy.glideStepSeconds:3});
  }
  return normalize(value);
 }
 const triangle=q=>{q=clamp(q,0,1);return q<.5?q*2:(1-q)*2;};
 function plan(value){
  const settings=normalize(value),entry=PATTERNS[settings.pattern];
  const direction=entry.span&&settings.root+entry.span>94?-1:1;
  const pattern=direction<0?{...entry,steps:entry.steps.map(offset=>-offset),
   tip:entry.smooth?'높은 시작음에서는 아래로 6초 내린 뒤 6초 동안 시작음으로 돌아옵니다.':'높은 시작음에서는 범위 안에서 반음씩 아래로 왕복합니다.'}:entry;
  const smooth=Boolean(pattern.smooth),noteMs=smooth?3000:settings.noteSeconds?settings.noteSeconds*1000:60000/settings.bpm;
  const roots=[];
  for(let i=0;i<settings.rounds;i++){
   const root=settings.root+i*settings.shift;
   if(pattern.steps.some(offset=>root+offset<36||root+offset>94))break;
   roots.push(root);
  }
  const phraseMs=smooth?12000:pattern.steps.length*noteMs,cycleMs=phraseMs*2+TIMING.handoff+TIMING.rest;
  return {settings,pattern,smooth,direction,tolerance:smooth?110:settings.tolerance,noteMs,phraseMs,cycleMs,handoffMs:TIMING.handoff,roots,rounds:roots.length,
   duration:cycleMs*roots.length,limited:roots.length<settings.rounds,
   responseMs:roots.length*(smooth?phraseMs-100:pattern.steps.length*(noteMs-100))};
 }
 function create(value,t){
  const p=plan(value);
  return {mode:'guideVoice',active:true,...p,start:t+TIMING.prepare,root:p.settings.root,target:null,
   bins:p.roots.map(root=>(p.smooth?[0,1,2,3]:p.pattern.steps).map((offset,i)=>({
    midi:root+(p.smooth?p.pattern.steps[1]*triangle((i+.5)/4):offset),
    label:p.smooth?(p.direction<0?['내리기 앞부분','내리기 뒷부분','올리기 앞부분','올리기 뒷부분']:['올리기 앞부분','올리기 뒷부분','내리기 앞부분','내리기 뒷부분'])[i]:null,
    expected:p.smooth?p.noteMs-(i===0?100:0):p.noteMs-100,voiced:0,good:0,samples:0}))),
   history:[],last:null,valid:0,voicedMs:0,goodMs:0,low:null,high:null};
 }
 function position(s,t){
  const elapsed=t-s.start;
  if(elapsed<0)return {phase:'ready',round:0,offset:0,index:0,midi:s.roots[0]+s.pattern.steps[0],remaining:-elapsed};
  if(elapsed>=s.duration)return {phase:'done',round:s.rounds-1,offset:s.phraseMs,index:s.smooth?3:s.pattern.steps.length-1,
   midi:s.roots[s.rounds-1]+s.pattern.steps[s.pattern.steps.length-1],remaining:0};
  const round=Math.floor(elapsed/s.cycleMs),within=elapsed-round*s.cycleMs;
  let phase,offset;
  if(within<s.phraseMs){phase='listen';offset=within;}
  else if(within<s.phraseMs+s.handoffMs){phase='handoff';offset=0;}
  else if(within<s.phraseMs*2+s.handoffMs){phase='answer';offset=within-s.phraseMs-s.handoffMs;}
  else{phase='rest';offset=s.phraseMs;}
  const index=Math.min(s.smooth?3:s.pattern.steps.length-1,Math.floor(offset/s.noteMs));
  const answerStart=s.start+round*s.cycleMs+s.phraseMs+s.handoffMs;
  return {phase,round,offset,index,midi:s.roots[round]+(s.smooth?s.pattern.steps[1]*triangle(offset/s.phraseMs):s.pattern.steps[index]),
   answerStart,answerIn:Math.max(0,answerStart-t),gradeStart:s.smooth?Math.max(answerStart+100,answerStart+index*s.noteMs):answerStart+index*s.noteMs+100,
   noteStart:answerStart+index*s.noteMs,
   remaining:s.duration-elapsed};
 }
 function startCue(s,t){
  const p=position(s,t),starting=p.phase==='answer'&&p.offset<Math.min(900,s.noteMs*.8);
  const visible=p.phase==='handoff'||starting;
  return {visible,phase:p.phase,count:p.phase==='handoff'?clamp(Math.ceil(p.answerIn/1000),1,3):0,
   starting,firstMidi:s.roots[p.round]+s.pattern.steps[0]};
 }
 function receive(s,t,midi){
  if(!s?.active||!Number.isFinite(t)||s.last&&t<=s.last.t)return;
  const p=position(s,t),valid=Number.isFinite(midi)&&midi>=35.5&&midi<=94.5;
  const previous=s.last,gap=previous?t-previous.t:0;
  s.last={t,midi:valid?midi:null,phase:p.phase,round:p.round};
  if(p.phase!=='answer')return;
  s.history.push({t,offset:p.offset,round:p.round,midi:valid?midi:null});
  if(!valid)return;
  s.valid++;s.low=Math.min(s.low??midi,midi);s.high=Math.max(s.high??midi,midi);
  const bin=s.bins[p.round][p.index];bin.samples++;
  // Do not fill silence, delayed callbacks, the guide handoff, or note attacks.
  if(!previous||previous.phase!=='answer'||previous.round!==p.round||
   !Number.isFinite(previous.midi)||gap<=0||gap>160)return;
  const delta=Math.max(0,Math.min(gap,t-p.gradeStart));
  if(!delta)return;
  bin.voiced+=delta;s.voicedMs+=delta;
  if(Math.abs(midi-p.midi)*100<=s.tolerance){bin.good+=delta;s.goodMs+=delta;}
 }
 function metrics(s){
  const accuracy=s.voicedMs>0?Math.floor(100*s.goodMs/s.voicedMs+1e-9):null;
  const coverage=Math.min(100,Math.floor(100*s.voicedMs/s.responseMs+1e-9));
  const each=s.bins.flat().every(b=>b.voiced>=b.expected*.2);
  return {accuracy,coverage,enough:s.valid>=12&&coverage>=40&&each,each};
 }
 function evaluate(s,completed){
  const m=metrics(s),passed=m.enough&&m.accuracy>=65;
  return {status:!completed?'중단':!m.enough?'측정 부족':passed?'성공':'다시 연습',
   kind:!completed?'stopped':!m.enough?'guided':passed?'success':'failure',
   rule:'따라 부르기만 채점 · 목표 ±'+s.tolerance+'cent · 일치율 65% 이상 · 전체 발성 40% 및 '+(s.smooth?'각 이동 구간':'각 음')+' 20% 이상 ('+(s.smooth?'응답 시작':'음 시작')+' 0.1초 제외)',
   reason:'음정 일치율 '+(m.accuracy===null?'—':m.accuracy+'%')+' · 발성 커버리지 '+m.coverage+'% · 유효 발성 '+(s.voicedMs/1000).toFixed(1)+'초'};
 }
 function summary(s,label,completed=true){
  const m=metrics(s),weak=s.bins.flat().filter(b=>b.voiced<b.expected*.2||b.good/Math.max(1,b.voiced)<.65);
  const notes=[...new Set(weak.map(b=>b.label||label(b.midi)))].slice(0,4);
  const completedRounds=clamp(Math.floor(((s.finishedAt??s.start)-s.start)/s.cycleMs),0,s.rounds);
  const rounds=completed?s.rounds+'회':completedRounds+'회 완료 / '+s.rounds+'회 계획';
  return s.pattern.label+' · '+rounds+' · '+evaluate(s,true).reason+
   (notes.length?' · 더 연습할 '+(s.smooth?'구간 ':'음 ')+notes.join(', '):'')+(m.enough?'':' · 충분히 따라 부른 뒤 다시 확인하세요');
 }
 function createPlayer(ac,destination,sample=()=>null,timers=globalThis,onInterrupted=()=>{}){
  const voices=new Set();let timer=null,schedule=[],next=0,origin=0,stopped=true;
  function stop(){
   stopped=true;if(timer!==null)timers.clearInterval(timer);timer=null;schedule=[];next=0;
   ac.removeEventListener?.('statechange',stateChange);
   for(const voice of voices){
    try{voice.gain.gain.cancelScheduledValues(ac.currentTime);voice.gain.gain.setTargetAtTime(.00001,ac.currentTime,.006);
     for(const source of voice.sources)source.stop(ac.currentTime+.025);}catch(_){}
   }
   voices.clear();
  }
  function stateChange(){
   if(!stopped&&ac.state&&ac.state!=='running'){stop();onInterrupted();}
  }
  function note(item){
   const t=Math.max(ac.currentTime,item.at),length=item.length,vol=item.volume/100;
   if(!vol)return;
   const gain=ac.createGain(),sources=[],voice={gain,sources};voices.add(voice);
   gain.connect(destination);
   const found=item.sound==='piano'&&!item.smooth?sample(item.midi):null;
   if(found?.buffer){
    const source=ac.createBufferSource();source.buffer=found.buffer;
    source.playbackRate.setValueAtTime(Math.pow(2,(item.midi-found.anchor)/12),t);source.connect(gain);sources.push(source);
   }else{
    const harmonics=item.sound==='hum'?[1,.23,.07]:item.sound==='vowel'?[1,.5,.35,.16]:[1,.3,.12];
    harmonics.forEach((amplitude,i)=>{
     const source=ac.createOscillator(),partial=ac.createGain();source.type='sine';
     const hz=m=>440*Math.pow(2,(m-69)/12)*(i+1);
     if(item.smooth){
      const end=item.at+item.duration,middle=item.at+item.duration/2;
      const current=item.midi+(item.peakMidi-item.midi)*triangle((t-item.at)/item.duration);
      source.frequency.setValueAtTime(hz(current),t);
      if(t<middle)source.frequency.exponentialRampToValueAtTime(hz(item.peakMidi),middle);
      source.frequency.exponentialRampToValueAtTime(hz(item.midi),end);
     }else source.frequency.setValueAtTime(hz(item.midi),t);
     partial.gain.value=amplitude;
     source.connect(partial);partial.connect(gain);source._guidePartial=partial;sources.push(source);
    });
   }
   const peak=(found?.gain||.075)*vol;
   gain.gain.setValueAtTime(.00001,t);gain.gain.linearRampToValueAtTime(peak,t+.035);
   gain.gain.setValueAtTime(item.sound==='piano'?peak*.55:peak,t+Math.max(.04,length-.07));
   gain.gain.linearRampToValueAtTime(.00001,t+length);
   let remaining=sources.length;
   for(const source of sources){
    source.onended=()=>{source.disconnect();source._guidePartial?.disconnect();if(!--remaining){gain.disconnect();voices.delete(voice);}};
    source.start(t);source.stop(t+length+.01);
   }
  }
  function pump(){
   if(stopped)return;
   try{
    while(next<schedule.length&&schedule[next].at<ac.currentTime+.18){
     const item=schedule[next++];if(item.at+item.length>ac.currentTime+.05)note({...item,length:Math.min(item.length,item.at+item.length-Math.max(item.at,ac.currentTime))});
    }
    if(next===schedule.length&&timer!==null){timers.clearInterval(timer);timer=null;}
   }catch(_){stop();onInterrupted();}
  }
  function start(s,now){
   stop();stopped=false;origin=ac.currentTime+(s.start-now)/1000;
   ac.addEventListener?.('statechange',stateChange);
   for(let round=0;round<s.rounds;round++){
    if(s.smooth)schedule.push({at:origin+round*s.cycleMs/1000,midi:s.roots[round],peakMidi:s.roots[round]+s.pattern.steps[1],
     smooth:true,duration:s.phraseMs/1000,length:s.phraseMs/1000,sound:s.settings.sound,volume:s.settings.volume});
    else s.pattern.steps.forEach((offset,i)=>schedule.push({
     at:origin+(round*s.cycleMs+i*s.noteMs)/1000,midi:s.roots[round]+offset,
     length:s.noteMs*.9/1000,sound:s.settings.sound,volume:s.settings.volume
    }));
   }
   pump();if(!stopped)timer=timers.setInterval(pump,25);
  }
  return {start,stop,pump,get activeVoices(){return voices.size;}};
 }
 function draw(canvas,s,t,label){
  if(!canvas||!s)return;
  const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;
  if(w<90||h<45)return;
  const dpr=Math.min(globalThis.devicePixelRatio||1,2);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const p=position(s,t),notes=s.pattern.steps.map(offset=>s.roots[p.round]+offset);
  const grid=[...new Set(notes)].sort((a,b)=>a-b),labels=grid.map(label);
  ctx.font='11px system-ui';
  const labelWidth=Math.max(38,...labels.map(text=>ctx.measureText?.(text)?.width||text.length*6));
  const low=Math.min(...notes)-2,high=Math.max(...notes)+2,x0=Math.min(Math.ceil(labelWidth+12),Math.max(48,w*.36)),x1=w-10,y0=9,y1=h-22;
  if(y1<=y0)return;
  const xx=ms=>x0+clamp(ms/s.phraseMs,0,1)*(x1-x0),yy=m=>y1-(m-low)/(high-low)*(y1-y0);
  ctx.font='11px system-ui';ctx.textAlign='right';ctx.lineWidth=1;
  const stride=Math.max(1,Math.ceil(grid.length/Math.max(2,Math.floor((y1-y0)/18))));
  for(const [i,midi] of grid.entries()){
   const y=yy(midi);ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.strokeStyle='#d4e6ff20';ctx.stroke();
   if(i%stride===0||i===grid.length-1){ctx.fillStyle='#c9d3e8';ctx.fillText(labels[i],x0-6,y+4,x0-10);}
  }
  if(s.smooth){
   ctx.beginPath();ctx.moveTo(x0,yy(notes[0]));ctx.lineTo(xx(s.phraseMs/2),yy(notes[1]));ctx.lineTo(x1,yy(notes[2]));
   ctx.lineWidth=3;ctx.strokeStyle='#83f5d6';ctx.stroke();
  }else for(let i=0;i<notes.length;i++){
   const left=xx(i*s.noteMs),right=xx((i+1)*s.noteMs),y=yy(notes[i]);
   ctx.fillStyle=p.index===i&&['listen','answer'].includes(p.phase)?'#64e3c82b':'#64e3c811';
   ctx.fillRect(left,y-6,Math.max(1,right-left-2),12);
   ctx.beginPath();if(i)ctx.moveTo(left,yy(notes[i-1]));else ctx.moveTo(left,y);
   ctx.lineTo(left,y);ctx.lineTo(right-2,y);ctx.lineWidth=3;ctx.strokeStyle='#83f5d6';ctx.stroke();
  }
  ctx.beginPath();let previous=null;
  for(const point of s.history){
   if(point.round!==p.round||!Number.isFinite(point.midi)){previous=null;continue;}
   const x=xx(point.offset),y=yy(clamp(point.midi,low,high));
   if(!previous||point.t-previous>160)ctx.moveTo(x,y);else ctx.lineTo(x,y);previous=point.t;
  }
  ctx.lineWidth=2.5;ctx.strokeStyle='#efb4ff';ctx.stroke();
  const cursor=xx(p.offset);ctx.beginPath();ctx.moveTo(cursor,y0);ctx.lineTo(cursor,y1);ctx.lineWidth=1.5;ctx.strokeStyle='#fff6';ctx.stroke();
  if(startCue(s,t).visible){
   ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x0,y1);ctx.lineWidth=3;ctx.strokeStyle='#ffd681';ctx.stroke();
   ctx.textAlign='left';ctx.font='11px system-ui';ctx.fillStyle='#ffd681';ctx.fillText('첫 음 시작',x0+5,y0+11);
  }
  if(p.phase==='answer'&&Number.isFinite(s.last?.midi)&&t-s.last.t<=210){
   ctx.beginPath();ctx.arc(cursor,yy(clamp(s.last.midi,low,high)),4.5,0,Math.PI*2);ctx.fillStyle='#efb4ff';ctx.fill();
  }
  ctx.fillStyle='#c5c8dd';ctx.font='10px system-ui';ctx.textAlign='left';ctx.fillText('시작',x0,h-4);ctx.textAlign='right';ctx.fillText((s.phraseMs/1000).toFixed(1)+'초',x1,h-4);
 }
 return {PATTERNS,SOUNDS,DEFAULTS,TIMING,normalize,restore,plan,create,position,startCue,receive,metrics,evaluate,summary,createPlayer,draw};
});
