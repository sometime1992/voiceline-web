package com.voiceline.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONObject;

/** Session-scoped capture. Audio is written on the capture thread, never queued in JS. */
public final class NativeMicBridge {
    public static final int PERMISSION_CODE = 132;
    private final Activity activity;
    private final WebView web;
    private final NativeWavStore files;
    public interface DocumentActions {
        void open(String operation,String source,String name,String mime,String job);
        String begin(String job,String mime,long bytes);
        String append(String job,String encoded);
        String complete(String job);
        void abort(String job);
    }
    private final DocumentActions documents;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean capturing;
    private volatile Capture active;
    private String requestedId;
    private boolean wantsCapture, permissionPending;
    private volatile boolean foreground = true, disposed;
    private static final class Capture {
        final AudioRecord input;
        final String id;
        final int rate;
        final Object lock = new Object();
        final AtomicInteger queued = new AtomicInteger();
        volatile boolean finish, cancelled;
        volatile NativeWavStore.Writer writer;
        long frames;
        Capture(AudioRecord input,String id,int rate) {this.input=input;this.id=id;this.rate=rate;}
    }
    public NativeMicBridge(Activity activity,WebView web) {
        this(activity,web,null);
    }
    public NativeMicBridge(Activity activity,WebView web,DocumentActions documents) {
        this.activity=activity;this.web=web;this.documents=documents;this.files=new NativeWavStore(activity.getFilesDir());
    }
    public NativeWavStore recordings() { return files; }
    @JavascriptInterface public boolean supportsFileRecording() { return true; }
    @JavascriptInterface public String beginRecording(String requestId,String recordingId) {
        Capture s=active;
        if(s==null||!s.id.equals(requestId)||!capturing||s.finish||disposed||!foreground)return error("마이크가 연결되지 않았습니다");
        synchronized(s.lock) {
            try {
                if(s.writer!=null||s.finish||s.cancelled)throw new IllegalStateException("이미 녹음 중입니다");
                s.writer=files.begin(recordingId,s.rate,s.frames);
                return "{\"startFrame\":"+s.frames+",\"sampleRate\":"+s.rate+"}";
            } catch(Exception e) { return error(e.getMessage()); }
        }
    }
    @JavascriptInterface public void finishRecording(String requestId,String recordingId) {
        Capture s=active;
        if(s!=null&&s.id.equals(requestId)) {
            synchronized(s.lock) {
                if(s.writer!=null&&s.writer.id.equals(recordingId)) {finish(s);return;}
            }
        }
        // Idempotent completion also covers onStop arriving before the JS call.
        main.post(()->dispatchFinished(requestId,recordingId,""));
    }
    @JavascriptInterface public String getPendingRecordings() { return files.pending(); }
    @JavascriptInterface public String getRecordingInfo(String id) {try{return files.info(id,true);}catch(Exception e){return error(e.getMessage());}}
    @JavascriptInterface public String appendRecordingPitch(String id,String lines) {try{files.appendPitch(id,lines);return "";}catch(Exception e){return String.valueOf(e.getMessage());}}
    @JavascriptInterface public String commitRecording(String id) {try{files.commit(id);return "";}catch(Exception e){return String.valueOf(e.getMessage());}}
    @JavascriptInterface public String deleteRecording(String id) {try{files.delete(id);return "";}catch(Exception e){return String.valueOf(e.getMessage());}}
    @JavascriptInterface public String recordingStorage() {
        long available=activity.getFilesDir().getUsableSpace();Capture s=active;int rate=s==null?44100:s.rate;
        NativeWavStore.Writer writer=s==null?null:s.writer;
        long remaining=0xffffffffL-36-(writer==null?0:writer.bytes());
        return "{\"availableBytes\":"+available+",\"sampleRate\":"+rate+",\"seconds\":"+Math.max(0,Math.min(remaining,available-64L*1024*1024)/(rate*2L))+"}";
    }
    @JavascriptInterface public String beginFileTransfer(String job,String mime,String bytes) {
        if(documents==null||disposed||!foreground||!NativeWavStore.validId(job))return "파일 저장을 시작할 수 없습니다.";
        try{return documents.begin(job,mime,Long.parseLong(bytes));}catch(Exception e){return String.valueOf(e.getMessage());}
    }
    @JavascriptInterface public String appendFileTransfer(String job,String encoded) {
        if(documents==null||disposed||!foreground)return "파일 준비가 중단되었습니다.";
        return documents.append(job,encoded);
    }
    @JavascriptInterface public String completeFileTransfer(String job) {return documents==null?"지원하지 않는 기능입니다":documents.complete(job);}
    @JavascriptInterface public void abortFileTransfer(String job) {if(documents!=null)documents.abort(job);}
    @JavascriptInterface public void openRecordingFile(String operation,String source,String name,String mime,String job) {
        main.post(()->{
            if(documents==null||disposed||!foreground||!NativeWavStore.validId(job)){documentResult(job,"error","파일 작업을 시작할 수 없습니다.");return;}
            documents.open(operation,source,name,mime,job);
        });
    }
    public void documentResult(String job,String status,String detail) {
        sendJs("window.VoiceLineDocuments&&window.VoiceLineDocuments.onResult("+JSONObject.quote(job)+","+JSONObject.quote(status)+","+JSONObject.quote(detail)+")");
    }
    private static String error(String text) { return "{\"error\":"+JSONObject.quote(text==null?"녹음 파일 처리 실패":text)+"}"; }

    @JavascriptInterface public void start(String requestId) {
        main.post(()->{
            if(disposed||!foreground||requestId==null||!requestId.matches("[0-9]{1,40}"))return;
            Capture current=active;
            if(capturing&&current!=null&&requestId.equals(current.id)) {dispatch("started","마이크 연결됨",requestId,current.rate);return;}
            if(current!=null&&current.writer!=null) {dispatch("error","이전 녹음을 저장 중입니다",requestId,0);return;}
            cancelRequest(false);wantsCapture=true;requestedId=requestId;
            if(activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) {
                dispatch("permission","안드로이드 마이크 권한 요청",requestId,0);
                if(!permissionPending) {permissionPending=true;activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},PERMISSION_CODE);}
            } else startNative(requestId);
        });
    }
    @JavascriptInterface public void stop(String requestId) {
        main.post(()->{
            Capture s=active;
            if(requestId!=null&&(requestId.equals(requestedId)||(s!=null&&requestId.equals(s.id))))cancelRequest(false);
        });
    }
    public boolean isPermissionPending() {return permissionPending;}
    public void onPermissionResult(boolean granted) {
        permissionPending=false;
        if(disposed||!foreground||!wantsCapture||requestedId==null)return;
        String id=requestedId;
        if(granted)startNative(id);
        else {cancelRequest(false);dispatch("denied","마이크 사용 권한이 거부됨 · 설정 > 애플리케이션 > 보이스라인 > 권한 > 마이크에서 허용해 주세요.",id,0);}
    }
    private void startNative(String id) {
        if(disposed||!foreground||!wantsCapture||!id.equals(requestedId))return;
        AudioRecord input=null;
        try {
            int rate=44100;
            int min=AudioRecord.getMinBufferSize(rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
            if(min<=0) {rate=16000;min=AudioRecord.getMinBufferSize(rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);}
            if(min<=0)throw new IllegalStateException("지원되는 오디오 입력 속도를 찾지 못했습니다 (code "+min+")");
            int chunkSize=rate>=32000?2048:1024;
            input=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(min,rate*4));
            if(input.getState()!=AudioRecord.STATE_INITIALIZED)throw new IllegalStateException("오디오 입력 장치 초기화 실패");
            input.startRecording();if(input.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING)throw new IllegalStateException("마이크 녹음 시작 실패");
            Capture s=new Capture(input,id,rate);active=s;capturing=true;
            dispatch("started","네이티브 마이크 연결 성공 · "+rate+"Hz",id,rate);
            Thread thread=new Thread(()->captureLoop(s,chunkSize),"VoiceLineMicrophone");thread.setDaemon(true);thread.start();
        } catch(Exception e) {
            if(input!=null) {try{input.stop();}catch(Exception ignored){}try{input.release();}catch(Exception ignored){}}
            cancelRequest(false);Log.e("VoiceLineMic","Cannot start native input",e);dispatch("error",e.getClass().getSimpleName()+": "+e.getMessage(),id,0);
        }
    }
    private void captureLoop(Capture s,int chunkSize) {
        short[] pcm=new short[chunkSize];String failure="";String recordingId=null;
        try {
            int errors=0;
            while(!s.cancelled) {
                int read;
                try{read=s.input.read(pcm,0,pcm.length,AudioRecord.READ_BLOCKING);}catch(Exception e){read=AudioRecord.ERROR_INVALID_OPERATION;}
                if(read<=0) {if(s.finish||s.cancelled)break;if(++errors>=4)throw new IllegalStateException("마이크 오디오 읽기 실패 ("+read+")");continue;}
                errors=0;byte[] bytes=new byte[read*2];
                for(int i=0;i<read;i++) {bytes[2*i]=(byte)(pcm[i]&255);bytes[2*i+1]=(byte)((pcm[i]>>8)&255);}
                long frameStart;
                synchronized(s.lock) {
                    frameStart=s.frames;
                    if(s.writer!=null)s.writer.append(bytes);
                    s.frames+=read;
                }
                // Bounded analysis traffic. Every audio sample is already on disk.
                if(s.queued.get()<3&&!s.cancelled) {
                    s.queued.incrementAndGet();String encoded=Base64.encodeToString(bytes,Base64.NO_WRAP);
                    main.post(()->{
                        if(s.cancelled||disposed||activity.isFinishing()||activity.isDestroyed()){s.queued.decrementAndGet();return;}
                        try {
                            web.evaluateJavascript("window.VoiceLineNativeAudio&&window.VoiceLineNativeAudio.onAudioChunk("+JSONObject.quote(encoded)+","+s.rate+","+JSONObject.quote(s.id)+","+frameStart+")",
                                ignored->s.queued.decrementAndGet());
                        }catch(RuntimeException e){s.queued.decrementAndGet();}
                    });
                }
                if(s.finish)break; // Complete the read already in progress, including the final syllable.
            }
        } catch(Exception e) {failure=String.valueOf(e.getMessage());Log.e("VoiceLineMic","Capture failed",e);}
        finally {
            try{s.input.stop();}catch(Exception ignored){}
            try{s.input.release();}catch(Exception ignored){}
            synchronized(s.lock) {
                if(s.writer!=null) {
                    recordingId=s.writer.id;
                    try{s.writer.close();}catch(Exception e){failure=String.valueOf(e.getMessage());}
                    s.writer=null;
                }
            }
            final String completedId=recordingId,completedError=failure;
            // FIFO after all final PCM callbacks; JS can now freeze pitch metadata and commit.
            main.post(()->{
                if(active==s) {capturing=false;active=null;wantsCapture=false;requestedId=null;}
                if(completedId!=null)dispatchFinished(s.id,completedId,completedError);
                if(!completedError.isEmpty())dispatch("error",completedError,s.id,s.rate);
            });
        }
    }
    private void finish(Capture s) {
        if(s.finish)return;s.finish=true;
        // Unblock an unresponsive input. A positive partial read is still written before close.
        main.postDelayed(()->{if(active==s&&s.finish){try{s.input.stop();}catch(Exception ignored){}}},500);
    }
    private void dispatchFinished(String requestId,String id,String failure) {
        String info;
        try {info=files.info(id,false);}catch(Exception e){info=error(e.getMessage());}
        sendJs("window.VoiceLineNativeAudio&&window.VoiceLineNativeAudio.onRecordingFinished("+JSONObject.quote(requestId)+","+JSONObject.quote(id)+","+info+","+JSONObject.quote(failure)+")");
    }
    private void dispatch(String status,String detail,String id,int rate) {
        sendJs("window.VoiceLineNativeAudio&&window.VoiceLineNativeAudio.onState("+JSONObject.quote(status)+","+JSONObject.quote(detail)+","+JSONObject.quote(id==null?"":id)+","+rate+")");
    }
    private void sendJs(String code) {if(!disposed&&!activity.isFinishing()&&!activity.isDestroyed())web.evaluateJavascript(code,null);}
    private void cancelRequest(boolean notify) {
        String oldId=requestedId;wantsCapture=false;requestedId=null;Capture s=active;
        if(s!=null) {
            synchronized(s.lock) {if(s.writer!=null){finish(s);return;}s.cancelled=true;}
            capturing=false;active=null;try{s.input.stop();}catch(Exception ignored){}
        }
        if(notify&&oldId!=null)dispatch("cancelled","마이크 중지",oldId,0);
    }
    public void stopFromActivity() {
        if(Looper.myLooper()==Looper.getMainLooper()) {foreground=false;cancelRequest(true);}else main.post(this::stopFromActivity);
    }
    public void resumeFromActivity() {foreground=true;}
    public void dispose() {disposed=true;foreground=false;cancelRequest(false);}
}
