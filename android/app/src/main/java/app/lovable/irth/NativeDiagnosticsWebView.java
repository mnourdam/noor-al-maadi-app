package app.lovable.irth;

import android.content.Context;
import android.os.SystemClock;
import android.util.AttributeSet;
import android.util.Log;
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
        trace("ime.onCreateInputConnection.start", "hasFocus=" + hasFocus()
            + " focusable=" + isFocusable()
            + " focusableInTouch=" + isFocusableInTouchMode()
            + " shown=" + isShown()
            + " attached=" + isAttachedToWindow());

        InputConnection base = super.onCreateInputConnection(outAttrs);
        trace("ime.onCreateInputConnection.result", "result=" + (base == null ? "null" : base.getClass().getName())
            + " inputType=" + outAttrs.inputType
            + " imeOptions=" + outAttrs.imeOptions
            + " fieldId=" + outAttrs.fieldId);

        return base;
    }

    @Override
    public boolean onCheckIsTextEditor() {
        boolean result = super.onCheckIsTextEditor();
        trace("ime.onCheckIsTextEditor", "result=" + result + " hasFocus=" + hasFocus());
        return result;
    }

    @Override
    protected void onFocusChanged(boolean focused, int direction, android.graphics.Rect previouslyFocusedRect) {
        trace("webview.onFocusChanged", "focused=" + focused + " direction=" + direction + " hasFocus=" + hasFocus());
        super.onFocusChanged(focused, direction, previouslyFocusedRect);
    }

    @Override
    public void onWindowFocusChanged(boolean hasWindowFocus) {
        trace("webview.onWindowFocusChanged", "hasWindowFocus=" + hasWindowFocus + " hasFocus=" + hasFocus());
        super.onWindowFocusChanged(hasWindowFocus);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        if (event != null) {
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                trace("webview.dispatchTouchEvent", "action=" + motionActionName(action)
                    + " x=" + Math.round(event.getX())
                    + " y=" + Math.round(event.getY())
                    + " pointers=" + event.getPointerCount()
                    + " eventTime=" + event.getEventTime());
            }
        }
        return super.dispatchTouchEvent(event);
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

    private static void trace(String event, String message) {
        Log.i(TAG, "IRTH_NATIVE_TRACE ts=" + System.currentTimeMillis()
            + " uptime=" + SystemClock.uptimeMillis()
            + " event=" + event
            + " " + message);
    }
}