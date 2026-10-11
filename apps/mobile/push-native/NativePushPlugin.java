package com.dobhrap.olamide;
import android.Manifest;
import android.os.Build;
import android.content.Intent;
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
 @PluginMethod public void setEnabled(PluginCall call){getContext().getSharedPreferences("native_push",0).edit().putBoolean("enabled",call.getBoolean("enabled",false)).apply();call.resolve();}
}
