import Anthropic from '@anthropic-ai/sdk';
import { builtinTools, type ToolDefinition } from './tools.js';
import { logger } from '../utils/logger.js';

export interface AgentOptions {
  model: string;
  systemPrompt: string;
  task: string;
  cwd: string;
  extraTools?: ToolDefinition[];
  maxTurns?: number;
}

export async function runAgent(options: AgentOptions): Promise<string> {
  const { model, systemPrompt, task, cwd, extraTools = [], maxTurns = 50 } = options;

  const client = new Anthropic();
  const allTools = [...builtinTools, ...extraTools];
  const toolDefs = allTools.map(t => t.tool);
  const toolMap = new Map(allTools.map(t => [t.tool.name, t]));

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: task },
  ];

  let turns = 0;
  let lastOutput = '';

  while (turns < maxTurns) {
    turns++;
    logger.debug('agent', `Turn ${turns}/${maxTurns}`);

    const response = await client.messages.create({
      model,
      max_tokens: 16384,
      system: systemPrompt,
      tools: toolDefs,
      messages,
    });

    // Collect text output
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    );
    if (textBlocks.length) {
      lastOutput = textBlocks.map(b => b.text).join('\n');
      logger.debug('agent', lastOutput.slice(0, 200));
    }

    // If no tool use, we're done
    if (response.stop_reason === 'end_turn') {
      logger.info('agent', `Agent completed in ${turns} turns`);
      return lastOutput;
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) {
      logger.info('agent', `Agent stopped (no tool use) after ${turns} turns`);
      return lastOutput;
    }

    // Add assistant response to messages
    messages.push({ role: 'assistant', content: response.content });

    // Execute tools and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const tool = toolMap.get(toolUse.name);
      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Unknown tool: ${toolUse.name}`,
          is_error: true,
        });
        continue;
      }

      logger.info('agent', `Tool call: ${toolUse.name}`, toolUse.input as Record<string, unknown>);
      try {
        const result = await tool.execute(toolUse.input as Record<string, unknown>, cwd);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      } catch (err: any) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Tool error: ${err.message}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  logger.warn('agent', `Agent hit max turns (${maxTurns})`);
  return lastOutput;
}
