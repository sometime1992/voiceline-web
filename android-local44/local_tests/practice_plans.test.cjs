'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const plans=require('../app/src/main/assets/www/practice-plans.js');
const guide=require('../app/src/main/assets/www/guide-training.js');
const dynamics=require('../app/src/main/assets/www/dynamic-training.js');
const storage=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,v)=>values.set(key,v)};};
const entry=(mode='piano',rounds=1)=>({mode,timing:{seconds:1,rounds,rest:0}});
function harness(run){const calls=[],timers=new Map(),finished=[],states=[],errors=[];let next=0;const runner=plans.createRunner({run:run||((step,token)=>{calls.push([step.mode,token]);return true;}),setTimer:fn=>{timers.set(++next,fn);return next;},clearTimer:id=>timers.delete(id),onFinish:s=>finished.push(s),onState:s=>states.push(s),onError:e=>errors.push(e)});return {runner,calls,timers,finished,states,errors,async advance(){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();await new Promise(r=>setImmediate(r));}};}
test('The initial reference is C3 / 1옥 도 and saved C4 defaults migrate once without touching recordings or other notes',()=>{
 assert.equal(guide.DEFAULTS.root,48);assert.equal(guide.PRACTICE_DEFAULTS.root,48);
 const s=storage();s.setItem('voiceline-training-v1',JSON.stringify({root:60,sustainSeconds:9.4}));s.setItem('voiceline-unified-practice-v1',JSON.stringify({root:67,rounds:0}));s.setItem('recordings','untouched');
 assert.equal(plans.migrateDefaultRoot(s),true);assert.deepEqual(JSON.parse(s.getItem('voiceline-training-v1')),{root:48,sustainSeconds:9.4});assert.equal(JSON.parse(s.getItem('voiceline-unified-practice-v1')).root,67);assert.equal(s.getItem('recordings'),'untouched');
 s.setItem('voiceline-training-v1',JSON.stringify({root:60}));assert.equal(plans.migrateDefaultRoot(s),false);assert.equal(JSON.parse(s.getItem('voiceline-training-v1')).root,60);
});
test('Arbitrary note, slide, breath and recovery lengths determine the same guide/score timeline',()=>{
 const p=guide.create({pattern:'five',root:48,noteSeconds:1.7,prepareSeconds:.9,breathSeconds:4.2,restSeconds:2.3,rounds:1,listenFirst:true},100);
 assert.equal(p.start,1000);assert.equal(p.noteMs,1700);assert.equal(p.handoffMs,4200);assert.equal(p.cycleMs,37100);assert.equal(guide.position(p,p.start+p.phraseMs+4200).phase,'answer');
 const s=guide.create({pattern:'smooth5',root:48,smoothSeconds:17.2,rounds:1},0);assert.equal(s.phraseMs,17200);assert.equal(s.noteMs,4300);assert.equal(guide.position(s,s.start+s.phraseMs+s.handoffMs+s.phraseMs/2).midi,53);
});
test('Per-stage dynamics uses each entered duration for guide, calibration and target coverage',()=>{
 const s=dynamics.create({start:100,pattern:'steps',segmentSeconds:[1.5,2.4,4.2,1.1]});assert.equal(s.duration,9200);assert.deepEqual(s.segments.map(x=>x.end-x.start),[1500,2400,4200,1100]);assert.equal(dynamics.state(s,1600).key,'medium');assert.equal(dynamics.state(s,4000).key,'strong');
});
test('All mode timers accept direct fractional input and zero repetitions remains an explicit unlimited choice',()=>{
 for(const mode of Object.keys(plans.MODES)){const t=plans.timing(mode,{seconds:17.3,rounds:0,rest:2.4,reference:2.2,breath:4.7,listen:2.6,answer:5.5,noteRest:.8});assert.equal(t.rounds,0);assert.equal(t.seconds,17.3);assert.equal(t.rest,2.4);assert.equal(t.breath,4.7);}
 assert.equal(plans.timing('record',{seconds:9999}).seconds,600);assert.equal(plans.timing('dynamicVoice',{seconds:NaN}).seconds,12);assert.equal(plans.timing('earVoice',{answer:-8}).answer,.5);
});
test('Multiple named routines persist their exact order, timing and settings; deletion keeps the other routine',()=>{
 const s=storage(),value=plans.normalize({routines:[{id:'a',name:'아침',rounds:0,steps:[entry('warmupVoice'),entry('practice',3)]},{id:'b',name:'저녁',steps:[entry('vibrato')]}]});
 value.routines[0].steps[1].params={guide:{root:48,pattern:'triad',noteSeconds:1.7}};plans.save(s,value);
 const saved=plans.load(s);assert.equal(saved.routines.length,2);assert.deepEqual(saved.routines[0].steps.map(s=>s.mode),['warmupVoice','practice']);assert.equal(saved.routines[0].rounds,0);assert.equal(saved.routines[0].steps[1].params.guide.noteSeconds,1.7);
 saved.routines=saved.routines.filter(r=>r.id!=='a');plans.save(s,saved);assert.equal(plans.load(s).routines[0].name,'저녁');
});
test('A routine step is finite so later steps remain reachable; the whole routine can repeat forever',()=>{
 const p=plans.routine({rounds:0,steps:[{mode:'pitch',timing:{seconds:0,rounds:0}}]});assert.equal(p.rounds,0);assert.equal(p.steps[0].timing.rounds,1);assert.equal(p.steps[0].timing.seconds,30);
});
test('The shared runner preserves standalone recording mode instead of redirecting it into a voice exercise',()=>{
 const p=plans.routine({name:'녹음',rounds:1,steps:[{mode:'record',timing:{seconds:5,rounds:1}}]});assert.equal(p.steps[0].mode,'record');assert.equal(p.steps[0].timing.seconds,5);
});
test('Serial completion respects step order, repeats each step, repeats the whole routine and finishes only once',async()=>{
 const h=harness();await h.runner.start({rounds:2,steps:[entry('piano',2),entry('rest')]});
 for(let i=0;i<6;i++){assert.equal(h.runner.complete(),true);assert.equal(h.runner.complete(),false);if(i<5)await h.advance();}
 assert.deepEqual(h.calls.map(c=>c[0]),['piano','piano','rest','piano','piano','rest']);assert.equal(h.finished.length,1);assert.equal(h.finished[0].completed,6);assert.equal(h.runner.snapshot(),null);assert.equal(h.timers.size,0);
});
test('Unlimited routines stay bounded and never allocate future sessions',async()=>{
 const h=harness();await h.runner.start({rounds:0,steps:[entry('rest')]});
 for(let i=0;i<500;i++){h.runner.complete();assert.equal(h.timers.size,1);await h.advance();}
 assert.equal(h.runner.snapshot().round,501);assert.equal(h.finished.length,0);h.runner.cancel();assert.equal(h.timers.size,0);assert.equal(h.runner.snapshot(),null);
});
test('Cancelling during recovery prevents a queued step from starting',async()=>{
 const h=harness();await h.runner.start({steps:[entry('piano'),entry('practice')]});h.runner.complete();const callback=[...h.timers.values()][0];h.runner.cancel();callback();await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,1);assert.equal(h.finished.length,0);
});
test('Late permission or audio callbacks from a cancelled run cannot finish or advance a new run',async()=>{
 let release;const h=harness(()=>new Promise(r=>release=r));const pending=h.runner.start({steps:[entry()]});const old=h.runner.token;h.runner.cancel();release(false);await pending;assert.equal(h.errors.length,0);assert.equal(h.runner.complete(old),false);assert.equal(h.runner.snapshot(),null);
});
test('A start failure stops the routine rather than silently skipping an exercise',async()=>{
 const h=harness(async()=>false);await h.runner.start({steps:[entry(),entry('rest')]});assert.equal(h.errors.length,1);assert.equal(h.runner.snapshot(),null);assert.equal(h.timers.size,0);assert.equal(h.finished.length,0);
});
test('Corrupt storage has a clean fallback and a failed save is never reported as persisted',()=>{
 assert.equal(plans.load({getItem(){throw Error('blocked')}}).routines.length,0);assert.equal(plans.load({getItem:()=>'{'}).routines.length,0);assert.throws(()=>plans.save({setItem(){throw Error('quota')}},{routines:[]}));
});
