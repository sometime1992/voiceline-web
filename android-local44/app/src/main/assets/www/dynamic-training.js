'use strict';
// Relative vocal dynamics: the same personal reference drives the guide and score.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VoiceLineDynamics=api;})(globalThis,()=>{
 const STEP_RATIO=1.8,BAND_RATIO=1.25,MIN_REFERENCE_MS=500;
 const STAGES=Object.freeze([
  Object.freeze({key:'soft',label:'약하게',short:'약 · 기준',ratio:1}),
  Object.freeze({key:'medium',label:'중간 세기',short:'중',ratio:STEP_RATIO}),
  Object.freeze({key:'strong',label:'강하게',short:'강',ratio:STEP_RATIO*STEP_RATIO}),
  Object.freeze({key:'softAgain',label:'다시 약하게',short:'약',ratio:1})
 ]);
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const median=values=>{const a=[...values].sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
 const segment=(key,label,short,ms,from,to=from,phase=label)=>Object.freeze({key,label,short,ms,from,to,phase});
 const base=segment('soft','약하게','약 · 기준',3000,0,0,'작게');
 const PATTERNS=Object.freeze({
  steps:Object.freeze({label:'기본 4단계',tip:'기준 3초 → 중 → 강 → 약',segments:Object.freeze([base,segment('medium','중간 세기','중',3000,1,1,'조금 크게'),segment('strong','강하게','강',3000,2,2,'가장 크게'),segment('softAgain','다시 약하게','약',3000,0,0,'다시 작게')])}),
  crescendo:Object.freeze({label:'점점 크게',tip:'약하게 기준 3초 → 점점 크게',segments:Object.freeze([base,segment('rise','점점 크게','점점 크게',9000,0,2)])}),
  decrescendo:Object.freeze({label:'점점 작게',tip:'기준 3초 → 강하게 유지 → 점점 작게',segments:Object.freeze([base,segment('strong','강하게 유지','강',2000,2),segment('fall','점점 작게','점점 작게',7000,2,0)])}),
  swell:Object.freeze({label:'커졌다 작아지기',tip:'기준 3초 → 점점 크게 → 점점 작게',segments:Object.freeze([base,segment('rise','점점 크게','크게',4500,0,2),segment('fall','점점 작게','작게',4500,2,0)])}),
  alternating:Object.freeze({label:'강약 반복',tip:'약 → 강 → 약 → 강 → 약',segments:Object.freeze([base,segment('strong1','강하게','강',2000,2),segment('soft1','약하게','약',2000,0),segment('strong2','다시 강하게','강',2000,2),segment('softAgain','다시 약하게','약',3000,0)])}),
  steady:Object.freeze({label:'일정하게 유지',tip:'기준 3초 → 중간 세기로 유지',segments:Object.freeze([base,segment('steady','중간 세기 유지','중간 유지',9000,1)])}),
  accents:Object.freeze({label:'짧게 강조',tip:'기준 3초 → 짧게 강·길게 약을 두 번',segments:Object.freeze([base,segment('accent1','짧게 강하게','강',1500,2),segment('soft1','약하게 회복','약',3000,0),segment('accent2','다시 짧게 강하게','강',1500,2),segment('softAgain','약하게 회복','약',3000,0)])})
 });
 function patternId(value){return Object.prototype.hasOwnProperty.call(PATTERNS,value)?value:'steps';}
 function getPattern(value){return PATTERNS[patternId(value)];}
 function timeline(value,duration=12000,custom=null){
  if(Array.isArray(custom)&&custom.length===getPattern(value).segments.length&&custom.every(n=>Number.isFinite(n)&&n>=1&&n<=60)){let at=0;return getPattern(value).segments.map((s,i)=>{const start=at;at=Math.round(at+custom[i]*1000);return Object.freeze({...s,start,end:at});});}
  const reference=Math.min(3000,duration/2);
  let at=0;const segments=getPattern(value).segments;return segments.map((s,i)=>{const start=at;at=i===segments.length-1?Math.round(duration):Math.round(at+(i===0?reference:s.ms*(duration-reference)/9000));return Object.freeze({...s,start,end:at});});
 }
 function create({start=0,duration=12000,pattern='steps',segmentSeconds=null}={}){
  duration=Number.isFinite(duration)&&duration>0?duration:12000;pattern=patternId(pattern);
  const segments=timeline(pattern,duration,segmentSeconds);duration=segments.at(-1).end;
  return {start:Number.isFinite(start)?start:0,duration:Number.isFinite(duration)&&duration>0?duration:12000,
   patternId:pattern,segments,
   baseline:null,locked:false,softSamples:[],referenceMs:0,samples:[],lastAt:null};
 }
 function stageAt(model,t){const index=model.segments.findIndex(s=>t-model.start<s.end);return index<0?model.segments.length-1:index;}
 function state(model,t){
  const elapsed=t-model.start,index=stageAt(model,t),s=model.segments[index];
  const progress=clamp((elapsed-s.start)/(s.end-s.start),0,1),level=s.from+(s.to-s.from)*progress;
  return {...s,index,step:index,level,seconds:Math.max(0,Math.ceil((s.end-elapsed)/1000)),remaining:Math.max(0,Math.ceil((model.duration-elapsed)/1000)),
   next:model.segments[index+1]?.label||'종료',preparing:elapsed<0,done:elapsed>=model.duration};
 }
 function receive(model,t,rms,{voiced=true,onPitch=true,cue=false}={}){
  if(!model||!Number.isFinite(t)||t<model.start||t>=model.start+model.duration)return;
  if(model.lastAt!==null&&t-model.lastAt<22)return;
  const phase=stageAt(model,t),previous=model.samples.at(-1),gap=previous?t-previous.t:0;
  const value=!cue&&voiced&&Number.isFinite(rms)&&rms>0?rms:null;
  const correct=value!==null&&onPitch,phaseStart=model.start+model.segments[phase].start;
  const dt=correct&&previous?.onPitch&&gap>0&&gap<=160?Math.max(0,Math.min(gap,t-phaseStart)):0;
  const sample={t,rms:value,onPitch:correct,cue,phase,dt};model.lastAt=t;model.samples.push(sample);
  // Retain the entire selected exercise, even at the fastest accepted cadence.
  if(model.samples.length>Math.ceil(model.duration/22)+2)model.samples.shift();
  if(phase>0)model.locked=true;
  if(phase===0&&!model.locked&&correct){
   model.referenceMs+=dt;model.softSamples.push(value);
   if(model.softSamples.length>140)model.softSamples.shift();
   if(model.softSamples.length>=5&&model.referenceMs>=MIN_REFERENCE_MS)model.baseline=median(model.softSamples);
  }
 }
 function bounds(model,phase,t){
  if(!model?.baseline)return null;
  const s=model.segments[clamp(phase,0,model.segments.length-1)];
  const elapsed=Number.isFinite(t)?t-model.start:s.start,progress=clamp((elapsed-s.start)/(s.end-s.start),0,1);
  const target=model.baseline*Math.pow(STEP_RATIO,s.from+(s.to-s.from)*progress);
  return {target,low:target/BAND_RATIO,high:target*BAND_RATIO};
 }
 function inBand(model,sample){
  const band=bounds(model,sample.phase,sample.t);
  return Boolean(band&&sample.onPitch&&sample.rms>=band.low&&sample.rms<=band.high);
 }
 function metrics(model){
  let voicedMs=0,matchedMs=0;const count=model?.segments?.length||4,phaseMs=Array(count).fill(0),phaseMatchedMs=Array(count).fill(0);
  for(const p of model?.samples||[]){
   voicedMs+=p.dt;phaseMs[p.phase]+=p.dt;
   if(inBand(model,p)){matchedMs+=p.dt;phaseMatchedMs[p.phase]+=p.dt;}
  }
  return {calibrated:Boolean(model?.baseline),voicedMs,matchedMs,phaseMs,phaseMatchedMs,phaseDurations:model?.segments.map(s=>s.end-s.start)||[],
   accuracy:model?.baseline&&voicedMs>0?Math.floor(matchedMs/voicedMs*100+1e-9):null};
 }
 function feedback(model,now){
  if(!model)return {text:'첫 약 단계에서 내 소리 기준을 잡아요',match:'idle'};
  if(now<model.start)return {text:'같은 음을 약하게 낼 준비를 하세요',match:'ready'};
  if(now<model.start+model.segments[0].end)return {text:'약하게 유지 · 내 소리 기준 잡는 중',match:'calibrating'};
  if(!model.baseline)return {text:'약 단계의 목소리 부족 · 다시 시작해 주세요',match:'missing'};
  const p=model.samples.at(-1);
  if(!p||now-p.t>250||p.rms===null)return {text:p?.cue&&now-p.t<=250?'단계 전환 안내음':'같은 음으로 소리를 내보세요',match:'waiting'};
  if(!p.onPitch)return {text:'목표 음높이도 함께 유지하세요',match:'pitch'};
  const band=bounds(model,stageAt(model,Math.min(now,model.start+model.duration-1)),now);
  if(p.rms<band.low)return {text:'조금 더 크게',match:'low'};
  if(p.rms>band.high)return {text:'조금 더 작게',match:'high'};
  return {text:'목표 범위 안이에요',match:'near'};
 }
 function draw(canvas,model,now,{dpr=globalThis.devicePixelRatio||1}={}){
  const rect=canvas?.getBoundingClientRect();if(!rect||rect.width<40||rect.height<28)return null;
  const w=rect.width,h=rect.height,scale=clamp(dpr,1,2);
  if(canvas.width!==Math.round(w*scale)||canvas.height!==Math.round(h*scale)){canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);}
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,w,h);
  const compact=h<72,left=25,right=w-8,top=compact?3:17,bottom=h-(h<55?12:17),step=(right-left)/4;
  if(bottom<=top)return null;
  const start=model?.start??now,duration=model?.duration??12000,baseline=model?.baseline;
  const segments=model?.segments||timeline('steps',duration),elapsed=clamp(now-start,0,duration),current=stageAt({start,duration,segments},now);
  const xFor=t=>left+clamp((t-start)/duration,0,1)*(right-left);
  const yForLevel=level=>bottom-clamp((level+.7)/3.4,0,1)*(bottom-top);
  const levelFor=value=>Math.log(value/baseline)/Math.log(STEP_RATIO);
  const bandWidth=Math.log(BAND_RATIO)/Math.log(STEP_RATIO);
  ctx.font='10px system-ui';ctx.textBaseline='middle';
  for(const [i,s]of segments.entries()){
   const x=xFor(start+s.start),end=xFor(start+s.end),width=end-x;
   ctx.fillStyle=i===current?'rgba(105,236,208,.07)':'rgba(255,255,255,.025)';ctx.fillRect(x,top,width,bottom-top);
   ctx.fillStyle=i===current?'rgba(105,236,208,.22)':'rgba(105,236,208,.10)';
   ctx.beginPath();ctx.moveTo(x,yForLevel(s.from+bandWidth));ctx.lineTo(end,yForLevel(s.to+bandWidth));ctx.lineTo(end,yForLevel(s.to-bandWidth));ctx.lineTo(x,yForLevel(s.from-bandWidth));ctx.closePath();ctx.fill();
   if(!compact){ctx.fillStyle=i===current?'#a4ffe7':'#c0c6d6';ctx.textAlign='center';ctx.fillText(s.short,x+width/2,7,width-4);}
   ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.strokeStyle='rgba(217,220,243,.16)';ctx.lineWidth=1;ctx.stroke();
  }
  for(const [index,label]of ['약','중','강'].entries()){
   const y=yForLevel(index);ctx.fillStyle='#c1c9d9';ctx.font=(h<60?'8':'10')+'px system-ui';ctx.textAlign='right';if(h>=60||index!==1)ctx.fillText(label,left-5,y);
   ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.strokeStyle='rgba(220,220,240,.12)';ctx.stroke();
  }
  ctx.beginPath();
  for(const [i,s]of segments.entries()){const x=xFor(start+s.start),end=xFor(start+s.end),y=yForLevel(s.from);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);ctx.lineTo(end,yForLevel(s.to));}
  ctx.strokeStyle='#69ecd0';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke();
  // A stable personal scale starts in the first weak phase and remains fixed.
  if(baseline){
   ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
   ctx.beginPath();let previous=null;
   for(const p of model.samples){
    if(p.rms===null){previous=null;continue;}
    const x=xFor(p.t),y=yForLevel(levelFor(p.rms));
    if(!previous||p.t-previous.t>210)ctx.moveTo(x,y);else ctx.lineTo(x,y);previous=p;
   }
   ctx.strokeStyle='#d4a6ff';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke();
   const last=model.samples.at(-1);
   if(last?.rms&&now-last.t<250){ctx.beginPath();ctx.arc(xFor(last.t),yForLevel(levelFor(last.rms)),3.5,0,Math.PI*2);ctx.fillStyle=inBand(model,last)?'#83f5d6':'#d4a6ff';ctx.fill();}
   ctx.restore();
  }
  const cursor=left+elapsed/duration*(right-left);
  ctx.beginPath();ctx.moveTo(cursor,top);ctx.lineTo(cursor,bottom);ctx.strokeStyle='#ffd67f';ctx.lineWidth=1.5;ctx.stroke();
  ctx.fillStyle='#d6d0df';ctx.font='9px system-ui';ctx.textAlign='center';
  for(let i=0;i<=4;i++){ctx.textAlign=i===0?'left':i===4?'right':'center';ctx.fillText(String(Math.round(duration/4000*i*10)/10)+'초',left+i*step,h-5);}
  return {baseline:baseline??null,cursor,points:model?.samples.length??0};
 }
 return Object.freeze({STAGES,PATTERNS,patternId,getPattern,timeline,state,STEP_RATIO,BAND_RATIO,MIN_REFERENCE_MS,create,receive,bounds,inBand,metrics,feedback,draw});
});
