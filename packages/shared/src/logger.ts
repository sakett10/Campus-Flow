export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string | undefined;
  jobId?: string | undefined;
  userId?: string | undefined;
  agentRunId?: string | undefined;
  auditEventId?: string | undefined;
  module?: string | undefined;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: unknown, context?: LogContext): void;
  child(defaultContext: LogContext): Logger;
}

class StructuredLogger implements Logger {
  constructor(private readonly baseContext: LogContext = {}) {}

  private formatEntry(
    level: LogLevel,
    message: string,
    extraContext?: LogContext,
    err?: unknown,
  ): string {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.baseContext,
      ...extraContext,
    };

    if (err) {
      if (err instanceof Error) {
        entry['error'] = {
          name: err.name,
          message: err.message,
          stack: process.env['NODE_ENV'] === 'production' ? undefined : err.stack,
        };
      } else {
        entry['error'] = String(err);
      }
    }

    return JSON.stringify(entry);
  }

  debug(message: string, context?: LogContext): void {
    if (process.env['NODE_ENV'] !== 'production' || process.env['LOG_LEVEL'] === 'debug') {
      process.stdout.write(this.formatEntry('debug', message, context) + '\n');
    }
  }

  info(message: string, context?: LogContext): void {
    process.stdout.write(this.formatEntry('info', message, context) + '\n');
  }

  warn(message: string, context?: LogContext): void {
    process.stderr.write(this.formatEntry('warn', message, context) + '\n');
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    process.stderr.write(this.formatEntry('error', message, context, error) + '\n');
  }

  child(defaultContext: LogContext): Logger {
    return new StructuredLogger({
      ...this.baseContext,
      ...defaultContext,
    });
  }
}

export function createLogger(defaultContext: LogContext = {}): Logger {
  return new StructuredLogger(defaultContext);
}
