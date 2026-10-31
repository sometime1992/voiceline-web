'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const guide=require('../app/src/main/assets/www/guide-training.js');
const fs=require('node:fs'),path=require('node:path');
const web=path.join(__dirname,'../app/src/main/assets/www');
const session=(options={})=>guide.create({...guide.PRACTICE_DEFAULTS,pattern:'triad',rounds:1,...options},0);
function sing(s,{wrong=0,skip=()=>false,step=40}={}){
 for(let t=s.start;t<s.start+s.duration;t+=step){const p=guide.position(s,t);guide.receive(s,t,skip(p)?null:p.midi+wrong);}
 return guide.metrics(s);
}
test('Unified practice retains all thirteen legacy patterns without duplicating note sequences',()=>{
 assert.equal(Object.keys(guide.LEGACY_PATTERNS).length,13);
 assert.equal(Object.keys(guide.PATTERNS).length,22);
 assert.equal(new Set(Object.values(guide.PATTERNS).map(p=>JSON.stringify(p.steps))).size,22);
 for(const [pattern,mapped]of Object.entries(guide.LEGACY_PATTERNS)){
  const original=Object.freeze({pattern,root:60,speed:2800,repeats:2});
  const restored=guide.migratePractice(null,original,null,null);
  assert.equal(restored.pattern,mapped);assert.equal(restored.noteSeconds,2.8);assert.equal(restored.rounds,2);assert.equal(restored.listenFirst,false);
 }
});
test('Unified saved preferences take precedence and old slide-only preferences migrate with listening enabled',()=>{
 const old={pattern:'scale',root:60,speed:1200,repeats:0};
 const saved={...guide.PRACTICE_DEFAULTS,pattern:'smooth7',root:55,listenFirst:true};
 assert.equal(guide.migratePractice(saved,old,null,null).pattern,'smooth7');
 assert.equal(guide.migratePractice(null,null,{pattern:'smooth5',root:65},null).listenFirst,true);
 const infinite=guide.migratePractice(null,old,null,null);assert.equal(infinite.rounds,0);assert.equal(infinite.shift,0);
 assert.equal(guide.migratePractice(null,null,null,null).listenFirst,false);
});
test('Direct practice has a real three-second countdown and starts at the first target',()=>{
 const s=session();assert.equal(s.start,3000);assert.equal(guide.position(s,s.start).phase,'answer');
 for(const [t,count]of [[0,3],[999,3],[1000,2],[1999,2],[2000,1],[2999,1]]){
  const cue=guide.startCue(s,t);assert.equal(cue.visible,true);assert.equal(cue.count,count);assert.equal(cue.firstMidi,60);
  guide.receive(s,t,60);
 }
 assert.equal(s.valid,0);assert.equal(s.voicedMs,0);assert.equal(guide.startCue(s,3000).starting,true);
});
test('Listen-first and direct methods use the same targets while grading only the response',()=>{
 const direct=session(),listen=session({listenFirst:true});
 assert.equal(listen.phraseMs,direct.phraseMs);
 assert.equal(listen.cycleMs-direct.cycleMs,listen.phraseMs+listen.handoffMs);
 for(let t=listen.start;t<listen.start+listen.phraseMs+listen.handoffMs;t+=40)guide.receive(listen,t,guide.position(listen,t).midi);
 assert.equal(listen.valid,0);assert.equal(listen.voicedMs,0);
 assert.ok(sing(direct).enough);assert.ok(sing(listen).enough);
 assert.equal(guide.evaluate(direct,true).kind,'success');assert.equal(guide.evaluate(listen,true).kind,'success');
});
test('Direct reference-note intervals contribute no false voice coverage',()=>{
 const s=session(),first=s.start;
 for(let t=first;t<=first+240;t+=40)guide.receive(s,t,60);
 assert.equal(s.voicedMs,0);assert.equal(s.goodMs,0);
 guide.receive(s,first+320,60);assert.ok(s.voicedMs>0&&s.voicedMs<=40);
});
test('Silence and one skipped note cannot become successful practice',()=>{
 for(const options of [{skip:()=>true},{skip:p=>p.index===2},{wrong:2}]){
  const s=session();sing(s,options);assert.notEqual(guide.evaluate(s,true).kind,'success');
 }
 const silent=session();sing(silent,{skip:()=>true});assert.equal(guide.metrics(silent).accuracy,null);
});
test('Continuous slide has continuously moving targets in either listening method',()=>{
 for(const listenFirst of [false,true]){
  const s=session({pattern:'smooth7',listenFirst});
  const answer=s.start+(listenFirst?s.phraseMs+s.handoffMs:0);
  const a=guide.position(s,answer+3000),b=guide.position(s,answer+3040);
  assert.ok(b.midi>a.midi&&b.midi-a.midi<.1);assert.equal(a.phase,'answer');
  sing(s);assert.equal(guide.evaluate(s,true).kind,'success');
 }
});
test('Unlimited practice keeps running with bounded graph history and grading bins',()=>{
 const s=session({rounds:0,shift:1,noteSeconds:1.2});assert.equal(s.infinite,true);assert.equal(s.settings.shift,0);
 const end=s.start+80*s.cycleMs;
 for(let t=s.start;t<end;t+=80){const p=guide.position(s,t);guide.receive(s,t,p.midi);}
 assert.equal(guide.position(s,end+1000).phase,'answer');assert.equal(s.bins.length,1);assert.ok(s.history.length<=102);
 const m=guide.metrics(s);assert.ok(Number.isFinite(m.accuracy)&&Number.isFinite(m.coverage));
 s.finishedAt=end;s.active=false;assert.equal(guide.evaluate(s,false).kind,'stopped');assert.match(guide.summary(s,String,false),/80회 완료/);
});
test('A callback gap spanning silent unlimited rounds cannot satisfy all-note participation',()=>{
 const s=session({rounds:0});guide.receive(s,s.start+400,60);guide.receive(s,s.start+440,60);
 guide.receive(s,s.start+3*s.cycleMs+400,60);
 assert.equal(s.completedEach,false);assert.equal(guide.metrics(s).enough,false);assert.ok(s.voicedMs<=40);
});
test('Long phrases keep complete grading while the graph retains only its recent window',()=>{
 const s=session({pattern:'step12',noteSeconds:4});sing(s,{step:80});
 assert.ok(s.history.length<110);assert.equal(guide.evaluate(s,true).kind,'success');assert.equal(guide.metrics(s).accuracy,100);
});
test('Every graph window is at most six seconds and includes its current expected note',()=>{
 for(const pattern of Object.keys(guide.PATTERNS)){
  const s=session({pattern});for(let offset=0;offset<=s.phraseMs;offset+=500){
   const v=guide.plotView(s,s.start+offset),p=guide.position(s,s.start+offset);
   assert.ok(v.to-v.from<=6000&&v.from>=0&&v.to<=s.phraseMs+.001);
   assert.ok(v.low<=p.midi&&p.midi<=v.high);assert.ok(v.high-v.low>=4);
  }
 }
});
test('Graph scale follows meaningful target changes without stretching to isolated octave errors',()=>{
 const s=session({pattern:'hold'});const t=s.start+1000;
 guide.receive(s,t,84);const view=guide.plotView(s,t);
 assert.ok(view.high-view.low<=6);assert.equal(s.history[0].midi,84,'raw error is retained rather than moved onto graph boundary');
 const before=guide.plotView(s,t);guide.receive(s,t+40,null);const after=guide.plotView(s,t+40);
 assert.equal(after.low,before.low);assert.equal(after.high,before.high);assert.equal(s.history.at(-1).midi,null);
});
test('Only one practice menu remains; both old preference families and history identifiers remain readable',()=>{
 const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
 assert.equal((html.match(/data-screen="practice"/g)||[]).length,1);assert.doesNotMatch(html,/data-screen="guideVoice"/);
 assert.match(html,/id="guideListenFirst"/);assert.match(html,/id="guideRounds"/);
 const js=fs.readFileSync(path.join(web,'piano.js'),'utf8');assert.match(js,/voiceline-unified-practice-v1/);assert.match(js,/voiceline-practice-v1/);assert.match(js,/voiceline-guide-v1/);
});
