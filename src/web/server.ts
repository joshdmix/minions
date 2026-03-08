import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PipelineEventBus, PipelineEvent } from '../pipeline/events.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface WebServerOptions {
  port: number;
  eventBus: PipelineEventBus;
}

export async function startWebServer(options: WebServerOptions): Promise<{ url: string; close: () => void }> {
  const { port, eventBus } = options;
  const clients = new Set<ServerResponse>();

  // Buffer events so late-connecting clients get history
  const eventHistory: PipelineEvent[] = [];
  eventBus.on('event', (event) => {
    eventHistory.push(event);
    for (const res of clients) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/events') {
      // SSE endpoint
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Send event history to catch up
      for (const event of eventHistory) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.url === '/' || req.url === '/index.html') {
      try {
        const html = await readFile(join(__dirname, 'ui.html'), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } catch {
        res.writeHead(500);
        res.end('Failed to load UI');
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return new Promise((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Try --port <other>`));
      } else {
        reject(err);
      }
    });
    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      logger.info('web', `Dashboard running at ${url}`);
      resolve({
        url,
        close: () => {
          for (const client of clients) client.end();
          clients.clear();
          server.close();
        },
      });
    });
  });
}
