'use strict';
// Compiles the real NativeMicBridge against tiny API stubs. This validates Java
// control flow, not Android hardware, SDK linkage, or an APK build.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const compiler=spawnSync('javac',['-version'],{encoding:'utf8'}).status===0?{cmd:'javac',args:[]}:
 spawnSync('java',['com.sun.tools.javac.Main','-version'],{encoding:'utf8'}).status===0?{cmd:'java',args:['com.sun.tools.javac.Main']}:null;
const available=!!compiler;
test('Local32 native Java cancels obsolete permission, rejects stale stop and reports 16kHz before PCM',{skip:!available},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voiceline-native-'));
 const files=require('./native_java_fixture.cjs');
 try{
  for(const [name,text] of Object.entries(files)){const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text)}
  const native=['NativeMicBridge.java','NativeWavStore.java'].map(name=>path.resolve(__dirname,'../app/src/main/java/com/voiceline/app',name));
  const compile=spawnSync(compiler.cmd,[...compiler.args,'-encoding','UTF-8','-d',path.join(dir,'classes'),...native,...Object.keys(files).map(file=>path.join(dir,file))],{encoding:'utf8',timeout:30000});
  assert.equal(compile.status,0,compile.stdout+compile.stderr);
  const run=spawnSync('java',['-cp',path.join(dir,'classes'),'com.voiceline.app.BridgeTest'],{encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/passed/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
