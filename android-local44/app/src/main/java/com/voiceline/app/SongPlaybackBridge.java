package com.voiceline.app;

import android.app.Activity;
import android.net.Uri;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;

/**
 * Local song playback uses the SAME AudioSessionGuard as the native microphone.
 * No URLs, network sources, external music services, extracted stems or file exports.
 * Only user-selected ACTION_OPEN_DOCUMENT content:// URIs can become audio sources.
 */
public final class SongPlaybackBridge {
    private final Activity activity;
    private final AudioSessionGuard audioSession;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final Object guard=new Object();
    private volatile String pendingRole="original";
    private Uri originalUri, instrumentalUri;
    private MediaPlayer player;
    private volatile boolean ready=false, playing=false, disposed=false;
    private volatile int durationMs=0,positionMs=0;
    private volatile String error="";
    private long generation=0;
    private final Runnable updateClock=new Runnable(){
        @Override public void run(){
            if(disposed)return;
            try{
                if(player!=null&&ready){
                    positionMs=player.getCurrentPosition();
                    playing=player.isPlaying();
                }
            }catch(RuntimeException ignored){playing=false;}
            main.postDelayed(this,90);
        }
    };
    public SongPlaybackBridge(Activity activity, AudioSessionGuard audioSession){
        this.activity=activity;this.audioSession=audioSession;
        main.post(updateClock);
    }
    @JavascriptInterface public void selectRole(String role){
        if("original".equals(role)||"mr".equals(role)||"vocal".equals(role))pendingRole=role;
    }
    public void onFileChosen(Uri selected){
        String role=pendingRole;pendingRole="original";
        if(selected==null||disposed)return;
        if(!"content".equals(selected.getScheme())){error="Only a user-selected local document may be opened.";return;}
        activity.runOnUiThread(()->{
            if(disposed)return;
            if("original".equals(role)){originalUri=selected;instrumentalUri=null;prepareSelected();}
            else if("mr".equals(role)){instrumentalUri=selected;prepareSelected();}
        });
    }
    /** Discard in-memory document URIs and decoded audio at the end of song mode. */
    @JavascriptInterface public void clearSession(){
        activity.runOnUiThread(()->{
            if(disposed)return;
            originalUri=null;
            instrumentalUri=null;
            pendingRole="original";
            prepare(null);
        });
    }
    @JavascriptInterface public void clearMR(){
        activity.runOnUiThread(()->{instrumentalUri=null;prepareSelected();});
    }
    @JavascriptInterface public void useMR(boolean enabled){
        activity.runOnUiThread(()->{
            Uri want=enabled&&instrumentalUri!=null?instrumentalUri:originalUri;
            Uri current=currentUri;
            if(want!=null&&!want.equals(current))prepare(want);
        });
    }
    private Uri currentUri;
    private void prepareSelected(){prepare(instrumentalUri!=null?instrumentalUri:originalUri);}
    private void prepare(Uri uri){
        long myGeneration=++generation;
        ready=false;playing=false;durationMs=0;positionMs=0;error="";
        if(player!=null){try{player.stop();}catch(RuntimeException ignored){}player.release();player=null;}
        currentUri=uri;
        if(uri==null)return;
        try{
            MediaPlayer next=new MediaPlayer();
            next.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            next.setDataSource(activity,uri);
            player=next;
            next.setOnPreparedListener(p->{
                if(disposed||myGeneration!=generation){p.release();return;}
                durationMs=p.getDuration();positionMs=0;ready=true;error="";
            });
            next.setOnCompletionListener(p->{playing=false;positionMs=durationMs;});
            next.setOnErrorListener((p,what,extra)->{
                if(myGeneration==generation){ready=false;playing=false;error="Cannot decode selected audio ("+what+").";}
                return true;
            });
            next.prepareAsync();
        }catch(Exception exception){
            ready=false;playing=false;error="Unable to open local audio: "+exception.getClass().getSimpleName();
            if(player!=null){player.release();player=null;}
        }
    }
    @JavascriptInterface public boolean isReady(){return ready&&!disposed;}
    @JavascriptInterface public boolean isPlaying(){return playing&&!disposed;}
    @JavascriptInterface public int position(){return positionMs;}
    @JavascriptInterface public int duration(){return durationMs;}
    @JavascriptInterface public String error(){return error;}
    @JavascriptInterface public boolean hasMR(){return instrumentalUri!=null;}
    @JavascriptInterface public boolean play(){
        if(disposed||!ready||player==null)return false;
        if(!audioSession.request()) {error="Audio focus unavailable.";return false;}
        activity.runOnUiThread(()->{
            if(disposed||!ready||player==null)return;
            try{player.start();playing=true;error="";}catch(RuntimeException e){playing=false;error="Unable to start playback.";}
        });
        return true;
    }
    @JavascriptInterface public void pause(){activity.runOnUiThread(this::pauseNow);}
    private void pauseNow(){
        if(player!=null&&ready){try{if(player.isPlaying())player.pause();positionMs=player.getCurrentPosition();}catch(RuntimeException ignored){}}
        playing=false;
    }
    @JavascriptInterface public void seek(int ms){
        activity.runOnUiThread(()->{
            if(player==null||!ready)return;
            int desired=Math.max(0,Math.min(durationMs,ms));
            try{player.seekTo(desired);positionMs=desired;}catch(RuntimeException ignored){}
        });
    }
    public void pauseFromActivity(){activity.runOnUiThread(this::pauseNow);}
    public void dispose(){
        disposed=true;
        main.removeCallbacks(updateClock);
        activity.runOnUiThread(()->{
            ++generation;ready=false;playing=false;
            if(player!=null){try{player.stop();}catch(RuntimeException ignored){}player.release();player=null;}
            originalUri=null;instrumentalUri=null;
        });
    }
}
