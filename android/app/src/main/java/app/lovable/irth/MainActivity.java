package app.lovable.irth;

import android.os.Bundle;
import android.view.View;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Edge-to-edge: draw under the system bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        applyImmersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Re-apply ONLY when window regains focus AND IME is not visible.
        // Re-applying while the soft keyboard is up causes a relayout/focus
        // loop that freezes the WebView.
        if (!hasFocus) return;
        View decor = getWindow().getDecorView();
        WindowInsetsCompat insets = WindowCompat.getRootWindowInsets(decor);
        boolean imeVisible = insets != null && insets.isVisible(WindowInsetsCompat.Type.ime());
        if (!imeVisible) {
            applyImmersive();
        }
    }

    private void applyImmersive() {
        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        // Hide status + nav bars only; never touch the IME insets.
        controller.hide(WindowInsetsCompat.Type.statusBars());
        controller.hide(WindowInsetsCompat.Type.navigationBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
