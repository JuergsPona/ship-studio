/**
 * Starts an agent tab when remote access asks for one.
 *
 * The remote server (src-tauri/src/remote_access) can't create a tab itself —
 * tabs belong to the workspace's terminal model — so `start_agent` emits
 * `remote-start-agent` to the window that owns the project (or the main
 * window) and then waits for a new agent PTY to appear. This hook is the
 * other half: open the project if it isn't the current one, wait for its
 * terminal system to be seeded, and add a tab whose CLI *starts with* the
 * prompt — the same spawn-not-paste delivery the Inbox uses, for the same
 * reason (see useWorkflowHandoff).
 *
 * Nobody is at the computer to see a failure here, so a failure is simply
 * not delivering: the Rust side times out and tells the remote assistant,
 * which is the only place anyone is looking.
 *
 * @module hooks/useRemoteAgentStart
 */

import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { logger } from '../lib/logger';
import { basename } from '../lib/paths';
import type { Project } from '../lib/project';

/** Matches the Rust side's own wait, so neither outlives the other. */
const GIVE_UP_MS = 60_000;

export interface RemoteStartRequest {
  projectPath: string;
  prompt: string;
}

interface Params {
  currentProjectPath: string | null;
  /** True while the workspace (not the dashboard) is showing. */
  inWorkspace: boolean;
  terminalTabCount: number;
  maxTerminalTabs: number;
  addTerminalTab: (
    agentId?: string,
    options?: { initialPrompt?: string; projectPath?: string }
  ) => void;
  openProject: (project: Project) => void | Promise<void>;
}

/**
 * Decide what to do with a pending request given the workspace's state.
 * Pure so the rules can be tested without mounting the app.
 */
export function remoteStartStep(
  pending: (RemoteStartRequest & { receivedAt: number }) | null,
  state: Pick<
    Params,
    'currentProjectPath' | 'inWorkspace' | 'terminalTabCount' | 'maxTerminalTabs'
  >,
  now: number
): 'idle' | 'wait' | 'deliver' | 'no_room' | 'expired' {
  if (!pending) return 'idle';
  if (now - pending.receivedAt > GIVE_UP_MS) return 'expired';
  const ready =
    state.inWorkspace &&
    state.currentProjectPath === pending.projectPath &&
    state.terminalTabCount > 0;
  if (!ready) return 'wait';
  if (state.maxTerminalTabs > 0 && state.terminalTabCount >= state.maxTerminalTabs) {
    return 'no_room';
  }
  return 'deliver';
}

export function useRemoteAgentStart({
  currentProjectPath,
  inWorkspace,
  terminalTabCount,
  maxTerminalTabs,
  addTerminalTab,
  openProject,
}: Params): void {
  const [pending, setPending] = useState<(RemoteStartRequest & { receivedAt: number }) | null>(
    null
  );

  useEffect(() => {
    const unlisten = listen<RemoteStartRequest>('remote-start-agent', (event) => {
      const { projectPath, prompt } = event.payload;
      logger.info('[Remote] Asked to start an agent', { projectPath });
      setPending({ projectPath, prompt, receivedAt: Date.now() });
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Open the project once per request; re-opening on every render would fight
  // the user (or another request) for the window.
  const pendingPath = pending?.projectPath ?? null;
  const needsOpen = pendingPath !== null && (!inWorkspace || currentProjectPath !== pendingPath);
  useEffect(() => {
    if (!needsOpen || !pendingPath) return;
    void Promise.resolve(
      openProject({ name: basename(pendingPath), path: pendingPath, thumbnail: null })
    ).catch((err: unknown) => {
      logger.warn('[Remote] Could not open the project for a remote agent', {
        projectPath: pendingPath,
        error: String(err),
      });
      setPending(null);
    });
    // Only when the request changes — not on every render while it waits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.receivedAt]);

  useEffect(() => {
    if (!pending) return;
    const step = remoteStartStep(
      pending,
      { currentProjectPath, inWorkspace, terminalTabCount, maxTerminalTabs },
      Date.now()
    );
    if (step === 'deliver') {
      addTerminalTab(undefined, {
        initialPrompt: pending.prompt,
        projectPath: pending.projectPath,
      });
      setPending(null);
    } else if (step === 'no_room' || step === 'expired') {
      logger.warn('[Remote] Did not start a remote agent', {
        projectPath: pending.projectPath,
        reason: step,
      });
      setPending(null);
    }
  }, [pending, currentProjectPath, inWorkspace, terminalTabCount, maxTerminalTabs, addTerminalTab]);

  // A request that is waiting needs something to re-check the clock even if
  // nothing else re-renders, or it would never expire.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(
      () => setPending((p) => (p && p.receivedAt === pending.receivedAt ? null : p)),
      GIVE_UP_MS + 1_000
    );
    return () => window.clearTimeout(timer);
  }, [pending]);
}
