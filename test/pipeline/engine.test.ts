import { describe, it, expect } from 'vitest';
import { PipelineEngine } from '../../src/pipeline/engine.js';
import type { PipelineNode, PipelineContext, NodeResult } from '../../src/pipeline/types.js';

function makeContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    config: {
      model: 'claude-sonnet-4-6',
      max_autofix_rounds: 2,
      lint: null,
      test: null,
      mcp_servers: [],
      rule_files: [],
    },
    repoRoot: '/tmp/test-repo',
    worktreePath: '/tmp/test-worktree',
    branch: 'minion/test',
    task: 'test task',
    ruleContent: '',
    dryRun: false,
    autofixRound: 0,
    lastFailure: null,
    ...overrides,
  };
}

function makeNode(name: string, result: NodeResult): PipelineNode {
  return {
    name,
    type: 'deterministic',
    run: async () => result,
  };
}

describe('PipelineEngine', () => {
  it('runs a single node that completes', async () => {
    const engine = new PipelineEngine();
    engine.addNode(makeNode('only', { success: true, output: 'done', next: null }));

    const result = await engine.run(makeContext());
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].node).toBe('only');
  });

  it('chains nodes via next pointer', async () => {
    const engine = new PipelineEngine();
    engine.addNode(makeNode('first', { success: true, output: 'step 1', next: 'second' }));
    engine.addNode(makeNode('second', { success: true, output: 'step 2', next: 'third' }));
    engine.addNode(makeNode('third', { success: true, output: 'step 3', next: null }));

    const result = await engine.run(makeContext());
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results.map(r => r.node)).toEqual(['first', 'second', 'third']);
  });

  it('stops on terminal failure (success=false, next=null)', async () => {
    const engine = new PipelineEngine();
    engine.addNode(makeNode('first', { success: true, output: 'ok', next: 'second' }));
    engine.addNode(makeNode('second', { success: false, output: 'failed', next: null }));
    engine.addNode(makeNode('third', { success: true, output: 'never reached', next: null }));

    const result = await engine.run(makeContext());
    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(2);
  });

  it('follows failure redirect (success=false, next=autofix)', async () => {
    const engine = new PipelineEngine();
    engine.addNode(makeNode('lint', { success: false, output: 'lint error', next: 'autofix' }));
    engine.addNode(makeNode('autofix', { success: true, output: 'fixed', next: null }));

    const result = await engine.run(makeContext());
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].node).toBe('lint');
    expect(result.results[1].node).toBe('autofix');
  });

  it('throws on unknown next node', async () => {
    const engine = new PipelineEngine();
    engine.addNode(makeNode('start', { success: true, output: 'ok', next: 'nonexistent' }));

    await expect(engine.run(makeContext())).rejects.toThrow('Unknown pipeline node: nonexistent');
  });

  it('throws when no nodes registered', async () => {
    const engine = new PipelineEngine();
    await expect(engine.run(makeContext())).rejects.toThrow('No nodes registered');
  });

  it('handles node that throws an error', async () => {
    const engine = new PipelineEngine();
    engine.addNode({
      name: 'crasher',
      type: 'deterministic',
      run: async () => { throw new Error('kaboom'); },
    });

    const result = await engine.run(makeContext());
    expect(result.success).toBe(false);
    expect(result.results[0].result.output).toBe('kaboom');
  });

  it('reports all node names via getNodes()', () => {
    const engine = new PipelineEngine();
    engine.addNode(makeNode('a', { success: true, output: '', next: null }));
    engine.addNode(makeNode('b', { success: true, output: '', next: null }));
    expect(engine.getNodes()).toEqual(['a', 'b']);
  });
});
