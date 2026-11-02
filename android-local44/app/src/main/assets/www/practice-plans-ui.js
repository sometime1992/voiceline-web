'use strict';
(function(root){
 const api=root.VoiceLinePracticePlans;let storage;try{storage=root.localStorage;}catch(_){}
 let bridge=null,state=api.load(storage),runner=null,clock=null,clockToken=0,single=false,draft=null,editingMode=null,original=null;
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const modes=Object.keys(api.MODES),practiceModes=modes.filter(m=>m!=='rest');
 const copy=value=>JSON.parse(JSON.stringify(value));
 let methodGroup=0;
 function stored(){try{state=api.save(storage,state);return true;}catch(_){status('저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 저장해 주세요.');return false;}}
 function status(text){const node=$('planStatus');if(node)node.textContent=text;}
 function clearClock(){clockToken++;if(clock!==null)clearTimeout(clock);clock=null;}
 function timing(mode){const active=runner?.snapshot();return active?.step.mode===mode?active.step.timing:{...api.timing(mode,state.settings[mode]),...bridge?.legacyTiming(mode)};}
 function locked(){return Boolean(runner?.snapshot())||bridge?.busy();}
 function prepareStep(step){
  const p=step.params||{};
  p.training={root:48,earCount:4,dynamicPattern:'steps',dynamicCues:true,dynamicCueVolume:70,...p.training};
  p.training.root=Math.round(api.numeric(p.training.root,48,36,84));p.training.earCount=Math.round(api.numeric(p.training.earCount,4,1,20));
  p.training.dynamicPattern=root.VoiceLineDynamics.patternId(p.training.dynamicPattern);p.training.dynamicCueVolume=p.training.dynamicCues===false?0:Math.round(api.numeric(p.training.dynamicCueVolume,70,0,100));p.training.dynamicCues=p.training.dynamicCueVolume>0;
  p.training.warmup={inhale:4,exhale:6,hum:6,rest:3,cues:true,...p.training.warmup};
  p.training.earPattern=Object.hasOwn(api.EAR_PATTERNS,p.training.earPattern)?p.training.earPattern:'legacy';
  if(step.mode==='earVoice')p.training.root=Math.min(p.training.root,api.earRootLimit(p.training.earPattern));
  if(p.training.earPattern==='custom')p.training.earNotes=api.earSequence(p.training);
  p.guide=root.VoiceLineGuideTraining.normalize({...root.VoiceLineGuideTraining.PRACTICE_DEFAULTS,...p.guide,rounds:1});
  p.metronome=root.VoiceLineMetronome.normalize(p.metronome);
  p.vibratoRoot=Math.round(api.numeric(p.vibratoRoot,48,36,94));p.base=Math.round(api.numeric(p.base,48,24,84)/12)*12;p.pianoVolume=Math.round(api.numeric(p.pianoVolume,85,0,100));
  if(step.mode==='dynamicVoice'&&p.training.dynamicPattern==='vowels'&&!step.timing.customStages&&step.timing.seconds<30)step.timing.seconds=52;
  step.params=p;return step;
 }
 function methodText(step,stepRound=1,full=false){
  const {mode,timing:t,params:p}=step,tr=p.training||{},g=p.guide||{},w=tr.warmup||{},m=p.metronome||{},note=bridge.noteLabel;
  let text;
  if(mode==='practice'){
   const chosen=api.guideRound(g,stepRound),plan=root.VoiceLineGuideTraining.plan(chosen);
   text=plan.pattern.label+' · '+note(chosen.root)+' · '+(g.listenFirst?'먼저 듣고 따라 부르기':'바로 따라 부르기');
   if(full){const notes=plan.pattern.steps.map(n=>note(chosen.root+n));text+='\n음 순서: '+notes.join(' → ')+(plan.smooth?' · 끊지 않고 연속 이동':'');text+='\n'+(plan.smooth?g.smoothSeconds+'초 왕복':g.noteSeconds?g.noteSeconds+'초/음':g.bpm+' BPM')+' · '+root.VoiceLineGuideTraining.SOUNDS[g.sound]+' '+g.volume+'% · 허용 ±'+plan.tolerance+'cent';}
   if(g.shift)text+=' · 반복마다 '+(g.shift>0?'+':'')+g.shift+'반음';
  }else if(mode==='earVoice'){
   const notes=api.earSequence(tr);text=(api.EAR_PATTERNS[tr.earPattern]||api.EAR_PATTERNS.legacy)+' · '+notes.length+'음';
   text+=(full?'\n음 순서: ':' · ')+notes.slice(0,full?20:3).map(note).join(' → ')+(full||notes.length<=3?'':' …');
   if(full)text+='\n듣기 '+t.listen+'초 → 들이쉬기 '+t.breath+'초 → 따라 부르기 '+t.answer+'초 → 쉬기 '+t.noteRest+'초. 표시된 순서로 매번 동일하게 진행합니다.';
  }else if(mode==='dynamicVoice'){
   const pattern=root.VoiceLineDynamics.getPattern(tr.dynamicPattern),seconds=t.customStages?Math.round(t.stages.reduce((s,n)=>s+n,0)*10)/10:t.seconds;
   text=pattern.label+' · '+note(tr.root)+' · '+seconds+'초';
   if(full){const stages=root.VoiceLineDynamics.timeline(tr.dynamicPattern,seconds*1000,t.customStages?t.stages:null);text+='\n'+stages.map(s=>s.label+' '+Math.round((s.end-s.start)/100)/10+'초').join(' → ');text+='\n단계 안내음 '+(tr.dynamicCues===false||!tr.dynamicCueVolume?'끄기':tr.dynamicCueVolume+'%');}
  }else if(mode==='metronome')text=m.numerator+'/'+m.denominator+' · '+m.bpm+' BPM · '+({'beat':'박자표 음표 기준',quarter:'4분음표 기준',dottedQuarter:'점4분음표 기준'})[m.unit]+' · '+m.subdivision+'분할'+(full?'\n박별 강세: '+m.accents.map((a,i)=>(i+1)+'박 '+['묵음','보통','강세'][a]).join(' · ')+'\n'+({click:'클릭',wood:'우드',bell:'벨'})[m.sound]+' · '+(m.muted?'음소거':m.volume+'%'):'');
  else if(mode==='warmupVoice')text='들이쉬기 '+w.inhale+'초 → 내쉬기 '+w.exhale+'초 → 허밍 '+w.hum+'초 → 쉬기 '+w.rest+'초'+(full?'\n전환 안내음 '+(w.cues?'켜기':'끄기'):'');
  else if(mode==='sustainVoice'||mode==='vibrato')text=note(mode==='vibrato'?p.vibratoRoot:tr.root)+' · 발성 '+t.seconds+'초'+(full?'\n기준음 '+t.reference+'초 → 들이쉬기 '+t.breath+'초 → 발성 '+t.seconds+'초':'');
  else if(mode==='piano'||mode==='pitch')text=(mode==='piano'?'건반 직접 연주':'내 목소리 직접 측정')+' · 건반 '+note(p.base)+'부터 · '+t.seconds+'초'+(full?'\n자동으로 임의의 음을 재생하지 않습니다. 건반·기준음 음량 '+p.pianoVolume+'%':'');
  else text=t.seconds+'초 쉬기';
  if(mode!=='rest')text+=' · '+t.rounds+'회';return text;
 }
 function fields(mode,t,params,onChange,withinRoutine=false){
  const box=el('div',undefined,'plan-fields');
  function number(key,label,min,max,step=0.1,obj=t){
   const labelNode=el('label',label),input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.required=true;input.inputMode=step===1?'numeric':'decimal';input.value=String(obj[key]??0);input.setAttribute('aria-label',label);
   input.oninput=()=>{if(input.value!==''&&input.validity.valid){obj[key]=Number(input.value);onChange?.();}};labelNode.append(input);box.append(labelNode);return input;
  }
  function select(key,label,options,obj=params){const l=el('label',label),s=el('select');s.required=true;s.setAttribute('aria-label',label);for(const [value,text]of options){const o=el('option',text);o.value=String(value);s.append(o);}s.value=String(obj[key]);s.onchange=()=>{obj[key]=options.find(([value])=>String(value)===s.value)?.[0]??s.value;onChange?.(true);};l.append(s);box.append(l);return s;}
  function check(key,label,obj){const l=el('label',undefined,'plan-check'),c=el('input');c.type='checkbox';c.checked=obj[key]===true;c.setAttribute('aria-label',label);c.onchange=()=>{obj[key]=c.checked;onChange?.(true);};l.append(c,document.createTextNode(label));box.append(l);return c;}
  const noteOptions=(min=36,max=94)=>Array.from({length:max-min+1},(_,i)=>[min+i,bridge.noteLabel(min+i)]);
  if(withinRoutine){
   if(mode==='practice'){
    const g=params.guide,guide=root.VoiceLineGuideTraining,smooth=Boolean(guide.PATTERNS[g.pattern]?.smooth);
    const kind=select('kind','연습 종류',[['steps','음계·도약'],['smooth','연속 슬라이드']],{kind:smooth?'smooth':'steps'});
    kind.onchange=()=>{g.pattern=kind.value==='smooth'?'smooth5':'five';Object.assign(g,guide.normalize({...g,rounds:1}));onChange?.(true);};
    const pattern=select('pattern','연습 패턴',Object.entries(guide.PATTERNS).filter(([,p])=>Boolean(p.smooth)===smooth).map(([id,p])=>[id,p.label]),g);
    pattern.onchange=()=>{g.pattern=pattern.value;Object.assign(g,guide.normalize({...g,rounds:1}));onChange?.(true);};
    const max=guide.normalize({...g,root:94,rounds:1}).root;select('root','기준음',noteOptions(36,max),g);
    const method=el('fieldset',undefined,'plan-listen-choice'),options=el('div',undefined,'plan-listen-options'),groupName='plan-listen-'+(++methodGroup);method.append(el('legend','진행 방식'),options);
    for(const [value,title,description]of [[false,'바로 따라 부르기','준비 후 목표 그래프를 보며 바로 발성'],[true,'먼저 듣고 따라 부르기','한 구절 듣기 → 숨 들이쉬기 → 따라 부르기']]){
     const label=el('label',undefined,'plan-listen-option'+(g.listenFirst===value?' selected':'')),radio=el('input'),text=el('span');radio.type='radio';radio.name=groupName;radio.value=String(value);radio.required=true;radio.checked=g.listenFirst===value;radio.setAttribute('aria-label',title);radio.onchange=()=>{if(radio.checked){g.listenFirst=value;onChange?.(true);}};text.append(el('strong',title),el('small',description));label.append(radio,text);options.append(label);
    }
    box.append(method);
    if(!smooth){const length=select('lengthMode','음 길이 방식',[['seconds','초 직접 입력'],['bpm','BPM에 맞추기']],{lengthMode:g.noteSeconds?'seconds':'bpm'});length.onchange=()=>{g.noteSeconds=length.value==='bpm'?0:1.8;onChange?.(true);};}
    select('shift','반복 시 기준음 이동',[[0,'같은 음역 반복'],[1,'반음씩 올리기'],[-1,'반음씩 내리기']],g);
    select('sound','가이드 소리',Object.entries(guide.SOUNDS),g);number('volume','가이드 음량 (%)',0,100,1,g);
    if(!smooth)select('tolerance','음정 허용 범위',[[35,'정밀하게 · ±35cent'],[50,'기본 · ±50cent'],[75,'여유롭게 · ±75cent']],g);
   }
   if(['sustainVoice','earVoice','dynamicVoice'].includes(mode))select('root','기준음',noteOptions(36,mode==='earVoice'?api.earRootLimit(params.training.earPattern):84),params.training);
   if(mode==='vibrato')select('vibratoRoot','기준음',noteOptions(),params);
   if(mode==='dynamicVoice'){
    const tr=params.training,pattern=select('dynamicPattern','강약 방법',Object.entries(root.VoiceLineDynamics.PATTERNS).map(([id,p])=>[id,p.label]),tr);
    pattern.onchange=()=>{const before=tr.dynamicPattern;tr.dynamicPattern=pattern.value;if((before==='vowels')!==(tr.dynamicPattern==='vowels'))t.seconds=tr.dynamicPattern==='vowels'?52:12;t.stages=root.VoiceLineDynamics.getPattern(pattern.value).segments.map(s=>s.ms/1000);onChange?.(true);};
    const volume=number('dynamicCueVolume','단계 전환 안내음 크기 (%)',0,100,1,tr),change=volume.oninput;volume.oninput=()=>{if(volume.value!==''&&volume.validity.valid)tr.dynamicCues=Number(volume.value)>0;change();};
   }
   if(mode==='earVoice'){
    const tr=params.training;select('earPattern','청음 방법',Object.entries(api.EAR_PATTERNS),tr);
    select('earCount','한 회차에서 들을 음 수',Array.from({length:20},(_,i)=>[i+1,(i+1)+'음']),tr);
    if(tr.earPattern==='custom'){tr.earNotes=api.earSequence(tr);const group=el('div',undefined,'plan-note-fields');for(let i=0;i<tr.earNotes.length;i++){const before=box.children.length;select(i,(i+1)+'번째 청음',noteOptions(),tr.earNotes);group.append(box.children[before]);}box.append(group);}
   }
   if(['piano','pitch'].includes(mode))select('base','건반 시작 옥타브',Array.from({length:6},(_,i)=>[24+i*12,bridge.noteLabel(24+i*12)]),params);
   if(['piano','pitch','sustainVoice','earVoice','dynamicVoice','vibrato'].includes(mode))number('pianoVolume','건반·기준음 음량 (%)',0,100,1,params);
   if(mode==='warmupVoice')check('cues','단계 전환 안내음 켜기',params.training.warmup);
   if(mode==='metronome'){
    const m=params.metronome,metro=root.VoiceLineMetronome;
    number('bpm','빠르기 (BPM)',20,300,1,m);select('numerator','한 마디의 박 수',Array.from({length:64},(_,i)=>[i+1,(i+1)+'박']),m);
    select('denominator','박자표의 기준 음표',metro.DENOMINATORS.map(n=>[n,n+'분음표']),m);
    select('unit','BPM 기준',[["beat",'박자표 음표'],['quarter','4분음표'],['dottedQuarter','점4분음표']],m);
    select('subdivision','한 박의 세분',metro.SUBDIVISIONS.map(n=>[n,n+'분할']),m);
    select('sound','클릭 소리',[['click','클릭'],['wood','우드'],['bell','벨']],m);number('volume','메트로놈 음량 (%)',0,100,1,m);check('muted','메트로놈 음소거',m);
    const accents=el('details',undefined,'plan-accents');accents.append(el('summary','박별 강세·묵음 설정'));const group=el('div',undefined,'plan-accent-fields');
    for(let i=0;i<m.numerator;i++){const before=box.children.length;select(i,(i+1)+'박 강세',[[0,'묵음'],[1,'보통'],[2,'강세']],m.accents);group.append(box.children[before]);}accents.append(group);box.append(accents);
   }
  }
  if(mode==='practice'){
   const g=params.guide||params;
   const smooth=root.VoiceLineGuideTraining.PATTERNS[g.pattern]?.smooth;
   if(smooth)number('smoothSeconds','연속 왕복 시간 (초)',1,300,.1,g);else if(withinRoutine&&g.noteSeconds===0)number('bpm','빠르기 (BPM)',50,120,1,g);else number('noteSeconds',withinRoutine?'한 음 길이 (초)':'한 음 길이 (초, 0=BPM)',withinRoutine?0.1:0,60,.1,g);
   const prepare=number('prepareSeconds','먼저 듣기 전 준비 (초)',0,120,.1,g);prepare.disabled=withinRoutine&&!g.listenFirst;number('breathSeconds','발성 전 들이쉬기 (초)',0,120,.1,g);number('restSeconds','회차 사이 쉬기 (초)',0,120,.1,g);
   if(!withinRoutine)number('rounds','반복 횟수 (0=무한 반복)',0,99,1,g);
  }else if(mode==='warmupVoice'){
   const w=params.training?.warmup||params.warmup;
   if(w)for(const [key,label]of [['inhale','들이쉬기'],['exhale','내쉬기'],['hum','허밍'],['rest','쉬기']])number(key,label+' (초)',key==='rest'?0:1,120,.1,w);
   number('prepare','시작 전 준비 (초)',0,120);
  }else if(mode==='earVoice'){
   number('prepare','시작 전 준비 (초)',0,120);number('listen','기준음 듣기 (초)',.5,120);number('breath','들이쉬기 (초)',0,120);number('answer','따라 부르기 (초)',.5,120);number('noteRest','음 사이 쉬기 (초)',0,120);
  }else{
   const min=mode==='dynamicVoice'?(params.training?.dynamicPattern==='vowels'?30:8):['sustainVoice','vibrato','rest'].includes(mode)?1:0;
   number('seconds',withinRoutine&&['piano','pitch','metronome'].includes(mode)?'진행 시간 (초)':mode==='record'?'녹음 시간 (초, 0=직접 중단)':['piano','pitch','metronome'].includes(mode)?'진행 시간 (초, 0=직접 중단)':'발성·진행 시간 (초)',withinRoutine?Math.max(1,min):min,mode==='record'?600:mode==='dynamicVoice'?300:3600);
   if(['sustainVoice','dynamicVoice','vibrato'].includes(mode)){number('reference','기준음 듣기 (초)',0,120);number('breath','들이쉬기 (초)',0,120);}
  }
  if(mode==='dynamicVoice'){
   const pattern=params.training?.dynamicPattern||bridge.capture(mode).training.dynamicPattern,p=root.VoiceLineDynamics.getPattern(pattern);
   const l=el('label',undefined,'plan-check'),check=el('input');check.type='checkbox';check.checked=t.customStages;l.append(check,document.createTextNode('단계별 시간을 각각 입력'));box.append(l);
   const stages=el('div',undefined,'plan-stage-fields');stages.hidden=!t.customStages;box.append(stages);
   if(t.stages.length!==p.segments.length)t.stages=p.segments.map(s=>s.ms/1000);
   const total=box.querySelector('[aria-label="발성·진행 시간 (초)"]');total.disabled=t.customStages;
   const syncTotal=()=>{total.value=String(t.customStages?Math.round(t.stages.reduce((sum,n)=>sum+n,0)*10)/10:t.seconds);};
   p.segments.forEach((s,i)=>{const row=el('label',s.label+' (초)'),input=el('input');input.type='number';input.min=s.rest?'0':'1';input.max='60';input.step='.1';input.required=true;input.inputMode='decimal';input.value=String(t.stages[i]);input.disabled=!t.customStages;input.oninput=()=>{if(input.value!==''&&input.validity.valid){t.stages[i]=Number(input.value);syncTotal();onChange?.();}};row.append(input);stages.append(row);});
   check.onchange=()=>{t.customStages=check.checked;if(!check.checked)t.seconds=Math.max(Number(total.min),Math.min(Number(total.max),t.seconds));total.disabled=check.checked;stages.hidden=!check.checked;for(const input of stages.querySelectorAll('input'))input.disabled=!check.checked;syncTotal();onChange?.();};syncTotal();
  }
  if(mode!=='practice'&&mode!=='record'&&mode!=='rest')number('rounds',withinRoutine?'이 단계 반복 횟수':'반복 횟수 (0=무한 반복)',withinRoutine?1:0,99,1);
  if(withinRoutine&&mode==='practice')number('rounds','이 단계 반복 횟수',1,99,1);
  if(!['practice','warmupVoice','rest','record'].includes(mode))number('rest','반복 사이 쉬기 (초)',0,120);
  return box;
 }
 function valid(){
  const bad=$('planDialog').querySelector('input:invalid,select:invalid');
  if(bad){for(let d=bad.closest('details');d;d=d.parentElement.closest('details'))d.open=true;bad.reportValidity();status('표시된 범위 안에서 상세 설정을 입력해 주세요.');return false;}
  const timings=editingMode==='dynamicVoice'?[draft.timing]:!editingMode?(draft?.steps||[]).filter(s=>s.mode==='dynamicVoice').map(s=>s.timing):[];if(timings.some(t=>t.customStages&&t.stages.reduce((a,b)=>a+b,0)>300)){status('강약 연습의 전체 시간은 300초 이내로 설정해 주세요.');return false;}
  if(!editingMode)for(const [index,step]of (draft?.steps||[]).entries()){
   const issue=step.mode==='metronome'?root.VoiceLineMetronome.timingIssue(step.params.metronome):step.mode==='practice'&&root.VoiceLineGuideTraining.plan({...step.params.guide,rounds:step.timing.rounds}).limited?'반복 중 음역이 측정 범위를 벗어납니다. 기준음·반복 횟수·기준음 이동을 조절해 주세요.':null;
   if(issue){const card=$('planEditor').children[index];card.open=true;card.scrollIntoView({block:'nearest'});status((index+1)+'단계: '+issue);return false;}
  }
  return true;
 }
 function openMode(mode){
  if(locked()){bridge.notify('진행 중인 연습을 중단한 뒤 설정해 주세요.');return;}
  editingMode=mode;draft={timing:copy(timing(mode)),params:copy(bridge.capture(mode))};
  $('planTitle').textContent=api.MODES[mode]||'녹음';$('planList').hidden=true;$('planEditor').replaceChildren(fields(mode,draft.timing,draft.params));
  $('planName').hidden=true;$('planName').disabled=true;$('planRoutineRounds').disabled=true;$('planNameLabel').hidden=true;$('planRoutineRoundsLabel').hidden=true;$('planAddRow').hidden=true;$('planNew').hidden=true;$('planDelete').hidden=true;
  $('planSave').hidden=false;$('planRun').textContent=mode==='piano'?'타이머 시작':'이 설정으로 시작';status('초 단위로 직접 입력합니다. 0회는 중단할 때까지 무한 반복합니다.');bridge.modalOpen('planDialog');
 }
 function selectedRoutine(){return state.routines.find(r=>r.id===$('planList').value);}
 function renderList(id){const select=$('planList');select.replaceChildren();for(const r of state.routines){const o=el('option',r.name);o.value=r.id;select.append(o);}if(id)select.value=id;}
 function renderSteps(openId=null,newStep=false){
  const list=$('planEditor'),opened=new Set([...list.querySelectorAll('.plan-step[open]')].map(c=>c.dataset.stepId)),accentsOpened=new Set([...list.querySelectorAll('.plan-accents[open]')].map(c=>c.closest('.plan-step').dataset.stepId)),modal=$('planDialog').querySelector('section'),scroll=modal.scrollTop;
  const active=document.activeElement,label=active?.getAttribute('aria-label'),activeStep=active?.closest('.plan-step')?.dataset.stepId;
  list.replaceChildren();
  if(!draft?.steps.length)list.append(el('p','연습을 추가하고 원하는 순서로 배치하세요.','plan-note'));
  draft?.steps.forEach((step,index)=>{
   prepareStep(step);
   const card=el('details',undefined,'plan-step'),summary=el('summary'),heading=el('span',undefined,'plan-step-heading'),title=el('strong',(index+1)+'. '+api.MODES[step.mode]),edit=el('span',undefined,'plan-edit-label'),selected=el('small',methodText(step),'plan-selected');
   card.dataset.stepId=step.id;card.open=opened.has(step.id)||openId===step.id;heading.append(title,edit);summary.append(heading,selected);card.append(summary);
   const updateToggle=()=>{edit.textContent=card.open?'설정 접기 ▴':'상세 설정 ▾';};card.ontoggle=updateToggle;updateToggle();
   const buttons=el('div',undefined,'plan-step-actions');
   for(const [label,action,disabled]of [['위로',()=>move(index,-1),index===0],['아래로',()=>move(index,1),index===draft.steps.length-1],['단계 삭제',()=>{draft.steps.splice(index,1);renderSteps();},false]]){const b=el('button',label);b.type='button';b.disabled=disabled;b.onclick=action;buttons.append(b);}card.append(buttons);
   const preview=el('p',methodText(step,1,true),'plan-preview');
   card.append(fields(step.mode,step.timing,step.params,refresh=>{if(refresh)renderSteps(step.id);else{selected.textContent=methodText(step);preview.textContent=methodText(step,1,true);}},true),preview);if(accentsOpened.has(step.id))card.querySelector('.plan-accents').open=true;list.append(card);
  });
  if(newStep)list.querySelector('[data-step-id="'+openId+'"]')?.scrollIntoView({block:'nearest',behavior:'smooth'});else{modal.scrollTop=scroll;if(label&&activeStep){const card=[...list.children].find(c=>c.dataset.stepId===activeStep),input=[...card?.querySelectorAll('[aria-label]')||[]].find(n=>n.getAttribute('aria-label')===label);input?.focus({preventScroll:true});}}
 }
 function move(index,delta){if(!valid())return;const [step]=draft.steps.splice(index,1);draft.steps.splice(index+delta,0,step);renderSteps();}
 function loadRoutine(value){delete $('planDelete').dataset.confirm;draft=copy(value||api.routine({name:'나의 루틴 '+(state.routines.length+1)}));$('planName').value=draft.name;$('planRoutineRounds').value=String(draft.rounds);renderSteps();$('planDelete').hidden=!selectedRoutine();}
 function openRoutines(){
  if(locked()){bridge.notify('진행 중인 연습을 중단한 뒤 루틴을 편집해 주세요.');return;}
  editingMode=null;renderList();loadRoutine(selectedRoutine());$('planTitle').textContent='나의 루틴';$('planList').hidden=false;$('planName').disabled=false;$('planRoutineRounds').disabled=false;
  for(const id of ['planName','planNameLabel','planRoutineRoundsLabel','planAddRow','planNew','planSave'])$(id).hidden=false;
  $('planRun').textContent='루틴 시작';status('각 단계의 상세 설정에서 원하는 연습을 고르세요. 저장한 설정과 표시된 음 순서로 실행합니다. 루틴 전체 0회는 무한 반복입니다.');bridge.modalOpen('planDialog');
 }
 function saveDraft(){
  if(!valid())return false;
  if(editingMode){const previous=copy(state);state.settings[editingMode]=api.timing(editingMode,draft.timing);if(!stored()){state=previous;return false;}bridge.apply(editingMode,draft.timing,draft.params);return true;}
  draft.name=$('planName').value.trim();draft.rounds=Number($('planRoutineRounds').value);const next=api.routine(draft),index=state.routines.findIndex(r=>r.id===next.id);
  if(index<0&&state.routines.length>=50){status('루틴은 최대 50개까지 저장할 수 있습니다.');return false;}
  const previous=copy(state);if(index<0)state.routines.push(next);else state.routines[index]=next;
  if(!stored()){state=previous;return false;}draft=copy(next);renderList(next.id);$('planDelete').hidden=false;status('루틴을 저장했습니다.');return true;
 }
 function clear(){clearClock();if(original){bridge.restore(original);original=null;}const node=$('planBanner');if(node)node.hidden=true;if($('modeMessage'))$('modeMessage').hidden=false;}
 function cancel(){runner?.cancel();clear();}
 async function startPlan(plan,isSingle=false){
  if(bridge.startBlocked())return false;await bridge.stop();single=isSingle;const baseline=bridge.captureAll();
  try{const start=runner.start(plan);original=baseline;await start;return Boolean(runner.snapshot());}catch(error){clear();bridge.notify(error.message);return false;}
 }
 async function startSingle(mode){
  const t=timing(mode),params=copy(bridge.capture(mode));
  if(mode==='practice'){params.guide.rounds=t.rounds;}
  if(mode==='warmupVoice')params.training.rounds=t.rounds||1;
  const nativeRounds=mode==='practice'||mode==='warmupVoice';
  const rounds=nativeRounds&&t.rounds!==0?1:t.rounds;
  const entry={mode,timing:{...t,rounds:nativeRounds?1:Math.max(1,t.rounds)},params};
  if(!nativeRounds)entry.timing.rounds=1;
  // Single manual sessions retain 0 seconds; routine steps are always finite.
  const plan={name:api.MODES[mode]||'녹음',rounds,steps:[entry]};
  if(mode==='record'){plan.rounds=1;entry.timing.rounds=1;}
  await startPlan(plan,true);
 }
 function arm(mode,start,seconds){
  clearClock();if(!runner.snapshot()||seconds<=0)return;
  const token=runner.token,ownClock=clockToken;
  const check=async()=>{if(ownClock!==clockToken||!runner.owns(token))return;const left=start+seconds*1000-performance.now();const count=Math.max(0,Math.ceil(left/1000)),node=$('planBannerText');if(node&&node.dataset.seconds!==String(count)){node.dataset.seconds=String(count);const current=runner.snapshot();node.textContent=current.plan.name+' · '+current.round+'/'+(current.plan.rounds||'∞')+'회 · '+(current.index+1)+'/'+current.plan.steps.length+'단계 · '+(single?api.MODES[mode]:methodText(current.step,current.stepRound))+' · 남은 '+count+'초';}
   if(left>0){clock=setTimeout(check,Math.min(200,left));return;}
   clock=null;await bridge.stop(true);if(ownClock===clockToken&&runner.owns(token))runner.complete(token);
  };clock=setTimeout(check,Math.max(0,Math.min(200,start+seconds*1000-performance.now())));
 }
 function trainingEnded(completed){if(!runner?.snapshot())return false;clearClock();if(completed)runner.complete();else cancel();return true;}
 function patternChanged(pattern){if(!state.settings.dynamicVoice.customStages)return null;state.settings.dynamicVoice.stages=root.VoiceLineDynamics.getPattern(pattern).segments.map(s=>s.ms/1000);stored();return state.settings.dynamicVoice.stages.reduce((a,b)=>a+b,0);}
 function mount(callbacks){
  bridge=callbacks;
  const modal=el('div');modal.id='planDialog';modal.className='modal-backdrop plan-backdrop';modal.hidden=true;
  modal.innerHTML='<section class="modal plan-modal" role="dialog" aria-modal="true" aria-labelledby="planTitle"><div class="modal-heading"><h2 id="planTitle">시간·반복 설정</h2><button id="planClose" type="button" class="close-btn" aria-label="시간·루틴 설정 닫기">✕</button></div><div class="plan-library"><select id="planList" aria-label="저장한 루틴"></select><button id="planNew" type="button">새 루틴</button><button id="planDelete" type="button">루틴 삭제</button></div><label id="planNameLabel">루틴 이름<input id="planName" maxlength="40" required></label><label id="planRoutineRoundsLabel">루틴 전체 반복 횟수 (0=무한 반복)<input id="planRoutineRounds" type="number" min="0" max="999" step="1" value="1" required inputmode="numeric"></label><div id="planAddRow" class="plan-add"><select id="planAddMode" aria-label="추가할 연습"></select><button id="planAdd" type="button">단계 추가</button></div><div id="planEditor"></div><p id="planStatus" class="plan-note" role="status"></p><div class="plan-actions"><button id="planSave" type="button">설정 저장</button><button id="planRun" type="button">루틴 시작</button></div></section>';
  document.body.append(modal);
  for(const [mode,name]of Object.entries(api.MODES).filter(([mode])=>mode!=='record')){const o=el('option',name);o.value=mode;$('planAddMode').append(o);}
  $('planClose').onclick=()=>bridge.modalClose('planDialog');modal.onclick=event=>{if(event.target===modal)bridge.modalClose('planDialog');};
  $('planList').onchange=()=>loadRoutine(selectedRoutine());$('planNew').onclick=()=>{$('planList').value='';loadRoutine();$('planName').focus();};
  $('planAdd').onclick=()=>{if(!valid())return;if(draft.steps.length>=40){status('한 루틴은 최대 40단계까지 만들 수 있습니다.');return;}const mode=$('planAddMode').value,step=prepareStep(api.step({mode,timing:timing(mode),params:copy(bridge.capture(mode))}));draft.steps.push(step);renderSteps(step.id,true);};
  $('planDelete').onclick=()=>{const id=selectedRoutine()?.id;if(!id)return;if($('planDelete').dataset.confirm!==id){$('planDelete').dataset.confirm=id;status('선택한 루틴을 삭제하려면 루틴 삭제를 한 번 더 누르세요.');return;}const previous=copy(state);state.routines=state.routines.filter(r=>r.id!==id);if(!stored()){state=previous;return;}delete $('planDelete').dataset.confirm;renderList();loadRoutine(selectedRoutine());status('루틴을 삭제했습니다.');};
  $('planSave').onclick=()=>{if(saveDraft()&&editingMode){bridge.modalClose('planDialog');bridge.notify('시간·반복 설정을 저장했습니다.');}};
  $('planRun').onclick=async()=>{if(!saveDraft())return;if(!editingMode&&!draft.steps.length){status('연습 단계를 하나 이상 추가해 주세요.');return;}const mode=editingMode,plan=copy(draft);bridge.modalClose('planDialog');bridge.unlock();if(mode)await startSingle(mode);else await startPlan(plan);};
  const banner=el('div',undefined,'plan-banner');banner.id='planBanner';banner.hidden=true;const text=el('span');text.id='planBannerText';text.setAttribute('role','status');text.setAttribute('aria-live','polite');banner.append(text);$('modeMessage').parentElement.append(banner);
  runner=api.createRunner({run:async(step,token)=>{
   const current=runner.snapshot();if(single&&state.settings[step.mode]?.seconds===0&&['piano','pitch','metronome','record'].includes(step.mode))step.timing.seconds=0;
   return bridge.run(step,token,current,single);
  },stop:()=>bridge.stop(),onError:error=>bridge.notify(error.message),onFinish:result=>bridge.finished(result,single),onState:current=>{
   if(!current){clear();return;}banner.hidden=false;$('modeMessage').hidden=true;delete $('planBannerText').dataset.seconds;$('planBannerText').textContent=current.plan.name+' · '+current.round+'/'+(current.plan.rounds||'∞')+'회 · '+(current.index+1)+'/'+current.plan.steps.length+'단계 · '+(single?api.MODES[current.step.mode]:methodText(current.step,current.stepRound))+' · '+(current.phase==='rest'?'회복 중':current.stepRound+'회차');if(current.phase==='rest')$('mainButton').textContent='회복 중 · 전체 중단';
  }});
  const menu=$('menuDialog')?.querySelector('.menu-grid')||$('menuDialog')?.querySelector('[data-screen]')?.parentElement;
  if(menu){const b=el('button',undefined,'menu-tile');b.id='openRoutines';b.type='button';b.innerHTML='<span class="tile-icon">≡</span><span><strong>나의 루틴</strong><small>순서·시간·반복을 직접 구성</small></span>';b.onclick=()=>{bridge.modalClose('menuDialog');openRoutines();};menu.insertBefore(b,menu.querySelector('[data-screen="help"]'));}
  return root.VoiceLinePlansUI;
 }
 function controls(container,mode){$('customTimingOpen')?.remove();if(!bridge||!['record',...practiceModes].includes(mode))return;const b=el('button','시간·반복','mode-guide-button plan-time-button');b.type='button';b.id='customTimingOpen';b.setAttribute('aria-haspopup','dialog');b.onclick=()=>openMode(mode);$('modeGuideButton').parentElement.append(b);}
 root.VoiceLinePlansUI={mount,controls,timing,openMode,openRoutines,startSingle,cancel,trainingEnded,patternChanged,arm,volumeChanged:n=>{if(original)original.pianoVolume=n;},owns:token=>runner?.owns(token),showFinalResult:()=>{const s=runner?.snapshot();return single&&s&&s.plan.rounds!==0&&s.round===s.plan.rounds&&s.index===s.plan.steps.length-1&&s.stepRound===s.step.timing.rounds;},get active(){return Boolean(runner?.snapshot());},get token(){return runner?.token;}};
})(globalThis);
