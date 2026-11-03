package il.co.shomerapp;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Receives SHOMER's FCM pushes. sosFanout sends DATA-ONLY high-priority messages, so Android
 * calls onMessageReceived even when the app is closed - that is where the alarm starts.
 * Inert until the build includes google-services.json (no Firebase app = no token, no messages).
 */
public class ShomerMessagingService extends FirebaseMessagingService {
  @Override
  public void onMessageReceived(RemoteMessage m) {
    try { if (m.getData() != null && !m.getData().isEmpty()) SosPush.handle(getApplicationContext(), m.getData()); } catch (Throwable e) {}
  }

  /** Token rotated: store it, and hand it to the web app if it is running (it writes tokens/<uid>). */
  @Override
  public void onNewToken(String token) {
    SosPush.saveToken(getApplicationContext(), token);
    try { MainActivity a = MainActivity.sActive; if (a != null) a.pushTokenToWeb(token); } catch (Throwable e) {}
  }
}
