import { useRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  NativeSidebarActionEvent,
  NativeSidebarHandler,
  NativeSidebarPresentation,
  NativeSidebarSnapshot,
} from '../lib/nativeSidebar';
import { acquireNativeSidebarOverlay } from '../lib/nativeSidebarOverlays';
import { useNativeSidebarHost } from './useNativeSidebarHost';

const native = vi.hoisted(() => ({
  update: vi.fn<(snapshot: NativeSidebarSnapshot) => Promise<boolean>>(),
  remove: vi.fn<(mountId: string) => Promise<void>>(),
  listeners: new Set<(event: { payload: NativeSidebarActionEvent }) => void>(),
}));

vi.mock('../lib/nativeSidebar', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/nativeSidebar')>();
  return {
    ...original,
    updateNativeSidebar: native.update,
    removeNativeSidebar: native.remove,
    readNativeSidebarWindowFocus: vi.fn().mockResolvedValue(true),
    listenNativeSidebarWindowFocus: vi.fn().mockResolvedValue(() => {}),
  };
});
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(
    (_name: string, callback: (event: { payload: NativeSidebarActionEvent }) => void) => {
      native.listeners.add(callback);
      return Promise.resolve(() => native.listeners.delete(callback));
    }
  ),
}));
vi.mock('../contexts/ModalContext', () => ({ useAnyModalOpen: () => false }));
vi.mock('../contexts/ToastContext', () => ({ useOptionalToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/window', () => ({ getWindowLabel: () => 'main' }));
vi.mock('../lib/logger', () => ({ logger: { warn: vi.fn() } }));

const presentation: NativeSidebarPresentation = { top: [], body: [], footer: [] };

function Host({ actions }: { actions: ReadonlyMap<string, NativeSidebarHandler> }) {
  const ref = useRef<HTMLElement>(null);
  useNativeSidebarHost(ref, presentation, actions);
  return <aside ref={ref} aria-label="Processes" />;
}

beforeEach(() => {
  native.listeners.clear();
  native.update.mockReset().mockResolvedValue(true);
  native.remove.mockReset().mockResolvedValue(undefined);
  document.documentElement.setAttribute('data-native-glass', 'true');
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 219, 600)
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  document.documentElement.removeAttribute('data-native-glass');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('native sidebar host', () => {
  it('uses updated handlers, ignores stale actions, and blocks actions behind web overlays', async () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    const { rerender } = render(<Host actions={new Map([['open', first]])} />, {
      reactStrictMode: true,
    });
    const slot = screen.getByRole('complementary', { name: 'Processes', hidden: true });
    await waitFor(() => expect(slot).toHaveAttribute('data-native-mounted'));
    const snapshot = native.update.mock.calls[0]?.[0];
    if (!snapshot) throw new Error('Native sidebar did not receive its first snapshot');
    rerender(<Host actions={new Map([['open', second]])} />);
    const emit = (change: Partial<NativeSidebarActionEvent> = {}) => {
      for (const callback of native.listeners) {
        callback({
          payload: {
            windowLabel: 'main',
            mountId: snapshot.mountId,
            revision: snapshot.revision,
            actionId: 'open',
            ...change,
          },
        });
      }
    };
    act(() => emit({ windowLabel: 'other-window' }));
    act(() => emit({ revision: snapshot.revision - 1 }));
    expect(second).not.toHaveBeenCalled();
    act(() => emit());
    await waitFor(() => expect(second).toHaveBeenCalledOnce());
    expect(first).not.toHaveBeenCalled();
    let release = () => {};
    act(() => {
      release = acquireNativeSidebarOverlay();
    });
    act(() => emit());
    expect(second).toHaveBeenCalledOnce();
    act(() => release());
  });

  it('keeps the web sidebar available when native mounting fails', async () => {
    native.update.mockRejectedValueOnce(new Error('native unavailable'));
    render(<Host actions={new Map()} />);
    const slot = screen.getByRole('complementary', { name: 'Processes' });
    await waitFor(() => expect(native.remove).toHaveBeenCalled());
    expect(slot).not.toHaveAttribute('data-native-mounted');
    expect(slot.inert).toBe(false);
  });
});
