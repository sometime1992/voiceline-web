'use strict';
// Real DOM, canvas pixels and the Android microphone callback contract.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const web=path.resolve(__dirname,'../android-local44/app/src/main/assets/www'),out=path.resolve(__dirname,'../target-pitch-report');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(web,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
 if(!file.startsWith(web+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.mp3':'audio/mpeg','.png':'image/png','.svg':'image/svg+xml'};
 res.setHeader('Content-Type',type[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
const frames=page=>page.evaluate(()=>{window.VoiceLineI18n.render();return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
async function choose(page,mode){await page.locator('#menuOpen').click();await page.locator('[data-screen="'+mode+'"]').click();await page.waitForFunction(m=>document.querySelector('#app').dataset.mode===m,mode);await frames(page);}
async function settings(page,mode,root){
 await page.evaluate(({mode,root})=>{
  const p=window.__bridge.captureAll();p.training.root=root;p.vibratoRoot=root;
  p.guide={...p.guide,root,pattern:'hold',rounds:1,listenFirst:false,prepareSeconds:0,breathSeconds:0,restSeconds:0};
  window.__bridge.apply(mode,{seconds:12,rounds:1,reference:0,breath:0,rest:0},p);
 },{mode,root});await frames(page);
}
async function tone(page,midi){
 for(let frame=0;frame<8;frame++){
  await page.evaluate(m=>{
   const hz=440*Math.pow(2,(m-69)/12),pcm=new Int16Array(4096);
   for(let i=0;i<pcm.length;i++)pcm[i]=Math.round(.15*32767*Math.sin(2*Math.PI*hz*i/44100));
   const bytes=new Uint8Array(pcm.buffer);let raw='';for(const b of bytes)raw+=String.fromCharCode(b);
   window.VoiceLineNativeAudio.onAudioChunk(btoa(raw),44100,window.__micRequest);
  },midi);await page.waitForTimeout(65);
 }
 await frames(page);
}
async function centerLine(page){
 await page.waitForFunction(()=>{
  const c=document.querySelector('#trainingGraph'),r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);
  return c.width===Math.round(r.width*d)&&c.height===Math.round(r.height*d);
 });
 return page.locator('#trainingGraph').evaluate(c=>{
  const ctx=c.getContext('2d'),{data}=ctx.getImageData(0,0,c.width,c.height),scale=c.width/c.getBoundingClientRect().width;
  let strongest=0,yMax=-1;
  for(let y=0;y<c.height;y++){let count=0;for(let x=Math.ceil(63*scale);x<c.width-12*scale;x++){
   const i=(y*c.width+x)*4;if(data[i]===105&&data[i+1]===236&&data[i+2]===208)count++;
  }if(count>strongest){strongest=count;yMax=y;}}
  return {pixels:strongest,y:yMax/scale,expected:(8+c.getBoundingClientRect().height-16)/2};
 });
}
(async()=>{
 let browser,page;const checks=[],errors=[];
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{
   if(!localStorage.getItem('local91-target-test')){
    const raw=JSON.parse(localStorage.getItem('voiceline-plans-v1')||'{}');raw.settings=raw.settings||{};
    for(const mode of ['sustainVoice','dynamicVoice','vibrato'])raw.settings[mode]={seconds:12,rounds:1,reference:0,breath:0,rest:0};
    localStorage.setItem('voiceline-plans-v1',JSON.stringify(raw));localStorage.setItem('local91-target-test','1');
   }
   Object.defineProperty(window.screen,'orientation',{value:{get type(){return innerHeight>=innerWidth?'portrait-primary':'landscape-primary';},addEventListener(){},unlock(){return Promise.resolve();}}});
   let plans;Object.defineProperty(window,'VoiceLinePlansUI',{configurable:true,get:()=>plans,set(v){plans=v;const mount=v.mount;v.mount=function(cb){window.__bridge=cb;return mount.call(v,cb);};}});
   window.__canvasText=[];const draw=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(...args){window.__canvasText.push(args[0]);if(window.__canvasText.length>500)window.__canvasText.splice(0,250);return draw.apply(this,args);};
   window.VoiceLineNative={start(id){window.__micRequest=id;setTimeout(()=>window.VoiceLineNativeAudio.onState('started','',id,44100),0);},stop(id){if(window.__micRequest===id)window.__micRequest=null;}};
  });
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('#keyboard .white-key');
  for(const lang of ['ko','en']){
   await page.evaluate(l=>window.VoiceLineI18n.setLanguage(l),lang);await frames(page);
   await choose(page,'pitch');
   for(const [index,ko,en]of [[0,'표준','Standard'],[1,'민감','Sensitive'],[2,'최대','High']]){
    const button=page.locator('#micSensitivity');await button.click();assert.equal(await button.getAttribute('aria-expanded'),'true');
    await page.locator('#micSensitivityChoices button').nth(index).click();await frames(page);
    assert.equal(await button.textContent(),lang==='ko'?'🎤 감도 '+ko:'🎤 Sensitivity: '+en);
    assert.match(await button.getAttribute('aria-label'),new RegExp(lang==='ko'?'마이크 감도 '+ko:'Microphone sensitivity: '+en));
    assert.equal(await button.getAttribute('aria-expanded'),'false');assert.equal(await button.evaluate(e=>e===document.activeElement),true);
   }
   await page.locator('#micSensitivity').press('Enter');await page.keyboard.press('Escape');assert.equal(await page.locator('#micSensitivity').getAttribute('aria-expanded'),'false');
   for(const [name,width,height,font]of [['portrait',390,844,16],['compact',360,640,16],['landscape',844,390,16],['large-text',390,844,24]]){
    await page.setViewportSize({width,height});await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',font);await frames(page);
    for(const mode of ['sustainVoice','dynamicVoice','earVoice','practice','vibrato']){
     await choose(page,mode);
     for(const root of [48,69,84]){
      await settings(page,mode,root);
      if(mode==='sustainVoice'||mode==='dynamicVoice'){
       assert.equal(await page.locator('#trainingPitchGuide').isVisible(),true);
       assert.match(await page.locator('#trainingPitchTarget').textContent(),new RegExp(root===48?'C3':root===69?'A4':'C6'));
       assert.match(await page.locator('#trainingPitchTarget').textContent(),new RegExp(mode==='sustainVoice'?'±35\\s*cent':'±55\\s*cent'));
       if(mode==='sustainVoice'){
        const line=await centerLine(page);assert.ok(line.pixels>25,JSON.stringify(line));assert.ok(Math.abs(line.y-line.expected)<2,JSON.stringify(line));
        assert.match(await page.locator('#trainingGraph').getAttribute('aria-label'),/±200\s*cent/);
       }
      }else if(mode==='earVoice')assert.equal(await page.locator('#trainingPitchGuide').isVisible(),false,'no listening answer');
     }
     const geometry=await page.evaluate(()=>{
      const k=document.querySelector('#keyboard').getBoundingClientRect(),b=document.querySelector('#micSensitivity').getBoundingClientRect();
      return {scroll:document.documentElement.scrollWidth>innerWidth+1,keyboard:k.height>60&&k.bottom<=innerHeight+1,button:b.width>60&&b.right<=innerWidth+1};
     });assert.equal(geometry.scroll,false,lang+' '+name+' '+mode);assert.equal(geometry.keyboard,true);assert.equal(geometry.button,true);
     if(mode==='sustainVoice'||mode==='dynamicVoice')await page.screenshot({path:path.join(out,lang+'-'+name+'-'+mode+'.png')});
    }
   }
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='16px');
   await choose(page,'sustainVoice');await settings(page,'sustainVoice',48);await page.locator('#mainButton').click();
   await page.waitForFunction(()=>!!window.__micRequest);await tone(page,48);
   assert.match(await page.locator('#trainingMetric1').textContent(),/C3/);
   assert.ok(Math.abs(Number((await page.locator('#trainingPitchOffset').textContent()).replace('cent','')))<8);
   await tone(page,60);assert.ok(Number((await page.locator('#trainingPitchOffset').textContent()).replace('cent',''))>1100);
   assert.ok(await page.evaluate(l=>window.__canvasText.some(t=>t===(l==='ko'?'↑ 범위 밖':'↑ Out of range')),lang));
   await page.locator('#mainButton').click();if(await page.locator('#trainingResultDialog').isVisible())await page.locator('#trainingResultClose').click();
   checks.push(lang+': three sensitivity states, keyboard access, centered low/mid/high targets, five modes, four layouts, actual input and octave errors');
  }
  await page.reload();await page.waitForSelector('#keyboard .white-key');assert.equal(await page.evaluate(()=>localStorage.getItem('voiceline-mic-sensitivity-v1')),'high');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('voiceline-training-v1')).root),48);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'target-pitch.json'),JSON.stringify({status:'passed',checks,errors},null,2));console.log(JSON.stringify({status:'passed',checks}));
 }catch(error){await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(error),errors,checks},null,2));throw error;}
 finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
