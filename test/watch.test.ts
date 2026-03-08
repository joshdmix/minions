import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTaskFromIssue, fetchLabeledIssues, removeLabel, addLabel, commentOnIssue } from '../src/watch.js';
import type { GitHubIssue } from '../src/watch.js';

vi.mock('../src/utils/shell.js', () => ({
  shell: vi.fn(),
}));

import { shell } from '../src/utils/shell.js';
const mockShell = vi.mocked(shell);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildTaskFromIssue', () => {
  it('returns title when body is empty', () => {
    const issue: GitHubIssue = { number: 1, title: 'Fix bug', body: '', labels: [] };
    expect(buildTaskFromIssue(issue)).toBe('Fix bug');
  });

  it('returns title + body when body has content', () => {
    const issue: GitHubIssue = { number: 1, title: 'Fix bug', body: 'Details here', labels: [] };
    expect(buildTaskFromIssue(issue)).toBe('Fix bug\n\nDetails here');
  });

  it('trims whitespace-only body', () => {
    const issue: GitHubIssue = { number: 1, title: 'Fix bug', body: '   \n  ', labels: [] };
    expect(buildTaskFromIssue(issue)).toBe('Fix bug');
  });
});

describe('fetchLabeledIssues', () => {
  it('parses issues from gh output', async () => {
    mockShell.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify([
        { number: 1, title: 'Bug', body: 'fix it', labels: [{ name: 'minion' }] },
        { number: 2, title: 'Feature', body: '', labels: [{ name: 'minion' }, { name: 'enhancement' }] },
      ]),
      stderr: '',
    });

    const issues = await fetchLabeledIssues('minion', '/tmp');
    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({ number: 1, title: 'Bug', body: 'fix it', labels: ['minion'] });
    expect(issues[1].labels).toEqual(['minion', 'enhancement']);
  });

  it('returns empty array on non-zero exit', async () => {
    mockShell.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });
    const issues = await fetchLabeledIssues('minion', '/tmp');
    expect(issues).toEqual([]);
  });

  it('returns empty array on invalid JSON', async () => {
    mockShell.mockResolvedValue({ exitCode: 0, stdout: 'not json', stderr: '' });
    const issues = await fetchLabeledIssues('minion', '/tmp');
    expect(issues).toEqual([]);
  });
});

describe('removeLabel', () => {
  it('calls gh with correct args', async () => {
    mockShell.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    await removeLabel(42, 'minion', '/tmp');
    expect(mockShell).toHaveBeenCalledWith('gh', ['issue', 'edit', '42', '--remove-label', 'minion'], { cwd: '/tmp' });
  });
});

describe('addLabel', () => {
  it('calls gh with correct args', async () => {
    mockShell.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    await addLabel(42, 'done', '/tmp');
    expect(mockShell).toHaveBeenCalledWith('gh', ['issue', 'edit', '42', '--add-label', 'done'], { cwd: '/tmp' });
  });
});

describe('commentOnIssue', () => {
  it('calls gh with correct args', async () => {
    mockShell.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    await commentOnIssue(42, 'Done!', '/tmp');
    expect(mockShell).toHaveBeenCalledWith('gh', ['issue', 'comment', '42', '--body', 'Done!'], { cwd: '/tmp' });
  });
});
