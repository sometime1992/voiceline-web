'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'store-media');fs.mkdirSync(out,{recursive:true});
const web=path.join(root,'android-local44/app/src/main/assets/www'),store=path.join(root,'store-kit');
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),prefix=url.pathname.startsWith('/app/')?'/app/':'/store/',base=prefix==='/app/'?web:store,file=path.resolve(base,url.pathname.slice(prefix.length));if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.png')?'image/png':'application/octet-stream');fs.createReadStream(file).pipe(res);});
// Encode the unchanged icon pixels as a 32-bit PNG, as required for the
// store icon. This changes the file encoding, not the existing brand artwork.
function rgbaPng(width,height,pixels){
 const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;}return (c^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const kind=Buffer.from(name),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([kind,data])));return Buffer.concat([length,kind,data,sum]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const scan=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)Buffer.from(pixels.slice(y*width*4,(y+1)*width*4)).copy(scan,y*(width*4+1)+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  const listing=JSON.parse(fs.readFileSync(path.join(store,'listing-ko.json'),'utf8'));assert.equal(listing.title,'VoiceLine');assert.ok(listing.title.length<=30&&listing.shortDescription.length<=80&&listing.fullDescription.length<=4000);
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1024,height:500},deviceScaleFactor:1});const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin+'/store/feature-graphic.html');await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1024);assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),500);
  await page.screenshot({path:path.join(out,'feature-graphic-1024x500.png')});
  await page.goto(origin+'/app/icon-512.png');const pixels=await page.evaluate(async()=>{const image=document.querySelector('img');await image.decode();const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,512,512);return [...ctx.getImageData(0,0,512,512).data];});
  const icon=rgbaPng(512,512,pixels);assert.ok(icon.length<1024*1024);fs.writeFileSync(path.join(out,'icon-512.png'),icon);
  fs.writeFileSync(path.join(out,'MEDIA_INFO.json'),JSON.stringify({icon:{width:512,height:512,bitDepth:8,colorType:6,bytes:icon.length},featureGraphic:{width:1024,height:500},listingLengths:{title:listing.title.length,short:listing.shortDescription.length,full:listing.fullDescription.length}},null,2)+'\n');
  console.log('Store graphic, 32-bit brand icon and listing lengths verified.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
