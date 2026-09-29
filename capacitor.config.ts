import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shell loads the deployed app directly (`server.url`) rather
 * than a bundled `webDir` — Server Components and Server Actions need a
 * live Node server behind every request, so there is no static build to
 * ship inside the binary. `webDir` still has to point at something real
 * for `cap sync`'s asset-copy step; `capacitor-www/` is a placeholder that
 * is never actually loaded at runtime.
 *
 * A public URL, not a credential — there's no security reason to keep it
 * out of the repo (it's exactly what the WebView loads, visible in any
 * network trace of the app regardless). CAPACITOR_APP_URL stays as an
 * override for a future staging build without editing this file.
 */
const PRODUCTION_APP_URL = process.env.CAPACITOR_APP_URL ?? "https://animal-farm-app.vercel.app";

const config: CapacitorConfig = {
  appId: "com.pigfarmapp.manager",
  appName: "Pig Farm Manager",
  webDir: "capacitor-www",
  server: {
    // Capacitor's own type declares `server.url` as "not intended for use
    // in production" (it exists for live-reload dev servers) — but there's
    // no static bundle to ship instead, since Server Components and Server
    // Actions need a live Node server. This is the same "hybrid remote"
    // pattern Ionic's own enterprise docs describe for shipping an existing
    // web app; it works, but it's worth knowing the option is documented
    // for a different use case than this one.
    url: PRODUCTION_APP_URL,
    androidScheme: "https",
    cleartext: false,
    // Shown instead of the OS's own network-error page when the device has
    // no connection — capacitor-www/offline.html, plain HTML/CSS/JS only
    // (Android denies it access to Capacitor plugins).
    errorPath: "offline.html",
  },
  ios: {
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      // true (the default): Capacitor dismisses the splash natively once
      // the WebView's first page load fires, whatever that page turns out
      // to be. This used to be false with a manual SplashScreen.hide()
      // call from NativeShell once the real app painted — but that call
      // only ever runs if the remote app actually loads. When it doesn't
      // (no connection, wrong domain, server down) the WebView falls back
      // to errorPath's offline.html instead, which cannot call
      // SplashScreen.hide() at all — Capacitor's own docs are explicit
      // that "on Android the html file won't have access to Capacitor
      // plugins" — so the splash was left showing forever. A brief flash
      // before content settles is a far better failure mode than an app
      // that looks permanently stuck.
      launchAutoHide: true,
      backgroundColor: "#2F6B4F",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      // Initial values only, before NativeShell overrides them to match
      // the actual light/dark scheme once JS runs.
      style: "LIGHT",
      backgroundColor: "#FFFFFF",
    },
  },
};

export default config;
