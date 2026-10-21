import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { getAutomaticReportStatus } from './autoReports';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('getAutomaticReportStatus', () => {
  afterEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it('returns only the backend-provided confirmed receipt status', async () => {
    const status = {
      enabled: true,
      configured: true,
      reason: null,
      receipts: [
        {
          timestamp: '2026-10-12T10:15:00Z',
          kind: 'crash' as const,
          source: 'panic',
          summary: 'panic: unexpected state',
          issueUrl: 'https://github.com/ship-studio/ship-studio/issues/42',
        },
      ],
    };
    vi.mocked(invoke).mockResolvedValue(status);

    await expect(getAutomaticReportStatus()).resolves.toEqual(status);
    expect(invoke).toHaveBeenCalledWith('get_automatic_report_status');
  });

  it('preserves backend unavailability reasons without inventing receipt data', async () => {
    const status = {
      enabled: false,
      configured: false,
      reason: 'missing_secret' as const,
      receipts: [],
    };
    vi.mocked(invoke).mockResolvedValue(status);

    await expect(getAutomaticReportStatus()).resolves.toEqual(status);
  });
});
