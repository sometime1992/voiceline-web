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
 // A standalone "3초" must not consume the beginning of "3초 뒤 시작".
 // Exact labels still use the catalog; composed messages translate their
 // contextual suffix first and format the number only once.
 const keys=Object.keys(catalog).filter(k=>k.length>1&&!k.startsWith('· ')&&k!=='초 전'&&!/^[-−]?\d+(?:\.\d+)?(?:초|회|세트|개)$/.test(k)).sort((a,b)=>b.length-a.length);
 const matcher=new RegExp(keys.map(escape).join('|'),'g');
 const sentences=new RegExp(keys.filter(k=>k.length>=30&&!k.startsWith('개까지')).map(escape).join('|'),'g');
 const solfege={'도':'Do','레':'Re','미':'Mi','파':'Fa','솔':'Sol','라':'La','시':'Ti'};
 let language='ko',observer=null;const cache=new Map();
 const counted=(n,one,many=one+'s')=>n+' '+(Number(n)===1?one:many);
 function vowelMessages(text){
  return text
   .replace(/편안하게 숨을 고르고 다음 「(.+?)」를 준비하세요/g,(_,v)=>'Breathe comfortably and prepare the next vowel: '+translate(v,'en'))
   .replace(/다음: 「(.+?)」를 약하게 시작/g,(_,v)=>'Next: start '+translate(v,'en')+' softly')
   .replace(/발성을 쉬고 다음 「(.+?)」를 준비하세요/g,(_,v)=>'Rest your voice and prepare the next vowel: '+translate(v,'en'))
   .replace(/「(.+?)」를 약하게 유지 · 이 모음의 기준 잡는 중/g,(_,v)=>'Hold '+translate(v,'en')+' softly · Calibrating this vowel')
   .replace(/「(.+?)」의 약한 기준 부족 · 다시 연습해 주세요/g,(_,v)=>'Insufficient soft reference for '+translate(v,'en')+' · Try again')
   .replace(/「(.+?)」를 유지하며 가로선마다 목표 음을 하나씩 맞추세요\./g,(_,v)=>'Keep singing '+translate(v,'en')+' and match each horizontal target line.')
   .replace(/숨을 편안하게 쉬세요 · 다음은 「(.+?)」 음계 왕복입니다\./g,(_,v)=>'Breathe comfortably · Next: sing the scale up and down on '+translate(v,'en'))
   .replace(/숨을 들이쉬세요 · 다음 「(.+?)」/g,(_,v)=>'Breathe in · Next vowel: '+translate(v,'en'));
 }
 function composed(text){
  return text
   .replace(/리듬은 최대 (\d+)개까지 저장합니다\. 사용하지 않는 리듬을 삭제해 주세요\./g,(_,n)=>'You can save up to '+n+' rhythms. Delete an unused rhythm to save another.')
   .replace(/총 (\d+)회 반복합니다\./g,(_,n)=>'Repeat '+counted(n,'time')+'.')
   .replace(/완료한 (.+?)의 결과를 저장합니다\./g,(_,value)=>'Results for the completed '+translate(value,'en')+' will be saved.')
   .replace(/한 회차 완료! (.+?)를 준비합니다\./g,(_,value)=>'Round complete! Get ready for '+translate(value,'en')+'.')
   .replace(/(\d+)시간/g,'$1 h')
   .replace(/(-?\d+)옥 · (C(-?\d+)[–-]B-?\d+)/g,(_,koreanOctave,range,octave)=>'Octave '+octave+' · '+range)
   .replace(/([A-G][♯♭#b]?-?\d+\s*·\s*-?\d+옥\s*[도레미파솔라시][♯♭]?)부터/g,(_,note)=>'from '+translate(note,'en'))
   .replace(/(\d+(?:\.\d+)?)초 뒤 발성 시작/g,'Singing starts in $1 s')
   .replace(/(\d+(?:\.\d+)?)초 뒤 발성/g,'Sing in $1 s')
   .replace(/(\d+(?:\.\d+)?)초 뒤 시작/g,'Start in $1 s')
   .replace(/(\d+(?:\.\d+)?)초 (?:후|뒤)/g,'in $1 s')
   .replace(/(\d+(?:\.\d+)?)초 전(?![가-힣])/g,'$1 s ago')
   .replace(/(\d+(?:\.\d+)?)초 준비 후 민트색 건반을 따라 부르세요\./g,'After $1 s, sing with the mint key.')
   .replace(/(\d+(?:\.\d+)?)초 준비(?! 후)/g,'$1 s preparation')
   .replace(/(\d+)\/(\d+|∞)단계/g,'Step $1/$2')
   .replace(/(\d+)단계 위로 이동/g,'Move step $1 up')
   .replace(/(\d+)단계 아래로 이동/g,'Move step $1 down')
   .replace(/(\d+)단계 관리/g,'Manage step $1')
   .replace(/(\d+)단계 삭제/g,'Delete step $1')
   .replace(/(\d+)단계를 삭제했습니다\./g,'Step $1 deleted.')
   .replace(/(\d+)단계 추가/g,'Add step $1')
   .replace(/(\d+)단계/g,'Step $1')
   .replace(/(\d+)회차/g,'Round $1')
   .replace(/(\d+)회 결과/g,(_,n)=>counted(n,'round result'))
   .replace(/(\d+)개 연습 단계 완료/g,(_,n)=>counted(n,'exercise step')+' completed')
   .replace(/구간별 발성 부족 (\d+)곳/g,(_,n)=>'Insufficient voice coverage in '+counted(n,'section'))
   .replace(/더 연습할 음 /g,'Notes to practice: ')
   .replace(/더 연습할 구간 /g,'Sections to practice: ')
   .replace(/(\d+)음 청음/g,(_,n)=>'Ear training · '+counted(n,'note'))
   .replace(/음정 (\d+)개 \/ 최소 (\d+)개/g,'Pitch samples $1 / at least $2 samples')
   .replace(/일치율 (\d+)개 \/ 최소 (\d+)개/g,'Pitch samples $1 / at least $2 samples')
   .replace(/(\d+)(세트|회) 계획/g,(_,n,unit)=>counted(n,unit==='세트'?'set':'rep')+' planned')
   .replace(/(\d+)세트 · 5모음씩/g,(_,n)=>counted(n,'set')+' · 5 vowels each')
   .replace(/(\d+)세트·(\d+)모음 완료/g,(_,sets,vowels)=>counted(sets,'set')+' · '+counted(vowels,'vowel')+' completed')
   .replace(/(^| )외 (\d+)곳/g,(_,before,n)=>before+'and '+counted(n,'more section'))
   .replace(/(\d+)구간/g,'Section $1')
   .replace(/(\d+)번째(?=\s|$)/g,'Position $1')
   .replace(/한 (회|세트) 기준/g,(_,unit)=>'Per '+(unit==='회'?'repetition':'set'))
   .replace(/한 마디 (?=\d)/g,'Bar length ')
   .replace(/(?:전체|총) (?=\d)/g,'Total ');
 }
 function translate(value,lang=language){
  const text=String(value??'');if(lang!=='en'||!korean.test(text))return text;
  if(cache.has(text))return cache.get(text);
  const clean=normalize(text);let output;
  if(Object.hasOwn(catalog,clean))output=catalog[clean];
  else if(/^(\d+)세트 수행 · 안내형 워밍업$/.test(clean)){const count=Number(clean.match(/^\d+/)[0]);output=count+' '+(count===1?'set':'sets')+' completed · Guided warm-up';}
  else{
   const protectedText=[];
   const replacement=(key,offset,input)=>{
    if(/^\d/.test(key)&&/[\d.]/.test(input[offset-1]||''))return key;
    const value=catalog[key];
    return (/^[가-힣]/.test(key)&&/[\d∞]/.test(input[offset-1]||'')&&/^[A-Za-z]/.test(value)?' ':'')+value;
   };
   // Preserve complete help sentences before formatting variable fragments.
   // Otherwise changing a duration inside a known sentence loses its match.
   const prepared=vowelMessages(clean).replace(sentences,(key,offset,input)=>{
    const value=replacement(key,offset,input);if(value===key)return key;
    protectedText.push(value);return '\uE000'+(protectedText.length-1)+'\uE001';
   });
   output=composed(prepared).replace(/음정 측정 (\d+)개 \/ 최소 (\d+)개/g,'Pitch samples $1 / at least $2 samples')
    .replace(/([A-G][♯♭#b]?-?\d+)\s*·\s*-?\d+옥\s*([도레미파솔라시])([♯♭]?)/g,(_,note,s,acc)=>note+' · '+solfege[s]+acc)
    .replace(/(\d+)번째\s+(?=[A-G][♯♭#b]?-?\d)/g,'Note $1 ').replace(/(\d+)마디째/g,'Bar $1')
    .replace(matcher,replacement)
    .replace(/\b(1|2|4|8|16|32|64)(?:분음표|-note)/g,(_,n)=>({'1':'Whole','2':'Half','4':'Quarter','8':'Eighth','16':'Sixteenth','32':'Thirty-second','64':'Sixty-fourth'})[n]+' note')
    .replace(/(-?\d+)옥\s*([도레미파솔라시])([♯♭]?)/g,(_,oct,s,acc)=>solfege[s]+acc+' (octave '+(Number(oct)+2)+')')
    .replace(/(\d+)번째\s*음/g,'Note $1').replace(/(\d+)번째\s*청음/g,'Ear-training note $1')
    .replace(/(\d+(?:\.\d+)?)초/g,'$1 s').replace(/(\d+)세트/g,(_,n)=>counted(n,'set')).replace(/(\d+)회/g,(_,n)=>counted(n,'rep'))
    .replace(/∞회/g,'∞ reps').replace(/(\d+)개/g,'$1').replace(/(\d+)박/g,'Beat $1').replace(/(\d+)분/g,'$1 min').replace(/(\d+)음/g,(_,n)=>counted(n,'note')).replace(/(\d+)곳/g,(_,n)=>counted(n,'section'));
   // Single-syllable labels are only replaced as separate words; never inside
   // an unknown phrase or a name. Vowels use AH / EH / EE / OH / OO.
   output=output.replace(/(^|[\s·→(「])([아에이오우도레미파솔라시초음약중강회분박])(?=$|[\s·→)%」])/g,
    (_,before,word)=>before+(catalog[word]??word));
   output=output.replace(/\uE000(\d+)\uE001/g,(_,index)=>protectedText[Number(index)]);
  }
  // Keep composed numeric labels readable without changing scientific notes.
  output=output.replace(/(\d)(Hz|cent|percent|semitones)\b/g,'$1 $2').replace(/\b1 (sets|reps|notes|sections|semitones)\b/g,(_,word)=>'1 '+word.slice(0,-1)).replace(/「/g,'“').replace(/」/g,'”').replace(/ +([.,])/g,'$1');
  const prefix=text.match(/^\s*/)[0],suffix=text.match(/\s*$/)[0];output=prefix+output+suffix;
  if(cache.size>=2000)cache.clear();cache.set(text,output);return output;
 }
 const ignored=e=>!e||Boolean(e.closest('script,style,textarea,[data-i18n-ignore],[translate="no"]'));
 function display(value,kind,lang=language){
  const text=String(value??'');if(lang!=='en')return text;
  if(kind==='solfege'){
   const match=text.match(/^(-?\d+)옥\s*([도레미파솔라시])([♯#♭]?)$/);
   if(match)return solfege[match[2]]+match[3]; // The adjacent C4 label already gives the octave.
  }
  if(kind==='range'){
   const match=text.match(/^(-?\d+)옥\s*([도레미파솔라시])([♯#♭]?)\s*[–~]\s*(-?\d+)옥\s*([도레미파솔라시])([♯#♭]?)$/);
   const west={'도':'C','레':'D','미':'E','파':'F','솔':'G','라':'A','시':'B'};
   if(match)return west[match[2]]+match[3]+(Number(match[1])+2)+' – '+west[match[5]]+match[6]+(Number(match[4])+2);
  }
  return translate(text,lang);
 }
 function localizeText(node){
  if(ignored(node.parentElement))return;
  const previous=sources.get(node),current=node.nodeValue;
  const source=previous&&current===previous.output?previous.source:current;
  if(!korean.test(source)&&!previous)return;
  const parent=node.parentElement,kind=parent.matches('.key-note-korean,#noteKorean')?'solfege':parent.id==='octaveLabel'?'range':null;
  const output=display(source,kind);sources.set(node,{source,output});if(current!==output)node.nodeValue=output;
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
 return {KEY,t:translate,display,setLanguage:apply,get language(){return language;},locale:()=>language==='en'?'en-US':'ko-KR',render,originalText};
});
