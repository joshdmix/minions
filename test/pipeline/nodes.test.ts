import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PipelineContext } from '../../src/pipeline/types.js';

vi.mock('../../src/utils/shell.js', () => ({
  shellExec: vi.fn(),
}));

vi.mock('../../src/utils/git.js', () => ({
  createWorktree: vi.fn(),
  commitAll: vi.fn(),
  pushBranch: vi.fn(),
  openPR: vi.fn(),
  cleanupWorktree: vi.fn(),
}));

vi.mock('../../src/agent/claude.js', () => ({
  runAgent: vi.fn(),
}));

vi.mock('../../src/agent/claude-cli.js', () => ({
  runAgentCli: vi.fn(),
}));

import { shellExec } from '../../src/utils/shell.js';
import { createWorktree, commitAll, pushBranch, openPR } from '../../src/utils/git.js';
import { runAgent } from '../../src/agent/claude.js';
import { runAgentCli } from '../../src/agent/claude-cli.js';
import { lintNode } from '../../src/pipeline/nodes/lint.js';
import { testNode } from '../../src/pipeline/nodes/test.js';
import { prNode } from '../../src/pipeline/nodes/pr.js';
import { setupNode } from '../../src/pipeline/nodes/setup.js';
import { implementNode } from '../../src/pipeline/nodes/implement.js';
import { autofixNode } from '../../src/pipeline/nodes/autofix.js';

const mockShellExec = vi.mocked(shellExec);
const mockCreateWorktree = vi.mocked(createWorktree);
const mockCommitAll = vi.mocked(commitAll);
const mockPushBranch = vi.mocked(pushBranch);
const mockOpenPR = vi.mocked(openPR);
const mockRunAgent = vi.mocked(runAgent);
const mockRunAgentCli = vi.mocked(runAgentCli);

function makeContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    config: {
      backend: 'cli',
      model: 'claude-sonnet-4-6',
      max_autofix_rounds: 2,
      lint: null,
      test: null,
      mcp_servers: [],
      rule_files: [],
    },
    repoRoot: '/tmp/test-repo',
    worktreePath: '/tmp/test-worktree',
    branch: 'minion/test',
    task: 'test task',
    ruleContent: '',
    dryRun: false,
    autofixRound: 0,
    lastFailure: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('lintNode', () => {
  it('skips when no lint command configured', async () => {
    const ctx = makeContext();
    const result = await lintNode.run(ctx);
    expect(result.success).toBe(true);
    expect(result.next).toBe('pr');
  });

  it('skips to test when test is configured', async () => {
    const ctx = makeContext({ config: { ...makeContext().config, test: 'npm test' } });
    const result = await lintNode.run(ctx);
    expect(result.success).toBe(true);
    expect(result.next).toBe('test');
  });

  it('succeeds on zero exit code', async () => {
    mockShellExec.mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' });
    const ctx = makeContext({ config: { ...makeContext().config, lint: 'eslint .' } });
    const result = await lintNode.run(ctx);
    expect(result.success).toBe(true);
    expect(result.next).toBe('pr');
  });

  it('redirects to autofix on failure under max rounds', async () => {
    mockShellExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'lint error' });
    const ctx = makeContext({ config: { ...makeContext().config, lint: 'eslint .' } });
    const result = await lintNode.run(ctx);
    expect(result.success).toBe(false);
    expect(result.next).toBe('autofix');
    expect(ctx.lastFailure).toContain('lint error');
  });

  it('succeeds after max retries', async () => {
    mockShellExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'lint error' });
    const ctx = makeContext({
      config: { ...makeContext().config, lint: 'eslint .' },
      autofixRound: 2,
    });
    const result = await lintNode.run(ctx);
    expect(result.success).toBe(true);
    expect(result.next).toBe('pr');
  });
});

describe('testNode', () => {
  it('skips when no test command configured', async () => {
    const ctx = makeContext();
    const result = await testNode.run(ctx);
    expect(result.success).toBe(true);
    expect(result.next).toBe('pr');
  });

  it('succeeds on zero exit code', async () => {
    mockShellExec.mockResolvedValue({ exitCode: 0, stdout: 'passed', stderr: '' });
    const ctx = makeContext({ config: { ...makeContext().config, test: 'npm test' } });
    const result = await testNode.run(ctx);
    expect(result.success).toBe(true);
    expect(result.next).toBe('pr');
  });

  it('redirects to autofix on failure', async () => {
    mockShellExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'test fail' });
    const ctx = makeContext({ config: { ...makeContext().config, test: 'npm test' } });
    const result = await testNode.run(ctx);
    expect(result.success).toBe(false);
    expect(result.next).toBe('autofix');
  });

  it('succeeds after max retries', async () => {
    mockShellExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'fail' });
    const ctx = makeContext({
      config: { ...makeContext().config, test: 'npm test' },
      autofixRound: 2,
    });
    const result = await testNode.run(ctx);
    expect(result.success).toBe(true);
    expect(result.next).toBe('pr');
  });
});

describe('prNode', () => {
  it('skips everything on dry run', async () => {
    const ctx = makeContext({ dryRun: true });
    const result = await prNode.run(ctx);
    expect(result.success).toBe(true);
    expect(result.next).toBeNull();
    expect(mockCommitAll).not.toHaveBeenCalled();
  });

  it('commits, pushes, and opens PR', async () => {
    mockOpenPR.mockResolvedValue('https://github.com/test/pr/1');
    const ctx = makeContext();
    const result = await prNode.run(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('https://github.com/test/pr/1');
    expect(mockCommitAll).toHaveBeenCalled();
    expect(mockPushBranch).toHaveBeenCalledWith('/tmp/test-worktree', 'minion/test');
  });

  it('still succeeds if PR creation fails', async () => {
    mockOpenPR.mockRejectedValue(new Error('gh not found'));
    const ctx = makeContext();
    const result = await prNode.run(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('PR creation failed');
  });

  it('truncates long task titles', async () => {
    mockOpenPR.mockResolvedValue('https://github.com/test/pr/1');
    const ctx = makeContext({ task: 'A'.repeat(100) });
    await prNode.run(ctx);
    const titleArg = mockOpenPR.mock.calls[0][1];
    expect(titleArg.length).toBeLessThanOrEqual(70);
    expect(titleArg).toContain('...');
  });
});

describe('setupNode', () => {
  it('creates worktree and sets context', async () => {
    mockCreateWorktree.mockResolvedValue({
      worktreePath: '/tmp/wt/test',
      branch: 'minion/test-task',
    });
    const ctx = makeContext();
    const result = await setupNode.run(ctx);
    expect(result.success).toBe(true);
    expect(result.next).toBe('implement');
    expect(ctx.worktreePath).toBe('/tmp/wt/test');
    expect(ctx.branch).toBe('minion/test-task');
  });
});

describe('implementNode', () => {
  it('uses cli backend by default', async () => {
    mockRunAgentCli.mockResolvedValue('done');
    const ctx = makeContext();
    const result = await implementNode.run(ctx);
    expect(result.success).toBe(true);
    expect(mockRunAgentCli).toHaveBeenCalled();
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it('uses api backend when configured', async () => {
    mockRunAgent.mockResolvedValue('done');
    const ctx = makeContext({ config: { ...makeContext().config, backend: 'api' } });
    const result = await implementNode.run(ctx);
    expect(result.success).toBe(true);
    expect(mockRunAgent).toHaveBeenCalled();
    expect(mockRunAgentCli).not.toHaveBeenCalled();
  });

  it('next is lint when lint configured', async () => {
    mockRunAgentCli.mockResolvedValue('done');
    const ctx = makeContext({ config: { ...makeContext().config, lint: 'eslint .' } });
    const result = await implementNode.run(ctx);
    expect(result.next).toBe('lint');
  });

  it('next is test when only test configured', async () => {
    mockRunAgentCli.mockResolvedValue('done');
    const ctx = makeContext({ config: { ...makeContext().config, test: 'npm test' } });
    const result = await implementNode.run(ctx);
    expect(result.next).toBe('test');
  });

  it('next is pr when nothing configured', async () => {
    mockRunAgentCli.mockResolvedValue('done');
    const ctx = makeContext();
    const result = await implementNode.run(ctx);
    expect(result.next).toBe('pr');
  });
});

describe('autofixNode', () => {
  it('increments autofixRound', async () => {
    mockRunAgentCli.mockResolvedValue('fixed');
    const ctx = makeContext({ lastFailure: 'lint error' });
    await autofixNode.run(ctx);
    expect(ctx.autofixRound).toBe(1);
  });

  it('returns to lint when lint configured', async () => {
    mockRunAgentCli.mockResolvedValue('fixed');
    const ctx = makeContext({
      config: { ...makeContext().config, lint: 'eslint .' },
      lastFailure: 'lint error',
    });
    const result = await autofixNode.run(ctx);
    expect(result.next).toBe('lint');
  });

  it('returns to test when only test configured', async () => {
    mockRunAgentCli.mockResolvedValue('fixed');
    const ctx = makeContext({
      config: { ...makeContext().config, test: 'npm test' },
      lastFailure: 'test error',
    });
    const result = await autofixNode.run(ctx);
    expect(result.next).toBe('test');
  });

  it('returns to pr when nothing configured', async () => {
    mockRunAgentCli.mockResolvedValue('fixed');
    const ctx = makeContext({ lastFailure: 'error' });
    const result = await autofixNode.run(ctx);
    expect(result.next).toBe('pr');
  });
});
