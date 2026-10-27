import { StrictMode, useLayoutEffect, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNativeThemeControl } from './useNativeThemeControl';
import type { NativeThemeAction, NativeThemeSnapshot } from '../lib/nativeThemeControl';
import type { ThemePreference } from '../lib/theme';

const { update, remove, focus, listeners } = vi.hoisted(() => ({
  update: vi.fn<(snapshot: NativeThemeSnapshot) => Promise<boolean>>(),
  remove: vi.fn<(mountId: string) => Promise<void>>().mockResolvedValue(undefined),
  focus: vi.fn().mockResolvedValue(undefined),
  listeners: new Set<(event: { payload: NativeThemeAction }) => void>(),
}));
vi.mock('../lib/setup', () => ({ isMac: () => true }));
vi.mock('../lib/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('../lib/nativeThemeControl', () => ({
  updateNativeThemeControl: update,
  removeNativeThemeControl: remove,
  focusNativeThemeControl: focus,
  moveFocusFromThemeControl: vi.fn(),
  measureThemeControl: () => ({
    frame: { x: 16, y: 100, width: 320, height: 30 },
    clip: { x: 16, y: 100, width: 320, height: 30 },
    visible: true,
  }),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_name: string, callback: (event: { payload: NativeThemeAction }) => void) => {
    listeners.add(callback);
    return Promise.resolve(() => listeners.delete(callback));
  }),
}));

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
const placeholder = document.createElement('div');

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  frames = new Map();
  nextFrame = 0;
  update.mockReset().mockResolvedValue(true);
  remove.mockReset().mockResolvedValue(undefined);
  placeholder.tabIndex = 0;
  document.body.append(placeholder);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  placeholder.remove();
  vi.unstubAllGlobals();
});

async function paint() {
  await act(async () => {
    await Promise.resolve();
    const current = [...frames.values()];
    frames.clear();
    for (const callback of current) callback(0);
    await Promise.resolve();
  });
}

function mount(onChange = vi.fn(), strict = false) {
  return renderHook(
    ({ preference }: { preference: ThemePreference }) => {
      const control = useNativeThemeControl(preference, false, onChange);
      // The production component attaches the returned ref to its DOM slot.
      useLayoutEffect(() => {
        control.ref.current = placeholder;
        return () => {
          control.ref.current = null;
        };
      }, [control.ref]);
      return control;
    },
    {
      initialProps: { preference: 'system' as ThemePreference },
      wrapper: strict
        ? ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
        : undefined,
    }
  );
}

describe('native theme lifecycle', () => {
  it('keeps fallback active when an older update fails before a queued success', async () => {
    let rejectFirst: (error: Error) => void = () => {};
    let finishSecond: (available: boolean) => void = () => {};
    update.mockReturnValueOnce(
      new Promise<boolean>((_resolve, reject) => {
        rejectFirst = reject;
      })
    );
    update.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishSecond = resolve;
      })
    );
    const { result, rerender, unmount } = mount();
    await paint();
    rerender({ preference: 'dark' });
    await paint();
    await act(async () => {
      rejectFirst(new Error('native failure'));
      await Promise.resolve();
      finishSecond(true);
      await Promise.resolve();
    });
    expect(result.current.native).toBe(false);
    expect(remove).toHaveBeenCalledOnce();
    unmount();
  });

  it('does not enqueue a second removal after an in-flight update rejects on unmount', async () => {
    let rejectUpdate: (error: Error) => void = () => {};
    update.mockReturnValueOnce(
      new Promise<boolean>((_resolve, reject) => {
        rejectUpdate = reject;
      })
    );
    const { unmount } = mount(vi.fn(), true);
    await paint();
    unmount();
    const cleanupRemovals = remove.mock.calls.length;
    await act(async () => {
      rejectUpdate(new Error('late failure'));
      await Promise.resolve();
    });
    expect(remove).toHaveBeenCalledTimes(cleanupRemovals);
  });

  it('does not recreate the native view from a frame queued before failure', async () => {
    let rejectUpdate: (error: Error) => void = () => {};
    update.mockReturnValueOnce(
      new Promise<boolean>((_resolve, reject) => {
        rejectUpdate = reject;
      })
    );
    const { rerender, unmount } = mount();
    await paint();
    rerender({ preference: 'dark' });
    await act(async () => {
      rejectUpdate(new Error('native failure'));
      await Promise.resolve();
    });
    await paint();
    expect(update).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    unmount();
  });

  it('reconciles same-value selection even when no loading frame was rendered', async () => {
    const onChange = vi.fn();
    const { unmount } = mount(onChange);
    await paint();
    expect(update).toHaveBeenCalledOnce();
    const snapshot = update.mock.calls[0]?.[0];
    if (!snapshot) throw new Error('The native control did not mount');
    const { mountId } = snapshot;
    act(() => {
      for (const callback of listeners) {
        callback({ payload: { mountId, kind: 'select', preference: 'system' } });
      }
    });
    await paint();
    expect(onChange).toHaveBeenCalledWith('system');
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]?.[0]).toMatchObject({ preference: 'system', enabled: true });
    unmount();
  });

  it('does not steal focus after the user leaves while an update is pending', async () => {
    let finishUpdate: (available: boolean) => void = () => {};
    const { result, rerender, unmount } = mount();
    await paint();
    update.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishUpdate = resolve;
      })
    );
    act(() => {
      placeholder.focus();
      result.current.focus();
    });
    rerender({ preference: 'dark' });
    await paint();
    const next = document.createElement('button');
    document.body.append(next);
    await act(async () => {
      next.focus();
      result.current.blur();
      finishUpdate(true);
      await Promise.resolve();
    });
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(next);
    next.remove();
    unmount();
  });
});
