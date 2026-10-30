#!/usr/bin/env node
/**
 * Offline installer for @tonejs/piano's official Salamander Grand Piano audio.
 * Public sample attribution: Alexander Holm, CC BY 3.0.
 * The Android application never fetches these from the internet at runtime.
 */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(repo,'android-app/app/src/main/assets/www/vendor/salamander');
const rev='0cd2c034f820c53e83ab22f5c13bd490b9e4de85';
const base='https://raw.githubusercontent.com/tambien/Piano/'+rev+'/audio/';
const spell=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
const notes=Array.from({length:28},(_,i)=>24+3*i);
const files=notes.map(m=>spell[m%12]+(Math.floor(m/12)-1)+'v8.mp3');
await mkdir(output,{recursive:true});
const todo=[...files];
let size=0;
async function install(name){
 const filepath=path.join(output,name);
 try{
  const buf=await readFile(filepath);
  if(buf.length>10000){size+=buf.length;return;}
 }catch(_){}
 let last;
 for(let attempt=0;attempt<4;attempt++){
  try{
   const res=await fetch(base+name,{signal:AbortSignal.timeout(20000)});
   if(!res.ok)throw new Error(name+': HTTP '+res.status);
   const buf=Buffer.from(await res.arrayBuffer());
   if(buf.length<10000)throw new Error('Short/empty audio '+name);
   await writeFile(filepath,buf);size+=buf.length;
   console.log('Bundled Salamander '+name+': '+Math.round(buf.length/1024)+'KiB');
   return;
  }catch(err){last=err;await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));}
 }
 throw last;
}
await Promise.all(Array.from({length:5},async()=>{while(todo.length)await install(todo.shift());}));
for(const file of files){const b=await readFile(path.join(output,file));if(b.length<10000)throw Error('Bad audio '+file);}
await writeFile(path.join(output,'CREDITS.json'),JSON.stringify({
 source:'https://github.com/tambien/Piano/tree/'+rev+'/audio',
 creator:'Alexander Holm',
 title:'Salamander Grand Piano (Yamaha C5)',
 license:'Creative Commons Attribution 3.0 (CC BY 3.0)',
 licenseUrl:'https://creativecommons.org/licenses/by/3.0/',
 voiceCount:28,
 layers:[8],
 files
},null,2)+'\n');
console.log('Offline @tonejs/piano assets:',files.length,'files, '+(size/1048576).toFixed(2)+'MiB');
