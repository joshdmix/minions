#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig } from './config.js';
import { runPipeline } from './run.js';
import { fetchLabeledIssues, removeLabel, addLabel, commentOnIssue, buildTaskFromIssue } from './watch.js';
import { getRepoRoot } from './utils/git.js';
import { logger, setLogLevel } from './utils/logger.js';

const program = new Command();

program
  .name('minions')
  .description('Personal unattended coding agent — autonomously writes code, runs tests, and opens PRs')
  .version('0.1.0');

// --- Direct run command (default) ---
program
  .command('run', { isDefault: true })
  .argument('<task>', 'Task description — what should the minion do?')
  .option('-m, --model <model>', 'Claude model to use')
  .option('-c, --config <path>', 'Path to minions.yaml config file')
  .option('-b, --backend <backend>', 'Agent backend: "cli" (Claude Code) or "api" (API key)', 'cli')
  .option('--dry-run', 'Plan and implement but skip commit/push/PR', false)
  .option('--verbose', 'Enable debug logging', false)
  .action(async (task: string, opts: { model?: string; config?: string; backend: string; dryRun: boolean; verbose: boolean }) => {
    if (opts.verbose) setLogLevel('debug');

    logger.info('minions', `Starting task: ${task}`);

    const config = await loadConfig(opts.config);
    if (opts.model) config.model = opts.model;
    if (opts.backend === 'cli' || opts.backend === 'api') config.backend = opts.backend;

    let repoRoot: string;
    try {
      repoRoot = await getRepoRoot();
    } catch {
      logger.error('minions', 'Not in a git repository. Run minions from within a git repo.');
      process.exit(1);
    }

    const result = await runPipeline({ task, config, repoRoot, dryRun: opts.dryRun });

    console.log('\n--- Results ---');
    for (const line of result.summary) {
      console.log(line);
    }

    process.exit(result.success ? 0 : 1);
  });

// --- Watch command ---
program
  .command('watch')
  .description('Poll GitHub issues for a label and auto-implement them')
  .option('-l, --label <label>', 'GitHub issue label to watch for', 'minion')
  .option('-i, --interval <seconds>', 'Poll interval in seconds', '30')
  .option('-m, --model <model>', 'Claude model to use')
  .option('-c, --config <path>', 'Path to minions.yaml config file')
  .option('-b, --backend <backend>', 'Agent backend: "cli" or "api"', 'cli')
  .option('--verbose', 'Enable debug logging', false)
  .action(async (opts: { label: string; interval: string; model?: string; config?: string; backend: string; verbose: boolean }) => {
    if (opts.verbose) setLogLevel('debug');

    const config = await loadConfig(opts.config);
    if (opts.model) config.model = opts.model;
    if (opts.backend === 'cli' || opts.backend === 'api') config.backend = opts.backend;

    let repoRoot: string;
    try {
      repoRoot = await getRepoRoot();
    } catch {
      logger.error('minions', 'Not in a git repository.');
      process.exit(1);
    }

    const intervalMs = parseInt(opts.interval, 10) * 1000;
    const label = opts.label;
    const inProgressLabel = `${label}-in-progress`;
    const processed = new Set<number>();

    logger.info('watch', `Watching for issues labeled "${label}" every ${opts.interval}s`);
    logger.info('watch', 'Press Ctrl+C to stop');

    const poll = async () => {
      const issues = await fetchLabeledIssues(label, repoRoot);
      const pending = issues.filter(i => !processed.has(i.number));

      if (pending.length === 0) {
        logger.debug('watch', 'No new issues');
        return;
      }

      for (const issue of pending) {
        processed.add(issue.number);
        logger.info('watch', `Picking up issue #${issue.number}: ${issue.title}`);

        // Swap labels: remove trigger, add in-progress
        await removeLabel(issue.number, label, repoRoot);
        await addLabel(issue.number, inProgressLabel, repoRoot);
        await commentOnIssue(issue.number, '🤖 Minion picked this up. Working on it...', repoRoot);

        const task = buildTaskFromIssue(issue);

        try {
          const result = await runPipeline({ task, config, repoRoot, dryRun: false });
          const summaryText = result.summary.join('\n');

          if (result.success) {
            await commentOnIssue(issue.number,
              `✅ Minion completed this task. PR opened.\n\n\`\`\`\n${summaryText}\n\`\`\``,
              repoRoot,
            );
          } else {
            await commentOnIssue(issue.number,
              `❌ Minion failed on this task.\n\n\`\`\`\n${summaryText}\n\`\`\``,
              repoRoot,
            );
          }
        } catch (err: any) {
          logger.error('watch', `Pipeline error on issue #${issue.number}: ${err.message}`);
          await commentOnIssue(issue.number,
            `❌ Minion crashed: ${err.message}`,
            repoRoot,
          );
        }

        // Remove in-progress label
        await removeLabel(issue.number, inProgressLabel, repoRoot);
      }
    };

    // Initial poll
    await poll();

    // Loop
    const timer = setInterval(poll, intervalMs);

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('watch', 'Shutting down...');
      clearInterval(timer);
      process.exit(0);
    });
  });

program.parse();
