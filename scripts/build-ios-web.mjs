/**
 * Generates a platform-independent web asset bundle for later iOS wrapping.
 * This is NOT a signed IPA. Safari microphone access requires HTTPS, and native
 * iOS packaging needs a Mac with Xcode and signing credentials.
 */
import {cpSync,existsSync,mkdirSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const root=resolve('.');
const output=join(root,'dist','ios-web');
mkdirSync(output,{recursive:true});
for(const name of ['index.html','piano.css','piano.js','sw.js','manifest.webmanifest','favicon.svg','icon.svg','icon-192.png','icon-512.png']){
 const src=join(root,name);
 if(!existsSync(src))throw Error('Missing iOS-web asset: '+name);
 cpSync(src,join(output,name));
}
const sourceVendor=join(root,'android-app','app','src','main','assets','www','vendor');
if(!existsSync(join(sourceVendor,'tone-piano.js')))throw Error('Missing bundled Tone Piano');
const sampleFolder=join(sourceVendor,'salamander');
const files=readdirSync(sampleFolder).filter(f=>f.endsWith('.mp3'));
if(files.length!==28||files.some(f=>statSync(join(sampleFolder,f)).size<10000))
 throw Error('Invalid offline piano sample set: '+files.length);
cpSync(sourceVendor,join(output,'vendor'),{recursive:true});
writeFileSync(join(output,'IOS-BUILD-NOTES.txt'),
 'VoiceLine iOS WEB RESOURCES (NOT an IPA)\n'+
 'Serve this folder from HTTPS for Safari microphone testing.\n'+
 'The iOS recording pitch graph uses getUserMedia and MediaRecorder/WAV fallback.\n'+
 'A native iPhone/iPad app requires a Mac with Xcode and Apple signing.\n'+
 'Sample licenses: Salamander Grand Piano / Alexander Holm CC BY 3.0, Tone.js MIT.\n');
console.log('iOS web bundle:',output,'sample clips:',files.length);
