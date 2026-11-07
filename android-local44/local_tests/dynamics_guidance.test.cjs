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
  '\n({dynamicGuideState,updateDynamicGuide,newTrainingSession,trainingPhase,receiveTrainingSample,trainingEvaluation,scheduleTrainingCues,cancelTrainingCues,updateTraining,vocalPreparationState,trainingDuration,dynamicSeconds})';
 const api=vm.runInNewContext(code,context),session=api.newTrainingSession('dynamicVoice',0,app.trainingSettings);app.training=session;
 return {...api,app,session,audio,sources,gains,events,$,steps,references,context,clock:t=>clock=t,gate:p=>gate=p};
}
test('Local46 dynamics guide follows exactly the four three-second scoring phases',()=>{
 const h=fixture(),s=h.session;
 for(const [elapsed,key,seconds,phase] of [[0,'soft',3,'작게'],[2999,'soft',1,'작게'],[3000,'medium',3,'조금 크게'],[5999,'medium',1,'조금 크게'],[6000,'strong',3,'가장 크게'],[8999,'strong',1,'가장 크게'],[9000,'softAgain',3,'다시 작게'],[11999,'softAgain',1,'다시 작게']]){
  const state=h.dynamicGuideState(s,s.start+elapsed);assert.equal(state.key,key);assert.equal(state.seconds,seconds+'초');assert.equal(h.trainingPhase(s,elapsed),phase);
 }
 assert.equal(h.dynamicGuideState(s,0).key,'reference');assert.equal(h.dynamicGuideState(s,s.start+12000).key,'done');
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
  assert.ok(Math.abs(source.startAt-(h.session.start/1000+index*3))<1e-10);
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
 const h=fixture();h.scheduleTrainingCues(h.session);h.clock(h.session.start+4700);h.audio.state='suspended';h.events.get('statechange')();
 h.audio.state='running';h.audio.currentTime=(h.session.start+4700)/1000;h.events.get('statechange')();
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
 assert.ok(h.session.history.some(p=>p.cue&&p.midi===60&&p.rms===.8),'live cue-time voice must not be blanked');
 assert.ok(h.session.dynamicModel.samples.some(p=>p.cue&&p.liveRms===.8&&p.rms===null&&p.dt===0),'cue-time input is visible but never graded');
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
 assert.equal(h.trainingEvaluation(h.session,true).status,'미달성');assert.match(h.trainingEvaluation(h.session,true).reason,/단계별 목표 부족/);assert.match(h.trainingEvaluation(h.session,true).reason,/3구간 .*0% \/ 최소 25%/);
});
test('No initial reference fails with a clear reason even if the last three stages have valid voice',()=>{
 const h=fixture();for(let i=30;i<120;i++)h.receiveTrainingSample(h.session.start+i*100,60,[.0042,.008,.014,.0042][Math.floor(i/30)]);
 assert.equal(h.trainingEvaluation(h.session,true).status,'미달성');assert.match(h.trainingEvaluation(h.session,true).reason,/약 단계 기준 부족/);
});
test('All seven methods and five lengths succeed with the actual contour, phase lengths and scheduled cue exclusions',()=>{
 const level=(id,t)=>{
  if(t<3000)return 0;
  if(id==='steps')return [0,1,2,0][Math.min(3,Math.floor(t/3000))];
  if(id==='crescendo')return 2*(t-3000)/9000;
  if(id==='decrescendo')return t<5000?2:2*(12000-t)/7000;
  if(id==='swell')return t<7500?2*(t-3000)/4500:2*(12000-t)/4500;
  if(id==='alternating')return t<5000?2:t<7000?0:t<9000?2:0;
  if(id==='steady')return 1;
  return t<4500?2:t<7500?0:t<9000?2:0;
 };
 for(const seconds of [8,12,16,20,24])for(const id of Object.keys(dynamics.PATTERNS).filter(id=>id!=='vowels')){
  const h=fixture(),s=h.newTrainingSession('dynamicVoice',0,{...h.app.trainingSettings,dynamicPattern:id,dynamicSeconds:seconds});h.app.training=s;h.scheduleTrainingCues(s);
  assert.equal(h.sources.length,s.dynamicModel.segments.length,id+' cue count');
  for(let t=0;t<s.duration;t+=40){const canonical=t<3000?t:3000+(t-3000)*9000/(s.duration-3000);h.receiveTrainingSample(s.start+t,60,.0042*Math.pow(1.8,level(id,canonical)));}
  assert.equal(h.trainingEvaluation(s,true).status,'성공',id+' '+seconds);
  assert.equal(h.trainingEvaluation(s,false).status,'중단',id);
 }
});
test('Listening and a full 3-2-1 inhale precede dynamics and sustain, excluding all preparation voice',()=>{
 const h=fixture();
 for(const mode of ['dynamicVoice','sustainVoice']){
  const s=h.newTrainingSession(mode,100,h.app.trainingSettings);h.app.training=s;
  assert.equal(s.start,4900);assert.equal(h.vocalPreparationState(s,100).key,'reference');
  for(const [t,n]of [[1900,3],[2900,2],[3900,1]]){const p=h.vocalPreparationState(s,t);assert.equal(p.key,'inhale');assert.equal(p.seconds,n);}
  for(let t=100;t<s.start;t+=40)h.receiveTrainingSample(t,60,.9);
  assert.equal(s.valid,0);assert.equal(s.voicedMs,0);assert.equal(s.history.length,0);
  if(s.dynamicModel)assert.equal(s.dynamicModel.baseline,null);
  assert.equal(h.vocalPreparationState(s,s.start).key,'begin');assert.equal(h.vocalPreparationState(s,s.start+800),null);
 }
});
test('Every ear note has an ungraded inhale without revealing its target before the response',()=>{
 const h=fixture(),s=h.newTrainingSession('earVoice',0,h.app.trainingSettings);h.app.training=s;
 assert.equal(s.duration,s.earNotes.length*7700);
 for(let i=0;i<s.earNotes.length;i++){
  const start=s.start+i*7700;assert.equal(h.trainingPhase(s,i*7700+1499),'listen');
  for(const [offset,count]of [[1500,3],[2500,2],[3500,1]]){
   h.updateTraining(start+offset);assert.equal(s.target,null);
   assert.equal(h.vocalPreparationState(s,start+offset).seconds,count);
   h.receiveTrainingSample(start+offset,s.earNotes[i],.9);
  }
  assert.equal(s.valid,i*2);h.updateTraining(start+4500);assert.equal(s.target,s.earNotes[i]);
  h.receiveTrainingSample(start+4540,s.earNotes[i],.05);h.receiveTrainingSample(start+4620,s.earNotes[i],.05);
 }
 assert.equal(s.valid,s.earNotes.length*2);assert.equal(s.answerVoicedMs,s.earNotes.length*80);
});
test('Custom durations restore and an active session keeps its captured length',()=>{
 const h=fixture();for(const value of [null,0,NaN,Infinity,'bad'])assert.equal(h.dynamicSeconds({dynamicSeconds:value}),12);
 assert.equal(h.dynamicSeconds({dynamicSeconds:9.5}),9.5);
 const s=h.newTrainingSession('dynamicVoice',0,{...h.app.trainingSettings,dynamicSeconds:24});
 h.app.trainingSettings.dynamicSeconds=8;assert.equal(s.duration,24000);assert.equal(s.dynamicModel.duration,24000);
});
test('A constant soft voice cannot complete any method and a selected course remains fixed during a session',()=>{
 for(const id of Object.keys(dynamics.PATTERNS).filter(id=>id!=='vowels')){
  const h=fixture(),s=h.newTrainingSession('dynamicVoice',0,{...h.app.trainingSettings,dynamicPattern:id});h.app.training=s;
  h.app.trainingSettings.dynamicPattern='steady';
  for(let t=0;t<12000;t+=40)h.receiveTrainingSample(s.start+t,60,.0042);
  assert.equal(s.dynamicModel.patternId,id);assert.equal(h.trainingEvaluation(s,true).status,'미달성',id);
 }
});

test('Guidance preserves real input at every transition but cannot turn a cue into pitch or loudness credit',()=>{
 const h=fixture();h.scheduleTrainingCues(h.session);const s=h.session;
 for(let elapsed=0;elapsed<12000;elapsed+=40){
  const t=s.start+elapsed,cue=s.dynamicCueWindows.some(c=>t>=c.start&&t<c.end);
  h.receiveTrainingSample(t,60,cue?.5:[.0042,.008,.014,.0042][Math.floor(elapsed/3000)]);
  const p=s.history.at(-1);assert.equal(p.midi,60);assert.ok(p.rms>0);
  if(cue){assert.equal(s.dynamicModel.samples.at(-1).rms,null);assert.equal(s.dynamicModel.samples.at(-1).dt,0);}
 }
 assert.equal(h.trainingEvaluation(s,true).status,'성공');
 // An actual missing microphone detection must remain missing, including cues.
 const t=s.start+9000;const other=fixture();other.scheduleTrainingCues(other.session);other.receiveTrainingSample(other.session.start,null,.5);
 assert.equal(other.session.history.at(-1).midi,null);assert.equal(other.session.dynamicModel.samples.at(-1).liveRms,null);assert.equal(other.session.valid,0);
});

test('Vowel sessions expose each breath countdown, keep one input session and grade the five independent contours',()=>{
 const h=fixture(),s=h.newTrainingSession('dynamicVoice',0,{...h.app.trainingSettings,dynamicPattern:'vowels',dynamicSeconds:52});h.app.training=s;h.scheduleTrainingCues(s);
 assert.equal(s.duration,52000);assert.equal(h.sources.length,9,'only vowel starts and breath transitions sound cues');
 const levels=[.0042,.0063,.0036,.0054,.0048];
 for(let t=0;t<52000;t+=40){const p=dynamics.state(s.dynamicModel,s.start+t);h.receiveTrainingSample(s.start+t,p.rest?88:60,p.rest?.9:levels[p.vowelIndex]*Math.pow(1.8,p.level));}
 assert.equal(h.trainingEvaluation(s,true).status,'성공');assert.equal(s.active,true);
 for(const stage of s.dynamicModel.segments.filter(p=>p.rest)){for(const [offset,n]of [[0,3],[1000,2],[2000,1]]){const p=h.vocalPreparationState(s,s.start+stage.start+offset);assert.equal(p.key,'inhale');assert.equal(p.seconds,n);assert.match(p.hint,new RegExp(stage.nextVowel));}}
 assert.deepEqual(s.dynamicModel.baselines,levels);assert.ok(s.voicedMs<=40000);
});
