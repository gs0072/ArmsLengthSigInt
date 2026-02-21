import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.armslength.sigint',
  appName: 'ArmsLength SigInt',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0a0f',
      showSpinner: true,
      spinnerColor: '#00d4ff',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0f',
    },
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    backgroundColor: '#0a0a0f',
  },
};

export default config;
