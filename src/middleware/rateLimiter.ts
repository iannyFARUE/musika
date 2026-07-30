import rateLimit from "express-rate-limit";
import { createErrorResponse } from "../utils/errorHandler";

export const productsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(createErrorResponse("Too many requests. Please try again later.", "RATE_LIMIT_EXCEEDED"));
  },
});
