import React from 'react';
import ReactDOM from 'react-dom/client';
import { App, PlatformMode } from './App';

// One codebase, three platform-tailored builds (see vite.config.ts and
// package.json's build:vr / build:ar scripts): `import.meta.env.MODE` is
// 'vr' or 'ar' only when built with `--mode vr` / `--mode ar`; the default
// build (used by the browser and the Electron desktop app) reports
// Vite's usual 'development'/'production' and falls back to 'desktop'.
function resolvePlatformMode(): PlatformMode {
  const raw = import.meta.env.MODE;
  return raw === 'vr' || raw === 'ar' ? raw : 'desktop';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App mode={resolvePlatformMode()} />
);
