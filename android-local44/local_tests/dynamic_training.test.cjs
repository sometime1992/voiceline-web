'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const api=require('../app/src/main/assets/www/dynamic-training.js');
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
 api.receive(m,3500,.0042*1.8,{cue:true});assert.equal(api.feedback(m,3500).match,'waiting');
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
 const ctx={setTransform(){},clearRect(){},fillRect(){},beginPath(){},moveTo(x,y){lines.push([x,y]);},lineTo(x,y){lines.push([x,y]);},stroke(){strokes.push(this.strokeStyle);},fillText(s){text.push(s);},save(){},rect(){},clip(){},restore(){},arc(){},fill(){}};
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
