'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const guide=require('../app/src/main/assets/www/guide-training.js');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
function fixture(){
 let now=0;const app={mode:'practice',mic:true,detected:48.2,lastTrustedPitchAt:0,owners:new Set(),sessionSamples:20};
 const keys=[48,49,50].map(midi=>{const values=new Set();return {dataset:{midi},classList:{toggle:(k,v)=>v?values.add(k):values.delete(k),contains:k=>values.has(k)},setAttribute(){}};});
 const from=source.indexOf('function keyboardDetectedMidi('),to=source.indexOf('// Centralized dynamics',from);
 const phase=source.slice(source.indexOf('function trainingPhase('),source.indexOf('function newTrainingSession('));
 const api=vm.runInNewContext(phase+source.slice(from,to)+'\n({keyboardDetectedMidi,syncKeyColors})',{app,window:{VoiceLineGuideTraining:guide},performance:{now:()=>now},$all:()=>keys,Math,Number});
 return {app,keys,...api,at(t,fresh=true){now=t;if(fresh)app.lastTrustedPitchAt=t;api.syncKeyColors(t);return keys.filter(k=>k.classList.contains('detected')).map(k=>k.dataset.midi);}};
}
test('Listening guides hide purple input through listening, breathing and recovery; fresh responses restore it each round',()=>{
 for(const pattern of ['triad','smooth5','vowelFive']){
  const h=fixture(),s=h.app.training=guide.create({pattern,root:48,rounds:2,noteSeconds:.5,prepareSeconds:.2,breathSeconds:.3,restSeconds:.4,listenFirst:true},0);
  for(const t of [0,s.start,s.start+s.phraseMs-1,s.start+s.phraseMs,s.start+s.phraseMs+s.handoffMs-1])assert.deepEqual(h.at(t),[],pattern+' listening/preparation');
  const answer=s.start+s.phraseMs+s.handoffMs;
  assert.deepEqual(h.at(answer,false),[],pattern+' stale playback note');assert.deepEqual(h.at(answer+40),[48],pattern+' actual response');
  assert.deepEqual(h.at(s.start+s.cycleMs-.1),[],pattern+' recovery');assert.deepEqual(h.at(s.start+s.cycleMs+20),[],pattern+' next listening');
  assert.equal(h.app.mic,true);assert.equal(h.app.sessionSamples,20);assert.equal(s.valid,0);
 }
});
test('Direct practice still shows measured purple notes while the user sings with its short reference cues',()=>{
 const h=fixture(),s=h.app.training=guide.create({pattern:'triad',root:48,noteSeconds:1,rounds:1,listenFirst:false,breathSeconds:.3},0);
 assert.deepEqual(h.at(s.start-1),[]);assert.deepEqual(h.at(s.start+40),[48]);assert.deepEqual(h.at(s.start+1000),[48]);
});
test('Every ear-training note hides the listening and inhale estimate without leaking a previous answer',()=>{
 const h=fixture(),s=h.app.training={mode:'earVoice',active:true,start:200,duration:6000,earCycleMs:3000,earListenMs:900,earBreathMs:600,earAnswerMs:1200,target:null};
 for(const round of [0,1]){const start=s.start+round*s.earCycleMs;
  assert.deepEqual(h.at(start),[]);assert.deepEqual(h.at(start+1000),[]);assert.deepEqual(h.at(start+1499),[]);
  assert.deepEqual(h.at(start+1500,false),[]);assert.deepEqual(h.at(start+1540),[48]);assert.deepEqual(h.at(start+2750),[]);
 }
});
test('Sustain, dynamics and vibrato suppress reference listening and resume only with post-start input',()=>{
 for(const mode of ['sustainVoice','dynamicVoice','vibrato']){
  const h=fixture();h.app.mode=mode;const session={mode,active:true,start:1800,breathStart:800,target:48};
  if(mode==='vibrato'){h.app.vibratoPreparation=session;h.app.vibratoRoot=48;}else h.app.training=session;
  assert.deepEqual(h.at(400),[]);assert.deepEqual(h.at(1200),[]);assert.deepEqual(h.at(1800,false),[]);assert.deepEqual(h.at(1840),[48]);
  // A cue during the real response must not interrupt the displayed user's voice.
  if(mode==='dynamicVoice')session.dynamicCueWindows=[{start:1800,end:2100}];assert.deepEqual(h.at(1900),[48]);
 }
});
test('Free pitch and recording keep purple measurement; target and finger colors retain their own state',()=>{
 const h=fixture();for(const mode of ['piano','pitch','record']){h.app.mode=mode;assert.deepEqual(h.at(100),[48]);}
 h.app.mode='practice';h.app.training=guide.create({pattern:'hold',root:48,listenFirst:true,prepareSeconds:0},0);h.app.training.target=49;h.app.owners.add(50);
 assert.deepEqual(h.at(100),[]);assert.equal(h.keys[1].classList.contains('target'),true);assert.equal(h.keys[2].classList.contains('pressed'),true);
 h.app.training=null;h.app.mic=false;assert.deepEqual(h.at(300),[]);
});
