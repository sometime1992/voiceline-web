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
  mic:false,nativeMic:false,nativeStartResolve:null,nativeStartTimeout:0,nativeSampleRate:44100,
  micError:'',busy:false,currentMidi:null,detected:null,lastAnalyze:0,notes:[],stats:[],
  sessionStart:0,sessionLow:null,sessionHigh:null,sessionSamples:0,record:null,
  exercise:null,exercisePattern:'scale',exerciseRoot:60,exerciseSpeed:1800,
  vibratoRoot:60,vibratoStart:0,vibratoSamples:[],vibratoLast:null,vibratoOverlayLast:0,recordStart:0,
  recordPitchSamples:[],recordPitchLow:null,recordPitchHigh:null,recordPitchLast:0,recordPitchFrozenAt:null,
  openAudio:null,openAudioUrl:null,audioDiagnosticTone:false
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
function micStatus(text){$('micChip').textContent=text;updateMicToggle();}
function updateMicToggle(){
 const button=$('micToggle'),action=$('micToggleAction');
 if(!button||!action)return;
 const active=Boolean(app.mic);
 action.textContent=active?'끄기':'켜기';
 button.disabled=Boolean(app.busy||app.nativeStartResolve);
 button.classList.toggle('active',active);
 button.setAttribute('aria-pressed',String(active));
 button.setAttribute('aria-label',active?'마이크 끄기':'마이크 켜기');
 button.title=active?'마이크 끄기: 녹음·비브라토·음정 연습 중이라면 먼저 정상 종료합니다.':'마이크 켜기: 피아노 소리가 함께 인식될 수 있습니다.';
}
function progress(r,text){$('progressBar').style.width=clamp(r,0,1)*100+'%';$('exerciseProgress').textContent=text;}
async function addEvent(title,detail,mode){
 try{await store('events','put',{id:id(),date:stamp(),timestamp:Date.now(),title,detail,mode});}
 catch(e){notify('기록 저장에 실패했습니다. 저장 공간을 확인해 주세요.');}
}
function targetKeyboardBase(midi){
 // Two visible octaves, with the selected note near their centre.
 // Supported piano starts are C1 (MIDI 24) through C6 (MIDI 84).
 const target=clamp(Math.round(Number(midi)||60),24,107);
 return clamp(Math.floor((target-11)/12)*12,24,84);
}
function focusVibratoReference(){
 app.vibratoSamples=[];app.vibratoLast=null;
 const next=targetKeyboardBase(app.vibratoRoot);
 if(app.base!==next){
  allKeysOff();app.base=next;drawKeys();
 }else syncKeyColors();
 setMessage('기준음 '+name(app.vibratoRoot)+' · '+koname(app.vibratoRoot)+' (민트색 건반)');
 renderVibratoOverlay(performance.now(),true);
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
 if(window.VoiceLineToneEngine)updateToneEngineStatus();else preloadAcousticPiano(app.base);
}
function syncKeyColors(){
 const detected=app.detected===null?null:Math.round(app.detected);
 const target=app.exercise?.active?app.exercise.target:app.mode==='vibrato'?app.vibratoRoot:null;
 for(const key of $all('#keyboard [data-midi]')){
   const m=Number(key.dataset.midi);
   key.classList.toggle('pressed',app.owners.has(m));
   key.classList.toggle('detected',app.mic&&detected===m);
   key.classList.toggle('target',target===m && !(app.mic&&detected===m));
   key.classList.toggle('vibrato-reference',app.mode==='vibrato'&&app.vibratoRoot===m);
 }
}
// Centralized dynamics and sample-smooth envelopes prevent key-clicks and clipping.
// Do not connect individual notes directly to AudioContext.destination.
const SYNTH_ENV=Object.freeze({attack:0.024,decay:0.24,peak:0.050,sustain:0.026,release:0.19});
function noteEnvelopeGain(start,t){
 const e=Math.max(0,t-start);
 if(e<SYNTH_ENV.attack)return SYNTH_ENV.peak*e/SYNTH_ENV.attack;
 if(e<SYNTH_ENV.decay){
   const progress=(e-SYNTH_ENV.attack)/(SYNTH_ENV.decay-SYNTH_ENV.attack);
   return SYNTH_ENV.peak*Math.pow(SYNTH_ENV.sustain/SYNTH_ENV.peak,progress);
 }
 return SYNTH_ENV.sustain;
}

// Acoustic piano recordings bundled from Meta Open Sound (CC0 1.0).
// The Android APK includes all OGG files. Never stream samples from a server.
const ACOUSTIC_SAMPLE_MIDI=Array.from({length:28},(_,i)=>24+3*i);
const acoustic={buffers:new Map(),pending:new Map(),failed:new Set(),preloadEpoch:0};
// Offline recordings contain a genuine hammer attack. Avoid amplifying that transient.
// 28 samples checked against the prior beta4 APK: none showed digital full-scale clipping.
// Keep conservative headroom for chords and fade each note smoothly.
const SOFT_PIANO=Object.freeze({peakGain:0.25,attack:0.055,release:0.32,master:0.64,lowpass:4200,highpass:45,maxVoices:8});
// Most Android finger touch events have no reliable force measurement.
// Use press duration for the fade-out; optionally use real stylus force for attack dynamics.
function smoothstep(x){
 x=clamp(x,0,1);
 return x*x*(3-2*x);
}
function attackDuration(pressure=0.7){
 return clamp(0.068-(pressure*0.028),0.034,0.065);
}
function expressionFromInput(pressure=0.7){
 // Regular finger taps receive a consistent velocity. Only supported pens vary.
 return clamp(0.68+0.32*pressure,0.68,1);
}
function releaseDuration(heldSeconds){
 // Very short taps are the most click-prone. Give them the LONGEST soft tail.
 // A note held for longer already has a stable body and needs less release time.
 // Continuous ease-down prevents abrupt differences near the 150 ms boundary.
 const hold=Math.max(0,heldSeconds);
 const transition=smoothstep((hold-0.05)/0.65);
 return 0.39-0.15*transition; // 390ms quick tap, 240ms sustained note.
}
function attackValue(voice,at){
 return voice.voiceGain*smoothstep((at-voice.started)/voice.attackDuration);
}
function pressureForEvent(e){
 // On ordinary touchscreens PointerEvent.pressure is often a constant .5.
 if(e?.pointerType==='pen'&&Number.isFinite(e.pressure)&&e.pressure>0){
  return clamp(e.pressure,0.1,1);
 }
 return 0.7;
}
// Peaks measured from the 28 pinned, bundled Vel01 Ogg/Opus recordings.
// Stabilize inter-note loudness without clipping or changing the gentle recorded timbre.
const ACOUSTIC_PEAKS=new Map([[24,.1180],[27,.0847],[30,.2122],[33,.1387],[36,.1158],[39,.1492],[42,.1129],[45,.1609],[48,.1194],[51,.1520],[54,.2121],[57,.0152],[60,.0444],[63,.1500],[66,.0605],[69,.0283],[72,.0597],[75,.1282],[78,.0873],[81,.0256],[84,.0155],[87,.0308],[90,.1395],[93,.0811],[96,.1090],[99,.0444],[102,.0383],[105,.0705]]);
function calibratedPianoGain(anchor){
 // Match a quiet reference note to a ~0.18 source peak; no note gets >5x boost.
 // With the shared master and voice cap this remains far below digital clipping.
 return SOFT_PIANO.peakGain*clamp(0.18/(ACOUSTIC_PEAKS.get(anchor)||0.18),0.7,5);
}
const activePianoVoices=new Set();
function nearestAcousticMidi(midi){
 return clamp(24+3*Math.round((clamp(midi,24,107)-24)/3),24,105);
}
function acousticFilename(midi){
 const keys=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
 return 'INSPiano_Vel01_'+keys[midi%12]+(Math.floor(midi/12)-1)+'_01.ogg';
}
// Fade the recorded signal itself at both ends before it reaches the synthesis graph.
// This eliminates an abrupt PCM edge even if the AudioParam automation is interrupted.
function conditionAcousticBuffer(buffer){
 const fadeIn=Math.min(Math.round(buffer.sampleRate*.035),Math.floor(buffer.length/4));
 const fadeOut=Math.min(Math.round(buffer.sampleRate*.04),Math.floor(buffer.length/4));
 for(let ch=0;ch<buffer.numberOfChannels;ch++){
  const pcm=buffer.getChannelData(ch);
  for(let i=0;i<fadeIn;i++){
   const x=i/Math.max(1,fadeIn-1);
   pcm[i]*=x*x*(3-2*x);
  }
  for(let i=0;i<fadeOut;i++){
   const x=i/Math.max(1,fadeOut-1);
   pcm[pcm.length-1-i]*=x*x*(3-2*x);
  }
 }
 return buffer;
}
async function loadAcousticSample(anchor){
 if(acoustic.buffers.has(anchor))return acoustic.buffers.get(anchor);
 if(acoustic.failed.has(anchor))return null;
 if(acoustic.pending.has(anchor))return acoustic.pending.get(anchor);
 const task=(async()=>{
   try{
     const address='./samples/piano/'+acousticFilename(anchor);
     const response=await fetch(address);
     if(!response.ok)throw Error('Bundled piano sample '+anchor+' missing: '+response.status);
     const bytes=await response.arrayBuffer();
     const ac=ensureSynth();
     if(!ac)throw Error('AudioContext not supported');
     const buffer=await ac.decodeAudioData(bytes);
     if(!buffer||buffer.duration<0.1)throw Error('Empty piano recording '+anchor);
     acoustic.buffers.set(anchor,conditionAcousticBuffer(buffer));
     updateAcousticStatus();
     return buffer;
   }catch(err){
     acoustic.failed.add(anchor);
     console.warn('Acoustic piano sample unavailable; using synthesized fallback',anchor,err);
     updateAcousticStatus();
     return null;
   }finally{acoustic.pending.delete(anchor);}
 })();
 acoustic.pending.set(anchor,task);
 return task;
}
function preloadAcousticPiano(base){
 // Only decode and retain the visible keyboard range; adjacent octaves load on shift.
 const anchors=[...new Set(Array.from({length:24},(_,i)=>nearestAcousticMidi(base+i)))];
 const epoch=++acoustic.preloadEpoch;
 Promise.all(anchors.map(loadAcousticSample)).then(()=>{
   if(epoch===acoustic.preloadEpoch)updateAcousticStatus(anchors);
 });
}
function updateToneEngineStatus(){
 const badge=$('pianoSoundChip');
 if(!badge||!window.VoiceLineToneEngine)return;
 const ready=window.VoiceLineToneEngine.ready;
 badge.textContent=ready?'● 그랜드 피아노 준비됨':'그랜드 피아노 음원 준비 중';
 badge.classList.toggle('ready',ready);
}
window.addEventListener('voiceline-piano-status',updateToneEngineStatus);
function updateAcousticStatus(anchors=null){
 const badge=$('pianoSoundChip');
 if(!badge)return;
 const requested=anchors||[...new Set(Array.from({length:24},(_,i)=>nearestAcousticMidi(app.base+i)))];
 const ready=requested.filter(m=>acoustic.buffers.has(m)).length;
 const errors=requested.some(m=>acoustic.failed.has(m));
 badge.textContent=errors?'피아노 음원 일부 미지원':ready===requested.length?'● 실제 피아노 음원':'피아노 음원 '+ready+'/'+requested.length;
 badge.classList.toggle('ready',ready===requested.length);
}
function activePianoCount(){return activePianoVoices.size;}
// An interrupted gain envelope may still be in its attack phase when a touch ends.
// Capture its instantaneous level and fade it to zero without a discontinuity.
function releasePianoVoice(voice,forced=false){
 if(!app.ctx||voice.releasing)return;
 voice.releasing=true;
 const t=app.ctx.currentTime,volume=voice.gain.gain;
 const heldSeconds=Math.max(0,t-voice.started);
 const duration=forced?0.12:releaseDuration(heldSeconds);
 if(typeof volume.cancelAndHoldAtTime==='function'){
  volume.cancelAndHoldAtTime(t);
 }else{
  // Preserve the correct instantaneous level for releases during the attack.
  // An Android WebView may not implement cancelAndHoldAtTime.
  const held=attackValue(voice,t);
  volume.cancelScheduledValues(t);
  volume.setValueAtTime(held,t);
 }
 // Several short ramp segments approximate a smoothstep fade without a hard cut.
 // Finish at zero before the source node is stopped.
 const startGain=voice.voiceGain*smoothstep(heldSeconds/voice.attackDuration);
 // Use an exact held level for implementations without native cancelAndHold.
 // For native holding, the envelope has not passed voiceGain on the sample path.
 volume.linearRampToValueAtTime(startGain*.90,t+duration*.20);
 volume.linearRampToValueAtTime(startGain*.50,t+duration*.50);
 volume.linearRampToValueAtTime(startGain*.10,t+duration*.80);
 volume.linearRampToValueAtTime(0,t+duration);
 try{voice.source.stop(t+duration+0.025);}catch(_){}
}
function sampledNoteOn(m,pressure=0.7){
 const anchor=nearestAcousticMidi(m),buffer=acoustic.buffers.get(anchor);
 if(!buffer)return false;
 const ac=ensureSynth();if(!ac)return false;
 // Limit the number of overlapping attack/release tails, which otherwise saturate
 // a phone speaker during glissando or rapid note repetition.
 while(activePianoCount()>=SOFT_PIANO.maxVoices){
  const oldest=activePianoVoices.values().next().value;
  if(!oldest)break;
  // Evict released tails from the polyphony budget immediately; otherwise a
  // rapid glissando can accumulate arbitrarily many already-releasing voices.
  releasePianoVoice(oldest,true);
  activePianoVoices.delete(oldest);
 }
 const t=ac.currentTime,source=ac.createBufferSource(),gain=ac.createGain();
 const highpass=ac.createBiquadFilter(),lowpass=ac.createBiquadFilter();
 source.buffer=buffer;
 source.playbackRate.setValueAtTime(Math.pow(2,(m-anchor)/12),t);
 // Filter sub-bass pops and the metallic edge of the recorded hammer transient.
 highpass.type='highpass';highpass.frequency.setValueAtTime(SOFT_PIANO.highpass,t);
 highpass.Q.setValueAtTime(0.707,t);
 lowpass.type='lowpass';lowpass.frequency.setValueAtTime(Math.max(SOFT_PIANO.lowpass,frequency(m)*3),t);
 lowpass.Q.setValueAtTime(0.707,t);
 // Length-aware release and pressure-aware attack (stylus only).
 // Rounded multi-point envelope avoids discontinuities at the note onset.
 const attack=attackDuration(pressure);
 const voiceGain=calibratedPianoGain(anchor)*expressionFromInput(pressure);
 gain.gain.setValueAtTime(0,t);
 gain.gain.linearRampToValueAtTime(voiceGain*smoothstep(.25),t+attack*.25);
 gain.gain.linearRampToValueAtTime(voiceGain*smoothstep(.50),t+attack*.50);
 gain.gain.linearRampToValueAtTime(voiceGain*smoothstep(.75),t+attack*.75);
 gain.gain.linearRampToValueAtTime(voiceGain,t+attack);
 source.connect(highpass);highpass.connect(lowpass);lowpass.connect(gain);gain.connect(app.synthMaster);
 const voice={type:'sample',source,gain,highpass,lowpass,started:t,voiceGain,attackDuration:attack,releasing:false};
 source.onended=()=>{
  source.disconnect();highpass.disconnect();lowpass.disconnect();gain.disconnect();
  activePianoVoices.delete(voice);
  if(app.playing.get(m)===voice)app.playing.delete(m);
 };
 activePianoVoices.add(voice);
 source.start(t);
 app.playing.set(m,voice);
 return true;
}
function sampledNoteOff(voice){releasePianoVoice(voice);}

function ensureSynth(){
 if(!audioCtor){notify('이 환경에서는 소리를 낼 수 없습니다.');return null;}
 try{
  if(!app.ctx||app.ctx.state==='closed'){
    app.ctx=new audioCtor();
    app.synthMaster=null;
  }
  if(!app.synthMaster){
    const ac=app.ctx;
    const master=ac.createGain();
    master.gain.setValueAtTime(SOFT_PIANO.master,ac.currentTime);
    if(typeof ac.createDynamicsCompressor==='function'){
      const limiter=ac.createDynamicsCompressor();
      // Safety catch only on loud chord peaks, not an always-on transient compressor.
      limiter.threshold.setValueAtTime(-4,ac.currentTime);
      limiter.knee.setValueAtTime(2,ac.currentTime);
      limiter.ratio.setValueAtTime(12,ac.currentTime);
      limiter.attack.setValueAtTime(0.003,ac.currentTime);
      limiter.release.setValueAtTime(0.23,ac.currentTime);
      master.connect(limiter);
      limiter.connect(ac.destination);
      app.synthLimiter=limiter;
    }else{
      master.connect(ac.destination);
    }
    app.synthMaster=master;
  }
  if(app.ctx.state==='suspended')app.ctx.resume().catch(()=>{});
  return app.ctx;
 }catch(e){console.warn('Piano audio unavailable',e);notify('오디오 장치를 시작할 수 없습니다.');return null;}
}
// Diagnostics: a clean sine note shares the same speaker/AudioContext output.
// If pops persist with this mode, they are not inside the original piano recording.
function soundOnDiagnostic(m,pressure=0.7){
 const ac=ensureSynth();if(!ac)return;
 const t=ac.currentTime,oscillator=ac.createOscillator(),gain=ac.createGain();
 oscillator.type='sine';
 oscillator.frequency.setValueAtTime(frequency(m),t);
 gain.gain.setValueAtTime(0,t);
 gain.gain.linearRampToValueAtTime(0.035,t+0.06);
 oscillator.connect(gain);
 gain.connect(app.synthMaster);
 const voice={type:'diagnostic',oscillator,gain,started:t};
 oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
 oscillator.start(t);
 app.playing.set(m,voice);
}
function releaseDiagnostic(voice){
 const ac=app.ctx;if(!ac)return;
 const t=ac.currentTime,p=voice.gain.gain;
 if(typeof p.cancelAndHoldAtTime==='function')p.cancelAndHoldAtTime(t);
 else{
  const held=0.035*Math.min(1,Math.max(0,(t-voice.started)/0.06));
  p.cancelScheduledValues(t);p.setValueAtTime(held,t);
 }
 p.linearRampToValueAtTime(0,t+0.24);
 try{voice.oscillator.stop(t+0.245);}catch(_){}
}
function soundOn(m,pressure=0.7){
 if(app.playing.has(m))return;
 // Diagnostic mode must bypass Tone Piano; beta12 mistakenly routed it
 // through Tone, so the in-app sine comparison did not test a separate path.
 if(app.audioDiagnosticTone){
   const diagnosticContext=ensureSynth();
   if(!diagnosticContext)return;
   if(diagnosticContext.state==='running'){soundOnDiagnostic(m,pressure);return;}
   diagnosticContext.resume().then(()=>{
     if(app.audioDiagnosticTone&&app.owners.has(m)&&!app.playing.has(m))
       soundOnDiagnostic(m,pressure);
   }).catch(()=>{});
   return;
 }
 if(window.VoiceLineToneEngine){
   app.playing.set(m,{type:'tone'});
   window.VoiceLineToneEngine.keyDown(m,pressure);
   return;
 }
 const context=ensureSynth();
 if(!context)return;
 if(context.state!=='running'){
   // No note is scheduled inside a suspended AudioContext: starting in the middle
   // of its attack when resume() completes can produce an audible thump.
   context.resume().then(()=>{
     if(app.ctx===context&&app.owners.has(m)&&!app.playing.has(m))soundOn(m,pressure);
   }).catch(()=>{});
   return;
 }
 if(app.audioDiagnosticTone){soundOnDiagnostic(m,pressure);return;}
 if(sampledNoteOn(m,pressure))return;
 // Only when a bundled recording is not ready/decodable, keep the older fallback.
 loadAcousticSample(nearestAcousticMidi(m));
 const ac=ensureSynth();if(!ac)return;
 const t=ac.currentTime;
 const freq=frequency(m);
 const oscillator=ac.createOscillator(),harm=ac.createOscillator();
 const g=ac.createGain(),g2=ac.createGain(),lowpass=ac.createBiquadFilter();
 oscillator.type='triangle';oscillator.frequency.setValueAtTime(freq,t);
 harm.type='sine';harm.frequency.setValueAtTime(freq*2,t);
 g2.gain.setValueAtTime(0.13,t);
 lowpass.type='lowpass';lowpass.frequency.setValueAtTime(clamp(freq*4.5,950,5500),t);
 lowpass.Q.setValueAtTime(0.65,t);
 // Start at exactly zero amplitude: no discontinuity even with oscillator phase offsets.
 g.gain.setValueAtTime(0,t);
 g.gain.linearRampToValueAtTime(SYNTH_ENV.peak,t+SYNTH_ENV.attack);
 g.gain.exponentialRampToValueAtTime(SYNTH_ENV.sustain,t+SYNTH_ENV.decay);
 oscillator.connect(lowpass);harm.connect(g2);g2.connect(lowpass);
 lowpass.connect(g);g.connect(app.synthMaster);
 oscillator.start(t);harm.start(t);
 app.playing.set(m,{oscillator,harm,g,g2,lowpass,started:t});
}
function soundOff(m){
 const p=app.playing.get(m);if(!p)return;
 app.playing.delete(m);
 if(p.type==='tone'){
   window.VoiceLineToneEngine?.keyUp(m);
   return;
 }
 if(!app.ctx)return;
 if(p.type==='sample'){sampledNoteOff(p);return;}
 if(p.type==='diagnostic'){releaseDiagnostic(p);return;}
 const t=app.ctx.currentTime,volume=p.g.gain;
 // AudioParam.value is NOT the current value of a pending automation.
 // Holding the scheduled instantaneous gain avoids a step to near-silence
 // on short taps, glissandos, repeated notes and pointer cancellation.
 if(typeof volume.cancelAndHoldAtTime==='function'){
   volume.cancelAndHoldAtTime(t);
 }else{
   const held=noteEnvelopeGain(p.started,t);
   volume.cancelScheduledValues(t);
   volume.setValueAtTime(held,t);
 }
 volume.linearRampToValueAtTime(0,t+SYNTH_ENV.release);
 p.oscillator.stop(t+SYNTH_ENV.release+0.008);
 p.harm.stop(t+SYNTH_ENV.release+0.008);
 p.oscillator.onended=()=>{
   p.oscillator.disconnect();p.harm.disconnect();
   p.g2.disconnect();p.lowpass.disconnect();p.g.disconnect();
 };
}
function keyAt(clientX,clientY){
 const elem=document.elementFromPoint(clientX,clientY);
 const key=elem?.closest?.('#keyboard [data-midi]');
 return key?Number(key.dataset.midi):null;
}
function pointerChange(pointerId,m,pressure=0.7){
 const old=app.owners.get('__pointer'+pointerId);
 if(old===m)return;
 if(old!==undefined){
  const owners=app.owners.get(old);
  if(owners){owners.delete(pointerId);if(owners.size===0){app.owners.delete(old);soundOff(old);}}
 }
 app.owners.delete('__pointer'+pointerId);
 if(m!==null){
  let owners=app.owners.get(m);if(!owners){owners=new Set();app.owners.set(m,owners);}
  if(owners.size===0)soundOn(m,pressure);
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
 pointerChange(e.pointerId,m,pressureForEvent(e));
});
kb.addEventListener('pointermove',e=>{
 if(!app.owners.has('__pointer'+e.pointerId))return;
 e.preventDefault();pointerChange(e.pointerId,keyAt(e.clientX,e.clientY),pressureForEvent(e));
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
function updateDetection(t,nativeSamples=null,nativeRate=0){
 if(!nativeSamples&&(!app.analyser||!app.micCtx))return;
 if(!nativeSamples)app.analyser.getFloatTimeDomainData(app.buffer);
 const p=nativeSamples?pitchYin(nativeSamples,nativeRate):pitchYin(app.buffer,app.micCtx.sampleRate);
 if(!p){
  if(app.mode==='vibrato'){rememberVibratoPoint(t,null);renderVibratoOverlay(t);}
  if(app.mode==='record'&&app.record){rememberRecordPitchPoint(t,null);renderRecordPitchOverlay(t);}
  app.detected=null;
  if(app.mode==='pitch'||app.mode==='record'){$('noteHint').textContent='소리를 감지하는 중…';clearNote();}
  syncKeyColors();return;
 }
 let midi=69+12*Math.log2(p.hz/440);
 const rawVibratoMidi=midi;
 if(app.notes.length&&Math.abs(midi-app.notes[app.notes.length-1])>3)app.notes=[];
 app.notes.push(midi);if(app.notes.length>3)app.notes.shift();
 const sorted=[...app.notes].sort((a,b)=>a-b);midi=sorted[Math.floor(sorted.length/2)];
 app.detected=midi;app.currentMidi=midi;app.sessionSamples++;
 // Follow the measured singing range with the two-octave keyboard.
 if(app.mode!=='vibrato'&&app.owners.size===0&&(midi<app.base || midi>=app.base+24)){
  const next=clamp((Math.floor(midi/12)-1)*12,24,84);
  if(next!==app.base){app.base=next;drawKeys();}
 }
 app.sessionLow=Math.min(app.sessionLow??midi,midi);
 app.sessionHigh=Math.max(app.sessionHigh??midi,midi);
 $('noteHint').textContent='실시간 음정';
 showNote(midi,p.hz,(midi-Math.round(midi))*100);
 if(app.mode==='vibrato'){
  // Use unsmoothed pitch for vibrato depth; the 3-frame median above is for
  // stable note names and would otherwise flatten fast vocal oscillations.
  rememberVibratoPoint(t,Math.abs(rawVibratoMidi-app.vibratoRoot)<=1.5?rawVibratoMidi:null);
  if(app.vibratoStart)vibratoStatus();
  renderVibratoOverlay(t);
 }
 if(app.mode==='record'&&app.record){
  rememberRecordPitchPoint(t,midi);
  if(app.recordPitchLow===null||midi<app.recordPitchLow)app.recordPitchLow=midi;
  if(app.recordPitchHigh===null||midi>app.recordPitchHigh)app.recordPitchHigh=midi;
  renderRecordPitchOverlay(t);
 }
 if(app.mode==='practice'&&app.exercise?.active&&t>=app.exercise.start){
  const err=Math.abs(midi-app.exercise.target)*100;
  app.exercise.total++;if(err<=35)app.exercise.hits++;
 }
 syncKeyColors();
}
// For the Android-only APK, use AudioRecord directly instead of relying on WebView getUserMedia.
// This also avoids a WebView second-stage permission denial on some device versions.
window.VoiceLineNativeAudio = {
 onState(state,detail){
   if(state==='permission'){micStatus('마이크 권한 요청 중…');return;}
   if(state==='started'){
     app.nativeMic=true;
     app.mic=true;
     app.micError='';
     app.lastAnalyze=0;
     app.notes=[];
     app.sessionStart=performance.now();
     app.sessionLow=null;app.sessionHigh=null;app.sessionSamples=0;
     micStatus('● 마이크 켜짐 (Android)');
     if(!app.frame)app.frame=requestAnimationFrame(tick);
     completeNativeStart(true);
   }else if(state==='denied'||state==='error'){
     app.micError=state+': '+detail;
     micStatus(state==='denied'?'마이크 권한 거부':'마이크 연결 실패');
     notify(detail||'안드로이드 마이크 시작 실패');
     completeNativeStart(false);
     if(app.mic)stopMic();
   }
 },
 onAudioChunk(encoded,sampleRate){
   if(!app.mic||!app.nativeMic)return;
   // Raw PCM16 comes only from the installed native AudioRecord bridge.
   const bytes=atob(encoded);
   const samples=new Float32Array(Math.floor(bytes.length/2));
   for(let i=0;i<samples.length;i++){
     let v=bytes.charCodeAt(i*2)|(bytes.charCodeAt(i*2+1)<<8);
     if(v>=32768)v-=65536;
     samples[i]=v/32768;
   }
   app.nativeSampleRate=sampleRate;
   if(app.record?.type==='native')app.record.chunks.push(samples);
   const t=performance.now();
   if(t-app.lastAnalyze>(app.mode==='vibrato'?35:app.mode==='record'?55:70)){
     updateDetection(t,samples,sampleRate);
     app.lastAnalyze=t;
   }
 }
};
function completeNativeStart(ok){
 const cb=app.nativeStartResolve;
 app.nativeStartResolve=null;
 if(app.nativeStartTimeout)clearTimeout(app.nativeStartTimeout);
 app.nativeStartTimeout=0;
 if(cb)cb(ok);
}
async function startNativeMic(){
 micStatus('안드로이드 마이크 연결 중…');
 return await new Promise(resolve=>{
   app.nativeStartResolve=resolve;
   app.nativeStartTimeout=setTimeout(()=>{
     app.micError='Android microphone startup timed out';
     app.nativeStartResolve=null;
     app.nativeStartTimeout=0;
     try{window.VoiceLineNative.stop();}catch(_){}
     micStatus('마이크 연결 시간 초과');
     notify('마이크가 응답하지 않습니다. 앱의 마이크 권한을 확인하세요.');
     resolve(false);
   },12000);
   try{window.VoiceLineNative.start();}
   catch(e){
     app.micError='Native bridge failed: '+String(e);
     micStatus('마이크 연결 실패');
     notify('안드로이드 마이크 요청 오류: '+String(e));
     completeNativeStart(false);
   }
 });
}
async function startMic(){
 if(app.mic)return true;
 if(window.VoiceLineNative?.start)return startNativeMic();
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
  app.micError=(e?.name||'Error')+': '+(e?.message||'unknown');
  micStatus('마이크 연결 실패 · '+(e?.name||'오류'));
  const msg=e?.name==='NotAllowedError'?'마이크 권한이 차단되었습니다. 기기 설정에서 허용해 주세요.':'마이크를 열 수 없습니다. 다른 앱의 마이크 사용 여부를 확인해 주세요.';
  notify(msg);return false;
 }
}
function stopMic(){
 if(!app.mic){completeNativeStart(false);return;}
 const wasNative=app.nativeMic;
 app.mic=false;
 app.nativeMic=false;
 cancelAnimationFrame(app.frame);app.frame=0;
 if(wasNative)try{window.VoiceLineNative?.stop?.();}catch(_){};
 app.stream?.getTracks().forEach(t=>t.stop());
 app.source?.disconnect();app.analyser?.disconnect();
 app.micCtx?.close().catch(()=>{});
 app.stream=null;app.source=null;app.analyser=null;app.micCtx=null;app.buffer=null;
 app.detected=null;app.notes=[];micStatus('마이크 꺼짐');syncKeyColors();
}
function tick(t){
 if(!app.mic)return;
 if(!app.nativeMic&&t-app.lastAnalyze>(app.mode==='vibrato'?35:app.mode==='record'?55:70)){updateDetection(t);app.lastAnalyze=t;}
 if(app.exercise?.active)updateExercise(t);
 if(app.mode==='vibrato'){
  renderVibratoOverlay(t);
  if(app.vibratoStart)progress(clamp((t-app.vibratoStart)/15000,0,1),'비브라토 '+Math.floor((t-app.vibratoStart)/1000)+'초');
 }
 if(app.mode==='record')renderRecordPitchOverlay(t);
 if(app.record)progress(clamp((t-app.recordStart)/(10*60*1000),0,1),'녹음 '+Math.floor((t-app.recordStart)/1000)+'초');
 if(app.record&&t-app.recordStart>=10*60*1000){notify('녹음은 최대 10분으로 저장됩니다.');stopRecording().then(()=>{stopMic();$('stopButton').hidden=true;});}
 app.frame=requestAnimationFrame(tick);
}
// The graph is in musical cents, NOT waveform amplitude. Show the actual
// detected pitch relative to the selected note, preserving natural variation.
const VIBRATO_WINDOW_MS=3000;
function analyzeVibrato(samples,referenceMidi){
 const valid=samples.filter(s=>Number.isFinite(s.midi)&&Math.abs(s.midi-referenceMidi)<=1.5)
   .sort((a,b)=>a.t-b.t);
 if(valid.length<16 || valid[valid.length-1].t-valid[0].t<900)return null;
 const values=valid.map(s=>s.midi).sort((a,b)=>a-b);
 const percentile=p=>{
  const k=(values.length-1)*p,i=Math.floor(k),f=k-i;
  return values[i]+(values[Math.min(i+1,values.length-1)]-values[i])*f;
 };
 const centerMidi=percentile(.5);
 const depthCents=(percentile(.90)-percentile(.10))*50;
 const centerOffsetCents=(centerMidi-referenceMidi)*100;
 // Three-point filter reduces single-frame detector jitter without erasing
 // the ~4-7 Hz fluctuations resolved at a 35ms analysis interval.
 const filtered=valid.map((s,i)=>{
  const prior=valid[i-1],next=valid[i+1];
  if(!prior||!next||s.t-prior.t>155||next.t-s.t>155)return (s.midi-centerMidi)*100;
  return ((prior.midi+next.midi)*.2+s.midi*.6-centerMidi)*100;
 });
 const crossings=[];
 if(depthCents>=5)for(let i=1;i<valid.length;i++){
  if(valid[i].t-valid[i-1].t>160)continue;
  const a=filtered[i-1],b=filtered[i];
  if(a<0&&b>=0&&b-a>1e-6){
   const crossing=valid[i-1].t+(valid[i].t-valid[i-1].t)*(-a)/(b-a);
   if(!crossings.length||crossing-crossings[crossings.length-1]>105)crossings.push(crossing);
  }
 }
 const intervals=[];
 for(let i=1;i<crossings.length;i++){
  const d=crossings[i]-crossings[i-1];
  if(d>=105&&d<=550)intervals.push(d);
 }
 let rate=null,regularity='측정 중';
 if(intervals.length>=3){
  const sorted=[...intervals].sort((a,b)=>a-b);
  const median=sorted[Math.floor(sorted.length/2)];
  const close=intervals.filter(x=>Math.abs(x-median)<=median*.35);
  if(close.length>=3){
   const mean=close.reduce((a,b)=>a+b,0)/close.length;
   const variation=Math.sqrt(close.reduce((a,b)=>a+(b-mean)**2,0)/close.length)/mean;
   const estimate=1000/mean;
   if(estimate>=2&&estimate<=9){
    rate=estimate;
    regularity=variation<=.14?'일정':variation<=.28?'약간 변동':'불규칙';
   }
  }
 }
 return {centerMidi,centerOffsetCents,depthCents,rate,regularity,count:valid.length};
}
function rememberVibratoPoint(t,midi){
 const points=app.vibratoSamples;
 points.push({t,midi:Number.isFinite(midi)?midi:null});
 while(points.length && t-points[0].t>VIBRATO_WINDOW_MS+200)points.shift();
}
function vibratoStatus(){
 const result=analyzeVibrato(app.vibratoSamples,app.vibratoRoot);
 if(!result)return;
 if(app.vibratoStart){
  if(result.rate!==null){
   app.vibratoLast={rate:result.rate,depth:result.depthCents};
   setMessage('비브라토 '+result.rate.toFixed(1)+' Hz · 진폭 ±'+Math.round(result.depthCents)+' cent (추정)');
  }else{
   setMessage('음정을 유지하며 흔들림을 측정하는 중입니다.');
  }
 }
}
// Recording mode uses a musical-pitch (notes/semitones) graph rather than a
// raw microphone amplitude waveform. Six seconds are kept in memory; a ten
// minute recording does not allocate an unbounded array of pitch points.
const RECORD_PITCH_WINDOW_MS=6000;
function rememberRecordPitchPoint(t,midi){
 const points=app.recordPitchSamples;
 points.push({t,midi:Number.isFinite(midi)?midi:null});
 while(points.length&&t-points[0].t>RECORD_PITCH_WINDOW_MS+250)points.shift();
}
function recordPitchBounds(points){
 const values=points.filter(p=>Number.isFinite(p.midi)).map(p=>p.midi);
 if(!values.length)return {low:48,high:72};
 const low=Math.max(24,Math.floor(Math.min(...values))-2);
 const high=Math.min(107,Math.ceil(Math.max(...values))+2);
 // Do not stretch normal speech to fill the whole graph.
 const center=(high+low)/2;
 return {low:Math.max(24,Math.floor(center-Math.max(5,(high-low)/2))),
         high:Math.min(107,Math.ceil(center+Math.max(5,(high-low)/2)))};
}
function syncRecordPitchOverlay(){
 const el=$('recordPitchOverlay');if(!el)return;
 el.hidden=app.mode!=='record';
 if(!el.hidden)renderRecordPitchOverlay(performance.now(),true);
}
function renderRecordPitchOverlay(now=performance.now(),force=false){
 const el=$('recordPitchOverlay');if(!el||el.hidden||app.mode!=='record')return;
 if(!force&&now-app.recordPitchLast<80)return;
 app.recordPitchLast=now;
 const canvas=$('recordPitchGraph'),rect=canvas.getBoundingClientRect();
 if(rect.width<15||rect.height<15)return;
 const w=rect.width,h=rect.height,dpr=Math.min(window.devicePixelRatio||1,2);
 const dw=Math.round(w*dpr),dh=Math.round(h*dpr);
 if(canvas.width!==dw||canvas.height!==dh){canvas.width=dw;canvas.height=dh;}
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const left=34,right=w-8,top=8,bottom=h-15;
 if(right<=left||bottom<=top)return;
 const viewEnd=app.recordPitchFrozenAt??now;
 const first=viewEnd-RECORD_PITCH_WINDOW_MS;
 const points=app.recordPitchSamples.filter(p=>p.t>=first&&p.t<=viewEnd+50);
 const range=recordPitchBounds(points);
 const yFor=midi=>bottom-clamp((midi-range.low)/(range.high-range.low),0,1)*(bottom-top);
 // Draw note grid with named C keys and a subdued semitone background.
 const lowGrid=Math.ceil(range.low/12)*12;
 ctx.font='10px system-ui,sans-serif';ctx.lineWidth=1;
 ctx.textAlign='right';
 for(let m=lowGrid;m<=range.high;m+=12){
   const y=yFor(m);
   ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);
   ctx.strokeStyle='rgba(107,238,208,.43)';ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([]);
   ctx.fillStyle='#b4ecd9';ctx.fillText(name(m),left-5,Math.max(9,Math.min(h-2,y+3)));
 }
 ctx.textAlign='left';ctx.fillStyle='#b8bcd4';ctx.fillText('−6초',left,bottom+12);
 ctx.textAlign='right';ctx.fillText('현재',right,bottom+12);
 ctx.beginPath();let last=null,count=0;
 for(const p of points){
   if(!Number.isFinite(p.midi)){last=null;continue;}
   const x=left+clamp((p.t-first)/RECORD_PITCH_WINDOW_MS,0,1)*(right-left);
   const y=yFor(p.midi);
   if(last===null||p.t-last>200)ctx.moveTo(x,y);else ctx.lineTo(x,y);
   last=p.t;count++;
 }
 if(count>1){ctx.lineWidth=2.5;ctx.strokeStyle='#d4a6ff';ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();}
 const latest=app.record&&points.length?[...points].reverse().find(p=>Number.isFinite(p.midi)):null;
 $('recordCurrentPitch').textContent=latest?name(Math.round(latest.midi)):'—';
 $('recordCurrentHz').textContent=latest?frequency(latest.midi).toFixed(1):'—';
 $('recordLowNote').textContent=Number.isFinite(app.recordPitchLow)?name(Math.round(app.recordPitchLow)):'—';
 $('recordHighNote').textContent=Number.isFinite(app.recordPitchHigh)?name(Math.round(app.recordPitchHigh)):'—';
 $('recordPitchWindow').textContent='최근 6초 · 음높이';
 $('recordPitchStatus').textContent=app.record?count?'실시간 측정':'목소리 대기':app.recordPitchFrozenAt!==null?'녹음 종료':'녹음 시작 대기';
}
function syncVibratoOverlay(){
 const el=$('vibratoOverlay');if(!el)return;
 el.hidden=app.mode!=='vibrato';
 if(!el.hidden)renderVibratoOverlay(performance.now(),true);
}
function renderVibratoOverlay(now=performance.now(),force=false){
 const el=$('vibratoOverlay');
 if(!el||el.hidden||app.mode!=='vibrato')return;
 if(!force&&now-app.vibratoOverlayLast<55)return;
 app.vibratoOverlayLast=now;
 const canvas=$('vibratoGraph'),rect=canvas.getBoundingClientRect();
 if(rect.width<15||rect.height<15)return;
 const w=rect.width,h=rect.height,dpr=Math.min(window.devicePixelRatio||1,2);
 const dw=Math.round(w*dpr),dh=Math.round(h*dpr);
 if(canvas.width!==dw||canvas.height!==dh){canvas.width=dw;canvas.height=dh;}
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.clearRect(0,0,w,h);
 const left=30,right=w-7,top=8,bottom=h-15;
 if(right<=left||bottom<=top)return;
 const yFor=v=>(top+bottom)/2-clamp(v,-110,110)/110*(bottom-top)/2;
 // Soft tuning band is a guide, not a medical or singing-quality judgement.
 ctx.fillStyle='rgba(93,231,210,.11)';
 ctx.fillRect(left,yFor(30),right-left,yFor(-30)-yFor(30));
 ctx.lineWidth=1;
 ctx.font='10px system-ui,sans-serif';ctx.textAlign='right';
 for(const cent of [-100,-50,0,50,100]){
  const y=yFor(cent);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);
  ctx.strokeStyle=cent===0?'rgba(105,255,213,.95)':'rgba(210,220,240,.18)';
  ctx.setLineDash(cent===0?[6,4]:[2,5]);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=cent===0?'#85f8df':'#bbc3d7';
  ctx.fillText((cent>0?'+':'')+cent,left-5,Math.max(9,Math.min(h-1,y+3)));
 }
 ctx.textAlign='left';ctx.fillStyle='#abbdd3';ctx.fillText('−3초',left,bottom+12);
 ctx.textAlign='right';ctx.fillText('현재',right,bottom+12);
 const windowStart=now-VIBRATO_WINDOW_MS;
 ctx.beginPath();let drawing=false,prev=null,count=0;
 for(const sample of app.vibratoSamples){
  if(sample.t<windowStart||sample.t>now+70)continue;
  const valid=Number.isFinite(sample.midi)&&Math.abs(sample.midi-app.vibratoRoot)<=1.5;
  if(!valid){drawing=false;prev=null;continue;}
  const x=left+clamp((sample.t-windowStart)/VIBRATO_WINDOW_MS,0,1)*(right-left);
  const y=yFor((sample.midi-app.vibratoRoot)*100);
  if(!drawing||!prev||sample.t-prev>170)ctx.moveTo(x,y);
  else ctx.lineTo(x,y);
  drawing=true;prev=sample.t;count++;
 }
 if(count>=2){
  ctx.strokeStyle='#d1a4ff';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';
  ctx.setLineDash([]);ctx.stroke();
 }
 const data=analyzeVibrato(app.vibratoSamples,app.vibratoRoot);
 $('vibratoTargetLabel').textContent='기준음 '+name(app.vibratoRoot)+' · 최근 3초';
 $('vibratoCenter').textContent=data?(data.centerOffsetCents>0?'+':'')+Math.round(data.centerOffsetCents)+' ¢':'—';
 $('vibratoDepth').textContent=data?'±'+Math.round(data.depthCents)+' ¢':'—';
 $('vibratoRate').textContent=data?.rate!==null&&data?' '+data.rate.toFixed(1)+' Hz':'—';
 $('vibratoRegularity').textContent=data?.regularity||'측정 중';
 $('vibratoGraphStatus').textContent=!app.mic?'마이크 꺼짐':!count?'목소리 대기':!data?'분석 중':data.rate===null?'흔들림 측정 중':'추정 결과';
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
  $('vroot').onchange=e=>{
   const chosen=Number(e.target.value);
   if(!Number.isInteger(chosen)||chosen<36||chosen>95)return;
   app.vibratoRoot=chosen;
   focusVibratoReference();
  };
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
 // Five complete octaves, including all sharps/flats on black keys.
 // Previously only white notes 48..83 were offered, hiding many target pitches.
 for(let octave=2;octave<=6;octave++){
  const group=document.createElement('optgroup');
  group.label=octave+' 옥타브(C'+octave+'–B'+octave+')';
  for(let step=0;step<12;step++){
   const m=(octave+1)*12+step;
   const op=document.createElement('option');
   op.value=String(m);
   op.textContent=name(m)+' · '+koname(m);
   group.append(op);
  }
  sel.append(group);
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
 if(window.VoiceLineToneEngine){
   window.VoiceLineToneEngine.reference(m).catch(err=>console.warn('Reference note',err));
   return;
 }
 const ac=ensureSynth();if(!ac)return;
 const t=ac.currentTime,g=ac.createGain();
 const anchor=nearestAcousticMidi(m),sample=acoustic.buffers.get(anchor);
 if(sample){
   const s=ac.createBufferSource();
   s.buffer=sample;s.playbackRate.setValueAtTime(Math.pow(2,(m-anchor)/12),t);
   g.gain.setValueAtTime(0,t);
   g.gain.linearRampToValueAtTime(SOFT_PIANO.peakGain*0.66,t+SOFT_PIANO.attack);
   g.gain.linearRampToValueAtTime(0,t+0.36);
   s.connect(g);g.connect(app.synthMaster);s.start(t);s.stop(t+0.37);
   s.onended=()=>{s.disconnect();g.disconnect();};
 }else{
   loadAcousticSample(anchor);
   // Fallback for an unavailable sample only.
   const o=ac.createOscillator();o.type='sine';o.frequency.setValueAtTime(frequency(m),t);
   g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.038,t+0.026);
   g.gain.linearRampToValueAtTime(0,t+0.28);
   o.connect(g);g.connect(app.synthMaster);o.start(t);o.stop(t+0.288);
   o.onended=()=>{o.disconnect();g.disconnect();};
 }
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
 if(!app.mic)throw new Error('마이크가 연결되지 않았습니다.');
 app.recordStart=performance.now();
 app.recordPitchSamples=[];app.recordPitchLow=null;app.recordPitchHigh=null;app.recordPitchFrozenAt=null;app.recordPitchLast=0;
 renderRecordPitchOverlay(app.recordStart,true);
 if(app.nativeMic){
   // Store WAV directly as an IndexedDB blob; no media server or external permission.
   app.record={type:'native',targetRate:app.nativeSampleRate,chunks:[]};
   return;
 }
 if(!app.stream||!app.micCtx)throw new Error('Web microphone stream unavailable');
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
 app.recordPitchFrozenAt=performance.now();
 renderRecordPitchOverlay(app.recordPitchFrozenAt,true);
 app.record=null;renderRecordPitchOverlay(app.recordPitchFrozenAt,true);$('mainButton').textContent='녹음 시작';$('mainButton').classList.remove('recording');
 const elapsed=Math.max(0,Math.round((performance.now()-app.recordStart)/1000));
 let blob;
 try{
  if(r.type==='media'){if(r.mr.state!=='inactive')r.mr.stop();blob=await r.complete;}
  else if(r.type==='native')blob=wavBlob(r.chunks,r.targetRate);
  else{r.processor.onaudioprocess=null;app.source?.disconnect(r.processor);r.processor.disconnect();r.silent.disconnect();blob=wavBlob(r.chunks,r.targetRate);}
  if(!blob||blob.size<128)throw new Error('녹음 데이터 없음');
  await store('recordings','put',{id:id(),date:stamp(),timestamp:Date.now(),duration:elapsed,blob,mime:blob.type,size:blob.size,title:'목소리 녹음',pitchLow:app.recordPitchLow,pitchHigh:app.recordPitchHigh});
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
function resetMainAction(){
 const b=$('mainButton');
 b.classList.remove('recording');
 b.textContent=app.mode==='record'?'녹음 시작':app.mode==='practice'?'연습 시작':app.mode==='vibrato'?'비브라토 시작':'마이크 켜기';
 $('stopButton').hidden=true;
}
// Keep microphone control independent of the main activity button.
// A manual OFF must finish active recording/exercises rather than lose data.
$('micToggle').addEventListener('click',async()=>{
 if(app.busy||app.nativeStartResolve)return;
 app.busy=true;updateMicToggle();
 try{
   if(app.mic){
     await stopActivity();
     resetMainAction();
     clearNote();
     setMessage('마이크가 꺼졌습니다. 피아노 건반은 계속 연주할 수 있습니다.');
     notify('마이크 꺼짐');
   }else if(await startMic()){
     if(app.mode==='piano'){
       app.mode='pitch';
       $('modeChip').textContent=MODES.pitch[0];
       setTitle(MODES.pitch[0]);
       modeControls();
     }
     if(app.mode==='pitch'){
       $('mainButton').textContent='마이크 끄기';
       $('stopButton').hidden=false;
     }
     setMessage('마이크 켜짐 · 피아노 건반의 소리도 함께 감지될 수 있습니다. 정확한 측정에는 이어폰을 권장합니다.');
     notify('마이크 켜짐 · 피아노 소리가 음정 측정에 영향을 줄 수 있습니다.');
   }
 }catch(e){
   console.warn('Microphone toggle failed',e);
   notify('마이크를 전환하는 중 문제가 발생했습니다.');
 }finally{
   app.busy=false;
   updateMicToggle();
 }
});
async function switchMode(mode){
 if(!MODES[mode])return;
 if(app.busy)return;app.busy=true;
 try{
  await stopActivity();app.mode=mode;app.detected=null;app.currentMidi=null;
  $('modeChip').textContent=MODES[mode][0];setTitle(MODES[mode][0]);setMessage(MODES[mode][1]);
  $('noteHint').textContent='건반·마이크 대기';
  clearNote();progress(0,'준비');modeControls();
  syncVibratoOverlay();syncRecordPitchOverlay();
  if(mode==='vibrato')focusVibratoReference();
  $('mainButton').textContent=mode==='record'?'녹음 시작':mode==='practice'?'연습 시작':mode==='vibrato'?'비브라토 시작':'마이크 켜기';
  $('mainButton').classList.remove('recording');$('stopButton').hidden=true;
  syncKeyColors();
 }finally{app.busy=false;updateMicToggle();}
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
   else if(await startMic()){app.vibratoSamples=[];app.vibratoLast=null;app.vibratoStart=performance.now();renderVibratoOverlay(performance.now(),true);b.textContent='비브라토 중지';$('stopButton').hidden=false;}
  }else{
   if(app.mic){await stopActivity();b.textContent='마이크 켜기';$('stopButton').hidden=true;}
   else if(await startMic()){if(app.mode==='piano'){app.mode='pitch';$('modeChip').textContent='음정 측정하기';setTitle('음정 측정하기');}b.textContent='마이크 끄기';$('stopButton').hidden=false;}
  }
 }finally{b.disabled=false;app.busy=false;updateMicToggle();}
});
$('stopButton').addEventListener('click',async()=>{
 if(app.busy)return;app.busy=true;
 try{await stopActivity();$('stopButton').hidden=true;$('mainButton').classList.remove('recording');$('mainButton').textContent=app.mode==='record'?'녹음 시작':app.mode==='practice'?'연습 시작':app.mode==='vibrato'?'비브라토 시작':'마이크 켜기';}
 finally{app.busy=false;updateMicToggle();}
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
 ['음정 측정하기','메뉴에서 음정 측정하기를 선택하고 마이크 켜기를 누릅니다. 마이크 권한을 허용하고 한 음을 길게 불러보세요. 내 음정에 해당하는 건반이 보라색으로 표시됩니다. 상단의 마이크 버튼에서 켜짐/꺼짐 상태를 확인하고 사용자가 직접 끌 수 있습니다.'],
 ['녹음하기','녹음 시작을 누르면 건반 위 반투명 창에 내 목소리의 음높이 변화가 최근 6초 동안 음표 높이로 표시됩니다. 현재 음정, 주파수(Hz), 녹음 중 최저·최고 음정도 확인할 수 있습니다. 그래프는 마이크가 감지한 음높이이며 소리의 크기를 뜻하지 않습니다. 녹음 중지 · 저장을 누르면 기기 내부 저장 공간에 오디오와 감지된 최저·최고 음정을 저장하며 나의 기록에서 재생하거나 삭제할 수 있습니다. 최대 10분으로 제한됩니다. 아이폰이나 아이패드에서는 브라우저의 마이크 권한이 필요합니다.'],
 ['비브라토 연습','기준 음정을 선택하고 비브라토 시작을 누릅니다. 건반 위 반투명 창에서 최근 3초 동안의 실제 음높이를 확인할 수 있습니다. 민트색 가로선은 기준음(0cent), 보라색 곡선은 내 목소리입니다. 중심 음정은 기준음 대비 높낮이, 진폭은 흔들림 폭(±cent), 속도는 초당 반복 횟수(Hz), 규칙성은 주기의 일관성을 나타냅니다. 모두 참고용 추정치이며, 목소리가 감지되지 않거나 규칙적인 흔들림이 충분하지 않으면 수치가 표시되지 않습니다. 건반을 누르는 데 투명창이 영향을 주지 않습니다.'],
 ['음정 연습하기','패턴, 시작음, 속도를 고르고 연습 시작을 누릅니다. 3초 후 민트색 목표 건반을 따라 부르면, ±35cent 이내로 감지된 비율로 정확도를 표시합니다.'],
 ['나의 기록과 개인정보','연습 기록은 앱 내부 IndexedDB에, 녹음 파일은 기기 내장 저장 공간의 앱 전용 데이터에 저장됩니다. 계정과 서버가 필요 없으며 마이크 소리는 서버로 업로드하지 않습니다. 앱 삭제나 앱 데이터 초기화 시 함께 삭제될 수 있습니다.'],
 ['피아노 음원 및 저작권','피아노 연주 엔진: @tonejs/piano (Yotam Mann, MIT), Tone.js (MIT). 실제 그랜드 피아노 녹음: Salamander Grand Piano / Alexander Holm, Creative Commons Attribution 3.0 (CC BY 3.0). 원본: https://github.com/tambien/Piano . 라이선스: https://creativecommons.org/licenses/by/3.0/ . 음원과 라이브러리는 APK에 포함되어 오프라인에서도 연주할 수 있습니다.'],
 ['마이크와 피아노 소리 주의','마이크가 켜져 있으면 피아노 건반에서 재생되는 소리도 마이크에 입력될 수 있습니다. 이 경우 내 목소리의 음정과 피아노 소리가 겹쳐 음정 측정·비브라토 연습·음정 연습의 인식 결과가 부정확할 수 있습니다. 정확한 측정이 필요하다면 이어폰을 사용하거나, 피아노 소리를 들은 뒤 건반 연주를 멈추고 목소리만 내세요. 마이크를 쓰지 않을 때는 화면 상단의 「마이크 끄기」를 누르면 됩니다. 녹음·연습 중에 마이크를 끄면 해당 활동도 정상 종료되며 녹음은 저장됩니다.'],
 ['주의','녹음 내용에 피아노 소리가 섞일 수 있으므로 이어폰 사용을 권장합니다. 목이 아프거나 어지러우면 즉시 중단하세요. 분석 결과는 의료적 진단이 아닙니다.']
 ];
 for(const [title,body] of sections){plain(b,'h3','',title);plain(b,'p','',body);}
 plain(b,'h3','','건반 소리 진단');
 const soundHelp=plain(b,'p','', '음원 자체의 잡음인지 기기 오디오 출력 문제인지 확인할 수 있습니다. 기본은 실제 피아노 녹음입니다.');
 const soundButton=plain(b,'button','','소리 테스트: 순음으로 비교');
 soundButton.onclick=()=>{
   allKeysOff();
   app.audioDiagnosticTone=!app.audioDiagnosticTone;
   soundButton.textContent=app.audioDiagnosticTone?'소리 테스트 종료 · 실제 피아노로 복귀':'소리 테스트: 순음으로 비교';
   soundHelp.textContent=app.audioDiagnosticTone?
    '점검용 단순 순음을 재생합니다. 건반을 누르거나 뗄 때 같은 잡음이 나는지 비교해 보세요.':
    '실제 피아노 음원으로 돌아왔습니다.';
   notify(app.audioDiagnosticTone?'음향 진단 순음 활성화':'실제 피아노 음원 활성화');
 };
 if(app.audioDiagnosticTone)soundButton.textContent='소리 테스트 종료 · 실제 피아노로 복귀';
 plain(b,'h3','', '마이크 연결 상태 확인');
 const status=plain(b,'p','', '마이크가 연결되지 않으면 아래 버튼을 눌러 현재 권한과 오류 정보를 확인하세요.');
 const diagnose=plain(b,'button','', '마이크 상태 진단');
 diagnose.onclick=()=>{
   try {
     const d=window.VoiceLineMicrophoneDiagnostics();
     status.textContent='Android: '+d.nativeStatus+' | WebView 마이크: '+(d.webMediaSupported?'사용 가능':'미지원')+
       ' | 최근 오류: '+d.lastError;
   }catch(e){status.textContent='진단 실패: '+String(e);}
 };
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
   plain(left,'small','',r.date+' · '+r.duration+'초 · '+Math.round(r.size/1024)+'KB'+
    (Number.isFinite(r.pitchLow)&&Number.isFinite(r.pitchHigh)?' · 음역 '+name(Math.round(r.pitchLow))+' ~ '+name(Math.round(r.pitchHigh)):''));

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
drawKeys();modeControls();progress(0,'건반 연주 준비');updateMicToggle();syncVibratoOverlay();syncRecordPitchOverlay();
if(window.VoiceLineToneEngine)updateToneEngineStatus();
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
window.VoiceLineMicrophoneDiagnostics=()=>({
 nativeAvailable:!!window.VoiceLineNative?.start,
 nativeStatus:window.VoiceLineNative?.diagnostics?.()||'Not installed',
 webMediaSupported:!!navigator.mediaDevices?.getUserMedia,
 secureContext:!!window.isSecureContext,
 micRunning:app.mic,
 lastError:app.micError||'none'
});
})();