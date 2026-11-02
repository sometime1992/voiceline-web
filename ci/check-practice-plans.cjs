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
 await card.getByLabel('연습 패턴',{exact:true}).selectOption('triad');await card.getByLabel('기준음',{exact:true}).selectOption('48');await card.getByLabel('진행 방식',{exact:true}).selectOption('false');await card.getByLabel('반복 시 기준음 이동',{exact:true}).selectOption('1');await card.getByLabel('가이드 소리',{exact:true}).selectOption('hum');await field('가이드 음량 (%)',37,card);await card.getByLabel('음정 허용 범위',{exact:true}).selectOption('75');
 for(const [label,value]of [['한 음 길이 (초)',.5],['먼저 듣기 전 준비 (초)',0],['발성 전 들이쉬기 (초)',0],['회차 사이 쉬기 (초)',0],['이 단계 반복 횟수',2]])await field(label,value,card);
 assert.match(await card.locator('.plan-selected').textContent(),/3화음.*C3.*반음/s);assert.match(await card.locator('.plan-preview').textContent(),/허밍 톤 37%/);await page.screenshot({path:path.join(output,'portrait-routine-guide-details.png')});
 card=await add('earVoice');await card.getByLabel('청음 방법',{exact:true}).selectOption('custom');await card.getByLabel('한 회차에서 들을 음 수',{exact:true}).selectOption('2');await card.getByLabel('기준음',{exact:true}).selectOption('55');await card.getByLabel('1번째 청음',{exact:true}).selectOption('60');await card.getByLabel('2번째 청음',{exact:true}).selectOption('64');
 for(const [label,value]of [['건반·기준음 음량 (%)',42],['시작 전 준비 (초)',0],['기준음 듣기 (초)',.5],['들이쉬기 (초)',0],['따라 부르기 (초)',.5],['음 사이 쉬기 (초)',.1],['이 단계 반복 횟수',1],['반복 사이 쉬기 (초)',0]])await field(label,value,card);
 assert.match(await card.locator('.plan-preview').textContent(),/C4.*E4/s);await page.screenshot({path:path.join(output,'portrait-routine-ear-details.png')});
 card=await add('metronome');await field('빠르기 (BPM)',113,card);await card.getByLabel('한 마디의 박 수',{exact:true}).selectOption('5');await card.getByLabel('박자표의 기준 음표',{exact:true}).selectOption('8');await card.getByLabel('BPM 기준',{exact:true}).selectOption('quarter');await card.getByLabel('한 박의 세분',{exact:true}).selectOption('2');await card.getByLabel('클릭 소리',{exact:true}).selectOption('wood');await field('메트로놈 음량 (%)',44,card);
 await card.locator('.plan-accents > summary').click();await card.getByLabel('3박 강세',{exact:true}).selectOption('0');await card.getByLabel('4박 강세',{exact:true}).selectOption('2');
 for(const [label,value]of [['진행 시간 (초)',1.4],['이 단계 반복 횟수',1],['반복 사이 쉬기 (초)',0]])await field(label,value,card);
 card=await add('piano');await card.getByLabel('건반 시작 옥타브',{exact:true}).selectOption('60');for(const [label,value]of [['건반·기준음 음량 (%)',26],['진행 시간 (초)',1.1],['이 단계 반복 횟수',1],['반복 사이 쉬기 (초)',0]])await field(label,value,card);
 await page.locator('#planSave').click();await page.locator('#planClose').click();
 // Change the standalone lesson after saving. The routine must execute its
 // selected settings, independently of this unrelated current screen state.
 await page.evaluate(()=>saveGuideOptions({...guideOptions(),pattern:'minor',root:62,sound:'vowel',volume:90,listenFirst:true}));
 const baseline=await page.evaluate(()=>({guide:{...guideOptions()},volume:app.pianoVolume,base:app.base,metro:{...app.metronome.settings}}));
 await page.reload();await page.waitForSelector('#keyboard .white-key');await routines();await page.locator('#planList').selectOption({label:'상세 설정 확인 루틴'});assert.equal(await page.locator('#planEditor .plan-step').count(),4);assert.match(await page.locator('#planEditor .plan-selected').first().textContent(),/3화음.*C3/s);
 await page.locator('#planRun').click();await page.waitForFunction(()=>app.training?.mode==='guideVoice'&&app.training.root===48);
 const live=await page.evaluate(()=>({pattern:app.training.settings.pattern,sound:app.training.settings.sound,volume:app.training.settings.volume,listenFirst:app.training.settings.listenFirst,tolerance:app.training.tolerance,noteMs:app.training.noteMs}));assert.deepEqual(live,{pattern:'triad',sound:'hum',volume:37,listenFirst:false,tolerance:75,noteMs:500});
 await page.waitForFunction(()=>app.training?.mode==='guideVoice'&&app.training.root===49,{},{timeout:6000});
 await page.waitForFunction(()=>app.training?.mode==='earVoice',{},{timeout:6000});assert.deepEqual(await page.evaluate(()=>app.training.earNotes),[60,64]);assert.equal(await page.evaluate(()=>app.pianoVolume),42);
 await page.waitForFunction(()=>app.mode==='metronome'&&app.metronome.running,{},{timeout:6000});assert.deepEqual(await page.evaluate(()=>({n:app.metronome.settings.numerator,d:app.metronome.settings.denominator,bpm:app.metronome.settings.bpm,unit:app.metronome.settings.unit,sub:app.metronome.settings.subdivision,sound:app.metronome.settings.sound,volume:app.metronome.settings.volume,accents:app.metronome.settings.accents})),{n:5,d:8,bpm:113,unit:'quarter',sub:2,sound:'wood',volume:44,accents:[2,1,0,2,1]});
 await page.waitForFunction(()=>app.mode==='piano'&&window.VoiceLinePlansUI.active,{},{timeout:4000});assert.equal(await page.evaluate(()=>app.base),60);assert.equal(await page.evaluate(()=>app.pianoVolume),26);await page.waitForFunction(()=>!window.VoiceLinePlansUI.active,{},{timeout:4000});
 const restored=await page.evaluate(()=>({guide:{...guideOptions()},volume:app.pianoVolume,base:app.base,metro:{...app.metronome.settings}}));assert.deepEqual(restored,baseline,'temporary routine settings leaked into standalone settings');
 report.push('detailed lesson, exact ear notes, rhythm and keyboard settings persist independently and match actual serial execution; root shifts and original settings restore');
 // Every remaining practice mode must expose its method controls, not only a
 // generic timer, and custom stage totals still belong to the total-time field.
 await routines();await page.locator('#planNew').click();await page.locator('#planName').fill('상세 항목 확인');
 for(const [mode,label]of [['sustainVoice','기준음'],['vibrato','기준음'],['pitch','건반 시작 옥타브'],['warmupVoice','단계 전환 안내음 켜기'],['dynamicVoice','강약 방법']]){card=await add(mode);assert.equal(await card.getByLabel(label,{exact:true}).count(),1);}
 card=page.locator('#planEditor .plan-step').last();await card.getByLabel('강약 방법',{exact:true}).selectOption('swell');await card.getByRole('checkbox',{name:'단계별 시간을 각각 입력',exact:true}).check();const times=card.locator('.plan-stage-fields input');for(let i=0;i<await times.count();i++)await times.nth(i).fill('1.5');assert.equal(await card.getByLabel('발성·진행 시간 (초)',{exact:true}).inputValue(),'4.5');assert.equal(await card.getByLabel('단계 전환 안내음 크기 (%)',{exact:true}).isEnabled(),true);await page.locator('#planClose').click();
 report.push('remaining voice modes expose method settings; dynamic custom stages update the correct total without disabling cue volume');
 fs.writeFileSync(path.join(output,'practice-plans.json'),JSON.stringify({status:'passed',checks:report},null,2));console.log('PASS: '+report.length+' custom timing and routine browser checks');
};
