'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const js=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
const from=js.indexOf('const WARMUP_CYCLE_MS='),to=js.indexOf('function restoreTrainingSettings(){',from);
const source=js.slice(from,to)+'\n({warmupPhaseAt,warmupGuideState,updateWarmupGuide,scheduleWarmupCues,cancelWarmupCues})';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(rounds=2){
 const sources=[],events=new Map(),nodes=new Map();let clock=0,unlock;
 const app={mode:'warmupVoice',backgrounded:false},document={hidden:false};
 const session={mode:'warmupVoice',active:true,start:1800,duration:rounds*19000,rounds};app.training=session;
 const steps=Array.from({length:4},()=>({attrs:{},active:false,setAttribute(k,v){this.attrs[k]=v},classList:{toggle(name,on){}}}));
 const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:true,dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v},querySelectorAll(){return steps}});return nodes.get(id)};
 const context={state:'running',currentTime:0,destination:{},resume:()=>unlock||Promise.resolve(),
  addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),
  createOscillator(){const o={type:'',frequency:{setValueAtTime(hz){o.hz=hz}},connect(){},disconnect(){},start(t){o.startAt=t},stop(t){o.stopAt=t;o.cancelled=t===undefined}};sources.push(o);return o},
  createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}})};
 const api=vm.runInNewContext(source,{app,document,$,Set,Math,Number,Object,console,ensureSynth:()=>context,performance:{now:()=>clock}});
 return {app,document,session,context,sources,events,$,steps,...api,clock:t=>clock=t,gate:p=>unlock=p};
}
test('Local35 warmup shows the exact inhale, exhale, hum and rest boundaries in every set',()=>{
 const h=fixture(3),s=h.session;
 for(let round=0;round<3;round++){
  const offset=s.start+round*19000;
  for(const [ms,key,seconds] of [[0,'inhale',4],[3999,'inhale',1],[4000,'exhale',6],[9999,'exhale',1],[10000,'hum',6],[15999,'hum',1],[16000,'rest',3],[18999,'rest',1]]){
   const state=h.warmupGuideState(s,offset+ms);assert.equal(state.key,key);assert.equal(state.seconds,seconds);assert.ok(state.seconds>0);
  }
 }
 assert.equal(h.warmupGuideState(s,0).key,'ready');assert.equal(h.warmupGuideState(s,1800+57000).key,'done');
});
test('Local35 warmup previews when humming is next and marks start and stop clearly',()=>{
 const h=fixture(1),s=h.session;
 assert.match(h.warmupGuideState(s,s.start+7000).next,/다음: 허밍 · 3초 후/);
 h.updateWarmupGuide(s,s.start+10000);assert.equal(h.$('warmupGuide').hidden,false);assert.equal(h.$('warmupGuide').attrs['data-phase'],'hum');assert.match(h.$('warmupPhaseTitle').textContent,/지금 허밍/);assert.equal(h.$('warmupSeconds').textContent,'6');assert.match(h.$('warmupPhaseHint').textContent,/음~/);
 assert.equal(h.steps[2].attrs['aria-current'],'step');assert.equal(h.steps[1].attrs['aria-current'],'false');
 h.updateWarmupGuide(s,s.start+16000);assert.match(h.$('warmupPhaseTitle').textContent,/허밍을 멈추고 쉬세요/);assert.equal(h.$('warmupSeconds').textContent,'3');
});
test('Local35 warmup queues a distinct double cue for humming at the same timeline as the visual guide',()=>{
 const h=fixture();h.scheduleWarmupCues(h.session);h.scheduleWarmupCues(h.session);
 assert.equal(h.sources.length,10,'one cue per stage and two for humming in each set');
 const hum=h.sources.filter(o=>o.hz===660||o.hz===880);assert.equal(hum.length,4);
 for(const [i,round] of [0,1].entries()){
  assert.ok(Math.abs(hum[i*2].startAt-(11.8+round*19))<1e-10);assert.ok(Math.abs(hum[i*2+1].startAt-hum[i*2].startAt-.18)<1e-10);
 }
 assert.equal(h.warmupGuideState(h.session,hum[0].startAt*1000).key,'hum');
 assert.equal(h.sources.filter(o=>o.hz===330)[0].startAt,17.8);
});
test('Local35 stopping warmup cancels all remaining cues and detaches its audio listener',()=>{
 const h=fixture();h.scheduleWarmupCues(h.session);assert.equal(h.events.size,1);
 h.session.active=false;h.app.training=null;h.cancelWarmupCues(h.session);
 assert.ok(h.sources.every(o=>o.cancelled));assert.equal(h.session.warmupCueNodes.size,0);assert.equal(h.events.size,0);
});
test('Local35 a late audio unlock cannot play warmup cues after cancellation',async()=>{
 const h=fixture();let release;h.context.state='suspended';h.gate(new Promise(resolve=>release=resolve));h.scheduleWarmupCues(h.session);assert.equal(h.sources.length,0);
 h.session.active=false;h.app.training=null;h.cancelWarmupCues(h.session);h.context.state='running';release();await turn();assert.equal(h.sources.length,0);assert.equal(h.events.size,0);
});
test('Local35 interrupted audio discards elapsed warmup cues when it resumes',()=>{
 const h=fixture(1);h.scheduleWarmupCues(h.session);const before=h.sources.length;
 h.context.state='suspended';h.events.get('statechange')();assert.ok(h.sources.every(o=>o.cancelled));
 h.clock(14000);h.context.currentTime=14;h.context.state='running';h.events.get('statechange')();
 const after=h.sources.slice(before);assert.equal(after.length,1);assert.equal(after[0].hz,330);assert.ok(Math.abs(after[0].startAt-17.8)<1e-9);
});
