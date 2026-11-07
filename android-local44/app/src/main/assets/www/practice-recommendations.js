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
 const GUIDANCE=Object.freeze({
  piano:{rootKind:'keyboard',rootLabel:'건반 시작음',intro:'건반을 직접 눌러 소리를 듣는 연습입니다. 음 위치·반음·옥타브를 구별하는 방법을 단계별로 추천합니다.',
   goals:['건반 위치와 한 음의 소리 익히기','이웃한 반음의 차이 구별하기','옥타브와 도약한 음 비교하기'],
   notes:['한 건반씩 누르고 표시된 음 이름과 소리를 함께 확인하세요. 자동 연주나 가창 채점은 없습니다.','흰건반과 옆 검은건반을 번갈아 눌러 반음 차이를 들어보세요.','낮은 도와 높은 도, 도·미·솔을 직접 눌러 음 사이의 차이를 비교하세요.']},
  practice:{rootKind:'pitch',rootLabel:'음정 연습 시작음',intro:'선택한 음계·도약 패턴을 목표 음정에 맞춰 따라 부르는 설정입니다. 편한 시작음을 고르세요.',
   goals:['3음 음계를 먼저 듣고 따라 부르기','5음 음계를 반음씩 옮겨 정확하게 부르기','아르페지오의 넓은 도약을 바로 따라 부르기'],
   notes:['도레미레도의 짧은 구절과 넓은 허용 오차로 시작합니다. 듣기·들이쉬기·쉬기는 채점하지 않습니다.','도레미파솔파미레도를 먼저 듣고 따라 부릅니다. 반복할 때 시작음이 한 반음씩 이동합니다.','도미솔도솔미도의 도약을 연결합니다. 넓은 음역이 부담되면 시작음을 낮추거나 중급자 설정을 고르세요.']},
  sustainVoice:{rootKind:'pitch',rootMax:84,rootLabel:'유지할 기준음',intro:'한 음을 일정한 높이로 유지하는 연습입니다. 유지 시간·반복 횟수·회복 시간을 추천합니다.',
   goals:['한 음을 4초 동안 편안하게 유지하기','한 음을 6초 동안 안정적으로 유지하기','한 음을 8초 동안 끝까지 고르게 유지하기'],
   notes:['기준음을 듣고 숨을 들이쉰 뒤 같은 음을 유지하세요. 숨을 끝까지 밀어내지 말고 반복 사이에 쉬세요.','시작과 끝의 음높이가 달라지지 않게 유지하세요. 소리를 크게 만드는 연습은 아닙니다.','긴 발성에서도 음높이와 소리를 고르게 유지하세요. 불편하면 시간을 줄여 연습하세요.']},
  earVoice:{rootKind:'pitch',rootMax:84,rootLabel:'청음 기준음',intro:'피아노 음을 듣고 같은 음을 다시 부르는 연습입니다. 음 순서·들을 음 수·듣기와 응답 시간을 추천합니다.',
   goals:['같은 음을 반복해서 듣고 재현하기','장조 상행 음을 듣고 재현하기','3화음의 도약을 듣고 재현하기'],
   notes:['같은 음을 세 번 듣고 따라 부릅니다. 듣는 동안 정답 건반을 숨기고, 응답 구간만 채점합니다.','서로 다른 네 음을 차례로 듣고 따라 부릅니다. 음 사이에 숨을 고르고 다음 소리를 들으세요.','도미솔미도의 다섯 음을 듣고 따라 부릅니다. 앞 음과의 간격을 떠올린 뒤 소리를 내세요.']},
  dynamicVoice:{rootKind:'pitch',rootMax:84,rootLabel:'강약 연습 기준음',intro:'같은 음높이를 유지하면서 상대적인 소리 크기를 조절하는 연습입니다. 강약 패턴과 발성·회복 시간을 추천합니다.',
   goals:['약한 소리로 기준을 잡고 일정한 세기 유지하기','점점 커졌다 작아지는 강약 곡선 따라가기','더 긴 강약 곡선에서도 같은 음높이 유지하기'],
   notes:['처음 약한 발성으로 기준을 잡은 뒤 중간 세기를 고르게 유지하세요. 휴대폰과 입 사이 거리를 고정하세요.','개인 기준을 잡고 점점 크게 → 점점 작게 진행합니다. 목에 힘을 주거나 최대 음량을 내지 마세요.','긴 곡선을 부드럽게 따라가되 음높이가 함께 올라가지 않게 유지하세요. 기준은 상대 음량입니다.']},
  vibrato:{rootKind:'pitch',rootMax:94,rootLabel:'비브라토 기준음',intro:'한 음 주변의 자연스러운 흔들림을 관찰·유지하는 연습입니다. 발성 길이·반복·휴식만 단계별로 조절하며 감지 기준은 동일합니다.',
   goals:['짧게 발성하며 자연스러운 흔들림 관찰하기','같은 음 주변의 흔들림을 연속으로 유지하기','더 긴 발성에서도 음높이 중심 유지하기'],
   notes:['흔들림을 억지로 만들지 마세요. 감지되지 않으면 목을 흔들기보다 편안한 한 음 유지부터 연습하세요.','기준음 중심을 유지하며 흔들림이 끊기지 않는지 확인하세요. 속도와 진폭을 크게 만들 필요는 없습니다.','발성이 길어져도 중심 음정과 편안함을 유지하세요. 초심자·중급자와 같은 감지 기준을 사용합니다.']},
  warmupVoice:{rootKind:'none',intro:'들이쉬기 → 내쉬기 → 허밍 → 쉬기를 안내하는 타이머입니다. 각 단계의 시간과 세트 수를 추천합니다.',
   goals:['짧은 호흡과 허밍으로 부드럽게 준비하기','호흡과 허밍을 일정한 흐름으로 이어가기','조금 긴 호흡·허밍 과정으로 준비하기'],
   notes:['숨을 강하게 채우거나 참지 말고 편안하게 진행하세요. 음정·실제 호흡량은 측정하지 않습니다.','들이쉬기·내쉬기·허밍·쉬기를 안내에 맞춰 반복하세요. 숨이 부족하면 자연스럽게 다시 들이쉬세요.','단계가 길어져도 숨을 억지로 밀어내지 마세요. 실제 호흡량이나 허밍 정확도를 평가하는 기능은 아닙니다.']},
  metronome:{rootKind:'none',intro:'박자에 맞춰 리듬을 익히는 설정입니다. BPM·박자표·한 박의 분할을 추천하며 마이크나 기준음은 사용하지 않습니다.',
   goals:['4분음표의 기본 박 익히기','한 박을 두 번으로 나누는 8분음표 리듬 익히기','한 박을 네 번으로 나누는 16분음표 리듬 익히기'],
   notes:['첫 박의 강세를 듣고 네 박을 일정하게 세어보세요. 직접 중지할 때까지 재생합니다.','한 박 안의 두 클릭을 고르게 나누어 세어보세요. 빠르기가 부담되면 BPM을 낮추세요.','한 박 안의 네 클릭을 고르게 나누어 세어보세요. 분할이 빨라도 기본 박을 놓치지 않는 것이 목표입니다.']}
 });
 const levelId=value=>Object.hasOwn(LEVELS,value)?value:'beginner';
 const selectedRoot=(value,mode)=>Math.max(36,Math.min(GUIDANCE[mode]?.rootMax||80,Math.round(Number(value)||48)));
 const keyboardRoot=value=>Math.max(24,Math.min(84,Math.floor((Number(value)||48)/12)*12));
 function context(mode){
  if(!mode)return {rootKind:'pitch',rootLabel:'루틴의 편안한 시작음',intro:NOTE};
  if(!Object.hasOwn(GUIDANCE,mode))throw Error('추천 설정을 지원하지 않는 기능입니다.');
  return GUIDANCE[mode];
 }
 function initialRoot(mode,base={}){return mode==='piano'?keyboardRoot(base.base):selectedRoot(mode==='practice'?base.guide?.root:mode==='vibrato'?base.vibratoRoot:base.training?.root,mode);}
 function preset(mode,level='beginner',base={},root=48){
  if(!MODES.includes(mode))throw Error('이 기능은 직접 시작하고 종료하는 도구입니다.');
  level=levelId(level);const i=['beginner','intermediate','advanced'].indexOf(level),midi=selectedRoot(root,mode),p=settings.prepare(mode,base),t=plans.timing(mode);
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
   Object.assign(t,{seconds:0,rounds:1,rest:0});Object.assign(p.metronome,{numerator:4,denominator:4,bpm:[60,72,84][i],unit:'quarter',subdivision:[1,2,4][i],accents:[2,1,1,1]});
  }else if(mode==='piano'){
   Object.assign(t,{seconds:0,rounds:1,rest:0});p.base=keyboardRoot(root);
  }
  return {mode,timing:t,params:settings.prepare(mode,p)};
 }
 function card(mode,level='beginner',base={},root=48,label=settings.noteLabel){
  level=levelId(level);const index=['beginner','intermediate','advanced'].indexOf(level),meta=context(mode),value=preset(mode,level,base,root),p=value.params,t=value.timing;
  const d=settings.describe(mode,t,p,false,label),rows=[],row=(name,value)=>rows.push({label:name,value:String(value)}),repeat=()=>{row('반복',t.rounds+'회');row('반복 사이 회복',t.rest+'초');};
  if(mode==='piano'){row('건반 시작음',label(p.base));row('연주 방식','건반을 직접 눌러 듣기');row('종료 방식','직접 중단');}
  else if(mode==='practice'){row('연습 패턴',d.title);row('연습 방식',p.guide.listenFirst?'먼저 듣고 따라 부르기':'바로 따라 부르기');row('한 음 길이',p.guide.noteSeconds+'초');row('반복·시작음 이동',p.guide.rounds+'회 · '+(p.guide.shift?'반복마다 +1반음':'같은 시작음'));row('허용 오차','±'+p.guide.tolerance+'cent');row('들이쉬기·회복',p.guide.breathSeconds+'초 · '+p.guide.restSeconds+'초');}
  else if(mode==='sustainVoice'){row('유지할 기준음',label(p.training.root));row('한 번 유지 시간',t.seconds+'초');repeat();row('듣기·들이쉬기',t.reference+'초 · '+t.breath+'초');}
  else if(mode==='earVoice'){row('청음 방법',plans.EAR_PATTERNS[p.training.earPattern]);row('음 순서',plans.earSequence(p.training).map(label).join(' → '));row('듣기·따라 부르기',t.listen+'초 · '+t.answer+'초');row('들이쉬기·음 사이 쉬기',t.breath+'초 · '+t.noteRest+'초');repeat();}
  else if(mode==='dynamicVoice'){row('강약 패턴',d.title);row('발성 단계',d.phases.filter(s=>s.kind==='voice').map(s=>s.label+' '+s.seconds+'초').join(' → '));row('전체 발성 시간',t.seconds+'초');repeat();}
  else if(mode==='vibrato'){row('비브라토 기준음',label(p.vibratoRoot));row('한 번 발성 시간',t.seconds+'초');repeat();row('듣기·들이쉬기',t.reference+'초 · '+t.breath+'초');row('감지 기준','최근 3초 · 3~9Hz · 진폭 ±7~125cent');}
  else if(mode==='warmupVoice'){const w=p.training.warmup;for(const [key,name]of [['inhale','들이쉬기'],['exhale','내쉬기'],['hum','허밍'],['rest','쉬기']])row(name,w[key]+'초');row('진행 횟수',t.rounds+'세트');row('단계 안내음',w.cues?'켜기':'끄기');}
  else if(mode==='metronome'){row('템포',p.metronome.bpm+' BPM');row('박자표',p.metronome.numerator+'/'+p.metronome.denominator);row('BPM 기준','4분음표');row('한 박의 분할',p.metronome.subdivision+'회');row('종료 방식','직접 중단');}
  return {mode,level,label:LEVELS[level].label,goal:meta.goals[index],note:meta.notes[index],rows,value,description:d};
 }
 function routine(level='beginner',root=48,base={}){
  level=levelId(level);root=selectedRoot(root);const steps=[];
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
 return {LEVELS,SOURCES,NOTE,BASIS,MODES,levelId,selectedRoot,keyboardRoot,context,initialRoot,card,preset,routine,initialize};
});
