import { shellExec } from '../utils/shell.js';
import { logger } from '../utils/logger.js';
import type { AgentOptions } from './claude.js';

export async function runAgentCli(options: AgentOptions): Promise<string> {
  const { systemPrompt, task, cwd } = options;

  const prompt = [systemPrompt, '', '---', '', '## Task', '', task].join('\n');

  // Build claude CLI command
  // -p = print mode (non-interactive)
  // --dangerously-skip-permissions = unattended operation
  // --output-format text = plain text output
  const args = [
    'claude',
    '-p',
    JSON.stringify(prompt),
    '--dangerously-skip-permissions',
    '--output-format', 'text',
  ];

  const cmd = args.join(' ');
  logger.info('agent-cli', `Running claude CLI in ${cwd}`);
  logger.debug('agent-cli', `Prompt: ${task.slice(0, 200)}`);

  const result = await shellExec(cmd, {
    cwd,
    timeout: 600_000, // 10 min — agent tasks can take a while
  });

  const output = result.stdout.trim();

  if (result.exitCode !== 0) {
    const error = result.stderr.trim();
    logger.error('agent-cli', `Claude CLI exited with code ${result.exitCode}`, { error: error.slice(0, 500) });
    // Still return whatever output we got — partial work is better than nothing
    return output || `Claude CLI failed: ${error}`;
  }

  logger.info('agent-cli', `Claude CLI completed (${output.length} chars output)`);
  return output;
}
