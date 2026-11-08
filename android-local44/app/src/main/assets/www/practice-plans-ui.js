'use strict';
(function(root){
 const api=root.VoiceLinePracticePlans;let storage;try{storage=root.localStorage;}catch(_){}
 root.VoiceLineRecommendations?.initialize(storage);
 let bridge=null,state=api.load(storage),runner=null,clock=null,clockToken=0,single=false,draft=null,editingMode=null,original=null;
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const modes=Object.keys(api.MODES),settingsModes=modes.filter(m=>!['rest','pitch','record'].includes(m));
 const copy=value=>JSON.parse(JSON.stringify(value));
 let recommendationReturn='overview',recommendationRoot=48;
 let editorView='overview',savedDraft=null,hasChanges=false,singleForm=null,displayBox=null,metaForm=null,addForm=null,activeStepId=null,addMode='practice',outlineAnchor='routine-meta',outlineScrollTop=0,detailsOrigin='overview',reviewReturn={view:'edit',step:null},layoutFrame=0;const routineForms=new Map();
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
 function help(label,text){$('planHelpTitle').textContent=label;$('planHelpText').textContent=text;$('planHelp').hidden=false;$('planHelpClose').focus();}
 function contextStep(){return !editingMode&&activeStepId&&activeStepId!=='meta'&&activeStepId!=='add'?draft.steps.find(s=>s.id===activeStepId):null;}
 function rememberForm(form){return {scroll:form.isConnected?$('planScroll').scrollTop:form._scrollTop||0,anchor:form.pager.state().anchor,invalid:[...form.querySelectorAll('input:invalid')].map(n=>[n.getAttribute('aria-label'),n.value]),focus:form.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null};}
 function restoreForm(form,memory){if(!memory)return;form._scrollTop=memory.scroll||0;form.pager.showPage(memory.anchor,false);for(const [label,value]of memory.invalid){const input=[...form.querySelectorAll('input')].find(n=>n.getAttribute('aria-label')===label);if(input){input.value=value;input.oninput?.();}}if(memory.focus){const input=[...form.querySelectorAll('input,select')].find(n=>n.getAttribute('aria-label')===memory.focus);if(input){form.pager.showControl(input,false);if(input.type==='number'&&memory.invalid.some(([s])=>s===memory.focus))form.pager.showControl(input,true);}}}
 function stateChanged(form,state){
  if(!form.isConnected)return;if(state.action&&['edit','menu'].includes(state.view)&&['edit','menu'].includes(editorView))editorView=state.view;
  if(state.action){bridge.stopPreview?.();if(form.dataset.presentation!=='integrated')$('planScroll').scrollTop=0;status('');}updateActions();scheduleFit();
 }
 function fields(mode,t,params,onChange,withinRoutine=false,extraUnits=[]){
  let form;form=root.VoiceLinePracticeSettingsUI.render({mode,timing:t,params,withinRoutine,bridge,extraUnits,onChange,onPageChange:(_,state)=>stateChanged(form,state)});return form;
 }
 function stepActions(step){
  const node=el('div',undefined,'plan-step-actions');node.dataset.stepId=step.id;node.setAttribute('role','group');const index=draft.steps.indexOf(step);node.setAttribute('aria-label',(index+1)+'단계 관리');
  for(const [delta,label]of [[-1,'↑ 위로'],[1,'↓ 아래로']]){const b=el('button',label);b.type='button';b.dataset.stepMove=delta;b.setAttribute('aria-label',(index+1)+'단계 '+(delta<0?'위로':'아래로')+' 이동');b.disabled=delta<0?index===0:index===draft.steps.length-1;b.onclick=()=>{const i=draft.steps.findIndex(s=>s.id===step.id),j=i+delta;if(j<0||j>=draft.steps.length)return;const [s]=draft.steps.splice(i,1);draft.steps.splice(j,0,s);hasChanges=true;showRoutine('step-'+step.id);status('단계 순서를 바꿨습니다.');};node.append(b);}
  const remove=el('button','삭제');remove.type='button';remove.dataset.stepDelete=step.id;remove.setAttribute('aria-label',(index+1)+'단계 삭제');remove.onclick=()=>{const i=draft.steps.findIndex(s=>s.id===step.id),neighbor=draft.steps[i+1]||draft.steps[i-1];draft.steps=draft.steps.filter(s=>s.id!==step.id);routineForms.delete(step.id);hasChanges=true;showRoutine(neighbor?'step-'+neighbor.id:'routine-add');status((i+1)+'단계를 삭제했습니다.');};node.append(remove);return node;
 }
 function rebuildForm(id){
  const old=id==='single'?singleForm:routineForms.get(id),memory=old?rememberForm(old):null,step=id==='single'?{mode:editingMode,...draft}:draft.steps.find(s=>s.id===id);if(!step)return;
  const change=(structural,message)=>{hasChanges=true;if(structural){rebuildForm(id);renderFocus();}else{if(!getDraftForm().querySelector('input:invalid,select:invalid'))status('');scheduleFit();}if(message)status(message);};
  const next=fields(step.mode,step.timing,step.params,change,id!=='single');if(id==='single')singleForm=next;else routineForms.set(id,next);restoreForm(next,memory);
  if(step.params.metronome?.customEditor){const input=next.querySelector('[data-setting-key=numerator]');if(input)next.pager.showControl(input,false);delete step.params.metronome.customEditor;}
 }
 function getDraftForm(){
  if(editingMode){if(!singleForm)rebuildForm('single');return singleForm;}
  if(activeStepId==='meta'){if(!metaForm)metaForm=makeMetaForm();return metaForm;}
  if(activeStepId==='add'){if(!addForm)addForm=makeAddForm();return addForm;}
  const step=contextStep();if(!step)return null;if(!routineForms.has(step.id))rebuildForm(step.id);return routineForms.get(step.id);
 }
 function mountDisplay(box){box.dataset.scope=editingMode?'general':'routine';if(displayBox?.isConnected){displayBox._scrollTop=$('planScroll').scrollTop;if(displayBox.classList.contains('settings-routine-outline'))outlineScrollTop=displayBox._scrollTop;}displayBox=box;$('planEditor').replaceChildren(box);$('planScroll').scrollTop=box._scrollTop||0;updateActions();fitCurrent();scheduleFit();}
 function newPager(units,onState,outline=false){const box=el('div',undefined,'settings-editor');if(outline)box.classList.add('settings-routine-outline');box.pager=root.VoiceLineSettingsPages.create({box,units,onState:s=>{onState?.(s);if(box.isConnected){updateActions();scheduleFit();}}});return box;}
 function summaryBox(rows,meta,kind='overview',empty=''){const box=newPager([]);box.pager.showSummary({rows,meta,kind,label:kind==='review'?'최종 저장할 설정':'현재 연습 설정',empty});return box;}
 function snapshotForm(mode,t,params,withinRoutine=false){return fields(mode,copy(t),copy(params),null,withinRoutine);}
 function generalSummary(source,all=false){const form=snapshotForm(editingMode,source.timing,source.params);return {rows:all?form.getRows():form.compactRows(),meta:form.meta()};}
 function routineSummaryData(source,all=false){
  const d=root.VoiceLinePracticeSettings.routine(source,bridge.noteLabel),rows=[{key:'name',label:'루틴 이름',value:source.name},{key:'rounds',label:'전체 반복',value:source.rounds?source.rounds+'회':'계속 반복'}];
  if(!source.steps.length)rows.push({key:'empty',label:'연습 단계',value:'없음 · 단계를 추가하세요.'});source.steps.forEach((s,i)=>{const f=snapshotForm(s.mode,s.timing,s.params,true),description=f.description;if(all)for(const r of f.getRows())rows.push({...r,key:s.id+':'+r.key,label:(i+1)+'단계 · '+r.label});else rows.push({key:s.id,label:(i+1)+'. '+api.MODES[s.mode],value:description.title+' · '+description.totalText});});return {rows,meta:d.totalText};
 }
 function changedRows(before,after,prefix=''){const old=new Map(before.map(r=>[r.key,r.value]));return after.filter(r=>old.get(r.key)!==r.value).map(r=>({...r,label:prefix+r.label}));}
 function reviewData(){
  if(editingMode){const a=generalSummary(savedDraft,true),b={rows:getDraftForm().getRows(),meta:getDraftForm().meta()};return {rows:changedRows(a.rows,b.rows),meta:b.meta};}
  const rows=[];if(savedDraft.name!==draft.name)rows.push({key:'name',label:'루틴 이름',value:draft.name});if(savedDraft.rounds!==draft.rounds)rows.push({key:'rounds',label:'전체 반복',value:draft.rounds?draft.rounds+'회':'계속 반복'});
  draft.steps.forEach((s,i)=>{const previous=savedDraft.steps.find(x=>x.id===s.id),f=routineForms.get(s.id)||snapshotForm(s.mode,s.timing,s.params,true);if(!previous)rows.push({key:s.id,label:(i+1)+'단계 추가',value:api.MODES[s.mode]+' · '+f.description.title+' · '+f.description.totalText});else{const old=snapshotForm(previous.mode,previous.timing,previous.params,true);rows.push(...changedRows(old.getRows(),f.getRows(),(i+1)+'단계 · ').map(r=>({...r,key:s.id+':'+r.key})));if(savedDraft.steps.indexOf(previous)!==i)rows.push({key:s.id+':order',label:'단계 순서',value:api.MODES[s.mode]+' → '+(i+1)+'번째'});}});
  for(const s of savedDraft.steps)if(!draft.steps.some(x=>x.id===s.id))rows.push({key:s.id+':removed',label:'단계 삭제',value:api.MODES[s.mode]});return {rows,meta:root.VoiceLinePracticeSettings.routine(draft,bridge.noteLabel).totalText};
 }
 function renderCurrent(){
  $('planLibrary').hidden=Boolean(editingMode);const data=editingMode?generalSummary(savedDraft):routineSummaryData(savedDraft);mountDisplay(summaryBox(data.rows,data.meta,editorView,!editingMode&&!savedDraft.steps.length?'저장한 단계가 없습니다. 수정을 눌러 연습을 추가하세요.':''));
 }
 function renderFocus(){
  $('planLibrary').hidden=true;const form=getDraftForm();if(!form)return;form.dataset.stepId=editingMode?'single':activeStepId;mountDisplay(form);if(editorView==='menu')form.pager.showMenu(false);else form.pager.showPage(form.pager.state().key,false);fitCurrent();updateActions();
 }
 function renderRecommendations(){
  const rec=root.VoiceLineRecommendations,context=rec.context(editingMode);$('planLibrary').hidden=true;
  const box=el('div',undefined,'settings-editor recommendation-list');
  box.dataset.recommendMode=editingMode||'routine';
  box.pager={state:()=>({title:'추천',count:1,index:0,previous:false,next:false}),fit(){}};
  box.append(el('p',editingMode?context.intro:'추천 루틴을 복사해 순서와 설정을 확인한 뒤 저장하세요.','recommendation-intro'));
  if(context.rootKind!=='none'){
   const field=el('label',context.rootLabel,'recommendation-root');
   const select=el('select');select.id='recommendationRoot';select.setAttribute('aria-label',context.rootLabel);
   const keyboard=context.rootKind==='keyboard';for(let midi=keyboard?24:36;midi<=(keyboard?84:context.rootMax||80);midi+=keyboard?12:1){const option=el('option',bridge.noteLabel(midi));option.value=String(midi);select.append(option);}select.value=String(recommendationRoot);
   select.onchange=()=>{recommendationRoot=Number(select.value);renderRecommendations();$('recommendationRoot').focus({preventScroll:true});};field.append(select);box.append(field);
  }
  if(!editingMode)box.append(el('p',rec.NOTE,'recommendation-note'));
  for(const [level,meta]of Object.entries(rec.LEVELS)){
   const info=editingMode?rec.card(editingMode,level,bridge.captureAll(),recommendationRoot,bridge.noteLabel):null;
   const value=info?info.value:rec.routine(level,recommendationRoot,bridge.captureAll());
   const description=info?info.description:root.VoiceLinePracticeSettings.routine(value,bridge.noteLabel);
   const card=el('section',undefined,'recommendation-card');card.dataset.level=level;card.dataset.recommendMode=editingMode||'routine';card.append(el('h3',meta.label),el('p',info?info.goal:meta.goal,'recommendation-goal'),el('p',description.totalText,'recommendation-duration'));
   if(info){const fields=el('dl',undefined,'recommendation-fields');for(const row of info.rows){const item=el('div',undefined,'recommendation-field');item.append(el('dt',row.label),el('dd',row.value));fields.append(item);}card.append(fields,el('p',description.audio));}
   else{const details=el('details'),summary=el('summary','연습 순서와 설정 보기'),list=el('ol');for(const [i,s]of value.steps.entries()){const d=description.steps[i];list.append(el('li',api.MODES[s.mode]+' · '+d.compact+' · '+d.totalText));}details.append(summary,list);card.append(details);}
   if(editingMode==='practice'){const g=value.params.guide,p=root.VoiceLineGuideTraining.plan(g),notes=p.roots.flatMap(r=>p.pattern.steps.map(n=>r+n));card.append(el('p','사용 음역 '+bridge.noteLabel(Math.min(...notes))+' ~ '+bridge.noteLabel(Math.max(...notes))));}
   card.append(el('p',info?info.note:meta.note,'recommendation-note'));
   const use=el('button',editingMode?'설정 확인·수정':'루틴 구성 확인');use.type='button';use.dataset.recommendLevel=level;use.setAttribute('aria-label',meta.label+(editingMode?' 추천 설정 선택':' 추천 루틴 선택'));
   use.onclick=()=>{
    if(editingMode){draft={timing:copy(value.timing),params:copy(value.params)};singleForm=null;hasChanges=true;changeView('edit');status(meta.label+' 추천값입니다. 기준음과 설정을 확인한 뒤 변경 확인 → 최종 저장하세요.');}
    else{draft=copy(value);draft.name=root.VoiceLineI18n?.t(draft.name)||draft.name;draft.steps.forEach(prepareStep);savedDraft=api.routine({id:draft.id,name:draft.name,steps:[]});singleForm=null;routineForms.clear();metaForm=addForm=null;activeStepId=null;hasChanges=true;outlineScrollTop=0;showRoutine();status('새 추천 루틴 초안입니다. 변경 확인 → 최종 저장하면 내 루틴에 추가됩니다.');}
   };card.append(use);box.append(card);
  }
  const sources=el('details',undefined,'recommendation-sources');sources.append(el('summary','추천 기준과 참고 자료'),el('p',rec.BASIS));
  for(const source of rec.SOURCES){sources.append(el('p',source.principle));const button=el('button',source.title+' ↗');button.type='button';button.onclick=()=>{try{if(root.VoiceLinePublicLinks?.openTrainingSource)root.VoiceLinePublicLinks.openTrainingSource(source.id);else root.open(source.url,'_blank','noopener,noreferrer');}catch(_){bridge.notify('참고 자료를 열 수 없습니다.');}};sources.append(button);}box.append(sources);
  mountDisplay(box);
 }
 function openRecommendations(){
  if(!root.VoiceLineRecommendations||locked())return;
  recommendationReturn=editorView;recommendationRoot=root.VoiceLineRecommendations.initialRoot(editingMode,bridge.captureAll());
  editorView='recommend';renderRecommendations();
 }
 function showRoutine(anchor=outlineAnchor){
  if(displayBox?.isConnected&&displayBox.classList.contains('settings-routine-outline'))outlineScrollTop=$('planScroll').scrollTop;outlineAnchor=anchor;
  activeStepId=null;editorView='routine';$('planLibrary').hidden=true;const entries=[];
  const managed=anchor.startsWith('step-')?anchor:draft.steps[0]?'step-'+draft.steps[0].id:null;
  function entry(key,title,value,open,actions,number){const node=el('div',undefined,'settings-unit');entries.push({node,key,label:title,shortLabel:title,topic:{id:key,title,open:()=>{outlineAnchor=key;open();},actions,number,managed:key===managed},transient:true,value});}
  entry('routine-meta','기본 설정',()=>draft.name+' · '+(draft.rounds?draft.rounds+'회':'계속 반복'),()=>{activeStepId='meta';editorView='edit';renderFocus();});
  entry('routine-add','단계 추가',()=>draft.steps.length+' / 40단계',()=>{activeStepId='add';editorView='edit';renderFocus();});
  draft.steps.forEach((step,i)=>entry('step-'+step.id,(i+1)+'. '+api.MODES[step.mode],()=>{const d=root.VoiceLinePracticeSettings.describe(step.mode,step.timing,step.params,true,bridge.noteLabel);return step.mode==='practice'?d.title+' · '+d.compact:d.compact;},()=>{activeStepId=step.id;editorView='edit';renderFocus();},()=>stepActions(step),i+1));
  const box=newPager(entries,null,true);box._scrollTop=outlineScrollTop;box.pager.showMenu(false);mountDisplay(box);box.pager.showMenu(false,anchor);fitCurrent();requestAnimationFrame(()=>{if(displayBox!==box||!box.isConnected)return;const target=[...box.querySelectorAll('[data-topic]')].find(n=>n.dataset.topic===anchor);target?.scrollIntoView({block:'nearest'});});
 }
 function makeMetaForm(){
  const box=el('div',undefined,'settings-editor'),c=root.VoiceLineSettingsPages,units=[],onHelp=(label,text)=>help(label,text);
  const name=c.textField({key:'name',label:'루틴 이름',value:draft.name,maxLength:40,required:true,onInput:input=>{draft.name=input.value;hasChanges=true;status('');}});name.input.id='planName';
  const end=c.selectField({key:'routineEnd',label:'전체 반복 방식',value:draft.rounds===0?'forever':'count',options:[['count','횟수 지정'],['forever','계속 반복']],onChange:value=>{const memory=rememberForm(box);draft.rounds=value==='forever'?0:1;hasChanges=true;metaForm=makeMetaForm();restoreForm(metaForm,memory);renderFocus();}});end.input.id='planRoutineEnd';
  const count=c.numberField({key:'routineRounds',label:'루틴 전체 반복 횟수',value:draft.rounds||1,min:1,max:999,step:1,presets:[1,2,4],onHelp,onInput:(input,ok)=>{if(ok)draft.rounds=Number(input.value);hasChanges=true;status('');scheduleFit();}});count.input.id='planRoutineRounds';count.input.disabled=draft.rounds===0;
  for(const [control,key,label,topic]of [[name,'name','루틴 이름',{id:'name',title:'루틴 이름'}],[end,'routineEnd','반복 방식',{id:'repeat',title:'전체 반복'}],[count,'routineRounds','반복 횟수',{id:'repeat',title:'전체 반복'}]]){control.node.dataset.unitKey=key;units.push({...control,key,label,shortLabel:label,topic});}
  box.pager=c.create({box,units,integrated:true,title:'기본 설정',onState:s=>stateChanged(box,s)});return box;
 }
 function makeAddForm(){
  const box=el('div',undefined,'settings-editor'),c=root.VoiceLineSettingsPages,control=c.selectField({key:'addMode',label:'추가할 연습',value:addMode,options:Object.entries(api.MODES).filter(([mode])=>api.ROUTINE_MODES.includes(mode)),onChange:value=>{addMode=value;}});control.input.id='planAddMode';const add=el('button','추가');add.id='planAdd';add.type='button';add.onclick=()=>{if(draft.steps.length>=40){status('한 루틴은 최대 40단계까지 만들 수 있습니다.');return;}const mode=control.input.value,step=prepareStep(api.step({mode,timing:timing(mode),params:copy(bridge.capture(mode))}));draft.steps.push(step);hasChanges=true;activeStepId=step.id;editorView='edit';renderFocus();};control.node.querySelector('.settings-control-row').append(add);
  box.pager=c.create({box,integrated:true,title:'단계 추가',units:[{...control,key:'addMode',label:'추가할 연습',shortLabel:'추가할 연습',topic:{id:'add',title:'단계 추가'}}],onState:s=>stateChanged(box,s)});return box;
 }
 function fitCurrent(){
  if(!displayBox?.isConnected||$('planDialog').hidden)return;$('planDialog').style.setProperty('--settings-height',(window.visualViewport?.height||window.innerHeight)+'px');$('planDialog').style.setProperty('--settings-top',(window.visualViewport?.offsetTop||0)+'px');const area=$('planScroll'),style=getComputedStyle(area),available=area.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-($('planLibrary').hidden?0:$('planLibrary').getBoundingClientRect().height+8);displayBox.pager.fit(Math.max(1,available));
 }
 function scheduleFit(){if(layoutFrame)return;layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;fitCurrent();});}
 function updateActions(){
  if(!displayBox)return;const state=displayBox.pager.state(),focus=['edit','menu'].includes(editorView),routine=editorView==='routine';$('planDialog').dataset.view=editorView;
  const titles={overview:'현재 설정',saved:'저장 완료',menu:'수정할 항목',routine:'루틴 구성',review:'저장할까요?',details:'전체 설정',recommend:editingMode?api.MODES[editingMode]+' 추천':'추천 루틴'};$('planTitle').textContent=editorView==='edit'?state.title:titles[editorView]||'연습 설정';$('planStage').textContent=state.count>1?(state.index+1)+'/'+state.count:'';$('planStage').hidden=state.count<=1;
  const all=['overview','saved','review'].includes(editorView);$('planBack').dataset.kind=all?'all':'back';$('planBack').innerHTML=all?'전체':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>';$('planBack').setAttribute('aria-label',all?'전체 설정 보기':editorView==='edit'&&!editingMode?'루틴 구성으로 돌아가기':'이전 설정 화면으로 돌아가기');
  $('planSave').hidden=focus||routine||editorView==='recommend';$('planRecommend').hidden=!['overview','saved'].includes(editorView);$('planRecommend').textContent=editingMode?'추천 설정':'추천 루틴';$('planSave').textContent=editorView==='review'?'다시 수정':editorView==='details'?'돌아가기':hasChanges?'수정 계속':'수정';
  const routineEdit=!editingMode&&editorView==='edit';$('planRun').hidden=editorView==='recommend'||routineEdit&&activeStepId==='add';$('planRun').textContent=routineEdit?'적용 완료':focus||routine?'변경 확인':editorView==='review'?'최종 저장':editorView==='details'?'돌아가기':'시작';$('planRun').disabled=!editingMode&&!focus&&!routine&&!['details','review'].includes(editorView)&&!savedDraft?.steps.length;
  const arrows=state.count>1;$('planPrev').hidden=$('planNext').hidden=!arrows;$('planPrev').disabled=!state.previous;$('planNext').disabled=!state.next;
  const hint=$('planActionHint');hint.textContent=routineEdit&&activeStepId!=='add'?'적용 후 루틴 구성으로 돌아갑니다':routine?'전체 설정 확인 후 저장':'';hint.hidden=!hint.textContent;
 }
 function changeView(view){
  bridge.stopPreview?.();document.activeElement?.blur();status('');editorView=view;
  if(['overview','saved'].includes(view))renderCurrent();else if(['menu','edit'].includes(view))renderFocus();else if(view==='routine')showRoutine();else if(view==='review'){const data=reviewData();$('planLibrary').hidden=true;mountDisplay(summaryBox(data.rows,data.meta,'review','수정한 항목이 없습니다.'));}else if(view==='details'){const source=detailsOrigin==='review'?draft:savedDraft,data=editingMode?generalSummary(source,true):routineSummaryData(source,true);$('planLibrary').hidden=true;mountDisplay(summaryBox(data.rows,data.meta,'details'));}
 }
 function back(){
  if($('planDialog')?.hidden)return false;if(!$('planHelp').hidden){$('planHelp').hidden=true;return true;}
  if(editorView==='recommend'){changeView(recommendationReturn);return true;}
  if(editorView==='details'){changeView(detailsOrigin);return true;}if(editorView==='review'){activeStepId=reviewReturn.step;changeView(reviewReturn.view);return true;}if(editorView==='edit'){if(editingMode)changeView('overview');else showRoutine();return true;}
  if(editorView==='menu'){if(editingMode)changeView('overview');else showRoutine();return true;}if(editorView==='routine'){changeView('overview');return true;}return false;
 }
 function revealBad(form,bad,stepId){if(!editingMode)activeStepId=stepId;editorView='edit';renderFocus();form.pager.showControl(bad,true);fitCurrent();bad.reportValidity();}
 function valid(onlyId=null){
  const entries=editingMode?[{mode:editingMode,timing:draft.timing,params:draft.params,id:'single'}]:onlyId?draft.steps.filter(s=>s.id===onlyId):draft.steps;
  if(!editingMode&&(!onlyId||onlyId==='meta')){if(!draft.name.trim()){activeStepId='meta';const form=getDraftForm(),input=form.querySelector('#planName');revealBad(form,input,'meta');status('루틴 이름을 입력해 주세요.');return false;}if(!onlyId&&!draft.steps.length){status('연습 단계를 하나 이상 추가해 주세요.');return false;}if(metaForm){const bad=metaForm.querySelector('input:invalid,select:invalid');if(bad){revealBad(metaForm,bad,'meta');status('전체 반복 횟수를 확인해 주세요.');return false;}}}
  for(const [index,step]of entries.entries()){
   const form=editingMode?getDraftForm():routineForms.get(step.id),bad=form?.querySelector('input:invalid,select:invalid');if(bad){revealBad(form,bad,step.id);status('표시된 범위 안에서 값을 입력해 주세요.');return false;}
   const issue=root.VoiceLinePracticeSettings.describe(step.mode,step.timing,step.params,!editingMode,bridge.noteLabel).issues[0];if(issue){if(!editingMode)activeStepId=step.id;const f=getDraftForm(),input=f.querySelector(step.mode==='metronome'?'[data-setting-key=bpm]':step.mode==='dynamicVoice'&&step.timing.customStages?'[data-unit-key="0"] input':'[data-setting-key=rounds],[data-setting-key=seconds]');if(input)revealBad(f,input,step.id);status((editingMode?'':(index+1)+'단계: ')+issue);return false;}
  }return true;
 }
 function openMode(mode){
  if(!settingsModes.includes(mode))return;
  if(locked()){bridge.notify('진행 중인 연습을 중단한 뒤 설정해 주세요.');return;}editingMode=mode;draft={timing:copy(timing(mode)),params:root.VoiceLinePracticeSettings.prepare(mode,bridge.capture(mode))};savedDraft=copy(draft);singleForm=null;routineForms.clear();metaForm=addForm=null;activeStepId=null;hasChanges=false;editorView='overview';$('planDialog').dataset.editor='general';renderCurrent();status('');bridge.modalOpen('planDialog');fitCurrent();scheduleFit();
 }
 function selectedRoutine(){return state.routines.find(r=>r.id===$('planList').value);}
 function renderList(id){const select=$('planList');select.replaceChildren();for(const r of state.routines){const o=el('option',r.name);o.setAttribute('data-i18n-ignore','');o.value=r.id;select.append(o);}if(id)select.value=id;}
 function loadRoutine(value,editing=false){draft=copy(value||api.routine({name:(root.VoiceLineI18n?.t('나의 루틴')||'나의 루틴')+' '+(state.routines.length+1)}));draft.steps.forEach(prepareStep);savedDraft=copy(draft);singleForm=null;routineForms.clear();metaForm=addForm=null;activeStepId=null;outlineAnchor='routine-meta';outlineScrollTop=0;hasChanges=false;delete $('planDelete').dataset.confirm;$('planDelete').hidden=!selectedRoutine();if(editing)showRoutine();else changeView('overview');}
 function openRoutines(){if(locked()){bridge.notify('진행 중인 연습을 중단한 뒤 루틴을 편집해 주세요.');return;}editingMode=null;$('planDialog').dataset.editor='routine';renderList();loadRoutine(selectedRoutine());bridge.modalOpen('planDialog');fitCurrent();scheduleFit();}
 function saveDraft(){
  if(!valid())return false;if(editingMode){const previous=copy(state);state.settings[editingMode]=api.timing(editingMode,draft.timing);if(!stored()){state=previous;return false;}bridge.apply(editingMode,draft.timing,draft.params);return true;}
  draft.name=draft.name.trim();const next=api.routine(draft),index=state.routines.findIndex(r=>r.id===next.id);if(index<0&&state.routines.length>=50){status('루틴은 최대 50개까지 저장할 수 있습니다.');return false;}const previous=copy(state);if(index<0)state.routines.push(next);else state.routines[index]=next;if(!stored()){state=previous;return false;}draft=copy(next);routineForms.clear();metaForm=addForm=null;renderList(next.id);$('planDelete').hidden=false;return true;
 }
 function clear(){clearClock();if(original){bridge.restore(original);original=null;}const node=$('planBanner');if(node)node.hidden=true;if($('modeMessage'))$('modeMessage').hidden=false;}
 function cancel(){runner?.cancel();clear();}
 async function startPlan(plan,isSingle=false){
  if(bridge.startBlocked())return false;await bridge.stop();single=isSingle;const baseline=bridge.captureAll();bridge.startResults?.(plan,isSingle);
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
  bridge=callbacks;const modal=el('div');modal.id='planDialog';modal.className='modal-backdrop plan-backdrop';modal.hidden=true;
  modal.innerHTML='<section class="modal plan-modal" role="dialog" aria-modal="true" aria-labelledby="planTitle"><header class="modal-heading"><button id="planBack" type="button">전체</button><div class="plan-heading-copy"><h2 id="planTitle">현재 설정</h2><span id="planStage" aria-live="polite"></span></div><button id="planClose" type="button" class="close-btn" aria-label="연습 설정 닫기">✕</button></header><div id="planScroll" class="plan-scroll"><div id="planLibrary" class="plan-library" hidden><select id="planList" aria-label="저장한 루틴"></select><button id="planNew" type="button">새 루틴</button><button id="planDelete" type="button">삭제</button></div><div id="planEditor"></div></div><p id="planStatus" class="plan-note" role="status" hidden></p><footer class="plan-footer"><p id="planActionHint" hidden></p><div class="plan-actions" role="group" aria-label="설정 페이지 이동 및 저장"><button id="planPrev" type="button" aria-label="이전 페이지">이전</button><button id="planRecommend" type="button">추천 설정</button><button id="planSave" type="button">수정</button><button id="planRun" type="button">시작</button><button id="planNext" type="button" aria-label="다음 페이지">다음</button></div></footer><div id="planHelp" class="settings-help-layer" role="dialog" aria-modal="true" aria-labelledby="planHelpTitle" hidden><section><h3 id="planHelpTitle"></h3><p id="planHelpText"></p><button id="planHelpClose" type="button">닫기</button></section></div></section>';
  document.body.append(modal);$('planClose').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19"/></svg>';modal.addEventListener('settings-help',e=>help(e.detail.label,e.detail.text));$('planHelpClose').onclick=()=>{$('planHelp').hidden=true;};$('planHelp').onclick=e=>{if(e.target===$('planHelp'))$('planHelp').hidden=true;};
  $('planClose').onclick=()=>{bridge.stopPreview?.();$('planHelp').hidden=true;document.activeElement?.blur();bridge.modalClose('planDialog');};modal.onclick=e=>{if(e.target===modal)$('planClose').click();};
  $('planRecommend').onclick=openRecommendations;
  $('planBack').onclick=()=>{if(['overview','saved','review'].includes(editorView)){detailsOrigin=editorView;changeView('details');}else back();};
  $('planPrev').onclick=()=>{bridge.stopPreview?.();document.activeElement?.blur();displayBox.pager.move(-1);fitCurrent();};$('planNext').onclick=()=>{bridge.stopPreview?.();document.activeElement?.blur();displayBox.pager.move(1);fitCurrent();};
  $('planSave').onclick=()=>{if(editorView==='review'){activeStepId=reviewReturn.step;changeView(reviewReturn.view);}else if(editorView==='details')back();else changeView(editingMode?'edit':'routine');};
  $('planRun').onclick=async()=>{
   if(!editingMode&&editorView==='edit'){const id=activeStepId;if(id==='add'||!valid(id))return;bridge.stopPreview?.();document.activeElement?.blur();showRoutine(id==='meta'?'routine-meta':'step-'+id);status('설정을 루틴 구성에 반영했습니다.');return;}
   if(['edit','menu','routine'].includes(editorView)){if(!valid())return;reviewReturn={view:editorView==='menu'?'edit':editorView,step:activeStepId};changeView('review');return;}
   if(editorView==='details'){back();return;}if(editorView==='review'){if(!saveDraft())return;savedDraft=copy(draft);hasChanges=false;changeView('saved');return;}
   const mode=editingMode,plan=copy(savedDraft);bridge.modalClose('planDialog');bridge.unlock();if(mode)await startSingle(mode);else if(plan.steps.length)await startPlan(plan);
  };
  $('planList').onchange=()=>loadRoutine(selectedRoutine());$('planNew').onclick=()=>{$('planList').value='';loadRoutine(null,true);};$('planDelete').onclick=()=>{const id=selectedRoutine()?.id;if(!id)return;if($('planDelete').dataset.confirm!==id){$('planDelete').dataset.confirm=id;status('삭제하려면 삭제를 한 번 더 누르세요.');return;}const previous=copy(state);state.routines=state.routines.filter(r=>r.id!==id);if(!stored()){state=previous;return;}renderList();loadRoutine(selectedRoutine());status('루틴을 삭제했습니다.');};
  new ResizeObserver(scheduleFit).observe($('planScroll'));new ResizeObserver(scheduleFit).observe($('planEditor'));window.addEventListener('resize',scheduleFit);window.visualViewport?.addEventListener('resize',scheduleFit);window.visualViewport?.addEventListener('scroll',scheduleFit);
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
 function controls(container,mode){$('customTimingOpen')?.remove();if(!bridge||!settingsModes.includes(mode))return;const b=el('button','연습 설정','mode-guide-button plan-time-button');b.type='button';b.id='customTimingOpen';b.setAttribute('aria-haspopup','dialog');b.onclick=()=>openMode(mode);$('modeGuideButton').parentElement.append(b);}
 root.VoiceLinePlansUI={mount,controls,timing,openMode,openRoutines,back,startSingle,cancel,trainingEnded,patternChanged,arm,volumeChanged:n=>{if(original)original.pianoVolume=n;},owns:token=>runner?.owns(token),showFinalResult:()=>{const s=runner?.snapshot();return single&&s&&s.plan.rounds!==0&&s.round===s.plan.rounds&&s.index===s.plan.steps.length-1&&s.stepRound===s.step.timing.rounds;},get active(){return Boolean(runner?.snapshot());},get token(){return runner?.token;}};
})(globalThis);
