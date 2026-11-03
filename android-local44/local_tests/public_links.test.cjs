'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
const code=source.slice(source.indexOf('function openPublicAppPage(kind){'),source.indexOf('function showPrivacyPolicy(){'));
const policy=JSON.parse(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/privacy-policy.json'),'utf8'));
function fixture(bridge,available=true){
 const opened=[],notices=[];const window={VoiceLinePrivacy:available?policy:null,VoiceLinePublicLinks:bridge,open(...args){opened.push(args);}};
 const ctx={window,notify(message){notices.push(message);}};vm.runInNewContext(code,ctx);return {open:ctx.openPublicAppPage,opened,notices};
}
test('explicit app actions call the matching native destination without opening a web popup',()=>{
 const calls=[];const f=fixture({openPrivacyPolicy(){calls.push('privacy');},openSupport(){calls.push('support');},openHomepage(){calls.push('home');}});
 for(const kind of ['privacy','support','home'])f.open(kind);
 assert.deepEqual(calls,['privacy','support','home']);assert.deepEqual(f.opened,[]);
 f.open('https://unexpected.example/');assert.equal(calls.length,3);
});
test('browser fallback opens the app-specific policy, selected support and company homepage',()=>{
 const f=fixture();for(const kind of ['privacy','support','home'])f.open(kind);
 assert.deepEqual(f.opened.map(args=>args[0]),['https://mindup-studio.pages.dev/apps/voiceline/privacy.html','https://mindup-studio.pages.dev/support.html?app=voiceline','https://mindup-studio.pages.dev/']);
 assert.ok(f.opened.every(args=>args[1]==='_blank'&&args[2]==='noopener,noreferrer'));
});
test('missing policy and unavailable browser do not crash or open arbitrary destinations',()=>{
 const missing=fixture(undefined,false);missing.open('privacy');assert.deepEqual(missing.opened,[]);
 const blocked=fixture({openHomepage(){throw new Error('unavailable');}});assert.doesNotThrow(()=>blocked.open('home'));assert.equal(blocked.notices.length,1);
});
