#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig, loadRuleFiles } from './config.js';
import { PipelineEngine } from './pipeline/engine.js';
import { PipelineContext } from './pipeline/types.js';
import { setupNode } from './pipeline/nodes/setup.js';
import { implementNode } from './pipeline/nodes/implement.js';
import { lintNode } from './pipeline/nodes/lint.js';
import { testNode } from './pipeline/nodes/test.js';
import { autofixNode } from './pipeline/nodes/autofix.js';
import { prNode } from './pipeline/nodes/pr.js';
import { McpManager } from './mcp/client.js';
import { getRepoRoot, cleanupWorktree } from './utils/git.js';
import { logger, setLogLevel } from './utils/logger.js';

const program = new Command();

program
  .name('minions')
  .description('Personal unattended coding agent — autonomously writes code, runs tests, and opens PRs')
  .version('0.1.0')
  .argument('<task>', 'Task description — what should the minion do?')
  .option('-m, --model <model>', 'Claude model to use')
  .option('-c, --config <path>', 'Path to minions.yaml config file')
  .option('--dry-run', 'Plan and implement but skip commit/push/PR', false)
  .option('--verbose', 'Enable debug logging', false)
  .action(async (task: string, opts: { model?: string; config?: string; dryRun: boolean; verbose: boolean }) => {
    if (opts.verbose) setLogLevel('debug');

    logger.info('minions', `Starting task: ${task}`);

    // Load config
    const config = await loadConfig(opts.config);
    if (opts.model) config.model = opts.model;

    // Find repo root
    let repoRoot: string;
    try {
      repoRoot = await getRepoRoot();
    } catch {
      logger.error('minions', 'Not in a git repository. Run minions from within a git repo.');
      process.exit(1);
    }

    // Load rule files
    const ruleContent = await loadRuleFiles(repoRoot, config.rule_files);

    // Connect MCP servers
    const mcpManager = new McpManager();
    const mcpTools = await mcpManager.connect(config.mcp_servers);
    if (mcpTools.length > 0) {
      logger.info('minions', `Loaded ${mcpTools.length} MCP tools`);
    }

    // Build pipeline
    const engine = new PipelineEngine();
    engine.addNode(setupNode);
    engine.addNode(implementNode);
    engine.addNode(lintNode);
    engine.addNode(testNode);
    engine.addNode(autofixNode);
    engine.addNode(prNode);

    // Build context
    const ctx: PipelineContext = {
      config,
      repoRoot,
      worktreePath: '', // Set by setup node
      branch: '',       // Set by setup node
      task,
      ruleContent,
      dryRun: opts.dryRun,
      autofixRound: 0,
      lastFailure: null,
    };

    // Run pipeline
    try {
      const result = await engine.run(ctx);

      if (result.success) {
        logger.info('minions', 'Pipeline completed successfully');
      } else {
        logger.error('minions', 'Pipeline failed');
        const lastResult = result.results[result.results.length - 1];
        if (lastResult) {
          logger.error('minions', `Failed at node: ${lastResult.node}`);
          logger.error('minions', lastResult.result.output.slice(0, 500));
        }
      }

      // Print summary
      console.log('\n--- Results ---');
      for (const { node, result: r } of result.results) {
        const status = r.success ? '✓' : '✗';
        console.log(`${status} ${node}: ${r.output.split('\n')[0]}`);
      }
    } finally {
      // Cleanup
      await mcpManager.disconnect();
      if (ctx.worktreePath && !opts.dryRun) {
        try {
          await cleanupWorktree(repoRoot, ctx.worktreePath);
        } catch {
          logger.warn('minions', 'Failed to cleanup worktree (may need manual cleanup)');
        }
      }
    }
  });

program.parse();
