import pino from 'pino';

export const loggerPrefix = '[Eppo SDK]';

const isNode = typeof window === 'undefined';

// Create a Pino logger instance
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  // https://getpino.io/#/docs/browser
  browser: { disabled: isNode },
});
