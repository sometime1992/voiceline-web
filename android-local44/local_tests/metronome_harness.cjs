'use strict';
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const web=path.resolve(__dirname,'../app/src/main/assets/www');const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
class Node {
 constructor(doc,id=''){this.doc=doc;this.id=id;this.style={};this.children=[];this.attrs={};this.width=0;this.value='';this.hidden=false;this.className='';this.classes=new Set();this.classList={toggle:(name,on)=>{if(on)this.classes.add(name);else this.classes.delete(name)},add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)}}
 setAttribute(k,v){this.attrs[k]=v}append(...items){for(const n of items){this.children.push(n);n.parent=this}}replaceChildren(){this.children=[]}
 focus(){this.doc.activeElement=this}blur(){this.doc.activeElement=null;this.onchange?.()}
 getBoundingClientRect(){return {width:this.width,height:0}}
}
function mounted(initial={},width=340,options={}){
 const nodes=new Map(),timers=new Map(),frames=new Map(),sources=[],gains=[],saved=new Map();let serial=0,observer,failStorage=false;
 const documentEvents=new Map(),rootEvents=new Map();
 const document={activeElement:null,getElementById:id=>nodes.get(id)||null,createElement:()=>new Node(document),addEventListener:(name,fn)=>documentEvents.set(name,fn)};
 for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes.set(match[1],new Node(document,match[1]));
 const $=id=>nodes.get(id);$('metroBeats').width=width;
 saved.set('voiceline-metronome-v1',JSON.stringify(initial));
 if(options.presets)saved.set('voiceline-metronome-presets-v1',JSON.stringify(options.presets));
 const context={currentTime:0,state:'running',destination:{},resume:()=>Promise.resolve(),
  createOscillator(){const o={frequency:{setValueAtTime(hz){o.hz=hz}},connect(target){o.target=target},disconnect(){},start(time){o.time=time},stop(time){o.cancelled=time===undefined}};sources.push(o);return o},
  createGain(){const node={gain:{value:1,setValueAtTime(v){this.value=v},linearRampToValueAtTime(v){this.value=v},exponentialRampToValueAtTime(v){this.value=v}},connect(target){node.target=target},disconnect(){}};gains.push(node);return node;}};
 const states=[],errors=[];
 const window={addEventListener:(name,fn)=>rootEvents.set(name,fn),AudioContext:class{constructor(){return context}},localStorage:{getItem:key=>saved.get(key),setItem:(k,v)=>{if(failStorage)throw Error('quota');saved.set(k,v)}},ResizeObserver:class{constructor(fn){observer=fn}observe(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(web,'metronome.js'),'utf8'),{window,document,performance:{now:()=>0},
  setTimeout(fn){timers.set(++serial,fn);return serial},clearTimeout:id=>timers.delete(id),requestAnimationFrame(fn){frames.set(++serial,fn);return serial},cancelAnimationFrame:id=>frames.delete(id)});
 const control=window.VoiceLineMetronome.mount(document,{onState:s=>states.push(s),onError:e=>errors.push(e)});
 return {$,control,nodes,saved,context,sources,gains,timers,frames,states,errors,document,documentEvents,rootEvents,failStorage:value=>failStorage=value,resize(w){$('metroBeats').width=w;observer()},
  advance(time){context.currentTime=time;for(const [id,fn] of [...timers]){timers.delete(id);fn()}for(const [id,fn] of [...frames]){frames.delete(id);fn()}}};
}
module.exports={mounted};
