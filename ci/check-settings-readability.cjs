'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function checkReadability(page,choose,output){
 const modes=['piano','pitch','practice','record','vibrato','sustainVoice','earVoice','dynamicVoice','warmupVoice','metronome'],viewports=[{width:360,height:640},{width:412,height:820},{width:844,height:370},{width:915,height:412},{width:740,height:360},{width:697,height:360},{width:640,height:320},{width:1024,height:600}],report=[];
 const actions=require('./settings-actions.cjs')(page);let editPages=0;
 const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const assertContrast=require('./check-contrast.cjs')(page);
 async function frame(label){
  const g=await page.evaluate(()=>{const modal=document.querySelector('#planDialog .plan-modal'),body=document.querySelector('#planScroll'),head=modal.querySelector('.modal-heading'),foot=modal.querySelector('.plan-actions'),r=n=>{const q=n.getBoundingClientRect();return {top:q.top,bottom:q.bottom,left:q.left,right:q.right,height:q.height};};return {modal:r(modal),body:r(body),head:r(head),foot:r(foot),scroll:body.scrollHeight,client:body.clientHeight,horizontal:body.scrollWidth>body.clientWidth+1,width:innerWidth,height:innerHeight};});
  assert.ok(g.modal.top>=10&&g.modal.bottom<=g.height-10&&g.modal.left>=8&&g.modal.right<=g.width-8,label+' inset popup or clipping '+JSON.stringify(g));assert.ok(g.head.bottom<=g.body.top+1&&g.body.bottom<=g.foot.top+1,label+' overlaps');assert.equal(g.horizontal,false,label+' horizontal scroll');if(await actions.view()!=='edit'){assert.equal(await page.locator('#planPrev').isVisible(),false,label+' previous page removed');assert.equal(await page.locator('#planNext').isVisible(),false,label+' next page removed');}
  const hits=await page.locator('#planDialog button:not([hidden]):not(:disabled)').evaluateAll(ns=>ns.filter(n=>n.getBoundingClientRect().height&&n.getClientRects().length).filter(n=>!n.closest('[hidden]')).map(n=>{const b=n.getBoundingClientRect(),h=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);const a=document.querySelector('#planScroll').getBoundingClientRect(),fixed=n.closest('.plan-actions,.modal-heading');return {text:n.getAttribute('aria-label')||n.textContent,hit:h===n||n.contains(h)||!fixed&&(b.top<a.top||b.bottom>a.bottom),top:b.top,bottom:b.bottom};}).filter(x=>!x.hit));assert.deepEqual(hits,[],label+' obstructed controls');return g;
 }
 async function allSummaryPages(label){for(let i=0;i<100;i++){await frames();await frame(label+' page '+i);const next=page.locator('#planNext');if(!await next.isVisible()||await next.isDisabled())break;await next.click();}}
 async function allEditorPages(label){
  assert.equal(await actions.view(),'edit',label+' opens the actual editor directly');
  assert.equal(await page.locator('.settings-integrated-page:visible').count(),1,label+' must contain one editor');
  assert.equal(await page.locator('.settings-item-menu:visible').count(),0,label+' must not show another item-selection screen');
  await assertContrast('#planTitle,#planRun,.settings-label,.settings-topic-title,.settings-select-value,.settings-number-value strong',label);

  assert.equal(await page.locator('#planPrev').isVisible(),false);assert.equal(await page.locator('#planNext').isVisible(),false);
  const result=await page.evaluate(async()=>{
   const wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),issues=[],checks=[],area=document.querySelector('#planScroll'),root=document.querySelector('.settings-integrated-page');
   const units=[...root.querySelectorAll('.settings-unit')].filter(n=>!n.closest('[hidden]'));
   for(const unit of units){
    unit.scrollIntoView({block:'nearest'});await wait();const bounds=area.getBoundingClientRect();
    if(area.scrollWidth>area.clientWidth+1)issues.push('horizontal scrolling');
    for(const node of unit.querySelectorAll('button,select,input,strong')){
     if(node.disabled||node.hidden||node.closest('[hidden]'))continue;const b=node.getBoundingClientRect();if(!b.width||!b.height)continue;
     if(b.top<bounds.top-1||b.bottom>bounds.bottom+1||b.left<bounds.left-1||b.right>bounds.right+1)issues.push('clipped '+(node.getAttribute('aria-label')||node.textContent));
     if(node.matches('button,select,input')){const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);if(hit!==node&&!node.contains(hit))issues.push('blocked '+(node.getAttribute('aria-label')||node.textContent));}
    }
    checks.push({key:unit.dataset.unitId,height:area.clientHeight,scroll:area.scrollHeight});
   }
   return {issues,checks};
  });
  assert.deepEqual(result.issues,[],label);await frame(label+' fixed actions');editPages+=result.checks.length;return result;
 }
 await page.setViewportSize(viewports[0]);await choose(page,'piano');
 for(const mode of modes){
  await choose(page,mode);
  for(const viewport of [{width:412,height:820},{width:844,height:370}]){
   await page.setViewportSize(viewport);await page.evaluate(()=>document.documentElement.style.fontSize='24px');await frames();const start=mode==='metronome'?page.locator('#metroToggle'):page.locator('#mainButton');assert.ok(await start.evaluate(e=>{const b=e.getBoundingClientRect(),h=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return b.top>=0&&b.bottom<=innerHeight&&(h===e||e.contains(h));}),mode+' main start at 150%');
   await assertContrast('#modeTitle,#mainButton,#modeChip,#pianoVolumeValue,#metroBpm,#metroSignature,#metroCount,#metroVolumeValue',mode+' main');
   await page.screenshot({path:path.join(output,'readable-main-'+mode+'-'+viewport.width+'-150.png')});
  }
  for(const viewport of viewports)for(const scale of [1,1.2,1.5]){
   await page.setViewportSize(viewport);await page.evaluate(s=>document.documentElement.style.fontSize=(16*s)+'px',scale);const label=mode+' '+viewport.width+'x'+viewport.height+' '+scale;if(['pitch','record'].includes(mode)){await frames();assert.equal(await page.locator('#customTimingOpen').count(),0,label+' no settings button');assert.equal(await page.locator('#planDialog').isVisible(),false,label+' no settings popup');report.push(label+' direct controls');continue;}await page.locator('#customTimingOpen').click();await allSummaryPages(label+' current');await page.locator('#planSave').click();await frames();await allEditorPages(label);
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
   await page.setViewportSize(viewport);await actions.enter();await frames();await allEditorPages('custom '+mode+' '+viewport.width+' 150%');await page.locator('#planRun').click();await allSummaryPages('custom '+mode+' review '+viewport.width);await page.locator('#planBack').click();await allSummaryPages('custom '+mode+' details '+viewport.width);await page.locator('#planSave').click();await page.locator('#planSave').click();report.push('custom '+mode+' maximum list / detailed summary / '+viewport.width+' at 150%');
  }
  await page.locator('#planClose').click();
 }
 // Direct numeric input is optional; a short visual viewport must keep the focused control and actions visible.
 await page.setViewportSize({width:844,height:370});await page.evaluate(()=>document.documentElement.style.fontSize='24px');await choose(page,'practice');await page.locator('#customTimingOpen').click();await actions.select('연습 종류','vowels');await actions.fill('한 음 길이 (초)','1.3');await page.setViewportSize({width:360,height:240});await frames();await frame('portrait IME 150%');const input=page.getByLabel('한 음 길이 (초)',{exact:true});assert.equal(await input.isVisible(),true);assert.ok(await input.evaluate(e=>{const b=e.getBoundingClientRect(),a=document.querySelector('#planScroll').getBoundingClientRect();return b.top>=a.top&&b.bottom<=a.bottom+1;}));await input.fill('');await actions.locate('가이드 음량 (%)');await page.locator('#planRun').click();assert.equal(await actions.view(),'edit');await frame('invalid field recovery with IME');assert.equal(await input.inputValue(),'');await input.fill('1.3');await page.setViewportSize({width:412,height:820});await frames();await page.locator('#planRun').click();assert.equal(await actions.view(),'review');await page.locator('#planSave').click();assert.equal(await input.inputValue(),'1.3');await page.locator('#planClose').click();report.push('direct input / 360x240 IME / invalid hidden page / rotation / review back');
 // The complete 40-step routine scrolls in one composition view in either orientation.
 await page.evaluate(()=>{const api=window.VoiceLinePracticePlans,old=api.load(localStorage);old.routines=[api.routine({name:'40단계 화면 확인',rounds:1,steps:Array.from({length:40},(_,i)=>({mode:i%2?'earVoice':'practice'}))})];api.save(localStorage,old);});await page.reload();await page.waitForSelector('#keyboard .white-key');await page.locator('#menuOpen').click();await page.locator('#openRoutines').click();
 for(const viewport of [{width:412,height:820},{width:844,height:370}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>document.documentElement.style.fontSize='24px');await allSummaryPages('40-step summary '+viewport.width);await page.locator('#planSave').click();await frames();await frame('40-step item menu '+viewport.width);const topics=await page.locator('.settings-menu-entry').evaluateAll(ns=>ns.map(n=>n.dataset.topic).filter(k=>k.startsWith('step-')));assert.equal(topics.length,40);assert.equal(await page.locator('.settings-menu-entry[data-topic^=step-]:visible').count(),40,'all 40 steps share one scrolling view');assert.ok(await page.locator('#planScroll').evaluate(e=>e.scrollHeight>e.clientHeight),'long routine is scrollable');
  await actions.menu(topics.at(-1));await frames();await allEditorPages('last routine step '+viewport.width);await page.locator('#planBack').click();await page.locator('#planBack').click();report.push('40-step routine, final step focus, '+viewport.width+' at 150%');
 }
 await page.locator('#planClose').click();
 await page.evaluate(()=>{const api=window.VoiceLinePracticePlans,state=api.load(localStorage);state.routines=[api.routine({name:'사진과 같은 5단계 루틴',rounds:1,steps:['warmupVoice','practice','warmupVoice','vibrato','warmupVoice'].map(mode=>({mode}))})];api.save(localStorage,state);});await page.reload();await page.waitForSelector('#keyboard .white-key');await page.locator('#menuOpen').click();await page.locator('#openRoutines').click();
 await page.setViewportSize({width:412,height:820});await page.evaluate(()=>document.documentElement.style.fontSize='16px');await page.locator('#planSave').click();await frames();await frame('B popup 5-step composition 100%');assert.equal(await page.locator('.settings-menu-entry[data-topic^=step-]:visible').count(),5,'five stages fit the reference portrait popup');assert.equal(await page.locator('.plan-step-actions:visible').count(),1,'only selected stage exposes management');await page.screenshot({path:path.join(output,'popup-routine-412-100.png')});await page.locator('.settings-menu-entry[data-topic^=step-]').first().click();await frames();const glass=await page.locator('.plan-modal').evaluate(e=>({background:getComputedStyle(e).backgroundColor,radius:parseFloat(getComputedStyle(e).borderRadius),blur:getComputedStyle(e).backdropFilter}));assert.match(glass.background,/rgba\(/);assert.ok(glass.radius>=18);assert.match(glass.blur,/blur\(/);assert.equal(await page.locator('#planEditor [data-step-delete],#planEditor [data-step-move]').count(),0);assert.equal(await page.locator('.settings-integrated-page input[type=number]').count(),6);await frame('B popup warmup 100%');assert.ok(await page.locator('#planScroll').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'all warmup fields fit the reference portrait popup');await page.screenshot({path:path.join(output,'popup-warmup-412-100.png')});await page.locator('#planRun').click();assert.equal(await actions.view(),'routine');await page.locator('#planBack').click();report.push('B reference popup: translucent navy surface, mint actions, visible surrounding app, five routine stages, one expanded management strip, six warmup values, Apply returns to composition');
 for(const viewport of [{width:360,height:640},{width:412,height:820},{width:844,height:370}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>document.documentElement.style.fontSize='24px');await allSummaryPages('5-step current '+viewport.width);await page.locator('#planSave').click();await frames();await frame('5-step outline '+viewport.width);assert.equal(await page.locator('.settings-menu-entry[data-topic^=step-]').count(),5);await page.locator('.settings-menu-entry[data-topic^=step-]').first().click();await frames();await allEditorPages('5-step direct warmup '+viewport.width);assert.equal(await page.locator('.settings-integrated-page input[type=number]').count(),6);await page.locator('#planScroll').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(output,'single-step-warmup-'+viewport.width+'-150.png')});await page.locator('#planBack').click();await page.locator('#planBack').click();report.push('original overview/outline, direct single-page warmup, '+viewport.width+' at 150%');
 }
 await page.locator('#planClose').click();
 for(const viewport of [{width:360,height:640},{width:844,height:370}]){await page.setViewportSize(viewport);await choose(page,'pitch');await page.locator('#modeGuideButton').click();assert.ok(await page.locator('#infoDialog').evaluate(e=>{const h=e.querySelector('.modal-heading').getBoundingClientRect(),b=e.querySelector('.info-body').getBoundingClientRect();return h.bottom<=b.top+1&&b.bottom<=innerHeight;}));await page.locator('#infoClose').click();report.push('explanation '+viewport.width+' at 150%');}
 await page.evaluate(()=>document.documentElement.style.fontSize='');fs.writeFileSync(path.join(output,'settings-readability.json'),JSON.stringify({status:'passed',layouts:report.length,field_checks:editPages,requirement:'Inset translucent B settings popup, list composition, grouped rows, all fields in one direct editor, fixed actions, no horizontal overflow, optional numeric keyboard',checks:report},null,2));console.log('PASS: '+report.length+' focused settings flows; '+editPages+' individually accessible controls on a single editor');
};
