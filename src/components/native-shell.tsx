"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Network } from "@capacitor/network";

/**
 * Bridges the native shell into the app: matches the status bar to the
 * current color scheme (light/dark can't be baked into
 * capacitor.config.ts's static `backgroundColor`), and shows a banner when
 * the network drops mid-session — the errorPath page in
 * capacitor.config.ts only covers losing connectivity before the app has
 * loaded at all.
 *
 * Deliberately does NOT hide the splash screen — that used to happen here,
 * but it only ran once this component mounted, which only happens once the
 * real app has loaded. When it can't (no connection, wrong domain, server
 * down), the WebView falls back to the local offline.html instead, which
 * cannot call any Capacitor plugin on Android, so the splash was left
 * showing forever with no way to dismiss it. capacitor.config.ts now sets
 * `launchAutoHide: true` so the native side handles this unconditionally.
 *
 * A no-op everywhere else: every call here is a no-op on plain web
 * (`Capacitor.isNativePlatform()` is false there), so this is safe to mount
 * unconditionally from the root layout.
 */
export function NativeShell() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    async function applyStatusBar(dark: boolean) {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      await StatusBar.setBackgroundColor({ color: dark ? "#182219" : "#FFFFFF" });
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyStatusBar(media.matches);
    const onSchemeChange = (e: MediaQueryListEvent) => applyStatusBar(e.matches);
    media.addEventListener("change", onSchemeChange);

    let networkListener: { remove: () => void } | undefined;
    Network.getStatus().then((status) => setOffline(!status.connected));
    Network.addListener("networkStatusChange", (status) => setOffline(!status.connected)).then(
      (handle) => {
        networkListener = handle;
      }
    );

    return () => {
      media.removeEventListener("change", onSchemeChange);
      networkListener?.remove();
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-amber-950"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.375rem)" }}
    >
      No connection — showing what was last loaded
    </div>
  );
}
