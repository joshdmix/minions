export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',  // gray
  info: '\x1b[36m',   // cyan
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
};
const RESET = '\x1b[0m';

let minLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export function log(level: LogLevel, component: string, message: string, data?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const timestamp = new Date().toISOString().slice(11, 23);
  const color = LEVEL_COLORS[level];
  const prefix = `${color}[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${component}]${RESET}`;
  const suffix = data ? ` ${JSON.stringify(data)}` : '';
  console.error(`${prefix} ${message}${suffix}`);
}

export const logger = {
  debug: (component: string, msg: string, data?: Record<string, unknown>) => log('debug', component, msg, data),
  info: (component: string, msg: string, data?: Record<string, unknown>) => log('info', component, msg, data),
  warn: (component: string, msg: string, data?: Record<string, unknown>) => log('warn', component, msg, data),
  error: (component: string, msg: string, data?: Record<string, unknown>) => log('error', component, msg, data),
};
