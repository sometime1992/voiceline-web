'use strict';
/* Phrase listening and response use one timeline. Only response time is scored. */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./reference-piano.js'):root.VoiceLineReferencePiano);if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VoiceLineGuideTraining=api;
})(typeof window!=='undefined'?window:globalThis,function(piano){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const VOWELS=Object.freeze(['아','에','이','오','우']);
 const PATTERNS=Object.freeze({
  three:{label:'3음 왕복 · 도레미',steps:[0,2,4,2,0],tip:'편안한 음역에서 도레미레도를 부드럽게 이어 부르세요.'},
  vowelFive:{label:'아에이오우 · 5음 음계 왕복',vowels:VOWELS,steps:[0,2,4,5,7,5,4,2,0],tip:'아로 도레미파솔파미레도를 부른 뒤 숨을 쉬고 에·이·오·우도 같은 음계로 반복하세요. 각 목표 음을 유지합니다.'},
  vowelTriad:{label:'아에이오우 · 도미솔 도약 왕복',vowels:VOWELS,steps:[0,4,7,4,0],tip:'아로 도미솔미도를 부른 뒤 에·이·오·우도 각각 같은 도약을 반복하세요. 아에이오우까지가 한 세트입니다.'},
  five:{label:'5음 왕복 · 도레미파솔',steps:[0,2,4,5,7,5,4,2,0],tip:'음과 음 사이를 편안하게 연결하세요.'},
  triad:{label:'3화음 왕복 · 도미솔',steps:[0,4,7,4,0],tip:'도약한 음을 먼저 떠올리고 따라 부르세요.'},
  minor:{label:'단조 왕복',steps:[0,2,3,5,7,5,3,2,0],tip:'장조와 다른 세 번째 음의 높이에 집중하세요.'},
  down:{label:'5음 하행 · 솔파미레도',steps:[7,5,4,2,0],tip:'높은 음에서 아래로 내려와 시작음에 도착합니다.'},
  arpeggio:{label:'옥타브 아르페지오',steps:[0,4,7,12,7,4,0],tip:'넓은 음역은 편안한 시작음에서 연습하세요.'},
  octave:{label:'옥타브 왕복',steps:[0,12,0,12,0],tip:'같은 음 이름의 낮은 음과 높은 음을 구별하세요.'},
  chromatic:{label:'반음 왕복',steps:[0,1,2,3,4,3,2,1,0],tip:'작은 반음 차이를 듣고 천천히 이동하세요.'},
  thirds:{label:'3도 연결',steps:[0,4,2,5,4,7,5,9,7],tip:'올라가는 음과 내려오는 음을 번갈아 연결합니다.'},
  octaveScale:{label:'한 옥타브 음계 왕복',steps:[0,2,4,5,7,9,11,12,11,9,7,5,4,2,0],tip:'한 구절이 길면 빠르기를 올리거나 짧은 패턴을 고르세요.'},
  return:{label:'기준음으로 돌아오기',steps:[0,2,0,4,0,5,0,7,0],tip:'다른 음을 부른 뒤 같은 시작음으로 돌아오세요.'},
  hold:{label:'한 음 유지',steps:[0,0,0,0],tip:'같은 음높이를 편안하게 유지하세요.'},
  octaveUp:{label:'한 옥타브 상행',steps:[0,2,4,5,7,9,11,12],tip:'한 음씩 올라가며 목표 음정을 맞춥니다.'},
  pentatonic:{label:'5음 음계',steps:[0,2,4,7,9,7,4,2,0],tip:'다섯 음을 오르내리며 목표 음정을 맞춥니다.'},
  fifth:{label:'완전5도 왕복',steps:[0,7,0,7,0],tip:'시작음과 완전5도 위의 음을 번갈아 부릅니다.'},
  step3:{label:'단계별 왕복 · 3반음',span:3,steps:[0,1,2,3,2,1,0],tip:'반음씩 올라갔다 내려옵니다. 연습 설정에서 한 음을 2·3·4초 유지할 수도 있습니다.'},
  step5:{label:'단계별 왕복 · 5반음',span:5,steps:[0,1,2,3,4,5,4,3,2,1,0],tip:'한 반음씩 차근차근 이동합니다. 편안한 시작음에서 연습하세요.'},
  step7:{label:'단계별 왕복 · 7반음',span:7,steps:[0,1,2,3,4,5,6,7,6,5,4,3,2,1,0],tip:'반음 단위로 7반음 범위를 왕복합니다. 필요하면 중간에 숨을 편안하게 쉬세요.'},
  step12:{label:'단계별 왕복 · 12반음',span:12,steps:[0,1,2,3,4,5,6,7,8,9,10,11,12,11,10,9,8,7,6,5,4,3,2,1,0],tip:'한 옥타브를 반음씩 왕복합니다. 짧은 패턴부터 익힌 뒤 연습하세요.'},
  smooth3:{label:'연속 슬라이드 · 3반음',span:3,smooth:true,steps:[0,3,0],tip:'6초 동안 부드럽게 올라간 뒤 6초 동안 내려옵니다. 음을 끊지 않고 이어보세요.'},
  smooth5:{label:'연속 슬라이드 · 5반음',span:5,smooth:true,steps:[0,5,0],tip:'한 음씩 끊지 말고 목표 곡선을 따라 12초 동안 왕복합니다.'},
  smooth7:{label:'연속 슬라이드 · 7반음',span:7,smooth:true,steps:[0,7,0],tip:'음 사이를 부드럽게 연결합니다. 무리하지 않는 시작음을 선택하세요.'},
  smooth12:{label:'연속 슬라이드 · 12반음',span:12,smooth:true,steps:[0,12,0],tip:'한 옥타브를 연속으로 왕복합니다. 편안한 음역에서 시작하세요.'}
 });
 for(const p of Object.values(PATTERNS)){Object.freeze(p.steps);Object.freeze(p);}
 const SOUNDS=Object.freeze({piano:'피아노'});
 const DEFAULTS=Object.freeze({pattern:'five',root:48,bpm:80,noteSeconds:0,rounds:3,shift:1,sound:'piano',volume:70,tolerance:50,listenFirst:true,prepareSeconds:1.8,breathSeconds:3,restSeconds:3,smoothSeconds:12});
 const PRACTICE_DEFAULTS=Object.freeze({...DEFAULTS,noteSeconds:1.8,rounds:2,shift:0,tolerance:35,listenFirst:false});
 const LEGACY_PATTERNS=Object.freeze({scale:'five',triad:'triad',sustain:'hold',down:'down',scaleUp:'octaveUp',pentatonic:'pentatonic',chromatic:'chromatic',majorThird:'thirds',fifth:'fifth',octave:'octave',arpeggio:'arpeggio',minor:'minor',returnToRoot:'return'});
 const TIMING=Object.freeze({prepare:1800,handoff:3000,rest:3000});
 const number=(value,fallback,min,max)=>Number.isFinite(Number(value))&&value!==''&&value!==null?clamp(Math.round(Number(value)),min,max):fallback;
 const seconds=(v,d,min,max)=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))?Math.round(clamp(Number(v),min,max)*10)/10:d;
 function normalize(value={}){
  if(!value||typeof value!=='object')value={};
  const pattern=Object.hasOwn(PATTERNS,value.pattern)?value.pattern:DEFAULTS.pattern;
  const entry=PATTERNS[pattern],max=entry.span?0:Math.max(...entry.steps);
  return {pattern,root:number(value.root,DEFAULTS.root,36,94-max),bpm:number(value.bpm,DEFAULTS.bpm,50,120),
   noteSeconds:value.noteSeconds!==''&&Number.isFinite(Number(value.noteSeconds))?Math.round(clamp(Number(value.noteSeconds),0,60)*10)/10:0,
   prepareSeconds:seconds(value.prepareSeconds,1.8,0,120),breathSeconds:seconds(value.breathSeconds,3,0,120),restSeconds:seconds(value.restSeconds,3,0,120),smoothSeconds:seconds(value.smoothSeconds,12,1,300),
   rounds:value.rounds===0||value.rounds==='0'?0:number(value.rounds,DEFAULTS.rounds,1,99),
   shift:value.rounds===0||value.rounds==='0'?0:[-1,0,1].includes(Number(value.shift))?Number(value.shift):DEFAULTS.shift,
   listenFirst:value.listenFirst!==false,
   sound:'piano',
   volume:number(value.volume,DEFAULTS.volume,0,100),tolerance:[35,50,75].includes(Number(value.tolerance))?Number(value.tolerance):DEFAULTS.tolerance};
 }
 function migratePractice(unified,legacyPractice,legacyGuide,legacyTraining){
  if(unified&&Object.hasOwn(PATTERNS,unified.pattern))return normalize(unified);
  if(legacyPractice&&Object.hasOwn(LEGACY_PATTERNS,legacyPractice.pattern))return normalize({
   ...PRACTICE_DEFAULTS,pattern:LEGACY_PATTERNS[legacyPractice.pattern],root:legacyPractice.root,
   noteSeconds:[1200,1800,2800].includes(legacyPractice.speed)?legacyPractice.speed/1000:1.8,
   rounds:[0,1,2,3,5].includes(legacyPractice.repeats)?legacyPractice.repeats:2});
  if(legacyGuide||legacyTraining?.glideSpan)return restore(legacyGuide,legacyTraining);
  return normalize(PRACTICE_DEFAULTS);
 }
 function restore(value,legacy){
  if(value&&typeof value==='object'&&Object.hasOwn(PATTERNS,value.pattern))return normalize(value);
  if(legacy&&typeof legacy==='object'&&[3,5,7,12].includes(legacy.glideSpan)){
   const smooth=legacy.glideStyle==='smooth',span=legacy.glideStyle?legacy.glideSpan:3;
   return normalize({pattern:(smooth?'smooth':'step')+span,root:legacy.root,rounds:1,shift:0,
    noteSeconds:smooth?0:[2,3,4].includes(legacy.glideStepSeconds)?legacy.glideStepSeconds:3});
  }
  return normalize(value);
 }
 const triangle=q=>{q=clamp(q,0,1);return q<.5?q*2:(1-q)*2;};
 function plan(value){
  const settings=normalize(value),entry=PATTERNS[settings.pattern];
  const direction=entry.span&&settings.root+entry.span>94?-1:1;
  const pattern=direction<0?{...entry,steps:entry.steps.map(offset=>-offset),
   tip:entry.smooth?'높은 시작음에서는 아래로 6초 내린 뒤 6초 동안 시작음으로 돌아옵니다.':'높은 시작음에서는 범위 안에서 반음씩 아래로 왕복합니다.'}:entry;
  const smooth=Boolean(pattern.smooth),noteMs=smooth?settings.smoothSeconds*250:settings.noteSeconds?settings.noteSeconds*1000:60000/settings.bpm;
  const roots=[],phrasesPerSet=pattern.vowels?.length||1;
  const infinite=settings.rounds===0;
  for(let i=0;i<(infinite?1:settings.rounds);i++){
   const root=settings.root+i*settings.shift;
   if(pattern.steps.some(offset=>root+offset<36||root+offset>94))break;
   for(let vowel=0;vowel<(infinite?1:phrasesPerSet);vowel++)roots.push(root);
  }
  const phraseMs=smooth?settings.smoothSeconds*1000:pattern.steps.length*noteMs;
  const cycleMs=phraseMs+(settings.listenFirst?phraseMs+settings.breathSeconds*1000:0)+settings.restSeconds*1000;
  const attackMs=!settings.listenFirst&&!smooth&&settings.volume>0?Math.min(noteMs*.65,piano.cueSeconds(noteMs)*1000+80):100;
  const responsePerRound=smooth?phraseMs-attackMs:pattern.steps.length*(noteMs-attackMs);
  return {settings,pattern,smooth,direction,infinite,phrasesPerSet,sets:infinite?1:roots.length/phrasesPerSet,attackMs,responsePerRound,tolerance:smooth?110:settings.tolerance,noteMs,phraseMs,cycleMs,handoffMs:settings.breathSeconds*1000,roots,rounds:roots.length,
   duration:infinite?Infinity:cycleMs*roots.length,limited:!infinite&&roots.length<settings.rounds*phrasesPerSet,
   responseMs:roots.length*responsePerRound};
 }
 function create(value,t){
  const p=plan(value);
  return {mode:'guideVoice',active:true,...p,start:t+(p.settings.listenFirst?p.settings.prepareSeconds:p.settings.breathSeconds)*1000,root:p.settings.root,target:null,
   binRound:0,completedEach:true,
   bins:p.roots.map((root,round)=>(p.smooth?[0,1,2,3]:p.pattern.steps).map((offset,i)=>({
    vowel:p.pattern.vowels?.[round%p.phrasesPerSet]||null,
    midi:root+(p.smooth?p.pattern.steps[1]*triangle((i+.5)/4):offset),
    label:p.smooth?(p.direction<0?['내리기 앞부분','내리기 뒷부분','올리기 앞부분','올리기 뒷부분']:['올리기 앞부분','올리기 뒷부분','내리기 앞부분','내리기 뒷부분'])[i]:null,
    expected:p.smooth?p.noteMs-(i===0?p.attackMs:0):p.noteMs-p.attackMs,voiced:0,good:0,samples:0}))),
   history:[],last:null,valid:0,voicedMs:0,goodMs:0,low:null,high:null};
 }
 function timelinePosition(s,t){
  const elapsed=t-s.start;
  if(elapsed<0)return {phase:'ready',round:0,root:s.roots[0],offset:0,index:0,midi:s.roots[0]+s.pattern.steps[0],remaining:-elapsed};
  if(elapsed>=s.duration)return {phase:'done',round:s.rounds-1,offset:s.phraseMs,index:s.smooth?3:s.pattern.steps.length-1,
   midi:s.roots[s.rounds-1]+s.pattern.steps[s.pattern.steps.length-1],remaining:0};
  const round=Math.floor(elapsed/s.cycleMs),within=elapsed-round*s.cycleMs;
  let phase,offset;
  const listening=s.settings.listenFirst;
  if(listening&&within<s.phraseMs){phase='listen';offset=within;}
  else if(listening&&within<s.phraseMs+s.handoffMs){phase='handoff';offset=0;}
  else if(within<s.phraseMs+(listening?s.phraseMs+s.handoffMs:0)){phase='answer';offset=within-(listening?s.phraseMs+s.handoffMs:0);}
  else{phase='rest';offset=s.phraseMs;}
  const index=Math.min(s.smooth?3:s.pattern.steps.length-1,Math.floor(offset/s.noteMs));
  const answerStart=s.start+round*s.cycleMs+(listening?s.phraseMs+s.handoffMs:0),root=s.roots[s.infinite?0:round];
  return {phase,round,root,offset,index,midi:root+(s.smooth?s.pattern.steps[1]*triangle(offset/s.phraseMs):s.pattern.steps[index]),
   answerStart,answerIn:Math.max(0,answerStart-t),gradeStart:s.smooth?Math.max(answerStart+s.attackMs,answerStart+index*s.noteMs):answerStart+index*s.noteMs+s.attackMs,
   noteStart:answerStart+index*s.noteMs,
   remaining:s.duration-elapsed};
 }
 function position(s,t){
  const p=timelinePosition(s,t),vowels=s.pattern.vowels;
  return {...p,setIndex:Math.floor(p.round/(s.phrasesPerSet||1)),vowelIndex:vowels?p.round%vowels.length:null,
   vowel:vowels?.[p.round%vowels.length]||null,nextVowel:vowels?.[(p.round+1)%vowels.length]||null};
 }
 function roundLabel(s,p){
  return s.pattern.vowels?(p.setIndex+1)+'/'+(s.infinite?'∞':s.sets)+'세트 · '+p.vowel+' '+(p.vowelIndex+1)+'/5':(p.round+1)+'/'+(s.infinite?'∞':s.rounds)+'회';
 }
 function startCue(s,t){
  const p=position(s,t),starting=p.phase==='answer'&&p.offset<Math.min(900,s.noteMs*.8);
  const ready=!s.settings.listenFirst&&p.phase==='ready';
  const nextRound=!s.settings.listenFirst&&p.phase==='rest'&&(s.infinite||p.round+1<s.rounds);
  const visible=p.phase==='handoff'||ready||starting||nextRound;
  const until=ready?p.remaining:nextRound?s.start+(p.round+1)*s.cycleMs-t:p.answerIn;
  return {visible,phase:p.phase,count:p.phase==='handoff'||ready||nextRound?Math.max(1,Math.ceil(until/1000)):0,
   starting,vowel:s.pattern.vowels?.[(p.round+(nextRound?1:0))%s.phrasesPerSet]||null,firstMidi:s.roots[s.infinite?0:p.round+(nextRound?1:0)]+s.pattern.steps[0]};
 }
 function advance(s,t){
  if(!s.infinite)return;
  const p=position(s,t);if(p.round<=s.binRound)return;
  s.completedEach=s.completedEach&&p.round===s.binRound+1&&s.bins[0].every(b=>b.voiced>=b.expected*.2);
  s.binRound=p.round;s.responseMs=(p.round+1)*s.responsePerRound;
  for(const b of s.bins[0]){b.voiced=0;b.good=0;b.samples=0;b.vowel=p.vowel;}
 }
 function receive(s,t,midi){
  if(!s?.active||!Number.isFinite(t)||s.last&&t<=s.last.t)return;
  advance(s,t);
  const p=position(s,t),valid=Number.isFinite(midi)&&midi>=35.5&&midi<=94.5;
  const previous=s.last,gap=previous?t-previous.t:0;
  s.last={t,midi:valid?midi:null,phase:p.phase,round:p.round};
  if(p.phase!=='answer')return;
  s.history.push({t,offset:p.offset,round:p.round,midi:valid?midi:null});
  while(s.history.length&&(s.history[0].round!==p.round||t-s.history[0].t>8000))s.history.shift();
  if(!valid)return;
  s.valid++;s.low=Math.min(s.low??midi,midi);s.high=Math.max(s.high??midi,midi);
  const bin=s.bins[s.infinite?0:p.round][p.index];bin.samples++;
  // Do not fill silence, delayed callbacks, the guide handoff, or note attacks.
  if(!previous||previous.phase!=='answer'||previous.round!==p.round||
   !Number.isFinite(previous.midi)||gap<=0||gap>160)return;
  const delta=Math.max(0,Math.min(gap,t-p.gradeStart));
  if(!delta)return;
  bin.voiced+=delta;s.voicedMs+=delta;
  if(Math.abs(midi-p.midi)*100<=s.tolerance){bin.good+=delta;s.goodMs+=delta;}
 }
 function metrics(s){
  const accuracy=s.voicedMs>0?Math.floor(100*s.goodMs/s.voicedMs+1e-9):null;
  const coverage=Math.min(100,Math.floor(100*s.voicedMs/s.responseMs+1e-9));
  const each=s.completedEach!==false&&s.bins.flat().every(b=>b.voiced>=b.expected*.2);
  return {accuracy,coverage,enough:s.valid>=12&&coverage>=40&&each,each};
 }
 function evaluate(s,completed,label=midi=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][Math.round(midi)%12]+(Math.floor(midi/12)-1)){
  const m=metrics(s),passed=m.enough&&m.accuracy>=65;
  const missing=[];
  if(s.valid<12)missing.push('음정 측정 '+s.valid+'개 / 최소 12개');
  if(m.coverage<40)missing.push('전체 발성 '+m.coverage+'% / 최소 40%');
  if(s.completedEach===false)missing.push('이전 반복에서 발성 20% 미만인 구간이 있습니다');
  const gaps=s.bins.flatMap((bins,round)=>bins.flatMap((b,index)=>b.voiced<b.expected*.2?[{
   label:(s.pattern.vowels?Math.floor(round/s.phrasesPerSet)+1+'세트 · '+b.vowel:(round+1)+'회')+' · '+(index+1)+'번째 '+(b.label||label(b.midi)),
   percent:Math.floor(b.voiced/Math.max(1,b.expected)*100+1e-9)
  }]:[]));
  const shown=gaps.slice(0,6).map(b=>b.label+' '+b.percent+'% / 최소 20%');
  if(gaps.length)missing.push('구간별 발성 부족 '+gaps.length+'곳: '+shown.join(', ')+(gaps.length>shown.length?' 외 '+(gaps.length-shown.length)+'곳':''));
  if(m.enough&&!passed)missing.push('음정 일치율 '+m.accuracy+'% / 최소 65%');
  return {status:!completed?'중단':!m.enough?'측정 부족':passed?'성공':'미달성',
   kind:!completed?'stopped':!m.enough?'guided':passed?'success':'failure',
   rule:'따라 부르기만 채점 · 목표 ±'+s.tolerance+'cent · 일치율 65% 이상 · 전체 발성 40% 및 '+(s.pattern.vowels?'각 모음의 각 음':s.smooth?'각 이동 구간':'각 음')+' 20% 이상 ('+(s.smooth?'응답 시작':'음 시작')+' '+(s.attackMs/1000).toFixed(2)+'초 제외)',
   reason:!completed?'연습을 끝까지 완료하지 않았습니다.':missing.length?missing.join(' · '):'전체 발성·구간별 발성·음정 일치율 기준을 모두 충족했습니다.',
   metrics:'음정 일치율 '+(m.accuracy===null?'—':m.accuracy+'%')+' · 발성 커버리지 '+m.coverage+'% · 유효 발성 '+(s.voicedMs/1000).toFixed(1)+'초'};
 }
 function summary(s,label,completed=true){
  const m=metrics(s),weak=s.bins.flat().filter(b=>b.voiced<b.expected*.2||b.good/Math.max(1,b.voiced)<.65);
  const notes=[...new Set(weak.map(b=>b.label||(b.vowel?b.vowel+' ':'')+label(b.midi)))].slice(0,4);
  const completedRounds=clamp(Math.floor(((s.finishedAt??s.start)-s.start)/s.cycleMs),0,s.infinite?Infinity:s.rounds);
  const rounds=s.pattern.vowels?(completed?s.sets+'세트 · 5모음씩':Math.floor(completedRounds/s.phrasesPerSet)+'세트·'+completedRounds%s.phrasesPerSet+'모음 완료 / '+(s.infinite?'계속 반복':s.sets+'세트 계획')):completed?s.rounds+'회':completedRounds+'회 완료 / '+(s.infinite?'계속 반복':s.rounds+'회 계획');
  return s.pattern.label+' · '+rounds+' · '+evaluate(s,true).metrics+
   (notes.length?' · 더 연습할 '+(s.smooth?'구간 ':'음 ')+notes.join(', '):'')+(m.enough?'':' · 충분히 따라 부른 뒤 다시 확인하세요');
 }
 function createPlayer(ac,destination,sample=()=>null,timers=globalThis,onInterrupted=()=>{}){
  const voices=new Set();let timer=null,schedule=[],next=0,origin=0,stopped=true,infiniteSession=null,generatedRound=0;
  function stop(){
   stopped=true;infiniteSession=null;generatedRound=0;if(timer!==null)timers.clearInterval(timer);timer=null;schedule=[];next=0;
   ac.removeEventListener?.('statechange',stateChange);
   for(const voice of voices){
    try{voice.gain.gain.cancelScheduledValues(ac.currentTime);voice.gain.gain.setTargetAtTime(.00001,ac.currentTime,.006);
     voice.source.stop(ac.currentTime+.025);}catch(_){}
   }
   voices.clear();
  }
  function stateChange(){
   if(!stopped&&ac.state&&ac.state!=='running'){stop();onInterrupted();}
  }
  function note(item){
   const at=Math.max(ac.currentTime,item.at),length=item.length;
   const curve=item.curve?.filter(p=>p.at>at);
   const midi=item.midiAt?item.midiAt(at):item.midi;
   let voice;voice=piano.play(ac,destination,sample,{midi,at,length,volume:item.volume,curve,onended:()=>voices.delete(voice)});
   if(voice)voices.add(voice);
  }
  function eventsFor(s,round){
   const base=origin+round*s.cycleMs/1000,root=s.roots[s.infinite?0:round],volume=s.settings.volume;
   const available=round===0?s.settings.breathSeconds:s.settings.restSeconds;
   const primer=!s.settings.listenFirst&&available>=.5?[{at:base-Math.min(available,1.65),midi:root,length:Math.min(piano.DEFAULT_SECONDS,available-.08),volume}]:[];
   if(s.smooth){
    if(!s.settings.listenFirst)return primer;
    const duration=s.phraseMs/1000,middle=base+duration/2,end=base+duration;
    const midiAt=at=>root+s.pattern.steps[1]*triangle((at-base)/duration),events=[];
    // Re-strike the acoustic piano along the continuous pitch curve so long
    // slides retain a piano body instead of becoming an oscillator or silence.
    for(let at=base;at<end-.0001;at+=piano.RESTRIKE_SECONDS){
     const until=Math.min(end,at+piano.RESTRIKE_SECONDS),curve=[];
     if(at<middle&&until>middle)curve.push({at:middle,midi:midiAt(middle)});
     curve.push({at:until,midi:midiAt(until)});
     events.push({at,midi:midiAt(at),midiAt,length:until-at,curve,volume});
    }
    return events;
   }
   return [...primer,...s.pattern.steps.map((offset,i)=>({at:base+i*s.noteMs/1000,midi:root+offset,
    length:s.settings.listenFirst?s.noteMs*.95/1000:piano.cueSeconds(s.noteMs),volume}))];
  }
  function pump(){
   if(stopped)return;
   try{
    if(infiniteSession&&next===schedule.length){
     generatedRound=Math.max(generatedRound,Math.max(0,Math.floor((ac.currentTime-origin)/(infiniteSession.cycleMs/1000))));
     schedule=eventsFor(infiniteSession,generatedRound++);next=0;
    }
    while(next<schedule.length&&schedule[next].at<ac.currentTime+.18){
     const item=schedule[next++];if(item.at+item.length>ac.currentTime+.05)note({...item,length:Math.min(item.length,item.at+item.length-Math.max(item.at,ac.currentTime))});
    }
    if(!infiniteSession&&next===schedule.length&&timer!==null){timers.clearInterval(timer);timer=null;}
   }catch(_){stop();onInterrupted();}
  }
  function start(s,now){
   stop();stopped=false;origin=ac.currentTime+(s.start-now)/1000;
   ac.addEventListener?.('statechange',stateChange);
   if(s.infinite){infiniteSession=s;schedule=eventsFor(s,0);generatedRound=1;}
   else for(let round=0;round<s.rounds;round++)schedule.push(...eventsFor(s,round));
   pump();if(!stopped)timer=timers.setInterval(pump,25);
  }
  return {start,stop,pump,get activeVoices(){return voices.size;}};
 }
 // Musical coordinates are independent of the screen direction. A bounded
 // six-second window prevents long phrases from becoming a horizontal ribbon.
 function plotView(s,t){
  const p=position(s,t),span=Math.min(6000,s.phraseMs);
  const from=clamp(p.offset-span*.72,0,Math.max(0,s.phraseMs-span)),to=from+span;
  const root=s.roots[s.infinite?0:p.round],targets=[];
  const at=ms=>root+(s.smooth?s.pattern.steps[1]*triangle(ms/s.phraseMs):s.pattern.steps[Math.min(s.pattern.steps.length-1,Math.floor(ms/s.noteMs))]);
  if(s.smooth){targets.push(at(from),at(to));if(from<=s.phraseMs/2&&to>=s.phraseMs/2)targets.push(at(s.phraseMs/2));}
  else for(let i=0;i<s.pattern.steps.length;i++)if((i+1)*s.noteMs>=from&&i*s.noteMs<=to)targets.push(root+s.pattern.steps[i]);
  const points=s.history.filter(v=>v.round===p.round&&v.offset>=from&&v.offset<=to);
  const targetLow=Math.min(...targets),targetHigh=Math.max(...targets);
  const nearby=points.filter(v=>Number.isFinite(v.midi)&&v.midi>=targetLow-4&&v.midi<=targetHigh+4).map(v=>v.midi);
  let low=Math.floor(Math.min(targetLow,...nearby))-1,high=Math.ceil(Math.max(targetHigh,...nearby))+1;
  if(high-low<4){const center=(high+low)/2;low=Math.floor(center-2);high=low+4;}
  return {position:p,from,to,low,high,points,at};
 }
 function draw(canvas,s,t,label){
  if(!canvas||!s)return;
  const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;
  if(w<90||h<35)return;
  const dpr=Math.min(globalThis.devicePixelRatio||1,2);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const view=plotView(s,t),{position:p,from,to,low,high,points,at}=view;
  ctx.font='10px system-ui';
  const candidates=[];for(let m=low;m<=high;m++)candidates.push(m);
  const width=Math.max(40,...candidates.map(m=>ctx.measureText?.(label(m))?.width||label(m).length*5.5));
  const x0=Math.min(Math.ceil(width+10),Math.max(48,w*.32)),x1=w-9,y0=7,y1=h-18;
  if(x1<=x0||y1<=y0)return;
  const xx=ms=>x0+(ms-from)/(to-from)*(x1-x0),yy=m=>y1-(m-low)/(high-low)*(y1-y0);
  const target=Math.round(p.midi),ticks=[];
  const order=[target,low,high,...candidates];
  for(const m of order)if(m>=low&&m<=high&&!ticks.some(v=>Math.abs(yy(v)-yy(m))<15))ticks.push(m);
  ctx.textAlign='right';ctx.lineWidth=1;
  for(const midi of ticks.sort((a,b)=>a-b)){
   const y=yy(midi);ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);
   ctx.strokeStyle=midi===target?'#83f5d66b':'#d4e6ff25';ctx.setLineDash?.(midi===target?[4,4]:[]);ctx.stroke();ctx.setLineDash?.([]);
   ctx.fillStyle=midi===target?'#b7ffe9':'#c9d3e8';ctx.fillText(label(midi),x0-5,y+3,x0-9);
  }
  ctx.save?.();if(ctx.rect&&ctx.clip){ctx.beginPath();ctx.rect(x0,y0,x1-x0,y1-y0);ctx.clip();}
  if(s.smooth){
   const mids=[from,...(from<s.phraseMs/2&&to>s.phraseMs/2?[s.phraseMs/2]:[]),to];
   ctx.beginPath();for(const [i,ms]of mids.entries())if(i)ctx.lineTo(xx(ms),yy(at(ms)));else ctx.moveTo(xx(ms),yy(at(ms)));
   ctx.lineWidth=5;ctx.strokeStyle='#83f5d6';ctx.stroke();
  }else{
   for(let i=0;i<s.pattern.steps.length;i++){
    const begin=Math.max(from,i*s.noteMs),end=Math.min(to,(i+1)*s.noteMs);if(end<=begin)continue;
    const midi=s.roots[s.infinite?0:p.round]+s.pattern.steps[i],left=xx(begin),right=xx(end),y=yy(midi);
    const band=Math.max(2,Math.abs(yy(midi+s.tolerance/100)-y));
    ctx.fillStyle='#83f5d619';ctx.fillRect(left,y-band,right-left,band*2);
    // Each horizontal note is independent. Vertical connectors can be mistaken
    // for an instruction to sing every intermediate pitch like a smooth slide.
    ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.lineWidth=5;ctx.strokeStyle='#83f5d6';ctx.stroke();
   }
  }
  ctx.beginPath();let previous=null;
  for(const point of points){
   if(!Number.isFinite(point.midi)){previous=null;continue;}
   const x=xx(point.offset),y=yy(point.midi);
   if(!previous||point.t-previous.t>160)ctx.moveTo(x,y);else ctx.lineTo(x,y);previous=point;
  }
  ctx.lineWidth=2.5;ctx.strokeStyle='#efb4ff';ctx.stroke();
  const cursor=xx(clamp(p.offset,from,to));ctx.beginPath();ctx.moveTo(cursor,y0);ctx.lineTo(cursor,y1);ctx.lineWidth=1.5;ctx.strokeStyle='#ffffff66';ctx.stroke();
  if(startCue(s,t).visible&&from===0){
   ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x0,y1);ctx.lineWidth=3;ctx.strokeStyle='#ffd681';ctx.stroke();
   ctx.textAlign='left';ctx.font='10px system-ui';ctx.fillStyle='#ffd681';ctx.fillText('첫 음 시작',x0+5,y0+11);
  }
  if(p.phase==='answer'&&Number.isFinite(s.last?.midi)&&t-s.last.t<=210){
   ctx.beginPath();ctx.arc(cursor,yy(s.last.midi),3.5,0,Math.PI*2);ctx.fillStyle='#efb4ff';ctx.fill();
  }
  ctx.restore?.();ctx.font='9px system-ui';ctx.fillStyle='#c4cce0';
  ctx.textAlign='left';ctx.fillText((from/1000).toFixed(1)+'초',x0,h-3);
  ctx.textAlign='right';ctx.fillText((to/1000).toFixed(1)+'초',x1,h-3);
 }
 return {VOWELS,roundLabel,PRACTICE_DEFAULTS,LEGACY_PATTERNS,migratePractice,advance,plotView,PATTERNS,SOUNDS,DEFAULTS,TIMING,normalize,restore,plan,create,position,startCue,receive,metrics,evaluate,summary,createPlayer,draw};
});
