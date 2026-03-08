import { loadConfig, loadRuleFiles, type Config } from './config.js';
import { PipelineEngine } from './pipeline/engine.js';
import type { PipelineContext } from './pipeline/types.js';
import { setupNode } from './pipeline/nodes/setup.js';
import { implementNode } from './pipeline/nodes/implement.js';
import { lintNode } from './pipeline/nodes/lint.js';
import { testNode } from './pipeline/nodes/test.js';
import { autofixNode } from './pipeline/nodes/autofix.js';
import { prNode } from './pipeline/nodes/pr.js';
import { McpManager } from './mcp/client.js';
import { getRepoRoot, cleanupWorktree } from './utils/git.js';
import { logger } from './utils/logger.js';

export interface RunOptions {
  task: string;
  config: Config;
  repoRoot: string;
  dryRun: boolean;
}

export interface RunResult {
  success: boolean;
  summary: string[];
}

export async function runPipeline(options: RunOptions): Promise<RunResult> {
  const { task, config, repoRoot, dryRun } = options;

  // Load rule files
  const ruleContent = await loadRuleFiles(repoRoot, config.rule_files);

  // Connect MCP servers
  const mcpManager = new McpManager();
  const mcpTools = await mcpManager.connect(config.mcp_servers);
  if (mcpTools.length > 0) {
    logger.info('run', `Loaded ${mcpTools.length} MCP tools`);
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
    worktreePath: '',
    branch: '',
    task,
    ruleContent,
    dryRun,
    autofixRound: 0,
    lastFailure: null,
    lastFailureSource: null,
  };

  const summary: string[] = [];

  try {
    const result = await engine.run(ctx);

    for (const { node, result: r } of result.results) {
      const status = r.success ? '✓' : '✗';
      summary.push(`${status} ${node}: ${r.output.split('\n')[0]}`);
    }

    if (result.success) {
      logger.info('run', 'Pipeline completed successfully');
    } else {
      logger.error('run', 'Pipeline failed');
    }

    return { success: result.success, summary };
  } finally {
    await mcpManager.disconnect();
    if (ctx.worktreePath) {
      try {
        await cleanupWorktree(repoRoot, ctx.worktreePath);
      } catch {
        logger.warn('run', 'Failed to cleanup worktree');
      }
    }
  }
}
