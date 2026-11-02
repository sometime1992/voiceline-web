'use strict';
(function(root){
 const api=root.VoiceLinePracticePlans;let storage;try{storage=root.localStorage;}catch(_){}
 let bridge=null,state=api.load(storage),runner=null,clock=null,clockToken=0,single=false,draft=null,editingMode=null,original=null;
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const modes=Object.keys(api.MODES),practiceModes=modes.filter(m=>m!=='rest');
 const copy=value=>JSON.parse(JSON.stringify(value));
 let methodGroup=0;
 function stored(){try{state=api.save(storage,state);return true;}catch(_){status('저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 저장해 주세요.');return false;}}
 function status(text){const node=$('planStatus');if(node){node.textContent=text;node.hidden=!text;}}
 function clearClock(){clockToken++;if(clock!==null)clearTimeout(clock);clock=null;}
 function timing(mode){const active=runner?.snapshot();return active?.step.mode===mode?active.step.timing:{...api.timing(mode,state.settings[mode]),...bridge?.legacyTiming(mode)};}
 function locked(){return Boolean(runner?.snapshot())||bridge?.busy();}
 function prepareStep(step){step.params=root.VoiceLinePracticeSettings.prepare(step.mode,step.params,true);return step;}
 function methodText(step,stepRound=1,full=false){
  const {mode,timing:t,params:p}=step,tr=p.training||{},g=p.guide||{},w=tr.warmup||{},m=p.metronome||{},note=bridge.noteLabel;
  let text;
  if(mode==='practice'){
   const chosen=api.guideRound(g,stepRound),plan=root.VoiceLineGuideTraining.plan(chosen);
   text=plan.pattern.label+' · '+note(chosen.root)+' · '+(g.listenFirst?'먼저 듣고 따라 부르기':'바로 따라 부르기');
   if(full){const notes=plan.pattern.steps.map(n=>note(chosen.root+n));text+='\n음 순서: '+notes.join(' → ')+(plan.smooth?' · 끊지 않고 연속 이동':'');if(plan.pattern.vowels)text+='\n각 모음으로 위 음계를 끝까지 왕복합니다. 아 → 에 → 이 → 오 → 우 = 1세트 · 모음 사이 '+g.restSeconds+'초 쉬기';text+='\n'+(plan.smooth?g.smoothSeconds+'초 왕복':g.noteSeconds?g.noteSeconds+'초/음':g.bpm+' BPM')+' · '+root.VoiceLineGuideTraining.SOUNDS[g.sound]+' '+g.volume+'% · 허용 ±'+plan.tolerance+'cent';}
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
  return root.VoiceLinePracticeSettingsUI.render({mode,timing:t,params,onChange,withinRoutine,bridge,scope:withinRoutine?'루틴 · 이 단계에 적용':'일반 연습에 적용'});
 }
 function rememberEditor(node){return {scroll:$('planScroll').scrollTop,groups:[...node.querySelectorAll('details[data-settings-group],details.settings-extra')].map(d=>[d.dataset.settingsGroup||'extra',d.open]),label:node.contains(document.activeElement)?document.activeElement?.getAttribute('aria-label'):null};}
 function restoreEditor(node,view){for(const [key,open]of view.groups){const d=node.querySelector(key==='extra'?'details.settings-extra':'[data-settings-group="'+key+'"]');if(d)d.open=open;}if(view.label)[...node.querySelectorAll('[aria-label]')].find(n=>n.getAttribute('aria-label')===view.label)?.focus({preventScroll:true});$('planScroll').scrollTop=view.scroll;if(draft&&node.querySelector('[data-settings-mode=metronome]')&&((editingMode&&draft.params?.metronome?.customEditor)||(!editingMode&&draft.steps?.some(s=>s.params.metronome?.customEditor)))){const card=node.closest('.plan-step'),params=editingMode?draft.params:draft.steps.find(s=>s.id===card?.dataset.stepId)?.params;if(params?.metronome?.customEditor){const extra=node.querySelector('.settings-extra');if(extra)extra.open=true;node.querySelector('[data-setting-key=numerator]')?.focus({preventScroll:true});delete params.metronome.customEditor;}}}
 function renderSingle(reset=false){
  const editor=$('planEditor'),view=reset?null:rememberEditor(editor);editor.replaceChildren(fields(editingMode,draft.timing,draft.params,(structural,message)=>{if(structural)renderSingle();if(message)status(message);}));if(view)restoreEditor(editor,view);
 }
 function routineSummary(){const node=$('planRoutineSummary');if(!node||editingMode||!draft)return;const d=root.VoiceLinePracticeSettings.routine(draft,bridge.noteLabel);node.textContent=draft.steps.length+'단계 · '+d.totalText+' · 한 번 진행 '+root.VoiceLinePracticeSettings.formatTime(d.oneCycleSeconds);}
 function valid(){
  const bad=$('planDialog').querySelector('input:invalid,select:invalid');
  if(bad){for(let d=bad.closest('details');d;d=d.parentElement.closest('details'))d.open=true;bad.reportValidity();status('표시된 범위 안에서 상세 설정을 입력해 주세요.');return false;}
  const timings=editingMode==='dynamicVoice'?[draft.timing]:!editingMode?(draft?.steps||[]).filter(s=>s.mode==='dynamicVoice').map(s=>s.timing):[];if(timings.some(t=>t.customStages&&t.stages.reduce((a,b)=>a+b,0)>300)){status('강약 연습의 전체 시간은 300초 이내로 설정해 주세요.');return false;}
  const entries=editingMode?[{mode:editingMode,timing:draft.timing,params:draft.params}]:draft?.steps||[];
  for(const [index,step]of entries.entries()){const issue=root.VoiceLinePracticeSettings.describe(step.mode,step.timing,step.params,!editingMode,bridge.noteLabel).issues[0];if(issue){if(!editingMode){const card=$('planEditor').querySelectorAll('.plan-step')[index];card.open=true;card.scrollIntoView({block:'nearest'});}status((editingMode?'':(index+1)+'단계: ')+issue);return false;}}
  return true;
 }
 function openMode(mode){
  if(locked()){bridge.notify('진행 중인 연습을 중단한 뒤 설정해 주세요.');return;}
  editingMode=mode;draft={timing:copy(timing(mode)),params:root.VoiceLinePracticeSettings.prepare(mode,bridge.capture(mode))};
  $('planDialog').dataset.editor='general';$('planLibrary').hidden=true;
  $('planTitle').textContent=(api.MODES[mode]||'녹음')+' 설정';$('planList').hidden=true;renderSingle(true);$('planRoutineSummary').hidden=true;$('planRoutineEnd').hidden=true;
  $('planName').hidden=true;$('planName').disabled=true;$('planRoutineRounds').disabled=true;$('planNameLabel').hidden=true;$('planRoutineRoundsLabel').hidden=true;$('planAddRow').hidden=true;$('planNew').hidden=true;$('planDelete').hidden=true;
  $('planSave').textContent='설정 저장';$('planSave').hidden=false;$('planRun').textContent='저장하고 시작';status('');bridge.modalOpen('planDialog');$('planScroll').scrollTop=0;
 }
 function selectedRoutine(){return state.routines.find(r=>r.id===$('planList').value);}
 function renderList(id){const select=$('planList');select.replaceChildren();for(const r of state.routines){const o=el('option',r.name);o.value=r.id;select.append(o);}if(id)select.value=id;}
 function renderSteps(openId=null,newStep=false){
  const list=$('planEditor'),modal=$('planScroll'),scroll=modal.scrollTop,views=new Map([...list.querySelectorAll('.plan-step')].map(c=>[c.dataset.stepId,rememberEditor(c)]));
  const selectedId=openId||list.querySelector('.plan-step[open]')?.dataset.stepId;
  list.replaceChildren();
  if(!draft?.steps.length)list.append(el('p','연습을 추가하고 원하는 순서로 배치하세요.','plan-note'));
  draft?.steps.forEach((step,index)=>{
   const card=el('details',undefined,'plan-step'),summary=el('summary'),heading=el('span',undefined,'plan-step-heading'),title=el('strong',(index+1)+'. '+api.MODES[step.mode]),edit=el('span',undefined,'plan-edit-label'),selected=el('small',undefined,'plan-selected');
   const paint=()=>{const d=root.VoiceLinePracticeSettings.describe(step.mode,step.timing,step.params,true,bridge.noteLabel);selected.textContent=d.title+' · '+d.compact+' · '+d.totalText;};paint();
   card.dataset.stepId=step.id;card.open=step.id===selectedId;heading.append(title,edit);summary.append(heading,selected);card.append(summary);
   const updateToggle=()=>{if(!card.isConnected)return;if(card.open)for(const other of list.querySelectorAll('.plan-step'))if(other!==card)other.open=false;edit.textContent=card.open?'설정 접기 ▴':'상세 설정 ▾';};card.ontoggle=updateToggle;updateToggle();
   const buttons=el('div',undefined,'plan-step-actions');
   for(const [label,action,disabled]of [['위로',()=>move(index,-1),index===0],['아래로',()=>move(index,1),index===draft.steps.length-1],['단계 삭제',()=>{draft.steps.splice(index,1);renderSteps();},false]]){const b=el('button',label);b.type='button';b.disabled=disabled;b.onclick=action;buttons.append(b);}card.append(buttons);
   card.append(fields(step.mode,step.timing,step.params,(structural,message)=>{if(structural)renderSteps(step.id);else{paint();routineSummary();}if(message)status(message);},true));list.append(card);if(views.has(step.id))restoreEditor(card,views.get(step.id));
  });
  routineSummary();modal.scrollTop=scroll;if(newStep)list.querySelector('[data-step-id="'+openId+'"]')?.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 function move(index,delta){if(!valid())return;const [step]=draft.steps.splice(index,1);draft.steps.splice(index+delta,0,step);renderSteps();}
 function loadRoutine(value){delete $('planDelete').dataset.confirm;draft=copy(value||api.routine({name:'나의 루틴 '+(state.routines.length+1)}));draft.steps.forEach(prepareStep);$('planName').value=draft.name;$('planRoutineRounds').value=String(draft.rounds);$('planRoutineEnd').value=draft.rounds===0?'forever':'count';$('planRoutineRoundsLabel').hidden=draft.rounds===0;renderSteps();$('planDelete').hidden=!selectedRoutine();}
 function openRoutines(){
  if(locked()){bridge.notify('진행 중인 연습을 중단한 뒤 루틴을 편집해 주세요.');return;}
  editingMode=null;$('planDialog').dataset.editor='routine';$('planLibrary').hidden=false;$('planSave').textContent='루틴 저장';renderList();loadRoutine(selectedRoutine());$('planTitle').textContent='나의 루틴';$('planList').hidden=false;$('planName').disabled=false;$('planRoutineRounds').disabled=draft.rounds===0;
  for(const id of ['planName','planNameLabel','planAddRow','planNew','planSave','planRoutineEnd','planRoutineSummary'])$(id).hidden=false;$('planRoutineRoundsLabel').hidden=draft.rounds===0;
  $('planRun').textContent='루틴 시작';status('각 단계의 설정은 이 루틴에만 저장됩니다.');bridge.modalOpen('planDialog');$('planScroll').scrollTop=0;
 }
 function saveDraft(){
  if(!valid())return false;
  if(editingMode){const previous=copy(state);state.settings[editingMode]=api.timing(editingMode,draft.timing);if(!stored()){state=previous;return false;}bridge.apply(editingMode,draft.timing,draft.params);return true;}
  draft.name=$('planName').value.trim();draft.rounds=$('planRoutineEnd').value==='forever'?0:Number($('planRoutineRounds').value);const next=api.routine(draft),index=state.routines.findIndex(r=>r.id===next.id);
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
  modal.innerHTML='<section class="modal plan-modal" role="dialog" aria-modal="true" aria-labelledby="planTitle"><header class="modal-heading"><h2 id="planTitle">연습 설정</h2><button id="planClose" type="button" class="close-btn" aria-label="연습 설정 닫기">✕</button></header><div id="planScroll" class="plan-scroll" tabindex="-1"><div id="planLibrary" class="plan-library"><select id="planList" aria-label="저장한 루틴"></select><button id="planNew" type="button">새 루틴</button><button id="planDelete" type="button">루틴 삭제</button></div><label id="planNameLabel">루틴 이름<input id="planName" maxlength="40" required></label><select id="planRoutineEnd" aria-label="루틴 종료 방식"><option value="count">전체 반복 횟수 지정</option><option value="forever">전체 루틴 계속 반복</option></select><label id="planRoutineRoundsLabel">루틴 전체 반복 횟수<input id="planRoutineRounds" type="number" min="1" max="999" step="1" value="1" required inputmode="numeric"></label><div id="planAddRow" class="plan-add"><select id="planAddMode" aria-label="추가할 연습"></select><button id="planAdd" type="button">단계 추가</button></div><p id="planRoutineSummary" class="settings-routine-summary" role="status"></p><div id="planEditor"></div><p id="planStatus" class="plan-note" role="status" hidden></p></div><div class="plan-actions" role="group" aria-label="설정 저장 및 시작"><button id="planSave" type="button">설정 저장</button><button id="planRun" type="button">루틴 시작</button></div></section>';
  document.body.append(modal);
  for(const [mode,name]of Object.entries(api.MODES).filter(([mode])=>mode!=='record')){const o=el('option',name);o.value=mode;$('planAddMode').append(o);}
  $('planRoutineEnd').onchange=()=>{draft.rounds=$('planRoutineEnd').value==='forever'?0:1;$('planRoutineRounds').value=String(draft.rounds||1);$('planRoutineRoundsLabel').hidden=draft.rounds===0;$('planRoutineRounds').disabled=draft.rounds===0;routineSummary();};$('planRoutineRounds').oninput=()=>{if($('planRoutineRounds').validity.valid){draft.rounds=Number($('planRoutineRounds').value);routineSummary();}};
  $('planClose').onclick=()=>bridge.modalClose('planDialog');modal.onclick=event=>{if(event.target===modal)bridge.modalClose('planDialog');};
  $('planList').onchange=()=>loadRoutine(selectedRoutine());$('planNew').onclick=()=>{$('planList').value='';loadRoutine();$('planName').focus();};
  $('planAdd').onclick=()=>{if(!valid())return;if(draft.steps.length>=40){status('한 루틴은 최대 40단계까지 만들 수 있습니다.');return;}const mode=$('planAddMode').value,step=prepareStep(api.step({mode,timing:timing(mode),params:copy(bridge.capture(mode))}));draft.steps.push(step);renderSteps(step.id,true);};
  $('planDelete').onclick=()=>{const id=selectedRoutine()?.id;if(!id)return;if($('planDelete').dataset.confirm!==id){$('planDelete').dataset.confirm=id;status('선택한 루틴을 삭제하려면 루틴 삭제를 한 번 더 누르세요.');return;}const previous=copy(state);state.routines=state.routines.filter(r=>r.id!==id);if(!stored()){state=previous;return;}delete $('planDelete').dataset.confirm;renderList();loadRoutine(selectedRoutine());status('루틴을 삭제했습니다.');};
  $('planSave').onclick=()=>{if(saveDraft()&&editingMode){bridge.modalClose('planDialog');bridge.notify('연습 설정을 저장했습니다.');}};
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
 function controls(container,mode){$('customTimingOpen')?.remove();if(!bridge||!['record',...practiceModes].includes(mode))return;const b=el('button','연습 설정','mode-guide-button plan-time-button');b.type='button';b.id='customTimingOpen';b.setAttribute('aria-haspopup','dialog');b.onclick=()=>openMode(mode);$('modeGuideButton').parentElement.append(b);}
 root.VoiceLinePlansUI={mount,controls,timing,openMode,openRoutines,startSingle,cancel,trainingEnded,patternChanged,arm,volumeChanged:n=>{if(original)original.pianoVolume=n;},owns:token=>runner?.owns(token),showFinalResult:()=>{const s=runner?.snapshot();return single&&s&&s.plan.rounds!==0&&s.round===s.plan.rounds&&s.index===s.plan.steps.length-1&&s.stepRound===s.step.timing.rounds;},get active(){return Boolean(runner?.snapshot());},get token(){return runner?.token;}};
})(globalThis);
