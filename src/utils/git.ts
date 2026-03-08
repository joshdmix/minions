import { shell, shellExec } from './shell.js';
import { logger } from './logger.js';
import path from 'node:path';
import fs from 'node:fs/promises';

export async function getRepoRoot(cwd?: string): Promise<string> {
  const result = await shell('git', ['rev-parse', '--show-toplevel'], { cwd });
  if (result.exitCode !== 0) throw new Error(`Not a git repo: ${result.stderr}`);
  return result.stdout.trim();
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'task';
}

export async function createWorktree(repoRoot: string, taskDescription: string): Promise<{ worktreePath: string; branch: string }> {
  const slug = slugify(taskDescription);
  const branch = `minion/${slug}`;
  const worktreeDir = path.join(repoRoot, '.minions', 'worktrees');
  const worktreePath = path.join(worktreeDir, slug);

  await fs.mkdir(worktreeDir, { recursive: true });

  // Create worktree with new branch
  const result = await shell('git', ['worktree', 'add', '-b', branch, worktreePath], { cwd: repoRoot });
  if (result.exitCode !== 0) {
    // Branch might exist — try without -b
    const retry = await shell('git', ['worktree', 'add', worktreePath, branch], { cwd: repoRoot });
    if (retry.exitCode !== 0) throw new Error(`Failed to create worktree: ${retry.stderr}`);
  }

  logger.info('git', `Created worktree at ${worktreePath} on branch ${branch}`);
  return { worktreePath, branch };
}

export async function commitAll(cwd: string, message: string): Promise<void> {
  await shell('git', ['add', '-A'], { cwd });
  const status = await shell('git', ['status', '--porcelain'], { cwd });
  if (!status.stdout.trim()) {
    logger.info('git', 'Nothing to commit');
    return;
  }
  const result = await shell('git', ['commit', '-m', message], { cwd });
  if (result.exitCode !== 0) throw new Error(`Commit failed: ${result.stderr}`);
  logger.info('git', `Committed: ${message}`);
}

export async function pushBranch(cwd: string, branch: string): Promise<void> {
  const result = await shell('git', ['push', '-u', 'origin', branch], { cwd });
  if (result.exitCode !== 0) throw new Error(`Push failed: ${result.stderr}`);
  logger.info('git', `Pushed branch ${branch}`);
}

export async function openPR(cwd: string, title: string, body: string): Promise<string> {
  const result = await shell('gh', ['pr', 'create', '--title', title, '--body', body], { cwd });
  if (result.exitCode !== 0) throw new Error(`PR creation failed: ${result.stderr}`);
  const url = result.stdout.trim();
  logger.info('git', `Opened PR: ${url}`);
  return url;
}

export async function cleanupWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  await shell('git', ['worktree', 'remove', worktreePath, '--force'], { cwd: repoRoot });
  logger.info('git', `Cleaned up worktree at ${worktreePath}`);
}
