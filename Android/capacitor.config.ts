import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cmdrsys.app',
  appName: 'CMDRSYS',
  webDir: 'dist',
  server: {
    // Use http:// so that fetch() calls to the LAN sync server (also http://)
    // are not treated as mixed content and blocked by the WebView.
    // Without this, Capacitor serves from https://localhost and the WebView
    // silently blocks any outbound http:// fetch before it reaches the network.
    androidScheme: 'http',
  },
  android: {
    // Allow the WebView to load mixed content (http resources from an http page).
    // Required because the Electron sync server runs plain HTTP on port 45678.
    allowMixedContent: true,
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#020609',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
