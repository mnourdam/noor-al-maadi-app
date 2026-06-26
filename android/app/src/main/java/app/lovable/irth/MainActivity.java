package app.lovable.irth;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.graphics.Rect;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.ArrayList;

/**
 * DIAGNOSTIC BUILD:
 * MainActivity is intentionally plain: no immersive mode, no edge-to-edge,
 * no WindowInsetsController, no decorFitsSystemWindows changes, and no system
 * bar hiding. Only lightweight WebView/input diagnostics remain.
 *
 * Logs use IRTH_NATIVE_TRACE for grep in Logcat:
 *   adb logcat | findstr IRTH
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "IrthMainActivity";
    private static int createCount = 0;
    private int lastKeyboardVisible = -1;
    private int lastKeyboardHeight = -1;
    private AndroidABFlags.Config startupABFlags;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d("IRTH_NATIVE_TRACE", "MAIN_ACTIVITY_ON_CREATE_TRACE_ACTIVE");
        Log.i("IRTH_NATIVE_TRACE", "MAIN_ACTIVITY_ON_CREATE_TRACE_ACTIVE");
        System.out.println("IRTH_NATIVE_TRACE MAIN_ACTIVITY_ON_CREATE_TRACE_ACTIVE");
        createCount++;
        AndroidABFlags.applyIntentToPrefs(this, getIntent());
        startupABFlags = AndroidABFlags.read(this, getIntent());
        AndroidABFlags.logStartup("activity.onCreate", startupABFlags);
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);


        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageStarted(WebView webView) {
                trace("webview.pageStarted", "url=" + webView.getUrl() + " id=" + System.identityHashCode(webView));
            }

            @Override
            public void onPageCommitVisible(WebView webView, String url) {
                trace("webview.pageCommitVisible", "url=" + url + " id=" + System.identityHashCode(webView));
            }

            @Override
            public void onPageLoaded(WebView webView) {
                trace("webview.pageLoaded", "url=" + webView.getUrl() + " progress=" + webView.getProgress() + " id=" + System.identityHashCode(webView));
                injectInputDiagnostics(webView);
            }

            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                traceError("webview.renderProcessGone", "didCrash=" + detail.didCrash() + " priority=" + detail.rendererPriorityAtExit());
                return false;
            }
        });

        super.onCreate(savedInstanceState);
        trace("activity.onCreate", "count=" + createCount + " softInputMode=adjustResize|stateHidden immersive=DISABLED edgeToEdge=DISABLED hardwareAccelerated=true webDebug=" + debuggable);
        logWebViewProvider("main");
        configureWebViewForInputDiagnostics();
        installKeyboardVisibilityLogger();
    }

    @Override
    protected void load() {
        // Capacitor-minimal diagnostic mode: BridgeActivity still creates the
        // normal Capacitor WebView and core bridge, but we explicitly discard
        // every generated app plugin class loaded from capacitor.plugins.json.
        // This isolates input handling from PushNotifications, @capacitor/app
        // backButton listeners, and any other non-essential startup plugin.
        trace("capacitor.minimalLoad", "clearing generated Capacitor plugins before bridge load; core plugins remain only");
        bridgeBuilder.setPlugins(new ArrayList<>());
        prepareWebViewBeforeBridgeLoad();
        super.load();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        AndroidABFlags.applyIntentToPrefs(this, intent);
        startupABFlags = AndroidABFlags.read(this, intent);
        AndroidABFlags.logStartup("activity.onNewIntent", startupABFlags);
        super.onNewIntent(intent);
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView != null) {
            webView.evaluateJavascript(AndroidABFlags.bootstrapScript(startupABFlags), value -> trace("ab.flagsReinjected", "result=" + value));
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        trace("activity.onConfigurationChanged", "keyboard=" + newConfig.keyboard + " keyboardHidden=" + newConfig.keyboardHidden + " hardKeyboardHidden=" + newConfig.hardKeyboardHidden + " orientation=" + newConfig.orientation);
        logWebViewState("configurationChanged");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        trace("activity.onWindowFocusChanged", "hasFocus=" + hasFocus + " fullscreen=SKIPPED edgeToEdge=SKIPPED");
        logWebViewState("windowFocusChanged");
    }

    @Override
    public void onResume() {
        Log.d("IRTH_NATIVE_TRACE", "MAIN_ACTIVITY_ON_RESUME_TRACE_ACTIVE");
        Log.i("IRTH_NATIVE_TRACE", "MAIN_ACTIVITY_ON_RESUME_TRACE_ACTIVE");
        System.out.println("IRTH_NATIVE_TRACE MAIN_ACTIVITY_ON_RESUME_TRACE_ACTIVE");
        super.onResume();
        trace("activity.onResume", "activity resumed");
        logWebViewState("onResume");
    }


    @Override
    public void onPause() {
        trace("activity.onPause", "activity pausing");
        logWebViewState("onPause");
        super.onPause();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        if (event != null) {
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                trace("activity.dispatchTouchEvent", "action=" + motionActionName(action)
                    + " x=" + Math.round(event.getX())
                    + " y=" + Math.round(event.getY())
                    + " pointers=" + event.getPointerCount()
                    + " eventTime=" + event.getEventTime());
            }
        }
        return super.dispatchTouchEvent(event);
    }

    private void configureWebViewForInputDiagnostics() {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) {
            traceWarn("webview.configureSkipped", "bridge/webView is null");
            return;
        }

        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setClickable(true);
        webView.setLongClickable(true);

        try {
            webView.addJavascriptInterface(new NativeDiagnosticsBridge(), "IrthNativeDiagnostics");
        } catch (Exception ex) {
            traceWarn("webview.addJavascriptInterfaceFailed", String.valueOf(ex.getMessage()));
        }

        webView.setOnFocusChangeListener((view, hasFocus) -> {
            trace("webview.nativeFocus", "hasFocus=" + hasFocus + " view=" + view.getClass().getSimpleName() + " id=" + System.identityHashCode(view));
        });
        webView.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == android.view.MotionEvent.ACTION_DOWN) {
                trace("webview.touchDown", "hasFocus=" + view.hasFocus() + " focusable=" + view.isFocusable() + " focusableInTouch=" + view.isFocusableInTouchMode() + " url=" + webView.getUrl());
            }
            return false;
        });

        logViewHierarchy();
        logWebViewState("configured");
    }

    private void prepareWebViewBeforeBridgeLoad() {
        WebView webView = findViewById(com.getcapacitor.android.R.id.webview);
        if (webView == null) {
            traceWarn("ab.prepareSkipped", "webView=null before bridge load");
            return;
        }

        try {
            webView.addJavascriptInterface(new NativeDiagnosticsBridge(), "IrthNativeDiagnostics");
            trace("ab.nativeBridgeReady", "before bridge load");
        } catch (Exception ex) {
            traceWarn("ab.nativeBridgeFailed", String.valueOf(ex.getMessage()));
        }

        if (startupABFlags == null) startupABFlags = AndroidABFlags.read(this, getIntent());
        trace("ab.preloadFlagsReady", AndroidABFlags.simpleLine(startupABFlags));
    }

    private class NativeDiagnosticsBridge {
        @JavascriptInterface
        public void openBareInputTest() {
            runOnUiThread(() -> {
                trace("bridge.openBareInputTest", "requested from WebView");
                startActivity(new Intent(MainActivity.this, BareInputTestActivity.class));
            });
        }

        @JavascriptInterface
        public void logInputEvent(String eventName, String payload) {
            trace("bridge.jsInput." + sanitizeToken(eventName), sanitizePayload(payload));
        }

        @JavascriptInterface
        public String getFocusABFlagsJson() {
            if (startupABFlags == null) startupABFlags = AndroidABFlags.read(MainActivity.this, getIntent());
            return AndroidABFlags.json(startupABFlags);
        }

        @JavascriptInterface
        public String getFocusABFlagsLine() {
            if (startupABFlags == null) startupABFlags = AndroidABFlags.read(MainActivity.this, getIntent());
            return AndroidABFlags.simpleLine(startupABFlags);
        }

        @JavascriptInterface
        public String getFocusABFlagsSource() {
            if (startupABFlags == null) startupABFlags = AndroidABFlags.read(MainActivity.this, getIntent());
            return startupABFlags.source;
        }
    }

    private void logWebViewState(String source) {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) {
            traceWarn("webview." + source, "webView=null");
            return;
        }
        trace("webview." + source,
              "id=" + System.identityHashCode(webView)
            + " url=" + webView.getUrl()
            + " hasFocus=" + webView.hasFocus()
            + " focusable=" + webView.isFocusable()
            + " focusableInTouch=" + webView.isFocusableInTouchMode()
            + " shown=" + webView.isShown()
            + " attached=" + webView.isAttachedToWindow()
            + " layerType=" + webView.getLayerType()
            + " hardwareAccelerated=" + webView.isHardwareAccelerated()
            + " progress=" + webView.getProgress());
    }

    private void logWebViewProvider(String source) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            trace("webview.provider", "source=" + source + " provider=unavailable sdk=" + Build.VERSION.SDK_INT);
            return;
        }
        PackageInfo info = WebView.getCurrentWebViewPackage();
        trace("webview.provider", "source=" + source + " provider=" + (info == null ? "null" : info.packageName + " " + info.versionName));
    }

    private void logViewHierarchy() {
        View content = findViewById(android.R.id.content);
        if (!(content instanceof ViewGroup root)) {
            trace("view.hierarchy", "content=" + (content == null ? "null" : content.getClass().getName()));
            return;
        }
        trace("view.hierarchy", "root=" + root.getClass().getName() + " children=" + root.getChildCount() + " clickable=" + root.isClickable() + " focusable=" + root.isFocusable());
        logViewTree(root, "content", 0);
    }

    private void logViewTree(View view, String path, int depth) {
        if (view == null || depth > 4) return;
        trace("view.hierarchyNode", "path=" + path
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
            + "function payload(name,e){return JSON.stringify({name:name,t:Math.round(performance.now()),route:location.pathname,target:tag(e&&e.target),active:tag(document.activeElement),length:len(e&&e.target),rect:rect(e&&e.target),hidden:document.hidden,hasFocus:document.hasFocus&&document.hasFocus()});}"
            + "function nativeLog(name,e){try{if(window.IrthNativeDiagnostics&&window.IrthNativeDiagnostics.logInputEvent){window.IrthNativeDiagnostics.logInputEvent(name,payload(name,e));}}catch(_){}}"
            + "function log(name,e){nativeLog(name,e);try{console.info('IRTH_NATIVE_TRACE_JS',name,{target:tag(e&&e.target),active:tag(document.activeElement),length:len(e&&e.target),rect:rect(e&&e.target),hidden:document.hidden,hasFocus:document.hasFocus&&document.hasFocus()});}catch(_){}}"
            + "['visibilitychange','focus','blur'].forEach(function(n){window.addEventListener(n,function(e){log('window-'+n,e);},true);});"
            + "document.addEventListener('focusin',function(e){log('focusin',e);setTimeout(function(){log('focusin-stable',e);},250);},true);"
            + "['focusout','keydown','beforeinput','input','change','compositionstart','compositionend'].forEach(function(n){document.addEventListener(n,function(e){log(n,e);},true);});"
            + "console.info(p,'installed',{url:location.href,active:tag(document.activeElement)});"
            + "})();";
        webView.evaluateJavascript(script, value -> trace("webview.diagnosticScriptInjected", "result=" + value));
    }

    private void installKeyboardVisibilityLogger() {
        View content = findViewById(android.R.id.content);
        if (content == null) {
            traceWarn("ime.visibilityObserver", "content view is null");
            return;
        }
        content.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            @Override
            public void onGlobalLayout() {
                Rect visible = new Rect();
                content.getWindowVisibleDisplayFrame(visible);
                int rootHeight = content.getRootView() != null ? content.getRootView().getHeight() : content.getHeight();
                int visibleHeight = visible.height();
                int keyboardHeight = Math.max(0, rootHeight - visibleHeight);
                boolean keyboardVisible = rootHeight > 0 && keyboardHeight > Math.max(160, rootHeight * 0.15f);
                int visibleInt = keyboardVisible ? 1 : 0;
                if (visibleInt != lastKeyboardVisible || Math.abs(keyboardHeight - lastKeyboardHeight) > 24) {
                    lastKeyboardVisible = visibleInt;
                    lastKeyboardHeight = keyboardHeight;
                    trace("ime.visibility", "visible=" + keyboardVisible
                        + " keyboardHeight=" + keyboardHeight
                        + " rootHeight=" + rootHeight
                        + " visibleHeight=" + visibleHeight
                        + " frame=" + visible.left + "," + visible.top + "," + visible.right + "," + visible.bottom);
                }
            }
        });
        trace("ime.visibilityObserver", "installed");
    }

    private static String motionActionName(int action) {
        switch (action) {
            case MotionEvent.ACTION_DOWN: return "DOWN";
            case MotionEvent.ACTION_UP: return "UP";
            case MotionEvent.ACTION_CANCEL: return "CANCEL";
            case MotionEvent.ACTION_MOVE: return "MOVE";
            default: return String.valueOf(action);
        }
    }

    private static String sanitizeToken(String raw) {
        if (raw == null) return "unknown";
        return raw.replaceAll("[^A-Za-z0-9_.-]", "_");
    }

    private static String sanitizePayload(String raw) {
        if (raw == null) return "payload=null";
        String cleaned = raw.replace('\n', ' ').replace('\r', ' ');
        return cleaned.length() > 1200 ? cleaned.substring(0, 1200) + "…" : cleaned;
    }

    private static void trace(String event, String message) {
        Log.i(TAG, formatTrace(event, message));
    }

    private static void traceWarn(String event, String message) {
        Log.w(TAG, formatTrace(event, message));
    }

    private static void traceError(String event, String message) {
        Log.e(TAG, formatTrace(event, message));
    }

    private static String formatTrace(String event, String message) {
        return "IRTH_NATIVE_TRACE ts=" + System.currentTimeMillis()
            + " uptime=" + SystemClock.uptimeMillis()
            + " event=" + event
            + " " + message;
    }
}
