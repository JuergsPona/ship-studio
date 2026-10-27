import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  intersectThemeRects,
  focusNativeThemeControl,
  measureThemeControl,
  moveFocusFromThemeControl,
  removeNativeThemeControl,
  updateNativeThemeControl,
  type NativeThemeSnapshot,
} from './nativeThemeControl';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const snapshot: NativeThemeSnapshot = {
  mountId: 'test-control',
  frame: { x: 16, y: 100, width: 320, height: 30 },
  clip: { x: 16, y: 100, width: 320, height: 30 },
  viewportWidth: 1200,
  viewportHeight: 800,
  preference: 'system',
  enabled: true,
  visible: true,
};

beforeEach(() => {
  vi.mocked(invoke).mockReset().mockResolvedValue(true);
});

describe('native theme bridge', () => {
  it('clips in logical CSS pixels without applying Retina scaling', () => {
    expect(intersectThemeRects(snapshot.frame, { x: 0, y: 110, width: 1200, height: 800 })).toEqual(
      { x: 16, y: 110, width: 320, height: 20 }
    );
    expect(
      intersectThemeRects(snapshot.frame, { x: 500, y: 0, width: 200, height: 800 }).width
    ).toBe(0);
  });

  it('serializes removal after an in-flight update and recovers from failures', async () => {
    let failUpdate: (error: Error) => void = () => {};
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise<boolean>((_resolve, reject) => {
        failUpdate = reject;
      })
    );
    const update = updateNativeThemeControl(snapshot);
    const rejection = expect(update).rejects.toThrow('failed');
    const remove = removeNativeThemeControl(snapshot.mountId);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    failUpdate(new Error('failed'));
    await rejection;
    await remove;
    expect(invoke).toHaveBeenLastCalledWith('remove_native_theme_control', {
      mountId: snapshot.mountId,
    });
    await updateNativeThemeControl(snapshot);
    expect(invoke).toHaveBeenLastCalledWith('update_native_theme_control', { snapshot });
  });

  it('hides native controls inside an inactive modal', () => {
    const modal = document.createElement('div');
    const slot = document.createElement('div');
    modal.setAttribute('inert', '');
    modal.append(slot);
    document.body.append(modal);
    expect(measureThemeControl(slot).visible).toBe(false);
    modal.remove();
  });

  it('drops a queued focus handoff when focus ownership changes', async () => {
    let finishUpdate: (available: boolean) => void = () => {};
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishUpdate = resolve;
      })
    );
    let ownsFocus = true;
    const update = updateNativeThemeControl(snapshot);
    const focus = focusNativeThemeControl(snapshot.mountId, () => ownsFocus);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    ownsFocus = false;
    finishUpdate(true);
    await update;
    await focus;
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('returns Tab and Shift+Tab to eligible controls in the modal', () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.innerHTML =
      '<button>Before</button><div tabindex="0"></div>' +
      '<button disabled>Disabled</button><button tabindex="-1">Inactive tab</button>' +
      '<button>After</button>';
    document.body.append(modal);
    const controls = [...modal.querySelectorAll<HTMLElement>('button, div')];
    for (const control of controls) {
      Object.defineProperty(control, 'getClientRects', { value: () => ({ length: 1 }) });
    }
    const slot = controls[1];
    moveFocusFromThemeControl(slot, false);
    expect(document.activeElement).toBe(controls[4]);
    moveFocusFromThemeControl(slot, true);
    expect(document.activeElement).toBe(controls[0]);
    modal.remove();
  });
});
