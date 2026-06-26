package app.lovable.irth;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

/**
 * DIAGNOSTIC BUILD:
 * Immersive sticky mode and manual system-bar hiding are fully disabled to
 * isolate the Android WebView text-input freeze. The window is still drawn
 * edge-to-edge (handled by CSS env(safe-area-inset-*) in the web layer),
 * but the status/navigation bars stay visible and we never re-apply
 * fullscreen on focus changes.
 *
 * Logs are tagged [android:ime] for grep in Logcat.
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "IrthMainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.i(TAG, "[android:ime] onCreate softInputMode=adjustResize|stateHidden immersive=DISABLED");
        // Edge-to-edge draw, but DO NOT hide status/nav bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            int imeHeight = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            Log.i(TAG, "[android:ime] insets keyboardVisible=" + imeVisible + " imeHeight=" + imeHeight);
            return insets;
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        Log.i(TAG, "[android:ime] onWindowFocusChanged hasFocus=" + hasFocus + " fullscreen=SKIPPED");
        // Intentionally do nothing: no immersive re-apply, no bar hiding.
    }
}
