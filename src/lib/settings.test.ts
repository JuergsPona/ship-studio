import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  COMPACT_WORKSPACE_TOOLBAR_CHANGED_EVENT,
  AUTO_START_PROJECT_SERVERS_LOCAL_CHANGED_EVENT,
  getAutoStartProjectServers,
  setAutoStartProjectServers,
  DASHBOARD_VISIBILITY_CHANGED_EVENT,
  ELEMENT_BREADCRUMB_ENABLED_CHANGED_EVENT,
  KEEP_DEV_SERVERS_RUNNING_LOCAL_CHANGED_EVENT,
  getAppIcon,
  getKeepDevServersRunning,
  setCalendarHidden,
  setCompactWorkspaceToolbarEnabled,
  setDashboardHeaderHidden,
  setElementBreadcrumbEnabled,
  setKeepDevServersRunning,
  setAppIcon,
  setSlackCtaHidden,
} from './settings';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('automatic project-server startup', () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it('defaults off when reading the preference fails', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('unavailable'));
    await expect(getAutoStartProjectServers()).resolves.toBe(false);
  });

  it.each([true, false])('reads saved %s', async (enabled) => {
    vi.mocked(invoke).mockResolvedValueOnce(enabled);
    await expect(getAutoStartProjectServers()).resolves.toBe(enabled);
    expect(invoke).toHaveBeenCalledWith('get_auto_start_project_servers');
  });

  it('broadcasts only successful saves and propagates save failures', async () => {
    const listener = vi.fn();
    window.addEventListener(AUTO_START_PROJECT_SERVERS_LOCAL_CHANGED_EVENT, listener);
    try {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('disk full'));
      await expect(setAutoStartProjectServers(true)).rejects.toThrow('disk full');
      expect(listener).not.toHaveBeenCalled();
      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      await setAutoStartProjectServers(true);
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]?.[0]).toMatchObject({ detail: true });
      expect(invoke).toHaveBeenLastCalledWith('set_auto_start_project_servers', { enabled: true });
    } finally {
      window.removeEventListener(AUTO_START_PROJECT_SERVERS_LOCAL_CHANGED_EVENT, listener);
    }
  });
});

describe('dashboard visibility settings', () => {
  const invokeMock = vi.mocked(invoke);

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it.each([
    ['calendar', 'set_calendar_hidden', setCalendarHidden],
    ['slackCta', 'set_slack_cta_hidden', setSlackCtaHidden],
    ['dashboardHeader', 'set_dashboard_header_hidden', setDashboardHeaderHidden],
  ] as const)('notifies the home screen when %s is persisted', async (key, command, setter) => {
    const listener = vi.fn();
    window.addEventListener(DASHBOARD_VISIBILITY_CHANGED_EVENT, listener);

    await setter(true);

    expect(invokeMock).toHaveBeenCalledWith(command, { hidden: true });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      detail: { key, hidden: true },
    });

    window.removeEventListener(DASHBOARD_VISIBILITY_CHANGED_EVENT, listener);
  });
});

describe('workspace toolbar setting', () => {
  const invokeMock = vi.mocked(invoke);

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it('persists and broadcasts the compact workspace toolbar preference', async () => {
    const listener = vi.fn();
    window.addEventListener(COMPACT_WORKSPACE_TOOLBAR_CHANGED_EVENT, listener);

    await setCompactWorkspaceToolbarEnabled(true);

    expect(invokeMock).toHaveBeenCalledWith('set_compact_workspace_toolbar_enabled', {
      enabled: true,
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ detail: true });

    window.removeEventListener(COMPACT_WORKSPACE_TOOLBAR_CHANGED_EVENT, listener);
  });
});

describe('element breadcrumb setting', () => {
  const invokeMock = vi.mocked(invoke);

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it('persists and broadcasts the element breadcrumb preference', async () => {
    const listener = vi.fn();
    window.addEventListener(ELEMENT_BREADCRUMB_ENABLED_CHANGED_EVENT, listener);

    await setElementBreadcrumbEnabled(false);

    expect(invokeMock).toHaveBeenCalledWith('set_element_breadcrumb_enabled', { enabled: false });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ detail: false });

    window.removeEventListener(ELEMENT_BREADCRUMB_ENABLED_CHANGED_EVENT, listener);
  });
});

describe('app icon setting', () => {
  const invokeMock = vi.mocked(invoke);

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it('reads a valid persisted icon', async () => {
    invokeMock.mockResolvedValueOnce('dark');

    await expect(getAppIcon()).resolves.toBe('dark');
    expect(invokeMock).toHaveBeenCalledWith('get_app_icon');
  });

  it('falls back to the brand icon for an unknown persisted value', async () => {
    invokeMock.mockResolvedValueOnce('unknown');

    await expect(getAppIcon()).resolves.toBe('brand');
  });

  it('persists the selected icon', async () => {
    await setAppIcon('light');

    expect(invokeMock).toHaveBeenCalledWith('set_app_icon', { icon: 'light' });
  });
});

describe('background dev-server setting', () => {
  const invokeMock = vi.mocked(invoke);

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it('defaults to enabled when the preference cannot be read', async () => {
    invokeMock.mockRejectedValueOnce(new Error('unavailable'));

    await expect(getKeepDevServersRunning()).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('get_keep_dev_servers_running');
  });

  it('persists the preference and notifies this window', async () => {
    const listener = vi.fn();
    window.addEventListener(KEEP_DEV_SERVERS_RUNNING_LOCAL_CHANGED_EVENT, listener);

    await setKeepDevServersRunning(true);

    expect(invokeMock).toHaveBeenCalledWith('set_keep_dev_servers_running', { enabled: true });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ detail: true });

    window.removeEventListener(KEEP_DEV_SERVERS_RUNNING_LOCAL_CHANGED_EVENT, listener);
  });
});
