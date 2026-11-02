'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function checkPlans(page,choose,output){
 const report=[];
 async function routines(){await page.locator('#menuOpen').click();await page.locator('#openRoutines').click();await page.locator('#planDialog').waitFor({state:'visible'});}
 async function field(label,value,scope=page){await scope.getByLabel(label,{exact:true}).fill(String(value));}
 await page.setViewportSize({width:390,height:844});await choose(page,'piano');
 // Every function uses the same direct-time dialog without removing its
 // existing piano, graph, audio or phrase settings.
 for(const mode of ['piano','pitch','practice','record','vibrato','sustainVoice','earVoice','dynamicVoice','warmupVoice','metronome']){
  await choose(page,mode);await page.locator('#customTimingOpen').click();assert.ok(await page.locator('#planEditor input[type=number]').count()>0,mode+' missing direct time');
  if(mode==='warmupVoice')assert.equal(await page.locator('#planEditor input[type=number]').count(),6,'warmup must expose four phases, preparation and repeats');
  if(mode==='record')assert.equal(await page.locator('#planEditor input[type=number]').count(),1,'one recording saves into one file');
  await page.locator('#planClose').click();report.push(mode+' direct-time settings');
 }
 await choose(page,'piano');await page.locator('#customTimingOpen').click();
 await field('진행 시간 (초, 0=직접 중단)',1.2);await field('반복 횟수 (0=무한 반복)',2);await field('반복 사이 쉬기 (초)',0);
 await page.locator('#planRun').click();await page.waitForFunction(()=>window.VoiceLinePlansUI.active);await page.waitForFunction(()=>!window.VoiceLinePlansUI.active,{},{timeout:7000});
 assert.equal(await page.locator('#mainButton').textContent(),'마이크 켜기','finite timer did not restore primary action');
 report.push('fractional duration and two timer rounds complete');
 await routines();await page.locator('#planName').fill('아침 확인 루틴');await page.locator('#planRoutineRounds').fill('2');
 await page.locator('#planAddMode').selectOption('piano');await page.locator('#planAdd').click();
 let card=page.locator('#planEditor .plan-step').nth(0);await card.locator('summary').click();
 await field('진행 시간 (초)',1,card);await field('이 단계 반복 횟수',1,card);await field('반복 사이 쉬기 (초)',0,card);
 await page.locator('#planAddMode').selectOption('rest');await page.locator('#planAdd').click();
 card=page.locator('#planEditor .plan-step').nth(1);await card.locator('summary').click();await field('발성·진행 시간 (초)',1,card);
 await card.getByRole('button',{name:'위로',exact:true}).click();assert.match(await page.locator('#planEditor summary').first().textContent(),/쉬기/);
 await page.locator('#planEditor summary').first().click();await page.locator('#planEditor .plan-step').first().getByRole('button',{name:'아래로',exact:true}).click();
 await page.locator('#planSave').click();await page.screenshot({path:path.join(output,'portrait-routine-editor.png')});
 await page.locator('#planRun').click();await page.waitForFunction(()=>window.VoiceLinePlansUI.active);await page.waitForFunction(()=>!window.VoiceLinePlansUI.active,{},{timeout:9000});
 assert.equal(await page.locator('#mainButton').textContent(),'마이크 켜기');
 await page.reload();await page.waitForSelector('#keyboard .white-key');await routines();assert.equal(await page.locator('#planList option').count(),1);assert.equal(await page.locator('#planName').inputValue(),'아침 확인 루틴');assert.equal(await page.locator('#planEditor .plan-step').count(),2);
 report.push('routine reorder, save, finite serial execution and reload persistence');
 await page.locator('#planNew').click();await page.locator('#planName').fill('삭제 확인 루틴');await page.locator('#planSave').click();assert.equal(await page.locator('#planList option').count(),2);
 await page.locator('#planDelete').click();await page.locator('#planDelete').click();assert.equal(await page.locator('#planList option').count(),1);assert.equal(await page.locator('#planName').inputValue(),'아침 확인 루틴');
 report.push('multiple routines and selective confirmed deletion');
 await page.locator('#planRoutineRounds').fill('0');await page.locator('#planRun').click();await page.waitForFunction(()=>window.VoiceLinePlansUI.active);await page.waitForTimeout(1300);
 await page.evaluate(()=>window.VoiceLineLifecycle.onPause());await page.waitForFunction(()=>!window.VoiceLinePlansUI.active);await page.waitForTimeout(1300);assert.equal(await page.locator('#planBanner').isVisible(),false);await page.evaluate(()=>window.VoiceLineLifecycle.onResume());
 await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.VoiceLinePlansUI.active),false);report.push('infinite routine cancels during a step and never restarts after background/resume');
 await choose(page,'dynamicVoice');await page.locator('#customTimingOpen').click();await page.getByText('단계별 시간을 각각 입력',{exact:true}).click();
 const stages=page.locator('.plan-stage-fields input');for(let i=0;i<await stages.count();i++)await stages.nth(i).fill(String(1.5+i*.5));
 assert.equal(await page.getByLabel('발성·진행 시간 (초)',{exact:true}).inputValue(),String(Array.from({length:await stages.count()},(_,i)=>1.5+i*.5).reduce((sum,n)=>sum+n,0)),'custom-stage total did not follow entered times');
 await page.screenshot({path:path.join(output,'portrait-custom-dynamics-times.png')});await page.locator('#planSave').click();await page.locator('#mainButton').click();await page.waitForFunction(()=>window.VoiceLinePlansUI.active);await page.locator('#mainButton').click();await page.waitForFunction(()=>!window.VoiceLinePlansUI.active);report.push('custom dynamics stages save, start and cancel');
 fs.writeFileSync(path.join(output,'practice-plans.json'),JSON.stringify({status:'passed',checks:report},null,2));console.log('PASS: '+report.length+' custom timing and routine browser checks');
};
