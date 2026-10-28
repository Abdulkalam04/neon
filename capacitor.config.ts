import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.yourname.neonserpent",
  appName: "Neon Serpent",
  webDir: "dist-app",
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#020923",
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
