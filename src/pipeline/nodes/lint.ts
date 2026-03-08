import { PipelineNode, PipelineContext, NodeResult } from '../types.js';
import { shellExec } from '../../utils/shell.js';

export const lintNode: PipelineNode = {
  name: 'lint',
  type: 'deterministic',
  async run(ctx: PipelineContext): Promise<NodeResult> {
    if (!ctx.config.lint) {
      return { success: true, output: 'No lint command configured', next: ctx.config.test ? 'test' : 'pr' };
    }

    const result = await shellExec(ctx.config.lint, { cwd: ctx.worktreePath });
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

    if (result.exitCode === 0) {
      return { success: true, output, next: ctx.config.test ? 'test' : 'pr' };
    }

    ctx.lastFailure = `Lint failed:\n${output}`;
    ctx.lastFailureSource = 'lint';
    if (ctx.autofixRound < ctx.config.max_autofix_rounds) {
      return { success: false, output, next: 'autofix' };
    }
    // Max retries reached, proceed to PR anyway
    return { success: true, output: `Lint failed after max retries:\n${output}`, next: 'pr' };
  },
};
