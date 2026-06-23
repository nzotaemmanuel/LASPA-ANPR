const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format: timestamp + level + message + any metadata
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.errors({ stack: true }),
  format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `[${timestamp}] ${level.toUpperCase().padEnd(5)}: ${stack || message}${metaStr}`;
  })
);

// ── Transports ────────────────────────────────────────────────────────────────

// Combined log — all levels, rotates daily, keeps 14 days
const combinedTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  level: 'info',
  format: logFormat,
});

// Error log — only errors, rotates daily, keeps 30 days
const errorTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '30d',
  level: 'error',
  format: logFormat,
});

// Console — colourised in dev, plain in prod
const consoleTransport = new transports.Console({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  format: format.combine(
    format.colorize(),
    format.timestamp({ format: 'HH:mm:ss' }),
    format.printf(({ timestamp, level, message, stack }) =>
      `[${timestamp}] ${level}: ${stack || message}`
    )
  ),
});

// ── Logger instance ───────────────────────────────────────────────────────────
const logger = createLogger({
  level: 'info',
  transports: [combinedTransport, errorTransport, consoleTransport],
  exitOnError: false,
});

// ── Override console so all existing code logs to file automatically ──────────
const origLog   = console.log.bind(console);
const origInfo  = console.info?.bind(console) ?? origLog;
const origWarn  = console.warn.bind(console);
const origError = console.error.bind(console);

console.log   = (...args) => logger.info(args.join(' '));
console.info  = (...args) => logger.info(args.join(' '));
console.warn  = (...args) => logger.warn(args.join(' '));
console.error = (...args) => {
  const msg = args.map(a => (a instanceof Error ? a.stack : String(a))).join(' ');
  logger.error(msg);
};

// Handle uncaught exceptions and unhandled promise rejections
logger.exceptions.handle(
  new DailyRotateFile({
    filename: path.join(logsDir, 'exceptions-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d',
    format: logFormat,
  })
);

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Promise Rejection: ${reason instanceof Error ? reason.stack : reason}`);
});

logger.info(`Logger initialised. Log files → ${logsDir}`);

module.exports = logger;
