import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { builtinTools } from '../../src/agent/tools.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function getTool(name: string) {
  const tool = builtinTools.find(t => t.tool.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'minions-tools-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('builtinTools schema', () => {
  it('exports 5 tools', () => {
    expect(builtinTools).toHaveLength(5);
  });

  it('all tools have name and input_schema', () => {
    for (const t of builtinTools) {
      expect(t.tool.name).toBeTruthy();
      expect(t.tool.input_schema).toBeDefined();
      expect(t.tool.description).toBeTruthy();
    }
  });

  it('has expected tool names', () => {
    const names = builtinTools.map(t => t.tool.name);
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('list_files');
    expect(names).toContain('search_files');
    expect(names).toContain('run_command');
  });
});

describe('read_file', () => {
  it('reads an existing file', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    await fs.writeFile(filePath, 'hello world');
    const tool = getTool('read_file');
    const result = await tool.execute({ path: 'test.txt' }, tmpDir);
    expect(result).toBe('hello world');
  });

  it('returns error for missing file', async () => {
    const tool = getTool('read_file');
    const result = await tool.execute({ path: 'nonexistent.txt' }, tmpDir);
    expect(result).toContain('Error reading file');
  });

  it('rejects path traversal', async () => {
    const tool = getTool('read_file');
    const result = await tool.execute({ path: '../../etc/passwd' }, tmpDir);
    expect(result).toContain('Error: path escapes working directory');
  });
});

describe('write_file', () => {
  it('creates a new file', async () => {
    const tool = getTool('write_file');
    const result = await tool.execute({ path: 'new.txt', content: 'created' }, tmpDir);
    expect(result).toContain('File written');
    const content = await fs.readFile(path.join(tmpDir, 'new.txt'), 'utf-8');
    expect(content).toBe('created');
  });

  it('creates parent directories', async () => {
    const tool = getTool('write_file');
    await tool.execute({ path: 'deep/nested/file.txt', content: 'nested' }, tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'deep/nested/file.txt'), 'utf-8');
    expect(content).toBe('nested');
  });

  it('rejects path traversal', async () => {
    const tool = getTool('write_file');
    const result = await tool.execute({ path: '../outside.txt', content: 'evil' }, tmpDir);
    expect(result).toContain('Error: path escapes working directory');
  });
});

describe('list_files', () => {
  it('lists directory contents', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.txt'), '');
    await fs.writeFile(path.join(tmpDir, 'b.txt'), '');
    const tool = getTool('list_files');
    const result = await tool.execute({ path: '.' }, tmpDir);
    expect(result).toContain('a.txt');
    expect(result).toContain('b.txt');
  });

  it('shows directories with trailing slash', async () => {
    await fs.mkdir(path.join(tmpDir, 'subdir'));
    const tool = getTool('list_files');
    const result = await tool.execute({ path: '.' }, tmpDir);
    expect(result).toContain('subdir/');
  });

  it('rejects path traversal', async () => {
    const tool = getTool('list_files');
    const result = await tool.execute({ path: '../../' }, tmpDir);
    expect(result).toContain('Error: path escapes working directory');
  });
});

describe('run_command', () => {
  it('runs a command and returns output', async () => {
    const tool = getTool('run_command');
    const result = await tool.execute({ command: 'echo hello' }, tmpDir);
    expect(result).toContain('Exit code: 0');
    expect(result).toContain('hello');
  });

  it('returns non-zero exit code', async () => {
    const tool = getTool('run_command');
    const result = await tool.execute({ command: 'false' }, tmpDir);
    expect(result).not.toContain('Exit code: 0');
  });
});
