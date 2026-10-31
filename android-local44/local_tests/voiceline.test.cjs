'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'app/src/main/assets/www/piano.js'),'utf8');
const html=fs.readFileSync(path.join(root,'app/src/main/assets/www/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'app/src/main/assets/www/piano.css'),'utf8');
const manifest=fs.readFileSync(path.join(root,'app/src/main/AndroidManifest.xml'),'utf8');
function snippet(from,to,ending){let start=js.indexOf(from),end=js.indexOf(to,start);assert.ok(start>=0&&end>start,`${from} to ${to} missing`);return js.slice(start,end)+(ending||'');}
const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
const policies=vm.runInNewContext(snippet('const PITCH_RANGE=','const MODES=','\n({PITCH_RANGE,SCORE_RULES})'));
const micSettings=vm.runInNewContext(snippet('const MIC_SENSITIVITIES=','function readMicSensitivity','\n({MIC_SENSITIVITIES})'));
const ruleText=vm.runInNewContext(snippet('function dynamicRuleText(){','function showTrainingResult(','\ndynamicRuleText'),policies);
function runInContext(code,ctx={}){
 for(const [k,v] of Object.entries({...policies,...micSettings,clamp:clip,dynamicRuleText:ruleText}))if(!(k in ctx))ctx[k]=v;
 ctx.window=ctx.window||{};ctx.window.VoiceLineGuideTraining=require('../app/src/main/assets/www/guide-training.js');
 return vm.runInNewContext(code,ctx);
}

test('JavaScript syntax and complete offline piano assets',()=>{
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.equal(fs.readdirSync(path.join(root,'app/src/main/assets/www/vendor/salamander')).filter(x=>x.endsWith('.mp3')).length,28);
 assert.ok(fs.statSync(path.join(root,'app/src/main/assets/www/vendor/tone-piano.js')).size>10000);
 assert.match(manifest,/RECORD_AUDIO/);
});
test('database upgrade keeps old recordings, adds chunk store',()=>{
 assert.match(js,/indexedDB\.open\('voiceline-local-v2',4\)/);
 assert.match(js,/createObjectStore\('recordParts'/);
 assert.match(js,/createObjectStore\('recordings'/);
 assert.match(js,/createObjectStore\('recordSessions'/);
 assert.doesNotMatch(js,/deleteObjectStore/);
});
test('simulated musical pitch 110-880 Hz, weak noise and silence',()=>{
 const code=snippet("function pitchYin(s,sr,recording=false,sensitivity='sensitive'){",'function updateDetection(', '\npitchYin');
 const pitchYin=runInContext(code,{Math,Float32Array,clamp:clip});
 const sr=44100;
 for(let freq of [110,220,440,880]){
  const samples=Float32Array.from({length:4096},(_,i)=>.28*Math.sin(2*Math.PI*freq*i/sr));
  const p=pitchYin(samples,sr);assert.ok(p,'frequency '+freq+' missing');
  assert.ok(Math.abs(p.hz-freq)/freq<.015,`${freq}: ${p.hz}`);
 }
 assert.equal(pitchYin(new Float32Array(4096),sr),null);
 assert.equal(pitchYin(Float32Array.from({length:4096},(_,i)=>.001*Math.sin(i/2)),sr),null);
});
test('vibrato tracks 5Hz signal, avoids steady note as fake vibrato',()=>{
 const code=snippet('function analyzeVibrato(samples,referenceMidi){','function rememberVibratoPoint(', '\nanalyzeVibrato');
 const analyzeVibrato=runInContext(code,{Math,Number,Array});
 const signal=Array.from({length:88},(_,i)=>({t:i*34,midi:60+.23*Math.sin(2*Math.PI*5*(i*34)/1000)}));
 const r=analyzeVibrato(signal,60);
 assert.ok(r&&r.rate!==null,'5Hz vibrato should measure speed');
 assert.ok(Math.abs(r.rate-5)<.7,'5Hz expected, got '+r.rate);
 assert.ok(r.depthCents>14&&r.depthCents<28,'depth cents '+r.depthCents);
 const steady=Array.from({length:88},(_,i)=>({t:i*34,midi:60+.03}));
 const flat=analyzeVibrato(steady,60);assert.ok(flat&&flat.rate===null);
});
test('native recording streams bounded 2 second PCM parts to IndexedDB',async()=>{
 const start=js.indexOf('function encodePcmChunk('),end=js.indexOf('function startRecording(){',start);
 assert.ok(start>=0&&end>start);
 const storage=new Map(),sessions=new Map();
 const store=async(table,op,data)=>{
  if(table==='recordSessions'){sessions.set(data.id,data);return;}
  if(op==='put'){storage.set(data.id,data);return;}
  if(op==='getAll')return [...storage.values()];
  if(op==='delete'){storage.delete(data);return;}
  throw Error('unsupported '+op);
 };
 const funcs=runInContext(js.slice(start,end)+'\n({encodePcmChunk,queueNativePcm,flushNativePcm,finalizeNativePcm,cleanupNativePcm})',{
  Uint8Array,ArrayBuffer,DataView,Blob,Promise,Math,Error,console,store,
  readSessionParts:async sid=>[...storage.values()].filter(p=>p.sessionId===sid),
  removeSessionData:async sid=>{for(const [key,p] of storage)if(p.sessionId===sid)storage.delete(key);sessions.delete(sid)},
 });
 const r={type:'native',id:'testsession',targetRate:16000,partBuffer:[],bufferBytes:0,totalBytes:0,nextPart:0,pending:Promise.resolve(),failedParts:new Map(),error:null,closed:false};
 for(let i=0;i<12;i++){funcs.queueNativePcm(r,'A'.repeat(40000));await r.pending;}
 assert.ok(r.partBuffer.length<=2,'RAM buffer limited to around 2 seconds');
 const result=await funcs.finalizeNativePcm(r);
 assert.equal(result.type,'audio/wav');assert.equal(result.size,12*40000+44);
 const bytes=new Uint8Array(await result.slice(0,44).arrayBuffer());
 assert.equal(String.fromCharCode(...bytes.slice(0,4)),'RIFF');
 assert.equal(String.fromCharCode(...bytes.slice(8,12)),'WAVE');
 await funcs.cleanupNativePcm(r);assert.equal(storage.size,0);
 const sample=funcs.encodePcmChunk(Float32Array.of(-1,0,1));
 assert.equal(sample.length,6);assert.equal(sample[0],0);assert.equal(sample[1],128);
});
test('pitch track saved with recordings and replay playhead',()=>{
 assert.match(js,/pitchTrack:record\.pitchTrack\|\|\[\]/);
 assert.match(js,/function drawHistoryPitch\(/);
 assert.match(js,/audio\.addEventListener\('timeupdate',render\)/);
 assert.match(js,/seek\.addEventListener\('input'/);
 assert.match(js,/function rememberFullRecordingPitch\(/);
 assert.match(js,/recordPitchTrack\.push\(point\)/);
 assert.match(css,/\.history-pitch-graph/);
 assert.match(css,/\.playback-seek/);
});
test('phone/tablet layout, toggle and touch-through graph',()=>{
 for(let id of ['vibratoOverlay','recordPitchOverlay','micToggle','recordPitchGraph','vibratoGraph'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/@media \(max-width:640px\), \(max-height:360px\)/);
 assert.match(js,/safeStopOnBackground\(/);
 assert.match(js,/window\.VoiceLineLifecycle/);
 const java=fs.readFileSync(path.join(root,'app/src/main/java/com/voiceline/app/MainActivity.java'),'utf8');
 assert.match(java,/window\.VoiceLineLifecycle&&window\.VoiceLineLifecycle\.onPause/);
});
test('piano loudness uses independent on-device slider without changing Android system volume',()=>{
 const engine=fs.readFileSync(path.join(root,'app/src/main/assets/www/vendor/tone-piano.js'),'utf8');
 assert.match(html,/id="pianoVolume"[^>]*type="range"[^>]*min="0"[^>]*max="100"/);
 assert.match(html,/id="pianoVolumeValue"/);
 assert.match(css,/\.piano-volume-control/);
 assert.match(js,/const PIANO_VOLUME_KEY='voiceline-piano-volume-v1'/);
 assert.match(js,/VoiceLineToneEngine\?\.setVolume\?\.\(n\)/);
 assert.match(js,/localStorage\.setItem\(PIANO_VOLUME_KEY,String\(n\)\)/);
 assert.match(engine,/setVolume\(r\)/);
 assert.match(engine,/get volume\(\)\{return VL_pianoVolume\}/);
 assert.match(engine,/VL_pianoDb\(VL_pianoVolume\)/);
 assert.match(engine,/function VL_safeRoute\(\)/);
 assert.match(engine,/createDynamicsCompressor/);
 assert.doesNotMatch(js,/AudioManager|setStreamVolume|android\.media\.AudioManager/);
 assert.doesNotMatch(engine,/AudioManager|setStreamVolume/);
 const dbCode=engine.slice(engine.indexOf('function VL_pianoDb('),engine.indexOf('function VL_safeRoute()'));
 const db=runInContext(dbCode+'\nVL_pianoDb');
 assert.equal(db(0),-90);
 assert.ok(db(85)>-11,'default new piano loudness is above the previous -11dB');
 assert.equal(db(100),0);
 assert.ok(db(40)<db(80));
});
test('piano output compressor is connected with a safe fallback',()=>{
 const engine=fs.readFileSync(path.join(root,'app/src/main/assets/www/vendor/tone-piano.js'),'utf8');
 const start=engine.indexOf('function VL_safeRoute(){');
 const end=engine.indexOf('var ye=null,bs=',start);
 assert.ok(start>0&&end>start);
 let messages=[];const guarded={threshold:{value:0},knee:{value:0},ratio:{value:0},attack:{value:0},release:{value:0},connect(x){messages.push('guard->destination')}};
 const device={destination:{},createDynamicsCompressor(){messages.push('created');return guarded}};
 const piano={connect(target){assert.equal(target,guarded);messages.push('piano->guard')},toDestination(){messages.push('fallback')}};
 const route=runInContext(engine.slice(start,end)+'\nVL_safeRoute',{ut:()=>({rawContext:device}),ye:piano,console});
 route();
 assert.deepEqual(messages,['created','piano->guard','guard->destination']);
 assert.ok(guarded.threshold.value<0&&guarded.ratio.value>4);
 messages=[];
 const fallback=runInContext(engine.slice(start,end)+'\nVL_safeRoute',{ut:()=>({rawContext:null}),ye:piano,console:{warn(){}}});
 fallback();assert.deepEqual(messages,['fallback']);
});


test('quiet sung notes detected in recording mode, without inventing silent/noise pitches',()=>{
 const sampleCode=snippet("function pitchYin(s,sr,recording=false,sensitivity='sensitive'){",'function updateDetection(', '\npitchYin');
 const pitchYin=runInContext(sampleCode,{Math,Float32Array,clamp:clip});
 const sr=44100;
 // Quiet singing at 0.005 amplitude was below the previous hard 0.009 threshold.
 for(const freq of [82.41,110,220,440,880]){
  const voice=Float32Array.from({length:4096},(_,i)=>.006*Math.sin(2*Math.PI*freq*i/sr)+.001*Math.sin(2*Math.PI*freq*2*i/sr));
  const measured=pitchYin(voice,sr,true);
  assert.ok(measured, 'quiet singing '+freq+' Hz should be tracked');
  assert.ok(Math.abs(measured.hz-freq)/freq<.02,'quiet pitch error '+measured.hz+' for '+freq);
 }
 const veryQuiet=Float32Array.from({length:4096},(_,i)=>.0003*Math.sin(2*Math.PI*220*i/sr));
 assert.equal(pitchYin(veryQuiet,sr,true),null,'true near silence is rejected');
 let seed=12731;
 const noise=Float32Array.from({length:4096},()=>{
  seed=(1664525*seed+1013904223)>>>0;
  return ((seed/0x100000000)*2-1)*.018;
 });
 assert.equal(pitchYin(noise,sr,true),null,'unvoiced random noise must not become a note');
 assert.equal(pitchYin(Float32Array.from({length:4096},(_,i)=>.006*Math.sin(2*Math.PI*220*i/sr)),sr,false,'standard'),null,
  'standard sensitivity retains the previous conservative silence gate');
});

test('brief missed note links are dashed estimates, long gaps remain open',()=>{
 const source=snippet('const RECORD_PITCH_BRIDGE_MS=', 'function rememberRecordPitchPoint(', '\ntraceRecordingPitch');
 const draw=runInContext(source,{Number,Math});
 const calls=[];
 const ctx={beginPath:()=>{},moveTo:()=>{},lineTo:()=>{},stroke:()=>calls.push(ctx.strokeStyle),setLineDash:pattern=>{ctx.dash=pattern},strokeStyle:'',lineWidth:0};
 let points=[{t:0,midi:60},{t:90,midi:60.2},{t:180,midi:null},{t:270,midi:60.3},
  {t:1300,midi:60.2},{t:1400,midi:60.1}];
 const stats=draw(ctx,points,p=>p.t,p=>p);
 assert.equal(stats.solid,2,'valid close notes use solid segments');
 assert.equal(stats.estimated,1,'one missing frame is shown as a dashed estimate');
 assert.equal(calls.length,3,'no line bridges the long unknown span');
 assert.match(calls[1],/rgba/,'short uncertain span visually distinct');
 const leaps=draw(ctx,[{t:0,midi:60},{t:90,midi:null},{t:180,midi:75}],p=>p.t,p=>p);
 assert.equal(leaps.estimated,0,'sudden >5-semitone jump never bridged');
});

test('recording UI distinguishes detected sound from estimated musical pitch',()=>{
 assert.match(js,/recordSignalRms=microphoneSignalRms\(sound\)/);
 assert.match(js,/app\.mode==='record'\)/,'record mode gets sensitive pitch settings');
 assert.match(js,/소리는 감지 · 음정 분석 중/);
 assert.match(js,/const fresh=latest&&now-latest\.t<350/,'old notes not displayed as live current note');
 assert.match(js,/VoiceLineRecordingTools\.drawPitch\(/,'history delegates to the cached recording renderer');
 assert.match(js,/rememberFullRecordingPitch\(t,null\)/,'unknown voice pitch remains missing in saved track');
});

test('history deletion updates visible counts, empty notices and preserves other playback',async()=>{
 const sectionStart=js.indexOf('function makeHistorySection(');
 const sectionEnd=js.indexOf('function drawHistoryPitch(',sectionStart);
 assert.ok(sectionStart>0&&sectionEnd>sectionStart);
 const changed=[],storeRows={recordings:new Set(['r1','r2']),events:new Set(['e1'])};
 const createNode=(tag,cls='',val='')=>({tag,className:cls,textContent:val,hidden:false,disabled:false,
   children:[],parent:null,append(el){this.children.push(el);el.parent=this},
   remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null},
   setAttribute(key,val){this[key]=val}});
 const body=createNode('div'),app={openAudioRecordId:'r2'};
 const notify=s=>changed.push(s),closeActiveAudio=()=>{changed.push('stop playback');app.openAudioRecordId=null};
 let allowDelete=true,shouldFail=false,resolveGate;
 const store=async(kind,method,id)=>{
   if(method==='get')return {id};
   assert.equal(method,'delete');
   if(shouldFail)throw Error('mock database failure');
   if(resolveGate)await resolveGate;
   storeRows[kind].delete(id);
 };
 const ctx={app,plain:(parent,tag,cls='',val='')=>{let el=createNode(tag,cls,val);parent.append(el);return el},
   store,removeSessionData:async(id,removeRecording)=>{assert.equal(removeRecording,true);await store('recordings','delete',id)},
   requestHistoryDeleteConfirmation:async()=>allowDelete,closeActiveAudio,notify,console};
 const {makeHistorySection,deleteHistoryRow}=runInContext(js.slice(sectionStart,sectionEnd)+
    '\n({makeHistorySection,deleteHistoryRow})',ctx);
 const recordings=makeHistorySection(body,'녹음 파일','아직 저장된 녹음이 없습니다.');
 const events=makeHistorySection(body,'연습 기록','아직 연습 기록이 없습니다.');
 const r1=createNode('div','history-row'),r2=createNode('div','history-row'),e1=createNode('div','history-row');
 recordings.list.append(r1);recordings.list.append(r2);events.list.append(e1);
 recordings.refresh();events.refresh();
 assert.equal(recordings.list.parent.children[0].textContent,'녹음 파일 (2)');
 assert.equal(events.list.parent.children[0].textContent,'연습 기록 (1)');
 assert.equal(recordings.list.parent.children[2].hidden,true);
 const firstButton=createNode('button');
 assert.equal(await deleteHistoryRow('recordings','r1',r1,recordings,firstButton),true);
 assert.equal(recordings.list.parent.children[0].textContent,'녹음 파일 (1)');
 assert.equal(recordings.list.parent.children[2].hidden,true);
 assert.ok(!changed.includes('stop playback'),'unrelated audio must not stop');
 assert.equal(await deleteHistoryRow('recordings','r2',r2,recordings,createNode('button')),true);
 assert.equal(recordings.list.parent.children[0].textContent,'녹음 파일 (0)');
 assert.equal(recordings.list.parent.children[2].hidden,false);
 assert.ok(changed.includes('stop playback'),'delete currently playing recording stops its audio');
 assert.equal(await deleteHistoryRow('events','e1',e1,events,createNode('button')),true);
 assert.equal(events.list.parent.children[0].textContent,'연습 기록 (0)');
 assert.equal(events.list.parent.children[2].hidden,false);
 // A rejected transaction must NOT remove UI rows or update the counter.
 shouldFail=true;
 const extra=createNode('div','history-row');events.list.append(extra);events.refresh();
 const failButton=createNode('button');
 assert.equal(await deleteHistoryRow('events','invalid',extra,events,failButton),false);
 assert.equal(failButton.disabled,false);
 assert.equal(failButton.textContent,'삭제');
 assert.equal(events.list.parent.children[0].textContent,'연습 기록 (1)');
 assert.equal(events.list.children.length,1);
 allowDelete=false;shouldFail=false;
 assert.equal(await deleteHistoryRow('events','invalid',extra,events,failButton),false);
 assert.equal(events.list.children.length,1,'cancelled deletion keeps item');
});

test('history store awaits IndexedDB commit instead of request success',()=>{
 const dbCode=js.slice(js.indexOf('function store(kind,method,item){'),js.indexOf('async function importLegacyRecords(){'));
 assert.match(dbCode,/req\.onsuccess=\(\)=>\{result=req\.result;\}/);
 assert.match(dbCode,/tx\.oncomplete=\(\)=>resolve\(result\)/);
 assert.match(dbCode,/tx\.onabort=/);
 assert.doesNotMatch(dbCode,/req\.onsuccess=\(\)=>resolve/);
});

// Local21: exercise pattern library and automatic repeat regression tests.
test('practice has 13 distinct patterns and never requests an unavailable piano note',()=>{
 const section=snippet('const EXERCISE_PATTERNS=','function playReference(m){','\n({EXERCISE_PATTERNS,exerciseSteps})');
 const app={exercisePattern:'scale',exerciseRoot:60};
 const {EXERCISE_PATTERNS,exerciseSteps}=runInContext(section,{app,Math});
 const keys=Object.keys(EXERCISE_PATTERNS);
 assert.equal(keys.length,13);
 for(const old of ['scale','triad','sustain','down'])assert.ok(keys.includes(old),'preserve '+old);
 for(const pattern of keys){
  for(const root of [36,60,85,95]){
   const steps=Array.from(exerciseSteps(pattern,root));
   assert.ok(steps.length>=4,pattern+' is playable');
   assert.ok(steps.every(n=>Number.isInteger(n)&&n>=policies.PITCH_RANGE.minMidi&&n<=policies.PITCH_RANGE.maxMidi),pattern+' valid note '+root);
  }
 }
 assert.deepEqual(Array.from(exerciseSteps('octave',60)),[60,72,60,72,60]);
 assert.deepEqual(Array.from(exerciseSteps('octave',95)),[94,82,94,82,94]);
});

test('practice repeat count advances rounds, locks controls, ends and stores score once',()=>{
 const section=snippet('const EXERCISE_PATTERNS=','function rememberFullRecordingPitch(', '\n({startExercise,updateExercise,finishExercise,exerciseSteps,savePracticeOptions,restorePracticeOptions})');
 const events=[],controls=Object.fromEntries(['pattern','root','tempo','repeatCount'].map(key=>[key,{disabled:false}]));
 controls.mainButton={textContent:''};controls.stopButton={hidden:false};
 const app={exercisePattern:'triad',exerciseRoot:60,exerciseSpeed:1200,exerciseRepeats:2,exercise:null,mic:true,base:48};
 const local=new Map();
 const ctx={app,Math,Number,JSON,
  localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},
  $:id=>controls[id],
  setMessage:s=>events.push('message:'+s),progress:(n,s)=>events.push(['progress',n,s]),
  window:{VoiceLineToneEngine:{ready:true,status:'ready',reference(n){events.push(['note',n]);return Promise.resolve();}}},name:n=>'n'+n,koname:n=>'kn'+n,noteLabel:n=>'n'+n+' · kn'+n,
  addEvent:(name,detail,kind)=>events.push(['saved',name,detail,kind]),
  syncKeyColors:()=>{},drawKeys:()=>{},clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),
  stopMic:()=>{app.mic=false;events.push('mic stopped')},
  document:{createElement:()=>({})}};
 const {startExercise,updateExercise,exerciseSteps}=runInContext(section,ctx);
 assert.equal(exerciseSteps().length,5);
 startExercise(100);
 assert.ok(controls.pattern.disabled&&controls.repeatCount.disabled);
 assert.equal(app.exercise.start,3100);
 updateExercise(2000);assert.equal(app.exercise.target,null,'pre-countdown never measures an incorrect target');
 for(let i=0;i<5;i++)updateExercise(3100+i*1200+1);
 updateExercise(9101);
 assert.equal(app.exercise.round,2);assert.equal(app.exercise.completedRounds,1);
 assert.equal(app.exercise.target,null,'between rounds clears prior target');
 assert.equal(app.exercise.start,10501,'waiting gap is 1.4 sec');
 updateExercise(10500);assert.equal(app.exercise.target,null);
 for(let i=0;i<5;i++)updateExercise(10501+i*1200+1);
 updateExercise(16502);
 assert.equal(app.exercise,null);
 assert.equal(app.mic,false);
 assert.equal(controls.stopButton.hidden,true);
 assert.equal(controls.mainButton.textContent,'연습 시작');
 assert.equal(controls.pattern.disabled,false);
 const saved=events.filter(e=>Array.isArray(e)&&e[0]==='saved');
 assert.equal(saved.length,1);
 assert.match(saved[0][2],/2회/);
 assert.equal(events.filter(e=>e==='mic stopped').length,1);
 assert.equal(events.filter(e=>Array.isArray(e)&&e[0]==='note').length,10,'reference notes played once each step');
});

test('unlimited repeat ends only when user stops and stores fully completed rounds',()=>{
 const section=snippet('const EXERCISE_PATTERNS=','function rememberFullRecordingPitch(', '\n({startExercise,updateExercise,finishExercise})');
 const records=[],elems=Object.fromEntries(['pattern','root','tempo','repeatCount'].map(key=>[key,{disabled:false}]));
 elems.mainButton={textContent:''};elems.stopButton={hidden:false};
 const app={exercisePattern:'fifth',exerciseRoot:65,exerciseSpeed:1200,exerciseRepeats:0,mic:true,base:48};
 const api=runInContext(section,{app,Math,Number,
  $:x=>elems[x],setMessage:()=>{},progress:()=>{},window:{VoiceLineToneEngine:{ready:true,status:'ready',reference:()=>Promise.resolve()}},
  name:x=>String(x),koname:x=>String(x),noteLabel:x=>'n'+x,clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),drawKeys:()=>{},
  syncKeyColors:()=>{},addEvent:(...args)=>records.push(args),stopMic:()=>{throw Error('infinite repeat should not auto-stop')}
 });
 api.startExercise(0);
 assert.equal(app.exercise.repeatLimit,0);
 for(let i=0;i<5;i++)api.updateExercise(3000+i*1200+1);
 api.updateExercise(9001);
 assert.equal(app.exercise.completedRounds,1);
 assert.equal(app.exercise.round,2);
 assert.equal(records.length,0,'do not save until deliberately stopped');
 api.finishExercise(false);
 assert.equal(app.exercise,null);
 assert.equal(records.length,1);
 assert.match(records[0][1],/1회/);
 assert.match(records[0][1],/중단/);
 // Stopping before one round finishes should NOT create a falsely completed session.
 app.exerciseRepeats=3;api.startExercise(0);api.updateExercise(3000);
 api.finishExercise(false);
 assert.equal(records.length,1);
});

test('practice settings saved and reloaded with sanitization, including infinity',()=>{
 const section=snippet('const EXERCISE_PATTERNS=','function modeControls(){','\n({savePracticeOptions,restorePracticeOptions})');
 const settings=new Map();
 const app={exercisePattern:'minor',exerciseRoot:66,exerciseSpeed:2800,exerciseRepeats:0};
 const {savePracticeOptions,restorePracticeOptions}=runInContext(section,{app,localStorage:{getItem:k=>settings.get(k),setItem:(k,v)=>settings.set(k,v)}});
 savePracticeOptions();
 app.exercisePattern='scale';app.exerciseRoot=60;app.exerciseSpeed=1800;app.exerciseRepeats=1;
 restorePracticeOptions();
 assert.equal(app.exercisePattern,'minor');assert.equal(app.exerciseRoot,66);
 assert.equal(app.exerciseSpeed,2800);assert.equal(app.exerciseRepeats,0);
 settings.set('voiceline-practice-v1',JSON.stringify({pattern:'bad',root:300,speed:45,repeats:17}));
 restorePracticeOptions();
 assert.equal(app.exercisePattern,'minor');assert.equal(app.exerciseRoot,66);
 assert.equal(app.exerciseSpeed,2800);assert.equal(app.exerciseRepeats,0);
});
test('Vibrato shows exact evidence thresholds, incomplete cycles, wrong reference and weak tremolo',()=>{
 const code=snippet('function analyzeVibrato(samples,referenceMidi){','function rememberVibratoPoint(', '\n({analyzeVibrato,describeVibratoProgress})');
 const funcs=runInContext(code,{Math,Number,Array,name:m=>'C4',noteLabel:m=>'C4 · 2옥 도'});
 const pts=Array.from({length:64},(_,i)=>({t:i*46,midi:60+.26*Math.sin(2*Math.PI*5*i*46/1000)}));
 const data=funcs.analyzeVibrato(pts,60);
 assert.ok(data&&data.rate!==null,'5Hz at actual 46ms mic chunk should be measurable');
 assert.ok(Math.abs(data.rate-5)<.7,`rate ${data.rate}`);
 assert.ok(funcs.describeVibratoProgress(pts,60,data,true).label.includes('측정 완료'));
 const quiet=pts.map(p=>({...p,midi:60+.025*Math.sin(2*Math.PI*5*p.t/1000)}));
 const small=funcs.analyzeVibrato(quiet,60);
 assert.match(funcs.describeVibratoProgress(quiet,60,small,true).label,/폭 부족/);
 const wrong=pts.map(p=>({...p,midi:p.midi+5}));
 assert.match(funcs.describeVibratoProgress(wrong,60,null,true).label,/기준음/);
 assert.match(funcs.describeVibratoProgress([],60,null,false).label,/마이크 꺼짐/);
});
test('Local23 app logo is specified for native launcher and visible inside application',()=>{
 const java=fs.readFileSync(path.join(root,'app/src/main/java/com/voiceline/app/NativeMicBridge.java'),'utf8');
 assert.match(java,/int chunkSize\s*=\s*rate\s*>=\s*32000\s*\?\s*2048\s*:\s*1024/);
 assert.match(js,/if\(sr>=32000&&s\.length>=2048\)/);
 assert.match(manifest,/android:icon="@mipmap\/ic_launcher"/);
 assert.match(manifest,/android:roundIcon="@mipmap\/ic_launcher_round"/);
 assert.match(html,/<img class="brand-logo" src="icon-192.png"/);
 assert.match(html,/id="vibratoFeedback"/);
 assert.match(css,/\.brand-logo\{/);
 assert.match(css,/\.vibrato-feedback\{/);
 for(const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi'])
  assert.ok(fs.statSync(path.join(root,`app/src/main/res/mipmap-${density}/ic_launcher.png`)).size>1000);
});

test('Vibrato criteria are directly discoverable, match actual thresholds, and explain stalled measurement',()=>{
 assert.match(js,/id="vibratoCriteriaBtn"/);
 assert.match(js,/addEventListener\('click',showVibratoCriteria\)/);
 assert.match(js,/function showVibratoCriteria\(\)/);
 assert.match(js,/infoTitle'\)\.textContent='비브라토 측정 기준'/);
 for(const phrase of ['최근 3초','±150cent','16개 이상','0.9초','±7~125cent','3~9Hz','주기 4개 이상','±35%'])
   assert.ok(js.includes(phrase),'missing user-facing threshold '+phrase);
 assert.match(css,/\.vibrato-criteria-btn/);
 assert.match(js,/음정 입력이 끊겼습니다/);
});

test('Microphone toolbar feedback shows state changes once, explains piano interference, and can close',()=>{
 assert.match(html,/id="micNotice"[^>]*role="status"/);
 assert.match(html,/id="micNoticeDismiss"/);
 assert.match(css,/\.mic-notice\{/);
 const source=snippet('// Microphone feedback stays in the existing toolbar gap','function updateMicToggle(){','');
 const els={micChip:{textContent:''},micNotice:{hidden:true,classList:{toggle(){}}},
  micNoticeTitle:{textContent:''},micNoticeBody:{textContent:''},micNoticeSymbol:{textContent:''},
  micNoticeDismiss:{addEventListener:(event,handler)=>els.close=handler}};
 const app={mic:false};let scheduled=0;
 const vmContext={app,$:id=>els[id],document:{hidden:false},updateMicToggle:()=>{},
  setTimeout:()=>{scheduled++;return scheduled},clearTimeout:()=>{}};
 const ctx=vm.createContext(vmContext);
 vm.runInContext(source+'\n({micStatus,closeMicNotice})',ctx);
 const status=vm.runInContext('micStatus',ctx);
 status('마이크 준비');assert.equal(els.micNotice.hidden,true,'initial OFF does not interrupt');
 app.mic=true;status('켜짐');
 assert.equal(els.micNotice.hidden,false);assert.match(els.micNoticeTitle.textContent,/켜졌습니다/);
 assert.match(els.micNoticeBody.textContent,/이어폰/);
 const n=scheduled;status('재확인');assert.equal(scheduled,n,'not shown repeatedly for same state');
 app.mic=false;status('꺼짐');assert.match(els.micNoticeTitle.textContent,/꺼졌습니다/);
 assert.match(els.micNoticeBody.textContent,/다시 켜집니다/);
 els.close();assert.equal(els.micNotice.hidden,true,'close dismisses toolbar feedback');
 vmContext.document.hidden=true;app.mic=true;status('켜짐');
 assert.equal(els.micNotice.hidden,true,'background changes clear stale foreground feedback');
 assert.match(js,/if\(app\.mode==='practice'\)setMessage\(MODES\.practice\[1\]\)/,
  'practice heading keeps its explanation instead of overwriting with a warning');
});

test('Local24 practice settings expose discoverable left/right cues and never show them if all fit',()=>{
 for(const id of ['practiceScrollShell','practiceScrollPrev','practiceScrollNext'])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(css,/\.practice-scroll-arrow\.next/);
 assert.match(css,/\.practice-scroll-shell\.has-more/);
 assert.match(js,/addEventListener\('scroll',updatePracticeScrollHint/);
 const source=snippet('// Arrows remain visible only when more practice options exist off-screen.','restorePracticeOptions();restoreTrainingSettings();','');
 const callbacks={};const clas=new Set();
 const c={scrollWidth:540,clientWidth:300,scrollLeft:0,
  addEventListener:(k,cb)=>callbacks[k]=cb,
  scrollBy({left}){this.scrollLeft=Math.max(0,Math.min(this.scrollWidth-this.clientWidth,this.scrollLeft+left));}}
 const shell={classList:{toggle:(key,yes)=>yes?clas.add(key):clas.delete(key),contains:key=>clas.has(key)}};
 const prev={hidden:true,addEventListener:(k,cb)=>callbacks.prev=cb};
 const next={hidden:true,addEventListener:(k,cb)=>callbacks.next=cb};
 const map={exerciseControls:c,practiceScrollShell:shell,practiceScrollPrev:prev,practiceScrollNext:next};
 const app={mode:'practice'};
 const vmContext={app,$:id=>map[id],window:{ResizeObserver:null,addEventListener:()=>{}},queueResponsiveLayout(){},
  requestAnimationFrame:cb=>cb(),Math,parseFloat,getComputedStyle:()=>({paddingRight:clas.has('has-more')?'72px':'0px'})};
 const ctx=vm.createContext(vmContext);
 vm.runInContext(source,ctx);
 const update=vm.runInContext('updatePracticeScrollHint',ctx);
 update();assert.equal(next.hidden,false);assert.equal(prev.hidden,true);
 callbacks.next();assert.ok(c.scrollLeft>0);assert.equal(prev.hidden,false);
 c.scrollLeft=240;update();assert.equal(next.hidden,true);
 c.scrollWidth=270;c.scrollLeft=0;update();assert.equal(next.hidden,true);assert.equal(prev.hidden,true);
 app.mode='record';c.scrollWidth=680;update();assert.equal(next.hidden,true,'other modes do not show practice arrows');
});


test('custom delete dialog hides WebView origin, distinguishes recording/event and respects cancel/confirm',async()=>{
 assert.match(html,/id="historyDeleteDialog"[^>]*hidden/);
 for(const id of ['historyDeleteCancel','historyDeleteConfirm','historyDeleteTitle','historyDeleteText','historyDeleteWarning'])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(html,/role="alertdialog"[^>]*aria-modal="true"/);
 assert.match(css,/\.history-delete-backdrop\{z-index:85/);
 assert.doesNotMatch(js,/if\s*\(\s*!\s*confirm\(/,'native JavaScript confirm must not expose appassets URL');
 const start=js.indexOf('let historyDeletePending=false;');
 const end=js.indexOf('function makeHistorySection(',start);
 assert.ok(start>=0&&end>start);
 const listeners=new Map();
 const document={activeElement:null,
  addEventListener(type,fn){listeners.set(type,fn)},
  removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type)}
 };
 function node(){return {hidden:true,textContent:'',isConnected:true,
  events:new Map(),addEventListener(type,fn){this.events.set(type,fn)},
  removeEventListener(type,fn){if(this.events.get(type)===fn)this.events.delete(type)},
  focus(){document.activeElement=this},click(){this.events.get('click')?.({target:this})}}}
 const nodes={historyDeleteDialog:node(),historyDeleteCancel:node(),historyDeleteConfirm:node(),
 historyDeleteTitle:node(),historyDeleteText:node(),infoClose:node()};
 const trigger=node();document.activeElement=trigger;
 const ctx={document,$:id=>nodes[id],Promise};
 const request=runInContext(js.slice(start,end)+'\nrequestHistoryDeleteConfirmation',ctx);
 let pending=request('events');
 assert.equal(nodes.historyDeleteDialog.hidden,false);
 assert.equal(nodes.historyDeleteTitle.textContent,'연습 기록 삭제');
 assert.equal(document.activeElement,nodes.historyDeleteCancel);
 assert.equal(await request('events'),false,'a second confirmation cannot override existing dialog');
 nodes.historyDeleteCancel.click();
 assert.equal(await pending,false,'cancel must not delete records');
 assert.equal(nodes.historyDeleteDialog.hidden,true);
 assert.equal(document.activeElement,trigger,'cancel restores focus');
 pending=request('recordings');
 assert.equal(nodes.historyDeleteTitle.textContent,'녹음 파일 삭제');
 nodes.historyDeleteConfirm.click();
 assert.equal(await pending,true,'destructive action requires explicit user confirmation');
 assert.equal(document.activeElement,nodes.infoClose,'confirm returns focus to records dialog');
 pending=request('events');
 let prevented=false;listeners.get('keydown')({key:'Escape',preventDefault(){prevented=true}});
 assert.equal(await pending,false);
 assert.equal(prevented,true);
});


test('Local25 history deletion uses own confirmation without WebView URL',()=>{
 assert.match(html,/id="historyDeleteDialog"/);
 assert.match(html,/id="historyDeleteTitle"/);
 assert.match(html,/id="historyDeleteConfirm"/);
 assert.match(js,/requestHistoryDeleteConfirmation\(kind\)/);
 assert.match(js,/await requestHistoryDeleteConfirmation\(kind\)/);
 assert.doesNotMatch(js,/\bconfirm\(question\)/);
 assert.match(css,/\.history-delete-backdrop/);
});
test('Local26 brand wordmark is a single line and stays inside header',()=>{
 assert.match(html,/<span class="brand-word"><span class="brand-title">VOICE<span>LINE<\/span><\/span><small>보이스라인<\/small><\/span>/);
 assert.match(css,/\.toolbar \.brand-title\{[^}]*white-space:nowrap/);
 assert.match(css,/\.toolbar \.brand-title>span\{color:var\(--mint\)\}/);
 assert.match(css,/@media\(max-width:640px\), \(max-height:360px\)/);
 assert.match(css,/\.toolbar \.brand-word>small\{display:none\}/);
});

test('Local27 separates legacy recording events from practice records without deleting user data',()=>{
 const source=snippet('function isPracticeHistoryEvent(event){','async function renderRecoverableRecordings(','\nisPracticeHistoryEvent');
 const visible=runInContext(source,{Boolean});
 const rows=[
  {id:'old1',mode:'record',title:'녹음 완료'},
  {id:'old2',mode:'legacy',title:'녹음 완료'},
  {id:'practice',mode:'practice',title:'음정 연습'},
  {id:'vibrato',mode:'vibrato',title:'비브라토 연습'},
  {id:'pitch',mode:'pitch',title:'음정 측정'},
 ];
 const practiceRows=rows.filter(visible);
 assert.deepEqual(practiceRows.map(e=>e.id),['practice','vibrato','pitch']);
 assert.equal(rows.length,5,'visibility filtering must not mutate persisted events');
 assert.equal(visible(null),false);
 assert.match(js,/kind==='events'&&!isPracticeHistoryEvent\(value\)/,'actual paged records screen filters legacy duplicate events');
});
test('Local27 saving a recording creates a recording file only, never a practice event',async()=>{
 const code=snippet('async function retryRecording(record){','async function recoverRecording(')+snippet('function recordTime(milliseconds){','async function stopRecording(){')+snippet('async function stopRecording(){','async function finishVibrato(){','\nstopRecording');
 const blob=new Blob([new Uint8Array(512)],{type:'audio/webm'});
 const writes=[];
 const elements={mainButton:{textContent:'녹음 중지',classList:{remove() {}}}};
 const app={record:{type:'media',mr:{state:'inactive'},complete:Promise.resolve(blob)},recordStart:0,
  recordPitchTrack:[[100,69]],recordPitchLow:68,recordPitchHigh:71,recordPitchFrozenAt:null,recordSaving:null};
 const cb=runInContext(code,{
  app,performance:{now:()=>3000},$:(id)=>elements[id],renderRecordPitchOverlay:()=>{},
  store:async(kind,op,item)=>{writes.push({kind,op,item})},
  addEvent:async()=>{throw Error('must not log recording into practice history')},
  notify:()=>{},progress:()=>{},id:()=> 'record-27',stamp:()=> '오늘',Blob,Math,Number,
  console,cleanupNativePcm:async()=>{},finalizeNativePcm:async()=>{},wavBlob:()=>blob,
 });
 assert.equal(await cb(),true);
 assert.equal(writes.length,1,'only one IndexedDB record must be written');
 assert.equal(writes[0].kind,'recordings');
 assert.equal(writes[0].op,'put');
 assert.equal(writes[0].item.id,'record-27');
 assert.equal(writes[0].item.pitchTrack.length,1);
 assert.equal(app.record,null);
 assert.equal(app.recordSaving,null);
});

// Vocal practice remains separate from audio recordings after menu consolidation.
test('Merged slide and other voice training modes remain reachable',()=>{
 const modes=['sustainVoice','practice','earVoice','dynamicVoice','warmupVoice','metronome'];
 for(const mode of modes){assert.match(html,new RegExp('data-screen="'+mode+'"'));assert.match(js,new RegExp(mode+":\\["));}
 for(const id of ['trainingOverlay','trainingGraph','trainingMetric1','trainingMetric2','trainingMetric3','trainingMetric4'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(css,/\.training-overlay/);
 assert.match(js,/syncTrainingOverlay\(\)/);
 assert.match(js,/if\(app\.training\)finishTraining\(false\)/);
 assert.match(js,/if\(app\.training\?\.active\)updateTraining\(t\)/);
});
test('Local28: training duration, target path and phases are deterministic',()=>{
 const scope=snippet('const TRAINING_MODES=new Set(', 'function startTraining(t){', '\n({TRAINING_MODES,trainingDuration,trainingTargetAt,trainingPhase,newTrainingSession})');
 const ctx={Math,Number,Array,Set,Object,performance:{now:()=>2000},clamp:clip};
 const f=runInContext(scope,ctx);
 const settings={root:60,sustainSeconds:8,glideSpan:7,glideStyle:'smooth',glideStepSeconds:3,earCount:4,tempo:80,rounds:2};
 settings.guide={pattern:'smooth7',root:60,rounds:1,shift:0};
 assert.equal(f.trainingDuration('sustainVoice',settings),8000);
 assert.equal(f.trainingDuration('guideVoice',settings),28400);
 assert.equal(f.trainingDuration('earVoice',settings),18800);
 assert.equal(f.trainingDuration('dynamicVoice',settings),12000);
 assert.equal(f.trainingDuration('warmupVoice',settings),38000);
 const glide=f.newTrainingSession('guideVoice',2000,settings);
 assert.equal(f.trainingTargetAt(glide,0),60);
 assert.equal(f.trainingTargetAt(glide,6000),67);
 assert.equal(f.trainingTargetAt(glide,12000),60);
 assert.equal(f.trainingPhase(f.newTrainingSession('earVoice',2000,settings),300),'listen');
 assert.equal(f.trainingPhase(f.newTrainingSession('earVoice',2000,settings),1600),'answer');
 const breath=f.newTrainingSession('warmupVoice',2000,settings);
 assert.equal(f.trainingPhase(breath,0),'들이쉬기');
 assert.equal(f.trainingPhase(breath,5000),'내쉬기');
 assert.equal(f.trainingPhase(breath,11000),'편안하게 허밍');
 assert.equal(f.trainingPhase(breath,17000),'쉬기');
});
test('Pitch exercises score actual samples without inventing voice coverage',()=>{
 const scope=snippet('const TRAINING_MODES=new Set(', 'function updateTraining(t){', '\n({newTrainingSession,receiveTrainingSample})');
 const ctx={Math,Number,Array,Set,Object,performance:{now:()=>0},clamp:clip};
 const f=runInContext(scope,ctx);
 const opt={root:60,sustainSeconds:8,glideSpan:7,glideStyle:'smooth',glideStepSeconds:3,earCount:4,tempo:80,rounds:2};
 const a=f.newTrainingSession('sustainVoice',0,opt);ctx.app={training:a};
 f.receiveTrainingSample(1820,60.13,.08);f.receiveTrainingSample(1900,60.12,.08);
 f.receiveTrainingSample(2020,61.0,.08);f.receiveTrainingSample(2100,null,.08);
 assert.equal(a.valid,3);assert.equal(a.good,2);assert.equal(a.history.length,4);

});
test('Local28: warmup starts without demanding microphone and training results go to exercise events',()=>{
 assert.match(js,/app\.mode==='warmupVoice'\|\|await startMic\(\)/);
 assert.doesNotMatch(html,/data-screen="guideVoice"/);
 assert.match(js,/if\(perfor[mance]+\.now\(\)>=a\.start\)/);
 assert.match(js,/if\(app\.training\)finishTraining\(false\)/);
 assert.match(js,/trainingOverlay/);
 assert.match(js,/실제 호흡량이나 발성 건강을 판단하지 않습니다/);
});

test('Local29: one shared pitch formatter identifies Western octave and Korean solfege',()=>{
 const from=js.indexOf('const NAMES='),end=js.indexOf('function frequency(',from);
 assert.ok(from>=0&&end>from);
 // Only take pure constants and note helpers: app configuration is independent.
 const a=js.slice(js.indexOf('const NAMES='),js.indexOf('const BLACK='));
 const b=js.slice(js.indexOf('function name('),end);
 const f=runInContext(a+'\n'+b+'\n({name,koname,noteLabel})',{Math});
 assert.equal(f.noteLabel(60),'C4 · 2옥 도');
 assert.equal(f.noteLabel(61),'C♯4 · 2옥 도♯');
 assert.equal(f.noteLabel(69),'A4 · 2옥 라');
 assert.equal(f.noteLabel(48),'C3 · 1옥 도');
 assert.match(js,/label\.className='key-label two-line-key-label'/);
 assert.match(js,/west\.textContent=name\(m\)/);
 assert.match(js,/korean\.textContent=koname\(m\)/);
 assert.match(js,/key\.setAttribute\('aria-label',noteLabel\(m\)\)/);
 assert.match(js,/\$\('recordCurrentPitch'\)\.textContent=fresh\?noteLabel/);
 assert.match(js,/\$\('trainingMetric1'\)\.textContent/);
 assert.match(js,/\$\('vibratoTargetLabel'\)\.textContent='기준음 '\+noteLabel/);
 assert.match(css,/\.black-key \.key-note-korean/);
});
test('Local43 note selectors group C4 with the same Korean second octave shown on the keys',()=>{
 const a=snippet('const NAMES=','const BLACK='),b=snippet('function name(','function frequency(');
 const createElement=()=>({children:[],append(node){this.children.push(node)}}),select=createElement();
 const fill=runInContext(a+b+snippet('function fillNotes(','function exerciseSteps(')+'\nfillNotes',{document:{createElement}});
 fill(select,60);assert.equal(select.value,'60');assert.equal(select.children[0].label,'0옥 · C2–B2');
 const middle=select.children[2];assert.equal(middle.label,'2옥 · C4–B4');
 assert.equal(middle.children.find(option=>option.value==='60').textContent,'C4 · 2옥 도');
 assert.equal(middle.children.find(option=>option.value==='61').textContent,'C♯4 · 2옥 도♯');
});

test('Local29: exercise targets play only when target changes; listen-before-sing stays blind',()=>{
 const source=snippet('function updateTraining(t){','function trainingSummary(', '\nupdateTraining');
 const notes=[];
 const app={base:48,training:null,trainingLastDraw:0};
 const ctx={app,Math,Number,clamp:clip,performance:{now:()=>0},
  $:()=>null,playReference:m=>notes.push(m),
  finishTraining:()=>{},trainingPhase:(a,elapsed)=>elapsed%4700<1500?'listen':'answer',
  trainingTargetAt:(a,elapsed)=>{
   if(a.mode==='sustainVoice'||a.mode==='dynamicVoice')return a.root;
   if(a.mode==='earVoice')return a.earNotes[Math.floor(elapsed/4700)];
   return null;
  },
  noteLabel:m=>'C'+m+' · 옥 도',name:m=>'C'+m,
  targetKeyboardBase:m=>48,drawKeys:()=>{},renderTrainingOverlay:()=>{},syncKeyColors:()=>{},
  updateGuideTraining:()=>{},setMessage:()=>{},progress:()=>{},};
 const tick=runInContext(source,ctx);
 let a={active:true,mode:'sustainVoice',root:60,duration:5000,start:0,referenceAt:-Infinity,referenceMidi:null};
 app.training=a;tick(0);tick(20);tick(200);tick(2000);
 assert.deepEqual(notes,[60],'held note triggers exactly once when target appears');
 notes.length=0;
 a=ctx.window.VoiceLineGuideTraining.create({pattern:'smooth7',root:60,rounds:1,shift:0},0);
 app.training=a;
 for(let t=0;t<=8000;t+=100)tick(t);
 assert.equal(notes.length,0,'merged slide audio belongs to its scheduled guide, without duplicate piano clues');
 notes.length=0;
 a={active:true,mode:'earVoice',root:60,duration:9400,start:0,earNotes:[62,65],played:-1,referenceAt:-Infinity,referenceMidi:null};
 app.training=a;tick(0);tick(1800);tick(4700);tick(6200);
 assert.deepEqual(notes,[62,65],'ear training plays only once per listen segment');
 assert.equal(a.target,65,'ear answer is now highlighted after the hidden listening stage');
});

test('Local29: native sample engine provides synchronous gesture unlock for all target exercises',()=>{
 const bundle=fs.readFileSync(path.join(root,'app/src/main/assets/www/vendor/tone-piano.js'),'utf8');
 assert.match(bundle,/unlock\(\)\{return nl\(\)\}/);
 assert.match(js,/window\.VoiceLineToneEngine\?\.unlock\?\.\(\)/);
 assert.match(js,/if\(\['sustainVoice','dynamicVoice'\]\.includes\(a\.mode\)\)/);
 assert.match(js,/session\.guidePlayer\.start\(session,t\)/);
 assert.match(js,/if\(a\.referenceMidi!==rounded&&t-a\.referenceAt>=360\)/);
 assert.doesNotMatch(js,/if\(app\.mode==='earVoice'\)playReference\(app\.trainingSettings/,
   'no accidental ear clue before listen step');
});

test('Stepped and continuous patterns now share the merged slide session',()=>{
 const source=snippet('const TRAINING_MODES=new Set(', 'function startTraining(t){', '\n({trainingDuration,trainingTargetAt,newTrainingSession})');
 const ctx={Math,Number,Array,Set,Object,performance:{now:()=>0},clamp:clip};
 const m=runInContext(source,ctx);
 const cfg={guide:{pattern:'step3',root:60,noteSeconds:3,rounds:1,shift:0}};
 const a=m.newTrainingSession('guideVoice',0,cfg);
 assert.equal(a.phraseMs,21000);assert.equal(a.duration,46400);
 const notes=Array.from({length:7},(_,i)=>m.trainingTargetAt(a,i*3000));
 assert.deepEqual([...notes],[60,61,62,63,62,61,60]);
 assert.equal(m.trainingTargetAt(a,2999),60);
 assert.equal(m.trainingTargetAt(a,3000),61);
 cfg.guide.pattern='smooth3';assert.equal(m.trainingDuration('guideVoice',cfg),28400);
 assert.equal(m.trainingTargetAt(m.newTrainingSession('guideVoice',0,cfg),6000),63);
 assert.match(html,/id="guideNoteSeconds"/);
 assert.doesNotMatch(js,/trainingGlideSeconds|trainingGlideStyle/);
});


test('Local30: success/failure is evidence-based for different training modes',()=>{
 const start=js.indexOf('function trainingEvaluation(a,completed){'),end=js.indexOf('function showTrainingResult(',start);
 assert.ok(start>=0&&end>start);
 const f=runInContext(js.slice(start,end)+'\ntrainingEvaluation',{Math,Number});
 const sustain={mode:'sustainVoice',duration:8000,valid:55,good:45,voicedMs:4000};
 assert.equal(f(sustain,true).status,'성공');
 sustain.voicedMs=800;assert.equal(f(sustain,true).status,'미달성');
 assert.equal(f(sustain,false).status,'중단');
 assert.equal(f({mode:'warmupVoice'},true).status,'안내 완료');
 assert.match(js,/evaluation\.status\+' · '\+detail/);
});

test('Local30: target key appears for ear answer but not during blind listen',()=>{
 const start=js.indexOf('function updateTraining(t){'),end=js.indexOf('function trainingEvaluation(',start);
 assert.ok(start>=0&&end>start);
 const app={base:48,training:{active:true,mode:'earVoice',start:0,duration:9400,earNotes:[62,65],played:-1,referenceAt:-Infinity,referenceMidi:null}};
 const notes=[],targets=[];
 const update=runInContext(js.slice(start,end)+'\nupdateTraining',{
  app,Math,Number,clamp:clip,playReference:m=>notes.push(m),trainingPhase:(a,ms)=>ms%4700<1500?'listen':'answer',
  trainingTargetAt:(a,ms)=>a.earNotes[Math.floor(ms/4700)],finishTraining:()=>{},
  targetKeyboardBase:()=>48,drawKeys:()=>{},setMessage:()=>{},progress:()=>{},renderTrainingOverlay:()=>{},
  syncKeyColors:()=>targets.push(app.training.target),noteLabel:m=>'C'+m
 });
 update(100);assert.equal(app.training.target,null);
 update(1600);assert.equal(app.training.target,62);
 update(4900);assert.equal(app.training.target,null);
 update(6500);assert.equal(app.training.target,65);
 assert.deepEqual(notes,[62,65]);
});


test('Training results retain visible criteria and warmup audio unlock',()=>{
 assert.match(html,/role="dialog" aria-modal="true" aria-labelledby="trainingResultTitle"/);
 assert.match(js,/showTrainingResult\(a,completed,detail\)/);
 assert.match(js,/status:passed\?'성공':'미달성'/);
 assert.match(js,/if\(app\.mode==='warmupVoice'\|\|app\.mode==='dynamicVoice'\|\|!window\.VoiceLineToneEngine\)ensureSynth\(\)/);
});

test('Local31: description control is beside mode title and header never scrolls help prose',()=>{
 assert.match(html,/class="mode-heading-row"/);
 assert.match(html,/id="modeTitle"/);
 assert.match(html,/id="modeGuideButton"/);
 assert.match(html,/aria-controls="infoDialog"/);
 assert.match(css,/\.exercise-panel \.mode-heading-row\{width:100%;align-self:stretch\}/);
 assert.match(css,/\.exercise-panel \.mode-live-status\{[^}]*overflow:hidden;[^}]*text-overflow:ellipsis;white-space:nowrap/);
 assert.match(css,/\.exercise-panel \.mode-guide-button\{[^}]*min-height:28px/);
 assert.match(js,/const fullIntro=Object\.values\(MODES\)\.some\(info=>info\[1\]===msg\)/);
 assert.match(js,/const shortText=fullIntro\?'준비 · 설명 버튼에서 방법 확인':msg/);
});
test('All eleven exercise and piano modes have individual guidance',()=>{
 const piece=snippet('const MODE_GUIDES={','let modeGuideReturnFocus=', '\nMODE_GUIDES');
 const guides=runInContext(piece,{Math});
 const modes=['piano','pitch','record','vibrato','practice','sustainVoice','earVoice','dynamicVoice','warmupVoice','guideVoice','metronome'];
 assert.deepEqual(Object.keys(guides).sort(),modes.sort());
 for(const mode of modes){
  assert.ok(guides[mode].intro.length>10,mode+' intro');
  assert.ok(guides[mode].steps.length>=2,mode+' steps');
  assert.ok(guides[mode].rule.length>15,mode+' rules');
 }
 assert.match(guides.vibrato.rule,/최근 3초/);
 assert.match(guides.guideVoice.rule,/±110cent/);
});
test('Local31: guidance button uses the existing styled dialog, remains cancellable',()=>{
 assert.match(js,/\$\('modeGuideButton'\)\.addEventListener\('click',\(\)=>showModeGuide\(\)\)/);
 assert.match(js,/modalOpen\('infoDialog'\)/);
 assert.match(js,/modeGuideReturnFocus=false;\$\('modeGuideButton'\)\.focus\(\)/);
 assert.match(js,/\$\('infoClose'\)\.addEventListener\('click',\(\)=>modalClose\('infoDialog'\)\)/);
 assert.match(js,/e\.key==='Escape'&&closeTopDialog\(\)/);
});
