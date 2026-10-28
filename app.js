'use strict';

// 보이스라인: 순수 Web Audio API + YIN 피치 감지. 음성 원본을 저장하거나 전송하지 않습니다.
const $ = (id) => document.getElementById(id);
const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const korean = ['도','도♯','레','레♯','미','파','파♯','솔','솔♯','라','라♯','시'];
const modeMeta = {
  free: ['자유롭게 불러보세요', '편안한 음부터 불러보세요. 그래프에 목소리의 움직임과 음정이 기록됩니다.'],
  practice: ['목표 음정을 따라 불러보세요', '화면에 나타나는 목표 음정과 내 목소리의 선을 겹치도록 연습해 보세요.'],
  range: ['나의 음역대를 찾아보세요', '목에 무리를 주지 않는 선에서 낮은 음과 높은 음을 0.5초 이상 유지해 보세요.']
};
const state = {
  mode: 'free', running: false, audioContext: null, stream: null, analyser: null, audioSource: null,
  audioBuffer: null, raf: 0, lastAnalysis: 0, sessionStart: 0, lastElapsed: 0, lastVoiced: 0,
  current: null, recentPitch: [], stableWindow: [], points: [], lowMidi: null, highMidi: null,
  exercise: null, currentStep: -1, history: [], savedRange: null, canvasWidth: 0, canvasHeight: 0
};
const chart = $('pitchChart');
const ctx = chart.getContext('2d');
const STORAGE_KEY = 'voiceline-records-v1';

function midiToHz(midi) { return 440 * 2 ** ((midi - 69) / 12); }
function hzToMidi(hz) { return 69 + 12 * Math.log2(hz / 440); }
function noteLabel(midi) { const n = Math.round(midi); return names[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1); }
function noteKorean(midi) { const n = Math.round(midi); return korean[((n % 12) + 12) % 12]; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function median(arr) { const a = [...arr].sort((x,y) => x-y); const n=a.length; return n%2 ? a[(n-1)/2] : (a[n/2-1]+a[n/2])/2; }
function seconds(ms) { const s=Math.max(0,Math.floor(ms/1000)); return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }

// YIN: 단일 음성의 기초 주파수(65~1100 Hz)를 추정. 무음/불안정한 신호는 제외합니다.
function detectPitchYIN(samples, sampleRate) {
  let power=0;
  for (let i=0;i<samples.length;i++) power+=samples[i]*samples[i];
  const rms=Math.sqrt(power/samples.length);
  if (rms < 0.014) return null;
  const minTau=Math.max(2,Math.floor(sampleRate/1100));
  const maxTau=Math.min(Math.floor(sampleRate/65),Math.floor(samples.length/2)-2);
  if(maxTau <= minTau) return null;
  const windowSize=Math.min(2048,samples.length-maxTau-1);
  const diffs=new Float32Array(maxTau+1);
  for(let tau=1;tau<=maxTau;tau++) {
    let sum=0;
    for(let i=0;i<windowSize;i++) {
      const v=samples[i]-samples[i+tau];sum+=v*v;
    }
    diffs[tau]=sum;
  }
  let runningSum=0, bestTau=-1, minNorm=1;
  for(let tau=1;tau<=maxTau;tau++) {
    runningSum+=diffs[tau];
    diffs[tau]=runningSum===0?1:diffs[tau]*tau/runningSum;
    if(tau>=minTau && diffs[tau]<minNorm) { minNorm=diffs[tau];bestTau=tau; }
  }
  let tau=-1;
  const threshold=0.16;
  for(let t=minTau;t<maxTau;t++) {
    if(diffs[t]<threshold) {
      while(t+1<=maxTau && diffs[t+1]<diffs[t]) t++;
      tau=t;break;
    }
  }
  if(tau<0) tau=bestTau;
  if(tau<=1 || tau>=maxTau || diffs[tau]>0.23) return null;
  const left=diffs[tau-1],center=diffs[tau],right=diffs[tau+1];
  const denom=left-2*center+right;
  const shift=Math.abs(denom)>1e-9?clamp(0.5*(left-right)/denom,-1,1):0;
  const hz=sampleRate/(tau+shift);
  if(hz<65 || hz>1100 || !Number.isFinite(hz)) return null;
  return {hz, confidence:1-diffs[tau], rms};
}

function getSteps() {
  const root=Number($('rootSelect').value);
  const type=$('patternSelect').value;
  let offsets, vocals;
  if(type==='vowel') { offsets=[0,2,4,5,7,5,4,2,0];vocals=['아','에','이','오','우','오','이','에','아']; }
  else if(type==='leap') { offsets=[0,4,7,4,0,7,4,0];vocals=['도','미','솔','미','도','솔','미','도']; }
  else {offsets=[0,2,4,5,7,5,4,2,0];vocals=['도','레','미','파','솔','파','미','레','도'];}
  return offsets.map((offset,i)=>({midi:root+offset,vowel:vocals[i]}));
}
function getExerciseSteps() {const single=getSteps(), count=Number($('repeatSelect').value)||1;return Array.from({length:count},()=>single).flat();}
function saveData() {
  try {localStorage.setItem(STORAGE_KEY,JSON.stringify({history:state.history.slice(0,12),savedRange:state.savedRange}));} catch(_) { /* 저장소 차단 시 현재 세션만 이용 */ }
}
function loadData() {
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(saved && Array.isArray(saved.history)) state.history=saved.history.slice(0,12).filter(v=>v && typeof v==='object');
    if(saved?.savedRange && Number.isFinite(saved.savedRange.low) && Number.isFinite(saved.savedRange.high)) state.savedRange=saved.savedRange;
  } catch(_) {}
  renderSaved(); renderHistory();
}
function renderSaved(){
  const target=$('savedResult'); const stored=state.savedRange;
  target.querySelector('strong').textContent=stored?`저장된 음역대 · ${noteLabel(stored.low)} ~ ${noteLabel(stored.high)}`:'저장된 음역대가 없습니다';
  target.querySelector(':scope > div > span').textContent=stored?`${stored.date || '최근'} 측정 · ${stored.high-stored.low}반음 폭`:'음역대 측정 후 이 기기에 저장할 수 있어요.';
}
function renderHistory(){
  const list=$('historyList');list.replaceChildren();
  if(!state.history.length){const p=document.createElement('p');p.className='empty-history';p.textContent='아직 연습 기록이 없습니다.';list.append(p);return;}
  for(const item of state.history){
    const row=document.createElement('div');row.className='history-entry';
    const left=document.createElement('div');const title=document.createElement('strong');title.textContent=String(item.title||'음정 연습');const date=document.createElement('small');date.textContent=String(item.date||'');left.append(title,date);
    const val=document.createElement('span');val.className='result';val.textContent=String(item.result||'');row.append(left,val);list.append(row);
  }
}
function recordHistory(title,result){
  state.history.unshift({title,result,date:new Date().toLocaleString('ko-KR',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})});
  state.history=state.history.slice(0,12);saveData();renderHistory();
}
function setNotice(text){$('errorMessage').textContent=text;$('errorMessage').hidden=!text;}
function setLive(text,on){$('liveState').innerHTML=`<span class="status-led"></span> ${text}`;$('liveState').classList.toggle('active',on);}
function setMode(mode){
  if(state.running) stopMicrophone();
  state.mode=mode;resetSession();
  document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');});
  $('modeTitle').textContent=modeMeta[mode][0];$('modeDescription').textContent=modeMeta[mode][1];
  $('freeControls').hidden=mode!=='free';$('practiceControls').hidden=mode!=='practice';$('rangeControls').hidden=mode!=='range';
  $('progressSection').hidden=mode!=='practice';$('targetLegend').hidden=mode!=='practice';
  $('graphTitle').textContent=mode==='practice'?'목표 음정 · 내 목소리':mode==='range'?'나의 음역대 추적':'실시간 음정 그래프';
  $('graphSubtitle').textContent=mode==='practice'?'밝은 선을 목표 음정에 맞춰 따라 부르세요.':mode==='range'?'안정적으로 지속한 음만 결과에 반영됩니다.':'목소리의 높낮이가 시간에 따라 표시됩니다.';
  $('chartHint').textContent=mode==='practice'?'보라색: 내 목소리 / 민트색: 목표 음정':'음정 감지 범위: 약 65–1,100 Hz';
  $('scoreLabel').textContent=mode==='practice'?'연습 정확도':'정확한 음정';
  $('scoreHint').textContent=mode==='practice'?'목표에서 ±35센트 이내':'연습 모드에서 측정';
  $('scoreValue').textContent='--';updateStats();drawChart(0);
}
function resetSession(){
  state.points=[];state.stableWindow=[];state.recentPitch=[];state.current=null;state.lowMidi=null;state.highMidi=null;state.lastElapsed=0;state.lastVoiced=0;state.exercise=null;state.currentStep=-1;
  $('noteName').textContent='--';$('noteKorean').textContent='마이크 대기';$('freqValue').textContent='-- Hz';$('centValue').innerHTML='-- <small>cent</small>';$('tuningPin').style.left='50%';
  $('chartClock').textContent='00:00';$('progressFill').style.width='0%';$('stepLabel').textContent='음정 따라 부르기';$('stepProgress').textContent='0 / '+getExerciseSteps().length;
  $('scoreValue').textContent='--';$('saveRangeButton').disabled=true;$('practiceButton').textContent='연습 시작';setPracticeOptionsLocked(false);
  $('chartOverlay').hidden=state.running;
  setNotice('');updateStats();
}
function updateStats(){
  $('lowNote').textContent=state.lowMidi===null?'--':noteLabel(state.lowMidi);
  $('lowHz').textContent=state.lowMidi===null?'-- Hz':midiToHz(state.lowMidi).toFixed(1)+' Hz';
  $('highNote').textContent=state.highMidi===null?'--':noteLabel(state.highMidi);
  $('highHz').textContent=state.highMidi===null?'-- Hz':midiToHz(state.highMidi).toFixed(1)+' Hz';
  $('rangeSpan').textContent=state.lowMidi===null||state.highMidi===null?'--':String(state.highMidi-state.lowMidi);
  $('saveRangeButton').disabled=state.mode!=='range'||!state.running||state.lowMidi===null||state.highMidi===null;
}
async function startMicrophone(){
  setNotice('');
  if(!navigator.mediaDevices?.getUserMedia){setNotice('마이크를 사용할 수 없습니다. HTTPS 사이트 또는 localhost로 접속해 주세요.');return;}
  $('startButton').disabled=true;
  let stream=null,audio=null;
  try {
    try {stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});}
    catch(e) {if(e.name==='OverconstrainedError') stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});else throw e;}
    audio=new(window.AudioContext||window.webkitAudioContext)();
    await audio.resume();
    const source=audio.createMediaStreamSource(stream);const analyser=audio.createAnalyser();
    analyser.fftSize=4096;analyser.smoothingTimeConstant=0;source.connect(analyser); // 절대 스피커에 연결하지 않음
    state.stream=stream;state.audioContext=audio;state.audioSource=source;state.analyser=analyser;state.audioBuffer=new Float32Array(analyser.fftSize);
    state.running=true;resetSession();state.sessionStart=performance.now();state.lastAnalysis=0;
    $('startText').textContent='마이크 끄기';$('startIcon').textContent='◼';$('practiceButton').disabled=false;
    $('chartOverlay').hidden=true;setLive('마이크 연결됨',true);state.raf=requestAnimationFrame(loop);
    // 사용자가 브라우저 UI에서 마이크 권한을 끊으면 즉시 정리
    stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(state.running)stopMicrophone();}));
  } catch(e) {
    stream?.getTracks().forEach(t=>t.stop());if(audio)await audio.close().catch(()=>{});
    let message='마이크를 시작하지 못했습니다. 브라우저의 마이크 설정을 확인해 주세요.';
    if(e.name==='NotAllowedError'||e.name==='PermissionDeniedError') message='마이크 접근이 차단되었습니다. 브라우저 사이트 설정에서 마이크 권한을 허용해 주세요.';
    if(e.name==='NotFoundError')message='연결된 마이크를 찾을 수 없습니다.';
    if(e.name==='NotReadableError')message='마이크를 다른 앱에서 사용 중일 수 있습니다. 다른 앱을 종료한 뒤 다시 시도해 주세요.';
    setNotice(message);setLive('연결 실패',false);
  } finally {$('startButton').disabled=false;}
}
function stopMicrophone(){
  if(!state.running) return;
  state.lastElapsed=performance.now()-state.sessionStart;
  state.running=false;cancelAnimationFrame(state.raf);state.stream?.getTracks().forEach(t=>t.stop());
  state.audioSource?.disconnect();state.analyser?.disconnect();state.audioContext?.close().catch(()=>{});
  state.stream=null;state.audioContext=null;state.audioSource=null;state.analyser=null;
  if(state.exercise && !state.exercise.done) {state.exercise=null;setPracticeOptionsLocked(false);setNotice('연습이 중단되었습니다. 다시 연습 시작을 누르면 처음부터 시작합니다.');}
  $('startText').textContent='마이크 켜기';$('startIcon').textContent='◉';$('practiceButton').disabled=true;$('practiceButton').textContent='연습 시작';
  $('saveRangeButton').disabled=state.mode!=='range'||state.lowMidi===null||state.highMidi===null;
  $('chartOverlay').hidden=false;setLive('대기 중',false);drawChart(state.lastElapsed);
}
function trackStable(midi, elapsed){
  state.stableWindow.push({midi,t:elapsed});
  state.stableWindow=state.stableWindow.filter(p=>elapsed-p.t<=600);
  if(state.stableWindow.length<5) return;
  const points=state.stableWindow;
  if(points.at(-1).t-points[0].t<500) return;
  const arr=points.map(x=>x.midi);
  if(Math.max(...arr)-Math.min(...arr)>0.45) return;
  const note=Math.round(median(arr));
  if(state.lowMidi===null||note<state.lowMidi) state.lowMidi=note;
  if(state.highMidi===null||note>state.highMidi) state.highMidi=note;
  updateStats();
}
function analyse(elapsed){
  state.analyser.getFloatTimeDomainData(state.audioBuffer);
  const detected=detectPitchYIN(state.audioBuffer,state.audioContext.sampleRate);
  if(!detected){
    state.current=null;state.recentPitch=[];state.stableWindow=[];
    state.points.push({t:elapsed,midi:null});setLive('음성 신호 대기',true);
  } else {
    const rawMidi=hzToMidi(detected.hz);
    if(state.recentPitch.length && Math.abs(rawMidi-median(state.recentPitch))>3)state.recentPitch=[];
    state.recentPitch.push(rawMidi);if(state.recentPitch.length>3)state.recentPitch.shift();
    const midi=median(state.recentPitch);const hz=midiToHz(midi);
    state.current={midi,hz};state.lastVoiced=elapsed;state.points.push({t:elapsed,midi});
    trackStable(midi,elapsed);setLive('실시간 측정 중',true);
    const nearest=Math.round(midi),cents=Math.round((midi-nearest)*100);
    $('noteName').textContent=noteLabel(nearest);$('noteKorean').textContent=noteKorean(nearest);$('freqValue').textContent=hz.toFixed(1)+' Hz';
    $('centValue').innerHTML=(cents>0?'+':'')+cents+' <small>cent</small>';
    $('tuningPin').style.left=clamp(50+cents,0,100)+'%';
  }
  if(state.points.length>1400)state.points.splice(0,state.points.length-1400);
  if(!detected && elapsed-state.lastVoiced>180){$('noteName').textContent='--';$('noteKorean').textContent='음성 대기';$('freqValue').textContent='-- Hz';$('centValue').innerHTML='-- <small>cent</small>';$('tuningPin').style.left='50%';}
  scorePractice(elapsed);
}
function playGuide(midi){
  if(!$('guideSound').checked||!state.audioContext)return;
  const ac=state.audioContext,at=ac.currentTime;
  const osc=ac.createOscillator(),gain=ac.createGain();osc.type='sine';osc.frequency.setValueAtTime(midiToHz(midi),at);
  gain.gain.setValueAtTime(0.0001,at);gain.gain.exponentialRampToValueAtTime(0.1,at+0.025);gain.gain.exponentialRampToValueAtTime(0.0001,at+0.27);
  osc.connect(gain);gain.connect(ac.destination);osc.start(at);osc.stop(at+0.3);
  osc.onended=()=>{osc.disconnect();gain.disconnect();};
}
function setPracticeOptionsLocked(locked){['patternSelect','rootSelect','speedSelect','repeatSelect'].forEach(id=>$(id).disabled=locked);}
function startPractice(){
  if(!state.running){setNotice('먼저 마이크를 켜 주세요.');return;}
  if(state.exercise && !state.exercise.done){state.exercise=null;setPracticeOptionsLocked(false);$('practiceButton').textContent='연습 시작';$('stepLabel').textContent='연습을 다시 시작할 수 있습니다';$('progressFill').style.width='0%';return;}
  const now=performance.now()-state.sessionStart;
  state.exercise={start:now+3000,duration:Number($('speedSelect').value),steps:getExerciseSteps(),done:false,total:0,hits:0,errorSum:0,lastStep:-1};
  $('scoreValue').textContent='--';$('progressFill').style.width='0%';setPracticeOptionsLocked(true);$('practiceButton').textContent='연습 중단';setNotice('');
}
function scorePractice(elapsed){
  const exercise=state.exercise;if(!exercise||exercise.done)return;
  const d=elapsed-exercise.start;
  if(d<0){$('stepLabel').textContent=`준비하세요 · ${Math.max(1,Math.ceil(-d/1000))}`;return;}
  const step=Math.floor(d/exercise.duration);
  if(step>=exercise.steps.length){finalizePractice();return;}
  const current=exercise.steps[step];
  if(step!==exercise.lastStep){exercise.lastStep=step;playGuide(current.midi);}
  $('stepLabel').textContent=`${current.vowel} · 목표 ${noteLabel(current.midi)} (${noteKorean(current.midi)})`;
  $('stepProgress').textContent=(step+1)+' / '+exercise.steps.length;
  $('progressFill').style.width=clamp(d/(exercise.duration*exercise.steps.length)*100,0,100)+'%';
  if(state.current){
    const error=Math.abs((state.current.midi-current.midi)*100);
    exercise.total++;exercise.errorSum+=error;if(error<=35)exercise.hits++;
    $('scoreValue').textContent=Math.round(exercise.hits/exercise.total*100)+'%';
  }
}
function finalizePractice(){
  const ex=state.exercise;if(!ex||ex.done)return;ex.done=true;setPracticeOptionsLocked(false);
  const score=ex.total>0?Math.round(ex.hits/ex.total*100):null;
  $('stepLabel').textContent=score===null?'연습 완료 · 음성 감지 없음':`연습 완료 · 정확도 ${score}%`;
  $('stepProgress').textContent=ex.steps.length+' / '+ex.steps.length;$('progressFill').style.width='100%';
  $('scoreValue').textContent=score===null?'--':score+'%';$('practiceButton').textContent='다시 연습하기';
  const name=$('patternSelect').selectedOptions[0].textContent.split(' · ')[0];
  if(score!==null)recordHistory(name,score+'% 정확도');
  setNotice(score===null?'연습 중 감지된 목소리가 없습니다. 마이크 권한과 입력 장치를 확인해 주세요.':'연습을 마쳤습니다! 점수는 목표 음정에서 ±35센트 이내였던 측정 비율입니다.');
}
function loop(time){
  if(!state.running)return;
  const elapsed=time-state.sessionStart;state.lastElapsed=elapsed;
  if(time-state.lastAnalysis>=85){analyse(elapsed);state.lastAnalysis=time;}
  $('chartClock').textContent=seconds(elapsed);drawChart(elapsed);
  state.raf=requestAnimationFrame(loop);
}
function fitCanvas(){
  const rect=chart.getBoundingClientRect();
  if(rect.width<1 || rect.height<1)return {w:1,h:1};
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const dw=Math.round(rect.width*dpr),dh=Math.round(rect.height*dpr);
  if(chart.width!==dw||chart.height!==dh){chart.width=dw;chart.height=dh;}
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return {w:rect.width,h:rect.height};
}
function bounds(){
  if(state.mode==='practice') {const root=Number($('rootSelect').value);return [root-5,root+13];}
  if(state.lowMidi!==null){const center=(state.lowMidi+state.highMidi)/2;const span=Math.max(22,state.highMidi-state.lowMidi+12);return [center-span/2,center+span/2];}
  if(state.current){return [state.current.midi-13,state.current.midi+13];}
  return [47,83];
}
function drawChart(elapsed){
  const {w,h}=fitCanvas();if(w<2||h<2)return;
  const l=w<440?41:51,r=15,t=20,b=29, pw=w-l-r,ph=h-t-b;
  ctx.clearRect(0,0,w,h);
  const [low,high]=bounds();
  const y=(m)=>t+(high-m)/(high-low)*ph;
  const timeWindow=12000, markerFraction=.68;
  const start=elapsed-timeWindow*markerFraction;
  const x=(ms)=>l+((ms-start)/timeWindow)*pw;
  ctx.save();ctx.beginPath();ctx.rect(l,t,pw,ph);ctx.clip();
  // 어두운 반음대 및 그리드
  for(let note=Math.ceil(low);note<=high;note++){
    const yy=y(note);
    if(note%12===0){ctx.fillStyle='#c9a6ff08';ctx.fillRect(l,yy,pw,ph/(high-low));}
    ctx.strokeStyle=note%12===0?'#8c76b344':'#87729c16';ctx.lineWidth=note%12===0?1.1:.65;
    ctx.beginPath();ctx.moveTo(l,yy);ctx.lineTo(w-r,yy);ctx.stroke();
  }
  for(let m= Math.ceil(start/2000)*2000; m<=elapsed+timeWindow*(1-markerFraction);m+=2000){
    const xx=x(m);ctx.strokeStyle='#62587931';ctx.lineWidth=1;ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(xx,t);ctx.lineTo(xx,h-b);ctx.stroke();ctx.setLineDash([]);
  }
  // 연습 가이드: 고정 음 높이와 시간에 따른 목표 발성 음정
  if(state.mode==='practice'){
    const ex=state.exercise;
    if(ex){
      ex.steps.forEach((step,i)=>{
        const s=ex.start+i*ex.duration, e=s+ex.duration;
        const x1=x(s),x2=x(e),yy=y(step.midi);
        if(x2<l||x1>w-r)return;
        const xx1=Math.max(l,x1),xx2=Math.min(w-r,x2);ctx.lineWidth=7;ctx.strokeStyle='#83e5e839';ctx.beginPath();ctx.moveTo(xx1,yy);ctx.lineTo(xx2,yy);ctx.stroke();
        ctx.lineWidth=2;ctx.strokeStyle='#8ceef0';ctx.beginPath();ctx.moveTo(xx1,yy);ctx.lineTo(xx2,yy);ctx.stroke();
        if(x1+12<w-r && x2>l){ctx.font='bold 11px system-ui';ctx.fillStyle='#b4f8fa';ctx.fillText(step.vowel,Math.max(l+4,x1+10),yy-11);}
      });
    } else if(!state.running) {
      const steps=getSteps(),width=pw/steps.length;
      steps.forEach((step,i)=>{const yy=y(step.midi),a=l+i*width+4,z=l+(i+1)*width-4;ctx.strokeStyle='#8ceef09e';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(a,yy);ctx.lineTo(z,yy);ctx.stroke();ctx.fillStyle='#b9f4f6';ctx.font='11px system-ui';ctx.fillText(step.vowel,a,yy-12);});
    }
  }
  // 시간 축을 따라 검출된 음의 연결선 (무음 구간은 끊기도록 처리)
  ctx.beginPath();let connected=false;let lastT=-Infinity;
  for(const p of state.points){
    if(p.t<start-100||p.t>elapsed+200)continue;
    if(p.midi===null||p.midi<low-1||p.midi>high+1||p.t-lastT>245){connected=false;lastT=p.t;continue;}
    const xx=x(p.t),yy=y(p.midi);
    if(!connected){ctx.moveTo(xx,yy);connected=true;}else ctx.lineTo(xx,yy);
    lastT=p.t;
  }
  ctx.strokeStyle='#be91ff';ctx.shadowColor='#b78aff';ctx.shadowBlur=12;ctx.lineWidth=3.2;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();ctx.shadowBlur=0;
  const markerX=x(elapsed);ctx.strokeStyle='#d3c2ff6b';ctx.lineWidth=1;ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(markerX,t);ctx.lineTo(markerX,h-b);ctx.stroke();ctx.setLineDash([]);
  if(state.current&&state.running){const cy=y(state.current.midi);if(cy>=t&&cy<=h-b){ctx.fillStyle='#e8ceff';ctx.shadowColor='#dcc0ff';ctx.shadowBlur=22;ctx.beginPath();ctx.arc(markerX,cy,5.7,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}}
  ctx.restore();
  // Y축 음이름 / X축 시간
  ctx.fillStyle='#a49abb';ctx.textAlign='right';ctx.textBaseline='middle';ctx.font='10px system-ui';
  const stride=(high-low)>28?5:3;
  for(let note=Math.ceil(low/stride)*stride;note<=high;note+=stride){ctx.fillText(noteLabel(note),l-9,y(note));}
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.font='10px system-ui';ctx.fillStyle='#9288aa';
  for(let shift=-8;shift<=4;shift+=4){const xx=x(elapsed+shift*1000);if(xx>=l+14&&xx<=w-r-14)ctx.fillText(shift===0?'현재':`${shift>0?'+':''}${shift}s`,xx,h-9);}
  ctx.fillStyle='#f2d8ff';ctx.font='bold 10px system-ui';ctx.fillText('NOW',clamp(markerX,l+18,w-r-18),11);
}

$('startButton').addEventListener('click',()=>state.running?stopMicrophone():startMicrophone());
$('clearButton').addEventListener('click',()=>{if(state.running){state.sessionStart=performance.now();state.lastAnalysis=0;}resetSession();drawChart(0);});
$('practiceButton').addEventListener('click',startPractice);
$('saveRangeButton').addEventListener('click',()=>{
  if(state.lowMidi===null||state.highMidi===null)return;
  state.savedRange={low:state.lowMidi,high:state.highMidi,date:new Date().toLocaleDateString('ko-KR')};saveData();renderSaved();recordHistory('음역대 측정',`${noteLabel(state.lowMidi)} ~ ${noteLabel(state.highMidi)}`);setNotice('측정 결과를 이 브라우저에 저장했습니다. 실제로 편안하게 지속 가능한 음역과는 차이가 있을 수 있습니다.');
});
$('clearHistoryButton').addEventListener('click',()=>{if(!state.history.length)return;if(confirm('최근 연습 기록을 삭제할까요? 저장된 음역대 결과는 유지됩니다.')){state.history=[];saveData();renderHistory();}});
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
['patternSelect','rootSelect','speedSelect','repeatSelect'].forEach(id=>$(id).addEventListener('change',()=>{if(state.exercise&&!state.exercise.done)return;resetSession();drawChart(0);}));
window.addEventListener('resize',()=>drawChart(state.lastElapsed));
window.addEventListener('pagehide',()=>{if(state.running)stopMicrophone();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.running){ // 모바일 백그라운드에서 측정/재생 중단
  stopMicrophone();setNotice('화면이 백그라운드로 이동해 마이크 측정을 종료했습니다.');
}});
loadData();setMode('free');
if('serviceWorker' in navigator && location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
// 테스트용 순수 함수 공개. 실제 앱 실행 시 오디오나 서버 연결을 요구하지 않습니다.
window.VoiceLineTest={detectPitchYIN,hzToMidi,midiToHz,noteLabel};
