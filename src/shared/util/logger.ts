import { APP_NAME } from '../consts';

class Logger {
  readonly console: Console;

  constructor(
    public readonly prefix: string = APP_NAME,
    consoleInstance: Console = console,
  ) {
    this.console = consoleInstance;
  }

  log(...args: unknown[]) {
    this.logger('log', ...args);
  }

  error(...args: unknown[]) {
    this.logger('error', ...args);
  }

  warn(...args: unknown[]) {
    this.logger('warn', ...args);
  }

  private logger(method: 'log' | 'error' | 'warn', ...args: unknown[]) {
    this.console[method](
      `[${this.prefix}] [${new Date().toString()}]`,
      ...args,
    );
  }
}

export const logger = new Logger();
