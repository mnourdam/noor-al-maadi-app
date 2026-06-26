package app.lovable.irth;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AndroidABFlagsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        AndroidABFlags.applyIntentToPrefs(context, intent);
        AndroidABFlags.Config config = AndroidABFlags.read(context, null);
        AndroidABFlags.logStartup("broadcast", config);
    }
}