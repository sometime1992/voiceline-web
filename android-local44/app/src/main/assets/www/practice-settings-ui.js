'use strict';
(function(root){
 const model=root.VoiceLinePracticeSettings,plans=root.VoiceLinePracticePlans;
 let serial=0;const noteSelection=new WeakMap(),beatSelection=new WeakMap();
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 function render({mode,timing:t,params:p,onChange,withinRoutine=false,bridge,scope='일반 연습'}){
  const box=el('div',undefined,'settings-editor'),tr=p.training,g=p.guide,w=tr.warmup,m=p.metronome,guide=root.VoiceLineGuideTraining;
  box.dataset.settingsMode=mode;box.dataset.scope=withinRoutine?'routine':'general';
  Object.assign(m,root.VoiceLineMetronome.normalize(m));if(mode==='earVoice')tr.root=Math.min(tr.root,plans.earRootLimit(tr.earPattern));
  const overview=el('section',undefined,'settings-overview');overview.setAttribute('aria-label','현재 연습 설정');
  const scopeText=el('span',scope,'settings-scope'),title=el('strong'),summary=el('p',undefined,'settings-current'),time=el('p',undefined,'settings-duration'),note=el('p',undefined,'settings-explanation');
  const flow=el('div',undefined,'settings-flow'),sequence=el('div',undefined,'settings-sequence'),issue=el('p',undefined,'settings-problem');issue.setAttribute('role','alert');
  const preview=el('details',undefined,'settings-route-preview'),previewHeading=el('summary','진행 순서·음 보기');
  preview.dataset.settingsGroup='preview';preview.append(previewHeading,flow,sequence,note);
  overview.append(scopeText,title,summary,time,preview,issue);box.append(overview);
  const groups={};
  for(const [key,name]of [['content','연습 내용'],['timing','진행 시간·반복'],['audio',mode==='warmupVoice'?'소리·안내':'소리·측정']]){
   const details=el('details',undefined,'settings-section'),head=el('summary'),nameNode=el('strong',name),value=el('span',undefined,'settings-section-value'),body=el('div',undefined,'plan-fields settings-fields');
   details.dataset.settingsGroup=key;details.open=key==='content';head.append(nameNode,value);details.append(head,body);groups[key]={details,body,value};box.append(details);
  }
  let into=groups.content.body;
  function changed(structural=false,message=''){if(structural)bridge.stopPreview?.();update();onChange?.(structural,message);}
  function numeric(key,label,min,max,step=.1,obj=t,help=''){
   const wrap=el('label',label,'settings-field'),input=el('input'),error=el('small',undefined,'settings-field-error');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.required=true;input.inputMode=step===1?'numeric':'decimal';input.value=String(obj[key]??0);input.setAttribute('aria-label',label);input.dataset.settingKey=String(key);error.hidden=true;error.setAttribute('role','alert');
   const check=()=>{const ok=input.value!==''&&input.validity.valid;error.hidden=ok;error.textContent=ok?'':min+'~'+max+' 범위에서 '+(step===1?'정수로':'소수점 한 자리까지')+' 입력해 주세요.';return ok;};
   input.oninput=()=>{if(check())obj[key]=Number(input.value);changed();};input.onblur=check;wrap.append(input);if(help)wrap.append(el('small',help,'settings-help'));wrap.append(error);into.append(wrap);return input;
  }
  function select(key,label,options,obj=p,help=''){
   const wrap=el('label',label,'settings-field'),s=el('select');s.required=true;s.setAttribute('aria-label',label);s.dataset.settingKey=String(key);
   for(const [value,text]of options){const o=el('option',text);o.value=String(value);s.append(o);}s.value=String(obj[key]);
   s.onchange=()=>{obj[key]=options.find(([v])=>String(v)===s.value)?.[0]??s.value;changed(true);};wrap.append(s);if(help)wrap.append(el('small',help,'settings-help'));into.append(wrap);return s;
  }
  function choices(label,items,value,choose,help=''){
   const field=el('fieldset',undefined,'settings-choice plan-listen-choice'),row=el('div',undefined,'settings-choice-options'),name='settings-choice-'+(++serial);field.append(el('legend',label),row);
   for(const [v,title,description]of items){const l=el('label',undefined,'settings-choice-option'+(v===value?' selected':'')),radio=el('input'),copy=el('span');radio.type='radio';radio.name=name;radio.value=String(v);radio.checked=v===value;radio.required=true;radio.setAttribute('aria-label',title);radio.onchange=()=>{if(radio.checked)choose(v);};copy.append(el('strong',title));if(description)copy.append(el('small',description));l.append(radio,copy);row.append(l);}
   if(help)field.append(el('small',help,'settings-help'));into.append(field);return field;
  }
  function check(key,label,obj){const l=el('label',undefined,'plan-check settings-check'),input=el('input');input.type='checkbox';input.checked=obj[key]===true;input.setAttribute('aria-label',label);input.onchange=()=>{obj[key]=input.checked;changed(true);};l.append(input,document.createTextNode(label));into.append(l);return input;}
  function volume(key,label,obj,preview){
   const field=el('fieldset',undefined,'settings-volume'),legend=el('legend',label.replace(' (%)','')),output=el('output'),row=el('div',undefined,'settings-volume-row'),slider=el('input'),number=el('input'),err=el('small',undefined,'settings-field-error');
   slider.type='range';slider.min=number.min='0';slider.max=number.max='100';slider.step=number.step='1';slider.value=number.value=String(obj[key]);number.type='number';number.required=true;number.inputMode='numeric';slider.setAttribute('aria-label',label.replace(' (%)','')+' 조절');number.setAttribute('aria-label',label);number.dataset.settingKey=key;
   const sync=()=>{output.textContent=obj[key]+'%'+(obj[key]===0?' · 끄기':'');slider.style.setProperty('--volume-fill',obj[key]+'%');};
   slider.oninput=()=>{obj[key]=Number(slider.value);number.value=slider.value;if(key==='dynamicCueVolume')tr.dynamicCues=obj[key]>0;sync();changed();};
   number.oninput=()=>{const ok=number.value!==''&&number.validity.valid;err.hidden=ok;err.textContent=ok?'':'0~100 사이의 정수로 입력해 주세요.';if(ok){obj[key]=Number(number.value);slider.value=number.value;if(key==='dynamicCueVolume')tr.dynamicCues=obj[key]>0;sync();}changed();};
   err.hidden=true;field.append(legend,output);row.append(slider,number);field.append(row,err);
   if(preview){const b=el('button','미리 듣기','settings-preview-sound');b.type='button';b.onclick=()=>preview(Number(obj[key]));field.append(b);}into.append(field);sync();return field;
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
     tr.earNotes=plans.earSequence(tr);const chosen=clamp(noteSelection.get(p)||0,0,tr.earNotes.length-1),grid=el('div',undefined,'settings-note-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label','직접 지정한 청음 순서');
     tr.earNotes.forEach((midi,i)=>{const b=el('button',undefined,'settings-note'+(i===chosen?' selected':''));b.type='button';b.setAttribute('aria-label',(i+1)+'번째 음 편집');b.setAttribute('aria-pressed',String(i===chosen));b.append(el('small',(i+1)+'번'),el('strong',bridge.noteLabel(midi)));b.onclick=()=>{noteSelection.set(p,i);changed(true);};grid.append(b);});into.append(grid);
     select(chosen,(chosen+1)+'번째 청음',notes(),tr.earNotes);const play=el('button','선택한 음 듣기','settings-preview-sound');play.type='button';play.onclick=()=>bridge.previewSound?.({midi:tr.earNotes[chosen],sound:'piano',volume:p.pianoVolume});into.append(play);
    }
   }
  }else if(['piano','pitch'].includes(mode))select('base','건반 시작 옥타브',Array.from({length:6},(_,i)=>[24+i*12,bridge.noteLabel(24+i*12)]),p);
  if(mode==='metronome'){
   let saved=[];try{saved=root.VoiceLineMetronome.parsePresets(root.localStorage.getItem('voiceline-metronome-presets-v1'));}catch(_){}
   if(saved.length){const state={id:''},savedChoice=select('id','보관한 리듬 불러오기',[['','리듬 선택'],...saved.map(r=>[r.id,r.name])],state);savedChoice.onchange=()=>{const entry=saved.find(r=>r.id===savedChoice.value);if(entry){Object.assign(m,entry.settings);changed(true,'보관한 리듬을 편집 중인 설정에 불러왔습니다.');}};}
   numeric('bpm','빠르기 (BPM)',20,300,1,m);const preset={meter:m.numerator+'/'+m.denominator},options=root.VoiceLineMetronome.PRESETS.map(v=>[v,v+'박자']);if(!options.some(([id])=>id===preset.meter))options.push([preset.meter,preset.meter+' · 직접 설정']);options.push(['custom','박자표 직접 설정']);
   const choice=select('meter','박자표',options,preset);choice.onchange=()=>{if(choice.value!=='custom'){[m.numerator,m.denominator]=choice.value.split('/').map(Number);m.accents=root.VoiceLineMetronome.normalize({...m,accents:[]}).accents;}else m.customEditor=true;changed(true);};
   const beats=el('div',undefined,'settings-beat-editor'),grid=el('div',undefined,'settings-beat-grid'),paging=root.VoiceLineMetronome.beatPage(m.numerator,300,beatSelection.get(p)||0);
   const accentName=['묵음','보통','강세'];
   for(let i=paging.start;i<paging.end;i++){const b=el('button',undefined,'settings-beat');b.type='button';const paint=()=>{b.dataset.accent=m.accents[i];b.replaceChildren(el('strong',(i+1)+'박'),el('small',accentName[m.accents[i]]));b.setAttribute('aria-label',(i+1)+'박 '+accentName[m.accents[i]]+' · 누르면 변경');};paint();b.onclick=()=>{m.accents[i]=(m.accents[i]+2)%3;paint();changed();};grid.append(b);}beats.append(el('span','박을 누르면 강세·보통·묵음이 바뀝니다.','settings-help'),grid);
   if(paging.pages>1){const row=el('div',undefined,'settings-beat-pages');for(const [delta,text]of [[-1,'이전 박'],[1,'다음 박']]){const b=el('button',text);b.type='button';b.disabled=delta<0?paging.index===0:paging.index===paging.pages-1;b.onclick=()=>{beatSelection.set(p,paging.index+delta);changed(true);};row.append(b);}row.append(el('span',(paging.index+1)+'/'+paging.pages));beats.append(row);}into.append(beats);
   const advanced=el('details',undefined,'settings-extra');advanced.append(el('summary','세분·직접 박자표'));const area=el('div',undefined,'plan-fields settings-fields');advanced.append(area);into.append(advanced);const before=into;into=area;
   const numerator=numeric('numerator','한 마디의 박 수',1,64,1,m);numerator.onchange=()=>{if(numerator.validity.valid&&numerator.value!==''){m.numerator=Number(numerator.value);changed(true);}};select('denominator','박자표의 기준 음표',root.VoiceLineMetronome.DENOMINATORS.map(n=>[n,n+'분음표']),m);select('unit','BPM 기준',[['beat','박자표 음표'],['quarter','4분음표'],['dottedQuarter','점4분음표']],m);select('subdivision','한 박의 세분',root.VoiceLineMetronome.SUBDIVISIONS.map(n=>[n,n+'분할']),m);
   const grouping=el('label','강세 묶음 · 예: 2+2+3'),groups=el('input'),apply=el('button','묶음 적용');groups.type='text';groups.maxLength=127;groups.setAttribute('aria-label','강세 묶음');apply.type='button';apply.onclick=()=>{const accents=root.VoiceLineMetronome.grouping(groups.value,m.numerator);if(!accents){changed(false,'강세 묶음의 합계가 한 마디의 박 수와 같아야 합니다.');return;}m.accents=accents;changed(true);};grouping.append(groups,apply);into.append(grouping);advanced.open=m.customEditor===true;into=before;
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
   select('sound','가이드 소리',Object.entries(guide.SOUNDS),g);volume('volume','가이드 음량 (%)',g,v=>bridge.previewSound?.({midi:g.root,sound:g.sound,volume:v}));
   if(!guide.PATTERNS[g.pattern].smooth)select('tolerance','음정 허용 범위',[[35,'정밀하게 · ±35cent'],[50,'기본 · ±50cent'],[75,'여유롭게 · ±75cent']],g,'목표 음정에서 허용하는 높이 차이입니다.');else into.append(el('p','연속 이동의 허용 범위는 ±110cent입니다.','settings-help'));
  }else if(mode==='metronome'){select('sound','클릭 소리',[['click','클릭'],['wood','우드'],['bell','벨']],m);volume('volume','메트로놈 음량 (%)',m);check('muted','메트로놈 음소거',m);}
  else if(mode==='warmupVoice')check('cues','단계 전환 안내음 켜기',w);
  else if(['piano','sustainVoice','earVoice','dynamicVoice','vibrato'].includes(mode))volume('pianoVolume','건반·기준음 음량 (%)',p,v=>bridge.previewSound?.({midi:mode==='vibrato'?p.vibratoRoot:tr.root,sound:'piano',volume:v}));
  if(mode==='dynamicVoice')volume('dynamicCueVolume','단계 전환 안내음 크기 (%)',tr,v=>bridge.previewCue?.(v));
  if(mode==='vibrato')into.append(el('p','측정 기준: 최근 3초 · 3~9Hz · 진폭 ±7~125cent. 자세한 기준은 기능 설명에서 확인합니다.','settings-help'));
  if(!withinRoutine&&['pitch','record','practice','sustainVoice','earVoice','dynamicVoice','vibrato'].includes(mode))choices('음정 감지 감도 · 앱 공통',[['standard','표준','주변 소리에 덜 반응'],['sensitive','민감','작은 목소리 감지'],['high','최대','아주 작은 소리 감지']],p.micSensitivity,v=>{p.micSensitivity=v;changed(true);});
  for(const key of Object.keys(groups))if(!groups[key].body.children.length){groups[key].details.remove();delete groups[key];}
  if(!groups.content&&groups.timing)groups.timing.details.open=true;
  const apply=withinRoutine?el('button','이 단계 설정 완료','settings-step-done'):null;
  if(apply){apply.type='button';apply.onclick=()=>{if(box.querySelector('input:invalid,select:invalid')){box.querySelector('input:invalid,select:invalid').reportValidity();return;}box.closest('.plan-step').open=false;bridge.notify?.('루틴 저장을 누르면 이 단계 설정이 보관됩니다.');};box.append(apply);}
  function update(){
   if(mode==='dynamicVoice'&&t.customStages){const total=round(t.stages.reduce((a,b)=>a+b,0));const input=box.querySelector('input[data-setting-key="seconds"]');if(input)input.value=String(total);}
   const d=model.describe(mode,t,p,withinRoutine,bridge.noteLabel),bad=box.querySelector('input:invalid,select:invalid');title.textContent=d.title;summary.textContent=d.compact;
   time.replaceChildren(el('span',d.totalText));if(d.voiceSeconds!==null&&d.voiceSeconds>0)time.append(document.createTextNode(' · '),el('span',(d.repeats===0?'한 '+d.repeatUnit+' 기준 ':'')+d.voiceLabel+' '+model.formatTime(d.voiceSeconds)));note.textContent=d.note;
   issue.hidden=!bad&&!d.issues.length;issue.textContent=bad?'입력값을 확인해 주세요. 유효한 값으로 설정 요약을 갱신합니다.':d.issues.join(' ');
   flow.replaceChildren();for(const [i,s]of d.phases.entries()){if(i)flow.append(el('span','→','settings-flow-arrow'));const b=el('button',undefined,'settings-phase');b.type='button';b.dataset.kind=s.kind;b.append(el('span',s.label),el('strong',model.formatTime(s.seconds)));b.onclick=()=>{const input=box.querySelector('[data-setting-key="'+s.key+'"]');if(!input)return;for(let parent=input.parentElement;parent&&parent!==box;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;input.focus({preventScroll:true});input.scrollIntoView({block:'nearest',behavior:'smooth'});};flow.append(b);}
   sequence.replaceChildren();if(d.notes.length){for(const [i,midi]of d.notes.entries()){if(i)sequence.append(el('span','→'));sequence.append(el('span',bridge.noteLabel(midi),'settings-note-label'));}}sequence.hidden=!d.notes.length;
   preview.hidden=!d.phases.length&&!d.notes.length&&!d.note;
   if(groups.content)groups.content.value.textContent=mode==='practice'?groupOf(model.patternKind(g.pattern))+' · '+bridge.noteLabel(g.root):d.compact;
   if(groups.timing)groups.timing.value.textContent=d.totalText+' · '+(d.repeats?d.repeats+d.repeatUnit:'계속 반복');
   if(groups.audio)groups.audio.value.textContent=d.audio;
   box.dataset.valid=String(!bad&&!d.issues.length);box.description=d;
  }
  box.update=update;update();return box;
 }
 function clamp(n,a,b){return Math.max(a,Math.min(b,n));}function round(n){return Math.round(n*10)/10;}
 root.VoiceLinePracticeSettingsUI={render};
})(globalThis);
