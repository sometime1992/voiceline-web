'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
const chunk=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
function fixture(){
 let clock=100;const events=[],references=[],nodes=new Map();
 const $=id=>{if(!nodes.has(id)){const children=new Map();nodes.set(id,{dataset:{},hidden:true,textContent:'',querySelector(q){if(!children.has(q))children.set(q,{textContent:''});return children.get(q);}});}return nodes.get(id);};
 const app={vibratoRoot:60,vibratoStart:0,vibratoSamples:[]};
 const code=chunk('function vocalPreparationState(','// One source of timing')+
  chunk('function rememberVibratoPoint(','function vibratoStatus(')+
  chunk('function startVibratoSession(','async function stopActivity(')+
  '\n({vocalPreparationState,updateVocalPreparation,startVibratoSession,rememberVibratoPoint,finishVibrato})';
 const api=vm.runInNewContext(code,{app,$,performance:{now:()=>clock},VIBRATO_WINDOW_MS:3000,Math,Number,
  playReference:m=>references.push(m),renderVibratoOverlay(){},addEvent:async(...e)=>events.push(e),notify(){}});
 return {...api,app,$,events,references,clock:t=>clock=t};
}
test('Vibrato discards reference and inhale input, then collects only post-start pitch',()=>{
 const h=fixture();h.startVibratoSession(100);assert.equal(h.app.vibratoStart,4900);assert.deepEqual(h.references,[60]);
 for(let t=100;t<4900;t+=40)h.rememberVibratoPoint(t,60.5);
 assert.equal(h.app.vibratoSamples.length,0);h.rememberVibratoPoint(4900,60);h.rememberVibratoPoint(4940,60.1);
 assert.equal(h.app.vibratoSamples.length,2);assert.equal(h.app.vibratoSamples[0].t,4900);
});
test('Cancelling vibrato during listening or inhale leaves no empty result or delayed restart',async()=>{
 for(const t of [500,3000]){
  const h=fixture();h.startVibratoSession(100);h.clock(t);h.updateVocalPreparation('vibratoPreparation',h.app.vibratoPreparation,t);
  assert.equal(h.$('vibratoPreparation').hidden,false);await h.finishVibrato();
  assert.equal(h.events.length,0);assert.equal(h.app.vibratoStart,0);assert.equal(h.app.vibratoPreparation,null);assert.equal(h.$('vibratoPreparation').hidden,true);
  h.clock(8000);assert.equal(h.app.vibratoStart,0);
 }
});
test('Preparation counter announces phase changes and clears its overlay when singing or stopping',()=>{
 const h=fixture(),s={mode:'sustainVoice',active:true,createdAt:100,breathStart:1900,start:4900};
 h.updateVocalPreparation('trainingPreparation',s,1900);const el=h.$('trainingPreparation');
 assert.equal(el.dataset.phase,'inhale');assert.equal(el.querySelector('[data-prep-count]').textContent,'3');
 const announcement=el.querySelector('[data-prep-announcement]').textContent;
 h.updateVocalPreparation('trainingPreparation',s,2900);assert.equal(el.querySelector('[data-prep-count]').textContent,'2');
 assert.equal(el.querySelector('[data-prep-announcement]').textContent,announcement);
 h.updateVocalPreparation('trainingPreparation',s,4900);assert.equal(el.querySelector('[data-prep-count]').textContent,'시작!');
 h.updateVocalPreparation('trainingPreparation',s,5700);assert.equal(el.hidden,true);assert.equal(el.dataset.phase,'idle');
 s.active=false;h.updateVocalPreparation('trainingPreparation',s,2000);assert.equal(el.hidden,true);
});
