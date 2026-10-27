import { describe, expect, it, vi } from 'vitest';
import { NativeSidebarBuilder, isCurrentSidebarAction } from './nativeSidebar';

describe('native sidebar action isolation', () => {
  const current = { windowLabel: 'main', mountId: 'mount-1', revision: 4 };
  const event = { ...current, actionId: 'project.open' };
  const actions = new Map([['project.open', vi.fn()]]);

  it('accepts a current registered action', () => {
    expect(isCurrentSidebarAction(event, current, actions)).toBe(true);
  });

  it.each([
    { windowLabel: 'other-window' },
    { mountId: 'previous-mount' },
    { revision: 3 },
    { actionId: 'removed-action' },
  ])('ignores stale or foreign actions: %j', (change) => {
    expect(isCurrentSidebarAction({ ...event, ...change }, current, actions)).toBe(false);
  });

  it('keeps disabled actions out of dispatch', () => {
    const builder = new NativeSidebarBuilder();
    expect(builder.action('close', 'Close', undefined).enabled).toBe(false);
    expect(builder.actions.has('close')).toBe(false);
  });

  it('rejects accidentally duplicated action identifiers', () => {
    const builder = new NativeSidebarBuilder();
    builder.action('open', 'Open', vi.fn());
    expect(() => builder.action('open', 'Other', vi.fn())).toThrow('Duplicate sidebar action');
  });
});
