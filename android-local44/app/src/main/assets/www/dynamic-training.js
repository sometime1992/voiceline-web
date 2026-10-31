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
 function create({start=0,duration=12000}={}){
  return {start:Number.isFinite(start)?start:0,duration:Number.isFinite(duration)&&duration>0?duration:12000,
   baseline:null,locked:false,softSamples:[],referenceMs:0,samples:[],lastAt:null};
 }
 function stageAt(model,t){return Math.min(3,Math.max(0,Math.floor((t-model.start)/(model.duration/4))));}
 function receive(model,t,rms,{voiced=true,onPitch=true,cue=false}={}){
  if(!model||!Number.isFinite(t)||t<model.start||t>=model.start+model.duration)return;
  if(model.lastAt!==null&&t-model.lastAt<22)return;
  const phase=stageAt(model,t),previous=model.samples.at(-1),gap=previous?t-previous.t:0;
  const value=!cue&&voiced&&Number.isFinite(rms)&&rms>0?rms:null;
  const correct=value!==null&&onPitch,phaseStart=model.start+phase*model.duration/4;
  const dt=correct&&previous?.onPitch&&gap>0&&gap<=160?Math.max(0,Math.min(gap,t-phaseStart)):0;
  const sample={t,rms:value,onPitch:correct,cue,phase,dt};model.lastAt=t;model.samples.push(sample);
  // At most 546 detector points for the complete twelve-second exercise.
  if(model.samples.length>600)model.samples.shift();
  if(phase>0)model.locked=true;
  if(phase===0&&!model.locked&&correct){
   model.referenceMs+=dt;model.softSamples.push(value);
   if(model.softSamples.length>140)model.softSamples.shift();
   if(model.softSamples.length>=5&&model.referenceMs>=MIN_REFERENCE_MS)model.baseline=median(model.softSamples);
  }
 }
 function bounds(model,phase){
  if(!model?.baseline)return null;
  const target=model.baseline*STAGES[clamp(phase,0,3)].ratio;
  return {target,low:target/BAND_RATIO,high:target*BAND_RATIO};
 }
 function inBand(model,sample){
  const band=bounds(model,sample.phase);
  return Boolean(band&&sample.onPitch&&sample.rms>=band.low&&sample.rms<=band.high);
 }
 function metrics(model){
  let voicedMs=0,matchedMs=0;const phaseMs=[0,0,0,0],phaseMatchedMs=[0,0,0,0];
  for(const p of model?.samples||[]){
   voicedMs+=p.dt;phaseMs[p.phase]+=p.dt;
   if(inBand(model,p)){matchedMs+=p.dt;phaseMatchedMs[p.phase]+=p.dt;}
  }
  return {calibrated:Boolean(model?.baseline),voicedMs,matchedMs,phaseMs,phaseMatchedMs,
   accuracy:model?.baseline&&voicedMs>0?Math.floor(matchedMs/voicedMs*100+1e-9):null};
 }
 function feedback(model,now){
  if(!model)return {text:'첫 약 단계에서 내 소리 기준을 잡아요',match:'idle'};
  if(now<model.start)return {text:'같은 음을 약하게 낼 준비를 하세요',match:'ready'};
  if(now<model.start+model.duration/4)return {text:'약하게 유지 · 내 소리 기준 잡는 중',match:'calibrating'};
  if(!model.baseline)return {text:'약 단계의 목소리 부족 · 다시 시작해 주세요',match:'missing'};
  const p=model.samples.at(-1);
  if(!p||now-p.t>250||p.rms===null)return {text:p?.cue&&now-p.t<=250?'단계 전환 안내음':'같은 음으로 소리를 내보세요',match:'waiting'};
  if(!p.onPitch)return {text:'목표 음높이도 함께 유지하세요',match:'pitch'};
  const band=bounds(model,stageAt(model,Math.min(now,model.start+model.duration-1)));
  if(p.rms<band.low)return {text:'조금 더 크게',match:'low'};
  if(p.rms>band.high)return {text:'조금 더 작게',match:'high'};
  return {text:'목표 범위 안이에요',match:'near'};
 }
 function draw(canvas,model,now,{dpr=globalThis.devicePixelRatio||1}={}){
  const rect=canvas?.getBoundingClientRect();if(!rect||rect.width<40||rect.height<32)return null;
  const w=rect.width,h=rect.height,scale=clamp(dpr,1,2);
  if(canvas.width!==Math.round(w*scale)||canvas.height!==Math.round(h*scale)){canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);}
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,w,h);
  const left=25,right=w-8,top=17,bottom=h-17,step=(right-left)/4;
  if(bottom<=top)return null;
  const start=model?.start??now,duration=model?.duration??12000,baseline=model?.baseline;
  const elapsed=clamp(now-start,0,duration),current=stageAt({start,duration},now);
  const xFor=t=>left+clamp((t-start)/duration,0,1)*(right-left);
  const yForLevel=level=>bottom-clamp((level+.7)/3.4,0,1)*(bottom-top);
  const levelFor=value=>Math.log(value/baseline)/Math.log(STEP_RATIO);
  const targetLevels=[0,1,2,0],bandWidth=Math.log(BAND_RATIO)/Math.log(STEP_RATIO);
  ctx.font='10px system-ui';ctx.textBaseline='middle';
  for(let i=0;i<4;i++){
   const x=left+i*step,y=yForLevel(targetLevels[i]);
   ctx.fillStyle=i===current?'rgba(105,236,208,.07)':'rgba(255,255,255,.025)';ctx.fillRect(x,top,step,bottom-top);
   ctx.fillStyle=i===current?'rgba(105,236,208,.22)':'rgba(105,236,208,.10)';
   const a=yForLevel(targetLevels[i]+bandWidth),b=yForLevel(targetLevels[i]-bandWidth);ctx.fillRect(x,a,step,b-a);
   ctx.fillStyle=i===current?'#a4ffe7':'#c0c6d6';ctx.textAlign='center';ctx.fillText(STAGES[i].short,x+step/2,7,step-4);
   ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.strokeStyle='rgba(217,220,243,.16)';ctx.lineWidth=1;ctx.stroke();
  }
  for(const [index,label]of ['약','중','강'].entries()){
   const y=yForLevel(index);ctx.fillStyle='#c1c9d9';ctx.textAlign='right';ctx.fillText(label,left-5,y);
   ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.strokeStyle='rgba(220,220,240,.12)';ctx.stroke();
  }
  ctx.beginPath();
  for(let i=0;i<4;i++){const x=left+i*step,y=yForLevel(targetLevels[i]);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);ctx.lineTo(x+step,y);}
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
  for(let i=0;i<=4;i++){ctx.textAlign=i===0?'left':i===4?'right':'center';ctx.fillText(String(duration/4000*i)+'초',left+i*step,h-5);}
  return {baseline:baseline??null,cursor,points:model?.samples.length??0};
 }
 return Object.freeze({STAGES,STEP_RATIO,BAND_RATIO,MIN_REFERENCE_MS,create,receive,bounds,inBand,metrics,feedback,draw});
});
