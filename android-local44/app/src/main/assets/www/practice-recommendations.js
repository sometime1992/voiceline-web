'use strict';
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./practice-plans.js'),require('./practice-settings.js'));
 else root.VoiceLineRecommendations=factory(root.VoiceLinePracticePlans,root.VoiceLinePracticeSettings);
})(globalThis,(plans,settings)=>{
 const LEVELS=Object.freeze({
  beginner:{label:'초심자',goal:'짧은 발성과 3음 음계 · 먼저 듣고 따라 부르기',note:'처음 시작하거나 쉬었다가 다시 연습할 때. 비브라토는 자연스러운 흔들림 관찰용으로만 사용하세요.'},
  intermediate:{label:'중급자',goal:'5음 음계와 청음 · 부드러운 강약 변화',note:'짧은 음계를 편하게 부를 수 있을 때. 정확도와 연결에 집중하고 힘을 더 주지 마세요.'},
  advanced:{label:'상급자',goal:'아르페지오·모음 전환 · 표현과 연결',note:'도약과 강약 조절에 익숙할 때. 높은 음이나 큰 음량을 강요하지 않으며 시작음은 직접 맞춥니다.'}
 });
 const SOURCES=Object.freeze([
  {id:'duke',title:'Duke Voice Care Center · Ideas for Vocal Exercises',url:'https://chorusamerica.org/sites/default/files/resources/VocalExercises_DukeVoiceCareCenter.pdf',principle:'짧고 단순한 음계에서 도약·강약 변화로 점진적으로 진행'},
  {id:'trinity',title:'Trinity College London · Effective warm-ups',url:'https://www.trinitycollege.com/qualifications/music/teachers-guide-to-singing/effective-warm-ups',principle:'편한 음역의 작은 소리, 호흡·허밍부터 워밍업'},
  {id:'berklee',title:'Berklee Online · Voice Technique 101',url:'https://online.berklee.edu/courses/voice-technique-101',principle:'워밍업·기술 연습·정리로 균형 있게 구성'},
  {id:'nidcd',title:'NIH/NIDCD · Taking Care of Your Voice',url:'https://www.nidcd.nih.gov/health/taking-care-your-voice',principle:'휴식과 수분 섭취, 피로하거나 쉰 목소리일 때 무리하지 않기'}
 ]);
 const NOTE='단계는 연습 경험을 뜻하며 음역·성별 구분이 아닙니다. 편안한 시작음을 선택하세요. 통증·쉰 목소리·어지러움이 생기면 멈추고 쉬세요.';
 const BASIS='공개 교육 자료의 원칙을 참고해 VoiceLine용으로 구성한 예시입니다. 초·반복·허용 음정 수치는 기관의 공식 처방이나 개인 진단값이 아닙니다.';
 const MODES=Object.freeze(['piano','practice','sustainVoice','earVoice','dynamicVoice','vibrato','warmupVoice','metronome']);
 const levelId=value=>Object.hasOwn(LEVELS,value)?value:'beginner';
 const selectedRoot=value=>Math.max(36,Math.min(80,Math.round(Number(value)||48)));
 function preset(mode,level='beginner',base={},root=48){
  if(!MODES.includes(mode))throw Error('이 기능은 직접 시작하고 종료하는 도구입니다.');
  level=levelId(level);const i=['beginner','intermediate','advanced'].indexOf(level),midi=selectedRoot(root),p=settings.prepare(mode,base),t=plans.timing(mode);
  Object.assign(t,{rounds:[2,3,3][i],rest:[5,6,8][i],reference:1.8,breath:3,prepare:1.8,customStages:false,stages:[]});
  if(mode==='practice'){
   Object.assign(t,{rounds:3,rest:0});
   p.guide={...p.guide,pattern:['three','five','arpeggio'][i],root:midi,rounds:3,shift:i===0?0:1,noteSeconds:[1.1,.8,.7][i],listenFirst:i<2,sound:'piano',tolerance:[75,50,35][i],prepareSeconds:1.8,breathSeconds:3,restSeconds:[5,5,6][i],smoothSeconds:[6,8,8][i]};
  }else if(mode==='sustainVoice'){
   t.seconds=[4,6,8][i];p.training.root=midi;p.training.sustainSeconds=t.seconds;
  }else if(mode==='earVoice'){
   Object.assign(t,{rounds:i===0?1:2,listen:1.5,breath:2,answer:3,noteRest:2,rest:8});
   Object.assign(p.training,{root:midi,earCount:[3,4,5][i],earPattern:['same','up','triad'][i]});delete p.training.earNotes;
  }else if(mode==='dynamicVoice'){
   t.seconds=[8,12,16][i];Object.assign(p.training,{root:midi,dynamicPattern:i===0?'steady':'swell',dynamicSeconds:t.seconds});
  }else if(mode==='vibrato'){
   Object.assign(t,{seconds:[4,6,8][i],rounds:[2,2,3][i],rest:[6,8,10][i]});p.vibratoRoot=midi;
  }else if(mode==='warmupVoice'){
   t.rounds=[3,4,4][i];p.training.rounds=t.rounds;p.training.warmup={...p.training.warmup,inhale:[3,3,4][i],exhale:[4,5,6][i],hum:[3,4,5][i],rest:[4,5,5][i]};
  }else if(mode==='metronome'){
   Object.assign(t,{seconds:0,rounds:1,rest:0});Object.assign(p.metronome,{numerator:4,denominator:4,bpm:[60,72,84][i],unit:'quarter',subdivision:1});
  }else if(mode==='piano'){
   Object.assign(t,{seconds:0,rounds:1,rest:0});p.base=Math.floor(midi/12)*12;
  }
  return {mode,timing:t,params:settings.prepare(mode,p)};
 }
 function routine(level='beginner',root=48,base={}){
  level=levelId(level);const steps=[];
  const add=(mode,changes={})=>{const p=preset(mode,level,base,root);Object.assign(p.timing,changes.timing||{});if(changes.guide)Object.assign(p.params.guide,changes.guide);if(changes.warmup)Object.assign(p.params.training.warmup,changes.warmup);const s=plans.step(p);s.params=settings.prepare(mode,s.params,true);steps.push(s);};
  const rest=seconds=>steps.push(plans.step({mode:'rest',timing:{seconds,rounds:1,rest:0},params:settings.prepare('rest',base,true)}));
  add('warmupVoice');rest(15);add('sustainVoice',{timing:{rounds:3}});rest(15);
  add('practice',{timing:{rounds:level==='beginner'?4:3}});rest(20);add('earVoice',{timing:{rounds:2}});rest(15);
  if(level!=='beginner'){
   add('dynamicVoice',{timing:{rounds:2,rest:8}});rest(20);
   add('practice',{timing:{rounds:2},guide:{pattern:level==='advanced'?'smooth12':'smooth5',smoothSeconds:8,listenFirst:false,shift:0,restSeconds:6}});rest(15);
  }
  if(level==='advanced'){
   add('practice',{timing:{rounds:1},guide:{pattern:'vowelTriad',noteSeconds:.7,listenFirst:false,shift:0,restSeconds:6}});rest(20);
   add('vibrato',{timing:{rounds:2}});rest(15);
  }
  add('warmupVoice',{timing:{rounds:2},warmup:{inhale:3,exhale:4,hum:3,rest:5}});
  return plans.routine({name:LEVELS[level].label+' · '+({beginner:'기초 익히기',intermediate:'음정과 표현',advanced:'연결과 표현 심화'})[level],rounds:1,steps});
 }
 function initialize(storage){
  if(!storage)return false;
  const keys=['voiceline-plans-v1','voiceline-training-v1','voiceline-unified-practice-v1','voiceline-practice-v1','voiceline-guide-v1','voiceline-vibrato-root-v1','voiceline-keyboard-base-v1','voiceline-piano-volume-v1','voiceline-mic-sensitivity-v1','voiceline-metronome-v1','voiceline-metronome-presets-v1'];
  const written=[];
  try{
   if(keys.some(key=>storage.getItem(key)!==null))return false;
   const tr={};for(const mode of ['warmupVoice','sustainVoice','earVoice','dynamicVoice'])Object.assign(tr,preset(mode).params.training);
   // Each feature keeps its own timing; shared pitch starts at the existing C3.
   tr.sustainSeconds=4;tr.earCount=3;tr.earPattern='same';tr.rounds=3;tr.dynamicPattern='steady';tr.dynamicSeconds=8;tr.warmup={inhale:3,exhale:4,hum:3,rest:4,cues:true};
   const values={'voiceline-training-v1':tr,'voiceline-unified-practice-v1':preset('practice').params.guide,'voiceline-metronome-v1':preset('metronome').params.metronome,'voiceline-plans-v1':{version:1,routines:[],settings:Object.fromEntries(MODES.map(mode=>[mode,preset(mode).timing]))}};
   for(const [key,value]of Object.entries(values)){storage.setItem(key,JSON.stringify(value));written.push(key);}return true;
  }catch(_){for(const key of written)try{storage.removeItem(key);}catch(_){}return false;}
 }
 return {LEVELS,SOURCES,NOTE,BASIS,MODES,levelId,selectedRoot,preset,routine,initialize};
});
