import { describe, it, expect, beforeEach } from 'vitest';
import { getBackendHost, getBackendHttpBase, getBackendWsBase, setBackendHost } from './backend';

// Node 25's built-in experimental `localStorage` global shadows jsdom's real
// Storage implementation with a non-functional stub in this environment
// (confirmed via diagnostics: window.localStorage's prototype has none of
// the Storage methods). Unrelated to the code under test, so it's stubbed
// out explicitly here rather than relied upon from jsdom/Node.
function installFakeLocalStorage() {
  const store = new Map<string, string>();
  const fakeStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  Object.defineProperty(window, 'localStorage', { value: fakeStorage, writable: true, configurable: true });
}

describe('getBackendHost', () => {
  beforeEach(() => {
    installFakeLocalStorage();
  });

  it('uses window.location.hostname when served over http(s)', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: '192.168.1.50' },
      writable: true,
    });
    expect(getBackendHost()).toBe('192.168.1.50');
  });

  it('falls back to localhost when hostname is empty (file:// -- Electron/Capacitor)', () => {
    // This is the exact regression: file:// URLs report an empty
    // location.hostname. Before this fallback existed, `new
    // WebSocketClient()` built the URL `ws://:8000/ws/stream`, which threw
    // a synchronous DOMException from inside Engine.init() (called during
    // React's mount effect) and crashed the entire app to a blank screen --
    // caught by loading the Electron build and inspecting it via CDP.
    Object.defineProperty(window, 'location', {
      value: { hostname: '' },
      writable: true,
    });
    expect(getBackendHost()).toBe('localhost');
  });

  it('prefers an explicit override over the empty file:// default', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: '' },
      writable: true,
    });
    setBackendHost('10.0.2.2');
    expect(getBackendHost()).toBe('10.0.2.2');
    expect(getBackendHttpBase()).toBe('http://10.0.2.2:8000');
    expect(getBackendWsBase()).toBe('ws://10.0.2.2:8000');
  });
});
