const leases = new Set<symbol>();
const subscribers = new Set<() => void>();

export function subscribeNativeSidebarOverlays(callback: () => void) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function hasNativeSidebarOverlay() {
  return leases.size > 0;
}

export function acquireNativeSidebarOverlay() {
  const lease = Symbol('web-overlay');
  leases.add(lease);
  subscribers.forEach((callback) => callback());
  return () => {
    leases.delete(lease);
    subscribers.forEach((callback) => callback());
  };
}
