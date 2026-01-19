package com.ixora.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class IxoraReplyReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    CharSequence replyText = getReplyMessage(intent);
    if (replyText == null) {
      return;
    }

    String replyToken = intent.getStringExtra("replyToken");
    String serverUrl = intent.getStringExtra("serverUrl");
    String notificationId = intent.getStringExtra("notificationId");

    if (replyToken == null || replyToken.trim().isEmpty() || serverUrl == null || serverUrl.trim().isEmpty()) {
      return;
    }

    int notifId;
    try {
      notifId = notificationId != null ? Integer.parseInt(notificationId) : 0;
    } catch (Exception e) {
      notifId = 0;
    }

    final int finalNotifId = notifId;
    final String reply = replyText.toString();

    new Thread(() -> {
      sendReply(serverUrl, replyToken, reply, notificationId);
      showReplySent(context, finalNotifId, reply);
    }).start();
  }

  private CharSequence getReplyMessage(Intent intent) {
    return RemoteInput.getResultsFromIntent(intent) != null
      ? RemoteInput.getResultsFromIntent(intent).getCharSequence(IxoraFirebaseMessagingService.KEY_TEXT_REPLY)
      : null;
  }

  private void sendReply(String serverUrl, String replyToken, String reply, String notificationId) {
    HttpURLConnection connection = null;
    try {
      URL url = new URL(serverUrl + "/notificaciones/responder-push");
      connection = (HttpURLConnection) url.openConnection();
      connection.setRequestMethod("POST");
      connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
      connection.setDoOutput(true);
      connection.setConnectTimeout(5000);
      connection.setReadTimeout(5000);

      JSONObject body = new JSONObject();
      body.put("reply_token", replyToken);
      body.put("respuesta", reply);
      if (notificationId != null) {
        body.put("notification_id", notificationId);
      }

      byte[] payload = body.toString().getBytes("UTF-8");
      OutputStream os = connection.getOutputStream();
      os.write(payload);
      os.flush();
      os.close();

      connection.getResponseCode();
    } catch (Exception e) {
      // Silenciar errores para no bloquear UI
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
  }

  private void showReplySent(Context context, int notificationId, String replyText) {
    if (notificationId == 0) {
      return;
    }
    NotificationCompat.Builder builder = new NotificationCompat.Builder(context, IxoraFirebaseMessagingService.CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Respuesta enviada")
      .setContentText(replyText)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setAutoCancel(true);

    NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (notificationManager != null) {
      notificationManager.notify(notificationId, builder.build());
    }
  }
}
