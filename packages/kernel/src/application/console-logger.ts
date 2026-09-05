import { type LoggerPort } from "../ports/logger.port";

/**
 * A basic console logger implementation of the LoggerPort.
 * Safely wraps console methods to satisfy the no-console lint rule centrally.
 */
export class ConsoleLogger implements LoggerPort {
  debug(msg: string, meta?: Record<string, unknown>): void {
    /* eslint-disable no-console */
    if (meta) {
      console.debug(`[DEBUG] ${msg}`, meta);
    } else {
      console.debug(`[DEBUG] ${msg}`);
    }
    /* eslint-enable no-console */
  }

  info(msg: string, meta?: Record<string, unknown>): void {
    /* eslint-disable no-console */
    if (meta) {
      console.info(`[INFO] ${msg}`, meta);
    } else {
      console.info(`[INFO] ${msg}`);
    }
    /* eslint-enable no-console */
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    /* eslint-disable no-console */
    if (meta) {
      console.warn(`[WARN] ${msg}`, meta);
    } else {
      console.warn(`[WARN] ${msg}`);
    }
    /* eslint-enable no-console */
  }

  error(msg: string, meta?: Record<string, unknown>): void {
    /* eslint-disable no-console */
    if (meta) {
      console.error(`[ERROR] ${msg}`, meta);
    } else {
      console.error(`[ERROR] ${msg}`);
    }
    /* eslint-enable no-console */
  }
}

export const logger = new ConsoleLogger();
