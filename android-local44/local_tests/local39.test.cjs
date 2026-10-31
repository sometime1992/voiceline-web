'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const tools=require('../app/src/main/assets/www/recording-tools.js');
const web=path.join(__dirname,'../app/src/main/assets/www'),js=fs.readFileSync(path.join(web,'piano.js'),'utf8');
const chunk=(from,to)=>{const a=js.indexOf(from),b=js.indexOf(to,a);assert.ok(a>=0&&b>a,from);return js.slice(a,b);};
test('Malformed display values never produce Infinity or NaN in recording labels',()=>{
 for(const value of [Infinity,-Infinity,NaN,-1]){
  assert.equal(tools.formatBytes(value),'0 B');assert.equal(tools.formatTime(value),'0:00');
 }
 assert.equal(tools.formatTime(.5),'0.50초');assert.equal(tools.formatBytes(1048576),'1.0 MB');
});
test('Corrupt pitch samples and invalid dimensions cannot create unbounded graph axes or allocations',()=>{
 const track=[[0,60],[50,1e12],[100,-1e12],[150,62],[200,Infinity],[250,NaN],[1000,127],[-1,60],null];
 const prepared=tools.preparePitch(track,.3,400);
 assert.equal(prepared.low,60);assert.equal(prepared.high,62);
 assert.ok(prepared.points.filter(p=>Number.isFinite(p.midi)).every(p=>p.midi>=0&&p.midi<=127&&p.t<=300));
 assert.doesNotThrow(()=>tools.preparePitch(track,Infinity,Infinity));
 const h=graph();assert.doesNotThrow(()=>tools.drawPitch(h.canvas,track,.3,.1,String));
 assert.ok(h.backgrounds[0].ctx.lines.length<30);assert.ok(h.backgrounds[0].ctx.fills.flat().every(Number.isFinite));
});
function graph(){
 const backgrounds=[];const context=()=>({strokeStyle:'',moves:[],lines:[],fills:[],images:0,setTransform(){},clearRect(){},fillRect(...args){this.fills.push(args)},fillText(){},setLineDash(){},beginPath(){},stroke(){},moveTo(x,y){this.moves.push([x,y,this.strokeStyle])},lineTo(x,y){this.lines.push([x,y,this.strokeStyle])},drawImage(){this.images++}});
 const target=context();let width=600;
 const document={createElement(){const ctx=context(),node={getContext:()=>ctx};backgrounds.push({node,ctx});return node;}};
 const canvas={ownerDocument:document,getBoundingClientRect:()=>({width,height:120}),getContext:()=>target};
 return {canvas,target,backgrounds,resize:w=>width=w};
}
test('Local39 half-second pitch curve, playhead and time label use the same duration',()=>{
 const h=graph();tools.drawPitch(h.canvas,[[0,60],[250,60],[500,60]],.5,.5,String);
 const background=h.backgrounds[0].ctx;
 // The curve is completed before strokeStyle is assigned, so use its endpoint.
 assert.equal(background.lines.at(-1)[0],592);assert.equal(h.target.moves.at(-1)[0],592);
 assert.equal(tools.formatTime(.5),'0.50초');assert.equal(tools.formatTime(65),'1:05');
});
test('Local39 repeated playhead updates reuse the prepared curve; resize invalidates it',()=>{
 let reads=0;const source=Array.from({length:40000},(_,i)=>[i*90,60+i%12]);
 const track=new Proxy(source,{get(target,key){if(key===Symbol.iterator)return function*(){for(const p of target){reads++;yield p;}};return Reflect.get(target,key);}});
 const h=graph();for(let i=0;i<10;i++)tools.drawPitch(h.canvas,track,3600,i,String);
 assert.equal(reads,40000);assert.equal(h.backgrounds.length,1);assert.equal(h.target.images,10);
 h.resize(800);tools.drawPitch(h.canvas,track,3600,15,String);assert.equal(reads,80000);assert.equal(h.backgrounds.length,2);
});
test('Local39 pixel reduction preserves extrema and silence without unbounded point counts',()=>{
 const track=Array.from({length:40000},(_,i)=>[i*90,i%11===0?null:i===151?94:i===257?36:60]);
 const prepared=tools.preparePitch(track,3600,400);
 assert.equal(prepared.low,36);assert.equal(prepared.high,94);assert.ok(prepared.points.length<=5*401);
 assert.ok(prepared.points.some(p=>p.midi===36));assert.ok(prepared.points.some(p=>p.midi===94));
 assert.ok(prepared.points.some(p=>p.midi===null));assert.ok(prepared.points.filter(p=>Number.isFinite(p.midi)).every(p=>typeof p.breakBefore==='boolean'));
});
test('Local39 history matching uses names and dates; display sizes scale to MB and GB',()=>{
 assert.equal(tools.matches({title:'허밍 연습',date:'2026. 10. 31.'},'허밍'),true);
 assert.equal(tools.matches({title:'발성',date:'2026. 10. 31.'},'10. 31'),true);
 assert.equal(tools.matches({title:'ABC',date:''},'ａｂｃ'),true);
 assert.equal(tools.matches({title:'발성',date:''},'허밍'),false);
 assert.equal(tools.formatBytes(1048576),'1.0 MB');assert.equal(tools.formatBytes(1073741824),'1.0 GB');
});
test('Local39 searched history paginates matching metadata without touching audio',async()=>{
 const records=[7,6,5,4,3].map(n=>{const row={id:'r'+n,timestamp:n,title:n%2?'허밍':'다른 연습',date:'오늘'};Object.defineProperty(row,'blob',{get(){throw Error('audio should not be loaded');}});return row;});
 const db={transaction(name){
  assert.equal(name,'recordingsMeta');const tx={objectStore:()=>({index:()=>({openCursor(before){
   const rows=records.filter(row=>!before||row.timestamp<before[0]);let index=0;const request={};
   const emit=()=>{let again=false;request.result=index<rows.length?{value:rows[index],key:[rows[index].timestamp,rows[index].id],continue(){index++;again=true;}}:null;
    request.onsuccess();if(again)queueMicrotask(emit);else queueMicrotask(()=>tx.oncomplete());};
   queueMicrotask(emit);return request;
  }})})};return tx;
 }};
 const page=vm.runInNewContext(chunk('function getHistoryPage(','async function importLegacyRecords(')+'\ngetHistoryPage',{
  dbPromise:Promise.resolve(db),window:{VoiceLineRecordingTools:tools},IDBKeyRange:{upperBound:key=>key},Promise
 });
 const first=await page('recordings',null,2,'허밍');assert.deepEqual(Array.from(first.rows,r=>r.id),['r7','r5']);assert.deepEqual([...first.next],[5,'r5']);
 const next=await page('recordings',first.next,2,'허밍');assert.deepEqual(Array.from(next.rows,r=>r.id),['r3']);assert.equal(next.next,null);
});
function documents(options={}){
 const calls=[],pieces=[],notifications=[];
 const host={btoa,File,URL:{createObjectURL:()=> 'blob:audio',revokeObjectURL:url=>calls.push(['revoke',url])},navigator:{},document:{createElement:()=>({click(){calls.push(['download',this.download]);}})},setTimeout:fn=>fn()};
 const api=tools.createDocuments(host);
 if(options.native!==false)host.VoiceLineNative={
  beginFileTransfer(job,mime,size){calls.push(['begin',job,mime,size]);return '';},
  appendFileTransfer(job,encoded){calls.push(['append',job]);pieces.push(Buffer.from(encoded,'base64'));return options.failAppend?'저장 공간 부족':'';},
  completeFileTransfer(job){calls.push(['complete',job]);return '';},
  abortFileTransfer(job){calls.push(['abort',job]);},
  openRecordingFile(operation,source,name,mime,job){calls.push(['open',operation,source,name,mime,job]);if(!options.hold)api.onResult(job,options.result||'saved','파일 결과');}
 };
 return {host,api,calls,pieces,notifications};
}
test('Local39 native WAV export opens the system flow without reading the audio into JS',async()=>{
 const h=documents();const result=await h.api.perform({sourceType:'native-file',nativeFileId:'saved',mime:'audio/wav'},'save','내 녹음');
 assert.equal(result.status,'saved');assert.deepEqual(h.calls.map(c=>c[0]),['open']);assert.equal(h.calls[0][2],'saved');assert.equal(h.api.busy,false);
});
test('Local39 older Blob recordings are transferred in bounded chunks without changing bytes',async()=>{
 const h=documents(),bytes=Uint8Array.from({length:150000},(_,i)=>i%251),blob=new Blob([bytes],{type:'audio/webm'});
 await h.api.perform({blob,mime:'audio/webm'},'save','이전 녹음',s=>h.notifications.push(s));
 assert.equal(h.pieces.length,3);assert.ok(h.pieces.every(p=>p.length<=65536));
 assert.deepEqual(Buffer.concat(h.pieces),Buffer.from(bytes));assert.equal(h.calls.find(c=>c[0]==='begin')[3],'150000');
 assert.ok(h.calls.find(c=>c[0]==='open')[2].startsWith('transfer:'));assert.ok(h.notifications.at(-1).endsWith('100%'));
});
test('Local39 transfer errors abort the temporary copy and preserve the source Blob',async()=>{
 const h=documents({failAppend:true}),blob=new Blob([new Uint8Array(100000)],{type:'audio/wav'});
 await assert.rejects(h.api.perform({blob},'save','test'),/공간/);
 assert.equal(blob.size,100000);assert.ok(h.calls.some(c=>c[0]==='abort'));assert.ok(!h.calls.some(c=>c[0]==='open'));assert.equal(h.api.busy,false);
});
test('Local39 a pending file picker rejects duplicate jobs and ignores unrelated results',async()=>{
 const h=documents({hold:true}),record={sourceType:'native-file',nativeFileId:'saved',mime:'audio/wav'};
 const pending=h.api.perform(record,'save','test');assert.equal(h.api.busy,true);
 await assert.rejects(h.api.perform(record,'share','test'),/다른 파일/);
 h.api.onResult('unrelated','saved','');assert.equal(h.api.busy,true);
 h.api.onResult(h.calls[0][5],'progress','저장 중');assert.equal(h.api.busy,true,'progress must not report completion');
 h.api.onResult(h.calls[0][5],'cancelled','취소');assert.equal((await pending).status,'cancelled');assert.equal(h.api.busy,false);
});
test('Local39 browser export keeps the original format and does not claim completed disk writes',async()=>{
 const h=documents({native:false}),blob=new Blob(['record'],{type:'audio/mp4'});
 const result=await h.api.perform({blob,mime:'audio/mp4'},'save','연습');
 assert.equal(result.status,'downloaded');assert.deepEqual(h.calls[0],['download','연습.m4a']);assert.equal(blob.size,6);
});
test('Local39 unsupported browser sharing offers file saving; user cancellation is not an error',async()=>{
 const h=documents({native:false}),record={blob:new Blob(['x'],{type:'audio/wav'})};
 await assert.rejects(h.api.perform(record,'share','test'),/파일로 저장/);
 h.host.navigator={canShare:()=>true,share:async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'});}};
 assert.equal((await h.api.perform(record,'share','test')).status,'cancelled');
});
function warmup(){
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:true,textContent:'',dataset:{},setAttribute(){},querySelectorAll(){return [];},focus(){}});return nodes.get(id);};
 const app={trainingSettings:{},training:null,mode:'warmupVoice'},stored=new Map();
 const context={app,$,Math,Number,JSON,Object,Array,Set,document:{hidden:false},performance:{now:()=>0},clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),localStorage:{setItem:(k,v)=>stored.set(k,v)},modalOpen(){},modalClose(){},notify(){},updateWarmupGuide(){},ensureSynth:()=>{throw Error('muted cues must not start audio');}};
 const code=chunk('const WARMUP_CYCLE_MS=','function restoreTrainingSettings(){')+chunk('function trainingDuration(','function trainingTargetAt(')+'\n({warmupTimeline,warmupPhaseAt,warmupGuideState,normalizeWarmup,trainingDuration,scheduleWarmupCues,saveWarmupOptions})';
 return {...vm.runInNewContext(code,context),app,$,stored};
}
test('Local39 custom warmup times drive both phase boundaries and total duration',()=>{
 const h=warmup(),timeline=h.warmupTimeline({inhale:2,exhale:3,hum:5,rest:0,cues:false});
 const s={mode:'warmupVoice',active:true,start:1800,rounds:2,duration:20000,warmupSteps:timeline.steps,warmupCycleMs:timeline.cycle,warmupCues:false};
 assert.equal(timeline.cycle,10000);assert.equal(h.trainingDuration('warmupVoice',{rounds:2,warmup:timeline.settings}),20000);
 assert.equal(h.warmupPhaseAt(4999,s).key,'exhale');assert.equal(h.warmupPhaseAt(5000,s).key,'hum');assert.equal(h.warmupPhaseAt(10000,s).key,'inhale');
 assert.equal(h.warmupGuideState(s,6800).key,'hum');assert.match(h.warmupGuideState(s,10800).next,/다음 세트 들이쉬기/);
 h.app.training=s;h.scheduleWarmupCues(s);assert.equal(s.warmupCueContext,undefined);
});
test('Local39 warmup settings reject blank/out-of-range fields and persist one validated object',()=>{
 const h=warmup();for(const [id,value]of [['warmupInhale','2'],['warmupExhale','3'],['warmupHum','5'],['warmupRest','0']])h.$(id).value=value;
 h.$('warmupCues').checked=false;h.$('warmupInhale').value='';h.saveWarmupOptions();assert.equal(h.stored.size,0);
 h.$('warmupInhale').value='31';h.saveWarmupOptions();assert.equal(h.stored.size,0);
 h.$('warmupInhale').value='2';h.saveWarmupOptions();assert.equal(JSON.parse(h.stored.get('voiceline-training-v1')).warmup.rest,0);
 assert.equal(h.app.trainingSettings.warmup.cues,false);
});
test('Local39 old OGG references are gone and every fallback filename exists in the package',()=>{
 const api=vm.runInNewContext(chunk('function nearestAcousticMidi(','// Fade the recorded signal')+'\n({nearestAcousticMidi,acousticFilename})',{Math,clamp:(n,a,b)=>Math.max(a,Math.min(b,n))});
 for(let midi=24;midi<=107;midi++)assert.ok(fs.existsSync(path.join(web,'vendor/salamander',api.acousticFilename(api.nearestAcousticMidi(midi)))));
 assert.ok(!js.includes('samples/piano/'));assert.ok(!js.includes('ACOUSTIC_PEAKS'));
});
test('Local39 missing fallback samples keep the primary engine error and retry status',async()=>{
 const badge={textContent:'',classList:{toggle(){}}},retry={hidden:true},requests=[];
 const api=vm.runInNewContext(chunk('function nearestAcousticMidi(','function conditionAcousticBuffer(')+chunk('async function loadAcousticSample(','function preloadAcousticPiano(')+chunk('function updateToneEngineStatus(){',"window.addEventListener('voiceline-piano-status'")+chunk('function updateAcousticStatus(','function activePianoCount(')+'\n({loadAcousticSample,updateToneEngineStatus})',{
  window:{VoiceLineToneEngine:{ready:false,status:'error'}},$:id=>id==='pianoSoundChip'?badge:retry,acoustic:{buffers:new Map(),peaks:new Map(),pending:new Map(),failed:new Set()},app:{base:48},
  fetch:async url=>{requests.push(url);return {ok:false,status:404};},console:{warn(){}},clamp:(n,a,b)=>Math.max(a,Math.min(b,n))
 });
 api.updateToneEngineStatus();await api.loadAcousticSample(60);
 assert.match(badge.textContent,/기본 음색.*음원 오류/);assert.equal(retry.hidden,false);assert.equal(requests[0],'./vendor/salamander/C4v8.mp3');
});
test('Local39 downsampling continuous long notes does not invent gaps between selected points',()=>{
 const track=Array.from({length:40000},(_,i)=>[i*90,60+i%12]),h=graph();
 tools.drawPitch(h.canvas,track,3600,1,String);
 assert.ok(h.backgrounds[0].ctx.lines.length>1000,'continuous source should remain a connected curve');
 const gap=tools.preparePitch([[0,60],[90,60],[1000,60],[1090,60]],2,1);
 assert.ok(gap.points.filter(p=>Number.isFinite(p.midi)).some(p=>p.breakBefore));
});
test('Local39 recording names are changed without replacing audio or pitch metadata',async()=>{
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',value:'',focus(){}});return nodes.get(id);};
 const blob=new Blob(['voice']),record={id:'one',title:'이전 이름',date:'오늘',timestamp:1,blob,duration:.5,size:5,pitchTrack:[[0,60]]},app={};
 let saved,renamed;
 const api=vm.runInNewContext(chunk('async function exportRecordingFile(','function renderHistoryTabs(')+'\n({openRecordingTools})',{
  app,$,window:{VoiceLineRecordingTools:tools,VoiceLineDocuments:{busy:false}},store:async()=>record,
  saveRecording:async value=>{saved=value;},modalOpen(){},notify(){},performance:{now:()=>0}
 });
 await api.openRecordingTools(record,{},changed=>renamed=changed,async()=>false);
 $('recordTitleInput').value='허밍 첫날';await $('recordRename').onclick();
 assert.equal(saved.title,'허밍 첫날');assert.equal(saved.blob,blob);assert.equal(saved.pitchTrack,record.pitchTrack);assert.equal(saved.timestamp,1);assert.equal(renamed.title,'허밍 첫날');
 $('recordTitleInput').value=' ';saved=null;await $('recordRename').onclick();assert.equal(saved,null);
});
test('Local39 exporting history cannot interrupt or split an ongoing recording',async()=>{
 const record={id:'active'},app={record},calls=[];
 const exportFile=vm.runInNewContext(chunk('async function exportRecordingFile(','function recordToolsBusy(')+'\nexportRecordingFile',{
  app,notify(){},window:{VoiceLineDocuments:{perform:()=>calls.push('open')},VoiceLineRecordingTools:tools}
 });
 await assert.rejects(exportFile({id:'older'},'share'),/중지/);assert.equal(app.record,record);assert.equal(calls.length,0);
});
