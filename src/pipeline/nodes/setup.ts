import { PipelineNode, PipelineContext, NodeResult } from '../types.js';
import { createWorktree } from '../../utils/git.js';

export const setupNode: PipelineNode = {
  name: 'setup',
  type: 'deterministic',
  async run(ctx: PipelineContext): Promise<NodeResult> {
    const { worktreePath, branch } = await createWorktree(ctx.repoRoot, ctx.task);
    ctx.worktreePath = worktreePath;
    ctx.branch = branch;
    return { success: true, output: `Worktree created at ${worktreePath}`, next: 'implement' };
  },
};
