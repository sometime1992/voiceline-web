package com.voiceline.app;

import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;

/** One foreground audio lease. A lost lease never resumes playback or capture. */
public final class AudioSessionGuard {
    public interface Interruption { void stop(String reason); }
    private final AudioManager manager;
    private final Interruption interruption;
    private final Handler main = new Handler(Looper.getMainLooper());
    private AudioFocusRequest focus;
    private long generation;
    private boolean foreground = true, disposed, interruptionPending;

    public AudioSessionGuard(AudioManager manager, Interruption interruption) {
        this.manager = manager;
        this.interruption = interruption;
    }

    @JavascriptInterface public synchronized boolean request() {
        if (disposed || interruptionPending || !foreground || manager == null) return false;
        if (focus != null) return true;
        final long token = ++generation;
        AudioFocusRequest next = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            .setAcceptsDelayedFocusGain(false)
            .setWillPauseWhenDucked(true)
            .setOnAudioFocusChangeListener(change -> {
                if (change == AudioManager.AUDIOFOCUS_LOSS
                    || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
                    || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                    interrupt(token, "통화 또는 다른 앱의 소리로 중단되었습니다.");
                }
            }, main).build();
        focus = next;
        try {
            if (manager.requestAudioFocus(next) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
                && focus == next) return true;
        } catch (RuntimeException ignored) { }
        if (focus == next) release();
        return false;
    }

    @JavascriptInterface public synchronized void release() {
        AudioFocusRequest old = focus;
        focus = null;
        generation++;
        if (old != null && manager != null) {
            try { manager.abandonAudioFocusRequest(old); } catch (RuntimeException ignored) { }
        }
    }

    private synchronized void interrupt(long token, String reason) {
        if (disposed || focus == null || token != generation) return;
        release();
        interruptionPending = true;
        main.post(() -> {
            try { if (!disposed) interruption.stop(reason); }
            finally { synchronized (AudioSessionGuard.this) { interruptionPending = false; } }
        });
    }

    public synchronized void interrupt(String reason) { interrupt(generation, reason); }

    public synchronized void foreground(boolean value) {
        foreground = value;
        if (!value) interrupt(generation, "화면을 벗어나 연습을 중단했습니다.");
    }

    public synchronized void dispose() { disposed = true; foreground = false; release(); }
}
