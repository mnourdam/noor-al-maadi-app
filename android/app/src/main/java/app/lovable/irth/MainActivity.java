package app.lovable.irth;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

/**
 * Immersive sticky fullscreen — hides system bars but lets the user swipe
 * them back temporarily. Re-applies after the soft keyboard closes so the
 * keyboard input fix is preserved.
 */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    SplashScreen.installSplashScreen(this);
    registerPlugin(RingerModePlugin.class);
    super.onCreate(savedInstanceState);
    // WebView remote debugging: enabled for debug builds only. Capacitor's
    // `webContentsDebuggingEnabled` config cannot see the Gradle build type,
    // so we authoritatively re-apply it here from BuildConfig.DEBUG.
    try {
      WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    } catch (Throwable ignored) { }
    applyImmersive();

    final View decor = getWindow().getDecorView();
    decor.setOnApplyWindowInsetsListener((v, insets) -> {
      // Re-hide bars after keyboard dismissal.
      WindowInsetsCompat wic = WindowInsetsCompat.toWindowInsetsCompat(insets, v);
      boolean imeVisible = wic.isVisible(WindowInsetsCompat.Type.ime());
      if (!imeVisible) applyImmersive();
      return v.onApplyWindowInsets(insets);
    });
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) applyImmersive();
  }

  private void applyImmersive() {
    try {
      WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
      WindowInsetsControllerCompat controller =
          new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
      controller.hide(WindowInsetsCompat.Type.systemBars());
      controller.setSystemBarsBehavior(
          WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.layoutInDisplayCutoutMode =
            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        getWindow().setAttributes(lp);
      }
    } catch (Throwable ignored) { }
  }
}
