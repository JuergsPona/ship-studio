import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoStartProjectServers } from './useAutoStartProjectServers';
import {
  AUTO_START_PROJECT_SERVERS_CHANGED_EVENT,
  AUTO_START_PROJECT_SERVERS_LOCAL_CHANGED_EVENT,
  getAutoStartProjectServers,
} from '../lib/settings';

const { listeners, unlisten } = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: boolean }) => void>(),
  unlisten: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, callback: (event: { payload: boolean }) => void) => {
    listeners.set(event, callback);
    return Promise.resolve(unlisten);
  }),
}));
vi.mock('../lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/settings')>()),
  getAutoStartProjectServers: vi.fn().mockResolvedValue(false),
}));

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  vi.mocked(getAutoStartProjectServers).mockResolvedValue(false);
});

describe('useAutoStartProjectServers', () => {
  it('starts unloaded, then reads the saved opt-in', async () => {
    const { result } = renderHook(useAutoStartProjectServers);
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('synchronizes local writes and broadcasts from other windows', async () => {
    const { result, unmount } = renderHook(useAutoStartProjectServers);
    await waitFor(() => expect(result.current).toBe(false));
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AUTO_START_PROJECT_SERVERS_LOCAL_CHANGED_EVENT, { detail: true })
      );
    });
    expect(result.current).toBe(true);
    act(() => {
      listeners.get(AUTO_START_PROJECT_SERVERS_CHANGED_EVENT)?.({ payload: false });
    });
    expect(result.current).toBe(false);
    unmount();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('does not overwrite a newer event with a slow initial read', async () => {
    let resolveRead: (enabled: boolean) => void = () => {};
    vi.mocked(getAutoStartProjectServers).mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveRead = resolve;
      })
    );
    const { result } = renderHook(useAutoStartProjectServers);
    await waitFor(() => expect(getAutoStartProjectServers).toHaveBeenCalled());
    await act(async () => {
      listeners.get(AUTO_START_PROJECT_SERVERS_CHANGED_EVENT)?.({ payload: false });
      resolveRead(true);
      await Promise.resolve();
    });
    expect(result.current).toBe(false);
  });
});
