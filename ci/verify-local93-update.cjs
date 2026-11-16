'use strict';
// Isolated emulator only: create actual Local92 data, then install the exact
// release candidate over it. No uninstall, clear-data or storage migration.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const pkg='com.voiceline.app.local18.ci45',out=path.resolve(__dirname,'../android-upgrade-report');
fs.mkdirSync(out,{recursive:true});
const adb=(...args)=>execFileSync('adb',args,{timeout:60000,maxBuffer:20*1024*1024});
const text=(...args)=>adb(...args).toString();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function waitFor(fn,label){
 const end=Date.now()+45000;let last;
 while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(e){last=e;}await delay(250);}
 throw Error(label+' timed out: '+last);
}
async function connect(){
 text('shell','am','start','-n',pkg+'/com.voiceline.app.MainActivity');
 const pid=await waitFor(()=>text('shell','pidof',pkg).trim(),'app process');
 text('forward','tcp:9222','localabstract:webview_devtools_remote_'+pid);
 const target=await waitFor(async()=>{
  const rows=await (await fetch('http://127.0.0.1:9222/json/list')).json();
  return rows.find(r=>r.type==='page'&&r.url.includes('appassets.androidplatform.net/assets/www'));
 },'WebView debugger');
 const ws=new WebSocket(target.webSocketDebuggerUrl);let next=0;const pending=new Map();
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const data=JSON.parse(event.data);const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result);}});
 const request=(method,params)=>new Promise((resolve,reject)=>{
  const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},45000);
  pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));
 });
 const evaluate=async expression=>{
  const result=await request('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;
 };
 await waitFor(()=>evaluate("document.readyState==='complete'&&!!window.VoiceLineI18n&&VoiceLineI18n.language===(localStorage.getItem('voiceline-language-v1')||'ko')&&document.documentElement.lang===VoiceLineI18n.language&&document.querySelector('#keyboard .white-key')?.getBoundingClientRect().height>50"),'initialized app and restored language');
 await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 return {evaluate,close:()=>ws.close()};
}
const dbRead=`async function readStore(name){return new Promise((resolve,reject)=>{const r=indexedDB.open('voiceline-local-v2',4);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(name),q=tx.objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);tx.oncomplete=()=>db.close();};});}`;
const snapshot=`(async()=>{${dbRead};return {settings:Object.fromEntries(['voiceline-mic-sensitivity-v1','voiceline-training-v1','voiceline-vibrato-root-v1','voiceline-piano-volume-v1','voiceline-plans-v1','voiceline-language-v1'].map(k=>[k,localStorage.getItem(k)])),recordings:await readStore('recordings'),metadata:await readStore('recordingsMeta'),events:(await readStore('events')).filter(x=>x.id==='local92-retained-event')};})()`;
(async()=>{
 const previous=path.resolve('release-review/previous-Local92-CI.apk'),apk=path.resolve('dist/VoiceLine-Local93-CI.apk');
 const facts=JSON.parse(fs.readFileSync('dist/APK_VERIFIED.json','utf8'));
 assert.equal(sha(fs.readFileSync(apk)),facts.apk_sha256);
 assert.match(text('install','-r',previous),/Success/);
 assert.match(text('shell','dumpsys','package',pkg),/versionName=2\.0\.0-local92-ci/);
 text('shell','pm','grant',pkg,'android.permission.RECORD_AUDIO');
 let c=await connect();
 await c.evaluate("document.querySelector('#menuOpen').click();document.querySelector('[data-screen=record]').click();true");
 await waitFor(()=>c.evaluate("document.querySelector('#app').dataset.mode==='record'&&!document.querySelector('#micToggle').disabled"),'record mode');
 await c.evaluate("document.querySelector('#mainButton').click();true");
 await waitFor(()=>c.evaluate("document.querySelector('#micToggle').getAttribute('aria-pressed')==='true'"),'Local92 native microphone');
 await delay(2500);
 await c.evaluate("document.querySelector('#mainButton').click();true");
 const recording=await waitFor(()=>c.evaluate(`(async()=>{${dbRead};return (await readStore('recordings')).find(r=>r.sourceType==='native-file'&&r.size>44);})()`),'real Local92 WAV recording');
 await c.evaluate(`(async()=>{
  const r=await new Promise((resolve,reject)=>{const q=indexedDB.open('voiceline-local-v2',4);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  await new Promise((resolve,reject)=>{const t=r.transaction('events','readwrite');t.objectStore('events').put({id:'local92-retained-event',timestamp:1794800000000,date:'2026-11-16',title:'Local92 retained practice',detail:'A4 sustain',mode:'sustainVoice'});t.oncomplete=resolve;t.onabort=()=>reject(t.error);});r.close();
  localStorage.setItem('voiceline-mic-sensitivity-v1','high');
  const training=JSON.parse(localStorage.getItem('voiceline-training-v1')||'{}');Object.assign(training,{root:69,sustainSeconds:8});localStorage.setItem('voiceline-training-v1',JSON.stringify(training));
  localStorage.setItem('voiceline-vibrato-root-v1','69');localStorage.setItem('voiceline-piano-volume-v1','64');
  const plan=window.VoiceLinePracticePlans.normalize({routines:[{id:'local92-retained-routine',name:'Local92 retained routine',steps:[{mode:'sustainVoice',params:{training:{root:69}}}]}]});localStorage.setItem('voiceline-plans-v1',JSON.stringify(plan));
  window.VoiceLineI18n.setLanguage('en');return true;
 })()`);
 assert.equal(await c.evaluate("localStorage.getItem('voiceline-language-v1')"),'en');
 // WebView batches localStorage disk writes. Let the established Local92
 // settings commit and background the Activity before testing a cold restart.
 await delay(6000);text('shell','input','keyevent','KEYCODE_HOME');await delay(500);
 c.close();text('shell','am','force-stop',pkg);c=await connect();
 const before=await c.evaluate(snapshot);
 assert.equal(before.settings['voiceline-language-v1'],'en','Local92 must finish restoring its saved language before the update');
 const audioPath='files/voiceline-recordings/'+recording.nativeFileId+'.wav';
 const oldAudio=adb('exec-out','run-as',pkg,'cat',audioPath),audioHash=sha(oldAudio);
 assert.equal(oldAudio.subarray(0,4).toString(),'RIFF');assert.ok(oldAudio.length>44);
 fs.writeFileSync(path.join(out,'local92-before.png'),adb('exec-out','screencap','-p'));
 c.close();text('shell','am','force-stop',pkg);
 assert.match(text('install','-r',apk),/Success/);
 const installed=text('shell','dumpsys','package',pkg);
 assert.match(installed,/versionCode=116/);assert.match(installed,/versionName=2\.0\.0-local93-ci/);
 c=await connect();const after=await c.evaluate(snapshot);assert.deepEqual(after,before,'Local92 settings, routine, recording and practice records changed');
 assert.equal(sha(adb('exec-out','run-as',pkg,'cat',audioPath)),audioHash,'native WAV bytes changed');
 assert.equal(await c.evaluate('document.documentElement.lang'),'en');
 const info=await c.evaluate('JSON.parse(window.VoiceLineNative.getRecordingInfo('+JSON.stringify(recording.nativeFileId)+'))');
 assert.ok(!info.error&&info.bytes>0,JSON.stringify(info));
 await c.evaluate("document.querySelector('#menuOpen').click();document.querySelector('[data-screen=sustainVoice]').click();true");
 await waitFor(()=>c.evaluate("document.querySelector('#trainingPitchTarget').textContent.includes('A4')"),'retained selected target');
 assert.match(await c.evaluate("document.querySelector('#micSensitivity').textContent"),/🎤 Sensitivity: High/);
 fs.writeFileSync(path.join(out,'local93-updated-english-sustain.png'),adb('exec-out','screencap','-p'));
 await c.evaluate("window.VoiceLineI18n.setLanguage('ko');true");
 await waitFor(()=>c.evaluate("document.querySelector('#micSensitivity').textContent==='🎤 감도 최대'"),'native Korean label');
 fs.writeFileSync(path.join(out,'local93-updated-korean-sustain.png'),adb('exec-out','screencap','-p'));
 await c.evaluate("window.VoiceLineI18n.setLanguage('en');document.querySelector('#menuOpen').click();document.querySelector('#pianoCreditsOpen').click();true");
 await waitFor(()=>c.evaluate("document.querySelector('#infoTitle').textContent==='Piano sample credits and copyright'"),'native English credits');
 assert.equal(await c.evaluate("/[가-힣]/.test(document.querySelector('#infoBody').textContent)"),false);
 fs.writeFileSync(path.join(out,'local93-english-credits.png'),adb('exec-out','screencap','-p'));
 await c.evaluate("document.querySelector('#infoClose').click();document.querySelector('#menuOpen').click();document.querySelector('[data-screen=record]').click();true");
 await c.evaluate("document.querySelector('#mainButton').click();true");
 await waitFor(()=>c.evaluate("document.querySelector('#micToggle').getAttribute('aria-pressed')==='true'"),'new native recording after upgrade');
 await delay(1800);text('shell','input','keyevent','KEYCODE_HOME');
 await waitFor(()=>c.evaluate(`(async()=>{${dbRead};return (await readStore('recordings')).filter(r=>r.sourceType==='native-file'&&r.size>44).length>${before.recordings.filter(r=>r.sourceType==='native-file'&&r.size>44).length};})()`),'backgrounded recording saved');
 assert.equal(await c.evaluate("document.querySelector('#micToggle').getAttribute('aria-pressed')"),'false');
 assert.equal(sha(adb('exec-out','run-as',pkg,'cat',audioPath)),audioHash,'background save altered previous recording');
 c.close();text('shell','am','start','-W','-n',pkg+'/com.voiceline.app.MainActivity');c=await connect();
 assert.equal(await c.evaluate("document.querySelector('#micToggle').getAttribute('aria-pressed')"),'false','microphone resumed without explicit action');
 c.close();
 const result={status:'passed',source_commit:facts.source_commit,verification_commit:process.env.GITHUB_SHA,apk_sha256:facts.apk_sha256,package:pkg,from_version:'2.0.0-local92-ci',to_version:'2.0.0-local93-ci',version_code:116,updated_without_uninstall:true,settings_preserved:true,routine_preserved:true,practice_event_preserved:true,recording_metadata_preserved:true,actual_native_recording_preserved:true,recording_sha256:audioHash,recording_bytes:oldAudio.length,native_bilingual_labels:true,english_credits:true,background_recording_saved:true,no_automatic_mic_resume:true};
 fs.writeFileSync(path.join(out,'UPDATE_VERIFIED.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),String(e.stack||e));console.error(e);process.exit(1);});
