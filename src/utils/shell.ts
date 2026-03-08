import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function shell(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ShellResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options?.cwd,
      timeout: options?.timeout ?? 300_000, // 5 min default
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message,
      exitCode: err.code ?? 1,
    };
  }
}

// Run a full shell command string via /bin/sh -c
export async function shellExec(command: string, options?: { cwd?: string; timeout?: number }): Promise<ShellResult> {
  return shell('/bin/sh', ['-c', command], options);
}
