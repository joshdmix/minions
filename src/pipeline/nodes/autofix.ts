import { PipelineNode, PipelineContext, NodeResult } from '../types.js';
import { runAgent } from '../../agent/claude.js';

export const autofixNode: PipelineNode = {
  name: 'autofix',
  type: 'agentic',
  async run(ctx: PipelineContext): Promise<NodeResult> {
    ctx.autofixRound++;

    const systemPrompt = [
      'You are an autonomous coding agent fixing lint or test failures.',
      'Analyze the failure output below, find the root cause in the code, and fix it.',
      'Use the provided tools to read and modify files. Only change what is necessary to fix the failure.',
      'When done, respond with a brief summary of the fix.',
    ].join('\n\n');

    const task = `Fix the following failure (attempt ${ctx.autofixRound}/${ctx.config.max_autofix_rounds}):\n\n${ctx.lastFailure}`;

    const output = await runAgent({
      model: ctx.config.model,
      systemPrompt,
      task,
      cwd: ctx.worktreePath,
    });

    // Go back to lint to re-check
    const next = ctx.config.lint ? 'lint' : (ctx.config.test ? 'test' : 'pr');
    return { success: true, output, next };
  },
};
