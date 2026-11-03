/**
 * VoiceLine playback adapter to the established MIT @tonejs/piano engine.
 * No custom oscillator/sample-envelopes are needed for normal keyboard play.
 * Local Salamander Grand recordings (CC BY 3.0) are bundled into the APK.
 */
import { Piano } from '@tonejs/piano/build/piano/Piano.js';
import * as Tone from 'tone';

let piano=null;
let loading=null;
let available=false;
let activated=false;
let activating=null;
const held=new Map();
const pendingReleases=new Map();
const sourcePath='./vendor/salamander/';

// @tonejs/piano uses Tone.Sampler internally, with attack:0 by default.
// On a phone speaker that can give an audible pop when the same note is tapped
// repeatedly. Keep the published instrument, but configure its Sampler attack.
const PLAYBACK=Object.freeze({samplerAttack:0.018,minHoldMs:90,maxVelocity:0.62});
const diagnostics={configuredSamplers:0,rapidReleases:0,retriggered:0};
function prepareSamplerAttacks() {
 const strings=piano?._strings?._strings;
 if(!Array.isArray(strings))return false;
 let changed=0;
 for(const string of strings){
   const sampler=string.output||string._sampler;
   if(sampler&&typeof sampler.attack==='number'){
     sampler.attack=PLAYBACK.samplerAttack;
     changed++;
   }
 }
 diagnostics.configuredSamplers=changed;
 return changed===strings.length&&changed>0;
}
function contextIsRunning(){
 try{return Tone.getContext().state==='running';}catch(_){return false;}
}
function activateFromGesture(){
 if(activated&&contextIsRunning())return Promise.resolve();
 if(!activating){
   activating=Tone.start()
     .then(()=>{activated=true;})
     .finally(()=>{activating=null;});
 }
 return activating;
}
function finishQueuedRelease(midi) {
 const previous=pendingReleases.get(midi);
 if(!previous)return;
 clearTimeout(previous.timer);
 pendingReleases.delete(midi);
 if(available){
   piano.keyUp({midi});
   diagnostics.retriggered++;
 }
}
function triggerHeld(midi,token,pressure){
 if(!available||held.get(midi)!==token||token.started)return;
 finishQueuedRelease(midi); // old release can NEVER turn off this fresh note later.
 token.started=true;
 token.startedAt=performance.now();
 piano.keyDown({midi,velocity:Math.min(PLAYBACK.maxVelocity,Math.max(0.23,pressure*0.43))});
}
const engine={
 get ready(){return available;},
 get status(){return available?'ready':loading?'loading':'idle';},
 get diagnostics(){return {...diagnostics,voiceCount:held.size,pendingReleases:pendingReleases.size,context:contextIsRunning()?'running':'suspended'};},
 async load(){
   if(loading)return loading;
   loading=(async()=>{
     try{
       piano=new Piano({
         velocities:1,
         minNote:24,
         maxNote:105,
         release:false, // prevent a second keybed click on release
         pedal:false,
         maxPolyphony:20,
         url:sourcePath,
         volume:{strings:-11,keybed:-90,pedal:-90,harmonics:-90},
       });
       piano.toDestination();
       await piano.load();
       if(!prepareSamplerAttacks()){
         console.warn('Tone Piano sampler attack configuration unavailable');
       }
       available=true;
       window.dispatchEvent(new CustomEvent('voiceline-piano-status',{detail:'ready'}));
       return true;
     }catch(err){
       console.error('Bundled Tone piano unavailable',err);
       window.dispatchEvent(new CustomEvent('voiceline-piano-status',{detail:'error'}));
       return false;
     }
   })();
   return loading;
 },
 keyDown(midi,pressure=0.7){
   if(held.has(midi))return;
   const token={started:false,startedAt:0};
   held.set(midi,token);
   // Repeated notes must never wait for a Promise microtask once both the
   // samples and the AudioContext are running; same-tick scheduling is crucial.
   if(available&&contextIsRunning()){
     triggerHeld(midi,token,pressure);
     return;
   }
   // Tone.start must be called synchronously from this actual touch gesture.
   const activation=activateFromGesture();
   Promise.all([this.load(),activation]).then(([loaded])=>{
     if(loaded&&contextIsRunning())triggerHeld(midi,token,pressure);
   }).catch(err=>console.warn('Tone piano key start',err));
 },
 keyUp(midi){
   const token=held.get(midi);
   if(!token)return;
   held.delete(midi);
   if(!token.started)return; // a very short tap before load must not become a late note.
   const elapsed=Math.max(0,performance.now()-token.startedAt);
   const wait=Math.max(0,PLAYBACK.minHoldMs-elapsed);
   if(wait===0){
     piano.keyUp({midi});
     return;
   }
   // A very short tap is given a minimum note-on time; Tone's own 400 ms
   // release envelope then handles the smooth tail without any hard stop.
   diagnostics.rapidReleases++;
   const slot={timer:0};
   slot.timer=setTimeout(()=>{
     if(pendingReleases.get(midi)!==slot)return;
     pendingReleases.delete(midi);
     if(available)piano.keyUp({midi});
   },wait);
   pendingReleases.set(midi,slot);
 },
 stopAll(){
   held.clear();
   for(const slot of pendingReleases.values())clearTimeout(slot.timer);
   pendingReleases.clear();
   if(available)piano.stopAll();
 },
 async reference(midi){
   await Promise.all([this.load(),activateFromGesture()]);
   if(!available)return;
   const start=Tone.now();
   piano.keyDown({midi,velocity:.30,time:start});
   piano.keyUp({midi,time:start+.23});
 },
};
window.VoiceLineToneEngine=engine;
engine.load();
