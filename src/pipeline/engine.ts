import { PipelineNode, PipelineContext, NodeResult } from './types.js';
import { PipelineEventBus } from './events.js';
import { logger } from '../utils/logger.js';

export class PipelineEngine {
  private nodes: Map<string, PipelineNode> = new Map();
  private startNode: string | null = null;
  private eventBus: PipelineEventBus | null = null;

  addNode(node: PipelineNode): void {
    if (!this.startNode) this.startNode = node.name;
    this.nodes.set(node.name, node);
  }

  setEventBus(bus: PipelineEventBus): void {
    this.eventBus = bus;
  }

  async run(ctx: PipelineContext): Promise<{ success: boolean; results: Array<{ node: string; result: NodeResult }> }> {
    const results: Array<{ node: string; result: NodeResult }> = [];
    let currentName = this.startNode;

    if (!currentName) throw new Error('No nodes registered in pipeline');

    this.eventBus?.send({
      type: 'pipeline:start',
      task: ctx.task,
      nodes: Array.from(this.nodes.keys()),
    });

    while (currentName) {
      const node = this.nodes.get(currentName);
      if (!node) throw new Error(`Unknown pipeline node: ${currentName}`);

      logger.info('pipeline', `Running node: ${node.name} (${node.type})`);
      this.eventBus?.send({
        type: 'node:start',
        node: node.name,
        nodeType: node.type,
      });

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

      this.eventBus?.send({
        type: 'node:complete',
        node: node.name,
        nodeType: node.type,
        success: result.success,
        output: result.output,
        next: result.next,
      });

      if (!result.success && !result.next) {
        this.eventBus?.send({ type: 'pipeline:complete', success: false });
        return { success: false, results };
      }

      currentName = result.next;
    }

    this.eventBus?.send({ type: 'pipeline:complete', success: true });
    return { success: true, results };
  }

  getNodes(): string[] {
    return Array.from(this.nodes.keys());
  }
}
