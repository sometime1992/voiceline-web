'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const metro=require('../app/src/main/assets/www/metronome.js');
const {mounted}=require('./metronome_harness.cjs');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const savedKey='voiceline-metronome-presets-v1';
test('Local36 live BPM changes continue through the current bar without cancelling its clicks',async()=>{
 const h=mounted();await h.$('metroToggle').onclick();h.advance(.8);assert.equal(h.$('metroCount').textContent,'2');
 const states=[...h.states],before=[...h.sources];h.$('metroBpmRange').value='120';h.$('metroBpmRange').oninput();
 assert.equal(h.control.settings.bpm,120);assert.equal(h.$('metroCount').textContent,'2');assert.deepEqual(h.states,states);assert.ok(before.every(o=>!o.cancelled));
 h.advance(1.3);assert.equal(h.$('metroCount').textContent,'3');assert.ok(Math.abs(h.sources[h.sources.length-1].time-1.295)<1e-10);h.control.stop();
});
test('Local36 volume and mute keep the current pulse and route silence through a master gain',async()=>{
 const h=mounted();await h.$('metroToggle').onclick();h.advance(.8);const states=[...h.states];
 h.$('metroVolume').value='20';h.$('metroVolume').oninput();assert.equal(h.gains[0].gain.value,.2);assert.equal(h.$('metroCount').textContent,'2');
 h.$('metroMuteQuick').onclick();assert.equal(h.gains[0].gain.value,0);assert.equal(h.control.settings.muted,true);assert.equal(h.$('metroMuteQuick').attrs['aria-pressed'],'true');
 h.advance(1.55);assert.equal(h.$('metroCount').textContent,'3');assert.equal(h.gains[0].gain.value,0);assert.equal(h.sources[h.sources.length-1].target.target,h.gains[0]);
 h.$('metroMuteQuick').onclick();assert.equal(h.gains[0].gain.value,.2);assert.equal(h.control.settings.volume,20);assert.deepEqual(h.states,states);
 h.$('metroMuteQuick').onclick();h.$('metroVolume').value='35';h.$('metroVolume').oninput();assert.equal(h.control.settings.muted,false);assert.equal(h.gains[0].gain.value,.35);assert.equal(h.$('metroCount').textContent,'3');h.control.stop();
});
test('Local36 the three sounds are distinct and changing sound leaves the current bar running',async()=>{
 const h=mounted();await h.$('metroToggle').onclick();h.advance(.8);const before=[...h.states];
 h.$('metroSound').value='wood';h.$('metroSound').onchange();h.advance(1.55);
 assert.equal(h.sources[h.sources.length-1].type,'triangle');assert.equal(h.sources[h.sources.length-1].hz,680);assert.equal(h.$('metroCount').textContent,'3');
 h.$('metroSound').value='bell';h.$('metroSound').onchange();h.advance(2.3);assert.equal(h.sources[h.sources.length-1].hz,1320);assert.deepEqual(h.states,before);h.control.stop();
 assert.equal(new Set(['click','wood','bell'].map(style=>metro.soundProfile(style,2).hz)).size,3);
});
test('Local36 every custom meter remains available while unsafe pulse density is rejected',()=>{
 for(let numerator=1;numerator<=64;numerator++)for(const denominator of metro.DENOMINATORS)assert.equal(metro.timingIssue({numerator,denominator,bpm:80,subdivision:8}),null);
 const unsafe={numerator:4,denominator:64,bpm:300,unit:'dottedQuarter',subdivision:8};assert.ok(metro.timingIssue(unsafe));
 const h=mounted({bpm:300,unit:'quarter'});h.$('metroDenominator').value='64';h.$('metroDenominator').onchange();
 assert.equal(h.control.settings.denominator,4);assert.equal(h.errors.length,1);assert.match(h.$('metroSettingNotice').textContent,/조합/);
 const restored=mounted(unsafe);assert.equal(restored.control.settings.unit,'beat');assert.equal(restored.control.settings.subdivision,1);
});
test('Local36 saving and loading a named rhythm preserves tempo, meter, accent, sound and level',()=>{
 const h=mounted();h.$('metroPreset').value='7/8';h.$('metroPreset').onchange();
 h.$('metroBpm').value='123';h.$('metroBpm').onchange();h.$('metroSound').value='bell';h.$('metroSound').onchange();h.$('metroVolume').value='40';h.$('metroVolume').oninput();
 h.$('metroBeats').children[2].onclick();h.$('metroPresetName').value='허밍 리듬';h.$('metroSavePreset').onclick();
 const presets=JSON.parse(h.saved.get(savedKey));assert.equal(presets.length,1);assert.equal(presets[0].settings.accents[2],0);
 const restored=mounted({},340,{presets});const card=restored.$('metroSavedList').children[0];assert.equal(card.children[0].children[0].textContent,'허밍 리듬');card.children[0].onclick();
 assert.equal(restored.control.settings.bpm,123);assert.equal(restored.control.settings.numerator,7);assert.equal(restored.control.settings.denominator,8);assert.equal(restored.control.settings.sound,'bell');assert.equal(restored.control.settings.volume,40);assert.equal(restored.control.settings.accents[2],0);
});
test('Local36 saved rhythm pages remain bounded and reach all 24 entries; deletion updates storage',()=>{
 const presets=Array.from({length:24},(_,i)=>({id:'preset-'+i,name:'리듬 '+i,settings:{bpm:80+i}}));
 const h=mounted({},340,{presets});assert.equal(h.$('metroSavedList').children.length,2);assert.equal(h.$('metroSavedCount').textContent,'24/24');
 for(let i=0;i<11;i++)h.$('metroSavedNext').onclick();assert.equal(h.$('metroSavedPage').textContent,'12 / 12');assert.equal(h.$('metroSavedNext').disabled,true);
 assert.equal(h.$('metroSavedList').children[1].children[0].children[0].textContent,'리듬 23');
 h.$('metroPresetName').value='초과';h.$('metroSavePreset').onclick();assert.equal(JSON.parse(h.saved.get(savedKey)).length,24);assert.match(h.$('metroPresetMessage').textContent,/최대 24/);
 h.$('metroSavedList').children[1].children[1].onclick();assert.equal(JSON.parse(h.saved.get(savedKey)).length,23);assert.equal(h.$('metroSavedCount').textContent,'23/24');assert.equal(h.$('metroSavedList').children.length,1);
});
test('Local36 empty or duplicate preset names do not silently overwrite a saved rhythm',()=>{
 const h=mounted();h.$('metroSavePreset').onclick();assert.match(h.$('metroPresetMessage').textContent,/이름/);assert.equal(h.saved.has(savedKey),false);
 h.$('metroPresetName').value='연습';h.$('metroSavePreset').onclick();const original=h.saved.get(savedKey);
 h.$('metroBpm').value='160';h.$('metroBpm').onchange();h.$('metroSavePreset').onclick();assert.equal(h.saved.get(savedKey),original);assert.match(h.$('metroPresetMessage').textContent,/같은 이름/);
});
test('Local36 preset storage errors leave the previous library and its visible entries intact',()=>{
 const h=mounted();h.failStorage(true);h.$('metroPresetName').value='연습';h.$('metroSavePreset').onclick();assert.equal(h.saved.has(savedKey),false);assert.equal(h.$('metroSavedList').children.length,0);assert.match(h.$('metroPresetMessage').textContent,/저장하지 못/);
 const original={id:'one',name:'보존',settings:{bpm:80}},g=mounted({},340,{presets:[original]});g.failStorage(true);g.$('metroSavedList').children[0].children[1].onclick();assert.equal(g.$('metroSavedList').children.length,1);assert.equal(JSON.parse(g.saved.get(savedKey)).length,1);
});
test('Local36 malformed saved presets are filtered and names are rendered as plain text',()=>{
 const raw=JSON.stringify([{id:'safe',name:'<img onerror=bad>',settings:{}},{id:'safe',name:'duplicate id',settings:{}},{id:'../unsafe',name:'x',settings:{}},{id:'dense',name:'x',settings:{bpm:300,denominator:64,unit:'quarter',subdivision:8}}]);
 const parsed=metro.parsePresets(raw);assert.equal(parsed.length,1);assert.equal(metro.parsePresets('invalid').length,0);
 const h=mounted({},340,{presets:JSON.parse(raw)});assert.equal(h.$('metroSavedList').children[0].children[0].children[0].textContent,'<img onerror=bad>');
});
test('Local36 unmuting a zero level restores the last audible volume and BPM bound buttons disable',async()=>{
 const h=mounted({bpm:300});assert.equal(h.$('metroPlus').disabled,true);await h.$('metroToggle').onclick();
 h.$('metroVolume').value='35';h.$('metroVolume').oninput();h.$('metroVolume').value='0';h.$('metroVolume').oninput();h.$('metroMuteQuick').onclick();assert.equal(h.control.settings.volume,35);assert.equal(h.gains[0].gain.value,.35);assert.equal(h.control.running,true);
 h.$('metroBpm').value='20';h.$('metroBpm').onchange();assert.equal(h.$('metroMinus').disabled,true);h.control.stop();
});
