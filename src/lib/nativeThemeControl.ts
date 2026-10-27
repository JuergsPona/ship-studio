import { invoke } from '@tauri-apps/api/core';
import type { ThemePreference } from './theme';

export interface ThemeControlRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeThemeSnapshot {
  mountId: string;
  frame: ThemeControlRect;
  clip: ThemeControlRect;
  viewportWidth: number;
  viewportHeight: number;
  preference: ThemePreference;
  enabled: boolean;
  visible: boolean;
}

export interface NativeThemeAction {
  mountId: string;
  kind: 'select' | 'tab' | 'escape' | 'key';
  preference?: unknown;
  key?: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
}

// Shared across mounts so StrictMode cleanup cannot remove a newer control.
let queue: Promise<void> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const pending = queue.then(operation);
  queue = pending.then(
    () => {},
    () => {}
  );
  return pending;
}

export function updateNativeThemeControl(snapshot: NativeThemeSnapshot): Promise<boolean> {
  return enqueue(() => invoke<boolean>('update_native_theme_control', { snapshot }));
}

export function removeNativeThemeControl(mountId: string): Promise<void> {
  return enqueue(() => invoke<void>('remove_native_theme_control', { mountId }));
}

export function focusNativeThemeControl(
  mountId: string,
  shouldFocus: () => boolean = () => true
): Promise<void> {
  return enqueue(async () => {
    if (shouldFocus()) await invoke<void>('focus_native_theme_control', { mountId });
  });
}

export function intersectThemeRects(a: ThemeControlRect, b: ThemeControlRect): ThemeControlRect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}

/** CSS pixels are sent unchanged; the native view converts them to AppKit points. */
export function measureThemeControl(element: HTMLElement): {
  frame: ThemeControlRect;
  clip: ThemeControlRect;
  visible: boolean;
} {
  const rect = element.getBoundingClientRect();
  const frame = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  let clip: ThemeControlRect = {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
  let visible = element.isConnected && !element.closest('[hidden], [inert]');
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.visibility === 'hidden' || style.display === 'none') visible = false;
    const bounds = ancestor.getBoundingClientRect();
    if (ancestor !== element && /(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      clip = intersectThemeRects(clip, { ...clip, x: bounds.x, width: bounds.width });
    }
    if (ancestor !== element && /(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      clip = intersectThemeRects(clip, { ...clip, y: bounds.y, height: bounds.height });
    }
  }
  const painted = intersectThemeRects(frame, clip);
  visible = Boolean(visible && painted.width > 0 && painted.height > 0);
  if (visible && typeof document.elementFromPoint === 'function') {
    const hit = document.elementFromPoint(
      painted.x + painted.width / 2,
      painted.y + painted.height / 2
    );
    visible = hit !== null && element.contains(hit);
  }
  return { frame, clip, visible };
}

/** Continue the existing modal's DOM focus order when Tab leaves AppKit. */
export function moveFocusFromThemeControl(element: HTMLElement, backward: boolean): void {
  const dialog = element.closest('[role="dialog"]');
  if (!dialog) return;
  const selector = [
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'a[href]',
    '[tabindex]',
  ].join(',');
  const controls = [...dialog.querySelectorAll<HTMLElement>(selector)].filter(
    (control) =>
      control.tabIndex >= 0 &&
      !control.matches(':disabled') &&
      !control.closest('[hidden], [inert]') &&
      getComputedStyle(control).visibility !== 'hidden' &&
      control.getClientRects().length > 0
  );
  if (controls.length === 0) return;
  const index = controls.indexOf(element);
  if (index < 0) {
    const ordered = backward ? [...controls].reverse() : controls;
    const direction = backward
      ? Node.DOCUMENT_POSITION_PRECEDING
      : Node.DOCUMENT_POSITION_FOLLOWING;
    const adjacent = ordered.find(
      (control) => element.compareDocumentPosition(control) & direction
    );
    (adjacent ?? ordered[0])?.focus({ preventScroll: true });
    return;
  }
  const next = (index + (backward ? -1 : 1) + controls.length) % controls.length;
  controls[next]?.focus({ preventScroll: true });
}
