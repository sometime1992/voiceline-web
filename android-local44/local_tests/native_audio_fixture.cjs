'use strict';
module.exports={
 'android/os/Build.java':'package android.os;public class Build{public static class VERSION{public static int SDK_INT=36;}}',
 'android/media/AudioDeviceInfo.java':'package android.media;public class AudioDeviceInfo{private final int id;public AudioDeviceInfo(int id){this.id=id;}public int getId(){return id;}}',
 'android/media/AudioRouting.java':'package android.media;public interface AudioRouting{public interface OnRoutingChangedListener{void onRoutingChanged(AudioRouting router);}}',
 'android/media/AudioRecordingConfiguration.java':'package android.media;public class AudioRecordingConfiguration{public final int session;public final boolean silenced;public AudioRecordingConfiguration(int session,boolean silenced){this.session=session;this.silenced=silenced;}public int getClientAudioSessionId(){return session;}public boolean isClientSilenced(){return silenced;}}',
 'android/media/AudioAttributes.java':'package android.media;public class AudioAttributes{public static final int USAGE_MEDIA=1,CONTENT_TYPE_MUSIC=2;public static class Builder{public Builder setUsage(int value){return this;}public Builder setContentType(int value){return this;}public AudioAttributes build(){return new AudioAttributes();}}}',
 'android/media/AudioFocusRequest.java':`package android.media;import android.os.Handler;public class AudioFocusRequest{
 public AudioManager.OnAudioFocusChangeListener listener;public boolean delayed,willPause;
 public static class Builder{final AudioFocusRequest r=new AudioFocusRequest();public Builder(int gain){}
 public Builder setAudioAttributes(AudioAttributes a){return this;}public Builder setAcceptsDelayedFocusGain(boolean b){r.delayed=b;return this;}public Builder setWillPauseWhenDucked(boolean b){r.willPause=b;return this;}
 public Builder setOnAudioFocusChangeListener(AudioManager.OnAudioFocusChangeListener l,Handler h){r.listener=l;return this;}public AudioFocusRequest build(){return r;}}
 }`,
 'android/media/AudioManager.java':`package android.media;import java.util.List;public class AudioManager{
 public static final int AUDIOFOCUS_GAIN=1,AUDIOFOCUS_LOSS=-1,AUDIOFOCUS_LOSS_TRANSIENT=-2,AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK=-3,AUDIOFOCUS_REQUEST_GRANTED=1,AUDIOFOCUS_REQUEST_FAILED=0;
 public interface OnAudioFocusChangeListener{void onAudioFocusChange(int change);}
 public static class AudioRecordingCallback{public void onRecordingConfigChanged(List<AudioRecordingConfiguration> configurations){}}
 public int result=AUDIOFOCUS_REQUEST_GRANTED,requests,abandons;public AudioFocusRequest last,active;
 public int requestAudioFocus(AudioFocusRequest r){AudioFocusRequest previous=active;last=r;requests++;if(result==AUDIOFOCUS_REQUEST_GRANTED){active=r;if(previous!=null&&previous!=r)previous.listener.onAudioFocusChange(AUDIOFOCUS_LOSS);}return result;}public int abandonAudioFocusRequest(AudioFocusRequest r){if(active==r)active=null;abandons++;return 1;}
 }`
};
