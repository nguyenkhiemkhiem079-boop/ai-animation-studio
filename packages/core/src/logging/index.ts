/**
 * Structured contextual logging for AI Animation Studio.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  projectId?: string;
  seriesId?: string;
  episodeId?: string;
  shotId?: string;
  stepId?: string;
  providerId?: string;
  [key: string]: unknown;
}

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    details?: Record<string, unknown>;
  };
}

export type LogHandler = (record: LogRecord) => void;

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private minLevel: LogLevel;
  private defaultContext: LogContext;
  private handlers: LogHandler[] = [];

  constructor(options: { minLevel?: LogLevel; context?: LogContext; handlers?: LogHandler[] } = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.defaultContext = options.context ?? {};
    this.handlers = options.handlers ?? [this.defaultConsoleHandler.bind(this)];
  }

  public child(context: LogContext): Logger {
    return new Logger({
      minLevel: this.minLevel,
      context: { ...this.defaultContext, ...context },
      handlers: this.handlers,
    });
  }

  public setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  public addHandler(handler: LogHandler): void {
    this.handlers.push(handler);
  }

  public debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  public error(message: string, error?: Error | unknown, context?: LogContext): void {
    let errorObj: LogRecord['error'] = undefined;
    if (error instanceof Error) {
      errorObj = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as { code?: string }).code,
        details: (error as { details?: Record<string, unknown> }).details,
      };
    } else if (error) {
      errorObj = {
        name: 'UnknownError',
        message: String(error),
      };
    }
    this.log('error', message, context, errorObj);
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: LogRecord['error']): void {
    if (LOG_LEVEL_SEVERITY[level] < LOG_LEVEL_SEVERITY[this.minLevel]) {
      return;
    }

    const mergedContext = { ...this.defaultContext, ...context };
    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: Object.keys(mergedContext).length > 0 ? mergedContext : undefined,
      error,
    };

    for (const handler of this.handlers) {
      try {
        handler(record);
      } catch (err) {
        console.error('Error inside log handler:', err);
      }
    }
  }

  private defaultConsoleHandler(record: LogRecord): void {
    const ctxStr = record.context ? ` [${JSON.stringify(record.context)}]` : '';
    const output = `[${record.timestamp}] [${record.level.toUpperCase()}] ${record.message}${ctxStr}`;
    switch (record.level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output, record.error ?? '');
        break;
    }
  }
}

export const defaultLogger = new Logger();
