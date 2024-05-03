import pino from 'pino';
import pretty from 'pino-pretty';

const prettyStream = pretty({
  translateTime: true,
  ignore: 'pid,hostname',
  messageFormat: '[Eppo SDK] {msg}',
});

// Create a Pino logger instance
export const logger = pino(
  {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    // https://getpino.io/#/docs/browser
    browser: { disabled: true },
  },
  prettyStream,
);
