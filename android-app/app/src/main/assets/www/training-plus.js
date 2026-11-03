'use strict';
// VOICE LINE 1.1: 단계별 훈련 구성과 사용법 미리보기.
// 기존 오디오 분석은 변경하지 않습니다. 아래 패턴은 각 단계의 반음 차이를 나타냅니다.
const TRAINING_PATTERNS = {
  scale: {title:'기본 음계',category:'기초',offsets:[0,2,4,5,7,5,4,2,0],labels:['도','레','미','파','솔','파','미','레','도'],tip:'음이 바뀔 때 급히 밀지 말고 편안하게 한 계단씩 이동하세요.',goal:'음의 높낮이를 차례대로 따라가는 기본 연습'},
  vowel: {title:'모음 발성',category:'발성',offsets:[0,2,4,5,7,5,4,2,0],labels:['아','에','이','오','우','오','이','에','아'],tip:'턱에 힘을 빼고 모음이 바뀔 때도 소리의 크기를 일정하게 유지하세요.',goal:'모음 변화에 따른 음정 흔들림 관찰'},
  leap: {title:'음정 도약',category:'음정',offsets:[0,4,7,4,0,7,4,0],labels:['도','미','솔','미','도','솔','미','도'],tip:'도약한 뒤 목표음에 안정적으로 도착하는 데 집중하세요.',goal:'넓은 음정 간격을 정확히 이동'},
  descending: {title:'하행 음계',category:'기초',offsets:[0,-2,-4,-5,-7,-5,-4,-2,0],labels:['시작','↓','↓','↓','낮게','↑','↑','↑','시작'],tip:'저음으로 내려갈수록 힘을 빼고 자연스러운 목소리로 부르세요.',goal:'낮아지는 음정의 안정적인 연결'},
  arpeggio: {title:'아르페지오',category:'음정',offsets:[0,4,7,12,7,4,0],labels:['도','미','솔','높은 도','솔','미','도'],tip:'음 사이를 점프하듯 바꾸되 목에 부담이 가면 시작 음을 낮추세요.',goal:'화음 구성음을 자연스럽게 이어 부르기'},
  chromatic: {title:'반음 이동',category:'정밀',offsets:[0,1,2,3,4,3,2,1,0],labels:['시작','+1','+2','+3','+4','+3','+2','+1','시작'],tip:'인접한 목표음이 가깝기 때문에 화면의 센트 편차를 확인하세요.',goal:'가까운 음을 세밀하게 구별하는 연습'},
  sustain: {title:'한 음 길게',category:'기초',offsets:[0,0,0,0],labels:['유지','유지','유지','유지'],tip:'4구간 동안 같은 음을 안정적으로 유지하세요. 숨이 부족하면 중간에 쉬어도 됩니다.',goal:'하나의 음을 흔들림 적게 유지하는 훈련'},
  thirds: {title:'3도 간격',category:'음정',offsets:[0,4,0,4,0,3,0,3,0],labels:['기준','장3도','기준','장3도','기준','단3도','기준','단3도','기준'],tip:'기준음으로 되돌아올 때마다 중심 음정이 같아지는지 확인하세요.',goal:'장3도와 단3도 음정 간격 구별'},
  fifths: {title:'5도 간격',category:'음정',offsets:[0,7,0,7,0,5,0,5,0],labels:['기준','완전5도','기준','완전5도','기준','완전4도','기준','완전4도','기준'],tip:'음 간격이 큽니다. 높은 음이 어렵다면 시작 음정을 낮춰 주세요.',goal:'완전5도·완전4도 왕복 연습'},
  octave: {title:'옥타브 왕복',category:'도전',offsets:[0,12,0,12,0],labels:['아래','위','아래','위','아래'],tip:'높은 음이 불편하면 즉시 중단하고 더 낮은 시작 음을 선택하세요.',goal:'같은 음이름의 낮은 음과 높은 음 이동'},
  low: {title:'편안한 저음',category:'발성',offsets:[0,-2,-4,-5,-7,-5,-4,-2,0],labels:['시작','하행','하행','하행','최저','상행','상행','상행','시작'],tip:'숨을 과하게 밀지 말고 목에 부담이 없는 음까지만 시도하세요.',goal:'저음으로 내려갔다 원래 음으로 돌아오기'},
  high: {title:'점진적 고음',category:'도전',offsets:[0,2,4,5,7,9,12,9,7,5,4,2,0],labels:['시작','2','3','4','5','6','8','6','5','4','3','2','시작'],tip:'높은 음을 억지로 내지 마세요. 편안하게 나오지 않으면 시작 음을 낮추세요.',goal:'한 번에 높이 올리지 않고 점진적으로 고음 접근'}
};

// 기존 훈련 엔진(getExerciseSteps, scoring, graph)에 패턴을 그대로 연결합니다.
getSteps = function getTrainingSteps(){
  const root=Number(document.getElementById('rootSelect').value);
  const pattern=TRAINING_PATTERNS[document.getElementById('patternSelect').value]||TRAINING_PATTERNS.scale;
  return pattern.offsets.map((offset,index)=>({midi:root+offset,vowel:pattern.labels[index]}));
};
bounds = function getTrainingBounds(){
  if(state.mode==='practice'){
    const steps=getSteps();
    const notes=steps.map(s=>s.midi),min=Math.min(...notes),max=Math.max(...notes);
    const center=(min+max)/2,span=Math.max(18,max-min+8);
    return [center-span/2,center+span/2];
  }
  if(state.lowMidi!==null){const center=(state.lowMidi+state.highMidi)/2;const span=Math.max(22,state.highMidi-state.lowMidi+12);return [center-span/2,center+span/2];}
  if(state.current)return [state.current.midi-13,state.current.midi+13];
  return [47,83];
};

function updatePatternGuide(){
  const pattern=TRAINING_PATTERNS[document.getElementById('patternSelect').value]||TRAINING_PATTERNS.scale;
  const steps=getSteps();
  document.getElementById('patternCategory').textContent=pattern.category+' · '+steps.length+'단계';
  document.getElementById('patternGoal').textContent=pattern.goal;
  document.getElementById('patternTip').textContent=pattern.tip;
  const secondsTotal=steps.length*(Number(document.getElementById('speedSelect').value)/1000)*Number(document.getElementById('repeatSelect').value);
  document.getElementById('patternDuration').textContent='예상 시간 '+(secondsTotal>=60?Math.floor(secondsTotal/60)+'분 '+Math.round(secondsTotal%60)+'초':Math.round(secondsTotal)+'초')+' + 준비 3초';
  const path=document.getElementById('patternSequence');path.replaceChildren();
  for(const step of steps){
    const chip=document.createElement('span');chip.className='note-chip';
    chip.textContent=koreanFullNote(step.midi)+' · '+noteLabel(step.midi);chip.title=step.vowel+' · '+noteLabel(step.midi);
    path.append(chip);
  }
  if(!state.exercise||state.exercise.done)drawChart(state.lastElapsed);
}
for(const id of ['patternSelect','rootSelect','speedSelect','repeatSelect']){
  document.getElementById(id).addEventListener('change',updatePatternGuide);
}
updatePatternGuide();
