package app.lovable.irth;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * Application entry — ensures the versioned Irth notification channel
 * (with the custom `irth_notification` sound) is registered before any
 * FCM message is delivered, including when the app is fully terminated
 * and Android launches the FCM service to display a system notification.
 *
 * Channel ID is versioned so we never mutate a pre-existing channel that
 * Android has locked to the default system sound on older installs.
 */
public class IrthApp extends Application {
  public static final String CHANNEL_ID = "irth_notifications_v2";
  public static final String CHANNEL_NAME = "إشعارات إرث";

  @Override
  public void onCreate() {
    super.onCreate();
    createNotificationChannel();
  }

  private void createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm =
        (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    if (nm == null) return;
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return;

    NotificationChannel channel = new NotificationChannel(
        CHANNEL_ID,
        CHANNEL_NAME,
        NotificationManager.IMPORTANCE_HIGH);

    Uri soundUri = Uri.parse(
        ContentResolver.SCHEME_ANDROID_RESOURCE + "://"
            + getPackageName() + "/raw/irth_notification");
    AudioAttributes audioAttrs = new AudioAttributes.Builder()
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .build();
    channel.setSound(soundUri, audioAttrs);
    channel.setShowBadge(true);
    nm.createNotificationChannel(channel);
  }
}
