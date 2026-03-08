import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, loadRuleFiles } from '../src/config.js';

async function makeTmpDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'minions-config-test-'));
}

describe('loadConfig', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('returns defaults when no file exists', async () => {
    const config = await loadConfig('/tmp/nonexistent-minions-config-' + Date.now() + '.yaml');

    expect(config).toEqual({
      backend: 'cli',
      model: 'claude-sonnet-4-6',
      max_autofix_rounds: 2,
      lint: null,
      test: null,
      mcp_servers: [],
      rule_files: ['CLAUDE.md'],
    });
  });

  it('parses a valid YAML file', async () => {
    const dir = await makeTmpDir();
    tmpDirs.push(dir);
    const filePath = path.join(dir, 'minions.yaml');

    await fs.writeFile(filePath, [
      'backend: api',
      'model: claude-opus-4',
      'max_autofix_rounds: 5',
      'lint: "npm run lint"',
      'test: "npm test"',
      'rule_files:',
      '  - RULES.md',
      '  - docs/*.md',
    ].join('\n'));

    const config = await loadConfig(filePath);

    expect(config.backend).toBe('api');
    expect(config.model).toBe('claude-opus-4');
    expect(config.max_autofix_rounds).toBe(5);
    expect(config.lint).toBe('npm run lint');
    expect(config.test).toBe('npm test');
    expect(config.rule_files).toEqual(['RULES.md', 'docs/*.md']);
  });

  it('uses defaults for invalid field types', async () => {
    const dir = await makeTmpDir();
    tmpDirs.push(dir);
    const filePath = path.join(dir, 'minions.yaml');

    await fs.writeFile(filePath, [
      'backend: invalid_backend',
      'model: 123',
      'max_autofix_rounds: "not a number"',
      'lint: 456',
      'mcp_servers: "not an array"',
      'rule_files: "not an array"',
    ].join('\n'));

    const config = await loadConfig(filePath);

    expect(config.backend).toBe('cli');
    expect(config.model).toBe('claude-sonnet-4-6');
    expect(config.max_autofix_rounds).toBe(2);
    expect(config.lint).toBeNull();
    expect(config.mcp_servers).toEqual([]);
    expect(config.rule_files).toEqual(['CLAUDE.md']);
  });

  it('throws on unparseable YAML (non-ENOENT error)', async () => {
    const dir = await makeTmpDir();
    tmpDirs.push(dir);
    const filePath = path.join(dir, 'minions.yaml');

    // Write a file that is a directory to trigger a non-ENOENT read error
    await fs.mkdir(filePath);

    await expect(loadConfig(filePath)).rejects.toThrow('Failed to parse config');
  });
});

describe('loadRuleFiles', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('reads a simple file', async () => {
    const dir = await makeTmpDir();
    tmpDirs.push(dir);

    await fs.writeFile(path.join(dir, 'CLAUDE.md'), 'Be helpful.');

    const result = await loadRuleFiles(dir, ['CLAUDE.md']);

    expect(result).toContain('# CLAUDE.md');
    expect(result).toContain('Be helpful.');
  });

  it('skips missing files', async () => {
    const dir = await makeTmpDir();
    tmpDirs.push(dir);

    await fs.writeFile(path.join(dir, 'EXISTS.md'), 'I exist.');

    const result = await loadRuleFiles(dir, ['EXISTS.md', 'MISSING.md']);

    expect(result).toContain('I exist.');
    expect(result).not.toContain('MISSING.md');
  });

  it('returns empty string when no files match', async () => {
    const dir = await makeTmpDir();
    tmpDirs.push(dir);

    const result = await loadRuleFiles(dir, ['no-such-file.md']);

    expect(result).toBe('');
  });
});
