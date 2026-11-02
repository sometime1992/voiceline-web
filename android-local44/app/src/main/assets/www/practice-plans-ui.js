'use strict';
(function(root){
 const api=root.VoiceLinePracticePlans;let storage;try{storage=root.localStorage;}catch(_){}
 let bridge=null,state=api.load(storage),runner=null,clock=null,clockToken=0,single=false,draft=null,editingMode=null,original=null;
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const modes=Object.keys(api.MODES),practiceModes=modes.filter(m=>m!=='rest');
 const copy=value=>JSON.parse(JSON.stringify(value));
 function stored(){try{state=api.save(storage,state);return true;}catch(_){status('저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 저장해 주세요.');return false;}}
 function status(text){const node=$('planStatus');if(node)node.textContent=text;}
 function clearClock(){clockToken++;if(clock!==null)clearTimeout(clock);clock=null;}
 function timing(mode){const active=runner?.snapshot();return active?.step.mode===mode?active.step.timing:{...api.timing(mode,state.settings[mode]),...bridge?.legacyTiming(mode)};}
 function locked(){return Boolean(runner?.snapshot())||bridge?.busy();}
 function fields(mode,t,params,onChange,withinRoutine=false){
  const box=el('div',undefined,'plan-fields');
  function number(key,label,min,max,step=0.1,obj=t){
   const labelNode=el('label',label),input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.required=true;input.inputMode=step===1?'numeric':'decimal';input.value=String(obj[key]??0);input.setAttribute('aria-label',label);
   input.oninput=()=>{if(input.value!==''&&input.validity.valid){obj[key]=Number(input.value);onChange?.();}};labelNode.append(input);box.append(labelNode);return input;
  }
  function select(key,label,options,obj=params){const l=el('label',label),s=el('select');s.setAttribute('aria-label',label);for(const [value,text]of options){const o=el('option',text);o.value=String(value);s.append(o);}s.value=String(obj[key]);s.onchange=()=>{obj[key]=Number.isFinite(Number(s.value))?Number(s.value):s.value;onChange?.(true);};l.append(s);box.append(l);return s;}
  if(mode==='practice'){
   const g=params.guide||params;
   if(withinRoutine)select('pattern','연습 패턴',Object.entries(root.VoiceLineGuideTraining.PATTERNS).map(([id,p])=>[id,p.label]),g);
   const smooth=root.VoiceLineGuideTraining.PATTERNS[g.pattern]?.smooth;
   if(smooth)number('smoothSeconds','연속 왕복 시간 (초)',1,300,.1,g);else number('noteSeconds','한 음 길이 (초, 0=BPM)',0,60,.1,g);
   number('prepareSeconds','먼저 듣기 전 준비 (초)',0,120,.1,g);number('breathSeconds','발성 전 들이쉬기 (초)',0,120,.1,g);number('restSeconds','회차 사이 쉬기 (초)',0,120,.1,g);
   if(!withinRoutine)number('rounds','반복 횟수 (0=무한 반복)',0,99,1,g);
  }else if(mode==='warmupVoice'){
   const w=params.training?.warmup||params.warmup;
   if(w)for(const [key,label]of [['inhale','들이쉬기'],['exhale','내쉬기'],['hum','허밍'],['rest','쉬기']])number(key,label+' (초)',key==='rest'?0:1,120,.1,w);
   number('prepare','시작 전 준비 (초)',0,120);
  }else if(mode==='earVoice'){
   number('prepare','시작 전 준비 (초)',0,120);number('listen','기준음 듣기 (초)',.5,120);number('breath','들이쉬기 (초)',0,120);number('answer','따라 부르기 (초)',.5,120);number('noteRest','음 사이 쉬기 (초)',0,120);
  }else{
   const min=mode==='dynamicVoice'?8:['sustainVoice','vibrato','rest'].includes(mode)?1:0;
   number('seconds',withinRoutine&&['piano','pitch','metronome'].includes(mode)?'진행 시간 (초)':mode==='record'?'녹음 시간 (초, 0=직접 중단)':['piano','pitch','metronome'].includes(mode)?'진행 시간 (초, 0=직접 중단)':'발성·진행 시간 (초)',withinRoutine?Math.max(1,min):min,mode==='record'?600:mode==='dynamicVoice'?300:3600);
   if(['sustainVoice','dynamicVoice','vibrato'].includes(mode)){number('reference','기준음 듣기 (초)',0,120);number('breath','들이쉬기 (초)',0,120);}
  }
  if(mode==='dynamicVoice'){
   const pattern=params.training?.dynamicPattern||bridge.capture(mode).training.dynamicPattern,p=root.VoiceLineDynamics.getPattern(pattern);
   const l=el('label',undefined,'plan-check'),check=el('input');check.type='checkbox';check.checked=t.customStages;l.append(check,document.createTextNode('단계별 시간을 각각 입력'));box.append(l);
   const stages=el('div',undefined,'plan-stage-fields');stages.hidden=!t.customStages;box.append(stages);
   if(t.stages.length!==p.segments.length)t.stages=p.segments.map(s=>s.ms/1000);
   const total=box.querySelector('input');total.disabled=t.customStages;
   const syncTotal=()=>{total.value=String(t.customStages?Math.round(t.stages.reduce((sum,n)=>sum+n,0)*10)/10:t.seconds);};
   p.segments.forEach((s,i)=>{const row=el('label',s.label+' (초)'),input=el('input');input.type='number';input.min='1';input.max='60';input.step='.1';input.required=true;input.inputMode='decimal';input.value=String(t.stages[i]);input.disabled=!t.customStages;input.oninput=()=>{if(input.value!==''&&input.validity.valid){t.stages[i]=Number(input.value);syncTotal();}};row.append(input);stages.append(row);});
   check.onchange=()=>{t.customStages=check.checked;total.disabled=check.checked;stages.hidden=!check.checked;for(const input of stages.querySelectorAll('input'))input.disabled=!check.checked;syncTotal();};syncTotal();
  }
  if(withinRoutine&&['practice','sustainVoice','earVoice','dynamicVoice','vibrato'].includes(mode)){
   const target=mode==='practice'?(params.guide||params):mode==='vibrato'?params:params.training;
   select(mode==='vibrato'?'vibratoRoot':'root','기준음',Array.from({length:49},(_,i)=>[36+i,bridge.noteLabel(36+i)]),target);
  }
  if(withinRoutine&&mode==='dynamicVoice')select('dynamicPattern','강약 방법',Object.entries(root.VoiceLineDynamics.PATTERNS).map(([id,p])=>[id,p.label]),params.training);
  if(withinRoutine&&mode==='earVoice')number('earCount','한 회차에서 들을 음 수',1,20,1,params.training);
  if(withinRoutine&&mode==='metronome'&&params.metronome)number('bpm','빠르기 (BPM)',20,300,1,params.metronome);
  if(mode!=='practice'&&mode!=='record'&&mode!=='rest')number('rounds',withinRoutine?'이 단계 반복 횟수':'반복 횟수 (0=무한 반복)',withinRoutine?1:0,99,1);
  if(withinRoutine&&mode==='practice')number('rounds','이 단계 반복 횟수',1,99,1);
  if(!['practice','warmupVoice','rest','record'].includes(mode))number('rest','반복 사이 쉬기 (초)',0,120);
  return box;
 }
 function valid(){const bad=$('planDialog').querySelector('input:invalid');if(bad){bad.reportValidity();status('표시된 범위 안에서 시간을 입력해 주세요.');return false;}return true;}
 function openMode(mode){
  if(locked()){bridge.notify('진행 중인 연습을 중단한 뒤 설정해 주세요.');return;}
  editingMode=mode;draft={timing:copy(timing(mode)),params:copy(bridge.capture(mode))};
  $('planTitle').textContent=api.MODES[mode]||'녹음';$('planList').hidden=true;$('planEditor').replaceChildren(fields(mode,draft.timing,draft.params));
  $('planName').hidden=true;$('planName').disabled=true;$('planRoutineRounds').disabled=true;$('planNameLabel').hidden=true;$('planRoutineRoundsLabel').hidden=true;$('planAddRow').hidden=true;$('planNew').hidden=true;$('planDelete').hidden=true;
  $('planSave').hidden=false;$('planRun').textContent=mode==='piano'?'타이머 시작':'이 설정으로 시작';status('초 단위로 직접 입력합니다. 0회는 중단할 때까지 무한 반복합니다.');bridge.modalOpen('planDialog');
 }
 function selectedRoutine(){return state.routines.find(r=>r.id===$('planList').value);}
 function renderList(id){const select=$('planList');select.replaceChildren();for(const r of state.routines){const o=el('option',r.name);o.value=r.id;select.append(o);}if(id)select.value=id;}
 function renderSteps(){
  const list=$('planEditor');list.replaceChildren();
  if(!draft?.steps.length)list.append(el('p','연습을 추가하고 원하는 순서로 배치하세요.','plan-note'));
  draft?.steps.forEach((step,index)=>{
   const card=el('details',undefined,'plan-step'),summary=el('summary',(index+1)+'. '+api.MODES[step.mode]);card.append(summary);
   const buttons=el('div',undefined,'plan-step-actions');
   for(const [label,action,disabled]of [['위로',()=>move(index,-1),index===0],['아래로',()=>move(index,1),index===draft.steps.length-1],['단계 삭제',()=>{draft.steps.splice(index,1);renderSteps();},false]]){const b=el('button',label);b.type='button';b.disabled=disabled;b.onclick=action;buttons.append(b);}card.append(buttons);
   card.append(fields(step.mode,step.timing,step.params,refresh=>{if(refresh){const wasOpen=card.open;renderSteps();$('planEditor').children[index].open=wasOpen;}},true));list.append(card);
  });
 }
 function move(index,delta){if(!valid())return;const [step]=draft.steps.splice(index,1);draft.steps.splice(index+delta,0,step);renderSteps();}
 function loadRoutine(value){delete $('planDelete').dataset.confirm;draft=copy(value||api.routine({name:'나의 루틴 '+(state.routines.length+1)}));$('planName').value=draft.name;$('planRoutineRounds').value=String(draft.rounds);renderSteps();$('planDelete').hidden=!selectedRoutine();}
 function openRoutines(){
  if(locked()){bridge.notify('진행 중인 연습을 중단한 뒤 루틴을 편집해 주세요.');return;}
  editingMode=null;renderList();loadRoutine(selectedRoutine());$('planTitle').textContent='나의 루틴';$('planList').hidden=false;$('planName').disabled=false;$('planRoutineRounds').disabled=false;
  for(const id of ['planName','planNameLabel','planRoutineRoundsLabel','planAddRow','planNew','planSave'])$(id).hidden=false;
  $('planRun').textContent='루틴 시작';status('단계 제목을 누르면 시간·기준음 등을 편집합니다. 루틴 안의 단계는 유한 횟수, 루틴 전체는 무한 반복할 수 있습니다.');bridge.modalOpen('planDialog');
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
  const check=async()=>{if(ownClock!==clockToken||!runner.owns(token))return;const left=start+seconds*1000-performance.now();const count=Math.max(0,Math.ceil(left/1000)),node=$('planBannerText');if(node&&node.dataset.seconds!==String(count)){node.dataset.seconds=String(count);const current=runner.snapshot();node.textContent=current.plan.name+' · '+current.round+'/'+(current.plan.rounds||'∞')+'회 · '+(current.index+1)+'/'+current.plan.steps.length+'단계 · '+api.MODES[mode]+' · 남은 '+count+'초';}
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
  $('planAdd').onclick=()=>{if(!valid())return;if(draft.steps.length>=40){status('한 루틴은 최대 40단계까지 만들 수 있습니다.');return;}const mode=$('planAddMode').value;draft.steps.push(api.step({mode,timing:timing(mode),params:copy(bridge.capture(mode))}));renderSteps();};
  $('planDelete').onclick=()=>{const id=selectedRoutine()?.id;if(!id)return;if($('planDelete').dataset.confirm!==id){$('planDelete').dataset.confirm=id;status('선택한 루틴을 삭제하려면 루틴 삭제를 한 번 더 누르세요.');return;}const previous=copy(state);state.routines=state.routines.filter(r=>r.id!==id);if(!stored()){state=previous;return;}delete $('planDelete').dataset.confirm;renderList();loadRoutine(selectedRoutine());status('루틴을 삭제했습니다.');};
  $('planSave').onclick=()=>{if(saveDraft()&&editingMode){bridge.modalClose('planDialog');bridge.notify('시간·반복 설정을 저장했습니다.');}};
  $('planRun').onclick=async()=>{if(!saveDraft())return;if(!editingMode&&!draft.steps.length){status('연습 단계를 하나 이상 추가해 주세요.');return;}const mode=editingMode,plan=copy(draft);bridge.modalClose('planDialog');bridge.unlock();if(mode)await startSingle(mode);else await startPlan(plan);};
  const banner=el('div',undefined,'plan-banner');banner.id='planBanner';banner.hidden=true;const text=el('span');text.id='planBannerText';text.setAttribute('role','status');text.setAttribute('aria-live','polite');banner.append(text);$('modeMessage').parentElement.append(banner);
  runner=api.createRunner({run:async(step,token)=>{
   const current=runner.snapshot();if(single&&state.settings[step.mode]?.seconds===0&&['piano','pitch','metronome','record'].includes(step.mode))step.timing.seconds=0;
   return bridge.run(step,token,current,single);
  },stop:()=>bridge.stop(),onError:error=>bridge.notify(error.message),onFinish:result=>bridge.finished(result,single),onState:current=>{
   if(!current){clear();return;}banner.hidden=false;$('modeMessage').hidden=true;delete $('planBannerText').dataset.seconds;$('planBannerText').textContent=current.plan.name+' · '+current.round+'/'+(current.plan.rounds||'∞')+'회 · '+(current.index+1)+'/'+current.plan.steps.length+'단계 · '+api.MODES[current.step.mode]+' · '+(current.phase==='rest'?'회복 중':current.stepRound+'회차');if(current.phase==='rest')$('mainButton').textContent='회복 중 · 전체 중단';
  }});
  const menu=$('menuDialog')?.querySelector('.menu-grid')||$('menuDialog')?.querySelector('[data-screen]')?.parentElement;
  if(menu){const b=el('button',undefined,'menu-tile');b.id='openRoutines';b.type='button';b.innerHTML='<span class="tile-icon">≡</span><span><strong>나의 루틴</strong><small>순서·시간·반복을 직접 구성</small></span>';b.onclick=()=>{bridge.modalClose('menuDialog');openRoutines();};menu.append(b);}
  return root.VoiceLinePlansUI;
 }
 function controls(container,mode){$('customTimingOpen')?.remove();if(!bridge||!['record',...practiceModes].includes(mode))return;const b=el('button','시간·반복','mode-guide-button plan-time-button');b.type='button';b.id='customTimingOpen';b.setAttribute('aria-haspopup','dialog');b.onclick=()=>openMode(mode);$('modeGuideButton').parentElement.append(b);}
 root.VoiceLinePlansUI={mount,controls,timing,openMode,openRoutines,startSingle,cancel,trainingEnded,patternChanged,arm,owns:token=>runner?.owns(token),showFinalResult:()=>{const s=runner?.snapshot();return single&&s&&s.plan.rounds!==0&&s.round===s.plan.rounds&&s.index===s.plan.steps.length-1&&s.stepRound===s.step.timing.rounds;},get active(){return Boolean(runner?.snapshot());},get token(){return runner?.token;}};
})(globalThis);
