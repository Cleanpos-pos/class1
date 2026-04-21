/**
 * Production-safe logger utility
 * - In production: Only logs errors and warnings
 * - In development: Logs everything
 */

const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const noop = () => {};

// Sanitize sensitive data from logs
const sanitize = (args: unknown[]): unknown[] => {
  return args.map(arg => {
    if (typeof arg === 'string') {
      // Redact potential sensitive data
      return arg
        .replace(/password['":\s]*[^,}\s]*/gi, 'password: [REDACTED]')
        .replace(/api[_-]?key['":\s]*[^,}\s]*/gi, 'api_key: [REDACTED]')
        .replace(/token['":\s]*[^,}\s]*/gi, 'token: [REDACTED]')
        .replace(/secret['":\s]*[^,}\s]*/gi, 'secret: [REDACTED]');
    }
    if (typeof arg === 'object' && arg !== null) {
      const obj = arg as Record<string, unknown>;
      const sanitized: Record<string, unknown> = {};
      for (const key in obj) {
        if (['password', 'api_key', 'apiKey', 'token', 'secret'].includes(key.toLowerCase())) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = obj[key];
        }
      }
      return sanitized;
    }
    return arg;
  });
};

export const logger: Logger = {
  debug: isDevelopment
    ? (...args: unknown[]) => console.log('[DEBUG]', ...sanitize(args))
    : noop,

  info: isDevelopment
    ? (...args: unknown[]) => console.info('[INFO]', ...sanitize(args))
    : noop,

  warn: (...args: unknown[]) => console.warn('[WARN]', ...sanitize(args)),

  error: (...args: unknown[]) => console.error('[ERROR]', ...sanitize(args)),
};

export default logger;
