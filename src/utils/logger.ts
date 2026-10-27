type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (data instanceof Error) {
    return `${base}: ${data.message}`;
  }
  if (data !== undefined) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
}

export const logger = {
  debug(message: string, data?: unknown) {
    if (shouldLog("debug")) {
      process.stderr.write(formatMessage("debug", message, data) + "\n");
    }
  },
  info(message: string, data?: unknown) {
    if (shouldLog("info")) {
      process.stderr.write(formatMessage("info", message, data) + "\n");
    }
  },
  warn(message: string, data?: unknown) {
    if (shouldLog("warn")) {
      process.stderr.write(formatMessage("warn", message, data) + "\n");
    }
  },
  error(message: string, data?: unknown) {
    if (shouldLog("error")) {
      process.stderr.write(formatMessage("error", message, data) + "\n");
    }
  },
};
