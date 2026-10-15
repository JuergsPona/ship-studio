/**
 * Read the backend's recent confirmed automatic-report deliveries.
 *
 * The backend keeps delivery receipts separate from throttle attempts. A
 * receipt means the endpoint returned a successful HTTP response and its
 * documented `{ ok: true }` acceptance marker; it does not mean an issue was
 * filed or an investigation finished.
 */

import { invoke } from '@tauri-apps/api/core';

export type AutomaticReportKind = 'crash' | 'error';

export type AutomaticReportStatusReason =
  | 'development_build'
  | 'consent_disabled'
  | 'missing_secret';

export interface AutomaticReportReceipt {
  timestamp: string;
  kind: AutomaticReportKind;
  source: string;
  summary: string;
  /** Present only when the endpoint explicitly returned a validated issue URL. */
  issueUrl?: string;
}

export interface AutomaticReportStatus {
  /** Build and consent gate. Check `configured` and `reason` before implying delivery is available. */
  enabled: boolean;
  configured: boolean;
  reason: AutomaticReportStatusReason | null;
  receipts: AutomaticReportReceipt[];
}

export function getAutomaticReportStatus(): Promise<AutomaticReportStatus> {
  return invoke<AutomaticReportStatus>('get_automatic_report_status');
}
