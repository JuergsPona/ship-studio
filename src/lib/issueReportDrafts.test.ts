import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BugReportDraft, FeatureRequestDraft } from './issueReports';
import {
  clearIssueReportDraft,
  readIssueReportDraft,
  saveIssueReportDraft,
} from './issueReportDrafts';

const bugDraft: BugReportDraft = {
  title: '[Bug] Toolbar stops updating',
  whatHappened: 'The toolbar stops updating after switching projects.',
  whatExpected: 'The toolbar should reflect the active project.',
  reproductionSteps: 'Open two projects\nSwitch to the second project',
  appVersion: '1.4.0',
  operatingSystem: 'macOS',
  architecture: 'arm64',
  installMethod: 'dmg',
  agent: 'Codex',
  logs: '',
  screenshots: '',
  anythingElse: '',
};

const featureDraft: FeatureRequestDraft = {
  title: '[Feature] Add project shortcuts',
  problem: 'Switching projects takes too many clicks.',
  proposedSolution: 'Add configurable keyboard shortcuts.',
  alternatives: '',
  whoBenefits: 'People with many open projects.',
  anythingElse: '',
  evidenceLinks: 'https://example.test/mockup.png',
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('issue report draft storage', () => {
  it('reads an empty result, then saves and restores independent per-kind drafts', () => {
    expect(readIssueReportDraft('bug')).toEqual({ status: 'empty' });
    expect(readIssueReportDraft('feature')).toEqual({ status: 'empty' });

    expect(saveIssueReportDraft('bug', bugDraft, 'none')).toEqual({ ok: true });
    expect(saveIssueReportDraft('feature', featureDraft, 'links')).toEqual({ ok: true });

    expect(readIssueReportDraft('bug')).toMatchObject({
      status: 'saved',
      snapshot: { kind: 'bug', draft: bugDraft, evidenceChoice: 'none' },
    });
    expect(readIssueReportDraft('feature')).toMatchObject({
      status: 'saved',
      snapshot: { kind: 'feature', draft: featureDraft, evidenceChoice: 'links' },
    });
  });

  it('stores custom report bodies per kind and accepts legacy snapshots without one', () => {
    saveIssueReportDraft('bug', bugDraft, 'none', 'Custom bug Markdown');
    saveIssueReportDraft('feature', featureDraft, 'links', 'Custom feature Markdown');

    expect(readIssueReportDraft('bug')).toMatchObject({
      status: 'saved',
      snapshot: { kind: 'bug', editedBody: 'Custom bug Markdown' },
    });
    expect(readIssueReportDraft('feature')).toMatchObject({
      status: 'saved',
      snapshot: { kind: 'feature', editedBody: 'Custom feature Markdown' },
    });

    localStorage.setItem(
      'shipstudio.issueReportDraft.v1.bug',
      JSON.stringify({
        schemaVersion: 1,
        kind: 'bug',
        draft: bugDraft,
        evidenceChoice: 'none',
        updatedAt: new Date().toISOString(),
      })
    );
    const legacySnapshot = readIssueReportDraft('bug');
    expect(legacySnapshot).toMatchObject({
      status: 'saved',
      snapshot: { kind: 'bug', draft: bugDraft, evidenceChoice: 'none' },
    });
    if (legacySnapshot.status === 'saved') {
      expect('editedBody' in legacySnapshot.snapshot).toBe(false);
    }
  });

  it('clears only the selected issue kind', () => {
    saveIssueReportDraft('bug', bugDraft, 'upload');
    saveIssueReportDraft('feature', featureDraft, null);

    expect(clearIssueReportDraft('bug')).toEqual({ ok: true });
    expect(readIssueReportDraft('bug')).toEqual({ status: 'empty' });
    expect(readIssueReportDraft('feature')).toMatchObject({ status: 'saved' });
  });

  it('rejects corrupt, mismatched, and older snapshots missing evidence links', () => {
    localStorage.setItem('shipstudio.issueReportDraft.v1.bug', '{bad json');
    expect(readIssueReportDraft('bug')).toEqual({ status: 'invalid' });

    localStorage.setItem(
      'shipstudio.issueReportDraft.v1.bug',
      JSON.stringify({
        schemaVersion: 1,
        kind: 'feature',
        draft: featureDraft,
        evidenceChoice: 'links',
        updatedAt: new Date().toISOString(),
      })
    );
    expect(readIssueReportDraft('bug')).toEqual({ status: 'invalid' });

    const { evidenceLinks: _evidenceLinks, ...oldFeatureDraft } = featureDraft;
    localStorage.setItem(
      'shipstudio.issueReportDraft.v1.feature',
      JSON.stringify({
        schemaVersion: 1,
        kind: 'feature',
        draft: oldFeatureDraft,
        evidenceChoice: null,
        updatedAt: new Date().toISOString(),
      })
    );
    expect(readIssueReportDraft('feature')).toEqual({ status: 'invalid' });
  });

  it('reports unavailable storage for reads, saves, and clears', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage quota exceeded');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage denied');
    });

    expect(readIssueReportDraft('bug')).toMatchObject({ status: 'unavailable' });
    expect(saveIssueReportDraft('bug', bugDraft, null)).toMatchObject({ ok: false });
    expect(clearIssueReportDraft('bug')).toMatchObject({ ok: false });
  });
});
