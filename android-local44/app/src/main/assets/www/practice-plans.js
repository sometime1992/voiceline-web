'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VoiceLinePracticePlans=api;})(globalThis,()=>{
 const MODES=Object.freeze({piano:'피아노 자유 연습',pitch:'음정 측정',practice:'음정 연습',sustainVoice:'발성 유지',earVoice:'청음 연습',dynamicVoice:'발성 강약 조절',vibrato:'비브라토',warmupVoice:'호흡·워밍업',metronome:'메트로놈',record:'녹음',rest:'쉬기'});
 const ROUTINE_MODES=Object.freeze(Object.keys(MODES).filter(mode=>!['pitch','record'].includes(mode)));
 const DEFAULTS=Object.freeze({seconds:30,rounds:1,rest:3,reference:1.8,breath:3,prepare:1.8,listen:1.5,answer:3.2,noteRest:0,customStages:false,stages:[]});
 const EAR_PATTERNS=Object.freeze({legacy:'기존 고정 순서',same:'같은 음 반복',up:'장조 상행',down:'장조 하행',triad:'3화음 왕복',chromatic:'반음 상행',custom:'음을 하나씩 직접 지정'});
 const EAR_OFFSETS={same:[0],up:[0,2,4,5,7,9,11,12],down:[12,11,9,7,5,4,2,0],triad:[0,4,7,4,0],chromatic:[0,1,2,3,4,5,6,7,8,9,10,11,12]};
 const earRootLimit=pattern=>Math.min(84,94-Math.max(...(EAR_OFFSETS[pattern]||[0])));
 const numeric=(v,d,min,max)=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))?Math.round(Math.max(min,Math.min(max,Number(v)))*10)/10:d;
 function earSequence(settings={}){
  const root=Math.round(numeric(settings.root,48,36,earRootLimit(settings.earPattern))),count=Math.round(numeric(settings.earCount,4,1,20));
  if(settings.earPattern==='custom')return Array.from({length:count},(_,i)=>Math.round(numeric(settings.earNotes?.[i],root,36,94)));
  const offsets=EAR_OFFSETS[settings.earPattern];
  const direction=root+12>94?-1:1;
  return Array.from({length:count},(_,i)=>root+(offsets?offsets[i%offsets.length]:direction*[0,2,4,7,5,9,12][(i*3+1)%7]));
 }
 function guideRound(settings={},round=1){return {...settings,sound:'piano',root:Number(settings.root)+(Math.max(1,Math.round(round))-1)*([-1,0,1].includes(Number(settings.shift))?Number(settings.shift):0),rounds:1};}
 function timing(mode,value={}){
  if(!value||typeof value!=='object')value={};
  const defaults={...DEFAULTS,seconds:({piano:0,pitch:0,record:0,metronome:0,sustainVoice:8,dynamicVoice:12,vibrato:12,rest:5})[mode]??30};
  const result={...defaults};
  for(const key of ['seconds','rest','reference','breath','prepare','listen','answer','noteRest'])result[key]=numeric(value[key],defaults[key],key==='listen'||key==='answer'?0.5:0,key==='seconds'?(mode==='record'?600:3600):120);
  if(['sustainVoice','vibrato','rest'].includes(mode))result.seconds=Math.max(1,result.seconds);
  if(mode==='dynamicVoice')result.seconds=Math.max(8,Math.min(300,result.seconds));
  result.rounds=Math.round(numeric(value.rounds,1,0,99));
  result.customStages=value.customStages===true;
  result.stages=Array.isArray(value.stages)?value.stages.slice(0,24).map(v=>numeric(v,3,0,60)):[];
  return result;
 }
 const id=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 function step(value={}){
  if(!value||typeof value!=='object')value={};
  if(value.mode==='dynamicVoice'&&value.params?.training?.dynamicPattern==='vowels')value={...value,mode:'practice',
   params:{...value.params,guide:vowelGuide(value.params.training)},timing:{...value.timing,customStages:false,stages:[]}};
  const mode=Object.hasOwn(MODES,value.mode)?value.mode:'sustainVoice';
  const t=timing(mode,value.timing);t.rounds=Math.max(1,t.rounds);
  if(t.seconds===0)t.seconds=30;
  let params={};try{params=JSON.parse(JSON.stringify(value.params||{}));}catch(_){}
  if(!params||Array.isArray(params)||typeof params!=='object')params={};
  if(params.guide&&typeof params.guide==='object')params.guide.sound='piano';
  return {id:typeof value.id==='string'?value.id.slice(0,80):id(),mode,timing:t,params};
 }
 function routine(value={}){
  if(!value||typeof value!=='object')value={};
  return {id:typeof value.id==='string'?value.id.slice(0,80):id(),name:(typeof value.name==='string'?value.name.trim():'').slice(0,40)||'나의 루틴',
   rounds:Math.round(numeric(value.rounds,1,0,999)),steps:Array.isArray(value.steps)?value.steps.slice(0,40).map(step):[]};
 }
 function normalize(value={}){
  const settings={};for(const mode of [...Object.keys(MODES),'record'])settings[mode]=timing(mode,['pitch','record'].includes(mode)?{seconds:0,rounds:1,rest:0}:value?.settings?.[mode]);
  const seen=new Set(),routines=[];
  for(const raw of (Array.isArray(value?.routines)?value.routines:[]).slice(0,50)){const r=routine(raw);r.steps=r.steps.filter(step=>ROUTINE_MODES.includes(step.mode));if(seen.has(r.id))r.id=id();seen.add(r.id);routines.push(r);}
  return {version:1,settings,routines};
 }
 function vowelGuide(training={}){return {pattern:'vowelFive',root:training.root??48,noteSeconds:1.8,bpm:80,rounds:1,shift:0,listenFirst:false,sound:'piano',volume:70,tolerance:50,prepareSeconds:1.8,breathSeconds:3,restSeconds:3};}
 function migrateVowelPractice(storage){
  try{if(!storage||storage.getItem('voiceline-vowel-pitch-v1')==='1')return false;
   const training=JSON.parse(storage.getItem('voiceline-training-v1')||'null');let changed=false;
   if(training?.dynamicPattern==='vowels'){
    const previous=JSON.parse(storage.getItem('voiceline-unified-practice-v1')||'{}');
    storage.setItem('voiceline-unified-practice-v1',JSON.stringify({...previous,...vowelGuide(training),rounds:Math.round(numeric(training.rounds,1,0,99))}));
    storage.setItem('voiceline-training-v1',JSON.stringify({...training,dynamicPattern:'steps',dynamicSeconds:12}));changed=true;
   }
   const raw=JSON.parse(storage.getItem('voiceline-plans-v1')||'null');
   const legacyStages=raw?.settings?.dynamicVoice?.stages?.length===19;
   if(legacyStages||Array.isArray(raw?.routines)&&raw.routines.some(r=>Array.isArray(r.steps)&&r.steps.some(s=>s.mode==='dynamicVoice'&&s.params?.training?.dynamicPattern==='vowels'))){
    if(legacyStages)raw.settings.dynamicVoice={...raw.settings.dynamicVoice,seconds:12,customStages:false,stages:[]};
    storage.setItem('voiceline-plans-v1',JSON.stringify(normalize(raw)));changed=true;
   }
   storage.setItem('voiceline-vowel-pitch-v1','1');return changed;
  }catch(_){return false;}
 }
 function load(storage){try{migrateVowelPractice(storage);return normalize(JSON.parse(storage?.getItem('voiceline-plans-v1')||'{}'));}catch(_){return normalize();}}
 function migrateDefaultRoot(storage){
  try{if(!storage||storage.getItem('voiceline-c3-default-v1')==='1')return false;let changed=false;
   for(const key of ['voiceline-training-v1','voiceline-unified-practice-v1','voiceline-practice-v1','voiceline-guide-v1']){
    let value;try{value=JSON.parse(storage.getItem(key)||'null');}catch(_){continue;}
    if(value&&value.root===60){storage.setItem(key,JSON.stringify({...value,root:48}));changed=true;}
   }
   storage.setItem('voiceline-c3-default-v1','1');return changed;
  }catch(_){return false;}
 }
 function save(storage,value){const next=normalize(value);if(!storage)throw Error('설정을 저장할 수 없습니다.');storage.setItem('voiceline-plans-v1',JSON.stringify(next));return next;}
 // Aggregate by step rather than keeping every repetition of an unlimited routine.
 function createResultLog(name,single=false){
  const entries=new Map(),totals={success:0,failure:0,guided:0,stopped:0};let count=0,last=null;
  function add(result,index=0){
   if(!Object.hasOwn(totals,result.kind))return;
   count++;totals[result.kind]++;last=result;
   if(!entries.has(index))entries.set(index,{title:(single?'':(index+1)+'단계 · ')+result.title,counts:{success:0,failure:0,guided:0,stopped:0},issues:new Map(),last:null});
   const entry=entries.get(index);entry.counts[result.kind]++;entry.last=result;
   if(result.kind!=='success')entry.issues.set(result.kind,{reason:result.reason,rule:result.rule});
  }
  const countsText=c=>[['success','성공'],['failure','미달성'],['guided','측정 부족'],['stopped','중단']].filter(([key])=>c[key]).map(([key,label])=>label+' '+c[key]+'회').join(' · ');
  function summary(completed){
   if(!count)return null;
   if(single&&count===1)return {...last,...(!completed?{status:'중단',kind:'stopped',reason:'연습을 끝까지 완료하지 않았습니다. '+last.reason}:{})};
   const kind=!completed||totals.stopped?'stopped':totals.failure?'failure':totals.guided?'guided':'success';
   return {title:name,mode:'practice',kind,status:({success:'성공',failure:'미달성',guided:'측정 부족',stopped:'중단'})[kind],
    detail:count+'회 결과 · '+countsText(totals),
    rule:'각 연습의 판정 기준을 모든 회차에서 충족하면 성공입니다. 호흡·워밍업은 안내 과정 완료를 기준으로 합니다.',
    reason:!completed||totals.stopped?'중단한 연습이 있습니다. 완료한 회차의 결과도 아래에서 확인할 수 있습니다.':totals.failure||totals.guided?'기준을 충족하지 못한 회차가 있습니다. 단계별 결과와 부족한 기준을 확인하세요.':'모든 연습 회차의 기준을 충족했습니다.',
    steps:[...entries.values()].map(e=>({title:e.title,detail:countsText(e.counts),reason:e.issues.size?[...e.issues.values()].map(x=>x.reason).join(' / '):e.last.reason,rule:e.last.rule}))};
  }
  return {add,summary,get size(){return entries.size;}};
 }
 // A cancellable serial runner. Each step owns exactly one completion callback;
 // callbacks from an earlier routine cannot advance a replacement routine.
 function createRunner({run,stop=async()=>{},onState=()=>{},onFinish=()=>{},onError=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let generation=0,active=null,timer=null;
  const snapshot=()=>active?{...active,plan:active.plan,step:active.plan.steps[active.index]}:null;
  const emit=()=>onState(snapshot());
  function cancel(){generation++;if(timer!==null)clearTimer(timer);timer=null;active=null;emit();}
  async function launch(token){
   if(!active||token!==generation)return;
   active.phase='running';emit();const current=active;
   try{const started=await run(current.plan.steps[current.index],token);if(started===false&&active===current&&token===generation)throw Error('연습을 시작하지 못했습니다. 권한과 소리 설정을 확인해 주세요.');}
   catch(error){if(token!==generation)return;cancel();await stop();onError(error);}
  }
  async function start(value){cancel();const plan=routine(value);if(!plan.steps.length)throw Error('연습 단계를 하나 이상 추가해 주세요.');const token=generation;active={plan,index:0,round:1,stepRound:1,completed:0,phase:'starting'};await launch(token);return token;}
  function complete(token=generation){
   if(!active||token!==generation||active.phase!=='running')return false;
   const current=active,entry=current.plan.steps[current.index];current.completed++;current.phase='rest';emit();
   const again=current.stepRound<entry.timing.rounds;
   if(again)current.stepRound++;else{current.stepRound=1;current.index++;}
   if(current.index>=current.plan.steps.length){current.index=0;current.round++;}
   if(!again&&current.plan.rounds!==0&&current.round>current.plan.rounds){active=null;emit();onFinish({...current,round:current.round-1});return true;}
   timer=setTimer(()=>{timer=null;void launch(token);},['practice','warmupVoice','rest'].includes(entry.mode)?0:entry.timing.rest*1000);
   return true;
  }
  return {start,cancel,complete,snapshot,owns:token=>Boolean(active)&&token===generation,get token(){return generation;}};
 }
 return {vowelGuide,migrateVowelPractice,MODES,ROUTINE_MODES,DEFAULTS,EAR_PATTERNS,earRootLimit,earSequence,guideRound,numeric,timing,step,routine,normalize,load,save,migrateDefaultRoot,createResultLog,createRunner};
});
