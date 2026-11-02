'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const root='../app/src/main/assets/www/',model=require(root+'practice-settings.js'),guide=require(root+'guide-training.js'),plans=require(root+'practice-plans.js'),dynamic=require(root+'dynamic-training.js');
const timing=(mode,extra={})=>plans.timing(mode,extra);
test('Shared settings classify every pitch pattern once and keep five vowels discrete',()=>{
 const ids=model.KINDS.flatMap(([k])=>model.patterns(k).map(([id])=>id));assert.equal(new Set(ids).size,Object.keys(guide.PATTERNS).length);
 assert.deepEqual(model.patterns('vowels').map(([id])=>id),['vowelFive','vowelTriad']);assert.equal(model.patternKind('triad'),'leaps');assert.equal(model.patternKind('smooth5'),'smooth');
 for(const id of ['vowelFive','vowelTriad']){const d=model.describe('practice',timing('practice'),{guide:{pattern:id,root:48,noteSeconds:1.8,rounds:1,listenFirst:false,breathSeconds:3,restSeconds:3,shift:0}});assert.equal(d.totalSeconds,id==='vowelFive'?99:63);assert.equal(d.voiceSeconds,id==='vowelFive'?81:45);assert.equal(d.pattern.smooth,undefined);assert.match(d.note,/아 → 에 → 이 → 오 → 우 = 1세트/);}
});
test('Pitch duration uses actual guide plans, including listening, BPM, final recovery and native preparation',()=>{
 for(const pattern of Object.keys(guide.PATTERNS))for(const listenFirst of [false,true])for(const rounds of [1,3]){
  const g=guide.normalize({pattern,listenFirst,rounds,root:48,noteSeconds:0,bpm:80,prepareSeconds:1.4,breathSeconds:2.2,restSeconds:.7,shift:0});const actual=guide.create(g,0);
  const d=model.describe('practice',timing('practice',{rounds}),{guide:g});assert.equal(d.totalSeconds,Math.round((actual.start+actual.duration)/100)/10,pattern+' native duration');
  const one=guide.create({...g,rounds:1},0);const routine=model.describe('practice',timing('practice',{rounds}),{guide:g},true);assert.equal(routine.totalSeconds,Math.round((one.start+one.duration)*rounds/100)/10,pattern+' routine duration');
 }
});
test('Custom dynamics duration follows the real segments rather than an inactive total-time field',()=>{
 const t=timing('dynamicVoice',{seconds:60,rounds:2,reference:.5,breath:1,rest:2,customStages:true,stages:[1.5,2.4,4.2,1.1]});const tr={dynamicPattern:'steps'};const actual=dynamic.create({pattern:'steps',duration:60000,segmentSeconds:t.stages});
 const d=model.describe('dynamicVoice',t,{training:tr});assert.equal(d.totalSeconds,Math.round(((actual.duration/1000+1.5)*2+2)*10)/10);assert.equal(d.voiceSeconds,Math.round(actual.duration/1000*2*10)/10);
});
test('Warmup normal and routine durations respect their different preparation boundaries',()=>{
 const p={training:{warmup:{inhale:4,exhale:6,hum:6,rest:0}}},t=timing('warmupVoice',{prepare:1.8,rounds:3});assert.equal(model.describe('warmupVoice',t,p).totalSeconds,49.8);assert.equal(model.describe('warmupVoice',t,p,true).totalSeconds,53.4);assert.equal(model.describe('warmupVoice',t,p).voiceSeconds,18);
});
test('Ear patterns, roots, count and custom notes use the same ranges in either scope without sharing objects',()=>{
 const original={training:{root:36,earCount:20,earPattern:'custom',earNotes:[36,50,64]}};const a=model.prepare('earVoice',original),b=model.prepare('earVoice',original,true);assert.deepEqual(a.training,b.training);assert.equal(a.training.root,36);assert.equal(a.training.earNotes.length,20);a.training.earNotes[0]=72;assert.equal(b.training.earNotes[0],36);assert.deepEqual(original.training.earNotes,[36,50,64]);assert.equal(Object.hasOwn(b,'micSensitivity'),false);
 const t=timing('earVoice',{prepare:1,listen:1.5,breath:.5,answer:2,noteRest:.2,rounds:2,rest:3});const d=model.describe('earVoice',t,{training:{earCount:2,earPattern:'custom',earNotes:[60,64]}});assert.equal(d.totalSeconds,21.8);assert.equal(d.voiceSeconds,8);
});
test('Manual stop, finite time and continuous repeats have distinct duration summaries',()=>{
 for(const mode of ['piano','pitch','metronome','record']){const manual=model.describe(mode,timing(mode,{seconds:0}),{});assert.equal(manual.totalSeconds,Infinity);assert.match(manual.totalText,/타이머 없음/);const finite=model.describe(mode,timing(mode,{seconds:12,rounds:2,rest:3}),{});assert.equal(finite.totalSeconds,mode==='record'?12:27);}
 assert.equal(model.describe('sustainVoice',timing('sustainVoice',{rounds:0}),{}).totalSeconds,Infinity);assert.match(model.describe('sustainVoice',timing('sustainVoice',{rounds:0}),{}).totalText,/계속 반복/);
});
test('Whole routine includes inter-step and inter-loop recovery, omits the final recovery and includes native phrase recovery',()=>{
 const steps=[{mode:'piano',timing:{seconds:10,rounds:2,rest:3}},{mode:'rest',timing:{seconds:5,rounds:1}},{mode:'sustainVoice',timing:{seconds:8,reference:1,breath:2,rounds:1,rest:4}}];const p={rounds:2,steps};const d=model.routine(p);assert.equal(d.totalSeconds,88);assert.equal(d.oneCycleSeconds,46);const forever=model.routine({...p,rounds:0});assert.equal(forever.totalSeconds,Infinity);assert.equal(forever.oneCycleSeconds,46);
});
test('Out-of-range shifted guides and unsafe rhythm densities produce actionable issues',()=>{
 assert.ok(model.describe('practice',timing('practice',{rounds:99}),{guide:{pattern:'octave',root:82,rounds:99,shift:1}}).issues.length);
 assert.ok(model.describe('metronome',timing('metronome'),{metronome:{bpm:300,numerator:64,denominator:64,unit:'quarter',subdivision:8}}).issues.length);
});
