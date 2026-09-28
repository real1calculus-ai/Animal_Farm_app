import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shell loads the deployed app directly (`server.url`) rather
 * than a bundled `webDir` — Server Components and Server Actions need a
 * live Node server behind every request, so there is no static build to
 * ship inside the binary. `webDir` still has to point at something real
 * for `cap sync`'s asset-copy step; `capacitor-www/` is a placeholder that
 * is never actually loaded at runtime.
 *
 * PRODUCTION_APP_URL must be the real deployed HTTPS origin before any
 * TestFlight or Play Console build — see the "Confirm the production
 * domain" checklist item.
 */
const PRODUCTION_APP_URL = process.env.CAPACITOR_APP_URL ?? "https://REPLACE-WITH-PRODUCTION-DOMAIN.example.com";

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
      // Held until NativeShell (src/components/native-shell.tsx) calls
      // SplashScreen.hide() once the first real screen has painted —
      // launchAutoHide would otherwise flash the splash away before the
      // remote page has finished loading.
      launchAutoHide: false,
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
