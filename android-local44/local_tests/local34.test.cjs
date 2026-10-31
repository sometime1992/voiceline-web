'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const js=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
const part=(from,to)=>{const a=js.indexOf(from),b=js.indexOf(to,a);assert.ok(a>=0&&b>a,from);return js.slice(a,b)};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const run=(code,context={})=>vm.runInNewContext(code,{window:{},Blob,Uint8Array,Float32Array,ArrayBuffer,DataView,Map,Set,Math,Number,Date,Promise,JSON,console,atob,...context});
function nativeHarness(){
 const app={mode:'record',mic:true,nativeMic:true,nativeSampleRate:16000,nativeRequestId:'7',nativeClockStart:0,sessionStart:0,lastAnalyze:-Infinity,record:null};
 const recordings=new Map(),drafts=new Map(),calls=[],timers=new Map(),nodes=new Map();let clock=5000,serial=0,gate=null,fail=false;
 const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',classList:{add(){},remove(){}},hidden:false});return nodes.get(id)};
 const bridge={supportsFileRecording:()=>true,
  beginRecording(request,id){calls.push(['begin',request,id]);drafts.set(id,{id,bytes:64000,frames:32000,sampleRate:16000,startFrame:32000,timestamp:1,pitchTrack:[]});return JSON.stringify({startFrame:32000,sampleRate:16000})},
  finishRecording(request,id){calls.push(['finish',request,id])},
  appendRecordingPitch(id,lines){calls.push(['pitch',id,lines]);return ''},
  getRecordingInfo:id=>JSON.stringify(drafts.get(id)||{error:'missing'}),
  commitRecording(id){calls.push(['commit',id]);drafts.delete(id);return ''}};
 const window={VoiceLineNative:bridge,addEventListener(){}};
 const ctx={app,window,$,performance:{now:()=>clock},id:()=> 'native-'+(++serial),stamp:()=> '오늘',
  notify(){},progress(){},renderRecordPitchOverlay(){},stopAfterMicError:e=>{throw Error(e)},
  setTimeout(fn){timers.set(++serial,fn);return serial},clearTimeout:id=>timers.delete(id),
  store:async(kind,op,item)=>{
   assert.equal(kind,'recordings');if(op==='get')return recordings.get(item);
   if(gate)await gate;if(fail)throw Error('disk-full');assert.equal(op,'put');recordings.set(item.id,item);
  },updateDetection(t){ctx.api.rememberFullRecordingPitch(t,60)},
  requestNativeStop(){},micRequestCurrent:()=>true,document:{hidden:false,addEventListener(){}},resetMainAction(){},updateMicToggle(){},
  closeActiveAudio(){},closeTopDialog:()=>false,allKeysOff(){},cancelMicStart(){calls.push(['cancel'])},
  stopActivity:()=>{},completeNativeStart(){},micStatus(){},requestAnimationFrame:()=>1};
 ctx.api=run(part('function rememberFullRecordingPitch(','function encodePcmChunk(')+
  part('function encodePcmChunk(','async function finishVibrato(){')+
  part('window.VoiceLineNativeAudio = {','function completeNativeStart(')+
  part('async function safeStopOnBackground(){','applyPianoVolume(app.pianoVolume,false);')+
  '\n({startRecording,stopRecording,recoverRecording,rememberFullRecordingPitch})',ctx);
 return {app,window,recordings,drafts,calls,timers,...ctx.api,clock:t=>clock=t,gate:p=>gate=p,fail:v=>fail=v,
  chunk(frame,count=16000){window.VoiceLineNativeAudio.onAudioChunk(Buffer.alloc(count*2).toString('base64'),16000,'7',frame)},
  ack(id=app.record?.id){window.VoiceLineNativeAudio.onRecordingFinished('7',id,drafts.get(id),'')}};
}
test('Local34 native stop waits for the final captured chunk and acknowledges exactly one file',async()=>{
 const h=nativeHarness();h.startRecording();const record=h.app.record;
 h.chunk(32000);const saving=h.stopRecording();assert.equal(h.app.record,record);assert.ok(h.app.recordSaving);
 assert.equal(h.window.VoiceLineLifecycle.onBack(),true);assert.equal(h.startRecording(),record);assert.equal(h.calls.filter(c=>c[0]==='begin').length,1);
 h.clock(10000);h.chunk(48000);assert.equal(h.recordings.size,0);
 h.window.VoiceLineNativeAudio.onRecordingFinished('old',record.id,{},'');assert.ok(h.app.nativeFinish,'stale acknowledgement must not finish this take');
 h.ack();assert.equal(await saving,true);assert.equal(h.recordings.size,1);assert.equal(h.app.record,null);assert.equal(h.app.recordSaving,null);
 const saved=[...h.recordings.values()][0];assert.equal(saved.duration,2);assert.equal(saved.size,64044);assert.equal(saved.sourceType,'native-file');assert.equal(saved.nativeFileId,record.id);assert.ok(!saved.blob);
 assert.deepEqual(JSON.parse(JSON.stringify(saved.pitchTrack)),[[500,60],[1500,60]]);
 assert.equal(h.calls.filter(c=>c[0]==='finish').length,1);assert.equal(h.calls.filter(c=>c[0]==='commit').length,1);
});
test('Local34 delayed native analysis uses capture frames and excludes chunks preceding recording start',async()=>{
 const h=nativeHarness();h.startRecording();h.clock(500000);h.chunk(0);assert.equal(h.app.recordPitchTrack.length,0);
 h.chunk(32000);assert.equal(h.app.recordPitchTrack[0][0],500);
 const saving=h.stopRecording();h.ack();await saving;
 assert.equal([...h.recordings.values()][0].pitchTrack[0][0],500);
});
test('Local34 failed final DB save leaves its native file recoverable; recovery blocks exit until commit',async()=>{
 const h=nativeHarness();h.startRecording();const record=h.app.record;h.chunk(32000);h.fail(true);
 const stop=h.stopRecording();h.ack();assert.equal(await stop,false);assert.equal(h.drafts.size,1);assert.equal(h.recordings.size,0);
 assert.ok(h.app.failedRecording);h.fail(false);let release;h.gate(new Promise(resolve=>release=resolve));
 const retry=h.recoverRecording({id:record.id,sourceType:'native-file'});await turn();
 assert.ok(h.app.recordSaving);assert.equal(h.window.VoiceLineLifecycle.onBack(),true);assert.equal(h.drafts.size,1);
 release();await retry;assert.equal(h.app.recordSaving,null);assert.equal(h.app.failedRecording,null);assert.equal(h.recordings.size,1);assert.equal(h.drafts.size,0);
});
test('Local34 native capture has no JS PCM parts or repeated complete pitch checkpoints',async()=>{
 const h=nativeHarness();h.startRecording();const record=h.app.record;
 for(let i=0;i<300;i++)h.chunk(32000+i*1600,1600);
 assert.equal(record.partBuffer,undefined);assert.equal(record.pendingParts,undefined);assert.equal(h.recordings.size,0);
 const points=h.calls.filter(c=>c[0]==='pitch').flatMap(c=>c[2].trim().split('\n'));
 assert.equal(new Set(points.map(p=>p.split(',')[0])).size,points.length,'each pitch point must be journaled at most once');
 assert.ok(h.calls.filter(c=>c[0]==='pitch').every(c=>c[2].split('\n').length<25));
 const saving=h.stopRecording();h.ack();await saving;
});
test('Local34 a missing final acknowledgement fails safely and retains the native recovery identity',async()=>{
 const h=nativeHarness();h.startRecording();const r=h.app.record;const saving=h.stopRecording();
 const timeout=[...h.timers.values()][0];timeout();assert.equal(await saving,false);
 assert.equal(h.app.failedRecording.id,r.id);assert.equal(h.recordings.size,0);assert.equal(h.drafts.size,1);assert.equal(h.app.nativeFinish,null);
});
const vibrato=()=>run(part('function analyzeVibrato(','function rememberVibratoPoint(')+'\n({analyzeVibrato,describeVibratoProgress})',{noteLabel:n=>String(n)});
const wave=(start,end,step=35)=>Array.from({length:Math.floor((end-start)/step)+1},(_,i)=>({t:start+i*step,midi:60+.25*Math.sin(2*Math.PI*5*(start+i*step)/1000)}));
test('Local34 vibrato rejects disconnected short bursts but accepts four consecutive cycles',()=>{
 const v=vibrato(),broken=[...wave(0,560),{t:650,midi:null},...wave(900,1460),{t:1550,midi:null},...wave(1800,2360)];
 const data=v.analyzeVibrato(broken,60);assert.ok(!data||data.rate===null);assert.ok(v.describeVibratoProgress(broken,60,data,true,2360).cycles<4);
 for(const step of [35,46,64]){const good=v.analyzeVibrato(wave(0,2800,step),60);assert.ok(good?.rate>4.5&&good.rate<5.5,'valid '+step+'ms input');assert.ok(good.reliablePeriods>=4)}
});
test('Local34 vibrato clears stale current values and records valid time separately from session time',async()=>{
 const app={vibratoStart:1,vibratoRoot:60,vibratoSamples:wave(0,2800),vibratoValidMs:0,vibratoValidUntil:0};
 let now=2800;const events=[];
 const api=run(part('function analyzeVibrato(','// Recording mode uses')+part('async function finishVibrato(){','async function stopActivity(')+'\n({vibratoStatus,finishVibrato})',{
  app,performance:{now:()=>now},setMessage(){},$:()=>({}),notify(){},addEvent:async(...e)=>events.push(e)
 });
 api.vibratoStatus();assert.ok(app.vibratoLast);const valid=app.vibratoValidMs;assert.ok(valid>900&&valid<=2800);
 now=60001;app.vibratoSamples.push({t:60001,midi:null});api.vibratoStatus();assert.equal(app.vibratoLast,null);
 await api.finishVibrato();assert.match(events[0][1],/전체 60초 · 유효 측정 2\.8초 · 마지막 유효 57초 전/);
});
test('Local34 history pagination reads only the metadata store and never touches audio or pitch getters',async()=>{
 const item={id:'r1',timestamp:1,title:'녹음',duration:1};Object.defineProperties(item,{blob:{get(){throw Error('audio read')}},pitchTrack:{get(){throw Error('pitch read')}}});
 let transaction;const db={transaction(name){assert.equal(name,'recordingsMeta');transaction={objectStore:()=>({index:()=>({openCursor(){const req={};queueMicrotask(()=>{req.result={value:item,key:[1,'r1'],continue(){queueMicrotask(()=>{req.result=null;req.onsuccess();transaction.oncomplete()})}};req.onsuccess()});return req}})})};return transaction}};
 const api=run(part('function recordingMetadata(','function saveRecording(')+part('function getHistoryPage(','async function importLegacyRecords(')+'\n({recordingMetadata,getHistoryPage})',{
  dbPromise:Promise.resolve(db)
 });
 assert.equal(api.recordingMetadata(item).id,'r1');assert.equal((await api.getHistoryPage('recordings')).rows[0].id,'r1');
});
test('Local34 a recording and its list metadata commit atomically; a rolled back write reports failure',async()=>{
 for(const abort of [false,true]){
  let tx,settled=false;const changes=[];
  const db={transaction(names,mode){assert.deepEqual([...names],['recordings','recordingsMeta']);assert.equal(mode,'readwrite');return tx={objectStore:kind=>({put:record=>changes.push([kind,record])})}}};
  const save=run(part('function recordingMetadata(','function store(')+'\nsaveRecording',{dbPromise:Promise.resolve(db)});
  const pending=save({id:'r',timestamp:1,pitchTrack:[[1,60]],blob:new Blob(['data'])}).then(()=>{settled=true},e=>{assert.ok(abort);settled='failed'});
  await turn();assert.equal(settled,false);assert.equal(changes.length,2);assert.ok(!('blob' in changes[1][1]));assert.ok(!('pitchTrack' in changes[1][1]));
  if(abort)tx.onabort();else tx.oncomplete();await pending;assert.equal(settled,abort?'failed':true);
 }
});
test('Local34 a failed piano engine uses the audible fallback and exposes retry instead of loading forever',()=>{
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{classList:{toggle(){}},hidden:false});return nodes.get(id)};
 const app={playing:new Map(),owners:new Map(),ctx:null};let engineKeys=0,sampled=0;
 const window={VoiceLineToneEngine:{ready:false,status:'error',keyDown(){engineKeys++}}};
 const api=run(part('function updateToneEngineStatus(){',"window.addEventListener('voiceline-piano-status'")+part('function soundOn(m,pressure=0.7){','function soundOff(')+'\n({updateToneEngineStatus,soundOn})',{
  app,window,$,ensureSynth:()=>({state:'running'}),sampledNoteOn:()=>{sampled++;return true}
 });
 api.updateToneEngineStatus();api.soundOn(60);assert.equal(engineKeys,0);assert.equal(sampled,1);assert.equal($('pianoRetry').hidden,false);assert.match($('pianoSoundChip').textContent,/기본 음색.*오류/);
});
