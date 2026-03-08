import { PipelineNode, PipelineContext, NodeResult } from './types.js';
import { logger } from '../utils/logger.js';

export class PipelineEngine {
  private nodes: Map<string, PipelineNode> = new Map();
  private startNode: string | null = null;

  addNode(node: PipelineNode): void {
    if (!this.startNode) this.startNode = node.name;
    this.nodes.set(node.name, node);
  }

  async run(ctx: PipelineContext): Promise<{ success: boolean; results: Array<{ node: string; result: NodeResult }> }> {
    const results: Array<{ node: string; result: NodeResult }> = [];
    let currentName = this.startNode;

    if (!currentName) throw new Error('No nodes registered in pipeline');

    while (currentName) {
      const node = this.nodes.get(currentName);
      if (!node) throw new Error(`Unknown pipeline node: ${currentName}`);

      logger.info('pipeline', `Running node: ${node.name} (${node.type})`);

      let result: NodeResult;
      try {
        result = await node.run(ctx);
      } catch (err: any) {
        result = { success: false, output: err.message, next: null };
      }

      results.push({ node: node.name, result });
      logger.info('pipeline', `Node ${node.name} completed`, {
        success: result.success,
        next: result.next ?? 'done',
      });

      if (!result.success && !result.next) {
        // Terminal failure
        return { success: false, results };
      }

      currentName = result.next;
    }

    return { success: true, results };
  }

  getNodes(): string[] {
    return Array.from(this.nodes.keys());
  }
}
