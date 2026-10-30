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

test('Real piano samples are packaged locally with a three-semitone sampler',()=>{
 const source=readFileSync(path.join(root,'scripts/fetch-piano-samples.mjs'),'utf8');
 assert.match(source,/Meta-open-sound/);
 assert.match(source,/CC0 1.0/);
 assert.match(source,/length:28/);
 assert.match(source,/24\+i\*3/);
 assert.match(source,/OggS/);
 assert.match(code,/ac\.createBufferSource\(\)/,'acoustic PCM playback uses sampled audio buffers');
 assert.match(code,/\.decodeAudioData\(bytes\)/);
 assert.match(code,/source\.playbackRate\.setValueAtTime\(Math\.pow\(2,\(m-anchor\)\/12\),t\)/);
 assert.match(code,/preloadAcousticPiano\(app\.base\)/);
 assert.match(code,/\.\/samples\/piano\//);
 const manifest=readFileSync(path.join(root,'android-app/app/src/main/AndroidManifest.xml'),'utf8');
 assert.match(manifest,/screenOrientation="sensorLandscape"/);
});

test('Soft sampled piano keeps hammer attacks quiet and preserves chord headroom',()=>{
 const start=code.indexOf('const SOFT_PIANO=');
 const end=code.indexOf('const activePianoVoices=',start);
 assert.ok(start>=0&&end>start,'soft acoustic parameters exist');
 const settings=vm.runInNewContext(code.slice(start,end)+'\nSOFT_PIANO',{Object});
 assert.ok(settings.attack>=.025,'recorded hammer attack must be smoothed over >=25ms');
 assert.ok(settings.release>=.2,'short notes are released gradually');
 assert.ok(settings.peakGain<=.28,'sampled note is not played near full PCM volume');
 assert.ok(settings.master<=.72,'shared mix has enough headroom');
 assert.ok(settings.lowpass<=5000,'hammer transient has softened treble');
 assert.ok(settings.maxVoices<=8,'limit dense simultaneous notes');
 assert.ok(settings.peakGain*settings.master*0.62*settings.maxVoices<.9,
   'eight sample peaks must stay below 0dBFS even if in phase');
 assert.match(code,/const highpass=ac\.createBiquadFilter\(\),lowpass=ac\.createBiquadFilter\(\)/);
 assert.match(code,/lowpass\.frequency\.setValueAtTime/);
 assert.match(code,/releasePianoVoice\(oldest,true\)/);
 assert.match(code,/sampledNoteOff\(voice\)\{releasePianoVoice\(voice\);\}/);
 assert.match(code,/volume\.cancelAndHoldAtTime\(t\)/);
 assert.match(code,/const held=SOFT_PIANO\.peakGain\*Math\.min\(1,elapsed\/SOFT_PIANO\.attack\)/,
   'held short-tap amplitude correctly preserved on older WebViews');
});

test('Vibrato reference can select all twelve notes in C2-B6 and auto-centers',()=>{
 const start=code.indexOf('function targetKeyboardBase(');
 const end=code.indexOf('function drawKeys(){',start);
 assert.ok(start>=0&&end>start,'helper is present');
 const calculate=vm.runInNewContext(code.slice(start,end)+'\ntargetKeyboardBase',
  {Math,Number,clamp:(v,a,b)=>Math.max(a,Math.min(b,v))});
 for(let m=36;m<=95;m++){
  const base=calculate(m);
  assert.equal(base%12,0,'starts from C');
  assert.ok(base>=24&&base<=84,'valid displayed two-octave range');
  assert.ok(base<=m&&m<base+24,'reference pitch must be visible: '+m);
 }
 assert.equal(calculate(36),24,'lowest C2 centered');
 assert.equal(calculate(95),84,'highest B6 centered');
 const select=code.slice(code.indexOf('function fillNotes('),code.indexOf('function exerciseSteps('));
 assert.match(select,/for\(let octave=2;octave<=6;octave\+\+\)/);
 assert.match(select,/for\(let step=0;step<12;step\+\+\)/,'all semitones (black keys) available');
 assert.doesNotMatch(select,/BLACK\.has\(m%12\)/);
 const vibrato=code.slice(code.indexOf("else if(app.mode==='vibrato'){",code.indexOf('function modeControls(')),code.indexOf("else if(app.mode==='record'){",code.indexOf('function modeControls(')));
 assert.match(vibrato,/focusVibratoReference\(\)/,'refocus immediately when target changes');
 assert.match(code,/if\(mode==='vibrato'\)focusVibratoReference\(\)/,'refocus on entering vibrato');
 assert.match(code,/if\(app.mode!=='vibrato'&&app.owners.size===0/,'microphone does not scroll target out of view');
 assert.match(code,/key\.classList\.toggle\('vibrato-reference'/,'persistent visual marker');
});

test('Acoustic audio pipeline smooths the PCM endpoints and uses the quietest recorded velocity',()=>{
 const fetcher=readFileSync(path.join(root,'scripts/fetch-piano-samples.mjs'),'utf8');
 assert.match(fetcher,/INSPiano_Vel01_/,'softest acoustic source velocity');
 assert.match(code,/INSPiano_Vel01_/,'sampler must load the bundled soft velocity');
 assert.match(fetcher,/velocity:1/);
 const start=code.indexOf('function conditionAcousticBuffer(');
 const end=code.indexOf('async function loadAcousticSample(',start);
 assert.ok(start>=0&&end>start,'sample conditioner present');
 const conditioner=vm.runInNewContext(code.slice(start,end)+'\nconditionAcousticBuffer',{Math});
 const sr=1000,len=1000,pcm=new Float32Array(len).fill(.5);
 const mocked={sampleRate:sr,length:len,numberOfChannels:1,getChannelData:()=>pcm};
 conditioner(mocked);
 assert.equal(pcm[0],0,'sample starts at zero');
 assert.equal(pcm[len-1],0,'sample ends at zero');
 assert.ok(pcm[10]>0&&pcm[10]<.5,'attack fades naturally');
 assert.ok(pcm[980]>0&&pcm[980]<.5,'tail fades naturally');
 assert.equal(pcm[100],.5,'the middle of the actual recording is unchanged');
 assert.match(code,/context\.state!=='running'/,'do not play in a suspended AudioContext');
 assert.match(code,/app\.owners\.has\(m\)/,'resume request only triggers a still-held key');
 assert.match(code,/activePianoVoices\.delete\(oldest\)/,'voice stealing bounds the released-tail budget');
 assert.match(code,/soundOnDiagnostic\(m\)/,'clean sine mode permits speaker/audio-route A-B comparison');
});
