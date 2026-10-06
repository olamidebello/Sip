package com.dobhrap.olamide;

import android.app.AlertDialog;
import android.content.Context;
import android.content.pm.PackageManager;
import android.telephony.TelephonyManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CarrierBrand")
public class CarrierBrandPlugin extends Plugin {
    private TelephonyManager manager() {
        return (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
    }

    private boolean supported() {
        return getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY_SUBSCRIPTION);
    }

    @PluginMethod
    public void status(PluginCall call) {
        TelephonyManager tm = manager();
        JSObject result = new JSObject();
        result.put("supported", supported() && tm != null);
        result.put("authorized", supported() && tm != null && tm.hasCarrierPrivileges());
        call.resolve(result);
    }

    @PluginMethod
    public void setOlamideBrand(PluginCall call) {
        TelephonyManager tm = manager();
        if (!supported() || tm == null || !tm.hasCarrierPrivileges()) {
            call.reject("The Olamide APK is not authorized by this SIM's carrier.");
            return;
        }
        getActivity().runOnUiThread(() -> new AlertDialog.Builder(getActivity())
            .setTitle("Set carrier display name")
            .setMessage("Set the authorized SIM's network display name to Olamide? This does not change the network or your calling service.")
            .setNegativeButton("Cancel", (dialog, which) -> call.reject("Cancelled"))
            .setPositiveButton("Set Olamide", (dialog, which) -> {
                try {
                    if (!tm.hasCarrierPrivileges()) {
                        call.reject("Carrier authorization is no longer available.");
                    } else if (!tm.setOperatorBrandOverride("Olamide")) {
                        call.reject("The device did not apply the carrier display name.");
                    } else {
                        JSObject result = new JSObject();
                        result.put("applied", true);
                        call.resolve(result);
                    }
                } catch (SecurityException | UnsupportedOperationException error) {
                    call.reject("Carrier authorization or telephony support is unavailable.");
                }
            }).show());
    }

    @PluginMethod
    public void clearBrand(PluginCall call) {
        TelephonyManager tm = manager();
        if (!supported() || tm == null || !tm.hasCarrierPrivileges()) {
            call.reject("The Olamide APK is not authorized by this SIM's carrier.");
            return;
        }
        getActivity().runOnUiThread(() -> new AlertDialog.Builder(getActivity())
            .setTitle("Restore carrier display name")
            .setMessage("Remove Olamide's display-name override for this SIM?")
            .setNegativeButton("Cancel", (dialog, which) -> call.reject("Cancelled"))
            .setPositiveButton("Restore", (dialog, which) -> {
                try {
                    if (!tm.hasCarrierPrivileges()) {
                        call.reject("Carrier authorization is no longer available.");
                    } else if (!tm.setOperatorBrandOverride(null)) {
                        call.reject("The device did not restore the display name.");
                    } else {
                        JSObject result = new JSObject();
                        result.put("applied", true);
                        call.resolve(result);
                    }
                } catch (SecurityException | UnsupportedOperationException error) {
                    call.reject("Carrier authorization or telephony support is unavailable.");
                }
            }).show());
    }
}
