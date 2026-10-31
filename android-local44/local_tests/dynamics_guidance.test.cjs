'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
const chunk=(a,b)=>{const from=source.indexOf(a),to=source.indexOf(b,from);assert.ok(from>=0&&to>from,a);return source.slice(from,to);};
const policies=vm.runInNewContext(chunk('const PITCH_RANGE=','const MODES=')+'\n({PITCH_RANGE,SCORE_RULES})');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const dynamics=require('../app/src/main/assets/www/dynamic-training.js');
function fixture(cues=true){
 let clock=0,gate=null;const sources=[],gains=[],events=new Map(),nodes=new Map(),references=[];
 const app={mode:'dynamicVoice',backgrounded:false,base:48,keyboardNotes:24,trainingSettings:{root:60,sustainSeconds:8,earCount:4,rounds:2,dynamicCues:cues}};
 const steps=Array.from({length:4},()=>({active:false,attrs:{},classList:{toggle(_,on){this.owner.active=on;},owner:null},setAttribute(k,v){this.attrs[k]=v;}}));
 for(const step of steps)step.classList.owner=step;
 const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,dataset:{},setAttribute(k,v){this[k]=v;},querySelectorAll:()=>steps});return nodes.get(id);};
 const audio={state:'running',currentTime:0,destination:{},resume:()=>gate||Promise.resolve(),addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k),
  createOscillator(){const o={frequency:{setValueAtTime(hz){o.hz=hz;}},connect(){},disconnect(){},start(t){o.startAt=t;},stop(t){o.cancelled=t===undefined;o.stopAt=t;}};sources.push(o);return o;},
  createGain(){const g={gain:{setValueAtTime(){},linearRampToValueAtTime(v){g.peak=v;},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};gains.push(g);return g;}};
 const context={...policies,app,$,document:{hidden:false},window:{VoiceLineDynamics:dynamics},Math,Number,Array,Set,Object,Map,console,
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),ensureSynth:()=>audio,performance:{now:()=>clock},
  renderTrainingOverlay(){},setMessage(){},progress(){},syncKeyColors(){},drawKeys(){},playReference:m=>references.push(m),noteLabel:m=>String(m)};
 const code=chunk('const TRAINING_MODES=new Set(','function startTraining(t){')+
  chunk('function receiveTrainingSample(t,midi,rms){','function showTrainingResult(')+
  '\n({dynamicGuideState,updateDynamicGuide,newTrainingSession,trainingPhase,receiveTrainingSample,trainingEvaluation,scheduleTrainingCues,cancelTrainingCues,updateTraining})';
 const api=vm.runInNewContext(code,context),session=api.newTrainingSession('dynamicVoice',0,app.trainingSettings);app.training=session;
 return {...api,app,session,audio,sources,gains,events,$,steps,references,context,clock:t=>clock=t,gate:p=>gate=p};
}
test('Local46 dynamics guide follows exactly the four three-second scoring phases',()=>{
 const h=fixture(),s=h.session;
 for(const [elapsed,key,seconds,phase] of [[0,'soft',3,'작게'],[2999,'soft',1,'작게'],[3000,'medium',3,'조금 크게'],[5999,'medium',1,'조금 크게'],[6000,'strong',3,'가장 크게'],[8999,'strong',1,'가장 크게'],[9000,'softAgain',3,'다시 작게'],[11999,'softAgain',1,'다시 작게']]){
  const state=h.dynamicGuideState(s,s.start+elapsed);assert.equal(state.key,key);assert.equal(state.seconds,seconds+'초');assert.equal(h.trainingPhase(s,elapsed),phase);
 }
 assert.equal(h.dynamicGuideState(s,0).key,'ready');assert.equal(h.dynamicGuideState(s,s.start+12000).key,'done');
});
test('Local46 dynamics cards show current stage, countdown and next stage without repeating announcements each second',()=>{
 const h=fixture(),s=h.session;h.updateDynamicGuide(s,s.start+3000);
 assert.equal(h.$('dynamicCurrent').textContent,'중간 세기');assert.equal(h.$('dynamicCount').textContent,'3초');assert.match(h.$('dynamicNext').textContent,/강하게 · 3초 뒤/);
 assert.equal(h.$('trainingMetricLabel1').textContent,'목표 범위 일치');assert.equal(h.$('trainingMetric3').textContent,'기준 부족');
 assert.equal(h.steps[1].active,true);assert.equal(h.steps.filter(s=>s.active).length,1);
 const announced=h.$('dynamicAnnouncement').textContent;h.updateDynamicGuide(s,s.start+4000);
 assert.equal(h.$('dynamicCount').textContent,'2초');assert.equal(h.$('dynamicAnnouncement').textContent,announced);
});
test('Local46 dynamics queues one short cue at each displayed phase boundary',()=>{
 const h=fixture();h.scheduleTrainingCues(h.session);h.scheduleTrainingCues(h.session);
 assert.equal(h.sources.length,4);assert.deepEqual(h.sources.map(o=>o.hz),[440,660,880,440]);
 for(const [index,source]of h.sources.entries()){
  assert.ok(Math.abs(source.startAt-(1.8+index*3))<1e-10);
  assert.equal(h.dynamicGuideState(h.session,source.startAt*1000).step,index);
 }
 assert.equal(h.session.dynamicCueWindows.length,4);
});
test('Local46 disabling dynamics cues leaves visual guidance available and never starts cue audio',()=>{
 const h=fixture(false);h.context.ensureSynth=()=>{throw Error('muted guide opened audio');};h.scheduleTrainingCues(h.session);
 assert.equal(h.sources.length,0);assert.equal(h.events.size,0);assert.equal(h.dynamicGuideState(h.session,h.session.start).key,'soft');
});
test('Local46 stopping dynamics cancels queued cues and a late audio unlock cannot restart them',async()=>{
 const h=fixture();h.audio.state='suspended';let release;h.gate(new Promise(resolve=>release=resolve));h.scheduleTrainingCues(h.session);
 h.session.active=false;h.app.training=null;h.cancelTrainingCues(h.session);h.audio.state='running';release();await turn();assert.equal(h.sources.length,0);assert.equal(h.events.size,0);
 const running=fixture();running.scheduleTrainingCues(running.session);running.cancelTrainingCues(running.session);
 assert.ok(running.sources.every(o=>o.cancelled));assert.equal(running.session.dynamicCueWindows.length,0);
});
test('Local46 resumed guidance does not replay dynamics transitions that already passed',()=>{
 const h=fixture();h.scheduleTrainingCues(h.session);h.clock(6500);h.audio.state='suspended';h.events.get('statechange')();
 h.audio.state='running';h.audio.currentTime=6.5;h.events.get('statechange')();
 assert.deepEqual(h.sources.slice(4).map(o=>o.hz),[880,440]);
});
test('Local46 cue sound is excluded from scoring and quiet valid dynamics still succeed',()=>{
 const h=fixture();h.scheduleTrainingCues(h.session);const levels=[.0042,.008,.014,.0042];
 for(let i=0;i<120;i++){
  const t=h.session.start+i*100,masked=h.session.dynamicCueWindows.some(c=>t>=c.start&&t<c.end);
  h.receiveTrainingSample(t,60,masked?.8:levels[Math.floor(i/30)]);
 }
 assert.equal(h.trainingEvaluation(h.session,true).status,'성공');
 for(const [key,value]of Object.entries({'작게':.0042,'조금 크게':.008,'가장 크게':.014,'다시 작게':.0042}))assert.ok(Math.abs(h.session.phaseLevels[key]/h.session.phaseCounts[key]-value)<1e-10);
 assert.ok(h.session.history.some(p=>p.rms===null&&p.midi===null));
});
test('Local46 reference pitch plays during preparation and does not overlap the first dynamics phase',()=>{
 const h=fixture();for(const t of [0,100,1799,1800,4800,7800,10800])h.updateTraining(t);
 assert.deepEqual(h.references,[60]);
});
test('Clearer cues have an independent selected volume, longer envelope and a complete scoring exclusion',()=>{
 for(const volume of [45,70,100]){
  const h=fixture();h.session.dynamicCueVolume=volume;h.app.pianoVolume=0;h.scheduleTrainingCues(h.session);
  assert.equal(h.sources.length,4);assert.ok(h.sources.every(o=>o.type==='triangle'));
  assert.ok(h.gains.every(g=>Math.abs(g.peak-.1*volume/100)<1e-12));
  assert.ok(h.sources.every(o=>Math.abs(o.stopAt-o.startAt-.15)<1e-12));
  assert.ok(h.session.dynamicCueWindows.every(w=>w.end-w.start>=369));
 }
 const muted=fixture();muted.session.dynamicCueVolume=0;muted.scheduleTrainingCues(muted.session);assert.equal(muted.sources.length,0);
});
test('The final result rejects a wholly missed strong target despite a sufficient total match percentage',()=>{
 const h=fixture(),ratios=[1,1.8,2.2,1];
 for(let i=0;i<120;i++)h.receiveTrainingSample(h.session.start+i*100,60,.0042*ratios[Math.floor(i/30)]);
 const stats=dynamics.metrics(h.session.dynamicModel);assert.ok(stats.accuracy>=65);assert.equal(stats.phaseMatchedMs[2],0);
 assert.equal(h.trainingEvaluation(h.session,true).status,'미달성');assert.match(h.trainingEvaluation(h.session,true).reason,/단계별 목표 부족/);
});
test('No initial reference fails with a clear reason even if the last three stages have valid voice',()=>{
 const h=fixture();for(let i=30;i<120;i++)h.receiveTrainingSample(h.session.start+i*100,60,[.0042,.008,.014,.0042][Math.floor(i/30)]);
 assert.equal(h.trainingEvaluation(h.session,true).status,'미달성');assert.match(h.trainingEvaluation(h.session,true).reason,/약 단계 기준 부족/);
});
