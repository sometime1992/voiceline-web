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
  if(/[가-힣]/.test(node.nodeValue))list.push({text:node.nodeValue.trim(),source:window.VoiceLineI18n.originalText(node),id:p.id,tag:p.tagName});
 }
 for(const el of document.querySelectorAll('[aria-label],[aria-valuetext],[title],[placeholder],[alt]')){
  if(el.closest('[hidden],[data-i18n-ignore]')||!el.getClientRects().length)continue;
  for(const attr of ['aria-label','aria-valuetext','title','placeholder','alt'])if(/[가-힣]/.test(el.getAttribute(attr)||''))list.push({attr,text:el.getAttribute(attr),id:el.id});
 }
 return list;
});}
async function clippedText(page){return page.evaluate(()=>{
 const problems=[];
 const selectors='#menuDialog .menu-tile strong,#menuDialog .menu-tile small,.language-setting label,#modeTitle,.mode-heading-row button,#mainButton,#exerciseControls button,#planDialog .settings-label label,#planDialog .settings-select-value,#planDialog .plan-actions button,#planTitle,.training-result-modal h2';
 for(const el of document.querySelectorAll(selectors)){
  const style=getComputedStyle(el),text=el.textContent.trim();
  if(!text||el.closest('[hidden]')||!el.getClientRects().length||style.display==='none'||style.visibility==='hidden')continue;
  const horizontal=el.scrollWidth>el.clientWidth+2,vertical=el.scrollHeight>el.clientHeight+2&&['hidden','clip'].includes(style.overflowY);
  if(horizontal||vertical)problems.push({id:el.id,tag:el.tagName,text,width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight});
 }
 return problems;
});}
async function inspectLiveResult(page,mode,leaks){
 const result=page.locator('#trainingResultDialog'),deadline=Date.now()+10000;
 while(!await result.isVisible()){
  assert.ok(Date.now()<deadline,mode+' timed English result did not complete');
  await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:mode+' live phase',...x})));
  await page.waitForTimeout(100);
 }
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[],leaks=[],layoutProblems=[],checks=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{Object.defineProperty(screen.orientation,'type',{get:()=>innerHeight>=innerWidth?'portrait-primary':'landscape-primary'});window.VoiceLinePublicLinks={setLanguage(v){window.__nativeLanguage=v;}};window.VoiceLineNative={start(id){setTimeout(()=>window.VoiceLineNativeAudio.onState('started','',id,44100),0);},stop(){}};});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('#keyboard .white-key');
  const before=await page.evaluate(()=>({...localStorage}));
  await page.locator('#menuOpen').click();await page.locator('#appLanguage').selectOption('en');await settle(page);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.evaluate(()=>window.__nativeLanguage),'en');
  const after=await page.evaluate(()=>({...localStorage}));delete after['voiceline-language-v1'];assert.deepEqual(after,before,'language changed saved training settings');
  leaks.push(...(await leftovers(page)).map(x=>({screen:'menu',...x})));
  for(const [name,viewport,scale] of [['portrait',{width:390,height:844},16],['compact',{width:360,height:640},16],['landscape',{width:844,height:390},16],['large-text',{width:390,height:844},24]]){
   await page.setViewportSize(viewport);await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',scale);await settle(page);
   layoutProblems.push(...(await clippedText(page)).map(x=>({screen:'menu '+name,...x})));await page.screenshot({path:path.join(out,'english-menu-'+name+'.png')});
  }
  await page.evaluate(()=>document.documentElement.style.fontSize='');await page.setViewportSize({width:390,height:844});await page.locator('#menuClose').click();
  await page.reload();await page.waitForSelector('#keyboard .white-key');assert.equal(await page.locator('html').getAttribute('lang'),'en');checks.push('in-app language persists and changes no practice storage');
  for(const mode of ['piano','pitch','record','practice','sustainVoice','earVoice','dynamicVoice','vibrato','warmupVoice','metronome']){
   if(mode!=='piano'){await page.locator('#menuOpen').click();await page.locator('[data-screen="'+mode+'"]').click();}
   await settle(page);
   if(mode==='vibrato')assert.equal(await page.locator('.vibrato-reference').first().evaluate(e=>getComputedStyle(e,'::after').content),'"Ref"');
   layoutProblems.push(...(await clippedText(page)).map(x=>({screen:mode+' default',...x})));
   await page.screenshot({path:path.join(out,'english-'+mode+'-screen.png')});
   for(const viewport of [{width:390,height:844},{width:844,height:390},{width:360,height:640}]){
    await page.setViewportSize(viewport);await page.evaluate(()=>document.documentElement.style.fontSize='24px');await settle(page);
    leaks.push(...(await leftovers(page)).map(x=>({screen:mode,...x})));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),mode+' English horizontal page overflow');
    layoutProblems.push(...(await clippedText(page)).map(x=>({screen:mode+' '+viewport.width+' large text',...x})));
   }
   await page.evaluate(()=>document.documentElement.style.fontSize='');await page.setViewportSize({width:390,height:844});
   await page.locator('#modeGuideButton').click();await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:mode+' guide',...x})));await page.locator('#infoClose').click();
   if(!['pitch','record'].includes(mode)){
    await page.locator('#customTimingOpen').click();await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:mode+' settings',...x})));
    await page.locator('#planRecommend').click();await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:mode+' recommendations',...x})));
    assert.equal(await page.locator('.recommendation-card').count(),3);
    await page.screenshot({path:path.join(out,'english-'+mode+'-recommendations.png')});
    await page.locator('[data-recommend-level=intermediate]').click();await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:mode+' editor',...x})));layoutProblems.push(...(await clippedText(page)).map(x=>({screen:mode+' editor',...x})));await page.screenshot({path:path.join(out,'english-'+mode+'-editor.png')});await page.locator('#planClose').click();
   }else assert.equal(await page.locator('#customTimingOpen').count(),0);
   checks.push(mode+' English screen, guide, presets and 150% layouts');
  }
  await page.locator('#menuOpen').click();await page.locator('#pianoCreditsOpen').click();await settle(page);
  assert.equal(await page.locator('#infoTitle').textContent(),'Piano sample credits and copyright');
  leaks.push(...(await leftovers(page)).map(x=>({screen:'piano credits',...x})));
  assert.deepEqual(await page.locator('.piano-credits-actions button').allTextContents(),['Open sample source','Open CC BY 3.0 license','All open-source notices']);
  await page.screenshot({path:path.join(out,'english-piano-credits.png')});
  await page.locator('.piano-credits-actions button').last().click();await settle(page);
  assert.equal(await page.locator('#infoTitle').textContent(),'Open-source licenses');
  assert.ok((await page.locator('.license-text').allTextContents()).some(t=>t.includes('Copyright (c) 2018 Adriano Di Giovanni')));
  await page.locator('#infoClose').click();checks.push('complete English piano attribution and pinned MIT estimator notice');
  // A synthetic, private browser recording exercises actual file controls. No
  // outward save/share call is allowed before fresh consent on each attempt.
  await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('voiceline-local-v2',4);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   const record={id:'release-language-recording',title:'English QA recording',timestamp:Date.now(),date:'2026-11-16',duration:1,mime:'audio/wav',blob:new Blob([new Uint8Array(46)],{type:'audio/wav'}),size:46,pitchTrack:[]};
   await new Promise((resolve,reject)=>{const tx=db.transaction(['recordings','recordingsMeta'],'readwrite');tx.objectStore('recordings').put(record);const {blob,pitchTrack,...meta}=record;tx.objectStore('recordingsMeta').put(meta);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
   window.__exportCalls=0;window.__originalPerform=VoiceLineDocuments.perform;VoiceLineDocuments.perform=async()=>{window.__exportCalls++;return {status:'cancelled',detail:'Sharing cancelled.'};};
  });
  await page.locator('#menuOpen').click();await page.locator('[data-screen=history]').click();await settle(page);
  await page.locator('.record-more').first().click();await settle(page);
  for(const [button,title]of [['#recordSaveFile','Copyright check before external save'],['#recordShare','Copyright check before sharing']]){
   await page.locator(button).click();await settle(page);
   assert.equal(await page.locator('#recordRightsTitle').textContent(),title);
   assert.equal(await page.locator('#recordRightsAgree').isChecked(),false);assert.equal(await page.locator('#recordRightsConfirm').isDisabled(),true);
   leaks.push(...(await leftovers(page)).map(x=>({screen:'recording rights '+button,...x})));
   await page.screenshot({path:path.join(out,button==='#recordShare'?'english-share-rights.png':'english-save-rights.png')});
   await page.locator('#recordRightsAgree').check();assert.equal(await page.locator('#recordRightsConfirm').isEnabled(),true);
   await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.__exportCalls),0);
  }
  await page.locator('#recordToolsClose').click();await page.locator('#infoClose').click();
  await page.evaluate(()=>{VoiceLineDocuments.perform=window.__originalPerform;});
  checks.push('English export/share warnings, unchecked consent, disabled approval and cancellation without external copy');
  for(const screen of ['help','privacy','history']){
   await page.locator('#menuOpen').click();await page.locator('[data-screen="'+screen+'"]').click();await settle(page);
   leaks.push(...(await leftovers(page)).map(x=>({screen,...x})));
   if(screen==='help'){
    await page.locator('#helpLicensesOpen').click();await settle(page);
    assert.equal(await page.locator('#infoTitle').textContent(),'Open-source licenses');
    assert.deepEqual(await page.locator('.license-text').allTextContents(),await page.evaluate(()=>window.VoiceLineThirdPartyNotices.map(n=>n.text)),'Upstream license text changed during translation');
    assert.ok((await page.locator('.license-text').allTextContents()).some(t=>t.includes('END OF TERMS AND CONDITIONS')),'Apache 2.0 full text is missing');
    leaks.push(...(await leftovers(page)).map(x=>({screen:'licenses',...x})));
    await page.screenshot({path:path.join(out,'english-open-source-licenses.png')});
    await page.getByRole('button',{name:'Back to Help',exact:true}).click();await settle(page);
    checks.push('offline licenses retain upstream text and English navigation');
   }
   await page.locator('#infoClose').click();
  }
  await page.locator('#menuOpen').click();await page.locator('#openRoutines').click();await settle(page);
  leaks.push(...(await leftovers(page)).map(x=>({screen:'routine overview',...x})));
  await page.locator('#planRecommend').click();await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:'routine presets',...x})));
  await page.locator('[data-recommend-level=intermediate]').click();await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:'routine builder',...x})));
  await page.locator('#planRun').click();await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:'routine review',...x})));await page.locator('#planClose').click();
  checks.push('English routine presets, builder and review');
  // A title that happens to equal a UI translation key is still user content.
  await page.evaluate(()=>{const e=document.createElement('strong');e.id='languageUserProbe';e.dataset.i18nIgnore='';e.textContent='성공 · 나의 루틴';document.body.append(e);});await settle(page);assert.equal(await page.locator('#languageUserProbe').textContent(),'성공 · 나의 루틴');await page.locator('#languageUserProbe').evaluate(e=>e.remove());
  await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('voiceline-plans-v1'));for(const mode of ['vibrato','sustainVoice','dynamicVoice'])p.settings[mode]={seconds:mode==='dynamicVoice'?4:1,rounds:1,reference:0,breath:0,rest:0};p.settings.practice={rounds:1};p.settings.earVoice={rounds:1,listen:.5,answer:.5,breath:0,noteRest:0,rest:0};p.settings.warmupVoice={rounds:1,prepare:0};localStorage.setItem('voiceline-plans-v1',JSON.stringify(p));const t=JSON.parse(localStorage.getItem('voiceline-training-v1'));Object.assign(t,{rounds:1,sustainSeconds:1,dynamicSeconds:4,earCount:3,earPattern:'same',dynamicPattern:'steady',warmup:{inhale:1,exhale:1,hum:1,rest:0,cues:false}});localStorage.setItem('voiceline-training-v1',JSON.stringify(t));const g=JSON.parse(localStorage.getItem('voiceline-unified-practice-v1'));Object.assign(g,{pattern:'three',rounds:1,noteSeconds:.5,listenFirst:false,prepareSeconds:0,breathSeconds:0,restSeconds:0});localStorage.setItem('voiceline-unified-practice-v1',JSON.stringify(g));});
  await page.reload();await page.waitForSelector('#keyboard .white-key');
  for(const [mode,result]of [['practice','Not enough data'],['sustainVoice','Not enough data'],['earVoice','Not enough data'],['dynamicVoice','Not enough data'],['vibrato','Not enough data'],['warmupVoice','Success']]){
   await page.locator('#menuOpen').click();await page.locator('[data-screen="'+mode+'"]').click();await page.locator('#mainButton').click();
   try{await inspectLiveResult(page,mode,leaks);}catch(error){console.error('English timed result did not complete',mode,await page.evaluate(()=>({button:document.querySelector('#mainButton').textContent,message:document.querySelector('#modeMessage').textContent,banner:document.querySelector('#planBannerText').textContent,timing:window.VoiceLinePlansUI.timing(document.querySelector('#app').dataset.mode)})));await page.screenshot({path:path.join(out,'english-'+mode+'-failure.png')});throw error;}
   await settle(page);assert.equal(await page.locator('#trainingResultStatus').textContent(),result);leaks.push(...(await leftovers(page)).map(x=>({screen:mode+' live/result',...x})));await page.screenshot({path:path.join(out,'english-'+mode+'-result.png')});await page.locator('#trainingResultClose').click();
  }
  await page.evaluate(()=>{const key='voiceline-unified-practice-v1',g=JSON.parse(localStorage.getItem(key));Object.assign(g,{pattern:'vowelTriad',rounds:1,noteSeconds:.1,listenFirst:false,prepareSeconds:0,breathSeconds:.3,restSeconds:.1});localStorage.setItem(key,JSON.stringify(g));});
  await page.reload();await page.waitForSelector('#keyboard .white-key');await page.locator('#menuOpen').click();await page.locator('[data-screen=practice]').click();await page.locator('#mainButton').click();
  await inspectLiveResult(page,'all five vowels',leaks);await settle(page);leaks.push(...(await leftovers(page)).map(x=>({screen:'vowel result and summary',...x})));await page.screenshot({path:path.join(out,'english-vowels-result.png')});await page.locator('#trainingResultClose').click();checks.push('every live countdown phase and all five vowel instructions');
  await page.locator('#menuOpen').click();await page.locator('#appLanguage').selectOption('ko');await settle(page);assert.equal(await page.locator('#menuTitle').textContent(),'연습 메뉴');await page.locator('#menuClose').click();checks.push('live results, native language handoff, user text preservation and lossless Korean restoration');
  fs.writeFileSync(path.join(out,'language-report.json'),JSON.stringify({checks,leaks,layoutProblems,errors},null,2));
  assert.deepEqual(errors,[],'English runtime errors');assert.deepEqual(leaks,[],'Untranslated English UI; see language-report.json');
  assert.deepEqual(layoutProblems,[],'Clipped English labels; see language-report.json');
  console.log('PASS: '+checks.length+' bilingual integration groups');
 }finally{fs.writeFileSync(path.join(out,'language-report.json'),JSON.stringify({checks,leaks,layoutProblems,errors},null,2));await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
