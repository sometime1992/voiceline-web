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
 const env=vm.runInNewContext(code.slice(start,end)+'\n({SYNTH_ENV,noteEnvelopeGain})',{Math,window:{addEventListener(){}}});
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
 assert.match(code,/const held=attackValue\(voice,t\)/,'release fallback calculates the attack-level at release');
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
 assert.match(code,/soundOnDiagnostic\(m,pressure\)/,'clean sine mode permits speaker/audio-route A-B comparison');
});

test('28 gentle piano recordings have peak calibration and safe bounded loudness',()=>{
 const start=code.indexOf('const ACOUSTIC_PEAKS=new Map(');
 const end=code.indexOf('const activePianoVoices=',start);
 assert.ok(start>=0&&end>start,'peak metadata exists');
 const env={Map,SOFT_PIANO:{peakGain:0.25},clamp:(v,a,b)=>Math.max(a,Math.min(b,v))};
 const result=vm.runInNewContext(code.slice(start,end)+'\n({gain:calibratedPianoGain,peaks:ACOUSTIC_PEAKS})',env);
 const {gain,peaks}=result;
 assert.equal(peaks.size,28,'calibrate all recorded pitch anchors');
 for(let midi=24;midi<=105;midi+=3){
  assert.ok(peaks.has(midi),'missing '+midi);
  const level=gain(midi),peak=peaks.get(midi);
  assert.ok(Number.isFinite(level)&&level>=.17&&level<=1.251,'gain bounds '+midi);
  assert.ok(level*peak*.64<.04,'per-voice sample output remains safe '+midi);
 }
});

test('Key fade-out adapts to held duration and smooth attack interpolates',()=>{
 const start=code.indexOf('function smoothstep(');
 const end=code.indexOf('// Peaks measured from',start);
 assert.ok(start>=0&&end>start,'pure envelope helper definitions');
 const helpers=vm.runInNewContext(code.slice(start,end)+'\n({smoothstep,attackDuration,releaseDuration,pressureForEvent,expressionFromInput,attackValue})',{
  Math,Number,clamp:(v,a,b)=>Math.max(a,Math.min(b,v))
 });
 const {smoothstep,attackDuration,releaseDuration,pressureForEvent,expressionFromInput,attackValue}=helpers;
 assert.equal(smoothstep(0),0);
 assert.equal(smoothstep(1),1);
 assert.ok(smoothstep(.25)>0&&smoothstep(.25)<.25);
 assert.ok(Math.abs(smoothstep(.5)-.5)<1e-10);
 assert.ok(releaseDuration(.03)>releaseDuration(.30),'short tap has LONGER fade-out');
 assert.ok(releaseDuration(.30)>releaseDuration(1.5),'held key needs shorter fade-out');
 assert.ok(releaseDuration(2)<=.4,'maximum release is bounded');
 assert.ok(releaseDuration(2)>=.23,'held note still releases smoothly');
 assert.ok(Math.abs(releaseDuration(.05)-.39)<1e-9,'short tap baseline 390ms');
 assert.ok(Math.abs(releaseDuration(.70)-.24)<1e-9,'long hold baseline 240ms');
 assert.ok(releaseDuration(.14)>releaseDuration(.16),'fade duration changes continuously');
 assert.ok(releaseDuration(0)>=.38,'very short taps get a long gentle release');
 assert.ok(attackDuration(0.1)>attackDuration(.95),'stylus hard press has faster attack');
 assert.equal(pressureForEvent({pointerType:'touch',pressure:.001}),.7,'touch force is ignored as unreliable');
 assert.equal(pressureForEvent({pointerType:'touch',pressure:1}),.7,'touch force still ignored');
 assert.ok(pressureForEvent({pointerType:'pen',pressure:.9})>.7,'stylus pressure is accepted');
 assert.ok(expressionFromInput(.9)>expressionFromInput(.1),'real pen force varies note level');
 const fake={voiceGain:.6,started:10,attackDuration:.06};
 assert.equal(attackValue(fake,10),0,'attack starts at silence');
 assert.ok(attackValue(fake,10.02)>0 && attackValue(fake,10.02)<.6);
 assert.ok(Math.abs(attackValue(fake,10.06)-.6)<1e-9);
 assert.match(code,/releaseDuration\(heldSeconds\)/);
 assert.match(code,/gain\.gain\.linearRampToValueAtTime\(voiceGain\*smoothstep\(\.75\)/);
 assert.match(code,/pressureForEvent\(e\)/);
});

test('Published Tone Piano engine replaces handmade note playback inside Android APK',()=>{
 const entry=readFileSync(path.join(root,'scripts/tone-piano-entry.mjs'),'utf8');
 const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
 const fetcher=readFileSync(path.join(root,'scripts/fetch-salamander-samples.mjs'),'utf8');
 const workflow=readFileSync(path.join(root,'.github/workflows/build-apk.yml'),'utf8');
 assert.equal(pkg.dependencies['@tonejs/piano'],'0.2.1');
 assert.ok(pkg.dependencies.tone);
 assert.match(entry,/import \{ Piano \} from '@tonejs\/piano\/build\/piano\/Piano\.js'/);
 assert.match(entry,/piano\.keyDown\(\{midi,velocity:/);
 assert.match(entry,/piano\.keyUp\(\{midi\}\)/);
 assert.match(entry,/release:false/,'native keybed/release click noises disabled');
 assert.match(entry,/pedal:false/,'pedal clicks disabled');
 assert.match(entry,/Tone\.start\(\)/,'audio context starts on user gesture');
 assert.match(entry,/url:sourcePath/,'local sample path');
 assert.match(code,/window\.VoiceLineToneEngine\.keyDown\(m,pressure\)/);
 assert.match(code,/window\.VoiceLineToneEngine\?\.keyUp\(m\)/);
 assert.match(code,/window\.VoiceLineToneEngine\.reference\(m\)/);
 assert.match(html,/vendor\/tone-piano\.js/,'built library loads before UI');
 assert.match(code,/Alexander Holm/,'offline app displays piano recording attribution');
 assert.match(code,/creativecommons\.org\/licenses\/by\/3\.0/,'offline app shows the sample licence');
 assert.match(fetcher,/creativecommons\.org\/licenses\/by\/3\.0/);
 assert.match(fetcher,/length:28/);
 assert.match(workflow,/npm run piano:bundle/);
 assert.match(workflow,/npm run piano:download/);
});

test('Rapid and short note presses cannot leave a stale key-up that kills a new note',async()=>{
 const script=readFileSync(path.join(root,'scripts/tone-piano-entry.mjs'),'utf8')
   .replace(/^import .*?;\s*$/gm,'');
 const actions=[];
 let virtualTime=0,nextTimer=1,activePiano=null;
 const timers=new Map();
 class FakePiano {
   constructor(){this._strings={_strings:[{output:{attack:0}}]};activePiano=this;}
   toDestination(){return this;}
   load(){return Promise.resolve();}
   keyDown({midi}){actions.push('down:'+midi);}
   keyUp({midi}){actions.push('up:'+midi);}
   stopAll(){actions.push('stop');}
 }
 const running={state:'running'};
 const env={
   Piano:FakePiano,
   Tone:{getContext:()=>running,start:()=>Promise.resolve(),now:()=>virtualTime/1000},
   window:{dispatchEvent(){}},
   CustomEvent:class{constructor(type,args){this.type=type;this.detail=args?.detail;}},
   performance:{now:()=>virtualTime},
   setTimeout:(cb,ms)=>{const id=nextTimer++;timers.set(id,{cb,at:virtualTime+ms});return id;},
   clearTimeout:(id)=>timers.delete(id),
   Map,Math,Promise,Object,console,
 };
 const engine=vm.runInNewContext(script+'\nengine',env);
 await engine.load();
 assert.ok(Math.abs(activePiano._strings._strings[0].output.attack-.018)<1e-8,
   'published Sampler attack is smoothed to 18ms');
 engine.keyDown(60);
 assert.deepEqual(actions,['down:60'],'ready audio schedules the key synchronously');
 virtualTime=12;engine.keyUp(60);
 assert.deepEqual(actions,['down:60'],'tiny tap does not immediately cut off sample');
 assert.equal(timers.size,1,'short release is pending');
 virtualTime=22;engine.keyDown(60);
 assert.deepEqual(actions,['down:60','up:60','down:60'],
   'previous note released BEFORE the immediate retrigger');
 assert.equal(timers.size,0,'stale old timer canceled');
 virtualTime=38;engine.keyUp(60);
 assert.equal(timers.size,1);
 const [id,task]=[...timers][0];
 virtualTime=task.at;
 timers.delete(id);task.cb();
 assert.deepEqual(actions,['down:60','up:60','down:60','up:60'],
   'new note is released once after its protected minimum hold');
 engine.keyDown(62);
 engine.keyUp(62);
 engine.stopAll();
 assert.equal(timers.size,0,'stopping all cancels delayed note-off timers');
 assert.equal(engine.diagnostics.pendingReleases,0);
 assert.ok(engine.diagnostics.rapidReleases>=2);
 assert.ok(engine.diagnostics.retriggered>=1);
});

test('Tone Piano engine keeps standard 400ms release and sane diagnostic routing',()=>{
 const script=readFileSync(path.join(root,'scripts/tone-piano-entry.mjs'),'utf8');
 assert.match(script,/samplerAttack:0\.018/,'18ms attack suppresses abrupt PCM transients');
 assert.match(script,/minHoldMs:90/,'very short touches are held just long enough to ramp up');
 assert.match(script,/release:false/,'keybed click effect remains disabled');
 assert.match(script,/if\(available&&contextIsRunning\(\)\)/,
   'ready audio uses synchronous dispatch rather than Promise microtasks');
 const diagnostic=code.indexOf('if(app.audioDiagnosticTone){',code.indexOf('function soundOn(m'));
 const tone=code.indexOf('if(window.VoiceLineToneEngine){',code.indexOf('function soundOn(m'));
 assert.ok(diagnostic>0&&tone>diagnostic,'sine diagnostic bypasses grand piano engine');
});

test('Top bar microphone toggle and help caution are wired in every mode',()=>{
 assert.match(html,/id="micToggle"/,'persistent touchable button');
 assert.match(html,/id="micChip"/,'existing live microphone status remains visible');
 assert.match(html,/id="micToggleAction"/,'mic button shows turn on/off action');
 assert.match(code,/function updateMicToggle\(\)/);
 assert.match(code,/button\.setAttribute\('aria-pressed',String\(active\)\)/);
 assert.match(code,/button\.disabled=Boolean\(app\.busy\|\|app\.nativeStartResolve\)/);
 assert.match(code,/\$\('micToggle'\)\.addEventListener\('click'/);
 assert.match(code,/await stopActivity\(\);\s*resetMainAction\(\);/,'manual off safely stops an active recording or practice');
 assert.match(code,/마이크가 켜져 있으면 피아노 건반에서 재생되는 소리도 마이크에 입력될 수 있습니다/);
 assert.match(code,/음정 측정·비브라토 연습·음정 연습의 인식 결과가 부정확/);
 assert.match(code,/이어폰을 사용하거나/);
 assert.match(code,/녹음은 저장됩니다/);
 const css=readFileSync(path.join(root,'piano.css'),'utf8');
 assert.match(css,/\.mic-toggle\.active/);
});
test('Mic toggle OFF safely ends recording and ON does not auto-record',async()=>{
 const begin=code.indexOf('function resetMainAction(){');
 const end=code.indexOf('async function switchMode(mode){',begin);
 assert.ok(begin>=0&&end>begin);
 let clickHandler=null,events=[];
 const elements={
  micToggle:{addEventListener:(name,fn)=>{if(name==='click')clickHandler=fn;}},
  mainButton:{textContent:'녹음 중지 · 저장',classList:{remove(name){events.push('remove:'+name);}}},
  stopButton:{hidden:false},
  modeChip:{textContent:''}
 };
 const app={mode:'record',mic:true,busy:false,nativeStartResolve:null,record:{type:'native'}};
 const ctx={
  app,
  $:id=>elements[id],
  MODES:{pitch:['음정 측정하기']},
  updateMicToggle:()=>events.push('refresh'),
  stopActivity:async()=>{events.push('stopActivity');app.mic=false;app.record=null;},
  startMic:async()=>{events.push('startMic');app.mic=true;return true;},
  clearNote:()=>events.push('clearNote'),
  setMessage:(m)=>events.push('message:'+m),
  notify:(m)=>events.push('notify:'+m),
  setTitle:()=>events.push('title'),
  modeControls:()=>events.push('controls'),
  console
 };
 vm.runInNewContext(code.slice(begin,end),ctx);
 assert.equal(typeof clickHandler,'function');
 await clickHandler();
 assert.ok(events.includes('stopActivity'),'microphone off uses shared activity shutdown');
 assert.equal(app.mic,false);
 assert.equal(app.record,null);
 assert.equal(elements.mainButton.textContent,'녹음 시작');
 assert.equal(elements.stopButton.hidden,true);
 events=[];
 await clickHandler();
 assert.equal(app.mic,true);
 assert.equal(app.record,null,'manual microphone enable does not initiate recording');
 assert.equal(elements.mainButton.textContent,'녹음 시작');
 assert.ok(events.includes('startMic'));
 assert.equal(app.busy,false);
 // A microphone-only flow exposes the same toggle without another control.
 app.mode='pitch';app.mic=false;events=[];
 await clickHandler();
 assert.equal(elements.mainButton.textContent,'마이크 끄기');
 assert.equal(elements.stopButton.hidden,false);
});

test('Vibrato overlay keeps the piano playable and displays live pitch metrics',()=>{
 const css=readFileSync(path.join(root,'piano.css'),'utf8');
 for(const id of ['vibratoOverlay','vibratoGraph','vibratoTargetLabel','vibratoCenter','vibratoDepth','vibratoRate','vibratoRegularity','vibratoGraphStatus'])
  assert.match(html,new RegExp('id="'+id+'"'),'missing '+id);
 assert.match(html,/id="vibratoOverlay"[^>]+hidden/,'graph is hidden outside vibrato mode');
 assert.match(css,/\.vibrato-overlay\{[\s\S]*?pointer-events:none/,'overlay passes gestures through to keyboard');
 assert.match(css,/\.vibrato-overlay\{[\s\S]*?rgba\(/,'translucent overlay');
 assert.match(code,/function syncVibratoOverlay\(\)/);
 assert.match(code,/el\.hidden=app\.mode!=='vibrato'/);
 assert.match(code,/rawVibratoMidi=midi/,'use raw pitch, not median-smoothed note label');
 assert.match(code,/renderVibratoOverlay\(t\)/,'live analysis repaints graph');
 assert.match(code,/기준음\(0cent\)/,'help describes pitch reference line');
});
test('Vibrato analysis estimates 5Hz and +/- 25 cents from a clean sine pitch track',()=>{
 const start=code.indexOf('const VIBRATO_WINDOW_MS=');
 const end=code.indexOf('function syncVibratoOverlay()',start);
 assert.ok(start>0&&end>start);
 const analysis=vm.runInNewContext(code.slice(start,end)+'\nanalyzeVibrato',{Math,Number,Array,clamp:(x,a,b)=>Math.max(a,Math.min(b,x))});
 const samples=[];
 for(let i=0;i<90;i++){
  const tm=i*32;
  samples.push({t:tm,midi:60+.25*Math.sin(2*Math.PI*5*tm/1000)+.045});
 }
 const got=analysis(samples,60);
 assert.ok(got,'2.8 seconds of real-like pitch data is enough for analysis');
 assert.ok(Math.abs(got.rate-5)<0.35,'estimated rate '+got.rate);
 assert.ok(Math.abs(got.depthCents-23)<5,'estimated depth '+got.depthCents);
 assert.ok(Math.abs(got.centerOffsetCents-4.5)<7,'estimated center offset '+got.centerOffsetCents);
 assert.equal(got.regularity,'일정');
 assert.equal(analysis(samples.slice(0,10),60),null,'brief fragments do not report bogus vibrato');
 const steady=Array.from({length:90},(_,i)=>({t:i*32,midi:60+.03}));
 const plain=analysis(steady,60);
 assert.ok(plain&&plain.rate===null,'steady pitch must not report fake vibrato frequency');
 const wrongKey=Array.from({length:90},(_,i)=>({t:i*32,midi:63+.25*Math.sin(2*Math.PI*5*i*32/1000)}));
 assert.equal(analysis(wrongKey,60),null,'a note several semitones off target is not valid vibrato');
});
