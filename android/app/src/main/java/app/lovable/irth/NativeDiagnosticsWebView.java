package app.lovable.irth;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.AttributeSet;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.inputmethod.CompletionInfo;
import android.view.inputmethod.CorrectionInfo;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.ExtractedText;
import android.view.inputmethod.ExtractedTextRequest;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputConnectionWrapper;
import android.view.inputmethod.InputContentInfo;
import com.getcapacitor.CapacitorWebView;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Diagnostic WebView subclass. Wraps the InputConnection to time every IME call
 * and emit IRTH_IME_STALL when any call takes >300ms. Behavior is unchanged
 * (all methods delegate to super).
 */
public class NativeDiagnosticsWebView extends CapacitorWebView {
    private static final String TAG = "IrthMainActivity";
    private static final long STALL_THRESHOLD_MS = 300L;
    private static final Handler WATCHDOG = new Handler(Looper.getMainLooper());
    private static final AtomicLong CALL_SEQ = new AtomicLong(0);

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

        String imeId = "unknown";
        try {
            imeId = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
        } catch (Throwable ignored) {}

        InputConnection base = super.onCreateInputConnection(outAttrs);
        trace("ime.onCreateInputConnection.result", "result=" + (base == null ? "null" : base.getClass().getName())
            + " inputType=" + outAttrs.inputType
            + " imeOptions=" + outAttrs.imeOptions
            + " fieldId=" + outAttrs.fieldId
            + " defaultIme=" + imeId);

        if (base == null) {
            trace("ime.wrapper.returning", "wrapped=false baseClass=null reason=base-null");
            return null;
        }
        TracingInputConnection wrapped = new TracingInputConnection(base);
        trace("ime.wrapper.returning", "wrapped=true baseClass=" + base.getClass().getName()
            + " wrapperClass=" + wrapped.getClass().getName());
        Log.i("IRTH_NATIVE_TRACE", "ime.wrapper.returning wrapped=true baseClass=" + base.getClass().getName());
        return wrapped;
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

    /** Wraps InputConnection to log every IME call with pre/post timestamps and watchdog. */
    private static final class TracingInputConnection extends InputConnectionWrapper {
        TracingInputConnection(InputConnection target) {
            super(target, true);
            trace("ime.wrapper.constructed", "baseClass=" + (target == null ? "null" : target.getClass().getName()));
            Log.i("IRTH_NATIVE_TRACE", "ime.wrapper.constructed baseClass="
                + (target == null ? "null" : target.getClass().getName()));
        }

        private long pre(String method, String args) {
            long seq = CALL_SEQ.incrementAndGet();
            final long start = SystemClock.uptimeMillis();
            trace("ime.call.start", "seq=" + seq + " method=" + method + " args=" + args);
            final boolean[] done = {false};
            WATCHDOG.postDelayed(() -> {
                if (!done[0]) {
                    Log.w(TAG, "IRTH_IME_STALL ts=" + System.currentTimeMillis()
                        + " uptime=" + SystemClock.uptimeMillis()
                        + " seq=" + seq + " method=" + method
                        + " elapsedMs=" + (SystemClock.uptimeMillis() - start)
                        + " args=" + args);
                }
            }, STALL_THRESHOLD_MS);
            // Stash done flag via thread-local-ish trick: return packed long, store flag in map.
            PENDING.put(seq, done);
            return (seq << 32) | (start & 0xFFFFFFFFL);
        }

        private void post(String method, long token, Object result) {
            long seq = token >>> 32;
            long start = token & 0xFFFFFFFFL;
            long elapsed = SystemClock.uptimeMillis() - start;
            boolean[] done = PENDING.remove(seq);
            if (done != null) done[0] = true;
            trace("ime.call.end", "seq=" + seq + " method=" + method + " elapsedMs=" + elapsed
                + " result=" + (result == null ? "null" : String.valueOf(result)));
        }

        private static final java.util.concurrent.ConcurrentHashMap<Long, boolean[]> PENDING = new java.util.concurrent.ConcurrentHashMap<>();

        @Override public boolean beginBatchEdit() {
            long t = pre("beginBatchEdit", "");
            try { boolean r = super.beginBatchEdit(); post("beginBatchEdit", t, r); return r; }
            catch (Throwable e) { post("beginBatchEdit", t, "THROW:" + e); throw e; }
        }
        @Override public boolean endBatchEdit() {
            long t = pre("endBatchEdit", "");
            try { boolean r = super.endBatchEdit(); post("endBatchEdit", t, r); return r; }
            catch (Throwable e) { post("endBatchEdit", t, "THROW:" + e); throw e; }
        }
        @Override public boolean commitText(CharSequence text, int newCursorPosition) {
            long t = pre("commitText", "len=" + (text == null ? 0 : text.length()) + " pos=" + newCursorPosition);
            try { boolean r = super.commitText(text, newCursorPosition); post("commitText", t, r); return r; }
            catch (Throwable e) { post("commitText", t, "THROW:" + e); throw e; }
        }
        @Override public boolean setComposingText(CharSequence text, int newCursorPosition) {
            long t = pre("setComposingText", "len=" + (text == null ? 0 : text.length()) + " pos=" + newCursorPosition);
            try { boolean r = super.setComposingText(text, newCursorPosition); post("setComposingText", t, r); return r; }
            catch (Throwable e) { post("setComposingText", t, "THROW:" + e); throw e; }
        }
        @Override public boolean setComposingRegion(int start, int end) {
            long t = pre("setComposingRegion", "start=" + start + " end=" + end);
            try { boolean r = super.setComposingRegion(start, end); post("setComposingRegion", t, r); return r; }
            catch (Throwable e) { post("setComposingRegion", t, "THROW:" + e); throw e; }
        }
        @Override public boolean finishComposingText() {
            long t = pre("finishComposingText", "");
            try { boolean r = super.finishComposingText(); post("finishComposingText", t, r); return r; }
            catch (Throwable e) { post("finishComposingText", t, "THROW:" + e); throw e; }
        }
        @Override public boolean deleteSurroundingText(int beforeLength, int afterLength) {
            long t = pre("deleteSurroundingText", "before=" + beforeLength + " after=" + afterLength);
            try { boolean r = super.deleteSurroundingText(beforeLength, afterLength); post("deleteSurroundingText", t, r); return r; }
            catch (Throwable e) { post("deleteSurroundingText", t, "THROW:" + e); throw e; }
        }
        @Override public boolean deleteSurroundingTextInCodePoints(int beforeLength, int afterLength) {
            long t = pre("deleteSurroundingTextInCodePoints", "before=" + beforeLength + " after=" + afterLength);
            try { boolean r = super.deleteSurroundingTextInCodePoints(beforeLength, afterLength); post("deleteSurroundingTextInCodePoints", t, r); return r; }
            catch (Throwable e) { post("deleteSurroundingTextInCodePoints", t, "THROW:" + e); throw e; }
        }
        @Override public boolean sendKeyEvent(KeyEvent event) {
            long t = pre("sendKeyEvent", "code=" + (event == null ? -1 : event.getKeyCode()) + " action=" + (event == null ? -1 : event.getAction()));
            try { boolean r = super.sendKeyEvent(event); post("sendKeyEvent", t, r); return r; }
            catch (Throwable e) { post("sendKeyEvent", t, "THROW:" + e); throw e; }
        }
        @Override public boolean performEditorAction(int actionCode) {
            long t = pre("performEditorAction", "action=" + actionCode);
            try { boolean r = super.performEditorAction(actionCode); post("performEditorAction", t, r); return r; }
            catch (Throwable e) { post("performEditorAction", t, "THROW:" + e); throw e; }
        }
        @Override public boolean performContextMenuAction(int id) {
            long t = pre("performContextMenuAction", "id=" + id);
            try { boolean r = super.performContextMenuAction(id); post("performContextMenuAction", t, r); return r; }
            catch (Throwable e) { post("performContextMenuAction", t, "THROW:" + e); throw e; }
        }
        @Override public ExtractedText getExtractedText(ExtractedTextRequest request, int flags) {
            long t = pre("getExtractedText", "flags=" + flags);
            try { ExtractedText r = super.getExtractedText(request, flags); post("getExtractedText", t, r == null ? "null" : "len=" + (r.text == null ? 0 : r.text.length())); return r; }
            catch (Throwable e) { post("getExtractedText", t, "THROW:" + e); throw e; }
        }
        @Override public CharSequence getTextBeforeCursor(int n, int flags) {
            long t = pre("getTextBeforeCursor", "n=" + n + " flags=" + flags);
            try { CharSequence r = super.getTextBeforeCursor(n, flags); post("getTextBeforeCursor", t, r == null ? "null" : "len=" + r.length()); return r; }
            catch (Throwable e) { post("getTextBeforeCursor", t, "THROW:" + e); throw e; }
        }
        @Override public CharSequence getTextAfterCursor(int n, int flags) {
            long t = pre("getTextAfterCursor", "n=" + n + " flags=" + flags);
            try { CharSequence r = super.getTextAfterCursor(n, flags); post("getTextAfterCursor", t, r == null ? "null" : "len=" + r.length()); return r; }
            catch (Throwable e) { post("getTextAfterCursor", t, "THROW:" + e); throw e; }
        }
        @Override public CharSequence getSelectedText(int flags) {
            long t = pre("getSelectedText", "flags=" + flags);
            try { CharSequence r = super.getSelectedText(flags); post("getSelectedText", t, r == null ? "null" : "len=" + r.length()); return r; }
            catch (Throwable e) { post("getSelectedText", t, "THROW:" + e); throw e; }
        }
        @Override public int getCursorCapsMode(int reqModes) {
            long t = pre("getCursorCapsMode", "req=" + reqModes);
            try { int r = super.getCursorCapsMode(reqModes); post("getCursorCapsMode", t, r); return r; }
            catch (Throwable e) { post("getCursorCapsMode", t, "THROW:" + e); throw e; }
        }
        @Override public boolean setSelection(int start, int end) {
            long t = pre("setSelection", "start=" + start + " end=" + end);
            try { boolean r = super.setSelection(start, end); post("setSelection", t, r); return r; }
            catch (Throwable e) { post("setSelection", t, "THROW:" + e); throw e; }
        }
        @Override public boolean commitCompletion(CompletionInfo text) {
            long t = pre("commitCompletion", "");
            try { boolean r = super.commitCompletion(text); post("commitCompletion", t, r); return r; }
            catch (Throwable e) { post("commitCompletion", t, "THROW:" + e); throw e; }
        }
        @Override public boolean commitCorrection(CorrectionInfo correctionInfo) {
            long t = pre("commitCorrection", "");
            try { boolean r = super.commitCorrection(correctionInfo); post("commitCorrection", t, r); return r; }
            catch (Throwable e) { post("commitCorrection", t, "THROW:" + e); throw e; }
        }
        @Override public boolean commitContent(InputContentInfo inputContentInfo, int flags, android.os.Bundle opts) {
            long t = pre("commitContent", "flags=" + flags);
            try { boolean r = super.commitContent(inputContentInfo, flags, opts); post("commitContent", t, r); return r; }
            catch (Throwable e) { post("commitContent", t, "THROW:" + e); throw e; }
        }
        @Override public boolean requestCursorUpdates(int cursorUpdateMode) {
            long t = pre("requestCursorUpdates", "mode=" + cursorUpdateMode);
            try { boolean r = super.requestCursorUpdates(cursorUpdateMode); post("requestCursorUpdates", t, r); return r; }
            catch (Throwable e) { post("requestCursorUpdates", t, "THROW:" + e); throw e; }
        }
        @Override public boolean reportFullscreenMode(boolean enabled) {
            long t = pre("reportFullscreenMode", "enabled=" + enabled);
            try { boolean r = super.reportFullscreenMode(enabled); post("reportFullscreenMode", t, r); return r; }
            catch (Throwable e) { post("reportFullscreenMode", t, "THROW:" + e); throw e; }
        }
        @Override public boolean performPrivateCommand(String action, android.os.Bundle data) {
            long t = pre("performPrivateCommand", "action=" + action);
            try { boolean r = super.performPrivateCommand(action, data); post("performPrivateCommand", t, r); return r; }
            catch (Throwable e) { post("performPrivateCommand", t, "THROW:" + e); throw e; }
        }
        @Override public boolean clearMetaKeyStates(int states) {
            long t = pre("clearMetaKeyStates", "states=" + states);
            try { boolean r = super.clearMetaKeyStates(states); post("clearMetaKeyStates", t, r); return r; }
            catch (Throwable e) { post("clearMetaKeyStates", t, "THROW:" + e); throw e; }
        }
        @Override public void closeConnection() {
            long t = pre("closeConnection", "");
            try { super.closeConnection(); post("closeConnection", t, "ok"); }
            catch (Throwable e) { post("closeConnection", t, "THROW:" + e); throw e; }
        }
    }
}
