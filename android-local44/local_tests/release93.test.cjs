'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const web=path.resolve(__dirname,'../app/src/main/assets/www'),i18n=require(path.join(web,'i18n.js'));
test('Credits and export warnings retain their legal meaning in English',()=>{
 const expected=[
  ['피아노 음원 출처·저작권','Piano sample credits and copyright'],
  ['원본 음원 출처 열기','Open sample source'],
  ['CC BY 3.0 원문 열기','Open CC BY 3.0 license'],
  ['전체 오픈소스 고지','All open-source notices']
 ];
 for(const [ko,en]of expected)assert.equal(i18n.t(ko,'en'),en);
 for(const ko of [
  '저작자: Alexander Holm · 라이선스: Creative Commons Attribution 3.0 Unported (CC BY 3.0)',
  '사용 방법: 원본 MP3 28개를 앱에 포함하고, 연주 시 음높이·재생 속도·음량·엔벨로프를 조정합니다. 원본 파일 자체는 편집·재인코딩하지 않았습니다. 저작자 또는 원 프로젝트의 VocalRefit 후원·보증은 없습니다.',
  '외부 앱으로 녹음을 공유합니다. 노래·가사·연주·반주의 권리가 각각 다를 수 있으며, 녹음했다고 해서 배포 권리가 생기지는 않습니다.',
  '외부에 녹음 파일 사본을 만듭니다. 노래·가사·연주·반주의 권리가 각각 다를 수 있으며, 녹음했다고 해서 복제·배포 권리가 생기지는 않습니다.'
 ])assert.doesNotMatch(i18n.t(ko,'en'),/[가-힣]/);
 assert.match(i18n.t('사용 방법: 원본 MP3 28개를 앱에 포함하고, 연주 시 음높이·재생 속도·음량·엔벨로프를 조정합니다. 원본 파일 자체는 편집·재인코딩하지 않았습니다. 저작자 또는 원 프로젝트의 VocalRefit 후원·보증은 없습니다.','en'),/28 original MP3.*not been edited.*sponsor or endorse/);
});
test('The attributed pitch estimator covers the selectable range at actual input rates',()=>{
 const source=fs.readFileSync(path.join(web,'piano.js'),'utf8'),a=source.indexOf('function pitchYin('),b=source.indexOf('function updateDetection(',a);
 const detect=vm.runInNewContext(source.slice(a,b)+'\npitchYin',{
  Math,Number,Float32Array,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),PITCH_RANGE:{minHz:65,maxHz:1900},
  MIC_SENSITIVITIES:{sensitive:{minRms:.0035,recordMinRms:.0018}}
 });
 for(const rate of [16000,44100,48000])for(let midi=36;midi<=94;midi++){
  const hz=440*2**((midi-69)/12),samples=Float32Array.from({length:rate<32000?2048:4096},(_,i)=>.06*(Math.sin(2*Math.PI*hz*i/rate)+.25*Math.sin(4*Math.PI*hz*i/rate)));
  const result=detect(samples,rate);assert.ok(result,rate+'Hz MIDI '+midi);
  assert.ok(Math.abs(1200*Math.log2(result.hz/hz))<15,rate+'Hz MIDI '+midi+' pitch bias');
 }
 for(const rate of [0,-1,NaN,Infinity])assert.equal(detect(new Float32Array(4096),rate),null);
 const invalid=new Float32Array(4096).fill(.1);invalid[99]=NaN;assert.equal(detect(invalid,44100),null);
});
test('The exact MIT estimator source and notice are retained in offline credits',()=>{
 const upstream=JSON.parse(fs.readFileSync(path.join(web,'vendor/yinjs/UPSTREAM.json')));
 for(const [name,digest]of Object.entries(upstream.upstreamFiles))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(web,'vendor/yinjs',name))).digest('hex'),digest);
 const notice=require(path.join(web,'third-party-notices.js')).find(n=>n.name==='yinjs');
 assert.equal(notice.license,'MIT');assert.match(notice.text,/Copyright \(c\) 2018 Adriano Di Giovanni/);
 assert.match(notice.text,/Permission is hereby granted/);assert.equal(notice.source,upstream.source);
});
