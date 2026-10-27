import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { sessionRegistry } from '../lib/sessionRegistry';
import type { TerminalSessionView } from './useTerminalManagement';
import { useAppSessionLifecycle } from './useAppSessionLifecycle';

describe('app session lifecycle', () => {
  it('mirrors every session and cleans up the window listener', () => {
    const mirror = vi.spyOn(sessionRegistry, 'setTerminalTabs').mockImplementation(() => {});
    const stop = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const sessions: TerminalSessionView[] = [
      {
        projectPath: '/one',
        tabs: [
          { id: 1, agentId: 'terminal', sessionId: 'a' },
          { id: 2, agentId: 'codex', sessionId: 'b' },
        ],
        activeTabId: 2,
        sessionEpoch: 0,
        splitPaneTabIds: null,
        splitPaneSizes: null,
      },
      {
        projectPath: '/two',
        tabs: [{ id: 3, agentId: 'terminal', sessionId: 'c' }],
        activeTabId: 3,
        sessionEpoch: 0,
        splitPaneTabIds: null,
        splitPaneSizes: null,
      },
    ];
    const { unmount } = renderHook(() => useAppSessionLifecycle(sessions, stop));
    expect(mirror).toHaveBeenCalledWith('/one', sessions[0].tabs, 1);
    expect(mirror).toHaveBeenCalledWith('/two', sessions[1].tabs, 0);
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(stop).toHaveBeenCalledOnce();
    unmount();
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(stop).toHaveBeenCalledOnce();
    mirror.mockRestore();
  });
});
