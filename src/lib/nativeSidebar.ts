import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface NativeSidebarActionRef {
  id: string;
  label: string;
  enabled: boolean;
  symbol?: string;
  selected?: boolean;
}

export interface NativeSidebarNode {
  id: string;
  title: string;
  detail?: string;
  symbol?: string;
  tone?: 'normal' | 'secondary' | 'success' | 'warning' | 'error';
  selected?: boolean;
  busy?: boolean;
  expanded?: boolean;
  action?: NativeSidebarActionRef;
  toggle?: NativeSidebarActionRef;
  rename?: NativeSidebarActionRef;
  buttons?: NativeSidebarActionRef[];
  menu?: NativeSidebarActionRef[];
  children?: NativeSidebarNode[];
  dragGroup?: 'pinned' | 'active';
  imageUrl?: string;
  slider?: { action: NativeSidebarActionRef; value: number; min: number; max: number };
}

export interface NativeSidebarPart {
  placement: 'top' | 'footer' | 'row';
  rowId?: string;
  nodes: NativeSidebarNode[];
}

export type NativeSidebarHandler = (value?: string) => void | Promise<unknown>;

/** Renderer-neutral presentation and action registry; functions never cross IPC. */
export class NativeSidebarBuilder {
  readonly actions = new Map<string, NativeSidebarHandler>();
  private readonly ids = new Set<string>();

  action(
    id: string,
    label: string,
    handler: NativeSidebarHandler | undefined,
    symbol?: string
  ): NativeSidebarActionRef {
    if (this.ids.has(id)) throw new Error(`Duplicate sidebar action: ${id}`);
    this.ids.add(id);
    if (handler) this.actions.set(id, handler);
    return { id, label, enabled: handler !== undefined, symbol };
  }
}

export interface NativeSidebarActionEvent {
  windowLabel: string;
  mountId: string;
  revision: number;
  actionId: string;
  value?: string;
}

export interface NativeSidebarPresentation {
  compact?: boolean;
  top: NativeSidebarNode[];
  body: NativeSidebarNode[];
  footer: NativeSidebarNode[];
  moveAction?: NativeSidebarActionRef;
}

export interface NativeSidebarSnapshot extends NativeSidebarPresentation {
  mountId: string;
  revision: number;
  frame: { x: number; y: number; width: number; height: number };
  behindWebview: boolean;
}

export function isCurrentSidebarAction(
  event: NativeSidebarActionEvent,
  current: { windowLabel: string; mountId: string; revision: number },
  actions: ReadonlyMap<string, NativeSidebarHandler>
): boolean {
  return (
    event.windowLabel === current.windowLabel &&
    event.mountId === current.mountId &&
    event.revision === current.revision &&
    actions.has(event.actionId)
  );
}

// One queue per webview: an old mount must finish before a newer mount updates.
let sidebarQueue: Promise<void> = Promise.resolve();
function enqueueSidebar<T>(operation: () => Promise<T>): Promise<T> {
  const pending = sidebarQueue.then(operation);
  sidebarQueue = pending.then(
    () => {},
    () => {}
  );
  return pending;
}

export function updateNativeSidebar(snapshot: NativeSidebarSnapshot): Promise<boolean> {
  return enqueueSidebar(() => invoke<boolean>('update_native_sidebar', { snapshot }));
}

export function removeNativeSidebar(mountId: string): Promise<void> {
  return enqueueSidebar(() => invoke<void>('remove_native_sidebar', { mountId }));
}

export function readNativeSidebarWindowFocus(): Promise<boolean> {
  return getCurrentWindow().isFocused();
}

export function listenNativeSidebarWindowFocus(callback: (focused: boolean) => void) {
  return getCurrentWindow().onFocusChanged(({ payload }) => callback(payload));
}
