package com.voiceline.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.content.pm.PackageManager;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.net.Uri;
import android.graphics.Color;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.graphics.Insets;
import android.os.Build;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;
import java.io.*;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private static final int AUDIO_PERMISSION_REQUEST = 131;
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private WebView web;
    private PermissionRequest pendingAudioRequest;
    private WebViewAssetLoader assetLoader;
    private NativeMicBridge nativeMic;
    private RecordingDocuments recordingDocuments;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        web = new PracticeWebView(this);
        web.setBackgroundColor(Color.rgb(16, 15, 27));
        NativeMicBridge.DocumentActions actions=new NativeMicBridge.DocumentActions(){
            public void open(String operation,String source,String name,String mime,String job){recordingDocuments.open(operation,source,name,mime,job);}
            public String begin(String job,String mime,long bytes){return recordingDocuments.begin(job,mime,bytes);}
            public String append(String job,String encoded){return recordingDocuments.append(job,encoded);}
            public String complete(String job){return recordingDocuments.complete(job);}
            public void abort(String job){recordingDocuments.abort(job);}
        };
        nativeMic = new NativeMicBridge(this, web,actions);
        recordingDocuments=new RecordingDocuments(this,nativeMic.recordings(),(job,status,detail)->nativeMic.documentResult(job,status,detail));
        web.addJavascriptInterface(nativeMic, "VoiceLineNative");
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(16, 15, 27));
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return WindowInsets.CONSUMED;
            });
        }
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getWindow().setStatusBarColor(Color.rgb(16, 15, 27));
        getWindow().setNavigationBarColor(Color.rgb(16, 15, 27));
        setContentView(root, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        web.setHorizontalScrollBarEnabled(false);
        settings.setDomStorageEnabled(true);
        web.clearCache(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl();
                if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
                    && uri.getPath()!=null && uri.getPath().startsWith("/recordings/")) return recordingResponse(request);
                return assetLoader.shouldInterceptRequest(uri);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !"appassets.androidplatform.net".equals(uri.getHost());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage msg) {
                if (msg.messageLevel() == ConsoleMessage.MessageLevel.ERROR || msg.messageLevel() == ConsoleMessage.MessageLevel.WARNING)
                    Log.w("VoiceLineWeb", msg.sourceId() + ":" + msg.lineNumber() + " " + msg.message());
                return true;
            }
            @Override public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> handleWebPermission(request));
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                runOnUiThread(() -> {if (pendingAudioRequest == request) pendingAudioRequest = null;});
            }
        });
        web.loadUrl(APP_ORIGIN + "/assets/www/index.html");
    }

    private WebResourceResponse recordingResponse(WebResourceRequest request) {
        Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");headers.put("Accept-Ranges","bytes");
        try {
            String path=request.getUrl().getPath();
            String id=path.substring("/recordings/".length());
            if(!id.endsWith(".wav"))throw new FileNotFoundException();
            id=id.substring(0,id.length()-4);
            if(!NativeWavStore.validId(id))throw new FileNotFoundException();
            if(!"GET".equals(request.getMethod())&&!"HEAD".equals(request.getMethod()))throw new FileNotFoundException();
            File file=nativeMic.recordings().readableFile(id);long size=file.length();
            String rangeHeader=null;
            for(Map.Entry<String,String> entry:request.getRequestHeaders().entrySet())
                if("range".equalsIgnoreCase(entry.getKey()))rangeHeader=entry.getValue();
            RecordingRange range;
            try {range=RecordingRange.parse(rangeHeader,size);}
            catch(IOException e) {
                headers.put("Content-Range","bytes */"+size);headers.put("Content-Length","0");
                return new WebResourceResponse("audio/wav",null,416,"Range Not Satisfiable",headers,new ByteArrayInputStream(new byte[0]));
            }
            headers.put("Content-Length",String.valueOf(range.length));
            if(range.partial)headers.put("Content-Range","bytes "+range.start+"-"+range.end+"/"+size);
            InputStream body="HEAD".equals(request.getMethod())?new ByteArrayInputStream(new byte[0]):range.open(file);
            return new WebResourceResponse("audio/wav",null,range.partial?206:200,range.partial?"Partial Content":"OK",headers,body);
        } catch(Exception e) {
            return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",headers,new ByteArrayInputStream(new byte[0]));
        }
    }

    private void handleWebPermission(PermissionRequest request) {
        Uri origin = request.getOrigin();
        if (origin == null || !APP_ORIGIN.equals(origin.getScheme() + "://" + origin.getHost())) {request.deny();return;}
        boolean asksForAudio = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) asksForAudio = true;
            else {request.deny();return;}
        }
        if (!asksForAudio) {request.deny();return;}
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            if (pendingAudioRequest != null) pendingAudioRequest.deny();
            pendingAudioRequest = request;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(requestCode, permissions, grants);
        if (requestCode == NativeMicBridge.PERMISSION_CODE && nativeMic != null) {
            nativeMic.onPermissionResult(grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED);
            return;
        }
        if (requestCode == AUDIO_PERMISSION_REQUEST && pendingAudioRequest != null) {
            PermissionRequest request = pendingAudioRequest;pendingAudioRequest = null;
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED)
                request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else request.deny();
        }
    }

    @Override public void onBackPressed() {
        if(recordingDocuments!=null&&recordingDocuments.isBusy()){
            web.evaluateJavascript("window.VoiceLineDocuments&&window.VoiceLineDocuments.onBusy()",null);return;
        }
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("Boolean(window.VoiceLineLifecycle&&window.VoiceLineLifecycle.onBack())", handled -> {
            if (isFinishing() || isDestroyed() || "true".equals(handled)) return;
            if (web != null && web.canGoBack()) web.goBack();
            else MainActivity.super.onBackPressed();
        });
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        if(recordingDocuments!=null&&recordingDocuments.onActivityResult(requestCode,resultCode,data))return;
        super.onActivityResult(requestCode,resultCode,data);
    }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        // Rotation resizes the existing page; capture and its WAV stay alive.
        if (web != null) web.post(() -> {
            if (web != null && !isDestroyed()) web.evaluateJavascript(
                "window.VoiceLineLifecycle&&window.VoiceLineLifecycle.onResize()", null);
        });
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        if (web != null) web.saveState(state);
        super.onSaveInstanceState(state);
    }
    @Override protected void onPause() {
        // A transient dialog/focus change is not a new recording session.
        // Only an actual background transition (onStop) finalizes capture.
        super.onPause();
    }
    private void pauseCapture() {
        if (web != null) web.evaluateJavascript(
            "window.VoiceLineLifecycle&&window.VoiceLineLifecycle.onPause()", null);
        if (nativeMic != null) nativeMic.stopFromActivity();
    }
    @Override protected void onStop() {
        pauseCapture();
        super.onStop();
    }
    @Override protected void onResume() {
        super.onResume();
        if (nativeMic != null) nativeMic.resumeFromActivity();
        if (web != null) web.evaluateJavascript(
            "window.VoiceLineLifecycle&&window.VoiceLineLifecycle.onResume()", null);
    }
    @Override protected void onDestroy() {
        if(recordingDocuments!=null)recordingDocuments.dispose();
        if (nativeMic != null) nativeMic.dispose();
        if (pendingAudioRequest != null) {pendingAudioRequest.deny();pendingAudioRequest = null;}
        if (web != null) {web.removeJavascriptInterface("VoiceLineNative");web.loadUrl("about:blank");web.destroy();web = null;}
        super.onDestroy();
    }
}
