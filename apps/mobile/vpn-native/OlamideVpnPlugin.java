package com.dobhrap.olamide;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.net.VpnService;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.wireguard.android.backend.GoBackend;
import com.wireguard.android.backend.Tunnel;
import com.wireguard.config.Config;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

@CapacitorPlugin(name="OlamideVpn")
public class OlamideVpnPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicLong generation = new AtomicLong();
    private GoBackend backend;
    private volatile String owner = "";
    private volatile Tunnel.State state = Tunnel.State.DOWN;
    private final Tunnel tunnel = new Tunnel() {
        @Override public String getName() { return "Olamide"; }
        @Override public void onStateChange(Tunnel.State next) { state = next; }
    };
    @Override public void load() { backend = new GoBackend(getContext().getApplicationContext()); }
    private void withTrusted(PluginCall call, Runnable action) {
        getActivity().runOnUiThread(()->{
            Uri url = Uri.parse(getBridge().getWebView().getUrl());
            if (!"https".equals(url.getScheme()) || !"sip.dobhrap.com".equals(url.getHost()) || (url.getPort()!=-1 && url.getPort()!=443)) {
                call.reject("VPN control is only available inside the Olamide platform"); return;
            }
            action.run();
        });
    }
    @PluginMethod public void status(PluginCall call) {
        withTrusted(call,()->{
        JSObject result=new JSObject(); result.put("state",state==Tunnel.State.UP?"up":"down"); result.put("userId",owner); call.resolve(result);
        });
    }
    @PluginMethod public void connect(PluginCall call) {
        withTrusted(call,()->{
        String user=call.getString("userId", ""), config=call.getString("config", "");
        if (!user.matches("[a-fA-F0-9-]{36}") || config.length()>8192 || config.isEmpty()) { call.reject("Valid account VPN configuration required"); return; }
        call.getData().put("generation",generation.incrementAndGet());
        Intent permission=VpnService.prepare(getContext());
        if (permission!=null) startActivityForResult(call,permission,"vpnPermissionResult"); else startTunnel(call);
        });
    }
    @ActivityCallback private void vpnPermissionResult(PluginCall call, ActivityResult result) {
        if (call==null) return;
        if (result.getResultCode()!=Activity.RESULT_OK) { call.reject("VPN permission was declined. You can connect later from My VPN."); return; }
        withTrusted(call,()->startTunnel(call));
    }
    private void startTunnel(PluginCall call) {
        long seq=call.getData().optLong("generation",-1);
        worker.execute(()->{
            if(seq!=generation.get()) {call.reject("VPN request cancelled");return;}
            try {
                Config config=Config.parse(new ByteArrayInputStream(call.getString("config", "").getBytes(StandardCharsets.UTF_8)));
                if(config.getPeers().size()!=1) throw new IllegalArgumentException();
                backend.setState(tunnel,Tunnel.State.UP,config);
                if(seq!=generation.get()) {backend.setState(tunnel,Tunnel.State.DOWN,null);call.reject("VPN request cancelled");return;}
                owner=call.getString("userId", "");JSObject result=new JSObject();result.put("state","up");call.resolve(result);
            } catch(Exception error) { call.reject("Unable to start VPN. Check device permission and server availability."); }
        });
    }
    @PluginMethod public void disconnect(PluginCall call) {
        withTrusted(call,()->{generation.incrementAndGet();
        worker.execute(()->{try{backend.setState(tunnel,Tunnel.State.DOWN,null);owner="";call.resolve();}catch(Exception error){call.reject("Unable to stop VPN");}});
        });
    }
}
