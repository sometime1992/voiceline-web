'use strict';
// Isolated, debuggable CI APK only. No test hooks are shipped in the app.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'android-smoke');
const pkg='com.voiceline.app.local18.ci45',id='ci_playback_native',port=9223;
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:25000}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const proof={environment:'Android16 API36 WebView, exact distributed CI APK',checks:[]};
const save=()=>fs.writeFileSync(path.join(out,'RECORDING_PLAYBACK.json'),JSON.stringify(proof,null,2)+'\n');
let ws;
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 // The native single-file recording format, with the same metadata as a saved take.
 const rate=44100,seconds=24,wav=Buffer.alloc(44+rate*seconds*2);
 wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
 wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
 wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let i=0;i<rate*seconds;i++)wav.writeInt16LE(Math.round(4200*Math.sin(2*Math.PI*261.626*i/rate)),44+i*2);
 const fixture=path.join(out,id+'.wav');fs.writeFileSync(fixture,wav);
 fs.writeFileSync(path.join(out,id+'.saved'),`id=${id}\nrate=${rate}\nstartFrame=0\ntimestamp=${Date.now()}\ncommitted=true\ncomplete=true\n`);
 adb('shell','am','force-stop','com.voiceline.app');adb('shell','am','force-stop',pkg);
 adb('shell','run-as',pkg,'mkdir','-p','files/voiceline-recordings');
 for(const ext of ['wav','saved']){
  adb('push',path.join(out,id+'.'+ext),'/data/local/tmp/'+id+'.'+ext);
  adb('shell','run-as',pkg,'cp','/data/local/tmp/'+id+'.'+ext,'files/voiceline-recordings/'+id+'.'+ext);
 }
 adb('shell','am','start','-W','-n',pkg+'/com.voiceline.app.MainActivity');
 const pid=adb('shell','pidof',pkg).split(/\s+/)[0];
 adb('forward','tcp:'+port,'localabstract:webview_devtools_remote_'+pid);
 let target;
 for(let n=0;n<100&&!target;n++){
  try{target=(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page'&&t.url.includes('appassets.androidplatform.net'));}catch{}
  if(!target)await sleep(300);
 }
 assert.ok(target,'Debuggable Android WebView not ready');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let next=0;const pending=new Map();
 ws.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id)return;const task=pending.get(message.id);if(!task)return;pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result);};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const command=++next,timer=setTimeout(()=>{pending.delete(command);reject(Error('CDP timeout: '+method));},20000);pending.set(command,{resolve,reject,timer});ws.send(JSON.stringify({id:command,method,params}));});
 const evaluate=async expression=>{const response=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));return response.result.value;};
 const wait=async(expression,label)=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await sleep(100);}throw Error('Android playback condition: '+label+'; '+JSON.stringify(await evaluate('window.__lastRecordingAudio ? ({paused:__lastRecordingAudio.paused,time:__lastRecordingAudio.currentTime,src:__lastRecordingAudio.src,error:__lastRecordingAudio.error?.code,events:window.__recordingEvents}) : document.readyState')));};
 const click=async selector=>{
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`,'control '+selector);
  const rect=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...rect,button:'left',clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',...rect,button:'left',clickCount:1});
 };
 await call('Page.enable');
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const NativeAudio=window.Audio;window.__recordingEvents=[];window.Audio=function(...args){const audio=new NativeAudio(...args);window.__lastRecordingAudio=audio;for(const type of ['play','playing','pause','error','ended'])audio.addEventListener(type,()=>window.__recordingEvents.push({type,time:audio.currentTime,src:audio.src}));return audio;};window.Audio.prototype=NativeAudio.prototype;})()`});
 const reload=async()=>{await call('Page.reload');await sleep(500);await wait('!!document.querySelector("#keyboard .white-key")&&!!window.VoiceLineI18n','app reload');await evaluate('VoiceLineI18n.setLanguage("ko")');};
 await reload();
 await evaluate(`(async()=>{const list=await indexedDB.databases();for(const item of list){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(item.name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(!db.objectStoreNames.contains('recordingsMeta')){db.close();continue;}const record={id:${JSON.stringify(id)},title:'CI playback check',date:new Date().toLocaleString('ko-KR'),timestamp:Date.now(),duration:${seconds},size:${wav.length},mime:'audio/wav',sourceType:'native-file',nativeFileId:${JSON.stringify(id)},pitchTrack:[[0,60],[1000,60],[23000,60]],pitchLow:60,pitchHigh:60};await new Promise((resolve,reject)=>{const tx=db.transaction(['recordings','recordingsMeta'],'readwrite');tx.objectStore('recordings').put(record);tx.objectStore('recordingsMeta').put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();return true;}throw Error('Recording database missing');})()`);
 const openHistory=async()=>{await click('#menuOpen');await click('[data-screen="history"]');await wait('!!document.querySelector(".history-row button")','saved recording row');};
 await openHistory();
 // Reproduce the former two-owner sequence in this real WebView, then reload
 // to restore the native bridge and exercise the fixed, user-visible path.
 await evaluate('(()=>{const native=window.VoiceLineAudioSession;window.VoiceLineAudioSession={request:()=>native.request(),release:()=>native.release(),preparePlayback:()=>native.request()};})()');
 await click('.history-row button');await sleep(2200);
 proof.previousSequence=await evaluate('({paused:__lastRecordingAudio.paused,time:__lastRecordingAudio.currentTime,events:__recordingEvents})');save();
 assert.ok(proof.previousSequence.paused&&proof.previousSequence.time<1,'Former native-plus-WebView focus sequence did not reproduce the immediate stop');
 proof.checks.push('Former competing audio-focus sequence reproduces an immediate stop on the real Android WebView');
 await reload();await openHistory();await click('.history-row button');
 await wait('window.__lastRecordingAudio&&!__lastRecordingAudio.paused&&__lastRecordingAudio.currentTime>1.5','uninterrupted native WAV playback');
 proof.continuous=await evaluate('({time:__lastRecordingAudio.currentTime,duration:__lastRecordingAudio.duration,paused:__lastRecordingAudio.paused,events:__recordingEvents})');save();
 assert.equal(Math.round(proof.continuous.duration),seconds);
 await click('.history-row button');const paused=await evaluate('__lastRecordingAudio.currentTime');await sleep(500);
 assert.equal(await evaluate('__lastRecordingAudio.paused'),true);assert.ok(Math.abs(await evaluate('__lastRecordingAudio.currentTime')-paused)<.1);
 await evaluate('(()=>{const seek=document.querySelector(".playback-seek");seek.value="4";seek.dispatchEvent(new Event("input",{bubbles:true}));})()');
 await click('.history-row button');await wait('!__lastRecordingAudio.paused&&__lastRecordingAudio.currentTime>5','seek and explicit resume');
 proof.checks.push('Distributed APK plays the complete native WAV without its former immediate focus interruption; pause, seek and resume work');
 await evaluate('VoiceLineI18n.setLanguage("en")');await sleep(500);assert.equal(await evaluate('__lastRecordingAudio.paused'),false);
 fs.writeFileSync(path.join(out,'recording-playback-android16.png'),execFileSync('adb',['exec-out','screencap','-p']));
 adb('shell','input','keyevent','3');await sleep(500);adb('shell','am','start','-W','-n',pkg+'/com.voiceline.app.MainActivity');await sleep(1200);
 assert.equal(await evaluate('__lastRecordingAudio.paused'),true);await sleep(1000);assert.equal(await evaluate('__lastRecordingAudio.paused'),true);
 await click('.history-row button');await wait('!__lastRecordingAudio.paused&&__lastRecordingAudio.currentTime>1','explicit replay after background');
 proof.checks.push('Language change preserves playback; leaving the app stops it and returning requires an explicit Play tap');
 const saved=execFileSync('adb',['exec-out','run-as',pkg,'cat','files/voiceline-recordings/'+id+'.wav']);
 proof.original_sha256=createHash('sha256').update(wav).digest('hex');proof.after_sha256=createHash('sha256').update(saved).digest('hex');assert.equal(proof.after_sha256,proof.original_sha256);
 proof.checks.push('Original private recording is unchanged byte for byte');
 await click('.history-row button');proof.status='passed';save();console.log(JSON.stringify(proof));
})().catch(error=>{proof.status='failed';proof.error=String(error);save();console.error(error);process.exitCode=1;}).finally(()=>{ws?.close();try{adb('forward','--remove','tcp:'+port);}catch{}});
