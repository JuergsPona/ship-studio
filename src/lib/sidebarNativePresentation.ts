import { NativeSidebarBuilder, type NativeSidebarNode } from './nativeSidebar';

export interface SidebarPresentationItem {
  key: string;
  label: string;
  dotState: string;
  meta?: string;
  isActive?: boolean;
  actionBusy?: boolean;
  actionLabel?: string;
  onSelect?: () => void;
  onClose?: () => void;
  onRename?: (name: string) => void;
  onAction?: () => void;
}

export function nativeItem(
  builder: NativeSidebarBuilder,
  id: string,
  item: SidebarPresentationItem
): NativeSidebarNode {
  const status = item.dotState;
  const statusLabel: Record<string, string> = {
    idle: 'Idle',
    active: 'Active',
    thinking: 'Working',
    waiting: 'Waiting',
    attention: 'Needs attention',
    error: 'Error',
    muted: 'Inactive',
    'server-starting': 'Starting',
    'server-ready': 'Running',
    'server-stopped': 'Stopped',
  };
  const label = statusLabel[status];
  return {
    id,
    title: item.label,
    detail:
      item.meta?.toLowerCase() === label?.toLowerCase()
        ? item.meta
        : [item.meta, label].filter(Boolean).join(' · '),
    selected: item.isActive,
    busy: status === 'thinking' || status === 'server-starting' || item.actionBusy,
    tone:
      status === 'error'
        ? 'error'
        : status === 'attention' || status === 'waiting'
          ? 'warning'
          : status === 'active' || status === 'server-ready'
            ? 'success'
            : 'normal',
    action: item.onSelect
      ? builder.action(
          `${id}:select`,
          [item.label, label].filter(Boolean).join('; '),
          item.onSelect
        )
      : undefined,
    rename: item.onRename
      ? builder.action(`${id}:rename`, 'Rename tab', (value) => item.onRename?.(value ?? ''))
      : undefined,
    buttons: [
      ...(item.onAction
        ? [
            builder.action(
              `${id}:action`,
              item.actionLabel ?? 'Action',
              item.actionBusy ? undefined : item.onAction,
              'arrow.clockwise'
            ),
          ]
        : []),
      ...(item.onClose
        ? [builder.action(`${id}:close`, `Close ${item.label}`, item.onClose, 'xmark')]
        : []),
    ],
  };
}

export function nativeSection(
  builder: NativeSidebarBuilder,
  id: string,
  title: string,
  items: readonly SidebarPresentationItem[],
  empty: string,
  collapsed: boolean,
  toggle: (() => void) | undefined,
  add?: () => void,
  addOptions?: { id: string; displayName: string; run: () => void }[]
): NativeSidebarNode {
  return {
    id,
    title,
    detail: String(items.length),
    tone: 'secondary',
    expanded: !collapsed,
    toggle: toggle
      ? builder.action(`${id}:toggle`, `Expand or collapse ${title}`, toggle)
      : undefined,
    buttons: add ? [builder.action(`${id}:add`, `Add ${title.toLowerCase()}`, add, 'plus')] : [],
    menu: addOptions?.map((option) =>
      builder.action(`${id}:add:${option.id}`, option.displayName, option.run)
    ),
    children: items.length
      ? items.map((item) => nativeItem(builder, `${id}:${item.key}`, item))
      : [{ id: `${id}:empty`, title: empty, tone: 'secondary' }],
  };
}
