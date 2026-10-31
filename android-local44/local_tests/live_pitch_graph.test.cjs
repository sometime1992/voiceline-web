'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
const chunk=(a,b)=>{const from=source.indexOf(a),to=source.indexOf(b,from);assert.ok(from>=0&&to>from,a);return source.slice(from,to);};
function fixture(){
 let clock=1000,width=400,height=160;const labels=[],strokes=[],nodes=new Map();
 const ctx={setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},setLineDash(v){this.dash=[...v];},stroke(){strokes.push({color:this.strokeStyle,dash:this.dash});},fillText:s=>labels.push(s)};
 const canvas={width:0,height:0,getContext:()=>ctx,getBoundingClientRect:()=>({width,height})};
 const $=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',dataset:{},classList:{toggle(){}},getBoundingClientRect:canvas.getBoundingClientRect});return id==='pitchGraph'||id==='recordPitchGraph'?canvas:nodes.get(id);};
 const recordSamples=[{t:42,midi:61}],app={mode:'pitch',mic:true,nativeMic:true,pitchGraphSamples:[],pitchGraphLast:0,pitchGraphFrozenAt:null,recordPitchSamples:recordSamples,
  base:48,keyboardNotes:24,owners:new Map(),notes:[],sessionSamples:0,layoutReady:false};
 const window={devicePixelRatio:3,innerWidth:844,innerHeight:390},document={body:{classList:{toggle(){}}},documentElement:{}};
 const context={app,$,window,document,Math,Number,Set,Map,Float32Array,performance:{now:()=>clock},
  releaseHeldKeys(){},drawKeys(){},targetKeyboardBase:()=>48,updateMicToggle(){},
  renderVibratoOverlay(){},renderRecordPitchOverlay(){},renderTrainingOverlay(){},updatePracticeScrollHint(){},
  showNote(){},clearNote(){},syncKeyColors(){},store(){throw Error('graph wrote a recording');},
  pitchYin:()=>context.nextPitch};
 $('micNotice').hidden=true;
 const code=chunk('const NAMES=','const PITCH_RANGE=')+chunk('function name(m){','function notify(')+
  chunk('const RECORD_PITCH_WINDOW_MS=','function syncVibratoOverlay(){')+
  chunk('function microphoneSignalRms(','// For the Android-only APK,')+
  chunk('function applyResponsiveLayout(','// Arrows remain visible only when more practice options exist off-screen.')+
  '\n({rememberPitchGraphPoint,renderPitchGraphOverlay,resetPitchGraph,syncPitchGraphOverlay,traceRecordingPitch,applyResponsiveLayout,updateDetection})';
 const api=vm.runInNewContext(code,context);
 return {...api,app,$,ctx,canvas,labels,strokes,window,context,recordSamples,clock:t=>clock=t,size:(w,h)=>{width=w;height=h;}};
}
test('Local46 live pitch graph keeps voice, silence and rejected jumps separate from recording samples',()=>{
 const h=fixture();h.context.nextPitch={hz:220,confidence:.99};
 h.updateDetection(1000,new Float32Array(4096),44100);
 h.context.nextPitch=null;h.updateDetection(1080,new Float32Array(4096),44100);
 h.context.nextPitch={hz:1760,confidence:.99};h.updateDetection(1120,new Float32Array(4096),44100);
 assert.equal(h.app.pitchGraphSamples.length,3);
 assert.ok(Math.abs(h.app.pitchGraphSamples[0].midi-57)<.001);
 assert.equal(h.app.pitchGraphSamples[1].midi,null);assert.equal(h.app.pitchGraphSamples[2].midi,null);
 assert.deepEqual(h.recordSamples,[{t:42,midi:61}]);
 h.app.mode='record';h.rememberPitchGraphPoint(1200,60);assert.equal(h.app.pitchGraphSamples.length,3);
});
test('Local46 live pitch history stays bounded during long measurements',()=>{
 const h=fixture();for(let t=0;t<=1200000;t+=40)h.rememberPitchGraphPoint(t,60);
 assert.ok(h.app.pitchGraphSamples.length<=158);
 assert.ok(h.app.pitchGraphSamples[0].t>=1200000-6250);
 h.rememberPitchGraphPoint(NaN,60);assert.ok(h.app.pitchGraphSamples.length<=158);
 h.app.mic=false;const count=h.app.pitchGraphSamples.length;h.rememberPitchGraphPoint(1200040,61);assert.equal(h.app.pitchGraphSamples.length,count);
});
test('Local46 pitch graph leaves silent gaps open while recording retains its dotted estimates',()=>{
 const h=fixture(),points=[{t:0,midi:60},{t:40,midi:null},{t:80,midi:60.1},{t:120,midi:60.2}];
 const live=h.traceRecordingPitch(h.ctx,points,p=>p.t,p=>p,200,false);
 assert.equal(live.solid,1);assert.equal(live.estimated,0);
 const record=h.traceRecordingPitch(h.ctx,points,p=>p.t,p=>p);
 assert.equal(record.solid,1);assert.equal(record.estimated,1);
});
test('Local46 graph labels include note names and octaves and its range uses only the visible six seconds',()=>{
 const h=fixture();h.app.pitchGraphSamples=[{t:-6000,midi:80},{t:900,midi:57},{t:1000,midi:60}];
 h.renderPitchGraphOverlay(1000,true);
 assert.equal(h.$('pitchGraphLow').textContent,'A3 · 1옥 라');assert.equal(h.$('pitchGraphHigh').textContent,'C4 · 2옥 도');
 assert.ok(h.labels.some(s=>s.includes('옥')));assert.ok(h.labels.includes('−6초'));assert.ok(h.labels.includes('현재'));
 assert.equal(h.canvas.width,800);assert.equal(h.canvas.height,320);
});
test('Local46 stopping freezes the graph and a fresh measurement clears its earlier points',()=>{
 const h=fixture();h.rememberPitchGraphPoint(1000,60);h.app.mic=false;h.app.pitchGraphFrozenAt=1000;
 h.renderPitchGraphOverlay(60000,true);assert.equal(h.$('pitchGraphHigh').textContent,'C4 · 2옥 도');assert.match(h.$('pitchGraphStatus').textContent,/측정 종료/);
 h.resetPitchGraph(60000);assert.equal(h.app.pitchGraphSamples.length,0);assert.equal(h.app.pitchGraphFrozenAt,null);assert.equal(h.$('pitchGraphHigh').textContent,'—');
});
test('Local46 rotation redraws the live pitch graph without losing samples or restarting its microphone',()=>{
 const h=fixture();h.rememberPitchGraphPoint(1000,60);const points=h.app.pitchGraphSamples;
 h.applyResponsiveLayout(true);h.window.innerWidth=390;h.window.innerHeight=844;h.size(320,280);h.applyResponsiveLayout();
 assert.equal(h.app.pitchGraphSamples,points);assert.equal(points.length,1);assert.equal(h.app.mic,true);assert.equal(h.app.nativeMic,true);
 assert.equal(h.app.keyboardNotes,12);assert.equal(h.canvas.width,640);assert.equal(h.canvas.height,560);
 h.window.innerWidth=844;h.window.innerHeight=390;h.applyResponsiveLayout();assert.equal(h.app.keyboardNotes,24);assert.equal(h.app.pitchGraphSamples,points);
});
test('Shared pitch graph is visible in piano, pitch and practice and handles a temporarily tiny canvas',()=>{
 const h=fixture();h.app.mode='record';h.syncPitchGraphOverlay();assert.equal(h.$('pitchGraphOverlay').hidden,true);
 for(const mode of ['piano','pitch','practice']){h.app.mode=mode;h.syncPitchGraphOverlay(true);assert.equal(h.$('pitchGraphOverlay').hidden,false);}
 h.size(0,0);assert.doesNotThrow(()=>h.renderPitchGraphOverlay(2000,true));
});
test('Practice graph captures each timed target even before the next animation frame updates the keyboard',()=>{
 const h=fixture();h.app.mode='practice';h.app.exerciseRoot=60;
 h.app.exercise={active:true,start:2000,duration:1000,steps:[60,62,64],target:60};
 for(const [t,midi] of [[1000,60],[2000,60.1],[2040,60.2],[2960,null],[3000,62.1],[5000,null]])h.rememberPitchGraphPoint(t,midi);
 assert.deepEqual(Array.from(h.app.pitchGraphSamples,p=>p.target),[null,60,60,60,62,null]);
 assert.equal(h.app.pitchGraphSamples[3].midi,null);
 h.renderPitchGraphOverlay(5000,true);
 assert.equal(h.$('pitchPracticeLegend').hidden,false);assert.match(h.$('pitchGraphTitle').textContent,/음정 연습/);
 assert.ok(h.strokes.some(s=>s.color==='#69ecd0'),'practice goal is drawn in mint');
 assert.ok(h.strokes.some(s=>s.color==='#d4a6ff'),'detected voice is drawn in purple');
 assert.deepEqual(h.recordSamples,[{t:42,midi:61}]);
});
test('Silent practice still shows its real goal and never invents a voiced note',()=>{
 const h=fixture();h.app.mode='practice';h.app.exerciseRoot=72;
 h.app.exercise={active:true,start:1000,duration:1000,steps:[72],target:72};
 h.rememberPitchGraphPoint(1000,null);h.rememberPitchGraphPoint(1080,null);h.renderPitchGraphOverlay(1080,true);
 assert.ok(h.strokes.some(s=>s.color==='#69ecd0'));assert.ok(!h.strokes.some(s=>s.color==='#d4a6ff'));
 assert.equal(h.$('pitchGraphLow').textContent,'—');assert.equal(h.$('pitchGraphHigh').textContent,'—');
 assert.equal(h.$('pitchGraphTarget').textContent,'목표 C5 · 3옥 도');
});
test('Practice detection and silence feed the graph and scoring together',()=>{
 const h=fixture(),received=[];h.app.mode='practice';h.app.exerciseRoot=60;
 h.app.exercise={active:true,start:1000,duration:1000,steps:[60],target:60};
 h.context.receiveExerciseSample=(t,midi)=>received.push({t,midi});
 h.context.nextPitch={hz:261.625565,confidence:.99};h.updateDetection(1000,new Float32Array(4096),44100);
 h.context.nextPitch=null;h.updateDetection(1080,new Float32Array(4096),44100);
 assert.equal(received.length,2);assert.equal(h.app.pitchGraphSamples.length,2);
 assert.equal(h.app.pitchGraphSamples[1].midi,null);assert.equal(h.app.pitchGraphSamples[1].target,60);
});
