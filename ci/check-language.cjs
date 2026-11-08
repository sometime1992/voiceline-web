'use strict';
// Exercise the real app in both languages; no network translation service.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const web=path.resolve(__dirname,'../android-local44/app/src/main/assets/www'),out=path.resolve(__dirname,'../layout-report');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(web,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
 if(!file.startsWith(web+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.mp3')?'audio/mpeg':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
async function settle(page){await page.evaluate(()=>{window.VoiceLineI18n.render();return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
async function leftovers(page){return page.evaluate(()=>{
 const list=[],walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 let node;while(node=walk.nextNode()){
  const p=node.parentElement;if(!p||p.closest('script,style,[hidden],[data-i18n-ignore],textarea')||!p.getClientRects().length)continue;
  if(/[가-힣]/.test(node.nodeValue))list.push({text:node.nodeValue.trim(),id:p.id,tag:p.tagName});
 }
 for(const el of document.querySelectorAll('[aria-label],[title],[placeholder]')){
  if(el.closest('[hidden],[data-i18n-ignore]')||!el.getClientRects().length)continue;
  for(const attr of ['aria-label','title','placeholder'])if(/[가-힣]/.test(el.getAttribute(attr)||''))list.push({attr,text:el.getAttribute(attr),id:el.id});
 }
 return list;
});}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[],leaks=[],checks=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{window.VoiceLinePublicLinks={setLanguage(v){window.__nativeLanguage=v;}};window.VoiceLineNative={start(id){setTimeout(()=>window.VoiceLineNativeAudio.onState('started','',id,44100),0);},stop(){}};});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('#keyboard .white-key');
  const before=await page.evaluate(()=>({...localStorage}));
  await page.locator('#menuOpen').click();await page.locator('#appLanguage').selectOption('en');await settle(page);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.evaluate(()=>window.__nativeLanguage),'en');
  const after=await page.evaluate(()=>({...localStorage}));delete after['voiceline-language-v1'];assert.deepEqual(after,before,'language changed saved training settings');
  leaks.push(...(await leftovers(page)).map(x=>({screen:'menu',...x})));await page.locator('#menuClose').click();
  await page.reload();await page.waitForSelector('#keyboard .white-key');assert.equal(await page.locator('html').getAttribute('lang'),'en');checks.push('in-app language persists and changes no practice storage');
  for(const mode of ['piano','pitch','record','practice','sustainVoice','earVoice','dynamicVoice','vibrato','warmupVoice','metronome']){
   if(mode!=='piano'){await page.locator('#menuOpen').click();await page.locator('[data-screen="'+mode+'"]').click();}
   await settle(page);
   for(const viewport of [{width:390,height:844},{width:844,height:390},{width:360,height:640}]){
    await page.setViewportSize(viewport);await page.evaluate(()=>document.documentElement.style.fontSize='24px');await settle(page);
    leaks.push(...(await leftovers(page)).map(x=>({screen:mode,...x})));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),mode+' English horizontal page overflow');
   }
   await page.evaluate(()=>document.documentElement.style.fontSize='');await page.setViewportSize({width:390,height:844});
   await page.locator('#modeGuideButton').click();await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:mode+' guide',...x})));await page.locator('#infoClose').click();
   if(!['pitch','record'].includes(mode)){
    await page.locator('#customTimingOpen').click();await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:mode+' settings',...x})));
    await page.locator('#planRecommend').click();await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:mode+' recommendations',...x})));
    assert.equal(await page.locator('.recommendation-card').count(),3);
    await page.screenshot({path:path.join(out,'english-'+mode+'-recommendations.png')});
    await page.locator('[data-recommend-level=intermediate]').click();await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:mode+' editor',...x})));await page.locator('#planClose').click();
   }else assert.equal(await page.locator('#customTimingOpen').count(),0);
   checks.push(mode+' English screen, guide, presets and 150% layouts');
  }
  for(const screen of ['help','privacy','history']){await page.locator('#menuOpen').click();await page.locator('[data-screen="'+screen+'"]').click();await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen,...x})));await page.locator('#infoClose').click();}
  // A title that happens to equal a UI translation key is still user content.
  await page.evaluate(()=>{const e=document.createElement('strong');e.id='languageUserProbe';e.dataset.i18nIgnore='';e.textContent='성공 · 나의 루틴';document.body.append(e);});await settle(page);assert.equal(await page.locator('#languageUserProbe').textContent(),'성공 · 나의 루틴');await page.locator('#languageUserProbe').evaluate(e=>e.remove());
  await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('voiceline-plans-v1'));p.settings.vibrato={seconds:1,rounds:1,reference:0,breath:0,rest:0};p.settings.warmupVoice={rounds:1,prepare:0};localStorage.setItem('voiceline-plans-v1',JSON.stringify(p));const t=JSON.parse(localStorage.getItem('voiceline-training-v1'));Object.assign(t,{rounds:1,warmup:{inhale:1,exhale:1,hum:1,rest:0,cues:false}});localStorage.setItem('voiceline-training-v1',JSON.stringify(t));});
  await page.reload();await page.waitForSelector('#keyboard .white-key');
  for(const [mode,result]of [['vibrato','Not enough data'],['warmupVoice','Success']]){
   await page.locator('#menuOpen').click();await page.locator('[data-screen="'+mode+'"]').click();await page.locator('#mainButton').click();
   await page.locator('#trainingResultDialog').waitFor({state:'visible',timeout:8000});await settle(page);assert.equal(await page.locator('#trainingResultStatus').textContent(),result);leaks.push(...(await leftovers(page)).map(x=>({screen:mode+' live/result',...x})));await page.screenshot({path:path.join(out,'english-'+mode+'-result.png')});await page.locator('#trainingResultClose').click();
  }
  await page.locator('#menuOpen').click();await page.locator('#appLanguage').selectOption('ko');await settle(page);assert.equal(await page.locator('#menuTitle').textContent(),'연습 메뉴');await page.locator('#menuClose').click();checks.push('live results, native language handoff, user text preservation and lossless Korean restoration');
  fs.writeFileSync(path.join(out,'language-report.json'),JSON.stringify({checks,leaks,errors},null,2));
  assert.deepEqual(errors,[],'English runtime errors');assert.deepEqual(leaks,[],'Untranslated English UI; see language-report.json');
  console.log('PASS: '+checks.length+' bilingual integration groups');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
