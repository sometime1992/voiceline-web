'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function checkSettingsHold(page,choose,output){
 const {select,fill,locate,add}=require('./settings-actions.cjs')(page),report=[];
 const value=input=>input.evaluate(e=>Number(e.value));
 const pause=ms=>page.waitForTimeout(ms);
 const settled=async(input,expected,label)=>{await pause(550);assert.equal(await value(input),expected,label);};
 async function down(button){
  await button.scrollIntoViewIfNeeded();const r=await button.boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
 }
 for(const routine of [false,true])for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);await choose(page,'practice');
  let label,id;
  if(routine){
   await page.locator('#menuOpen').click();await page.locator('#openRoutines').click();
   await page.locator('#planNew').click();id=await add('rest');label='쉬는 시간 (초)';
  }else{
   await page.locator('#customTimingOpen').click();await select('연습 종류','vowels');label='한 음 길이 (초)';
  }
  await fill(label,1,id);const input=await locate(label,id);
  const field=input.locator('xpath=ancestor::*[contains(@class,"settings-unit")][1]'),plus=field.locator('.settings-number-plus'),minus=field.locator('.settings-number-minus');
  await plus.click();assert.equal(await value(input),1.1,'short click is one step');
  await plus.press('Space');assert.equal(await value(input),1.2,'keyboard click is one step');
  await down(plus);assert.equal(await value(input),1.3,'hold begins with one step');
  await page.waitForFunction(e=>Number(e.value)>=1.5,await input.elementHandle(),{timeout:2000});
  await page.mouse.up();await settled(input,await value(input),'release stops without an extra click');
  const before=await value(input);await down(minus);
  await page.waitForFunction(({e,n})=>Number(e.value)<n-.1,{e:await input.elementHandle(),n:before},{timeout:2000});
  await page.mouse.up();await settled(input,await value(input),'minus also repeats');
  await down(plus);const afterMove=await value(input),r=await plus.boundingBox();
  await page.mouse.move(r.x-12,r.y+r.height/2);await settled(input,afterMove,'moving off the button stops');await page.mouse.up();
  // Real touch events exercise capture, touch-action and touch cancellation in Chromium.
  const touch=await page.context().newCDPSession(page),box=await plus.boundingBox(),point={x:box.x+box.width/2,y:box.y+box.height/2};
  const beforeTouch=await value(input);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await page.waitForFunction(({e,n})=>Number(e.value)>n+.1,{e:await input.elementHandle(),n:beforeTouch},{timeout:2000});
  await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await settled(input,await value(input),'cancelled touch stops');await touch.detach();
  // Clamp at both bounds without leaving a repeat timer active.
  const limits=await input.evaluate(e=>({min:Number(e.min),max:Number(e.max),step:Number(e.step)}));
  for(const [button,bound,start]of [[plus,limits.max,limits.max-limits.step],[minus,limits.min,limits.min+limits.step]]){
   await fill(label,start,id);await down(button);assert.equal(await value(input),bound);assert.equal(await button.isDisabled(),true);
   await page.mouse.up();await settled(input,bound,'hold respects field limits');
  }
  await fill(label,1,id);await down(plus);const afterBlur=await value(input);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await settled(input,afterBlur,'window blur cancels');await page.mouse.up();
  await down(plus);const afterHidden=await value(input);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
  await settled(input,afterHidden,'background visibility cancels');await page.mouse.up();
  await down(plus);const afterClose=await value(input);await page.locator('#planClose').evaluate(e=>e.click());
  await settled(input,afterClose,'closing the dialog cancels');await page.mouse.up();
  report.push({scope:routine?'routine':'general',viewport,checks:['tap','keyboard','hold plus/minus','release','move outside','real touch cancel','minimum/maximum','window blur','background','close']});
 }
 // Integer settings use their own step size, and removed controls stop repeating.
 await page.setViewportSize({width:390,height:844});await choose(page,'practice');await page.locator('#customTimingOpen').click();
 await select('연습 종류','vowels');await fill('다섯 모음 세트 수',3);const integer=await locate('다섯 모음 세트 수'),plus=integer.locator('xpath=ancestor::*[contains(@class,"settings-unit")][1]').locator('.settings-number-plus');
 await down(plus);await page.waitForFunction(e=>Number(e.value)>=5,await integer.elementHandle(),{timeout:2000});
 const handle=await integer.elementHandle();await integer.evaluate(e=>e.closest('.settings-unit').remove());const removed=await handle.evaluate(e=>Number(e.value));
 await pause(550);assert.equal(await handle.evaluate(e=>Number(e.value)),removed,'detached field stops');assert.ok(Number.isInteger(removed));await page.mouse.up();await page.locator('#planClose').click();
 report.push({scope:'general',checks:['integer step','detached field']});
 fs.writeFileSync(path.join(output,'settings-hold.json'),JSON.stringify(report,null,2));
 return 'numeric hold in general/routine settings, portrait/landscape: tap/keyboard, plus/minus repeat, real touch cancel, release/leave, bounds, blur/background/close and detach';
};
