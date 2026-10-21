import { describe, expect, it } from 'vitest';
import { remoteStartStep } from './useRemoteAgentStart';

const request = { projectPath: '/p', prompt: 'fix the header', receivedAt: 1_000 };
const ready = {
  currentProjectPath: '/p',
  inWorkspace: true,
  terminalTabCount: 1,
  maxTerminalTabs: 6,
};

describe('remoteStartStep', () => {
  it('does nothing without a request', () => {
    expect(remoteStartStep(null, ready, 2_000)).toBe('idle');
  });

  it('delivers once the project is open in the workspace with its tabs seeded', () => {
    expect(remoteStartStep(request, ready, 2_000)).toBe('deliver');
  });

  it('waits while another project is showing, the dashboard is up, or tabs are not seeded', () => {
    expect(remoteStartStep(request, { ...ready, currentProjectPath: '/other' }, 2_000)).toBe(
      'wait'
    );
    expect(remoteStartStep(request, { ...ready, inWorkspace: false }, 2_000)).toBe('wait');
    expect(remoteStartStep(request, { ...ready, terminalTabCount: 0 }, 2_000)).toBe('wait');
  });

  it('gives up rather than ambush a terminal later', () => {
    expect(remoteStartStep(request, { ...ready, inWorkspace: false }, 1_000 + 61_000)).toBe(
      'expired'
    );
  });

  it('refuses when the project is out of tab room', () => {
    expect(remoteStartStep(request, { ...ready, terminalTabCount: 6 }, 2_000)).toBe('no_room');
  });
});
