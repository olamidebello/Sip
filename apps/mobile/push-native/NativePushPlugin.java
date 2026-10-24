package com.dobhrap.olamide;
import android.Manifest;
import android.os.Build;
import android.content.Intent;
import android.app.ActivityManager;
import android.app.NotificationManager;
import android.os.PowerManager;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;
@CapacitorPlugin(name="NativePush",permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public class NativePushPlugin extends Plugin {
 @PluginMethod public void getToken(PluginCall call){
  if(Build.VERSION.SDK_INT>=33 && getPermissionState("notifications")!=PermissionState.GRANTED){requestPermissionForAlias("notifications",call,"permissionResult");return;}
  token(call);
 }
 @PermissionCallback private void permissionResult(PluginCall call){if(getPermissionState("notifications")==PermissionState.GRANTED)token(call);else call.reject("Notification permission is required for background incoming calls");}
 private void token(PluginCall call){FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task->{if(!task.isSuccessful()){call.reject("Native push token unavailable");return;}JSObject result=new JSObject();result.put("token",task.getResult());call.resolve(result);});}
 @PluginMethod public void setCallActive(PluginCall call){
  Intent intent=new Intent(getContext(),OlamideCallService.class);
  try{if(call.getBoolean("active",false)){if(Build.VERSION.SDK_INT>=26)getContext().startForegroundService(intent);else getContext().startService(intent);}else getContext().stopService(intent);call.resolve();}catch(Exception e){call.reject("Active-call background service unavailable; return to the app");}
 }
 @PluginMethod public void getBackgroundStatus(PluginCall call){
  JSObject result=new JSObject();
  NotificationManager manager=(NotificationManager)getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
  PowerManager power=(PowerManager)getContext().getSystemService(android.content.Context.POWER_SERVICE);
  ActivityManager activity=(ActivityManager)getContext().getSystemService(android.content.Context.ACTIVITY_SERVICE);
  boolean notifications=Build.VERSION.SDK_INT<24 || manager.areNotificationsEnabled();
  if(Build.VERSION.SDK_INT>=26){android.app.NotificationChannel channel=manager.getNotificationChannel("incoming_calls");if(channel!=null && channel.getImportance()==NotificationManager.IMPORTANCE_NONE)notifications=false;}
  result.put("notificationsEnabled",notifications);
  result.put("batteryUnrestricted",Build.VERSION.SDK_INT<23 || power.isIgnoringBatteryOptimizations(getContext().getPackageName()));
  result.put("backgroundRestricted",Build.VERSION.SDK_INT>=28 && activity.isBackgroundRestricted());
  call.resolve(result);
 }
 @PluginMethod public void openBackgroundSettings(PluginCall call){
  try{
   Intent intent;
   if("battery".equals(call.getString("page")))intent=new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
   else intent=new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName()));
   intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);getContext().startActivity(intent);call.resolve();
  }catch(Exception e){call.reject("Open Android Settings, Apps, Olamide manually");}
 }
 @PluginMethod public void setEnabled(PluginCall call){getContext().getSharedPreferences("native_push",0).edit().putBoolean("enabled",call.getBoolean("enabled",false)).apply();call.resolve();}
}
