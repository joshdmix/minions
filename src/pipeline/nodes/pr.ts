import { PipelineNode, PipelineContext, NodeResult } from '../types.js';
import { commitAll, pushBranch, openPR } from '../../utils/git.js';
import { logger } from '../../utils/logger.js';

export const prNode: PipelineNode = {
  name: 'pr',
  type: 'deterministic',
  async run(ctx: PipelineContext): Promise<NodeResult> {
    if (ctx.dryRun) {
      logger.info('pr', 'Dry run — skipping commit/push/PR');
      return { success: true, output: 'Dry run complete', next: null };
    }

    // Commit all changes
    await commitAll(ctx.worktreePath, `minion: ${ctx.task.slice(0, 72)}`);

    // Push branch
    await pushBranch(ctx.worktreePath, ctx.branch);

    // Open PR
    const body = [
      '## Minion Task',
      '',
      ctx.task,
      '',
      '---',
      '*This PR was created autonomously by [minions](https://github.com/joshuadmix/minions).*',
    ].join('\n');

    const title = ctx.task.length > 70 ? ctx.task.slice(0, 67) + '...' : ctx.task;

    try {
      const url = await openPR(ctx.worktreePath, title, body);
      return { success: true, output: `PR opened: ${url}`, next: null };
    } catch (err: any) {
      // PR creation might fail if gh is not configured — still succeed since code is pushed
      logger.warn('pr', `PR creation failed: ${err.message}`);
      return { success: true, output: `Code pushed to ${ctx.branch} but PR creation failed: ${err.message}`, next: null };
    }
  },
};
