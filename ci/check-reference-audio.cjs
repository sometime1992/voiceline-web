'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function checkReferenceAudio(page,output){
 const results=await page.evaluate(async()=>{
  const api=window.VoiceLineReferencePiano,report=[];
  function rms(pcm,from,to,rate){let sum=0,count=0;for(let i=Math.floor(from*rate);i<Math.floor(to*rate);i++){sum+=pcm[i]*pcm[i];count++;}return Math.sqrt(sum/count);}
  function pitch(pcm,rate,expected){
   // Compare normalized autocorrelation only around the expected fundamental,
   // avoiding a piano harmonic being mistaken for another octave.
   let best=-Infinity,period=0;
   const start=Math.floor(.25*rate),count=Math.floor(.35*rate),low=Math.floor(rate/(expected*Math.pow(2,1/12))),high=Math.ceil(rate/(expected/Math.pow(2,1/12)));
   const correlations=new Map();
   for(let lag=low;lag<=high;lag++){let sum=0,a=0,b=0;for(let i=start;i<start+count;i++){sum+=pcm[i]*pcm[i+lag];a+=pcm[i]*pcm[i];b+=pcm[i+lag]*pcm[i+lag];}const q=sum/Math.sqrt(a*b);correlations.set(lag,q);if(q>best){best=q;period=lag;}}
   const left=correlations.get(period-1),right=correlations.get(period+1);let offset=0;
   if(Number.isFinite(left)&&Number.isFinite(right))offset=.5*(left-right)/(left-2*best+right);
   return rate/(period+offset);
  }
  for(const midi of [36,48,60,61,69,84,94]){
   const anchor=24+3*Math.round((midi-24)/3),names=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
   const filename=names[anchor%12]+(Math.floor(anchor/12)-1)+'v8.mp3',bytes=await (await fetch('./vendor/salamander/'+filename)).arrayBuffer();
   const ac=new OfflineAudioContext(1,Math.ceil(1.8*48000),48000),buffer=await ac.decodeAudioData(bytes);
   api.play(ac,ac.destination,()=>({buffer,anchor,gain:.12}),{midi});
   const rendered=await ac.startRendering(),pcm=rendered.getChannelData(0),expected=440*Math.pow(2,(midi-69)/12),detected=pitch(pcm,48000,expected);
   report.push({midi,filename,duration:api.DEFAULT_SECONDS,expected_hz:expected,measured_hz:detected,cents:1200*Math.log2(detected/expected),early_rms:rms(pcm,.05,.25,48000),late_rms:rms(pcm,1.05,1.25,48000),after_rms:rms(pcm,1.56,1.75,48000),nonfinite:pcm.some(v=>!Number.isFinite(v)),peak:pcm.reduce((m,v)=>Math.max(m,Math.abs(v)),0)});
  }
  // Render the full direct reference and scoring boundary with the real
  // recording; sound must be zero before any response earns voice credit.
  const g=window.VoiceLineGuideTraining,s=g.create({...g.PRACTICE_DEFAULTS,pattern:'hold',root:60,noteSeconds:1.8,rounds:1,breathSeconds:0,restSeconds:0},0);
  const ac=new OfflineAudioContext(1,Math.ceil(2*48000),48000),bytes=await (await fetch('./vendor/salamander/C4v8.mp3')).arrayBuffer(),buffer=await ac.decodeAudioData(bytes);
  const player=g.createPlayer(ac,ac.destination,()=>({buffer,anchor:60,gain:.12}),{setInterval:()=>1,clearInterval(){}});player.start(s,0);
  const rendered=await ac.startRendering(),pcm=rendered.getChannelData(0),gate=s.attackMs/1000;
  return {status:'passed',references:report,direct:{cue_seconds:window.VoiceLineReferencePiano.cueSeconds(1800),grade_start_seconds:gate,late_cue_rms:rms(pcm,.4,.55,48000),graded_window_rms:rms(pcm,gate,1.5,48000)}};
 });
 for(const r of results.references){
  assert.equal(r.nonfinite,false,'nonfinite rendered piano '+r.midi);assert.ok(r.peak>0&&r.peak<1,'piano clipping '+r.midi);
  assert.ok(Math.abs(r.cents)<30,'incorrect piano pitch '+JSON.stringify(r));
  assert.ok(r.late_rms>r.early_rms*.005,'reference ends too early '+JSON.stringify(r));
  assert.ok(r.after_rms<1e-8,'reference tail extends into the next phase '+r.midi);
 }
 assert.ok(results.direct.cue_seconds>=.65);assert.ok(results.direct.late_cue_rms>1e-6,'direct cue still too short');assert.ok(results.direct.graded_window_rms<1e-8,'reference audio contaminates scoring');
 fs.writeFileSync(path.join(output,'reference-audio.json'),JSON.stringify(results,null,2));
 console.log('PASS: seven rendered piano references, pitch/duration/fade and direct-cue scoring isolation');
};
