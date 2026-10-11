package com.dobhrap.olamide;
import android.app.Service;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
public class OlamideCallService extends Service {
 @Override public int onStartCommand(Intent intent,int flags,int startId){
  NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
  if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel("active_calls","Active calls",NotificationManager.IMPORTANCE_LOW));
  PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,"active_calls"):new Notification.Builder(this);
  Notification notification=builder.setSmallIcon(android.R.drawable.sym_call_incoming).setContentTitle("Olamide call in progress").setContentText("Tap to return to your call").setContentIntent(open).setCategory(Notification.CATEGORY_CALL).setOngoing(true).build();
  if(Build.VERSION.SDK_INT>=29)startForeground(17001,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);else startForeground(17001,notification);
  return START_NOT_STICKY;
 }
 @Override public IBinder onBind(Intent intent){return null;}
}
