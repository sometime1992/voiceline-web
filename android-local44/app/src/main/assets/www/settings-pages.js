'use strict';
(function(root){
 let serial=0;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const cleanLabel=label=>label.replace(/ \((?:초|%|BPM)\)$/,'');
 function heading(node,label,input,help,onHelp){
  const row=el('div',undefined,'settings-label'),text=el(input?'label':'span',cleanLabel(label));if(input){input.id='settings-control-'+(++serial);text.htmlFor=input.id;input.setAttribute('aria-label',label);}row.append(text);
  if(help){input?.setAttribute('aria-description',help);const b=el('button','ⓘ','settings-help-open');b.type='button';b.setAttribute('aria-label',cleanLabel(label)+' 설명');b.onclick=()=>onHelp?.(cleanLabel(label),help);row.append(b);}node.append(row);return row;
 }
 function selectField({key,label,value,options,onChange,help='',onHelp}){
  const node=el('div',undefined,'settings-field settings-unit'),input=el('select'),face=el('span',undefined,'settings-select-value'),wrap=el('div',undefined,'settings-select-wrap'),row=el('div',undefined,'settings-control-row');input.required=true;input.dataset.settingKey=key;
  for(const [v,text]of options){const o=el('option',text);o.value=String(v);input.append(o);}input.value=String(value);face.setAttribute('aria-hidden','true');const sync=()=>face.textContent=input.selectedOptions[0]?.textContent||'';input.syncControl=sync;
  input.onchange=()=>{sync();onChange?.(options.find(([v])=>String(v)===input.value)?.[0]??input.value,input);};heading(node,label,input,help,onHelp);wrap.append(face,input);row.append(wrap);node.append(row);sync();
  return {node,input,value:()=>input.selectedOptions[0]?.textContent||'',activate:()=>{},disabled:()=>input.disabled};
 }
 function numberField({key,label,value,min,max,step=.1,onInput,help='',onHelp,presets}){
  const node=el('div',undefined,'settings-field settings-unit'),input=el('input'),error=el('small',undefined,'settings-field-error'),row=el('div',undefined,'settings-stepper'),readout=el('button',undefined,'settings-number-value'),output=el('strong'),unit=el('span');
  input.type='number';input.min=min;input.max=max;input.step=step;input.required=true;input.inputMode=step===1?'numeric':'decimal';input.value=String(value);input.dataset.settingKey=key;input.className='settings-number-input';input.hidden=true;
  const unitText=/\(초\)$/.test(label)?'초':/\(BPM\)$/.test(label)?' BPM':/세트/.test(label)?'세트':/횟수/.test(label)?'회':/박 수/.test(label)?'박':'';unit.textContent=unitText;
  readout.type='button';readout.setAttribute('aria-label',cleanLabel(label)+' 직접 입력');readout.append(output,unit);error.hidden=true;error.setAttribute('role','alert');
  const valid=()=>input.value!==''&&input.validity.valid;
  const sync=()=>{output.textContent=input.value||'입력';minus.disabled=input.disabled||Number(input.value)<=min;plus.disabled=input.disabled||Number(input.value)>=max;if(chips)for(const b of chips.children)b.setAttribute('aria-pressed',String(Number(b.dataset.value)===Number(input.value)&&input.value!==''));};
  function check(){const ok=valid();error.hidden=ok;error.textContent=ok?'':min+'~'+max+' '+unitText+' · '+(step===1?'정수':'0.1 단위');return ok;}
  const activate=()=>{input.hidden=false;readout.hidden=true;input.focus({preventScroll:true});};readout.onclick=activate;
  function change(delta){const old=Number(input.value),next=Math.min(max,Math.max(min,Math.round(((Number.isFinite(old)&&input.value!==''?old:Number(value))+delta)*10)/10));input.value=String(next);input.oninput();input.onchange?.();}
  const minus=el('button','−','settings-number-minus'),plus=el('button','+','settings-number-plus');minus.type=plus.type='button';minus.setAttribute('aria-label',cleanLabel(label)+' 줄이기');plus.setAttribute('aria-label',cleanLabel(label)+' 늘리기');minus.onclick=()=>change(-step);plus.onclick=()=>change(step);
  let chips=null;if(presets){chips=el('div',undefined,'settings-presets');for(const n of presets.filter(n=>n>=min&&n<=max)){const b=el('button',n+unitText);b.type='button';b.dataset.value=n;b.onclick=()=>{input.value=String(n);input.oninput();input.onchange?.();};chips.append(b);}}
  input.oninput=()=>{check();sync();onInput?.(input,valid());};input.onblur=()=>{if(input._settingsReflow)return;if(check()){input.hidden=true;readout.hidden=false;}sync();};input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();input.blur();}};input.syncControl=sync;
  heading(node,label,input,help,onHelp);const middle=el('div',undefined,'settings-number-middle');middle.append(readout,input);row.append(minus,middle,plus);node.append(row);if(chips)node.append(chips);node.append(error);sync();
  return {node,input,value:()=>input.value+unitText,activate,disabled:()=>input.disabled};
 }
 function textField({key,label,value='',maxLength=127,onInput,help='',onHelp,required=false}){
  const node=el('div',undefined,'settings-field settings-unit'),input=el('input'),row=el('div',undefined,'settings-control-row');input.type='text';input.value=value;input.maxLength=maxLength;input.required=required;input.dataset.settingKey=key;input.oninput=()=>onInput?.(input,input.validity.valid);heading(node,label,input,help,onHelp);row.append(input);node.append(row);return {node,input,value:()=>input.value,activate:()=>{},disabled:()=>input.disabled};
 }
 function create({box,units,description,onState,integrated=false,title='상세 설정'}){
  let view='menu',pages=[],current=0,menuIndex=0,menuCapacity=6,summaryIndex=0,summaryPages=[[]],summaryKind='overview',summaryRows=[],summaryMeta='',summaryEmpty='',fitting=false,lastMeasure='',epoch=0;
  const menu=el('div',undefined,'settings-item-menu'),panels=el('div',undefined,'settings-page-panels'),summary=el('section',undefined,'settings-overview'),meta=el('p',undefined,'settings-duration'),rows=el('dl',undefined,'settings-summary-rows'),empty=el('p',undefined,'settings-empty'),inactive=el('div');
  menu.setAttribute('role','group');menu.setAttribute('aria-label','수정할 항목');summary.setAttribute('aria-label','현재 연습 설정');inactive.hidden=true;summary.append(meta,rows,empty);box.replaceChildren(menu,panels,summary,inactive);box.dataset.presentation=integrated?'integrated':'focus';
  const topics=[];for(const u of units){u.index=units.indexOf(u);u.id=String(u.key)+':'+u.label;u.node.dataset.topic=u.topic.id;u.node.dataset.unitId=u.id;let t=topics.find(t=>t.id===u.topic.id);if(!t){t={...u.topic,units:[]};topics.push(t);}t.units.push(u);}
  function activeUnits(t){return t.units.filter(u=>!u.disabled?.());}
  function state(){
   const n=view==='edit'?pages.length:view==='menu'?Math.max(1,Math.ceil(topics.filter(t=>activeUnits(t).length).length/menuCapacity)):summaryPages.length;
   const i=view==='edit'?current:view==='menu'?menuIndex:summaryIndex,p=pages[current];
   return {view,kind:summaryKind,key:p?.key,anchor:p?.units[0]?.id,title:view==='edit'?(integrated?title:(box.dataset.compact==='true'&&p?.units.length===1)?p.units[0].shortLabel:p?.title):view==='menu'?'수정할 항목':'현재 설정',index:i,count:n,previous:i>0,next:i<n-1,unitCount:view==='edit'?p?.units.length:0};
  }
  function emit(action=false){onState?.({...state(),action});}
  function topicValue(t){return activeUnits(t).map(u=>u.value()).filter(Boolean).join(' · ');}
  const entries=new Map();for(const t of topics){const b=el('button',undefined,'settings-menu-entry');b.type='button';b.id='settings-menu-'+(++serial);b.dataset.topic=t.id;b.setAttribute('aria-label',t.title+' 설정');const name=el('strong',t.title),value=el('span');b.append(name,value);b.onclick=()=>{if(t.open){t.open();return;}const p=pages.find(p=>p.topic===t.id);if(p)showPage(p.key,true);};let node=b;if(t.actions){node=el('div',undefined,'settings-menu-card');node.dataset.topic=t.id;node.append(b,t.actions());}menu.append(node);entries.set(t.id,{node,button:b,value});}
  function refreshValues(){epoch++;for(const t of topics){const e=entries.get(t.id);e.value.textContent=topicValue(t);e.button.setAttribute('aria-label',t.title+' 설정 · '+topicValue(t));e.node.hidden=e.button.hidden=!activeUnits(t).length;}if(view==='summary')paintSummary();}
  function rebuild(parts,anchor){
   const focus=box.contains(document.activeElement)?document.activeElement:null;const previous=pages[current]?.units[0]?.id;if(focus)focus._settingsReflow=true;
   pages=parts.map(part=>{const node=el('section',undefined,'settings-section settings-focus-page'),key=part.topic+'-'+part.units[0].index;node.id='settings-page-'+(++serial);node.dataset.settingsGroup=part.topic;node.dataset.pageKey=key;node.dataset.count=String(part.units.length);node.setAttribute('aria-label',part.title+' 편집 페이지');if(integrated){node.classList.add('settings-integrated-page');for(const t of topics){const active=part.units.filter(u=>u.topic.id===t.id);if(!active.length)continue;const card=el('section',undefined,'settings-topic-card');card.dataset.settingsGroup=t.id;card.dataset.fields=active.length;card.setAttribute('aria-label',t.title+' 설정 영역');const h=el('h3',t.title,'settings-topic-title'),fields=el('div',undefined,'settings-topic-fields');card.append(h,fields);for(const u of active){const label=u.node.querySelector('.settings-label label');if(label)label.textContent=u.shortLabel||label.textContent;fields.append(u.node);}node.append(card);}}else for(const u of part.units)node.append(u.node);node.hidden=true;return {...part,key,node};});
   panels.replaceChildren(...pages.map(p=>p.node));for(const t of topics)for(const u of t.units)if(u.disabled?.())inactive.append(u.node);
   const id=anchor||previous;current=Math.max(0,pages.findIndex(p=>p.units.some(u=>u.id===id)));paint();if(focus?.isConnected)focus.focus({preventScroll:true});if(focus)delete focus._settingsReflow;
  }
  function baseParts(){if(integrated)return [{topic:'all',title,units:topics.flatMap(activeUnits)}];return topics.flatMap(t=>{const a=activeUnits(t),out=[];for(let i=0;i<a.length;i+=2)out.push({topic:t.id,title:t.title,units:a.slice(i,i+2)});return out;});}
  function signature(parts){return parts.map(p=>p.units.map(u=>u.id).join('|')).join('\n');}
  function heightOf(node){const old={hidden:node.hidden,position:node.style.position,visibility:node.style.visibility,width:node.style.width};node.hidden=false;node.style.position='absolute';node.style.visibility='hidden';node.style.width=box.clientWidth+'px';const h=node.getBoundingClientRect().height;node.hidden=old.hidden;Object.assign(node.style,{position:old.position,visibility:old.visibility,width:old.width});return h;}
  function fit(height){
   if(fitting||!box.isConnected||height<=0)return;const measure=[Math.round(height),box.clientWidth,getComputedStyle(box).fontSize,view,epoch,box.querySelectorAll('input:invalid').length].join(':');if(measure===lastMeasure)return;lastMeasure=measure;fitting=true;
   try{
    box.dataset.compact=String(!integrated&&height<185);if(view==='edit'&&!integrated){const focused=units.find(u=>u.node.contains(document.activeElement)),anchor=focused?.id||pages[current]?.units[0]?.id;let parts=baseParts();
    if(signature(parts)!==signature(pages))rebuild(parts,anchor);
    const split=[];for(const p of pages){if(p.units.length>1&&heightOf(p.node)>height+1)for(const u of p.units)split.push({topic:p.topic,title:p.title,units:[u]});else split.push({topic:p.topic,title:p.title,units:p.units});}
    if(signature(split)!==signature(pages))rebuild(split,anchor);}
    if(view==='menu')fitMenu(height);if(view==='summary')fitSummary(height);paint();emit(false);if(integrated&&view==='edit'&&box.contains(document.activeElement)&&document.activeElement.tagName==='INPUT')document.activeElement.scrollIntoView({block:'nearest'});
   }finally{fitting=false;}
  }
  function fitMenu(height){
   const all=topics.filter(t=>activeUnits(t).length);for(const t of all){const e=entries.get(t.id);e.node.hidden=e.button.hidden=false;}
   const cols=getComputedStyle(menu).gridTemplateColumns.split(' ').filter(Boolean).length||1,max=Math.max(1,...all.map(t=>entries.get(t.id).node.getBoundingClientRect().height));
   menuCapacity=Math.max(1,Math.floor((height+8)/(max+8)))*cols;menuIndex=Math.min(menuIndex,Math.max(0,Math.ceil(all.length/menuCapacity)-1));paintMenu();
  }
  function paintMenu(){const all=topics.filter(t=>activeUnits(t).length);all.forEach((t,i)=>{const e=entries.get(t.id),b=e.button;e.node.hidden=b.hidden=i<menuIndex*menuCapacity||i>=(menuIndex+1)*menuCapacity;b.setAttribute('aria-current',String(t.id===pages[current]?.topic));});}
  function rowNode(row){const n=el('div',undefined,'settings-summary-row');n.dataset.summaryKey=row.key||row.label;n.append(el('dt',row.label),el('dd',row.value));return n;}
  function fitSummary(height){
   paintSummary(true);const available=Math.max(40,height-(meta.hidden?0:meta.getBoundingClientRect().height+10)),cols=getComputedStyle(rows).gridTemplateColumns.split(' ').filter(Boolean).length||1,nodes=[...rows.children],out=[];let bucket=[],used=0;
   for(let i=0;i<nodes.length;i+=cols){const line=nodes.slice(i,i+cols),h=Math.max(...line.map(n=>n.getBoundingClientRect().height));if(bucket.length&&used+h+6>available){out.push(bucket);bucket=[];used=0;}bucket.push(...summaryRows.slice(i,i+cols));used+=h+(bucket.length>cols?6:0);}
   if(bucket.length)out.push(bucket);summaryPages=out.length?out:[[]];summaryIndex=Math.min(summaryIndex,summaryPages.length-1);paintSummary();
  }
  function paintSummary(all=false){meta.textContent=summaryMeta;meta.hidden=!summaryMeta;empty.textContent=summaryEmpty;empty.hidden=summaryRows.length>0||!summaryEmpty;rows.replaceChildren(...(all?summaryRows:summaryPages[summaryIndex]||[]).map(rowNode));}
  function paint(){
   box.dataset.view=view;menu.hidden=view!=='menu';panels.hidden=view!=='edit';summary.hidden=view!=='summary';
   for(const [i,p]of pages.entries())p.node.hidden=view!=='edit'||i!==current;
   if(view==='menu')paintMenu();if(view==='summary')paintSummary();
  }
  function showPage(key,notify=true){current=Math.max(0,pages.findIndex(p=>p.key===key||p.units.some(u=>u.id===key||u.key===key)));view='edit';paint();emit(notify);return pages[current]?.key;}
  function showMenu(notify=true,topicId=null){if(integrated)return showPage('all',notify);if(topicId){const index=topics.filter(t=>activeUnits(t).length).findIndex(t=>t.id===topicId);if(index>=0){menuIndex=Math.floor(index/menuCapacity);current=Math.max(0,pages.findIndex(p=>p.topic===topicId));}}view='menu';refreshValues();paint();emit(notify);}
  function showSummary({kind='overview',label='현재 연습 설정',rows:nextRows=[],meta:nextMeta='',empty:emptyText=''}={}){view='summary';epoch++;summaryKind=kind;summaryRows=nextRows;summaryMeta=nextMeta;summaryEmpty=emptyText;summaryPages=[nextRows];summaryIndex=0;summary.setAttribute('aria-label',label);paint();emit(false);}
  function move(delta){if(view==='edit'){current=Math.max(0,Math.min(pages.length-1,current+delta));}else if(view==='menu'){const count=Math.ceil(topics.filter(t=>activeUnits(t).length).length/menuCapacity);menuIndex=Math.max(0,Math.min(count-1,menuIndex+delta));}else summaryIndex=Math.max(0,Math.min(summaryPages.length-1,summaryIndex+delta));paint();emit(true);}
  function showControl(node,focus=true){const unit=units.find(u=>u.node.contains(node));if(!unit)return;showPage(unit.id);if(focus){unit.activate?.(node);node.focus({preventScroll:true});}if(integrated&&node.isConnected)requestAnimationFrame(()=>node.scrollIntoView({block:'nearest'}));return unit;}
  function rowsFromUnits(){return units.filter(u=>!u.disabled?.()&&!u.transient).map(u=>({key:u.id,label:u.label,value:String(u.value()??'')}));}
  rebuild(baseParts());paint();refreshValues();
  const api={fit,state,showPage,showMenu,showSummary,move,showControl,rows:rowsFromUnits,refresh:refreshValues,units,get pages(){return pages;},get description(){return description?.();}};
  return api;
 }
 root.VoiceLineSettingsPages={create,selectField,numberField,textField};
})(globalThis);
