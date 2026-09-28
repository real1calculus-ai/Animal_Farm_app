"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Network } from "@capacitor/network";

/**
 * Bridges the native shell into the app: matches the status bar to the
 * current color scheme (light/dark can't be baked into
 * capacitor.config.ts's static `backgroundColor`), dismisses the splash
 * screen once the first paint is in (config sets `launchAutoHide: false`,
 * so something has to hide it or the app stays on the splash forever), and
 * shows a banner when the network drops mid-session — the errorPath page in
 * capacitor.config.ts only covers losing connectivity before the app has
 * loaded at all.
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

    SplashScreen.hide();

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
