'use strict';
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VoiceLineReferencePiano=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 const DEFAULT_SECONDS=1.5,RESTRIKE_SECONDS=1.5;
 const cueSeconds=noteMs=>Math.min(.7,noteMs/1000*.4);
 // Every pitch cue uses the bundled acoustic recording. Missing samples must
 // be reported by the caller rather than silently turning into a sine beep.
 function play(ac,destination,sample,{midi,at=ac.currentTime,length=DEFAULT_SECONDS,volume=100,curve=null,onended=()=>{}}){
  if(!(length>0)||!(volume>0))return null;
  const found=sample(midi);if(!found?.buffer)throw Error('피아노 기준음 음원을 준비하지 못했습니다.');
  const source=ac.createBufferSource(),gain=ac.createGain(),start=Math.max(at,ac.currentTime),end=start+length;
  source.buffer=found.buffer;
  const rate=note=>Math.pow(2,(note-found.anchor)/12);
  source.playbackRate.setValueAtTime(rate(midi),start);
  for(const point of curve||[])if(point.at>start&&point.at<=end+.0001)source.playbackRate.exponentialRampToValueAtTime(rate(point.midi),point.at);
  const peak=Math.min(.2,Math.max(.01,found.gain??.12))*Math.min(100,Math.max(0,volume))/100;
  const attack=Math.min(.012,length*.15),release=Math.min(.22,length*.3);
  gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(peak,start+attack);
  // Retain the recording's attack and natural decay; only fade its final tail.
  gain.gain.setValueAtTime(peak,end-release);gain.gain.linearRampToValueAtTime(0,end);
  source.connect(gain);gain.connect(destination);
  source.onended=()=>{source.disconnect();gain.disconnect();onended();};
  source.start(start);source.stop(end+.01);
  return {source,gain};
 }
 return {DEFAULT_SECONDS,RESTRIKE_SECONDS,cueSeconds,play};
});
