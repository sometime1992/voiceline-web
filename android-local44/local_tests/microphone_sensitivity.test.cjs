'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
const chunk=(from,to)=>{
 const a=source.indexOf(from),b=source.indexOf(to,a);
 assert.ok(a>=0&&b>a,from);return source.slice(a,b);
};
const constants=chunk('const MIC_SENSITIVITY_KEY=','const PIANO_VOLUME_KEY=');
const detector=chunk('function pitchYin(','function updateDetection(');
const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
function yin(){
 return vm.runInNewContext(constants+detector+'\npitchYin',{
  Float32Array,Math,clamp:clip,PITCH_RANGE:{minHz:65,maxHz:1900}
 });
}
function voice(hz,amplitude,rate,length){
 return Float32Array.from({length},(_,i)=>amplitude*(Math.sin(2*Math.PI*hz*i/rate)+.12*Math.sin(4*Math.PI*hz*i/rate)));
}

test('Local45 small sung notes appear in sensitive mode for native and browser input windows',()=>{
 const detect=yin();
 for(const [rate,length] of [[16000,1024],[44100,2048],[48000,2048],[44100,4096]]){
  for(const hz of [82.41,110,220,440,880]){
   const sound=voice(hz,.006,rate,length);
   assert.equal(detect(sound,rate,false,'standard'),null,'standard keeps its earlier quiet gate');
   const result=detect(sound,rate);
   assert.ok(result,`${hz}Hz at ${rate}Hz should be tracked by default`);
   assert.ok(Math.abs(result.hz-hz)/hz<.02);
  }
 }
});
test('Local45 maximum sensitivity catches softer singing while recording keeps its own quieter gate',()=>{
 const detect=yin(),sr=44100;
 const quiet=voice(220,.0027,sr,4096);
 assert.equal(detect(quiet,sr,false,'sensitive'),null);
 assert.ok(detect(quiet,sr,false,'high'));
 const record=voice(220,.0032,sr,4096);
 assert.equal(detect(record,sr,true,'standard'),null);
 assert.ok(detect(record,sr,true,'sensitive'));
 const softer=voice(220,.0018,sr,4096);
 assert.equal(detect(softer,sr,true,'sensitive'),null);
 assert.ok(detect(softer,sr,true,'high'));
});
test('Local45 every sensitivity rejects silence, DC, near silence and unvoiced random noise',()=>{
 const detect=yin();let seed=1173;
 for(const level of ['standard','sensitive','high']){
  for(const recording of [false,true]){
   assert.equal(detect(new Float32Array(4096),44100,recording,level),null);
   assert.equal(detect(new Float32Array(4096).fill(.04),44100,recording,level),null);
   assert.equal(detect(voice(220,.0003,44100,4096),44100,recording,level),null);
   for(let take=0;take<12;take++){
    const noise=Float32Array.from({length:4096},()=>{
     seed=(1664525*seed+1013904223)>>>0;return (seed/0x100000000*2-1)*.025;
    });
    assert.equal(detect(noise,44100,recording,level),null,level+' noise '+take);
   }
  }
 }
});
test('Local45 sensitivity does not alter PCM samples or accepted note confidence',()=>{
 const detect=yin(),sound=voice(220,.05,44100,4096),before=new Float32Array(sound);
 const results=['standard','sensitive','high'].map(level=>detect(sound,44100,false,level));
 assert.deepEqual(sound,before);
 assert.ok(results.every(p=>p&&p.hz===results[0].hz&&p.confidence===results[0].confidence));
 assert.equal(detect(voice(220,.0027,44100,4096),44100,false,'constructor'),null);
});
test('Local45 stored sensitivity defaults safely when absent, malformed or unavailable',()=>{
 for(const stored of [null,'','unknown','__proto__','constructor']){
  const read=vm.runInNewContext(constants+'\nreadMicSensitivity',{localStorage:{getItem:()=>stored}});
  assert.equal(read(),'sensitive');
 }
 for(const value of ['standard','sensitive','high']){
  const read=vm.runInNewContext(constants+'\nreadMicSensitivity',{localStorage:{getItem:()=>value}});
  assert.equal(read(),value);
 }
 const blocked=vm.runInNewContext(constants+'\nreadMicSensitivity',{localStorage:{getItem(){throw Error('blocked')}}});
 assert.equal(blocked(),'sensitive');
});
test('Local45 live sensitivity cycling persists without restarting or splitting recording or training',()=>{
 const record={id:'continuous',startFrame:123,bytes:456},training={active:true,good:8},notes=[60,60.1];
 const app={mic:true,nativeMic:true,micSensitivity:'sensitive',record,training,notes,lastTrustedPitchAt:1};
 const storage=new Map(),listeners={},attrs={};
 const button={addEventListener:(name,fn)=>listeners[name]=fn,setAttribute:(k,v)=>attrs[k]=v};
 const code=constants+chunk('function updateMicSensitivityControl(){',"$('micToggle').addEventListener('click',async()=>{");
 vm.runInNewContext(code,{app,$:()=>button,localStorage:{setItem:(k,v)=>storage.set(k,v)}});
 assert.equal(button.textContent,'감도 민감');
 for(const [value,label] of [['high','최대'],['standard','표준'],['sensitive','민감']]){
  listeners.click();assert.equal(app.micSensitivity,value);assert.equal(button.textContent,'감도 '+label);
  assert.equal(storage.get('voiceline-mic-sensitivity-v1'),value);
  assert.match(attrs['aria-label'],new RegExp(label));
  assert.equal(app.record,record);assert.equal(app.training,training);assert.equal(app.mic,true);
 }
 assert.deepEqual(record,{id:'continuous',startFrame:123,bytes:456});
 assert.deepEqual(training,{active:true,good:8});
});
test('Local45 sensitivity remains usable when a settings write is blocked',()=>{
 const app={micSensitivity:'sensitive',notes:[]};
 const button={setAttribute(){},addEventListener(){}};
 const apply=vm.runInNewContext(constants+chunk('function updateMicSensitivityControl(){',"$('micSensitivity').addEventListener('click',()=>{")+'\napplyMicSensitivity',{
  app,$:()=>button,localStorage:{setItem(){throw Error('blocked')}}
 });
 assert.doesNotThrow(()=>apply('high'));assert.equal(app.micSensitivity,'high');assert.equal(button.textContent,'감도 최대');
 apply('__proto__');assert.equal(app.micSensitivity,'high');
});
test('Local45 the selected sensitivity reaches both native and browser graph detection',()=>{
 for(const native of [true,false]){
  const sound=voice(220,.0027,44100,4096),nodes=new Map(),shown=[];
  const app={mode:'pitch',micSensitivity:'high',notes:[],owners:new Map(),base:48,keyboardNotes:24,
   analyser:{getFloatTimeDomainData:b=>b.set(sound)},buffer:new Float32Array(4096),micCtx:{sampleRate:44100},sessionSamples:0};
  const $=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);};
  const run=vm.runInNewContext(constants+detector+chunk('function updateDetection(','// For the Android-only APK,')+'\nupdateDetection',{
   app,$,Math,Float32Array,clamp:clip,PITCH_RANGE:{minHz:65,maxHz:1900},showNote:m=>shown.push(m),syncKeyColors(){},clearNote(){}
  });
  run(1000,native?sound:null,native?44100:0);
  assert.equal(shown.length,1,native?'native':'browser');assert.ok(Math.abs(shown[0]-57)<.1);
  app.micSensitivity='standard';run(1100,native?sound:null,native?44100:0);
  assert.equal(app.detected,null);assert.equal(shown.length,1);
 }
});
