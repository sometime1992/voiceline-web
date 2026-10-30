'use strict';
/* VOICE LINE v2 — piano-first offline vocal trainer.
   Microphone data stays in memory; practice history and recordings stay in device IndexedDB. */
(() => {
const $ = id => document.getElementById(id);
const $all = q => [...document.querySelectorAll(q)];
const NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const KO=['도','도♯','레','레♯','미','파','파♯','솔','솔♯','라','라♯','시'];
const BLACK=new Set([1,3,6,8,10]);
const MODES={
  piano:['피아노 건반','건반을 누르면 음이 재생되고 눌리는 모션이 나타납니다.'],
  pitch:['음정 측정하기','내 목소리의 음을 보라색 건반으로 표시합니다.'],
  record:['녹음하기','녹음 파일은 기기 내부에만 저장됩니다.'],
  vibrato:['비브라토 연습','편안하게 한 음을 유지하면 흔들림 속도와 폭을 추정합니다.'],
  practice:['음정 연습하기','민트색 목표 건반을 따라 노래하세요.']
};
const app={
  mode:'piano',base:48,playing:new Map(),owners:new Map(),ctx:null,
  stream:null,micCtx:null,source:null,analyser:null,buffer:null,frame:0,
  mic:false,busy:false,currentMidi:null,detected:null,lastAnalyze:0,notes:[],stats:[],
  sessionStart:0,sessionLow:null,sessionHigh:null,sessionSamples:0,record:null,
  exercise:null,exercisePattern:'scale',exerciseRoot:60,exerciseSpeed:1800,
  vibratoRoot:60,vibratoStart:0,vibratoSamples:[],vibratoLast:null,recordStart:0,
  openAudio:null,openAudioUrl:null
};
const audioCtor=window.AudioContext||window.webkitAudioContext;
const dbPromise=new Promise((resolve,reject)=>{
  if(!('indexedDB' in window)){reject(new Error('기기 저장소 사용 불가'));return;}
  const req=indexedDB.open('voiceline-local-v2',1);
  req.onupgradeneeded=()=>{
    const db=req.result;
    if(!db.objectStoreNames.contains('events'))db.createObjectStore('events',{keyPath:'id'});
    if(!db.objectStoreNames.contains('recordings'))db.createObjectStore('recordings',{keyPath:'id'});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error('저장소 오류'));
});
dbPromise.catch(()=>notify('기기 저장 공간을 열 수 없습니다. 브라우저 설정을 확인해 주세요.'));
function store(kind,method,item){
 return dbPromise.then(db=>new Promise((resolve,reject)=>{
   const tx=db.transaction(kind,method==='getAll'?'readonly':'readwrite');
   const req=tx.objectStore(kind)[method](...(item===undefined?[]:[item]));
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||new Error('저장 실패'));
 }));
}
async function importLegacyRecords(){
  try{
    if(localStorage.getItem('voiceline-v2-migrated')==='1')return;
    const old=JSON.parse(localStorage.getItem('voiceline-records-v1')||'null');
    if(old&&Array.isArray(old.history)){
      for(let i=0;i<old.history.length;i++){
        const r=old.history[i];if(!r||typeof r!=='object')continue;
        await store('events','put',{
          id:'legacy-'+i,date:String(r.date||'이전 기록'),timestamp:i+1,
          title:String(r.title||'이전 연습'),detail:String(r.result||''),mode:'legacy'
        });
      }
    }
    if(old?.savedRange&&Number.isFinite(old.savedRange.low)&&Number.isFinite(old.savedRange.high)){
      await store('events','put',{
        id:'legacy-range',date:String(old.savedRange.date||'이전 기록'),timestamp:100,
        title:'기존 음역대 기록',detail:name(old.savedRange.low)+' ~ '+name(old.savedRange.high),mode:'legacy'
      });
    }
    localStorage.setItem('voiceline-v2-migrated','1');
  }catch(e){console.warn('Previous records could not be imported; source data is preserved.',e);}
}
function id(){return Date.now()+'-'+Math.random().toString(36).slice(2,9);}
function stamp(){return new Date().toLocaleString('ko-KR');}
function name(m){m=Math.round(m);return NAMES[(m%12+12)%12]+(Math.floor(m/12)-1);}
function koname(m){m=Math.round(m);return (Math.floor(m/12)-3)+'옥 '+KO[(m%12+12)%12];}
function frequency(m){return 440*Math.pow(2,(m-69)/12);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function notify(s){const t=$('toast');t.textContent=s;t.classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>t.classList.remove('show'),3300);}
function setTitle(text){$('modeTitle').textContent=text;}
function setMessage(text){$('modeMessage').textContent=text;}
function micStatus(text){$('micChip').textContent=text;}
function progress(r,text){$('progressBar').style.width=clamp(r,0,1)*100+'%';$('exerciseProgress').textContent=text;}
async function addEvent(title,detail,mode){
 try{await store('events','put',{id:id(),date:stamp(),timestamp:Date.now(),title,detail,mode});}
 catch(e){notify('기록 저장에 실패했습니다. 저장 공간을 확인해 주세요.');}
}
function drawKeys(){
 const kb=$('keyboard');kb.replaceChildren();
 const w=100/14;
 for(let i=0;i<24;i++){
   const m=app.base+i,oct=Math.floor(i/12),step=i%12;
   if(BLACK.has(step))continue;
   const whiteIndex=oct*7+[0,2,4,5,7,9,11].indexOf(step);
   const key=document.createElement('div');
   key.className='white-key';key.dataset.midi=m;key.style.left=(whiteIndex*w)+'%';key.style.width=w+'%';
   const label=document.createElement('span');label.className='key-label';
   label.textContent=step===0||step===5||step===9?name(m):KO[step];
   key.append(label);kb.append(key);
 }
 for(let i=0;i<24;i++){
   const m=app.base+i,step=i%12,oct=Math.floor(i/12);
   if(!BLACK.has(step))continue;
   const prior=[1,3,6,8,10].indexOf(step);
   const whiteBefore=oct*7+[0,1,3,4,5][prior];
   const bw=w*.59,key=document.createElement('div');
   key.className='black-key';key.dataset.midi=m;
   key.style.left=((whiteBefore+1)*w-bw/2)+'%';key.style.width=bw+'%';
   const label=document.createElement('span');label.className='key-label';label.textContent=NAMES[step];
   key.append(label);kb.append(key);
 }
 $('octaveLabel').textContent=name(app.base)+' – '+name(app.base+23);
 syncKeyColors();
}
function syncKeyColors(){
 const detected=app.detected===null?null:Math.round(app.detected);
 const target=app.exercise?.active?app.exercise.target:app.mode==='vibrato'?app.vibratoRoot:null;
 for(const key of $all('#keyboard [data-midi]')){
   const m=Number(key.dataset.midi);
   key.classList.toggle('pressed',app.owners.has(m));
   key.classList.toggle('detected',app.mic&&detected===m);
   key.classList.toggle('target',target===m && !(app.mic&&detected===m));
 }
}
function ensureSynth(){
 if(!audioCtor){notify('이 환경에서는 소리를 낼 수 없습니다.');return null;}
 try{
  if(!app.ctx)app.ctx=new audioCtor();
  if(app.ctx.state==='suspended')app.ctx.resume().catch(()=>{});
  return app.ctx;
 }catch(e){notify('오디오 장치를 시작할 수 없습니다.');return null;}
}
function soundOn(m){
 const ac=ensureSynth();if(!ac||app.playing.has(m))return;
 const t=ac.currentTime;
 const oscillator=ac.createOscillator(),harm=ac.createOscillator(),g=ac.createGain(),g2=ac.createGain(),lowpass=ac.createBiquadFilter();
 oscillator.type='triangle';oscillator.frequency.value=frequency(m);
 harm.type='sine';harm.frequency.value=frequency(m)*2;
 lowpass.type='lowpass';lowpass.frequency.value=clamp(frequency(m)*7,1200,9000);
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.065,t+.016);
 g.gain.exponentialRampToValueAtTime(.039,t+.23);
 g2.gain.value=.19;
 oscillator.connect(lowpass);harm.connect(g2);g2.connect(lowpass);lowpass.connect(g);g.connect(ac.destination);
 oscillator.start(t);harm.start(t);
 app.playing.set(m,{oscillator,harm,g,g2,lowpass});
}
function soundOff(m){
 const p=app.playing.get(m);if(!p||!app.ctx)return;
 app.playing.delete(m);
 const t=app.ctx.currentTime;
 p.g.gain.cancelScheduledValues(t);p.g.gain.setValueAtTime(Math.max(.0001,p.g.gain.value),t);
 p.g.gain.exponentialRampToValueAtTime(.0001,t+.19);
 p.oscillator.stop(t+.21);p.harm.stop(t+.21);
 p.oscillator.onended=()=>{p.oscillator.disconnect();p.harm.disconnect();p.g2.disconnect();p.lowpass.disconnect();p.g.disconnect();};
}
function keyAt(clientX,clientY){
 const elem=document.elementFromPoint(clientX,clientY);
 const key=elem?.closest?.('#keyboard [data-midi]');
 return key?Number(key.dataset.midi):null;
}
function pointerChange(pointerId,m){
 const old=app.owners.get('__pointer'+pointerId);
 if(old===m)return;
 if(old!==undefined){
  const owners=app.owners.get(old);
  if(owners){owners.delete(pointerId);if(owners.size===0){app.owners.delete(old);soundOff(old);}}
 }
 app.owners.delete('__pointer'+pointerId);
 if(m!==null){
  let owners=app.owners.get(m);if(!owners){owners=new Set();app.owners.set(m,owners);}
  if(owners.size===0)soundOn(m);
  owners.add(pointerId);app.owners.set('__pointer'+pointerId,m);
  $('noteHint').textContent='누른 건반';
  if(!app.mic)showNote(m,frequency(m),0);
 }
 syncKeyColors();
}
function allKeysOff(){
 for(const m of [...app.playing.keys()])soundOff(m);
 app.owners.clear();syncKeyColors();
}
function showNote(m,hz,cents){
 $('noteName').textContent=name(m);
 $('noteKorean').textContent=koname(m);
 $('noteHz').textContent=hz.toFixed(1)+' Hz';
 $('noteCents').textContent=(cents>0?'+':'')+Math.round(cents)+' cent';
}
function clearNote(){
 $('noteName').textContent='--';$('noteKorean').textContent='마이크 대기';
 $('noteHz').textContent='-- Hz';$('noteCents').textContent='-- cent';
}
const kb=$('keyboard');
kb.addEventListener('pointerdown',e=>{
 const m=keyAt(e.clientX,e.clientY);if(m===null)return;
 e.preventDefault();try{kb.setPointerCapture(e.pointerId);}catch(_){}
 pointerChange(e.pointerId,m);
});
kb.addEventListener('pointermove',e=>{
 if(!app.owners.has('__pointer'+e.pointerId))return;
 e.preventDefault();pointerChange(e.pointerId,keyAt(e.clientX,e.clientY));
});
for(const ev of ['pointerup','pointercancel','lostpointercapture']){
 kb.addEventListener(ev,e=>pointerChange(e.pointerId,null));
}
window.addEventListener('blur',allKeysOff);
$('octaveDown').addEventListener('click',()=>{app.base=clamp(app.base-12,24,84);allKeysOff();drawKeys();});
$('octaveUp').addEventListener('click',()=>{app.base=clamp(app.base+12,24,84);allKeysOff();drawKeys();});
function pitchYin(s,sr){
 let sum=0;
 for(let i=0;i<s.length;i+=2)sum+=s[i]*s[i];
 const rms=Math.sqrt(sum/(s.length/2));if(rms<.006)return null;
 const lo=Math.max(2,Math.floor(sr/1900)),hi=Math.min(Math.floor(sr/65),s.length/2-2),win=Math.min(768,s.length-hi-1);
 if(win<256||hi<=lo)return null;
 const a=new Float32Array(hi+1);
 for(let tau=1;tau<=hi;tau++){let d=0;for(let j=0;j<win;j++){const v=s[j]-s[j+tau];d+=v*v;}a[tau]=d;}
 let running=0,best=-1,minValue=1,minIndex=-1;
 // Normalize the entire difference function before finding a threshold crossing.
 // Normalizing only the first half biases detection toward an earlier, incorrect pitch.
 for(let tau=1;tau<=hi;tau++){
  running+=a[tau];a[tau]=running>0?a[tau]*tau/running:1;
  if(tau>=lo&&a[tau]<minValue){minValue=a[tau];minIndex=tau;}
 }
 for(let tau=lo;tau<hi;tau++){
  if(a[tau]<.15){
   while(tau+1<hi&&a[tau+1]<a[tau])tau++;
   best=tau;break;
  }
 }
 if(best<0){if(minValue>.21)return null;best=minIndex;}
 if(best<=1||best>=hi)return null;
 const l=a[best-1],c=a[best],r=a[best+1],den=l-2*c+r;
 const shift=Math.abs(den)>1e-9?clamp((l-r)/(2*den),-1,1):0;
 const hz=sr/(best+shift);
 if(!Number.isFinite(hz)||hz<65||hz>1900)return null;
 return {hz,rms};
}
function updateDetection(t){
 if(!app.analyser||!app.micCtx)return;
 app.analyser.getFloatTimeDomainData(app.buffer);
 const p=pitchYin(app.buffer,app.micCtx.sampleRate);
 if(!p){
  app.detected=null;
  if(app.mode==='pitch'||app.mode==='record'){$('noteHint').textContent='소리를 감지하는 중…';clearNote();}
  syncKeyColors();return;
 }
 let midi=69+12*Math.log2(p.hz/440);
 if(app.notes.length&&Math.abs(midi-app.notes[app.notes.length-1])>3)app.notes=[];
 app.notes.push(midi);if(app.notes.length>3)app.notes.shift();
 const sorted=[...app.notes].sort((a,b)=>a-b);midi=sorted[Math.floor(sorted.length/2)];
 app.detected=midi;app.currentMidi=midi;app.sessionSamples++;
 app.sessionLow=Math.min(app.sessionLow??midi,midi);
 app.sessionHigh=Math.max(app.sessionHigh??midi,midi);
 $('noteHint').textContent='실시간 음정';
 showNote(midi,p.hz,(midi-Math.round(midi))*100);
 if(app.mode==='vibrato'&&app.vibratoStart){
  app.vibratoSamples.push({t,midi});
  app.vibratoSamples=app.vibratoSamples.filter(x=>t-x.t<2700);
  vibratoStatus();
 }
 if(app.mode==='practice'&&app.exercise?.active&&t>=app.exercise.start){
  const err=Math.abs(midi-app.exercise.target)*100;
  app.exercise.total++;if(err<=35)app.exercise.hits++;
 }
 syncKeyColors();
}
async function startMic(){
 if(app.mic)return true;
 if(!navigator.mediaDevices?.getUserMedia||!audioCtor){notify('마이크를 사용할 수 없습니다. 앱 권한 또는 HTTPS 환경을 확인하세요.');return false;}
 micStatus('마이크 권한 요청 중');
 let stream=null,ac=null;
 try{
  try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});}
  catch(e){if(['OverconstrainedError','TypeError','NotSupportedError'].includes(e.name))stream=await navigator.mediaDevices.getUserMedia({audio:true});else throw e;}
  ac=new audioCtor();await ac.resume();
  const source=ac.createMediaStreamSource(stream),analyser=ac.createAnalyser();
  analyser.fftSize=4096;analyser.smoothingTimeConstant=0;source.connect(analyser);
  app.stream=stream;app.micCtx=ac;app.source=source;app.analyser=analyser;app.buffer=new Float32Array(4096);
  app.mic=true;app.lastAnalyze=0;app.notes=[];app.sessionStart=performance.now();
  app.sessionLow=null;app.sessionHigh=null;app.sessionSamples=0;
  micStatus('● 마이크 켜짐');
  stream.getTracks().forEach(track=>track.addEventListener('ended',()=>{if(app.mic){notify('마이크 연결이 종료되었습니다.');if(app.record)stopRecording().then(stopMic);else stopMic();}}));
  app.frame=requestAnimationFrame(tick);
  return true;
 }catch(e){
  if(stream)stream.getTracks().forEach(t=>t.stop());
  if(ac)ac.close().catch(()=>{});
  micStatus('마이크 연결 실패');
  const msg=e?.name==='NotAllowedError'?'마이크 권한이 차단되었습니다. 기기 설정에서 허용해 주세요.':'마이크를 열 수 없습니다. 다른 앱의 마이크 사용 여부를 확인해 주세요.';
  notify(msg);return false;
 }
}
function stopMic(){
 if(!app.mic)return;
 app.mic=false;cancelAnimationFrame(app.frame);
 app.stream?.getTracks().forEach(t=>t.stop());
 app.source?.disconnect();app.analyser?.disconnect();
 app.micCtx?.close().catch(()=>{});
 app.stream=null;app.source=null;app.analyser=null;app.micCtx=null;app.buffer=null;
 app.detected=null;app.notes=[];micStatus('마이크 꺼짐');syncKeyColors();
}
function tick(t){
 if(!app.mic)return;
 if(t-app.lastAnalyze>(app.mode==='vibrato'?35:70)){updateDetection(t);app.lastAnalyze=t;}
 if(app.exercise?.active)updateExercise(t);
 if(app.mode==='vibrato'&&app.vibratoStart)progress(clamp((t-app.vibratoStart)/15000,0,1),'비브라토 '+Math.floor((t-app.vibratoStart)/1000)+'초');
 if(app.record)progress(clamp((t-app.recordStart)/(10*60*1000),0,1),'녹음 '+Math.floor((t-app.recordStart)/1000)+'초');
 if(app.record&&t-app.recordStart>=10*60*1000){notify('녹음은 최대 10분으로 저장됩니다.');stopRecording().then(()=>{stopMic();$('stopButton').hidden=true;});}
 app.frame=requestAnimationFrame(tick);
}
function vibratoStatus(){
 const s=app.vibratoSamples;if(s.length<10)return;
 const center=s.reduce((a,b)=>a+b.midi,0)/s.length;
 const cents=s.map(x=>(x.midi-center)*100);
 const depth=Math.sqrt(cents.reduce((a,b)=>a+b*b,0)/cents.length)*1.414;
 let crossings=0,times=[];
 for(let i=1;i<cents.length;i++){
  if(cents[i-1]<0&&cents[i]>=0){crossings++;times.push(s[i].t);}
 }
 const duration=(s[s.length-1].t-s[0].t)/1000;
 if(duration<1.2)return;
 let rate=null;
 if(times.length>=3){const differences=[];for(let i=1;i<times.length;i++)differences.push(times[i]-times[i-1]);const avg=differences.reduce((a,b)=>a+b,0)/differences.length;rate=1000/avg;}
 if(rate!==null&&rate>=2&&rate<=9&&depth>=5&&depth<=150){
  app.vibratoLast={rate,depth};
  setMessage('추정 속도 '+rate.toFixed(1)+' Hz · 폭 ±'+Math.round(depth)+' cent (참고용)');
 }else{
  setMessage('음정을 안정적으로 유지해 주세요. 충분히 규칙적일 때 속도가 표시됩니다.');
 }
}
function modeControls(){
 const c=$('exerciseControls');c.replaceChildren();
 if(app.mode==='practice'){
  c.innerHTML='<label>패턴 <select id="pattern"><option value="scale">도레미 음계</option><option value="triad">도미솔</option><option value="sustain">한 음 유지</option><option value="down">하행 음계</option></select></label><label>시작음 <select id="root"></select></label><label>음 길이 <select id="tempo"><option value="2800">천천히</option><option value="1800">보통</option><option value="1200">빠르게</option></select></label>';
  $('pattern').value=app.exercisePattern;$('tempo').value=String(app.exerciseSpeed);
  fillNotes($('root'),app.exerciseRoot);
  $('pattern').onchange=e=>app.exercisePattern=e.target.value;
  $('root').onchange=e=>app.exerciseRoot=Number(e.target.value);
  $('tempo').onchange=e=>app.exerciseSpeed=Number(e.target.value);
 } else if(app.mode==='vibrato'){
  c.innerHTML='<label>연습 기준음 <select id="vroot"></select></label><span class="control-note">내 목소리의 흔들림을 실시간으로 계산합니다.</span>';
  fillNotes($('vroot'),app.vibratoRoot);
  $('vroot').onchange=e=>{app.vibratoRoot=Number(e.target.value);syncKeyColors();};
 } else if(app.mode==='record'){
  c.innerHTML='<span class="control-note">최대 10분 · 마이크 녹음 · 내장 저장 공간에 파일 보관</span><button type="button" id="recordList">저장된 녹음 보기</button>';
  $('recordList').onclick=showHistory;
 } else if(app.mode==='pitch'){
  c.innerHTML='<span class="control-note">편안하게 한 음을 길게 불러보세요. 보라색 건반이 움직입니다.</span>';
 } else{
  c.innerHTML='<span class="control-note">옥타브 이동은 건반 위의 − / + 버튼을 사용하세요.</span>';
 }
}
function fillNotes(sel,selected){
 for(let m=48;m<=83;m++){if(BLACK.has(m%12))continue;
  const op=document.createElement('option');op.value=String(m);op.textContent=name(m)+' · '+koname(m);sel.append(op);
 }
 sel.value=String(selected);
}
function exerciseSteps(){
 const root=app.exerciseRoot;
 const patterns={scale:[0,2,4,5,7,5,4,2,0],triad:[0,4,7,4,0],sustain:[0,0,0,0],down:[7,5,4,2,0]};
 return patterns[app.exercisePattern].map(offset=>root+offset);
}
function startExercise(t){
 const steps=exerciseSteps();
 app.exercise={start:t+3000,duration:app.exerciseSpeed,steps,active:true,target:steps[0],lastStep:-1,total:0,hits:0};
 setMessage('3초 준비 후 민트색 건반을 따라 부르세요.');
 $('mainButton').textContent='연습 중단';
 progress(0,'3초 준비');
}
function updateExercise(t){
 const e=app.exercise;if(!e?.active)return;
 if(t<e.start){progress(0,'시작까지 '+Math.ceil((e.start-t)/1000)+'초');return;}
 const idx=Math.floor((t-e.start)/e.duration);
 if(idx>=e.steps.length){finishExercise(true);return;}
 if(idx!==e.lastStep){
  e.lastStep=idx;e.target=e.steps[idx];
  setMessage('목표 '+name(e.target)+' · '+koname(e.target));
  // A very short reference note helps the user locate the next piano key.
  playReference(e.target);
  if(e.target<app.base||e.target>=app.base+24){app.base=clamp(Math.floor(e.target/12)*12,24,84);drawKeys();}
 }
 progress((t-e.start)/(e.duration*e.steps.length),(idx+1)+' / '+e.steps.length+'음');
 syncKeyColors();
}
function playReference(m){
 const ac=ensureSynth();if(!ac)return;
 const t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();
 o.type='sine';o.frequency.value=frequency(m);
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.045,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+.24);
 o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+.25);
 o.onended=()=>{o.disconnect();g.disconnect();};
}
function finishExercise(completed){
 const e=app.exercise;if(!e)return;
 app.exercise=null;
 const score=e.total?Math.round(100*e.hits/e.total):null;
 progress(completed?1:0,completed?(score===null?'음성 감지 없음':'정확도 '+score+'%'):'연습 중단');
 setMessage(completed?'연습 완료! 기준 음정 ±35cent 이내의 비율을 표시합니다.':'연습을 중단했습니다.');
 if(completed)addEvent('음정 연습',score===null?'감지된 음정 없음':score+'% 정확도','practice');
 $('mainButton').textContent='연습 시작';
 syncKeyColors();
}
function startRecording(){
 if(!app.stream||!app.micCtx)throw new Error('마이크가 연결되지 않았습니다.');
 app.recordStart=performance.now();
 try{navigator.storage?.persist?.().catch(()=>{});}catch(_){}
 const types=['audio/webm;codecs=opus','audio/webm','audio/mp4'];
 if(window.MediaRecorder){
  let mime='';
  for(const t of types){try{if(MediaRecorder.isTypeSupported(t)){mime=t;break;}}catch(_){}}
  try{
   const mr=mime?new MediaRecorder(app.stream,{mimeType:mime}):new MediaRecorder(app.stream);
   const chunks=[];
   const complete=new Promise(resolve=>{mr.onstop=()=>resolve(new Blob(chunks,{type:mr.mimeType||mime||'audio/webm'}));});
   mr.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
   mr.start(1000);
   app.record={type:'media',mr,complete};
   return;
  }catch(e){console.warn('MediaRecorder unavailable; WAV fallback active',e);}
 }
 // WebView fallback: record microphone PCM into a 22,050 Hz WAV without cloud processing.
 const ac=app.micCtx,processor=ac.createScriptProcessor(4096,1,1),silent=ac.createGain();
 silent.gain.value=0;processor.connect(silent);silent.connect(ac.destination);
 const chunks=[],targetRate=22050;
 processor.onaudioprocess=e=>{
  const input=e.inputBuffer.getChannelData(0);
  const ratio=ac.sampleRate/targetRate,out=new Float32Array(Math.floor(input.length/ratio));
  for(let i=0;i<out.length;i++)out[i]=input[Math.min(input.length-1,Math.floor(i*ratio))];
  chunks.push(out);
 };
 app.source.connect(processor);
 app.record={type:'pcm',processor,silent,chunks,targetRate};
}
function wavBlob(chunks,sampleRate){
 let n=0;for(const x of chunks)n+=x.length;
 const ab=new ArrayBuffer(44+n*2),v=new DataView(ab);
 const str=(off,s)=>{for(let i=0;i<s.length;i++)v.setUint8(off+i,s.charCodeAt(i));};
 str(0,'RIFF');v.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);
 v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*2,true);
 let off=44;for(const a of chunks)for(let i=0;i<a.length;i++){const x=clamp(a[i],-1,1);v.setInt16(off,x<0?x*32768:x*32767,true);off+=2;}
 return new Blob([ab],{type:'audio/wav'});
}
async function stopRecording(){
 const r=app.record;if(!r)return;
 app.record=null;$('mainButton').textContent='녹음 시작';$('mainButton').classList.remove('recording');
 const elapsed=Math.max(0,Math.round((performance.now()-app.recordStart)/1000));
 let blob;
 try{
  if(r.type==='media'){if(r.mr.state!=='inactive')r.mr.stop();blob=await r.complete;}
  else{r.processor.onaudioprocess=null;app.source?.disconnect(r.processor);r.processor.disconnect();r.silent.disconnect();blob=wavBlob(r.chunks,r.targetRate);}
  if(!blob||blob.size<128)throw new Error('녹음 데이터 없음');
  await store('recordings','put',{id:id(),date:stamp(),timestamp:Date.now(),duration:elapsed,blob,mime:blob.type,size:blob.size,title:'목소리 녹음'});
  await addEvent('녹음 완료',elapsed+'초 · '+Math.max(1,Math.round(blob.size/1024))+'KB','record');
  notify('녹음을 기기 내부에 저장했습니다.');
  progress(1,elapsed+'초 녹음 저장됨');
 }catch(e){console.error(e);notify('녹음 저장 실패: 여유 공간 또는 마이크를 확인하세요.');}
}
async function finishVibrato(){
 if(!app.vibratoStart)return;
 const elapsed=Math.floor((performance.now()-app.vibratoStart)/1000);
 app.vibratoStart=0;
 const v=app.vibratoLast;
 if(v){await addEvent('비브라토 연습',v.rate.toFixed(1)+'Hz · ±'+Math.round(v.depth)+'cent · '+elapsed+'초','vibrato');}
 else await addEvent('비브라토 연습',elapsed+'초 · 속도 추정 불가','vibrato');
 $('mainButton').textContent='비브라토 시작';
 notify('비브라토 연습을 종료했습니다.');
}
async function stopActivity(){
 if(app.record)await stopRecording();
 if(app.exercise)finishExercise(false);
 if(app.vibratoStart)await finishVibrato();
 if(app.mic){
  const duration=Math.round((performance.now()-app.sessionStart)/1000);
  if(app.sessionSamples>8&&(app.mode==='pitch'||app.mode==='piano'))
   await addEvent('음정 측정',name(app.sessionLow)+' ~ '+name(app.sessionHigh)+' · '+duration+'초','pitch');
  stopMic();
 }
}
async function switchMode(mode){
 if(!MODES[mode])return;
 if(app.busy)return;app.busy=true;
 try{
  await stopActivity();app.mode=mode;app.detected=null;app.currentMidi=null;
  $('modeChip').textContent=MODES[mode][0];setTitle(MODES[mode][0]);setMessage(MODES[mode][1]);
  $('noteHint').textContent='건반을 누르거나 마이크를 시작하세요';
  clearNote();progress(0,'준비');modeControls();
  $('mainButton').textContent=mode==='record'?'녹음 시작':mode==='practice'?'연습 시작':mode==='vibrato'?'비브라토 시작':'마이크 켜기';
  $('mainButton').classList.remove('recording');$('stopButton').hidden=true;
  syncKeyColors();
 }finally{app.busy=false;}
}
$('mainButton').addEventListener('click',async()=>{
 if(app.busy)return;app.busy=true;const b=$('mainButton');b.disabled=true;
 try{
  if(app.mode==='record'){
   if(app.record){await stopRecording();stopMic();$('stopButton').hidden=true;}
   else if(await startMic()){
    try{startRecording();b.textContent='녹음 중지 · 저장';b.classList.add('recording');$('stopButton').hidden=false;progress(0,'녹음 중');}
    catch(e){notify('녹음을 시작할 수 없습니다.');stopMic();}
   }
  }else if(app.mode==='practice'){
   if(app.exercise){finishExercise(false);stopMic();}
   else if(await startMic()){startExercise(performance.now());$('stopButton').hidden=false;}
  }else if(app.mode==='vibrato'){
   if(app.vibratoStart){await finishVibrato();stopMic();}
   else if(await startMic()){app.vibratoSamples=[];app.vibratoLast=null;app.vibratoStart=performance.now();b.textContent='비브라토 중지';$('stopButton').hidden=false;}
  }else{
   if(app.mic){await stopActivity();b.textContent='마이크 켜기';$('stopButton').hidden=true;}
   else if(await startMic()){if(app.mode==='piano'){app.mode='pitch';$('modeChip').textContent='음정 측정하기';setTitle('음정 측정하기');}b.textContent='마이크 끄기';$('stopButton').hidden=false;}
  }
 }finally{b.disabled=false;app.busy=false;}
});
$('stopButton').addEventListener('click',async()=>{
 if(app.busy)return;app.busy=true;
 try{await stopActivity();$('stopButton').hidden=true;$('mainButton').classList.remove('recording');$('mainButton').textContent=app.mode==='record'?'녹음 시작':app.mode==='practice'?'연습 시작':app.mode==='vibrato'?'비브라토 시작':'마이크 켜기';}
 finally{app.busy=false;}
});
function modalOpen(name){
 $(name).hidden=false;const focus=$(name).querySelector('.close-btn');focus?.focus();
 if(name==='menuDialog')$('menuOpen').setAttribute('aria-expanded','true');
}
function modalClose(name){
 $(name).hidden=true;
 if(name==='menuDialog'){$('menuOpen').setAttribute('aria-expanded','false');$('menuOpen').focus();}
 else $('menuOpen').focus();
}
$('menuOpen').addEventListener('click',()=>modalOpen('menuDialog'));
$('menuClose').addEventListener('click',()=>modalClose('menuDialog'));
$('infoClose').addEventListener('click',()=>modalClose('infoDialog'));
$all('.modal-backdrop').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)modalClose(el.id);}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){for(const id of ['infoDialog','menuDialog'])if(!$(id).hidden){modalClose(id);break;}}});
$all('[data-screen]').forEach(b=>b.addEventListener('click',async()=>{
 const mode=b.dataset.screen;modalClose('menuDialog');
 if(mode==='history')await showHistory();
 else if(mode==='help')showHelp();
 else await switchMode(mode);
}));
function plain(node,tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;node.append(el);return el;}
function showHelp(){
 $('infoTitle').textContent='사용법';const b=$('infoBody');b.replaceChildren();
 const sections=[
 ['피아노 건반','화면의 흰 건반과 검은 건반을 터치하면 해당 음이 재생되고 건반이 내려갑니다. 여러 건반을 동시에 누를 수 있습니다. − / +로 건반의 옥타브 범위를 옮길 수 있습니다.'],
 ['음정 측정하기','메뉴에서 음정 측정하기를 선택하고 마이크 켜기를 누릅니다. 마이크 권한을 허용하고 한 음을 길게 불러보세요. 내 음정에 해당하는 건반이 보라색으로 표시됩니다.'],
 ['녹음하기','녹음 시작을 누른 후 목소리를 녹음합니다. 녹음 중지 · 저장을 누르면 기기 내부 저장 공간에 저장되며 나의 기록에서 재생하거나 삭제할 수 있습니다. 녹음 중에는 최대 10분으로 제한됩니다.'],
 ['비브라토 연습','기준 음정을 선택하고 비브라토 시작을 누릅니다. 한 음을 편안히 유지하면 음정 흔들림의 속도(Hz)와 폭(cent)을 참고용으로 추정합니다.'],
 ['음정 연습하기','패턴, 시작음, 속도를 고르고 연습 시작을 누릅니다. 3초 후 민트색 목표 건반을 따라 부르면, ±35cent 이내로 감지된 비율로 정확도를 표시합니다.'],
 ['나의 기록과 개인정보','연습 기록은 앱 내부 IndexedDB에, 녹음 파일은 기기 내장 저장 공간의 앱 전용 데이터에 저장됩니다. 계정과 서버가 필요 없으며 마이크 소리는 서버로 업로드하지 않습니다. 앱 삭제나 앱 데이터 초기화 시 함께 삭제될 수 있습니다.'],
 ['주의','녹음 내용에 피아노 소리가 섞일 수 있으므로 이어폰 사용을 권장합니다. 목이 아프거나 어지러우면 즉시 중단하세요. 분석 결과는 의료적 진단이 아닙니다.']
 ];
 for(const [title,body] of sections){plain(b,'h3','',title);plain(b,'p','',body);}
 modalOpen('infoDialog');
}
async function showHistory(){
 $('infoTitle').textContent='나의 기록';const body=$('infoBody');body.replaceChildren();
 plain(body,'p','', '모든 기록과 녹음은 이 기기의 앱 저장 공간에만 저장됩니다. 앱 삭제 또는 데이터 초기화 시 사라질 수 있습니다.');
 modalOpen('infoDialog');
 try{
  const [events,recordings]=await Promise.all([store('events','getAll'),store('recordings','getAll')]);
  plain(body,'h3','', '녹음 파일 ('+recordings.length+')');
  if(!recordings.length)plain(body,'p','','아직 저장된 녹음이 없습니다.');
  for(const r of recordings.sort((a,b)=>b.timestamp-a.timestamp)){
   const row=plain(body,'div','history-row');
   const left=plain(row,'div');plain(left,'strong','',r.title);
   plain(left,'small','',r.date+' · '+r.duration+'초 · '+Math.round(r.size/1024)+'KB');
   const actions=plain(row,'div');
   const play=plain(actions,'button','', '재생');
   play.onclick=()=>playLocal(r,play);
   const del=plain(actions,'button','danger','삭제');
   del.onclick=async()=>{if(!confirm('이 녹음 파일을 기기에서 삭제할까요?'))return;await store('recordings','delete',r.id);if(app.openAudio)app.openAudio.pause();row.remove();notify('녹음을 삭제했습니다.');};
  }
  plain(body,'h3','', '연습 기록 ('+events.length+')');
  if(!events.length)plain(body,'p','','아직 연습 기록이 없습니다.');
  for(const e of events.sort((a,b)=>b.timestamp-a.timestamp)){
   const row=plain(body,'div','history-row');const left=plain(row,'div');
   plain(left,'strong','',e.title);plain(left,'small','',e.date+' · '+e.detail);
   const del=plain(row,'button','danger','삭제');
   del.onclick=async()=>{if(!confirm('이 연습 기록을 삭제할까요?'))return;await store('events','delete',e.id);row.remove();notify('기록을 삭제했습니다.');};
  }
 }catch(e){plain(body,'p','', '기록을 읽을 수 없습니다. 저장 공간 권한 또는 용량을 확인해 주세요.');}
}
function playLocal(r,button){
 try{
  if(app.openAudio){app.openAudio.pause();app.openAudio.src='';if(app.openAudioUrl)URL.revokeObjectURL(app.openAudioUrl);}
  const url=URL.createObjectURL(r.blob),audio=new Audio(url);
  app.openAudio=audio;app.openAudioUrl=url;
  button.textContent='재생 중';
  audio.onended=()=>{button.textContent='재생';URL.revokeObjectURL(url);if(app.openAudio===audio){app.openAudio=null;app.openAudioUrl=null;}};
  audio.onerror=()=>{notify('이 기기에서 해당 녹음 형식을 재생할 수 없습니다.');button.textContent='재생';};
  audio.play().catch(()=>{notify('재생을 시작할 수 없습니다.');button.textContent='재생';});
 }catch(e){notify('녹음을 재생할 수 없습니다.');}
}
window.addEventListener('pagehide',()=>{if(app.record)stopRecording();else if(app.mic)stopMic();allKeysOff();});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){allKeysOff();if(app.record)stopRecording().then(stopMic);else if(app.mic){stopMic();if(app.exercise)finishExercise(false);if(app.vibratoStart)finishVibrato();}}
});
drawKeys();modeControls();progress(0,'건반 연주 준비');
importLegacyRecords();
if('serviceWorker' in navigator){
  if(location.hostname==='appassets.androidplatform.net'){
    navigator.serviceWorker.getRegistrations().then(regs=>Promise.all(regs.map(reg=>reg.unregister()))).catch(()=>{});
  }else if(location.protocol==='https:' || location.hostname==='localhost'){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
}
if(screen.orientation?.lock){screen.orientation.lock('landscape').catch(()=>{});}
window.VoiceLinePiano={name,frequency,pitchYin};
})();