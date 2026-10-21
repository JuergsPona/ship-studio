import { useEffect, useRef } from 'react';
import type { AppView } from '../lib/types';

interface Params {
  /** Experimental preference; null while the saved value is still loading. */
  keepDevServersRunning: boolean | null;
  view: AppView;
  workspaceTab: string;
  isPreviewHidden: boolean;
  currentProjectPath: string | null;
  serverLifecycleVersion: number;
  stopAllServersExcept: (projectPathToKeep: string | null) => Promise<void>;
  startCurrentDevServer: () => Promise<void>;
}

/**
 * Applies the "Keep dev servers running" preference for one window.
 *
 * When it is off, every project except the one visible in Preview is
 * stopped; the same rule covers project switches, Code/Branches views, focus
 * mode, and the home screen. The loading (null) state prevents a slow
 * settings read from stopping a server before the saved preference is known.
 *
 * Leaving Preview therefore stops this project's server, and only the Preview
 * tab button and its shortcut restart it. Every other way back (un-hiding
 * focus mode, comments, dev-server logs) would land on a Preview with no
 * server, so the server is started on the hidden→visible transition for the
 * same project. Project switches start their own server, and an explicit
 * Stop while Preview stays visible is left alone.
 */
export function useDevServerRetention({
  keepDevServersRunning,
  view,
  workspaceTab,
  isPreviewHidden,
  currentProjectPath,
  serverLifecycleVersion,
  stopAllServersExcept,
  startCurrentDevServer,
}: Params): void {
  const visiblePreviewPath =
    view === 'workspace' && workspaceTab === 'preview' && !isPreviewHidden
      ? currentProjectPath
      : null;

  useEffect(() => {
    if (keepDevServersRunning === null || keepDevServersRunning) return;
    void stopAllServersExcept(visiblePreviewPath);
  }, [keepDevServersRunning, serverLifecycleVersion, stopAllServersExcept, visiblePreviewPath]);

  // handleStartDevServer is a fresh closure every render; read the latest one
  // without making it a dependency of the transition effect.
  const startRef = useRef(startCurrentDevServer);
  useEffect(() => {
    startRef.current = startCurrentDevServer;
  });
  const previousRef = useRef({ visiblePath: visiblePreviewPath, currentProjectPath, view });
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { visiblePath: visiblePreviewPath, currentProjectPath, view };
    if (keepDevServersRunning !== false || visiblePreviewPath === null) return;
    if (previous.visiblePath !== null || previous.view !== 'workspace') return;
    if (previous.currentProjectPath !== visiblePreviewPath) return;
    void startRef.current();
  }, [keepDevServersRunning, visiblePreviewPath, currentProjectPath, view]);
}
