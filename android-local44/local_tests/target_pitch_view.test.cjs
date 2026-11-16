'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const web=path.join(__dirname,'../app/src/main/assets/www');
const source=fs.readFileSync(path.join(web,'piano.js'),'utf8');
const chunk=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const guide=require(web+'/guide-training.js'),i18n=require(web+'/i18n.js');
function fixture(mode,root){
 const app={mode,trainingSettings:{root}},nodes=new Map();
 const $=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{}});return nodes.get(id);};
 const api=vm.runInNewContext(chunk('const PITCH_RANGE=','const MODES=')+
  chunk('function trainingTargetAt(','function newTrainingSession(')+
  chunk('function trainingPitchView(','function renderTrainingOverlay(')+
  '\n({trainingPitchView,updateTrainingPitchGuide,trainingOverlaySession})',{app,$,noteLabel:m=>'MIDI '+m});
 return {app,$,...api};
}
test('Held-note views use the selected note before input, during preparation, and with octave errors',()=>{
 for(const mode of ['sustainVoice','dynamicVoice'])for(const root of [36,48,57,69,84]){
  const h=fixture(mode,root),preview=h.trainingPitchView(null,0);
  assert.equal(preview.target,root);assert.equal((preview.low+preview.high)/2,root);
  assert.equal(preview.high-preview.low,4);
  const session={mode,root,start:1000,duration:8000,history:[{t:100,midi:root+12}]};
  const before=JSON.stringify(session),active=h.trainingPitchView(session,100);
  assert.deepEqual(JSON.parse(JSON.stringify(active)),JSON.parse(JSON.stringify(preview)));
  assert.equal(JSON.stringify(session),before,'display must not rewrite detected pitch or scoring');
  assert.equal(active.tolerance,mode==='dynamicVoice'?55:35);
 }
});
test('Ear training exposes each goal only during its answer, including repeated cycles',()=>{
 const h=fixture('earVoice',48),s={mode:'earVoice',root:48,start:1000,duration:9400,earNotes:[50,55],earCycleMs:4700,earListenMs:1500,earBreathMs:0,earAnswerMs:3200};
 for(const time of [0,1000,2499,5700,7199,10400])assert.equal(h.trainingPitchView(s,time).target,null,time+' hidden answer');
 for(const [time,target]of [[2500,50],[5699,50],[7200,55],[10399,55]]){
  const view=h.trainingPitchView(s,time);assert.equal(view.target,target);assert.equal((view.high+view.low)/2,target);
 }
 assert.equal(h.trainingPitchView(null,0).target,null);
});
test('Changing the dynamics reference cannot reuse the previous result as the new preview',()=>{
 const h=fixture('dynamicVoice',48),result=h.app.dynamicLastResult={mode:'dynamicVoice',root:48,finishedAt:1000};
 assert.equal(h.trainingOverlaySession(),result);
 h.app.trainingSettings.root=69;assert.equal(h.trainingOverlaySession(),null);
 assert.equal(h.trainingPitchView(h.trainingOverlaySession(),2000).target,69);
 const live=h.app.training={mode:'dynamicVoice',root:48,active:true};assert.equal(h.trainingOverlaySession(),live,'active session owns its target until stopped');
});
test('Live target readout shows actual cents, stale silence, and no hidden ear answer',()=>{
 const h=fixture('sustainVoice',48),s={mode:'sustainVoice',root:48,history:[{t:1000,midi:60}]};
 h.updateTrainingPitchGuide(s,1000,h.trainingPitchView(s,1000));
 assert.equal(h.$('trainingPitchOffset').textContent,'+1200cent');assert.equal(h.$('trainingPitchOffset').dataset.match,'away');
 h.updateTrainingPitchGuide(s,1300,h.trainingPitchView(s,1300));assert.equal(h.$('trainingPitchOffset').textContent,'목소리 대기');
 h.app.mode='earVoice';h.updateTrainingPitchGuide(null,1300,h.trainingPitchView(null,1300));
 assert.equal(h.$('trainingPitchGuide').hidden,true);assert.equal(h.$('trainingPitchTarget').textContent,'');
});
test('Unified held-note practice keeps a centered range for low/high roots and full error data',()=>{
 for(const root of [36,48,69,84]){
  const s=guide.create({pattern:'hold',root,rounds:1,listenFirst:false,prepareSeconds:0,breathSeconds:0},0),t=s.start+1000;
  const error=root>80?root-12:root+12;
  const before=guide.plotView(s,t);guide.receive(s,t,error);const after=guide.plotView(s,t);
  assert.equal(before.low,s.roots[0]-2);assert.equal(before.high,s.roots[0]+2);
  assert.equal(after.low,before.low);assert.equal(after.high,before.high);assert.equal(s.history.at(-1).midi,error);
 }
});
test('Sensitivity and target descriptions localize without changing their values',()=>{
 for(const [ko,en]of [['🎤 감도 표준','🎤 Sensitivity: Standard'],['🎤 감도 민감','🎤 Sensitivity: Sensitive'],['🎤 감도 최대','🎤 Sensitivity: High']]){
  assert.equal(i18n.t(ko,'en'),en);assert.equal(i18n.t(ko,'ko'),ko);
 }
 for(const text of ['목표 C4 · 2옥 도 · 표시 범위 ±200cent · 허용 구간 ±35cent','기준음 A4 · 2옥 라 · 표시 범위 ±110cent · 기준음 대비 센트 차이','↑ 범위 밖','↓ 범위 밖','목표 음정 안내',...['표준','민감','최대'].map(s=>'마이크 감도 '+s+'. 누르면 감도 선택')]){
  const en=i18n.t(text,'en');assert.doesNotMatch(en,/[가-힣]/,en);assert.equal(i18n.t(text,'ko'),text);
 }
});
test('Studio link accessibility and the complete piano attribution are English without losing credit or license URLs',()=>{
 const html=fs.readFileSync(web+'/index.html','utf8'),label=html.match(/id="studioYoutubeLink"[^>]*aria-label="([^"]+)"/)[1];
 assert.equal(i18n.t(label,'en'),'Open the Naruvium Studio YouTube channel');
 const credit=source.match(/\['피아노 음원 및 저작권','([^']+)'\]/)[1],english=i18n.t(credit,'en');
 assert.doesNotMatch(english,/[가-힣]/);
 for(const text of ['Alexander Holm','CC BY 3.0','https://creativecommons.org/licenses/by/3.0/','https://github.com/tambien/Piano/tree/0cd2c034f820c53e83ab22f5c13bd490b9e4de85/audio','Yotam Mann','MIT'])assert.ok(english.includes(text),text);
 assert.equal(i18n.t(credit,'ko'),credit);
});
