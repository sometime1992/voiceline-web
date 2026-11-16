package com.voiceline.app;

import android.Manifest;
import android.app.Activity;
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

public class MainActivity extends Activity {
    private static final int AUDIO_PERMISSION_REQUEST = 131;
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private WebView web;
    private PermissionRequest pendingAudioRequest;
    private WebViewAssetLoader assetLoader;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            // Chrome://inspect can read the WebView console only in local debug builds.
            WebView.setWebContentsDebuggingEnabled(true);
        }
        assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(16, 15, 27));
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(16, 15, 27));
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // Android 15+ enforces edge-to-edge. Apply safe area ONCE at the native root,
        // consume insets so the WebView does not add duplicate padding.
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
        // Disable native pinch-to-zoom while preserving single-finger vertical scrolling.
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        web.setHorizontalScrollBarEnabled(false);
        settings.setDomStorageEnabled(true);
        // Local application assets must never reuse stale CSS/JS from a previous APK.
        web.clearCache(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                // Do not navigate to an untrusted origin from the microphone-enabled app.
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
        // Always load the packaged version, not a saved stale navigation state.
        web.loadUrl(APP_ORIGIN + "/assets/www/index.html");
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
        if (requestCode == AUDIO_PERMISSION_REQUEST && pendingAudioRequest != null) {
            PermissionRequest request = pendingAudioRequest;pendingAudioRequest = null;
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED)
                request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else request.deny();
        }
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        if (web != null) web.saveState(state);
        super.onSaveInstanceState(state);
    }
    @Override protected void onDestroy() {
        if (pendingAudioRequest != null) {pendingAudioRequest.deny();pendingAudioRequest = null;}
        if (web != null) {web.loadUrl("about:blank");web.destroy();web = null;}
        super.onDestroy();
    }
}
