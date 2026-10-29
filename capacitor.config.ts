import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.abdulkalam04.neonserpent",
  appName: "Neon Serpent",
  webDir: "dist-app",
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#020923",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      backgroundColor: "#00000000",
      style: "LIGHT",
    },
  },
};

export default config;
