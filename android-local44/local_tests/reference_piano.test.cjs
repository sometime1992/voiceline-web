'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const piano=require('../app/src/main/assets/www/reference-piano.js'),guide=require('../app/src/main/assets/www/guide-training.js'),plans=require('../app/src/main/assets/www/practice-plans.js');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function audio(){
 const sources=[],gains=[],param=()=>({events:[],setValueAtTime(v,t){this.events.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.events.push(['linear',v,t]);},exponentialRampToValueAtTime(v,t){this.events.push(['exponential',v,t]);}});
 const ac={state:'running',currentTime:0,createBufferSource(){const node={playbackRate:param(),connect(){},disconnect(){this.disconnected=true;},start(t){this.started=t;},stop(t){this.stopped=t;}};sources.push(node);return node;},createGain(){const node={gain:param(),connect(){},disconnect(){this.disconnected=true;}};gains.push(node);return node;},createOscillator(){throw Error('Electronic pitch substitution is forbidden');}};
 return {ac,sources,gains};
}
test('A reference uses the acoustic recording for 1.5 seconds, exact transposition, and a natural fade',()=>{
 const h=audio(),buffer={};let ended=0;
 const voice=piano.play(h.ac,{},()=>({buffer,anchor:60,gain:.1}),{midi:61,onended:()=>ended++});
 assert.equal(voice.source.buffer,buffer);assert.equal(voice.source.started,0);assert.equal(voice.source.stopped,1.51);
 assert.equal(voice.source.playbackRate.events[0][1],Math.pow(2,1/12));
 assert.deepEqual(voice.gain.gain.events,[['set',0,0],['linear',.1,.012],['set',.1,1.28],['linear',0,1.5]]);
 voice.source.onended();assert.equal(ended,1);assert.equal(voice.source.disconnected,true);assert.equal(voice.gain.disconnected,true);
});
test('Piano references respect explicit listening time, volume zero and unavailable sample errors',()=>{
 const h=audio();piano.play(h.ac,{},()=>({buffer:{},anchor:48,gain:.1}),{midi:48,length:1.8,volume:35});
 assert.equal(h.sources[0].stopped,1.81);assert.ok(Math.abs(h.gains[0].gain.events[1][1]-.035)<1e-9);
 assert.equal(piano.play(h.ac,{},()=>{throw Error('Muted audio must not load');},{midi:48,volume:0}),null);
 assert.throws(()=>piano.play(h.ac,{},()=>null,{midi:48}),/피아노/);assert.equal(h.sources.length,1);
});
function references(){
 const h=audio(),app={trainingSettings:{root:48,earPattern:'custom',earCount:2,earNotes:[36,94]},vibratoRoot:84},acoustic={buffers:new Map()};let now=0,resolve;const loaded=[],messages=[];
 const ctx={app,acoustic,window:{VoiceLineReferencePiano:piano,VoiceLineGuideTraining:guide,VoiceLinePracticePlans:plans},document:{hidden:false},performance:{now:()=>now},ensureSynth:()=>h.ac,
  nearestAcousticMidi:midi=>Math.min(105,24+3*Math.round((midi-24)/3)),calibratedPianoGain:()=>.12,notify:m=>messages.push(m),console,
  guideOptions:()=>({...guide.PRACTICE_DEFAULTS,root:36,pattern:'triad',rounds:2,shift:1}),
  loadAcousticSample:anchor=>{loaded.push(anchor);return new Promise(done=>{resolve=buffer=>{if(buffer)acoustic.buffers.set(anchor,buffer);done(buffer);};});}};
 const api=vm.runInNewContext(source.slice(source.indexOf('function cancelReferenceNotes(){'),source.indexOf('function finishExercise('))+'\n({playReference,cancelReferenceNotes,prepareReferencePiano})',ctx);
 return {...h,app,ctx,acoustic,loaded,messages,...api,time:t=>now=t,resolve:buffer=>resolve(buffer)};
}
test('A cold reference waits for the correct recording and keeps its end inside the listening phase',async()=>{
 const h=references(),pending=h.playReference(94,1.8);assert.deepEqual(h.loaded,[93]);assert.equal(h.sources.length,0);
 h.time(400);h.resolve({});await pending;assert.equal(h.sources.length,1);assert.ok(Math.abs(h.sources[0].stopped-1.41)<1e-9);
});
test('Stopping or backgrounding while a piano sample decodes never creates a late reference',async()=>{
 for(const stop of ['cancel','background']){
  const h=references(),pending=h.playReference(84);
  if(stop==='cancel')h.cancelReferenceNotes();else h.app.backgrounded=true;
  h.resolve({});await pending;assert.equal(h.sources.length,0,stop);
 }
});
test('Reference defaults remain audible and a zero-length listening phase stays silent',async()=>{
 const h=references();h.acoustic.buffers.set(48,{});await h.playReference(48);assert.equal(h.sources[0].stopped,1.51);
 await h.playReference(48,0);assert.equal(h.sources.length,1);h.cancelReferenceNotes();assert.equal(h.app.referenceVoices.size,0);
});
test('Reference preload covers custom ear notes instead of just the visible keyboard octave',async()=>{
 const h=references();h.ctx.loadAcousticSample=async anchor=>{h.loaded.push(anchor);return {};};
 assert.equal(await h.prepareReferencePiano('earVoice'),true);assert.deepEqual(h.loaded,[36,93]);
});
test('A canceled routine cannot request the microphone after a slow reference preload',async()=>{
 let own=true,resolve,mic=0;const ctx={requestAppAudio:()=>true,app:{},document:{hidden:false},window:{VoiceLinePlansUI:{owns:()=>own}},
  switchMode:async()=>{},applyPlanOptions(){},$:()=>({querySelectorAll:()=>[]}),prepareReferencePiano:()=>new Promise(done=>resolve=done),startMic:async()=>{mic++;return true;},updateMicToggle(){},JSON};
 const run=vm.runInNewContext(source.slice(source.indexOf('async function runPlanStep('),source.indexOf('app.metronome=window.VoiceLineMetronome'))+'\nrunPlanStep',ctx);
 const pending=run({mode:'earVoice',params:{},timing:{}},1,{},true);await turn();own=false;resolve(true);
 assert.equal(await pending,false);assert.equal(mic,0);
});
test('A delayed preview starts its full piano listening time after decoding and closing cancels it',async()=>{
 for(const cancel of [false,true]){
  let now=0,resolve,created,started,timer;const ctx={requestAppAudio:()=>true,app:{},document:{hidden:false},performance:{now:()=>now},ensureSynth:()=>({state:'running'}),nearestAcousticMidi:m=>m,
   loadAcousticSample:()=>new Promise(done=>resolve=done),referenceSample(){},notify(){},clearTimeout(){},setTimeout(fn,ms){timer=ms;return 1;},
   window:{VoiceLineReferencePiano:{DEFAULT_SECONDS:1.5,play(ac,destination,sample,settings){created={settings,t:now};started=now;return null;}}}};
  const api=vm.runInNewContext(source.slice(source.indexOf('let settingsPreviewPlayer='),source.indexOf('function unlockPlanAudio()'))+'\n({previewSettingsSound,stopSettingsPreview})',ctx);
  const pending=api.previewSettingsSound({midi:60,volume:70,sound:'hum'});if(cancel)api.stopSettingsPreview();now=1400;resolve({});await pending;
  if(cancel)assert.equal(created,undefined);else{assert.equal(created.t,1400);assert.equal(created.settings.length,1.5);assert.equal(started,1400);assert.equal(timer,1700);}
 }
});
test('Old timbres migrate to piano while routine order, pitch, timing and recording data survive',()=>{
 for(const sound of ['hum','vowel','piano','unknown'])assert.equal(guide.normalize({sound}).sound,'piano');
 assert.deepEqual(Object.keys(guide.SOUNDS),['piano']);
 const before={id:'r',name:'보컬',rounds:2,steps:[{id:'s',mode:'practice',timing:{seconds:12,rounds:3},params:{guide:{sound:'hum',root:60,volume:37}}}]};
 const saved=plans.normalize({routines:[before]}).routines[0];assert.equal(saved.steps[0].params.guide.sound,'piano');assert.equal(saved.steps[0].id,'s');assert.equal(saved.steps[0].params.guide.root,60);assert.equal(saved.steps[0].timing.rounds,3);assert.equal(before.steps[0].params.guide.sound,'hum');
});
