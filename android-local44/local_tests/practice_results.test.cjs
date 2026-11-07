"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const plans=require('../app/src/main/assets/www/practice-plans.js'),guide=require('../app/src/main/assets/www/guide-training.js');
const js=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
const chunk=(a,b)=>js.slice(js.indexOf(a),js.indexOf(b,js.indexOf(a)));
const policies=chunk('const PITCH_RANGE=','const MODES=');
const evaluate=vm.runInNewContext(policies+chunk('function trainingEvaluation(a,completed){','function showTrainingResult(')+'\ntrainingEvaluation',{window:{VoiceLineGuideTraining:guide},noteLabel:n=>'C'+(Math.floor(n/12)-1)});
test('An 86% match and 78% coverage explain the exact missing vowel note instead of repeating totals',()=>{
 const s=guide.create({pattern:'vowelFive',root:60,rounds:1},0);
 for(const bin of s.bins.flat())bin.voiced=bin.expected*.8;
 s.bins[0][0].voiced=0;s.valid=160;s.voicedMs=s.responseMs*.78;s.goodMs=s.voicedMs*.86;
 const result=guide.evaluate(s,true,n=>'C4 · 2옥 도');
 assert.equal(result.status,'측정 부족');assert.match(result.metrics,/86%.*78%/);
 assert.match(result.reason,/1세트 · 아 · 1번째 C4 · 2옥 도 0% \/ 최소 20%/);
 assert.doesNotMatch(result.reason,/전체 발성 78% \/ 최소 40%/);
 assert.equal(guide.metrics(s).enough,false);
});
test('Missing samples, total coverage, note coverage and poor accuracy have distinct reasons',()=>{
 const s=guide.create({pattern:'triad',root:60,rounds:1},0);
 assert.match(guide.evaluate(s,true).reason,/음정 측정 0개 \/ 최소 12개.*전체 발성 0% \/ 최소 40%.*구간별 발성 부족/);
 for(const b of s.bins.flat())b.voiced=b.expected;
 s.valid=200;s.voicedMs=s.responseMs;s.goodMs=s.voicedMs*.64;
 assert.equal(guide.evaluate(s,true).status,'미달성');assert.match(guide.evaluate(s,true).reason,/64% \/ 최소 65%/);
 s.goodMs=s.voicedMs*.65;assert.equal(guide.evaluate(s,true).status,'성공');
 assert.equal(guide.evaluate(s,false).status,'중단');
});
test('Repeated notes in a phrase are identified by their position and continuous slides by direction',()=>{
 const s=guide.create({pattern:'triad',root:60,rounds:1},0);s.valid=100;s.voicedMs=s.responseMs*.8;s.goodMs=s.voicedMs;
 for(const b of s.bins.flat())b.voiced=b.expected;
 s.bins[0].at(-1).voiced=0;assert.match(guide.evaluate(s,true).reason,/5번째 C4/);
 const glide=guide.create({pattern:'smooth5',root:60,rounds:1},0);glide.valid=100;glide.voicedMs=glide.responseMs*.8;glide.goodMs=glide.voicedMs;
 for(const b of glide.bins.flat())b.voiced=b.expected;
 glide.bins[0][2].voiced=0;assert.match(guide.evaluate(glide,true).reason,/3번째 내리기 앞부분 0%/);
});
test('Sustain and ear results distinguish insufficient input from a measured off-pitch response',()=>{
 for(const mode of ['sustainVoice','earVoice']){
  const s={mode,duration:8000,earNotes:[60,62],earAnswerMs:3200,valid:0,good:0,voicedMs:0,answerVoicedMs:0};
  let r=evaluate(s,true);assert.equal(r.status,'측정 부족');assert.match(r.reason,/0개 \/ 최소 12개.*0초 \/ 최소/);
  Object.assign(s,{valid:100,good:64,voicedMs:8000,answerVoicedMs:6400});r=evaluate(s,true);assert.equal(r.status,'미달성');assert.match(r.reason,/64% \/ 최소 65%/);
  s.good=65;assert.equal(evaluate(s,true).status,'성공');assert.equal(evaluate(s,false).status,'중단');
 }
});
test('Vibrato needs sustained valid detection; silence, a flat note, stale brief vibrato and interruption never pass',()=>{
 const s={mode:'vibrato',duration:12000,valid:200,voicedMs:10000,validMs:7000,estimate:{rate:5,depth:30}};
 assert.equal(evaluate(s,true).status,'성공');
 s.validMs=1000;assert.equal(evaluate(s,true).status,'미달성');assert.match(evaluate(s,true).reason,/1초 \/ 최소 4.8초/);
 s.estimate=null;s.validMs=0;assert.equal(evaluate(s,true).status,'미달성');
 s.valid=0;s.voicedMs=0;assert.equal(evaluate(s,true).status,'측정 부족');
 assert.equal(evaluate(s,false).status,'중단');
});
test('Fractional ear coverage uses the same exact minimum in the rule, reason and decision',()=>{
 const s={mode:'earVoice',duration:2000,earNotes:[60,62],earAnswerMs:500,valid:20,good:20,answerVoicedMs:349};
 let r=evaluate(s,true);assert.equal(r.status,'측정 부족');assert.match(r.rule,/시간 0.35초 이상/);assert.match(r.reason,/0.349초 \/ 최소 0.35초/);
 s.answerVoicedMs=349.9;r=evaluate(s,true);assert.equal(r.status,'측정 부족');assert.match(r.reason,/0.349초 \/ 최소 0.35초/);
 s.answerVoicedMs=350;r=evaluate(s,true);assert.equal(r.status,'성공');assert.match(r.reason,/0.35초 \/ 최소 0.35초/);
});
test('Warmup success explicitly describes completed guidance rather than measured breathing',()=>{
 const r=evaluate({mode:'warmupVoice'},true);assert.equal(r.status,'성공');assert.match(r.reason,/실제 호흡량과 허밍의 정확도는 측정하지 않습니다/);
 assert.equal(evaluate({mode:'warmupVoice'},false).status,'중단');
});
test('Vibrato coverage excludes reference audio, null detections and gaps over 160ms',()=>{
 const app={vibratoStart:1000,vibratoEnd:2050,vibratoSamples:[]};
 const receive=vm.runInNewContext(chunk('function rememberVibratoPoint(','function vibratoStatus(')+'\nrememberVibratoPoint',{app,VIBRATO_WINDOW_MS:3000});
 for(const [t,midi]of [[0,60],[1000,60],[1050,60],[1100,null],[1150,60],[2000,60],[2050,60],[2100,60]])receive(t,midi);
 assert.equal(app.vibratoSampleCount,5);assert.equal(app.vibratoVoicedMs,100);
});
test('Timed vibrato opens the shared result and persists the same status',async()=>{
 const app={vibratoStart:1000,vibratoSampleCount:200,vibratoVoicedMs:10000,vibratoValidMs:7000,vibratoSummary:{rate:5,depth:30,measuredAt:12000}},shown=[],events=[];
 const finish=vm.runInNewContext(chunk('async function finishVibrato(completed=false){','async function stopActivity(')+'\nfinishVibrato',{app,window:{},performance:{now:()=>13000},$:()=>({}),trainingEvaluation:evaluate,updateVocalPreparation(){},notify(){},showTrainingResult:(...v)=>shown.push(v),addEvent:async(...v)=>events.push(v)});
 await finish(true);assert.equal(app.vibratoStart,0);assert.equal(shown.length,1);assert.equal(shown[0][3].status,'성공');assert.match(events[0][1],/^성공 ·/);
 await finish(true);assert.equal(shown.length,1,'duplicate stop must not create another result');
});
test('A delayed vibrato timer grades the configured duration rather than inflating the required time',async()=>{
 const app={vibratoStart:1000,vibratoSampleCount:200,vibratoVoicedMs:4800,vibratoValidMs:4800,vibratoSummary:{rate:5,depth:30,measuredAt:12900}},shown=[];
 const finish=vm.runInNewContext(chunk('async function finishVibrato(completed=false){','async function stopActivity(')+'\nfinishVibrato',{app,window:{VoiceLinePlansUI:{timing:()=>({seconds:12})}},performance:{now:()=>13100},$:()=>({}),trainingEvaluation:evaluate,updateVocalPreparation(){},notify(){},showTrainingResult:(...v)=>shown.push(v),addEvent:async()=>{}});
 await finish(true);assert.equal(shown[0][3].status,'성공');assert.match(shown[0][3].reason,/최소 4.8초/);
});
const result=(kind,reason=kind)=>({kind,status:({success:'성공',failure:'미달성',guided:'측정 부족',stopped:'중단'})[kind],mode:'sustainVoice',title:'발성 유지',detail:'기준음 C3',rule:'65% 이상',reason});
test('A later successful repetition cannot conceal an earlier failure or its reason',()=>{
 const log=plans.createResultLog('발성 유지',true);log.add(result('failure','첫 회차 음정 40% / 최소 65%'));log.add(result('success','모든 기준 충족'));
 const r=log.summary(true);assert.equal(r.status,'미달성');assert.match(r.detail,/성공 1회.*미달성 1회/);assert.match(r.steps[0].reason,/첫 회차 음정 40%/);
});
test('Routines aggregate every practice step and stopped routines never become successes',()=>{
 const log=plans.createResultLog('아침 루틴');log.add(result('success'),0);log.add({...result('guided','음정 0개 / 최소 12개'),title:'비브라토'},2);
 const r=log.summary(true);assert.equal(r.status,'측정 부족');assert.equal(r.steps.length,2);assert.equal(r.steps[1].title,'3단계 · 비브라토');assert.match(r.steps[1].reason,/0개/);
 assert.equal(log.summary(false).status,'중단');
});
test('Single sessions retain their detailed reason; non-practice timers do not invent a score',()=>{
 const empty=plans.createResultLog('메트로놈');assert.equal(empty.summary(true),null);
 const log=plans.createResultLog('발성 유지',true);log.add(result('success','음정 100% / 최소 65%'));
 assert.equal(log.summary(true).reason,'음정 100% / 최소 65%');assert.equal(log.summary(true).status,'성공');
});
test('A stopped attempt cannot be reported as an aggregate success even if the runner finishes',()=>{
 const log=plans.createResultLog('루틴');log.add(result('stopped'));log.add(result('success'));
 assert.equal(log.summary(true).status,'중단');
});
test('Unlimited repeated results stay bounded by the number of routine steps',()=>{
 const log=plans.createResultLog('무한 루틴');for(let i=0;i<10000;i++)log.add(result(i%7===0?'failure':'success'),i%3);
 assert.equal(log.size,3);assert.equal(log.summary(true).steps.length,3);assert.equal(log.summary(true).status,'미달성');
});
