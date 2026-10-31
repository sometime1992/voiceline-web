'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const metro=require('../app/src/main/assets/www/metronome.js');
const web=path.resolve(__dirname,'../app/src/main/assets/www');
const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
const {mounted}=require('./metronome_harness.cjs');
test('Local35 every beat remains reachable through bounded pages at phone and tablet widths',()=>{
 for(let n=1;n<=64;n++)for(const width of [180,240,300,340,480,800]){
  const seen=[];const first=metro.beatPage(n,width);
  assert.ok(first.size<=8&&first.size>=1);
  for(let i=0;i<first.pages;i++){
   const page=metro.beatPage(n,width,i);for(let b=page.start;b<page.end;b++)seen.push(b);
   assert.ok(page.end-page.start<=8);assert.ok(page.size*40+(page.size-1)*6<=width);
  }
  assert.deepEqual(seen,Array.from({length:n},(_,i)=>i));
 }
 assert.equal(metro.beatPage(64,340,999).index,9);assert.equal(metro.beatPage(4,0).pages,1);
});
test('Local35 the former tap-tempo space toggles audio and accessibility state on and off',async()=>{
 const h=mounted();assert.equal(h.nodes.has('metroTap'),false);assert.ok(h.$('metroToggle'));
 await h.$('metroToggle').onclick();assert.equal(h.control.running,true);assert.equal(h.$('metroToggle').attrs['aria-pressed'],'true');assert.match(h.$('metroToggle').textContent,/끄기/);assert.ok(h.sources.length>0);
 await h.$('metroToggle').onclick();assert.equal(h.control.running,false);assert.equal(h.$('metroToggle').attrs['aria-pressed'],'false');assert.match(h.$('metroToggle').textContent,/켜기/);assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);
 assert.equal(h.control.settings.bpm,80,'start/stop must not change tempo');
});
test('Local35 paging to a distant beat edits only that beat and preserves all saved accents',()=>{
 const h=mounted({numerator:64,denominator:8});const original=[...h.control.settings.accents];
 assert.equal(h.$('metroBeats').children.length,7);assert.equal(h.$('metroBeatPager').hidden,false);
 for(let i=0;i<9;i++)h.$('metroNextBeats').onclick();
 assert.equal(h.$('metroBeats').children[0].textContent,'64');assert.equal(h.$('metroNextBeats').disabled,true);
 h.$('metroBeats').children[0].onclick();const after=[...h.control.settings.accents];
 assert.deepEqual(after.slice(0,63),original.slice(0,63));assert.equal(after[63],(original[63]+2)%3);assert.equal(h.document.activeElement.textContent,'64');
 assert.equal(JSON.parse(h.saved.get('voiceline-metronome-v1')).accents.length,64);
 h.$('metroPreset').value='3/4';h.$('metroPreset').onchange();assert.equal(h.$('metroBeats').children.length,3);assert.equal(h.$('metroBeatPager').hidden,true);assert.equal(h.$('metroPrevBeats').disabled,true);
});
test('Local35 playback follows beat pages and reflows without changing the active metronome',async()=>{
 const h=mounted({numerator:64,bpm:60});await h.$('metroToggle').onclick();
 h.advance(10);h.advance(10.1);assert.equal(h.$('metroCount').textContent,'11');assert.match(h.$('metroBeatPage').textContent,/8–14/);
 h.resize(240);assert.match(h.$('metroBeatPage').textContent,/11–15/);assert.equal(h.control.running,true);assert.equal(h.control.settings.bpm,60);
 assert.equal(h.$('metroBeats').children.length,5);assert.ok(h.$('metroBeats').children.some(n=>n.textContent==='11'&&n.classes.has('beat-active')));
 h.control.stop();
});
test('Local37 custom meter selection focuses the inline field without silently altering the time signature',()=>{
 const h=mounted({numerator:7,denominator:8});h.$('metroPreset').value='custom';h.$('metroPreset').onchange();
 assert.equal(h.document.activeElement,h.$('metroNumerator'));assert.equal(h.control.settings.numerator,7);assert.equal(h.$('metroPreset').value,'7/8');
 h.$('metroNumerator').value='13';h.$('metroNumerator').onchange();assert.equal(h.control.settings.numerator,13);assert.equal(h.$('metroPreset').value,'custom');
});
test('Local36 slider updates BPM live and Enter completes manual entry',()=>{
 const h=mounted();h.$('metroBpmRange').value='123';h.$('metroBpmRange').oninput();assert.equal(h.$('metroBpm').value,'123');assert.equal(h.control.settings.bpm,123);
 h.$('metroBpmRange').onchange();assert.equal(h.control.settings.bpm,123);
 h.$('metroBpm').value='160';h.$('metroBpm').focus();h.$('metroBpm').onkeydown({key:'Enter',preventDefault(){}});
 assert.equal(h.control.settings.bpm,160);assert.equal(h.document.activeElement,null);
});
