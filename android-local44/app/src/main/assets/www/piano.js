'use strict';
/* VOICE LINE v2 — piano-first offline vocal trainer.
   Native recordings stream to one private WAV; history and playback metadata stay in IndexedDB. */
(() => {
const $ = id => document.getElementById(id);
const $all = q => [...document.querySelectorAll(q)];
// Suppress text/image touch menus without cancelling piano or control pointers.
document.addEventListener('contextmenu',event=>event.preventDefault());
document.addEventListener('selectstart',event=>{
 if(!event.target?.closest?.('input,textarea,[contenteditable="true"]'))event.preventDefault();
});
const NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const KO=['도','도♯','레','레♯','미','파','파♯','솔','솔♯','라','라♯','시'];
const BLACK=new Set([1,3,6,8,10]);
// Keep selectable notes, generated targets and scoring inside the detector's range.
const PITCH_RANGE=Object.freeze({minMidi:36,maxMidi:94,minHz:65,maxHz:1900});
const SCORE_RULES=Object.freeze({minSamples:12,percent:65,practiceCoverage:.4,stepCoverage:.2,
 sustainTolerance:35,dynamicTolerance:55,
 trainingCoverage:.4,earCoverage:.35,dynamicPhaseCoverage:.25,dynamicRatio:1.15});
const PRACTICE_EVENT_MODES=new Set(['pitch','practice','vibrato','sustainVoice',
 'earVoice','dynamicVoice','warmupVoice','guideVoice']);
const MODES={
  piano:['피아노 건반','건반을 누르면 음이 재생되고 눌리는 모션이 나타납니다.'],
  pitch:['음정 측정하기','내 목소리의 음을 보라색 건반으로 표시합니다.'],
  metronome:['메트로놈','박자표, 빠르기와 박별 강세를 직접 설정하세요. 마이크 없이 사용할 수 있습니다.'],
  record:['녹음하기','녹음 파일은 기기 내부에만 저장됩니다.'],
  vibrato:['비브라토 연습','편안하게 한 음을 유지하면 흔들림 속도와 폭을 추정합니다.'],
  practice:['음정 연습','음계·도약 또는 연속 슬라이드를 선택하고 목표 음정을 따라 부르세요.'],
  guideVoice:['음정 연습','가이드 듣기 → 준비 → 따라 부르기 · 음계·단계별·연속 패턴을 선택하세요.'],
  sustainVoice:['발성 유지 훈련','선택한 음을 편안하게 지속하며 음정의 안정도를 확인하세요.'],
  earVoice:['청음·따라 부르기','피아노 기준음을 듣고 따라 불러보세요.'],
  dynamicVoice:['발성 강약 조절','같은 음을 유지하며 소리의 상대적 강약을 바꿔보세요.'],
  warmupVoice:['호흡·워밍업','편안한 호흡과 허밍을 순서대로 진행합니다.']
};
const MIC_SENSITIVITY_KEY='voiceline-mic-sensitivity-v1';
const MIC_SENSITIVITIES=Object.freeze({
 standard:Object.freeze({label:'표준',minRms:.009,recordMinRms:.0028}),
 sensitive:Object.freeze({label:'민감',minRms:.0035,recordMinRms:.0018}),
 high:Object.freeze({label:'최대',minRms:.0015,recordMinRms:.001})
});
function readMicSensitivity(){
 try{
  const value=localStorage.getItem(MIC_SENSITIVITY_KEY);
  if(Object.prototype.hasOwnProperty.call(MIC_SENSITIVITIES,value))return value;
 }catch(_){/* Detection remains available when settings storage is blocked. */}
 return 'sensitive';
}
const PIANO_VOLUME_KEY='voiceline-piano-volume-v1';
function readPianoVolume(){
 try{
  const stored=localStorage.getItem(PIANO_VOLUME_KEY);
  if(stored!==null&&stored!==''&&Number.isFinite(Number(stored)))return Math.max(0,Math.min(100,Math.round(Number(stored))));
 }catch(_){/* Private mode/storage blocked: use recommended default. */}
 return 85;
}
const app={
  mode:'piano',base:48,keyboardNotes:24,playing:new Map(),owners:new Map(),ctx:null,pianoVolume:readPianoVolume(),micSensitivity:readMicSensitivity(),
  layoutPortrait:false,layoutOrientation:null,layoutWidth:0,layoutHeight:0,layoutFrame:0,layoutReady:false,
  stream:null,micCtx:null,source:null,analyser:null,buffer:null,frame:0,
  mic:false,nativeMic:false,nativeStartResolve:null,nativeStartTimeout:0,nativeSampleRate:0,
  micGeneration:0,nativeRequestId:null,micStartPromise:null,micCancelResolve:null,backgrounded:false,
  micError:'',micStatusText:'마이크 꺼짐',busy:false,detected:null,lastAnalyze:0,notes:[],
  sessionStart:0,sessionLow:null,sessionHigh:null,sessionSamples:0,sessionMode:null,record:null,
  training:null,trainingSettings:{root:60,sustainSeconds:8,earCount:4,rounds:2,dynamicCues:true},
  trainingLastDraw:0,
  pitchGraphSamples:[],pitchGraphLast:0,pitchGraphFrozenAt:null,
  exercise:null,exercisePattern:'scale',exerciseRoot:60,exerciseSpeed:1800,exerciseRepeats:2,
  vibratoRoot:60,vibratoStart:0,vibratoSamples:[],vibratoLast:null,vibratoOverlayLast:0,vibratoProgress:0,recordStart:0,
  recordPitchSamples:[],recordPitchLow:null,recordPitchHigh:null,recordPitchLast:0,recordPitchFrozenAt:null,
  recordPitchTrack:[],recordLastPitchAt:-Infinity,recordSignalRms:0,recordSaving:null,lifeStopping:false,
  stopPromise:null,failedRecording:null,historyGeneration:0,historyTab:'recordings',playbackGeneration:0,
  openAudio:null,openAudioUrl:null,openAudioTimer:0,openAudioButton:null
};
const audioCtor=window.AudioContext||window.webkitAudioContext;
const dbPromise=new Promise((resolve,reject)=>{
  if(!('indexedDB' in window)){reject(new Error('기기 저장소 사용 불가'));return;}
  const req=indexedDB.open('voiceline-local-v2',4);
  req.onupgradeneeded=()=>{
    const db=req.result;
    if(!db.objectStoreNames.contains('events'))db.createObjectStore('events',{keyPath:'id'});
    if(!db.objectStoreNames.contains('recordings'))db.createObjectStore('recordings',{keyPath:'id'});
    if(!db.objectStoreNames.contains('recordParts'))db.createObjectStore('recordParts',{keyPath:'id'});
    if(!db.objectStoreNames.contains('recordSessions'))db.createObjectStore('recordSessions',{keyPath:'id'});
    if(!db.objectStoreNames.contains('recordFileDeletes'))db.createObjectStore('recordFileDeletes',{keyPath:'id'});
    for(const kind of ['events','recordings']){
      const table=req.transaction.objectStore(kind);
      if(!table.indexNames.contains('timeAndId'))table.createIndex('timeAndId',['timestamp','id']);
    }
    if(!db.objectStoreNames.contains('recordingsMeta')){
      const metadata=db.createObjectStore('recordingsMeta',{keyPath:'id'});
      metadata.createIndex('timeAndId',['timestamp','id']);
      // Upgrade is atomic: old audio remains untouched, including on failure.
      const migration=req.transaction.objectStore('recordings').openCursor();
      migration.onsuccess=()=>{const cursor=migration.result;if(cursor){metadata.put(recordingMetadata(cursor.value));cursor.continue();}};
    }
    const parts=req.transaction.objectStore('recordParts');
    if(!parts.indexNames.contains('sessionId'))parts.createIndex('sessionId','sessionId');
  };
  req.onsuccess=()=>{
    req.result.onversionchange=()=>req.result.close();
    resolve(req.result);
  };
  req.onblocked=()=>notify('기록 저장소를 갱신하려면 다른 보이스라인 창을 닫아 주세요.');
  req.onerror=()=>reject(req.error||new Error('저장소 오류'));
});
dbPromise.catch(()=>notify('기기 저장 공간을 열 수 없습니다. 브라우저 설정을 확인해 주세요.'));
function recordingMetadata(record){
 const {id,date,timestamp,duration,mime,size,title,pitchLow,pitchHigh,nativeFileId,sourceType}=record;
 return {id,date,timestamp,duration,mime,size,title,pitchLow,pitchHigh,nativeFileId,sourceType};
}
function saveRecording(record){
 return dbPromise.then(db=>new Promise((resolve,reject)=>{
  const tx=db.transaction(['recordings','recordingsMeta'],'readwrite');
  tx.objectStore('recordings').put(record);tx.objectStore('recordingsMeta').put(recordingMetadata(record));
  tx.oncomplete=()=>resolve(record.id);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('녹음 저장 실패'));
 }));
}
function store(kind,method,item){
 if(kind==='recordings'&&method==='put')return saveRecording(item);
 return dbPromise.then(db=>new Promise((resolve,reject)=>{
   const tx=db.transaction(kind,['get','getAll','count'].includes(method)?'readonly':'readwrite');
   let result;
   const req=tx.objectStore(kind)[method](...(item===undefined?[]:[item]));
   // A request's onsuccess fires before the IndexedDB transaction commits.
   // Wait for the transaction to complete so the UI never reports a delete
   // (or save) that the database subsequently rolls back.
   req.onsuccess=()=>{result=req.result;};
   tx.oncomplete=()=>resolve(result);
   tx.onerror=()=>reject(tx.error||req.error||new Error('저장 실패'));
   tx.onabort=()=>reject(tx.error||new Error('저장 작업 취소'));
 }));
}
function readSessionParts(sessionId){
 return dbPromise.then(db=>new Promise((resolve,reject)=>{
  const tx=db.transaction('recordParts','readonly');let parts=[];
  const req=tx.objectStore('recordParts').index('sessionId').getAll(IDBKeyRange.only(sessionId));
  req.onsuccess=()=>{parts=req.result;};tx.oncomplete=()=>resolve(parts);
  tx.onerror=tx.onabort=()=>reject(tx.error||new Error('녹음 자료를 읽을 수 없습니다.'));
 }));
}
function removeSessionData(sessionId,deleteRecording=false,nativeFileId=null){
 return dbPromise.then(db=>new Promise((resolve,reject)=>{
  const tables=['recordParts','recordSessions'];if(deleteRecording)tables.push('recordings','recordingsMeta','recordFileDeletes');
  const tx=db.transaction(tables,'readwrite');
  const req=tx.objectStore('recordParts').index('sessionId').openCursor(IDBKeyRange.only(sessionId));
  req.onsuccess=()=>{const cursor=req.result;if(cursor){cursor.delete();cursor.continue();}};
  tx.objectStore('recordSessions').delete(sessionId);
  if(deleteRecording){
   tx.objectStore('recordings').delete(sessionId);tx.objectStore('recordingsMeta').delete(sessionId);
   if(nativeFileId)tx.objectStore('recordFileDeletes').put({id:nativeFileId});
  }
  tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||new Error('임시 녹음 정리 실패'));
 }));
}
async function cleanupDeletedNativeFiles(){
 if(!window.VoiceLineNative?.deleteRecording)return;
 try{
  const pending=await store('recordFileDeletes','getAll');
  for(const item of pending){
   const error=window.VoiceLineNative.deleteRecording(item.id);
   if(!error)await store('recordFileDeletes','delete',item.id);
  }
 }catch(e){console.warn('File cleanup will retry',e);}
}
function getHistoryPage(kind,before=null,limit=40,query=''){
 return dbPromise.then(db=>new Promise((resolve,reject)=>{
  const table=kind==='recordings'?'recordingsMeta':kind;
  const tx=db.transaction(table,'readonly'),rows=[];let next=null,hasMore=false;
  const range=before?IDBKeyRange.upperBound(before,true):null;
  const req=tx.objectStore(table).index('timeAndId').openCursor(range,'prev');
  req.onsuccess=()=>{
   const cursor=req.result;if(!cursor)return;
   const value=cursor.value;
   if(kind==='events'&&!isPracticeHistoryEvent(value)){cursor.continue();return;}
   if(query&&!window.VoiceLineRecordingTools.matches(value,query)){cursor.continue();return;}
   if(rows.length===limit){hasMore=true;return;}
   // recordingsMeta never contains audio or pitch data.
   rows.push(value);next=cursor.key;cursor.continue();
  };
  tx.oncomplete=()=>resolve({rows,next:hasMore?next:null});
  tx.onerror=tx.onabort=()=>reject(tx.error||new Error('기록 목록을 읽을 수 없습니다.'));
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
        title:'기존 음역대 기록',detail:noteLabel(old.savedRange.low)+' ~ '+noteLabel(old.savedRange.high),mode:'legacy'
      });
    }
    localStorage.setItem('voiceline-v2-migrated','1');
  }catch(e){console.warn('Previous records could not be imported; source data is preserved.',e);}
}
function id(){return Date.now()+'-'+Math.random().toString(36).slice(2,9);}
function stamp(){return new Date().toLocaleString('ko-KR');}
function name(m){m=Math.round(m);return NAMES[(m%12+12)%12]+(Math.floor(m/12)-1);}
function koname(m){m=Math.round(m);return (Math.floor(m/12)-3)+'옥 '+KO[(m%12+12)%12];}
// VoiceLine uses the established Korean vocal-range octave convention:
// C4 = 2옥 도. Keep Western pitch name (C4) and Korean octave/solfege together.
function noteLabel(m){return name(m)+' · '+koname(m);}
function frequency(m){return 440*Math.pow(2,(m-69)/12);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function notify(s){const t=$('toast');t.textContent=s;t.classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>t.classList.remove('show'),3300);}
function setTitle(text){$('modeTitle').textContent=text;}
function setMessage(text){
 const msg=String(text||'');
 // Long help copy belongs to the per-mode dialog. The small strip only
 // shows a single compact state so there is never a nested text scroller.
 const fullIntro=Object.values(MODES).some(info=>info[1]===msg);
 const shortText=fullIntro?'준비 · 설명 버튼에서 방법 확인':msg;
 const node=$('modeMessage');
 node.textContent=shortText;
 node.title=shortText;
}
// Microphone feedback stays in the existing toolbar gap, leaving practice visible.
let previousMicNoticeState=false;
let micNoticeTimeout=0;
function closeMicNotice(){
 clearTimeout(micNoticeTimeout);micNoticeTimeout=0;
 const node=$('micNotice');if(node)node.hidden=true;
}
function showMicNotice(active){
 if(document.hidden){closeMicNotice();return;}
 const box=$('micNotice');if(!box)return;
 $('micNoticeTitle').textContent=app.layoutPortrait?(active?'마이크 켜짐':'마이크 꺼짐'):(active?'마이크가 켜졌습니다':'마이크가 꺼졌습니다');
 $('micNoticeBody').textContent=active
  ? '이어폰 권장 · 건반 소리도 함께 감지돼요.'
  : '음정 인식 중단 · 훈련 시작 시 다시 켜집니다.';
 $('micNoticeSymbol').textContent=active?'●':'◌';
 box.classList.toggle('on',active);box.classList.toggle('off',!active);
 box.title=$('micNoticeTitle').textContent+' · '+$('micNoticeBody').textContent;
 box.hidden=false;
 clearTimeout(micNoticeTimeout);
 micNoticeTimeout=setTimeout(closeMicNotice,4100);
}
function micStatus(text){
 app.micStatusText=text;$('micChip').textContent=text;updateMicToggle();
 const active=Boolean(app.mic);
 if(previousMicNoticeState!==active){
  previousMicNoticeState=active;
  showMicNotice(active);
 }
}
$('micNoticeDismiss')?.addEventListener('click',closeMicNotice);
function updateMicToggle(){
 const button=$('micToggle'),action=$('micToggleAction');
 if(!button||!action)return;
 const active=Boolean(app.mic);
 const pending=Boolean(app.nativeStartResolve||app.micStartPromise);
 $('micChip').textContent=app.layoutPortrait?(pending&&!active?'연결 중':active?'마이크 켜짐':'마이크 꺼짐'):(app.micStatusText||$('micChip').textContent);
 action.textContent=active?'끄기':'켜기';
 button.disabled=Boolean(app.busy||app.nativeStartResolve);
 button.classList.toggle('active',active);
 button.setAttribute('aria-pressed',String(active));
 button.setAttribute('aria-label',active?'마이크 끄기':'마이크 켜기');
 button.title=active?'마이크 끄기: 녹음·비브라토·음정 연습 중이라면 먼저 정상 종료합니다.':'마이크 켜기: 피아노 소리가 함께 인식될 수 있습니다.';
}
// Independent of Android system media volume. The Tone Piano branch exposes
// a smooth strings-only dB control; the old WebAudio fallback uses master gain.
function pianoVolumeDb(level){return level<=0?-90:-30+level*.30;}
function applyPianoVolume(level,save=true){
 const n=clamp(Math.round(Number(level)||0),0,100);
 app.pianoVolume=n;
 const slider=$('pianoVolume'),out=$('pianoVolumeValue');
 if(slider){slider.value=String(n);slider.setAttribute('aria-valuetext',n+'퍼센트');}
 if(out)out.textContent=n+'%';
 try{if(save)localStorage.setItem(PIANO_VOLUME_KEY,String(n));}catch(_){/* optional preference */}
 try{window.VoiceLineToneEngine?.setVolume?.(n);}catch(e){console.warn('Piano volume engine',e);}
 if(app.synthMaster&&app.ctx?.state!=='closed'){
   const db=pianoVolumeDb(n),gain=n===0?0:SOFT_PIANO.master*Math.pow(10,(db+11)/20);
   const t=app.ctx.currentTime;
   app.synthMaster.gain.cancelScheduledValues(t);
   app.synthMaster.gain.setTargetAtTime(gain,t,.032);
 }
 return n;
}
$('pianoVolume')?.addEventListener('input',e=>applyPianoVolume(e.target.value));
function progress(r,text){$('progressBar').style.width=clamp(r,0,1)*100+'%';$('exerciseProgress').textContent=text;}
async function addEvent(title,detail,mode){
 // Recording is a separate activity, even when its microphone also detects pitch.
 if(!PRACTICE_EVENT_MODES.has(mode)||app.record||app.recordSaving||app.sessionMode==='record')return false;
 if(/녹음|\brecord(?:ing|ed)?\b/i.test(String(title)))return false;
 try{await store('events','put',{id:id(),date:stamp(),timestamp:Date.now(),title,detail,mode,category:'practice'});return true;}
 catch(e){notify('기록 저장에 실패했습니다. 저장 공간을 확인해 주세요.');return false;}
}
function targetKeyboardBase(midi){
 // Keep the target in one portrait octave or the centred landscape pair.
 const count=app.keyboardNotes||24;
 const target=clamp(Math.round(Number(midi)||60),24,107);
 return clamp(Math.floor((target-(count===24?11:0))/12)*12,24,108-count);
}
function focusVibratoReference(){
 app.vibratoSamples=[];app.vibratoLast=null;app.vibratoSummary=null;app.vibratoValidMs=0;app.vibratoValidUntil=0;app.vibratoProgress=0;
 const next=targetKeyboardBase(app.vibratoRoot);
 if(app.base!==next){
  allKeysOff();app.base=next;drawKeys();
 }else syncKeyColors();
 setMessage('기준음 '+noteLabel(app.vibratoRoot)+' (민트색 건반)');
 renderVibratoOverlay(performance.now(),true);
}
function drawKeys(){
 const kb=$('keyboard');kb.replaceChildren();
 const count=app.keyboardNotes||24,w=100/(count/12*7);
 for(let i=0;i<count;i++){
   const m=app.base+i,oct=Math.floor(i/12),step=i%12;
   if(BLACK.has(step))continue;
   const whiteIndex=oct*7+[0,2,4,5,7,9,11].indexOf(step);
   const key=document.createElement('div');
   key.className='white-key';key.dataset.midi=m;key.style.left=(whiteIndex*w)+'%';key.style.width=w+'%';
   const label=document.createElement('span');label.className='key-label';
   label.classList.add('two-line-key-label');
   const west=document.createElement('span');west.className='key-note-west';west.textContent=name(m);
   const korean=document.createElement('span');korean.className='key-note-korean';korean.textContent=koname(m);
   label.append(west,korean);
   key.setAttribute('aria-label',noteLabel(m));
   key.setAttribute('role','button');key.tabIndex=0;
   key.append(label);kb.append(key);
 }
 for(let i=0;i<count;i++){
   const m=app.base+i,step=i%12,oct=Math.floor(i/12);
   if(!BLACK.has(step))continue;
   const prior=[1,3,6,8,10].indexOf(step);
   const whiteBefore=oct*7+[0,1,3,4,5][prior];
   const bw=w*.59,key=document.createElement('div');
   key.className='black-key';key.dataset.midi=m;
   key.style.left=((whiteBefore+1)*w-bw/2)+'%';key.style.width=bw+'%';
   const label=document.createElement('span');label.className='key-label two-line-key-label';
   const west=document.createElement('span');west.className='key-note-west';west.textContent=name(m).replace('♯','#');
   const korean=document.createElement('span');korean.className='key-note-korean';korean.textContent=koname(m).replace('♯','#');
   label.append(west,korean);
   key.setAttribute('aria-label',noteLabel(m));
   key.setAttribute('role','button');key.tabIndex=0;
   key.append(label);kb.append(key);
 }
 $('octaveLabel').textContent=koname(app.base)+' – '+koname(app.base+count-1);
 $('octaveLabel').title=noteLabel(app.base)+' ~ '+noteLabel(app.base+count-1);
 syncKeyColors();
 if(window.VoiceLineToneEngine)updateToneEngineStatus();else preloadAcousticPiano(app.base);
}
function syncKeyColors(){
 const detected=app.detected===null?null:Math.round(app.detected);
 const target=app.exercise?.active?app.exercise.target:app.training?.active?app.training.target:app.mode==='vibrato'?app.vibratoRoot:null;
 for(const key of $all('#keyboard [data-midi]')){
   const m=Number(key.dataset.midi);
   key.classList.toggle('pressed',app.owners.has(m));
   key.setAttribute('aria-pressed',String(app.owners.has(m)));
   key.classList.toggle('detected',app.mic&&detected===m);
   key.classList.toggle('target',target===m);
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

// The offline Salamander MP3 samples are shared with the primary piano engine.
// Attribution is included in vendor/salamander/CREDITS.json.
const acoustic={buffers:new Map(),peaks:new Map(),pending:new Map(),failed:new Set(),preloadEpoch:0};
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
function calibratedPianoGain(anchor){
 return SOFT_PIANO.peakGain*clamp(0.18/(acoustic.peaks.get(anchor)||0.18),0.7,5);
}
const activePianoVoices=new Set();
function nearestAcousticMidi(midi){
 return clamp(24+3*Math.round((clamp(midi,24,107)-24)/3),24,105);
}
function acousticFilename(midi){
 const keys=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
 return keys[midi%12]+(Math.floor(midi/12)-1)+'v8.mp3';
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
     const address='./vendor/salamander/'+acousticFilename(anchor);
     const response=await fetch(address);
     if(!response.ok)throw Error('Bundled piano sample '+anchor+' missing: '+response.status);
     const bytes=await response.arrayBuffer();
     const ac=ensureSynth();
     if(!ac)throw Error('AudioContext not supported');
     const buffer=await ac.decodeAudioData(bytes);
     if(!buffer||buffer.duration<0.1)throw Error('Empty piano recording '+anchor);
     conditionAcousticBuffer(buffer);let peak=0;
     for(let ch=0;ch<buffer.numberOfChannels;ch++)for(const sample of buffer.getChannelData(ch))peak=Math.max(peak,Math.abs(sample));
     acoustic.peaks.set(anchor,peak);acoustic.buffers.set(anchor,buffer);
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
 const ready=window.VoiceLineToneEngine.ready,status=window.VoiceLineToneEngine.status;
 badge.textContent=ready?'● 그랜드 피아노 준비됨':status==='error'?'기본 음색 사용 · 음원 오류':'기본 음색 사용 · 그랜드 준비 중';
 const retry=$('pianoRetry');if(retry)retry.hidden=status!=='error';
 badge.classList.toggle('ready',ready);
}
window.addEventListener('voiceline-piano-status',updateToneEngineStatus);
$('pianoRetry')?.addEventListener('click',()=>{
 const engine=window.VoiceLineToneEngine;if(!engine)return;
 engine.unlock().catch(()=>{});engine.load().then(updateToneEngineStatus).catch(updateToneEngineStatus);
});
function updateAcousticStatus(anchors=null){
 if(window.VoiceLineToneEngine){updateToneEngineStatus();return;}
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
    const db=pianoVolumeDb(app.pianoVolume);
    master.gain.setValueAtTime(app.pianoVolume===0?0:SOFT_PIANO.master*Math.pow(10,(db+11)/20),ac.currentTime);
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
function soundOn(m,pressure=0.7){
 if(app.playing.has(m))return;
 if(window.VoiceLineToneEngine?.ready&&window.VoiceLineToneEngine.status!=='error'){
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
function releaseHeldKeys(){
 for(const m of [...app.playing.keys()])soundOff(m);
 app.owners.clear();syncKeyColors();
}
function allKeysOff(){
 releaseHeldKeys();window.VoiceLineToneEngine?.stopAll?.();
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
kb.addEventListener('keydown',e=>{
 if(!['Enter',' '].includes(e.key))return;
 const key=e.target.closest?.('#keyboard [data-midi]');if(!key)return;
 e.preventDefault();if(!e.repeat)pointerChange('keyboard',Number(key.dataset.midi));
});
kb.addEventListener('keyup',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();pointerChange('keyboard',null);}});
kb.addEventListener('focusout',()=>pointerChange('keyboard',null));
window.addEventListener('blur',allKeysOff);
$('octaveDown').addEventListener('click',()=>{app.base=clamp(app.base-12,24,108-(app.keyboardNotes||24));allKeysOff();drawKeys();});
$('octaveUp').addEventListener('click',()=>{app.base=clamp(app.base+12,24,108-(app.keyboardNotes||24));allKeysOff();drawKeys();});
// Convert 44.1kHz microphone input to 22.05kHz before estimating periodicity.
// The original 768-sample window only covered 17ms of sound; sustained lower
// notes and breathier voices could intermittently fail, although audio recorded.
function pitchYin(s,sr,recording=false,sensitivity='sensitive'){
 if(!s||s.length<1024||!Number.isFinite(sr)||sr<=0)return null;
 if(sr>=32000&&s.length>=2048){
  const half=new Float32Array(Math.floor(s.length/2));
  for(let i=0;i<half.length;i++){
   const j=i*2;
   half[i]=(s[j]+s[j+1])*.5;
  }
  s=half;sr/=2;
 }
 let sum=0,count=0;
 for(let i=0;i<s.length;i+=2){sum+=s[i]*s[i];count++;}
 const rms=Math.sqrt(sum/count);
 // Sensitivity changes only the minimum input level, never the recorded PCM
 // or periodicity/confidence rules that reject unvoiced noise.
 const profile=Object.prototype.hasOwnProperty.call(MIC_SENSITIVITIES,sensitivity)
  ?MIC_SENSITIVITIES[sensitivity]:MIC_SENSITIVITIES.sensitive;
 if(!Number.isFinite(rms)||rms<(recording?profile.recordMinRms:profile.minRms))return null;
 const lo=Math.max(2,Math.floor(sr/PITCH_RANGE.maxHz));
 const hi=Math.min(Math.floor(sr/PITCH_RANGE.minHz),Math.floor(s.length/2)-2);
 const win=Math.min(1024,s.length-hi-1);
 if(win<256||hi<=lo)return null;
 const a=new Float32Array(hi+1);
 for(let tau=1;tau<=hi;tau++){
  let diff=0;
  for(let j=0;j<win;j++){
   const v=s[j]-s[j+tau];diff+=v*v;
  }
  a[tau]=diff;
 }
 let running=0,best=-1,minValue=1,minIndex=-1;
 for(let tau=1;tau<=hi;tau++){
  running+=a[tau];a[tau]=running>0?a[tau]*tau/running:1;
  if(tau>=lo&&a[tau]<minValue){minValue=a[tau];minIndex=tau;}
 }
 const threshold=recording?.18:.15;
 for(let tau=lo;tau<hi;tau++){
  if(a[tau]<threshold){
   while(tau+1<hi&&a[tau+1]<a[tau])tau++;
   best=tau;break;
  }
 }
 if(best<0){if(minValue>(recording?.29:.21))return null;best=minIndex;}
 if(best<=1||best>=hi)return null;
 const l=a[best-1],c=a[best],r=a[best+1],den=l-2*c+r;
 const shift=Math.abs(den)>1e-9?clamp((l-r)/(2*den),-1,1):0;
 const hz=sr/(best+shift);
 if(!Number.isFinite(hz)||hz<PITCH_RANGE.minHz||hz>PITCH_RANGE.maxHz||c>(recording?.30:.24))return null;
 return {hz,rms,confidence:Math.max(0,1-c)};
}
function microphoneSignalRms(samples){
 if(!samples||!samples.length)return 0;
 let power=0,n=0;
 for(let i=0;i<samples.length;i+=8){power+=samples[i]*samples[i];n++;}
 return n?Math.sqrt(power/n):0;
}
function updateDetection(t,nativeSamples=null,nativeRate=0){
 if(!nativeSamples&&(!app.analyser||!app.micCtx))return;
 if(!nativeSamples)app.analyser.getFloatTimeDomainData(app.buffer);
 const sound=nativeSamples||app.buffer;
 const rms=microphoneSignalRms(sound);
 if(app.mode==='record'&&app.record)app.recordSignalRms=microphoneSignalRms(sound);
 const p=nativeSamples?pitchYin(nativeSamples,nativeRate,app.mode==='record',app.micSensitivity):
   pitchYin(app.buffer,app.micCtx.sampleRate,app.mode==='record',app.micSensitivity);
 if(!p){
  if(app.mode==='piano'||app.mode==='pitch')rememberPitchGraphPoint(t,null);
  if(app.exercise?.active)receiveExerciseSample(t,null);
  if(app.training?.active)receiveTrainingSample(t,null,rms);
  if(app.mode==='vibrato'){rememberVibratoPoint(t,null);renderVibratoOverlay(t);}
  if(app.mode==='record'&&app.record){rememberRecordPitchPoint(t,null);rememberFullRecordingPitch(t,null);renderRecordPitchOverlay(t);}
  app.detected=null;app.notes=[];
  if(app.mode==='pitch'||app.mode==='record'){$('noteHint').textContent='소리를 감지하는 중…';clearNote();}
  syncKeyColors();return;
 }
 let midi=69+12*Math.log2(p.hz/440);
 const rawVibratoMidi=midi;
 // Acoustic piano playback from the device speaker is not separable from singing.
 // Sudden octave errors are rejected for graph/scoring, not applied as a voiced note.
 if(app.lastTrustedPitchAt&&t-app.lastTrustedPitchAt<(app.mode==='record'?150:220)&&
    Math.abs(midi-app.lastTrustedPitch)>13&&
    (app.mode!=='record'||p.confidence<.86)){
  if(app.mode==='piano'||app.mode==='pitch')rememberPitchGraphPoint(t,null);
  if(app.training?.active)receiveTrainingSample(t,null,rms);
  if(app.exercise?.active)receiveExerciseSample(t,null);
  if(app.mode==='record'&&app.record){
   rememberRecordPitchPoint(t,null);rememberFullRecordingPitch(t,null);
   renderRecordPitchOverlay(t);
  }
  return;
 }
 app.lastTrustedPitch=midi;app.lastTrustedPitchAt=t;
 if(app.notes.length&&Math.abs(midi-app.notes[app.notes.length-1])>3)app.notes=[];
 app.notes.push(midi);if(app.notes.length>3)app.notes.shift();
 const sorted=[...app.notes].sort((a,b)=>a-b);midi=sorted[Math.floor(sorted.length/2)];
 app.detected=midi;app.sessionSamples++;
 // Follow the measured range without moving keys under a held finger.
 if(app.mode!=='vibrato'&&!app.exercise?.active&&!app.training?.active&&app.owners.size===0&&(midi<app.base || midi>=app.base+(app.keyboardNotes||24))){
  const next=app.keyboardNotes===12?targetKeyboardBase(midi):clamp((Math.floor(midi/12)-1)*12,24,84);
  if(next!==app.base){app.base=next;drawKeys();}
 }
 app.sessionLow=Math.min(app.sessionLow??midi,midi);
 app.sessionHigh=Math.max(app.sessionHigh??midi,midi);
 $('noteHint').textContent='실시간 음정';
 showNote(midi,p.hz,(midi-Math.round(midi))*100);
 if(app.mode==='piano'||app.mode==='pitch')rememberPitchGraphPoint(t,midi);
 if(app.mode==='vibrato'){
  // Use unsmoothed pitch for vibrato depth; the 3-frame median above is for
  // stable note names and would otherwise flatten fast vocal oscillations.
  rememberVibratoPoint(t,Math.abs(rawVibratoMidi-app.vibratoRoot)<=1.5?rawVibratoMidi:null);
  if(app.vibratoStart)vibratoStatus();
  renderVibratoOverlay(t);
 }
 if(app.mode==='record'&&app.record){
  rememberRecordPitchPoint(t,midi);
  rememberFullRecordingPitch(t,midi);
  if(app.recordPitchLow===null||midi<app.recordPitchLow)app.recordPitchLow=midi;
  if(app.recordPitchHigh===null||midi>app.recordPitchHigh)app.recordPitchHigh=midi;
  if(app.record?.type==='native'){app.record.pitchLow=app.recordPitchLow;app.record.pitchHigh=app.recordPitchHigh;}
  renderRecordPitchOverlay(t);
 }
 if(app.training?.active)receiveTrainingSample(t,midi,rms);
 if(app.mode==='practice'&&app.exercise?.active)receiveExerciseSample(t,midi);
 syncKeyColors();
}
// For the Android-only APK, use AudioRecord directly instead of relying on WebView getUserMedia.
// This also avoids a WebView second-stage permission denial on some device versions.
function micRequestCurrent(token){
 return token===app.micGeneration&&!app.backgrounded&&!document.hidden&&!app.lifeStopping;
}
function requestNativeStop(requestId){
 if(requestId===null||requestId===undefined)return;
 try{window.VoiceLineNative?.stop?.(String(requestId));}catch(e){console.warn('Native mic stop',e);}
}
window.VoiceLineNativeAudio = {
 onState(state,detail,requestId,sampleRate){
   const token=Number(requestId);
   const current=String(requestId)===app.nativeRequestId&&micRequestCurrent(token);
   if(!current){if(state==='started')requestNativeStop(requestId);return;}
   if(state==='permission'){micStatus('마이크 권한 요청 중…');return;}
   if(state==='started'){
     if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>96000){
       completeNativeStart(false);void stopAfterMicError('입력 속도를 확인할 수 없습니다. 다시 연결해 주세요.');return;
     }
     app.nativeSampleRate=sampleRate;app.nativeClockStart=performance.now();
     app.nativeMic=true;app.mic=true;app.micError='';
     app.lastAnalyze=0;app.lastTrustedPitchAt=0;app.notes=[];
     app.sessionStart=performance.now();app.sessionLow=null;app.sessionHigh=null;app.sessionSamples=0;app.sessionMode=app.mode;
     micStatus('● 마이크 켜짐 (Android)');
     if(!app.frame)app.frame=requestAnimationFrame(tick);
     completeNativeStart(true);
   }else if(state==='denied'||state==='error'||state==='cancelled'){
     completeNativeStart(false);
     if(state==='cancelled'){void stopActivity('background').finally(resetMainAction);return;}
     app.micError=state+': '+detail;
     void stopAfterMicError(detail||'마이크를 연결할 수 없습니다.');
   }
 },
 onRecordingFinished(requestId,recordingId,info,error){
   const pending=app.nativeFinish;
   if(!pending||pending.requestId!==String(requestId)||pending.recordingId!==recordingId)return;
   clearTimeout(pending.timer);app.nativeFinish=null;
   if(error||info?.error)pending.reject(new Error(error||info.error));else pending.resolve(info);
 },
 onAudioChunk(encoded,sampleRate,requestId,frameStart){
   if(!app.mic||!app.nativeMic||String(requestId)!==app.nativeRequestId)return;
   if(sampleRate!==app.nativeSampleRate){void stopAfterMicError('마이크 입력 속도가 변경되었습니다. 다시 연결해 주세요.');return;}
   try{
     const bytes=atob(encoded),samples=new Float32Array(Math.floor(bytes.length/2));
     for(let i=0;i<samples.length;i++){
       let v=bytes.charCodeAt(i*2)|(bytes.charCodeAt(i*2+1)<<8);
       if(v>=32768)v-=65536;
       samples[i]=v/32768;
     }
     if(app.record?.type==='native')queueNativePcm(app.record,bytes);
     const captured=Number.isSafeInteger(frameStart)&&frameStart>=0;
     const t=captured?(app.nativeClockStart??app.sessionStart)+(frameStart+samples.length/2)*1000/sampleRate:performance.now();
     if(app.record?.type==='native-file'&&captured&&frameStart<app.record.startFrame)return;
     if(app.record?.type==='native-file')app.recordCaptureMs=captured?(frameStart+samples.length/2-app.record.startFrame)*1000/sampleRate:null;
     const cadence=app.mode==='vibrato'?35:40;
     if(t-app.lastAnalyze>cadence){updateDetection(t,samples,sampleRate);app.lastAnalyze=t;}
   }catch(e){console.error('Native audio input',e);void stopAfterMicError('마이크 입력을 읽을 수 없습니다.');}
 }
};
function completeNativeStart(ok){
 const cb=app.nativeStartResolve;app.nativeStartResolve=null;
 if(app.nativeStartTimeout)clearTimeout(app.nativeStartTimeout);
 app.nativeStartTimeout=0;if(cb)cb(ok);
}
function cancelMicStart(){
 const oldRequest=app.nativeRequestId;
 app.micGeneration++;app.nativeRequestId=null;
 const cancel=app.micCancelResolve;app.micCancelResolve=null;
 completeNativeStart(false);if(cancel)cancel(false);
 requestNativeStop(oldRequest);
}
async function startNativeMic(token){
 return new Promise(resolve=>{
   app.nativeRequestId=String(token);app.nativeSampleRate=0;
   app.nativeStartResolve=resolve;
   app.nativeStartTimeout=setTimeout(()=>{
     if(String(token)!==app.nativeRequestId)return;
     app.micError='Android microphone startup timed out';cancelMicStart();
     micStatus('마이크 연결 시간 초과');notify('마이크가 응답하지 않습니다. 권한을 확인한 후 다시 시작하세요.');
   },12000);
   micStatus('안드로이드 마이크 연결 중…');
   try{window.VoiceLineNative.start(String(token));}
   catch(e){app.micError=String(e);cancelMicStart();micStatus('마이크 연결 실패');notify('마이크를 연결할 수 없습니다.');}
 });
}
async function startWebMic(token){
 if(!navigator.mediaDevices?.getUserMedia||!audioCtor){notify('마이크를 사용할 수 없습니다. 앱 권한 또는 HTTPS 환경을 확인하세요.');return false;}
 micStatus('마이크 권한 요청 중');
 let stream=null,ac=null;
 try{
  try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});}
  catch(e){if(['OverconstrainedError','TypeError','NotSupportedError'].includes(e.name))stream=await navigator.mediaDevices.getUserMedia({audio:true});else throw e;}
  if(!micRequestCurrent(token)){stream.getTracks().forEach(t=>t.stop());return false;}
  ac=new audioCtor();await ac.resume();
  if(!micRequestCurrent(token)){stream.getTracks().forEach(t=>t.stop());await ac.close();return false;}
  const source=ac.createMediaStreamSource(stream),analyser=ac.createAnalyser();
  analyser.fftSize=4096;analyser.smoothingTimeConstant=0;source.connect(analyser);
  app.stream=stream;app.micCtx=ac;app.source=source;app.analyser=analyser;app.buffer=new Float32Array(4096);
  app.mic=true;app.lastAnalyze=0;app.lastTrustedPitchAt=0;app.notes=[];app.sessionStart=performance.now();
  app.sessionLow=null;app.sessionHigh=null;app.sessionSamples=0;app.sessionMode=app.mode;
  micStatus('● 마이크 켜짐');
  stream.getTracks().forEach(track=>track.addEventListener('ended',()=>{
    if(app.mic&&app.stream===stream)void stopAfterMicError('마이크 연결이 종료되었습니다.');
  }));
  if(!app.frame)app.frame=requestAnimationFrame(tick);
  return true;
 }catch(e){
  if(stream)stream.getTracks().forEach(t=>t.stop());
  if(ac)ac.close().catch(()=>{});
  if(!micRequestCurrent(token))return false;
  app.micError=(e?.name||'Error')+': '+(e?.message||'unknown');micStatus('마이크 연결 실패');
  notify(e?.name==='NotAllowedError'?'마이크 권한이 차단되었습니다. 기기 설정에서 허용해 주세요.':'마이크를 열 수 없습니다. 다른 앱의 마이크 사용 여부를 확인하세요.');
  return false;
 }
}
async function startMic(){
 if(app.mic)return true;
 if(app.micStartPromise)return app.micStartPromise;
 if(app.backgrounded||document.hidden||app.lifeStopping)return false;
 const token=++app.micGeneration;
 const cancelled=new Promise(resolve=>{app.micCancelResolve=resolve;});
 const task=Promise.race([window.VoiceLineNative?.start?startNativeMic(token):startWebMic(token),cancelled]);
 app.micStartPromise=task;
 const main=$('mainButton'),before=main?.textContent;
 if(main){main.textContent='연결 취소';main.disabled=false;}
 $('stopButton').hidden=true;updateMicToggle();
 try{
  const ok=Boolean(await task)&&micRequestCurrent(token)&&app.mic;
  if(ok&&(app.mode==='piano'||app.mode==='pitch'))resetPitchGraph(performance.now());
  return ok;
 }
 finally{
  if(app.micStartPromise===task){app.micStartPromise=null;app.micCancelResolve=null;}
  if(main?.textContent==='연결 취소')main.textContent=before;
  $('stopButton').textContent='종료';$('stopButton').hidden=true;
  updateMicToggle();
 }
}
function stopMic(){
 cancelMicStart();app.mic=false;app.nativeMic=false;app.nativeSampleRate=0;app.sessionMode=null;
 cancelAnimationFrame(app.frame);app.frame=0;
 app.stream?.getTracks().forEach(t=>t.stop());
 try{app.source?.disconnect();app.analyser?.disconnect();}catch(_){}
 app.micCtx?.close().catch(()=>{});
 app.stream=null;app.source=null;app.analyser=null;app.micCtx=null;app.buffer=null;
 app.detected=null;app.notes=[];micStatus('마이크 꺼짐');syncKeyColors();
 if(app.mode==='piano'||app.mode==='pitch'){app.pitchGraphFrozenAt=performance.now();renderPitchGraphOverlay(app.pitchGraphFrozenAt,true);}
}
async function stopAfterMicError(detail){
 app.micError=String(detail||'마이크 오류');
 try{await stopActivity('error');}
 finally{stopMic();resetMainAction();clearNote();setMessage('마이크 입력 중단 · 다시 시작해 주세요.');notify(app.micError);}
}
function tick(t){
 if(app.mode==='record'&&t-(app.lastStorageCheck||0)>15000)void updateRecordingStorage();
 if(!app.mic&&!app.training?.active){app.frame=0;return;}
 if(app.mic&&!app.nativeMic&&t-app.lastAnalyze>(app.mode==='vibrato'?35:40)){updateDetection(t);app.lastAnalyze=t;}
 if(app.exercise?.active)updateExercise(t);
 if(app.training?.active)updateTraining(t);
 if(app.mode==='vibrato'){
  if(app.vibratoStart)vibratoStatus();
  renderVibratoOverlay(t);
  if(app.vibratoStart)progress(clamp(app.vibratoProgress/4,0,1),'주기 '+app.vibratoProgress+'/4 · '+Math.floor((t-app.vibratoStart)/1000)+'초');
 }
 if(app.mode==='record')renderRecordPitchOverlay(t);
 if(app.mode==='piano'||app.mode==='pitch')renderPitchGraphOverlay(t);
 if(app.record)progress(1,'녹음 '+recordTime(t-app.recordStart)+' · 한 파일');
 if(app.mic||app.training?.active)app.frame=requestAnimationFrame(tick);else app.frame=0;
}
// The graph is in musical cents, NOT waveform amplitude. Show the actual
// detected pitch relative to the selected note, preserving natural variation.
const VIBRATO_WINDOW_MS=3000;
function analyzeVibrato(samples,referenceMidi){
 // A null/out-of-range point or a long gap breaks continuity.
 const runs=[];let run=[];
 for(const point of [...samples].sort((a,b)=>a.t-b.t)){
  if(!Number.isFinite(point.midi)||Math.abs(point.midi-referenceMidi)>1.5){if(run.length)runs.push(run);run=[];continue;}
  if(run.length&&(point.t-run[run.length-1].t>160||point.t<=run[run.length-1].t)){runs.push(run);run=[];}
  run.push(point);
 }
 if(run.length)runs.push(run);
 const valid=runs[runs.length-1]||[];
 if(valid.length<16 || valid[valid.length-1].t-valid[0].t<900)return null;
 const values=valid.map(s=>s.midi).sort((a,b)=>a-b);
 const percentile=p=>{
  const k=(values.length-1)*p,i=Math.floor(k),f=k-i;
  return values[i]+(values[Math.min(i+1,values.length-1)]-values[i])*f;
 };
 const centerMidi=percentile(.5);
 const depthCents=(percentile(.90)-percentile(.10))*50; // robust half-span: avoids one-frame spikes
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
 for(let i=1;i<crossings.length;i++)intervals.push(crossings[i]-crossings[i-1]);
 let rate=null,regularity='측정 중',reliablePeriods=0,approxRate=null;
 const eligible=intervals.filter(d=>d>=105&&d<=550);
 if(eligible.length){
  const sorted=[...eligible].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
  approxRate=1000/median;
  let consecutive=[],longest=[];
  for(const period of intervals){
   if(period>=105&&period<=550&&Math.abs(period-median)<=median*.35)consecutive.push(period);
   else consecutive=[];
   if(consecutive.length>longest.length)longest=[...consecutive];
  }
  reliablePeriods=longest.length;
  if(longest.length>=4){
   const mean=longest.reduce((a,b)=>a+b,0)/longest.length;
   const variation=Math.sqrt(longest.reduce((a,b)=>a+(b-mean)**2,0)/longest.length)/mean;
   const estimate=1000/mean;
   if(estimate>=3&&estimate<=9&&depthCents>=7&&depthCents<=125){
    rate=estimate;regularity=variation<=.14?'일정':variation<=.28?'약간 변동':'불규칙';
   }
  }
 }
 return {centerMidi,centerOffsetCents,depthCents,rate,regularity,count:valid.length,
  periods:eligible.length,reliablePeriods,approxRate,validStart:valid[0].t,lastValidAt:valid[valid.length-1].t};
}
function describeVibratoProgress(samples,referenceMidi,data,micActive,now=null){
 if(!micActive)return {label:'마이크 꺼짐 · 비브라토 시작을 누르세요',cycles:0};
 const fresh=samples.filter(x=>Number.isFinite(x.midi));
 if(!fresh.length)return {label:'음정 감지 대기 · 길게 소리를 내보세요',cycles:0};
 const last=samples[samples.length-1],lastValid=fresh[fresh.length-1];
 if(last&&lastValid&&(Math.max(now??last.t,last.t)-lastValid.t>600))return {label:'음정 입력이 끊겼습니다 · 소리를 조금 더 안정적으로 내보세요',cycles:0};
 const valid=fresh.filter(x=>Math.abs(x.midi-referenceMidi)<=1.5);
 if(!valid.length)return {label:'선택한 기준음과 다릅니다 · '+noteLabel(referenceMidi)+' 근처로 불러보세요',cycles:0};
 if(!data)return {label:'기준음 감지됨 · 안정적인 음정 자료를 모으는 중 (약 1초)',cycles:0};
 if(data.depthCents<7)return {label:'흔들림 폭 부족 (현재 ±'+Math.round(data.depthCents)+'cent · 최소 ±7cent)',cycles:0};
 if(data.depthCents>125)return {label:'흔들림 폭이 큽니다 (±'+Math.round(data.depthCents)+'cent)',cycles:0};
 if(data.rate!==null)return {label:'측정 완료 · '+data.rate.toFixed(1)+'Hz · ±'+Math.round(data.depthCents)+'cent',cycles:4};
 const counted=Math.min(4,data.reliablePeriods||0);
 if(data.approxRate!==null&&(data.approxRate<3||data.approxRate>9)){
  return {label:'반복 속도가 3~9Hz 범위를 벗어납니다',cycles:counted};
 }
 if((data.periods||0)>=4&&(data.reliablePeriods||0)<4)
  return {label:'비브라토가 불규칙합니다 · 유효 주기 '+counted+'/4',cycles:counted};
 return {label:'흔들림 주기를 확인 중 · '+counted+'/4 (최근 3초)',cycles:counted};
}
function rememberVibratoPoint(t,midi){
 const points=app.vibratoSamples;
 points.push({t,midi:Number.isFinite(midi)?midi:null});
 while(points.length && t-points[0].t>VIBRATO_WINDOW_MS+200)points.shift();
}
function vibratoStatus(){
 const now=performance.now(),result=analyzeVibrato(app.vibratoSamples,app.vibratoRoot);
 if(app.vibratoLast&&now-app.vibratoLast.measuredAt>1000)app.vibratoLast=null;
 if(!app.vibratoStart)return;
 if(result?.rate!==null&&result&&now-result.lastValidAt<=600){
  const from=Math.max(result.validStart,app.vibratoValidUntil||result.validStart);
  app.vibratoValidMs=(app.vibratoValidMs||0)+Math.max(0,result.lastValidAt-from);
  app.vibratoValidUntil=result.lastValidAt;
  app.vibratoLast={rate:result.rate,depth:result.depthCents,measuredAt:result.lastValidAt};
  app.vibratoSummary=app.vibratoLast;
  setMessage('비브라토 '+result.rate.toFixed(1)+' Hz · 진폭 ±'+Math.round(result.depthCents)+' cent (추정)');
 }else setMessage(app.vibratoLast?'연속된 음정을 다시 측정하는 중입니다.':'최근 유효 측정 없음 · 음정을 유지해 주세요.');
}
// Recording mode uses a musical-pitch (notes/semitones) graph rather than a
// raw microphone amplitude waveform. Six seconds are kept in memory; a ten
// minute recording does not allocate an unbounded array of pitch points.
const RECORD_PITCH_WINDOW_MS=6000;
const RECORD_PITCH_BRIDGE_MS=360; // only join brief pitch-detector dropouts
function traceRecordingPitch(ctx,points,xFor,yFor,solidGap=200,allowBridge=true){
 // Actual notes are drawn solid. A brief missing-pitch span is represented
 // by a faint DASHED bridge, not saved as a detected note. True silence and
 // longer uncertain passages remain blank.
 let prev=null,missing=false,solid=0,estimated=0;
 for(const point of points){
  if(!Number.isFinite(point.midi)){missing=true;continue;}
  if(prev){
   const gap=point.t-prev.t;
   const steady=gap<=solidGap&&!missing;
   const bridge=allowBridge&&!steady&&gap<=RECORD_PITCH_BRIDGE_MS&&Math.abs(point.midi-prev.midi)<=5;
   if(steady||bridge){
    ctx.beginPath();ctx.moveTo(xFor(prev),yFor(prev.midi));ctx.lineTo(xFor(point),yFor(point.midi));
    ctx.lineWidth=bridge?1.5:2.5;
    ctx.strokeStyle=bridge?'rgba(212,166,255,.46)':'#d4a6ff';
    ctx.setLineDash(bridge?[3,5]:[]);ctx.stroke();
    if(bridge)estimated++;else solid++;
   }
  }
  prev=point;missing=false;
 }
 ctx.setLineDash([]);
 return {solid,estimated};
}
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
 return {low:Math.max(24,Math.floor(center-Math.max(3,(high-low)/2))),
         high:Math.min(107,Math.ceil(center+Math.max(3,(high-low)/2)))};
}
function syncRecordPitchOverlay(){
 const el=$('recordPitchOverlay');if(!el)return;
 el.hidden=app.mode!=='record';
 if(!el.hidden)renderRecordPitchOverlay(performance.now(),true);
}
function drawLivePitchGraph(canvas,samples,viewEnd,{bridgeGaps=true,allNotes=false,referenceMidi=null}={}){
 const rect=canvas.getBoundingClientRect();
 if(rect.width<15||rect.height<15)return;
 const w=rect.width,h=rect.height,dpr=Math.min(window.devicePixelRatio||1,2);
 const dw=Math.round(w*dpr),dh=Math.round(h*dpr);
 if(canvas.width!==dw||canvas.height!==dh){canvas.width=dw;canvas.height=dh;}
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const left=66,right=w-8,top=8,bottom=h-15;
 if(right<=left||bottom<=top)return;
 const first=viewEnd-RECORD_PITCH_WINDOW_MS;
 const points=samples.filter(p=>p.t>=first&&p.t<=viewEnd+50);
 const targets=points.filter(p=>Number.isFinite(p.target)).map(p=>({midi:p.target}));
 if(Number.isFinite(referenceMidi))targets.push({midi:referenceMidi});
 const range=recordPitchBounds(points.concat(targets));
 const yFor=midi=>bottom-clamp((midi-range.low)/(range.high-range.low),0,1)*(bottom-top);
 const xFor=p=>left+clamp((p.t-first)/RECORD_PITCH_WINDOW_MS,0,1)*(right-left);
 // Draw note grid with named C keys and a subdued semitone background.
 const step=allNotes?Math.max(1,Math.ceil((range.high-range.low)/Math.max(1,Math.min(4,Math.floor((bottom-top)/22))))):12;
 const lowGrid=Math.ceil(range.low/step)*step;
 ctx.font='9px system-ui,sans-serif';ctx.lineWidth=1;
 ctx.textAlign='right';
 for(let m=lowGrid;m<=range.high;m+=step){
   const y=yFor(m);
   ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);
   ctx.strokeStyle='rgba(107,238,208,.43)';ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([]);
   ctx.fillStyle='#b4ecd9';ctx.fillText(noteLabel(m),left-5,Math.max(9,Math.min(h-2,y+3)),left-10);
 }
 ctx.textAlign='left';ctx.fillStyle='#b8bcd4';ctx.fillText('−6초',left,bottom+12);
 ctx.textAlign='right';ctx.fillText('현재',right,bottom+12);
 // The mint step line records the actual goal at each capture time. Pauses
 // break the goal line, just as silence breaks the purple voice trace.
 let previous=null;
 ctx.strokeStyle='#69ecd0';ctx.lineWidth=5;ctx.setLineDash([]);
 for(const point of points){
  if(!Number.isFinite(point.target)){previous=null;continue;}
  if(previous&&point.t-previous.t<=200){
   ctx.beginPath();ctx.moveTo(xFor(previous),yFor(previous.target));
   ctx.lineTo(xFor(point),yFor(previous.target));ctx.lineTo(xFor(point),yFor(point.target));ctx.stroke();
  }
  previous=point;
 }
 if(Number.isFinite(referenceMidi)&&!points.some(p=>Number.isFinite(p.target))){
  ctx.beginPath();ctx.moveTo(left,yFor(referenceMidi));ctx.lineTo(right,yFor(referenceMidi));
  ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);
 }
 traceRecordingPitch(ctx,points,xFor,yFor,200,bridgeGaps);
 return {points,ctx,w,h,left,right,top,bottom};
}
function renderRecordPitchOverlay(now=performance.now(),force=false){
 const el=$('recordPitchOverlay');if(!el||el.hidden||app.mode!=='record')return;
 if(!force&&now-app.recordPitchLast<80)return;
 app.recordPitchLast=now;
 const graph=drawLivePitchGraph($('recordPitchGraph'),app.recordPitchSamples,app.recordPitchFrozenAt??now);
 if(!graph)return;
 const {points}=graph;
 const latest=app.record&&points.length?[...points].reverse().find(p=>Number.isFinite(p.midi)):null;
 const fresh=latest&&now-latest.t<350;
 $('recordCurrentPitch').textContent=fresh?noteLabel(Math.round(latest.midi)):'—';
 $('recordCurrentHz').textContent=fresh?frequency(latest.midi).toFixed(1):'—';
 $('recordLowNote').textContent=Number.isFinite(app.recordPitchLow)?noteLabel(Math.round(app.recordPitchLow)):'—';
 $('recordHighNote').textContent=Number.isFinite(app.recordPitchHigh)?noteLabel(Math.round(app.recordPitchHigh)):'—';
 $('recordPitchWindow').textContent='최근 6초 · 음높이';
  const signal=app.recordSignalRms;
 $('recordPitchStatus').textContent=app.record?
  (fresh?'실시간 측정':signal>=.0028?'소리는 감지 · 음정 분석 중':'음정 대기'):
  app.recordPitchFrozenAt!==null?'녹음 종료':'녹음 시작 대기';
}
function resetPitchGraph(now=performance.now()){
 app.pitchGraphSamples=[];app.pitchGraphLast=0;app.pitchGraphFrozenAt=null;
 renderPitchGraphOverlay(now,true);
}
function rememberPitchGraphPoint(t,midi){
 if(!['piano','pitch'].includes(app.mode)||!app.mic||!Number.isFinite(t))return;
 const points=app.pitchGraphSamples;
 const point={t,midi:Number.isFinite(midi)?midi:null};
 if(app.mode==='practice'){
  const e=app.exercise,index=e?.active?Math.floor((t-e.start)/e.duration):-1;
  point.target=index>=0&&index<e.steps.length?e.steps[index]:null;
 }
 points.push(point);
 while(points.length&&t-points[0].t>RECORD_PITCH_WINDOW_MS+250)points.shift();
}
function syncPitchGraphOverlay(reset=false){
 const el=$('pitchGraphOverlay');if(!el)return;
 el.hidden=!['piano','pitch'].includes(app.mode);
 if(!el.hidden){if(reset)resetPitchGraph();else renderPitchGraphOverlay(performance.now(),true);}
}
function renderPitchGraphOverlay(now=performance.now(),force=false){
 const el=$('pitchGraphOverlay');if(!el||el.hidden||!['piano','pitch'].includes(app.mode))return;
 if(!force&&now-app.pitchGraphLast<40)return;
 app.pitchGraphLast=now;
 const practice=app.mode==='practice';
 $('pitchGraphTitle').textContent=practice?'음정 연습 · 목표와 내 목소리':'목소리 음높이 변화';
 $('pitchPracticeLegend').hidden=!practice;
 const target=practice?(app.exercise?.active?app.exercise.target:app.exerciseRoot):null;
 $('pitchGraphTarget').textContent=Number.isFinite(target)?'목표 '+noteLabel(target):'목표음 대기';
 const graph=drawLivePitchGraph($('pitchGraph'),app.pitchGraphSamples,app.pitchGraphFrozenAt??now,
  {bridgeGaps:false,allNotes:true,referenceMidi:practice&&!app.exercise?.active?app.exerciseRoot:null});
 if(!graph)return;
 const {points,ctx,left,right,top,bottom}=graph;
 const voiced=points.filter(p=>Number.isFinite(p.midi)),values=voiced.map(p=>p.midi);
 $('pitchGraphLow').textContent=values.length?noteLabel(Math.round(Math.min(...values))):'—';
 $('pitchGraphHigh').textContent=values.length?noteLabel(Math.round(Math.max(...values))):'—';
 const last=points[points.length-1],fresh=app.mic&&Number.isFinite(last?.midi)&&now-last.t<250;
 $('pitchGraphStatus').textContent=app.mic?(fresh?'실시간 측정 · 최근 6초':practice?'목표를 따라 불러보세요 · 최근 6초':'음정 대기 · 최근 6초'):app.pitchGraphFrozenAt!==null?'측정 종료 · 다시 시작하면 새 측정':practice?'연습 시작을 누르세요':'마이크를 켜세요';
 if(!voiced.length){ctx.textAlign='center';ctx.fillStyle='#d2cce8';ctx.font='11px system-ui';ctx.fillText(practice?'민트색 목표와 보라색 목소리를 비교하세요':app.mic?'한 음을 편안하게 불러보세요':'마이크를 켜면 음정이 표시됩니다',(left+right)/2,(top+bottom)/2,Math.max(1,right-left-12));}
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
 const estimate=analyzeVibrato(app.vibratoSamples,app.vibratoRoot);
 const data=estimate&&now-estimate.lastValidAt<=600?estimate:null;
 const feedback=describeVibratoProgress(app.vibratoSamples,app.vibratoRoot,data,app.mic,now);
 app.vibratoProgress=feedback.cycles;
 const hint=$('vibratoFeedback');if(hint)hint.textContent=feedback.label;
 $('vibratoTargetLabel').textContent='기준음 '+noteLabel(app.vibratoRoot)+' · 최근 3초';
 $('vibratoCenter').textContent=data?(data.centerOffsetCents>0?'+':'')+Math.round(data.centerOffsetCents)+' ¢':'—';
 $('vibratoDepth').textContent=data?'±'+Math.round(data.depthCents)+' ¢':'—';
 $('vibratoRate').textContent=data?.rate!==null&&data?' '+data.rate.toFixed(1)+' Hz':'—';
 $('vibratoRegularity').textContent=data?.regularity||'측정 중';
 $('vibratoGraphStatus').textContent=feedback.label;
}
// Keep pattern configurations data-driven to avoid duplicated option/step rules.
const EXERCISE_PATTERNS=Object.freeze({
 scale:{label:'도레미 왕복',steps:[0,2,4,5,7,5,4,2,0]},
 triad:{label:'도미솔 왕복',steps:[0,4,7,4,0]},
 sustain:{label:'한 음 유지',steps:[0,0,0,0]},
 down:{label:'하행 음계',steps:[7,5,4,2,0]},
 scaleUp:{label:'상행 음계 (한 옥타브)',steps:[0,2,4,5,7,9,11,12]},
 pentatonic:{label:'5음 음계',steps:[0,2,4,7,9,7,4,2,0]},
 chromatic:{label:'반음계',steps:[0,1,2,3,4,3,2,1,0]},
 majorThird:{label:'3도 도약',steps:[0,4,2,5,4,7,5,9,7]},
 fifth:{label:'완전5도 왕복',steps:[0,7,0,7,0]},
 octave:{label:'옥타브 왕복',steps:[0,12,0,12,0]},
 arpeggio:{label:'한 옥타브 아르페지오',steps:[0,4,7,12,7,4,0]},
 minor:{label:'단음계 왕복',steps:[0,2,3,5,7,5,3,2,0]},
 returnToRoot:{label:'기준음으로 돌아오기',steps:[0,2,0,4,0,5,0,7,0]}
});
const EXERCISE_REPEAT_OPTIONS=[
 {value:1,label:'1회'},
 {value:2,label:'2회'},
 {value:3,label:'3회'},
 {value:5,label:'5회'},
 {value:0,label:'계속 반복'}
];
function savePracticeOptions(){
 try{localStorage.setItem('voiceline-practice-v1',JSON.stringify({
  pattern:app.exercisePattern,root:app.exerciseRoot,speed:app.exerciseSpeed,repeats:app.exerciseRepeats
 }));}catch(_){/* private mode or blocked storage: controls still work */}
}
function restorePracticeOptions(){
 try{
  const value=JSON.parse(localStorage.getItem('voiceline-practice-v1')||'null');
  if(!value||typeof value!=='object')return;
  if(Object.prototype.hasOwnProperty.call(EXERCISE_PATTERNS,value.pattern))app.exercisePattern=value.pattern;
  if(Number.isInteger(value.root)&&value.root>=PITCH_RANGE.minMidi&&value.root<=95)app.exerciseRoot=Math.min(value.root,PITCH_RANGE.maxMidi);
  if([2800,1800,1200].includes(value.speed))app.exerciseSpeed=value.speed;
  if([0,1,2,3,5].includes(value.repeats))app.exerciseRepeats=value.repeats;
 }catch(_){/* Ignore stale/corrupt saved preference */}
}
function lockPracticeControls(locked){
 for(const id of ['pattern','root','tempo','repeatCount']){
  const el=$(id);if(el)el.disabled=locked;
 }
}
function modeControls(){
 $('app').dataset.mode=app.mode;
 $('recordStorageInfo').hidden=app.mode!=='record';if(app.mode==='record')void updateRecordingStorage();
 const c=$('exerciseControls');c.replaceChildren();
 c.scrollLeft=0;
 if(app.mode==='practice'){
  renderGuideControls(c);
 } else if(TRAINING_MODES.has(app.mode)){
  renderTrainingControls(c);
 } else if(app.mode==='vibrato'){
  c.innerHTML='<label>연습 기준음 <select id="vroot"></select></label><button type="button" id="vibratoCriteriaBtn" class="vibrato-criteria-btn" aria-haspopup="dialog" aria-controls="infoDialog">ⓘ 측정 기준</button><span class="control-note vibrato-criteria-short">최근 3초 · 3~9Hz · 진폭 ±7~125cent</span>';
  $('vibratoCriteriaBtn').addEventListener('click',showVibratoCriteria);
  fillNotes($('vroot'),app.vibratoRoot);
  $('vroot').onchange=e=>{
   const chosen=Number(e.target.value);
   if(!Number.isInteger(chosen)||chosen<PITCH_RANGE.minMidi||chosen>PITCH_RANGE.maxMidi)return;
   app.vibratoRoot=chosen;
   focusVibratoReference();
  };
 } else if(app.mode==='record'){
  c.innerHTML='<span class="control-note">시작부터 중지까지 한 파일 · 무음 포함</span><button type="button" id="recordList">녹음 기록 보기</button>';
  $('recordList').onclick=()=>showHistory('recordings');
 } else if(app.mode==='metronome'){
  c.innerHTML='<span class="control-note">마이크 없이 사용 · 기본 박자표 또는 직접 설정</span>';
 } else if(app.mode==='pitch'){
  c.innerHTML='<span class="control-note">편안하게 한 음을 길게 불러보세요. 보라색 건반이 움직입니다.</span>';
 } else{
  c.innerHTML='<span class="control-note">옥타브 이동은 건반 위의 − / + 버튼을 사용하세요.</span>';
 }
 requestAnimationFrame(updatePracticeScrollHint);
}
function fillNotes(sel,selected){
 // Five complete octaves, including all sharps/flats on black keys.
 // Previously only white notes 48..83 were offered, hiding many target pitches.
 for(let octave=2;octave<=6;octave++){
  const group=document.createElement('optgroup');
  group.label=(octave-2)+'옥 · C'+octave+'–B'+octave;
  for(let step=0;step<12;step++){
   const m=(octave+1)*12+step;
   if(m<PITCH_RANGE.minMidi||m>PITCH_RANGE.maxMidi)continue;
   const op=document.createElement('option');
   op.value=String(m);
   op.textContent=noteLabel(m);
   group.append(op);
  }
  sel.append(group);
 }
 sel.value=String(selected);
}
function exerciseSteps(pattern=app.exercisePattern,root=app.exerciseRoot){
 const entry=EXERCISE_PATTERNS[pattern]||EXERCISE_PATTERNS.scale;
 // Musical patterns that reach the next octave reverse direction for high
 // starting notes, keeping generated goals inside the measured vocal range.
 root=clamp(Math.round(root),PITCH_RANGE.minMidi,PITCH_RANGE.maxMidi);
 const descending=root+Math.max(...entry.steps)>PITCH_RANGE.maxMidi;
 return entry.steps.map(offset=>root+(descending?-offset:offset));
}
function startExercise(t){
 const steps=exerciseSteps();
 app.exercise={start:t+3000,duration:app.exerciseSpeed,steps,active:true,
  pattern:app.exercisePattern,root:app.exerciseRoot,repeatLimit:app.exerciseRepeats,
  round:1,completedRounds:0,completedHits:0,completedTotal:0,roundHits:0,roundTotal:0,
  completedVoicedMs:0,sufficientRounds:0,roundVoicedMs:0,lastCoverageAt:null,lastCoverageVoiced:false,stepVoicedMs:steps.map(()=>0),
  target:null,lastStep:-1};
 lockPracticeControls(true);
 setMessage('3초 준비 후 민트색 건반을 따라 부르세요. ' +
  (app.exerciseRepeats===0?'계속 반복합니다.':'총 '+app.exerciseRepeats+'회 반복합니다.'));
 $('mainButton').textContent='연습 중단';
 progress(0,'3초 준비 · 1'+(app.exerciseRepeats?' / '+app.exerciseRepeats:'')+'회');
}
function exerciseRoundLabel(e){return e.round+' / '+(e.repeatLimit||'∞')+'회';}
function receiveExerciseSample(t,midi){
 const e=app.exercise;if(!e?.active||!Number.isFinite(t)||t<e.start||e.lastCoverageAt!==null&&t<=e.lastCoverageAt)return;
 const idx=Math.floor((t-e.start)/e.duration);if(idx<0||idx>=e.steps.length)return;
 const valid=Number.isFinite(midi)&&midi>=PITCH_RANGE.minMidi-.5&&midi<=PITCH_RANGE.maxMidi+.5;
 const gap=e.lastCoverageAt===null?0:t-e.lastCoverageAt;
 const delta=valid&&e.lastCoverageVoiced&&gap>0&&gap<=160?Math.min(gap,t-(e.start+idx*e.duration)):0;
 e.lastCoverageAt=t;e.lastCoverageVoiced=valid;
 if(!valid)return;
 e.roundTotal++;e.roundVoicedMs+=delta;e.stepVoicedMs[idx]+=delta;
 if(Math.abs(midi-e.steps[idx])*100<=SCORE_RULES.sustainTolerance)e.roundHits++;
}
function updateExercise(t){
 const e=app.exercise;if(!e?.active)return;
 if(t<e.start){
  e.target=null;
  progress(e.repeatLimit?((e.round-1)/e.repeatLimit):0,
   exerciseRoundLabel(e)+' · '+Math.ceil((e.start-t)/1000)+'초 준비');
  syncKeyColors();return;
 }
 const idx=Math.floor((t-e.start)/e.duration);
 if(idx>=e.steps.length){
  // A round is only scored once. A finite repeat count terminates cleanly;
  // an unlimited loop always waits between rounds, and can be manually stopped.
  e.completedRounds++;
  e.completedHits+=e.roundHits;e.completedTotal+=e.roundTotal;
  e.completedVoicedMs+=e.roundVoicedMs;
  if(e.roundTotal>=SCORE_RULES.minSamples&&e.roundVoicedMs>=SCORE_RULES.practiceCoverage*e.duration*e.steps.length&&
     e.stepVoicedMs.every(ms=>ms>=SCORE_RULES.stepCoverage*e.duration))e.sufficientRounds++;
  if(e.repeatLimit>0&&e.completedRounds>=e.repeatLimit){finishExercise(true);return;}
  e.round++;
  e.start=t+1400;e.lastStep=-1;e.target=null;
  e.roundHits=0;e.roundTotal=0;
  e.roundVoicedMs=0;e.lastCoverageAt=null;e.lastCoverageVoiced=false;e.stepVoicedMs=e.steps.map(()=>0);
  setMessage('한 회차 완료! '+exerciseRoundLabel(e)+'를 준비합니다.');
  progress(e.repeatLimit?e.completedRounds/e.repeatLimit:0,
   exerciseRoundLabel(e)+' · 다음 회차 준비');
  syncKeyColors();return;
 }
 if(idx!==e.lastStep){
  e.lastStep=idx;e.target=e.steps[idx];
  setMessage(exerciseRoundLabel(e)+' · 목표 '+noteLabel(e.target));
  playReference(e.target);
  if(e.target<app.base||e.target>=app.base+(app.keyboardNotes||24)){
   app.base=clamp(Math.floor(e.target/12)*12,24,108-(app.keyboardNotes||24));drawKeys();
  }
 }
 const phase=clamp((t-e.start)/(e.duration*e.steps.length),0,1);
 progress(e.repeatLimit?(e.completedRounds+phase)/e.repeatLimit:phase,
  exerciseRoundLabel(e)+' · '+(idx+1)+' / '+e.steps.length+'음');
 syncKeyColors();
}
function playReference(m){
 if(window.VoiceLineToneEngine?.ready&&window.VoiceLineToneEngine.status!=='error'){
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
 lockPracticeControls(false);
 const score=e.completedTotal?Math.floor(100*e.completedHits/e.completedTotal+1e-9):null;
 const playedRounds=e.completedRounds;
 const roundsText=playedRounds+'회';
 const sufficient=e.sufficientRounds===playedRounds&&playedRounds>0;
 const voiced=((e.completedVoicedMs||0)/1000).toFixed(1);
 const detail=sufficient&&score!==null?score+'% 정확도 · 유효 발성 '+voiced+'초':
  '측정 부족 · 유효 발성 '+voiced+'초 · 충분한 회차 '+(e.sufficientRounds||0)+'/'+playedRounds;
 if(completed){
  progress(1,roundsText+' 완료 · '+detail);
  setMessage((EXERCISE_PATTERNS[e.pattern]||EXERCISE_PATTERNS.scale).label+' · '+roundsText+' 완료! '+detail);
 }else{
  progress(0,playedRounds?'완료 '+roundsText+' · 연습 중단':'연습 중단');
  setMessage('연습을 중단했습니다. '+(playedRounds?'완료한 '+roundsText+'의 결과를 저장합니다.':''));
 }
 // Completed rounds are real work, even if the user ends infinite repeat.
 // But a stopped first partial round does not count as a completed exercise.
 if(playedRounds>0){
  const label=(EXERCISE_PATTERNS[e.pattern]||EXERCISE_PATTERNS.scale).label;
  addEvent('음정 연습',label+' · '+roundsText+' · '+detail+(completed?'':' · 중단'),'practice');
 }
 $('mainButton').textContent='연습 시작';
 if(completed){
  $('stopButton').hidden=true;
  if(app.mic)stopMic();
 }
 syncKeyColors();
}
// Voice training modes share microphone and drawing, but keep separate exercise
// definitions and avoid inventing clinical breath or absolute-volume scores.
const TRAINING_MODES=new Set(['practice','sustainVoice','earVoice','dynamicVoice','warmupVoice','guideVoice']);
// One source of timing for the visual guide and its scheduled transition sounds.
const WARMUP_CYCLE_MS=19000;
const WARMUP_STEPS=Object.freeze([
 {key:'inhale',label:'들이쉬기',short:'들이쉬기',start:0,end:4000,hint:'코로 천천히 숨을 들이쉬세요.',tones:[520]},
 {key:'exhale',label:'내쉬기',short:'내쉬기',start:4000,end:10000,hint:'천천히 내쉬세요. 딩딩 두 번에 허밍을 시작합니다.',tones:[420]},
 {key:'hum',label:'편안하게 허밍',short:'허밍',start:10000,end:16000,hint:'딩딩 두 번 · 입을 가볍게 다물고 「음~」 하세요.',tones:[660,880]},
 {key:'rest',label:'쉬기',short:'쉬기',start:16000,end:19000,hint:'허밍을 멈추고 편안하게 쉬세요.',tones:[330]}
]);
const WARMUP_DEFAULTS=Object.freeze({inhale:4,exhale:6,hum:6,rest:3,cues:true});
function normalizeWarmup(value={}){
 if(!value||typeof value!=='object')value={};const settings={cues:value.cues!==false};
 for(const key of ['inhale','exhale','hum','rest']){
  const n=Number(value[key]);settings[key]=Number.isFinite(n)?clamp(Math.round(n),key==='rest'?0:1,30):WARMUP_DEFAULTS[key];
 }
 return settings;
}
function warmupTimeline(value){
 const settings=normalizeWarmup(value);let start=0;
 const steps=WARMUP_STEPS.map(stage=>{const end=start+settings[stage.key]*1000;const item={...stage,start,end};start=end;
  if(!settings.cues&&stage.key==='hum')item.hint='화면 안내에 맞춰 입을 가볍게 다물고 「음~」 하세요.';
  if(!settings.cues&&stage.key==='exhale')item.hint='천천히 내쉰 다음 화면 안내에 맞춰 허밍합니다.';
  return item;
 });
 return {steps,cycle:start,cues:settings.cues,settings};
}
function openWarmupSettings(trigger){
 if(app.training){notify('워밍업을 중단한 뒤 시간을 변경해 주세요.');return;}
 const settings=normalizeWarmup(app.trainingSettings.warmup);
 for(const key of ['inhale','exhale','hum','rest'])$('warmup'+key[0].toUpperCase()+key.slice(1)).value=String(settings[key]);
 $('warmupCues').checked=settings.cues;$('warmupSettingsStatus').textContent='쉬기 0초는 생략합니다. 다른 단계는 1~30초입니다.';
 app.warmupSettingsReturnFocus=trigger;modalOpen('warmupSettingsDialog');
}
function saveWarmupOptions(reset=false){
 if(app.training){$('warmupSettingsStatus').textContent='워밍업을 중단한 뒤 설정을 변경해 주세요.';return;}
 const value={cues:$('warmupCues').checked};
 for(const key of ['inhale','exhale','hum','rest']){
  const input=$('warmup'+key[0].toUpperCase()+key.slice(1)),n=Number(input.value);
  if(!reset&&(!input.value.trim()||!Number.isInteger(n)||n<(key==='rest'?0:1)||n>30)){
   $('warmupSettingsStatus').textContent='들이쉬기·내쉬기·허밍은 1~30초, 쉬기는 0~30초로 입력하세요.';input.focus();return;
  }
  value[key]=n;
 }
 const settings=reset?{...WARMUP_DEFAULTS}:normalizeWarmup(value),next={...app.trainingSettings,warmup:settings};
 try{localStorage.setItem('voiceline-training-v1',JSON.stringify(next));}
 catch(_){$('warmupSettingsStatus').textContent='설정을 저장하지 못했습니다. 저장 공간을 확인해 주세요.';return;}
 app.trainingSettings=next;modalClose('warmupSettingsDialog');updateWarmupGuide(null,performance.now());notify(reset?'기본 워밍업 설정으로 되돌렸습니다.':'워밍업 설정을 저장했습니다.');
}
function warmupPhaseAt(ms,session=null){
 const cycle=session?.warmupCycleMs||WARMUP_CYCLE_MS,steps=session?.warmupSteps||WARMUP_STEPS;
 const position=Math.max(0,ms)%cycle;
 return steps.find(step=>position<step.end)||steps[0];
}
function warmupGuideState(session,now){
 if(!session){const options=normalizeWarmup(app.trainingSettings?.warmup);return {key:'idle',title:'호흡과 허밍 준비',hint:'들이쉬기 '+options.inhale+'초 → 내쉬기 '+options.exhale+'초 → 허밍 '+options.hum+'초 → 쉬기 '+options.rest+'초',seconds:'—',next:options.cues?'딩딩 두 번이 들리면 허밍을 시작하세요.':'초록색 허밍 안내가 나오면 시작하세요.',step:-1};}
 const elapsed=now-session.start;
 if(elapsed<0)return {key:'ready',title:'잠시 준비하세요',hint:'편안한 자세로 힘을 빼세요.',seconds:Math.ceil(-elapsed/1000),next:'다음: 들이쉬기',step:-1};
 if(elapsed>=session.duration)return {key:'done',title:'워밍업 완료',hint:'편안하게 쉬세요.',seconds:0,next:'호흡과 허밍 안내를 마쳤습니다.',step:-1};
 const cycle=session.warmupCycleMs||WARMUP_CYCLE_MS,steps=session.warmupSteps||WARMUP_STEPS;
 const phase=warmupPhaseAt(elapsed,session),index=steps.indexOf(phase),round=Math.floor(elapsed/cycle)+1;
 const seconds=Math.ceil((phase.end-elapsed%cycle)/1000);
 const nextStep=steps.slice(index+1).find(step=>step.end>step.start);
 const next=nextStep?nextStep.short:round>=session.rounds?'완료':'다음 세트 들이쉬기';
 return {key:phase.key,title:phase.key==='hum'?'지금 허밍하세요':phase.key==='rest'?'허밍을 멈추고 쉬세요':phase.short,
  hint:phase.hint,seconds,next:round+'/'+session.rounds+'세트 · 다음: '+next+' · '+seconds+'초 후',step:index};
}
function updateWarmupGuide(session,now){
 const guide=$('warmupGuide');if(!guide)return;
 guide.hidden=app.mode!=='warmupVoice';if(guide.hidden)return;
 const state=warmupGuideState(session?.mode==='warmupVoice'?session:null,now);
 guide.setAttribute('data-phase',state.key);
 $('warmupPhaseTitle').textContent=state.title;$('warmupPhaseHint').textContent=state.hint;
 $('warmupSeconds').textContent=String(state.seconds);$('warmupNext').textContent=state.next;
 for(const [index,node] of [...guide.querySelectorAll('[data-warmup-step]')].entries()){
  node.classList.toggle('active',index===state.step);node.setAttribute('aria-current',index===state.step?'step':'false');
  const text=node.querySelector?.('b'),settings=normalizeWarmup(app.trainingSettings?.warmup);if(text)text.textContent=settings[['inhale','exhale','hum','rest'][index]]+'초';
 }
 // Announce transitions only; the per-second countdown stays silent for screen readers.
 if(guide.dataset.announcedPhase!==state.key){guide.dataset.announcedPhase=state.key;$('warmupAnnouncement').textContent=state.title+' · '+state.hint;}
}
const DYNAMIC_STEPS=Object.freeze([
 {key:'soft',label:'약하게',short:'약',hz:440},
 {key:'medium',label:'중간 세기',short:'중',hz:660},
 {key:'strong',label:'강하게',short:'강',hz:880},
 {key:'softAgain',label:'다시 약하게',short:'약',hz:440}
]);
function dynamicGuideState(session,now){
 if(!session)return {key:'idle',step:-1,label:'시작 대기',seconds:'3초씩',next:'약 → 중 → 강 → 약',remaining:'12초'};
 const elapsed=now-session.start;
 if(elapsed<0)return {key:'ready',step:-1,label:'시작 준비',seconds:Math.ceil(-elapsed/1000)+'초',next:'약하게 시작',remaining:'12초'};
 if(elapsed>=session.duration)return {key:'done',step:-1,label:'훈련 완료',seconds:'0초',next:'편안하게 쉬세요',remaining:'0초'};
 const length=session.duration/4,index=Math.min(3,Math.floor(elapsed/length)),stage=DYNAMIC_STEPS[index];
 const seconds=Math.max(1,Math.ceil(((index+1)*length-elapsed)/1000));
 return {key:stage.key,step:index,label:stage.label,seconds:seconds+'초',
  next:(DYNAMIC_STEPS[index+1]?.label||'종료')+' · '+seconds+'초 뒤',remaining:Math.ceil((session.duration-elapsed)/1000)+'초'};
}
function updateDynamicGuide(session,now){
 const state=dynamicGuideState(session?.mode==='dynamicVoice'?session:null,now);
 $('trainingOverlay').setAttribute('data-dynamic-phase',state.key);
 const plan=$('dynamicGuide');
 for(const [index,node] of [...plan.querySelectorAll('[data-dynamic-step]')].entries()){
  node.classList.toggle('active',index===state.step);node.setAttribute('aria-current',index===state.step?'step':'false');
 }
 for(const [index,text] of ['지금 할 발성','단계 남은 시간','다음 발성','전체 남은 시간'].entries())$('trainingMetricLabel'+(index+1)).textContent=text;
 for(const [index,text] of [state.label,state.seconds,state.next,state.remaining].entries())$('trainingMetric'+(index+1)).textContent=text;
 if(plan.dataset.announcedPhase!==state.key){plan.dataset.announcedPhase=state.key;$('dynamicAnnouncement').textContent=state.label+' · '+state.seconds;}
}
function cancelTrainingCues(session,detach=true){
 if(!session)return;
 for(const item of session.trainingCueNodes||[]){try{item.osc.stop();item.osc.disconnect();item.gain.disconnect();}catch(_){}}
 session.trainingCueNodes?.clear();session.trainingCueScheduled=false;
 session.dynamicCueWindows=[];
 if(detach&&session.trainingCueContext&&session.trainingAudioChange){
  session.trainingCueContext.removeEventListener?.('statechange',session.trainingAudioChange);session.trainingAudioChange=null;
 }
}
function scheduleTrainingCues(session){
 const dynamic=session.mode==='dynamicVoice';
 if((!dynamic&&session.mode!=='warmupVoice')||(dynamic?session.dynamicCues===false:session.warmupCues===false)||session.trainingAudioChange||!session.active||app.training!==session)return;
 const ac=ensureSynth();if(!ac)return;
 session.trainingCueContext=ac;session.trainingCueNodes=new Set();session.dynamicCueWindows=[];
 const schedule=()=>{
  if(app.training!==session||!session.active||app.backgrounded||document.hidden||ac.state!=='running'||session.trainingCueScheduled)return;
  session.trainingCueScheduled=true;
  const elapsed=performance.now()-session.start,base=ac.currentTime;
  try{
   const stages=dynamic?DYNAMIC_STEPS.map((stage,index)=>({start:index*session.duration/4,end:(index+1)*session.duration/4,tones:[stage.hz]})):(session.warmupSteps||WARMUP_STEPS);
   const cycle=dynamic?session.duration:(session.warmupCycleMs||WARMUP_CYCLE_MS);
   for(let round=0;round<(dynamic?1:session.rounds);round++)for(const stage of stages){
    if(stage.end<=stage.start)continue;
    const offset=round*cycle+stage.start;
    if(offset<elapsed-75)continue; // Never replay missed transitions after an audio interruption.
    for(const [index,hz] of stage.tones.entries()){
     const when=base+Math.max(.015,(offset-elapsed)/1000)+index*.18;
     const osc=ac.createOscillator(),gain=ac.createGain(),item={osc,gain};
     osc.type='sine';osc.frequency.setValueAtTime(hz,when);
     const length=dynamic ? .07 : .12;
     gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(dynamic ? .018 : .045,when+.012);
     gain.gain.exponentialRampToValueAtTime(.0001,when+length);
     osc.connect(gain);gain.connect(ac.destination);session.trainingCueNodes.add(item);
     osc.onended=()=>{session.trainingCueNodes.delete(item);osc.disconnect();gain.disconnect();};
     osc.start(when);osc.stop(when+length+.01);
     if(dynamic){const at=session.start+elapsed+(when-base)*1000;session.dynamicCueWindows.push({start:at-30,end:at+220});}
    }
   }
  }catch(error){cancelTrainingCues(session,false);console.warn('Training guidance sound unavailable',error);}
 };
 session.trainingAudioChange=()=>{
  if(app.training!==session||!session.active){cancelTrainingCues(session);return;}
  if(ac.state==='running')schedule();else cancelTrainingCues(session,false);
 };
 ac.addEventListener?.('statechange',session.trainingAudioChange);
 if(ac.state==='running')schedule();else ac.resume().then(schedule).catch(()=>{});
}
function restoreTrainingSettings(){
 try{
  const r=JSON.parse(localStorage.getItem('voiceline-training-v1')||'null');
  if(!r)return;
  app.trainingSettings.warmup=normalizeWarmup(r.warmup);
  app.trainingSettings.dynamicCues=r.dynamicCues!==false;
  for(const [key,values] of Object.entries({root:null,sustainSeconds:[5,8,12],earCount:[3,4,5],rounds:[1,2,3]})){
   if(key==='root'){
    if(Number.isInteger(r[key])&&r[key]>=48&&r[key]<=84)app.trainingSettings[key]=r[key];
   }else if(values.includes(r[key]))app.trainingSettings[key]=r[key];
  }
 }catch(_){/* no persistent settings available */}
}
function saveTrainingSettings(){
 try{localStorage.setItem('voiceline-training-v1',JSON.stringify(app.trainingSettings));}catch(_){}
}
function trainingSelect(c,id,title,options,value,convert){
 const label=document.createElement('label');label.className='practice-setting';label.textContent=title+' ';
 const select=document.createElement('select');select.id=id;select.setAttribute('aria-label',title);
 for(const [v,text] of options){const o=document.createElement('option');o.value=String(v);o.textContent=text;select.append(o);}
 select.value=String(value);select.disabled=Boolean(app.training?.active);
 select.addEventListener('change',()=>{
  app.trainingSettings[convert]=Number(select.value);saveTrainingSettings();
  if(convert==='root')syncKeyColors();
 });
 label.append(select);c.append(label);
}
function renderTrainingControls(c){
 if(app.mode==='practice'||app.mode==='guideVoice'){renderGuideControls(c);return;}
 const v=app.trainingSettings,notes=Array.from({length:37},(_,i)=>[48+i,noteLabel(48+i)]);
 if(['sustainVoice','earVoice','dynamicVoice'].includes(app.mode))
  trainingSelect(c,'trainingRoot','기준음',notes,v.root,'root');
 if(app.mode==='sustainVoice')trainingSelect(c,'trainingDuration','유지 시간',[[5,'5초'],[8,'8초'],[12,'12초']],v.sustainSeconds,'sustainSeconds');
 if(app.mode==='earVoice')trainingSelect(c,'trainingCount','들을 음',[[3,'3개'],[4,'4개'],[5,'5개']],v.earCount,'earCount');
 if(app.mode==='dynamicVoice'){
  const cue=document.createElement('button');cue.id='dynamicCuesToggle';cue.type='button';
  const sync=()=>{cue.textContent='안내음 '+(v.dynamicCues!==false?'켜짐':'꺼짐');cue.setAttribute('aria-pressed',String(v.dynamicCues!==false));};
  cue.disabled=Boolean(app.training?.active);cue.onclick=()=>{v.dynamicCues=v.dynamicCues===false;saveTrainingSettings();sync();};sync();c.append(cue);
 }
 if(app.mode==='warmupVoice'){trainingSelect(c,'trainingRounds','진행 횟수',[[1,'1세트'],[2,'2세트'],[3,'3세트']],v.rounds,'rounds');const options=document.createElement('button');options.id='warmupSettingsOpen';options.type='button';options.textContent='시간·안내음';options.setAttribute('aria-haspopup','dialog');options.setAttribute('aria-controls','warmupSettingsDialog');options.onclick=()=>openWarmupSettings(options);c.append(options);}
 const hint=document.createElement('span');hint.className='control-note training-control-hint';
 hint.textContent=({sustainVoice:'±35cent · 안정 구간',earVoice:'기준음 듣기 후 따라 부르기',dynamicVoice:'마이크 거리 고정 · 상대 음량',warmupVoice:'내쉬기 다음 허밍 · 딩딩 안내음에 시작'})[app.mode];
 c.append(hint);
}
function trainingDuration(mode,settings){
 if(mode==='practice'||mode==='guideVoice')return window.VoiceLineGuideTraining.plan(settings.guide||app.guideSettings).duration;
 if(mode==='sustainVoice')return settings.sustainSeconds*1000;
 if(mode==='earVoice')return settings.earCount*4700;
 if(mode==='dynamicVoice')return 12000;
 return settings.rounds*warmupTimeline(settings.warmup).cycle;
}
function trainingTargetAt(session,ms){
 if(session.mode==='guideVoice')return window.VoiceLineGuideTraining.position(session,session.start+ms).midi;
 if(session.mode==='sustainVoice'||session.mode==='dynamicVoice')return session.root;
 if(session.mode==='earVoice'){
  const idx=Math.min(session.earNotes.length-1,Math.floor(ms/4700));
  return session.earNotes[idx];
 }
 return null;
}
function trainingPhase(session,ms){
 if(session.mode==='guideVoice')return window.VoiceLineGuideTraining.position(session,session.start+ms).phase;
 if(session.mode==='earVoice')return ms%4700<1500?'listen':'answer';
 if(session.mode==='warmupVoice')return warmupPhaseAt(ms,session).label;
 if(session.mode==='dynamicVoice'){
  const q=ms/session.duration;
  return q<.25?'작게':q<.5?'조금 크게':q<.75?'가장 크게':'다시 작게';
 }
 return 'sing';
}
function newTrainingSession(mode,t,settings=app.trainingSettings){
 if(mode==='practice'||mode==='guideVoice')return window.VoiceLineGuideTraining.create(settings.guide||app.guideSettings,t);
 const root=clamp(Math.round(Number(settings.root)||60),48,84);
 const duration=trainingDuration(mode,settings),warmup=warmupTimeline(settings.warmup);
 const earDirection=root+12>PITCH_RANGE.maxMidi?-1:1;
 const notes=Array.from({length:settings.earCount},(_,i)=>root+earDirection*[0,2,4,7,5,9,12][(i*3+1)%7]);
 return {mode,active:true,root,warmupSteps:warmup.steps,warmupCycleMs:warmup.cycle,warmupCues:warmup.cues,
  rounds:settings.rounds,dynamicCues:settings.dynamicCues!==false,
  earNotes:notes, duration,start:t+1800,played:-1,target:null,
  voicedMs:0,answerVoicedMs:0,
  valid:0,good:0,rmsMax:0,
  low:null,high:null,lastSampleAt:null,
  phaseLevels:{},phaseCounts:{},phaseVoicedMs:{},history:[],referenceAt:-Infinity,referenceMidi:null};
}
function startTraining(t){
 if(app.backgrounded||document.hidden||app.lifeStopping)return;
 const session=newTrainingSession(app.mode,t);
 if(session.mode==='guideVoice'&&!startGuideSound(session,t)){stopMic();return;}
 app.training=session;hideTrainingResult();
 if(session.mode==='warmupVoice'||session.mode==='dynamicVoice')scheduleTrainingCues(session);
 $('mainButton').textContent=app.mode==='practice'?'연습 중단':'훈련 중단';$('stopButton').hidden=true;
 for(const el of $('exerciseControls').querySelectorAll('select,button'))el.disabled=true;
 setMessage('잠시 준비 · 편안하게 시작하세요. 무리하거나 통증이 느껴지면 중단하세요.');
 progress(0,'준비 중');syncTrainingOverlay();
 if(!app.frame)app.frame=requestAnimationFrame(tick);
}
function receiveTrainingSample(t,midi,rms){
 const a=app.training;if(!a?.active)return;
 if(a.mode==='guideVoice'){window.VoiceLineGuideTraining.receive(a,t,midi);return;}
 if(!Number.isFinite(t)||t<a.start||t>a.start+a.duration)return;
 const elapsed=t-a.start;
 const phase=trainingPhase(a,elapsed);
 const cueMasked=a.mode==='dynamicVoice'&&(a.dynamicCueWindows||[]).some(cue=>t>=cue.start&&t<cue.end);
 const validMidi=!cueMasked&&Number.isFinite(midi)&&midi>=PITCH_RANGE.minMidi-.5&&midi<=PITCH_RANGE.maxMidi+.5;
 const v=validMidi?midi:null;
 const level=cueMasked?null:Number.isFinite(rms)?rms:0;
 if(a.lastSampleAt!==null&&t-a.lastSampleAt<22)return;
 const previous=a.history[a.history.length-1],gap=previous?t-previous.t:0;
 const coverageDelta=validMidi&&Number.isFinite(previous?.midi)&&gap>0&&gap<=160?gap:0;
 a.lastSampleAt=t;
 a.history.push({t,midi:v,rms:level});
 while(a.history.length&&t-a.history[0].t>6000)a.history.shift();
 if(validMidi){a.low=Math.min(a.low??midi,midi);a.high=Math.max(a.high??midi,midi);}
 const target=trainingTargetAt(a,elapsed);
 if(a.mode==='sustainVoice'){
  const tolerance=SCORE_RULES.sustainTolerance;
  if(validMidi){a.valid++;a.voicedMs+=coverageDelta;
   if(Math.abs(v-target)*100<=tolerance)a.good++;
  }
 }else if(a.mode==='earVoice'){
  const answerStart=a.start+Math.floor(elapsed/4700)*4700+1500;
  const answerDelta=Math.max(0,Math.min(coverageDelta,t-answerStart));
  if(phase==='answer'&&validMidi){a.valid++;a.answerVoicedMs+=answerDelta;
   if(Math.abs(v-target)*100<=SCORE_RULES.sustainTolerance)a.good++;
  }
 }else if(a.mode==='dynamicVoice'){
  if(validMidi){a.valid++;a.voicedMs+=coverageDelta;}
  if(validMidi&&Math.abs(v-target)*100<=SCORE_RULES.dynamicTolerance){
   a.good++;
   const phaseStart=a.start+Math.floor(elapsed/(a.duration/4))*(a.duration/4);
   a.phaseVoicedMs[phase]=(a.phaseVoicedMs[phase]||0)+Math.min(coverageDelta,t-phaseStart);
   a.rmsMax=Math.max(a.rmsMax,level);
   // Relative dynamics only: no absolute dB SPL conclusions on phone mics.
   if(level>0){a.phaseLevels[phase]=(a.phaseLevels[phase]||0)+level;a.phaseCounts[phase]=(a.phaseCounts[phase]||0)+1;}
  }
 }
}
function updateTraining(t){
 const a=app.training;if(!a?.active)return;
 if(a.mode==='guideVoice'){
  if(t>=a.start+a.duration){finishTraining(true);return;}
  updateGuideTraining(a,t);renderTrainingOverlay(t);syncKeyColors();return;
 }
 const elapsed=t-a.start;
 if(elapsed<0){
  if(a.mode==='dynamicVoice'&&a.referenceMidi!==a.root){a.referenceMidi=a.root;a.referenceAt=t;playReference(a.root);}
  progress(0,Math.ceil(-elapsed/1000)+'초 준비');renderTrainingOverlay(t);return;
 }
 if(elapsed>=a.duration){finishTraining(true);return;}
 const phase=trainingPhase(a,elapsed),target=trainingTargetAt(a,elapsed);
 if(Number.isFinite(target)){
  a.target=a.mode==='earVoice'&&phase==='listen'?null:Math.round(target);
  if(target<app.base||target>=app.base+(app.keyboardNotes||24)){app.base=targetKeyboardBase(target);drawKeys();}
  // Audible cues are short and only occur when the displayed target KEY changes.
  // Do not create a new piano note on every 16ms animation frame.
  if(['sustainVoice','dynamicVoice'].includes(a.mode)){
   const rounded=Math.round(target);
   if(a.referenceMidi!==rounded&&t-a.referenceAt>=360){
    a.referenceMidi=rounded;a.referenceAt=t;
    playReference(rounded);
   }
  }
 }else a.target=null;
 if(a.mode==='earVoice'){
  const idx=Math.floor(elapsed/4700);
  if(phase==='listen'&&a.played!==idx){
   a.played=idx;playReference(a.earNotes[idx]);
  }
  setMessage('청음 '+(idx+1)+'/'+a.earNotes.length+' · '+(phase==='listen'?'듣기: 정답 건반은 숨깁니다':'따라 부르기: 목표 '+noteLabel(a.earNotes[idx])+' (민트색 건반)'));
 }else if(a.mode==='warmupVoice'){
  setMessage('워밍업 '+(Math.floor(elapsed/(a.warmupCycleMs||WARMUP_CYCLE_MS))+1)+'/'+a.rounds+'세트 · '+phase+' · 강제로 숨을 참지 마세요');
 }else if(a.mode==='dynamicVoice'){
  setMessage('같은 음을 유지하면서 '+phase+' · 마이크 거리는 고정하세요');
 }else if(a.mode==='sustainVoice'){
  setMessage(noteLabel(a.root)+' 음을 편안하게 유지하세요 · 목표 ±35cent');
 }
 progress(clamp(elapsed/a.duration,0,1),Math.floor(elapsed/1000)+' / '+Math.ceil(a.duration/1000)+'초');
 renderTrainingOverlay(t);syncKeyColors();
}
function trainingEvaluation(a,completed){
 if(a.mode==='guideVoice')return window.VoiceLineGuideTraining.evaluate(a,completed);
 if(!completed)return {status:'중단',kind:'stopped',rule:'끝까지 완료하면 성공 여부를 판정합니다.',reason:'사용자가 훈련을 중단했습니다.'};
 if(a.mode==='warmupVoice')return {status:'안내 완료',kind:'guided',rule:'안내된 호흡·허밍 타이머 완료 (실제 호흡량은 측정하지 않음)',reason:'안내형 워밍업을 마쳤습니다.'};
 const score=a.valid>=SCORE_RULES.minSamples?Math.floor(a.good/a.valid*100+1e-9):0;

 if(a.mode==='dynamicVoice'){
  const avg=x=>(a.phaseLevels[x]||0)/(a.phaseCounts[x]||1);
  const ready=['작게','조금 크게','가장 크게','다시 작게'].every(x=>(a.phaseCounts[x]||0)>=3&&
   (a.phaseVoicedMs[x]||0)>=a.duration/4*SCORE_RULES.dynamicPhaseCoverage);
  const ratio=SCORE_RULES.dynamicRatio;
  const shape=ready&&avg('조금 크게')>=avg('작게')*ratio&&avg('가장 크게')>=avg('조금 크게')*ratio&&avg('가장 크게')>=avg('다시 작게')*ratio;
  const passed=shape&&score>=SCORE_RULES.percent&&a.voicedMs>=SCORE_RULES.trainingCoverage*a.duration;
  return {status:passed?'성공':'미달성',kind:passed?'success':'failure',rule:dynamicRuleText(),
   reason:'강약 패턴 '+(shape?'확인':'미확인')+' · 음정 '+(a.valid>=SCORE_RULES.minSamples?score+'%':'측정 부족')+' · 유효 발성 '+(a.voicedMs/1000).toFixed(1)+'초'};
 }
 const minCoverage=a.mode==='earVoice'?(SCORE_RULES.earCoverage*a.earNotes.length*3200):SCORE_RULES.trainingCoverage*a.duration;
 const covered=a.mode==='earVoice'?a.answerVoicedMs:a.voicedMs;
 const passed=covered>=minCoverage&&score>=SCORE_RULES.percent;
 const tol='±35cent';
 return {status:passed?'성공':'미달성',kind:passed?'success':'failure',
  rule:tol+' 일치율 '+SCORE_RULES.percent+'% 이상 + 유효 음정 감지 시간 '+Math.round(minCoverage/1000*10)/10+'초 이상',
  reason:'일치율 '+(a.valid>=SCORE_RULES.minSamples?score+'%':'측정 부족')+' · 유효 발성 '+(covered/1000).toFixed(1)+'초'};
}
function dynamicRuleText(){
 return '작게→중간→크게→작게 (단계 평균 음량비 '+SCORE_RULES.dynamicRatio+'배 이상) · 기준음 ±'+SCORE_RULES.dynamicTolerance+
  'cent 일치율 '+SCORE_RULES.percent+'% 이상 · 유효 발성 '+Math.round(SCORE_RULES.trainingCoverage*12*10)/10+'초 이상 · 각 단계 정확한 발성 '+(3*SCORE_RULES.dynamicPhaseCoverage).toFixed(2)+'초 이상';
}
function showTrainingResult(a,completed,detail){
 const dialog=$('trainingResultDialog');if(!dialog)return;
 const result=trainingEvaluation(a,completed);
 $('trainingResultStatus').textContent=result.status;
 $('trainingResultStatus').className='training-result-status '+result.kind;
 $('trainingResultTitle').textContent=(a.mode==='guideVoice'?MODES.practice?.[0]:MODES[a.mode]?.[0])||'음정 연습';
 $('trainingResultMetrics').textContent=detail;
 $('trainingResultRule').textContent=result.rule;
 $('trainingResultReason').textContent=result.reason;
 dialog.hidden=false;
 $('trainingResultClose')?.focus();
}
function hideTrainingResult(){const dialog=$('trainingResultDialog');if(dialog&&!dialog.hidden){dialog.hidden=true;$('mainButton')?.focus();}}
$('trainingResultClose')?.addEventListener('click',hideTrainingResult);
$('trainingResultDialog')?.addEventListener('click',e=>{if(e.target===$('trainingResultDialog'))hideTrainingResult();});
function trainingSummary(a,completed){
 if(a.mode==='guideVoice')return window.VoiceLineGuideTraining.summary(a,noteLabel,completed);
 const accuracy=a.valid>=SCORE_RULES.minSamples?Math.floor(a.good/a.valid*100+1e-9):null;
 if(a.mode==='sustainVoice')return '기준음 '+noteLabel(a.root)+' · '+(accuracy===null?'측정값 부족':accuracy+'% 안정 구간');
 if(a.mode==='earVoice')return a.earNotes.length+'음 청음 · '+(accuracy===null?'측정값 부족':accuracy+'% 근접 음정');
 if(a.mode==='dynamicVoice')return '기준음 '+noteLabel(a.root)+' · '+trainingEvaluation(a,true).reason;
 return Math.floor(Math.max(0,Math.min(a.duration,performance.now()-a.start))/(a.warmupCycleMs||WARMUP_CYCLE_MS))+'세트 수행 · 안내형 워밍업';
}
function finishTraining(completed){
 const a=app.training;if(!a)return;
 a.active=false;app.training=null;cancelTrainingCues(a);a.guidePlayer?.stop();
 if(a.mode==='guideVoice'){a.completed=completed;a.finishedAt=performance.now();app.guideLastResult=a;}
 for(const el of $('exerciseControls').querySelectorAll('select,button'))el.disabled=false;
 const detail=trainingSummary(a,completed)+(completed?'':' · 중단');
 const evaluation=trainingEvaluation(a,completed);
 // Save only if the exercise actually started; warmup is guidance, not a measured breath test.
 if(performance.now()>=a.start){const mode=a.mode==='guideVoice'?'practice':a.mode;addEvent(MODES[mode]?.[0]||'음정 연습',evaluation.status+' · '+detail,mode);}
 setMessage(evaluation.status+' · '+detail);progress(completed?1:0,evaluation.status);
 if(performance.now()>=a.start)showTrainingResult(a,completed,detail);
 $('mainButton').textContent=app.mode==='practice'?'연습 시작':'훈련 시작';$('stopButton').hidden=true;
 if(app.mic)stopMic();
 else if(app.frame){cancelAnimationFrame(app.frame);app.frame=0;}
 syncKeyColors();renderTrainingOverlay(performance.now(),true);
}
function syncTrainingOverlay(){
 const el=$('trainingOverlay');if(!el)return;
 const guide=app.mode==='practice'||app.mode==='guideVoice';
 $('app').classList.toggle('guide-mode',false);$('app').classList.toggle('practice-mode',guide);$('guideVoicePanel').hidden=!guide;
 el.hidden=!TRAINING_MODES.has(app.mode)||guide;
 el.classList.toggle('warmup-mode',app.mode==='warmupVoice');
 if(!el.hidden||guide)renderTrainingOverlay(performance.now(),true);
}
function renderTrainingOverlay(now=performance.now(),force=false){
 if(app.mode==='practice'||app.mode==='guideVoice'){renderGuideTraining(now,force);return;}
 const el=$('trainingOverlay');if(!el||el.hidden)return;
 if(!force&&now-app.trainingLastDraw<100)return;
 app.trainingLastDraw=now;
 const a=app.training;
 updateWarmupGuide(a,now);
 const dynamic=app.mode==='dynamicVoice';
 $('dynamicGuide').hidden=!dynamic;el.classList.toggle('dynamic-mode',dynamic);$('trainingInfo').hidden=dynamic;
 $('dynamicAnnouncement').hidden=!dynamic;
 for(const [index,text] of ['현재 측정','진행 / 일치율','감지 음역','남은 시간'].entries())$('trainingMetricLabel'+(index+1)).textContent=text;
 if(app.mode==='warmupVoice'){
  $('trainingTitle').textContent='호흡·워밍업';$('trainingInfo').textContent=(a?a.warmupCues:normalizeWarmup(app.trainingSettings.warmup).cues)===false?'안내음 꺼짐 · 초록색 안내에 허밍하세요':'딩딩 두 번 → 허밍 시작 · 마이크 없이 진행';return;
 }
 const canvas=$('trainingGraph'),rect=canvas.getBoundingClientRect();
 $('trainingTitle').textContent=MODES[app.mode]?.[0]||'보컬 훈련';
 $('trainingInfo').textContent=a?(
  a.mode==='dynamicVoice'?'상대 소리 크기 (마이크 거리 고정)':
  a.mode==='earVoice'?(trainingPhase(a,Math.max(0,now-a.start))==='answer'?'민트색 목표 건반을 보고 발성':'정답 숨김 · 기준음 듣기'):
  (Number.isFinite(a.target)?'목표 '+noteLabel(a.target)+' · ':'')+'최근 6초 · 실시간 음정'):'훈련 시작을 누르세요';
 const last=a?.history?.length?a.history[a.history.length-1]:null;
 $('trainingMetric1').textContent=a?(Number.isFinite(last?.midi)?noteLabel(Math.round(last.midi)):'—'):'—';
 $('trainingMetric2').textContent=a?(a.mode==='dynamicVoice'?Math.round(last?.rms*1000||0)+'m':
   a.valid?Math.floor(100*a.good/a.valid+1e-9)+'%':'측정 중'):'—';
 $('trainingMetric3').textContent=a&&a.low!==null?noteLabel(a.low)+' ~ '+noteLabel(a.high):'—';
 $('trainingMetric4').textContent=a?Math.max(0,Math.ceil((a.duration-Math.max(0,now-a.start))/1000))+'초':'—';
 if(dynamic)updateDynamicGuide(a,now);
 if(!rect.width||!rect.height)return;
 const dpr=Math.min(window.devicePixelRatio||1,2),w=rect.width,h=rect.height;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 }
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const x0=63,x1=w-9,y0=8,y1=h-16,points=(a?.history||[]).filter(p=>p.t>=now-6000);
 if(x1<=x0||y1<=y0)return;
 const audioLevel=a?.mode==='dynamicVoice';
 const levelTop=Math.max(.012,a?.rmsMax||0);
 const pitch=points.filter(p=>Number.isFinite(p.midi)).map(p=>p.midi);
 const root=a?.root??60;
 const low=Math.min(root-5,...pitch.map(x=>Math.floor(x)));
 const high=Math.max(root+14,...pitch.map(x=>Math.ceil(x)));
 const yy=p=>y1-clamp(audioLevel?p.rms/levelTop:(p.midi-low)/(high-low),0,1)*(y1-y0);
 for(let i=0;i<=3;i++){
  const y=y0+(y1-y0)*i/3;
  ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.strokeStyle='rgba(225,218,247,.17)';ctx.lineWidth=1;ctx.stroke();
  if(!audioLevel){
   const midi=low+(high-low)*(1-i/3);
   if(Number.isFinite(midi)){
    ctx.fillStyle='#b8d4d0';ctx.font='9px system-ui';ctx.textAlign='right';
    ctx.fillText(noteLabel(Math.round(midi)),x0-5,y+3,x0-10);
   }
  }
 }
 ctx.font='10px system-ui';ctx.textAlign='left';ctx.fillStyle='#bdb9d3';ctx.fillText('−6초',x0,h-3);ctx.textAlign='right';ctx.fillText('현재',x1,h-3);

  ctx.beginPath();let prev=null;
  for(const p of points){if((audioLevel&&!Number.isFinite(p.rms))||(!audioLevel&&!Number.isFinite(p.midi))){prev=null;continue;}
   const x=x0+clamp((p.t-(now-6000))/6000,0,1)*(x1-x0),y=yy(p);
   if(!prev||p.t-prev>210)ctx.moveTo(x,y);else ctx.lineTo(x,y);
   prev=p.t;
  }
  ctx.strokeStyle='#d6aaff';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke();
}
function guideOptions(){
 if(!app.guideSettings){
  const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return null;}};
  const saved=read('voiceline-unified-practice-v1');
  app.guideSettings=window.VoiceLineGuideTraining.migratePractice(saved,read('voiceline-practice-v1'),read('voiceline-guide-v1'),read('voiceline-training-v1'));
  if(!saved||!Object.hasOwn(window.VoiceLineGuideTraining.PATTERNS,saved.pattern))try{localStorage.setItem('voiceline-unified-practice-v1',JSON.stringify(app.guideSettings));}catch(_){}
 }
 return app.guideSettings;
}
function saveGuideOptions(value){
 const next=window.VoiceLineGuideTraining.normalize(value);
 try{localStorage.setItem('voiceline-unified-practice-v1',JSON.stringify(next));}
 catch(_){notify('설정을 보관하지 못했습니다. 이번 연습에는 적용합니다.');}
 app.guideSettings=next;app.guideLastResult=null;app.guidePreview=null;
 return next;
}
function renderGuideControls(c){
 const api=window.VoiceLineGuideTraining,options=guideOptions();
 const smooth=Boolean(api.PATTERNS[options.pattern].smooth);
 app.practicePatternByKind??={};app.practicePatternByKind[smooth?'smooth':'steps']=options.pattern;
 const kindLabel=document.createElement('label');kindLabel.className='practice-setting';kindLabel.textContent='종류 ';
 const kind=document.createElement('select');kind.id='guideKind';kind.setAttribute('aria-label','음정 연습 종류');
 for(const [value,text]of [['steps','음계·도약'],['smooth','연속 슬라이드']]){const o=document.createElement('option');o.value=value;o.textContent=text;kind.append(o);}
 kind.value=smooth?'smooth':'steps';kind.disabled=Boolean(app.training?.active);
 kind.onchange=()=>{saveGuideOptions({...guideOptions(),pattern:app.practicePatternByKind[kind.value]||(kind.value==='smooth'?'smooth5':'five')});modeControls();renderGuideTraining(performance.now(),true);};
 kindLabel.append(kind);c.append(kindLabel);
 const label=document.createElement('label');label.className='practice-setting';label.textContent='패턴 ';
 const select=document.createElement('select');select.id='guidePattern';select.setAttribute('aria-label','음정 연습 패턴');
 for(const [id,pattern]of Object.entries(api.PATTERNS))if(Boolean(pattern.smooth)===smooth){const o=document.createElement('option');o.value=id;o.textContent=pattern.label;select.append(o);}
 select.value=options.pattern;select.disabled=Boolean(app.training?.active);
 select.onchange=()=>{app.practicePatternByKind[smooth?'smooth':'steps']=select.value;saveGuideOptions({...guideOptions(),pattern:select.value});renderGuideTraining(performance.now(),true);};
 label.append(select);c.append(label);
 const button=document.createElement('button');button.id='guideSettingsOpen';button.type='button';button.textContent='연습 설정';
 button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','guideSettingsDialog');button.disabled=Boolean(app.training?.active);button.onclick=()=>openGuideSettings(button);c.append(button);
}
function guideSettingsFromForm(){
 const pattern=guideOptions().pattern,smooth=window.VoiceLineGuideTraining.PATTERNS[pattern].smooth;
 return {pattern,root:Number($('guideRoot').value),bpm:Number($('guideBpm').value),noteSeconds:Number($('guideNoteSeconds').value),
  rounds:Number($('guideRounds').value),shift:Number($('guideShift').value),sound:$('guideSound').value,listenFirst:$('guideListenFirst').value==='on',
  tolerance:smooth?guideOptions().tolerance:Number($('guideToleranceSelect').value),volume:Number($('guideVolume').value)};
}
function updateGuidePlan(){
 const p=window.VoiceLineGuideTraining.plan(guideSettingsFromForm());
 const steps=p.roots.flatMap(root=>p.pattern.steps.map(offset=>root+offset));
 $('guideNoteSeconds').disabled=p.smooth;$('guideBpm').disabled=p.smooth||p.settings.noteSeconds>0;
 $('guideShift').disabled=p.infinite;if(p.infinite)$('guideShift').value='0';
 $('guideToleranceSelect').disabled=p.smooth;$('guideSmoothTolerance').hidden=!p.smooth;$('guideSmoothTolerance').disabled=!p.smooth;$('guideToleranceSelect').value=String(p.tolerance);
 $('guideVolumeValue').textContent=$('guideVolume').value+'%';
 $('guidePlanInfo').textContent='음역 '+noteLabel(Math.min(...steps))+' ~ '+noteLabel(Math.max(...steps))+
  ' · '+(p.smooth?'연속 왕복 12초':'한 음 '+(p.noteMs/1000).toFixed(1)+'초')+
  ' · '+(p.infinite?'같은 음역으로 계속 반복':'총 '+Math.ceil((p.duration+(p.settings.listenFirst?1800:3000))/1000)+'초')+
  (p.limited?' · 음역 경계에서 '+p.rounds+'회로 조정':'')+(p.settings.volume===0?' · 기준음 소리 꺼짐':'');
 $('guideMethodInfo').textContent=p.settings.listenFirst?'한 구절 듣기 → 3·2·1 → 따라 부르기. 듣기와 준비는 채점하지 않습니다.':'3·2·1 → 바로 따라 부르기. 음계·도약의 짧은 기준음이 재생되는 구간은 채점하지 않습니다. 이어폰 사용을 권장합니다.';
}
function openGuideSettings(trigger){
 if(app.training||app.micStartPromise||app.nativeStartResolve){notify('진행 중인 연습이나 마이크 연결을 중단한 뒤 설정해 주세요.');return;}
 const options=guideOptions(),root=$('guideRoot');root.replaceChildren();fillNotes(root,options.root);
 for(const [id,key]of Object.entries({guideRoot:'root',guideNoteSeconds:'noteSeconds',guideBpm:'bpm',guideRounds:'rounds',guideShift:'shift',guideSound:'sound',guideToleranceSelect:'tolerance',guideVolume:'volume'})){$(id).value=String(options[key]);$(id).onchange=updateGuidePlan;}
 $('guideListenFirst').value=options.listenFirst?'on':'off';$('guideListenFirst').onchange=updateGuidePlan;
 $('guideVolume').oninput=updateGuidePlan;app.guideSettingsReturnFocus=trigger;updateGuidePlan();modalOpen('guideSettingsDialog');
}
function applyGuideSettings(reset=false){
 if(app.training)return;
 saveGuideOptions(reset?window.VoiceLineGuideTraining.PRACTICE_DEFAULTS:guideSettingsFromForm());
 modalClose('guideSettingsDialog');modeControls();renderGuideTraining(performance.now(),true);
}
function startGuideSound(session,t){
 const api=window.VoiceLineGuideTraining,ac=ensureSynth();
 if(!api||!ac||ac.state!=='running'){notify('가이드 소리를 시작하지 못했습니다. 훈련 시작을 다시 눌러 주세요.');return false;}
 try{
  if(session.settings.sound==='piano'){
   const anchors=new Set(session.roots.flatMap(root=>session.pattern.steps.map(offset=>nearestAcousticMidi(root+offset))));
   // Decoding does not delay the response timeline. A soft synthesized piano
   // tone remains available if a bundled sample cannot be decoded.
   for(const anchor of anchors)void loadAcousticSample(anchor);
  }
  session.guidePlayer=api.createPlayer(ac,app.synthLimiter||ac.destination,midi=>{
   const anchor=nearestAcousticMidi(midi),buffer=acoustic.buffers.get(anchor);
   return buffer?{buffer,anchor,gain:Math.min(.12,calibratedPianoGain(anchor)*.66)}:null;
  },window,()=>{if(app.training===session){finishTraining(false);notify('가이드 오디오가 중단되었습니다. 다시 시작해 주세요.');}});
  session.guidePlayer.start(session,t);return true;
 }catch(error){session.guidePlayer?.stop();console.warn('Guide audio',error);notify('가이드 소리를 시작하지 못했습니다.');return false;}
}
function updateGuideTraining(a,t){
 const api=window.VoiceLineGuideTraining;api.advance(a,t);const p=api.position(a,t);
 a.target=p.phase==='answer'?Math.round(p.midi):null;
 if(Number.isFinite(a.target)&&!app.owners?.size&&(a.target<app.base||a.target>=app.base+(app.keyboardNotes||24))){app.base=targetKeyboardBase(a.target);drawKeys();}
 const label={ready:a.settings.listenFirst?'가이드 준비':'따라 부르기 준비',listen:'먼저 듣기',handoff:Math.ceil(p.answerIn/1000)+'초 뒤 시작',answer:'목표를 따라 부르세요',rest:'잠깐 쉬기'}[p.phase]||'완료';
 const rounds=(p.round+1)+'/'+(a.infinite?'∞':a.rounds)+'회';setMessage(rounds+' · '+label+' · '+a.pattern.label);
 progress(a.infinite?clamp(((t-a.start)%a.cycleMs)/a.cycleMs,0,1):clamp((t-a.start)/a.duration,0,1),t<a.start?Math.ceil((a.start-t)/1000)+'초 준비':rounds+' · '+label);
}
function renderGuideTraining(t=performance.now(),force=false){
 const panel=$('guideVoicePanel');if(!panel||panel.hidden)return;
 if(!force&&t-app.trainingLastDraw<70)return;app.trainingLastDraw=t;
 const api=window.VoiceLineGuideTraining,active=app.training?.mode==='guideVoice'?app.training:null,result=active?null:app.guideLastResult;
 const a=active||result||(app.guidePreview??=api.create(guideOptions(),t));
 const now=active?t:result?Math.min(a.start+a.duration,a.finishedAt??a.start+a.duration):a.start-1,p=api.position(a,now),m=api.metrics(a);
 const phase=active?p.phase:result?'done':'idle',cue=api.startCue(a,now);panel.dataset.phase=phase;
 const titles={idle:'음정 연습',ready:a.settings.listenFirst?'가이드 준비':'따라 부르기 준비',listen:'① 먼저 듣기',handoff:'② 따라 부르기 준비',answer:cue.starting?'지금 시작!':'목표를 따라 부르세요',rest:'잠깐 쉬세요',done:result?.completed?'연습 결과':'연습 중단'};
 const hints={idle:a.pattern.tip,ready:a.settings.listenFirst?'먼저 한 구절을 들으세요.':'3·2·1이 끝나면 첫 음부터 시작하세요.',listen:'가이드가 끝나면 3·2·1 후 따라 부릅니다.',handoff:'숫자가 끝나면 첫 음부터 부르세요.',
  answer:a.smooth?'민트색 목표를 따라 음을 끊지 않고 연결하세요.':'민트색 목표와 보라색 목소리를 겹쳐보세요.',rest:a.settings.listenFirst?'잠시 뒤 다음 가이드를 들려드립니다.':'잠시 뒤 다음 구절을 시작합니다.',done:api.evaluate(a,result?.completed??true).reason};
 $('guidePhaseTitle').textContent=titles[phase];$('guidePhaseHint').textContent=hints[phase];
 $('guideStartCue').hidden=!active||!cue.visible;
 if(active&&cue.visible){$('guideStartCount').textContent=cue.starting?'시작!':String(cue.count);$('guideStartText').textContent=cue.starting?'첫 음 '+noteLabel(cue.firstMidi):cue.count+'초 뒤 · 첫 음 '+noteLabel(cue.firstMidi)+'부터';}
 $('guideRoundInfo').textContent=(p.round+1)+'/'+(a.infinite?'∞':a.rounds)+'회 · 기준 '+noteLabel(a.roots[a.infinite?0:p.round]);
 $('guideTargetLabel').textContent='목표 '+noteLabel(p.midi);
 const last=result?[...a.history].reverse().find(v=>Number.isFinite(v.midi)):a.last;
 const liveMidi=Number.isFinite(last?.midi)&&(result||t-last.t<=210)?last.midi:null;
 $('guideDetectedLabel').textContent='내 음 '+(liveMidi===null?'—':noteLabel(liveMidi));
 const recent=liveMidi!==null&&(phase==='answer'||result);
 const reference=result&&last?api.position(a,last.t).midi:p.midi,cents=recent?Math.round((liveMidi-reference)*100):null;
 $('guideLiveCents').textContent=cents===null?'—':(cents>0?'+':'')+cents+' ¢';$('guideLiveCents').dataset.match=cents===null?'':Math.abs(cents)<=a.tolerance?'near':'away';
 $('guideLiveHint').textContent=recent?(Math.abs(cents)<=a.tolerance?'목표에 가깝습니다':cents>0?'조금 낮춰보세요':'조금 높여보세요'):phase==='listen'?'듣기 · 채점 제외':'목소리 대기';
 $('guideAccuracy').textContent=m.accuracy===null?'—':m.accuracy+'%';$('guideTolerance').textContent='목표 ±'+a.tolerance+'cent';
 $('guideCoverage').textContent=m.coverage+'%';$('guideCoverageHint').textContent='유효 발성 '+(a.voicedMs/1000).toFixed(1)+'초';
 api.draw($('guidePhraseGraph'),a,now,noteLabel);
}
function rememberFullRecordingPitch(t,midi){
 if(!app.record)return;
 const relative=app.record.type==='native-file'?app.recordCaptureMs:t-app.recordStart;
 if(!Number.isFinite(relative)||relative<0||relative-app.recordLastPitchAt<90)return;
 app.recordLastPitchAt=relative;
 const ms=Math.round(relative);
 // Cent precision; one measurement at most every 90ms, independently of audio storage.
 const point=[ms,Number.isFinite(midi)?Math.round(midi*100)/100:null];
 app.recordPitchTrack.push(point);
 if(app.record.type==='native-file'){
  app.record.pitchPending.push(point);
  if(ms-app.record.pitchSavedAt>=2000)flushFilePitch(app.record);
 }
}
function encodePcmChunk(chunk){
 const a=new Uint8Array(chunk.length*2);
 for(let i=0;i<chunk.length;i++){
  const v=Math.round(Math.max(-1,Math.min(1,chunk[i]))*(chunk[i]<0?32768:32767));
  a[2*i]=v&255;a[2*i+1]=(v>>8)&255;
 }
 return a;
}
function nativeSessionMetadata(record){
 return {id:record.id,timestamp:record.timestamp,date:record.date,sampleRate:record.targetRate,
  bytes:record.persistedBytes||0,
  pitchLow:record.pitchLow??null,pitchHigh:record.pitchHigh??null};
}
function stopForStorageFailure(record){
 if(record.storageStopRequested)return;
 record.storageStopRequested=true;
 setTimeout(()=>{
  if(app.record!==record)return;
  void stopActivity('storage').finally(()=>{
   resetMainAction();notify('녹음을 중단했습니다. 나의 기록에서 저장을 다시 시도해 주세요.');
  });
 },0);
}
function queueNativePcm(record,bytes){
 if(record.error||record.closed)return;
 if(record.totalBytes+bytes.length>0xffffffff-36)throw Error('녹음 파일이 WAV 최대 크기에 도달했습니다.');
 const pcm=new Uint8Array(bytes.length);
 for(let i=0;i<bytes.length;i++)pcm[i]=bytes.charCodeAt(i);
 record.partBuffer.push(pcm);record.bufferBytes+=pcm.length;record.totalBytes+=pcm.length;
 if(record.bufferBytes>=Math.round(record.targetRate*2*2))flushNativePcm(record);
}
function flushNativePcm(record){
 if(!record.partBuffer.length)return;
 const seq=record.nextPart++,partId=record.id+':'+String(seq).padStart(5,'0');
 const data=new Blob(record.partBuffer,{type:'application/octet-stream'});
 const pitchTrack=(record.pitchTrack||[]).slice(record.pitchSavedCount||0);record.pitchSavedCount=(record.pitchTrack||[]).length;
 record.partBuffer=[];record.bufferBytes=0;record.pendingParts=(record.pendingParts||0)+1;
 record.pending=record.pending.then(async()=>{
  if(record.error){record.failedParts.set(partId,{id:partId,sessionId:record.id,seq,data,pitchTrack});return;}
  try{
   await store('recordParts','put',{id:partId,sessionId:record.id,seq,data,pitchTrack});
   record.persistedBytes=(record.persistedBytes||0)+data.size;
   await store('recordSessions','put',nativeSessionMetadata(record));
  }catch(error){
   record.error=error;
   // Keeping the same ID also makes retry safe if the first transaction committed.
   record.failedParts.set(partId,{id:partId,sessionId:record.id,seq,data,pitchTrack});
   stopForStorageFailure(record);
  }
 }).finally(()=>{record.pendingParts--;});
 // A queued disk write is not a failed recording. Keep the same session alive
 // until Stop, a real input/storage error, or an actual background transition.
}
function wavHeader(byteLength,sampleRate){
 if(!Number.isInteger(byteLength)||byteLength<0||byteLength>0xffffffff-36)throw Error('WAV 파일 크기가 올바르지 않습니다.');
 const b=new ArrayBuffer(44),v=new DataView(b);
 const str=(off,s)=>{for(let i=0;i<s.length;i++)v.setUint8(off+i,s.charCodeAt(i));};
 str(0,'RIFF');v.setUint32(4,36+byteLength,true);str(8,'WAVE');str(12,'fmt ');
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);
 v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,byteLength,true);
 return b;
}
async function finalizeNativePcm(record){
 record.closed=true;flushNativePcm(record);await record.pending;
 if(record.error)throw record.error;
 const parts=(await readSessionParts(record.id)).sort((a,b)=>a.seq-b.seq);
 if(!parts.length||parts.length!==record.nextPart||parts.some((p,i)=>p.seq!==i))throw Error('녹음 분할 데이터가 누락되었습니다.');
 const byteLength=parts.reduce((total,p)=>total+p.data.size,0);
 if(byteLength!==record.totalBytes)throw Error('녹음 파일 크기가 올바르지 않습니다.');
 return new Blob([wavHeader(byteLength,record.targetRate),...parts.map(p=>p.data)],{type:'audio/wav'});
}
async function cleanupNativePcm(record){
 try{await removeSessionData(record.id);}catch(e){console.warn('Recording cleanup will retry later',e);}
}
function nativeFileResult(raw){
 const value=JSON.parse(raw||'{}');if(value.error)throw new Error(value.error);return value;
}
function flushFilePitch(record){
 if(!record.pitchPending?.length)return;
 const points=record.pitchPending;
 const error=window.VoiceLineNative.appendRecordingPitch(record.id,points.map(p=>p[0]+','+(p[1]??'null')).join('\n')+'\n');
 if(error){record.pitchError=error;stopForStorageFailure(record);return;}
 record.pitchPending=[];record.pitchSavedAt=points[points.length-1][0];record.pitchError=null;
}
function finishNativeFile(record){
 if(record.nativeInfo)return Promise.resolve(record.nativeInfo);
 if(record.finishing)return record.finishing;
 record.finishing=new Promise((resolve,reject)=>{
  const pending={requestId:String(record.requestId),recordingId:record.id,resolve,reject,timer:0};
  app.nativeFinish=pending;
  pending.timer=setTimeout(()=>{
   if(app.nativeFinish===pending)app.nativeFinish=null;
   reject(new Error('마지막 입력 저장을 확인하지 못했습니다. 나의 기록에서 복구해 주세요.'));
  },12000);
  try{window.VoiceLineNative.finishRecording(record.requestId,record.id);}
  catch(e){clearTimeout(pending.timer);app.nativeFinish=null;reject(e);}
 }).then(info=>{record.nativeInfo=info;return info;}).finally(()=>{record.finishing=null;});
 return record.finishing;
}
async function saveNativeFile(record){
 const info=record.nativeInfo||nativeFileResult(window.VoiceLineNative.getRecordingInfo(record.id));
 if(!Number.isFinite(info.frames)||info.frames<1||!Number.isFinite(info.sampleRate)||info.sampleRate<8000)throw Error('저장할 녹음이 없습니다.');
 const pitchTrack=(record.pitchTrack||info.pitchTrack||[]).filter(p=>Number.isFinite(p[0])&&p[0]>=0&&p[0]<=info.frames*1000/info.sampleRate);
 let low=record.pitchLow??null,high=record.pitchHigh??null;
 for(const [,midi] of pitchTrack)if(Number.isFinite(midi)){low=Math.min(low??midi,midi);high=Math.max(high??midi,midi);}
 const duration=info.frames/info.sampleRate;
 await store('recordings','put',{id:record.id,date:record.date||new Date(info.timestamp).toLocaleString('ko-KR'),
  timestamp:record.timestamp||info.timestamp,duration,mime:'audio/wav',size:44+info.bytes,title:'목소리 녹음',
  sourceType:'native-file',nativeFileId:record.id,pitchTrack,pitchLow:low,pitchHigh:high,category:'recording',recordingSessionId:record.id});
 // A failed commit marker is safe: the next recovery scan checks the DB before listing a draft.
 const error=window.VoiceLineNative.commitRecording(record.id);if(error)console.warn('Recording draft marker',error);
 if(app.failedRecording?.id===record.id)app.failedRecording=null;
 return duration;
}
async function retryRecording(record){
 if(record.type==='native-file')return saveNativeFile(record);
 if(record.pending)await record.pending;
 if(record.type==='native'){
  for(const [partId,part] of record.failedParts){await store('recordParts','put',part);record.failedParts.delete(partId);}
  record.error=null;
 }
 const blob=record.savedBlob||(record.type==='native'?await finalizeNativePcm(record):null);
 if(!blob||blob.size<128)throw Error('저장할 녹음이 없습니다.');
 const rate=record.targetRate;
 const duration=record.type==='native'?(blob.size-44)/(rate*2):record.duration;
 await store('recordings','put',{id:record.id,date:record.date,timestamp:record.timestamp,duration,
  blob,mime:blob.type,size:blob.size,title:'목소리 녹음',pitchLow:record.pitchLow??null,
  pitchHigh:record.pitchHigh??null,pitchTrack:record.pitchTrack||[],category:'recording',recordingSessionId:record.id});
 if(record.type==='native')await cleanupNativePcm(record);
 if(app.failedRecording?.id===record.id)app.failedRecording=null;
 return duration;
}
async function recoverRecording(session){
 if(app.record||app.recordSaving||app.stopPromise)throw Error('현재 녹음이 끝난 뒤 복구해 주세요.');
 const job=(async()=>{
  if(session.sourceType==='native-file'||app.failedRecording?.id===session.id&&app.failedRecording.type==='native-file'){
   const info=nativeFileResult(window.VoiceLineNative.getRecordingInfo(session.id));
   const failed=app.failedRecording?.id===session.id?app.failedRecording:null;
   return retryRecording({...session,...failed,type:'native-file',nativeInfo:info,pitchTrack:failed?.pitchTrack||info.pitchTrack});
  }
  if(app.failedRecording?.id===session.id)return retryRecording(app.failedRecording);
  if(await store('recordings','get',session.id)){await removeSessionData(session.id);return null;}
  const parts=(await readSessionParts(session.id)).sort((a,b)=>a.seq-b.seq);
  if(!Number.isFinite(session.sampleRate)||session.sampleRate<8000||!parts.length||parts.some((p,i)=>p.seq!==i))
   throw Error('완전한 녹음 자료가 없어 복구할 수 없습니다.');
  const record={...session,type:'native',targetRate:session.sampleRate,closed:true,nextPart:parts.length,
   pitchTrack:session.pitchTrack||parts.flatMap(p=>p.pitchTrack||[]),
   totalBytes:parts.reduce((n,p)=>n+p.data.size,0),partBuffer:[],pending:Promise.resolve(),failedParts:new Map(),error:null};
  return retryRecording(record);
 })();
 app.recordSaving=job;app.savingRecordId=session.id;
 try{return await job;}finally{if(app.recordSaving===job)app.recordSaving=null;app.savingRecordId=null;}
}
function startRecording(){
 if(app.record)return app.record;
 if(app.recordSaving)throw new Error('이전 녹음을 저장하는 중입니다.');
 if(!app.mic)throw new Error('마이크가 연결되지 않았습니다.');
 if(app.failedRecording)throw new Error('나의 기록에서 저장 실패한 녹음을 먼저 다시 저장하거나 삭제해 주세요.');
 app.sessionMode='record';
 app.recordStart=performance.now();app.recordPitchTrack=[];app.recordLastPitchAt=-Infinity;app.recordSignalRms=0;
 app.recordPitchSamples=[];app.recordPitchLow=null;app.recordPitchHigh=null;app.recordPitchFrozenAt=null;app.recordPitchLast=0;
 renderRecordPitchOverlay(app.recordStart,true);
 if(app.nativeMic){
   if(window.VoiceLineNative?.supportsFileRecording?.()){
    const record={type:'native-file',id:id(),date:stamp(),timestamp:Date.now(),requestId:app.nativeRequestId,
     pitchTrack:app.recordPitchTrack,pitchPending:[],pitchSavedAt:0,pitchLow:null,pitchHigh:null};
    const info=nativeFileResult(window.VoiceLineNative.beginRecording(record.requestId,record.id));
    record.startFrame=info.startFrame;record.targetRate=info.sampleRate;
    app.recordCaptureMs=null;app.record=record;return record;
   }
   // Compatibility with earlier bridges: one final WAV, temporary parts in IndexedDB.
   if(!Number.isFinite(app.nativeSampleRate)||app.nativeSampleRate<8000)throw new Error('마이크 입력 속도를 확인할 수 없습니다.');
   const record={type:'native',id:id(),date:stamp(),timestamp:Date.now(),targetRate:app.nativeSampleRate,
    partBuffer:[],bufferBytes:0,totalBytes:0,persistedBytes:0,nextPart:0,pendingParts:0,
    failedParts:new Map(),error:null,closed:false,pitchTrack:app.recordPitchTrack,pitchLow:null,pitchHigh:null};
   record.pending=store('recordSessions','put',nativeSessionMetadata(record)).catch(error=>{
    record.error=error;stopForStorageFailure(record);
   });
   app.record=record;
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
   mr.start();
   app.record={type:'media',id:id(),date:stamp(),timestamp:Date.now(),mr,complete};
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
  chunks.push(encodePcmChunk(out));
 };
 app.source.connect(processor);
 app.record={type:'pcm',id:id(),date:stamp(),timestamp:Date.now(),processor,silent,chunks,targetRate};
}
function wavBlob(chunks,sampleRate){
 const size=chunks.reduce((n,b)=>n+b.byteLength,0);
 return new Blob([wavHeader(size,sampleRate),...chunks],{type:'audio/wav'});
}
function recordTime(milliseconds){
 milliseconds=Number.isFinite(milliseconds)?Math.max(0,milliseconds):0;
 if(milliseconds>0&&milliseconds<1000)return (milliseconds/1000).toFixed(2)+'초';
 const seconds=Math.max(0,Math.floor(milliseconds/1000));
 return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
async function stopRecording(){
 if(app.recordSaving)return app.recordSaving;
 const r=app.record;if(!r)return;
 r.duration=Math.max(0,(performance.now()-app.recordStart)/1000);
 r.id=r.id||id();r.date=r.date||stamp();r.timestamp=r.timestamp||Date.now();
 app.savingRecordId=r.id;
 r.pitchTrack=app.recordPitchTrack;r.pitchLow=app.recordPitchLow;r.pitchHigh=app.recordPitchHigh;
 app.recordPitchFrozenAt=performance.now();if(r.type!=='native-file')app.record=null;
 renderRecordPitchOverlay(app.recordPitchFrozenAt,true);
 $('mainButton').textContent='저장 중…';$('mainButton').disabled=true;$('mainButton').classList.remove('recording');
 const job=(async()=>{
  try{
   if(r.type==='native-file'){
    r.nativeInfo=await finishNativeFile(r);
    flushFilePitch(r);
    r.pitchLow=app.recordPitchLow;r.pitchHigh=app.recordPitchHigh;
    app.record=null;
   }
   if(r.type==='native'&&!r.totalBytes){
    await r.pending;await cleanupNativePcm(r);
    notify('녹음 시간이 너무 짧아 저장할 소리가 없습니다.');progress(0,'녹음 시작 대기');return false;
   }
   if(r.type==='media'){
    if(r.mr.state!=='inactive')r.mr.stop();
    r.savedBlob=await r.complete;
   }else if(r.type==='pcm'){
    r.processor.onaudioprocess=null;app.source?.disconnect(r.processor);
    r.processor.disconnect();r.silent.disconnect();r.savedBlob=wavBlob(r.chunks,r.targetRate);
   }
   // Native capture uses its PCM length, not wall-clock time, for playback duration.
   if(r.type==='native')r.savedBlob=await finalizeNativePcm(r);
   const duration=await retryRecording(r);
   notify('처음부터 끝까지 한 개의 녹음으로 저장했습니다.');progress(1,recordTime(duration*1000)+' · 녹음 1개 저장됨');
   return true;
  }catch(e){
   console.error('Recording save failed',e);app.failedRecording=r;
   notify('녹음 저장에 실패했습니다. 나의 기록에서 다시 저장할 수 있습니다.');
   progress(0,'저장 실패 · 나의 기록에서 재시도');return false;
  }
 })();
 app.recordSaving=job;
 try{return await job;}
 finally{if(app.record===r)app.record=null;if(app.recordSaving===job)app.recordSaving=null;app.savingRecordId=null;$('mainButton').textContent='녹음 시작';$('mainButton').disabled=false;}
}
async function finishVibrato(){
 if(!app.vibratoStart)return;
 const elapsed=Math.floor((performance.now()-app.vibratoStart)/1000);
 app.vibratoStart=0;
 const v=app.vibratoSummary||app.vibratoLast;
 if(v){
  const age=Math.max(0,Math.floor((performance.now()-(v.measuredAt??performance.now()))/1000));
  await addEvent('비브라토 연습',v.rate.toFixed(1)+'Hz · ±'+Math.round(v.depth)+'cent · 전체 '+elapsed+'초 · 유효 측정 '+((app.vibratoValidMs||0)/1000).toFixed(1)+'초 · 마지막 유효 '+age+'초 전','vibrato');
 }
 else await addEvent('비브라토 연습',elapsed+'초 · 속도 추정 불가','vibrato');
 $('mainButton').textContent='비브라토 시작';
 notify('비브라토 연습을 종료했습니다.');
}
async function stopActivity(reason='user'){
 app.metronome?.stop();
 const wasRecording=Boolean(app.record||app.recordSaving||app.sessionMode==='record');
 // Keep the recording request alive until its final file acknowledgement.
 if(!app.record&&!app.recordSaving)cancelMicStart();
 if(app.stopPromise)return app.stopPromise;
 const task=(async()=>{
  try{
   if(app.record||app.recordSaving)await stopRecording();
   if(app.exercise)finishExercise(false);
   if(app.training)finishTraining(false);
   if(app.vibratoStart)await finishVibrato();
   if(app.mic){
    const duration=Math.round((performance.now()-app.sessionStart)/1000);
    if(!wasRecording&&app.sessionSamples>8&&(app.mode==='pitch'||app.mode==='piano'))
     await addEvent('음정 측정',noteLabel(app.sessionLow)+' ~ '+noteLabel(app.sessionHigh)+' · '+duration+'초'+(reason==='error'?' · 입력 중단':''),'pitch');
   }
  }finally{stopMic();}
 })();
 app.stopPromise=task;
 try{return await task;}finally{if(app.stopPromise===task)app.stopPromise=null;}
}
function resetMainAction(){
 const b=$('mainButton');
 b.classList.remove('recording');
 b.textContent=TRAINING_MODES.has(app.mode)?(app.mode==='practice'?'연습 시작':'훈련 시작'):app.mode==='record'?'녹음 시작':app.mode==='practice'?'연습 시작':app.mode==='vibrato'?'비브라토 시작':app.mode==='metronome'?'메트로놈 시작':'마이크 켜기';
 $('stopButton').hidden=true;
}
// Keep microphone control independent of the main activity button.
// A manual OFF must finish active recording/exercises rather than lose data.
function updateMicSensitivityControl(){
 const button=$('micSensitivity');if(!button)return;
 const label=MIC_SENSITIVITIES[app.micSensitivity].label;
 button.textContent='감도 '+label;
 button.setAttribute('aria-label','마이크 감도 '+label+'. 누르면 표준, 민감, 최대 순서로 변경');
 button.title='작은 목소리는 민감 또는 최대, 주변 소리에 반응하면 표준으로 조절하세요.';
}
function applyMicSensitivity(value){
 if(!Object.prototype.hasOwnProperty.call(MIC_SENSITIVITIES,value))return;
 app.micSensitivity=value;
 // Apply to the next analysis frame without restarting capture or a lesson.
 app.notes=[];app.lastTrustedPitchAt=0;
 try{localStorage.setItem(MIC_SENSITIVITY_KEY,value);}catch(_){}
 updateMicSensitivityControl();
}
$('micSensitivity').addEventListener('click',()=>{
 const levels=Object.keys(MIC_SENSITIVITIES);
 applyMicSensitivity(levels[(levels.indexOf(app.micSensitivity)+1)%levels.length]);
});
updateMicSensitivityControl();
$('micToggle').addEventListener('click',async()=>{
 if(app.busy||app.nativeStartResolve||app.stopPromise||app.recordSaving||app.lifeStopping)return;
 app.busy=true;updateMicToggle();
 try{
   if(app.mic){
     await stopActivity();
     resetMainAction();
     clearNote();
     // The popup from micStatus explains OFF; do not overwrite the exercise instructions.
     if(app.mode==='practice')setMessage(MODES.practice[1]);
   }else if(await startMic()){
     if(app.mode==='piano'){
       app.mode='pitch';
       $('modeChip').textContent=MODES.pitch[0];
       setTitle(MODES.pitch[0]);
       modeControls();
       syncPitchGraphOverlay(true);
     }
     if(app.mode==='pitch'){
       $('mainButton').textContent='마이크 끄기';
       $('stopButton').hidden=false;
     }
     // micStatus displays a readable floating microphone warning on ON.
     if(app.mode==='practice')setMessage(MODES.practice[1]);
   }
 }catch(e){
   console.warn('Microphone toggle failed',e);
   notify('마이크를 전환하는 중 문제가 발생했습니다.');
 }finally{
   app.busy=false;
   updateMicToggle();
 }
});
function syncMetronomeMode(){
 const active=app.mode==='metronome';
 $('app').classList.toggle('metronome-mode',active);
 const panel=$('metronomePanel');if(panel)panel.hidden=!active;
 $('keyboard').hidden=active;$('micToggle').hidden=active;
 if(active&&app.metronome)updateMetronomeSummary(app.metronome.settings);
}
function updateMetronomeSummary(settings){
 if(app.mode!=='metronome')return;
 $('noteHint').textContent='메트로놈 · 빠르기';
 $('noteName').textContent=String(settings.bpm);$('noteKorean').textContent='BPM';
 $('noteHz').textContent=settings.numerator+'/'+settings.denominator;$('noteCents').textContent=settings.subdivision+'분할';
}
async function switchMode(mode){
 if(mode==='glideVoice'||mode==='guideVoice')mode='practice'; // Preserve old links into the unified screen.
 if(!MODES[mode])return;
 if(app.busy||app.stopPromise||app.recordSaving||app.lifeStopping)return;app.busy=true;
 try{
  await stopActivity();allKeysOff();hideTrainingResult();app.mode=mode;app.detected=null;
  $('modeChip').textContent=MODES[mode][0];setTitle(MODES[mode][0]);setMessage(MODES[mode][1]);
  $('noteHint').textContent='건반·마이크 대기';
  clearNote();progress(0,'준비');modeControls();
  syncPitchGraphOverlay(true);syncVibratoOverlay();syncRecordPitchOverlay();syncTrainingOverlay();syncMetronomeMode();
  if(mode==='vibrato'){app.vibratoProgress=0;focusVibratoReference();}
  $('mainButton').textContent=TRAINING_MODES.has(mode)?(mode==='practice'?'연습 시작':'훈련 시작'):mode==='record'?'녹음 시작':mode==='practice'?'연습 시작':mode==='vibrato'?'비브라토 시작':app.mode==='metronome'?'메트로놈 시작':'마이크 켜기';
  $('mainButton').classList.remove('recording');$('stopButton').hidden=true;
  syncKeyColors();
 }finally{app.busy=false;updateMicToggle();}
}
$('mainButton').addEventListener('click',async()=>{
 if(app.micStartPromise||app.nativeStartResolve){cancelMicStart();resetMainAction();clearNote();return;}
 if(app.busy||app.stopPromise||app.recordSaving||app.lifeStopping)return;
 app.busy=true;const b=$('mainButton');b.disabled=true;
 try{
  if(app.mode==='metronome'){
   if(!app.metronome)throw Error('메트로놈을 불러오지 못했습니다.');
   await app.metronome.toggle();
  }else if(TRAINING_MODES.has(app.mode)){
   if(app.training)finishTraining(false);
   else {
    if((app.mode==='practice'||app.mode==='guideVoice')&&!window.VoiceLineGuideTraining){notify('가이드 연습을 불러오지 못했습니다. 앱을 다시 열어 주세요.');return;}
    // Unlock the mobile WebAudio instrument from this real tap. Permission
    // prompts may otherwise suspend later ear-training reference playback.
    // Tone.js must be unlocked synchronously by this user gesture BEFORE the
    // microphone-permission await. Otherwise the later reference note emitted
    // by requestAnimationFrame can remain silent on Android WebView.
    window.VoiceLineToneEngine?.unlock?.().catch(e=>console.warn('Piano unlock',e));
    if(app.mode==='practice'||app.mode==='guideVoice')ensureSynth();
    // Warmup cues use WebAudio unlocked from this tap.
    if(app.mode==='warmupVoice'||app.mode==='dynamicVoice'||!window.VoiceLineToneEngine)ensureSynth();
    if(app.mode==='warmupVoice'||await startMic())startTraining(performance.now());
   }
  }else if(app.mode==='record'){
   if(app.record){await stopRecording();stopMic();$('stopButton').hidden=true;}
   else if(app.failedRecording){notify('저장 실패한 녹음을 먼저 확인해 주세요.');await showHistory();}
   else if(await startMic()){
    try{startRecording();b.textContent='녹음 중지 · 저장';b.classList.add('recording');$('stopButton').hidden=false;progress(0,'녹음 중');}
    catch(e){notify('녹음을 시작할 수 없습니다.');stopMic();}
   }
  }else if(app.mode==='vibrato'){
   if(app.vibratoStart){await finishVibrato();stopMic();}
   else if(await startMic()){app.vibratoSamples=[];app.vibratoLast=null;app.vibratoSummary=null;app.vibratoValidMs=0;app.vibratoValidUntil=0;app.vibratoProgress=0;app.vibratoStart=performance.now();renderVibratoOverlay(performance.now(),true);b.textContent='비브라토 중지';$('stopButton').hidden=false;}
  }else{
   if(app.mic){await stopActivity();b.textContent='마이크 켜기';$('stopButton').hidden=true;}
   else if(await startMic()){if(app.mode==='piano'){app.mode='pitch';$('modeChip').textContent='음정 측정하기';setTitle('음정 측정하기');modeControls();syncPitchGraphOverlay(true);setMessage(MODES.pitch[1]);}b.textContent='마이크 끄기';$('stopButton').hidden=false;}
  }
 }finally{b.disabled=false;app.busy=false;updateMicToggle();}
});
$('stopButton').addEventListener('click',async()=>{
 if(app.micStartPromise||app.nativeStartResolve){cancelMicStart();resetMainAction();return;}
 if(app.busy)return;app.busy=true;
 try{await stopActivity();$('stopButton').hidden=true;$('mainButton').classList.remove('recording');$('mainButton').textContent=TRAINING_MODES.has(app.mode)?(app.mode==='practice'?'연습 시작':'훈련 시작'):app.mode==='record'?'녹음 시작':app.mode==='practice'?'연습 시작':app.mode==='vibrato'?'비브라토 시작':app.mode==='metronome'?'메트로놈 시작':'마이크 켜기';}
 finally{app.busy=false;updateMicToggle();}
});
function modalOpen(name){
 if(name==='infoDialog'){app.historyGeneration=(app.historyGeneration||0)+1;closeActiveAudio();}
 $(name).hidden=false;const focus=$(name).querySelector('.close-btn');focus?.focus();
 if(name==='menuDialog')$('menuOpen').setAttribute('aria-expanded','true');
}
function modalClose(name){
 if(name==='historyDeleteDialog'){historyDeleteCancelAction?.();return;}
 if(name==='trainingResultDialog'){hideTrainingResult();return;}
 $(name).hidden=true;
 if(name==='infoDialog'){app.historyGeneration=(app.historyGeneration||0)+1;closeActiveAudio();clearTimeout(app.historySearchTimer);}
 if(name==='recordToolsDialog'){for(const id of ['recordRename','recordSaveFile','recordShare','recordDelete'])$(id).onclick=null;app.recordToolsGeneration=(app.recordToolsGeneration||0)+1;const trigger=app.recordToolsReturnFocus;app.recordToolsReturnFocus=null;if(trigger&&trigger.isConnected!==false)trigger.focus?.();else $('infoClose').focus();return;}
 if(name==='warmupSettingsDialog'){const trigger=app.warmupSettingsReturnFocus;app.warmupSettingsReturnFocus=null;if(trigger&&trigger.isConnected!==false)trigger.focus?.();else $('modeGuideButton').focus();return;}
 if(name==='guideSettingsDialog'){const trigger=app.guideSettingsReturnFocus;app.guideSettingsReturnFocus=null;if(trigger&&trigger.isConnected!==false)trigger.focus?.();else $('modeGuideButton').focus();return;}
 if(name==='menuDialog'){$('menuOpen').setAttribute('aria-expanded','false');$('menuOpen').focus();}
 else if(name==='metronomeSettingsDialog'){
  const trigger=app.metroSettingsReturnFocus;app.metroSettingsReturnFocus=null;
  if(trigger&&trigger.isConnected!==false)trigger.focus?.();else $('metroSettingsOpen').focus();
 }
 else if(name==='infoDialog'&&modeGuideReturnFocus){modeGuideReturnFocus=false;$('modeGuideButton').focus();}
 else $('menuOpen').focus();
}
$('menuOpen').addEventListener('click',()=>modalOpen('menuDialog'));
$('menuClose').addEventListener('click',()=>modalClose('menuDialog'));
$('infoClose').addEventListener('click',()=>modalClose('infoDialog'));
$('recordToolsClose').addEventListener('click',()=>modalClose('recordToolsDialog'));
$('warmupSettingsClose').addEventListener('click',()=>modalClose('warmupSettingsDialog'));
$('warmupSettingsSave').addEventListener('click',()=>saveWarmupOptions());
$('warmupSettingsReset').addEventListener('click',()=>saveWarmupOptions(true));
$('guideSettingsClose').addEventListener('click',()=>modalClose('guideSettingsDialog'));
$('guideSettingsSave').addEventListener('click',()=>applyGuideSettings());
$('guideSettingsReset').addEventListener('click',()=>applyGuideSettings(true));
function openMetronomeSettings(tab='rhythm',focusTab=false,trigger=null){
 const tabs={rhythm:['metroTabRhythm','metroRhythmPanel'],presets:['metroTabPresets','metroPresetsPanel']};
 if(!tabs[tab])tab='rhythm';
 for(const [key,[button,panel]] of Object.entries(tabs)){
  $(button).setAttribute('aria-selected',String(key===tab));$(button).tabIndex=key===tab?0:-1;$(panel).hidden=key!==tab;
 }
 if($('metronomeSettingsDialog').hidden){app.metroSettingsReturnFocus=trigger||document.activeElement;modalOpen('metronomeSettingsDialog');}
 if(focusTab)$(tabs[tab][0]).focus();
}
$('metroSettingsOpen').addEventListener('click',()=>openMetronomeSettings('rhythm',false,$('metroSettingsOpen')));
$('metroFavoritesOpen').addEventListener('click',()=>openMetronomeSettings('presets',false,$('metroFavoritesOpen')));
for(const [index,tab] of ['rhythm','presets'].entries()){
 const button=$(['metroTabRhythm','metroTabPresets'][index]);
 button.addEventListener('click',()=>openMetronomeSettings(tab));
 button.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:(index+1)%2;
  openMetronomeSettings(['rhythm','presets'][next],true);
 });
}
$('metroSettingsClose').addEventListener('click',()=>modalClose('metronomeSettingsDialog'));
$all('.modal-backdrop').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)modalClose(el.id);}));
function topDialog(){return ['historyDeleteDialog','recordToolsDialog','warmupSettingsDialog','guideSettingsDialog','trainingResultDialog','metronomeSettingsDialog','infoDialog','menuDialog'].find(id=>!$(id).hidden)||null;}
function closeTopDialog(){const top=topDialog();if(!top)return false;modalClose(top);return true;}
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&closeTopDialog()){e.preventDefault();e.stopPropagation();return;}
 if(e.key==='Tab'){
  const top=topDialog();if(!top)return;
  const focusable=[...$(top).querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),[tabindex="0"]')].filter(el=>el.tabIndex>=0&&el.getClientRects().length);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)||!$(top).contains(document.activeElement)){
   e.preventDefault();(e.shiftKey?last:first).focus();
  }
 }
});
$all('[data-screen]').forEach(b=>b.addEventListener('click',async()=>{
 const mode=b.dataset.screen;modalClose('menuDialog');
 if(mode==='history')await showHistory();
 else if(mode==='help')showHelp();
 else await switchMode(mode);
}));
function plain(node,tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;node.append(el);return el;}
// Each practice mode has its own on-demand guidance. Nothing instructional
// scrolls inside the narrow header; tap the small button beside its title.
// Keep guidance factual: these are app detection thresholds, not health advice.
const MODE_GUIDES={
 metronome:{intro:'빠르기와 현재 박을 크게 표시하는 메트로놈입니다. 마이크나 녹음 없이 사용할 수 있습니다.',
  steps:['큰 BPM 숫자, +/− 또는 슬라이더로 20~300 BPM을 정합니다. +/−는 한 번 누르면 1 BPM, 길게 누르면 0.4초 뒤부터 연속 조절합니다. 손을 떼거나 버튼 밖으로 이동하면 멈춥니다. BPM을 바꿔도 현재 마디는 이어집니다.',
   '현재 박과 마디는 BPM과 함께 표시합니다. 박자 설정 영역에서 박자표·BPM 기준·세분을 바로 고르거나 직접 박자표의 분자/분모를 바꿉니다. 세로 화면에서는 설정이 BPM 아래에 있습니다. 1~64박, 분모 1·2·4·8·16·32·64를 지원합니다. 6/8, 점4분음표 60 BPM은 한 마디 2초입니다.',
   '강세 묶음에 2+2+3처럼 한 마디 박 수와 합계가 같은 값을 입력하고 적용을 누릅니다. 기본 강세로를 누르면 현재 박자표의 기본 강세로 돌아갑니다. 박별 강세를 열면 각 박을 강세 → 보통 → 묵음 순으로 바꿀 수 있습니다. 박이 많으면 페이지를 넘깁니다.',
   '클릭 소리에서 클릭·우드·벨을 고르고 음량 슬라이더를 바로 조절합니다. 소리·음소거·음량을 바꿔도 박은 이어집니다. 저장 리듬에서 현재 설정을 이름으로 저장하고 불러옵니다.',
   '끄기·다른 모드 이동·앱 이탈에서 예약된 클릭도 취소합니다. 박자표·기준 음표·세분·강세를 바꾸면 첫 박부터 시작합니다. 초당 50회를 넘는 클릭 조합은 안내하고 적용하지 않습니다.'],
  rule:'연습·녹음 기록은 만들지 않습니다. 현재 설정과 이름 붙인 리듬 최대 24개를 기기에 보관합니다.'},
 piano:{intro:'흰 건반과 검은 건반을 눌러 음을 재생하는 기본 피아노 화면입니다.',steps:['건반은 여러 개를 동시에 누를 수 있으며, −/+로 표시 옥타브를 이동합니다. 세로에서는 1옥타브, 가로에서는 2옥타브가 표시됩니다.','피아노 음량 슬라이더는 휴대폰 전체 미디어 볼륨을 변경하지 않습니다.'],rule:'마이크를 켜면 음정 측정 모드로 전환합니다.'},
 pitch:{intro:'마이크로 입력한 목소리의 음높이를 음표와 피아노 건반으로 보여줍니다.',steps:['상단 마이크 켜기를 누르고 한 음을 편안하게 불러보세요.','보라색 건반은 현재 감지된 음정이며, 음정 카드에는 음표·옥타브·Hz·cent가 표시됩니다.','그래프는 최근 6초의 음높이와 최저·최고음을 보여줍니다. 축에도 계이름과 옥타브를 표시하고 음정이 확인되지 않는 구간은 비워둡니다. 마이크를 끄면 마지막 그래프가 남고 다시 켜면 새 측정을 시작합니다.'],rule:'마이크 또는 피아노 소음이 섞이면 측정값이 달라질 수 있습니다.'},
 record:{intro:'음성을 녹음하고 동시에 목소리 음높이 변화를 확인합니다.',steps:['녹음 시작을 한 번 누른 뒤 평소처럼 발성합니다. 잠깐 쉬거나 무음이 있어도 같은 녹음으로 계속 이어집니다.','실시간 그래프는 최근 6초를 보여주며 녹음 파일은 처음부터 전부 이어집니다. 저장 후 전체 재생에서 처음부터 끝까지 들을 수 있습니다.','녹음 중지·저장을 누르면 기기에 녹음 파일이 보관됩니다. 저장 실패나 앱 중단 시 나의 기록에서 복구 가능한 녹음을 확인하세요.'],rule:'사용자가 중지하면 녹음 1개를 저장합니다. 녹음 기록은 나의 기록의 녹음 탭에만 표시하고 연습 기록에는 남기지 않습니다. 앱을 벗어나거나 실제 입력·저장 오류가 발생하면 그 시점까지 한 파일로 저장합니다.'},
 vibrato:{intro:'한 음을 유지하며 비브라토의 흔들림 폭과 속도를 추정합니다.',steps:['연습 기준음을 지정하고 비브라토 시작을 누릅니다.','민트색 선은 선택한 기준음이며 보라색 곡선은 실제 목소리의 음높이입니다.','측정 중 상태가 길어지면 그래프의 진단 안내를 확인하세요.'],rule:'최근 3초 자료에서 기준음 ±150cent, 유효 자료 16개 이상·0.9초 이상, 진폭 ±7~125cent, 속도 3~9Hz, 일정한 주기 4개 이상을 확인합니다. 상세 기준은 「ⓘ 측정 기준」 버튼으로 확인할 수 있습니다.'},
 practice:{intro:'음계·도약과 연속 슬라이드를 하나의 화면에서 연습합니다.',steps:['종류에서 음계·도약 또는 연속 슬라이드를 고르고 패턴을 선택합니다. 중복 패턴은 한 목록으로 통합했습니다.','연습 설정에서 시작음, 반복 횟수, 빠르기와 먼저 듣기를 조절합니다. 먼저 듣기를 끄면 3·2·1 후 바로 따라 부릅니다. 켜면 한 구절을 듣고 준비 후 따라 부릅니다.','가로 화면은 큰 건반 위 중앙에 반투명 그래프를 표시합니다. 그래프는 최대 6초 구간을 따라가며 민트색 목표와 보라색 목소리를 비교합니다. 축에 계이름·옥타브를 표시합니다.','연속 슬라이드는 목표선을 따라 음을 끊지 않고 연결합니다. 소리가 없는 구간은 비워 두며 정확도와 충분히 발성했는지를 함께 확인합니다.','같은 시작 버튼이 연습 중단으로 바뀝니다. 마이크 연결 중에는 연결 취소로 바뀝니다. 계속 반복은 중단할 때까지 같은 음역을 반복합니다.'],rule:'음계·도약은 선택한 ±35·50·75cent, 연속 슬라이드는 ±110cent로 확인합니다. 정확도 65% 이상, 발성 40% 이상과 각 음·이동 구간 20% 이상이 필요합니다. 충분한 발성이 없으면 측정 부족으로 표시합니다. 기준음 재생·준비·듣기는 채점에서 제외합니다. 이어폰을 권장합니다.'},
 guideVoice:{intro:'가이드를 듣고 음을 오르내리는 음역 슬라이드입니다. 음계·도약과 기존의 단계별 왕복·연속 슬라이드를 한 패턴 목록에 통합했습니다.',
  steps:['패턴은 음계·도약 10종, 3·5·7·12반음 단계별 왕복 4종, 같은 범위의 연속 슬라이드 4종으로 총 18종입니다. 연습 설정에서 시작음과 1~5회 반복을 정합니다.',
   '음계·단계별은 50~120 BPM에 맞추거나 한 음을 2·3·4초 유지하도록 정할 수 있습니다. 연속 패턴은 6초 이동 후 6초 되돌아오는 12초 왕복이며, 높은 시작음에서는 감지 가능한 범위 안에서 아래로 왕복합니다.',
   '피아노·허밍 톤·모음 톤과 전용 음량을 선택합니다. 일반 패턴의 피아노는 포함 음원을 사용하며, 연속 패턴은 음이 끊기지 않도록 선택한 소리의 합성 지속음을 사용합니다.',
   '훈련 시작 후 ① 가이드 듣기로 한 구절을 듣습니다. 이어지는 ② 준비에서 큰 숫자 3·2·1을 보고, ③ 지금 시작!이 나오면 왼쪽 첫 음 시작선부터 같은 구절을 부릅니다. 준비는 3초이며 채점하지 않습니다. 따라 부를 때 가이드 소리는 나오지 않습니다.',
   '민트색 선은 목표 음정, 보라색 선과 점은 내 목소리입니다. 연속 패턴은 기울어진 목표선을 따라 음을 끊지 않고 연결하세요. 차이 +cent는 높게, −cent는 낮게 부른 것입니다.',
   '한 회차를 마치면 잠깐 쉬고 다시 가이드를 듣습니다. 같은 음역 반복 또는 반음씩 올리기·내리기를 선택합니다. 감지 가능한 C2~A♯6 안에 들어오도록 시작음을 조정하고 음역 경계에서 반복을 끝냅니다.'],
  rule:'듣기·준비·쉬기는 채점하지 않습니다. 일반 패턴은 음마다 처음 0.1초를 제외하고 ±35·50·75cent, 연속 패턴은 응답 처음 0.1초만 제외하고 ±110cent로 측정합니다. 성공은 일치율 65% 이상, 전체 발성 40% 이상, 각 음(연속은 올리기·내리기 각 절반의 4구간) 20% 이상 발성, 측정 12개 이상이 필요합니다. 부족하면 측정 부족으로 표시하고 결과는 연습 기록에만 저장합니다.'},
 sustainVoice:{intro:'하나의 목표음을 안정적으로 유지하는 연습입니다.',steps:['시작음과 5·8·12초 유지 시간을 선택합니다.','기준음을 짧게 들은 뒤 편안하게 같은 음을 유지합니다.','음높이 그래프와 목표 음정 일치율을 확인합니다.'],rule:'기준음 ±35cent 일치율 65% 이상과 충분한 유효 발성 시간이 있어야 성공입니다.'},
 earVoice:{intro:'피아노 음을 귀로 듣고 같은 높이로 따라 부르는 청음 연습입니다.',steps:['먼저 1.5초 동안 정답 건반을 숨긴 채 피아노 음을 듣습니다.','이어지는 약 3.2초 동안 목표 건반이 민트색으로 표시되면 그 음을 따라 부릅니다.','한 회차에 3·4·5개 음을 선택할 수 있습니다.'],rule:'목표음 ±35cent 일치율 65% 이상과 답변 단계의 충분한 유효 발성 시간이 필요합니다.'},
 dynamicVoice:{intro:'같은 음정을 유지하면서 목소리의 상대적인 크기를 조절합니다.',steps:['준비 시간에 기준음을 먼저 듣고 같은 음높이로 시작합니다.','약하게 0~3초 → 중간 세기 3~6초 → 강하게 6~9초 → 다시 약하게 9~12초 순서로 각 3초씩 발성합니다.','지금 할 발성, 단계 남은 시간과 다음 발성 안내를 보고 숫자가 바뀌면 세기를 바꿉니다. 위쪽 약·중·강·약 표시에서도 현재 단계가 켜집니다.','안내음 켜짐을 선택하면 각 단계 시작에 짧은 소리가 나옵니다. 안내음이 울리는 짧은 구간은 발성 판정에서 제외됩니다. 안내음을 꺼도 화면 안내는 계속 보입니다.','휴대폰과 입 사이의 거리를 고정하고 편안한 범위에서 소리 크기만 조절하세요.'],rule:dynamicRuleText()+' (12개 이상 감지). 상대 음량만 비교하며 절대 데시벨이나 성대 상태는 측정하지 않습니다.'},
 warmupVoice:{intro:'허밍을 시작할 시점을 화면과 안내음으로 알려주는 호흡·허밍 타이머입니다.',steps:['기본은 4초 들이쉬기 → 6초 내쉬기 → 6초 허밍 → 3초 쉬기입니다. 시간·안내음에서 단계별 초와 소리를 바꿀 수 있습니다. 허밍은 내쉬기를 마친 다음 시작합니다.', '초록색 「지금 허밍하세요」와 딩딩 두 번의 높은 소리가 나오면 입을 가볍게 다물고 편안하게 「음~」 하세요. 설정한 허밍 시간이 지나면 다음 단계 안내에 맞춰 허밍을 멈춥니다. 쉬기 0초는 생략합니다.', '화면에 현재 단계, 남은 초, 다음 단계와 순서가 표시됩니다. 다른 단계는 짧은 안내음 한 번으로 구분합니다. 소리가 나지 않아도 화면 안내로 진행할 수 있습니다.', '원하는 세트 수를 선택합니다. 설정한 쉬기 시간 후 다음 세트의 들이쉬기가 시작되며, 중단하거나 앱을 벗어나면 남은 안내음도 취소합니다.'],rule:'이 기능은 안내형 타이머이며 실제 호흡량이나 발성 건강을 판단하지 않습니다. 통증이나 어지러움이 있다면 중단하세요.'}
};
let modeGuideReturnFocus=false;
function showModeGuide(mode=app.mode){
 if(mode==='glideVoice')mode='guideVoice';
 const guide=MODE_GUIDES[mode];if(!guide)return;
 const b=$('infoBody');b.replaceChildren();
 $('infoTitle').textContent=(MODES[mode]?.[0]||'훈련')+' · 설명';
 plain(b,'p','mode-guide-intro',guide.intro);
 plain(b,'h3','mode-guide-section','연습 방법');
 const steps=plain(b,'ol','mode-guide-steps');
 for(const sentence of guide.steps)plain(steps,'li','',sentence);
 plain(b,'h3','mode-guide-section','측정·판정 기준');
 plain(b,'p','mode-guide-rule',guide.rule);
 if(mode!=='metronome'&&mode!=='piano')plain(b,'p','mode-guide-caution','감도 버튼으로 표준 → 민감 → 최대를 선택합니다. 기본은 민감이며 작은 목소리는 최대, 주변 소리에 반응하면 표준으로 조절하세요. 설정은 기기에 보관되고 녹음 중에도 바꿀 수 있습니다. 녹음 파일의 실제 소리 크기는 바뀌지 않습니다.');
 if(mode!=='metronome')plain(b,'p','mode-guide-caution','목소리 측정은 참고용입니다. 피아노 소리가 마이크에 섞이면 결과가 달라질 수 있으므로 이어폰을 권장합니다.');
 modeGuideReturnFocus=true;
 modalOpen('infoDialog');
}
$('modeGuideButton').addEventListener('click',()=>showModeGuide());
/** Exact active algorithm thresholds, shown independently inside vibrato mode.
 * This is a signal-detection filter; not a requirement for healthy singing.
 */
function showVibratoCriteria(){
 $('infoTitle').textContent='비브라토 측정 기준';
 const b=$('infoBody');b.replaceChildren();
 plain(b,'p','vibrato-criteria-intro',
  '소리를 길게 내는 시간만으로 완료되는 방식이 아닙니다. 아래 조건을 최근 3초 안에서 함께 충족하면 비브라토 속도를 추정합니다.');
 const criteria=[
  ['음정 입력 간격','안드로이드 마이크 약 46ms(44.1kHz) / 약 64ms(16kHz) 간격으로 음성 데이터가 들어옵니다. 프로그램은 약 35ms마다 분석을 시도하지만, 실제 새 음정 데이터는 입력 묶음 간격에 따라 갱신됩니다.'],
  ['분석 시간','최근 3초의 측정 자료를 사용합니다. 3초를 넘게 불러도 계속 최근 3초를 새로 판단합니다.'],
  ['선택한 기준음','실제 목소리가 선택한 기준음에서 ±150cent(±1.5반음) 이내인 측정값만 사용합니다.'],
  ['최소 음정 자료','유효 측정점 16개 이상이고, 첫 번째부터 마지막 유효 측정점까지 최소 0.9초가 필요합니다.'],
  ['비브라토 진폭','음높이 흔들림 추정 폭이 ±7~125cent여야 합니다. 그래프의 ±cent는 최근 음정의 10~90백분위 간격을 반으로 나눈 추정치입니다.'],
  ['비브라토 속도','한 초에 3~9번 반복하는 흔들림(3~9Hz)을 대상으로 추정합니다. 이 구간은 앱의 감지 설정이며 모든 발성에 적용되는 절대적인 적정 기준은 아닙니다.'],
  ['흔들림의 반복','무음·기준음 이탈·160ms를 넘는 공백이 없는 한 구간에서 신뢰할 만한 연속 흔들림 주기 4개 이상이 필요합니다. 주기 길이는 105~550ms로 탐지되며 중앙값과 ±35% 이내로 일치하는 주기만 집계합니다.'],
  ['측정 불가 이유','기준음이 다르거나, 진폭이 작거나, 주기가 부족하거나 불규칙하면 측정 중으로 남습니다. 그래프 안에 현재 미충족 사유와 유효 주기 수(0~4)를 표시합니다.'],
 ];
 for(const [title,description] of criteria){
  plain(b,'h3','vibrato-criteria-heading',title);
  plain(b,'p','',description);
 }
 plain(b,'p','vibrato-criteria-note','참고용 음정 분석입니다. 마이크에 피아노 소리가 섞이면 결과가 달라질 수 있으므로 이어폰을 권장합니다.');
 modalOpen('infoDialog');
}
function showHelp(){
 $('infoTitle').textContent='사용법';const b=$('infoBody');b.replaceChildren();
 const sections=Object.entries(MODE_GUIDES).filter(([mode])=>mode!=='guideVoice').map(([mode,guide])=>[
  MODES[mode][0],[guide.intro,...guide.steps,'측정·판정: '+guide.rule].join(' ')
 ]);
 sections.push(
  ['가로·세로 화면','휴대폰의 자동 회전 설정에 따라 가로·세로로 사용할 수 있습니다. 세로에서는 건반 1옥타브와 두 줄 설정을, 가로에서는 건반 2옥타브와 넓은 그래프를 표시합니다. 회전해도 녹음과 훈련 시간은 이어지고 누르고 있던 건반과 BPM 길게 누르기는 해제됩니다. 기록·긴 설명·키보드가 열린 작은 화면에서는 필요한 스크롤을 사용할 수 있습니다.'],
  ['측정 가능한 음역','음정 측정과 훈련 목표는 '+noteLabel(PITCH_RANGE.minMidi)+' ~ '+noteLabel(PITCH_RANGE.maxMidi)+' 범위를 사용합니다. 높은 시작음의 패턴과 슬라이드는 아래쪽으로 전환할 수 있습니다.'],
  ['나의 기록과 개인정보','녹음 파일과 모든 보컬 훈련·음정 측정 기록은 기기 내부에만 보관합니다. 나의 기록은 녹음·연습 탭으로 나뉩니다. 녹음 탭에서 전체 재생·구간 이동·삭제와 저장 실패한 녹음 다시 저장을 할 수 있습니다. 앱 중단으로 복구한 녹음은 마지막으로 저장된 구간까지 포함합니다. 앱 삭제나 데이터 초기화 시 함께 삭제됩니다.'],
  ['피아노 음원 및 저작권','피아노 연주 엔진: @tonejs/piano, Tone.js (Yotam Mann, MIT). 그랜드 피아노 녹음: Salamander Grand Piano / Alexander Holm, CC BY 3.0. 원본: https://github.com/tambien/Piano . 라이선스: https://creativecommons.org/licenses/by/3.0/ . 음원과 라이브러리는 APK에 포함되어 오프라인에서도 연주할 수 있습니다.'],
  ['마이크와 피아노 소리','피아노와 메트로놈 소리가 마이크에 들어가면 음정·박자 판정에 영향을 줄 수 있습니다. 이어폰을 권장합니다. 마이크를 끄거나 앱을 벗어나면 활동을 종료하고 녹음을 저장합니다. 음정 측정에는 기기 입력 지연과 주변 소음의 영향이 있을 수 있습니다.'],
  ['주의','목이 아프거나 어지러우면 중단하세요. 측정은 참고용이며 의료적 진단이 아닙니다.']
 );
 for(const [title,body] of sections){plain(b,'h3','',title);plain(b,'p','',body);}
 modalOpen('infoDialog');
}
// Use an app-designed confirmation instead of window.confirm(). Android WebView
// prefixes native JS confirms with https://appassets.androidplatform.net, a URL
// that is not relevant to the user and cannot be hidden within confirm().
// The promise keeps cancellation and successful deletion flows unchanged.
let historyDeletePending=false;
let historyDeleteCancelAction=null;
function requestHistoryDeleteConfirmation(kind){
 if(historyDeletePending)return Promise.resolve(false);
 historyDeletePending=true;
 const dialog=$('historyDeleteDialog');
 const cancel=$('historyDeleteCancel');
 const approve=$('historyDeleteConfirm');
 const trigger=document.activeElement;
 $('historyDeleteTitle').textContent=kind==='recovery'?'미완료 녹음 삭제':kind==='recordings'?'녹음 파일 삭제':'연습 기록 삭제';
 $('historyDeleteText').textContent=kind==='recovery'?'저장하지 못한 녹음을 삭제하시겠습니까?':kind==='recordings'
  ?'선택한 녹음 파일을 삭제하시겠습니까?'
  :'선택한 연습 기록을 삭제하시겠습니까?';
 dialog.hidden=false;
 cancel.focus();
 return new Promise(resolve=>{
  let finished=false;
  const finish=ok=>{
   if(finished)return;
   finished=true;
   historyDeletePending=false;historyDeleteCancelAction=null;
   dialog.hidden=true;
   cancel.removeEventListener('click',onCancel);
   approve.removeEventListener('click',onApprove);
   dialog.removeEventListener('click',onBackdrop);
   document.removeEventListener('keydown',onKeydown,true);
   // After a confirmed delete the triggering row may be removed shortly,
   // so restore focus on the currently open records dialog instead.
   if(!ok&&trigger?.isConnected)trigger.focus();
   else $('infoClose')?.focus();
   resolve(ok);
  };
  historyDeleteCancelAction=()=>finish(false);
  const onCancel=()=>finish(false);
  const onApprove=()=>finish(true);
  const onBackdrop=e=>{if(e.target===dialog)finish(false);};
  const onKeydown=e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation?.();finish(false);return;}
   if(e.key==='Tab'){
    const focus=e.shiftKey?cancel:approve;
    if(document.activeElement===focus){e.preventDefault();(e.shiftKey?approve:cancel).focus();}
   }
  };
  cancel.addEventListener('click',onCancel);
  approve.addEventListener('click',onApprove);
  dialog.addEventListener('click',onBackdrop);
  document.addEventListener('keydown',onKeydown,true);
 });
}
function makeHistorySection(body,label,emptyMessage){
 const section=plain(body,'section','history-section');
 const heading=plain(section,'h3','history-section-heading',label+' (0)');
 const list=plain(section,'div','history-items');
 const empty=plain(section,'p','history-empty',emptyMessage);
 const refresh=()=>{
  const count=list.children.length;
  heading.textContent=label+' ('+count+')';
  empty.hidden=count!==0;
 };
 refresh();
 return {section,list,empty,refresh};
}
async function deleteHistoryRow(kind,itemId,row,section,button){
 if(button.disabled)return false;
 if(!await requestHistoryDeleteConfirmation(kind))return false;
 button.disabled=true;button.textContent='삭제 중…';
 try{
  // store() resolves only after the deletion transaction commits.
  if(kind==='recordings'){
   const full=await store('recordings','get',itemId);
   await removeSessionData(itemId,true,full?.sourceType==='native-file'?full.nativeFileId:null);
   if(full?.sourceType==='native-file')void cleanupDeletedNativeFiles();
  }
  else await store(kind,'delete',itemId);
  if(kind==='recordings'&&app.openAudioRecordId===itemId)closeActiveAudio();
  row.remove();
  // Update counter AND empty-state in the *currently open* dialog.
  // Do not rebuild the entire dialog: other recordings can keep playing,
  // and scrolling/focus are not reset when deleting a distant row.
  section.refresh();
  notify(kind==='recordings'?'녹음을 삭제했습니다.':'기록을 삭제했습니다.');
  return true;
 }catch(e){
  console.error('Unable to delete history entry',e);
  button.disabled=false;button.textContent='삭제';
  notify('삭제에 실패했습니다. 저장 공간을 확인해 주세요.');
  return false;
 }
}
// Older versions also inserted a 'record' event whenever a recording was
// saved. Do not delete these legacy entries from IndexedDB: simply keep them
// out of the practice-only list, preserving all existing recordings and data.
function isPracticeHistoryEvent(event){
 if(!event||typeof event!=='object')return false;
 const mode=String(event.mode||event.type||'').toLowerCase().replace(/[-_\s]/g,'');
 if(['record','recording','recorder','voicerecord','recordvoice','audio'].includes(mode))return false;
 if(event.category==='recording'||event.recordingSessionId||event.blob||event.audioBlob)return false;
 return !/녹음|\brecord(?:ing|ed)?\b/i.test(String(event.title||''));
}
async function renderRecoverableRecordings(body,isCurrent){
 const sessions=await store('recordSessions','getAll');
 if(window.VoiceLineNative?.getPendingRecordings){
  const drafts=JSON.parse(window.VoiceLineNative.getPendingRecordings()||'[]');
  for(const draft of drafts)sessions.push({...draft,date:draft.timestamp>0?new Date(draft.timestamp).toLocaleString('ko-KR'):'시각 정보 없음'});
 }
 const deleted=new Set((await store('recordFileDeletes','getAll')).map(item=>item.id));
 const available=[];
 for(const session of sessions){
  if(deleted.has(session.id))continue;
  if(!isCurrent())return;
  if(session.id===app.record?.id||session.id===app.savingRecordId)continue;
  if(await store('recordings','count',session.id)){
   if(session.sourceType==='native-file')window.VoiceLineNative.commitRecording(session.id);else await cleanupNativePcm(session);
   continue;
  }
  available.push(session);
 }
 const failed=app.failedRecording;
 if(failed&&!available.some(s=>s.id===failed.id))available.unshift({id:failed.id,date:failed.date,timestamp:failed.timestamp,sourceType:failed.type});
 if(!isCurrent()||!available.length)return;
 const section=plain(body,'section','recovery-section');
 plain(section,'h3','','저장하지 못한 녹음');
 plain(section,'p','','공간을 확보한 뒤 다시 저장할 수 있습니다. 앱이 중단된 녹음은 마지막으로 보관된 구간까지 복구합니다.');
 if(failed)plain(section,'p','recovery-warning','아직 기기에 저장하지 못한 구간은 앱을 종료하면 사라질 수 있습니다. 먼저 다시 저장해 주세요.');
 for(const session of available){
  const row=plain(section,'div','history-row');
  plain(row,'span','',session.date||'미완료 녹음');
  if(session.recoveryError)plain(row,'p','recovery-error',session.recoveryError);
  const actions=plain(row,'div');
  const recover=plain(actions,'button','','다시 저장');
  const discard=plain(actions,'button','danger','삭제');
  recover.disabled=Boolean(session.recoveryError);
  if(session.sourceType==='native-file'){const save=plain(actions,'button','','원본 파일 저장');save.onclick=async()=>{save.disabled=true;try{await exportRecordingFile({...session,title:'미완료 녹음',mime:'audio/wav'},'save');}catch(e){notify(e.message);}finally{save.disabled=false;}};}
  recover.onclick=async()=>{
   recover.disabled=true;discard.disabled=true;recover.textContent='저장 중…';
   try{await recoverRecording(session);notify('녹음을 저장했습니다.');if(isCurrent())await showHistory();}
   catch(e){console.error('Recording recovery failed',e);notify(e.message||'저장 공간을 확보한 뒤 다시 시도해 주세요.');}
   finally{recover.disabled=false;discard.disabled=false;recover.textContent='다시 저장';}
  };
  discard.onclick=async()=>{
   if(app.recordSaving||app.record?.id===session.id)return;
   if(!await requestHistoryDeleteConfirmation('recovery'))return;
   if(app.recordSaving)return;
   recover.disabled=true;discard.disabled=true;
   try{
    if(session.sourceType==='native-file'){
     const error=window.VoiceLineNative.deleteRecording(session.id);if(error)throw Error(error);
    }else await removeSessionData(session.id);
    if(app.failedRecording?.id===session.id)app.failedRecording=null;
    row.remove();notify('미완료 녹음을 삭제했습니다.');
    if(isCurrent())await showHistory();
   }catch(e){notify('삭제하지 못했습니다. 다시 시도해 주세요.');}
   finally{recover.disabled=false;discard.disabled=false;}
  };
 }
}
async function exportRecordingFile(record,operation,onProgress=notify){
 if(app.record||app.recordSaving||app.stopPromise)throw Error('현재 녹음을 중지하고 저장한 뒤 파일을 내보내 주세요.');
 if(!window.VoiceLineDocuments)throw Error('파일 기능을 준비하지 못했습니다. 앱을 다시 열어 주세요.');
 const result=await window.VoiceLineDocuments.perform(record,operation,window.VoiceLineRecordingTools.filename(record),onProgress);
 if(result.detail)notify(result.detail);return result;
}
function recordToolsBusy(value){
 for(const id of ['recordRename','recordSaveFile','recordShare','recordDelete'])$(id).disabled=value;
 if(app.record||app.recordSaving)for(const id of ['recordSaveFile','recordShare','recordDelete'])$(id).disabled=true;
}
async function openRecordingTools(item,trigger,onRenamed,onDelete){
 if(window.VoiceLineDocuments?.busy){notify('파일 작업이 끝난 뒤 다시 열어 주세요.');return;}
 $('recordToolsInfo').textContent='';$('recordDelete').textContent='녹음 삭제';
 const generation=(app.recordToolsGeneration||0)+1;app.recordToolsGeneration=generation;
 app.recordToolsReturnFocus=trigger;modalOpen('recordToolsDialog');recordToolsBusy(true);
 $('recordToolsStatus').textContent='녹음 정보를 불러오는 중…';$('recordTitleInput').value=item.title||'';
 try{
  const full=await store('recordings','get',item.id);
  if(app.recordToolsGeneration!==generation||$('recordToolsDialog').hidden)return;
  if(!full)throw Error('녹음 파일을 찾을 수 없습니다.');
  recordToolsBusy(false);$('recordTitleInput').value=full.title||'목소리 녹음';
  $('recordToolsInfo').textContent=(full.date||'')+' · '+window.VoiceLineRecordingTools.formatTime(full.duration)+' · '+window.VoiceLineRecordingTools.formatBytes(full.size);
  $('recordToolsStatus').textContent=app.record||app.recordSaving?'현재 녹음을 중지·저장한 뒤 파일 저장·공유를 이용하세요.':'';
  $('recordRename').onclick=async()=>{
   if(window.VoiceLineDocuments?.busy)return;
   const title=$('recordTitleInput').value.trim();
   if(!title){$('recordToolsStatus').textContent='녹음 이름을 입력하세요.';$('recordTitleInput').focus();return;}
   recordToolsBusy(true);
   try{const changed={...full,title:title.slice(0,60)};await saveRecording(changed);Object.assign(full,changed);
    onRenamed?.(changed);if(app.recordToolsGeneration===generation)$('recordToolsStatus').textContent='녹음 이름을 변경했습니다.';
   }catch(e){if(app.recordToolsGeneration===generation)$('recordToolsStatus').textContent='이름을 저장하지 못했습니다. 저장 공간을 확인해 주세요.';}
   finally{if(app.recordToolsGeneration===generation)recordToolsBusy(false);}
  };
  for(const [id,operation] of [['recordSaveFile','save'],['recordShare','share']])$(id).onclick=async()=>{
   recordToolsBusy(true);$('recordToolsStatus').textContent='파일 작업을 준비합니다…';
   try{const result=await exportRecordingFile(full,operation,message=>{
     if(app.recordToolsGeneration===generation&&!$('recordToolsDialog').hidden)$('recordToolsStatus').textContent=message;
     else notify(message);
    });if(app.recordToolsGeneration===generation)$('recordToolsStatus').textContent=result.detail||'';
   }catch(e){if(app.recordToolsGeneration===generation)$('recordToolsStatus').textContent=e.message;notify(e.message);}
   finally{if(app.recordToolsGeneration===generation)recordToolsBusy(false);}
  };
  $('recordDelete').disabled=Boolean(app.record||app.recordSaving);
  $('recordDelete').onclick=async()=>{
   if(window.VoiceLineDocuments?.busy||app.record||app.recordSaving)return;
   if(await onDelete($('recordDelete')))modalClose('recordToolsDialog');
  };
 }catch(e){if(app.recordToolsGeneration===generation)$('recordToolsStatus').textContent=e.message;}
}
async function updateRecordingStorage(){
 const node=$('recordStorageInfo');if(!node)return;node.hidden=app.mode!=='record';if(node.hidden)return;
 app.lastStorageCheck=performance.now();
 try{
  if(window.VoiceLineNative?.recordingStorage){
   const info=JSON.parse(window.VoiceLineNative.recordingStorage());
   if(!Number.isFinite(info.availableBytes)||!Number.isFinite(info.seconds))throw Error('storage');
   const minutes=Math.floor(info.seconds/60),time=minutes>=60?Math.floor(minutes/60)+'시간 '+minutes%60+'분':minutes+'분';
   node.textContent='여유 '+window.VoiceLineRecordingTools.formatBytes(info.availableBytes)+' · WAV 약 '+time;
  }else if(navigator.storage?.estimate){
   const info=await navigator.storage.estimate();if(app.mode!=='record')return;
   node.textContent='브라우저 저장 여유 '+window.VoiceLineRecordingTools.formatBytes(Math.max(0,(info.quota||0)-(info.usage||0)));
  }else node.textContent='저장 공간은 기기 설정에서 확인할 수 있습니다.';
  node.title=node.textContent;
 }catch(_){node.textContent='남은 저장 공간을 확인할 수 없습니다.';}
}
function renderHistoryTabs(body,selected){
 const tabs=plain(body,'div','history-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','기록 종류');
 const panels={},buttons={};
 for(const [kind,label] of [['recordings','녹음'],['events','연습']]){
  const button=plain(tabs,'button','history-tab',label);button.type='button';button.id='history-tab-'+kind;
  button.setAttribute('role','tab');button.setAttribute('aria-selected',String(kind===selected));
  button.setAttribute('aria-controls','history-panel-'+kind);button.tabIndex=kind===selected?0:-1;
  button.onclick=()=>showHistory(kind,true);buttons[kind]=button;
 }
 for(const kind of ['recordings','events']){
  const panel=plain(body,'section','history-tab-panel');panel.id='history-panel-'+kind;panel.hidden=kind!==selected;
  panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','history-tab-'+kind);panels[kind]=panel;
  buttons[kind].addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
   e.preventDefault();const next=e.key==='Home'?'recordings':e.key==='End'?'events':kind==='recordings'?'events':'recordings';
   void showHistory(next,true);
  });
 }
 return {panel:panels[selected],button:buttons[selected]};
}
async function showHistory(kind=app.historyTab||'recordings',focusTab=false){
 kind=kind==='events'?'events':'recordings';app.historyTab=kind;clearTimeout(app.historySearchTimer);
 closeActiveAudio();$('infoTitle').textContent='나의 기록';const body=$('infoBody');body.replaceChildren();
 modalOpen('infoDialog');
 const generation=app.historyGeneration=(app.historyGeneration||0)+1;
 const isCurrent=()=>app.historyGeneration===generation&&!$('infoDialog').hidden&&$('infoTitle').textContent==='나의 기록'&&app.historyTab===kind;
 const {panel,button}=renderHistoryTabs(body,kind);if(focusTab)button.focus();
 plain(panel,'p','history-tab-description',kind==='recordings'?
  '한 번의 녹음은 한 파일입니다. 더보기에서 이름 변경·파일 저장·공유를 이용하세요.':
  '음정 측정과 훈련 결과만 표시합니다. 녹음 파일은 녹음 탭에서 확인하세요.');
 let search=null,query=kind==='recordings'?(app.historyQuery||''):'';
 if(kind==='recordings'){
  const searchRow=plain(panel,'div','history-search-row');search=plain(searchRow,'input');search.type='search';search.placeholder='녹음 이름·날짜 검색';search.value=query;search.setAttribute('aria-label','녹음 이름 또는 날짜로 검색');
 }
 const loading=plain(panel,'p','','불러오는 중…');
 try{
  if(kind==='recordings')await renderRecoverableRecordings(panel,isCurrent);
  if(!isCurrent())return;loading.remove();
  const section=makeHistorySection(panel,kind==='recordings'?'녹음 파일':'연습 기록',kind==='recordings'?'아직 저장된 녹음이 없습니다.':'아직 연습 기록이 없습니다.');
  const more=plain(section.section,'button','history-load-more','더 불러오기');
  let next=null,busy=false,pageGeneration=0;
  const loadPage=async(reset=false)=>{
   if((busy&&!reset)||!isCurrent())return;
   const request=++pageGeneration;busy=true;more.disabled=true;
   if(reset){next=null;section.list.replaceChildren();section.refresh();}
   try{
    const page=await getHistoryPage(kind,next,40,query);if(!isCurrent()||request!==pageGeneration)return;
    next=page.next;
    for(const item of page.rows){
     const row=plain(section.list,'div','history-row'),left=plain(row,'div'),title=plain(left,'strong','',item.title);
     if(kind==='recordings'){
      plain(left,'small','',item.date+' · 전체 '+recordTime(Number(item.duration||0)*1000)+' · '+window.VoiceLineRecordingTools.formatBytes(item.size)+
       (Number.isFinite(item.pitchLow)&&Number.isFinite(item.pitchHigh)?' · 음역 '+noteLabel(item.pitchLow)+' ~ '+noteLabel(item.pitchHigh):''));
      const actions=plain(row,'div'),play=plain(actions,'button','','전체 재생');play.onclick=()=>playLocal(item,play,row);
      const manage=plain(actions,'button','record-more','⋯');manage.setAttribute('aria-label',(item.title||'녹음')+' 관리');manage.setAttribute('aria-haspopup','dialog');manage.setAttribute('aria-controls','recordToolsDialog');
      manage.onclick=()=>openRecordingTools(item,manage,changed=>{Object.assign(item,changed);title.textContent=changed.title;},del=>deleteHistoryRow(kind,item.id,row,section,del));
     }else{
      plain(left,'small','',item.date+' · '+item.detail);const del=plain(row,'button','danger','삭제');del.onclick=()=>deleteHistoryRow(kind,item.id,row,section,del);
     }
    }
    if(section.empty)section.empty.textContent=query?'검색 결과가 없습니다.':kind==='recordings'?'아직 저장된 녹음이 없습니다.':'아직 연습 기록이 없습니다.';
    section.refresh();more.hidden=!next;
   }catch(e){if(isCurrent()&&request===pageGeneration){notify('기록을 읽을 수 없습니다. 다시 시도해 주세요.');more.hidden=false;}}
   finally{if(request===pageGeneration){busy=false;more.disabled=false;}}
  };
  if(search)search.oninput=()=>{
   query=search.value;app.historyQuery=query;clearTimeout(app.historySearchTimer);
   app.historySearchTimer=setTimeout(()=>{if(isCurrent()){closeActiveAudio();void loadPage(true);}},180);
  };
  more.onclick=()=>loadPage();await loadPage();
 }catch(e){console.error('History load error',e);if(isCurrent()){loading.remove();plain(panel,'p','','기록을 읽을 수 없습니다. 저장 공간을 확인해 주세요.');}}
}
function drawHistoryPitch(canvas,track,duration,position){
 return window.VoiceLineRecordingTools.drawPitch(canvas,track,duration,position,noteLabel);
}
function closeActiveAudio(){
 app.playbackGeneration=(app.playbackGeneration||0)+1;
 app.refreshOpenAudio=null;
 const old=app.openAudio;app.openAudio=null;app.openAudioRecordId=null;
 if(app.openAudioButton){app.openAudioButton.textContent='전체 재생';app.openAudioButton=null;}
 if(old){old.pause();old.src='';old.load();}
 if(app.openAudioUrl){URL.revokeObjectURL(app.openAudioUrl);app.openAudioUrl=null;}
 if(app.openAudioTimer){cancelAnimationFrame(app.openAudioTimer);app.openAudioTimer=0;}
}
async function playLocal(r,button,row){
 if(app.openAudioRecordId===r.id&&app.openAudio){
  const audio=app.openAudio;
  try{if(audio.paused)await audio.play();else audio.pause();}
  catch(e){if(app.openAudio===audio){notify('녹음을 재생할 수 없습니다.');closeActiveAudio();}}
  return;
 }
 closeActiveAudio();const generation=app.playbackGeneration;
 button.disabled=true;
 try{
  const full=r.blob?r:await store('recordings','get',r.id);
  if(app.playbackGeneration!==generation||row.isConnected===false)return;
  const nativeFile=full?.sourceType==='native-file'&&/^[A-Za-z0-9_-]{1,80}$/.test(full.nativeFileId||'');
  if(!full?.blob&&!nativeFile)throw Error('녹음 파일이 없습니다.');
  const url=nativeFile?'https://appassets.androidplatform.net/recordings/'+full.nativeFileId+'.wav':URL.createObjectURL(full.blob),audio=new Audio(url);
  app.openAudio=audio;app.openAudioUrl=nativeFile?null:url;app.openAudioRecordId=r.id;app.openAudioButton=button;
  const previous=row.querySelector('.playback-details');if(previous)previous.remove();
  const pane=document.createElement('div');pane.className='playback-details';row.append(pane);
  const savedDuration=Number.isFinite(Number(full.duration))&&Number(full.duration)>0?Number(full.duration):0;
  const playbackDuration=()=>Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:savedDuration;
  const caption=plain(pane,'span','playback-time');
  const track=Array.isArray(full.pitchTrack)?full.pitchTrack:[];
  let canvas=null,lastDraw=-Infinity;
  if(track.length>=2){canvas=plain(pane,'canvas','history-pitch-graph');canvas.setAttribute('aria-label','녹음 음높이 전체 그래프. 노란색 선은 현재 재생 위치입니다.');}
  else plain(pane,'p','control-note','감지된 음정이 없어 재생 그래프가 없습니다.');
  const seek=plain(pane,'input','playback-seek');seek.type='range';seek.min='0';seek.max=String(Math.max(.001,savedDuration));seek.step='any';seek.value='0';seek.setAttribute('aria-label','녹음 재생 위치 이동');
  const render=()=>{
   if(app.openAudio!==audio)return;
   const seconds=Number.isFinite(audio.currentTime)?audio.currentTime:0;
   const duration=playbackDuration();
   seek.max=String(Math.max(.001,duration));seek.value=String(Math.max(0,Math.min(duration,seconds)));
   caption.textContent=window.VoiceLineRecordingTools.formatTime(seconds)+' / '+window.VoiceLineRecordingTools.formatTime(duration);
   if(canvas&&(performance.now()-lastDraw>90||audio.paused)){drawHistoryPitch(canvas,track,duration,seconds);lastDraw=performance.now();}
  };
  app.refreshOpenAudio=()=>{lastDraw=-Infinity;render();};
  seek.addEventListener('input',()=>{
   if(app.openAudio!==audio)return;
   const seconds=Number(seek.value),duration=playbackDuration();
   if(!Number.isFinite(seconds)||duration<=0)return;
   try{audio.currentTime=Math.max(0,Math.min(duration,seconds));}
   catch(e){notify('재생 위치를 이동하지 못했습니다. 다시 시도해 주세요.');}
   render();
  });
  audio.addEventListener('timeupdate',render);audio.addEventListener('loadedmetadata',render);
  const nextFrame=()=>{if(app.openAudio!==audio||audio.paused)return;render();app.openAudioTimer=requestAnimationFrame(nextFrame);};
  audio.onplay=()=>{if(app.openAudio!==audio)return;button.textContent='일시정지';if(app.openAudioTimer)cancelAnimationFrame(app.openAudioTimer);nextFrame();};
  audio.onpause=()=>{if(app.openAudio!==audio)return;button.textContent='전체 재생';if(app.openAudioTimer)cancelAnimationFrame(app.openAudioTimer);app.openAudioTimer=0;render();};
  audio.onended=()=>{if(app.openAudio===audio){button.textContent='전체 재생';render();}};
  audio.onerror=()=>{if(app.openAudio===audio){notify('이 녹음 형식을 재생할 수 없습니다.');closeActiveAudio();}};
  // The button always routes through playLocal, never a detached Audio closure.
  render();await audio.play();
 }catch(e){if(app.playbackGeneration===generation){console.error(e);button.textContent='전체 재생';notify('녹음을 재생할 수 없습니다.');closeActiveAudio();}}
 finally{button.disabled=false;}
}
async function safeStopOnBackground(){
 app.backgrounded=true;closeActiveAudio();
 if(app.lifeStopping)return;
 app.lifeStopping=true;
 try{await stopActivity('background');resetMainAction();updateMicToggle();}
 finally{app.lifeStopping=false;}
}
window.VoiceLineLifecycle={
 onPause(){allKeysOff();void safeStopOnBackground();},
 onResume(){app.backgrounded=false;updateMicToggle();},
 onResize(){queueResponsiveLayout();},
 onBack(){
  if(closeTopDialog())return true;
  if(app.recordSaving||app.stopPromise){notify('녹음을 저장하는 중입니다. 잠시 기다려 주세요.');return true;}
  if(app.micStartPromise||app.nativeStartResolve){cancelMicStart();resetMainAction();return true;}
  if(app.mic||app.training||app.exercise||app.vibratoStart||app.metronome?.running||app.metronome?.starting){void stopActivity().finally(resetMainAction);return true;}
  return false;
 }
};
window.addEventListener('pagehide',()=>window.VoiceLineLifecycle.onPause());
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)window.VoiceLineLifecycle.onPause();else window.VoiceLineLifecycle.onResume();
});
applyPianoVolume(app.pianoVolume,false);
// Resize only the view. Recording, scoring clocks and metronome scheduling stay intact.
function applyResponsiveLayout(force=false){
 const width=Number(window.innerWidth||document.documentElement?.clientWidth)||0;
 const height=Number(window.innerHeight||document.documentElement?.clientHeight)||0;
 const orientation=window.screen?.orientation?.type;
 const portrait=window.VoiceLineNative&&orientation?orientation.startsWith('portrait'):width>0&&height>=width;
 const changed=portrait!==app.layoutPortrait;
 if(!force&&!changed&&orientation===app.layoutOrientation&&width===app.layoutWidth&&height===app.layoutHeight)return;
 if(app.layoutReady){releaseHeldKeys();app.metronome?.cancelHolds?.();}
 app.layoutPortrait=portrait;app.layoutOrientation=orientation;app.layoutWidth=width;app.layoutHeight=height;
 document.body?.classList.toggle('portrait-layout',portrait);
 $('app').dataset.mode=app.mode;
 const count=portrait?12:24;
 if(force||count!==app.keyboardNotes){
  app.keyboardNotes=count;
  const focus=app.exercise?.target??app.training?.target??(app.mode==='vibrato'?app.vibratoRoot:app.detected);
  if(Number.isFinite(focus))app.base=targetKeyboardBase(focus);
  else app.base=clamp(Math.floor(app.base/12)*12,24,108-count);
  drawKeys();
 }
 app.layoutReady=true;
 updateMicToggle();
 const notice=$('micNotice');
 if(notice&&!notice.hidden)$('micNoticeTitle').textContent=portrait?(app.mic?'마이크 켜짐':'마이크 꺼짐'):(app.mic?'마이크가 켜졌습니다':'마이크가 꺼졌습니다');
 const now=performance.now();
 renderPitchGraphOverlay(now,true);renderVibratoOverlay(now,true);renderRecordPitchOverlay(now,true);renderTrainingOverlay(now,true);
 app.refreshOpenAudio?.();updatePracticeScrollHint();
}
function queueResponsiveLayout(){
 if(app.layoutFrame)return;
 app.layoutFrame=requestAnimationFrame(()=>{app.layoutFrame=0;applyResponsiveLayout();});
}
// Arrows remain visible only when more practice options exist off-screen.
function updatePracticeScrollHint(){
 const c=$('exerciseControls'),shell=$('practiceScrollShell');
 const prev=$('practiceScrollPrev'),next=$('practiceScrollNext');
 if(!c||!shell||!prev||!next)return;
 if(app.layoutPortrait){shell.classList.remove('has-more');prev.hidden=true;next.hidden=true;return;}
 const practice=app.mode==='practice'||(typeof TRAINING_MODES!=='undefined'&&TRAINING_MODES.has(app.mode));
 const padding=shell.classList.contains('has-more')?(parseFloat(getComputedStyle(c).paddingRight)||0):0;
 const extra=practice&&c.scrollWidth-padding>c.clientWidth+6;
 shell.classList.toggle('has-more',extra);
 if(!extra){prev.hidden=true;next.hidden=true;return;}
 prev.hidden=c.scrollLeft<=5;
 next.hidden=c.scrollLeft>=c.scrollWidth-c.clientWidth-5;
}
function scrollPracticeSettings(direction){
 const c=$('exerciseControls');if(!c)return;
 const amount=Math.max(105,c.clientWidth*.66);
 if(c.scrollBy)c.scrollBy({left:direction*amount,behavior:'smooth'});
 else c.scrollLeft+=direction*amount;
 requestAnimationFrame(updatePracticeScrollHint);
}
$('practiceScrollPrev').addEventListener('click',()=>scrollPracticeSettings(-1));
$('practiceScrollNext').addEventListener('click',()=>scrollPracticeSettings(1));
$('exerciseControls').addEventListener('scroll',updatePracticeScrollHint,{passive:true});
window.addEventListener('resize',queueResponsiveLayout);
window.screen?.orientation?.addEventListener?.('change',queueResponsiveLayout);
window.visualViewport?.addEventListener?.('resize',queueResponsiveLayout);
if(window.ResizeObserver)new ResizeObserver(()=>requestAnimationFrame(updatePracticeScrollHint)).observe($('practiceScrollShell'));

app.metronome=window.VoiceLineMetronome?.mount(document,{
 onSettings:updateMetronomeSummary,onError:notify,
 onState:state=>{
  if(app.mode!=='metronome')return;
  const playing=state==='running'||state==='starting';
  $('mainButton').textContent=playing?'메트로놈 중지':'메트로놈 시작';$('stopButton').hidden=!playing;
  progress(playing?1:0,playing?'메트로놈 재생 중':'메트로놈 준비');
 }
});
restorePracticeOptions();restoreTrainingSettings();if(window.VoiceLineGuideTraining)guideOptions();applyResponsiveLayout(true);modeControls();progress(0,'건반 연주 준비');updateMicToggle();syncPitchGraphOverlay();syncVibratoOverlay();syncRecordPitchOverlay();syncTrainingOverlay();
if(window.VoiceLineToneEngine)updateToneEngineStatus();
importLegacyRecords();void cleanupDeletedNativeFiles();
store('recordSessions','getAll').then(sessions=>{if(sessions.length)notify('저장하지 못한 녹음이 있습니다. 나의 기록에서 확인해 주세요.');}).catch(()=>{});
if('serviceWorker' in navigator){
  if(location.hostname==='appassets.androidplatform.net'){
    navigator.serviceWorker.getRegistrations().then(regs=>Promise.all(regs.map(reg=>reg.unregister()))).catch(()=>{});
  }else if(location.protocol==='https:' || location.hostname==='localhost'){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
}
try{window.screen?.orientation?.unlock?.();}catch(_){}

})();
