'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function checkPlans(page,choose,output){
 const report=[];
 async function routines(){await page.locator('#menuOpen').click();await page.locator('#openRoutines').click();await page.locator('#planDialog').waitFor({state:'visible'});}
 async function field(label,value,scope=page){await scope.getByLabel(label,{exact:true}).fill(String(value));}
 async function expand(card){if(await card.getAttribute('open')===null)await card.locator(':scope > summary').click();}
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
 let card=page.locator('#planEditor .plan-step').nth(0);await expand(card);
 await field('진행 시간 (초)',1,card);await field('이 단계 반복 횟수',1,card);await field('반복 사이 쉬기 (초)',0,card);
 await page.locator('#planAddMode').selectOption('rest');await page.locator('#planAdd').click();
 card=page.locator('#planEditor .plan-step').nth(1);await expand(card);await field('발성·진행 시간 (초)',1,card);
 await card.getByRole('button',{name:'위로',exact:true}).click();assert.match(await page.locator('#planEditor summary').first().textContent(),/쉬기/);
 await expand(page.locator('#planEditor .plan-step').first());await page.locator('#planEditor .plan-step').first().getByRole('button',{name:'아래로',exact:true}).click();
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
 const stages=page.locator('.plan-stage-fields input'),values=Array.from({length:await stages.count()},(_,i)=>[1.5,2.4,4.2,1.1,3][i]);for(let i=0;i<values.length;i++)await stages.nth(i).fill(String(values[i]));
 const total=String(Math.round(values.reduce((sum,n)=>sum+n,0)*10)/10);assert.equal(await page.getByLabel('발성·진행 시간 (초)',{exact:true}).inputValue(),total,'custom-stage total did not follow entered times');
 await page.screenshot({path:path.join(output,'portrait-custom-dynamics-times.png')});await page.locator('#planSave').click();assert.equal(await page.locator('#dynamicDuration').inputValue(),total,'saved stage total exposed a floating-point tail');await page.locator('#mainButton').click();await page.waitForFunction(()=>window.VoiceLinePlansUI.active);await page.locator('#mainButton').click();await page.waitForFunction(()=>!window.VoiceLinePlansUI.active);report.push('custom dynamics stages save, start and cancel');
 await choose(page,'piano');await routines();await page.locator('#planNew').click();await page.locator('#planName').fill('상세 설정 확인 루틴');
 async function add(mode){await page.locator('#planAddMode').selectOption(mode);await page.locator('#planAdd').click();const c=page.locator('#planEditor .plan-step').last();assert.notEqual(await c.getAttribute('open'),null,'new step must expose settings immediately');return c;}
 card=await add('practice');
 await card.getByLabel('연습 종류',{exact:true}).selectOption('steps');await card.getByLabel('음 길이 방식',{exact:true}).selectOption('seconds');
 await card.getByLabel('연습 패턴',{exact:true}).selectOption('triad');await card.getByLabel('기준음',{exact:true}).selectOption('48');await card.getByRole('radio',{name:'바로 따라 부르기',exact:true}).check();assert.equal(await card.getByRole('radio',{name:'먼저 듣고 따라 부르기',exact:true}).isVisible(),true);assert.equal(await card.getByLabel('먼저 듣기 전 준비 (초)',{exact:true}).isDisabled(),true);await card.getByLabel('반복 시 기준음 이동',{exact:true}).selectOption('1');await card.getByLabel('가이드 소리',{exact:true}).selectOption('hum');await field('가이드 음량 (%)',37,card);await card.getByLabel('음정 허용 범위',{exact:true}).selectOption('75');
 for(const [label,value]of [['한 음 길이 (초)',.5],['발성 전 들이쉬기 (초)',0],['회차 사이 쉬기 (초)',0],['이 단계 반복 횟수',2]])await field(label,value,card);
 assert.match(await card.locator('.plan-selected').textContent(),/3화음.*C3.*반음/s);assert.match(await card.locator('.plan-preview').textContent(),/허밍 톤 37%/);await page.screenshot({path:path.join(output,'portrait-routine-guide-details.png')});
 card=await add('practice');await card.getByLabel('연습 종류',{exact:true}).selectOption('steps');await card.getByLabel('음 길이 방식',{exact:true}).selectOption('seconds');await card.getByLabel('연습 패턴',{exact:true}).selectOption('hold');await card.getByLabel('기준음',{exact:true}).selectOption('60');await card.getByRole('radio',{name:'먼저 듣고 따라 부르기',exact:true}).check();assert.equal(await card.getByRole('radio',{name:'바로 따라 부르기',exact:true}).isVisible(),true);assert.equal(await card.getByLabel('먼저 듣기 전 준비 (초)',{exact:true}).isEnabled(),true);await card.getByLabel('반복 시 기준음 이동',{exact:true}).selectOption('0');
 for(const [label,value]of [['한 음 길이 (초)',.3],['먼저 듣기 전 준비 (초)',.2],['발성 전 들이쉬기 (초)',.4],['회차 사이 쉬기 (초)',0],['이 단계 반복 횟수',1]])await field(label,value,card);
 assert.match(await card.locator('.plan-selected').textContent(),/먼저 듣고 따라 부르기/);await card.locator('.plan-listen-choice').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'portrait-routine-listen-choice.png')});
 card=await add('earVoice');await card.getByLabel('청음 방법',{exact:true}).selectOption('custom');await card.getByLabel('한 회차에서 들을 음 수',{exact:true}).selectOption('2');await card.getByLabel('기준음',{exact:true}).selectOption('55');await card.getByLabel('1번째 청음',{exact:true}).selectOption('60');await card.getByLabel('2번째 청음',{exact:true}).selectOption('64');
 for(const [label,value]of [['건반·기준음 음량 (%)',42],['시작 전 준비 (초)',0],['기준음 듣기 (초)',.5],['들이쉬기 (초)',0],['따라 부르기 (초)',.5],['음 사이 쉬기 (초)',.1],['이 단계 반복 횟수',1],['반복 사이 쉬기 (초)',0]])await field(label,value,card);
 assert.match(await card.locator('.plan-preview').textContent(),/C4.*E4/s);await page.screenshot({path:path.join(output,'portrait-routine-ear-details.png')});
 card=await add('metronome');await field('빠르기 (BPM)',113,card);await card.getByLabel('한 마디의 박 수',{exact:true}).selectOption('5');await card.getByLabel('박자표의 기준 음표',{exact:true}).selectOption('8');await card.getByLabel('BPM 기준',{exact:true}).selectOption('quarter');await card.getByLabel('한 박의 세분',{exact:true}).selectOption('2');await card.getByLabel('클릭 소리',{exact:true}).selectOption('wood');await field('메트로놈 음량 (%)',44,card);
 await card.locator('.plan-accents > summary').click();await card.getByLabel('3박 강세',{exact:true}).selectOption('0');await card.getByLabel('4박 강세',{exact:true}).selectOption('2');
 for(const [label,value]of [['진행 시간 (초)',1.4],['이 단계 반복 횟수',1],['반복 사이 쉬기 (초)',0]])await field(label,value,card);
 card=await add('piano');await card.getByLabel('건반 시작 옥타브',{exact:true}).selectOption('60');for(const [label,value]of [['건반·기준음 음량 (%)',26],['진행 시간 (초)',1.1],['이 단계 반복 횟수',1],['반복 사이 쉬기 (초)',0]])await field(label,value,card);
 card=await add('vibrato');await card.getByLabel('기준음',{exact:true}).selectOption('72');for(const [label,value]of [['기준음 듣기 (초)',0],['들이쉬기 (초)',0],['발성·진행 시간 (초)',1.1],['이 단계 반복 횟수',1],['반복 사이 쉬기 (초)',0]])await field(label,value,card);
 await page.locator('#planSave').click();await page.locator('#planClose').click();
 // Change the standalone lesson after saving. The routine must execute its
 // selected settings, independently of this unrelated current screen state.
 await choose(page,'practice');await page.locator('#guideKind').selectOption('steps');await page.locator('#guidePattern').selectOption('minor');await page.locator('#guideSettingsOpen').click();await page.locator('#guideRoot').selectOption('62');await page.locator('#guideSound').selectOption('vowel');await page.locator('#guideListenFirst').selectOption('on');await page.locator('#guideVolume').evaluate(el=>{el.value='90';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#guideSettingsSave').click();
 await page.reload();await page.waitForSelector('#keyboard .white-key');const baseline=await page.evaluate(()=>window.__routineBridge.captureAll());await routines();await page.locator('#planList').selectOption({label:'상세 설정 확인 루틴'});assert.equal(await page.locator('#planEditor .plan-step').count(),6);assert.match(await page.locator('#planEditor .plan-selected').first().textContent(),/3화음.*C3/s);card=page.locator('#planEditor .plan-step').nth(1);await expand(card);assert.equal(await card.getByRole('radio',{name:'먼저 듣고 따라 부르기',exact:true}).isChecked(),true);
 await page.locator('#planRun').click();await page.waitForFunction(()=>window.__routineExecuted.some(x=>x.mode==='practice'&&x.round===1));
 const live=await page.evaluate(()=>window.__routineExecuted.find(x=>x.mode==='practice').settings.guide);assert.equal(live.root,48);assert.equal(live.pattern,'triad');assert.equal(live.sound,'hum');assert.equal(live.volume,37);assert.equal(live.listenFirst,false);assert.equal(live.tolerance,75);assert.equal(live.noteSeconds,.5);
 await page.waitForFunction(()=>window.__routineExecuted.some(x=>x.mode==='practice'&&x.round===2),{},{timeout:6000});assert.equal(await page.evaluate(()=>window.__routineExecuted.find(x=>x.mode==='practice'&&x.round===2).settings.guide.root),49);
 await page.waitForFunction(()=>window.__routineExecuted.some(x=>x.mode==='practice'&&x.settings.guide.root===60),{},{timeout:6000});assert.equal(await page.evaluate(()=>window.__routineExecuted.find(x=>x.mode==='practice'&&x.settings.guide.root===60).settings.guide.listenFirst),true);
 await page.waitForFunction(()=>document.querySelector('#guideVoicePanel').dataset.phase==='listen',{},{timeout:3000});assert.equal(await page.locator('#guideAccuracy').textContent(),'—','listen-first audio was scored');await page.waitForFunction(()=>document.querySelector('#guideVoicePanel').dataset.phase==='handoff',{},{timeout:3000});await page.waitForFunction(()=>document.querySelector('#guideVoicePanel').dataset.phase==='answer',{},{timeout:3000});
 await page.waitForFunction(()=>window.__routineExecuted.some(x=>x.mode==='earVoice'),{},{timeout:6000});const earLive=await page.evaluate(()=>window.__routineExecuted.find(x=>x.mode==='earVoice').settings);assert.deepEqual(earLive.training.earNotes,[60,64]);assert.equal(earLive.pianoVolume,42);
 await page.waitForFunction(()=>document.querySelector('#modeMessage').textContent.includes('목표 C4'),{},{timeout:4000});await page.waitForFunction(()=>document.querySelector('#modeMessage').textContent.includes('목표 E4'),{},{timeout:4000});
 await page.waitForFunction(()=>window.__routineExecuted.some(x=>x.mode==='metronome'),{},{timeout:6000});assert.deepEqual(await page.evaluate(()=>{const m=window.__routineExecuted.find(x=>x.mode==='metronome').settings.metronome;return {n:m.numerator,d:m.denominator,bpm:m.bpm,unit:m.unit,sub:m.subdivision,sound:m.sound,volume:m.volume,accents:m.accents};}),{n:5,d:8,bpm:113,unit:'quarter',sub:2,sound:'wood',volume:44,accents:[2,1,0,2,1]});assert.equal(await page.locator('#metroSignature').textContent(),'5/8');
 await page.waitForFunction(()=>window.__routineExecuted.some(x=>x.mode==='piano'),{},{timeout:4000});const pianoLive=await page.evaluate(()=>window.__routineExecuted.find(x=>x.mode==='piano').settings);assert.equal(pianoLive.base,60);assert.equal(pianoLive.pianoVolume,26);
 await page.waitForFunction(()=>window.__routineExecuted.some(x=>x.mode==='vibrato'),{},{timeout:4000});const vibratoLive=await page.evaluate(()=>window.__routineExecuted.find(x=>x.mode==='vibrato').settings);assert.equal(vibratoLive.vibratoRoot,72);assert.equal(vibratoLive.base,72,'selected vibrato reference is outside the visible keyboard');await page.waitForFunction(()=>!window.VoiceLinePlansUI.active,{},{timeout:4000});
 const restored=await page.evaluate(()=>window.__routineBridge.captureAll());assert.deepEqual(restored,baseline,'temporary routine settings leaked into standalone settings');assert.ok(await page.evaluate(()=>window.__routineExecuted.every(x=>x.started===true)));
 report.push('detailed lesson, exact ear notes, rhythm and keyboard settings persist independently and match actual serial execution; root shifts and original settings restore');
 report.push('both routine lesson methods remain visible, persist independently, and listen-first executes listening, breath handoff and response without grading listening');
 // Every remaining practice mode must expose its method controls, not only a
 // generic timer, and custom stage totals still belong to the total-time field.
 await routines();await page.locator('#planNew').click();await page.locator('#planName').fill('상세 항목 확인');
 for(const [mode,label]of [['sustainVoice','기준음'],['vibrato','기준음'],['pitch','건반 시작 옥타브'],['warmupVoice','단계 전환 안내음 켜기'],['dynamicVoice','강약 방법']]){card=await add(mode);assert.equal(await card.getByLabel(label,{exact:true}).count(),1);}
 card=page.locator('#planEditor .plan-step').last();await card.getByLabel('강약 방법',{exact:true}).selectOption('swell');await card.getByRole('checkbox',{name:'단계별 시간을 각각 입력',exact:true}).check();const times=card.locator('.plan-stage-fields input');for(let i=0;i<await times.count();i++)await times.nth(i).fill('1.5');assert.equal(await card.getByLabel('발성·진행 시간 (초)',{exact:true}).inputValue(),'4.5');assert.equal(await card.getByLabel('단계 전환 안내음 크기 (%)',{exact:true}).isEnabled(),true);await page.locator('#planClose').click();
 report.push('remaining voice modes expose method settings; dynamic custom stages update the correct total without disabling cue volume');
 fs.writeFileSync(path.join(output,'practice-plans.json'),JSON.stringify({status:'passed',checks:report},null,2));console.log('PASS: '+report.length+' custom timing and routine browser checks');
};
