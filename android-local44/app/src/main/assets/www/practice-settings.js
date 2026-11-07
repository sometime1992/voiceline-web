'use strict';
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory({VoiceLineGuideTraining:require('./guide-training.js'),VoiceLinePracticePlans:require('./practice-plans.js'),VoiceLineDynamics:require('./dynamic-training.js'),VoiceLineMetronome:require('./metronome.js')});
 else root.VoiceLinePracticeSettings=factory(root);
})(typeof window!=='undefined'?window:globalThis,function(root){
 const copy=v=>JSON.parse(JSON.stringify(v||{})),round=n=>Math.round(n*10+1e-8)/10;
 const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const KINDS=[['steps','음계'],['leaps','도약'],['vowels','모음 · 아에이오우'],['smooth','연속 슬라이드']];
 function patternKind(id){const p=root.VoiceLineGuideTraining.PATTERNS[id];return p?.smooth?'smooth':p?.vowels?'vowels':['triad','arpeggio','octave','thirds','return','fifth'].includes(id)?'leaps':'steps';}
 function patterns(kind){return Object.entries(root.VoiceLineGuideTraining.PATTERNS).filter(([id])=>patternKind(id)===kind).map(([id,p])=>[id,p.label]);}
 const textSeconds=n=>round(n)+'초';
 function formatTime(n){if(!Number.isFinite(n))return '직접 중단';n=round(Math.max(0,n));if(n<60)return textSeconds(n);const min=Math.floor(n/60),sec=round(n-min*60);return min+'분'+(sec?' '+sec+'초':'');}
 function noteLabel(m){const names=['도','도♯','레','레♯','미','파','파♯','솔','솔♯','라','라♯','시'],letters=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];m=Math.round(m);return letters[(m%12+12)%12]+(Math.floor(m/12)-1)+' · '+(Math.floor(m/12)-3)+'옥 '+names[(m%12+12)%12];}
 function prepare(mode,value={},withinRoutine=false){
  const p=copy(value),plans=root.VoiceLinePracticePlans,g=root.VoiceLineGuideTraining;
  p.training={root:48,earCount:4,earPattern:'legacy',dynamicPattern:'steps',dynamicCues:true,dynamicCueVolume:70,...p.training};
  const tr=p.training;tr.root=Math.round(clamp(finite(tr.root,48),36,84));tr.earCount=Math.round(clamp(finite(tr.earCount,4),1,20));
  tr.earPattern=Object.hasOwn(plans.EAR_PATTERNS,tr.earPattern)?tr.earPattern:'legacy';if(mode==='earVoice')tr.root=Math.min(tr.root,plans.earRootLimit(tr.earPattern));
  if(tr.earPattern==='custom')tr.earNotes=plans.earSequence(tr);
  tr.dynamicPattern=root.VoiceLineDynamics.patternId(tr.dynamicPattern);if(tr.dynamicPattern==='vowels')tr.dynamicPattern='steps';
  tr.dynamicCueVolume=tr.dynamicCues===false?0:Math.round(clamp(finite(tr.dynamicCueVolume,70),0,100));tr.dynamicCues=tr.dynamicCueVolume>0;
  tr.warmup={inhale:4,exhale:6,hum:6,rest:3,cues:true,...tr.warmup};for(const k of ['inhale','exhale','hum','rest'])tr.warmup[k]=round(clamp(finite(tr.warmup[k],3),k==='rest'?0:1,120));
  p.guide=g.normalize({...g.PRACTICE_DEFAULTS,...p.guide,...(withinRoutine?{rounds:1}:{})});p.metronome=root.VoiceLineMetronome.normalize(p.metronome);
  p.vibratoRoot=Math.round(clamp(finite(p.vibratoRoot,48),36,94));p.base=Math.round(clamp(finite(p.base,48),24,84)/12)*12;p.pianoVolume=Math.round(clamp(finite(p.pianoVolume,85),0,100));
  if(withinRoutine)delete p.micSensitivity;else p.micSensitivity=['standard','sensitive','high'].includes(p.micSensitivity)?p.micSensitivity:'sensitive';
  return p;
 }
 function describe(mode,timing,params,withinRoutine=false,label=noteLabel){
  const plans=root.VoiceLinePracticePlans,t=plans.timing(mode,timing),p=prepare(mode,params,withinRoutine),tr=p.training,g=p.guide,w=tr.warmup,m=p.metronome;
  let title=plans.MODES[mode]||'연습',compact='',notes=[],phases=[],note='',run=0,voice=0,repeats=t.rounds,after=t.rest,unit='회',issues=[];
  const phase=(name,seconds,key,kind='prepare')=>{if(seconds>0)phases.push({label:name,seconds:round(seconds),key,kind});};
  if(mode==='practice'){
   repeats=withinRoutine?t.rounds:g.rounds;const plan=root.VoiceLineGuideTraining.plan({...g,rounds:withinRoutine?1:repeats});
   const initial=g.listenFirst?g.prepareSeconds:g.breathSeconds;unit=plan.pattern.vowels?'세트':'회';title=plan.pattern.label;
   notes=plan.pattern.steps.map(n=>g.root+n);compact=label(g.root)+' · '+(plan.smooth?g.smoothSeconds+'초 왕복':(plan.noteMs/1000)+'초/음')+' · '+(repeats?repeats+unit:'계속 반복');
   phase('시작 준비',g.listenFirst?g.prepareSeconds:0,'prepareSeconds');if(g.listenFirst)phase('한 구절 듣기',plan.phraseMs/1000,plan.smooth?'smoothSeconds':g.noteSeconds===0?'bpm':'noteSeconds');phase(g.listenFirst?'들이쉬기':'처음 들이쉬기',g.breathSeconds,'breathSeconds');phase('따라 부르기',plan.phraseMs/1000,plan.smooth?'smoothSeconds':g.noteSeconds===0?'bpm':'noteSeconds','voice');phase('회복',g.restSeconds,'restSeconds','rest');
   const onePlan=root.VoiceLineGuideTraining.plan({...g,rounds:1});
   run=withinRoutine?(onePlan.duration/1000+initial)*repeats:plan.duration/1000+initial;voice=onePlan.phraseMs/1000*onePlan.rounds*(repeats||1);after=0;
   note=plan.pattern.vowels?'한 모음으로 음계 전체 왕복 · 아 → 에 → 이 → 오 → 우 = 1세트. '+(withinRoutine?'세트마다 시작 준비를 적용합니다.':'시작 준비는 처음 한 번 적용합니다.'):'선택한 음 순서로 진행합니다.';
   if(plan.smooth)note='상행과 하행을 모두 포함한 왕복 시간입니다. 음높이를 연속으로 이동합니다.';
   const range=root.VoiceLineGuideTraining.plan({...g,rounds:repeats||1});if(range.limited)issues.push('반복 중 음역을 벗어납니다. 기준음·반복 횟수·기준음 이동을 조절해 주세요.');
   if(plan.pattern.vowels&&g.shift)note+=' 반음 이동은 다섯 모음을 마친 다음 세트에 적용합니다.';
   return finish({pattern:plan.pattern,kind:plan.smooth?'smooth':plan.pattern.vowels?'vowels':'steps',phraseSeconds:plan.phraseMs/1000,voiceLabel:'발성'});
  }
  if(mode==='earVoice'){
   notes=plans.earSequence(tr);title='청음 · '+plans.EAR_PATTERNS[tr.earPattern];compact=notes.length+'음 · '+(repeats?repeats+'회':'계속 반복');
   run=t.prepare+notes.length*(t.listen+t.breath+t.answer+t.noteRest);voice=notes.length*t.answer;
   phase('시작 준비',t.prepare,'prepare');phase('음 듣기',t.listen,'listen');phase('들이쉬기',t.breath,'breath');phase('따라 부르기',t.answer,'answer','voice');phase('음 사이 쉬기',t.noteRest,'noteRest','rest');note='듣기 → 들이쉬기 → 따라 부르기를 '+notes.length+'음에 각각 적용합니다. 표시한 순서는 반복해도 같습니다.';
  }else if(mode==='warmupVoice'){
   unit='세트';run=w.inhale+w.exhale+w.hum+w.rest;voice=w.hum;after=0;
   phase('시작 준비',t.prepare,'prepare');phase('들이쉬기',w.inhale,'inhale');phase('내쉬기',w.exhale,'exhale');phase('허밍',w.hum,'hum','voice');phase('쉬기',w.rest,'rest','rest');compact='한 세트 '+formatTime(run)+' · '+(repeats?repeats+'세트':'계속 반복');
   note='호흡·허밍 순서를 안내하는 타이머입니다. 쉬기 0초는 생략합니다.';run=withinRoutine?(run+t.prepare)*repeats:run*(repeats||1)+t.prepare;voice*=repeats||1;return finish({voiceLabel:'허밍'});
  }else if(mode==='dynamicVoice'||mode==='sustainVoice'||mode==='vibrato'){
   const isDynamic=mode==='dynamicVoice';let active=t.seconds;
   if(isDynamic){const d=root.VoiceLineDynamics.create({pattern:tr.dynamicPattern,duration:t.seconds*1000,segmentSeconds:t.customStages?t.stages:null});active=d.duration/1000;title=root.VoiceLineDynamics.getPattern(tr.dynamicPattern).label;if(t.customStages&&t.stages.reduce((a,b)=>a+b,0)>300)issues.push('강약 연습의 전체 발성 시간은 300초 이내로 설정해 주세요.');}
   compact=label(mode==='vibrato'?p.vibratoRoot:tr.root)+' · 발성 '+formatTime(active)+' · '+(repeats?repeats+'회':'계속 반복');
   run=t.reference+t.breath+active;voice=active;phase('기준음 듣기',t.reference,'reference');phase('들이쉬기',t.breath,'breath');if(isDynamic){const segments=root.VoiceLineDynamics.timeline(tr.dynamicPattern,active*1000,t.customStages?t.stages:null);segments.forEach((s,i)=>phase(s.label,(s.end-s.start)/1000,t.customStages?i:'seconds',s.rest?'rest':'voice'));}else phase('발성',active,'seconds','voice');if(repeats!==1||withinRoutine)phase('반복 사이 회복',t.rest,'rest','rest');
   note=mode==='vibrato'?'측정 기준은 설명에서 확인합니다. 기준음 듣기와 준비는 발성 시간에 포함하지 않습니다.':isDynamic?'같은 음높이를 유지하며 목표 소리 크기를 따라갑니다.':'선택한 한 음을 설정한 시간 동안 유지합니다.';
  }else if(mode==='rest'){
   run=t.seconds;after=0;repeats=Math.max(1,t.rounds);compact=formatTime(run)+' 쉬기';phase('쉬기',run,'seconds','rest');note='다음 연습을 준비하는 휴식 타이머입니다.';
  }else{
   const manual=!withinRoutine&&t.seconds===0;run=manual?Infinity:t.seconds;voice=null;
   compact=(manual?'직접 중단':formatTime(run)+' 후 종료')+(mode==='record'?' · 한 파일 저장':'');
   if(mode==='piano')compact=label(p.base)+'부터 · '+compact;
   if(mode==='metronome'){compact=m.numerator+'/'+m.denominator+' · '+m.bpm+' BPM · '+compact;const problem=root.VoiceLineMetronome.timingIssue(m);if(problem)issues.push(problem);}
   if(mode==='record'){repeats=1;after=0;note='중단하거나 지정 시간이 끝나면 시작부터 끝까지 한 파일로 저장합니다.';}
   else note=mode==='pitch'?'목소리의 음높이를 측정합니다. 감도는 앱 공통 설정입니다.':mode==='metronome'?'박자·빠르기·강세를 설정대로 재생합니다.':'직접 건반을 눌러 연주합니다. 자동 음 순서는 없습니다.';
   if(Number.isFinite(run))phase(mode==='record'?'녹음':mode==='pitch'?'측정':mode==='metronome'?'메트로놈':'연주',run,'seconds','voice');
  }
  const count=repeats||1;run=Number.isFinite(run)?run*count+after*Math.max(0,count-1):Infinity;if(voice!==null)voice*=count;
  return finish({voiceLabel:'발성'});
  function finish(extra={}){
   const totalSeconds=repeats===0?Infinity:round(run),voiceSeconds=voice===null?null:round(voice);
   const totalText=Number.isFinite(totalSeconds)?'전체 '+formatTime(totalSeconds):t.seconds===0&&['piano','pitch','record','metronome'].includes(mode)?'직접 중단 · 타이머 없음':'계속 반복 · 직접 중단';
   let audio=mode==='practice'?root.VoiceLineGuideTraining.SOUNDS[g.sound]+' '+g.volume+'%':mode==='metronome'?({'click':'클릭','wood':'우드','bell':'벨'})[m.sound]+' · '+(m.muted?'음소거':m.volume+'%'):mode==='warmupVoice'?'단계 안내음 '+(w.cues?'켜기':'끄기'):'건반·기준음 '+p.pianoVolume+'%'+(mode==='dynamicVoice'?' · 전환 안내음 '+tr.dynamicCueVolume+'%':'');
   if(!withinRoutine&&['pitch','record','practice','sustainVoice','earVoice','dynamicVoice','vibrato'].includes(mode)){const sensitivity='음정 감지 '+({standard:'표준',sensitive:'민감',high:'최대'})[p.micSensitivity];audio=['pitch','record'].includes(mode)?sensitivity:audio+' · '+sensitivity;}
   return {mode,title,compact,note,notes,phases,repeats,repeatUnit:unit,totalSeconds,totalText,voiceSeconds,voiceLabel:extra.voiceLabel||'발성',afterSeconds:after,audio,issues,...extra};
  }
 }
 function routine(value,label=noteLabel){
  const plan=root.VoiceLinePracticePlans.routine(value);const steps=plan.steps.map(s=>describe(s.mode,s.timing,s.params,true,label)),last=steps.at(-1)?.afterSeconds||0;
  const cycle=round(steps.reduce((sum,s)=>sum+s.totalSeconds+s.afterSeconds,0)),total=plan.rounds===0?Infinity:Math.max(0,round(cycle*plan.rounds-last));
  return {steps,oneCycleSeconds:plan.rounds===1?Math.max(0,round(cycle-last)):cycle,totalSeconds:total,totalText:plan.rounds===0?'전체 루틴 계속 반복':'전체 '+formatTime(total),issues:steps.flatMap((s,i)=>s.issues.map(issue=>(i+1)+'단계: '+issue))};
 }
 return {KINDS,patternKind,patterns,prepare,describe,routine,formatTime,noteLabel};
});
