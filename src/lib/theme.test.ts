import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

const { handlers, unlisten } = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  unlisten: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, callback: (event: { payload: unknown }) => void) => {
    handlers.set(event, callback);
    return Promise.resolve(unlisten);
  }),
}));
vi.mock('./logger', () => ({ logger: { warn: vi.fn() } }));

let theme: typeof import('./theme');
let systemDark: boolean;
let mediaEvents: EventTarget;
let stop: (() => void) | undefined;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  handlers.clear();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  systemDark = false;
  mediaEvents = new EventTarget();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return systemDark;
    },
    addEventListener: mediaEvents.addEventListener.bind(mediaEvents),
    removeEventListener: mediaEvents.removeEventListener.bind(mediaEvents),
  }));
  vi.mocked(invoke).mockReset().mockResolvedValue('system');
  theme = await import('./theme');
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
});

async function start() {
  stop = theme.initializeTheme();
  await vi.waitFor(() => expect(theme.getThemeSnapshot().ready).toBe(true));
}

describe('app appearance', () => {
  it('defaults to System and follows live OS changes only in System mode', async () => {
    await start();
    expect(theme.getThemeSnapshot()).toMatchObject({ preference: 'system', resolved: 'light' });
    systemDark = true;
    mediaEvents.dispatchEvent(new Event('change'));
    expect(document.documentElement.dataset.theme).toBe('dark');

    await theme.setThemePreference('light');
    mediaEvents.dispatchEvent(new Event('change'));
    expect(document.documentElement.dataset.theme).toBe('light');

    await theme.setThemePreference('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('persists appearance separately from the app icon and restores the cached choice', async () => {
    await start();
    await theme.setThemePreference('light');
    expect(invoke).toHaveBeenLastCalledWith('set_theme_preference', { preference: 'light' });
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      'get_theme_preference',
      'set_theme_preference',
    ]);
    expect(localStorage.getItem(theme.THEME_STORAGE_KEY)).toBe('light');
    stop?.();
    stop = undefined;
    vi.resetModules();
    const restored = await import('./theme');
    expect(restored.getThemeSnapshot()).toMatchObject({ preference: 'light', resolved: 'light' });
  });

  it('keeps the current appearance and cache when saving fails', async () => {
    await start();
    vi.mocked(invoke).mockRejectedValueOnce(new Error('disk full'));
    await expect(theme.setThemePreference('dark')).rejects.toThrow('disk full');
    expect(theme.getThemeSnapshot().preference).toBe('system');
    expect(localStorage.getItem(theme.THEME_STORAGE_KEY)).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('light');
    // A failed request must not poison subsequent saves.
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await theme.setThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('does not overwrite a newer cross-window event with a slow initial read', async () => {
    let finishRead: (value: string) => void = () => {};
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finishRead = resolve;
      })
    );
    stop = theme.initializeTheme();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('get_theme_preference'));
    handlers.get(theme.THEME_CHANGED_EVENT)?.({ payload: 'dark' });
    finishRead('light');
    await Promise.resolve();
    expect(theme.getThemeSnapshot().preference).toBe('dark');
  });

  it('does not overwrite a newer cross-window choice with a late save response', async () => {
    await start();
    let finishSave: () => void = () => {};
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSave = resolve;
      })
    );
    const save = theme.setThemePreference('light');
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('set_theme_preference', { preference: 'light' })
    );
    handlers.get(theme.THEME_CHANGED_EVENT)?.({ payload: 'dark' });
    finishSave();
    await save;
    expect(theme.getThemeSnapshot().preference).toBe('dark');
  });

  it('retains the last requested mode when changes are queued quickly', async () => {
    await start();
    await Promise.all([theme.setThemePreference('dark'), theme.setThemePreference('light')]);
    expect(theme.getThemeSnapshot().preference).toBe('light');
    expect(invoke).toHaveBeenLastCalledWith('set_theme_preference', { preference: 'light' });
  });

  it('repaints an existing terminal and unsubscribes without recreating its session', async () => {
    await start();
    const { bindTerminalTheme, createTerminalOptions } =
      await import('../components/terminal/terminalTheme');
    const terminal = { options: createTerminalOptions('normal') };
    const unbind = bindTerminalTheme(terminal, 'normal');
    await theme.setThemePreference('dark');
    expect(terminal.options.theme).toMatchObject({ background: '#141414', foreground: '#bcbcbc' });
    const previousPalette = terminal.options.theme;
    unbind();
    await theme.setThemePreference('light');
    expect(terminal.options.theme).toBe(previousPalette);
  });

  it('ignores invalid broadcasts and removes both subscriptions on cleanup', async () => {
    await start();
    handlers.get(theme.THEME_CHANGED_EVENT)?.({ payload: 'brand' });
    expect(theme.getThemeSnapshot().preference).toBe('system');
    stop?.();
    stop = undefined;
    systemDark = true;
    mediaEvents.dispatchEvent(new Event('change'));
    handlers.get(theme.THEME_CHANGED_EVENT)?.({ payload: 'dark' });
    expect(theme.getThemeSnapshot().resolved).toBe('light');
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
