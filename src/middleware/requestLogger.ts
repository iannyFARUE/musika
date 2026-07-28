import { Request, Response, NextFunction } from "express";
import logger, { logHttpRequest } from "../utils/logger";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  logger.debug(`Incoming request: ${req.method} ${req.url}`, {
    headers: {
      "user-agent": req.get("user-agent"),
      "content-type": req.get("content-type"),
    },
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip,
  });

  res.on("finish", () => {
    const responseTime = Date.now() - startTime;
    logHttpRequest(req.method, req.url, res.statusCode, responseTime);
  });

  next();
}
