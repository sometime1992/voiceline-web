'use strict';
// Full-page regression: use the same native callback contract as Android,
// real CSS layout and real canvas pixels, including both microphone buttons.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const web=path.resolve(__dirname,'../android-local44/app/src/main/assets/www');
const output=path.resolve(__dirname,'../layout-report');fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mp3':'audio/mpeg','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(web,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(web+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
const modes=['piano','pitch','practice','record','vibrato','sustainVoice','earVoice','dynamicVoice','warmupVoice'];
const viewports=[{width:390,height:844},{width:412,height:820},{width:360,height:640},{width:844,height:390},{width:740,height:360},{width:915,height:412},{width:1024,height:600}];
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function choose(page,mode){
 if(mode==='piano'){await page.goto(page.url());await page.waitForSelector('#keyboard .white-key');}
 else{await page.locator('#menuOpen').click();await page.locator('[data-screen="'+mode+'"]').click();await page.waitForFunction(m=>document.querySelector('#app').dataset.mode===m,mode);}
 await frames(page);
}
async function geometry(page){return page.evaluate(()=>{
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
 const visible=e=>!e.hidden&&getComputedStyle(e).display!=='none';
 const panels=[...document.querySelectorAll('.vibrato-overlay,.guide-voice-panel')].filter(visible);
 const keyboard=document.querySelector('#keyboard'),area=document.querySelector('.piano-area');
 return {keyboard:box(keyboard),keyboardVisible:visible(keyboard),area:box(area),areaDisplay:getComputedStyle(area).display,
  panelPosition:panels.length===1?getComputedStyle(panels[0]).position:null,panel:panels.length===1?box(panels[0]):null,
  stopVisible:visible(document.querySelector('#stopButton')),canvas:panels.length===1?box(panels[0].classList.contains('warmup-mode')?panels[0].querySelector('.warmup-guide'):panels[0].querySelector('canvas')):null,panels:panels.length,
  scroll:document.documentElement.scrollHeight>innerHeight+1||document.documentElement.scrollWidth>innerWidth+1};
 });}
async function sendTone(page,hz){
 for(let frame=0;frame<7;frame++){
  await page.evaluate(f=>{
   const pcm=new Int16Array(4096);for(let i=0;i<pcm.length;i++)pcm[i]=f?Math.round(.25*32767*Math.sin(2*Math.PI*f*i/44100)):0;
   const bytes=new Uint8Array(pcm.buffer);let raw='';for(const b of bytes)raw+=String.fromCharCode(b);
   window.VoiceLineNativeAudio.onAudioChunk(btoa(raw),44100,window.__micRequest);
  },hz);await page.waitForTimeout(65);
 }
}
async function graphPixels(page,id='pitchGraph'){return page.locator('#'+id).evaluate(canvas=>{
 const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let voice=0,goal=0;
 for(let i=0;i<pixels.length;i+=4){if(pixels[i]===212&&pixels[i+1]===166&&pixels[i+2]===255||pixels[i]===239&&pixels[i+1]===180&&pixels[i+2]===255)voice++;if(pixels[i]===105&&pixels[i+1]===236&&pixels[i+2]===208||pixels[i]===131&&pixels[i+1]===245&&pixels[i+2]===214)goal++;}
 return {voice,goal};
 });}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;const report=[],errors=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:viewports[0]});page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(()=>{
   Object.defineProperty(window.screen,'orientation',{value:{get type(){return innerHeight>=innerWidth?'portrait-primary':'landscape-primary';},addEventListener(){},unlock(){return Promise.resolve();}}});
   window.VoiceLineNative={start(request){window.__micRequest=request;setTimeout(()=>window.VoiceLineNativeAudio.onState('started','',request,44100),window.__micDelay||0);},stop(request){if(window.__micRequest===request)window.__micRequest=null;}};
  });
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('#keyboard .white-key');
  for(const viewport of viewports){
   await page.setViewportSize(viewport);await frames(page);let baseline;
   for(const mode of modes){
    await choose(page,mode);const g=await geometry(page),label=viewport.width+'x'+viewport.height+' '+mode;
    const portrait=viewport.height>=viewport.width;
    if(portrait){
     baseline??=g.keyboard;
     assert.ok(Math.abs(g.keyboard.height-baseline.height)<1,label+' portrait keyboard height changed');
     assert.ok(Math.abs(g.keyboard.y-baseline.y)<1,label+' portrait keyboard moved');
     assert.equal(g.keyboardVisible,true,label+' portrait keyboard hidden');
     assert.ok(g.keyboard.height>=96&&g.keyboard.bottom<=viewport.height,label+' keyboard clipped');
     assert.equal(g.panels,1,label+' must show exactly one graph');assert.ok(g.canvas.height>=24,label+' graph canvas too small');
     assert.ok(g.panel.bottom<=g.keyboard.y-3,label+' portrait graph overlaps keyboard');
    }else{
     assert.equal(g.areaDisplay,'flex',label+' previous landscape layout was not restored');
     assert.equal(g.keyboardVisible,true,label+' keyboard hidden');
     assert.ok(g.keyboard.height>viewport.height*.25+20,label+' keyboard still uses the reduced height');
     assert.ok(g.keyboard.bottom<=viewport.height,label+' keyboard clipped');
     if(mode==='piano')assert.equal(g.panels,0,label+' idle piano must keep plain keyboard');
     else{
      assert.equal(g.panels,1,label+' live graph missing');assert.ok(g.canvas.height>=24,label+' graph canvas too small');
      assert.equal(g.panelPosition,'absolute',label+' graph must float over keyboard');
      const lowerEdge=mode==='warmupVoice'?g.area.bottom:g.keyboard.bottom;
      assert.ok(g.panel.bottom<=lowerEdge+1,label+' panel clipped');
      if(mode!=='warmupVoice'){
       assert.ok(g.panel.width<=Math.min(g.area.width*.78,682),label+' graph stretches across full screen');
       assert.ok(Math.abs(g.panel.x+g.panel.width/2-(g.area.x+g.area.width/2))<2,label+' graph not centered');
      }
     }
    }
    assert.equal(g.stopVisible,false,label+' duplicated stop action visible');
    assert.equal(g.scroll,false,label+' page scrolls');
    const toggle=page.locator('#graphToggle'),eligible=!portrait&&!['piano','warmupVoice'].includes(mode);
    assert.equal(await toggle.isVisible(),eligible,label+' graph action availability');
    if(eligible){
     const buttonBefore=await toggle.boundingBox();
     assert.equal(await toggle.textContent(),'그래프 숨기기');await toggle.click();await frames(page);
     const hidden=await geometry(page);assert.equal(hidden.panels,0,label+' hidden graph still covers keys');
     assert.deepEqual(hidden.keyboard,g.keyboard,label+' hiding resized or moved keys');
     assert.equal(await page.locator('#graphHiddenStatus').isVisible(),true,label+' essential instruction missing');
     assert.ok((await page.locator('#graphHiddenStatus').textContent()).length>0);
     assert.equal(await toggle.textContent(),'그래프 보기');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
     assert.deepEqual(await toggle.boundingBox(),buttonBefore,label+' graph button moved');
     const accessible=await toggle.evaluate(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=document.querySelector('#keyboard').getBoundingClientRect().top;});
     assert.equal(accessible,true,label+' graph action overlaps keys or leaves screen');
     if(viewport.width===844&&['practice','dynamicVoice'].includes(mode))await page.screenshot({path:path.join(output,'landscape-hidden-'+mode+'.png')});
     await toggle.click();await frames(page);assert.deepEqual((await geometry(page)).keyboard,g.keyboard,label+' showing resized keys');
     assert.equal(await toggle.getAttribute('aria-expanded'),'true');
     assert.equal((await geometry(page)).panels,1,label+' restored graph missing');
    }
    report.push({viewport,mode,...g});
    if(!portrait&&viewport.width===844&&['piano','practice'].includes(mode))await page.screenshot({path:path.join(output,'landscape-'+mode+'.png')});
   }
  }
  for(const viewport of [viewports[3],viewports[0]]){
   await page.setViewportSize(viewport);const direction=viewport.width>viewport.height?'landscape':'portrait';
   for(const button of ['#mainButton','#micToggle']){
   await choose(page,'piano');const before=await geometry(page);await page.locator(button).click();
   await page.waitForFunction(()=>document.querySelector('#app').dataset.mode==='pitch');await frames(page);
   assert.equal(await page.locator('#pitchGraphOverlay').isVisible(),true,button+' left graph hidden');
   const after=await geometry(page);assert.ok(Math.abs(before.keyboard.height-after.keyboard.height)<1);assert.ok(Math.abs(before.keyboard.y-after.keyboard.y)<1);
   await sendTone(page,261.625565);assert.ok((await graphPixels(page)).voice>5,button+' did not draw detected voice');
   await page.screenshot({path:path.join(output,direction+(button==='#mainButton'?'-microphone-on.png':'-header-microphone-on.png'))});
   await page.locator('#micToggle').click();await frames(page);const stopped=await geometry(page);assert.equal(stopped.keyboard.height,after.keyboard.height);
   }
  }
  // The sole practice entry contains both kinds and both listening methods.
  assert.equal(await page.locator('[data-screen="practice"]').count(),1);
  assert.equal(await page.locator('[data-screen="guideVoice"]').count(),0);
  const phase=async wanted=>page.waitForFunction(value=>document.querySelector('#guideVoicePanel').dataset.phase===value,wanted,{timeout:12000});
  const stop=async()=>{
   assert.equal(await page.locator('#stopButton').isVisible(),false);await page.locator('#mainButton').click();
   await page.waitForFunction(()=>document.querySelector('#micToggle').getAttribute('aria-pressed')==='false');
   if(await page.locator('#trainingResultDialog').isVisible())await page.locator('#trainingResultClose').click();
  };
  const settings=async values=>{
   await page.locator('#guideSettingsOpen').click();
   for(const [id,value]of Object.entries(values))await page.locator('#'+id).selectOption(value);
   await page.locator('#guideSettingsSave').click();await frames(page);
  };
  await choose(page,'practice');await page.locator('#mainButton').click();await phase('answer');
  assert.match(await page.locator('#mainButton').textContent(),/중단/);
  await sendTone(page,261.625565);const pixels=await graphPixels(page,'guidePhraseGraph');
  assert.ok(pixels.voice>5,'unified practice voice missing');assert.ok(pixels.goal>5,'unified practice target missing');
  await page.screenshot({path:path.join(output,'portrait-practice.png')});
  const request=await page.evaluate(()=>window.__micRequest);await page.setViewportSize(viewports[5]);await frames(page);await sendTone(page,293.664768);
  assert.equal(await page.evaluate(()=>window.__micRequest),request,'rotation restarted microphone');
  const landscape=await geometry(page);assert.equal(landscape.panelPosition,'absolute');
  await page.screenshot({path:path.join(output,'landscape-practice.png')});
  await page.locator('#graphToggle').click();await frames(page);await sendTone(page,293.664768);
  assert.equal(await page.evaluate(()=>window.__micRequest),request,'hiding restarted practice microphone');
  assert.equal(await page.locator('#guideVoicePanel').isVisible(),false);
  assert.match(await page.locator('#graphHiddenStatus').textContent(),/목표/);
  assert.notEqual(await page.locator('#guideAccuracy').textContent(),'—','hidden practice stopped scoring');
  await page.setViewportSize(viewports[0]);await frames(page);const portrait=await geometry(page);
  assert.equal(await page.evaluate(()=>window.__micRequest),request,'return to portrait restarted microphone');
  assert.ok(portrait.panel.bottom<=portrait.keyboard.y-3,'portrait graph row lost');
  assert.equal(await page.locator('#graphToggle').isVisible(),false,'portrait displays landscape graph action');
  await page.setViewportSize(viewports[5]);await frames(page);
  assert.equal(await page.locator('#guideVoicePanel').isVisible(),false,'landscape forgot hidden preference on rotation');
  assert.equal(await page.evaluate(()=>window.__micRequest),request,'second rotation restarted capture');
  await page.locator('#graphToggle').click();await frames(page);
  assert.ok((await graphPixels(page,'guidePhraseGraph')).voice>5,'restoring erased hidden voice history');
  await page.setViewportSize(viewports[0]);await frames(page);await stop();
  await settings({guideListenFirst:'on',guideNoteSeconds:'1.2',guideRounds:'1'});
  await page.locator('#guidePattern').selectOption('triad');await page.locator('#mainButton').click();await phase('listen');
  await sendTone(page,261.625565);assert.equal(await page.locator('#guideAccuracy').textContent(),'—','listening was scored');
  await phase('handoff');assert.equal(await page.locator('#guideStartCue').isVisible(),true);
  await phase('answer');await sendTone(page,261.625565);assert.ok((await graphPixels(page,'guidePhraseGraph')).voice>5);await stop();
  await page.locator('#guideKind').selectOption('smooth');await frames(page);
  assert.equal(await page.locator('#guidePattern option').count(),4);
  await settings({guideListenFirst:'off',guideRounds:'1'});
  await page.setViewportSize(viewports[5]);await frames(page);await page.locator('#mainButton').click();await phase('answer');await sendTone(page,277.182631);
  await page.screenshot({path:path.join(output,'landscape-slide.png')});await stop();
  // Every activity uses its primary action to stop. Recording still saves data.
  for(const mode of ['vibrato','sustainVoice','earVoice','dynamicVoice','warmupVoice','record']){
   await choose(page,mode);await page.locator('#mainButton').click();
   await page.waitForFunction(()=>/중단|중지/.test(document.querySelector('#mainButton').textContent));
   assert.equal(await page.locator('#stopButton').isVisible(),false,mode+' duplicated stop action');
   if(mode==='record'){
    await page.setViewportSize(viewports[3]);await frames(page);const recordingRequest=await page.evaluate(()=>window.__micRequest);
    await sendTone(page,261.625565);await page.locator('#graphToggle').click();await sendTone(page,293.664768);
    assert.equal(await page.evaluate(()=>window.__micRequest),recordingRequest,'hidden graph restarted recording');
    await page.setViewportSize(viewports[0]);await frames(page);await sendTone(page,329.627557);
    assert.equal(await page.locator('#recordPitchOverlay').isVisible(),true,'portrait recording graph stayed hidden');
    await page.setViewportSize(viewports[3]);await frames(page);assert.equal(await page.locator('#recordPitchOverlay').isVisible(),false);
    await page.locator('#graphToggle').click();await page.setViewportSize(viewports[0]);await frames(page);
   }
   await page.locator('#mainButton').click();await page.waitForFunction(()=>/시작/.test(document.querySelector('#mainButton').textContent)&&!document.querySelector('#mainButton').disabled);
   if(mode==='record')await page.waitForFunction(()=>document.querySelector('#exerciseProgress').textContent.includes('녹음 1개 저장됨'));
   if(await page.locator('#trainingResultDialog').isVisible())await page.locator('#trainingResultClose').click();
  }
  // One complete dynamics exercise: real native PCM -> personal reference,
  // shaded target bands -> score, including hidden capture and rotation.
  await page.setViewportSize(viewports[0]);await frames(page);await choose(page,'dynamicVoice');
  assert.equal(await page.locator('#dynamicReadout').isVisible(),true);
  assert.equal(await page.locator('#dynamicCueVolume').inputValue(),'70');
  await page.locator('#dynamicCueVolume').selectOption('100');await page.locator('#dynamicCuePreview').click();await page.waitForTimeout(200);
  assert.equal(await page.locator('#micToggle').getAttribute('aria-pressed'),'false','preview started capture');
  await page.locator('#dynamicCueVolume').selectOption('70');await page.locator('#mainButton').click();
  await page.waitForFunction(()=>document.querySelector('#trainingOverlay').dataset.dynamicPhase==='soft',{},{timeout:6000});
  assert.equal(await page.locator('#dynamicCueVolume').isDisabled(),true);
  const dynamicRequest=await page.evaluate(()=>{
   const start=performance.now(),request=window.__micRequest;
   const send=()=>{
    if(window.__micRequest!==request)return;
    const step=Math.min(3,Math.max(0,Math.floor((performance.now()-start)/3000))),amplitude=.08*[1,1.8,3.24,1][step];
    const pcm=new Int16Array(4096);for(let i=0;i<pcm.length;i++)pcm[i]=Math.round(amplitude*32767*Math.sin(2*Math.PI*261.625565*i/44100));
    let raw='';for(const b of new Uint8Array(pcm.buffer))raw+=String.fromCharCode(b);
    window.VoiceLineNativeAudio.onAudioChunk(btoa(raw),44100,request);
   };
   send();window.__dynamicSignal=setInterval(send,40);return request;
  });
  await page.waitForFunction(()=>document.querySelector('#trainingMetric3').textContent==='고정됨',{},{timeout:6000});
  assert.ok((await graphPixels(page,'trainingGraph')).voice>5,'dynamics voice missing');
  assert.ok((await graphPixels(page,'trainingGraph')).goal>5,'dynamics goal missing');
  await page.screenshot({path:path.join(output,'portrait-dynamics-targets.png')});
  await page.setViewportSize(viewports[3]);await frames(page);const dynamicKeyboard=(await geometry(page)).keyboard;
  await page.locator('#graphToggle').click();await frames(page);
  assert.equal(await page.locator('#trainingOverlay').isVisible(),false);
  assert.deepEqual((await geometry(page)).keyboard,dynamicKeyboard);
  await page.waitForFunction(()=>document.querySelector('#graphHiddenStatus').textContent.includes('강하게'),{},{timeout:5000});
  assert.match(await page.locator('#graphHiddenStatus').textContent(),/강하게 [123]초/,'hidden phase/countdown stopped');
  assert.equal(await page.evaluate(()=>window.__micRequest),dynamicRequest,'hidden dynamics restarted capture');
  await page.screenshot({path:path.join(output,'landscape-dynamics-hidden-live.png')});
  await page.setViewportSize(viewports[0]);await frames(page);await page.waitForTimeout(250);
  assert.equal(await page.locator('#trainingOverlay').isVisible(),true);assert.equal(await page.locator('#trainingMetric3').textContent(),'고정됨');
  assert.equal(await page.evaluate(()=>window.__micRequest),dynamicRequest,'dynamics rotation restarted capture');
  await page.setViewportSize(viewports[3]);await frames(page);await page.locator('#graphToggle').click();await frames(page);
  await page.screenshot({path:path.join(output,'landscape-dynamics-targets.png')});
  await page.waitForFunction(()=>!document.querySelector('#trainingResultDialog').hidden,{},{timeout:10000});
  await page.evaluate(()=>clearInterval(window.__dynamicSignal));
  assert.equal(await page.locator('#trainingResultStatus').textContent(),'성공','actual target pattern failed');
  assert.match(await page.locator('#trainingResultReason').textContent(),/목표 범위.*단계별 목표 충족/);
  await page.locator('#trainingResultClose').click();assert.equal(await page.locator('#dynamicCurrent').textContent(),'훈련 완료');
  assert.ok((await graphPixels(page,'trainingGraph')).voice>5,'completed dynamics graph was cleared');
  assert.ok((await graphPixels(page,'trainingGraph')).goal>5,'completed dynamics target was cleared');
  await page.screenshot({path:path.join(output,'landscape-dynamics-result.png')});
  await page.locator('#dynamicCueVolume').selectOption('45');await page.reload();await page.waitForSelector('#keyboard .white-key');
  await choose(page,'dynamicVoice');assert.equal(await page.locator('#dynamicCueVolume').inputValue(),'45','cue volume not restored');
  await page.locator('#dynamicCueVolume').selectOption('70');
  const stored=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('voiceline-local-v2',4);request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{const db=request.result,tx=db.transaction(['events','recordings']),events=tx.objectStore('events').getAll(),recordings=tx.objectStore('recordings').getAll();tx.oncomplete=()=>{db.close();resolve({events:events.result.map(e=>({mode:e.mode,title:e.title})),recordings:recordings.result.length});};};
  }));
  assert.ok(stored.events.some(e=>e.mode==='practice'),'practice result missing');
  assert.ok(stored.events.every(e=>e.mode!=='guideVoice'),'new result still uses duplicate mode');assert.ok(stored.recordings>=1,'primary recording stop did not save audio');
  // A late native permission callback cannot undo a primary-button cancel.
  await choose(page,'pitch');await page.evaluate(()=>window.__micDelay=1000);await page.locator('#mainButton').click();
  await page.waitForFunction(()=>document.querySelector('#mainButton').textContent==='연결 취소');await page.locator('#mainButton').click();
  await page.waitForFunction(()=>document.querySelector('#mainButton').textContent==='마이크 켜기');
  await page.evaluate(()=>window.__micDelay=0);await page.locator('#mainButton').click();
  await page.waitForFunction(()=>document.querySelector('#micToggle').getAttribute('aria-pressed')==='true');
  const current=await page.evaluate(()=>window.__micRequest);await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(()=>window.__micRequest),current);assert.equal(await page.locator('#mainButton').textContent(),'마이크 끄기');await page.locator('#mainButton').click();
  // Hidden pitch measurement still collects voice, redraws on demand and persists across reload.
  await page.setViewportSize(viewports[3]);await frames(page);await choose(page,'pitch');await page.locator('#mainButton').click();
  await page.waitForFunction(()=>document.querySelector('#micToggle').getAttribute('aria-pressed')==='true');
  await sendTone(page,261.625565);await page.locator('#graphToggle').click();await frames(page);
  const frozenPixels=await page.locator('#pitchGraph').evaluate(c=>c.toDataURL());
  const pitchRequest=await page.evaluate(()=>window.__micRequest);await sendTone(page,220);
  assert.equal(await page.locator('#noteName').textContent(),'A3','hidden pitch graph stopped detecting notes');
  assert.equal(await page.locator('#pitchGraph').evaluate(c=>c.toDataURL()),frozenPixels,'hidden canvas keeps drawing');
  assert.equal(await page.evaluate(()=>window.__micRequest),pitchRequest);
  await page.locator('#graphToggle').click();assert.ok((await graphPixels(page)).voice>5,'restored pitch graph lost samples');
  await page.locator('#mainButton').click();await page.locator('#graphToggle').click();await page.reload();await page.waitForSelector('#keyboard .white-key');
  await choose(page,'pitch');assert.equal(await page.locator('#graphToggle').textContent(),'그래프 보기','reload forgot preference');
  assert.equal(await page.locator('#pitchGraphOverlay').isVisible(),false);
  for(const size of [{width:568,height:320},{width:640,height:360}]){
   await page.setViewportSize(size);await frames(page);const before=await geometry(page);
   const box=await page.locator('#graphToggle').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=size.width,'narrow landscape toggle clipped');
   await page.locator('#graphToggle').click();await frames(page);assert.deepEqual((await geometry(page)).keyboard,before.keyboard);
   await page.locator('#graphToggle').click();
  }
  await page.setViewportSize(viewports[3]);await frames(page);await choose(page,'warmupVoice');
  assert.equal(await page.locator('#trainingOverlay').isVisible(),true,'hidden graph removed breathing instructions');assert.equal(await page.locator('#graphToggle').isVisible(),false);
  await choose(page,'metronome');assert.equal(await page.locator('#keyboard').isVisible(),false);assert.equal(await page.locator('#metronomePanel').isVisible(),true);assert.equal(await page.locator('#graphToggle').isVisible(),false);
  assert.deepEqual(errors,[],'uncaught browser errors');
  fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify(report,null,2));
  console.log('PASS: '+report.length+' mode/viewport layouts; full dynamics reference/target/voice exercise and score, stronger independent cue volume, hidden phase/countdown, rotation and retained result; graph toggles, unified practice, real pixels, single start/stop/cancel and recording save.');
 }catch(error){fs.writeFileSync(path.join(output,'failure.txt'),error.stack+'\n'+errors.join('\n'));fs.writeFileSync(path.join(output,'partial-geometry.json'),JSON.stringify(report,null,2));if(browser){const pages=browser.contexts().flatMap(c=>c.pages());if(pages[0])await pages[0].screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}throw error;}
 finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
