'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/piano.js'),'utf8');
const compiler=spawnSync('javac',['-version'],{encoding:'utf8'}).status===0?['javac']:spawnSync('java',['com.sun.tools.javac.Main','-version'],{encoding:'utf8'}).status===0?['java','com.sun.tools.javac.Main']:null;
let directory;
before(()=>{
 if(!compiler)return;
 directory=fs.mkdtempSync(path.join(os.tmpdir(),'voiceline-audio-'));
 const files={...require('./native_java_fixture.cjs')};delete files['com/voiceline/app/BridgeTest.java'];
 files['com/voiceline/app/AudioInterruptionTest.java']=String.raw`package com.voiceline.app;
 import android.app.Activity;import android.media.*;import android.os.Build;import android.webkit.WebView;import java.util.*;import java.util.concurrent.atomic.AtomicInteger;import java.util.function.BooleanSupplier;
 public class AudioInterruptionTest {
  static void check(boolean value,String reason){if(!value)throw new AssertionError(reason);}
  static void waitFor(BooleanSupplier ready)throws Exception{long end=System.currentTimeMillis()+4000;while(!ready.getAsBoolean()&&System.currentTimeMillis()<end)Thread.sleep(2);check(ready.getAsBoolean(),"timed out");}
  public static void main(String[] args)throws Exception {
   if(args[0].equals("focus")){
    AudioManager manager=new AudioManager();AtomicInteger stopped=new AtomicInteger();AudioSessionGuard guard=new AudioSessionGuard(manager,why->stopped.incrementAndGet());
    check(guard.request(),"focus was not granted");AudioFocusRequest first=manager.last;
    check(first.willPause&&!first.delayed,"unexpected duck or delayed automatic start");check(guard.request()&&manager.requests==1,"duplicate focus request");
    first.listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT);check(stopped.get()==1&&manager.abandons==1,"transient loss did not stop and abandon");
    first.listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_GAIN);check(stopped.get()==1&&manager.requests==1,"gain automatically restarted");
    check(guard.request(),"explicit restart failed");AudioFocusRequest next=manager.last;first.listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS);check(stopped.get()==1,"old focus callback stopped new session");
    next.listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK);check(stopped.get()==2,"notification duck did not pause");
    check(guard.request(),"new explicit request failed");android.os.Handler.hold=true;
    manager.last.listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS);
    check(!guard.request(),"new session started before the old interruption was delivered");
    android.os.Handler.hold=false;android.os.Handler.drain();check(stopped.get()==3,"queued interruption missing");
    manager.result=AudioManager.AUDIOFOCUS_REQUEST_FAILED;check(!guard.request(),"denied focus allowed audio");
    guard.foreground(false);int requests=manager.requests;check(!guard.request()&&manager.requests==requests,"background requested focus");
    guard.foreground(true);check(manager.requests==requests,"resume requested focus without tap");guard.dispose();check(!guard.request(),"disposed guard accepted request");
   }else{
    Build.VERSION.SDK_INT=args[0].equals("old-api")?26:36;
    Activity activity=new Activity();activity.allowed=true;WebView web=new WebView();AudioManager manager=new AudioManager();AtomicInteger stopped=new AtomicInteger();NativeMicBridge[] box=new NativeMicBridge[1];
    AudioSessionGuard guard=new AudioSessionGuard(manager,why->{stopped.incrementAndGet();box[0].interruptFromActivity();});
    box[0]=new NativeMicBridge(activity,web,null,new NativeMicBridge.AudioSession(){public boolean request(){return guard.request();}public void interrupted(String reason){guard.interrupt(reason);}});
    NativeMicBridge bridge=box[0];bridge.start("1");AudioRecord input=AudioRecord.last;
    check(input.registrations==(Build.VERSION.SDK_INT>=29?1:0),"wrong API callback registration");
    if(args[0].equals("capture")){
     bridge.beginRecording("1","interrupted_take");short[] pcm=new short[256];Arrays.fill(pcm,(short)2345);AudioRecord.chunks.add(pcm);
     waitFor(()->web.scripts.stream().anyMatch(s->s.contains("onAudioChunk")));
     input.recordingCallback.onRecordingConfigChanged(List.of(new AudioRecordingConfiguration(900,true)));check(stopped.get()==0,"another recorder stopped this capture");
     input.mute();AudioRecord.chunks.add(new short[256]);
     waitFor(()->web.scripts.stream().anyMatch(s->s.contains("onRecordingFinished")));
     check(stopped.get()==1,"system silence not reported exactly once");
     check(bridge.recordings().info("interrupted_take",false).contains("\"bytes\":512"),"silenced chunk appended or prior PCM lost");
     check(bridge.getPendingRecordings().contains("interrupted_take"),"interrupted recording cannot be recovered");
     check(input.recordingCallback==null&&input.routingCallback==null,"callbacks leaked after stop");
    }else{
     input.route(1);check(stopped.get()==0,"unchanged input device interrupted");input.route(2);waitFor(()->stopped.get()==1);check(input.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING,"changed input device still recording");
    }
    int created=AudioRecord.created;manager.last.listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_GAIN);bridge.resumeFromActivity();check(AudioRecord.created==created,"input resumed automatically");
    bridge.dispose();guard.dispose();
   }
   System.out.println(args[0]+" passed");
  }
 }`;
 for(const [name,text] of Object.entries(files)){const p=path.join(directory,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);}
 const actual=['NativeMicBridge.java','NativeWavStore.java','AudioSessionGuard.java'].map(n=>path.join(__dirname,'../app/src/main/java/com/voiceline/app',n));
 const compile=spawnSync(compiler[0],[...compiler.slice(1),'-encoding','UTF-8','-d',path.join(directory,'classes'),...actual,...Object.keys(files).map(n=>path.join(directory,n))],{encoding:'utf8',timeout:30000});assert.equal(compile.status,0,compile.stdout+compile.stderr);
});
after(()=>{if(directory)fs.rmSync(directory,{recursive:true,force:true});});
for(const name of ['focus','capture','route','old-api'])test('Audio interruptions: '+name,{skip:!compiler},()=>{
 const result=spawnSync('java',['-cp',path.join(directory,'classes'),'com.voiceline.app.AudioInterruptionTest',name],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stdout+result.stderr);
});
function ui(){
 const timers=new Map(),events=[],app={playing:new Map()},native={requests:0,releases:0,allowed:true,request(){this.requests++;return this.allowed;},release(){this.releases++;}};let resolve,serial=0;
 const ctx={app,window:{VoiceLineAudioSession:native},document:{hidden:false},settingsPreviewPlayer:null,settingsPreviewTimer:null,console,
  clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(++serial,fn);return serial;},
  allKeysOff:()=>events.push('keys'),closeActiveAudio:()=>events.push('playback'),stopSettingsPreview:()=>events.push('preview'),cancelReferenceNotes:()=>events.push('references'),
  stopActivity:reason=>{events.push(reason);return new Promise(done=>resolve=done);},resetMainAction:()=>events.push('reset'),clearNote(){},setMessage:m=>events.push(m),notify:m=>events.push(m)};
 const api=vm.runInNewContext(source.slice(source.indexOf('let audioFocusTimer=0;'),source.indexOf('async function safeStopOnBackground()'))+'\n({requestAppAudio,releaseAppAudioWhenIdle,stopForAudioInterruption})',ctx);
 return {...api,app,native,events,timers,done:()=>resolve()};
}
test('UI interruption stops every sound, waits for the recording save and requires another start',async()=>{
 const h=ui();assert.equal(h.requestAppAudio(),true);const requests=h.native.requests;
 const first=h.stopForAudioInterruption('통화로 중단');assert.equal(h.stopForAudioInterruption('중복'),first);assert.equal(h.requestAppAudio(),false);
 assert.deepEqual(h.events.slice(0,5),['keys','playback','preview','references','interrupted']);assert.equal(h.app.audioInterruptionPromise,first);
 h.done();await first;assert.equal(h.app.audioInterruptionPromise,null);assert.equal(h.native.requests,requests);assert.ok(h.events.some(s=>s.includes('시작 버튼')));
 assert.equal(h.requestAppAudio(),true);assert.equal(h.native.requests,requests+1);
});
test('Idle focus release keeps active recording and sound tails, then releases once idle',()=>{
 const h=ui();h.app.record={};h.requestAppAudio();let f=[...h.timers.values()].at(-1);h.timers.clear();f();assert.equal(h.native.releases,0);
 h.app.record=null;h.app.playing.set(60,{});f=[...h.timers.values()].at(-1);h.timers.clear();f();assert.equal(h.native.releases,0);
 h.app.playing.clear();f=[...h.timers.values()].at(-1);h.timers.clear();f();assert.equal(h.native.releases,1);assert.equal(h.timers.size,0);
 h.native.allowed=false;assert.equal(h.requestAppAudio(),false);
});
