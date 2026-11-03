'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function checkReadability(page,choose,output){
 const modes=['piano','pitch','practice','record','vibrato','sustainVoice','earVoice','dynamicVoice','warmupVoice','metronome'],viewports=[{width:360,height:640},{width:412,height:820},{width:844,height:370},{width:915,height:412},{width:740,height:360},{width:697,height:360},{width:640,height:320},{width:1024,height:600}],report=[];
 const actions=require('./settings-actions.cjs')(page);let editPages=0;
 const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 async function frame(label){
  const g=await page.evaluate(()=>{const modal=document.querySelector('#planDialog .plan-modal'),body=document.querySelector('#planScroll'),head=modal.querySelector('.modal-heading'),foot=modal.querySelector('.plan-actions'),r=n=>{const q=n.getBoundingClientRect();return {top:q.top,bottom:q.bottom,left:q.left,right:q.right,height:q.height};};return {modal:r(modal),body:r(body),head:r(head),foot:r(foot),scroll:body.scrollHeight,client:body.clientHeight,horizontal:body.scrollWidth>body.clientWidth+1,width:innerWidth,height:innerHeight};});
  assert.ok(g.modal.top>=-1&&g.modal.bottom<=g.height+1&&g.modal.left>=-1&&g.modal.right<=g.width+1,label+' modal clipping '+JSON.stringify(g));assert.ok(g.head.bottom<=g.body.top+1&&g.body.bottom<=g.foot.top+1,label+' overlaps');assert.ok(g.scroll<=g.client+1,label+' long body scroll '+JSON.stringify(g));assert.equal(g.horizontal,false,label+' horizontal scroll');
  const hits=await page.locator('#planDialog button:not([hidden]):not(:disabled)').evaluateAll(ns=>ns.filter(n=>n.getBoundingClientRect().height&&n.getClientRects().length).filter(n=>!n.closest('[hidden]')).map(n=>{const b=n.getBoundingClientRect(),h=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {text:n.getAttribute('aria-label')||n.textContent,hit:h===n||n.contains(h),top:b.top,bottom:b.bottom};}).filter(x=>!x.hit));assert.deepEqual(hits,[],label+' obstructed controls');return g;
 }
 async function allSummaryPages(label){for(let i=0;i<100;i++){await frames();await frame(label+' page '+i);const next=page.locator('#planNext');if(!await next.isVisible()||await next.isDisabled())break;await next.click();}}
 async function allEditorPages(label){
  const result=await page.evaluate(async()=>{
   const wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),issues=[],checks=[];
   function check(name){
    const area=document.querySelector('#planScroll'),page=document.querySelector('#planEditor .settings-focus-page:not([hidden])'),view=document.querySelector('#planDialog').dataset.view;
    if(area.scrollHeight>area.clientHeight+1)issues.push(name+' '+view+' scroll '+area.scrollHeight+'/'+area.clientHeight);
    if(area.scrollWidth>area.clientWidth+1)issues.push(name+' horizontal scroll');
    if(page&&view==='edit'){
     const units=[...page.children].filter(n=>n.classList.contains('settings-unit'));if(units.length>2)issues.push(name+' '+units.length+' settings');
     for(const node of page.querySelectorAll('button,select,input:not([type=checkbox])')){if(node.disabled||node.hidden||node.closest('[hidden]'))continue;const b=node.getBoundingClientRect();if(!b.width||!b.height)continue;const a=area.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);if(b.top<a.top-1||b.bottom>a.bottom+1||b.left<a.left-1||b.right>a.right+1)issues.push(name+' clipped '+(node.getAttribute('aria-label')||node.textContent));if(hit!==node&&!node.contains(hit))issues.push(name+' blocked '+(node.getAttribute('aria-label')||node.textContent));}
     checks.push({topic:page.dataset.settingsGroup,key:page.dataset.pageKey,units:units.length,height:area.clientHeight,scroll:area.scrollHeight});
    }
    for(const id of ['planBack','planClose','planPrev','planRun','planNext']){const node=document.getElementById(id);if(node.hidden||node.disabled)continue;const b=node.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);if(b.top<0||b.bottom>innerHeight+1||hit!==node&&!node.contains(hit))issues.push(name+' fixed '+id);}
   }
   const box=document.querySelector('#planEditor>.settings-editor'),topics=[...box.querySelectorAll('.settings-menu-entry')].filter(n=>box.querySelector('.settings-focus-page[data-settings-group="'+n.dataset.topic+'"]')).map(n=>n.dataset.topic);
   for(const topic of topics){
    if(document.querySelector('#planDialog').dataset.view==='edit'){document.getElementById('planBack').click();await wait();}
    const entry=[...box.querySelectorAll('.settings-menu-entry')].find(n=>n.dataset.topic===topic);
    for(let i=0;i<60&&entry.hidden;i++){const all=[...entry.parentElement.children],start=all.findIndex(n=>!n.hidden);document.getElementById(all.indexOf(entry)<start?'planPrev':'planNext').click();await wait();}
    if(entry.hidden){issues.push('unreachable menu '+topic);continue;}check('menu '+topic);entry.click();await wait();
    for(let guard=0;guard<50;guard++){
     check(topic);const pages=[...box.querySelectorAll('.settings-focus-page')],index=pages.findIndex(n=>!n.hidden);
     if(index<0||index===pages.length-1||pages[index+1].dataset.settingsGroup!==topic)break;document.getElementById('planNext').click();await wait();
    }
   }
   return {issues,checks};
  });
  assert.deepEqual(result.issues,[],label);editPages+=result.checks.length;return result;
 }
 await page.setViewportSize(viewports[0]);await choose(page,'piano');
 for(const mode of modes){
  await choose(page,mode);
  for(const viewport of [{width:412,height:820},{width:844,height:370}]){
   await page.setViewportSize(viewport);await page.evaluate(()=>document.documentElement.style.fontSize='24px');await frames();const start=mode==='metronome'?page.locator('#metroToggle'):page.locator('#mainButton');assert.ok(await start.evaluate(e=>{const b=e.getBoundingClientRect(),h=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return b.top>=0&&b.bottom<=innerHeight&&(h===e||e.contains(h));}),mode+' main start at 150%');
   await page.screenshot({path:path.join(output,'readable-main-'+mode+'-'+viewport.width+'-150.png')});
  }
  for(const viewport of viewports)for(const scale of [1,1.2,1.5]){
   await page.setViewportSize(viewport);await page.evaluate(s=>document.documentElement.style.fontSize=(16*s)+'px',scale);await page.locator('#customTimingOpen').click();const label=mode+' '+viewport.width+'x'+viewport.height+' '+scale;await allSummaryPages(label+' current');await page.locator('#planSave').click();await frames();await allEditorPages(label);
   assert.equal(await page.locator('.settings-number-input:not([hidden]),.settings-volume-row input[type=number]:not([hidden])').count(),0,label+' opens the number keyboard by default');
   await page.locator('#planRun').click();assert.equal(await actions.view(),'review');await allSummaryPages(label+' review');await page.locator('#planSave').click();assert.equal(await actions.view(),'edit');await frame(label+' return to edit');
   if(scale===1.5&&[412,844].includes(viewport.width))await page.screenshot({path:path.join(output,'focused-'+mode+'-'+viewport.width+'-150.png')});await page.locator('#planClose').click();report.push(label);
  }
 }
 // Maximum-length custom lists keep the same small editor instead of adding controls.
 for(const mode of ['earVoice','metronome','dynamicVoice']){
  await page.setViewportSize({width:412,height:820});await page.evaluate(()=>document.documentElement.style.fontSize='24px');await choose(page,mode);await page.locator('#customTimingOpen').click();
  if(mode==='earVoice'){await actions.select('청음 방법','custom');await actions.select('한 회차에서 들을 음 수',20);await actions.select('편집할 청음 순서',19);await actions.select('20번째 청음',84);}
  if(mode==='metronome'){await actions.select('박자표','custom');await actions.fill('한 마디의 박 수',64);await page.getByLabel('한 마디의 박 수',{exact:true}).press('Enter');await actions.select('편집할 박',63);await actions.select('선택한 박의 강세',2);}
  if(mode==='dynamicVoice')await actions.choice('단계별 시간');
  for(const viewport of [{width:360,height:640},{width:844,height:370}]){
   await page.setViewportSize(viewport);if(await actions.view()==='edit')await page.locator('#planBack').click();await frames();await allEditorPages('custom '+mode+' '+viewport.width+' 150%');await page.locator('#planRun').click();await allSummaryPages('custom '+mode+' review '+viewport.width);await page.locator('#planBack').click();await allSummaryPages('custom '+mode+' details '+viewport.width);await page.locator('#planSave').click();await page.locator('#planSave').click();report.push('custom '+mode+' maximum list / detailed summary / '+viewport.width+' at 150%');
  }
  await page.locator('#planClose').click();
 }
 // Direct numeric input is optional; a short visual viewport must keep the focused control and actions visible.
 await page.setViewportSize({width:844,height:370});await page.evaluate(()=>document.documentElement.style.fontSize='24px');await choose(page,'practice');await page.locator('#customTimingOpen').click();await actions.select('연습 종류','vowels');await actions.fill('한 음 길이 (초)','1.3');await page.setViewportSize({width:360,height:240});await frames();await frame('portrait IME 150%');const input=page.getByLabel('한 음 길이 (초)',{exact:true});assert.equal(await input.isVisible(),true);assert.ok(await input.evaluate(e=>{const b=e.getBoundingClientRect(),a=document.querySelector('#planScroll').getBoundingClientRect();return b.top>=a.top&&b.bottom<=a.bottom+1;}));await input.fill('');await actions.select('가이드 소리','hum');await page.locator('#planRun').click();assert.equal(await actions.view(),'edit');await frame('invalid field recovery with IME');assert.equal(await input.inputValue(),'');await input.fill('1.3');await page.setViewportSize({width:412,height:820});await frames();await page.locator('#planRun').click();assert.equal(await actions.view(),'review');await page.locator('#planSave').click();assert.equal(await input.inputValue(),'1.3');await page.locator('#planClose').click();report.push('direct input / 360x240 IME / invalid hidden page / rotation / review back');
 // A 40-step routine is navigable without a long card list or a nested step editor.
 await page.evaluate(()=>{const api=window.VoiceLinePracticePlans,old=api.load(localStorage);old.routines=[api.routine({name:'40단계 화면 확인',rounds:1,steps:Array.from({length:40},(_,i)=>({mode:i%2?'earVoice':'practice'}))})];api.save(localStorage,old);});await page.reload();await page.waitForSelector('#keyboard .white-key');await page.locator('#menuOpen').click();await page.locator('#openRoutines').click();
 for(const viewport of [{width:412,height:820},{width:844,height:370}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>document.documentElement.style.fontSize='24px');await allSummaryPages('40-step summary '+viewport.width);await page.locator('#planSave').click();await frames();await frame('40-step item menu '+viewport.width);const topics=await page.locator('.settings-menu-entry').evaluateAll(ns=>ns.map(n=>n.dataset.topic).filter(k=>k.startsWith('step-')));assert.equal(topics.length,40);
  await actions.menu(topics.at(-1));await frames();await allEditorPages('last routine step '+viewport.width);await page.locator('#planBack').click();await page.locator('#planBack').click();await page.locator('#planBack').click();report.push('40-step routine, final step focus, '+viewport.width+' at 150%');
 }
 await page.locator('#planClose').click();
 for(const viewport of [{width:360,height:640},{width:844,height:370}]){await page.setViewportSize(viewport);await choose(page,'pitch');await page.locator('#modeGuideButton').click();assert.ok(await page.locator('#infoDialog').evaluate(e=>{const h=e.querySelector('.modal-heading').getBoundingClientRect(),b=e.querySelector('.info-body').getBoundingClientRect();return h.bottom<=b.top+1&&b.bottom<=innerHeight;}));await page.locator('#infoClose').click();report.push('explanation '+viewport.width+' at 150%');}
 await page.evaluate(()=>document.documentElement.style.fontSize='');fs.writeFileSync(path.join(output,'settings-readability.json'),JSON.stringify({status:'passed',layouts:report.length,edit_pages:editPages,requirement:'No body scrolling; at most two settings per edit page; optional numeric keyboard only',checks:report},null,2));console.log('PASS: '+report.length+' focused settings flows; '+editPages+' edit pages without body scrolling');
};
