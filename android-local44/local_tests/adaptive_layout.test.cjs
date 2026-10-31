'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const guide=require('../app/src/main/assets/www/guide-training.js');
const {mounted}=require('./metronome_harness.cjs');
const root=path.join(__dirname,'..'),web=path.join(root,'app/src/main/assets/www');
const js=fs.readFileSync(path.join(web,'piano.js'),'utf8');
const chunk=(from,to)=>{const a=js.indexOf(from),b=js.indexOf(to,a);assert.ok(a>=0&&b>a,from);return js.slice(a,b);};
class Node{
 constructor(){this.children=[];this.style={};this.dataset={};this.hidden=false;this.textContent='';this.classes=new Set();this.classList={add:key=>this.classes.add(key),remove:key=>this.classes.delete(key),contains:key=>this.classes.has(key),toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};}
 append(...nodes){this.children.push(...nodes)}replaceChildren(){this.children=[]}setAttribute(key,value){this[key]=value}
}
function harness(){
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const frames=new Map(),calls=[],parts=new Map(),sessions=new Map(),recordings=new Map();let frameId=0,clock=0,serial=0;
 const app={mode:'piano',base:48,keyboardNotes:24,layoutPortrait:false,layoutWidth:0,layoutHeight:0,layoutFrame:0,layoutReady:false,
  playing:new Map(),owners:new Map(),mic:true,nativeMic:true,nativeSampleRate:16000,record:null,recordSaving:null,recordPitchTrack:[]};
 const window={innerWidth:844,innerHeight:390,VoiceLineToneEngine:{ready:true,stopAll(){throw Error('rotation stopped guide/reference sounds');}}};
 const document={body:new Node(),documentElement:{},createElement:()=>new Node()};
 const store=async(kind,method,item)=>{const table={recordParts:parts,recordSessions:sessions,recordings}[kind];if(method==='put'){table.set(item.id,item);return item.id;}if(method==='get')return table.get(item);if(method==='getAll')return [...table.values()];throw Error(method);};
 const context={app,window,document,$,Math,Number,Object,Array,Set,Map,Promise,Date,Blob,Uint8Array,ArrayBuffer,DataView,Float32Array,JSON,console,
  performance:{now:()=>clock},clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},
  syncKeyColors(){calls.push('colors');},soundOff:m=>{calls.push(['off',m]);app.playing.delete(m);},updateToneEngineStatus(){},updateMicToggle(){},syncGraphVisibility(){},
  renderPitchGraphOverlay:()=>calls.push('pitch'),renderVibratoOverlay:()=>calls.push('vibrato'),renderRecordPitchOverlay:()=>calls.push('record'),renderTrainingOverlay:()=>calls.push('training'),updatePracticeScrollHint:()=>calls.push('settings'),
  store,readSessionParts:async id=>[...parts.values()].filter(p=>p.sessionId===id),
  removeSessionData:async id=>{sessions.delete(id);for(const [key,value]of parts)if(value.sessionId===id)parts.delete(key);},
  notify:message=>calls.push(message),progress(){},id:()=> 'take-'+(++serial),stamp:()=> '오늘',updateRecordingStorage:async()=>{},setTimeout,clearTimeout,
  stopMic(){throw Error('rotation stopped microphone');},stopActivity(){throw Error('rotation stopped active session');}
 };
 const code=chunk('const NAMES=','const PITCH_RANGE=')+chunk('function name(m){','function frequency(m){')+
  chunk('function targetKeyboardBase(','function syncKeyColors(){')+chunk('function releaseHeldKeys(){','function allKeysOff(){')+
  chunk('function applyResponsiveLayout(','// Arrows remain visible only when more practice options exist off-screen.')+
  chunk('window.VoiceLineLifecycle={',"window.addEventListener('pagehide'")+
  chunk('function encodePcmChunk(','async function finishVibrato(){')+
  '\n({targetKeyboardBase,drawKeys,applyResponsiveLayout,queueResponsiveLayout,releaseHeldKeys,startRecording,queueNativePcm,stopRecording})';
 const api=vm.runInNewContext(code,context);
 return {app,window,document,$,calls,frames,parts,sessions,recordings,...api,setClock:t=>clock=t,
  flushFrame(){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();}};
}
test('Portrait and landscape keys cover complete octaves with visible labels and bounded touch areas',()=>{
 const h=harness();
 for(const count of [12,24])for(let base=24;base<=108-count;base+=12){
  h.app.keyboardNotes=count;h.app.base=base;h.drawKeys();const keys=h.$('keyboard').children;
  assert.equal(keys.length,count);assert.equal(new Set(keys.map(k=>k.dataset.midi)).size,count);
  assert.deepEqual(keys.map(k=>k.dataset.midi).sort((a,b)=>a-b),Array.from({length:count},(_,i)=>base+i));
  const white=keys.filter(k=>k.className==='white-key');assert.equal(white.length,count/12*7);
  assert.ok(Math.abs(white.reduce((sum,k)=>sum+parseFloat(k.style.width),0)-100)<1e-7);
  for(const key of keys){
   assert.ok(parseFloat(key.style.left)>=0&&parseFloat(key.style.left)+parseFloat(key.style.width)<=100+1e-7);
   assert.equal(key.children[0].children.length,2);assert.match(key.children[0].children[1].textContent,/옥/);
  }
  assert.match(h.$('octaveLabel').textContent,/옥/);
 }
});
test('Every reachable note stays inside the visible octave pair or portrait octave',()=>{
 const h=harness();
 for(const count of [12,24])for(let midi=24;midi<=107;midi++){
  h.app.keyboardNotes=count;const base=h.targetKeyboardBase(midi);
  assert.ok(base>=24&&base<=108-count);assert.equal(base%12,0);assert.ok(midi>=base&&midi<base+count);
 }
});
test('Rotation preserves active recording, playback and training objects while releasing held keys',()=>{
 const h=harness();h.applyResponsiveLayout(true);
 const recording=Object.freeze({id:'native-take',type:'native-file',startFrame:2048}),training=Object.freeze({target:73,start:1800,duration:28000,active:true});
 const audio={currentTime:2.5,paused:false};let holds=0,redraws=0;
 Object.assign(h.app,{record:recording,training,openAudio:audio,recordStart:123,sessionStart:456,refreshOpenAudio:()=>redraws++,metronome:{cancelHolds:()=>holds++,stop(){throw Error('rotation stopped metronome');}}});
 h.app.playing.set(60,{});h.app.owners.set('__pointer1',60);
 h.window.innerWidth=390;h.window.innerHeight=780;h.applyResponsiveLayout();
 assert.equal(h.app.keyboardNotes,12);assert.equal(h.app.base,72);assert.ok(h.document.body.classes.has('portrait-layout'));
 assert.equal(h.app.record,recording);assert.equal(h.app.training,training);assert.equal(h.app.openAudio,audio);assert.equal(audio.currentTime,2.5);
 assert.equal(h.app.recordStart,123);assert.equal(h.app.sessionStart,456);assert.equal(h.app.mic,true);
 assert.equal(h.app.playing.size,0);assert.equal(h.app.owners.size,0);assert.equal(holds,1);assert.equal(redraws,1);
 h.window.innerWidth=844;h.window.innerHeight=390;h.applyResponsiveLayout();
 assert.equal(h.app.keyboardNotes,24);assert.ok(!h.document.body.classes.has('portrait-layout'));assert.equal(h.app.training,training);
});
test('A portrait software keyboard does not switch the native app back to a landscape layout',()=>{
 const h=harness();h.window.VoiceLineNative={};h.window.screen={orientation:{type:'portrait-primary'}};
 h.window.innerWidth=390;h.window.innerHeight=780;h.applyResponsiveLayout(true);
 h.window.innerHeight=270;h.applyResponsiveLayout();assert.equal(h.app.keyboardNotes,12);assert.equal(h.app.layoutPortrait,true);
 h.window.screen.orientation.type='landscape-primary';h.window.innerWidth=844;h.window.innerHeight=390;h.applyResponsiveLayout();
 assert.equal(h.app.keyboardNotes,24);assert.equal(h.app.layoutPortrait,false);
});
test('Browser layout follows the window shape even when the monitor stays landscape',()=>{
 const h=harness();h.window.screen={orientation:{type:'landscape-primary'}};
 h.window.innerWidth=360;h.window.innerHeight=740;h.applyResponsiveLayout(true);assert.equal(h.app.keyboardNotes,12);
 h.window.innerWidth=740;h.window.innerHeight=360;h.applyResponsiveLayout();assert.equal(h.app.keyboardNotes,24);
});
test('Native resize and window events coalesce into one redraw without advancing activity clocks',()=>{
 const h=harness();h.applyResponsiveLayout(true);h.calls.length=0;
 h.window.innerWidth=412;h.window.innerHeight=820;
 for(let i=0;i<10;i++)h.window.VoiceLineLifecycle.onResize();
 assert.equal(h.frames.size,1);assert.equal(h.app.keyboardNotes,24);h.flushFrame();
 assert.equal(h.app.keyboardNotes,12);assert.equal(h.app.layoutFrame,0);assert.equal(h.calls.filter(x=>x==='record').length,1);
});
test('Duplicate unchanged viewport notifications do not release an active piano touch',()=>{
 const h=harness();h.applyResponsiveLayout(true);h.app.playing.set(60,{});h.app.owners.set('__pointer1',60);h.calls.length=0;
 h.applyResponsiveLayout();assert.equal(h.app.playing.size,1);assert.equal(h.app.owners.size,1);assert.deepEqual(h.calls,[]);
});
test('A half-turn releases held pointers even when width and height do not change',()=>{
 const h=harness();h.window.screen={orientation:{type:'landscape-primary'}};h.applyResponsiveLayout(true);
 h.app.playing.set(60,{});h.app.owners.set('__pointer1',60);let cancelled=0;
 h.app.metronome={cancelHolds:()=>cancelled++};h.window.screen.orientation.type='landscape-secondary';h.applyResponsiveLayout();
 assert.equal(h.app.playing.size,0);assert.equal(h.app.owners.size,0);assert.equal(cancelled,1);assert.equal(h.app.keyboardNotes,24);
});
test('Portrait follows the selected vibrato root and safely reduces an upper keyboard base when returning',()=>{
 const h=harness();h.applyResponsiveLayout(true);h.app.mode='vibrato';h.app.vibratoRoot=94;
 h.window.innerWidth=390;h.window.innerHeight=780;h.applyResponsiveLayout();assert.equal(h.app.base,84);
 h.app.mode='piano';h.app.base=96;h.window.innerWidth=844;h.window.innerHeight=390;h.applyResponsiveLayout();
 assert.equal(h.app.base,84);assert.equal(h.$('keyboard').children.length,24);
});
test('A take remains one exact WAV across two screen rotations including a silent middle',async()=>{
 const h=harness();h.applyResponsiveLayout(true);h.startRecording();const take=h.app.record;
 h.queueNativePcm(take,'A'.repeat(32000));h.window.innerWidth=390;h.window.innerHeight=780;h.applyResponsiveLayout();
 assert.equal(h.app.record,take);h.queueNativePcm(take,'\0'.repeat(32000));
 h.window.innerWidth=844;h.window.innerHeight=390;h.applyResponsiveLayout();h.queueNativePcm(take,'Z'.repeat(32000));
 assert.equal(h.app.record,take);h.setClock(3000);assert.equal(await h.stopRecording(),true);assert.equal(h.recordings.size,1);
 const record=[...h.recordings.values()][0],bytes=Buffer.from(await record.blob.arrayBuffer());
 assert.equal(record.duration,3);assert.equal(bytes.length,96044);
 assert.deepEqual(bytes.subarray(44),Buffer.concat([Buffer.alloc(32000,65),Buffer.alloc(32000),Buffer.alloc(32000,90)]));
});
test('Guide response scores and scheduled player survive rotation in stepped and continuous patterns',()=>{
 for(const pattern of ['step5','smooth7']){
  const h=harness();h.applyResponsiveLayout(true);const s=guide.create({pattern,root:60,rounds:1,shift:0},0);
  const answer=s.start+s.phraseMs+s.handoffMs,t=answer+400;s.guidePlayer={stop(){throw Error('rotation cancelled guide');}};
  h.app.mode='guideVoice';h.app.training=s;guide.receive(s,t,guide.position(s,t).midi);guide.receive(s,t+50,guide.position(s,t+50).midi);
  const voiced=s.voicedMs;h.window.innerWidth=390;h.window.innerHeight=780;h.applyResponsiveLayout();
  assert.equal(h.app.training,s);assert.equal(s.start,1800);assert.equal(s.active,true);assert.equal(s.voicedMs,voiced);
  guide.receive(s,t+100,guide.position(s,t+100).midi);assert.equal(s.voicedMs,voiced+50);assert.equal(guide.metrics(s).accuracy,100);
 }
});
test('Cancelling a BPM hold for rotation leaves its existing metronome bar and audio running',async()=>{
 const h=mounted();await h.control.toggle();h.advance(.8);const states=[...h.states],playing=[...h.sources];
 h.$('metroPlus').onpointerdown({pointerId:1,button:0,isPrimary:true,preventDefault(){}});const bpm=h.control.settings.bpm;
 h.control.cancelHolds();h.advance(.9);assert.equal(h.control.settings.bpm,bpm);assert.equal(h.control.running,true);
 assert.deepEqual(h.states,states);assert.ok(playing.every(source=>!source.cancelled));h.control.stop();
});
test('Android, PWA and web entry allow both directions; rotation never reloads or stops the page',()=>{
 const manifest=fs.readFileSync(path.join(root,'app/src/main/AndroidManifest.xml'),'utf8');
 assert.match(manifest,/android:screenOrientation="fullUser"/);
 for(const option of ['orientation','screenSize','screenLayout','smallestScreenSize'])assert.ok(manifest.includes(option));
 assert.equal(JSON.parse(fs.readFileSync(path.join(web,'manifest.webmanifest'),'utf8')).orientation,'any');
 const html=fs.readFileSync(path.join(web,'index.html'),'utf8');assert.ok(!html.includes('portrait-notice'));assert.ok(!js.includes("orientation.lock('landscape')"));
 const activity=fs.readFileSync(path.join(root,'app/src/main/java/com/voiceline/app/MainActivity.java'),'utf8');
 const begin=activity.indexOf('public void onConfigurationChanged('),end=activity.indexOf('protected void onSaveInstanceState',begin),resize=activity.slice(begin,end);
 assert.ok(begin>=0&&end>begin);assert.match(resize,/VoiceLineLifecycle\.onResize\(\)/);assert.doesNotMatch(resize,/loadUrl|destroy\(|pauseCapture|stopFromActivity|stopRecording/);
});
