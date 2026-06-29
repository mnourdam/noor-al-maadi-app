package app.lovable.irth;

import android.content.Context;
import android.media.AudioManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Exposes the device ringer mode to the WebView so audioManager can
 * respect Silent / Vibrate modes. HTML5 Audio in a WebView plays via
 * STREAM_MUSIC which is NOT silenced by the ringer; we gate it manually.
 */
@CapacitorPlugin(name = "RingerMode")
public class RingerModePlugin extends Plugin {

  @PluginMethod
  public void getMode(PluginCall call) {
    JSObject ret = new JSObject();
    try {
      Context ctx = getContext();
      AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
      int mode = am != null ? am.getRingerMode() : AudioManager.RINGER_MODE_NORMAL;
      String label;
      switch (mode) {
        case AudioManager.RINGER_MODE_SILENT:
          label = "silent";
          break;
        case AudioManager.RINGER_MODE_VIBRATE:
          label = "vibrate";
          break;
        default:
          label = "normal";
      }
      ret.put("mode", label);
    } catch (Throwable t) {
      ret.put("mode", "normal");
      ret.put("error", t.getMessage());
    }
    call.resolve(ret);
  }
}
