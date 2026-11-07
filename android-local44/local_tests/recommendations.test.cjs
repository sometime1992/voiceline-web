'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const rec=require('../app/src/main/assets/www/practice-recommendations.js'),settings=require('../app/src/main/assets/www/practice-settings.js'),guide=require('../app/src/main/assets/www/guide-training.js'),plans=require('../app/src/main/assets/www/practice-plans.js');
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};};
test('All three levels provide valid finite presets for every configurable feature',()=>{
 for(const level of Object.keys(rec.LEVELS))for(const mode of rec.MODES){const p=rec.preset(mode,level),d=settings.describe(mode,p.timing,p.params);assert.deepEqual(d.issues,[],level+' '+mode);assert.ok(d.repeats>0);assert.ok(Number.isFinite(d.totalSeconds)||['piano','metronome'].includes(mode));if(mode==='practice')assert.equal(p.params.guide.rounds,p.timing.rounds);}
 assert.throws(()=>rec.preset('record'));assert.throws(()=>rec.preset('pitch'));
});
test('Experience levels change complexity without assuming a higher or gendered starting pitch',()=>{
 for(const root of [36,48,60,80])for(const level of Object.keys(rec.LEVELS)){
  const p=rec.preset('practice',level,{},root),g=guide.plan(p.params.guide);assert.equal(p.params.guide.root,root);assert.equal(g.limited,false);for(const r of g.roots)for(const offset of g.pattern.steps)assert.ok(r+offset>=36&&r+offset<=94);
  for(const mode of ['sustainVoice','earVoice','dynamicVoice'])assert.equal(rec.preset(mode,level,{},root).params.training.root,root);
 }
 assert.equal(rec.preset('practice','beginner').params.guide.pattern,'three');assert.equal(rec.preset('practice','beginner').params.guide.listenFirst,true);assert.equal(rec.preset('practice','advanced').params.guide.pattern,'arpeggio');
});
test('Recommendation previews never mutate saved or current settings and keep volume and microphone preferences',()=>{
 const base={training:{root:60,earPattern:'custom',earNotes:[60,65],warmup:{hum:7}},guide:{root:60,pattern:'minor'},pianoVolume:37,micSensitivity:'high'},before=JSON.stringify(base);
 for(const mode of rec.MODES)for(const level of Object.keys(rec.LEVELS)){const p=rec.preset(mode,level,base,55);assert.equal(p.params.pianoVolume,37);assert.equal(p.params.micSensitivity,'high');}
 rec.routine('advanced',55,base);assert.equal(JSON.stringify(base),before);
 const first=rec.preset('practice');first.params.guide.root=80;assert.equal(rec.preset('practice').params.guide.root,48);
});
test('Recommended routines include recovery, start gently and finish gently; beginner has no forced vibrato or dynamics',()=>{
 let previous=0;
 for(const level of Object.keys(rec.LEVELS)){const p=rec.routine(level),d=settings.routine(p);assert.equal(p.rounds,1);assert.equal(p.steps[0].mode,'warmupVoice');assert.equal(p.steps.at(-1).mode,'warmupVoice');assert.ok(p.steps.some(s=>s.mode==='rest'&&s.timing.seconds>=15));assert.ok(p.steps.every(s=>!['pitch','record'].includes(s.mode)));assert.deepEqual(d.issues,[]);assert.ok(d.totalSeconds>previous);previous=d.totalSeconds;}
 const beginner=rec.routine('beginner');assert.ok(beginner.steps.every(s=>!['vibrato','dynamicVoice'].includes(s.mode)));
 for(const level of Object.keys(rec.LEVELS))for(const step of rec.routine(level).steps){assert.ok(step.params.training.warmup,'every step including recovery must open in the existing settings editor');assert.ok(step.params.guide&&step.params.metronome);}
});
test('Each recommended routine is an independent copy with fresh step identities',()=>{
 const a=rec.routine('beginner'),b=rec.routine('beginner');assert.notEqual(a.id,b.id);assert.notEqual(a.steps[0].id,b.steps[0].id);a.steps[0].params.training.warmup.hum=60;assert.equal(b.steps[0].params.training.warmup.hum,3);
});
test('New installations get a coherent beginner baseline without inserting saved routines',()=>{
 const s=storage();assert.equal(rec.initialize(s),true);const value=plans.load(s),tr=JSON.parse(s.getItem('voiceline-training-v1')),g=JSON.parse(s.getItem('voiceline-unified-practice-v1'));
 assert.equal(value.routines.length,0);assert.equal(tr.sustainSeconds,4);assert.equal(tr.earPattern,'same');assert.equal(g.pattern,'three');assert.equal(g.rounds,value.settings.practice.rounds);assert.equal(g.listenFirst,true);assert.equal(JSON.parse(s.getItem('voiceline-metronome-v1')).bpm,60);assert.equal(rec.initialize(s),false);
});
test('Any existing individual settings or routines survive initialization byte for byte',()=>{
 for(const key of ['voiceline-plans-v1','voiceline-training-v1','voiceline-unified-practice-v1','voiceline-practice-v1','voiceline-guide-v1','voiceline-piano-volume-v1','voiceline-metronome-v1','voiceline-metronome-presets-v1']){
  const s=storage();s.setItem(key,'{"saved":"exact contents"}');const before=[...s.data];assert.equal(rec.initialize(s),false);assert.deepEqual([...s.data],before);
 }
});
test('A failed initial settings write rolls back rather than leaving mixed recommendations',()=>{
 const s=storage(),write=s.setItem;let count=0;s.setItem=(k,v)=>{if(++count===2)throw Error('quota');write(k,v);};assert.equal(rec.initialize(s),false);assert.equal(s.data.size,0);
});
test('Educational sources are explicit and exact durations are identified as app examples',()=>{
 assert.equal(rec.SOURCES.length,4);assert.ok(rec.SOURCES.every(s=>s.url.startsWith('https://')));assert.match(rec.BASIS,/예시.*공식 처방.*아닙니다/);assert.match(rec.NOTE,/음역·성별 구분이 아닙니다/);
});
test('Each feature has its own goal, advice and preview fields for every level',()=>{
 const expected={piano:['건반 시작음','연주 방식'],practice:['연습 패턴','연습 방식','허용 오차'],sustainVoice:['한 번 유지 시간','반복 사이 회복'],earVoice:['청음 방법','음 순서','듣기·따라 부르기'],dynamicVoice:['강약 패턴','발성 단계'],vibrato:['한 번 발성 시간','감지 기준'],warmupVoice:['들이쉬기','내쉬기','허밍','쉬기'],metronome:['템포','박자표','BPM 기준','한 박의 분할']};
 for(const mode of rec.MODES)for(const level of Object.keys(rec.LEVELS)){
  const card=rec.card(mode,level);assert.equal(card.mode,mode);assert.notEqual(card.goal,rec.LEVELS[level].goal);assert.notEqual(card.note,rec.LEVELS[level].note);
  for(const field of expected[mode])assert.ok(card.rows.some(row=>row.label===field),mode+' missing '+field);
  if(['warmupVoice','metronome'].includes(mode))assert.doesNotMatch(card.goal+' '+card.note+' '+JSON.stringify(card.rows),/음계|아르페지오|청음|비브라토|기준음/);
 }
});
test('Only pitch-based functions ask for a reference note; piano uses actual octave starts',()=>{
 assert.equal(rec.context('warmupVoice').rootKind,'none');assert.equal(rec.context('metronome').rootKind,'none');assert.equal(rec.context('piano').rootKind,'keyboard');assert.equal(rec.context(null).rootKind,'pitch');
 assert.equal(rec.initialRoot('piano',{base:24,training:{root:60}}),24);assert.equal(rec.initialRoot('vibrato',{vibratoRoot:94}),94);assert.equal(rec.preset('sustainVoice','beginner',{},84).params.training.root,84);assert.equal(rec.preset('vibrato','beginner',{},94).params.vibratoRoot,94);assert.equal(rec.initialRoot('practice',{guide:{root:60},training:{root:48}}),60);
 for(const base of [24,36,48,60,72,84])assert.equal(rec.preset('piano','beginner',{},base).params.base,base);
});
test('Metronome recommendations progress through quarter, eighth and sixteenth subdivisions',()=>{
 for(const [level,bpm,subdivision]of [['beginner',60,1],['intermediate',72,2],['advanced',84,4]]){
  const c=rec.card('metronome',level);assert.equal(c.value.params.metronome.bpm,bpm);assert.equal(c.value.params.metronome.subdivision,subdivision);assert.equal(c.value.params.metronome.unit,'quarter');assert.deepEqual(c.value.params.metronome.accents,[2,1,1,1]);assert.equal(c.value.timing.seconds,0);
 }
});
test('Recommendation field values match the exact settings that will be edited and saved',()=>{
 for(const [level,hold,inhale,hum,vibrato]of [['beginner',4,3,3,4],['intermediate',6,3,4,6],['advanced',8,4,5,8]]){
  const sustain=rec.card('sustainVoice',level);assert.equal(sustain.rows.find(r=>r.label==='한 번 유지 시간').value,hold+'초');assert.equal(sustain.value.timing.seconds,hold);
  const warmup=rec.card('warmupVoice',level);assert.equal(warmup.rows.find(r=>r.label==='들이쉬기').value,inhale+'초');assert.equal(warmup.value.params.training.warmup.hum,hum);
  const vib=rec.card('vibrato',level);assert.equal(vib.rows.find(r=>r.label==='한 번 발성 시간').value,vibrato+'초');assert.equal(vib.value.timing.seconds,vibrato);
 }
 assert.equal(rec.card('practice','beginner').value.params.guide.tolerance,75);
});
test('Preview note names use the same Korean octaves as the live app',()=>{
 assert.equal(settings.noteLabel(48),'C3 · 1옥 도');assert.equal(settings.noteLabel(60),'C4 · 2옥 도');assert.equal(settings.noteLabel(61),'C♯4 · 2옥 도♯');
 assert.equal(rec.card('sustainVoice','beginner').rows[0].value,'C3 · 1옥 도');
});
