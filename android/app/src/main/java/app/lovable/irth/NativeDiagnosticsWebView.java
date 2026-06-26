package app.lovable.irth;

import android.content.Context;
import android.util.AttributeSet;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import com.getcapacitor.CapacitorWebView;

/**
 * Diagnostic-only WebView subclass for the Android IME freeze investigation.
 * It logs native input-connection creation without wrapping or mutating the
 * connection. The previous wrapper logged every composing event, but for this
 * investigation the WebView must remain as close as possible to stock behavior.
 */
public class NativeDiagnosticsWebView extends CapacitorWebView {
    private static final String TAG = "IrthMainActivity";

    public NativeDiagnosticsWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
        setFocusable(true);
        setFocusableInTouchMode(true);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        Log.i(TAG, "[android:ime] onCreateInputConnection start hasFocus=" + hasFocus()
            + " focusable=" + isFocusable()
            + " focusableInTouch=" + isFocusableInTouchMode()
            + " shown=" + isShown()
            + " attached=" + isAttachedToWindow());

        InputConnection base = super.onCreateInputConnection(outAttrs);
        Log.i(TAG, "[android:ime] onCreateInputConnection result=" + (base == null ? "null" : base.getClass().getName())
            + " inputType=" + outAttrs.inputType
            + " imeOptions=" + outAttrs.imeOptions
            + " fieldId=" + outAttrs.fieldId);

        return base;
    }

    @Override
    public boolean onCheckIsTextEditor() {
        boolean result = super.onCheckIsTextEditor();
        Log.i(TAG, "[android:ime] onCheckIsTextEditor result=" + result + " hasFocus=" + hasFocus());
        return result;
    }

    @Override
    protected void onFocusChanged(boolean focused, int direction, android.graphics.Rect previouslyFocusedRect) {
        super.onFocusChanged(focused, direction, previouslyFocusedRect);
        Log.i(TAG, "[android:webview] onFocusChanged focused=" + focused + " direction=" + direction);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            Log.i(TAG, "[android:webview] dispatchTouchEvent ACTION_DOWN hasFocus=" + hasFocus() + " x=" + Math.round(event.getX()) + " y=" + Math.round(event.getY()));
        }
        return super.dispatchTouchEvent(event);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            Log.i(TAG, "[android:ime] dispatchKeyEvent keyCode=" + event.getKeyCode() + " unicode=" + (event.getUnicodeChar() > 0 ? "printable" : "none"));
        }
        return super.dispatchKeyEvent(event);
    }
}