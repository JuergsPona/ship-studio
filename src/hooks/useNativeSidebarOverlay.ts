import { useLayoutEffect } from 'react';
import { acquireNativeSidebarOverlay } from '../lib/nativeSidebarOverlays';

/** Web overlays must paint and receive input above the native sibling view. */
export function useNativeSidebarOverlay(open: boolean) {
  useLayoutEffect(() => {
    if (open) return acquireNativeSidebarOverlay();
  }, [open]);
}
