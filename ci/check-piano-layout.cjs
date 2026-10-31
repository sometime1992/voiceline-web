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
const modes=['piano','pitch','practice','record','vibrato','sustainVoice','earVoice','dynamicVoice','warmupVoice','guideVoice'];
const viewports=[{width:390,height:844},{width:412,height:820},{width:360,height:640},{width:844,height:390},{width:740,height:360}];
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
  canvas:panels.length===1?box(panels[0].classList.contains('warmup-mode')?panels[0].querySelector('.warmup-guide'):panels[0].querySelector('canvas')):null,panels:panels.length,
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
async function graphPixels(page){return page.locator('#pitchGraph').evaluate(canvas=>{
 const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let voice=0,goal=0;
 for(let i=0;i<pixels.length;i+=4){if(pixels[i]===212&&pixels[i+1]===166&&pixels[i+2]===255)voice++;if(pixels[i]===105&&pixels[i+1]===236&&pixels[i+2]===208)goal++;}
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
   window.VoiceLineNative={start(request){window.__micRequest=request;setTimeout(()=>window.VoiceLineNativeAudio.onState('started','',request,44100),0);},stop(request){if(window.__micRequest===request)window.__micRequest=null;}};
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
     if(mode==='guideVoice'){
      assert.equal(g.keyboardVisible,false,label+' previous full-screen slide panel must hide keyboard');
      assert.equal(g.panels,1);assert.ok(g.canvas.height>=24,label+' slide graph too small');
      assert.ok(g.panel.height>=g.area.height-20,label+' slide panel no longer fills its area');
     }else{
      assert.equal(g.keyboardVisible,true,label+' keyboard hidden');
      assert.ok(g.keyboard.height>viewport.height*.25+20,label+' keyboard still uses the reduced height');
      assert.ok(g.keyboard.bottom<=viewport.height,label+' keyboard clipped');
      if(mode==='piano')assert.equal(g.panels,0,label+' idle piano must keep the previous plain keyboard');
      else{
       assert.equal(g.panels,1,label+' live graph missing');assert.ok(g.canvas.height>=24,label+' graph canvas too small');
       assert.equal(g.panelPosition,'absolute',label+' graph must float over the full-height keyboard');
       const lowerEdge=mode==='warmupVoice'?g.area.bottom:g.keyboard.bottom;
       assert.ok(g.panel.bottom<=lowerEdge+1,label+' panel extends outside its original area');
      }
     }
    }
    assert.equal(g.scroll,false,label+' page scrolls');
    report.push({viewport,mode,...g});
    if(!portrait&&viewport.width===844&&['piano','guideVoice'].includes(mode))await page.screenshot({path:path.join(output,'landscape-'+mode+'.png')});
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
  await choose(page,'practice');await page.locator('#mainButton').click();
  await page.waitForFunction(()=>document.querySelector('#pitchGraphTarget').textContent.includes('C4')&&document.querySelector('#exerciseProgress').textContent.includes('음')&&!document.querySelector('#exerciseProgress').textContent.includes('준비'),null,{timeout:8000});
  await sendTone(page,261.625565);const pixels=await graphPixels(page);assert.ok(pixels.voice>5,'practice voice trace missing');assert.ok(pixels.goal>5,'practice target trace missing');
  await page.screenshot({path:path.join(output,'portrait-practice.png')});
  const request=await page.evaluate(()=>window.__micRequest);await page.setViewportSize(viewports[3]);await frames(page);await sendTone(page,293.664768);
  assert.equal(await page.evaluate(()=>window.__micRequest),request,'rotation restarted microphone');assert.equal(await page.locator('#pitchGraphOverlay').isVisible(),true);
  await page.screenshot({path:path.join(output,'landscape-practice.png')});
  const landscape=await geometry(page);assert.equal(landscape.panelPosition,'absolute');
  await page.setViewportSize(viewports[0]);await frames(page);const portrait=await geometry(page);
  assert.equal(await page.evaluate(()=>window.__micRequest),request,'return to portrait restarted microphone');
  assert.ok(portrait.panel.bottom<=portrait.keyboard.y-3,'return to portrait lost separate graph row');
  await page.locator('#stopButton').click();
  await choose(page,'metronome');assert.equal(await page.locator('#keyboard').isVisible(),false);assert.equal(await page.locator('#metronomePanel').isVisible(),true);
  assert.deepEqual(errors,[],'uncaught browser errors');
  fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify(report,null,2));
  console.log('PASS: '+report.length+' mode/viewport layouts, restored landscape, preserved portrait, both microphone entry points in both directions, real pitch/target pixels, stop and rotation.');
 }catch(error){fs.writeFileSync(path.join(output,'failure.txt'),error.stack+'\n'+errors.join('\n'));if(browser){const pages=browser.contexts().flatMap(c=>c.pages());if(pages[0])await pages[0].screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}throw error;}
 finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
