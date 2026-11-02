'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Exercise real hit targets inside the scroll viewport. Checking the outer modal
// alone missed the Local64 footer covering its body and the oversized overview.
module.exports=async function checkReadability(page,choose,output){
 const report=[],modes=['piano','pitch','practice','record','vibrato','sustainVoice','earVoice','dynamicVoice','warmupVoice','metronome'];
 const viewports=[{width:360,height:640},{width:412,height:820},{width:844,height:370},{width:915,height:412},{width:740,height:360},{width:1024,height:600}];
 const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const body=()=>page.locator('#planScroll');
 async function reachable(node,label){
  await node.evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;e.scrollIntoView({block:'center'});});await frames();
  const box=await node.evaluate(e=>{const r=e.getBoundingClientRect(),s=document.querySelector('#planScroll').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,scrollTop:s.top,scrollBottom:s.bottom,scrollLeft:s.left,scrollRight:s.right,hit:hit===e||e.contains(hit)};});
  assert.ok(box.top>=box.scrollTop-1&&box.bottom<=box.scrollBottom+1,label+' outside the body scroll viewport '+JSON.stringify(box));
  assert.ok(box.left>=box.scrollLeft-1&&box.right<=box.scrollRight+1,label+' horizontal clipping');assert.ok(box.hit,label+' obstructed hit target');
 }
 async function layout(label){
  const g=await page.locator('.plan-modal').evaluate(e=>{
   const r=n=>{const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,height:b.height};};
   const s=document.querySelector('#planScroll');return {modal:r(e),head:r(e.querySelector('.modal-heading')),title:r(document.querySelector('#planTitle')),close:r(document.querySelector('#planClose')),scroll:r(s),actions:r(e.querySelector('.plan-actions')),scrollWidth:s.scrollWidth,clientWidth:s.clientWidth,outerScroll:e.scrollHeight>e.clientHeight+1,width:innerWidth,height:innerHeight};
  });
  assert.ok(g.modal.top>=-1&&g.modal.bottom<=g.height+1,label+' modal vertical clipping');
  assert.ok(g.modal.left>=-1&&g.modal.right<=g.width+1,label+' modal horizontal clipping');
  assert.ok(g.head.bottom<=g.scroll.top+1&&g.scroll.bottom<=g.actions.top+1,label+' overlapping header/body/actions');
  assert.ok(g.scroll.height>=100,label+' insufficient editable height');assert.ok(g.title.right<=g.close.left-4,label+' heading covers close');
  assert.ok(g.scrollWidth<=g.clientWidth+1,label+' horizontally scrolling body');assert.equal(g.outerScroll,false,label+' two competing scroll surfaces');
  for(const id of ['planSave','planRun','planClose'])assert.ok(await page.locator('#'+id).evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;}),label+' '+id+' obstructed');
  return g;
 }
 await page.setViewportSize(viewports[0]);await choose(page,'piano');
 for(const mode of modes){
  await choose(page,mode);
  for(const viewport of [{width:412,height:820},{width:844,height:370}]){
   await page.setViewportSize(viewport);await page.evaluate(()=>document.documentElement.style.fontSize='24px');await frames();
   const start=mode==='metronome'?page.locator('#metroToggle'):page.locator('#mainButton');
   assert.ok(await start.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;}),mode+' primary action clipped at 150%');
   await page.screenshot({path:path.join(output,'readable-main-'+mode+'-'+viewport.width+'-150.png')});
  }
  await page.locator('#customTimingOpen').click();
  assert.equal(await page.locator('#planLibrary').isVisible(),false,mode+' retains empty routine toolbar');
  assert.equal(await page.locator('.settings-route-preview').evaluate(e=>e.open),false,mode+' expands a large route before editing');
  for(const viewport of viewports)for(const scale of [1,1.2,1.5]){
   await page.setViewportSize(viewport);await page.evaluate(s=>{document.documentElement.style.fontSize=(16*s)+'px';document.querySelector('#planScroll').scrollTop=0;},scale);await frames();
   const label=mode+' '+viewport.width+'x'+viewport.height+' '+scale;await layout(label);
   // At least one actual setting, including its label, must be in the initial view.
   const first=page.locator('.settings-section[open] :is(select,input):not([type=radio]):not([type=checkbox])').first();
   if(await first.count())assert.ok(await first.evaluate(e=>{const r=e.getBoundingClientRect(),s=document.querySelector('#planScroll').getBoundingClientRect();return r.top>=s.top&&r.bottom<=s.bottom;}),label+' first setting hidden below the overview');
   const sections=page.locator('.settings-section');
   for(let i=0;i<await sections.count();i++){
    const section=sections.nth(i);await section.evaluate(e=>e.open=true);
    const controls=section.locator('input:not([disabled]):not([type=radio]):not([type=checkbox]),select:not([disabled])');
    if(await controls.count()){await reachable(controls.first(),label+' group '+i+' first');await reachable(controls.last(),label+' group '+i+' last');}
    await section.evaluate(e=>e.open=e.dataset.settingsGroup==='content');
   }
   await body().evaluate(e=>e.scrollTop=0);
   if(scale===1.5&&[412,844].includes(viewport.width))await page.screenshot({path:path.join(output,'readable-'+mode+'-'+viewport.width+'x'+viewport.height+'-150.png')});
   report.push(label);
  }
  await page.locator('#planClose').click();
 }
 // A software keyboard shortens the same modal; its last field stays reachable.
 await page.evaluate(()=>document.documentElement.style.fontSize='24px');await page.setViewportSize({width:844,height:370});await choose(page,'practice');await page.locator('#customTimingOpen').click();
 const kind=page.getByLabel('연습 종류',{exact:true});await kind.selectOption('vowels');
 const route=page.locator('.settings-route-preview');await route.locator('summary').click();
 const phase=page.locator('.settings-phase[data-kind=voice]').first();await phase.click();assert.equal(await route.evaluate(e=>e.open),true,'route expansion lost during editing');
 const timingGroup=page.locator('[data-settings-group=timing]');assert.equal(await timingGroup.evaluate(e=>e.open),true,'route did not reveal its editable time');
 const duration=page.getByLabel('한 음 길이 (초)',{exact:true});await duration.fill('1.3');
 const before=await duration.inputValue();await page.setViewportSize({width:844,height:240});await layout('landscape software keyboard');await reachable(duration,'focused duration with keyboard');
 await duration.fill('');await page.locator('#planSave').click();assert.equal(await page.locator('#planDialog').isVisible(),true,'empty duration was saved');await reachable(duration,'invalid duration with keyboard');
 await duration.fill(before);await page.setViewportSize({width:412,height:820});assert.equal(await duration.inputValue(),before,'rotation discarded draft');await page.locator('#planSave').click();
 await page.locator('#customTimingOpen').click();assert.equal(await body().evaluate(e=>e.scrollTop),0,'new settings open at stale scroll');assert.equal(await route.evaluate(e=>e.open),false,'new settings inherit expanded preview');await page.locator('#planClose').click();
 report.push('expanded route, direct edit, 240px keyboard, invalid field, rotation, save and clean reopen');
 // Routine steps use the same readable layout and have reachable final controls.
 await page.locator('#menuOpen').click();await page.locator('#openRoutines').click();await page.locator('#planNew').click();await page.locator('#planName').fill('가독성 검증');
 for(const mode of ['practice','earVoice','dynamicVoice','metronome']){await page.locator('#planAddMode').selectOption(mode);await page.locator('#planAdd').click();}
 for(const viewport of [{width:412,height:820},{width:844,height:370}]){
  await page.setViewportSize(viewport);await frames();await layout('routine '+viewport.width);
  const steps=page.locator('.plan-step');
  for(let i=0;i<await steps.count();i++){
   const card=steps.nth(i);await card.evaluate(e=>e.open=true);await frames();
   const field=card.locator('.settings-section input:not([disabled]):not([type=radio]):not([type=checkbox]),.settings-section select:not([disabled])').last();if(await field.count())await reachable(field,'routine step '+i);
   await reachable(card.locator('.settings-step-done'),'routine step done '+i);await card.locator('.settings-step-done').click();
  }
  await page.screenshot({path:path.join(output,'readable-routine-'+viewport.width+'-150.png')});report.push('routine steps '+viewport.width+' at 150%');
 }
 await page.locator('#planClose').click();
 // Shared explanation, help, privacy and records keep title and body separate.
 for(const viewport of [{width:360,height:640},{width:844,height:370}]){
  await page.setViewportSize(viewport);await choose(page,'pitch');await page.locator('#modeGuideButton').click();
  const h=await page.locator('#infoDialog').evaluate(e=>{const head=e.querySelector('.modal-heading').getBoundingClientRect(),body=e.querySelector('.info-body').getBoundingClientRect(),title=e.querySelector('h2').getBoundingClientRect(),close=e.querySelector('.close-btn').getBoundingClientRect();return {headBottom:head.bottom,bodyTop:body.top,bodyBottom:body.bottom,titleRight:title.right,closeLeft:close.left};});
  assert.ok(h.headBottom<=h.bodyTop+1&&h.bodyBottom<=viewport.height&&h.titleRight<=h.closeLeft,'information dialog clipping');
  await page.screenshot({path:path.join(output,'readable-explanation-'+viewport.width+'-150.png')});await page.locator('#infoClose').click();report.push('explanation '+viewport.width+' at 150%');
 }
 await page.evaluate(()=>document.documentElement.style.fontSize='');
 fs.writeFileSync(path.join(output,'settings-readability.json'),JSON.stringify({status:'passed',layouts:report.length,checks:report},null,2));
 console.log('PASS: '+report.length+' readable settings layouts, reachable controls and nonoverlapping actions');
};
