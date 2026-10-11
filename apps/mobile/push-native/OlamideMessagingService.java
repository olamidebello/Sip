package com.dobhrap.olamide;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
public class OlamideMessagingService extends FirebaseMessagingService {
 @Override public void onMessageReceived(RemoteMessage message){
  if(!getSharedPreferences("native_push",0).getBoolean("enabled",false))return;
  if(!"incoming_call".equals(message.getData().get("kind")))return;
  long expiry;try{expiry=Long.parseLong(message.getData().get("expiresAt"));}catch(Exception e){return;}
  if(expiry<=System.currentTimeMillis())return;
  String callId=message.getData().get("callId");if(callId==null)return;
  NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
  if(Build.VERSION.SDK_INT>=26){
   NotificationChannel channel=new NotificationChannel("incoming_calls","Incoming calls",NotificationManager.IMPORTANCE_HIGH);
   channel.setSound(Settings.System.DEFAULT_RINGTONE_URI,new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build());manager.createNotificationChannel(channel);
  }
  Intent intent=new Intent(this,MainActivity.class).setAction("olamide.call."+callId).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
  PendingIntent open=PendingIntent.getActivity(this,callId.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,"incoming_calls"):new Notification.Builder(this).setPriority(Notification.PRIORITY_HIGH).setSound(Settings.System.DEFAULT_RINGTONE_URI);
  Notification notification=builder.setSmallIcon(android.R.drawable.sym_call_incoming).setContentTitle("Incoming Olamide call").setContentText("Tap to connect and answer").setCategory(Notification.CATEGORY_CALL).setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(open).setAutoCancel(true).build();
  if(Build.VERSION.SDK_INT>=26){builder.setTimeoutAfter(Math.min(45000,expiry-System.currentTimeMillis()));notification=builder.build();}
  try{manager.notify(callId.hashCode(),notification);}catch(SecurityException ignored){}
 }
}
