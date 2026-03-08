import { PipelineNode, PipelineContext, NodeResult } from '../types.js';
import { runAgent } from '../../agent/claude.js';
import { runAgentCli } from '../../agent/claude-cli.js';

export const implementNode: PipelineNode = {
  name: 'implement',
  type: 'agentic',
  async run(ctx: PipelineContext): Promise<NodeResult> {
    const systemPrompt = buildSystemPrompt(ctx);
    const run = ctx.config.backend === 'cli' ? runAgentCli : runAgent;
    const output = await run({
      model: ctx.config.model,
      systemPrompt,
      task: ctx.task,
      cwd: ctx.worktreePath,
    });

    // Determine next step: lint if configured, else test, else pr
    let next = 'pr';
    if (ctx.config.test) next = 'test';
    if (ctx.config.lint) next = 'lint';

    if (output.startsWith('Claude CLI failed:')) return { success: false, output, next: null };
    return { success: true, output, next };
  },
};

function buildSystemPrompt(ctx: PipelineContext): string {
  const parts = [
    'You are an autonomous coding agent. Your job is to implement the requested task by reading, writing, and modifying files in the repository.',
    'Work in the current directory. Use the provided tools to explore the codebase, understand the existing code, and make changes.',
    'Be thorough but minimal — only change what is needed. Follow existing patterns and conventions.',
    'When you are done making all necessary changes, respond with a brief summary of what you did.',
  ];

  if (ctx.ruleContent) {
    parts.push('\n## Project Rules\n' + ctx.ruleContent);
  }

  return parts.join('\n\n');
}
