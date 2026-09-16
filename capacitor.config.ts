import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aithoughts.app',
  appName: 'AiTo',
  webDir: 'public',
  // Same live site as web / PWA — one responsive UI for every screen.
  server: {
    url: 'https://ai-thoughts-mu.vercel.app',
    cleartext: false,
  },
  backgroundColor: '#f2f0eb',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#f2f0eb',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#f2f0eb',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#f2f0eb',
      launchAutoHide: true,
    },
  },
};

export default config;
