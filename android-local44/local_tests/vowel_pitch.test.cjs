'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const guide=require('../app/src/main/assets/www/guide-training.js'),plans=require('../app/src/main/assets/www/practice-plans.js');
const make=options=>guide.create({...guide.PRACTICE_DEFAULTS,pattern:'vowelFive',root:48,rounds:1,noteSeconds:.6,restSeconds:.4,breathSeconds:.3,...options},0);
function sing(s,pitch=p=>p.midi){for(let t=s.start;t<s.start+s.duration;t+=20){const p=guide.position(s,t);guide.receive(s,t,pitch(p,t));}return guide.metrics(s);}
test('Each vowel sings the entire discrete ascent and descent before advancing to the next vowel',()=>{
 for(const pattern of ['vowelFive','vowelTriad']){
  const s=make({pattern});assert.equal(s.smooth,false);assert.equal(s.sets,1);assert.equal(s.rounds,5);
  assert.deepEqual(s.roots,[48,48,48,48,48]);
  for(let round=0;round<5;round++)for(let i=0;i<s.pattern.steps.length;i++)for(const fraction of [.1,.5,.99]){
   const p=guide.position(s,s.start+round*s.cycleMs+(i+fraction)*s.noteMs);
   assert.equal(p.vowel,guide.VOWELS[round]);assert.equal(p.index,i);assert.equal(p.midi,48+s.pattern.steps[i]);
  }
  assert.match(guide.roundLabel(s,guide.position(s,s.start+4*s.cycleMs)),/1\/1세트 · 우 5\/5/);
 }
});
test('Semitone shifts and range limits apply to whole five-vowel sets, never individual vowels',()=>{
 const s=make({rounds:3,shift:1});assert.deepEqual(s.roots,[48,48,48,48,48,49,49,49,49,49,50,50,50,50,50]);
 assert.equal(s.sets,3);assert.equal(guide.position(s,s.start+5*s.cycleMs).setIndex,1);
 const top=make({root:94,rounds:3,shift:1});assert.equal(top.sets,1);assert.equal(top.rounds,5);assert.equal(top.limited,true);
 assert.ok(top.roots.every(n=>n===87));assert.ok(top.bins.flat().every(b=>b.midi<=94));
});
test('Correct stepped pitches at a constant voice level succeed; a flat note or continuous glide cannot replace them',()=>{
 for(const pattern of ['vowelFive','vowelTriad']){
  const correct=make({pattern});const metrics=sing(correct);assert.equal(metrics.accuracy,100);assert.equal(metrics.enough,true);assert.equal(guide.evaluate(correct,true).kind,'success');
  const flat=make({pattern});sing(flat,()=>48);assert.equal(guide.evaluate(flat,true).kind,'failure');
  const slide=make({pattern});sing(slide,p=>48+7*(1-Math.abs(p.offset/slide.phraseMs*2-1)));assert.equal(guide.evaluate(slide,true).kind,'failure');
 }
});
test('Skipping one vowel or one target note prevents success even when the rest is perfectly pitched',()=>{
 for(const skip of [p=>p.vowel==='이',p=>p.vowel==='오'&&p.index===2]){
  const s=make();const m=sing(s,p=>skip(p)?null:p.midi);assert.equal(m.accuracy,100);assert.equal(m.each,false);assert.equal(guide.evaluate(s,true).kind,'guided');
  assert.match(guide.summary(s,String),/더 연습할 음/);
 }
});
test('Each vowel has its own listen, ungraded breath, response and recovery in listen-first mode',()=>{
 const s=make({listenFirst:true});
 for(let round=0;round<5;round++){
  const start=s.start+round*s.cycleMs;
  assert.equal(guide.position(s,start).phase,'listen');assert.equal(guide.position(s,start).vowel,guide.VOWELS[round]);
  assert.equal(guide.position(s,start+s.phraseMs).phase,'handoff');
  assert.equal(guide.position(s,start+s.phraseMs+s.handoffMs).phase,'answer');
 }
 sing(s,p=>p.phase==='answer'?null:94);assert.equal(s.valid,0);assert.equal(s.voicedMs,0);assert.equal(s.high,null);
 const correct=make({listenFirst:true});sing(correct);assert.equal(guide.evaluate(correct,true).kind,'success');
});
test('Recovery previews the next vowel and never adds another vowel after the final one',()=>{
 const s=make();
 for(let i=0;i<4;i++)assert.equal(guide.startCue(s,s.start+i*s.cycleMs+s.phraseMs).vowel,guide.VOWELS[i+1]);
 assert.equal(guide.startCue(s,s.start+4*s.cycleMs+s.phraseMs).visible,false);
 assert.equal(guide.position(s,s.start+s.duration).phase,'done');assert.equal(guide.position(s,s.start+s.duration).vowel,'우');
 assert.match(guide.summary(s,String,true),/1세트 · 5모음씩/);
});
test('Unlimited vowel practice rotates all vowels with bounded grading bins and history',()=>{
 const s=make({rounds:0,shift:1});const seen=new Set();
 for(let t=s.start;t<s.start+25*s.cycleMs;t+=40){const p=guide.position(s,t);seen.add(p.vowel);guide.receive(s,t,p.midi);}
 assert.equal(s.settings.shift,0);assert.equal(s.bins.length,1);assert.equal(seen.size,5);assert.ok(s.history.length<=152);assert.equal(guide.metrics(s).enough,true);
 assert.equal(guide.position(s,s.start+25*s.cycleMs).vowel,'아');
});
test('Legacy vowel preferences and routines migrate once without touching recordings or unrelated guide settings',()=>{
 const data=new Map([['voiceline-training-v1',JSON.stringify({dynamicPattern:'vowels',root:62,rounds:2})],['recording-sentinel','keep'],['voiceline-plans-v1',JSON.stringify({routines:[{id:'r1',name:'보컬',rounds:3,steps:[{id:'s1',mode:'dynamicVoice',params:{training:{dynamicPattern:'vowels',root:55}},timing:{rounds:4,customStages:true,stages:[2,3,3]}}]}]})]]);
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const loaded=plans.load(storage),step=loaded.routines[0].steps[0],pref=guide.normalize(JSON.parse(storage.getItem('voiceline-unified-practice-v1')));
 assert.equal(pref.pattern,'vowelFive');assert.equal(pref.root,62);assert.equal(pref.rounds,2);assert.equal(step.mode,'practice');assert.equal(step.params.guide.root,55);assert.equal(step.id,'s1');assert.equal(step.timing.rounds,4);assert.equal(loaded.routines[0].rounds,3);assert.equal(storage.getItem('recording-sentinel'),'keep');
 assert.equal(JSON.parse(storage.getItem('voiceline-training-v1')).dynamicPattern,'steps');
 storage.setItem('voiceline-unified-practice-v1',JSON.stringify({pattern:'triad',root:59}));assert.equal(plans.migrateVowelPractice(storage),false);assert.equal(JSON.parse(storage.getItem('voiceline-unified-practice-v1')).pattern,'triad');
});
test('Vowel reference audio uses fixed note frequencies and has no pitch ramp',()=>{
 const events=[],sources=[],param=()=>({setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}});
 const ac={currentTime:0,createGain:()=>({gain:param(),connect(){},disconnect(){}}),createOscillator(){const node={frequency:{setValueAtTime(v,t){events.push(['fixed',v,t]);},exponentialRampToValueAtTime(){events.push(['ramp']);}},connect(){},disconnect(){},start(){},stop(){}};sources.push(node);return node;}};
 const timers={setInterval:()=>1,clearInterval(){}},s=make({sound:'hum'}),player=guide.createPlayer(ac,{},()=>null,timers);player.start(s,0);
 for(let t=0;t<(s.start+s.duration)/1000;t+=.02){ac.currentTime=t;player.pump();}
 assert.equal(events.some(e=>e[0]==='ramp'),false);assert.equal(sources.length,5*9*3);assert.ok(events.every(e=>e[1]>0));player.stop();
});
