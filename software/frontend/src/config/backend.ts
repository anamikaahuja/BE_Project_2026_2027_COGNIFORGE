const STORAGE_KEY = 'cogniforge_backend_host';

/**
 * Resolves the COGNIFORGE backend host across every shell this frontend
 * ships in:
 *
 * - Served over http(s) (Vite dev server, nginx, or the Quest browser
 *   pointed at a dev machine's LAN IP): use `window.location.hostname` --
 *   this is what lets a headset on the same network reach the backend
 *   without any extra configuration.
 * - Loaded from `file://` (Electron's `loadFile`, Capacitor's local
 *   webview): `window.location.hostname` is an empty string there, which
 *   previously produced an invalid URL (`ws://:8000/...`) that threw
 *   synchronously and crashed the entire app before React could mount.
 *   Falls back to an explicit override (`setBackendHost`, persisted to
 *   localStorage) or "localhost" -- correct for the desktop app (backend
 *   runs on the same machine) and for a Capacitor app on an Android
 *   emulator/dev build talking to a backend forwarded to localhost. A real
 *   phone talking to a remote backend must call `setBackendHost(...)` once
 *   (e.g. from a settings screen) to point at that server's address.
 */
export function getBackendHost(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // localStorage unavailable (rare, e.g. some webview privacy modes) --
    // fall through to the location-based default.
  }
  return window.location.hostname || 'localhost';
}

export function setBackendHost(host: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, host);
  } catch {
    // best-effort; if storage is unavailable the override just won't persist
  }
}

export function getBackendHttpBase(port: number = 8000): string {
  return `http://${getBackendHost()}:${port}`;
}

export function getBackendWsBase(port: number = 8000): string {
  return `ws://${getBackendHost()}:${port}`;
}
