import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { isMac } from '../lib/setup';
import { isThemePreference, type ThemePreference } from '../lib/theme';
import { logger } from '../lib/logger';
import {
  focusNativeThemeControl,
  measureThemeControl,
  moveFocusFromThemeControl,
  removeNativeThemeControl,
  updateNativeThemeControl,
  type NativeThemeAction,
} from '../lib/nativeThemeControl';

export function useNativeThemeControl(
  preference: ThemePreference,
  disabled: boolean,
  onValueChange: (value: ThemePreference) => void
) {
  const mountId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ preference, disabled, onValueChange });
  const refresh = useRef<(() => void) | null>(null);
  const focusRequested = useRef(false);
  const [native, setNative] = useState(false);

  useLayoutEffect(() => {
    latest.current = { preference, disabled, onValueChange };
    refresh.current?.();
  }, [preference, disabled, onValueChange]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !isMac()) return;
    let disposed = false;
    let frame: number | null = null;
    let unlisten: (() => void) | undefined;
    let supported = true;
    let listening = false;
    let lastSnapshot = '';

    const report = (error: unknown) => {
      logger.warn('[native theme control] Native view unavailable', { error: String(error) });
    };
    const focusIfRequested = () => {
      if (disposed || !supported || !focusRequested.current) return;
      focusRequested.current = false;
      const stillOwnsFocus = () =>
        !disposed &&
        supported &&
        !latest.current.disabled &&
        document.activeElement === element &&
        measureThemeControl(element).visible;
      if (stillOwnsFocus()) void focusNativeThemeControl(mountId, stillOwnsFocus).catch(report);
    };
    const schedule = () => {
      if (disposed || !supported || !listening || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (
          disposed ||
          !supported ||
          !listening ||
          window.innerWidth <= 0 ||
          window.innerHeight <= 0
        ) {
          return;
        }
        const snapshot = {
          mountId,
          ...measureThemeControl(element),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          preference: latest.current.preference,
          enabled: !latest.current.disabled,
        };
        if (!snapshot.visible || !snapshot.enabled) focusRequested.current = false;
        const encoded = JSON.stringify(snapshot);
        if (encoded === lastSnapshot) {
          if (snapshot.visible && snapshot.enabled) focusIfRequested();
          return;
        }
        lastSnapshot = encoded;
        void updateNativeThemeControl(snapshot)
          .then((available) => {
            if (disposed || !supported) return;
            supported = available;
            setNative(available);
            if (available && snapshot.visible && snapshot.enabled) focusIfRequested();
          })
          .catch((error) => {
            if (disposed || !supported) return;
            supported = false;
            setNative(false);
            void removeNativeThemeControl(mountId).catch(report);
            report(error);
          });
      });
    };

    const resize = new ResizeObserver(schedule);
    const mutation = new MutationObserver(schedule);
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      resize.observe(ancestor);
      mutation.observe(ancestor, {
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'inert', 'data-modal-inactive'],
      });
    }
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    refresh.current = schedule;

    void listen<NativeThemeAction>('native-theme-control-action', ({ payload }) => {
      if (disposed || payload.mountId !== mountId) return;
      if (payload.kind === 'select' && isThemePreference(payload.preference)) {
        if (!measureThemeControl(element).visible) {
          schedule();
          return;
        }
        // AppKit selects and disables immediately. Always reconcile, including
        // same-value clicks and saves that fail before another animation frame.
        lastSnapshot = '';
        latest.current.onValueChange(payload.preference);
        schedule();
      } else if (payload.kind === 'tab') {
        moveFocusFromThemeControl(element, payload.shiftKey === true);
      } else if (payload.kind === 'escape' || payload.kind === 'key') {
        element.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: payload.kind === 'escape' ? 'Escape' : (payload.key ?? ''),
            bubbles: true,
            cancelable: true,
            metaKey: payload.kind === 'key',
            shiftKey: payload.shiftKey === true,
            altKey: payload.altKey === true,
            ctrlKey: payload.ctrlKey === true,
          })
        );
      }
    })
      .then((stop) => {
        if (disposed) stop();
        else {
          unlisten = stop;
          listening = true;
          schedule();
        }
      })
      .catch((error) => {
        supported = false;
        report(error);
      });

    return () => {
      disposed = true;
      focusRequested.current = false;
      refresh.current = null;
      if (frame !== null) cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      unlisten?.();
      void removeNativeThemeControl(mountId).catch(report);
    };
  }, [mountId]);

  const focus = () => {
    if (native) {
      // Focusing a scrolled-out slot scrolls the DOM first. Restore the native
      // view at that new position before handing keyboard focus to AppKit.
      focusRequested.current = true;
      refresh.current?.();
    }
  };
  const blur = () => {
    focusRequested.current = false;
  };
  return { ref, native, focus, blur };
}
