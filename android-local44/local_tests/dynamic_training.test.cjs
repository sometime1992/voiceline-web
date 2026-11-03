'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const api=require('../app/src/main/assets/www/dynamic-training.js');
function expectedLevel(id,t){
 if(t<3000)return 0;
 if(id==='steps')return [0,1,2,0][Math.min(3,Math.floor(t/3000))];
 if(id==='crescendo')return 2*(t-3000)/9000;
 if(id==='decrescendo')return t<5000?2:2*(12000-t)/7000;
 if(id==='swell')return t<7500?2*(t-3000)/4500:2*(12000-t)/4500;
 if(id==='alternating')return t<5000?2:t<7000?0:t<9000?2:0;
 if(id==='steady')return 1;
 if(id==='accents')return t<4500?2:t<7500?0:t<9000?2:0;
 throw Error(id);
}
function sing({base=.0042,ratios=[1,1.8,3.24,1],omit=()=>false,cue=()=>false}={}){
 const model=api.create();
 for(let t=0;t<12000;t+=40){const phase=Math.floor(t/3000);api.receive(model,t,base*ratios[phase],{voiced:!omit(t,phase),onPitch:!omit(t,phase),cue:cue(t,phase)});}
 return model;
}
test('Weak-phase calibration is personal, robust to a brief loud outlier, and fixed after three seconds',()=>{
 const m=api.create();
 for(let t=0;t<3000;t+=40)api.receive(m,t,t===400?.4:.0042);
 assert.ok(Math.abs(m.baseline-.0042)<1e-12);
 api.receive(m,3000,.4);assert.equal(m.locked,true);const baseline=m.baseline;
 for(let t=3040;t<12000;t+=40)api.receive(m,t,.2);assert.equal(m.baseline,baseline);
 assert.deepEqual(api.bounds(m,1),{target:baseline*1.8,low:baseline*1.8/1.25,high:baseline*1.8*1.25});
});
test('The same four-stage pattern scores equally at quiet, ordinary and louder input levels',()=>{
 for(const base of [.0008,.0042,.07]){
  const m=sing({base}),stats=api.metrics(m);
  assert.equal(stats.calibrated,true);assert.equal(stats.accuracy,100);assert.ok(stats.phaseMatchedMs.every(ms=>ms>=2800));
  assert.equal(m.samples.length,300);assert.ok(m.samples[0].t<100&&m.samples.at(-1).t>11900);
 }
});
test('Constant loudness cannot satisfy the middle/strong target and each stage has separate coverage',()=>{
 const m=sing({ratios:[1,1,1,1]}),stats=api.metrics(m);
 assert.ok(stats.accuracy<65);assert.equal(stats.phaseMatchedMs[1],0);assert.equal(stats.phaseMatchedMs[2],0);
 const missed=api.metrics(sing({ratios:[1,1.8,2.2,1]}));
 assert.ok(missed.accuracy>=65);assert.equal(missed.phaseMatchedMs[2],0,'overall average must not hide a missed strong phase');
});
test('Later loud sounds never invent a missing initial reference or recalibrate the guide',()=>{
 const m=sing({omit:(_,phase)=>phase===0});
 assert.equal(m.baseline,null);assert.equal(api.metrics(m).calibrated,false);assert.equal(api.metrics(m).accuracy,null);
 assert.match(api.feedback(m,6500).text,/약 단계.*부족/);
});
test('Cue playback, wrong notes, silence and detector gaps do not establish a reference or count as matched voice',()=>{
 const m=api.create();for(let t=0;t<900;t+=40)api.receive(m,t,.5,{cue:true});
 for(let t=900;t<1800;t+=40)api.receive(m,t,.5,{onPitch:false});
 assert.equal(m.baseline,null);assert.equal(api.metrics(m).matchedMs,0);
 for(let t=1800;t<3000;t+=40)api.receive(m,t,.0042);
 assert.equal(m.baseline,.0042);assert.ok(m.referenceMs<1300);
 api.receive(m,6000,.0042*3.24);assert.equal(m.samples.at(-1).dt,0);
 api.receive(m,6040,.0042*3.24,{voiced:false});api.receive(m,6080,.0042*3.24);
 assert.equal(m.samples.at(-1).dt,0);assert.equal(api.feedback(m,6500).match,'waiting');
});
test('Feedback uses the visible target band, excludes wrong pitch and never reuses stale samples',()=>{
 const m=api.create();for(let t=0;t<3000;t+=40)api.receive(m,t,.0042);
 for(const [t,rms,expected]of [[3100,.0042,'low'],[3200,.0042*1.8,'near'],[3300,.02,'high']]){
  api.receive(m,t,rms);assert.equal(api.feedback(m,t).match,expected);
 }
 api.receive(m,3400,.0042*1.8,{onPitch:false});assert.equal(api.feedback(m,3400).match,'pitch');
 api.receive(m,3500,.0042*1.8,{cue:true});assert.equal(api.feedback(m,3500).match,'cue');assert.equal(m.samples.at(-1).liveRms,.0042*1.8);assert.equal(m.samples.at(-1).rms,null);
 assert.equal(api.feedback(m,4000).match,'waiting');
});
test('Out-of-order and invalid times cannot change calibration or exceed the complete-session point bound',()=>{
 const m=api.create();for(let t=0;t<12000;t++)api.receive(m,t,.0042);
 const count=m.samples.length,last=m.lastAt;assert.ok(count<=546);
 for(const t of [NaN,Infinity,-10,50,12000,20000])api.receive(m,t,.4);
 assert.equal(m.samples.length,count);assert.equal(m.lastAt,last);
});
test('The graph shows all twelve seconds, the same personal target and a bounded current-time line without changing data',()=>{
 const m=sing(),text=[],strokes=[],lines=[];
 const ctx={setTransform(){},clearRect(){},fillRect(){},beginPath(){},closePath(){},moveTo(x,y){lines.push([x,y]);},lineTo(x,y){lines.push([x,y]);},stroke(){strokes.push(this.strokeStyle);},fillText(s){text.push(s);},save(){},rect(){},clip(){},restore(){},arc(){},fill(){}};
 const canvas={width:0,height:0,getBoundingClientRect:()=>({width:360,height:180}),getContext:()=>ctx};
 const snapshot=JSON.stringify(m),view=api.draw(canvas,m,12000,{dpr:3});
 assert.equal(canvas.width,720);assert.equal(canvas.height,360);assert.equal(view.cursor,352);assert.equal(view.points,300);
 for(const label of ['0초','3초','6초','9초','12초','약','중','강'])assert.ok(text.includes(label),label);
 assert.ok(strokes.includes('#69ecd0'));assert.ok(strokes.includes('#d4a6ff'));assert.ok(strokes.includes('#ffd67f'));
 assert.ok(lines.every(p=>p.every(Number.isFinite)));assert.equal(JSON.stringify(m),snapshot);
 canvas.getBoundingClientRect=()=>({width:300,height:42});
 assert.ok(api.draw(canvas,m,12000),'short landscape canvas must still draw its target and voice');
 canvas.getBoundingClientRect=()=>({width:0,height:0});assert.equal(api.draw(canvas,m,12000),null);
});
test('Seven distinct methods preserve an initial reference and exact complete-session duration',()=>{
 assert.equal(Object.keys(api.PATTERNS).filter(id=>id!=='vowels').length,7);
 const signatures=new Set();
 for(const id of Object.keys(api.PATTERNS).filter(id=>id!=='vowels')){
  const m=api.create({pattern:id});assert.equal(m.patternId,id);assert.equal(m.segments[0].start,0);assert.equal(m.segments[0].end,3000);assert.equal(m.segments.at(-1).end,12000);
  for(let i=1;i<m.segments.length;i++)assert.equal(m.segments[i].start,m.segments[i-1].end);
  signatures.add(JSON.stringify(m.segments.map(s=>[s.start,s.end,s.from,s.to])));
 }
 assert.equal(signatures.size,7);
 for(const bad of ['__proto__','constructor','missing',null,undefined])assert.equal(api.create({pattern:bad}).patternId,'steps');
});
test('Every method grades its own time-varying targets accurately without changing the initial reference',()=>{
 for(const id of Object.keys(api.PATTERNS).filter(id=>id!=='vowels')){
  const m=api.create({pattern:id});
  for(let t=0;t<12000;t+=40)api.receive(m,t,.0042*Math.pow(1.8,expectedLevel(id,t)));
  const stats=api.metrics(m);assert.equal(stats.accuracy,100,id);assert.equal(m.baseline,.0042,id);assert.equal(m.locked,true);
  assert.equal(stats.phaseMatchedMs.length,m.segments.length);assert.ok(stats.phaseMatchedMs.every((ms,i)=>ms>=stats.phaseDurations[i]*.8),id);
 }
});
test('Five exercise lengths retain three seconds of calibration and every detector point until the end',()=>{
 for(const duration of [8000,12000,16000,20000,24000])for(const id of Object.keys(api.PATTERNS).filter(id=>id!=='vowels')){
  const m=api.create({pattern:id,duration});assert.equal(m.segments[0].end,3000);
  assert.ok(Math.abs(m.segments.at(-1).end-duration)<1e-8);
  for(let t=0;t<duration;t+=22){
   const canonical=t<3000?t:3000+(t-3000)*9000/(duration-3000);
   api.receive(m,t,.0042*Math.pow(1.8,expectedLevel(id,canonical)));
  }
  const stats=api.metrics(m);assert.equal(stats.accuracy,100,id+' '+duration);
  assert.equal(m.baseline,.0042);assert.ok(m.samples[0].t<22);assert.ok(m.samples.at(-1).t>duration-23);
  assert.ok(stats.voicedMs>duration*.98);assert.ok(stats.phaseMatchedMs.every((ms,i)=>ms>stats.phaseDurations[i]*.95));
  assert.equal(api.feedback(m,2999).match,'calibrating');assert.notEqual(api.feedback(m,3000).match,'calibrating');
 }
});
test('Crescendo, decrescendo and swell move continuously while alternating and accent methods retain their boundaries',()=>{
 for(const [id,t,level]of [['crescendo',7500,1],['decrescendo',8500,1],['swell',5250,1],['swell',9750,1]]){
  const m=api.create({pattern:id}),p=api.state(m,t);assert.ok(Math.abs(p.level-level)<1e-12,id);
  assert.ok(Math.abs(api.state(m,t+1).level-p.level)<.001,id);
 }
 for(const [id,t]of [['alternating',5000],['accents',4500]]){const m=api.create({pattern:id});assert.equal(api.state(m,t-1).level,2);assert.equal(api.state(m,t).level,0);}
});

test('Cue-time live measurements survive in the graph data while calibration, coverage and scoring stay excluded',()=>{
 const m=api.create();for(let t=0;t<3000;t+=40)api.receive(m,t,.0042);
 const baseline=m.baseline,before=api.metrics(m).voicedMs;
 for(let t=3000;t<3360;t+=40)api.receive(m,t,.1,{cue:true});
 assert.equal(m.baseline,baseline);assert.equal(api.metrics(m).voicedMs,before);assert.match(api.feedback(m,3320).text,/감지 중.*채점 제외/);
 assert.ok(m.samples.slice(-9).every(p=>p.liveRms===.1&&p.rms===null&&p.dt===0));
 api.receive(m,3360,.0042*1.8);assert.equal(m.samples.at(-1).dt,0,'do not bridge an excluded interval into graded coverage');
 api.receive(m,3400,.0042*1.8);assert.equal(m.samples.at(-1).dt,40);
 api.receive(m,3440,0,{voiced:false});assert.equal(m.samples.at(-1).liveRms,null);assert.equal(api.feedback(m,3440).match,'waiting');
});
