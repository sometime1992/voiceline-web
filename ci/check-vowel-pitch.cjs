'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function(page,choose,geometry,graphPixels,frames,output){
 await page.setViewportSize({width:390,height:844});await choose(page,'practice');
 await page.locator('#guideKind').selectOption('vowels');await page.locator('#guidePattern').selectOption('vowelFive');
 assert.match(await page.locator('#guidePhaseHint').textContent(),/ア|아/);
 await page.locator('#customTimingOpen').click();await page.getByLabel('기준음',{exact:true}).selectOption('60');await page.getByRole('radio',{name:'바로 따라 부르기',exact:true}).check();
 for(const [label,n]of [['한 음 길이 (초)',.6],['발성 전 들이쉬기 (초)',.3],['모음 사이·회차 끝 쉬기 (초)',.4],['다섯 모음 세트 수',1]]){const input=page.locator('#planEditor').getByLabel(label,{exact:true});await input.evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});await input.fill(String(n));}
 await page.locator('#planSave').click();await page.locator('#mainButton').click();await page.waitForFunction(()=>window.__vowelPitchCourse&&window.__micRequest);
 const request=await page.evaluate(()=>{
  const request=window.__micRequest;window.__vowelsSeen=[];
  const send=()=>{if(window.__micRequest!==request)return;const p=window.VoiceLineGuideTraining.position(window.__vowelPitchCourse,performance.now());
   if(p.phase==='answer'&&!window.__vowelsSeen.includes(p.vowel))window.__vowelsSeen.push(p.vowel);
   const pcm=new Int16Array(4096),hz=440*Math.pow(2,(p.midi-69)/12);
   for(let i=0;i<pcm.length;i++)pcm[i]=Math.round(.2*32767*Math.sin(2*Math.PI*hz*i/44100));let raw='';for(const b of new Uint8Array(pcm.buffer))raw+=String.fromCharCode(b);window.VoiceLineNativeAudio.onAudioChunk(btoa(raw),44100,request);};
  send();window.__vowelPitchSignal=setInterval(send,40);return request;
 });
 await page.waitForFunction(()=>document.querySelector('#guideVoicePanel').dataset.phase==='answer');assert.match(await page.locator('#guidePhaseTitle').textContent(),/아/);
 assert.equal((await geometry(page)).scroll,false);assert.ok((await graphPixels(page,'guidePhraseGraph')).goal>5);await page.screenshot({path:path.join(output,'portrait-vowel-pitch.png')});
 await page.waitForFunction(()=>document.querySelector('#guidePhaseTitle').textContent.includes('에'),{},{timeout:8000});
 await page.setViewportSize({width:844,height:390});await frames(page);assert.equal(await page.evaluate(()=>window.__micRequest),request);
 if(!await page.locator('#guideVoicePanel').isVisible())await page.locator('#graphToggle').click();await frames(page);assert.equal((await geometry(page)).scroll,false);
 await page.screenshot({path:path.join(output,'landscape-vowel-pitch.png')});
 await page.locator('#graphToggle').click();assert.match(await page.locator('#graphHiddenStatus').textContent(),/아|에|이|오|우/);assert.equal(await page.evaluate(()=>window.__micRequest),request);await page.locator('#graphToggle').click();
 await page.waitForFunction(()=>!document.querySelector('#trainingResultDialog').hidden,{},{timeout:35000});await page.evaluate(()=>clearInterval(window.__vowelPitchSignal));
 assert.equal(await page.locator('#trainingResultStatus').textContent(),'성공');
 const facts=await page.evaluate(()=>{const s=window.__vowelPitchCourse;return {status:'passed',pattern:s.settings.pattern,smooth:s.smooth,steps:s.pattern.steps,vowels:window.__vowelsSeen,sets:s.sets,phrases:s.rounds,duration:s.duration,metrics:window.VoiceLineGuideTraining.metrics(s),bins:s.bins.map((bins,i)=>({vowel:s.pattern.vowels[i%5],notes:bins.map(b=>({midi:b.midi,voiced:b.voiced,expected:b.expected}))}))};});
 assert.deepEqual(facts.vowels,['아','에','이','오','우']);assert.equal(facts.smooth,false);assert.equal(facts.sets,1);assert.equal(facts.phrases,5);assert.equal(facts.duration,29000);assert.ok(facts.metrics.each);
 fs.writeFileSync(path.join(output,'vowel-pitch.json'),JSON.stringify(facts,null,2));await page.screenshot({path:path.join(output,'landscape-vowel-pitch-result.png')});
 await page.locator('#trainingResultClose').click();await page.setViewportSize({width:390,height:844});
};
