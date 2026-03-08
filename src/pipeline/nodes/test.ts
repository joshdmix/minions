import { PipelineNode, PipelineContext, NodeResult } from '../types.js';
import { shellExec } from '../../utils/shell.js';

export const testNode: PipelineNode = {
  name: 'test',
  type: 'deterministic',
  async run(ctx: PipelineContext): Promise<NodeResult> {
    if (!ctx.config.test) {
      return { success: true, output: 'No test command configured', next: 'pr' };
    }

    const result = await shellExec(ctx.config.test, { cwd: ctx.worktreePath });
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

    if (result.exitCode === 0) {
      return { success: true, output, next: 'pr' };
    }

    ctx.lastFailure = `Tests failed:\n${output}`;
    ctx.lastFailureSource = 'test';
    if (ctx.autofixRound < ctx.config.max_autofix_rounds) {
      return { success: false, output, next: 'autofix' };
    }
    return { success: true, output: `Tests failed after max retries:\n${output}`, next: 'pr' };
  },
};
