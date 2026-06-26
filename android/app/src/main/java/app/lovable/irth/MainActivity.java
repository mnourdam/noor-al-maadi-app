package app.lovable.irth;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.res.Configuration;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
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
    private static int createCount = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        createCount++;
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
        Log.i(TAG, "[android:ime] onCreate count=" + createCount + " softInputMode=adjustResize|stateHidden immersive=DISABLED edgeToEdge=DISABLED hardwareAccelerated=true webDebug=" + debuggable);
        configureWebViewForInputDiagnostics();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        Log.i(TAG, "[android:ime] onConfigurationChanged keyboard=" + newConfig.keyboard + " keyboardHidden=" + newConfig.keyboardHidden + " hardKeyboardHidden=" + newConfig.hardKeyboardHidden + " orientation=" + newConfig.orientation);
        logWebViewState("configurationChanged");
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

        try {
            webView.addJavascriptInterface(new NativeDiagnosticsBridge(), "IrthNativeDiagnostics");
        } catch (Exception ex) {
            Log.w(TAG, "[android:webview] addJavascriptInterface failed: " + ex.getMessage());
        }

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

    private class NativeDiagnosticsBridge {
        @JavascriptInterface
        public void openBareInputTest() {
            runOnUiThread(() -> {
                Log.i(TAG, "[android:webview] openBareInputTest requested from WebView");
                startActivity(new Intent(MainActivity.this, BareInputTestActivity.class));
            });
        }
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
        logViewTree(root, "content", 0);
    }

    private void logViewTree(View view, String path, int depth) {
        if (view == null || depth > 4) return;
        Log.i(TAG, "[android:webview] hierarchy " + path
            + " class=" + view.getClass().getName()
            + " shown=" + view.isShown()
            + " clickable=" + view.isClickable()
            + " focusable=" + view.isFocusable()
            + " focusableInTouch=" + view.isFocusableInTouchMode()
            + " alpha=" + view.getAlpha()
            + " width=" + view.getWidth()
            + " height=" + view.getHeight());
        if (!(view instanceof ViewGroup group)) return;
        for (int i = 0; i < group.getChildCount(); i++) {
            logViewTree(group.getChildAt(i), path + "/" + i, depth + 1);
        }
    }

    private void injectInputDiagnostics(WebView webView) {
        String script = "(function(){"
            + "if(window.__irthNativeInputDiag)return;window.__irthNativeInputDiag=true;"
            + "var p='[android:web-input]';"
            + "function tag(el){if(!el)return 'none';return (el.tagName||'node').toLowerCase()+(el.id?'#'+el.id:'')+(el.type?'['+el.type+']':'');}"
            + "function len(el){return el&&typeof el.value==='string'?el.value.length:null;}"
            + "function rect(el){try{if(!el||!el.getBoundingClientRect)return null;var r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};}catch(_){return null;}}"
            + "function log(name,e){try{console.info(p,name,{target:tag(e&&e.target),active:tag(document.activeElement),length:len(e&&e.target),rect:rect(e&&e.target),hidden:document.hidden,hasFocus:document.hasFocus&&document.hasFocus()});}catch(_){}}"
            + "['visibilitychange','focus','blur'].forEach(function(n){window.addEventListener(n,function(e){log('window-'+n,e);},true);});"
            + "document.addEventListener('focusin',function(e){log('focusin',e);setTimeout(function(){log('focusin-stable',e);},250);},true);"
            + "['focusout','keydown','beforeinput','input','change','compositionstart','compositionend'].forEach(function(n){document.addEventListener(n,function(e){log(n,e);},true);});"
            + "console.info(p,'installed',{url:location.href,active:tag(document.activeElement)});"
            + "})();";
        webView.evaluateJavascript(script, value -> Log.i(TAG, "[android:web-input] diagnosticScriptInjected result=" + value));
    }
}
