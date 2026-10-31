'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const guide=require('../app/src/main/assets/www/guide-training.js');
const js=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
const chunk=(from,to)=>{const a=js.indexOf(from),b=js.indexOf(to,a);assert.ok(a>=0&&b>a,from);return js.slice(a,b);};
const labels=vm.runInNewContext(chunk('const NAMES=','const BLACK=')+chunk('function name(m){','function frequency(m){')+'\n({name,koname,noteLabel})');
const session=options=>guide.create({pattern:'triad',root:60,bpm:80,rounds:1,shift:0,...options},0);
test('Rounding cannot turn insufficient slide coverage or accuracy into a pass',()=>{
 const s=session();s.valid=12;
 for(const bin of s.bins.flat())bin.voiced=bin.expected*.395;
 s.voicedMs=s.bins.flat().reduce((n,bin)=>n+bin.voiced,0);s.goodMs=s.voicedMs;
 assert.equal(guide.metrics(s).coverage,39);assert.equal(guide.evaluate(s,true).status,'측정 부족');
 for(const bin of s.bins.flat())bin.voiced=bin.expected*.5;
 s.voicedMs=s.bins.flat().reduce((n,bin)=>n+bin.voiced,0);s.goodMs=s.voicedMs*.649;
 assert.equal(guide.metrics(s).accuracy,64);assert.equal(guide.evaluate(s,true).status,'다시 연습');
 s.goodMs=s.voicedMs*.65;assert.equal(guide.metrics(s).accuracy,65);assert.equal(guide.evaluate(s,true).status,'성공');
});
function sing(s,pitch=(p)=>p.midi,step=50){
 for(let t=s.start;t<s.start+s.duration;t+=step){const p=guide.position(s,t);guide.receive(s,t,pitch(p,t));}
 return guide.metrics(s);
}
test('Guide patterns and every round stay in detectable range without reversing the phrase',()=>{
 assert.equal(Object.keys(guide.PATTERNS).length,22);
 assert.equal(new Set(Object.values(guide.PATTERNS).map(p=>JSON.stringify(p.steps))).size,22);
 for(const pattern of Object.keys(guide.PATTERNS))for(const root of [36,48,60,82,94])for(const shift of [-1,0,1]){
  const s=session({pattern,root,shift,rounds:5});
  assert.ok(s.rounds>=1&&s.rounds<=5);
  for(let i=0;i<s.roots.length;i++){
   for(const offset of s.pattern.steps)assert.ok(s.roots[i]+offset>=36&&s.roots[i]+offset<=94);
   if(i)assert.equal(s.roots[i]-s.roots[i-1],shift);
  }
 }
});
test('Guide corrupt settings recover; range boundary ends the next round safely',()=>{
 const options=guide.normalize({pattern:'unknown',root:Infinity,bpm:'',rounds:NaN,shift:3,sound:'speaker',volume:-10,tolerance:2});
 assert.deepEqual(options,{...guide.DEFAULTS,volume:0});
 const top=session({root:94,rounds:5,shift:1});assert.equal(top.settings.root,87);assert.equal(top.rounds,1);assert.equal(top.limited,true);
 const bottom=session({root:36,rounds:5,shift:-1});assert.equal(bottom.rounds,1);assert.equal(bottom.limited,true);
 assert.doesNotThrow(()=>guide.plan(null));
});
test('A whole guide phrase always precedes its silent response and transposed next phrase',()=>{
 const s=session({rounds:2,shift:1}),start=s.start;
 assert.equal(guide.position(s,start-1).phase,'ready');
 assert.equal(guide.position(s,start).phase,'listen');
 assert.equal(guide.position(s,start+s.phraseMs-1).phase,'listen');
 assert.equal(guide.position(s,start+s.phraseMs).phase,'handoff');
 const answer=start+s.phraseMs+s.handoffMs;
 assert.equal(guide.position(s,answer).phase,'answer');assert.equal(guide.position(s,answer).midi,60);
 assert.equal(guide.position(s,answer+s.noteMs*2).midi,67);
 assert.equal(guide.position(s,answer+s.phraseMs).phase,'rest');
 assert.equal(guide.position(s,start+s.cycleMs).phase,'listen');
 assert.equal(guide.position(s,start+s.cycleMs).midi,61);
 assert.equal(guide.position(s,start+s.duration).phase,'done');
});
test('Perfect speaker input during listening is excluded from all scores and voice range',()=>{
 const s=session();sing(s,p=>p.phase==='listen'?p.midi:null);
 assert.equal(s.valid,0);assert.equal(s.voicedMs,0);assert.equal(s.low,null);
 assert.equal(guide.metrics(s).accuracy,null);assert.equal(guide.evaluate(s,true).status,'측정 부족');
});
test('Complete accurate responses pass with voice coverage and cents tolerance',()=>{
 const s=session({rounds:2,shift:1,tolerance:50});const m=sing(s,p=>p.midi+.12);
 assert.equal(m.accuracy,100);assert.ok(m.coverage>85);assert.equal(m.enough,true);
 assert.equal(guide.evaluate(s,true).status,'성공');assert.equal(s.high,68.12);
 assert.match(guide.summary(s,String),/3화음 왕복/);assert.doesNotMatch(guide.summary(s,String),/더 연습할 음/);
});
test('Detuned responses fail even with full voice coverage',()=>{
 const s=session();const m=sing(s,p=>p.midi+1.1);
 assert.equal(m.accuracy,0);assert.ok(m.coverage>85);assert.equal(guide.evaluate(s,true).status,'다시 연습');
 assert.match(guide.summary(s,String),/더 연습할 음/);
});
test('Singing just one right note cannot produce success for a whole phrase',()=>{
 const s=session();const m=sing(s,p=>p.index===0?p.midi:null);
 assert.equal(m.accuracy,100);assert.equal(m.enough,false);assert.equal(guide.evaluate(s,true).status,'측정 부족');
});
test('Skipping an entire note fails the per-note coverage rule despite high total accuracy',()=>{
 const s=session();const m=sing(s,p=>p.index===2?null:p.midi);
 assert.equal(m.accuracy,100);assert.ok(m.coverage>40);assert.equal(m.each,false);assert.equal(m.enough,false);
});
test('Silence, long callback gaps and duplicate timestamps never fill voice coverage',()=>{
 const s=session(),answer=s.start+s.phraseMs+s.handoffMs;
 guide.receive(s,answer+100,60);guide.receive(s,answer+150,60);assert.equal(s.voicedMs,50);
 guide.receive(s,answer+150,60);guide.receive(s,answer+100,60);assert.equal(s.voicedMs,50);
 guide.receive(s,answer+500,60);assert.equal(s.voicedMs,50);
 guide.receive(s,answer+550,null);guide.receive(s,answer+600,60);assert.equal(s.voicedMs,50);
 guide.receive(s,answer+650,60);assert.equal(s.voicedMs,100);
});
test('The guide handoff and the first 100ms of each response note are ungraded',()=>{
 const s=session(),answer=s.start+s.phraseMs+s.handoffMs;
 for(let t=answer-100;t<=answer+100;t+=50)guide.receive(s,t,60);
 assert.equal(s.voicedMs,0);guide.receive(s,answer+150,60);assert.equal(s.voicedMs,50);
 const next=answer+s.noteMs;
 for(let t=next;t<=next+100;t+=50)guide.receive(s,t,64);
 assert.equal(s.voicedMs,50);guide.receive(s,next+150,64);assert.equal(s.voicedMs,100);
});
test('User stop remains stopped even when the partial answer is perfectly accurate',()=>{
 const s=session();sing(s);
 assert.equal(guide.evaluate(s,false).status,'중단');assert.equal(guide.evaluate(s,false).kind,'stopped');
});
function audio(){
 const sources=[],intervals=new Map();let serial=0;
 const param=()=>({value:0,events:[],setValueAtTime(v,t){this.events.push([v,t]);},linearRampToValueAtTime(v,t){this.events.push([v,t]);},exponentialRampToValueAtTime(v,t){this.events.push([v,t]);},cancelScheduledValues(){},setTargetAtTime(){}});
 const ac={currentTime:0,createGain(){return {gain:param(),connect(){},disconnect(){}};},
  createOscillator(){const source={frequency:param(),connect(){},disconnect(){this.disconnected=true;},start(t){this.started=t;},stop(t){this.stopped=t;}};sources.push(source);return source;},
  createBufferSource(){const source={playbackRate:param(),connect(){},disconnect(){this.disconnected=true;},start(t){this.started=t;},stop(t){this.stopped=t;}};sources.push(source);return source;}};
 const timers={setInterval(fn){intervals.set(++serial,fn);return serial;},clearInterval(id){intervals.delete(id);}};
 return {ac,timers,sources,intervals};
}
test('Audio scheduling plays only the demonstration, never the response, at the selected tempo',()=>{
 const h=audio(),s=session({sound:'hum',rounds:2,shift:1}),player=guide.createPlayer(h.ac,{},()=>null,h.timers);
 player.start(s,0);assert.equal(h.sources.length,0);
 h.ac.currentTime=s.start/1000-.1;player.pump();assert.equal(h.sources.length,3);
 assert.equal(h.sources[0].started,s.start/1000);
 const starts=[];
 for(let t=s.start/1000;t<(s.start+s.duration)/1000;t+=.05){h.ac.currentTime=t;player.pump();}
 for(const source of h.sources)if(!starts.includes(source.started))starts.push(source.started);
 assert.equal(starts.length,s.rounds*s.pattern.steps.length);
 for(const t of starts){const p=guide.position(s,Math.round(t*1000)+1);assert.equal(p.phase,'listen');}
 assert.ok(Math.abs(starts[1]-starts[0]-s.noteMs/1000)<.001);player.stop();assert.equal(h.intervals.size,0);
});
test('Guide piano uses the actual decoded sample with transposition and bounded volume',()=>{
 const h=audio(),buffer={},s=session({sound:'piano',root:61}),player=guide.createPlayer(h.ac,{},()=>({buffer,anchor:60,gain:.08}),h.timers);
 player.start(s,0);h.ac.currentTime=s.start/1000-.1;player.pump();
 assert.equal(h.sources.length,1);assert.equal(h.sources[0].buffer,buffer);
 assert.ok(Math.abs(h.sources[0].playbackRate.events[0][0]-Math.pow(2,1/12))<1e-9);
 player.stop();
});
test('All guide timbres remain playable offline when a piano sample is unavailable',()=>{
 for(const sound of Object.keys(guide.SOUNDS)){
  const h=audio(),s=session({sound}),player=guide.createPlayer(h.ac,{},()=>null,h.timers);
  player.start(s,0);h.ac.currentTime=s.start/1000-.1;player.pump();
  assert.ok(h.sources.length>=3);assert.equal(h.sources[0].frequency.events[0][0],440*Math.pow(2,(60-69)/12));
  player.stop();assert.equal(player.activeVoices,0);assert.ok(h.sources.every(source=>source.stopped<=h.ac.currentTime+.026));
  const count=h.sources.length;h.ac.currentTime+=100;player.pump();assert.equal(h.sources.length,count);assert.equal(h.intervals.size,0);
 }
});
test('Muted guide creates no audio nodes; delayed scheduling skips expired notes',()=>{
 const muted=audio(),s=session({volume:0}),p=guide.createPlayer(muted.ac,{},()=>null,muted.timers);
 p.start(s,0);muted.ac.currentTime=3;p.pump();assert.equal(muted.sources.length,0);p.stop();
 const late=audio(),q=guide.createPlayer(late.ac,{},()=>null,late.timers);
 q.start(session(),0);late.ac.currentTime=20;q.pump();assert.equal(late.sources.length,0);assert.equal(late.intervals.size,0);q.stop();
});
test('Phrase graph aligns actual responses, target steps and notes on one time axis',()=>{
 const s=session();sing(s);
 const operations=[],ctx=new Proxy({}, {get(target,key){return target[key]??((...args)=>operations.push([key,...args]));},set(target,key,value){target[key]=value;return true;}});
 const canvas={width:0,height:0,getBoundingClientRect:()=>({width:680,height:190}),getContext:()=>ctx};
 guide.draw(canvas,s,s.start+s.phraseMs+s.handoffMs+s.phraseMs-50,String);
 assert.equal(canvas.width,680);assert.equal(canvas.height,190);
 assert.ok(operations.some(op=>op[0]==='fillText'&&op[1]==='60'));
 assert.ok(operations.some(op=>op[0]==='arc'));assert.ok(operations.some(op=>op[0]==='fillRect'));
 assert.ok(operations.filter(op=>op[0]==='lineTo').length>s.pattern.steps.length);
 assert.ok(operations.flat().filter(v=>typeof v==='number').every(Number.isFinite));
});
test('Shared training lifecycle stops guide audio, saves only a practice event and releases the mic',()=>{
 const app={guideSettings:{pattern:'triad',rounds:1,shift:0},trainingSettings:{}},events=[],actions=[];
 const $=()=>({textContent:'',hidden:false,querySelectorAll:()=>[]});
 const code=chunk('function newTrainingSession(','function startTraining(t){')+
  chunk('function receiveTrainingSample(t,midi,rms){','function updateTraining(t){')+
  chunk('function trainingEvaluation(a,completed){','function dynamicRuleText(){')+
  chunk('function trainingSummary(a,completed){','function syncTrainingOverlay(){')+
  '\n({newTrainingSession,receiveTrainingSample,finishTraining})';
 const api=vm.runInNewContext(code,{window:{VoiceLineGuideTraining:guide},app,$,Math,Number,performance:{now:()=>100000},
  MODES:{guideVoice:['음역 슬라이드']},...labels,addEvent:(...args)=>events.push(args),cancelTrainingCues(){},
  showTrainingResult(){actions.push('result');},setMessage(){},progress(){},syncKeyColors(){},renderTrainingOverlay(){},
  stopMic(){actions.push('mic stop');},cancelAnimationFrame(){}});
 app.training=api.newTrainingSession('guideVoice',0);app.mic=true;
 const s=app.training;s.guidePlayer={stop(){actions.push('audio stop');}};
 for(let t=s.start;t<s.start+s.duration;t+=50){const p=guide.position(s,t);api.receiveTrainingSample(t,p.midi,.06);}
 api.finishTraining(true);assert.equal(app.training,null);assert.deepEqual(actions,['audio stop','result','mic stop']);
 assert.equal(events.length,1);assert.equal(events[0][2],'practice');assert.match(events[0][1],/성공/);
});
test('Guide mode is practice history only and cannot create a recording',async()=>{
 const calls=[],app={sessionMode:'guideVoice'};
 const add=vm.runInNewContext(chunk('const PRACTICE_EVENT_MODES=','const MODES=')+chunk('async function addEvent(','function targetKeyboardBase(')+'\naddEvent',{
  app,store:async(...args)=>calls.push(args),id:()=> 'g1',stamp:()=> '오늘',notify(){},Date
 });
 assert.equal(await add('가이드 따라 부르기','완료','guideVoice'),true);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'events');assert.equal(calls[0][2].category,'practice');assert.equal(calls[0][2].mode,'guideVoice');
});
test('Interrupted audio cancels pending notes, detaches listeners and ends the exercise once',()=>{
 const h=audio(),handlers=new Map();let interruptions=0;
 h.ac.state='running';h.ac.addEventListener=(type,fn)=>handlers.set(type,fn);h.ac.removeEventListener=type=>handlers.delete(type);
 const p=guide.createPlayer(h.ac,{},()=>null,h.timers,()=>interruptions++);
 p.start(session(),0);assert.equal(handlers.size,1);
 const change=handlers.get('statechange');h.ac.state='suspended';change();change();
 assert.equal(interruptions,1);assert.equal(h.intervals.size,0);assert.equal(handlers.size,0);
 h.ac.currentTime=2;p.pump();assert.equal(h.sources.length,0);
});
test('Every response gets a full three-second 3-2-1 countdown and the correct first note',()=>{
 for(const bpm of [50,80,120])for(const pattern of Object.keys(guide.PATTERNS)){
  const s=session({bpm,pattern,rounds:2,shift:1});assert.equal(s.handoffMs,3000);
  for(let round=0;round<s.rounds;round++){
   const end=s.start+round*s.cycleMs+s.phraseMs;
   assert.equal(guide.startCue(s,end-1).visible,false);
   for(const [offset,count] of [[0,3],[999,3],[1000,2],[1999,2],[2000,1],[2999,1]]){
    const cue=guide.startCue(s,end+offset);
    assert.equal(cue.visible,true);assert.equal(cue.count,count);assert.equal(cue.starting,false);
    assert.equal(cue.firstMidi,s.roots[round]+s.pattern.steps[0]);assert.equal(guide.position(s,end+offset).phase,'handoff');
   }
   const cue=guide.startCue(s,end+3000);assert.equal(cue.starting,true);assert.equal(cue.visible,true);
   assert.equal(guide.position(s,end+3000).offset,0);
   assert.equal(guide.startCue(s,end+3000+s.noteMs).visible,false);
  }
 }
});
test('Voice during the old 0.8-second handoff and the rest of the countdown is never scored',()=>{
 const s=session(),end=s.start+s.phraseMs;
 for(let t=end+800;t<end+3000;t+=50)guide.receive(s,t,60);
 assert.equal(s.valid,0);assert.equal(s.voicedMs,0);assert.equal(s.history.length,0);
 guide.receive(s,end+3000,60);guide.receive(s,end+3100,60);assert.equal(s.voicedMs,0);
 guide.receive(s,end+3150,60);assert.equal(s.voicedMs,50);assert.equal(s.goodMs,50);
 assert.equal(s.bins[0][0].voiced,50);
});
test('The guide UI displays countdown, start and first-note hints, then clears the cue on stop',()=>{
 const s=session({pattern:'down'}),end=s.start+s.phraseMs,nodes=new Map(),app={training:s,trainingLastDraw:0};
 const $=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',dataset:{},getBoundingClientRect:()=>({width:0,height:0})});return nodes.get(id);};
 const render=vm.runInNewContext(chunk('function renderGuideTraining(','function rememberFullRecordingPitch(')+'\nrenderGuideTraining',{
  app,$,window:{VoiceLineGuideTraining:guide},...labels,guideOptions:()=>s.settings,Math,Number
 });
 render(end,true);assert.equal($('guideStartCue').hidden,false);assert.equal($('guideStartCount').textContent,'3');
 assert.match($('guideStartText').textContent,/첫 음 G4 · 2옥 솔/);assert.match($('guidePhaseTitle').textContent,/준비/);
 render(end+1000,true);assert.equal($('guideStartCount').textContent,'2');
 render(end+2000,true);assert.equal($('guideStartCount').textContent,'1');
 render(end+3000,true);assert.equal($('guideStartCount').textContent,'시작!');assert.match($('guidePhaseTitle').textContent,/지금 시작/);
 render(end+3000+s.noteMs,true);assert.equal($('guideStartCue').hidden,true);assert.match($('guidePhaseTitle').textContent,/따라 부르세요/);
 s.finishedAt=end+3100;s.completed=false;app.training=null;app.guideLastResult=s;
 render(end+3100,true);assert.equal($('guideStartCue').hidden,true);assert.equal($('guidePhaseTitle').textContent,'연습 중단');
});
test('Every slide pattern shows solfege and Korean octave for its goal, live voice and reference',()=>{
 for(const pattern of Object.keys(guide.PATTERNS)){
  const s=session({pattern,root:61}),answer=s.start+s.phraseMs+s.handoffMs,t=answer+400,nodes=new Map();
  const app={training:s,trainingLastDraw:0},$=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',dataset:{},getBoundingClientRect:()=>({width:0,height:0})});return nodes.get(id);};
  const render=vm.runInNewContext(chunk('function renderGuideTraining(','function rememberFullRecordingPitch(')+'\nrenderGuideTraining',{
   app,$,window:{VoiceLineGuideTraining:guide},...labels,guideOptions:()=>s.settings,Math,Number
  });
  const p=guide.position(s,t);guide.receive(s,t-50,p.midi);guide.receive(s,t,p.midi);render(t,true);
  assert.equal($('guideTargetLabel').textContent,'목표 '+labels.noteLabel(p.midi));
  assert.equal($('guideDetectedLabel').textContent,'내 음 '+labels.noteLabel(p.midi));
  assert.match($('guideRoundInfo').textContent,/C♯4 · 2옥 도♯/);
  render(t+300,true);assert.equal($('guideDetectedLabel').textContent,'내 음 —','stale voice label must clear');
 }
});
test('Slide note labels stay inside the existing canvas at narrow and wide sizes',()=>{
 for(const pattern of Object.keys(guide.PATTERNS))for(const width of [180,320,680]){
  const s=session({pattern,root:61}),ops=[];
  const ctx=new Proxy({measureText:text=>({width:[...text].reduce((sum,c)=>sum+(/[가-힣]/.test(c)?11:6),0)})},
   {get(target,key){return target[key]??((...args)=>ops.push([key,...args]));},set(target,key,value){target[key]=value;return true;}});
  const canvas={getBoundingClientRect:()=>({width,height:120}),getContext:()=>ctx};
  guide.draw(canvas,s,s.start+400,labels.noteLabel);
  const names=ops.filter(op=>op[0]==='fillText'&&/옥/.test(op[1]));assert.ok(names.length>=2,pattern);
  for(const [,text,x,y,maxWidth]of names){
   assert.match(text,/[A-G]♯?\d · \d옥 [도레미파솔라시]♯?/);assert.ok(maxWidth>0&&maxWidth<=x&&x<width);
  }
  assert.ok(ops.flat().filter(value=>typeof value==='number').every(Number.isFinite));
 }
});
test('Merged stepped patterns preserve all old spans, hold lengths and high-root reversal',()=>{
 for(const span of [3,5,7,12])for(const root of [48,60,84])for(const seconds of [2,3,4]){
  const s=session({pattern:'step'+span,root,noteSeconds:seconds}),direction=root+span>94?-1:1;
  const expected=Array.from({length:span*2+1},(_,i)=>root+direction*(i<=span?i:span*2-i));
  const answer=s.start+s.phraseMs+s.handoffMs;
  assert.equal(s.noteMs,seconds*1000);assert.equal(s.phraseMs,expected.length*seconds*1000);
  assert.deepEqual(s.pattern.steps.map(n=>root+n),expected);
  for(let i=0;i<expected.length;i++){
   assert.equal(guide.position(s,s.start+i*s.noteMs+1).midi,expected[i]);
   assert.equal(guide.position(s,answer+i*s.noteMs+1).midi,expected[i]);
  }
 }
 const paced=session({pattern:'step3',noteSeconds:0,bpm:60});assert.equal(paced.noteMs,1000);
});
test('Continuous targets preserve the original twelve-second fractional pitch path in both turns',()=>{
 for(const span of [3,5,7,12])for(const root of [48,60,84]){
  const s=session({pattern:'smooth'+span,root,noteSeconds:4,bpm:50}),direction=root+span>94?-1:1;
  assert.equal(s.phraseMs,12000);assert.equal(s.tolerance,110);assert.equal(s.smooth,true);
  const answer=s.start+s.phraseMs+s.handoffMs;
  for(let offset=0;offset<12000;offset+=125){
   const q=offset/12000,target=root+direction*span*(q<.5?q*2:(1-q)*2);
   assert.ok(Math.abs(guide.position(s,s.start+offset).midi-target)<1e-9);
   assert.ok(Math.abs(guide.position(s,answer+offset).midi-target)<1e-9);
  }
  assert.equal(guide.position(s,s.start+6000).midi,root+direction*span);
  assert.equal(guide.position(s,answer+12000).midi,root);
 }
});
test('Continuous scoring accepts a full glide, rejects detuning and incomplete movement',()=>{
 const good=session({pattern:'smooth7'}),metrics=sing(good,p=>p.midi+.3);
 assert.equal(metrics.accuracy,100);assert.ok(metrics.coverage>90);assert.equal(guide.evaluate(good,true).status,'성공');
 const bad=session({pattern:'smooth7'});sing(bad,p=>p.midi+1.5);assert.equal(guide.evaluate(bad,true).status,'다시 연습');
 const partial=session({pattern:'smooth7'});sing(partial,p=>p.offset<3000?p.midi:null);
 assert.equal(guide.metrics(partial).accuracy,100);assert.equal(guide.evaluate(partial,true).status,'측정 부족');
 assert.match(guide.summary(partial,String),/더 연습할 구간/);
 const silent=session({pattern:'smooth7'});sing(silent,p=>p.phase==='listen'?p.midi:null);
 assert.equal(silent.voicedMs,0);assert.equal(guide.evaluate(silent,true).status,'측정 부족');
});
test('Continuous movement excludes the first attack once and grades across later segment boundaries',()=>{
 const s=session({pattern:'smooth3'}),answer=s.start+s.phraseMs+s.handoffMs;
 for(let offset=0;offset<=3150;offset+=50){const t=answer+offset;guide.receive(s,t,guide.position(s,t).midi);}
 assert.equal(s.bins[0][0].voiced,2850);assert.equal(s.bins[0][1].voiced,150);
 assert.equal(s.responseMs,11900);assert.equal(s.goodMs,3000);
 assert.equal(s.bins[0][0].expected,2900);assert.equal(s.bins[0][1].expected,3000);
});
test('Continuous guide audio ramps through the same pitches and remains silent during response',()=>{
 for(const sound of Object.keys(guide.SOUNDS))for(const root of [60,84]){
  const h=audio(),s=session({pattern:'smooth12',root,sound,rounds:2,shift:0});let sampleReads=0;
  const p=guide.createPlayer(h.ac,{},()=>{sampleReads++;return null;},h.timers);p.start(s,0);
  h.ac.currentTime=s.start/1000-.1;p.pump();assert.equal(sampleReads,0);
  const events=h.sources[0].frequency.events,hz=m=>440*Math.pow(2,(m-69)/12);
  assert.deepEqual(events,[[hz(root),s.start/1000],[hz(root+s.pattern.steps[1]),s.start/1000+6],[hz(root),s.start/1000+12]]);
  const firstCount=h.sources.length;h.ac.currentTime=(s.start+s.phraseMs+s.handoffMs+500)/1000;p.pump();
  assert.equal(h.sources.length,firstCount,'the user response must remain unaccompanied');
  h.ac.currentTime=(s.start+s.cycleMs)/1000-.1;p.pump();assert.equal(h.sources.length,firstCount*2);
  p.stop();assert.equal(h.intervals.size,0);assert.equal(p.activeVoices,0);
 }
});
test('Late continuous audio starts at the current curve position and never schedules a past peak',()=>{
 const h=audio(),s=session({pattern:'smooth12',root:60,sound:'hum'}),p=guide.createPlayer(h.ac,{},()=>null,h.timers);
 p.start(s,0);h.ac.currentTime=s.start/1000+8;p.pump();
 const events=h.sources[0].frequency.events,hz=m=>440*Math.pow(2,(m-69)/12);
 assert.ok(Math.abs(events[0][0]-hz(68))<1e-8);assert.equal(events[0][1],h.ac.currentTime);
 assert.equal(events.length,2);assert.equal(events[1][1],s.start/1000+12);assert.ok(Math.abs(events[1][0]-hz(60))<1e-8);
 p.stop();
});
test('Continuous graph draws a sloping target instead of discrete note bars',()=>{
 const s=session({pattern:'smooth7'}),ops=[],ctx=new Proxy({}, {get(target,key){return target[key]??((...args)=>ops.push([key,...args]));},set(target,key,value){target[key]=value;return true;}});
 const canvas={width:0,height:0,getBoundingClientRect:()=>({width:680,height:190}),getContext:()=>ctx};
 guide.draw(canvas,s,s.start+5000,String);
 const curve=ops.findIndex((op,i)=>op[0]==='moveTo'&&ops[i+1]?.[0]==='lineTo'&&ops[i+2]?.[0]==='lineTo');
 assert.ok(curve>=0);const [start,peak,end]=ops.slice(curve,curve+3);
 assert.ok(start[1]<peak[1]&&peak[1]<end[1]);
 const view=guide.plotView(s,s.start+5000),fraction=(s.phraseMs/2-view.from)/(view.to-view.from);
 assert.ok(Math.abs(peak[1]-(start[1]+(end[1]-start[1])*fraction))<.01);
 assert.ok(peak[2]<start[2]&&peak[2]<end[2]);
 assert.equal(ops.filter(op=>op[0]==='fillRect').length,0);
 assert.ok(ops.some(op=>op[0]==='fillText'&&typeof op[1]==='string'));
 assert.ok(ops.flat().filter(v=>typeof v==='number').every(Number.isFinite));
});
test('Old slide settings migrate once; valid existing guide choices always take precedence',()=>{
 for(const style of ['step','smooth'])for(const span of [3,5,7,12]){
  const legacy=Object.freeze({root:84,glideStyle:style,glideSpan:span,glideStepSeconds:4});
  const restored=guide.restore(null,legacy);
  assert.equal(restored.pattern,style+span);assert.equal(restored.root,84);assert.equal(restored.rounds,1);assert.equal(restored.shift,0);
  assert.equal(restored.noteSeconds,style==='step'?4:0);
  const previous={pattern:'triad',root:55,bpm:90,noteSeconds:2,rounds:2,shift:-1,sound:'vowel',volume:50,tolerance:75};
  assert.deepEqual(guide.restore(previous,legacy),{...previous,listenFirst:true});
 }
 assert.equal(guide.restore(null,{glideSpan:7,root:60}).pattern,'step3');
 assert.equal(guide.restore({pattern:'bad'},{glideSpan:5,glideStyle:'step'}).pattern,'step5');
 assert.deepEqual(guide.restore(null,null),guide.DEFAULTS);
});
test('App preference migration persists the merged selection without changing old settings or history',()=>{
 const stored=new Map([['voiceline-training-v1',JSON.stringify({root:72,glideStyle:'step',glideSpan:5,glideStepSeconds:2})]]),writes=[],app={};
 const original=stored.get('voiceline-training-v1');
 const read=vm.runInNewContext(chunk('function guideOptions(){','function saveGuideOptions(')+'\nguideOptions',{
  app,window:{VoiceLineGuideTraining:guide},localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>{writes.push(key);stored.set(key,value);}}
 });
 assert.equal(read().pattern,'step5');assert.equal(read().noteSeconds,2);assert.equal(read().root,72);
 assert.deepEqual(writes,['voiceline-unified-practice-v1']);assert.equal(stored.get('voiceline-training-v1'),original);
 stored.set('voiceline-training-v1',JSON.stringify({root:60}));app.guideSettings=null;
 assert.equal(read().pattern,'step5');assert.equal(read().root,72);assert.equal(writes.length,1);
});
test('Legacy glide practice records remain visible while new sessions use the merged mode',()=>{
 const visible=vm.runInNewContext(chunk('function isPracticeHistoryEvent(','async function renderRecoverableRecordings(')+'\nisPracticeHistoryEvent',{});
 assert.equal(visible({mode:'glideVoice',title:'음역 슬라이드 훈련',category:'practice'}),true);
 assert.equal(visible({mode:'guideVoice',title:'가이드 따라 부르기',category:'practice'}),true);
 assert.equal(visible({mode:'guideVoice',title:'음역 슬라이드',category:'practice'}),true);
 assert.equal(visible({mode:'rhythmVoice',title:'리듬·음절 훈련',category:'practice'}),true);
 assert.equal(visible({mode:'record',title:'목소리 녹음',category:'recording'}),false);
});
