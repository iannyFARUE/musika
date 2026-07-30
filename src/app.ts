import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { closeDatabaseConnection, connectToDatabase, verifyRequirements } from "./config/database";
import { errorHandler } from "./utils/errorHandler";
import logger from "./utils/logger";
import { requestLogger } from "./middleware/requestLogger";
import productsRouter from "./routes/products";

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3001;

const corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

app.use(cors({ origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(requestLogger);

app.use("/api/products", productsRouter);

app.get("/", (req, res) => {
  res.json({
    name: "Musika API",
    version: "1.0.0",
    description: "Express.js backend for the Musika product catalog",
    endpoints: {
      products: "/api/products",
      documentation: "/api-docs",
    },
  });
});

app.use(errorHandler);

async function startServer() {
  try {
    logger.info("Starting Musika API...");
    logger.info("Connecting to MongoDB...");
    await connectToDatabase();
    logger.info("Connected to MongoDB successfully");

    logger.info("Verifying requirements (indexes and sample data)...");
    await verifyRequirements();
    logger.info("All requirements verified successfully");

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  logger.info("Received SIGINT. Shutting down gracefully...");
  closeDatabaseConnection();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM. Shutting down gracefully...");
  closeDatabaseConnection();
  process.exit(0);
});

export { app };

if (require.main === module) {
  startServer();
}
