'use strict';
(function(root){
 const model=root.VoiceLinePracticeSettings,plans=root.VoiceLinePracticePlans;
 let serial=0;const noteSelection=new WeakMap(),beatSelection=new WeakMap();
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 function render({mode,timing:t,params:p,onChange,onPageChange,withinRoutine=false,bridge,extraUnits=[],scope='일반 연습'}){
  const box=el('div',undefined,'settings-editor'),tr=p.training,g=p.guide,w=tr.warmup,m=p.metronome,guide=root.VoiceLineGuideTraining;
  box.dataset.settingsMode=mode;box.dataset.scope=withinRoutine?'routine':'general';
  Object.assign(m,root.VoiceLineMetronome.normalize(m));if(mode==='earVoice')tr.root=Math.min(tr.root,plans.earRootLimit(tr.earPattern));
  const overview=el('section',undefined,'settings-overview');overview.setAttribute('aria-label','현재 연습 설정');
  const scopeText=el('span',scope,'settings-scope'),title=el('strong'),summary=el('p',undefined,'settings-current'),time=el('p',undefined,'settings-duration'),audioSummary=el('p',undefined,'settings-audio-summary'),note=el('p',undefined,'settings-explanation');
  const flow=el('div',undefined,'settings-flow'),sequence=el('div',undefined,'settings-sequence'),issue=el('p',undefined,'settings-problem');issue.setAttribute('role','alert');
  const preview=el('details',undefined,'settings-route-preview'),previewHeading=el('summary','진행 순서·음 보기');
  preview.dataset.settingsGroup='preview';preview.append(previewHeading,flow,sequence,note);
  overview.append(scopeText,title,summary,time,audioSummary,preview,issue);box.append(overview);
  const groups={},navigation=el('nav',undefined,'settings-page-nav'),values=el('details',undefined,'settings-values');
  navigation.setAttribute('aria-label','설정 항목');navigation.setAttribute('role','tablist');values.append(el('summary','상세 설정 보기'));box.append(navigation,values);box.dataset.presentation='pages';let currentPage=null;
  for(const [key,name]of [['content','연습 내용'],['timing','진행 시간·반복'],['audio',mode==='warmupVoice'?'소리·안내':'소리·측정']]){
   const details=el('details',undefined,'settings-section'),head=el('summary'),nameNode=el('strong',name),value=el('span',undefined,'settings-section-value'),body=el('div',undefined,'plan-fields settings-fields');
   details.dataset.settingsGroup=key;details.open=key==='content';head.append(nameNode,value);details.append(head,body);groups[key]={details,body,value};box.append(details);
  }
  let into=groups.content.body;const units=[],controls=root.VoiceLineSettingsPages;
  function changed(structural=false,message=''){if(structural)bridge.stopPreview?.();update();onChange?.(structural,message);}
  function help(label,text){box.dispatchEvent(new CustomEvent('settings-help',{bubbles:true,detail:{label,text}}));}
  function topicFor(key,label){
   key=String(key);let id='content',name='연습 선택';
   if(mode==='warmupVoice'){
    if(['inhale','exhale','hum'].includes(key))return {id:'breath',title:'호흡'};
    if(['rest','prepare'].includes(key))return {id:'timing',title:'시간'};
    if(['rounds','choice:반복 방식','cues'].includes(key))return {id:'repeat',title:'반복'};
   }
   if(key==='id'){id='preset';name='리듬 불러오기';}
   else if(key==='earNoteIndex'||/번째 청음/.test(label)){id='notes';name='음 순서';}
   else if(key==='beatIndex'||key==='accentValue'){id='beats';name='박별 강세';}
   else if(['meter','numerator','denominator'].includes(key)){id='meter';name='박자표';}
   else if(['unit','subdivision'].includes(key)){id='subdivision';name='리듬 세분';}
   else if(key==='grouping'){id='grouping';name='강세 묶음';}
   else if(key==='bpm'&&mode==='metronome'){id='tempo';name='빠르기';}
   else if(['root','vibratoRoot','base','shift'].includes(key)){id='range';name='음역';}
   else if(key==='choice:진행 방식'||key==='prepareSeconds'){id='start';name='시작 준비';}
   else if(['noteSeconds','smoothSeconds','bpm','choice:음 길이 방식'].includes(key)){id='length';name='음 길이';}
   else if(['rounds','choice:반복 방식'].includes(key)){id='repeat';name='반복';}
   else if(['rest','restSeconds','noteRest'].includes(key)){id='recovery';name='회복';}
   else if(['prepare','reference','listen'].includes(key)){id='prepare';name='준비·듣기';}
   else if(['breath','breathSeconds','answer','inhale','exhale'].includes(key)){id='breath';name=key==='answer'||mode==='earVoice'?'호흡·발성':'호흡';}
   else if(key==='hum'){id='hum';name='허밍';}
   else if(['seconds','choice:종료 방식','choice:시간 입력 방식'].includes(key)||/^\d+$/.test(key)){id='duration';name=['piano','pitch','record','metronome','rest'].includes(mode)?'진행 시간':'발성 시간';}
   else if(key==='dynamicCueVolume'){id='cues';name='전환 안내음';}
   else if(['sound','volume','pianoVolume','muted','cues'].includes(key)){id='audio';name='소리';}
   else if(['tolerance','choice:음정 감지 감도 · 앱 공통'].includes(key)){id='measurement';name='측정';}
   return {id,title:name};
  }
  function shortLabel(key,label){const names={'choice:음정 감지 감도 · 앱 공통':'음정 감도','choice:시간 입력 방식':'시간 방식','choice:반복 방식':'반복 방식','choice:종료 방식':'종료 방식','choice:진행 방식':'진행 방식','choice:음 길이 방식':'길이 방식',kind:'연습 종류',pattern:'연습 패턴',earPattern:'청음 방법',earCount:'들을 음 수',earNoteIndex:'음 순서 선택',root:'기준음',vibratoRoot:'기준음',base:'시작 옥타브',shift:'반복 음역',prepareSeconds:'시작 준비',breathSeconds:'들이쉬기',restSeconds:'회복 시간',noteSeconds:'한 음 길이',smoothSeconds:'왕복 시간',prepare:'시작 준비',reference:'기준음 듣기',listen:'음 듣기',breath:'들이쉬기',answer:'따라 부르기',noteRest:'음 사이 쉬기',rest:'회복 시간',rounds:'반복 횟수',seconds:'진행 시간',pianoVolume:'기준음 음량',volume:'가이드 음량',dynamicCueVolume:'전환 안내음',numerator:'한 마디 박 수',denominator:'기준 음표',unit:'BPM 기준',subdivision:'한 박 세분',beatIndex:'편집할 박',accentValue:'박의 강세'};return names[key]||label.replace(/ \((?:초|%|BPM)\)$/,'').replace(/번째 청음/,'번째 음');}
  function register(c,key,label,transient=false){const unit={...c,key:String(key),label,shortLabel:shortLabel(key,label),topic:topicFor(key,label),transient};c.node.dataset.unitKey=String(key);c.node.dataset.unitLabel=label;units.push(unit);into.append(c.node);return c.input;}
  function numeric(key,label,min,max,step=.1,obj=t,description=''){
   const defaults=/세트|횟수/.test(label)?[1,2,4]:/쉬기|준비|들이쉬기/.test(label)?[0,2,3]:key==='noteSeconds'?[.5,1,2]:null;
   const c=controls.numberField({key:String(key),label,value:obj[key]??0,min,max,step,presets:defaults,help:description,onHelp:help,onInput:(input,ok)=>{if(ok)obj[key]=Number(input.value);changed();}});return register(c,key,label);
  }
  function select(key,label,options,obj=p,description=''){
   const c=controls.selectField({key:String(key),label,value:obj[key],options,help:description,onHelp:help,onChange:value=>{obj[key]=value;changed(true);}});return register(c,key,label,key==='id'||key==='earNoteIndex'||key==='beatIndex'||key==='accentValue');
  }
  function choices(label,items,value,choose,description=''){
   const key='choice:'+label,c=controls.selectField({key,label,value,options:items.map(([v,title])=>[v,title]),help:[description,...items.map(([,title,desc])=>desc?title+': '+desc:'')].filter(Boolean).join(' '),onHelp:help,onChange:choose});c.node.classList.add('settings-choice');register(c,key,label);return c.node;
  }
  function check(key,label,obj){const node=el('div',undefined,'settings-unit settings-check'),l=el('label',undefined,'settings-check-line'),input=el('input');input.type='checkbox';input.checked=obj[key]===true;input.dataset.settingKey=key;input.setAttribute('aria-label',label);input.onchange=()=>{obj[key]=input.checked;changed(true);};l.append(input,el('span',label));node.append(l);register({node,input,value:()=>input.checked?'켜기':'끄기'},key,label);return input;}
  function volume(key,label,obj,previewSound){
   const node=el('div',undefined,'settings-unit settings-volume'),heading=el('div',label.replace(' (%)',''),'settings-label'),row=el('div',undefined,'settings-volume-row'),slider=el('input'),number=el('input'),readout=el('button',undefined,'settings-volume-value'),output=el('output'),error=el('small',undefined,'settings-field-error');
   slider.type='range';slider.min=number.min=0;slider.max=number.max=100;slider.step=number.step=1;slider.value=number.value=String(obj[key]);slider.setAttribute('aria-label',label.replace(' (%)','')+' 조절');number.type='number';number.inputMode='numeric';number.required=true;number.hidden=true;number.dataset.settingKey=key;number.setAttribute('aria-label',label);readout.type='button';readout.setAttribute('aria-label',label.replace(' (%)','')+' 직접 입력');readout.append(output);error.hidden=true;error.setAttribute('role','alert');
   const sync=()=>{output.textContent=obj[key]+'%';slider.style.setProperty('--volume-fill',obj[key]+'%');};const activate=()=>{number.hidden=false;readout.hidden=true;number.focus({preventScroll:true});};readout.onclick=activate;
   slider.oninput=()=>{number.value=slider.value;number.oninput();};number.oninput=()=>{const ok=number.value!==''&&number.validity.valid;error.hidden=ok;error.textContent=ok?'':'0~100 사이의 정수로 입력해 주세요.';if(ok){obj[key]=Number(number.value);slider.value=number.value;if(key==='dynamicCueVolume')tr.dynamicCues=obj[key]>0;sync();}changed();};number.onblur=()=>{if(number._settingsReflow)return;if(number.value!==''&&number.validity.valid){number.hidden=true;readout.hidden=false;}};number.onkeydown=e=>{if(e.key==='Enter')number.blur();};number.syncControl=sync;
   row.append(slider,readout,number);if(previewSound){const b=el('button','듣기','settings-preview-sound');b.type='button';b.setAttribute('aria-label',label.replace(' (%)','')+' 미리 듣기');b.onclick=()=>previewSound(Number(obj[key]));row.append(b);}node.append(heading,row,error);register({node,input:number,value:()=>obj[key]+'%',activate},key,label);sync();return node;
  }
  const notes=(min=36,max=94)=>Array.from({length:max-min+1},(_,i)=>[min+i,bridge.noteLabel(min+i)]);
  const groupOf=kind=>model.KINDS.find(([id])=>id===kind)?.[1]||'';
  function repeat(obj,key,label,unit='회'){
   if(!withinRoutine){choices('반복 방식',[[false,'횟수 지정'],[true,'계속 반복']],obj[key]===0,infinite=>{obj[key]=infinite?0:1;if(mode==='practice'&&infinite)g.shift=0;changed(true);});}
   if(withinRoutine||obj[key]!==0)numeric(key,label,1,99,1,obj,unit==='세트'?'아·에·이·오·우 전체가 한 세트입니다.':'');
  }
  if(mode==='practice'){
   const kind=model.patternKind(g.pattern),kindState={kind};
   const category=select('kind','연습 종류',model.KINDS,kindState);
   category.onchange=()=>{g.pattern=model.patterns(category.value)[0][0];if(category.value==='vowels'&&kind!=='vowels'){if(!withinRoutine)g.rounds=1;g.shift=0;}Object.assign(g,guide.normalize(g));changed(true);};
   const pattern=select('pattern','연습 패턴',model.patterns(kind),g);
   pattern.onchange=()=>{const before=g.root;g.pattern=pattern.value;Object.assign(g,guide.normalize(g));changed(true,before!==g.root?'선택한 패턴이 음역 안에 들어오도록 기준음을 '+bridge.noteLabel(g.root)+'로 조정했습니다.':'');};
   select('root','기준음',notes(36,guide.normalize({...g,root:94}).root),g);
   choices('진행 방식',[[false,'바로 따라 부르기','호흡 준비 후 목표 음을 보며 발성'],[true,'먼저 듣고 따라 부르기','한 구절 듣기 → 호흡 → 따라 부르기']],g.listenFirst,v=>{g.listenFirst=v;changed(true);});
  }else if(['sustainVoice','earVoice','dynamicVoice','vibrato'].includes(mode)){
   if(mode==='earVoice')select('earPattern','청음 방법',Object.entries(plans.EAR_PATTERNS),tr);
   if(mode==='dynamicVoice'){
    const pattern=select('dynamicPattern','강약 방법',Object.entries(root.VoiceLineDynamics.PATTERNS).filter(([id])=>id!=='vowels').map(([id,p])=>[id,p.label]),tr);
    pattern.onchange=()=>{tr.dynamicPattern=pattern.value;t.stages=root.VoiceLineDynamics.getPattern(pattern.value).segments.map(s=>s.ms/1000);changed(true);};
   }
   if(mode!=='earVoice'||tr.earPattern!=='custom')select(mode==='vibrato'?'vibratoRoot':'root','기준음',notes(36,mode==='vibrato'?94:mode==='earVoice'?plans.earRootLimit(tr.earPattern):84),mode==='vibrato'?p:tr);
   if(mode==='earVoice'){
    const count=select('earCount','한 회차에서 들을 음 수',Array.from({length:20},(_,i)=>[i+1,(i+1)+'음']),tr);
    count.onchange=()=>{tr.earCount=Number(count.value);if(tr.earPattern==='custom')tr.earNotes=plans.earSequence(tr);changed(true);};
    if(tr.earPattern==='custom'){
     tr.earNotes=plans.earSequence(tr);const chosen=clamp(noteSelection.get(p)||0,0,tr.earNotes.length-1),indexState={earNoteIndex:chosen};
     const index=select('earNoteIndex','편집할 청음 순서',tr.earNotes.map((n,i)=>[i,(i+1)+'번째 · '+bridge.noteLabel(n)]),indexState);index.onchange=()=>{noteSelection.set(p,Number(index.value));changed(true);};
     const pitch=select(chosen,(chosen+1)+'번째 청음',notes(),tr.earNotes),play=el('button','듣기','settings-preview-sound');play.type='button';play.setAttribute('aria-label','선택한 음 듣기');play.onclick=()=>bridge.previewSound?.({midi:tr.earNotes[chosen],sound:'piano',volume:p.pianoVolume});pitch.closest('.settings-unit').querySelector('.settings-control-row').append(play);

    }
   }
  }else if(['piano','pitch'].includes(mode))select('base','건반 시작 옥타브',Array.from({length:6},(_,i)=>[24+i*12,bridge.noteLabel(24+i*12)]),p);
  if(mode==='metronome'){
   let saved=[];try{saved=root.VoiceLineMetronome.parsePresets(root.localStorage.getItem('voiceline-metronome-presets-v1'));}catch(_){}
   if(saved.length){const state={id:''},savedChoice=select('id','보관한 리듬 불러오기',[['','리듬 선택'],...saved.map(r=>[r.id,r.name])],state);savedChoice.onchange=()=>{const entry=saved.find(r=>r.id===savedChoice.value);if(entry){Object.assign(m,entry.settings);changed(true,'보관한 리듬을 편집 중인 설정에 불러왔습니다.');}};}
   numeric('bpm','빠르기 (BPM)',20,300,1,m);const preset={meter:m.numerator+'/'+m.denominator},options=root.VoiceLineMetronome.PRESETS.map(v=>[v,v+'박자']);if(!options.some(([id])=>id===preset.meter))options.push([preset.meter,preset.meter+' · 직접 설정']);options.push(['custom','박자표 직접 설정']);
   const choice=select('meter','박자표',options,preset);choice.onchange=()=>{if(choice.value!=='custom'){[m.numerator,m.denominator]=choice.value.split('/').map(Number);m.accents=root.VoiceLineMetronome.normalize({...m,accents:[]}).accents;}else m.customEditor=true;changed(true);};
   const chosenBeat=clamp(beatSelection.get(p)||0,0,m.numerator-1),beatState={beatIndex:chosenBeat,accentValue:m.accents[chosenBeat]};
   const beat=select('beatIndex','편집할 박',Array.from({length:m.numerator},(_,i)=>[i,(i+1)+'박']),beatState);beat.onchange=()=>{beatSelection.set(p,Number(beat.value));changed(true);};
   const accent=select('accentValue','선택한 박의 강세',[[2,'강세'],[1,'보통'],[0,'묵음']],beatState);accent.onchange=()=>{m.accents[chosenBeat]=Number(accent.value);changed(true);};
   const advanced=el('details',undefined,'settings-extra');advanced.append(el('summary','세분·직접 박자표'));const area=el('div',undefined,'plan-fields settings-fields');advanced.append(area);into.append(advanced);const before=into;into=area;
   const numerator=numeric('numerator','한 마디의 박 수',1,64,1,m);numerator.onchange=()=>{if(numerator.validity.valid&&numerator.value!==''){m.numerator=Number(numerator.value);changed(true);}};select('denominator','박자표의 기준 음표',root.VoiceLineMetronome.DENOMINATORS.map(n=>[n,n+'분음표']),m);select('unit','BPM 기준',[['beat','박자표 음표'],['quarter','4분음표'],['dottedQuarter','점4분음표']],m);select('subdivision','한 박의 세분',root.VoiceLineMetronome.SUBDIVISIONS.map(n=>[n,n+'분할']),m);
   const grouping=controls.textField({key:'grouping',label:'강세 묶음',help:'예: 2+2+3. 합계가 한 마디의 박 수와 같아야 합니다.',onHelp:help}),apply=el('button','적용');apply.type='button';apply.onclick=()=>{const accents=root.VoiceLineMetronome.grouping(grouping.input.value,m.numerator);if(!accents){changed(false,'강세 묶음의 합계가 한 마디의 박 수와 같아야 합니다.');return;}m.accents=accents;changed(true);};grouping.node.querySelector('.settings-control-row').append(apply);register(grouping,'grouping','강세 묶음',true);into=before;
  }
  into=groups.timing.body;
  if(mode==='practice'){
   if(guide.PATTERNS[g.pattern].smooth)numeric('smoothSeconds','연속 왕복 시간 (초)',1,300,.1,g,'올라가기와 내려오기를 모두 포함합니다.');
   else{choices('음 길이 방식',[['seconds','초 직접 입력'],['bpm','BPM에 맞추기']],g.noteSeconds===0?'bpm':'seconds',v=>{g.noteSeconds=v==='bpm'?0:1.8;changed(true);});if(g.noteSeconds===0)numeric('bpm','빠르기 (BPM)',50,120,1,g,'음 하나를 한 박에 맞춥니다.');else numeric('noteSeconds','한 음 길이 (초)',.1,60,.1,g);}
   const prepare=numeric('prepareSeconds','먼저 듣기 전 준비 (초)',0,120,.1,g,g.listenFirst?'':'먼저 듣기를 선택하면 사용합니다.');prepare.disabled=!g.listenFirst;
   numeric('breathSeconds','발성 전 들이쉬기 (초)',0,120,.1,g,'0초는 생략합니다.');numeric('restSeconds',guide.PATTERNS[g.pattern].vowels?'모음 사이·회차 끝 쉬기 (초)':'회차 사이 쉬기 (초)',0,120,.1,g,'마지막 회차의 회복도 전체 시간에 포함합니다.');
   const count=withinRoutine?t:g;repeat(count,'rounds',guide.PATTERNS[g.pattern].vowels?'다섯 모음 세트 수':withinRoutine?'이 단계 반복 횟수':'이 구절 반복 횟수',guide.PATTERNS[g.pattern].vowels?'세트':'회');
   const shift=select('shift','반복 시 기준음 이동',[[0,'같은 음역 반복'],[1,'반음씩 올리기'],[-1,'반음씩 내리기']],g,guide.PATTERNS[g.pattern].vowels?'다섯 모음을 마친 다음 세트에 적용합니다.':'');shift.disabled=count.rounds===0;
  }else if(mode==='warmupVoice'){
   for(const [key,name]of [['inhale','들이쉬기'],['exhale','내쉬기'],['hum','허밍'],['rest','쉬기']])numeric(key,name+' (초)',key==='rest'?0:1,120,.1,w,key==='rest'?'0초는 생략합니다.':'');numeric('prepare','시작 전 준비 (초)',0,120);repeat(t,'rounds',withinRoutine?'이 단계 반복 횟수':'호흡 세트 수','세트');
  }else if(mode==='earVoice'){
   numeric('prepare','시작 전 준비 (초)',0,120);numeric('listen','기준음 듣기 (초)',.5,120);numeric('breath','들이쉬기 (초)',0,120);numeric('answer','따라 부르기 (초)',.5,120);numeric('noteRest','음 사이 쉬기 (초)',0,120);repeat(t,'rounds',withinRoutine?'이 단계 반복 횟수':'음 순서 반복 횟수');numeric('rest','반복 사이 쉬기 (초)',0,120);
  }else if(['piano','pitch','record','metronome'].includes(mode)){
   if(!withinRoutine)choices('종료 방식',[[false,'직접 중단'],[true,'시간 지정']],t.seconds>0,timed=>{t.seconds=timed?30:0;changed(true);});
   if(withinRoutine||t.seconds>0){numeric('seconds',({piano:'연주 시간 (초)',pitch:'측정 시간 (초)',record:'녹음 시간 (초)',metronome:'진행 시간 (초)'})[mode],.1,mode==='record'?600:3600);if(mode!=='record'){repeat(t,'rounds',withinRoutine?'이 단계 반복 횟수':'반복 횟수');numeric('rest','반복 사이 쉬기 (초)',0,120);}}
  }else if(mode==='rest')numeric('seconds','쉬는 시간 (초)',1,3600);
  else{
   if(mode==='dynamicVoice')choices('시간 입력 방식',[[false,'전체 시간'],[true,'단계별 시간']],t.customStages,v=>{t.customStages=v;changed(true);});
   const duration=numeric('seconds','한 번 발성하는 시간 (초)',mode==='dynamicVoice'?8:1,mode==='dynamicVoice'?300:3600);duration.disabled=mode==='dynamicVoice'&&t.customStages;
   if(mode==='dynamicVoice'&&t.customStages){const pattern=root.VoiceLineDynamics.getPattern(tr.dynamicPattern);if(t.stages.length!==pattern.segments.length)t.stages=pattern.segments.map(s=>s.ms/1000);const previous=into,stages=el('div',undefined,'plan-stage-fields');into=stages;pattern.segments.forEach((s,i)=>numeric(i,s.label+' (초)',1,60,.1,t.stages));into=previous;into.append(stages);duration.value=String(round(t.stages.reduce((a,b)=>a+b,0)));}
   numeric('reference','기준음 듣기 (초)',0,120);numeric('breath','들이쉬기 (초)',0,120);repeat(t,'rounds',withinRoutine?'이 단계 반복 횟수':'발성 반복 횟수');numeric('rest','반복 사이 쉬기 (초)',0,120);
  }
  into=groups.audio.body;
  if(mode==='practice'){
   into.append(el('p','기준음 · 피아노','settings-help'));volume('volume','가이드 음량 (%)',g,v=>bridge.previewSound?.({midi:g.root,sound:'piano',volume:v}));
   if(!guide.PATTERNS[g.pattern].smooth)select('tolerance','음정 허용 범위',[[35,'정밀하게 · ±35cent'],[50,'기본 · ±50cent'],[75,'여유롭게 · ±75cent']],g,'목표 음정에서 허용하는 높이 차이입니다.');else into.append(el('p','연속 이동의 허용 범위는 ±110cent입니다.','settings-help'));
  }else if(mode==='metronome'){select('sound','클릭 소리',[['click','클릭'],['wood','우드'],['bell','벨']],m);volume('volume','메트로놈 음량 (%)',m);check('muted','메트로놈 음소거',m);}
  else if(mode==='warmupVoice')check('cues','단계 전환 안내음',w);
  else if(['piano','sustainVoice','earVoice','dynamicVoice','vibrato'].includes(mode))volume('pianoVolume','건반·기준음 음량 (%)',p,v=>bridge.previewSound?.({midi:mode==='vibrato'?p.vibratoRoot:tr.root,sound:'piano',volume:v}));
  if(mode==='dynamicVoice')volume('dynamicCueVolume','단계 전환 안내음 크기 (%)',tr,v=>bridge.previewCue?.(v));
  if(mode==='vibrato')into.append(el('p','측정 기준: 최근 3초 · 3~9Hz · 진폭 ±7~125cent. 자세한 기준은 기능 설명에서 확인합니다.','settings-help'));
  if(!withinRoutine&&['pitch','record','practice','sustainVoice','earVoice','dynamicVoice','vibrato'].includes(mode))choices('음정 감지 감도 · 앱 공통',[['standard','표준','주변 소리에 덜 반응'],['sensitive','민감','작은 목소리 감지'],['high','최대','아주 작은 소리 감지']],p.micSensitivity,v=>{p.micSensitivity=v;changed(true);});
  for(const key of Object.keys(groups))if(!groups[key].body.children.length){groups[key].details.remove();delete groups[key];}
  if(!groups.content&&groups.timing)groups.timing.details.open=true;
  function allRows(){
   const rows=box.pager.rows().filter(r=>!(/^\d+$/.test(r.key.split(':')[0])&&mode==='earVoice'));
   if(mode==='earVoice'&&tr.earPattern==='custom')tr.earNotes.forEach((n,i)=>rows.push({key:'ear-note-'+i,label:(i+1)+'번째 청음',value:bridge.noteLabel(n)}));
   if(mode==='metronome')m.accents.forEach((n,i)=>rows.push({key:'accent-'+i,label:(i+1)+'박 강세',value:['묵음','보통','강세'][n]}));
   return rows;
  }
  function compactRows(){
   const d=box.description,rows=[];const add=(label,value)=>rows.push({key:label,label,value});
   add('연습',d.title);
   if(mode==='practice'){add('기준음',bridge.noteLabel(g.root));add('진행',g.listenFirst?'먼저 듣고 따라 부르기':'바로 따라 부르기');add('음 길이',guide.PATTERNS[g.pattern].smooth?g.smoothSeconds+'초 왕복':g.noteSeconds?g.noteSeconds+'초/음':g.bpm+' BPM');}
   else if(mode==='earVoice'){add('음 순서',plans.EAR_PATTERNS[tr.earPattern]+' · '+tr.earCount+'음');if(tr.earPattern!=='custom')add('기준음',bridge.noteLabel(tr.root));}
   else if(mode==='metronome'){add('박자',m.numerator+'/'+m.denominator);add('빠르기',m.bpm+' BPM');}
   else if(['sustainVoice','dynamicVoice','vibrato'].includes(mode))add('기준음',bridge.noteLabel(mode==='vibrato'?p.vibratoRoot:tr.root));
   else if(['piano','pitch'].includes(mode))add('시작 옥타브',bridge.noteLabel(p.base));
   if(!['practice','earVoice','metronome'].includes(mode))add('진행',d.compact);
   add('반복',d.repeats===0?'계속 반복':d.repeats+d.repeatUnit);if(mode!=='rest')add('소리',d.audio);return rows;
  }
  function update(){
   if(mode==='dynamicVoice'&&t.customStages){const total=round(t.stages.reduce((a,b)=>a+b,0));const input=box.querySelector('input[data-setting-key="seconds"]');if(input)input.value=String(total);}
   const d=model.describe(mode,t,p,withinRoutine,bridge.noteLabel),bad=box.querySelector('input:invalid,select:invalid');title.textContent=mode==='earVoice'&&tr.earPattern==='custom'?'청음 · 직접 음 지정':d.title;summary.textContent=d.compact;
   time.replaceChildren(el('span',d.totalText));if(d.voiceSeconds!==null&&d.voiceSeconds>0)time.append(document.createTextNode(' · '),el('span',(d.repeats===0?'한 '+d.repeatUnit+' 기준 ':'')+d.voiceLabel+' '+model.formatTime(d.voiceSeconds)));note.textContent=d.note;
   audioSummary.textContent=mode==='rest'?'':d.audio;audioSummary.hidden=mode==='rest';
   issue.hidden=!bad&&!d.issues.length;issue.textContent=bad?'입력값을 확인해 주세요. 유효한 값으로 설정 요약을 갱신합니다.':d.issues.join(' ');
   flow.replaceChildren();for(const [i,s]of d.phases.entries()){if(i)flow.append(el('span','→','settings-flow-arrow'));const b=el('button',undefined,'settings-phase');b.type='button';b.dataset.kind=s.kind;b.append(el('span',s.label),el('strong',model.formatTime(s.seconds)));b.onclick=()=>{const input=box.querySelector('[data-setting-key="'+s.key+'"]');if(input)onPageChange?.('timing',s.key);};flow.append(b);}
   sequence.replaceChildren();if(d.notes.length){for(const [i,midi]of d.notes.entries()){if(i)sequence.append(el('span','→'));sequence.append(el('span',bridge.noteLabel(midi),'settings-note-label'));}}sequence.hidden=!d.notes.length;
   preview.hidden=!d.phases.length&&!d.notes.length&&!d.note;
   if(groups.content)groups.content.value.textContent=mode==='practice'?groupOf(model.patternKind(g.pattern))+' · '+bridge.noteLabel(g.root):d.compact;
   if(groups.timing)groups.timing.value.textContent=d.totalText+' · '+(d.repeats?d.repeats+d.repeatUnit:'계속 반복');
   if(groups.audio)groups.audio.value.textContent=d.audio;
   box.dataset.valid=String(!bad&&!d.issues.length);box.description=d;box.pager?.refresh();
  }
  box.update=update;update();
  units.push(...extraUnits);box.pager=controls.create({box,units,integrated:true,title:plans.MODES[mode]||'상세 설정',description:()=>box.description,onState:state=>onPageChange?.(state.key,state)});
  box.getRows=allRows;box.compactRows=compactRows;box.meta=()=>{const d=box.description;return d.totalText+(d.voiceSeconds>0?' · '+d.voiceLabel+' '+model.formatTime(d.voiceSeconds):'');};
  box.showPage=(key,notify=true)=>box.pager.showPage(key,notify);box.showMenu=notify=>box.pager.showMenu(notify);box.showSummary=(label='현재 연습 설정',rows=compactRows(),kind='overview',empty='')=>box.pager.showSummary({label,rows,kind,meta:box.meta(),empty});
  box.pageKeys=box.pager.pages.map(p=>p.key);return box;

 }
 function clamp(n,a,b){return Math.max(a,Math.min(b,n));}function round(n){return Math.round(n*10)/10;}
 root.VoiceLinePracticeSettingsUI={render};
})(globalThis);
