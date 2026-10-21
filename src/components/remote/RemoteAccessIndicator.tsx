/**
 * The sidebar's reminder that remote access is on — and the first place a
 * problem shows up.
 *
 * Renders nothing while remote access is off. While it's on, one quiet row:
 * a dot and a line saying who last connected. The row turns amber for the
 * one thing that will end remote access on its own — running on battery —
 * and red if the server isn't running at all, because those are exactly
 * what the user needs to see before they walk away.
 *
 * Polls the cheap brief (no Tailscale calls), since every window shows it.
 *
 * @module components/remote/RemoteAccessIndicator
 */

import { useState } from 'react';
import { Button } from '../primitives/Button';
import { useOpenModal } from '../../contexts/ModalContext';
import { useAsyncState } from '../../hooks/useAsyncState';
import { usePolling } from '../../hooks/usePolling';
import { agoText, getRemoteAccessBrief, type RemoteAccessBrief } from '../../lib/remoteAccess';

type Tone = 'ok' | 'warn' | 'down';

export function indicatorState(
  brief: RemoteAccessBrief,
  now: number
): { tone: Tone; line: string; detail: string } | null {
  if (!brief.enabled) return null;
  if (!brief.serverRunning) {
    return {
      tone: 'down',
      line: 'Remote access stopped',
      detail: 'Grok Bot can’t reach this computer. Open Remote access to restart it.',
    };
  }
  if (brief.power.onAc === false) {
    const pct = brief.power.batteryPercent;
    return {
      tone: 'warn',
      line: pct !== null ? `Remote on · battery ${pct}%` : 'Remote on · on battery',
      detail: 'Plug in — remote access stops when the battery runs out.',
    };
  }
  const last = brief.activity.lastRequestMs;
  return {
    tone: 'ok',
    line:
      last !== null
        ? `Remote on · ${brief.activity.lastClient ?? 'used'} ${agoText(last, now)}`
        : 'Remote on',
    detail: 'Grok Bot can reach this computer while it stays on, awake and online.',
  };
}

export function RemoteAccessIndicator({ isSidebarHidden }: { isSidebarHidden: boolean }) {
  const openModal = useOpenModal();
  const brief = useAsyncState<RemoteAccessBrief>(getRemoteAccessBrief, { immediate: true });
  const [now, setNow] = useState(() => Date.now());
  const { execute } = brief;
  usePolling(
    async () => {
      setNow(Date.now());
      return execute();
    },
    { intervalMs: 20_000, name: 'remote-access-indicator' }
  );

  const state = brief.data ? indicatorState(brief.data, now) : null;
  if (!state) return null;

  return (
    <Button
      variant="ghost"
      width="fill"
      className={`remote-indicator remote-indicator--${state.tone}${
        isSidebarHidden ? ' remote-indicator--compact' : ''
      }`}
      onClick={() => openModal('remoteAccess')}
      title={state.detail}
      aria-label={`${state.line}. ${state.detail}`}
      data-testid="remote-indicator"
    >
      <span className="remote-indicator__dot" aria-hidden />
      {!isSidebarHidden && <span className="remote-indicator__line">{state.line}</span>}
    </Button>
  );
}
