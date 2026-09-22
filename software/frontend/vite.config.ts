import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// COGNIFORGE ships as three platform-tailored apps built from this one
// codebase: the default build (desktop/browser, full 2D control UI), and
// `--mode vr` / `--mode ar` builds that trim the UI to what makes sense on
// a headset or a phone (see src/App.tsx's `mode` prop) and land in their
// own output directories so each native shell (apps/desktop, apps/vr,
// apps/ar) points at the build meant for it.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Relative asset paths: required for the built output to load correctly
  // under file:// (Electron's BrowserWindow.loadFile, Capacitor's local
  // webview) in addition to being served over http:// by Vite/nginx.
  base: './',
  build: {
    outDir: mode === 'vr' ? 'dist-vr' : mode === 'ar' ? 'dist-ar' : 'dist',
  },
  server: {
    host: '0.0.0.0', // Important for headset access
    port: 3000,
  },
}));
