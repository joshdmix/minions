import type { Config } from '../config.js';

export type NodeType = 'deterministic' | 'agentic';

export interface PipelineContext {
  config: Config;
  repoRoot: string;
  worktreePath: string;
  branch: string;
  task: string;
  ruleContent: string;
  dryRun: boolean;
  autofixRound: number;
  lastFailure: string | null;
}

export interface NodeResult {
  success: boolean;
  output: string;
  next: string | null; // next node name, or null = done
}

export interface PipelineNode {
  name: string;
  type: NodeType;
  run: (ctx: PipelineContext) => Promise<NodeResult>;
}
