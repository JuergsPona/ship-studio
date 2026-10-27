import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  isCurrentSidebarAction,
  removeNativeSidebar,
  updateNativeSidebar,
  readNativeSidebarWindowFocus,
  listenNativeSidebarWindowFocus,
  type NativeSidebarActionEvent,
  type NativeSidebarHandler,
  type NativeSidebarPresentation,
} from '../lib/nativeSidebar';
import { getWindowLabel } from '../lib/window';
import { logger } from '../lib/logger';
import { useAnyModalOpen } from '../contexts/ModalContext';
import { useOptionalToast } from '../contexts/ToastContext';
import { asCommandError, formatCommandError } from '../lib/errors';
import {
  claimNativeSidebarFocus,
  releaseNativeSidebarFocus,
  updateNativeSidebarFocus,
} from '../lib/nativeSidebarFocus';
import {
  hasNativeSidebarOverlay,
  subscribeNativeSidebarOverlays,
} from '../lib/nativeSidebarOverlays';

export function useNativeSidebarHost(
  ref: RefObject<HTMLElement | null>,
  presentation: NativeSidebarPresentation,
  actions: ReadonlyMap<string, NativeSidebarHandler>
) {
  const modalOpen = useAnyModalOpen();
  const { showToast } = useOptionalToast();
  const [nativeReady, setNativeReady] = useState(() =>
    document.documentElement.hasAttribute('data-native-glass')
  );
  const [mounted, setMounted] = useState(false);
  const encoded = JSON.stringify(presentation);
  const overlayOpen = useSyncExternalStore(
    subscribeNativeSidebarOverlays,
    hasNativeSidebarOverlay,
    () => false
  );
  const behindWebview = modalOpen || overlayOpen;
  const refresh = useRef<(() => void) | null>(null);
  const latest = useRef({ presentation, actions, behindWebview, showToast });

  useLayoutEffect(() => {
    latest.current = { presentation, actions, behindWebview, showToast };
  }, [presentation, actions, behindWebview, showToast]);

  useEffect(() => {
    if (nativeReady) return;
    const observer = new MutationObserver(() => {
      if (document.documentElement.hasAttribute('data-native-glass')) setNativeReady(true);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-native-glass'],
    });
    return () => observer.disconnect();
  }, [nativeReady]);

  useEffect(() => {
    if (!nativeReady || !ref.current) return;
    const element = ref.current;
    const windowLabel = getWindowLabel();
    const mountId = crypto.randomUUID();
    let revision = 0;
    let acknowledgedRevision = 0;
    let disposed = false;
    let failed = false;
    let previous = '';
    let forceNext = false;
    let actionFrame: number | null = null;
    let pending: Promise<unknown> = Promise.resolve();
    let unlisten: (() => void) | undefined;
    let stopFocus: (() => void) | undefined;
    let focused: boolean | null = null;
    let focusRevision = 0;
    let nativeMounted = false;
    const markMounted = (value: boolean) => {
      nativeMounted = value;
      if (value) claimNativeSidebarFocus(mountId, focused);
      else releaseNativeSidebarFocus(mountId);
      element.toggleAttribute('data-native-mounted', value);
      element.inert = value;
      if (value) element.setAttribute('aria-hidden', 'true');
      else element.removeAttribute('aria-hidden');
      if (!disposed) setMounted(value);
    };
    const synchronize = () => {
      if (disposed || failed || !unlisten) return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const value = {
        ...latest.current.presentation,
        frame: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        behindWebview: latest.current.behindWebview,
      };
      const key = JSON.stringify(value);
      if (previous === key && !forceNext) return;
      forceNext = false;
      previous = key;
      const nextRevision = ++revision;
      pending = pending
        .then(async () => {
          if (disposed || failed) return;
          const active = await updateNativeSidebar({ ...value, mountId, revision: nextRevision });
          if (disposed) return;
          acknowledgedRevision = nextRevision;
          markMounted(active);
        })
        .catch((error: unknown) => {
          if (disposed) return;
          failed = true;
          markMounted(false);
          logger.warn('[native-sidebar] Native renderer unavailable; keeping web sidebar', {
            error: String(error),
          });
          return removeNativeSidebar(mountId).catch(() => {});
        });
    };
    refresh.current = synchronize;
    void listen<NativeSidebarActionEvent>('native-sidebar-action', ({ payload }) => {
      if (
        disposed ||
        !nativeMounted ||
        latest.current.behindWebview ||
        !isCurrentSidebarAction(
          payload,
          { windowLabel, mountId, revision: acknowledgedRevision },
          latest.current.actions
        )
      )
        return;
      void Promise.resolve()
        .then(() => {
          if (
            disposed ||
            latest.current.behindWebview ||
            !isCurrentSidebarAction(
              payload,
              { windowLabel, mountId, revision: acknowledgedRevision },
              latest.current.actions
            )
          )
            return;
          return latest.current.actions.get(payload.actionId)?.(payload.value);
        })
        .then(() => {
          if (disposed) return;
          if (actionFrame !== null) cancelAnimationFrame(actionFrame);
          actionFrame = requestAnimationFrame(() => {
            actionFrame = null;
            forceNext = true;
            synchronize();
          });
        })
        .catch((error: unknown) => {
          if (!disposed)
            latest.current.showToast(formatCommandError(asCommandError(error)), 'error');
        });
    })
      .then((stop) => {
        if (disposed) {
          stop();
          return;
        }
        unlisten = stop;
        synchronize();
      })
      .catch((error: unknown) => {
        failed = true;
        logger.warn('[native-sidebar] Could not subscribe to actions', { error: String(error) });
      });
    void listenNativeSidebarWindowFocus((value) => {
      if (disposed) return;
      focusRevision += 1;
      focused = value;
      if (nativeMounted) updateNativeSidebarFocus(mountId, value);
    })
      .then((stop) => {
        if (disposed) {
          stop();
          return;
        }
        stopFocus = stop;
        const beforeRead = focusRevision;
        return readNativeSidebarWindowFocus().then((value) => {
          if (disposed || focusRevision !== beforeRead) return;
          focused = value;
          if (nativeMounted) updateNativeSidebarFocus(mountId, value);
        });
      })
      .catch((error: unknown) =>
        logger.warn('[native-sidebar] Window focus unavailable', { error: String(error) })
      );
    const resize = new ResizeObserver(synchronize);
    resize.observe(element);
    // Ancestor layout changes can move the slot without changing its size.
    window.addEventListener('resize', synchronize);
    window.addEventListener('scroll', synchronize, true);
    return () => {
      disposed = true;
      refresh.current = null;
      resize.disconnect();
      if (actionFrame !== null) cancelAnimationFrame(actionFrame);
      window.removeEventListener('resize', synchronize);
      window.removeEventListener('scroll', synchronize, true);
      unlisten?.();
      stopFocus?.();
      markMounted(false);
      void pending
        .finally(() => removeNativeSidebar(mountId))
        .catch((error: unknown) =>
          logger.warn('[native-sidebar] Cleanup failed', { error: String(error) })
        );
    };
  }, [nativeReady, ref]);

  useEffect(() => {
    refresh.current?.();
  }, [encoded, behindWebview]);
  return mounted;
}
