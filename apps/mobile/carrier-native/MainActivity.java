package com.dobhrap.olamide;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CarrierBrandPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
