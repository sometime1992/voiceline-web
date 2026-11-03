'use strict';
const assert=require('node:assert/strict');
module.exports=function settingsActions(page){
 const dialog=page.locator('#planDialog'),editor=()=>page.locator('#planEditor>.settings-editor');
 const view=()=>dialog.getAttribute('data-view');
 async function menu(topic){
  const target=page.locator('.settings-menu-entry[data-topic="'+topic+'"]');assert.equal(await target.count(),1,'missing item '+topic);
  for(let guard=0;guard<60&&!await target.isVisible();guard++){
   const before=await target.evaluate(e=>{const all=[...e.parentElement.children],visible=all.findIndex(n=>!n.hidden);return all.indexOf(e)<visible;});await page.locator(before?'#planPrev':'#planNext').click();
  }
  await target.click();
 }
 async function enter(){const v=await view();if(['overview','saved'].includes(v))await page.locator('#planSave').click();}
 async function step(id){
  if(!id)return;await enter();if(await editor().getAttribute('data-step-id')===id&&['edit','menu'].includes(await view()))return;
  if(await view()==='edit')await page.locator('#planBack').click();if(await view()==='menu')await page.locator('#planBack').click();
  assert.equal(await view(),'routine');await menu('step-'+id);
 }
 async function locate(label,id){
  await enter();await step(id);let n=editor().getByLabel(label,{exact:true});assert.equal(await n.count(),1,'missing setting '+label);
  if(!await n.isVisible()){
   if(await view()==='edit')await page.locator('#planBack').click();const topic=await n.evaluate(e=>e.closest('.settings-unit').dataset.topic);await menu(topic);
   for(let guard=0;guard<40;guard++){
    const ready=await n.evaluate(e=>!e.closest('.settings-focus-page')?.hidden);if(ready)break;
    const earlier=await n.evaluate(e=>{const p=e.closest('.settings-focus-page'),all=[...p.parentElement.children];return all.indexOf(p)<all.findIndex(n=>!n.hidden);});await page.locator(earlier?'#planPrev':'#planNext').click();
   }
  }
  return n;
 }
 async function reveal(label,id){const n=await locate(label,id);if(await n.getAttribute('type')==='number'&&!await n.isVisible())await n.locator('xpath=ancestor::*[contains(@class,"settings-unit")][1]').locator('.settings-number-value,.settings-volume-value').click();return n;}
 async function fill(label,value,id){await (await reveal(label,id)).fill(String(value));}
 async function select(label,value,id){await (await reveal(label,id)).selectOption(String(value));}
 async function choice(text,id){await enter();await step(id);const options=editor().locator('select option').filter({hasText:new RegExp('^'+text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')});assert.equal(await options.count(),1,'choice '+text);const info=await options.evaluate(e=>({label:e.parentElement.getAttribute('aria-label'),value:e.value}));await select(info.label,info.value,id);}
 async function save(close=true){await page.locator('#planRun').click();assert.equal(await view(),'review');await page.locator('#planRun').click();assert.equal(await view(),'saved');if(close)await page.locator('#planClose').click();}
 async function reviewText(){let result='';await page.locator('#planRun').click();assert.equal(await view(),'review');for(let i=0;i<80;i++){result+=await page.locator('#planEditor').textContent();const next=page.locator('#planNext');if(!await next.isVisible()||await next.isDisabled())break;await next.click();}await page.locator('#planSave').click();return result;}
 async function add(mode){await enter();if(await view()==='edit')await page.locator('#planBack').click();if(await view()==='menu')await page.locator('#planBack').click();assert.equal(await view(),'routine');await menu('routine-add');await page.locator('#planAddMode').selectOption(mode);await page.locator('#planAdd').click();assert.equal(await view(),'menu');return editor().getAttribute('data-step-id');}
 return {view,editor,menu,enter,step,locate,reveal,fill,select,choice,save,reviewText,add};
};
