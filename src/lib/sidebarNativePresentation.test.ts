import { describe, expect, it, vi } from 'vitest';
import { NativeSidebarBuilder } from './nativeSidebar';
import { nativeItem, nativeSection } from './sidebarNativePresentation';

describe('shared native sidebar presentation', () => {
  it('routes selection and rename to the shared handlers', async () => {
    const select = vi.fn();
    const rename = vi.fn();
    const builder = new NativeSidebarBuilder();
    const node = nativeItem(builder, 'project:one:agents:one', {
      key: 'one',
      label: 'Agent',
      dotState: 'waiting',
      onSelect: select,
      onRename: rename,
    });
    await builder.actions.get(node.action?.id ?? '')?.();
    await builder.actions.get(node.rename?.id ?? '')?.('New name');
    expect(select).toHaveBeenCalledOnce();
    expect(rename).toHaveBeenCalledWith('New name');
    expect(node.detail).toBe('Waiting');
    expect(node.tone).toBe('warning');
  });

  it('does not offer an action while its operation is busy', () => {
    const builder = new NativeSidebarBuilder();
    const node = nativeItem(builder, 'server', {
      key: 'server',
      label: 'Server',
      dotState: 'server-starting',
      onAction: vi.fn(),
      actionBusy: true,
      actionLabel: 'Restart',
    });
    expect(node.busy).toBe(true);
    expect(node.buttons?.[0].enabled).toBe(false);
    expect(builder.actions.has('server:action')).toBe(false);
  });

  it('keeps item IDs unique across project families with the same tab IDs', () => {
    const builder = new NativeSidebarBuilder();
    const item = { key: 'one', label: 'Terminal', dotState: 'idle', onSelect: vi.fn() };
    const first = nativeSection(
      builder,
      'project:first:terminals',
      'Terminals',
      [item],
      '',
      false,
      undefined
    );
    const second = nativeSection(
      builder,
      'project:second:terminals',
      'Terminals',
      [item],
      '',
      false,
      undefined
    );
    expect(first.children?.[0].id).not.toBe(second.children?.[0].id);
  });
});
