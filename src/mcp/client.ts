import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { McpServerConfig } from '../config.js';
import type { ToolDefinition } from '../agent/tools.js';
import { logger } from '../utils/logger.js';
import type Anthropic from '@anthropic-ai/sdk';

interface ConnectedServer {
  name: string;
  client: Client;
  transport: StdioClientTransport;
}

export class McpManager {
  private servers: ConnectedServer[] = [];

  async connect(configs: McpServerConfig[]): Promise<ToolDefinition[]> {
    const allTools: ToolDefinition[] = [];

    for (const config of configs) {
      try {
        logger.info('mcp', `Connecting to MCP server: ${config.name}`);

        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: config.env ? { ...process.env, ...config.env } as Record<string, string> : undefined,
        });

        const client = new Client({
          name: 'minions',
          version: '0.1.0',
        });

        await client.connect(transport);
        this.servers.push({ name: config.name, client, transport });

        // List tools from this server
        const { tools } = await client.listTools();
        logger.info('mcp', `Got ${tools.length} tools from ${config.name}`);

        for (const mcpTool of tools) {
          const toolName = `${config.name}__${mcpTool.name}`;
          allTools.push({
            tool: {
              name: toolName,
              description: mcpTool.description ?? '',
              input_schema: mcpTool.inputSchema as Anthropic.Tool['input_schema'],
            },
            execute: async (input: Record<string, unknown>) => {
              const result = await client.callTool({
                name: mcpTool.name,
                arguments: input,
              });
              // MCP tool results are content arrays
              if (Array.isArray(result.content)) {
                return result.content
                  .map((c: any) => (c.type === 'text' ? c.text : JSON.stringify(c)))
                  .join('\n');
              }
              return JSON.stringify(result.content);
            },
          });
        }
      } catch (err: any) {
        logger.warn('mcp', `Failed to connect to ${config.name}: ${err.message}`);
      }
    }

    return allTools;
  }

  async disconnect(): Promise<void> {
    for (const server of this.servers) {
      try {
        await server.client.close();
        logger.info('mcp', `Disconnected from ${server.name}`);
      } catch {
        // Ignore disconnect errors
      }
    }
    this.servers = [];
  }
}
