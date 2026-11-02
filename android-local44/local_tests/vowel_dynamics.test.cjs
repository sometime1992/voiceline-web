'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const api=require('../app/src/main/assets/www/dynamic-training.js'),plans=require('../app/src/main/assets/www/practice-plans.js');
const levels=[.0042,.0063,.0036,.0054,.0048];
function sing(options={},skip=()=>false){const m=api.create({pattern:'vowels',...options});for(let t=0;t<m.duration;t+=40){const p=api.state(m,t),rms=levels[p.vowelIndex]*Math.pow(api.STEP_RATIO,p.level);api.receive(m,t,p.rest?.9:rms,{voiced:!skip(p),onPitch:true});}return m;}
test('Vowel practice guides a/e/i/o/u in order, with one soft reference and a rise/fall per vowel',()=>{
 const m=api.create({pattern:'vowels'});assert.equal(m.duration,52000);assert.equal(m.segments.length,19);
 assert.deepEqual(m.segments.filter(s=>s.calibrate).map(s=>s.vowel),['아','에','이','오','우']);
 for(let i=0;i<5;i++){const s=m.segments.filter(s=>s.vowelIndex===i&&!s.rest);assert.deepEqual(s.map(p=>[p.from,p.to]),[[0,0],[0,2],[2,0]]);assert.deepEqual(s.map(p=>p.end-p.start),[2000,3000,3000]);}
 assert.equal(m.segments.filter(s=>s.rest).length,4);assert.ok(m.segments.filter(s=>s.rest).every(s=>s.end-s.start===3000));
 assert.equal(api.state(m,8000).rest,true);assert.equal(api.state(m,11000).vowel,'에');assert.equal(api.state(m,44000).vowel,'우');
});
test('Every vowel calibrates its own level and a matching contour succeeds even when vowels have different microphone amplitudes',()=>{
 const m=sing(),r=api.metrics(m);assert.deepEqual(m.baselines,levels);assert.equal(r.calibrated,true);assert.equal(r.voiceDuration,40000);assert.equal(r.accuracy,100);assert.ok(r.phaseMatchedMs.every((n,i)=>n>=r.phaseDurations[i]*.9));
 for(const s of m.segments.filter(s=>s.part==='rise'))assert.equal(api.bounds(m,m.segments.indexOf(s),m.start+s.start).target,levels[s.vowelIndex]);
});
test('Breath windows never calibrate, add pitch/loudness credit, or create displayed voice',()=>{
 const m=sing();for(const s of m.segments.filter(s=>s.rest)){const points=m.samples.filter(p=>p.t>=s.start&&p.t<s.end);assert.ok(points.length>0);assert.ok(points.every(p=>p.rms===null&&p.liveRms===null&&p.dt===0));assert.equal(api.bounds(m,m.segments.indexOf(s),s.start),null);assert.equal(api.feedback(m,s.start+40).match,'breath');}
 assert.ok(api.metrics(m).voicedMs<=40000);
});
test('A missing vowel reference is reported and cannot be replaced by another vowel or later loud samples',()=>{
 const m=sing({},p=>p.vowel==='이'&&p.calibrate),r=api.metrics(m);assert.equal(r.calibrated,false);assert.deepEqual(r.missingVowels,['이']);assert.equal(m.baselines[2],null);assert.equal(api.feedback(m,25000).match,'missing');
 assert.ok(m.baselines.filter(Boolean).length===4);
});
test('A flat loudness cannot satisfy the rise and fall for any vowel',()=>{
 const m=api.create({pattern:'vowels'});for(let t=0;t<m.duration;t+=40){const p=api.state(m,t);api.receive(m,t,levels[p.vowelIndex]);}const r=api.metrics(m);assert.ok(r.accuracy<65);assert.ok(m.segments.filter(s=>s.part==='rise').every(s=>r.phaseMatchedMs[m.segments.indexOf(s)]<(s.end-s.start)*.4));
});
test('Each of the 19 timing fields survives routine persistence, supports zero breath, and preserves the actual course duration',()=>{
 const times=api.PATTERNS.vowels.segments.map((s,i)=>s.rest?0:1+(i%3)*.1),store=new Map(),storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 plans.save(storage,{routines:[{steps:[{mode:'dynamicVoice',params:{training:{dynamicPattern:'vowels'}},timing:{customStages:true,stages:times,rounds:2}}]}]});const step=plans.load(storage).routines[0].steps[0];assert.deepEqual(step.timing.stages,times);assert.equal(step.params.training.dynamicPattern,'vowels');assert.equal(step.timing.rounds,2);
 const m=api.create({pattern:'vowels',segmentSeconds:times});assert.equal(m.duration,Math.round(times.reduce((a,b)=>a+b,0)*1000));assert.ok(m.segments.filter(s=>s.rest).every(s=>s.end===s.start));
 for(const t of [0,1000,m.duration-1])assert.equal(api.state(m,t).rest,undefined);
});
test('Preset duration, per-vowel cues and missing voice remain bounded without affecting existing courses',()=>{
 assert.equal(api.create({pattern:'vowels',duration:8000}).duration,30000);assert.equal(api.create({pattern:'vowels',duration:600000}).duration,300000);assert.equal(Object.keys(api.PATTERNS).length,8);
 const m=api.create({pattern:'vowels'});for(let t=0;t<2000;t+=40)api.receive(m,t,.8,{cue:true});assert.equal(m.baselines[0],null);assert.equal(api.metrics(m).voicedMs,0);
 assert.equal(api.create({pattern:'swell'}).duration,12000);
});
