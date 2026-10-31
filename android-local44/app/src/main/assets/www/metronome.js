'use strict';
/* Audio-clock metronome. Standalone: no microphone, network or practice log. */
(function(root){
 const DENOMINATORS=[1,2,4,8,16,32,64],SUBDIVISIONS=[1,2,3,4,6,8];
 const PRESETS=['2/2','3/2','4/2','2/4','3/4','4/4','5/4','6/4','7/4','3/8','5/8','6/8','7/8','9/8','12/8','15/8','5/16','7/16','11/16'];
 const KEY='voiceline-metronome-v1',PRESET_KEY='voiceline-metronome-presets-v1';
 const MAX_PULSE_RATE=50,MAX_PRESETS=24;
 const integer=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Math.round(Number(value)))):fallback;
 function defaults(n=4,d=4){
  return Array.from({length:n},(_,i)=>i===0||(d===8&&n>=6&&n%3===0&&i%3===0)?2:1);
 }
 function normalize(value={}){
  if(!value||typeof value!=='object')value={};
  const numerator=integer(value.numerator,1,64,4),denominator=DENOMINATORS.includes(Number(value.denominator))?Number(value.denominator):4;
  return {numerator,denominator,bpm:integer(value.bpm,20,300,80),
   unit:['beat','quarter','dottedQuarter'].includes(value.unit)?value.unit:'beat',
   subdivision:SUBDIVISIONS.includes(Number(value.subdivision))?Number(value.subdivision):1,
   volume:integer(value.volume,0,100,75),muted:value.muted===true,
   sound:['click','wood','bell'].includes(value.sound)?value.sound:'click',
   accents:Array.isArray(value.accents)&&value.accents.length===numerator?value.accents.map(v=>integer(v,0,2,1)):defaults(numerator,denominator)};
 }
 function beatSeconds(value){
  const s=normalize(value),quarterNotes=s.unit==='quarter'?1:s.unit==='dottedQuarter'?1.5:4/s.denominator;
  return 60/s.bpm*(4/s.denominator)/quarterNotes;
 }
 function timingIssue(value){
  const settings=normalize(value),rate=settings.subdivision/beatSeconds(settings);
  return rate>MAX_PULSE_RATE+1e-6?'선택한 조합의 세분 클릭이 너무 빠릅니다. BPM·기준 음표·세분을 조절해 주세요.':null;
 }
 function rhythmKey(value){const s=normalize(value);return JSON.stringify([s.numerator,s.denominator,s.unit,s.subdivision,s.accents]);}
 function soundProfile(style,accent){
  if(style==='wood')return {type:'triangle',hz:accent===2?980:accent===1?680:440,duration:.028};
  if(style==='bell')return {type:'sine',hz:accent===2?1800:accent===1?1320:880,duration:.075};
  return {type:'sine',hz:accent===2?1500:accent===1?1000:650,duration:.045};
 }
 function parsePresets(raw){
  try{
   const parsed=JSON.parse(raw||'[]');if(!Array.isArray(parsed))return [];
   const result=[],ids=new Set();
   for(const item of parsed){
    if(result.length>=MAX_PRESETS)break;
    if(!item||typeof item!=='object'||typeof item.id!=='string'||!/^[a-z0-9_-]{1,80}$/i.test(item.id)||ids.has(item.id)||typeof item.name!=='string')continue;
    const name=item.name.trim().slice(0,24),settings=normalize(item.settings);if(!name||timingIssue(settings))continue;
    ids.add(item.id);result.push({id:item.id,name,settings});
   }
   return result;
  }catch(_){return [];}
 }
 function grouping(text,numerator){
  if(!/^\s*\d+(?:\s*\+\s*\d+)*\s*$/.test(text))return null;
  const groups=text.split('+').map(Number);
  if(groups.some(n=>!Number.isInteger(n)||n<1||n>64)||groups.reduce((a,b)=>a+b,0)!==numerator)return null;
  const accents=Array(numerator).fill(1);let pos=0;
  for(const count of groups){accents[pos]=2;pos+=count;}return accents;
 }
 function beatPage(numerator,width,page=0){
  const count=integer(numerator,1,64,4);
  const size=Number.isFinite(width)&&width>0?Math.min(8,Math.max(1,Math.floor((width+6)/46))):8;
  const pages=Math.ceil(count/size),index=integer(page,0,pages-1,0),start=index*size;
  return {size,pages,index,start,end:Math.min(count,start+size)};
 }
 function bindRepeatButton(button,step,options={}){
  const setTimer=options.setTimer||((fn,ms)=>setTimeout(fn,ms)),clearTimer=options.clearTimer||(id=>clearTimeout(id));
  const allowed=options.allowed||(()=>true);let pointer=null,timer=0,suppressClick=false;
  function cancel(event){
   if(event&&event.pointerId!==pointer)return;
   clearTimer(timer);timer=0;const previous=pointer;pointer=null;
   if(previous!==null){try{button.releasePointerCapture?.(previous);}catch(_){}}
  }
  function repeat(){
   timer=0;if(pointer===null||button.disabled||!allowed()){cancel();return;}
   if(step()===false||button.disabled||pointer===null){cancel();return;}
   timer=setTimer(repeat,80);
  }
  button.onpointerdown=event=>{
   if(button.disabled||!allowed()||event.isPrimary===false||event.button!==undefined&&event.button!==0||pointer!==null)return;
   options.beforeStart?.();pointer=event.pointerId;suppressClick=true;event.preventDefault();
   button.focus?.({preventScroll:true});
   try{button.setPointerCapture?.(pointer);}catch(_){}
   if(step()===false||button.disabled||pointer===null){cancel();return;}timer=setTimer(repeat,400);
  };
  button.onpointerup=cancel;button.onpointercancel=cancel;button.onlostpointercapture=cancel;
  button.onpointerleave=cancel;button.onblur=()=>cancel();
  button.onpointermove=event=>{
   if(pointer!==event.pointerId)return;
   const rect=button.getBoundingClientRect?.();
   if(rect&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))cancel();
  };
  button.onclick=event=>{
   if(suppressClick&&event&&event.detail!==0){suppressClick=false;return;}
   suppressClick=false;if(!button.disabled&&allowed())step();
  };
  return {cancel};
 }
 class Scheduler {
  constructor(options={}){
   this.makeContext=options.makeContext||(()=>new (root.AudioContext||root.webkitAudioContext)());
   this.setTimer=options.setTimer||((fn,ms)=>setTimeout(fn,ms));this.clearTimer=options.clearTimer||(id=>clearTimeout(id));
   this.raf=options.raf||(fn=>requestAnimationFrame(fn));this.cancelRaf=options.cancelRaf||(id=>cancelAnimationFrame(id));
   this.onBeat=options.onBeat||(()=>{});this.onState=options.onState||(()=>{});this.onError=options.onError||(()=>{});
   this.settings=normalize(options.settings);this.nodes=new Set();this.visual=[];this.generation=0;this.running=false;this.starting=false;
  }
  async start(){
   if(this.running||this.starting)return;
   const token=++this.generation;this.starting=true;this.onState('starting');
   try{
    const issue=timingIssue(this.settings);if(issue)throw new RangeError(issue);
    if(!this.context||this.context.state==='closed'){this.context=this.makeContext();this.master=null;}
    const ctx=this.context;
    if(!this.master){this.master=ctx.createGain();this.master.connect(ctx.destination);}
    this.updateLevel(false);
    // Called directly from the user's tap, before any await or microphone prompt.
    await ctx.resume();
    if(token!==this.generation)return;
    if(ctx.state!=='running')throw Error('미디어 소리를 시작하지 못했습니다. 다시 시작해 주세요.');
    this.starting=false;this.running=true;this.index=0;this.nextTime=ctx.currentTime+.045;this.visual=[];
    ctx.onstatechange=()=>{if(this.running&&ctx.state!=='running'){this.stop();this.onError('오디오가 중단되었습니다. 다시 시작해 주세요.');}};
    this.onState('running');this.schedule();this.draw();
   }catch(error){if(token===this.generation){this.stop();this.onError(error.message||'메트로놈을 시작할 수 없습니다.');}}
  }
  stop(){
   this.generation++;this.running=false;this.starting=false;
   this.clearTimer(this.timer);this.cancelRaf(this.frame);this.timer=this.frame=0;
   for(const item of this.nodes){try{item.osc.stop();item.osc.disconnect();item.gain.disconnect();}catch(_){}}
   this.nodes.clear();this.visual=[];this.onState('stopped');
  }
  async toggle(){if(this.running||this.starting)this.stop();else await this.start();}
  updateLevel(smooth=true){
   if(!this.master||!this.context)return;
   const target=this.settings.muted?0:this.settings.volume/100,now=this.context.currentTime,param=this.master.gain;
   param.cancelScheduledValues?.(now);
   param.setValueAtTime(this.outputLevel??target,now);
   if(smooth)param.linearRampToValueAtTime(target,now+.025);else param.setValueAtTime(target,now);
   this.outputLevel=target;
  }
  configure(value){
   const next=normalize(value),issue=timingIssue(next);if(issue)throw new RangeError(issue);
   const previous=this.settings;
   if(rhythmKey(previous)===rhythmKey(next)){
    this.settings=next;if(previous.volume!==next.volume||previous.muted!==next.muted)this.updateLevel();
    if(this.running&&previous.bpm!==next.bpm){
     const oldStep=beatSeconds(previous)/previous.subdivision,newStep=beatSeconds(next)/next.subdivision;
     this.nextTime=Math.max(this.context.currentTime+.015,this.nextTime-oldStep+newStep);
    }
    return this.settings;
   }
   const resume=this.running||this.starting;this.stop();this.settings=next;this.updateLevel(false);
   if(resume)void this.start();return this.settings;
  }
  schedule(){
   if(!this.running)return;
   const ctx=this.context,s=this.settings,step=beatSeconds(s)/s.subdivision;
   if(this.nextTime<ctx.currentTime-.05){
    // Keep the phase, skip elapsed clicks. Never emit a burst after a stalled UI.
    const missed=Math.ceil((ctx.currentTime+.015-this.nextTime)/step);
    this.index+=missed;this.nextTime+=missed*step;
   }
   // Keep visual traffic bounded even when animation frames are suspended.
   while(this.visual.length>1&&this.visual[1].time<=ctx.currentTime)this.visual.shift();
   try{
    while(this.nextTime<ctx.currentTime+.12){
     const beat=Math.floor(this.index/s.subdivision)%s.numerator,sub=this.index%s.subdivision;
     const accent=s.accents[beat];
     if(accent>0)this.click(this.nextTime,sub===0?accent:0,step);
     this.visual.push({time:this.nextTime,beat,sub,bar:Math.floor(this.index/(s.numerator*s.subdivision))+1});
     this.nextTime+=step;this.index++;
    }
    this.timer=this.setTimer(()=>this.schedule(),25);
   }catch(error){this.stop();this.onError('메트로놈 재생 오류 · 다시 시작해 주세요.');}
  }
  click(time,accent,step){
   const ctx=this.context,osc=ctx.createOscillator(),gain=ctx.createGain();
   const profile=soundProfile(this.settings.sound,accent),duration=Math.min(profile.duration,step*.7),level=accent===2?.22:accent===1?.14:.055;
   osc.type=profile.type;osc.frequency.setValueAtTime(profile.hz,time);
   gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(level,time+Math.min(.002,duration/4));
   gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
   osc.connect(gain);gain.connect(this.master);
   const item={osc,gain};this.nodes.add(item);
   osc.onended=()=>{this.nodes.delete(item);osc.disconnect();gain.disconnect();};
   osc.start(time);osc.stop(time+duration+.002);
  }
  draw(){
   if(!this.running)return;
   let latest=null;while(this.visual.length&&this.visual[0].time<=this.context.currentTime)latest=this.visual.shift();
   if(latest)this.onBeat(latest);
   this.frame=this.raf(()=>this.draw());
  }
 }
 function mount(document,callbacks={}){
  const $=id=>document.getElementById(id);if(!$('metronomePanel'))return null;
  let settings;
  try{settings=normalize(JSON.parse(root.localStorage.getItem(KEY)||'{}'));}catch(_){settings=normalize();}
  if(timingIssue(settings))settings=normalize({...settings,unit:'beat',subdivision:1});
  let presets=[];try{presets=parsePresets(root.localStorage.getItem(PRESET_KEY));}catch(_){}
  let presetPage=0,lastAudibleVolume=settings.volume||75;
  let buttons=[],pageIndex=0,lastBeat=null,lastBar=null,pagePinned=false;
  const holds=[];function cancelHolds(){holds.forEach(hold=>hold.cancel());}
  const scheduler=new Scheduler({settings,
   onBeat:({beat,sub,bar})=>{
    if(lastBeat===beat&&lastBar===bar)return;
    lastBeat=beat;lastBar=bar;
    const page=currentPage();
    if(!pagePinned&&(beat<page.start||beat>=page.end)){pageIndex=Math.floor(beat/page.size);paintBeats();}
    buttons.forEach((button,index)=>button.classList.toggle('beat-active',index===beat));
    $('metroCount').textContent=String(beat+1);$('metroPosition').textContent=bar+'마디째';
   },
   onState:state=>{
    if(state==='stopped')cancelHolds();
    const playing=state==='running'||state==='starting';
    $('metroToggle').textContent=playing?'■ 메트로놈 끄기':'▶ 메트로놈 켜기';
    $('metroToggle').setAttribute('aria-pressed',String(playing));
    $('metroToggle').setAttribute('aria-label',playing?'메트로놈 끄기':'메트로놈 켜기');
    $('metroState').textContent=state==='starting'?'소리 준비 중':playing?'재생 중':'정지';
    if(state==='starting'){pagePinned=false;pageIndex=0;lastBeat=null;lastBar=null;paintBeats();}
    if(!playing){lastBeat=null;lastBar=null;buttons.forEach(b=>b.classList.remove('beat-active'));$('metroCount').textContent='—';$('metroPosition').textContent='켜기를 누르면 시작합니다';}
    callbacks.onState?.(state);
   },onError:message=>callbacks.onError?.(message)});
  function persist(){try{root.localStorage.setItem(KEY,JSON.stringify(settings));}catch(_){} }
  function currentPage(){
   const node=$('metroBeats'),width=node.getBoundingClientRect?.().width||node.clientWidth||0;
   return beatPage(settings.numerator,width,pageIndex);
  }
  function paintBeats(){
   const page=currentPage(),beats=$('metroBeats');pageIndex=page.index;
   beats.style.gridTemplateColumns='repeat('+Math.min(page.size,settings.numerator)+', minmax(0, 1fr))';
   beats.replaceChildren();buttons=[];
   for(let i=page.start;i<page.end;i++){
    const button=document.createElement('button');button.type='button';
    button.className='metro-beat accent-'+settings.accents[i];button.textContent=String(i+1);
    button.setAttribute('aria-label',(i+1)+'박 · '+['묵음','보통','강세'][settings.accents[i]]+' · 누르면 변경');
    button.classList.toggle('beat-active',lastBeat===i);
    button.onclick=()=>{
     const accents=[...settings.accents];accents[i]=(accents[i]+2)%3;update({accents});
     // Keep the edited beat visible and keyboard focus stable across redraws.
     pageIndex=Math.floor(i/currentPage().size);pagePinned=true;paintBeats();buttons[i]?.focus();
    };
    beats.append(button);buttons[i]=button;
   }
   const pager=$('metroBeatPager');if(pager)pager.hidden=page.pages<=1;
   const label=$('metroBeatPage');if(label)label.textContent=(page.start+1)+'–'+page.end+' / '+settings.numerator+'박';
   if($('metroPrevBeats'))$('metroPrevBeats').disabled=page.index===0;
   if($('metroNextBeats'))$('metroNextBeats').disabled=page.index===page.pages-1;
  }
  function paint(){
   for(const [id,key] of [['metroNumerator','numerator'],['metroDenominator','denominator'],['metroBpm','bpm'],['metroBpmRange','bpm'],['metroUnit','unit'],['metroSubdivision','subdivision'],['metroVolume','volume'],['metroSound','sound']])$(id).value=String(settings[key]);
   $('metroPreset').value=PRESETS.includes(settings.numerator+'/'+settings.denominator)?settings.numerator+'/'+settings.denominator:'custom';
   $('metroSignature').textContent=settings.numerator+'/'+settings.denominator;
   const isMuted=settings.muted||settings.volume===0;
   $('metroMuteQuick').textContent=isMuted?'소리 꺼짐':'소리 켜짐';
   $('metroMuteQuick').setAttribute('aria-pressed',String(isMuted));
   $('metroMuteQuick').setAttribute('aria-label',isMuted?'메트로놈 소리 켜기':'메트로놈 음소거');
   if(scheduler.running)$('metroState').textContent=isMuted?'재생 중 · 무음':'재생 중';
   $('metroMinus').disabled=settings.bpm<=20;$('metroPlus').disabled=settings.bpm>=300;
   $('metroInterval').textContent='한 박 '+beatSeconds(settings).toFixed(3)+'초 · 한 마디 '+(beatSeconds(settings)*settings.numerator).toFixed(2)+'초';
   $('metroVolumeValue').textContent=settings.volume+'%';
   paintBeats();
   callbacks.onSettings?.(settings);
  }
  function update(patch){
   const next=normalize({...settings,...patch}),issue=timingIssue(next);
   if(issue){$('metroSettingNotice').textContent=issue;callbacks.onError?.(issue);paint();return false;}
   const changedRhythm=rhythmKey(settings)!==rhythmKey(next);
   settings=next;if(changedRhythm){pageIndex=0;pagePinned=false;}
   scheduler.configure(settings);if(settings.volume>0)lastAudibleVolume=settings.volume;
   $('metroSettingNotice').textContent='';persist();paint();return true;
  }
  for(const preset of PRESETS){const option=document.createElement('option');option.value=preset;option.textContent=preset;$('metroPreset').append(option);}
  const custom=document.createElement('option');custom.value='custom';custom.textContent='직접 설정';$('metroPreset').append(custom);
  for(const n of DENOMINATORS){const option=document.createElement('option');option.value=String(n);option.textContent=String(n);$('metroDenominator').append(option);}
  $('metroPreset').onchange=()=>{
   if($('metroPreset').value==='custom'){
    $('metroPreset').value=PRESETS.includes(settings.numerator+'/'+settings.denominator)?settings.numerator+'/'+settings.denominator:'custom';
    $('metroNumerator').focus({preventScroll:true});$('metroNumerator').select?.();return;
   }
   const [numerator,denominator]=$('metroPreset').value.split('/').map(Number);
   $('metroGroups').value='';update({numerator,denominator,accents:defaults(numerator,denominator)});
  };
  $('metroNumerator').onchange=()=>{const n=integer($('metroNumerator').value,1,64,settings.numerator);$('metroGroups').value='';update({numerator:n,accents:defaults(n,settings.denominator)});};
  $('metroDenominator').onchange=()=>{$('metroGroups').value='';const d=Number($('metroDenominator').value);update({denominator:d,accents:defaults(settings.numerator,d)});};
  const bpm=value=>update({bpm:value});
  $('metroBpm').onchange=()=>bpm($('metroBpm').value);$('metroBpmRange').onchange=()=>bpm($('metroBpmRange').value);
  $('metroBpmRange').oninput=()=>bpm($('metroBpmRange').value);
  for(const id of ['metroBpm','metroNumerator'])$(id).onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$(id).blur?.();}};
  for(const [id,delta] of [['metroMinus',-1],['metroPlus',1]])holds.push(bindRepeatButton($(id),()=>{
   const before=settings.bpm;bpm(before+delta);return settings.bpm!==before;
  },{beforeStart:cancelHolds,allowed:()=>!$('metronomePanel').hidden&&!document.hidden}));
  root.addEventListener?.('blur',cancelHolds);
  document.addEventListener?.('visibilitychange',()=>{if(document.hidden)cancelHolds();});
  $('metroUnit').onchange=()=>update({unit:$('metroUnit').value});
  $('metroSubdivision').onchange=()=>update({subdivision:Number($('metroSubdivision').value)});
  $('metroVolume').oninput=()=>update({volume:Number($('metroVolume').value),muted:false});
  $('metroVolume').onchange=()=>update({volume:Number($('metroVolume').value),muted:false});
  $('metroSound').onchange=()=>update({sound:$('metroSound').value});
  $('metroMuteQuick').onclick=()=>update(settings.muted||settings.volume===0?{muted:false,volume:settings.volume||lastAudibleVolume}:{muted:true});
  $('metroToggle').onclick=()=>scheduler.toggle();
  $('metroApplyGroups').onclick=()=>{
   const accents=grouping($('metroGroups').value,settings.numerator);
   if(!accents){$('metroGroupMessage').textContent='합계가 '+settings.numerator+'인 묶음을 입력하세요. 예: 7박 = 2+2+3';return;}
   $('metroGroupMessage').textContent='강세 묶음을 적용했습니다.';update({accents});
  };
  const resetAccents=()=>{
   if(update({accents:defaults(settings.numerator,settings.denominator)})){
    $('metroGroups').value='';$('metroGroupMessage').textContent='기본 강세로 되돌렸습니다.';
   }
  };
  for(const id of ['metroResetAccentsQuick','metroResetAccents'])$(id).onclick=resetAccents;
  for(const [id,delta] of [['metroPrevBeats',-1],['metroNextBeats',1]]){
   const button=$(id);if(button)button.onclick=()=>{
    const page=currentPage();pageIndex=Math.max(0,Math.min(page.pages-1,page.index+delta));pagePinned=true;paintBeats();
   };
  }
  function paintPresets(){
   const list=$('metroSavedList');list.replaceChildren();
   const pages=Math.max(1,Math.ceil(presets.length/2));presetPage=Math.max(0,Math.min(pages-1,presetPage));
   for(const entry of presets.slice(presetPage*2,presetPage*2+2)){
    const card=document.createElement('div');card.className='metro-saved-card';
    const load=document.createElement('button');load.type='button';load.className='metro-saved-load';
    const title=document.createElement('strong');title.textContent=entry.name;
    const detail=document.createElement('span');detail.textContent=entry.settings.bpm+' BPM · '+entry.settings.numerator+'/'+entry.settings.denominator+' · '+entry.settings.subdivision+'분할';
    load.append(title,detail);load.setAttribute('aria-label',entry.name+' 리듬 불러오기');
    load.onclick=()=>{if(update(entry.settings)){$('metroPresetName').value=entry.name;$('metroPresetMessage').textContent=entry.name+' 리듬을 불러왔습니다.';}};
    const remove=document.createElement('button');remove.type='button';remove.className='metro-saved-remove';remove.textContent='삭제';remove.setAttribute('aria-label',entry.name+' 저장 리듬 삭제');
    remove.onclick=()=>{
     const previous=presets;presets=presets.filter(p=>p.id!==entry.id);
     try{root.localStorage.setItem(PRESET_KEY,JSON.stringify(presets));paintPresets();$('metroPresetMessage').textContent=entry.name+' 저장 리듬을 삭제했습니다.';}
     catch(_){presets=previous;$('metroPresetMessage').textContent='저장 공간을 확인해 주세요.';}
    };
    card.append(load,remove);list.append(card);
   }
   $('metroSavedEmpty').hidden=presets.length>0;
   $('metroSavedPager').hidden=pages<=1;$('metroSavedPage').textContent=(presetPage+1)+' / '+pages;
   $('metroSavedPrev').disabled=presetPage===0;$('metroSavedNext').disabled=presetPage===pages-1;
   $('metroSavedCount').textContent=presets.length+'/'+MAX_PRESETS;
  }
  $('metroSavePreset').onclick=()=>{
   const name=$('metroPresetName').value.trim().slice(0,24);
   if(!name){$('metroPresetMessage').textContent='리듬 이름을 입력하세요.';$('metroPresetName').focus();return;}
   if(presets.some(entry=>entry.name.toLocaleLowerCase()===name.toLocaleLowerCase())){$('metroPresetMessage').textContent='같은 이름의 리듬이 있습니다. 다른 이름을 입력하세요.';return;}
   if(presets.length>=MAX_PRESETS){$('metroPresetMessage').textContent='리듬은 최대 '+MAX_PRESETS+'개까지 저장합니다. 사용하지 않는 리듬을 삭제해 주세요.';return;}
   const entry={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),name,settings:normalize(settings)};
   const next=[entry,...presets];
   try{root.localStorage.setItem(PRESET_KEY,JSON.stringify(next));presets=next;presetPage=0;paintPresets();$('metroPresetMessage').textContent='현재 리듬을 저장했습니다.';}
   catch(_){$('metroPresetMessage').textContent='리듬을 저장하지 못했습니다. 저장 공간을 확인해 주세요.';}
  };
  $('metroSavedPrev').onclick=()=>{presetPage--;paintPresets();};$('metroSavedNext').onclick=()=>{presetPage++;paintPresets();};
  const reflowBeats=()=>{
   if(!pagePinned&&lastBeat!==null)pageIndex=Math.floor(lastBeat/currentPage().size);
   paintBeats();
  };
  if(root.ResizeObserver)new root.ResizeObserver(reflowBeats).observe($('metroBeats'));
  else root.addEventListener?.('resize',reflowBeats);
  paint();paintPresets();return {toggle:()=>scheduler.toggle(),cancelHolds,stop:()=>{cancelHolds();scheduler.stop();},get running(){return scheduler.running;},get starting(){return scheduler.starting;},get settings(){return settings;}};
 }
 const api={normalize,beatSeconds,grouping,defaults,beatPage,timingIssue,soundProfile,parsePresets,bindRepeatButton,MAX_PRESETS,MAX_PULSE_RATE,PRESETS,DENOMINATORS,SUBDIVISIONS,Scheduler,mount};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VoiceLineMetronome=api;
})(typeof window!=='undefined'?window:globalThis);
