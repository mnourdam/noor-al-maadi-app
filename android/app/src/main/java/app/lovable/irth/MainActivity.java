package app.lovable.irth;

import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * DIAGNOSTIC BUILD:
 * MainActivity is intentionally plain: no immersive mode, no edge-to-edge,
 * no WindowInsetsController, no decorFitsSystemWindows changes, and no system
 * bar hiding. Only lightweight WebView/input diagnostics remain.
 *
 * Logs use [android:ime] and [android:webview] for grep in Logcat.
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "IrthMainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);

        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageStarted(WebView webView) {
                Log.i(TAG, "[android:webview] pageStarted url=" + webView.getUrl() + " id=" + System.identityHashCode(webView));
            }

            @Override
            public void onPageCommitVisible(WebView webView, String url) {
                Log.i(TAG, "[android:webview] pageCommitVisible url=" + url + " id=" + System.identityHashCode(webView));
            }

            @Override
            public void onPageLoaded(WebView webView) {
                Log.i(TAG, "[android:webview] pageLoaded url=" + webView.getUrl() + " progress=" + webView.getProgress() + " id=" + System.identityHashCode(webView));
                injectInputDiagnostics(webView);
            }

            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                Log.e(TAG, "[android:webview] renderProcessGone didCrash=" + detail.didCrash() + " priority=" + detail.rendererPriorityAtExit());
                return false;
            }
        });

        super.onCreate(savedInstanceState);
        Log.i(TAG, "[android:ime] onCreate softInputMode=adjustResize|stateHidden immersive=DISABLED edgeToEdge=DISABLED hardwareAccelerated=false webDebug=" + debuggable);
        configureWebViewForInputDiagnostics();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        Log.i(TAG, "[android:ime] onWindowFocusChanged hasFocus=" + hasFocus + " fullscreen=SKIPPED edgeToEdge=SKIPPED");
        logWebViewState("windowFocusChanged");
    }

    @Override
    protected void onResume() {
        super.onResume();
        Log.i(TAG, "[android:webview] onResume activity resumed");
        logWebViewState("onResume");
    }

    @Override
    protected void onPause() {
        Log.i(TAG, "[android:webview] onPause activity pausing");
        logWebViewState("onPause");
        super.onPause();
    }

    private void configureWebViewForInputDiagnostics() {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) {
            Log.w(TAG, "[android:webview] configure skipped: bridge/webView is null");
            return;
        }

        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setClickable(true);
        webView.setLongClickable(true);
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        webView.requestFocus(View.FOCUS_DOWN);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);

        webView.setOnFocusChangeListener((view, hasFocus) -> {
            Log.i(TAG, "[android:webview] nativeFocus hasFocus=" + hasFocus + " view=" + view.getClass().getSimpleName() + " id=" + System.identityHashCode(view));
        });
        webView.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == android.view.MotionEvent.ACTION_DOWN) {
                Log.i(TAG, "[android:webview] touchDown hasFocus=" + view.hasFocus() + " focusable=" + view.isFocusable() + " focusableInTouch=" + view.isFocusableInTouchMode() + " url=" + webView.getUrl());
            }
            return false;
        });

        logViewHierarchy();
        logWebViewState("configured");
    }

    private void logWebViewState(String source) {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) {
            Log.w(TAG, "[android:webview] " + source + " webView=null");
            return;
        }
        Log.i(TAG, "[android:webview] " + source
            + " id=" + System.identityHashCode(webView)
            + " url=" + webView.getUrl()
            + " hasFocus=" + webView.hasFocus()
            + " focusable=" + webView.isFocusable()
            + " focusableInTouch=" + webView.isFocusableInTouchMode()
            + " shown=" + webView.isShown()
            + " attached=" + webView.isAttachedToWindow()
            + " layerType=" + webView.getLayerType()
            + " progress=" + webView.getProgress());
    }

    private void logViewHierarchy() {
        View content = findViewById(android.R.id.content);
        if (!(content instanceof ViewGroup root)) {
            Log.i(TAG, "[android:webview] hierarchy content=" + (content == null ? "null" : content.getClass().getName()));
            return;
        }
        Log.i(TAG, "[android:webview] hierarchy root=" + root.getClass().getName() + " children=" + root.getChildCount() + " clickable=" + root.isClickable() + " focusable=" + root.isFocusable());
        for (int i = 0; i < root.getChildCount(); i++) {
            View child = root.getChildAt(i);
            Log.i(TAG, "[android:webview] hierarchy child[" + i + "]=" + child.getClass().getName() + " shown=" + child.isShown() + " clickable=" + child.isClickable() + " focusable=" + child.isFocusable());
        }
    }

    private void injectInputDiagnostics(WebView webView) {
        String script = "(function(){"
            + "if(window.__irthNativeInputDiag)return;window.__irthNativeInputDiag=true;"
            + "var p='[android:web-input]';"
            + "function tag(el){if(!el)return 'none';return (el.tagName||'node').toLowerCase()+(el.id?'#'+el.id:'')+(el.type?'['+el.type+']':'');}"
            + "function len(el){return el&&typeof el.value==='string'?el.value.length:null;}"
            + "function log(name,e){try{console.info(p,name,{target:tag(e&&e.target),active:tag(document.activeElement),length:len(e&&e.target),hidden:document.hidden,hasFocus:document.hasFocus&&document.hasFocus()});}catch(_){}}"
            + "['visibilitychange','focus','blur'].forEach(function(n){window.addEventListener(n,function(e){log('window-'+n,e);},true);});"
            + "['focusin','focusout','keydown','beforeinput','input','change','compositionstart','compositionend'].forEach(function(n){document.addEventListener(n,function(e){log(n,e);},true);});"
            + "console.info(p,'installed',{url:location.href,active:tag(document.activeElement)});"
            + "})();";
        webView.evaluateJavascript(script, value -> Log.i(TAG, "[android:web-input] diagnosticScriptInjected result=" + value));
    }
}
