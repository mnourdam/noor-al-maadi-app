package app.lovable.irth;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean imeVisible = false;
    private long lastImmersiveAt = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Edge-to-edge: draw under the system bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            if (!imeVisible) scheduleImmersive(180);
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
        if (!imeVisible) {
            scheduleImmersive(160);
        }
    }

    private void scheduleImmersive(long delayMs) {
        handler.postDelayed(() -> {
            if (!imeVisible) applyImmersive();
        }, delayMs);
    }

    private void applyImmersive() {
        if (imeVisible) return;
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
}
