/**
 * Winston logger configuration.
 * Outputs JSON in production, colorized text in development.
 */

import winston from 'winston';
import { isDev } from '../config/env';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// Human-readable format for development
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    let log = `[${ts}] ${level}: ${message}`;
    if (stack) log += `\n${stack}`;
    const metaStr = Object.keys(meta).length
      ? '\n' + JSON.stringify(meta, null, 2)
      : '';
    return log + metaStr;
  }),
);

// Structured JSON format for production
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
);

export const logger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  format: isDev ? devFormat : prodFormat,
  transports: [
    new winston.transports.Console(),
    // In production you'd typically ship logs to a service,
    // but we also write to files as a baseline:
    ...(isDev
      ? []
      : [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
          }),
        ]),
  ],
  exitOnError: false,
});

// Capture unhandled rejections via winston
logger.rejections.handle(
  new winston.transports.Console(),
);

export type Logger = typeof logger;
