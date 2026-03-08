import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { logger } from './utils/logger.js';

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface Config {
  model: string;
  max_autofix_rounds: number;
  lint: string | null;
  test: string | null;
  mcp_servers: McpServerConfig[];
  rule_files: string[];
}

const DEFAULTS: Config = {
  model: 'claude-sonnet-4-6',
  max_autofix_rounds: 2,
  lint: null,
  test: null,
  mcp_servers: [],
  rule_files: ['CLAUDE.md'],
};

export async function loadConfig(configPath?: string): Promise<Config> {
  const filePath = configPath ?? 'minions.yaml';
  let raw: Record<string, unknown> = {};

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    raw = parse(content) ?? {};
    logger.info('config', `Loaded config from ${filePath}`);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      logger.info('config', 'No config file found, using defaults');
    } else {
      throw new Error(`Failed to parse config: ${err.message}`);
    }
  }

  return {
    model: typeof raw.model === 'string' ? raw.model : DEFAULTS.model,
    max_autofix_rounds: typeof raw.max_autofix_rounds === 'number' ? raw.max_autofix_rounds : DEFAULTS.max_autofix_rounds,
    lint: typeof raw.lint === 'string' ? raw.lint : DEFAULTS.lint,
    test: typeof raw.test === 'string' ? raw.test : DEFAULTS.test,
    mcp_servers: Array.isArray(raw.mcp_servers) ? raw.mcp_servers as McpServerConfig[] : DEFAULTS.mcp_servers,
    rule_files: Array.isArray(raw.rule_files) ? raw.rule_files as string[] : DEFAULTS.rule_files,
  };
}

export async function loadRuleFiles(repoRoot: string, patterns: string[]): Promise<string> {
  const { glob } = await import('node:fs');
  const { promisify } = await import('node:util');

  const sections: string[] = [];

  for (const pattern of patterns) {
    const fullPattern = path.join(repoRoot, pattern);
    // Use simple file read for non-glob patterns, glob for patterns with wildcards
    if (pattern.includes('*')) {
      const { globSync } = await import('node:fs');
      try {
        const files = globSync(fullPattern);
        for (const file of files) {
          try {
            const content = await fs.readFile(file, 'utf-8');
            sections.push(`# ${path.relative(repoRoot, file)}\n\n${content}`);
          } catch { /* skip unreadable files */ }
        }
      } catch { /* skip invalid globs */ }
    } else {
      try {
        const content = await fs.readFile(fullPattern, 'utf-8');
        sections.push(`# ${pattern}\n\n${content}`);
      } catch { /* skip missing files */ }
    }
  }

  return sections.join('\n\n---\n\n');
}
