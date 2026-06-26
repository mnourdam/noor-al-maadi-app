package app.lovable.irth;

import android.content.Context;
import android.util.AttributeSet;
import android.util.Log;
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
}