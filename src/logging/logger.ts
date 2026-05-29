/**
 * Winston logger.
 *
 * - JSON to stdout (machine-parseable).
 * - Optional rotating file under `<dataDir>/logs/openzigs-social.log`.
 * - All metadata is passed through {@link redact} so secrets never hit disk.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import winston from "winston";

import { logsDir } from "../config/paths.js";
import { redact } from "./redact.js";

const LOG_FILE = "openzigs-social.log";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 5;

/** Winston format that redacts secrets from log metadata. */
const redactFormat = winston.format((info) => {
  return redact(info) as winston.Logform.TransformableInfo;
});

export interface LoggerOptions {
  level?: string;
  /** Write a rotating file transport in addition to stdout. */
  toFile?: boolean;
  /** Directory for the log file (defaults to <dataDir>/logs). */
  dir?: string;
}

/** Build a configured Winston logger. */
export function createLogger(opts: LoggerOptions = {}): winston.Logger {
  const level = opts.level ?? process.env.LOG_LEVEL ?? "info";
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        redactFormat(),
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ];

  if (opts.toFile) {
    const dir = opts.dir ?? logsDir();
    mkdirSync(dir, { recursive: true });
    transports.push(
      new winston.transports.File({
        filename: join(dir, LOG_FILE),
        maxsize: MAX_FILE_BYTES,
        maxFiles: MAX_FILES,
        tailable: true,
        format: winston.format.combine(
          redactFormat(),
          winston.format.timestamp(),
          winston.format.json()
        )
      })
    );
  }

  return winston.createLogger({ level, transports });
}

/**
 * Default process logger (stdout only). The server bootstrap replaces this
 * with a file-backed instance built from config via {@link createLogger}.
 */
export const logger = createLogger({ toFile: false });
