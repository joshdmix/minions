import { describe, it, expect, vi, beforeEach } from 'vitest';
import { slugify, getRepoRoot, commitAll, openPR, cleanupWorktree } from '../../src/utils/git.js';

vi.mock('../../src/utils/shell.js', () => ({
  shell: vi.fn(),
  shellExec: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { shell } from '../../src/utils/shell.js';
const mockShell = vi.mocked(shell);

describe('slugify', () => {
  it('lowercases text', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces special characters with hyphens', () => {
    expect(slugify('fix: the bug!')).toBe('fix-the-bug');
  });

  it('collapses consecutive non-alphanumeric chars into a single hyphen', () => {
    expect(slugify('hello---world')).toBe('hello-world');
  });

  it('removes leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
    expect(slugify('!!!test!!!')).toBe('test');
  });

  it('truncates to 50 characters', () => {
    const long = 'a'.repeat(60);
    expect(slugify(long)).toHaveLength(50);
  });

  it('truncates after slugifying', () => {
    const input = 'this is a very long task description that should be truncated at fifty characters exactly';
    const result = slugify(input);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result).not.toMatch(/^-|-$/);
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('passes through already lowercase alphanumeric text', () => {
    expect(slugify('simple')).toBe('simple');
  });

  it('handles numbers', () => {
    expect(slugify('issue 42 fix')).toBe('issue-42-fix');
  });

  it('handles all special characters', () => {
    expect(slugify('@#$%^&*()')).toBe('');
  });
});

describe('getRepoRoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns trimmed stdout on success', async () => {
    mockShell.mockResolvedValue({ stdout: '/home/user/repo\n', stderr: '', exitCode: 0 });

    const result = await getRepoRoot('/some/dir');
    expect(result).toBe('/home/user/repo');
    expect(mockShell).toHaveBeenCalledWith('git', ['rev-parse', '--show-toplevel'], { cwd: '/some/dir' });
  });

  it('throws when not a git repo', async () => {
    mockShell.mockResolvedValue({ stdout: '', stderr: 'fatal: not a git repo', exitCode: 128 });

    await expect(getRepoRoot('/not/a/repo')).rejects.toThrow('Not a git repo');
  });

  it('works without cwd argument', async () => {
    mockShell.mockResolvedValue({ stdout: '/default/repo\n', stderr: '', exitCode: 0 });

    await getRepoRoot();
    expect(mockShell).toHaveBeenCalledWith('git', ['rev-parse', '--show-toplevel'], { cwd: undefined });
  });
});

describe('commitAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds, checks status, and commits when there are changes', async () => {
    mockShell
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git add -A
      .mockResolvedValueOnce({ stdout: 'M file.ts\n', stderr: '', exitCode: 0 }) // git status --porcelain
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // git commit

    await commitAll('/repo', 'fix stuff');

    expect(mockShell).toHaveBeenCalledTimes(3);
    expect(mockShell).toHaveBeenNthCalledWith(1, 'git', ['add', '-A'], { cwd: '/repo' });
    expect(mockShell).toHaveBeenNthCalledWith(2, 'git', ['status', '--porcelain'], { cwd: '/repo' });
    expect(mockShell).toHaveBeenNthCalledWith(3, 'git', ['commit', '-m', 'fix stuff'], { cwd: '/repo' });
  });

  it('skips commit when porcelain output is empty', async () => {
    mockShell
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git add -A
      .mockResolvedValueOnce({ stdout: '  \n', stderr: '', exitCode: 0 }); // git status --porcelain (empty)

    await commitAll('/repo', 'nothing here');

    expect(mockShell).toHaveBeenCalledTimes(2);
  });

  it('throws when commit fails', async () => {
    mockShell
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git add -A
      .mockResolvedValueOnce({ stdout: 'M file.ts\n', stderr: '', exitCode: 0 }) // porcelain
      .mockResolvedValueOnce({ stdout: '', stderr: 'error', exitCode: 1 }); // commit fails

    await expect(commitAll('/repo', 'fail')).rejects.toThrow('Commit failed');
  });
});

describe('openPR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the PR URL on success', async () => {
    mockShell.mockResolvedValue({
      stdout: 'https://github.com/user/repo/pull/42\n',
      stderr: '',
      exitCode: 0,
    });

    const url = await openPR('/repo', 'My PR', 'PR body');
    expect(url).toBe('https://github.com/user/repo/pull/42');
    expect(mockShell).toHaveBeenCalledWith(
      'gh',
      ['pr', 'create', '--title', 'My PR', '--body', 'PR body'],
      { cwd: '/repo' },
    );
  });

  it('throws when gh pr create fails', async () => {
    mockShell.mockResolvedValue({ stdout: '', stderr: 'auth required', exitCode: 1 });

    await expect(openPR('/repo', 'title', 'body')).rejects.toThrow('PR creation failed');
  });
});

describe('cleanupWorktree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls git worktree remove with --force', async () => {
    mockShell.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    await cleanupWorktree('/repo', '/repo/.minions/worktrees/my-task');

    expect(mockShell).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', '/repo/.minions/worktrees/my-task', '--force'],
      { cwd: '/repo' },
    );
  });
});
