'use strict';
module.exports={
  'android/Manifest.java':'package android; public class Manifest { public static class permission {public static final String RECORD_AUDIO="audio";} }',
  'android/content/pm/PackageManager.java':'package android.content.pm; public class PackageManager { public static final int PERMISSION_GRANTED=0; }',
  'android/app/Activity.java':`package android.app; public class Activity {public boolean allowed;public int prompts;private final java.io.File files=new java.io.File(System.getProperty("java.io.tmpdir"),"voiceline-bridge-"+System.nanoTime());public java.io.File getFilesDir(){return files;} public int checkSelfPermission(String permission){return allowed?0:-1;}public void requestPermissions(String[] permissions,int code){prompts++;}public boolean isFinishing(){return false;}public boolean isDestroyed(){return false;}}`,
  'android/os/Looper.java':'package android.os; public class Looper {static final Looper MAIN=new Looper();public static Looper getMainLooper(){return MAIN;}public static Looper myLooper(){return MAIN;}}',
  'android/os/Handler.java':'package android.os; public class Handler {public static volatile boolean hold;public static final java.util.Queue<Runnable> pending=new java.util.concurrent.ConcurrentLinkedQueue<>();public static void drain(){Runnable r;while((r=pending.poll())!=null)r.run();}public Handler(Looper loop){}public boolean postDelayed(Runnable work,long delay){Thread t=new Thread(()->{try{Thread.sleep(delay);}catch(Exception e){}work.run();});t.setDaemon(true);t.start();return true;}public boolean post(Runnable work){if(hold)pending.add(work);else work.run();return true;}}',
  'android/util/Base64.java':'package android.util; public class Base64 {public static final int NO_WRAP=2;public static String encodeToString(byte[] bytes,int flags){return java.util.Base64.getEncoder().encodeToString(bytes);}}',
  'android/util/Log.java':'package android.util; public class Log {public static int e(String tag,String text,Throwable error){return 0;}}',
  'android/webkit/JavascriptInterface.java':'package android.webkit; public @interface JavascriptInterface {}',
  'android/webkit/ValueCallback.java':'package android.webkit; public interface ValueCallback<T>{void onReceiveValue(T value);}',
  'android/webkit/WebView.java':'package android.webkit; public class WebView {public final java.util.List<String> scripts=new java.util.concurrent.CopyOnWriteArrayList<>();public boolean holdCallbacks;public final java.util.Queue<ValueCallback<String>> callbacks=new java.util.concurrent.ConcurrentLinkedQueue<>();public void drain(){ValueCallback<String> callback;while((callback=callbacks.poll())!=null)callback.onReceiveValue(null);}public void evaluateJavascript(String script,ValueCallback<String> callback){scripts.add(script);if(callback!=null){if(holdCallbacks)callbacks.add(callback);else callback.onReceiveValue(null);}}}',
  'org/json/JSONObject.java':String.raw`package org.json; public class JSONObject {public static String quote(String text){return "\""+text.replace("\\","\\\\").replace("\"","\\\"")+"\"";}}`,
  'android/media/AudioFormat.java':'package android.media; public class AudioFormat {public static final int CHANNEL_IN_MONO=1,ENCODING_PCM_16BIT=2;}',
  'android/media/MediaRecorder.java':'package android.media; public class MediaRecorder {public static class AudioSource {public static final int VOICE_RECOGNITION=6;}}',
  'android/media/AudioRecord.java':`package android.media; public class AudioRecord {
   public static final int STATE_INITIALIZED=1,RECORDSTATE_RECORDING=3,READ_BLOCKING=0,ERROR_INVALID_OPERATION=-3;
   public static int created;public static AudioRecord last;private volatile boolean running;
   public static final java.util.concurrent.BlockingQueue<short[]> chunks=new java.util.concurrent.LinkedBlockingQueue<>();
   public static volatile java.util.concurrent.CountDownLatch entered,releaseRead;

   public static int getMinBufferSize(int rate,int channels,int format){return rate==44100?-1:2048;}
   public AudioRecord(int source,int rate,int channels,int format,int size){last=this;created++;if(rate!=16000)throw new AssertionError("fallback rate");}
   public int getState(){return STATE_INITIALIZED;}public void startRecording(){running=true;}public int getRecordingState(){return running?RECORDSTATE_RECORDING:0;}
   public int read(short[] pcm,int offset,int length,int mode){while(running){try{short[] chunk=chunks.poll(2,java.util.concurrent.TimeUnit.MILLISECONDS);if(chunk==null)continue;
    if(entered!=null){entered.countDown();releaseRead.await();entered=null;}
    System.arraycopy(chunk,0,pcm,offset,chunk.length);return chunk.length;
   }catch(InterruptedException ignored){}}return ERROR_INVALID_OPERATION;}
   public void stop(){running=false;}public void release(){running=false;}
  }`,
  'com/voiceline/app/BridgeTest.java':`package com.voiceline.app;
   import android.app.Activity;import android.webkit.WebView;import android.media.AudioRecord;
   public class BridgeTest {
    static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    public static void main(String[] args) throws Exception {
     Activity activity=new Activity();WebView web=new WebView();NativeMicBridge bridge=new NativeMicBridge(activity,web);
     bridge.start("1");check(bridge.isPermissionPending(),"permission pending");bridge.stop("1");
     activity.allowed=true;bridge.onPermissionResult(true);check(AudioRecord.created==0,"late permission started cancelled capture");
     bridge.start("2");check(AudioRecord.created==1,"valid capture not started");
     check(web.scripts.stream().anyMatch(s->s.contains("onState(\\\"started\\\"")&&s.contains("16000")),"confirmed rate was not dispatched");
     bridge.stop("1");check(AudioRecord.last.getRecordingState()==AudioRecord.RECORDSTATE_RECORDING,"stale stop killed current capture");
     bridge.stop("2");check(AudioRecord.last.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING,"matching stop failed");
     activity.allowed=false;bridge.start("3");bridge.stopFromActivity();activity.allowed=true;bridge.onPermissionResult(true);
     check(AudioRecord.created==1,"permission restarted microphone in background");
     bridge.resumeFromActivity();check(AudioRecord.created==1,"resume restarted capture without a new request");
     bridge.start("4");check(AudioRecord.created==2,"new request after resume failed");bridge.dispose();
     bridge.start("5");check(AudioRecord.created==2,"disposed bridge accepted start");
     // Emulate delayed UI delivery while the capture thread writes the final read.
     Activity fileActivity=new Activity();fileActivity.allowed=true;WebView fileWeb=new WebView();NativeMicBridge fileBridge=new NativeMicBridge(fileActivity,fileWeb);
     fileBridge.start("20");String begun=fileBridge.beginRecording("20","tail-test");check(begun.contains("startFrame"),"file did not begin");
     android.os.Handler.hold=true;
     AudioRecord.chunks.add(new short[]{11,12,0,0});
     long deadline=System.currentTimeMillis()+3000;java.io.File wav=new java.io.File(fileActivity.getFilesDir(),"voiceline-recordings/tail-test.wav");
     while(wav.length()<52&&System.currentTimeMillis()<deadline)Thread.sleep(2);
     check(wav.length()==52,"first samples not persisted before UI delivery");
     AudioRecord.entered=new java.util.concurrent.CountDownLatch(1);AudioRecord.releaseRead=new java.util.concurrent.CountDownLatch(1);
     AudioRecord.chunks.add(new short[]{0,0,21,22});check(AudioRecord.entered.await(2,java.util.concurrent.TimeUnit.SECONDS),"tail read did not start");
     fileBridge.finishRecording("20","tail-test");check(fileWeb.scripts.stream().noneMatch(s->s.contains("onRecordingFinished")),"ack arrived before final read");
     AudioRecord.releaseRead.countDown();deadline=System.currentTimeMillis()+3000;
     while(fileBridge.getRecordingInfo("tail-test").contains("error")&&System.currentTimeMillis()<deadline)Thread.sleep(2);
     check(fileBridge.getRecordingInfo("tail-test").contains("frames\\\":8"),"final frame count mismatch");
     android.os.Handler.hold=false;android.os.Handler.drain();
     int lastAudio=-1,ack=-1;for(int i=0;i<fileWeb.scripts.size();i++){String script=fileWeb.scripts.get(i);if(script.contains("onAudioChunk"))lastAudio=i;if(script.contains("onRecordingFinished"))ack=i;}
     check(lastAudio>=0&&ack>lastAudio,"file ack must follow the last PCM message");
     byte[] bytes=java.nio.file.Files.readAllBytes(wav.toPath());check(bytes.length==60,"continuous WAV length");
     short[] expected={11,12,0,0,0,0,21,22};for(int i=0;i<expected.length;i++)check((short)((bytes[44+2*i]&255)|((bytes[45+2*i]&255)<<8))==expected[i],"lost sample including silence or tail");
     check(fileBridge.getPendingRecordings().contains("tail-test"),"uncommitted native take not recoverable");
     check(fileBridge.commitRecording("tail-test").isEmpty(),"commit failed");check(fileBridge.getPendingRecordings().equals("[]"),"committed take appeared as duplicate recovery");
     fileBridge.deleteRecording("tail-test");fileBridge.dispose();
     System.out.println("Native permission cancellation, rate, stale callbacks, final read and file acknowledgement passed");
    }
   }`
 };
