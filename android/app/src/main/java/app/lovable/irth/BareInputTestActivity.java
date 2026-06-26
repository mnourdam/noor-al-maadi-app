package app.lovable.irth;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.webkit.ConsoleMessage;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.appcompat.app.AppCompatActivity;

/**
 * Diagnostic-only native WebView screen.
 *
 * This intentionally avoids BridgeActivity, Capacitor plugins, React, bundled
 * CSS, fullscreen, edge-to-edge, and all app providers. It tells us whether a
 * plain Android WebView can render IME text on the affected device.
 */
public class BareInputTestActivity extends AppCompatActivity {
    private static final String TAG = "IrthMainActivity";
    private BareDiagnosticWebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.i(TAG, "[android:bare-input] onCreate raw WebView activity softInputMode=adjustResize|stateHidden hardwareAccelerated=true");

        webView = new BareDiagnosticWebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        webView.setBackgroundColor(Color.WHITE);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setClickable(true);
        webView.setLongClickable(true);
        configureWebView(webView);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        root.addView(webView);
        setContentView(root);

        webView.loadDataWithBaseURL(
            "https://localhost/bare-native-input-test.html",
            html(),
            "text/html",
            "UTF-8",
            null
        );
    }

    @Override
    protected void onResume() {
        super.onResume();
        Log.i(TAG, "[android:bare-input] onResume webViewId=" + (webView == null ? "null" : System.identityHashCode(webView)));
    }

    @Override
    protected void onPause() {
        Log.i(TAG, "[android:bare-input] onPause webViewId=" + (webView == null ? "null" : System.identityHashCode(webView)));
        super.onPause();
    }

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    private void configureWebView(BareDiagnosticWebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.i(TAG, "[android:bare-console] " + consoleMessage.messageLevel().name() + " " + consoleMessage.message());
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                Log.i(TAG, "[android:bare-input] pageFinished url=" + url + " id=" + System.identityHashCode(view));
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                Log.e(TAG, "[android:bare-input] renderProcessGone didCrash=" + detail.didCrash() + " priority=" + detail.rendererPriorityAtExit());
                return false;
            }
        });
        webView.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                Log.i(TAG, "[android:bare-input] touchDown hasFocus=" + view.hasFocus() + " x=" + Math.round(event.getX()) + " y=" + Math.round(event.getY()));
            }
            return false;
        });
    }

    private String html() {
        return """
            <!doctype html>
            <html>
              <head>
                <meta charset='utf-8'>
                <meta name='viewport' content='width=device-width,initial-scale=1'>
                <title>Bare Native WebView Input Test</title>
                <style>
                  html,body{margin:0;background:#fff;color:#111;font:16px system-ui,sans-serif;}
                  main{box-sizing:border-box;min-height:100vh;padding:24px 18px 48px;}
                  label{display:block;font-weight:700;font-size:13px;margin:18px 0 8px;}
                  input,textarea,button{box-sizing:border-box;width:100%;font:16px system-ui,sans-serif;padding:12px;border:1px solid #999;border-radius:6px;background:#fff;color:#111;}
                  button{margin-top:20px;background:#eee;font-weight:700;}
                </style>
              </head>
              <body>
                <main>
                  <h1>Bare Native WebView Input Test</h1>
                  <p>No Capacitor bridge, no React, no app CSS, no plugins.</p>
                  <label for='bare-input'>Plain input</label>
                  <input id='bare-input' type='text' autocomplete='off' autocapitalize='none' spellcheck='false'>
                  <label for='bare-textarea'>Plain textarea</label>
                  <textarea id='bare-textarea' rows='4' autocomplete='off' autocapitalize='none' spellcheck='false'></textarea>
                  <button type='button' onclick='history.back()'>Back</button>
                </main>
                <script>
                  (function(){
                    var p='[android:bare-web-input]';
                    function tag(el){return el?((el.tagName||'node').toLowerCase()+(el.id?'#'+el.id:'')):'none';}
                    function len(el){return el&&typeof el.value==='string'?el.value.length:null;}
                    function log(name,e){try{console.info(p+' '+name+' '+JSON.stringify({target:tag(e&&e.target),active:tag(document.activeElement),length:len(e&&e.target),inputType:e&&e.inputType||undefined,hidden:document.hidden,hasFocus:document.hasFocus&&document.hasFocus()}));}catch(_){}}
                    console.info(p+' mounted '+JSON.stringify({url:location.href,userAgent:/Android/i.test(navigator.userAgent)?'Android':'non-Android'}));
                    ['focusin','focusout','keydown','beforeinput','input','change','compositionstart','compositionend'].forEach(function(n){document.addEventListener(n,function(e){log(n,e);},true);});
                    ['focus','blur','visibilitychange'].forEach(function(n){window.addEventListener(n,function(e){log('window-'+n,e);},true);});
                  })();
                </script>
              </body>
            </html>
            """;
    }

    public static class BareDiagnosticWebView extends WebView {
        public BareDiagnosticWebView(android.content.Context context) {
            super(context);
            setFocusable(true);
            setFocusableInTouchMode(true);
        }

        @Override
        public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
            Log.i(TAG, "[android:bare-ime] onCreateInputConnection start hasFocus=" + hasFocus()
                + " focusable=" + isFocusable()
                + " focusableInTouch=" + isFocusableInTouchMode()
                + " shown=" + isShown()
                + " attached=" + isAttachedToWindow());
            InputConnection base = super.onCreateInputConnection(outAttrs);
            Log.i(TAG, "[android:bare-ime] onCreateInputConnection result=" + (base == null ? "null" : base.getClass().getName())
                + " inputType=" + outAttrs.inputType
                + " imeOptions=" + outAttrs.imeOptions
                + " fieldId=" + outAttrs.fieldId);
            return base;
        }

        @Override
        public boolean onCheckIsTextEditor() {
            boolean result = super.onCheckIsTextEditor();
            Log.i(TAG, "[android:bare-ime] onCheckIsTextEditor result=" + result + " hasFocus=" + hasFocus());
            return result;
        }
    }
}