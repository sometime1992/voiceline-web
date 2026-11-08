'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const i18n=require('../app/src/main/assets/www/i18n.js'),rec=require('../app/src/main/assets/www/practice-recommendations.js');
test('Korean remains the default and unsupported language choices cannot change it',()=>{
 assert.equal(i18n.language,'ko');assert.equal(i18n.t('성공'),'성공');assert.equal(i18n.setLanguage('xx'),false);assert.equal(i18n.language,'ko');
});
test('English preserves scientific octaves, numerical results and threshold explanations',()=>{
 assert.equal(i18n.t('C4 · 2옥 도','en'),'C4 · Do');assert.equal(i18n.t('C♯4 · 2옥 도♯','en'),'C♯4 · Do♯');
 assert.equal(i18n.t('측정 부족','en'),'Not enough data');assert.equal(i18n.t('미달성','en'),'Target not met');
 assert.equal(i18n.t('음정 일치율 86% · 발성 커버리지 78% · 유효 발성 7.8초','en'),'Pitch accuracy 86% · Voice coverage 78% · Valid singing 7.8 s');
 assert.equal(i18n.t('2단계 · 발성 유지 · 6초','en'),'Step 2 · Sustain · 6 s');
 const threshold=i18n.t('각 모음의 각 음 20% 이상 (음 시작 0.28초 제외)','en');assert.doesNotMatch(threshold,/[가-힣]/);assert.match(threshold,/20%/);assert.match(threshold,/0\.28 s/);
});
test('Every feature-specific level exposes English goals, notes and actual recommended values',()=>{
 const leaks=[];
 for(const mode of rec.MODES)for(const level of Object.keys(rec.LEVELS)){
  const card=rec.card(mode,level,{},48);for(const value of [card.goal,card.note,...card.rows.flatMap(r=>[r.label,r.value]),card.description.totalText,card.description.audio]){
   const output=i18n.t(value,'en');if(/[가-힣]/.test(output))leaks.push({mode,level,value,output});
  }
 }
 assert.deepEqual(leaks,[]);
});
