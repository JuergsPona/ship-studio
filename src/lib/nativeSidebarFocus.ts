let nativeFocus: boolean | null = null;
let owner: string | null = null;
const subscribers = new Set<() => void>();

export function getNativeSidebarFocus(): boolean | null {
  return nativeFocus;
}

export function claimNativeSidebarFocus(mountId: string, focused: boolean | null): void {
  owner = mountId;
  if (nativeFocus === focused) return;
  nativeFocus = focused;
  subscribers.forEach((callback) => callback());
}

export function updateNativeSidebarFocus(mountId: string, focused: boolean): void {
  if (owner === mountId) claimNativeSidebarFocus(mountId, focused);
}

export function releaseNativeSidebarFocus(mountId: string): void {
  if (owner !== mountId) return;
  owner = null;
  nativeFocus = null;
  subscribers.forEach((callback) => callback());
}

export function subscribeNativeSidebarFocus(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}
