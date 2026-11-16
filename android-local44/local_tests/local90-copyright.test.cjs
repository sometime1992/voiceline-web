'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const assets=path.join(__dirname,'../app/src/main/assets/www');
const read=f=>fs.readFileSync(path.join(assets,f),'utf8');
test('external recording copy and sharing require a fresh consent checkbox',()=>{
 const html=read('index.html'),js=read('piano.js');
 for(const id of ['recordRightsDialog','recordRightsAgree','recordRightsCancel','recordRightsConfirm'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/id="recordRightsAgree"[^>]*type="checkbox"|type="checkbox" id="recordRightsAgree"/);
 assert.match(html,/id="recordRightsConfirm"[^>]*disabled/);
 assert.match(js,/function requestRecordingRightsConsent\(operation\)/);
 assert.match(js,/if\(!await requestRecordingRightsConsent\(operation\)\)/);
 const guard=js.indexOf('if(!await requestRecordingRightsConsent(operation))');
 const action=js.indexOf('window.VoiceLineDocuments.perform(record,operation',guard);
 assert.ok(guard>=0&&action>guard,'permission gate must precede export/share');
 assert.match(js,/recordRightsAgree'\)\.checked=false/);
 assert.match(js,/function topDialog\(\)\{return \['recordRightsDialog'/);
});
test('explicit complete piano attribution is accessible in app menu and remains in notices',()=>{
 const html=read('index.html'),js=read('piano.js'),credits=JSON.parse(read('vendor/salamander/CREDITS.json'));
 assert.match(html,/id="pianoCreditsOpen"/);
 assert.match(js,/function showPianoCredits\(\)/);
 assert.equal(credits.creator,'Alexander Holm');
 assert.match(credits.license,/CC BY 3\.0/);
 assert.match(credits.source,/github.com\/tambien\/Piano/);
 assert.match(credits.changes,/pitch/);
 assert.match(js,/https:\/\/creativecommons.org\/licenses\/by\/3\.0\//);
});
test('no song-import feature, brand image redraw, or unrequested Internet permission',()=>{
 const html=read('index.html'),sw=read('sw.js');
 assert.doesNotMatch(html,/songGraphOverlay|song-practice|songOriginal|songMR/);
 assert.doesNotMatch(sw,/song-practice/);
 assert.doesNotMatch(html,/aria-label="YouTube 로고"/);
 assert.match(html,/id="studioYoutubeLink"/);
 const manifest=fs.readFileSync(path.join(__dirname,'../app/src/main/AndroidManifest.xml'),'utf8');
 assert.doesNotMatch(manifest,/android.permission.INTERNET/);
});
