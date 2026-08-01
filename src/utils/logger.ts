import winston from "winston";
import path from "path";

const levels = { error: 0, warn: 1, info: 2, http: 3, debug: 4 };
const colors = { error: "red", warn: "yellow", info: "green", http: "magenta", debug: "cyan" };
winston.addColors(colors);

function getLogLevel(): string {
  const env = process.env.NODE_ENV || "development";
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;

  switch (env) {
    case "production":
      return "info";
    case "test":
      return "error";
    default:
      return "debug";
  }
}

const devConsoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

const prodConsoleFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.uncolorize(),
  winston.format.json()
);

function createTransports(): winston.transport[] {
  const env = process.env.NODE_ENV || "development";
  const transports: winston.transport[] = [];

  if (env !== "test") {
    transports.push(
      new winston.transports.Console({ format: env === "production" ? prodConsoleFormat : devConsoleFormat })
    );

    const logsDir = path.join(process.cwd(), "logs");
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, "error.log"),
        level: "error",
        format: fileFormat,
        maxsize: 5242880,
        maxFiles: 5,
      })
    );
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, "combined.log"),
        format: fileFormat,
        maxsize: 5242880,
        maxFiles: 5,
      })
    );
  }

  return transports;
}

const logger = winston.createLogger({
  level: getLogLevel(),
  levels,
  transports: createTransports(),
  exitOnError: false,
  // In test env there are no transports (avoids file/console noise during test runs).
  // `silent` short-circuits the write path entirely instead of just leaving it empty,
  // which avoids Winston's own "attempt to write with no transports" console.error warning.
  silent: (process.env.NODE_ENV || "development") === "test",
});

export function logHttpRequest(method: string, url: string, statusCode: number, responseTime: number): void {
  const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "http";
  logger.log(level, `${method} ${url} ${statusCode} - ${responseTime}ms`);
}

export default logger;
