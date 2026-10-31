'use strict';
const CACHE='voiceline-v2-local49';
const PIANO=Array.from({length:7},(_,i)=>['C','Ds','Fs','A'].map(note=>'./vendor/salamander/'+note+(i+1)+'v8.mp3')).flat();
const ASSETS=['./','./index.html','./piano.css','./piano.js','./metronome.js','./recording-tools.js','./recording-tools.css','./guide-training.js','./guide-training.css','./responsive-layout.css','./favicon.png','./favicon.svg','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest','./vendor/tone-piano.js',...PIANO];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('voiceline-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);if(url.origin!==location.origin)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const fresh=event.request.mode==='navigate'||/\.(js|css)$/.test(url.pathname);
  const cached=await cache.match(event.request);
  if(!fresh&&cached)return cached;
  try{
   const response=await fetch(event.request);
   if(response.ok&&response.status===200){const copy=response.clone();event.waitUntil(cache.put(event.request,copy));}
   return response;
  }catch(_){return cached||Response.error();}
 })());
});
