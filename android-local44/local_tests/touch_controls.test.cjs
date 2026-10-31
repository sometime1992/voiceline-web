'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {bindRepeatButton}=require('../app/src/main/assets/www/metronome.js');
const {mounted}=require('./metronome_harness.cjs');
test('Cancelling a hold from its step callback cannot leave a new repeat timer behind',()=>{
 for(const stopAt of [1,2]){
  const timers=new Map();let serial=0,steps=0,hold;
  const button={focus(){}};
  hold=bindRepeatButton(button,()=>{steps++;if(steps===stopAt)hold.cancel();return true;},{
   setTimer:fn=>{timers.set(++serial,fn);return serial;},clearTimer:id=>timers.delete(id)
  });
  button.onpointerdown({pointerId:1,button:0,preventDefault(){}});
  for(const [id,fn] of [...timers]){timers.delete(id);fn();}
  assert.equal(steps,stopAt);assert.equal(timers.size,0);
 }
});
function fixture(initial=80){
 let now=0,serial=0,value=initial;const timers=new Map(),delays=[],capture=[],released=[];
 const button={disabled:false,focus(){},setPointerCapture:id=>capture.push(id),releasePointerCapture:id=>released.push(id),getBoundingClientRect:()=>({left:0,right:50,top:0,bottom:40})};
 const options={setTimer(fn,delay){delays.push(delay);timers.set(++serial,{fn,at:now+delay});return serial;},clearTimer:id=>timers.delete(id)};
 const action=()=>{const before=value;value=Math.max(20,Math.min(300,value+1));button.disabled=value>=300;return value!==before;};
 const hold=bindRepeatButton(button,action,options);
 const down=(pointerId=1,extra={})=>button.onpointerdown({pointerId,button:0,isPrimary:true,preventDefault(){},...extra});
 function advance(to){let next;while((next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0])&&next[1].at<=to){timers.delete(next[0]);now=next[1].at;next[1].fn();}now=to;}
 return {button,hold,down,advance,timers,delays,capture,released,get value(){return value;}};
}
test('BPM hold changes once on touch, repeats after 400ms, then every 80ms without a release click',()=>{
 const h=fixture();h.down();assert.equal(h.value,81);h.advance(399);assert.equal(h.value,81);
 h.advance(400);assert.equal(h.value,82);h.advance(560);assert.equal(h.value,84);
 h.button.onpointerup({pointerId:1});h.button.onclick({detail:1});assert.equal(h.value,84);
 h.advance(5000);assert.equal(h.value,84);assert.equal(h.timers.size,0);
 assert.deepEqual(h.delays,[400,80,80,80]);assert.deepEqual(h.capture,[1]);assert.deepEqual(h.released,[1]);
});
test('A quick touch and a keyboard or accessibility click each apply exactly one BPM step',()=>{
 const h=fixture();h.down();h.button.onpointerup({pointerId:1});h.button.onclick({detail:1});
 assert.equal(h.value,81);assert.equal(h.timers.size,0);
 h.button.onclick({detail:0});assert.equal(h.value,82);
 h.button.onclick();assert.equal(h.value,83);
});
test('Pointer cancellation, capture loss, leaving the button and focus loss all stop BPM repeat',()=>{
 for(const event of ['onpointercancel','onlostpointercapture','onpointerleave','onblur']){
  const h=fixture();h.down();h.advance(400);h.button[event]({pointerId:1});h.advance(9000);
  assert.equal(h.value,82,event);assert.equal(h.timers.size,0,event);
 }
 const moved=fixture();moved.down();moved.button.onpointermove({pointerId:1,clientX:60,clientY:20});moved.advance(2000);
 assert.equal(moved.value,81);assert.equal(moved.timers.size,0);
});
test('Other pointers and secondary mouse buttons cannot start or prematurely end a hold',()=>{
 const h=fixture();h.down(1,{button:2});h.down(1,{isPrimary:false});assert.equal(h.value,80);
 h.down(1);h.down(2);h.button.onpointerup({pointerId:2});h.advance(400);assert.equal(h.value,82);
 h.button.onpointerup({pointerId:1});assert.equal(h.timers.size,0);
});
test('BPM repeat stops at the upper bound and a disabled control never starts a timer',()=>{
 const h=fixture(298);h.down();assert.equal(h.value,299);h.advance(400);
 assert.equal(h.value,300);assert.equal(h.button.disabled,true);assert.equal(h.timers.size,0);
 h.down();h.button.onclick({detail:0});h.advance(5000);assert.equal(h.value,300);
});
test('Starting the opposite BPM hold cancels the first button',()=>{
 const active=[];let value=80;const timers=new Map();let serial=0;
 const options={setTimer:fn=>{timers.set(++serial,fn);return serial;},clearTimer:id=>timers.delete(id),beforeStart:()=>active.forEach(h=>h.cancel())};
 const button=()=>({focus(){}}),minus=button(),plus=button();
 active.push(bindRepeatButton(minus,()=>--value,options),bindRepeatButton(plus,()=>++value,options));
 const press={pointerId:1,button:0,isPrimary:true,preventDefault(){}};
 plus.onpointerdown(press);assert.equal(value,81);assert.equal(timers.size,1);
 minus.onpointerdown({...press,pointerId:2});assert.equal(value,80);assert.equal(timers.size,1);
 for(const [id,fn] of [...timers]){timers.delete(id);fn();}assert.equal(value,79);active.forEach(h=>h.cancel());
});
test('Holding BPM while playing preserves the running bar; leaving the mode cancels repetition',async()=>{
 const h=mounted();await h.$('metroToggle').onclick();h.advance(.8);
 const state=[...h.states],sources=[...h.sources],beat=h.$('metroCount').textContent;
 h.$('metroPlus').onpointerdown({pointerId:1,button:0,isPrimary:true,preventDefault(){}});
 assert.equal(h.control.settings.bpm,81);assert.equal(h.$('metroCount').textContent,beat);
 h.advance(.9);assert.equal(h.control.settings.bpm,82);assert.equal(h.control.running,true);assert.deepEqual(h.states,state);
 assert.ok(sources.every(o=>!o.cancelled));h.control.stop();assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);
 const bpm=h.control.settings.bpm;h.advance(10);assert.equal(h.control.settings.bpm,bpm);
 const low=mounted({bpm:21});low.$('metroMinus').onpointerdown({pointerId:1,button:0,preventDefault(){}});
 assert.equal(low.control.settings.bpm,20);assert.equal(low.$('metroMinus').disabled,true);assert.equal(low.timers.size,0);low.control.stop();
});
test('Window blur and background visibility cancel held BPM buttons without a stuck timer',()=>{
 for(const target of ['blur','hidden']){
  const h=mounted();h.$('metroPlus').onpointerdown({pointerId:1,button:0,preventDefault(){}});
  assert.equal(h.timers.size,1);
  if(target==='blur')h.rootEvents.get('blur')();else{h.document.hidden=true;h.documentEvents.get('visibilitychange')();}
  h.advance(10);assert.equal(h.control.settings.bpm,81);assert.equal(h.timers.size,0);
 }
});
test('Text context menus are suppressed without cancelling editable selection or pointer gestures',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8'),listeners=new Map();
 const begin=source.indexOf('// Suppress text/image touch menus'),end=source.indexOf('const NAMES=',begin);
 vm.runInNewContext(source.slice(begin,end),{document:{addEventListener:(name,fn)=>listeners.set(name,fn)}});
 assert.deepEqual([...listeners.keys()],['contextmenu','selectstart']);
 let prevented=0;listeners.get('contextmenu')({preventDefault(){prevented++;}});assert.equal(prevented,1);
 listeners.get('selectstart')({target:{closest:()=>null},preventDefault(){prevented++;}});assert.equal(prevented,2);
 listeners.get('selectstart')({target:{closest:()=>({tagName:'INPUT'})},preventDefault(){prevented++;}});assert.equal(prevented,2);
});
