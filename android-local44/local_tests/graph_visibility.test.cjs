'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
const chunk=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
function fixture(stored=null){
 const nodes=new Map(),saved=new Map(),draws=[];
 const $=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',attrs:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;}});return nodes.get(id);};
 const app={mode:'pitch',layoutPortrait:false,landscapeGraphHidden:false,graphStatusLast:0,mic:true,vibratoRoot:60};
 const context={app,$,localStorage:{getItem:()=>stored,setItem:(k,v)=>saved.set(k,v)},performance:{now:()=>1000},window:{},Math,Number,Boolean,String,
  noteLabel:m=>'C4 · 2옥 도 ('+m+')',guideOptions:()=>({root:60}),trainingPhase:()=> 'listen',
  renderPitchGraphOverlay:()=>draws.push('pitch'),renderVibratoOverlay:()=>draws.push('vibrato'),renderRecordPitchOverlay:()=>draws.push('record'),renderTrainingOverlay:()=>draws.push('training')};
 const api=vm.runInNewContext(chunk("const LANDSCAPE_GRAPH_KEY=",'function readPianoVolume(')+chunk('function landscapeGraphHidden(){',"$('graphToggle')?.addEventListener")+'\n({readLandscapeGraphHidden,landscapeGraphHidden,syncGraphVisibility,toggleLandscapeGraph,graphHiddenSummary})',context);
 return {...api,app,$,saved,draws,context};
}
test('A hidden landscape graph preserves the recording, microphone, piano pointers and scoring history',()=>{
 const h=fixture(),record=Object.freeze({id:'one-file',frames:16000}),training=Object.freeze({active:true,start:1234,voicedMs:900}),points=[{t:1000,midi:60}],owners=new Map([[1,60]]);
 Object.assign(h.app,{record,training,pitchGraphSamples:points,owners,recordStart:120,sessionStart:200,frame:42});
 h.toggleLandscapeGraph();assert.equal(h.app.landscapeGraphHidden,true);assert.equal(h.$('graphToggle').textContent,'그래프 보기');assert.equal(h.$('graphToggle').attrs['aria-expanded'],'false');
 assert.equal(h.app.record,record);assert.equal(h.app.training,training);assert.equal(h.app.pitchGraphSamples,points);assert.equal(h.app.owners,owners);
 assert.equal(h.app.mic,true);assert.equal(h.app.recordStart,120);assert.equal(h.app.sessionStart,200);assert.equal(h.app.frame,42);assert.deepEqual(h.draws,[]);
 h.toggleLandscapeGraph();assert.equal(h.app.landscapeGraphHidden,false);assert.deepEqual(h.draws,['pitch','vibrato','record','training']);
 assert.equal(h.saved.get('voiceline-landscape-graph-hidden-v1'),'0');
});
test('Portrait always shows graphs and a landscape preference returns after rotation and mode changes',()=>{
 const h=fixture();h.toggleLandscapeGraph();h.app.layoutPortrait=true;h.syncGraphVisibility();
 assert.equal(h.landscapeGraphHidden(),false);assert.equal(h.$('graphToggle').hidden,true);assert.equal(h.$('graphHiddenStatus').hidden,true);
 h.toggleLandscapeGraph();assert.equal(h.app.landscapeGraphHidden,true);
 h.app.layoutPortrait=false;
 for(const mode of ['pitch','record','practice','vibrato','sustainVoice','earVoice','dynamicVoice']){
  h.app.mode=mode;h.syncGraphVisibility();assert.equal(h.$('graphToggle').hidden,false);assert.equal(h.$('graphToggle').textContent,'그래프 보기');
 }
 for(const mode of ['piano','warmupVoice','metronome']){h.app.mode=mode;h.syncGraphVisibility();assert.equal(h.$('graphToggle').hidden,true);assert.equal(h.$('graphHiddenStatus').hidden,true);}
});
test('Graph preferences default to visible and blocked storage still permits a session toggle',()=>{
 for(const value of [null,'0','true','broken'])assert.equal(fixture(value).readLandscapeGraphHidden(),false);
 assert.equal(fixture('1').readLandscapeGraphHidden(),true);
 const h=fixture();h.context.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(h.readLandscapeGraphHidden(),false);assert.doesNotThrow(()=>h.toggleLandscapeGraph());assert.equal(h.app.landscapeGraphHidden,true);
});
test('Compact instructions retain solfege and preparation cues without revealing ear-training answers',()=>{
 const h=fixture();h.app.mode='practice';assert.match(h.graphHiddenSummary(1000),/목표 C4 · 2옥 도/);
 h.app.training={mode:'guideVoice',active:true};h.context.window.VoiceLineGuideTraining={position:()=>({phase:'handoff',midi:60}),startCue:()=>({visible:true,count:2})};
 assert.match(h.graphHiddenSummary(1000),/2초 뒤 시작 · 목표 C4 · 2옥 도/);
 h.app.mode='earVoice';h.app.training={active:true,start:0,root:60,target:null};assert.doesNotMatch(h.graphHiddenSummary(1000),/C4|도|목표/);
 h.app.mode='dynamicVoice';h.app.training.start=3000;assert.equal(h.graphHiddenSummary(1000),'2초 준비');
});
