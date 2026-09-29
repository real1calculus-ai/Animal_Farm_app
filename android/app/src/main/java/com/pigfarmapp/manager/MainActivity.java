package com.pigfarmapp.manager;

import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.widget.ScrollView;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;

/**
 * TEMPORARY diagnostic wrapper — not for release.
 *
 * BridgeActivity.onCreate() (which sets up the WebView, loads every
 * Capacitor plugin, and starts the bridge) isn't wrapped in a try/catch
 * anywhere in Capacitor's own code, so any exception during that sequence
 * kills the process outright with no visible detail — exactly the "splash
 * flashes then closes" pattern reported, and no adb/device access was
 * available to pull the real stack trace any other way. This catches that
 * exception and shows it on screen (readable, photographable) instead of
 * letting the OS silently kill the app. Revert to the one-line version
 * once the actual crash is identified from what this displays.
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        try {
            super.onCreate(savedInstanceState);
        } catch (Throwable t) {
            Log.e("PigFarmCrash", "Crash during BridgeActivity.onCreate", t);
            showCrash(t);
        }
    }

    private void showCrash(Throwable t) {
        TextView text = new TextView(this);
        text.setText("Startup crashed:\n\n" + Log.getStackTraceString(t));
        text.setTextColor(Color.WHITE);
        text.setTextIsSelectable(true);
        text.setPadding(32, 64, 32, 64);
        text.setTextSize(12);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.BLACK);
        scroll.addView(text);
        setContentView(scroll);
    }
}
