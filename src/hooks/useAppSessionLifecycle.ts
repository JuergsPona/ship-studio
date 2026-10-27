import { useEffect } from 'react';
import { sessionRegistry } from '../lib/sessionRegistry';
import type { TerminalSessionView } from './useTerminalManagement';

/** Keep sidebar session data current and stop servers when the window closes. */
export function useAppSessionLifecycle(
  sessions: readonly TerminalSessionView[],
  stopAllServers: () => Promise<void>
): void {
  useEffect(() => {
    for (const session of sessions) {
      const activeIndex = Math.max(
        0,
        session.tabs.findIndex((tab) => tab.id === session.activeTabId)
      );
      sessionRegistry.setTerminalTabs(
        session.projectPath,
        session.tabs.map((tab) => ({ id: tab.id, agentId: tab.agentId, sessionId: tab.sessionId })),
        activeIndex
      );
    }
  }, [sessions]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        void stopAllServers();
      } catch {
        // Ignore errors during cleanup, matching the previous window behavior.
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [stopAllServers]);
}
