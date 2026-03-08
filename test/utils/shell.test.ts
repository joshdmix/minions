import { describe, it, expect } from 'vitest';
import { shell, shellExec } from '../../src/utils/shell.js';
import os from 'node:os';

describe('shell', () => {
  it('runs a command and returns stdout', async () => {
    const result = await shell('echo', ['hello']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('returns non-zero exit code on failure', async () => {
    const result = await shell('false', []);
    expect(result.exitCode).not.toBe(0);
  });

  it('returns stderr on failure', async () => {
    const result = await shell('ls', ['--nonexistent-flag-xyz']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });

  it('respects cwd option', async () => {
    const result = await shell('pwd', [], { cwd: os.tmpdir() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBeTruthy();
  });

  it('handles command not found', async () => {
    const result = await shell('nonexistent_command_xyz_123', []);
    expect(result.exitCode).not.toBe(0);
  });
});

describe('shellExec', () => {
  it('runs a shell string', async () => {
    const result = await shellExec('echo hello && echo world');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
    expect(result.stdout).toContain('world');
  });

  it('handles pipes', async () => {
    const result = await shellExec('echo "hello world" | tr " " "_"');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello_world');
  });

  it('respects cwd', async () => {
    const result = await shellExec('pwd', { cwd: os.tmpdir() });
    expect(result.exitCode).toBe(0);
  });
});
