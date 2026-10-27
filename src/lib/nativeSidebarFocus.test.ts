import { afterEach, describe, expect, it } from 'vitest';
import {
  claimNativeSidebarFocus,
  getNativeSidebarFocus,
  releaseNativeSidebarFocus,
  updateNativeSidebarFocus,
} from './nativeSidebarFocus';

describe('native sidebar window focus', () => {
  afterEach(() => {
    releaseNativeSidebarFocus('old');
    releaseNativeSidebarFocus('new');
  });

  it('keeps native window focus independent of webview focus', () => {
    claimNativeSidebarFocus('new', true);
    expect(getNativeSidebarFocus()).toBe(true);
    updateNativeSidebarFocus('new', false);
    expect(getNativeSidebarFocus()).toBe(false);
  });

  it('ignores late cleanup and focus changes from an old sidebar mount', () => {
    claimNativeSidebarFocus('old', false);
    claimNativeSidebarFocus('new', true);
    releaseNativeSidebarFocus('old');
    updateNativeSidebarFocus('old', false);
    expect(getNativeSidebarFocus()).toBe(true);
  });

  it('restores DOM focus detection after unmount', () => {
    claimNativeSidebarFocus('new', true);
    releaseNativeSidebarFocus('new');
    expect(getNativeSidebarFocus()).toBeNull();
  });
});
