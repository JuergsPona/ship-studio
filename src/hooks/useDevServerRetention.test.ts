import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDevServerRetention } from './useDevServerRetention';
import type { AppView } from '../lib/types';

type Props = {
  keepDevServersRunning: boolean | null;
  view: AppView;
  workspaceTab: string;
  isPreviewHidden: boolean;
  currentProjectPath: string | null;
};

function setup(initial: Props) {
  const stopAllServersExcept = vi.fn().mockResolvedValue(undefined);
  const startCurrentDevServer = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(
    (props: Props) =>
      useDevServerRetention({
        ...props,
        serverLifecycleVersion: 0,
        stopAllServersExcept,
        startCurrentDevServer,
      }),
    { initialProps: initial }
  );
  return { ...hook, stopAllServersExcept, startCurrentDevServer };
}

const previewA: Props = {
  keepDevServersRunning: false,
  view: 'workspace',
  workspaceTab: 'preview',
  isPreviewHidden: false,
  currentProjectPath: '/a',
};

describe('useDevServerRetention', () => {
  it('stops everything but the visible Preview project when retention is off', () => {
    const { rerender, stopAllServersExcept } = setup(previewA);
    expect(stopAllServersExcept).toHaveBeenLastCalledWith('/a');
    rerender({ ...previewA, workspaceTab: 'code' });
    expect(stopAllServersExcept).toHaveBeenLastCalledWith(null);
  });

  it('does nothing until the preference has loaded, and nothing when it is on', () => {
    const { rerender, stopAllServersExcept, startCurrentDevServer } = setup({
      ...previewA,
      keepDevServersRunning: null,
    });
    rerender({ ...previewA, keepDevServersRunning: true, workspaceTab: 'code' });
    rerender({ ...previewA, keepDevServersRunning: true });
    expect(stopAllServersExcept).not.toHaveBeenCalled();
    expect(startCurrentDevServer).not.toHaveBeenCalled();
  });

  it('restarts the server when Preview comes back into view for the same project', () => {
    const { rerender, startCurrentDevServer } = setup(previewA);
    rerender({ ...previewA, isPreviewHidden: true });
    expect(startCurrentDevServer).not.toHaveBeenCalled();
    rerender(previewA);
    expect(startCurrentDevServer).toHaveBeenCalledTimes(1);
  });

  it('leaves project switches and home-screen opens to their own start path', () => {
    const { rerender, startCurrentDevServer } = setup({ ...previewA, view: 'projects' });
    rerender(previewA);
    rerender({ ...previewA, workspaceTab: 'code' });
    rerender({ ...previewA, currentProjectPath: '/b' });
    expect(startCurrentDevServer).not.toHaveBeenCalled();
  });
});
