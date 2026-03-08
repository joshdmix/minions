import fs from 'node:fs/promises';
import path from 'node:path';
import { shellExec } from '../utils/shell.js';
import type Anthropic from '@anthropic-ai/sdk';

export interface ToolDefinition {
  tool: Anthropic.Tool;
  execute: (input: Record<string, unknown>, cwd: string) => Promise<string>;
}

export const builtinTools: ToolDefinition[] = [
  {
    tool: {
      name: 'read_file',
      description: 'Read the contents of a file. Returns the file content as a string.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Relative path to the file from the repo root' },
        },
        required: ['path'],
      },
    },
    execute: async (input, cwd) => {
      const filePath = path.resolve(cwd, input.path as string);
      try {
        return await fs.readFile(filePath, 'utf-8');
      } catch (err: any) {
        return `Error reading file: ${err.message}`;
      }
    },
  },
  {
    tool: {
      name: 'write_file',
      description: 'Write content to a file. Creates the file and any parent directories if they don\'t exist.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Relative path to the file from the repo root' },
          content: { type: 'string', description: 'The content to write to the file' },
        },
        required: ['path', 'content'],
      },
    },
    execute: async (input, cwd) => {
      const filePath = path.resolve(cwd, input.path as string);
      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, input.content as string);
        return `File written: ${input.path}`;
      } catch (err: any) {
        return `Error writing file: ${err.message}`;
      }
    },
  },
  {
    tool: {
      name: 'list_files',
      description: 'List files in a directory. Returns file names, one per line.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Relative path to the directory. Use "." for repo root.' },
          recursive: { type: 'boolean', description: 'List files recursively. Default false.' },
        },
        required: ['path'],
      },
    },
    execute: async (input, cwd) => {
      const dirPath = path.resolve(cwd, input.path as string);
      try {
        if (input.recursive) {
          const result = await shellExec(`find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' | head -200`, { cwd: dirPath });
          return result.stdout || 'No files found';
        }
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries.map(e => e.isDirectory() ? `${e.name}/` : e.name).join('\n');
      } catch (err: any) {
        return `Error listing files: ${err.message}`;
      }
    },
  },
  {
    tool: {
      name: 'search_files',
      description: 'Search for a pattern in files using grep. Returns matching lines with file paths.',
      input_schema: {
        type: 'object' as const,
        properties: {
          pattern: { type: 'string', description: 'Search pattern (grep regex)' },
          path: { type: 'string', description: 'Directory to search in. Default "."' },
          include: { type: 'string', description: 'File glob pattern to include, e.g. "*.ts"' },
        },
        required: ['pattern'],
      },
    },
    execute: async (input, cwd) => {
      const searchPath = input.path as string || '.';
      let cmd = `grep -rn --include='${input.include || '*'}' '${(input.pattern as string).replace(/'/g, "'\\''")}' ${searchPath} | head -50`;
      const result = await shellExec(cmd, { cwd });
      return result.stdout || 'No matches found';
    },
  },
  {
    tool: {
      name: 'run_command',
      description: 'Run a shell command and return its output. Use for build, test, lint commands.',
      input_schema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'The shell command to run' },
        },
        required: ['command'],
      },
    },
    execute: async (input, cwd) => {
      const result = await shellExec(input.command as string, { cwd, timeout: 120_000 });
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
      return `Exit code: ${result.exitCode}\n${output}`;
    },
  },
];
