#!/usr/bin/env node
/**
 * Bundles genuine CC0 acoustic-piano recordings INSIDE the Android APK.
 * Must run at build time; the installed app never fetches an external audio URL.
 * Upstream: Meta Open Sound / Meta Piano (CC0 1.0), pinned 2026-10-20 commit.
 */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.join(root,'android-app/app/src/main/assets/www/samples/piano');
const revision='251c0be57d5d1b3242b91f53e0cde62ab1cb42d9';
const upstream='https://raw.githubusercontent.com/facebookincubator/Meta-open-sound/'+revision+'/systems/instruments/meta-piano/ogg/';
const notes=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
function filename(midi){
 const name=notes[midi%12]+(Math.floor(midi/12)-1);
 return 'INSPiano_Vel01_'+name+'_01.ogg';
}
// One natural acoustic recording every three semitones (maximum 1.5 semitone repitch).
// Covers piano C1 through B7 without generating tones mathematically.
const keys=Array.from({length:28},(_,i)=>24+i*3);
const pending=[...keys];let downloaded=0;let totalBytes=0;
await mkdir(destination,{recursive:true});
async function download(midi){
 const name=filename(midi),file=path.join(destination,name);
 try{
  const cached=await readFile(file);
  if(cached.length>4096&&cached.toString('ascii',0,4)==='OggS'){downloaded++;totalBytes+=cached.length;return;}
 }catch(_){}
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(upstream+name,{signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error(name+' HTTP '+response.status);
   const buf=Buffer.from(await response.arrayBuffer());
   if(buf.length<4096||buf.toString('ascii',0,4)!=='OggS')throw Error(name+' invalid Ogg/Opus file');
   await writeFile(file,buf);
   downloaded++;totalBytes+=buf.length;
   process.stdout.write('Bundled '+name+' ('+Math.round(buf.length/1024)+' KiB)\n');
   return;
  }catch(e){last=e;await new Promise(resolve=>setTimeout(resolve,450*(attempt+1)));}
 }
 throw last;
}
await Promise.all(Array.from({length:4},async()=>{while(pending.length)await download(pending.shift());}));
if(downloaded!==keys.length)throw Error('Missing acoustic piano samples: '+downloaded+'/'+keys.length);
await writeFile(path.join(destination,'source.json'),JSON.stringify({
 title:'Meta Piano — 88-key upright acoustic piano',
 license:'CC0-1.0',
 source:'https://github.com/facebookincubator/Meta-open-sound/tree/'+revision+'/systems/instruments/meta-piano',
 revision,
 velocity:1,
 intervalSemitones:3,
 midiKeys:keys,
 files:keys.map(filename)
},null,2)+'\n');
console.log('Bundled '+downloaded+' acoustic samples, '+(totalBytes/1048576).toFixed(2)+' MiB. No runtime network required.');
