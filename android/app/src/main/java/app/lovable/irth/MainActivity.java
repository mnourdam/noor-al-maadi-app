package app.lovable.irth;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "IrthMainActivity";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean imeVisible = false;
    private long lastImmersiveAt = 0L;
    private boolean inputTestSkipLogged = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Edge-to-edge: draw under the system bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            if (!imeVisible && !isAndroidInputTestRoute()) scheduleImmersive(180);
            return insets;
        });
        decor.post(() -> scheduleImmersive(120));
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Re-apply ONLY when window regains focus AND IME is not visible.
        // Re-applying while the soft keyboard is up causes a relayout/focus
        // loop that freezes the WebView.
        if (!hasFocus) return;
        if (isAndroidInputTestRoute()) {
            logInputTestSkipOnce("window focus immersive skipped");
            return;
        }
        if (!imeVisible) {
            scheduleImmersive(160);
        }
    }

    private void scheduleImmersive(long delayMs) {
        if (isAndroidInputTestRoute()) {
            logInputTestSkipOnce("schedule immersive skipped");
            return;
        }
        handler.postDelayed(() -> {
            if (!imeVisible && !isAndroidInputTestRoute()) applyImmersive();
        }, delayMs);
    }

    private void applyImmersive() {
        if (imeVisible) return;
        if (isAndroidInputTestRoute()) {
            logInputTestSkipOnce("apply immersive skipped");
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastImmersiveAt < 250L) return;
        lastImmersiveAt = now;
        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        // Hide status + nav bars only; never touch the IME insets.
        controller.hide(WindowInsetsCompat.Type.statusBars());
        controller.hide(WindowInsetsCompat.Type.navigationBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    private boolean isAndroidInputTestRoute() {
        try {
            if (bridge == null || bridge.getWebView() == null) return false;
            String url = bridge.getWebView().getUrl();
            return url != null && url.contains("/android-input-test");
        } catch (Exception ignored) {
            return false;
        }
    }

    private void logInputTestSkipOnce(String reason) {
        if (inputTestSkipLogged) return;
        inputTestSkipLogged = true;
        Log.i(TAG, "[android-input-test] " + reason);
    }
}
