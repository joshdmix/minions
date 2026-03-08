import { shell } from './utils/shell.js';
import { logger } from './utils/logger.js';

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
}

export async function fetchLabeledIssues(label: string, cwd: string): Promise<GitHubIssue[]> {
  const result = await shell('gh', [
    'issue', 'list',
    '--label', label,
    '--state', 'open',
    '--json', 'number,title,body,labels',
  ], { cwd });

  if (result.exitCode !== 0) {
    logger.error('watch', `Failed to fetch issues: ${result.stderr}`);
    return [];
  }

  try {
    const issues = JSON.parse(result.stdout) as Array<{
      number: number;
      title: string;
      body: string;
      labels: Array<{ name: string }>;
    }>;
    return issues.map(i => ({
      number: i.number,
      title: i.title,
      body: i.body ?? '',
      labels: i.labels.map(l => l.name),
    }));
  } catch {
    logger.error('watch', 'Failed to parse issue list');
    return [];
  }
}

export async function removeLabel(issueNumber: number, label: string, cwd: string): Promise<void> {
  await shell('gh', ['issue', 'edit', String(issueNumber), '--remove-label', label], { cwd });
}

export async function addLabel(issueNumber: number, label: string, cwd: string): Promise<void> {
  await shell('gh', ['issue', 'edit', String(issueNumber), '--add-label', label], { cwd });
}

export async function commentOnIssue(issueNumber: number, body: string, cwd: string): Promise<void> {
  await shell('gh', ['issue', 'comment', String(issueNumber), '--body', body], { cwd });
}

export function buildTaskFromIssue(issue: GitHubIssue): string {
  const parts = [issue.title];
  if (issue.body.trim()) {
    parts.push('', issue.body.trim());
  }
  return parts.join('\n');
}
