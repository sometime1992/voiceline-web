'use strict';
const {readFileSync}=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const code=readFileSync(path.join(root,'piano.js'),'utf8');
const html=readFileSync(path.join(root,'index.html'),'utf8');
test('Piano JavaScript syntax',()=>assert.doesNotThrow(()=>new vm.Script(code)));
test('Menu includes required features',()=>{
 for(const m of ['id="keyboard"','id="menuDialog"','data-screen="pitch"','data-screen="record"','data-screen="vibrato"','data-screen="practice"','data-screen="history"','data-screen="help"'])assert.ok(html.includes(m),m);
});
test('Android landscape and offline storage',()=>{
 const manifest=readFileSync(path.join(root,'android-app/app/src/main/AndroidManifest.xml'),'utf8');
 const gradle=readFileSync(path.join(root,'android-app/app/build.gradle'),'utf8');
 assert.match(manifest,/android:screenOrientation="sensorLandscape"/);
 assert.match(gradle,/include 'index\.html', 'piano\.css', 'piano\.js'/);
 assert.match(code,/indexedDB\.open\('voiceline-local-v2'/);
});
test('Synthetic 82Hz–1760Hz notes and silence',()=>{
 const start=code.indexOf('function pitchYin('),end=code.indexOf('function updateDetection(',start);
 assert.ok(start>=0&&end>start);
 const detector=vm.runInNewContext(code.slice(start,end)+'\npitchYin',{
  Math,Float32Array,clamp:(v,a,b)=>Math.max(a,Math.min(b,v))
 });
 for(const hz of [82.41,110,220,440,880,1046.5,1760]){
  const samples=Float32Array.from({length:4096},(_,i)=>.23*Math.sin(2*Math.PI*hz*i/48000));
  const found=detector(samples,48000);
  assert.ok(found,'no pitch for '+hz);
  assert.ok(Math.abs(1200*Math.log2(found.hz/hz))<12,'bad pitch for '+hz);
 }
 assert.equal(detector(new Float32Array(4096),48000),null);
});
test('Android bridge handles microphone independently of WebView',()=>{
 const java=readFileSync(path.join(root,'android-app/app/src/main/java/com/voiceline/app/NativeMicBridge.java'),'utf8');
 const activity=readFileSync(path.join(root,'android-app/app/src/main/java/com/voiceline/app/MainActivity.java'),'utf8');
 assert.match(java,/new AudioRecord\(/);
 assert.match(java,/AudioRecord\.READ_BLOCKING/);
 assert.match(java,/@JavascriptInterface/);
 assert.match(activity,/addJavascriptInterface\(nativeMic, "VoiceLineNative"\)/);
 assert.match(activity,/NativeMicBridge\.PERMISSION_CODE/);
 assert.match(code,/if\(window\.VoiceLineNative\?\.start\)return startNativeMic\(\)/);
 assert.match(code,/if\(app\.nativeMic\)/);
});

test('Keyboard synthesis ramps from silence and holds release gain without pops',()=>{
 const start=code.indexOf('const SYNTH_ENV=');
 const end=code.indexOf('function ensureSynth(){',start);
 assert.ok(start>=0&&end>start,'exposed piano amplitude envelope');
 const env=vm.runInNewContext(code.slice(start,end)+'\n({SYNTH_ENV,noteEnvelopeGain})',{Math});
 const {SYNTH_ENV:e,noteEnvelopeGain}=env;
 assert.equal(noteEnvelopeGain(5,5),0,'note starts silent');
 assert.ok(noteEnvelopeGain(5,5+0.005)>0,'smooth attack after 5 ms');
 assert.ok(noteEnvelopeGain(5,5+0.005)<noteEnvelopeGain(5,5+0.018),'no step at attack');
 assert.ok(noteEnvelopeGain(5,5+0.050)>.025,'release of short tap preserves audible note level');
 assert.ok(Math.abs(noteEnvelopeGain(5,5+e.attack)-e.peak)<1e-9);
 assert.ok(Math.abs(noteEnvelopeGain(5,5+e.decay)-e.sustain)<1e-9);
 assert.ok(e.release>=.14,'release longer than click-prone short fade');
 assert.match(code,/volume\.cancelAndHoldAtTime\(t\)/,'preserve current automation value on release');
 assert.match(code,/volume\.setValueAtTime\(held,t\)/,'fallback calculates held gain');
 assert.match(code,/volume\.linearRampToValueAtTime\(0,t\+SYNTH_ENV\.release\)/);
 assert.match(code,/g\.connect\(app\.synthMaster\)/,'notes go to shared mixer');
 assert.match(code,/limiter\.connect\(ac\.destination\)/,'limiter sits before speaker output');
 assert.doesNotMatch(code,/g\.connect\(ac\.destination\)/,'no note is wired direct to speakers');
});
