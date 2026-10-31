'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const metro=require('../app/src/main/assets/www/metronome.js');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(settings){
 const sources=[],timers=new Map(),frames=new Map(),beats=[],states=[],errors=[];let serial=0,resumeGate;
 const ctx={currentTime:0,state:'running',destination:{},resume(){return resumeGate||Promise.resolve()},
  createOscillator(){const o={frequency:{setValueAtTime(v,t){o.frequencyValue=v}},connect(){},disconnect(){},start(t){o.time=t},stop(t){o.stopAt=t;o.cancelled=t===undefined},onended:null};sources.push(o);return o},
  createGain(){return {gain:{value:1,setValueAtTime(v){this.value=v},linearRampToValueAtTime(v){this.value=v},exponentialRampToValueAtTime(v){this.value=v}},connect(){},disconnect(){}}}};
 const scheduler=new metro.Scheduler({settings,makeContext:()=>ctx,
  setTimer(fn){timers.set(++serial,fn);return serial},clearTimer:id=>timers.delete(id),
  raf(fn){frames.set(++serial,fn);return serial},cancelRaf:id=>frames.delete(id),
  onBeat:beat=>beats.push(beat),onState:state=>states.push(state),onError:error=>errors.push(error)});
 return {scheduler,ctx,sources,timers,frames,beats,states,errors,gate:p=>resumeGate=p,
  pump(){for(const [id,fn] of [...timers]){timers.delete(id);fn()}},draw(){for(const [id,fn] of [...frames]){frames.delete(id);fn()}}};
}
test('Local34 metronome supports every custom numerator and denominator with valid accents',()=>{
 for(let n=1;n<=64;n++)for(const d of metro.DENOMINATORS){
  const s=metro.normalize({numerator:n,denominator:d});assert.equal(s.numerator,n);assert.equal(s.denominator,d);assert.equal(s.accents.length,n);assert.ok(s.accents.every(a=>a>=0&&a<=2));
 }
 for(const preset of metro.PRESETS){const [numerator,denominator]=preset.split('/').map(Number);assert.deepEqual(metro.normalize({numerator,denominator}).accents,metro.defaults(numerator,denominator))}
 assert.deepEqual(metro.defaults(6,8),[2,1,1,2,1,1]);
});
test('Local34 metronome distinguishes denominator, quarter and dotted-quarter BPM units',()=>{
 const s={numerator:6,denominator:8,bpm:60};
 assert.equal(metro.beatSeconds(s),1);assert.equal(metro.beatSeconds({...s,unit:'quarter'}),.5);
 assert.ok(Math.abs(metro.beatSeconds({...s,unit:'dottedQuarter'})*6-2)<1e-12);
 assert.equal(metro.beatSeconds({numerator:3,denominator:2,bpm:120,unit:'quarter'}),1);
});
test('Local34 additive grouping validates the entire meter and permits mixed groups',()=>{
 assert.deepEqual(metro.grouping('2 + 2 + 3',7),[2,1,2,1,2,1,1]);
 assert.deepEqual(metro.grouping('3+2+2',7),[2,1,1,2,1,2,1]);
 for(const invalid of ['2+2','0+7','-1+8','2.5+4.5','2++5','<script>',''])assert.equal(metro.grouping(invalid,7),null,invalid);
});
test('Local34 metronome sanitizes malformed saved settings and volume/BPM limits',()=>{
 for(const value of [null,'bad',{}, {numerator:NaN,denominator:3,bpm:Infinity,unit:'invalid',volume:-5,subdivision:5,accents:[999]}]){
  const s=metro.normalize(value);assert.equal(s.numerator,4);assert.equal(s.denominator,4);assert.equal(s.bpm,80);assert.equal(s.unit,'beat');assert.equal(s.subdivision,1);assert.ok(s.volume>=0);
 }
 const s=metro.normalize({numerator:10000,denominator:64,bpm:500,volume:1000});assert.equal(s.numerator,64);assert.equal(s.bpm,300);assert.equal(s.volume,100);
});
test('Local34 metronome schedules exact audio-clock spacing without timer drift',async()=>{
 const f=fixture({bpm:120,numerator:7,denominator:8,subdivision:2});await f.scheduler.start();
 for(let i=1;i<=200;i++){f.ctx.currentTime=i*.025+(i%3)*.001;f.pump();f.draw();}
 assert.ok(f.sources.length>=20);
 for(let i=1;i<f.sources.length;i++)assert.ok(Math.abs(f.sources[i].time-f.sources[i-1].time-.25)<1e-10);
 assert.deepEqual(f.beats.filter(b=>b.sub===0).slice(0,8).map(b=>b.beat),[0,1,2,3,4,5,6,0]);
 f.scheduler.stop();
});
test('Local34 metronome skips missed ticks after a stalled screen without catch-up bursts',async()=>{
 const f=fixture({bpm:300,subdivision:8});await f.scheduler.start();const before=f.sources.length;
 f.ctx.currentTime=10;f.pump();const following=f.sources.slice(before);
 assert.ok(following.length<=6&&following.length>0);assert.ok(following.every(o=>o.time>=10.015-1e-10));
 assert.ok(f.scheduler.visual.length<20,'stale visual events must be bounded');f.scheduler.stop();
});
test('Local34 strong, normal and subdivided clicks are distinct; a muted beat silences its subdivisions',async()=>{
 const f=fixture({bpm:60,numerator:3,denominator:4,subdivision:2,accents:[2,1,0]});await f.scheduler.start();
 for(let t=.1;t<3;t+=.05){f.ctx.currentTime=t;f.pump();f.draw();}
 assert.deepEqual(f.sources.slice(0,4).map(o=>o.frequencyValue),[1500,650,1000,650]);
 assert.ok(f.sources.every(o=>o.time<2||o.time>=3));f.scheduler.stop();
 const silent=fixture({bpm:80,volume:0});await silent.scheduler.start();silent.ctx.currentTime=.1;silent.draw();
 assert.equal(silent.scheduler.master.gain.value,0);assert.equal(silent.beats[0].beat,0);silent.scheduler.stop();
});
test('Local34 stop cancels scheduled audio/timers and a pending audio unlock cannot restart playback',async()=>{
 const f=fixture();await f.scheduler.start();f.scheduler.stop();assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);assert.ok(f.sources.every(o=>o.cancelled));assert.equal(f.scheduler.nodes.size,0);
 const g=fixture();let release;g.gate(new Promise(resolve=>release=resolve));const start=g.scheduler.start();g.scheduler.stop();release();await start;
 assert.equal(g.scheduler.running,false);assert.equal(g.sources.length,0);assert.equal(g.timers.size,0);
});
test('Local34 configuration changes replace future clicks and restart on the new downbeat',async()=>{
 const f=fixture({bpm:80});await f.scheduler.start();const previous=[...f.sources];
 f.scheduler.configure({bpm:160,numerator:5,denominator:4,accents:[2,1,1,2,1]});await turn();
 assert.ok(previous.every(o=>o.cancelled));assert.equal(f.scheduler.settings.numerator,5);assert.equal(f.scheduler.index,1);assert.equal(f.timers.size,1);f.scheduler.stop();
});
test('Local34 an audio interruption stops the metronome and reports a recoverable error',async()=>{
 const f=fixture();await f.scheduler.start();f.ctx.state='suspended';f.ctx.onstatechange();
 assert.equal(f.scheduler.running,false);assert.equal(f.timers.size,0);assert.equal(f.errors.length,1);
});
