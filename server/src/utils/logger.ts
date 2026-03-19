type LogLevel = "INFO" | "WARN" | "ERROR";

const buildPrefix = (level: LogLevel) => `[YourMsgr][${level}]`;

const serializeMeta = (meta: unknown) => {
  if (meta === undefined) {
    return "";
  }

  if (meta instanceof Error) {
    return meta.stack ?? meta.message;
  }

  if (typeof meta === "string") {
    return meta;
  }

  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
};

const writeLog = (writer: (...args: unknown[]) => void, level: LogLevel, message: string, meta?: unknown) => {
  const suffix = serializeMeta(meta);
  if (suffix) {
    writer(`${buildPrefix(level)} ${message}`, suffix);
    return;
  }

  writer(`${buildPrefix(level)} ${message}`);
};

export const logger = {
  info(message: string, meta?: unknown) {
    writeLog(console.log, "INFO", message, meta);
  },
  warn(message: string, meta?: unknown) {
    writeLog(console.warn, "WARN", message, meta);
  },
  error(message: string, meta?: unknown) {
    writeLog(console.error, "ERROR", message, meta);
  },
};
