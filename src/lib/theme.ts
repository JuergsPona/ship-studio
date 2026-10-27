import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { logger } from './logger';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_CHANGED_EVENT = 'theme-preference-changed';
export const THEME_STORAGE_KEY = 'shipstudio.themePreference';
export const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

function systemIsDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function cachedPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

const initialPreference = cachedPreference();
let snapshot = {
  preference: initialPreference,
  resolved: resolveTheme(initialPreference, systemIsDark()),
  ready: false,
};
let revision = 0;
let saveQueue = Promise.resolve();
const subscribers = new Set<() => void>();

export function getThemeSnapshot() {
  return snapshot;
}

export function subscribeTheme(callback: () => void): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function applyPreference(preference: ThemePreference, ready: boolean): void {
  const resolved = resolveTheme(preference, systemIsDark());
  document.documentElement.dataset.theme = resolved;
  try {
    // Cache only preferences read from or successfully saved to the backend.
    if (ready) localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The native preference remains authoritative when storage is unavailable.
  }
  if (
    snapshot.preference === preference &&
    snapshot.resolved === resolved &&
    snapshot.ready === ready
  ) {
    return;
  }
  snapshot = { preference, resolved, ready };
  for (const callback of subscribers) callback();
}

/** One lifecycle per app window, including onboarding and the browser harness. */
export function initializeTheme(): () => void {
  let disposed = false;
  let unlisten: (() => void) | undefined;
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const onSystemChange = () => applyPreference(snapshot.preference, snapshot.ready);
  media?.addEventListener('change', onSystemChange);
  applyPreference(snapshot.preference, snapshot.ready);

  void (async () => {
    try {
      const stop = await listen<ThemePreference>(THEME_CHANGED_EVENT, ({ payload }) => {
        if (disposed || !isThemePreference(payload)) return;
        revision += 1;
        applyPreference(payload, true);
      });
      if (disposed) {
        stop();
        return;
      }
      unlisten = stop;
    } catch (error) {
      logger.warn('[theme] Could not subscribe to theme changes', { error: String(error) });
    }
    const beforeRead = revision;
    try {
      const preference = await invoke<ThemePreference>('get_theme_preference');
      if (!disposed && revision === beforeRead && isThemePreference(preference)) {
        applyPreference(preference, true);
      }
    } catch (error) {
      logger.warn('[theme] Could not read the saved theme', { error: String(error) });
    }
  })();

  return () => {
    disposed = true;
    unlisten?.();
    media?.removeEventListener('change', onSystemChange);
  };
}

/** Save first: a failed write never changes the displayed preference or icon. */
export function setThemePreference(preference: ThemePreference): Promise<void> {
  const pending = saveQueue.then(async () => {
    const beforeSave = revision;
    await invoke('set_theme_preference', { preference });
    if (revision === beforeSave) {
      revision += 1;
      applyPreference(preference, true);
    }
  });
  saveQueue = pending.catch(() => {});
  return pending;
}
