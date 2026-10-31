'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'app/src/main/assets/www/piano.js'),'utf8');
const chunk=(from,to)=>{const a=js.indexOf(from),b=js.indexOf(to,a);assert.ok(a>=0&&b>a,from);return js.slice(a,b)};
const policies=vm.runInNewContext(chunk('const PITCH_RANGE=','const MODES=')+'\n({PITCH_RANGE,SCORE_RULES})');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const evaluate=(code,context={})=>{const window=context.window||{};window.VoiceLineRecordingTools=require('../app/src/main/assets/www/recording-tools.js');window.VoiceLineGuideTraining=require('../app/src/main/assets/www/guide-training.js');return vm.runInNewContext(code,{...policies,clamp,console,Blob,Uint8Array,ArrayBuffer,DataView,Float32Array,atob,Promise,Map,Math,Number,setTimeout,clearTimeout,updateRecordingStorage:async()=>{},...context,window});};
class Node {
 constructor(){this.children=[];this.hidden=false;this.disabled=false;this.isConnected=true;this.textContent='';this.style={};this.dataset={};this.events={};const classes=new Set();this.classList={add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key),toggle:(key,on)=>on?classes.add(key):classes.delete(key)};}
 append(n){n.parent=this;this.children.push(n)}
 replaceChildren(){this.children=[]}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.isConnected=false}
 setAttribute(){} focus(){} getBoundingClientRect(){return {width:0,height:0}}
 addEventListener(type,fn){this.events[type]=fn}removeEventListener(type){delete this.events[type]}
 querySelector(){return null}querySelectorAll(){return []}
}
const nodes=()=>{const n=new Map();return id=>{if(!n.has(id))n.set(id,new Node());return n.get(id)}};
const plain=(parent,tag,cls,text)=>{const node=new Node();node.className=cls;node.textContent=text;parent.append(node);return node};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const settings={root:60,sustainSeconds:8,glideSpan:3,glideStyle:'step',glideStepSeconds:3,earCount:4,tempo:80,rounds:2};
function trainingHarness(){
 const app={training:null};
 const api=evaluate(chunk('const TRAINING_MODES=new Set(','function startTraining(t){')+
  chunk('function receiveTrainingSample(t,midi,rms){','function updateTraining(t){')+
  chunk('function trainingEvaluation(a,completed){','function showTrainingResult(')+
  '\n({newTrainingSession,receiveTrainingSample,trainingEvaluation,trainingTargetAt})',{app});
 return {app,...api};
}
test('Local32 dynamics rejects mostly wrong notes, brief samples and flat volume; accepts sustained pattern',()=>{
 const h=trainingHarness(),levels=[.025,.045,.07,.025];
 const run=(brief=false,wrong=false,flat=false)=>{
  h.app.training=h.newTrainingSession('dynamicVoice',0,settings);
  for(let i=0;i<120;i++){
   const phase=Math.floor(i/30),short=i%30<3;
   h.receiveTrainingSample(h.app.training.start+i*100,brief&&!short?null:wrong&&!short?62:60,flat?.04:levels[phase]);
  }
  return h.trainingEvaluation(h.app.training,true);
 };
 assert.equal(run(false,true).status,'미달성');
 assert.match(run(false,true).reason,/음정 10%/);
 assert.equal(run(true).status,'미달성');
 assert.equal(run(false,false,true).status,'미달성');
 assert.equal(run().status,'성공');
});
test('Local43 isolated pitch detections never fill preceding silence in voice training',()=>{
 for(const mode of ['sustainVoice','dynamicVoice']){
  const h=trainingHarness(),a=h.app.training=h.newTrainingSession(mode,0,settings);
  for(let ms=0;ms<a.duration;ms+=50)h.receiveTrainingSample(a.start+ms,ms%100===0?60:null,.05);
  assert.ok(a.valid>=12);assert.equal(a.voicedMs,0,mode+' counted silence as sustained voice');
  assert.equal(h.trainingEvaluation(a,true).status,'미달성');
 }
});
test('Local43 ear-training coverage starts at the response boundary',()=>{
 const h=trainingHarness(),a=h.app.training=h.newTrainingSession('earVoice',0,settings);
 h.receiveTrainingSample(a.start+1460,a.earNotes[0],.05);
 h.receiveTrainingSample(a.start+1540,a.earNotes[0],.05);
 assert.equal(a.answerVoicedMs,40,'listening time must not enter the response score');
 h.receiveTrainingSample(a.start+1620,a.earNotes[0],.05);assert.equal(a.answerVoicedMs,120);
});
test('Local43 the 65 percent training threshold never rounds up a lower result',()=>{
 for(const mode of ['sustainVoice','earVoice','dynamicVoice']){
  const h=trainingHarness(),a=h.newTrainingSession(mode,0,settings);
  Object.assign(a,{valid:1000,good:649,voicedMs:8000,answerVoicedMs:8000,
   phaseCounts:{'작게':10,'조금 크게':10,'가장 크게':10,'다시 작게':10},
   phaseLevels:{'작게':.2,'조금 크게':.4,'가장 크게':.8,'다시 작게':.2},
   phaseVoicedMs:{'작게':1000,'조금 크게':1000,'가장 크게':1000,'다시 작게':1000}});
  const result=h.trainingEvaluation(a,true);assert.equal(result.status,'미달성',mode);assert.match(result.reason,/64%/);
  a.good=650;assert.equal(h.trainingEvaluation(a,true).status,'성공',mode+' rejected exactly 65%');
 }
});
function practiceHarness(){
 const app={exercisePattern:'triad',exerciseRoot:60,exerciseSpeed:1200,exerciseRepeats:1,base:48,mic:true};
 const records=[];
 const api=evaluate(chunk('const EXERCISE_PATTERNS=','function savePracticeOptions(){')+
  chunk('function exerciseSteps(','function playReference(')+chunk('function finishExercise(completed){','const TRAINING_MODES=new Set(')+
  '\n({startExercise,updateExercise,receiveExerciseSample,exerciseSteps})',{
   app,$:nodes(),lockPracticeControls(){},setMessage(){},progress(){},syncKeyColors(){},playReference(){},
   noteLabel:String,drawKeys(){},stopMic(){app.mic=false},addEvent:(...args)=>records.push(args)
  });
 return {app,records,...api};
}
test('Local32 practice marks a lone correct note as insufficient',()=>{
 const h=practiceHarness();h.startExercise(0);const e=h.app.exercise;
 h.updateExercise(e.start);h.receiveExerciseSample(e.start+100,60);
 for(let t=e.start+200;t<e.start+e.duration*e.steps.length;t+=100){h.updateExercise(t);h.receiveExerciseSample(t,null)}
 h.updateExercise(e.start+e.duration*e.steps.length);
 assert.match(h.records[0][1],/측정 부족/);assert.doesNotMatch(h.records[0][1],/100% 정확도/);
});
test('Local32 practice requires participation in each note and reports full correct singing',()=>{
 for(const sing of [()=>true,index=>index===0]){
  const h=practiceHarness();h.startExercise(0);const e=h.app.exercise;
  for(let elapsed=0;elapsed<e.duration*e.steps.length;elapsed+=80){
   h.updateExercise(e.start+elapsed);const index=Math.floor(elapsed/e.duration);
   h.receiveExerciseSample(e.start+elapsed,sing(index)?e.steps[index]:null);
  }
  h.updateExercise(e.start+e.duration*e.steps.length);
  assert.match(h.records[0][1],sing(1)?/100% 정확도/:/측정 부족/);
 }
});
test('Local43 isolated detections cannot satisfy practice voice coverage in each note',()=>{
 const h=practiceHarness();h.startExercise(0);const e=h.app.exercise;
 for(let ms=0;ms<e.duration*e.steps.length;ms+=50){
  h.updateExercise(e.start+ms);h.receiveExerciseSample(e.start+ms,ms%100===0?e.steps[Math.floor(ms/e.duration)]:null);
 }
 assert.equal(e.roundVoicedMs,0);assert.ok(e.stepVoicedMs.every(ms=>ms===0));
 h.updateExercise(e.start+e.duration*e.steps.length);assert.match(h.records[0][1],/측정 부족/);
});
test('Local32 every selectable pattern and high glide/ear target stays in measurable range',()=>{
 const h=practiceHarness();
 for(let root=36;root<=95;root++)for(const pattern of ['scale','triad','sustain','down','scaleUp','pentatonic','chromatic','majorThird','fifth','octave','arpeggio','minor','returnToRoot']){
  assert.ok([...h.exerciseSteps(pattern,root)].every(m=>m>=36&&m<=94));
 }
 const t=trainingHarness();
 for(let root=48;root<=84;root++)for(const span of [3,5,7,12]){
  const a=t.newTrainingSession('guideVoice',0,{...settings,guide:{pattern:'smooth'+span,root,rounds:1,shift:0}});
  for(let ms=0;ms<=a.duration;ms+=100)assert.ok(t.trainingTargetAt(a,ms)>=36&&t.trainingTargetAt(a,ms)<=94);
  const e=t.newTrainingSession('earVoice',0,{...settings,root,earCount:5});
  assert.ok([...e.earNotes].every(m=>m>=36&&m<=94));
 }
});
function micHarness(){
 const app={mic:false,nativeMic:false,micGeneration:0,nativeRequestId:null,frame:0,backgrounded:false,lifeStopping:false};
 const timers=new Map(),stops=[],starts=[];let sequence=0;
 const window={VoiceLineNative:{start:id=>starts.push(id),stop:id=>stops.push(id)}};
 const $=nodes();
 const api=evaluate(chunk('function micRequestCurrent(token){','function tick(t){')+
  '\n({startMic,startNativeMic,stopMic,cancelMicStart})',{
   app,window,$,document:{hidden:false},navigator:{},audioCtor:null,
   performance:{now:()=>100},micStatus(){},notify(){},updateMicToggle(){},syncKeyColors(){},tick(){},
   requestAnimationFrame:()=>1,cancelAnimationFrame(){},
   setTimeout:fn=>{timers.set(++sequence,fn);return sequence},clearTimeout:id=>timers.delete(id)
  });
 return {app,window,$,timers,stops,starts,...api};
}
test('Local32 late native started after timeout is rejected and stopped',async()=>{
 const h=micHarness(),pending=h.startMic(),id=h.starts[0];
 [...h.timers.values()][0]();assert.equal(await pending,false);
 h.window.VoiceLineNativeAudio.onState('started','late',id,44100);
 assert.equal(h.app.mic,false);assert.ok(h.stops.includes(id));
});
test('Local32 explicit mic cancel settles the request and rejects obsolete PCM after a restart',async()=>{
 const h=micHarness(),first=h.startMic(),old=h.starts[0];h.cancelMicStart();assert.equal(await first,false);
 const second=h.startMic(),current=h.starts[1];
 h.window.VoiceLineNativeAudio.onState('started','old',old,44100);assert.equal(h.app.mic,false);
 h.window.VoiceLineNativeAudio.onState('started','ok',current,16000);assert.equal(await second,true);
 h.window.VoiceLineNativeAudio.onAudioChunk('not-base64',44100,old);
 assert.equal(h.app.mic,true);assert.equal(h.app.nativeSampleRate,16000);
});
function pcmHarness(){
 const parts=new Map(),sessions=new Map(),recordings=new Map(),app={record:null};
 let failKind=null;const stopTimers=[];
 const store=async(kind,op,item)=>{
  if(failKind===kind&&op==='put')throw Error('storage-full');
  const table={recordParts:parts,recordSessions:sessions,recordings}[kind];
  if(op==='put'){table.set(item.id,item);return}
  if(op==='get')return table.get(item);
  if(op==='getAll')return [...table.values()];
  throw Error('unexpected operation '+op);
 };
 const removeSessionData=async id=>{for(const [key,p] of parts)if(p.sessionId===id)parts.delete(key);sessions.delete(id)};
 const readSessionParts=async id=>[...parts.values()].filter(p=>p.sessionId===id);
 const nativeCode=chunk('function encodePcmChunk(','function startRecording(){');
 const api=evaluate(nativeCode+chunk('function startRecording(){','async function finishVibrato(){')+
  '\n({startRecording,queueNativePcm,finalizeNativePcm,stopRecording,retryRecording,recoverRecording,wavHeader})',{
   app,store,removeSessionData,readSessionParts,performance:{now:()=>5000},$:nodes(),
   id:()=> 'session-32',stamp:()=> '오늘',notify(){},progress(){},renderRecordPitchOverlay(){},
   console:{error(){},warn(){}},setTimeout:fn=>{stopTimers.push(fn);return 1}
  });
 return {app,parts,sessions,recordings,store,stopTimers,setFailure:kind=>failKind=kind,...api};
}
test('Local32 native recording uses confirmed 16kHz from its first chunk and exact PCM duration',async()=>{
 const h=pcmHarness();Object.assign(h.app,{mic:true,nativeMic:true,nativeSampleRate:16000});h.startRecording();
 h.queueNativePcm(h.app.record,'A'.repeat(32000));
 assert.equal(await h.stopRecording(),true);
 const saved=[...h.recordings.values()][0],head=new DataView(await saved.blob.slice(0,44).arrayBuffer());
 assert.equal(head.getUint32(24,true),16000);assert.equal(saved.duration,1);
 assert.equal(saved.blob.size,32044);assert.equal(h.sessions.size,0);assert.equal(h.parts.size,0);
});
test('Local32 final save failure retains audio; retry saves once with pitch and clears temporary parts',async()=>{
 const h=pcmHarness();Object.assign(h.app,{mic:true,nativeMic:true,nativeSampleRate:44100});h.startRecording();
 h.app.recordPitchTrack.push([100,60]);h.app.recordPitchLow=60;h.app.recordPitchHigh=60;
 h.queueNativePcm(h.app.record,'B'.repeat(88200));h.setFailure('recordings');
 assert.equal(await h.stopRecording(),false);assert.ok(h.app.failedRecording);assert.equal(h.sessions.size,1);
 h.setFailure(null);await h.recoverRecording([...h.sessions.values()][0]);
 assert.equal(h.recordings.size,1);assert.equal(h.app.failedRecording,null);assert.equal(h.parts.size,0);
 const saved=[...h.recordings.values()][0];assert.equal(saved.pitchTrack[0][1],60);assert.equal(saved.duration,1);
});
test('Local32 PCM part failure stops accumulation and can retry buffered parts',async()=>{
 const h=pcmHarness();Object.assign(h.app,{mic:true,nativeMic:true,nativeSampleRate:16000});h.startRecording();await h.app.record.pending;
 h.setFailure('recordParts');h.queueNativePcm(h.app.record,'C'.repeat(64000));await h.app.record.pending;
 assert.ok(h.app.record.error);assert.equal(h.stopTimers.length,1);
 const before=h.app.record.totalBytes;h.queueNativePcm(h.app.record,'D'.repeat(32000));assert.equal(h.app.record.totalBytes,before);
 assert.equal(await h.stopRecording(),false);h.setFailure(null);await h.retryRecording(h.app.failedRecording);
 assert.equal(h.recordings.size,1);assert.equal([...h.recordings.values()][0].duration,2);
});
test('Local32 restart recovery uses only persisted contiguous PCM and is idempotent',async()=>{
 const h=pcmHarness();Object.assign(h.app,{mic:true,nativeMic:true,nativeSampleRate:16000});h.startRecording();
 const r=h.app.record;h.queueNativePcm(r,'E'.repeat(64000));await r.pending;
 h.queueNativePcm(r,'F'.repeat(64000));await r.pending;
 h.queueNativePcm(r,'G'.repeat(16000)); // Unsaved last half-second disappears on process death.
 const metadata=[...h.sessions.values()][0];h.app.record=null;h.app.failedRecording=null;
 await h.recoverRecording(metadata);assert.equal([...h.recordings.values()][0].duration,4);
 await h.recoverRecording(metadata);assert.equal(h.recordings.size,1);assert.equal(h.parts.size,0);
});
test('Local32 recovery refuses missing PCM chunks rather than inventing audio',async()=>{
 const h=pcmHarness();h.parts.set('gap:1',{id:'gap:1',sessionId:'gap',seq:1,data:new Blob(['A'.repeat(128)])});
 await assert.rejects(h.recoverRecording({id:'gap',sampleRate:16000}),/완전한 녹음 자료/);
 assert.equal(h.recordings.size,0);assert.equal(h.parts.size,1);
});
test('Local32 native startup error terminates training through the shared stop path',async()=>{
 for(const kind of ['training','exercise','vibrato']){
  const h=micHarness(),pending=h.startMic(),id=h.starts[0];h.window.VoiceLineNativeAudio.onState('started','ok',id,44100);await pending;
  const $=h.$;let finishes=0;
  Object.assign(h.app,{training:kind==='training'?{active:true}:null,exercise:kind==='exercise'?{active:true}:null,vibratoStart:kind==='vibrato'?1:0});
  const context={app:h.app,window:h.window,$,document:{hidden:false},
   cancelMicStart:h.cancelMicStart,stopMic:h.stopMic,
   finishTraining:completed=>{assert.equal(completed,false);h.app.training=null;finishes++},
   finishExercise:completed=>{assert.equal(completed,false);h.app.exercise=null;finishes++},
   finishVibrato:async()=>{h.app.vibratoStart=0;finishes++},
   resetMainAction(){},clearNote(){},setMessage(){},notify(){},performance:{now:()=>1000}};
  const fail=evaluate(chunk("async function stopActivity(reason='user'){",'function resetMainAction(){')+
   chunk('async function stopAfterMicError(detail){','function tick(t){')+'\nstopAfterMicError',context);
  await fail('input failed');assert.equal(finishes,1);assert.equal(h.app.mic,false);assert.equal(h.app.frame,0);
 }
});
function playbackHarness(store){
 const app={},media=[],notifications=[],graphs=[];let serial=0;
 class Audio{
  constructor(url){this.src=url;this.currentTime=0;this.duration=3;this.paused=true;this.events={};media.push(this)}
  addEventListener(type,fn){this.events[type]=fn}load(){}
  pause(){this.paused=true;this.onpause?.()}
  play(){assert.ok(this.src,'must not play a detached audio source');this.paused=false;this.onplay?.();return Promise.resolve()}
 }
 const api=evaluate(chunk('function closeActiveAudio(){','async function safeStopOnBackground(){')+'\n({playLocal,closeActiveAudio})',{
  app,Audio,store,URL:{createObjectURL:()=> 'blob:'+(++serial),revokeObjectURL(){}},document:{createElement:()=>new Node()},plain,
  performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame(){},notify:s=>notifications.push(s),drawHistoryPitch:(...args)=>graphs.push(args)
 });
 return {app,media,notifications,graphs,...api};
}
test('Local32 A to B to A playback recreates audio; same item pauses and resumes',async()=>{
 const rows={A:{id:'A',duration:3,blob:new Blob(['A'])},B:{id:'B',duration:3,blob:new Blob(['B'])}};
 const h=playbackHarness(async(_,__,id)=>rows[id]),a=new Node(),b=new Node(),rowA=new Node(),rowB=new Node();
 await h.playLocal({id:'A',duration:3},a,rowA);await h.playLocal({id:'B',duration:3},b,rowB);await h.playLocal({id:'A',duration:3},a,rowA);
 assert.equal(h.media.length,3);assert.equal(h.app.openAudioRecordId,'A');assert.equal(h.media[0].src,'');
 await h.playLocal(rows.A,a,rowA);assert.equal(h.app.openAudio.paused,true);
 await h.playLocal(rows.A,a,rowA);assert.equal(h.app.openAudio.paused,false);assert.equal(h.media.length,3);
 assert.deepEqual(h.notifications,[]);
});
test('Local32 stale async recording read cannot replace a more recent playback',async()=>{
 const waiting=deferred();const h=playbackHarness(async(_,__,id)=>id==='A'?waiting.promise:{id:'B',blob:new Blob(['B']),duration:3});
 const first=h.playLocal({id:'A'},new Node(),new Node());await h.playLocal({id:'B'},new Node(),new Node());
 waiting.resolve({id:'A',blob:new Blob(['A']),duration:3});await first;
 assert.equal(h.app.openAudioRecordId,'B');assert.equal(h.media.length,1);
});
test('Local43 recordings with unknown media duration can seek using their saved duration',async()=>{
 const record={id:'webm',duration:12,blob:new Blob(['voice'])},h=playbackHarness(async()=>record),row=new Node(),button=new Node();
 await h.playLocal(record,button,row);const audio=h.app.openAudio;audio.duration=Infinity;audio.events.loadedmetadata();
 const seek=row.children[0].children.find(node=>node.className==='playback-seek');
 assert.equal(Number(seek.max),12);seek.value='5.5';seek.events.input();assert.equal(audio.currentTime,5.5);
});
test('Local43 malformed saved playback durations keep labels and controls finite',async()=>{
 for(const duration of [Infinity,NaN,-5]){
  const record={id:'bad',duration,blob:new Blob(['voice'])},h=playbackHarness(async()=>record),row=new Node();
  await h.playLocal(record,new Node(),row);const audio=h.app.openAudio;audio.duration=NaN;audio.events.loadedmetadata();
  const pane=row.children[0],seek=pane.children.find(node=>node.className==='playback-seek');
  assert.ok(Number.isFinite(Number(seek.max))&&Number(seek.max)>0);
  assert.ok(Number.isFinite(Number(seek.value)));assert.doesNotMatch(pane.children[0].textContent,/NaN|Infinity/);
 }
});
test('Local43 a failed resume releases the audio and permits a clean retry',async()=>{
 const record={id:'one',duration:3,blob:new Blob(['voice'])},h=playbackHarness(async()=>record),row=new Node(),button=new Node();
 await h.playLocal(record,button,row);await h.playLocal(record,button,row);const old=h.app.openAudio;
 old.play=()=>Promise.reject(Error('decoder failed'));await h.playLocal(record,button,row);
 assert.equal(h.app.openAudio,null);assert.equal(old.src,'');assert.equal(h.notifications.length,1);
 await h.playLocal(record,button,row);assert.equal(h.media.length,2);assert.equal(h.app.openAudioRecordId,'one');
});
test('Local43 a delayed resume failure cannot disturb a newer recording playback',async()=>{
 const h=playbackHarness(async(_,__,id)=>({id,duration:3,blob:new Blob([id])})),a=new Node(),rowA=new Node();
 await h.playLocal({id:'A'},a,rowA);await h.playLocal({id:'A'},a,rowA);
 const waiting=deferred();h.app.openAudio.play=()=>waiting.promise;const resume=h.playLocal({id:'A'},a,rowA);
 await h.playLocal({id:'B'},new Node(),new Node());waiting.reject(Error('old request aborted'));await resume;
 assert.equal(h.app.openAudioRecordId,'B');assert.deepEqual(h.notifications,[]);
});
test('Local43 an audio decoder error closes the failed source before retrying',async()=>{
 const record={id:'one',duration:3,blob:new Blob(['voice'])},h=playbackHarness(async()=>record),row=new Node(),button=new Node();
 await h.playLocal(record,button,row);const old=h.app.openAudio;old.onerror();
 assert.equal(h.app.openAudio,null);assert.equal(old.src,'');assert.equal(h.notifications.length,1);
 await h.playLocal(record,button,row);assert.equal(h.media.length,2);
});
test('Local44 resizing a paused recording refreshes its graph without reopening or seeking its audio',async()=>{
 const record={id:'one',duration:3,blob:new Blob(['voice']),pitchTrack:[[0,60],[2000,62]]};
 const h=playbackHarness(async()=>record),button=new Node(),row=new Node();await h.playLocal(record,button,row);
 await h.playLocal(record,button,row);const audio=h.app.openAudio;audio.currentTime=1.2;
 const before=h.graphs.length;h.app.refreshOpenAudio();assert.equal(h.graphs.length,before+1);
 assert.equal(h.app.openAudio,audio);assert.equal(audio.currentTime,1.2);assert.equal(audio.paused,true);assert.equal(h.media.length,1);
 h.closeActiveAudio();assert.equal(h.app.refreshOpenAudio,null);
});
test('Local32 history ignores the earlier query after closing and reopening the same page',async()=>{
 const $=nodes(),app={historyGeneration:0},requests=[];
 $('infoDialog').hidden=true;
 const show=evaluate(chunk('function renderHistoryTabs(','function drawHistoryPitch(')+'\nshowHistory',{
  app,$,plain,closeActiveAudio(){},modalOpen(){app.historyGeneration++;$('infoDialog').hidden=false},
  renderRecoverableRecordings:async()=>{const d=deferred();requests.push(d);await d.promise},
  makeHistorySection:(body,label)=>{const section=plain(body,'section','',label);const list=plain(section,'div');return {section,list,refresh(){}}},
  getHistoryPage:async()=>({rows:[],next:null})
 });
 const first=show();$('infoDialog').hidden=true;const second=show();requests[0].resolve();await first;requests[1].resolve();await second;
 const all=[];const visit=n=>{all.push(n);for(const child of n.children)visit(child)};visit($('infoBody'));
 assert.equal(all.filter(n=>n.textContent==='녹음 파일').length,1);
 assert.equal(all.filter(n=>n.textContent==='연습 기록').length,0);
});
test('Local32 paged history strips audio/pitch data and preserves a stable continuation key',async()=>{
 const records=Array.from({length:43},(_,i)=>({id:'r'+i,timestamp:i,duration:2,blob:new Blob(['large audio']),pitchTrack:[[1,60]]}));
 const db={transaction(kind){assert.equal(kind,'recordingsMeta');const tx={objectStore(){return {index(){return {openCursor(range){
  const rows=records.filter(r=>!range||r.timestamp<range.before[0]).sort((a,b)=>b.timestamp-a.timestamp);const req={};let i=0;
  const deliver=()=>{let continued=false;const item=rows[i];req.result=item?{value:{id:item.id,timestamp:item.timestamp,duration:item.duration},key:[item.timestamp,item.id],continue(){continued=true;i++;queueMicrotask(deliver)}}:null;
   req.onsuccess();if(!continued)queueMicrotask(()=>tx.oncomplete());};queueMicrotask(deliver);return req;
 }}}}}};return tx}};
 const page=evaluate(chunk('function getHistoryPage(','async function importLegacyRecords(')+'\ngetHistoryPage',{
  dbPromise:Promise.resolve(db),IDBKeyRange:{upperBound:before=>({before})}
 });
 const first=await page('recordings');assert.equal(first.rows.length,40);assert.equal(first.rows[0].id,'r42');assert.ok(first.next);
 assert.ok(first.rows.every(r=>!('blob' in r)&&!('pitchTrack' in r)));
 const second=await page('recordings',first.next);assert.equal(second.rows.length,3);assert.equal(second.next,null);
 assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,43);
});
test('Local32 web permission granted after cancellation stops the late stream',async()=>{
 const waiting=deferred(),app={micGeneration:1,backgrounded:false,lifeStopping:false},document={hidden:false};let stopped=0;
 const start=evaluate(chunk('async function startWebMic(token){','async function startMic(){')+'\nstartWebMic',{
  app,document,micRequestCurrent:token=>token===app.micGeneration,navigator:{mediaDevices:{getUserMedia:()=>waiting.promise}},
  audioCtor:class{},micStatus(){},notify(){}
 });
 const pending=start(1);app.micGeneration++;
 waiting.resolve({getTracks:()=>[{stop(){stopped++}}]});assert.equal(await pending,false);assert.equal(stopped,1);assert.ok(!app.mic);
});
test('Local32 help derives every mode from the same guide data and live scoring constants',()=>{
 const rule=evaluate(chunk('function dynamicRuleText(){','function showTrainingResult(')+'\ndynamicRuleText');
 const guides=evaluate(chunk('const MODE_GUIDES={','let modeGuideReturnFocus=')+'\nMODE_GUIDES',{dynamicRuleText:rule});
 assert.match(guides.practice.rule,/측정 부족/);assert.match(guides.dynamicVoice.rule,/4.8초/);assert.match(guides.guideVoice.steps.join(' '),/아래로 왕복/);
 assert.match(chunk('function showHelp(){','let historyDeletePending='),/Object\.entries\(MODE_GUIDES\)/);
});
test('Local32 service worker precaches all 28 piano recordings and preserves unrelated caches',async()=>{
 const sw=fs.readFileSync(path.join(root,'app/src/main/assets/www/sw.js'),'utf8'),events={};let precached=[],deleted=[];
 const cache={addAll:async urls=>{precached=[...urls]}};
 evaluate(sw,{self:{addEventListener:(key,fn)=>events[key]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},
  caches:{open:async()=>cache,keys:async()=>['voiceline-v2-piano-beta1','other-app'],delete:async key=>deleted.push(key)}});
 let done;events.install({waitUntil:p=>done=p});await done;
 assert.equal(precached.filter(p=>p.endsWith('.mp3')).length,28);assert.ok(precached.includes('./vendor/tone-piano.js'));
 for(const asset of precached)if(asset!=='./')assert.ok(fs.existsSync(path.join(root,'app/src/main/assets/www',asset)));
 events.activate({waitUntil:p=>done=p});await done;assert.deepEqual(deleted,['voiceline-v2-piano-beta1']);
});
test('Local32 Android back dismisses deletion then history; saving and pending mic block exit',async()=>{
 const $=nodes(),app={},window={addEventListener(){}};let cancelled=0;
 for(const id of ['historyDeleteDialog','recordToolsDialog','warmupSettingsDialog','guideSettingsDialog','trainingResultDialog','metronomeSettingsDialog','infoDialog','menuDialog'])$(id).hidden=true;
 const document={activeElement:new Node(),addEventListener(){},removeEventListener(){}};
 const api=evaluate('let modeGuideReturnFocus=false;'+
  chunk('function modalOpen(name){',"$('menuOpen').addEventListener")+
  chunk('function topDialog(){',"document.addEventListener('keydown'")+
  chunk('let historyDeletePending=false;','function makeHistorySection(')+
  chunk('async function safeStopOnBackground(){','applyPianoVolume(app.pianoVolume,false);')+
  '\n({requestHistoryDeleteConfirmation})',{
   app,$,window,document,closeActiveAudio(){},hideTrainingResult(){},allKeysOff(){},
   cancelMicStart(){cancelled++},resetMainAction(){},notify(){},updateMicToggle(){}
  });
 $('infoDialog').hidden=false;
 const confirmation=api.requestHistoryDeleteConfirmation('recordings');
 assert.equal(window.VoiceLineLifecycle.onBack(),true);assert.equal(await confirmation,false);
 assert.equal($('infoDialog').hidden,false,'first back must not dismiss the underlying history');
 assert.equal(window.VoiceLineLifecycle.onBack(),true);assert.equal($('infoDialog').hidden,true);
 $('metronomeSettingsDialog').hidden=false;assert.equal(window.VoiceLineLifecycle.onBack(),true);assert.equal($('metronomeSettingsDialog').hidden,true);
 assert.equal(window.VoiceLineLifecycle.onBack(),false);
 app.recordSaving=Promise.resolve();assert.equal(window.VoiceLineLifecycle.onBack(),true);
 app.recordSaving=null;app.micStartPromise=Promise.resolve();assert.equal(window.VoiceLineLifecycle.onBack(),true);assert.equal(cancelled,1);
});
test('Local32 cached web piano and JavaScript remain available offline',async()=>{
 const sw=fs.readFileSync(path.join(root,'app/src/main/assets/www/sw.js'),'utf8'),events={};
 const mp3={ok:true,tag:'piano'},script={ok:true,tag:'script'};let fetches=0;
 evaluate(sw,{URL,Response,location:{origin:'https://example.test'},self:{addEventListener:(name,fn)=>events[name]=fn},
  caches:{open:async()=>({match:async request=>request.url.endsWith('.mp3')?mp3:script})},
  fetch:async()=>{fetches++;throw Error('offline')}});
 for(const [file,expected] of [['vendor/salamander/C4v8.mp3',mp3],['piano.js',script]]){
  let answer;events.fetch({request:{method:'GET',url:'https://example.test/'+file,mode:'cors'},respondWith:p=>answer=p,waitUntil(){}});
  assert.equal(await answer,expected);
 }
 assert.equal(fetches,1,'cached piano uses no network; JS attempts refresh then falls back');
});
test('Local32 quick recording stop without any PCM does not leave an empty recovery item',async()=>{
 const h=pcmHarness();Object.assign(h.app,{mic:true,nativeMic:true,nativeSampleRate:44100});h.startRecording();
 assert.equal(await h.stopRecording(),false);assert.ok(!h.app.failedRecording);assert.equal(h.sessions.size,0);
});
test('Application boot, all eleven modes and the merged slide controls execute together',async()=>{
 const $=nodes(),tables={events:new Map(),recordings:new Map(),recordParts:new Map(),recordSessions:new Map(),recordFileDeletes:new Map()};
 const db={transaction(kind){const tx={objectStore(){return Object.fromEntries(['getAll','get','put','delete','count'].map(method=>[method,item=>{
  const req={};queueMicrotask(()=>{
   req.result=method==='getAll'?[...tables[kind].values()]:method==='get'?tables[kind].get(item):undefined;
   if(method==='put')tables[kind].set(item.id,item);if(method==='delete')tables[kind].delete(item);
   req.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());
  });return req;
 }]))}};return tx}};
 const document={hidden:false,activeElement:new Node(),getElementById:$,querySelectorAll:()=>[],addEventListener(){},
  createElement:tag=>{const n=new Node();n.tagName=tag;return n}};
 const window={addEventListener(){},VoiceLineToneEngine:{ready:true,setVolume(){},stopAll(){}},AudioContext:class {
  constructor(){this.currentTime=0;this.state='running';this.destination={}}
  resume(){return Promise.resolve()}
  createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},disconnect(){},start(){},stop(){}}}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
 }};
 const code=js.replace(/\}\)\(\);\s*$/, 'window.__local32Test={app,switchMode,showModeGuide,showHelp,modalClose,updateTraining,applyResponsiveLayout};})();');
 evaluate(fs.readFileSync(path.join(root,'app/src/main/assets/www/recording-tools.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'app/src/main/assets/www/metronome.js'),'utf8')+'\n'+code,{document,window,indexedDB:{open(){const req={result:db};queueMicrotask(()=>req.onsuccess());return req}},
  localStorage:{getItem:()=>null,setItem(){}},navigator:{},location:{hostname:'appassets.androidplatform.net'},screen:{orientation:{}},
  performance:{now:()=>100},getComputedStyle:()=>({paddingRight:'0'}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}});
 await turn();assert.equal($('keyboard').children.length,24);
 window.__local32Test.showHelp();
 const help=$('infoBody').children.map(node=>node.textContent).join('\n');
 assert.match(help,/피아노 건반/);assert.match(help,/음역 슬라이드/);assert.match(help,/호흡/);
 assert.doesNotMatch(help,/건반 소리 진단|소리 테스트|마이크 연결 상태 확인|마이크 상태 진단/);
 assert.equal(window.VoiceLineMicrophoneDiagnostics,undefined);
 window.__local32Test.modalClose('infoDialog');
 for(const mode of ['piano','pitch','record','vibrato','practice','sustainVoice','earVoice','dynamicVoice','warmupVoice','guideVoice','metronome']){
  await window.__local32Test.switchMode(mode);assert.equal(window.__local32Test.app.mode,mode);
  if(mode==='guideVoice'){
   assert.equal($('guideVoicePanel').hidden,false);assert.equal($('trainingOverlay').hidden,true);
   const select=$('exerciseControls').children[0].children[0];
   assert.deepEqual(select.children.map(group=>group.label),['음계·도약','단계별 왕복','연속 슬라이드']);
   assert.equal(select.children.flatMap(group=>group.children).length,18);
   const button=$('exerciseControls').children.find(child=>child.id==='guideSettingsOpen');assert.ok(button);
   button.onclick();assert.equal($('guideSettingsDialog').hidden,false);assert.match($('guidePlanInfo').textContent,/음역.*C4 · 2옥 도/);
   $('guideRoot').value='48';$('guideRounds').value='2';$('guideShift').value='-1';$('guideBpm').value='60';$('guideSound').value='vowel';$('guideNoteSeconds').value='2';
   $('guideSettingsSave').events.click();assert.equal($('guideSettingsDialog').hidden,true);
   assert.equal(window.__local32Test.app.guideSettings.root,48);assert.equal(window.__local32Test.app.guideSettings.sound,'vowel');
   assert.equal(window.__local32Test.app.guideSettings.bpm,60);assert.equal(window.__local32Test.app.trainingSettings.root,60);
   assert.equal(window.__local32Test.app.guideSettings.noteSeconds,2);
  }
  window.__local32Test.showModeGuide(mode);assert.match($('infoTitle').textContent,/설명/);assert.equal($('infoDialog').hidden,false);
  window.__local32Test.modalClose('infoDialog');assert.equal($('infoDialog').hidden,true);
 }
 await window.__local32Test.switchMode('glideVoice');assert.equal(window.__local32Test.app.mode,'guideVoice');
 assert.equal($('modeTitle').textContent,'음역 슬라이드');
 await window.__local32Test.switchMode('metronome');
 assert.ok(window.__local32Test.app.metronome);
 $('metroSettingsOpen').events.click();assert.equal($('metroRhythmPanel').hidden,false);assert.equal($('metroPresetsPanel').hidden,true);
 $('metroTabRhythm').events.keydown({key:'ArrowRight',preventDefault(){}});assert.equal($('metroPresetsPanel').hidden,false);assert.equal($('metroRhythmPanel').hidden,true);
 $('metroTabPresets').events.keydown({key:'ArrowRight',preventDefault(){}});assert.equal($('metroRhythmPanel').hidden,false);assert.equal($('metroPresetsPanel').hidden,true);
 $('metroTabRhythm').events.keydown({key:'End',preventDefault(){}});assert.equal($('metroPresetsPanel').hidden,false);
 $('metroTabPresets').events.keydown({key:'Home',preventDefault(){}});assert.equal($('metroRhythmPanel').hidden,false);
 window.__local32Test.modalClose('metronomeSettingsDialog');assert.equal($('metronomeSettingsDialog').hidden,true);
 $('metroSound').value='wood';$('metroSound').onchange();assert.equal(window.__local32Test.app.metronome.settings.sound,'wood');
 $('metroVolume').value='40';$('metroVolume').oninput();assert.equal(window.__local32Test.app.metronome.settings.volume,40);assert.equal($('metronomeSettingsDialog').hidden,true);
 assert.equal($('metronomePanel').hidden,false);assert.equal($('keyboard').hidden,true);assert.equal($('micToggle').hidden,true);
 await $('metroToggle').onclick();assert.equal(window.__local32Test.app.metronome.running,true);assert.equal(window.__local32Test.app.mic,false);
 assert.match($('metroToggle').textContent,/메트로놈 끄기/);
 $('metroPreset').value='7/8';$('metroPreset').onchange();await turn();assert.equal(window.__local32Test.app.metronome.settings.numerator,7);
 $('metroGroups').value='2+2+3';$('metroApplyGroups').onclick();await turn();
 assert.deepEqual([...window.__local32Test.app.metronome.settings.accents],[2,1,2,1,2,1,1]);
 await window.__local32Test.switchMode('piano');assert.equal(window.__local32Test.app.metronome.running,false);
 assert.equal($('metronomePanel').hidden,true);assert.equal($('keyboard').hidden,false);assert.equal($('micToggle').hidden,false);
 await window.__local32Test.switchMode('warmupVoice');await $('mainButton').events.click();
 const warmup=window.__local32Test.app.training;assert.equal(warmup.mode,'warmupVoice');assert.equal(window.__local32Test.app.mic,false);assert.equal($('warmupGuide').hidden,false);
 window.__local32Test.updateTraining(warmup.start+10000);assert.match($('warmupPhaseTitle').textContent,/지금 허밍/);assert.equal($('warmupSeconds').textContent,'6');
 await $('mainButton').events.click();assert.equal(window.__local32Test.app.training,null);assert.equal(warmup.trainingCueNodes.size,0);
 window.__local32Test.app.micStatusText='마이크 꺼짐 (Android)';
 window.innerWidth=390;window.innerHeight=780;window.__local32Test.applyResponsiveLayout();
 assert.equal($('keyboard').children.length,12);assert.equal(window.__local32Test.app.layoutPortrait,true);
 assert.equal($('micChip').textContent,'마이크 꺼짐');
 window.innerWidth=844;window.innerHeight=390;window.__local32Test.applyResponsiveLayout();assert.equal($('micChip').textContent,'마이크 꺼짐 (Android)');
 window.innerWidth=390;window.innerHeight=780;window.__local32Test.applyResponsiveLayout();
 for(const mode of ['piano','pitch','record','vibrato','practice','sustainVoice','earVoice','dynamicVoice','warmupVoice','guideVoice','metronome']){
  await window.__local32Test.switchMode(mode);assert.equal($('app').dataset.mode,mode);assert.equal($('keyboard').children.length,12);
  window.__local32Test.showModeGuide(mode);assert.equal($('infoDialog').hidden,false);window.__local32Test.modalClose('infoDialog');
 }
 window.innerWidth=844;window.innerHeight=390;window.__local32Test.applyResponsiveLayout();
 assert.equal($('keyboard').children.length,24);assert.equal(window.__local32Test.app.layoutPortrait,false);
});
test('Local32 recording deletion also removes recovery data and waits for one transaction commit',async()=>{
 let transaction,tableNames,settled=false;const deleted=[];
 const db={transaction(names,mode){tableNames=[...names];assert.equal(mode,'readwrite');transaction={objectStore:kind=>({
  delete:id=>deleted.push([kind,id]),index:()=>({openCursor(){const req={result:null};queueMicrotask(()=>req.onsuccess());return req}})
 })};return transaction}};
 const remove=evaluate(chunk('function removeSessionData(','function getHistoryPage(')+'\nremoveSessionData',{
  dbPromise:Promise.resolve(db),IDBKeyRange:{only:id=>id}
 });
 const pending=remove('record-id',true).then(()=>settled=true);await turn();
 assert.equal(settled,false);assert.deepEqual(tableNames,['recordParts','recordSessions','recordings','recordingsMeta','recordFileDeletes']);
 assert.deepEqual(deleted,[['recordSessions','record-id'],['recordings','record-id'],['recordingsMeta','record-id']]);
 transaction.oncomplete();await pending;assert.equal(settled,true);
});
