package com.voiceline.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;

/**
 * Native microphone input for VoiceLine's bundled offline Android application.
 * Audio never leaves this device. Only the packaged app page receives PCM chunks.
 */
public final class NativeMicBridge {
    public static final int PERMISSION_CODE = 132;
    private final Activity activity;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean capturing = false;
    private AudioRecord recorder;
    private Thread captureThread;
    private int sampleRate = 44100;
    private String diagnostic = "준비";
    private long generation = 0L;

    public NativeMicBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
    }

    @JavascriptInterface
    public void start() {
        main.post(() -> {
            if (capturing) { dispatch("started", "마이크 연결됨"); return; }
            if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                diagnostic = "안드로이드 마이크 권한 요청";
                dispatch("permission", diagnostic);
                activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, PERMISSION_CODE);
            } else {
                startNative();
            }
        });
    }

    @JavascriptInterface
    public void stop() {
        main.post(this::stopNative);
    }

    @JavascriptInterface
    public String diagnostics() {
        boolean granted = activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        return "Android " + Build.VERSION.SDK_INT + " / 마이크 권한 " + (granted ? "허용" : "없음")
            + " / 네이티브 입력 " + (capturing ? "동작 중" : "중지")
            + " / 최근 상태: " + diagnostic;
    }

    public void onPermissionResult(boolean granted) {
        if (granted) startNative();
        else {
            diagnostic = "마이크 사용 권한이 거부됨";
            dispatch("denied", diagnostic + " · 설정 > 애플리케이션 > 보이스라인 > 권한 > 마이크에서 허용해 주세요.");
        }
    }

    private void startNative() {
        if (capturing) { dispatch("started", "마이크 연결됨"); return; }
        AudioRecord input = null;
        try {
            int rate = 44100;
            int min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (min <= 0) {
                rate = 16000;
                min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            }
            if (min <= 0) throw new IllegalStateException("지원되는 오디오 입력 속도를 찾지 못했습니다 (code " + min + ")");
            int chunkSize = 4096;
            int bufferSize = Math.max(min, chunkSize * 4);
            input = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, rate,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize);
            if (input.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("오디오 입력 장치 초기화 실패");
            input.startRecording();
            if (input.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new IllegalStateException("마이크 녹음 시작 실패");
            recorder = input;
            sampleRate = rate;
            capturing = true;
            long token = ++generation;
            diagnostic = "네이티브 마이크 연결 성공 · " + rate + "Hz";
            dispatch("started", diagnostic);
            int finalRate = rate;
            final AudioRecord captureInput = input;
            captureThread = new Thread(() -> captureLoop(captureInput, finalRate, chunkSize, token), "VoiceLineMicrophone");
            captureThread.setDaemon(true);
            captureThread.start();
        } catch (Exception e) {
            if (input != null) {
                try {input.stop();} catch (Exception ignored) {}
                try {input.release();} catch (Exception ignored) {}
            }
            recorder = null;
            capturing = false;
            diagnostic = e.getClass().getSimpleName() + ": " + e.getMessage();
            Log.e("VoiceLineMic", "Cannot start native input", e);
            dispatch("error", diagnostic);
        }
    }

    private void captureLoop(AudioRecord input, int rate, int chunkSize, long token) {
        short[] pcm = new short[chunkSize];
        int errors = 0;
        while (capturing && token == generation) {
            int read;
            try {read = input.read(pcm, 0, pcm.length, AudioRecord.READ_BLOCKING);}
            catch (Exception e) {read = AudioRecord.ERROR_INVALID_OPERATION;}
            if (read <= 0) {
                if (++errors >= 4) {
                    int errorCode = read;
                    main.post(() -> {
                        if (capturing && generation == token) {
                            diagnostic = "마이크 오디오 읽기 실패 (" + errorCode + ")";
                            dispatch("error", diagnostic);
                            stopNative();
                        }
                    });
                    break;
                }
                continue;
            }
            errors = 0;
            byte[] bytes = new byte[read * 2];
            for (int i = 0; i < read; i++) {
                bytes[2 * i] = (byte)(pcm[i] & 0xff);
                bytes[2 * i + 1] = (byte)((pcm[i] >> 8) & 0xff);
            }
            String encoded = Base64.encodeToString(bytes, Base64.NO_WRAP);
            main.post(() -> {
                if (capturing && generation == token) {
                    sendJs("window.VoiceLineNativeAudio&&window.VoiceLineNativeAudio.onAudioChunk("
                            + JSONObject.quote(encoded) + "," + rate + ")");
                }
            });
        }
    }

    private void dispatch(String status, String detail) {
        sendJs("window.VoiceLineNativeAudio&&window.VoiceLineNativeAudio.onState("
                + JSONObject.quote(status) + "," + JSONObject.quote(detail) + ")");
    }

    private void sendJs(String code) {
        if (web != null) web.evaluateJavascript(code, null);
    }

    private void stopNative() {
        capturing = false;
        generation++;
        AudioRecord old = recorder;
        recorder = null;
        if (old != null) {
            try {old.stop();} catch (Exception ignored) {}
            try {old.release();} catch (Exception ignored) {}
        }
        captureThread = null;
        diagnostic = "마이크 중지";
    }

    public void stopFromActivity() {
        if (Looper.myLooper() == Looper.getMainLooper()) stopNative();
        else main.post(this::stopNative);
    }
}
