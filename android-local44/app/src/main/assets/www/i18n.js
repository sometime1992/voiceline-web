'use strict';
// Localize presentation only: exercise models, IDs, user input and saved records
// keep their original values. Keep source text so switching back is lossless.
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./i18n-en.js'));
 else root.VoiceLineI18n=factory(root.VoiceLineEnglish,root);
})(globalThis,(catalog,host)=>{
 const KEY='voiceline-language-v1',korean=/[가-힣]/,sources=new WeakMap(),attributes=new WeakMap();
 const normalize=s=>String(s).replace(/\s+/g,' ').trim();
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const keys=Object.keys(catalog).filter(k=>k.length>1).sort((a,b)=>b.length-a.length);
 const matcher=new RegExp(keys.map(escape).join('|'),'g');
 const solfege={'도':'Do','레':'Re','미':'Mi','파':'Fa','솔':'Sol','라':'La','시':'Ti'};
 let language='ko',observer=null;const cache=new Map();
 function translate(value,lang=language){
  const text=String(value??'');if(lang!=='en'||!korean.test(text))return text;
  if(cache.has(text))return cache.get(text);
  const clean=normalize(text);let output;
  if(Object.hasOwn(catalog,clean))output=catalog[clean];
  else{
   const notes=clean.replace(/([A-G][♯♭#b]?-?\d+)\s*·\s*-?\d+옥\s*([도레미파솔라시])([♯♭]?)/g,(_,note,s,acc)=>note+' · '+solfege[s]+acc);
   if(notes!==clean)output=translate(notes,'en');
   else if(clean.includes(' · '))output=clean.split(' · ').map(part=>translate(part,'en')).join(' · ');
   else output=clean.replace(/^전체\s+(?=\d)/,'Total ').replace(/(-?\d+)옥\s*([도레미파솔라시])([♯♭]?)/g,(_,oct,s,acc)=>solfege[s]+acc+' (octave '+(Number(oct)+2)+')')
    .replace(/(\d+)번째\s*음/g,'Note $1').replace(/(\d+)번째\s*청음/g,'Ear-training note $1')
    .replace(/(\d+)단계/g,'Step $1').replace(/(\d+)회차/g,'Round $1')
    .replace(matcher,key=>catalog[key])
    .replace(/(\d+(?:\.\d+)?)초/g,'$1 s').replace(/(\d+)세트/g,'$1 sets').replace(/(\d+)회/g,'$1 reps')
    .replace(/(\d+)개/g,'$1').replace(/(\d+)박/g,'Beat $1').replace(/(\d+)분/g,'$1 min');
   // Single-syllable labels are only replaced as separate words; never inside
   // an unknown phrase or a name. Vowels use AH / EH / EE / OH / OO.
   output=output.replace(/(^|[\s·→(])([아에이오우도레미파솔라시초음약중강회분박])(?=$|[\s·→)%])/g,
    (_,before,word)=>before+(catalog[word]??word));
  }
  const prefix=text.match(/^\s*/)[0],suffix=text.match(/\s*$/)[0];output=prefix+output+suffix;
  if(cache.size>=2000)cache.clear();cache.set(text,output);return output;
 }
 const ignored=e=>!e||Boolean(e.closest('script,style,textarea,[data-i18n-ignore],[translate="no"]'));
 function localizeText(node){
  if(ignored(node.parentElement))return;
  const previous=sources.get(node),current=node.nodeValue;
  const source=previous&&current===previous.output?previous.source:current;
  if(!korean.test(source)&&!previous)return;
  const output=translate(source);sources.set(node,{source,output});if(current!==output)node.nodeValue=output;
 }
 const attrs=['aria-label','aria-valuetext','title','placeholder','alt'];
 function localizeAttributes(element){
  if(ignored(element))return;let record=attributes.get(element);if(!record){record={};attributes.set(element,record);}
  for(const name of attrs){
   const current=element.getAttribute(name);if(current===null){delete record[name];continue;}
   const previous=record[name],source=previous&&current===previous.output?previous.source:current;
   if(!korean.test(source)&&!previous)continue;const output=translate(source);record[name]={source,output};if(current!==output)element.setAttribute(name,output);
  }
 }
 function render(node=host?.document?.body){
  if(!node)return;if(node.nodeType===3){localizeText(node);return;}
  if(node.nodeType!==1||ignored(node))return;
  localizeAttributes(node);
  for(const child of node.childNodes)render(child);
 }
 function originalText(node){
  if(!node)return '';if(node.nodeType===3){const v=sources.get(node);return v&&node.nodeValue===v.output?v.source:node.nodeValue;}
  return [...node.childNodes].map(originalText).join('');
 }
 function nativeSync(){try{host?.VoiceLinePublicLinks?.setLanguage?.(language);}catch(_){} }
 function apply(lang,persist=true){
  if(!['ko','en'].includes(lang))return false;language=lang;let saved=true;
  if(persist)try{host?.localStorage.setItem(KEY,lang);}catch(_){saved=false;}
  if(host?.document){host.document.documentElement.lang=language;const select=host.document.getElementById('appLanguage');if(select)select.value=language;render();nativeSync();host.dispatchEvent(new host.CustomEvent('voiceline-language-change',{detail:{language}}));}
  return saved;
 }
 function mount(){
  try{const saved=host.localStorage.getItem(KEY);if(['ko','en'].includes(saved))language=saved;}catch(_){}
  host.document.documentElement.lang=language;
  const select=host.document.getElementById('appLanguage');if(select){select.value=language;select.addEventListener('change',()=>{const saved=apply(select.value);const status=host.document.getElementById('languageStatus');if(status)status.textContent=translate(saved?'언어가 변경되었습니다.':'언어를 저장하지 못했습니다. 앱을 다시 열면 이전 언어로 표시될 수 있습니다.');});}
  render();nativeSync();
  observer=new host.MutationObserver(records=>{
   if(language==='ko')return;
   for(const record of records){
    if(record.type==='characterData')localizeText(record.target);
    else if(record.type==='attributes')localizeAttributes(record.target);
    else for(const node of record.addedNodes)render(node);
   }
  });
  observer.observe(host.document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attrs});
 }
 if(host?.document){if(host.document.readyState==='loading')host.document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();}
 return {KEY,t:translate,setLanguage:apply,get language(){return language;},locale:()=>language==='en'?'en-US':'ko-KR',render,originalText};
});
