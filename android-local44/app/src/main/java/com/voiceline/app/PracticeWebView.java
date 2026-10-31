package com.voiceline.app;

import android.content.Context;
import android.view.ActionMode;
import android.webkit.WebView;

/** No text-selection toolbar; DOM pointer gestures and normal editing remain available. */
public final class PracticeWebView extends WebView {
    public PracticeWebView(Context context) { super(context); }

    @Override public ActionMode startActionMode(ActionMode.Callback callback) {
        return null;
    }

    @Override public ActionMode startActionMode(ActionMode.Callback callback, int type) {
        return null;
    }
}
