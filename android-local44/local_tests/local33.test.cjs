'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'app/src/main/assets/www/piano.js'),'utf8');
const chunk=(from,to)=>{const a=js.indexOf(from),b=js.indexOf(to,a);assert.ok(a>=0&&b>a,from);return js.slice(a,b)};
const run=(code,context={})=>{const window=context.window||{};window.VoiceLineRecordingTools=require('../app/src/main/assets/www/recording-tools.js');return vm.runInNewContext(code,{Blob,Uint8Array,ArrayBuffer,DataView,Float32Array,Map,Math,Number,Date,Promise,console,setTimeout,clearTimeout,updateRecordingStorage:async()=>{},...context,window});};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}};
class Node {
 constructor(){this.children=[];this.hidden=false;this.attributes={};this.isConnected=true;this.events={};this.classList={add(){},remove(){}};this.style={}}
 append(n){this.children.push(n);n.parent=this}
 replaceChildren(){this.children=[]}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.isConnected=false}
 setAttribute(k,v){this.attributes[k]=v}addEventListener(k,fn){this.events[k]=fn}focus(){this.focused=true}
}
const nodes=()=>{const map=new Map();return id=>{if(!map.has(id))map.set(id,new Node());return map.get(id)}};
const plain=(parent,tag,cls,text)=>{const n=new Node();n.className=cls;n.textContent=text;parent.append(n);return n};
const descendants=n=>[n,...n.children.flatMap(descendants)];
function recorder(){
 const parts=new Map(),sessions=new Map(),recordings=new Map(),events=new Map(),timers=[];
 const app={mic:true,nativeMic:true,nativeSampleRate:16000,mode:'record',record:null};
 let clock=0,serial=0,slow=null;const puts=[];
 const store=async(kind,op,item)=>{
  if(kind==='recordParts'&&slow)await slow.promise;
  const table={recordParts:parts,recordSessions:sessions,recordings,events}[kind];
  if(op==='put'){table.set(item.id,item);puts.push({kind,item});return}
  if(op==='get')return table.get(item);
  if(op==='getAll')return [...table.values()];
  throw Error(op);
 };
 const readSessionParts=async id=>[...parts.values()].filter(p=>p.sessionId===id);
 const removeSessionData=async id=>{for(const [key,p] of parts)if(p.sessionId===id)parts.delete(key);sessions.delete(id)};
 const context={app,store,readSessionParts,removeSessionData,$:nodes(),performance:{now:()=>clock},
  renderRecordPitchOverlay(){},notify(){},progress(){},id:()=> 'recording-'+(++serial),stamp:()=> '오늘',setTimeout:fn=>{timers.push(fn);return timers.length}};
 const api=run(chunk('function encodePcmChunk(','async function finishVibrato(){')+
  '\n({startRecording,stopRecording,queueNativePcm})',context);
 return {app,parts,sessions,recordings,events,puts,timers,...api,
  setClock:t=>clock=t,delayWrites:()=>slow=deferred(),resumeWrites:()=>{slow.resolve();slow=null},get serial(){return serial}};
}
test('Local33 recording preserves beginning, silence and ending byte-for-byte in one file and one record',async()=>{
 const h=recorder();h.startRecording();
 const sections=[Buffer.from('FIRST'.repeat(12800),'ascii'),Buffer.alloc(96000),Buffer.from('LAST'.repeat(24000),'ascii')];
 const full=Buffer.concat(sections);
 for(let i=0;i<full.length;i+=4096){h.queueNativePcm(h.app.record,full.subarray(i,i+4096).toString('latin1'));await h.app.record.pending;}
 h.setClock(full.length/32);
 const [first,second]=await Promise.all([h.stopRecording(),h.stopRecording()]);
 assert.equal(first,true);assert.equal(second,true);
 assert.equal(h.recordings.size,1);assert.equal(h.events.size,0);
 assert.equal(h.puts.filter(p=>p.kind==='recordings').length,1);
 const result=[...h.recordings.values()][0],bytes=Buffer.from(await result.blob.arrayBuffer());
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.length,full.length+44);
 assert.deepEqual(bytes.subarray(44),full,'audio must contain every sample, including silent samples');
 assert.equal(result.duration,full.length/32000);assert.equal(result.recordingSessionId,result.id);
});
test('Local33 delayed disk writes do not stop or divide a continuous capture',async()=>{
 const h=recorder();h.startRecording();const record=h.app.record;await record.pending;h.delayWrites();
 for(let i=0;i<8;i++)h.queueNativePcm(record,String.fromCharCode(65+i).repeat(64000));
 assert.equal(record.pendingParts,8);assert.equal(h.timers.length,0);
 assert.equal(h.app.record,record);assert.equal(record.closed,false);
 const saved=h.stopRecording();await turn();assert.equal(h.recordings.size,0);
 h.resumeWrites();assert.equal(await saved,true);assert.equal(h.recordings.size,1);
 const result=[...h.recordings.values()][0],bytes=Buffer.from(await result.blob.arrayBuffer());
 assert.equal(result.duration,16);for(let i=0;i<8;i++)assert.equal(bytes[44+i*64000],65+i);
});
test('Local33 repeated Start does not discard earlier audio or create another session',async()=>{
 const h=recorder();h.startRecording();const record=h.app.record;
 h.queueNativePcm(record,'A'.repeat(32000));h.setClock(1000);h.startRecording();
 assert.equal(h.app.record,record);assert.equal(h.app.recordStart,0);assert.equal(h.serial,1);
 h.queueNativePcm(record,'B'.repeat(32000));assert.equal(await h.stopRecording(),true);
 assert.equal(h.recordings.size,1);const saved=[...h.recordings.values()][0];assert.equal(saved.duration,2);
});
test('Local43 a synchronous recorder shutdown error releases the saving lock and preserves recovery',async()=>{
 for(const type of ['media','pcm']){
  const h=recorder(),failure=()=>{throw Error('input already disconnected');};
  const record={id:'failed-'+type,type,date:'오늘',timestamp:1,
   mr:{state:'recording',stop:failure},processor:{disconnect:failure},silent:{disconnect(){}}};
  h.app.record=record;h.app.recordStart=0;h.app.recordPitchTrack=[];
  assert.equal(await h.stopRecording(),false);assert.equal(h.app.failedRecording,record);
  assert.equal(h.app.recordSaving,null,type+' left the app permanently waiting for a save');
  assert.equal(h.app.savingRecordId,null);assert.equal(h.app.record,null);
  h.app.failedRecording=null;h.startRecording();assert.ok(h.app.record,'new recording remained blocked');
 }
});
test('Local33 12 minutes elapsed does not silently stop or start a new recording',()=>{
 const record={},app={mic:true,nativeMic:true,record,recordStart:0,mode:'record',frame:1};let stopped=0,frames=0,label='';
 const tick=run(chunk('function recordTime(milliseconds){','async function stopRecording(){')+
  chunk('function tick(t){','const VIBRATO_WINDOW_MS=')+'\ntick',{
  app,renderRecordPitchOverlay(){},progress:(value,text)=>label=text,safeStopOnBackground:()=>stopped++,
  requestAnimationFrame:()=>++frames,updateGraphHiddenStatus(){}
 });
 tick(12*60*1000);assert.equal(stopped,0);assert.equal(app.record,record);assert.equal(frames,1);assert.match(label,/12:00.*한 파일/);
});
test('Local33 browser recorder requests one continuous recording without a timeslice',async()=>{
 const h=recorder();h.app.nativeMic=false;h.app.stream={};h.app.micCtx={};let startArgs;
 const bytes=new Blob([Buffer.from('continuous voice '.repeat(1000))],{type:'audio/webm'});
 class Recorder{
  constructor(){this.state='inactive';this.mimeType='audio/webm'}
  static isTypeSupported(){return true}
  start(...args){startArgs=args;this.state='recording'}
  stop(){this.state='inactive';this.ondataavailable({data:bytes});this.onstop()}
 }
 const writes=[];
 const api=run(chunk('function encodePcmChunk(','async function finishVibrato(){')+'\n({startRecording,stopRecording})',{
  app:h.app,$:nodes(),window:{MediaRecorder:Recorder},MediaRecorder:Recorder,navigator:{},
  performance:{now:()=>5000},id:()=> 'web-record',stamp:()=> '오늘',renderRecordPitchOverlay(){},notify(){},progress(){},
  store:async(kind,op,item)=>writes.push({kind,item})
 });
 api.startRecording();assert.equal(startArgs.length,0);assert.equal(await api.stopRecording(),true);
 assert.equal(writes.length,1);assert.equal(writes[0].kind,'recordings');assert.equal(writes[0].item.blob.size,bytes.size);
});
test('Local33 recording cannot write a practice event, including after its audio object is cleared',async()=>{
 const app={sessionMode:'record',record:null,recordSaving:null},writes=[];
 const add=run(chunk('const PRACTICE_EVENT_MODES=','const MODES=')+
  chunk('async function addEvent(','function targetKeyboardBase(')+'\naddEvent',{
  app,store:async(...args)=>writes.push(args),id:()=> 'event',stamp:()=> '오늘',notify(){}
 });
 assert.equal(await add('음정 측정','auto','pitch'),false);
 app.sessionMode=null;assert.equal(await add('녹음 완료','saved','record'),false);
 assert.equal(await add('Recording complete','saved','pitch'),false);
 app.record={};assert.equal(await add('음정 연습','wrong path','practice'),false);
 app.record=null;app.recordSaving=Promise.resolve();assert.equal(await add('음정 측정','saving','pitch'),false);
 app.recordSaving=null;assert.equal(await add('음정 연습','finished','practice'),true);
 assert.equal(writes.length,1);assert.equal(writes[0][0],'events');assert.equal(writes[0][2].category,'practice');
});
test('Local33 Stop remembers recording provenance even if the screen mode changes during save',async()=>{
 const app={record:{id:'one'},mic:true,mode:'pitch',sessionMode:'record',sessionSamples:100,sessionStart:0};let practiceWrites=0,saves=0;
 const stop=run(chunk("async function stopActivity(reason='user'){",'function resetMainAction(){')+'\nstopActivity',{
  app,cancelMicStart(){},stopRecording:async()=>{saves++;app.record=null;app.sessionMode=null},
  stopMic:()=>app.mic=false,performance:{now:()=>10000},addEvent:async()=>practiceWrites++,noteLabel:String
 });
 await stop();assert.equal(saves,1);assert.equal(practiceWrites,0);assert.equal(app.mic,false);
});
test('Local33 hides historical recording events without deleting legitimate practice records',()=>{
 const visible=run(chunk('function isPracticeHistoryEvent(event){','async function renderRecoverableRecordings(')+'\nisPracticeHistoryEvent');
 const historical=[{mode:'record'},{mode:'RECORDING'},{mode:'voice_record'},{mode:'recordVoice'},
  {title:'녹음완료'},{title:'목소리 녹음'},{title:'Recording complete'},{category:'recording'},
  {recordingSessionId:'old'},{blob:new Blob(['voice'])}];
 for(const event of historical)assert.equal(visible(event),false,JSON.stringify(event));
 for(const event of [{mode:'practice',title:'음정 연습'},{mode:'vibrato',title:'비브라토 연습'},{mode:'legacy',title:'기존 음역대 기록'}])assert.equal(visible(event),true);
 assert.equal(historical.length,10,'filtering must not delete or mutate stored history');
});
function history(){
 const $=nodes(),app={historyGeneration:0,historyTab:'recordings'},queries=[],recovery=[];
 const code=chunk('function renderHistoryTabs(','function drawHistoryPitch(')+
  chunk('function recordTime(milliseconds){','async function stopRecording(){')+'\n({showHistory})';
 const api=run(code,{app,$,plain,closeActiveAudio(){},modalOpen(){app.historyGeneration++;$('infoDialog').hidden=false},
  renderRecoverableRecordings:async panel=>recovery.push(panel),
  makeHistorySection:(body,label)=>{const section=plain(body,'section','',label);const list=plain(section,'div');return {section,list,refresh(){}}},
  getHistoryPage:async kind=>{queries.push(kind);return {next:null,rows:kind==='recordings'?[{id:'r1',title:'목소리 녹음',date:'오늘',duration:16,size:512044}]:[{id:'e1',title:'음정 연습',date:'오늘',detail:'완료'}]}},
  noteLabel:String,playLocal(){},deleteHistoryRow(){}
 });
 return {app,$,queries,recovery,...api};
}
test('Local33 recording tab loads and displays recording files only',async()=>{
 const h=history();await h.showHistory();
 const all=descendants(h.$('infoBody')),panels=all.filter(n=>n.className==='history-tab-panel');
 assert.deepEqual(h.queries,['recordings']);assert.equal(h.recovery.length,1);assert.equal(panels.length,2);
 assert.equal(panels[0].hidden,false);assert.equal(panels[1].hidden,true);assert.equal(panels[1].children.length,0);
 assert.equal(all.filter(n=>n.className==='history-row').length,1);
 assert.ok(!all.some(n=>n.textContent==='연습 기록'));
});
test('Local33 switching to practice hides recordings and never loads recovery or audio lists',async()=>{
 const h=history();await h.showHistory();const first=descendants(h.$('infoBody')).find(n=>n.id==='history-tab-events');
 await first.onclick();const all=descendants(h.$('infoBody')),panels=all.filter(n=>n.className==='history-tab-panel');
 assert.deepEqual(h.queries,['recordings','events']);assert.equal(h.recovery.length,1);
 assert.equal(h.app.historyTab,'events');assert.equal(panels[0].hidden,true);assert.equal(panels[0].children.length,0);assert.equal(panels[1].hidden,false);
 assert.ok(!all.some(n=>n.textContent==='녹음 파일'));assert.ok(all.some(n=>n.textContent==='연습 기록'));
 const back=all.find(n=>n.id==='history-tab-recordings');await back.onclick();assert.equal(h.app.historyTab,'recordings');
});
test('Local33 transient Android pause does not finalize recording; actual background stop does',()=>{
 const java=fs.readFileSync(path.join(root,'app/src/main/java/com/voiceline/app/MainActivity.java'),'utf8');
 const pause=java.slice(java.indexOf('@Override protected void onPause()'),java.indexOf('private void pauseCapture()'));
 assert.doesNotMatch(pause,/pauseCapture\(\);|stopFromActivity\(\);/);
 const stop=java.slice(java.indexOf('@Override protected void onStop()'),java.indexOf('@Override protected void onResume()'));
 assert.match(stop,/pauseCapture\(\);/);
});
