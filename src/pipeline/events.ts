import { EventEmitter } from 'node:events';

export type PipelineEventType =
  | 'pipeline:start'
  | 'node:start'
  | 'node:complete'
  | 'pipeline:complete'
  | 'log';

export interface PipelineEvent {
  type: PipelineEventType;
  timestamp: string;
  node?: string;
  nodeType?: 'deterministic' | 'agentic';
  success?: boolean;
  output?: string;
  next?: string | null;
  task?: string;
  nodes?: string[];
  level?: string;
  component?: string;
  message?: string;
}

export class PipelineEventBus extends EventEmitter {
  emit(event: 'event', data: PipelineEvent): boolean {
    return super.emit('event', data);
  }

  on(event: 'event', listener: (data: PipelineEvent) => void): this {
    return super.on('event', listener);
  }

  send(data: Omit<PipelineEvent, 'timestamp'>): void {
    this.emit('event', { ...data, timestamp: new Date().toISOString() });
  }
}
