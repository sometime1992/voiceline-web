'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const web=path.join(__dirname,'../app/src/main/assets/www');
const i18n=require(web+'/i18n.js'),guide=require(web+'/guide-training.js'),settings=require(web+'/practice-settings.js'),plans=require(web+'/practice-plans.js');
const english=source=>i18n.t(source,'en');
function translated(source){const result=english(source);assert.doesNotMatch(result,/[가-힣ㄱ-ㅎㅏ-ㅣ\uE000\uE001]/,source+' => '+result);return result;}

test('Variable countdowns translate complete phrases without consuming the numeric prefix',()=>{
 for(const seconds of [1,2,3,5,8,11,12,21,60,.35,1.8,12.5]){
  assert.equal(english(seconds+'초 뒤 시작'),'Start in '+seconds+' s');
  assert.equal(english(seconds+'초 뒤 발성 시작'),'Singing starts in '+seconds+' s');
  assert.equal(english(seconds+'초 후'),'in '+seconds+' s');
  assert.equal(english(seconds+'초 왕복'),seconds+' s up and down');
  assert.equal(english(seconds+'초/음'),seconds+' s/note');
 }
 assert.equal(english('들이쉬기 3초 → 내쉬기 3초 → 허밍 3초 → 쉬기 3초\n전환 안내음 켜기'),'Inhale 3 s → Exhale 3 s → Hum 3 s → Rest 3 s Phase cues On');
 assert.equal(english('1시간 30분'),'1 h 30 min');
 assert.equal(english('한 박 0.500초 · 한 마디 2.00초'),'Beat length 0.500 s · Bar length 2.00 s');
});

test('Counts preserve full numbers, singular nouns, unlimited repetitions and step order',()=>{
 for(const n of [1,3,11,21,31,99]){
  assert.equal(english(n+'세트'),n+(n===1?' set':' sets'));
  assert.equal(english(n+'회 계획'),n+(n===1?' rep':' reps')+' planned');
  assert.equal(english(n+'세트 · 5모음씩'),n+(n===1?' set':' sets')+' · 5 vowels each');
  assert.equal(english(n+'회차'),'Round '+n);
  assert.equal(english('총 '+n+'회 반복합니다.'),'Repeat '+n+(n===1?' time.':' times.'));
 }
 assert.equal(english('1/∞회 · 1/2단계 · 1회차'),'1/∞ reps · Step 1/2 · Round 1');
 assert.equal(english('21단계 위로 이동'),'Move step 21 up');
 assert.equal(english('음정 3개 / 최소 12개'),'Pitch samples 3 / at least 12 samples');
 assert.equal(english('리듬은 최대 30개까지 저장합니다. 사용하지 않는 리듬을 삭제해 주세요.'),'You can save up to 30 rhythms. Delete an unused rhythm to save another.');
 assert.equal(english('1옥 · C3–B3'),'Octave 3 · C3–B3');
});

test('All five vowels retain grammatical instructions and balanced quotation marks',()=>{
 for(const [source,label] of Object.entries({아:'AH',에:'EH',이:'EE',오:'OH',우:'OO'})){
  assert.equal(english('다음: 「'+source+'」를 약하게 시작'),'Next: start '+label+' softly');
  assert.equal(english('「'+source+'」 · 목표 C4 · 2옥 도'),'“'+label+'” · Target C4 · Do');
  assert.equal(english('「'+source+'」를 유지하며 가로선마다 목표 음을 하나씩 맞추세요.'),'Keep singing '+label+' and match each horizontal target line.');
  for(const text of ['편안하게 숨을 고르고 다음 「'+source+'」를 준비하세요','발성을 쉬고 다음 「'+source+'」를 준비하세요','「'+source+'」를 약하게 유지 · 이 모음의 기준 잡는 중','「'+source+'」의 약한 기준 부족 · 다시 연습해 주세요','숨을 편안하게 쉬세요 · 다음은 「'+source+'」 음계 왕복입니다.','숨을 들이쉬세요 · 다음 「'+source+'」']){
   const output=translated(text);assert.ok(output.includes(label),output);assert.doesNotMatch(output,/[「」]/);
  }
 }
});

test('Every actual pitch pattern localizes live positions, interrupted summaries and missing-note results',()=>{
 for(const pattern of Object.keys(guide.PATTERNS))for(const rounds of [0,1,3,11])for(const listenFirst of [true,false]){
  const model=guide.create({pattern,root:48,rounds,listenFirst},0);
  for(const time of [-100,0,model.phraseMs/2,model.cycleMs-1,model.cycleMs+100])translated(guide.roundLabel(model,guide.position(model,time)));
  for(const completed of [true,false]){
   for(const value of Object.values(guide.evaluate(model,completed,settings.noteLabel)))if(typeof value==='string')translated(value);
   translated(guide.summary(model,settings.noteLabel,completed));
  }
  for(const bin of model.bins.flat())bin.voiced=bin.expected;
  model.valid=100;model.voicedMs=model.responseMs*.8;model.goodMs=model.voicedMs*.86;
  // More than six missing notes exercises the "and N more sections" suffix.
  for(const bin of model.bins.flat().slice(0,8))bin.voiced=0;
  const result=guide.evaluate(model,true,settings.noteLabel);translated(result.reason);translated(result.metrics);
 }
});

test('Actual settings descriptions cover every pattern, manual timing and large repetition counts',()=>{
 const modes=Object.keys(plans.MODES);
 for(const mode of modes)for(const rounds of [0,1,3,21])for(const withinRoutine of [true,false]){
  const patterns=mode==='practice'?Object.keys(guide.PATTERNS):['three'];
  for(const pattern of patterns){
   const value=settings.describe(mode,{rounds,seconds:mode==='piano'?0:12.5},{guide:{pattern,rounds,noteSeconds:1.8},training:{earCount:11}},withinRoutine);
   for(const text of [value.title,value.compact,value.note,value.totalText,value.audio,...value.issues,...value.phases.map(p=>p.label)])translated(text);
   if(rounds===0&&value.voiceSeconds>0)translated('한 '+value.repeatUnit+' 기준 '+value.voiceLabel+' '+settings.formatTime(value.voiceSeconds));
  }
 }
});

test('Actual vibrato criteria and history detail retain every measurement and threshold',()=>{
 const js=fs.readFileSync(web+'/piano.js','utf8'),chunk=(a,b)=>js.slice(js.indexOf(a),js.indexOf(b,js.indexOf(a)));
 const evaluate=vm.runInNewContext(chunk('const PITCH_RANGE=','const MODES=')+chunk('function trainingEvaluation(a,completed){','function showTrainingResult(')+'\ntrainingEvaluation',{});
 for(const duration of [1000,8000,12000,21000]){
  const result=evaluate({mode:'vibrato',duration,valid:200,voicedMs:duration,validMs:duration*.5,estimate:{rate:5,depth:30}},true);
  const rule=translated(result.rule);assert.match(rule,/3–9 Hz/);assert.match(rule,/±7–125 cent/);assert.match(rule,/40%/);assert.match(rule,/0\.9 s/);
  translated(result.reason);
  const detail=translated('5.0Hz · ±30cent · 전체 '+duration/1000+'초 · 유효 측정 3.2초 · 마지막 유효 1초 전');
  assert.match(detail,/Total/);assert.match(detail,/Valid measurement 3\.2 s/);assert.match(detail,/1 s ago/);
 }
});

test('Long help sentences remain intact when composed with other instructions',()=>{
 const catalog=require(web+'/i18n-en.js');
 for(const source of Object.keys(catalog).filter(s=>s.length>=30&&/[가-힣]/.test(s))){
  translated('설명 · '+source+' · 현재 설정');
  assert.equal(i18n.t(source,'ko'),source);
 }
});

test('App-owned native microphone, file and interruption messages have English translations',()=>{
 const java=path.join(__dirname,'../app/src/main/java/com/voiceline/app');
 for(const file of fs.readdirSync(java).filter(f=>f.endsWith('.java'))){
  const source=fs.readFileSync(path.join(java,file),'utf8');
  for(const match of source.matchAll(/"((?:[^"\\]|\\.)*)"/g))if(/[가-힣]/.test(match[1])){
   const text=JSON.parse('"'+match[1]+'"');translated(text);
  }
 }
});
