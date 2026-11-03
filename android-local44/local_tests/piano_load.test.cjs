'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const vendor=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/vendor/tone-piano.js'),'utf8');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options={}){
 const instances=[],timers=new Map(),events=[];let serial=0;
 class Piano {
  constructor(){if(options.throwFirst&&!instances.length){instances.push({});throw Error("audio initialization failed");}this.strings={value:0};this._strings={_strings:[{output:{attack:.01}}]};this.promise=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject});instances.push(this)}
  load(){return this.promise}connect(){}toDestination(){}disconnect(){this.disconnected=true}dispose(){this.disposed=true}stopAll(){}keyDown(){}keyUp(){}
 }
 const window={dispatchEvent:e=>events.push(e.detail)};
 const ctx={window,Map,Promise,performance:{now:()=>0},yo:Piano,ut:()=>({state:'running',rawContext:{}}),nn:async()=>{},Yu:()=>0,
  setTimeout(fn){timers.set(++serial,fn);return serial},clearTimeout:id=>timers.delete(id),CustomEvent:class{constructor(_,args){this.detail=args.detail}},console:{warn(){},error(){}}};
 vm.runInNewContext(vendor.slice(vendor.indexOf('var VL_loadState='),vendor.lastIndexOf('})();')),ctx);
 return {engine:window.VoiceLineToneEngine,instances,timers,events};
}
test('Local34 piano load errors expose a retryable error state; a fresh load can succeed',async()=>{
 const f=fixture();assert.equal(f.engine.status,'loading');f.instances[0].reject(Error('decode failed'));await turn();
 assert.equal(f.engine.status,'error');assert.equal(f.engine.ready,false);assert.ok(f.instances[0].disposed);assert.equal(f.timers.size,0);
 const retry=f.engine.load();assert.equal(f.instances.length,2);assert.equal(f.engine.status,'loading');f.instances[1].resolve();assert.equal(await retry,true);
 assert.equal(f.engine.ready,true);assert.equal(f.engine.status,'ready');assert.deepEqual(f.events,['loading','error','loading','ready']);
});
test('Local34 piano load deadline cannot leave the UI loading forever or activate a stale attempt',async()=>{
 const f=fixture();const late=f.instances[0];[...f.timers.values()][0]();await turn();assert.equal(f.engine.status,'error');
 const retry=f.engine.load();const current=f.instances[1];current.resolve();await retry;f.engine.setVolume(50);const volume=current.strings.value;
 late.resolve();await turn();assert.equal(f.engine.status,'ready');assert.equal(current.strings.value,volume);assert.ok(late.disposed);
});

test('Local34 a synchronous piano initialization failure still permits a fresh retry',async()=>{
 const f=fixture({throwFirst:true});await turn();assert.equal(f.engine.status,'error');
 const retry=f.engine.load();assert.equal(f.instances.length,2);f.instances[1].resolve();assert.equal(await retry,true);assert.equal(f.engine.status,'ready');
});
