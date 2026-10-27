import { describe, expect, it } from 'vitest';
import { acquireNativeSidebarOverlay, hasNativeSidebarOverlay } from './nativeSidebarOverlays';

describe('native sidebar web-overlay ownership', () => {
  it('stays behind the webview until every overlapping surface closes', () => {
    const closeModal = acquireNativeSidebarOverlay();
    const closeMenu = acquireNativeSidebarOverlay();
    expect(hasNativeSidebarOverlay()).toBe(true);
    closeMenu();
    expect(hasNativeSidebarOverlay()).toBe(true);
    closeModal();
    expect(hasNativeSidebarOverlay()).toBe(false);
  });
});
