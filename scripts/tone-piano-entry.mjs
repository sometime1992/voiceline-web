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
const held=new Map();
const sourcePath='./vendor/salamander/';
function noteName(midi) {
 const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
 return names[midi%12]+(Math.floor(midi/12)-1);
}
const engine={
 get ready(){return available;},
 get status(){return available?'ready':loading?'loading':'idle';},
 async load(){
   if(loading)return loading;
   loading=(async()=>{
     try{
       piano=new Piano({
         velocities:1,
         minNote:24,
         maxNote:105,
         release:false, // no additional keybed or string release CLICK sounds
         pedal:false, // no pedal noises for vocal reference keyboard
         maxPolyphony:20,
         url:sourcePath,
         volume:{strings:-11,keybed:-90,pedal:-90,harmonics:-90},
       });
       piano.toDestination();
       await piano.load();
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
   const token={};
   held.set(midi,token);
   // Tone.start() is invoked synchronously from a real keyboard gesture.
   const activation=Tone.start();
   Promise.all([this.load(),activation]).then(([loaded])=>{
     if(!loaded||held.get(midi)!==token)return;
     piano.keyDown({midi,velocity:Math.min(0.65,Math.max(0.24,pressure*0.45))});
   }).catch(err=>console.warn('Tone piano key start',err));
 },
 keyUp(midi){
   held.delete(midi);
   if(available)try{piano.keyUp({midi});}catch(err){console.warn(err);}
 },
 stopAll(){
   held.clear();
   if(available)piano.stopAll();
 },
 async reference(midi){
   await Promise.all([this.load(),Tone.start()]);
   if(!available)return;
   const id='reference-'+midi+'-'+Math.random();
   const start=Tone.now();
   piano.keyDown({midi,velocity:.30,time:start});
   // Guide note remains short but gets the library's own damper ramp.
   piano.keyUp({midi,time:start+.23});
 },
};
window.VoiceLineToneEngine=engine;
engine.load();
