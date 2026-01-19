package com.ixora.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class IxoraFirebaseMessagingService extends FirebaseMessagingService {
  public static final String CHANNEL_ID = "ixora_default";
  public static final String KEY_TEXT_REPLY = "ixora_reply_text";

  @Override
  public void onMessageReceived(RemoteMessage remoteMessage) {
    try {
      // Verificar que remoteMessage no sea null
      if (remoteMessage == null) {
        return;
      }
      
      Map<String, String> data = remoteMessage.getData();
      if (data == null || data.isEmpty()) {
        return;
      }

    String title = data.get("title");
    String body = data.get("body");
    String notificationId = data.get("notificationId");
    String replyToken = data.get("replyToken");
    String serverUrl = data.get("serverUrl");
    String chatType = data.get("chatType");

    if (title == null || title.trim().isEmpty()) {
      title = "IXORA";
    }
    if (body == null) {
      body = "";
    }

    int id;
    try {
      id = notificationId != null ? Integer.parseInt(notificationId) : (int) System.currentTimeMillis();
    } catch (Exception e) {
      id = (int) System.currentTimeMillis();
    }

      showNotification(this, id, title, body, replyToken, serverUrl, notificationId, chatType);
    } catch (Exception e) {
      // Silenciar errores para evitar crashes
      e.printStackTrace();
    }
  }

  private void showNotification(Context context, int id, String title, String body, String replyToken, String serverUrl, String notificationId, String chatType) {
    createChannelIfNeeded(context);

    Intent openIntent = new Intent(context, MainActivity.class);
    openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent contentIntent = PendingIntent.getActivity(
      context,
      id,
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      .setContentIntent(contentIntent)
      .setPriority(NotificationCompat.PRIORITY_HIGH);

    if (replyToken != null && !replyToken.trim().isEmpty() &&
        serverUrl != null && !serverUrl.trim().isEmpty() &&
        chatType != null && !chatType.trim().isEmpty()) {
      Intent replyIntent = new Intent(context, IxoraReplyReceiver.class);
      replyIntent.setAction("com.ixora.app.NOTIF_REPLY");
      replyIntent.putExtra("replyToken", replyToken);
      replyIntent.putExtra("serverUrl", serverUrl);
      replyIntent.putExtra("notificationId", notificationId);
      PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
        context,
        id,
        replyIntent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );

      RemoteInput remoteInput = new RemoteInput.Builder(KEY_TEXT_REPLY)
        .setLabel("Escribe tu respuesta")
        .build();

      NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
        android.R.drawable.ic_menu_send,
        "Responder",
        replyPendingIntent
      ).addRemoteInput(remoteInput).build();

      builder.addAction(replyAction);
    }

    NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (notificationManager != null) {
      notificationManager.notify(id, builder.build());
    }
  }

  private void createChannelIfNeeded(Context context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      if (notificationManager == null) return;
      NotificationChannel channel = new NotificationChannel(
        CHANNEL_ID,
        "IXORA",
        NotificationManager.IMPORTANCE_HIGH
      );
      channel.setDescription("Notificaciones de IXORA");
      notificationManager.createNotificationChannel(channel);
    }
  }
}
