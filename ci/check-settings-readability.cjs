'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Test every page at real hit targets, including the fixed menu after deep edits.
module.exports=async function checkReadability(page,choose,output){
 const report=[],modes=['piano','pitch','practice','record','vibrato','sustainVoice','earVoice','dynamicVoice','warmupVoice','metronome'];
 const viewports=[{width:360,height:640},{width:412,height:820},{width:844,height:370},{width:915,height:412},{width:740,height:360},{width:697,height:360},{width:640,height:320},{width:1024,height:600}];
 const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const body=()=>page.locator('#planScroll');
 async function reachable(node,label){
  await node.evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;e.scrollIntoView({block:'center'});});await frames();
  const box=await node.evaluate(e=>{const r=e.getBoundingClientRect(),s=document.querySelector('#planScroll').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,scrollTop:s.top,scrollBottom:s.bottom,scrollLeft:s.left,scrollRight:s.right,hit:hit===e||e.contains(hit)};});
  assert.ok(box.top>=box.scrollTop-1&&box.bottom<=box.scrollBottom+1,label+' outside the body '+JSON.stringify(box));assert.ok(box.left>=box.scrollLeft-1&&box.right<=box.scrollRight+1,label+' horizontal clipping');assert.ok(box.hit,label+' obstructed hit target');
 }
 async function hit(node,label){assert.ok(await node.evaluate(e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight+1&&(h===e||e.contains(h));}),label+' obstructed');}
 async function layout(label){
  const g=await page.locator('.plan-modal').evaluate(e=>{
   const r=n=>{const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,height:b.height};};
   const s=document.querySelector('#planScroll');return {modal:r(e),head:r(e.querySelector('.modal-heading')),title:r(document.querySelector('#planTitle')),close:r(document.querySelector('#planClose')),scroll:r(s),actions:r(e.querySelector('.plan-actions')),scrollWidth:s.scrollWidth,clientWidth:s.clientWidth,outerScroll:e.scrollHeight>e.clientHeight+1,width:innerWidth,height:innerHeight};
  });
  assert.ok(g.modal.top>=-1&&g.modal.bottom<=g.height+1,label+' modal vertical clipping');assert.ok(g.modal.left>=-1&&g.modal.right<=g.width+1,label+' modal horizontal clipping');
  assert.ok(g.head.bottom<=g.scroll.top+1&&g.scroll.bottom<=g.actions.top+1,label+' overlapping header/body/actions');assert.ok(g.scroll.height>=(g.height<=300?55:90),label+' insufficient body height '+g.scroll.height);
  assert.ok(g.title.right<=g.close.left-4,label+' heading covers close');assert.ok(g.scrollWidth<=g.clientWidth+1,label+' horizontally scrolling body');assert.equal(g.outerScroll,false,label+' competing scroll surfaces');
  for(const id of ['planSave','planRun','planClose'])await hit(page.locator('#'+id),label+' '+id);
  const tabs=page.locator('#planPageNav [role=tab]');if(await tabs.count()&&await tabs.first().isVisible())for(let i=0;i<await tabs.count();i++)await hit(tabs.nth(i),label+' tab '+i);
 }
 await page.setViewportSize(viewports[0]);await choose(page,'piano');
 for(const mode of modes){
  await choose(page,mode);
  for(const viewport of [{width:412,height:820},{width:844,height:370}]){
   await page.setViewportSize(viewport);await page.evaluate(()=>document.documentElement.style.fontSize='24px');await frames();const start=mode==='metronome'?page.locator('#metroToggle'):page.locator('#mainButton');await hit(start,mode+' main action at 150%');await page.screenshot({path:path.join(output,'readable-main-'+mode+'-'+viewport.width+'-150.png')});
  }
  await page.locator('#customTimingOpen').click();assert.equal(await page.locator('#planLibrary').isVisible(),false);assert.equal(await page.locator('#planDialog').getAttribute('data-view'),'overview');assert.equal(await page.locator('.settings-section:visible').count(),0,'opening settings must show current summary');
  assert.equal(await page.locator('.settings-route-preview').evaluate(e=>e.open),false);
  await layout(mode+' initial current summary');await page.locator('#planSave').click();
  for(const viewport of viewports)for(const scale of [1,1.2,1.5]){
   await page.setViewportSize(viewport);await page.evaluate(s=>{document.documentElement.style.fontSize=(16*s)+'px';document.querySelector('#planScroll').scrollTop=0;},scale);await frames();
   const label=mode+' '+viewport.width+'x'+viewport.height+' '+scale,keys=await page.locator('#planPageNav [role=tab]').evaluateAll(ns=>ns.map(n=>n.dataset.settingsPage));
   for(const key of keys){
    await page.locator('#planPageNav [data-settings-page='+key+']').click();await frames();await layout(label+' '+key);assert.equal(await page.locator('.settings-section:visible').count(),1,'only one edit page');assert.equal(await page.locator('.settings-overview:visible').count(),0,'overview pushes down edit fields');
    const section=page.locator('.settings-section[data-settings-group='+key+']'),controls=section.locator('input:not([disabled]):not([type=radio]):not([type=checkbox]),select:not([disabled])');
    if(await controls.count()){await reachable(controls.first(),label+' '+key+' first');await reachable(controls.last(),label+' '+key+' last');}
    else{const control=section.locator('input').first();if(await control.count())await reachable(control,label+' '+key+' choice');}
    // Even at the last field, every other page can be selected without scrolling up.
    for(const other of keys)await hit(page.locator('#planPageNav [data-settings-page='+other+']'),label+' fixed page menu '+other);
    if(scale===1.5&&[412,844].includes(viewport.width)&&key===keys[0]){await body().evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(output,'readable-'+mode+'-'+viewport.width+'x'+viewport.height+'-150.png')});}
   }
   await page.locator('#planRun').click();assert.equal(await page.locator('#planDialog').getAttribute('data-view'),'review');await layout(label+' review');await page.locator('#planSave').click();assert.equal(await page.locator('#planPageNav [aria-selected=true]').getAttribute('data-settings-page'),keys.at(-1),'review return loses page');report.push(label+' current/edit pages/review');
  }
  await page.locator('#planClose').click();
 }
 // Empty values survive page switches; save returns to the faulty page, even with an IME.
 await page.evaluate(()=>document.documentElement.style.fontSize='24px');await page.setViewportSize({width:844,height:370});await choose(page,'practice');await page.locator('#customTimingOpen').click();await page.locator('#planSave').click();await page.getByLabel('연습 종류',{exact:true}).selectOption('vowels');
 await page.getByRole('tab',{name:'시간·반복'}).click();const duration=page.getByLabel('한 음 길이 (초)',{exact:true});await duration.fill('1.3');await page.setViewportSize({width:844,height:240});await layout('landscape software keyboard');await reachable(duration,'focused duration with keyboard');await duration.fill('');await page.getByRole('tab',{name:'소리',exact:true}).click();await page.locator('#planRun').click();assert.equal(await page.locator('#planDialog').getAttribute('data-view'),'edit');await reachable(duration,'invalid duration with keyboard');
 await duration.fill('1.3');await page.setViewportSize({width:412,height:820});assert.equal(await duration.inputValue(),'1.3','rotation discarded draft');await page.locator('#planRun').click();await layout('portrait review after rotation');await page.locator('#planSave').click();assert.equal(await duration.inputValue(),'1.3');await page.locator('#planRun').click();await page.locator('#planRun').click();assert.equal(await page.locator('#planDialog').getAttribute('data-view'),'saved');await page.locator('#planClose').click();
 await page.locator('#customTimingOpen').click();assert.equal(await page.locator('#planDialog').getAttribute('data-view'),'overview');assert.equal(await body().evaluate(e=>e.scrollTop),0);assert.equal(await page.locator('.settings-route-preview').evaluate(e=>e.open),false);await page.locator('#planClose').click();report.push('240px IME, invalid hidden page, rotation, review/back, final save and current summary reopen');
 // Shared routine pages retain a reachable menu and final controls in either orientation.
 await page.locator('#menuOpen').click();await page.locator('#openRoutines').click();await page.locator('#planNew').click();await page.locator('#planName').fill('가독성 검증');for(const mode of ['practice','earVoice','dynamicVoice','metronome']){await page.locator('#planAddMode').selectOption(mode);await page.locator('#planAdd').click();}
 for(const viewport of [{width:412,height:820},{width:844,height:370}]){
  await page.setViewportSize(viewport);await frames();await layout('routine '+viewport.width);const steps=page.locator('.plan-step');
  for(let i=0;i<await steps.count();i++){
   const card=steps.nth(i);await card.evaluate(e=>e.open=true);await frames();const tabs=card.locator('[role=tab]');for(let j=0;j<await tabs.count();j++){await tabs.nth(j).click();const field=card.locator('.settings-section:visible :is(input,select):not([disabled]):not([type=radio]):not([type=checkbox])').last();if(await field.count())await reachable(field,'routine step '+i+' page '+j);}
   await reachable(card.locator('.settings-step-done'),'routine step done '+i);await card.locator('.settings-step-done').click();
  }
  await page.screenshot({path:path.join(output,'readable-routine-'+viewport.width+'-150.png')});report.push('routine pages '+viewport.width+' at 150%');
 }
 await page.locator('#planRun').click();assert.equal(await page.locator('#planDialog').getAttribute('data-view'),'review');await layout('whole routine final review');await page.locator('#planSave').click();assert.equal(await page.locator('.plan-step').count(),4);await page.locator('#planClose').click();
 for(const viewport of [{width:360,height:640},{width:844,height:370}]){
  await page.setViewportSize(viewport);await choose(page,'pitch');await page.locator('#modeGuideButton').click();const h=await page.locator('#infoDialog').evaluate(e=>{const head=e.querySelector('.modal-heading').getBoundingClientRect(),body=e.querySelector('.info-body').getBoundingClientRect(),title=e.querySelector('h2').getBoundingClientRect(),close=e.querySelector('.close-btn').getBoundingClientRect();return {headBottom:head.bottom,bodyTop:body.top,bodyBottom:body.bottom,titleRight:title.right,closeLeft:close.left};});assert.ok(h.headBottom<=h.bodyTop+1&&h.bodyBottom<=viewport.height&&h.titleRight<=h.closeLeft,'information dialog clipping');await page.screenshot({path:path.join(output,'readable-explanation-'+viewport.width+'-150.png')});await page.locator('#infoClose').click();report.push('explanation '+viewport.width+' at 150%');
 }
 await page.evaluate(()=>document.documentElement.style.fontSize='');fs.writeFileSync(path.join(output,'settings-readability.json'),JSON.stringify({status:'passed',layouts:report.length,checks:report},null,2));console.log('PASS: '+report.length+' settings flows with readable pages, fixed navigation and final review');
};
