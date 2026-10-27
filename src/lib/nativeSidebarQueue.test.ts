import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeSidebarSnapshot } from './nativeSidebar';

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));

import { removeNativeSidebar, updateNativeSidebar } from './nativeSidebar';

function snapshot(mountId: string): NativeSidebarSnapshot {
  return {
    mountId,
    revision: 1,
    frame: { x: 0, y: 0, width: 219, height: 600 },
    behindWebview: false,
    top: [],
    body: [],
    footer: [],
  };
}

beforeEach(() => {
  invoke.mockReset();
});

describe('native sidebar operation queue', () => {
  it('finishes an older mount before updating and removing later mounts', async () => {
    let finishFirst: (value: boolean) => void = () => {};
    invoke.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishFirst = resolve;
      })
    );
    invoke.mockResolvedValueOnce(true);
    invoke.mockResolvedValueOnce(undefined);
    const first = updateNativeSidebar(snapshot('old'));
    const second = updateNativeSidebar(snapshot('new'));
    const cleanup = removeNativeSidebar('old');
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    finishFirst(true);
    await Promise.all([first, second, cleanup]);
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'update_native_sidebar',
      'update_native_sidebar',
      'remove_native_sidebar',
    ]);
    expect(invoke.mock.calls[1]?.[1]).toEqual({ snapshot: snapshot('new') });
    expect(invoke.mock.calls[2]?.[1]).toEqual({ mountId: 'old' });
  });

  it('continues processing after an update fails', async () => {
    invoke.mockRejectedValueOnce(new Error('unavailable'));
    invoke.mockResolvedValueOnce(undefined);
    const failed = updateNativeSidebar(snapshot('old'));
    const cleanup = removeNativeSidebar('old');
    await expect(failed).rejects.toThrow('unavailable');
    await expect(cleanup).resolves.toBeUndefined();
  });
});
