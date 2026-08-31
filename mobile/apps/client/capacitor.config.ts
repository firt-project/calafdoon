import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.helcalaf.app",
  appName: "HelCalaf",
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "https",
  },
  plugins: {
    // Route fetch/XHR through native HTTP so the WebView is not blocked by
    // missing Capacitor CORS origins on the API (still update Render CORS for Socket.IO).
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      // Hide even if JS is slow; React paints brand background underneath.
      launchAutoHide: true,
      launchShowDuration: 2500,
      backgroundColor: "#a61b2b",
      showSpinner: true,
      spinnerColor: "#ffffff",
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#00000000",
      overlaysWebView: true,
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
