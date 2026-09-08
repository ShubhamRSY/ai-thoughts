import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aithoughts.app',
  appName: 'AI Thoughts',
  webDir: 'public',
  // The app is fully dynamic (Next.js API routes, MongoDB, auth cookies) —
  // it can't be bundled as static files, so the native shell just loads
  // the live production site instead.
  server: {
    url: 'https://ai-thoughts-mu.vercel.app',
    cleartext: false,
  },
};

export default config;
