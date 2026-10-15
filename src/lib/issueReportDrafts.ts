import type { BugReportDraft, FeatureRequestDraft, IssueKind } from './issueReports';

export type IssueEvidenceChoice = 'upload' | 'links' | 'none' | null;

export type IssueReportDraftSnapshot =
  | {
      kind: 'bug';
      draft: BugReportDraft;
      evidenceChoice: IssueEvidenceChoice;
      editedBody?: string | null;
      updatedAt: string;
    }
  | {
      kind: 'feature';
      draft: FeatureRequestDraft;
      evidenceChoice: IssueEvidenceChoice;
      editedBody?: string | null;
      updatedAt: string;
    };

export type IssueReportDraftRead =
  | { status: 'empty' }
  | { status: 'saved'; snapshot: IssueReportDraftSnapshot }
  | { status: 'invalid' }
  | { status: 'unavailable'; message: string };

export type IssueReportDraftWrite = { ok: true } | { ok: false; message: string };

const STORAGE_PREFIX = 'shipstudio.issueReportDraft.v1.';

export function readIssueReportDraft(kind: IssueKind): IssueReportDraftRead {
  let raw: string | null | undefined;
  try {
    raw = storage()?.getItem(storageKey(kind));
  } catch {
    return { status: 'unavailable', message: storageUnavailableMessage };
  }
  if (raw === undefined) return { status: 'unavailable', message: storageUnavailableMessage };
  if (raw === null) return { status: 'empty' };
  if (raw.length > 262_144) return { status: 'invalid' };
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSnapshot(parsed, kind) ? { status: 'saved', snapshot: parsed } : { status: 'invalid' };
  } catch {
    return { status: 'invalid' };
  }
}

export function saveIssueReportDraft(
  kind: 'bug',
  draft: BugReportDraft,
  evidenceChoice: IssueEvidenceChoice,
  editedBody?: string | null
): IssueReportDraftWrite;
export function saveIssueReportDraft(
  kind: 'feature',
  draft: FeatureRequestDraft,
  evidenceChoice: IssueEvidenceChoice,
  editedBody?: string | null
): IssueReportDraftWrite;
export function saveIssueReportDraft(
  kind: IssueKind,
  draft: BugReportDraft | FeatureRequestDraft,
  evidenceChoice: IssueEvidenceChoice,
  editedBody: string | null = null
): IssueReportDraftWrite {
  try {
    const target = storage();
    if (!target) return { ok: false, message: storageUnavailableMessage };
    const snapshot = {
      schemaVersion: 1,
      kind,
      draft,
      evidenceChoice,
      editedBody,
      updatedAt: new Date().toISOString(),
    };
    target.setItem(storageKey(kind), JSON.stringify(snapshot));
    return { ok: true };
  } catch {
    return { ok: false, message: storageUnavailableMessage };
  }
}

export function clearIssueReportDraft(kind: IssueKind): IssueReportDraftWrite {
  try {
    const target = storage();
    if (!target) return { ok: false, message: storageUnavailableMessage };
    target.removeItem(storageKey(kind));
    return { ok: true };
  } catch {
    return { ok: false, message: storageUnavailableMessage };
  }
}

const storageUnavailableMessage =
  'This device could not save the report draft. Check browser storage settings and try again.';

function storage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}

function storageKey(kind: IssueKind): string {
  return `${STORAGE_PREFIX}${kind}`;
}

function isSnapshot(value: unknown, kind: IssueKind): value is IssueReportDraftSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.kind !== kind) return false;
  if (
    value.evidenceChoice !== null &&
    value.evidenceChoice !== 'upload' &&
    value.evidenceChoice !== 'links' &&
    value.evidenceChoice !== 'none'
  ) {
    return false;
  }
  if (
    value.editedBody !== undefined &&
    value.editedBody !== null &&
    (typeof value.editedBody !== 'string' || value.editedBody.length > 65_536)
  ) {
    return false;
  }
  if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))
    return false;
  if (!isRecord(value.draft)) return false;
  const draftRecord = value.draft;
  return (kind === 'bug' ? bugDraftFields : featureDraftFields).every((field) => {
    const fieldValue = draftRecord[String(field)];
    return typeof fieldValue === 'string' && fieldValue.length <= 100_000;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const bugDraftFields: (keyof BugReportDraft)[] = [
  'title',
  'whatHappened',
  'whatExpected',
  'reproductionSteps',
  'appVersion',
  'operatingSystem',
  'architecture',
  'installMethod',
  'agent',
  'logs',
  'screenshots',
  'anythingElse',
];

const featureDraftFields: (keyof FeatureRequestDraft)[] = [
  'title',
  'problem',
  'proposedSolution',
  'alternatives',
  'whoBenefits',
  'anythingElse',
  'evidenceLinks',
];
