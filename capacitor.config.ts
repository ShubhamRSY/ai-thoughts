import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aithoughts.app',
  appName: 'AI Thoughts',
  webDir: 'public',
  // Same live site as web / PWA — one responsive UI for every screen.
  server: {
    url: 'https://ai-thoughts-mu.vercel.app',
    cleartext: false,
  },
  backgroundColor: '#e8eef2',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#e8eef2',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#e8eef2',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#e8eef2',
      launchAutoHide: true,
    },
  },
};

export default config;
