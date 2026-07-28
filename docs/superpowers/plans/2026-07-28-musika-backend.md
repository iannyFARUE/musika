# Musika Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Express 5 + TypeScript + MongoDB Atlas backend for an e-commerce product catalog (Musika), replicating the architecture and MongoDB best practices of MongoDB's sample-app-nodejs-mflix reference backend against a custom domain.

**Architecture:** Layered structure (`config/`, `controllers/`, `middleware/`, `routes/`, `types/`, `utils/`) with the official MongoDB Node driver (no ODM), built as vertical feature slices of increasing complexity: skeleton → CRUD → search/filtering → aggregations → Atlas Search → Vector Search → hardening.

**Tech Stack:** Node.js LTS 22, TypeScript 5, Express 5, `mongodb` driver v7, `winston`, `express-rate-limit`, `cors`, `swagger-jsdoc`/`swagger-ui-express`, `jest`/`ts-jest`/`supertest`, `@faker-js/faker`, ESLint (flat config, `typescript-eslint`) + Prettier.

**Spec:** `docs/superpowers/specs/2026-07-28-backend-design.md`

## Global Constraints

- Runtime: Node.js LTS 22, TypeScript 5, `strict: true`, CommonJS module output.
- Database access via the official `mongodb` driver only — no ODM (Mongoose etc.).
- Package manager: npm.
- Database name: `musika`. Collections: `products`, `reviews`, `embedded_products`.
- Response envelope is fixed: `{ success, message, data, timestamp }` on success,
  `{ success: false, message, error: { message, code, details }, timestamp }` on error.
- Every route handler is wrapped in `asyncHandler`; the central `errorHandler`
  middleware is always the last middleware in `app.ts`.
- Any endpoint that accepts a user-supplied MongoDB filter or update object (batch
  update/delete) MUST sanitize it through the field/operator allow-list in
  `utils/mongoQuery.ts` before it reaches the driver — never pass a raw `req.body`
  filter straight into `updateMany`/`deleteMany`.
- All `/api/products` routes go through `productsRateLimiter`, overridable via the
  `RATE_LIMIT_MAX` env var (tests set it high to avoid 429s).
- Unit tests (`tests/controllers/**`) mock the database collection — no real DB calls.
  Integration tests (`tests/integration/**`) hit a real MongoDB and self-skip when
  `MONGODB_URI` is unset.
- `npm run lint` must pass with zero errors before each commit.
- Required fields on product creation: `name`, `price`.

---

## Task 1: Initialize project scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `README.md` (placeholder, filled in fully in Task 24)
- Create: `src/`, `tests/controllers/`, `tests/integration/`, `tests/utils/`, `scripts/` (empty dirs via `.gitkeep` where needed)

**Interfaces:**
- Produces: npm scripts (`dev`, `build`, `start`, `lint`, `format`, `test`, `test:unit`,
  `test:integration`, `seed`, `embeddings`) that every later task relies on.

- [ ] **Step 1: Initialize npm project**

```bash
npm init -y
```

- [ ] **Step 2: Edit `package.json`**

```json
{
  "name": "musika",
  "version": "1.0.0",
  "description": "Express.js + MongoDB backend for the Musika product catalog",
  "license": "MIT",
  "type": "commonjs",
  "main": "dist/src/app.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/src/app.js",
    "dev": "ts-node src/app.ts",
    "seed": "ts-node scripts/seed.ts",
    "embeddings": "ts-node scripts/generateEmbeddings.ts",
    "lint": "eslint src tests scripts",
    "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\" \"scripts/**/*.ts\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/controllers",
    "test:integration": "jest --config jest.integration.config.json"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
npm install express cors dotenv express-rate-limit mongodb swagger-jsdoc swagger-ui-express winston
npm install -D typescript ts-node @types/node @types/express @types/cors @types/swagger-jsdoc @types/swagger-ui-express jest ts-jest @types/jest supertest @types/supertest @faker-js/faker eslint @eslint/js typescript-eslint eslint-config-prettier prettier
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
coverage/
logs/
.env
*.log
```

- [ ] **Step 5: Create directory structure and placeholder README**

```bash
mkdir -p src/config src/controllers src/middleware src/routes src/types src/utils
mkdir -p tests/controllers tests/integration tests/utils scripts
```

`README.md`:
```markdown
# Musika

Express.js + TypeScript + MongoDB backend for a product catalog API, built as a
step-by-step replica of MongoDB's sample-app-nodejs-mflix architecture.

Setup instructions coming in a later task.
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore README.md src tests scripts
git commit -m "chore: initialize project scaffold and dependencies"
```

---

## Task 2: TypeScript configuration

**Files:**
- Create: `tsconfig.json`

**Interfaces:**
- Produces: compiler config every subsequent `.ts` file is written against
  (`strict: true`, CommonJS, `outDir: ./dist`).

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["jest", "node"]
  },
  "include": ["src/**/*", "tests/**/*", "scripts/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Verify it compiles with no source files yet**

```bash
npx tsc --noEmit
```

Expected: no errors (nothing to type-check yet).

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add TypeScript configuration"
```

---

## Task 3: ESLint + Prettier configuration

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.prettierignore`

**Interfaces:**
- Produces: `npm run lint` / `npm run format`, required to pass before every later commit
  per Global Constraints.

- [ ] **Step 1: Create `eslint.config.js`**

```js
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "logs/**"],
  }
);
```

- [ ] **Step 2: Create `.prettierrc`**

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": false,
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
dist/
coverage/
logs/
node_modules/
```

- [ ] **Step 4: Verify lint runs clean**

```bash
npm run lint
```

Expected: exits 0 (no files to lint yet, or zero errors).

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js .prettierrc .prettierignore
git commit -m "chore: add ESLint and Prettier configuration"
```

---

## Task 4: MongoDB Atlas + Voyage AI setup (manual — do this yourself, not via subagent)

**Files:**
- Create: `.env` (not committed — contains secrets)
- Create: `.env.example`

**Interfaces:**
- Produces: a working `MONGODB_URI` and (optional at this stage) `VOYAGE_API_KEY` that
  every task from Task 7 onward depends on to connect to a real database.

This task requires clicking through external web UIs and cannot be delegated to a
subagent. Complete it yourself before continuing.

- [ ] **Step 1: Create a free MongoDB Atlas account**

Go to https://www.mongodb.com/cloud/atlas/register and sign up (or sign in if you
already have an account).

- [ ] **Step 2: Create an M0 (free tier) cluster**

In the Atlas UI: "Create" → choose the free "M0" tier → pick any cloud provider/region
close to you → name it (e.g. `musika-cluster`) → create.

- [ ] **Step 3: Create a database user**

Database Access → "Add New Database User" → username/password auth → save the
username and password somewhere safe (you'll need them for the connection string).

- [ ] **Step 4: Allow network access**

Network Access → "Add IP Address" → for local development, "Allow Access from Anywhere"
(0.0.0.0/0) is simplest; tighten this later if deploying anywhere.

- [ ] **Step 5: Get the connection string and create `.env`**

Clusters → "Connect" → "Drivers" → copy the `mongodb+srv://...` connection string.

Create `.env` in the project root (this file is gitignored):

```
MONGODB_URI="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/musika?retryWrites=true&w=majority"

# Required for the Vector Search milestone (Task 20+) — leave commented out until then
# VOYAGE_API_KEY=your_voyage_api_key

PORT=3001
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000
LOG_LEVEL=debug
```

Replace `<username>`, `<password>`, `<cluster>` with your real values, and note the
database name is set to `musika` in the URI path.

- [ ] **Step 6: Get a Voyage AI API key (can be deferred to Task 20)**

Go to https://www.voyageai.com/, sign up, and generate an API key from the dashboard
(free tier is sufficient). You can skip this until Task 20 (Vector Search) if you'd
rather not set it up yet — just leave `VOYAGE_API_KEY` commented out in `.env` for now.

- [ ] **Step 7: Create `.env.example` (committed, no real secrets)**

```
# MongoDB Connection
# Replace with your MongoDB Atlas connection string
MONGODB_URI="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/musika?retryWrites=true&w=majority"

# OPTIONAL: Voyage AI Configuration (required for Vector Search)
# Get your API key from https://www.voyageai.com/
# VOYAGE_API_KEY=your_voyage_api_key

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS Configuration
CORS_ORIGINS=http://localhost:3000

# Logging Configuration
# Available levels: error, warn, info, http, debug
LOG_LEVEL=debug
```

- [ ] **Step 8: Commit (only `.env.example` — verify `.env` is not staged)**

```bash
git status
git add .env.example
git commit -m "chore: add environment variable template"
```

---

## Task 5: Response types and error handling utilities

**Files:**
- Create: `src/types/index.ts`
- Create: `src/utils/errorHandler.ts`
- Test: `tests/utils/errorHandler.test.ts`

**Interfaces:**
- Produces: `SuccessResponse<T>`, `ErrorResponse`, `ApiResponse<T>` types;
  `ValidationError` class; `createSuccessResponse(data, message?)`,
  `createErrorResponse(message, code?, details?)`, `validateRequiredFields(body, fields)`,
  `asyncHandler(fn)` functions — used by every controller from Task 11 onward.

- [ ] **Step 1: Create `src/types/index.ts` with response envelope types**

```typescript
export type SuccessResponse<T> = {
  success: true;
  message?: string;
  data: T;
  timestamp: string;
};

export type ErrorResponse = {
  success: false;
  message: string;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
  timestamp: string;
};

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
```

- [ ] **Step 2: Write the failing test for `errorHandler.ts`**

```typescript
// tests/utils/errorHandler.test.ts
import {
  createSuccessResponse,
  createErrorResponse,
  validateRequiredFields,
  asyncHandler,
  ValidationError,
} from "../../src/utils/errorHandler";
import { Request, Response, NextFunction } from "express";

describe("createSuccessResponse", () => {
  it("wraps data with success:true and a default message", () => {
    const result = createSuccessResponse({ id: 1 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 1 });
    expect(result.message).toBe("Operation completed successfully");
    expect(typeof result.timestamp).toBe("string");
  });

  it("uses a custom message when provided", () => {
    const result = createSuccessResponse([], "Found 0 items");
    expect(result.message).toBe("Found 0 items");
  });
});

describe("createErrorResponse", () => {
  it("wraps a message, code, and details with success:false", () => {
    const result = createErrorResponse("Bad input", "BAD_INPUT", "field X missing");
    expect(result.success).toBe(false);
    expect(result.error).toEqual({
      message: "Bad input",
      code: "BAD_INPUT",
      details: "field X missing",
    });
  });
});

describe("validateRequiredFields", () => {
  it("does not throw when all required fields are present", () => {
    expect(() =>
      validateRequiredFields({ name: "Widget", price: 10 }, ["name", "price"])
    ).not.toThrow();
  });

  it("throws ValidationError listing missing fields", () => {
    expect(() => validateRequiredFields({ name: "Widget" }, ["name", "price"])).toThrow(
      ValidationError
    );
    expect(() => validateRequiredFields({ name: "Widget" }, ["name", "price"])).toThrow(
      "Missing required fields: price"
    );
  });
});

describe("asyncHandler", () => {
  it("forwards async errors to next()", async () => {
    const req = {} as Request;
    const res = {} as Response;
    const next = jest.fn() as NextFunction;
    const failingHandler = asyncHandler(async () => {
      throw new Error("boom");
    });

    await failingHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx jest tests/utils/errorHandler.test.ts
```

Expected: FAIL — `Cannot find module '../../src/utils/errorHandler'`.

- [ ] **Step 4: Implement `src/utils/errorHandler.ts`**

```typescript
import { Request, Response, NextFunction } from "express";
import { MongoError } from "mongodb";
import { SuccessResponse, ErrorResponse } from "../types";
import logger from "./logger";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function createSuccessResponse<T>(data: T, message?: string): SuccessResponse<T> {
  return {
    success: true,
    message: message || "Operation completed successfully",
    data,
    timestamp: new Date().toISOString(),
  };
}

export function createErrorResponse(
  message: string,
  code?: string,
  details?: any
): ErrorResponse {
  return {
    success: false,
    message,
    error: { message, code, details },
    timestamp: new Date().toISOString(),
  };
}

export function validateRequiredFields(body: any, requiredFields: string[]): void {
  const missingFields = requiredFields.filter((field) => body[field] == null || body[field] === "");

  if (missingFields.length > 0) {
    throw new ValidationError(`Missing required fields: ${missingFields.join(", ")}`);
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      fn(req, res, next).catch(next);
    } catch (error) {
      next(error);
    }
  };
}

function parseErrorDetails(err: Error): {
  message: string;
  code: string;
  details?: any;
  statusCode: number;
} {
  if (err instanceof MongoError) {
    switch (err.code) {
      case 11000:
        return {
          message: "Duplicate key error",
          code: "DUPLICATE_KEY",
          details: "A document with this data already exists",
          statusCode: 409,
        };
      case 121:
        return {
          statusCode: 400,
          message: "Document validation failed",
          code: "DOCUMENT_VALIDATION_ERROR",
          details: err.message,
        };
      default:
        return {
          message: "Database error",
          code: "DATABASE_ERROR",
          details: err.code,
          statusCode: 500,
        };
    }
  }

  if (err.name === "ValidationError") {
    return {
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      details: err.message,
      statusCode: 400,
    };
  }

  return {
    message: err.message || "Internal server error",
    code: "INTERNAL_ERROR",
    statusCode: 500,
  };
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error("Error occurred:", { message: err.message, stack: err.stack, url: req.url, method: req.method });

  const errorDetails = parseErrorDetails(err);
  const response: ErrorResponse = createErrorResponse(
    errorDetails.message,
    errorDetails.code,
    errorDetails.details
  );

  res.status(errorDetails.statusCode).json(response);
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest tests/utils/errorHandler.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/errorHandler.ts tests/utils/errorHandler.test.ts
git commit -m "feat: add response types and error handling utilities"
```

---

## Task 6: Logger utility

**Files:**
- Create: `src/utils/logger.ts`

**Interfaces:**
- Consumes: none.
- Produces: default-exported `logger` (winston instance) and `logHttpRequest(method, url, statusCode, responseTime)`, used by every module from here on.

- [ ] **Step 1: Implement `src/utils/logger.ts`**

```typescript
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
});

export function logHttpRequest(method: string, url: string, statusCode: number, responseTime: number): void {
  const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "http";
  logger.log(level, `${method} ${url} ${statusCode} - ${responseTime}ms`);
}

export default logger;
```

- [ ] **Step 2: Verify it compiles and runs**

```bash
npx tsc --noEmit
node -e "require('ts-node/register'); const l = require('./src/utils/logger').default; l.info('logger works');"
```

Expected: no type errors; the second command prints a colorized info log line.

- [ ] **Step 3: Commit**

```bash
git add src/utils/logger.ts
git commit -m "feat: add winston logger utility"
```

---

## Task 7: Database connection module

**Files:**
- Create: `src/config/database.ts`

**Interfaces:**
- Consumes: `logger` from `src/utils/logger.ts`.
- Produces: `connectToDatabase(): Promise<Db>`, `getCollection<T>(name): Collection<T>`,
  `closeDatabaseConnection(): Promise<void>`, `verifyRequirements(): Promise<void>` —
  used by `app.ts`, all controllers, and the seed/embeddings scripts.

- [ ] **Step 1: Implement `src/config/database.ts`**

```typescript
import { MongoClient, Db, Collection, Document } from "mongodb";
import logger from "../utils/logger";

let client: MongoClient;
let database: Db;

async function _connectToDatabase(): Promise<Db> {
  if (database) return database;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI environment variable is not defined. Please check your .env file."
    );
  }

  client = new MongoClient(uri, { appName: "musika-backend" });
  await client.connect();
  database = client.db("musika");

  logger.debug(`Connected to database: ${database.databaseName}`);
  return database;
}

let connect$: Promise<Db>;
export async function connectToDatabase(): Promise<Db> {
  connect$ ??= _connectToDatabase();
  return await connect$;
}

export function getCollection<T extends Document>(collectionName: string): Collection<T> {
  if (!database) {
    throw new Error("Database not connected.");
  }
  return database.collection(collectionName);
}

export async function closeDatabaseConnection(): Promise<void> {
  if (client) {
    await client.close();
    logger.info("Database connection closed");
  }
}

export async function verifyRequirements(): Promise<void> {
  const db = await connectToDatabase();
  await verifyProductsCollection(db);
  logger.debug("All database requirements verified successfully");
}

async function verifyProductsCollection(db: Db): Promise<void> {
  const productsCollection = db.collection("products");
  const productCount = await productsCollection.estimatedDocumentCount();

  if (productCount === 0) {
    logger.warn("Products collection is empty. Run `npm run seed` to load sample data.");
  }

  await createTextSearchIndex(productsCollection);
}

async function createTextSearchIndex(productsCollection: Collection<Document>): Promise<void> {
  const TEXT_INDEX_NAME = "text_search_index";

  try {
    const existingIndexes = await productsCollection.listIndexes().toArray();
    const existingTextIndex = existingIndexes.find((index) => index.key && index.key._fts === "text");

    if (existingTextIndex) {
      logger.debug(`Text search index '${existingTextIndex.name}' already exists on products collection`);
      return;
    }

    await productsCollection.createIndex(
      { name: "text", shortDescription: "text", description: "text" },
      { name: TEXT_INDEX_NAME, background: true }
    );
    logger.info(`Text search index '${TEXT_INDEX_NAME}' created successfully for products collection`);
  } catch (error) {
    logger.warn("Could not create text search index:", error);
    logger.warn("Text search functionality may not work without the index");
  }
}
```

- [ ] **Step 2: Verify it connects to your real Atlas cluster**

```bash
node -e "require('dotenv').config(); require('ts-node/register'); const db = require('./src/config/database'); db.connectToDatabase().then(() => { console.log('connected'); return db.verifyRequirements(); }).then(() => db.closeDatabaseConnection()).catch((e) => { console.error(e); process.exit(1); });"
```

Expected: prints `connected`, logs a warning that `products` is empty (expected — no
data seeded yet), creates the text index, then closes cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/config/database.ts
git commit -m "feat: add MongoDB connection module with text index verification"
```

---

## Task 8: Request logger middleware

**Files:**
- Create: `src/middleware/requestLogger.ts`

**Interfaces:**
- Consumes: `logger`, `logHttpRequest` from `src/utils/logger.ts`.
- Produces: `requestLogger` Express middleware, wired into `app.ts` in Task 9.

- [ ] **Step 1: Implement `src/middleware/requestLogger.ts`**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/middleware/requestLogger.ts
git commit -m "feat: add HTTP request logging middleware"
```

---

## Task 9: App bootstrap

**Files:**
- Create: `src/app.ts`

**Interfaces:**
- Consumes: `connectToDatabase`, `closeDatabaseConnection`, `verifyRequirements` from
  `config/database.ts`; `errorHandler` from `utils/errorHandler.ts`; `logger` from
  `utils/logger.ts`; `requestLogger` from `middleware/requestLogger.ts`.
- Produces: exported `app` (Express instance) used by `supertest` in integration tests
  from Task 23 onward. No product routes mounted yet — added starting Task 11.

- [ ] **Step 1: Implement `src/app.ts`**

```typescript
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { closeDatabaseConnection, connectToDatabase, verifyRequirements } from "./config/database";
import { errorHandler } from "./utils/errorHandler";
import logger from "./utils/logger";
import { requestLogger } from "./middleware/requestLogger";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

app.use(cors({ origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(requestLogger);

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
```

- [ ] **Step 2: Verify the server boots against your real Atlas cluster**

```bash
npm run dev
```

Expected: logs show "Connected to MongoDB successfully", "All requirements verified
successfully", "Server running on port 3001". Visit `http://localhost:3001/` in a
browser or `curl http://localhost:3001/` — expect the JSON info payload. Stop with
Ctrl+C and confirm the "Shutting down gracefully" log appears.

- [ ] **Step 3: Commit**

```bash
git add src/app.ts
git commit -m "feat: add Express app bootstrap with graceful shutdown"
```

---

## Task 10: Product/Review types and seed script

**Files:**
- Modify: `src/types/index.ts` (add `Product`, `Review`, `CreateProductRequest`, `UpdateProductRequest`)
- Create: `scripts/seed.ts`

**Interfaces:**
- Consumes: `connectToDatabase`, `closeDatabaseConnection`, `getCollection` from
  `config/database.ts`; `logger`.
- Produces: `Product`, `Review` interfaces and `CreateProductRequest`,
  `UpdateProductRequest` types used by every controller from Task 11 onward. Populates
  the `products` and `reviews` collections with sample data.

- [ ] **Step 1: Add domain types to `src/types/index.ts`**

Append to the existing file:

```typescript
import { ObjectId } from "mongodb";

export interface Product {
  _id?: ObjectId;
  name: string;
  price: number;
  shortDescription?: string;
  description?: string;
  categories?: string[];
  brand?: string;
  tags?: string[];
  seller?: string;
  weightGrams?: number;
  condition?: "new" | "used" | "refurbished";
  imageUrl?: string;
  countryOfOrigin?: string;
  sku?: string;
  rating?: {
    average?: number;
    count?: number;
  };
}

export interface Review {
  _id?: ObjectId;
  product_id: ObjectId;
  name: string;
  email: string;
  rating: number;
  text: string;
  date: Date;
}

export interface CreateProductRequest {
  name: string;
  price: number;
  shortDescription?: string;
  description?: string;
  categories?: string[];
  brand?: string;
  tags?: string[];
  seller?: string;
  weightGrams?: number;
  condition?: "new" | "used" | "refurbished";
  imageUrl?: string;
  countryOfOrigin?: string;
  sku?: string;
}

export interface UpdateProductRequest {
  name?: string;
  price?: number;
  shortDescription?: string;
  description?: string;
  categories?: string[];
  brand?: string;
  tags?: string[];
  seller?: string;
  weightGrams?: number;
  condition?: "new" | "used" | "refurbished";
  imageUrl?: string;
  countryOfOrigin?: string;
  sku?: string;
}
```

(`ObjectId` is already imported at the top of the file if you add this block below the
existing response-envelope types; add the import once.)

- [ ] **Step 2: Implement `scripts/seed.ts`**

```typescript
import dotenv from "dotenv";
dotenv.config();

import { faker } from "@faker-js/faker";
import { ObjectId } from "mongodb";
import { connectToDatabase, closeDatabaseConnection, getCollection } from "../src/config/database";
import { Product, Review } from "../src/types";
import logger from "../src/utils/logger";

const CATEGORIES = [
  "Electronics",
  "Home & Kitchen",
  "Sports & Outdoors",
  "Books",
  "Toys & Games",
  "Beauty & Personal Care",
  "Clothing",
  "Groceries",
];

const BRANDS = [
  "Nova",
  "Zenith",
  "Everline",
  "Crestwood",
  "Marrow",
  "Pinegate",
  "Solstice",
  "Harborlight",
  "Fieldstone",
  "Wrenfield",
];

const CONDITIONS: NonNullable<Product["condition"]>[] = ["new", "used", "refurbished"];
const PRODUCT_COUNT = 150;

function buildProduct(): Omit<Product, "_id"> {
  const categories = faker.helpers.arrayElements(CATEGORIES, { min: 1, max: 2 });
  const reviewCount = faker.number.int({ min: 0, max: 500 });

  return {
    name: faker.commerce.productName(),
    price: Number(faker.commerce.price({ min: 5, max: 800 })),
    shortDescription: faker.commerce.productDescription(),
    description: faker.lorem.paragraphs(2),
    categories,
    brand: faker.helpers.arrayElement(BRANDS),
    tags: faker.helpers.arrayElements(
      ["durable", "lightweight", "eco-friendly", "bestseller", "limited", "waterproof", "handmade"],
      { min: 1, max: 3 }
    ),
    seller: faker.company.name(),
    weightGrams: faker.number.int({ min: 50, max: 20000 }),
    condition: faker.helpers.arrayElement(CONDITIONS),
    imageUrl: faker.image.urlPicsumPhotos(),
    countryOfOrigin: faker.location.country(),
    sku: faker.string.alphanumeric(10).toUpperCase(),
    rating: {
      average:
        reviewCount > 0 ? Number(faker.number.float({ min: 1, max: 5, fractionDigits: 1 })) : undefined,
      count: reviewCount,
    },
  };
}

function buildReview(productId: ObjectId): Omit<Review, "_id"> {
  return {
    product_id: productId,
    name: faker.person.fullName(),
    email: faker.internet.email(),
    rating: faker.number.int({ min: 1, max: 5 }),
    text: faker.lorem.sentences(2),
    date: faker.date.past({ years: 2 }),
  };
}

async function seed() {
  await connectToDatabase();
  const productsCollection = getCollection<Product>("products");
  const reviewsCollection = getCollection<Review>("reviews");

  logger.info("Clearing existing products and reviews...");
  await productsCollection.deleteMany({});
  await reviewsCollection.deleteMany({});

  const products = Array.from({ length: PRODUCT_COUNT }, buildProduct);
  const insertResult = await productsCollection.insertMany(products);
  logger.info(`Inserted ${insertResult.insertedCount} products`);

  const reviews: Omit<Review, "_id">[] = [];
  for (const productId of Object.values(insertResult.insertedIds)) {
    const reviewCount = faker.number.int({ min: 0, max: 8 });
    for (let i = 0; i < reviewCount; i++) {
      reviews.push(buildReview(productId));
    }
  }

  if (reviews.length > 0) {
    const reviewInsertResult = await reviewsCollection.insertMany(reviews);
    logger.info(`Inserted ${reviewInsertResult.insertedCount} reviews`);
  }

  await closeDatabaseConnection();
  logger.info("Seed complete");
}

seed().catch((error) => {
  logger.error("Seed failed:", error);
  process.exit(1);
});
```

- [ ] **Step 3: Verify types compile and run the seed**

```bash
npx tsc --noEmit
npm run seed
```

Expected: no type errors; logs show ~150 products and several hundred reviews
inserted. Confirm in Atlas (Collections tab) that `musika.products` and
`musika.reviews` are populated.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts scripts/seed.ts
git commit -m "feat: add Product/Review types and database seed script"
```

---

## Task 11: List and get-by-id endpoints

**Files:**
- Create: `src/middleware/rateLimiter.ts`
- Create: `src/controllers/productController.ts`
- Create: `src/routes/products.ts`
- Modify: `src/app.ts` (mount `/api/products` router)
- Modify: `src/types/index.ts` (add `RawProductQuery`)
- Create: `tests/utils/testHelpers.ts`
- Test: `tests/controllers/productController.test.ts`

**Interfaces:**
- Consumes: `getCollection` from `config/database.ts`; `createSuccessResponse`,
  `createErrorResponse`, `asyncHandler` from `utils/errorHandler.ts`.
- Produces: `getAllProducts`, `getProductById` controller functions (exported from
  `productController.ts`, extended by later tasks); `productsRateLimiter` middleware;
  mounted `GET /api/products`, `GET /api/products/:id`.

- [ ] **Step 1: Add `RawProductQuery` to `src/types/index.ts`**

```typescript
export type RawProductQuery = {
  limit?: string;
  skip?: string;
  sortBy?: string;
  sortOrder?: string;
};
```

- [ ] **Step 2: Implement `src/middleware/rateLimiter.ts`**

```typescript
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
```

- [ ] **Step 3: Create `tests/utils/testHelpers.ts`**

```typescript
import { ObjectId } from "mongodb";
import { Request, Response } from "express";

export const TEST_OBJECT_IDS = {
  VALID: "507f1f77bcf86cd799439011",
  VALID_2: "507f1f77bcf86cd799439012",
  INVALID: "invalid-id",
};

export const SAMPLE_PRODUCT = {
  _id: TEST_OBJECT_IDS.VALID,
  name: "Test Widget",
  price: 19.99,
  categories: ["Electronics"],
};

export const SAMPLE_PRODUCTS = [
  { _id: TEST_OBJECT_IDS.VALID, name: "Test Widget 1", price: 19.99, categories: ["Electronics"] },
  { _id: TEST_OBJECT_IDS.VALID_2, name: "Test Widget 2", price: 29.99, categories: ["Home & Kitchen"] },
];

export function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return { query: {}, params: {}, body: {}, ...overrides };
}

export function createMockResponse(): {
  mockJson: jest.Mock;
  mockStatus: jest.Mock;
  mockResponse: Partial<Response>;
} {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnThis();
  const mockResponse = { json: mockJson, status: mockStatus, setHeader: jest.fn() };
  return { mockJson, mockStatus, mockResponse };
}

export function expectSuccessResponse(mockCreateSuccessResponse: jest.Mock, data: any, message: string) {
  expect(mockCreateSuccessResponse).toHaveBeenCalledWith(data, message);
}

export function expectErrorResponse(
  mockStatus: jest.Mock,
  mockJson: jest.Mock,
  statusCode: number,
  errorMessage: string,
  errorCode: string
) {
  expect(mockStatus).toHaveBeenCalledWith(statusCode);
  expect(mockJson).toHaveBeenCalledWith({
    success: false,
    message: errorMessage,
    error: { message: errorMessage, code: errorCode, details: undefined },
    timestamp: "2024-01-01T00:00:00.000Z",
  });
}
```

- [ ] **Step 4: Write the failing controller test**

```typescript
// tests/controllers/productController.test.ts
import { Request, Response } from "express";
import {
  TEST_OBJECT_IDS,
  SAMPLE_PRODUCT,
  SAMPLE_PRODUCTS,
  createMockRequest,
  createMockResponse,
  expectSuccessResponse,
  expectErrorResponse,
} from "../utils/testHelpers";

const TEST_PRODUCT_ID = TEST_OBJECT_IDS.VALID;
const INVALID_PRODUCT_ID = TEST_OBJECT_IDS.INVALID;

const mockFind = jest.fn();
const mockFindOne = jest.fn();
const mockToArray = jest.fn();

const mockGetCollection = jest.fn(() => ({
  find: mockFind.mockReturnValue({
    toArray: mockToArray,
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
  }),
  findOne: mockFindOne,
}));

jest.mock("../../src/config/database", () => ({ getCollection: mockGetCollection }));

const mockCreateSuccessResponse = jest.fn((data: any, message: string) => ({
  success: true,
  message,
  data,
  timestamp: "2024-01-01T00:00:00.000Z",
}));

const mockCreateErrorResponse = jest.fn((message: string, code?: string, details?: any) => ({
  success: false,
  message,
  error: { message, code, details },
  timestamp: "2024-01-01T00:00:00.000Z",
}));

jest.mock("../../src/utils/errorHandler", () => ({
  createSuccessResponse: mockCreateSuccessResponse,
  createErrorResponse: mockCreateErrorResponse,
  validateRequiredFields: jest.fn(),
}));

import { getAllProducts, getProductById } from "../../src/controllers/productController";

describe("Product Controller Tests", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    const responseMocks = createMockResponse();
    mockJson = responseMocks.mockJson;
    mockStatus = responseMocks.mockStatus;
    mockResponse = responseMocks.mockResponse;
    mockRequest = createMockRequest();
  });

  describe("getAllProducts", () => {
    it("retrieves products", async () => {
      mockToArray.mockResolvedValue(SAMPLE_PRODUCTS);

      await getAllProducts(mockRequest as Request, mockResponse as Response);

      expect(mockGetCollection).toHaveBeenCalledWith("products");
      expectSuccessResponse(mockCreateSuccessResponse, SAMPLE_PRODUCTS, "Found 2 products");
    });

    it("handles empty results", async () => {
      mockToArray.mockResolvedValue([]);
      await getAllProducts(mockRequest as Request, mockResponse as Response);
      expectSuccessResponse(mockCreateSuccessResponse, [], "Found 0 products");
    });
  });

  describe("getProductById", () => {
    it("returns 400 for an invalid ObjectId", async () => {
      mockRequest = createMockRequest({ params: { id: INVALID_PRODUCT_ID } });

      await getProductById(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 400, "Invalid product ID format", "INVALID_OBJECT_ID");
    });

    it("returns 404 when the product does not exist", async () => {
      mockRequest = createMockRequest({ params: { id: TEST_PRODUCT_ID } });
      mockFindOne.mockResolvedValue(null);

      await getProductById(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 404, "Product not found", "PRODUCT_NOT_FOUND");
    });

    it("returns the product when found", async () => {
      mockRequest = createMockRequest({ params: { id: TEST_PRODUCT_ID } });
      mockFindOne.mockResolvedValue(SAMPLE_PRODUCT);

      await getProductById(mockRequest as Request, mockResponse as Response);

      expectSuccessResponse(mockCreateSuccessResponse, SAMPLE_PRODUCT, "Product retrieved successfully");
    });
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

```bash
npx jest tests/controllers/productController.test.ts
```

Expected: FAIL — `Cannot find module '../../src/controllers/productController'`.

- [ ] **Step 6: Implement `src/controllers/productController.ts`**

```typescript
import { Request, Response } from "express";
import { ObjectId, Sort } from "mongodb";
import { getCollection } from "../config/database";
import { createErrorResponse, createSuccessResponse } from "../utils/errorHandler";
import { Product, RawProductQuery } from "../types";

export async function getAllProducts(req: Request, res: Response): Promise<void> {
  const productsCollection = getCollection<Product>("products");

  const { limit = "20", skip = "0", sortBy = "name", sortOrder = "asc" }: RawProductQuery = req.query;

  const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const skipNum = Math.max(parseInt(skip) || 0, 0);
  const sort: Sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const products = await productsCollection.find({}).sort(sort).limit(limitNum).skip(skipNum).toArray();

  res.json(createSuccessResponse(products, `Found ${products.length} products`));
}

export async function getProductById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  if (typeof id !== "string" || !ObjectId.isValid(id)) {
    res.status(400).json(createErrorResponse("Invalid product ID format", "INVALID_OBJECT_ID"));
    return;
  }

  const productsCollection = getCollection<Product>("products");
  const product = await productsCollection.findOne({ _id: new ObjectId(id) });

  if (!product) {
    res.status(404).json(createErrorResponse("Product not found", "PRODUCT_NOT_FOUND"));
    return;
  }

  res.json(createSuccessResponse(product, "Product retrieved successfully"));
}
```

- [ ] **Step 7: Implement `src/routes/products.ts`**

```typescript
import express from "express";
import { asyncHandler } from "../utils/errorHandler";
import * as productController from "../controllers/productController";
import { productsRateLimiter } from "../middleware/rateLimiter";

const router = express.Router();

router.use(productsRateLimiter);

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     description: Retrieves products with pagination and sorting.
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of products
 */
router.get("/", asyncHandler(productController.getAllProducts));

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get a product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product found
 *       404:
 *         description: Product not found
 */
router.get("/:id", asyncHandler(productController.getProductById));

export default router;
```

- [ ] **Step 8: Mount the router in `src/app.ts`**

Add near the top, alongside the other imports:

```typescript
import productsRouter from "./routes/products";
```

Add after the `requestLogger` middleware and before the root `app.get("/", ...)` route:

```typescript
app.use("/api/products", productsRouter);
```

- [ ] **Step 9: Run the tests to verify they pass**

```bash
npx jest tests/controllers/productController.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 10: Manually verify against your running server**

```bash
npm run dev
```

In another terminal:

```bash
curl http://localhost:3001/api/products
curl http://localhost:3001/api/products/<a real _id from your seeded data>
curl http://localhost:3001/api/products/not-a-real-id
```

Expected: first returns 20 seeded products, second returns that product, third
returns a 400 `INVALID_OBJECT_ID` error.

- [ ] **Step 11: Commit**

```bash
git add src/middleware/rateLimiter.ts src/controllers/productController.ts src/routes/products.ts src/app.ts src/types/index.ts tests/utils/testHelpers.ts tests/controllers/productController.test.ts
git commit -m "feat: add GET /api/products and GET /api/products/:id"
```

---

## Task 12: Create endpoints

**Files:**
- Modify: `src/controllers/productController.ts` (add `createProduct`, `createProductsBatch`)
- Modify: `src/routes/products.ts` (add `POST /`, `POST /batch`)
- Modify: `tests/controllers/productController.test.ts`

**Interfaces:**
- Consumes: `validateRequiredFields` from `utils/errorHandler.ts` (required fields:
  `name`, `price`).
- Produces: `createProduct`, `createProductsBatch`, consumed by no later task directly
  but establishing the `CreateProductRequest` usage pattern reused in Task 13.

- [ ] **Step 1: Extend the test mocks and add failing tests**

Add to the mock collection object in `tests/controllers/productController.test.ts`
(inside `mockGetCollection`'s returned object):

```typescript
  insertOne: mockInsertOne,
  insertMany: mockInsertMany,
```

Add the corresponding mock function declarations near the top of the file, alongside
`mockFind`/`mockFindOne`:

```typescript
const mockInsertOne = jest.fn();
const mockInsertMany = jest.fn();
```

Add `SAMPLE_REQUESTS` and `SAMPLE_RESPONSES` to `tests/utils/testHelpers.ts`:

```typescript
import { ObjectId } from "mongodb";

export const SAMPLE_REQUESTS = {
  CREATE_PRODUCT: { name: "New Widget", price: 24.99, categories: ["Electronics"] },
  BATCH_CREATE: [
    { name: "Batch Widget 1", price: 9.99 },
    { name: "Batch Widget 2", price: 14.99 },
  ],
};

export const SAMPLE_RESPONSES = {
  INSERT_ONE: { acknowledged: true, insertedId: new ObjectId() },
  INSERT_MANY: { acknowledged: true, insertedCount: 2, insertedIds: { 0: new ObjectId(), 1: new ObjectId() } },
};
```

Add to the `import` line pulling from `../utils/testHelpers` in the test file:
`SAMPLE_REQUESTS, SAMPLE_RESPONSES`.

Update the `jest.mock("../../src/utils/errorHandler", ...)` block to use a real
implementation for `validateRequiredFields` instead of a bare `jest.fn()`, so the
missing-field test actually throws:

```typescript
jest.mock("../../src/utils/errorHandler", () => {
  const actual = jest.requireActual("../../src/utils/errorHandler");
  return {
    createSuccessResponse: mockCreateSuccessResponse,
    createErrorResponse: mockCreateErrorResponse,
    validateRequiredFields: actual.validateRequiredFields,
  };
});
```

Add new tests inside `describe("Product Controller Tests", ...)`:

```typescript
  describe("createProduct", () => {
    it("creates a product and returns it", async () => {
      mockRequest = createMockRequest({ body: SAMPLE_REQUESTS.CREATE_PRODUCT });
      mockInsertOne.mockResolvedValue(SAMPLE_RESPONSES.INSERT_ONE);
      mockFindOne.mockResolvedValue({ _id: SAMPLE_RESPONSES.INSERT_ONE.insertedId, ...SAMPLE_REQUESTS.CREATE_PRODUCT });

      await createProduct(mockRequest as Request, mockResponse as Response);

      expect(mockInsertOne).toHaveBeenCalledWith(SAMPLE_REQUESTS.CREATE_PRODUCT);
      expect(mockStatus).toHaveBeenCalledWith(201);
    });

    it("throws when required fields are missing", async () => {
      mockRequest = createMockRequest({ body: { categories: ["Electronics"] } });

      await expect(createProduct(mockRequest as Request, mockResponse as Response)).rejects.toThrow(
        "Missing required fields: name, price"
      );
    });
  });

  describe("createProductsBatch", () => {
    it("creates multiple products", async () => {
      mockRequest = createMockRequest({ body: SAMPLE_REQUESTS.BATCH_CREATE });
      mockInsertMany.mockResolvedValue(SAMPLE_RESPONSES.INSERT_MANY);

      await createProductsBatch(mockRequest as Request, mockResponse as Response);

      expect(mockInsertMany).toHaveBeenCalledWith(SAMPLE_REQUESTS.BATCH_CREATE);
      expect(mockStatus).toHaveBeenCalledWith(201);
    });

    it("returns 400 when body is not a non-empty array", async () => {
      mockRequest = createMockRequest({ body: [] });

      await createProductsBatch(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 400, "Request body must be a non-empty array of product objects", "INVALID_INPUT");
    });
  });
```

Update the controller import at the top of the test file to include the new functions:

```typescript
import {
  getAllProducts,
  getProductById,
  createProduct,
  createProductsBatch,
} from "../../src/controllers/productController";
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

```bash
npx jest tests/controllers/productController.test.ts
```

Expected: FAIL — `createProduct`/`createProductsBatch` are not exported yet.

- [ ] **Step 3: Add `createProduct` and `createProductsBatch` to `src/controllers/productController.ts`**

Add the import:

```typescript
import { validateRequiredFields } from "../utils/errorHandler";
import { CreateProductRequest } from "../types";
```

Append:

```typescript
export async function createProduct(req: Request, res: Response): Promise<void> {
  const productData: CreateProductRequest = req.body;

  validateRequiredFields(productData, ["name", "price"]);

  const productsCollection = getCollection<Product>("products");
  const result = await productsCollection.insertOne(productData as Product);

  if (!result.acknowledged) {
    throw new Error("Product insertion was not acknowledged by the database");
  }

  const createdProduct = await productsCollection.findOne({ _id: result.insertedId });

  res
    .status(201)
    .json(createSuccessResponse(createdProduct, `Product '${productData.name}' created successfully`));
}

export async function createProductsBatch(req: Request, res: Response): Promise<void> {
  const productsData: CreateProductRequest[] = req.body;

  if (!Array.isArray(productsData) || productsData.length === 0) {
    res
      .status(400)
      .json(createErrorResponse("Request body must be a non-empty array of product objects", "INVALID_INPUT"));
    return;
  }

  productsData.forEach((product, index) => {
    try {
      validateRequiredFields(product, ["name", "price"]);
    } catch (error) {
      throw new Error(`Product at index ${index}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  });

  const productsCollection = getCollection<Product>("products");
  const result = await productsCollection.insertMany(productsData as Product[]);

  if (!result.acknowledged) {
    throw new Error("Batch product insertion was not acknowledged by the database");
  }

  res
    .status(201)
    .json(
      createSuccessResponse(
        { insertedCount: result.insertedCount, insertedIds: result.insertedIds },
        `Successfully created ${result.insertedCount} products`
      )
    );
}
```

- [ ] **Step 4: Wire the routes in `src/routes/products.ts`**

Append before `export default router;`:

```typescript
/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     responses:
 *       201:
 *         description: Product created
 */
router.post("/", asyncHandler(productController.createProduct));

/**
 * @swagger
 * /api/products/batch:
 *   post:
 *     summary: Create multiple products
 *     tags: [Products]
 *     responses:
 *       201:
 *         description: Products created
 */
router.post("/batch", asyncHandler(productController.createProductsBatch));
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx jest tests/controllers/productController.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 6: Manually verify**

```bash
curl -X POST http://localhost:3001/api/products -H "Content-Type: application/json" -d '{"name":"Manual Test Widget","price":9.99}'
```

Expected: 201 with the created product including a MongoDB `_id`.

- [ ] **Step 7: Commit**

```bash
git add src/controllers/productController.ts src/routes/products.ts tests/controllers/productController.test.ts tests/utils/testHelpers.ts
git commit -m "feat: add POST /api/products and POST /api/products/batch"
```

---

## Task 13: Query sanitization utility and update endpoints

**Files:**
- Create: `src/utils/mongoQuery.ts`
- Test: `tests/utils/mongoQuery.test.ts`
- Modify: `src/controllers/productController.ts` (add `updateProduct`, `updateProductsBatch`)
- Modify: `src/routes/products.ts` (add `PATCH /:id`, `PATCH /`)
- Modify: `tests/controllers/productController.test.ts`

**Interfaces:**
- Produces: `escapeRegexLiteral(value)`, `InvalidMongoQueryError`,
  `sanitizeBatchFilter(filter)`, `sanitizeUpdateFields(update)`,
  `convertFilterObjectIds(filter)` — used by `updateProductsBatch` here and by
  `deleteProductsBatch` in Task 14, and by the category filter in Task 15.

- [ ] **Step 1: Write the failing test for `mongoQuery.ts`**

```typescript
// tests/utils/mongoQuery.test.ts
import { ObjectId } from "mongodb";
import {
  escapeRegexLiteral,
  InvalidMongoQueryError,
  sanitizeBatchFilter,
  sanitizeUpdateFields,
  convertFilterObjectIds,
} from "../../src/utils/mongoQuery";

describe("escapeRegexLiteral", () => {
  it("escapes regex special characters", () => {
    expect(escapeRegexLiteral("a.b*c")).toBe("a\\.b\\*c");
  });
});

describe("sanitizeBatchFilter", () => {
  it("allows known fields and operators", () => {
    const result = sanitizeBatchFilter({ price: { $gte: 10 }, brand: "Nova" });
    expect(result).toEqual({ price: { $gte: 10 }, brand: "Nova" });
  });

  it("rejects unknown fields", () => {
    expect(() => sanitizeBatchFilter({ notAField: "x" })).toThrow(InvalidMongoQueryError);
  });

  it("rejects disallowed operators", () => {
    expect(() => sanitizeBatchFilter({ price: { $where: "1==1" } })).toThrow(InvalidMongoQueryError);
  });

  it("rejects top-level operator keys", () => {
    expect(() => sanitizeBatchFilter({ $or: [{ price: 1 }] })).toThrow(InvalidMongoQueryError);
  });
});

describe("sanitizeUpdateFields", () => {
  it("allows known product fields", () => {
    const result = sanitizeUpdateFields({ name: "New Name", price: 15 });
    expect(result).toEqual({ name: "New Name", price: 15 });
  });

  it("rejects unknown fields", () => {
    expect(() => sanitizeUpdateFields({ notAField: true })).toThrow(InvalidMongoQueryError);
  });

  it("rejects operator keys", () => {
    expect(() => sanitizeUpdateFields({ $set: { price: 1 } })).toThrow(InvalidMongoQueryError);
  });
});

describe("convertFilterObjectIds", () => {
  it("converts a valid $in array of id strings to ObjectIds", () => {
    const id = new ObjectId().toString();
    const result = convertFilterObjectIds({ _id: { $in: [id] } });
    expect(result._id.$in[0]).toBeInstanceOf(ObjectId);
  });

  it("throws for an invalid id string in $in", () => {
    expect(() => convertFilterObjectIds({ _id: { $in: ["not-an-id"] } })).toThrow(InvalidMongoQueryError);
  });

  it("passes through filters with no _id.$in", () => {
    const result = convertFilterObjectIds({ price: { $gte: 10 } });
    expect(result).toEqual({ price: { $gte: 10 } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest tests/utils/mongoQuery.test.ts
```

Expected: FAIL — `Cannot find module '../../src/utils/mongoQuery'`.

- [ ] **Step 3: Implement `src/utils/mongoQuery.ts`**

```typescript
import { Document, ObjectId } from "mongodb";
import { UpdateProductRequest } from "../types";

const PRODUCT_FIELDS = [
  "name",
  "price",
  "shortDescription",
  "description",
  "categories",
  "brand",
  "tags",
  "seller",
  "weightGrams",
  "condition",
  "imageUrl",
  "countryOfOrigin",
  "sku",
  "rating",
] as const;

const ALLOWED_FILTER_FIELDS = new Set([...PRODUCT_FIELDS, "_id"]);
const ALLOWED_OPERATORS = new Set(["$in", "$nin", "$gt", "$gte", "$lt", "$lte", "$ne", "$exists"]);
const UPDATE_FIELDS = [...PRODUCT_FIELDS] as (keyof UpdateProductRequest)[];

const UNSUPPORTED_FILTER_MESSAGE = "Filter contains an unsupported field or operator";
const UNSUPPORTED_UPDATE_MESSAGE = "Update contains an unsupported field or operator";

export function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class InvalidMongoQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMongoQueryError";
  }
}

function sanitizeOperatorValue(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const operatorMap = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [operator, operatorValue] of Object.entries(operatorMap)) {
    if (!operator.startsWith("$") || !ALLOWED_OPERATORS.has(operator)) {
      throw new InvalidMongoQueryError(UNSUPPORTED_FILTER_MESSAGE);
    }
    sanitized[operator] = operatorValue;
  }

  return sanitized;
}

export function sanitizeBatchFilter(filter: Record<string, unknown>): Document {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
    throw new InvalidMongoQueryError("Filter must be a non-array object");
  }

  const sanitized: Document = {};

  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith("$") || !ALLOWED_FILTER_FIELDS.has(key)) {
      throw new InvalidMongoQueryError(UNSUPPORTED_FILTER_MESSAGE);
    }

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeOperatorValue(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export function sanitizeUpdateFields(update: Record<string, unknown>): UpdateProductRequest {
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    throw new InvalidMongoQueryError("Update must be a non-array object");
  }

  const sanitized: UpdateProductRequest = {};

  for (const key of Object.keys(update)) {
    if (key.startsWith("$") || !UPDATE_FIELDS.includes(key as keyof UpdateProductRequest)) {
      throw new InvalidMongoQueryError(UNSUPPORTED_UPDATE_MESSAGE);
    }
    (sanitized as Record<string, unknown>)[key] = update[key];
  }

  return sanitized;
}

export function convertFilterObjectIds(filter: Document): Document {
  const processedFilter: Document = { ...filter };

  if (
    processedFilter._id &&
    typeof processedFilter._id === "object" &&
    processedFilter._id !== null &&
    "$in" in processedFilter._id &&
    Array.isArray(processedFilter._id.$in)
  ) {
    processedFilter._id = {
      $in: processedFilter._id.$in.map((id: unknown) => {
        const idStr = String(id);
        if (ObjectId.isValid(idStr)) {
          return new ObjectId(idStr);
        }
        throw new InvalidMongoQueryError(UNSUPPORTED_FILTER_MESSAGE);
      }),
    };
  }

  return processedFilter;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest tests/utils/mongoQuery.test.ts
```

Expected: PASS (11 tests).

- [ ] **Step 5: Add failing controller tests for update endpoints**

Add mock functions near the top of `tests/controllers/productController.test.ts`:

```typescript
const mockUpdateOne = jest.fn();
const mockUpdateMany = jest.fn();
```

Add to the `mockGetCollection` return object:

```typescript
  updateOne: mockUpdateOne,
  updateMany: mockUpdateMany,
```

Add `SAMPLE_RESPONSES.UPDATE_ONE` / `SAMPLE_RESPONSES.UPDATE_MANY` to
`tests/utils/testHelpers.ts`:

```typescript
export const SAMPLE_RESPONSES = {
  // ...existing entries...
  UPDATE_ONE: { matchedCount: 1, modifiedCount: 1 },
  UPDATE_MANY: { matchedCount: 5, modifiedCount: 3 },
};
```

Add tests:

```typescript
  describe("updateProduct", () => {
    it("returns 400 for an invalid ObjectId", async () => {
      mockRequest = createMockRequest({ params: { id: INVALID_PRODUCT_ID }, body: { price: 5 } });

      await updateProduct(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 400, "Invalid product ID format", "INVALID_OBJECT_ID");
    });

    it("returns 400 when the update body is empty", async () => {
      mockRequest = createMockRequest({ params: { id: TEST_PRODUCT_ID }, body: {} });

      await updateProduct(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 400, "No update data provided", "NO_UPDATE_DATA");
    });

    it("returns 404 when no product matches", async () => {
      mockRequest = createMockRequest({ params: { id: TEST_PRODUCT_ID }, body: { price: 5 } });
      mockUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      await updateProduct(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 404, "Product not found", "PRODUCT_NOT_FOUND");
    });

    it("updates and returns the product", async () => {
      mockRequest = createMockRequest({ params: { id: TEST_PRODUCT_ID }, body: { price: 5 } });
      mockUpdateOne.mockResolvedValue(SAMPLE_RESPONSES.UPDATE_ONE);
      mockFindOne.mockResolvedValue({ ...SAMPLE_PRODUCT, price: 5 });

      await updateProduct(mockRequest as Request, mockResponse as Response);

      expect(mockUpdateOne).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalled();
    });
  });

  describe("updateProductsBatch", () => {
    it("returns 400 when filter or update is missing", async () => {
      mockRequest = createMockRequest({ body: { filter: { brand: "Nova" } } });

      await updateProductsBatch(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 400, "Both filter and update objects are required", "MISSING_REQUIRED_FIELDS");
    });

    it("rejects an unsupported filter field", async () => {
      mockRequest = createMockRequest({ body: { filter: { notAField: 1 }, update: { price: 5 } } });

      await updateProductsBatch(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 400, "Filter contains an unsupported field or operator", "INVALID_FILTER");
    });

    it("updates matching products", async () => {
      mockRequest = createMockRequest({ body: { filter: { brand: "Nova" }, update: { price: 5 } } });
      mockUpdateMany.mockResolvedValue(SAMPLE_RESPONSES.UPDATE_MANY);

      await updateProductsBatch(mockRequest as Request, mockResponse as Response);

      expect(mockUpdateMany).toHaveBeenCalledWith({ brand: "Nova" }, { $set: { price: 5 } });
    });
  });
```

Update the controller import to add `updateProduct, updateProductsBatch`.

- [ ] **Step 6: Run the tests to verify the new ones fail**

```bash
npx jest tests/controllers/productController.test.ts
```

Expected: FAIL — functions not exported yet.

- [ ] **Step 7: Add `updateProduct` and `updateProductsBatch` to `src/controllers/productController.ts`**

Add imports:

```typescript
import { Document } from "mongodb";
import {
  convertFilterObjectIds,
  InvalidMongoQueryError,
  sanitizeBatchFilter,
  sanitizeUpdateFields,
} from "../utils/mongoQuery";
import { UpdateProductRequest } from "../types";
```

Append:

```typescript
export async function updateProduct(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const updateData: UpdateProductRequest = req.body;

  if (typeof id !== "string" || !ObjectId.isValid(id)) {
    res.status(400).json(createErrorResponse("Invalid product ID format", "INVALID_OBJECT_ID"));
    return;
  }

  if (Object.keys(updateData).length === 0) {
    res.status(400).json(createErrorResponse("No update data provided", "NO_UPDATE_DATA"));
    return;
  }

  const productsCollection = getCollection<Product>("products");

  let sanitizedUpdate: UpdateProductRequest;
  try {
    sanitizedUpdate = sanitizeUpdateFields(updateData as Record<string, unknown>);
  } catch (error) {
    if (error instanceof InvalidMongoQueryError) {
      res.status(400).json(createErrorResponse(error.message, "INVALID_UPDATE"));
      return;
    }
    throw error;
  }

  const result = await productsCollection.updateOne({ _id: new ObjectId(id) }, { $set: sanitizedUpdate });

  if (result.matchedCount === 0) {
    res.status(404).json(createErrorResponse("Product not found", "PRODUCT_NOT_FOUND"));
    return;
  }

  const updatedProduct = await productsCollection.findOne({ _id: new ObjectId(id) });

  res.json(
    createSuccessResponse(updatedProduct, `Product updated successfully. Modified ${result.modifiedCount} field(s).`)
  );
}

export async function updateProductsBatch(req: Request, res: Response): Promise<void> {
  const { filter, update } = req.body;

  if (!filter || !update) {
    res.status(400).json(createErrorResponse("Both filter and update objects are required", "MISSING_REQUIRED_FIELDS"));
    return;
  }

  if (Object.keys(update).length === 0) {
    res.status(400).json(createErrorResponse("Update object cannot be empty", "EMPTY_UPDATE"));
    return;
  }

  const productsCollection = getCollection<Product>("products");

  let sanitizedFilter: Document;
  let sanitizedUpdate: UpdateProductRequest;
  let processedFilter: Document;

  try {
    sanitizedFilter = sanitizeBatchFilter(filter);
  } catch (error) {
    if (error instanceof InvalidMongoQueryError) {
      res.status(400).json(createErrorResponse(error.message, "INVALID_FILTER"));
      return;
    }
    throw error;
  }

  try {
    sanitizedUpdate = sanitizeUpdateFields(update);
  } catch (error) {
    if (error instanceof InvalidMongoQueryError) {
      res.status(400).json(createErrorResponse(error.message, "INVALID_UPDATE"));
      return;
    }
    throw error;
  }

  try {
    processedFilter = convertFilterObjectIds(sanitizedFilter);
  } catch (error) {
    if (error instanceof InvalidMongoQueryError) {
      res.status(400).json(createErrorResponse(error.message, "INVALID_OBJECT_ID"));
      return;
    }
    throw error;
  }

  const result = await productsCollection.updateMany(processedFilter, { $set: sanitizedUpdate });

  res.json(
    createSuccessResponse(
      { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount },
      `Update operation completed. Matched ${result.matchedCount} documents, modified ${result.modifiedCount} documents.`
    )
  );
}
```

- [ ] **Step 8: Wire the routes in `src/routes/products.ts`**

Append before `export default router;`:

```typescript
/**
 * @swagger
 * /api/products/{id}:
 *   patch:
 *     summary: Update a product
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Product updated
 *       404:
 *         description: Product not found
 */
router.patch("/:id", asyncHandler(productController.updateProduct));

/**
 * @swagger
 * /api/products:
 *   patch:
 *     summary: Update multiple products matching a filter
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Products updated
 */
router.patch("/", asyncHandler(productController.updateProductsBatch));
```

- [ ] **Step 9: Run the full unit test suite to verify everything passes**

```bash
npm run test:unit
```

Expected: PASS (all tests across both controller and mongoQuery test files).

- [ ] **Step 10: Commit**

```bash
git add src/utils/mongoQuery.ts tests/utils/mongoQuery.test.ts src/controllers/productController.ts src/routes/products.ts tests/controllers/productController.test.ts tests/utils/testHelpers.ts
git commit -m "feat: add query sanitization utility and PATCH endpoints"
```

---

## Task 14: Delete endpoints

**Files:**
- Modify: `src/controllers/productController.ts` (add `deleteProduct`, `deleteProductsBatch`, `findAndDeleteProduct`)
- Modify: `src/routes/products.ts` (add `DELETE /:id`, `DELETE /`, `DELETE /:id/find-and-delete`)
- Modify: `tests/controllers/productController.test.ts`

**Interfaces:**
- Consumes: `sanitizeBatchFilter`, `convertFilterObjectIds`, `InvalidMongoQueryError`
  from `utils/mongoQuery.ts` (Task 13).
- Produces: completes the CRUD surface — no later task depends on these directly.

- [ ] **Step 1: Add mock functions and failing tests**

Add near the top of the test file:

```typescript
const mockDeleteOne = jest.fn();
const mockDeleteMany = jest.fn();
const mockFindOneAndDelete = jest.fn();
```

Add to `mockGetCollection`'s returned object:

```typescript
  deleteOne: mockDeleteOne,
  deleteMany: mockDeleteMany,
  findOneAndDelete: mockFindOneAndDelete,
```

Add to `tests/utils/testHelpers.ts`:

```typescript
export const SAMPLE_RESPONSES_DELETE = {
  DELETE_ONE: { deletedCount: 1 },
  DELETE_MANY: { deletedCount: 10 },
};
```

Add tests:

```typescript
  describe("deleteProduct", () => {
    it("returns 400 for an invalid ObjectId", async () => {
      mockRequest = createMockRequest({ params: { id: INVALID_PRODUCT_ID } });

      await deleteProduct(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 400, "Invalid product ID format", "INVALID_OBJECT_ID");
    });

    it("returns 404 when nothing is deleted", async () => {
      mockRequest = createMockRequest({ params: { id: TEST_PRODUCT_ID } });
      mockDeleteOne.mockResolvedValue({ deletedCount: 0 });

      await deleteProduct(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 404, "Product not found", "PRODUCT_NOT_FOUND");
    });

    it("deletes the product", async () => {
      mockRequest = createMockRequest({ params: { id: TEST_PRODUCT_ID } });
      mockDeleteOne.mockResolvedValue(SAMPLE_RESPONSES_DELETE.DELETE_ONE);

      await deleteProduct(mockRequest as Request, mockResponse as Response);

      expect(mockDeleteOne).toHaveBeenCalled();
    });
  });

  describe("deleteProductsBatch", () => {
    it("rejects an empty filter", async () => {
      mockRequest = createMockRequest({ body: { filter: {} } });

      await deleteProductsBatch(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(
        mockStatus,
        mockJson,
        400,
        "Filter object is required and cannot be empty. This prevents accidental deletion of all documents.",
        "MISSING_FILTER"
      );
    });

    it("deletes matching products", async () => {
      mockRequest = createMockRequest({ body: { filter: { brand: "Nova" } } });
      mockDeleteMany.mockResolvedValue(SAMPLE_RESPONSES_DELETE.DELETE_MANY);

      await deleteProductsBatch(mockRequest as Request, mockResponse as Response);

      expect(mockDeleteMany).toHaveBeenCalledWith({ brand: "Nova" });
    });
  });

  describe("findAndDeleteProduct", () => {
    it("returns 404 when nothing is found", async () => {
      mockRequest = createMockRequest({ params: { id: TEST_PRODUCT_ID } });
      mockFindOneAndDelete.mockResolvedValue(null);

      await findAndDeleteProduct(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 404, "Product not found", "PRODUCT_NOT_FOUND");
    });

    it("finds and deletes the product", async () => {
      mockRequest = createMockRequest({ params: { id: TEST_PRODUCT_ID } });
      mockFindOneAndDelete.mockResolvedValue(SAMPLE_PRODUCT);

      await findAndDeleteProduct(mockRequest as Request, mockResponse as Response);

      expectSuccessResponse(mockCreateSuccessResponse, SAMPLE_PRODUCT, "Product found and deleted successfully");
    });
  });
```

Update the controller import to add `deleteProduct, deleteProductsBatch, findAndDeleteProduct`.

- [ ] **Step 2: Run the tests to verify the new ones fail**

```bash
npx jest tests/controllers/productController.test.ts
```

Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Add the delete functions to `src/controllers/productController.ts`**

```typescript
export async function deleteProduct(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  if (typeof id !== "string" || !ObjectId.isValid(id)) {
    res.status(400).json(createErrorResponse("Invalid product ID format", "INVALID_OBJECT_ID"));
    return;
  }

  const productsCollection = getCollection<Product>("products");
  const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    res.status(404).json(createErrorResponse("Product not found", "PRODUCT_NOT_FOUND"));
    return;
  }

  res.json(createSuccessResponse({ deletedCount: result.deletedCount }, "Product deleted successfully"));
}

export async function deleteProductsBatch(req: Request, res: Response): Promise<void> {
  const { filter } = req.body;

  if (!filter || Object.keys(filter).length === 0) {
    res
      .status(400)
      .json(
        createErrorResponse(
          "Filter object is required and cannot be empty. This prevents accidental deletion of all documents.",
          "MISSING_FILTER"
        )
      );
    return;
  }

  const productsCollection = getCollection<Product>("products");

  let sanitizedFilter: Document;
  let processedFilter: Document;

  try {
    sanitizedFilter = sanitizeBatchFilter(filter);
  } catch (error) {
    if (error instanceof InvalidMongoQueryError) {
      res.status(400).json(createErrorResponse(error.message, "INVALID_FILTER"));
      return;
    }
    throw error;
  }

  try {
    processedFilter = convertFilterObjectIds(sanitizedFilter);
  } catch (error) {
    if (error instanceof InvalidMongoQueryError) {
      res.status(400).json(createErrorResponse(error.message, "INVALID_OBJECT_ID"));
      return;
    }
    throw error;
  }

  const result = await productsCollection.deleteMany(processedFilter);

  res.json(
    createSuccessResponse(
      { deletedCount: result.deletedCount },
      `Delete operation completed. Removed ${result.deletedCount} documents.`
    )
  );
}

export async function findAndDeleteProduct(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  if (typeof id !== "string" || !ObjectId.isValid(id)) {
    res.status(400).json(createErrorResponse("Invalid product ID format", "INVALID_OBJECT_ID"));
    return;
  }

  const productsCollection = getCollection<Product>("products");
  const deletedProduct = await productsCollection.findOneAndDelete({ _id: new ObjectId(id) });

  if (!deletedProduct) {
    res.status(404).json(createErrorResponse("Product not found", "PRODUCT_NOT_FOUND"));
    return;
  }

  res.json(createSuccessResponse(deletedProduct, "Product found and deleted successfully"));
}
```

- [ ] **Step 4: Wire the routes in `src/routes/products.ts`**

Append before `export default router;`:

```typescript
/**
 * @swagger
 * /api/products/{id}/find-and-delete:
 *   delete:
 *     summary: Find and delete a product atomically
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Product found and deleted
 *       404:
 *         description: Product not found
 */
router.delete("/:id/find-and-delete", asyncHandler(productController.findAndDeleteProduct));

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Product deleted
 *       404:
 *         description: Product not found
 */
router.delete("/:id", asyncHandler(productController.deleteProduct));

/**
 * @swagger
 * /api/products:
 *   delete:
 *     summary: Delete multiple products matching a filter
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Products deleted
 */
router.delete("/", asyncHandler(productController.deleteProductsBatch));
```

Note the ordering: `/:id/find-and-delete` must be registered before the generic
`/:id` delete route so Express matches the more specific path first.

- [ ] **Step 5: Run the full unit test suite**

```bash
npm run test:unit
```

Expected: PASS. This completes the 9-endpoint CRUD surface from the spec.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/productController.ts src/routes/products.ts tests/controllers/productController.test.ts tests/utils/testHelpers.ts
git commit -m "feat: add DELETE endpoints, completing the CRUD surface"
```

---

## Task 15: Filtering, text search, and distinct categories

**Files:**
- Modify: `src/types/index.ts` (extend `RawProductQuery`, add `ProductFilter`)
- Modify: `src/controllers/productController.ts` (extend `getAllProducts`, add `getDistinctCategories`)
- Modify: `src/routes/products.ts` (add `GET /categories`)
- Modify: `tests/controllers/productController.test.ts`

**Interfaces:**
- Consumes: `escapeRegexLiteral` from `utils/mongoQuery.ts`.
- Produces: filterable `getAllProducts`; `getDistinctCategories`, consumed by no later
  task.

- [ ] **Step 1: Extend `RawProductQuery` and add `ProductFilter` in `src/types/index.ts`**

Replace the `RawProductQuery` type added in Task 11 with:

```typescript
export type RawProductQuery = {
  q?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  minRating?: string;
  limit?: string;
  skip?: string;
  sortBy?: string;
  sortOrder?: string;
};

export type ProductFilter = {
  $text?: { $search: string };
  categories?: { $regex: RegExp };
  price?: { $gte?: number; $lte?: number };
  "rating.average"?: { $gte?: number };
};
```

- [ ] **Step 2: Add failing tests for filtering behavior**

Add inside `describe("getAllProducts", ...)`:

```typescript
    it("applies a text search filter when q is provided", async () => {
      mockRequest = createMockRequest({ query: { q: "widget" } });
      mockToArray.mockResolvedValue([]);

      await getAllProducts(mockRequest as Request, mockResponse as Response);

      expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ $text: { $search: "widget" } }));
    });

    it("applies a category regex filter", async () => {
      mockRequest = createMockRequest({ query: { category: "Electronics" } });
      mockToArray.mockResolvedValue([]);

      await getAllProducts(mockRequest as Request, mockResponse as Response);

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({ categories: { $regex: expect.any(RegExp) } })
      );
    });

    it("applies price range filters", async () => {
      mockRequest = createMockRequest({ query: { minPrice: "10", maxPrice: "50" } });
      mockToArray.mockResolvedValue([]);

      await getAllProducts(mockRequest as Request, mockResponse as Response);

      expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ price: { $gte: 10, $lte: 50 } }));
    });
```

Add `const mockDistinct = jest.fn();` next to the other mock function declarations near
the top of the file (alongside `mockFind`, `mockFindOne`, etc.), and add
`distinct: mockDistinct,` as a new property on the object returned by
`mockGetCollection`'s factory function — the same shared object every other mocked
collection method lives on. Do **not** call `mockGetCollection.mockReturnValue(...)`
locally inside a test or nested `beforeEach`: that permanently replaces the factory's
return value for every subsequent test in the file, since `jest.clearAllMocks()` in the
outer `beforeEach` clears call history but does not undo a `mockReturnValue` override.

Add a new `describe` block:

```typescript
  describe("getDistinctCategories", () => {
    it("returns sorted, non-empty distinct categories", async () => {
      mockDistinct.mockResolvedValue(["Books", "", "Electronics", null]);

      await getDistinctCategories(mockRequest as Request, mockResponse as Response);

      expectSuccessResponse(mockCreateSuccessResponse, ["Books", "Electronics"], "Found 2 distinct categories");
    });
  });
```

Update the controller import to add `getDistinctCategories`.

- [ ] **Step 3: Run the tests to verify the new ones fail**

```bash
npx jest tests/controllers/productController.test.ts
```

Expected: FAIL — filters not implemented yet, `getDistinctCategories` not exported.

- [ ] **Step 4: Update `getAllProducts` and add `getDistinctCategories` in `src/controllers/productController.ts`**

Add the import:

```typescript
import { escapeRegexLiteral } from "../utils/mongoQuery";
import { ProductFilter } from "../types";
```

Replace the body of `getAllProducts` (keep the function signature) with:

```typescript
export async function getAllProducts(req: Request, res: Response): Promise<void> {
  const productsCollection = getCollection<Product>("products");

  const {
    q,
    category,
    minPrice,
    maxPrice,
    minRating,
    limit = "20",
    skip = "0",
    sortBy = "name",
    sortOrder = "asc",
  }: RawProductQuery = req.query;

  const filter: ProductFilter = {};

  if (q) {
    filter.$text = { $search: q };
  }

  const trimmedCategory = typeof category === "string" ? category.trim() : "";
  if (trimmedCategory) {
    filter.categories = { $regex: new RegExp(escapeRegexLiteral(trimmedCategory), "i") };
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = parseFloat(minPrice);
    if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
  }

  if (minRating) {
    filter["rating.average"] = { $gte: parseFloat(minRating) };
  }

  const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const skipNum = Math.max(parseInt(skip) || 0, 0);
  const sort: Sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const products = await productsCollection.find(filter).sort(sort).limit(limitNum).skip(skipNum).toArray();

  res.json(createSuccessResponse(products, `Found ${products.length} products`));
}

export async function getDistinctCategories(req: Request, res: Response): Promise<void> {
  const productsCollection = getCollection<Product>("products");

  const categories = await productsCollection.distinct("categories");

  const validCategories = categories
    .filter((category): category is string => typeof category === "string" && category.length > 0)
    .sort((a, b) => a.localeCompare(b));

  res.json(createSuccessResponse(validCategories, `Found ${validCategories.length} distinct categories`));
}
```

- [ ] **Step 5: Wire `GET /categories` in `src/routes/products.ts`**

Add **above** `router.get("/:id", ...)` (must come before the `:id` route so `/categories`
isn't captured as an id):

```typescript
/**
 * @swagger
 * /api/products/categories:
 *   get:
 *     summary: Get all distinct product categories
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of distinct categories
 */
router.get("/categories", asyncHandler(productController.getDistinctCategories));
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 7: Manually verify against your running server**

```bash
curl "http://localhost:3001/api/products?q=widget"
curl "http://localhost:3001/api/products?category=Electronics"
curl "http://localhost:3001/api/products?minPrice=10&maxPrice=50"
curl "http://localhost:3001/api/products/categories"
```

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/controllers/productController.ts src/routes/products.ts tests/controllers/productController.test.ts
git commit -m "feat: add text search, price/rating/category filtering, and distinct categories"
```

---

## Task 16: Aggregation — products with most recent reviews

**Files:**
- Modify: `src/types/index.ts` (add `ProductWithReviewsResult`, `AggregationReview`)
- Modify: `src/controllers/productController.ts` (add `getProductsWithMostRecentReviews`)
- Modify: `src/routes/products.ts` (add `GET /aggregations/reportingByReviews`)
- Modify: `tests/controllers/productController.test.ts`

**Interfaces:**
- Consumes: `Document` type from `mongodb`.
- Produces: `getProductsWithMostRecentReviews`, consumed by no later task.

- [ ] **Step 1: Add result types to `src/types/index.ts`**

```typescript
export interface AggregationReview {
  _id?: import("mongodb").ObjectId;
  reviewerName: string;
  reviewerEmail: string;
  text: string;
  date: Date;
}

export interface ProductWithReviewsResult {
  _id: string;
  name: string;
  categories?: string[];
  ratingAverage?: number;
  recentReviews: AggregationReview[];
  totalReviews: number;
  mostRecentReviewDate?: Date;
}
```

- [ ] **Step 2: Add the failing test**

Add to `tests/utils/testHelpers.ts`:

```typescript
export const SAMPLE_REVIEWS_AGGREGATION = [
  {
    _id: new ObjectId(),
    name: "Test Widget",
    categories: ["Electronics"],
    ratingAverage: 4.5,
    recentReviews: [
      {
        _id: new ObjectId(),
        reviewerName: "Jane Doe",
        reviewerEmail: "jane@example.com",
        text: "Great product!",
        date: new Date("2024-01-01"),
      },
    ],
    totalReviews: 5,
  },
];
```

Add to the test file (mock `aggregate`/`toArray` are already declared from earlier
tasks — reuse `mockAggregate`/`mockToArray`; add them near the top if not already
present from a prior task):

```typescript
const mockAggregate = jest.fn();
```

Ensure `mockGetCollection`'s returned object includes:

```typescript
  aggregate: mockAggregate.mockReturnValue({ toArray: mockToArray }),
```

Add:

```typescript
  describe("getProductsWithMostRecentReviews", () => {
    it("returns products with their recent reviews", async () => {
      mockToArray.mockResolvedValue(SAMPLE_REVIEWS_AGGREGATION);

      await getProductsWithMostRecentReviews(mockRequest as Request, mockResponse as Response);

      expect(mockAggregate).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalled();
    });

    it("returns 400 for an invalid productId filter", async () => {
      mockRequest = createMockRequest({ query: { productId: INVALID_PRODUCT_ID } });

      await getProductsWithMostRecentReviews(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 400, "Invalid product ID format", "INVALID_OBJECT_ID");
    });
  });
```

Update the controller import to add `getProductsWithMostRecentReviews`. Import
`SAMPLE_REVIEWS_AGGREGATION` from `testHelpers`.

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx jest tests/controllers/productController.test.ts
```

Expected: FAIL — function not exported yet.

- [ ] **Step 4: Implement `getProductsWithMostRecentReviews` in `src/controllers/productController.ts`**

Add the import:

```typescript
import { Document } from "mongodb";
import { ProductWithReviewsResult, AggregationReview } from "../types";
```

(If `Document` is already imported from `mongodb` from Task 13, merge into the
existing import line instead of duplicating it.)

Append:

```typescript
export async function getProductsWithMostRecentReviews(req: Request, res: Response): Promise<void> {
  const productsCollection = getCollection<Product>("products");
  const { limit = "10", productId } = req.query;

  const limitNum = Math.min(Math.max(parseInt(limit as string) || 10, 1), 50);

  const pipeline: Document[] = [{ $match: {} }];

  if (productId && typeof productId === "string") {
    if (!ObjectId.isValid(productId)) {
      res.status(400).json(createErrorResponse("Invalid product ID format", "INVALID_OBJECT_ID"));
      return;
    }
    pipeline[0].$match._id = new ObjectId(productId);
  }

  pipeline.push(
    { $lookup: { from: "reviews", localField: "_id", foreignField: "product_id", as: "reviews" } },
    { $match: { reviews: { $ne: [] } } },
    {
      $addFields: {
        recentReviews: { $slice: [{ $sortArray: { input: "$reviews", sortBy: { date: -1 } } }, limitNum] },
        mostRecentReviewDate: { $max: "$reviews.date" },
      },
    },
    { $sort: { mostRecentReviewDate: -1 } },
    { $limit: productId ? 50 : 20 },
    {
      $project: {
        name: 1,
        categories: 1,
        _id: 1,
        ratingAverage: "$rating.average",
        recentReviews: {
          $map: {
            input: "$recentReviews",
            as: "review",
            in: {
              _id: "$$review._id",
              reviewerName: "$$review.name",
              reviewerEmail: "$$review.email",
              text: "$$review.text",
              date: "$$review.date",
            },
          },
        },
        totalReviews: { $size: "$reviews" },
      },
    }
  );

  const results = await productsCollection.aggregate(pipeline).toArray();

  const processedResults: ProductWithReviewsResult[] = results.map((result) => ({
    _id: result._id.toString(),
    name: result.name,
    categories: result.categories,
    ratingAverage: result.ratingAverage,
    recentReviews: result.recentReviews.map((review: AggregationReview) => ({
      _id: review._id?.toString(),
      reviewerName: review.reviewerName,
      reviewerEmail: review.reviewerEmail,
      text: review.text,
      date: review.date,
    })),
    totalReviews: result.totalReviews,
  }));

  const totalReviews = processedResults.reduce((sum, r) => sum + (r.totalReviews || 0), 0);
  const message = productId
    ? `Found ${totalReviews} reviews from product`
    : `Found ${totalReviews} reviews from ${processedResults.length} product${processedResults.length !== 1 ? "s" : ""}`;

  res.json(createSuccessResponse(processedResults, message));
}
```

- [ ] **Step 5: Wire the route in `src/routes/products.ts`**

Add **above** `router.get("/:id", ...)`:

```typescript
/**
 * @swagger
 * /api/products/aggregations/reportingByReviews:
 *   get:
 *     summary: Get products with their most recent reviews
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Products with recent reviews
 */
router.get("/aggregations/reportingByReviews", asyncHandler(productController.getProductsWithMostRecentReviews));
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 7: Manually verify against your seeded data**

```bash
curl "http://localhost:3001/api/products/aggregations/reportingByReviews?limit=5"
```

Expected: a list of products that have reviews, each with up to 5 recent reviews.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/controllers/productController.ts src/routes/products.ts tests/controllers/productController.test.ts tests/utils/testHelpers.ts
git commit -m "feat: add reportingByReviews aggregation endpoint"
```

---

## Task 17: Aggregation — products by category with stats

**Files:**
- Modify: `src/controllers/productController.ts` (add `getProductsByCategoryWithStats`)
- Modify: `src/routes/products.ts` (add `GET /aggregations/reportingByCategory`)
- Modify: `tests/controllers/productController.test.ts`

**Interfaces:**
- Produces: `getProductsByCategoryWithStats`, consumed by no later task.

- [ ] **Step 1: Add the failing test**

Add to `tests/utils/testHelpers.ts`:

```typescript
export const SAMPLE_CATEGORY_AGGREGATION = [
  { category: "Electronics", productCount: 12, averagePrice: 45.5, highestPrice: 199.99, lowestPrice: 9.99, totalReviews: 340 },
  { category: "Books", productCount: 8, averagePrice: 15.2, highestPrice: 29.99, lowestPrice: 4.99, totalReviews: 120 },
];
```

Add:

```typescript
  describe("getProductsByCategoryWithStats", () => {
    it("returns category statistics", async () => {
      mockToArray.mockResolvedValue(SAMPLE_CATEGORY_AGGREGATION);

      await getProductsByCategoryWithStats(mockRequest as Request, mockResponse as Response);

      expect(mockAggregate).toHaveBeenCalled();
      expectSuccessResponse(mockCreateSuccessResponse, SAMPLE_CATEGORY_AGGREGATION, "Aggregated statistics for 2 categories");
    });
  });
```

Update the controller import and the `testHelpers` import to add the new symbols.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest tests/controllers/productController.test.ts
```

Expected: FAIL — function not exported yet.

- [ ] **Step 3: Implement `getProductsByCategoryWithStats` in `src/controllers/productController.ts`**

```typescript
export async function getProductsByCategoryWithStats(req: Request, res: Response): Promise<void> {
  const productsCollection = getCollection<Product>("products");

  const pipeline = [
    { $match: { categories: { $exists: true, $ne: null, $not: { $eq: [] } } } },
    { $unwind: "$categories" },
    {
      $group: {
        _id: "$categories",
        productCount: { $sum: 1 },
        averagePrice: { $avg: "$price" },
        highestPrice: { $max: "$price" },
        lowestPrice: { $min: "$price" },
        totalReviews: { $sum: "$rating.count" },
      },
    },
    {
      $project: {
        category: "$_id",
        productCount: 1,
        averagePrice: { $round: ["$averagePrice", 2] },
        highestPrice: 1,
        lowestPrice: 1,
        totalReviews: 1,
        _id: 0,
      },
    },
    { $sort: { category: 1 } },
  ];

  const results = await productsCollection.aggregate(pipeline).toArray();

  res.json(createSuccessResponse(results, `Aggregated statistics for ${results.length} categories`));
}
```

- [ ] **Step 4: Wire the route in `src/routes/products.ts`**

Add next to the other aggregation route:

```typescript
/**
 * @swagger
 * /api/products/aggregations/reportingByCategory:
 *   get:
 *     summary: Get product statistics grouped by category
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Category statistics
 */
router.get("/aggregations/reportingByCategory", asyncHandler(productController.getProductsByCategoryWithStats));
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run test:unit
```

- [ ] **Step 6: Manually verify**

```bash
curl "http://localhost:3001/api/products/aggregations/reportingByCategory"
```

- [ ] **Step 7: Commit**

```bash
git add src/controllers/productController.ts src/routes/products.ts tests/controllers/productController.test.ts tests/utils/testHelpers.ts
git commit -m "feat: add reportingByCategory aggregation endpoint"
```

---

## Task 18: Aggregation — brands with most products

**Files:**
- Modify: `src/controllers/productController.ts` (add `getBrandsWithMostProducts`)
- Modify: `src/routes/products.ts` (add `GET /aggregations/reportingByBrand`)
- Modify: `tests/controllers/productController.test.ts`

**Interfaces:**
- Produces: `getBrandsWithMostProducts`, consumed by no later task. Completes the
  three aggregation endpoints from the spec.

- [ ] **Step 1: Add the failing test**

Add to `tests/utils/testHelpers.ts`:

```typescript
export const SAMPLE_BRAND_AGGREGATION = [
  { brand: "Nova", productCount: 18, averageRating: 4.2 },
  { brand: "Zenith", productCount: 14, averageRating: 3.9 },
];
```

Add:

```typescript
  describe("getBrandsWithMostProducts", () => {
    it("returns brand statistics", async () => {
      mockToArray.mockResolvedValue(SAMPLE_BRAND_AGGREGATION);

      await getBrandsWithMostProducts(mockRequest as Request, mockResponse as Response);

      expectSuccessResponse(mockCreateSuccessResponse, SAMPLE_BRAND_AGGREGATION, "Found 2 brands with most products");
    });
  });
```

Update the controller and `testHelpers` imports.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest tests/controllers/productController.test.ts
```

Expected: FAIL — function not exported yet.

- [ ] **Step 3: Implement `getBrandsWithMostProducts` in `src/controllers/productController.ts`**

```typescript
export async function getBrandsWithMostProducts(req: Request, res: Response): Promise<void> {
  const productsCollection = getCollection<Product>("products");
  const { limit = "20" } = req.query;
  const limitNum = Math.min(Math.max(parseInt(limit as string) || 20, 1), 100);

  const pipeline = [
    { $match: { brand: { $exists: true, $nin: [null, ""] } } },
    {
      $group: {
        _id: "$brand",
        productCount: { $sum: 1 },
        averageRating: { $avg: "$rating.average" },
      },
    },
    { $sort: { productCount: -1 } },
    { $limit: limitNum },
    {
      $project: {
        brand: "$_id",
        productCount: 1,
        averageRating: { $round: ["$averageRating", 2] },
        _id: 0,
      },
    },
  ];

  const results = await productsCollection.aggregate(pipeline).toArray();

  res.json(createSuccessResponse(results, `Found ${results.length} brands with most products`));
}
```

- [ ] **Step 4: Wire the route in `src/routes/products.ts`**

```typescript
/**
 * @swagger
 * /api/products/aggregations/reportingByBrand:
 *   get:
 *     summary: Get brands with the most products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Brand statistics
 */
router.get("/aggregations/reportingByBrand", asyncHandler(productController.getBrandsWithMostProducts));
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run test:unit
```

- [ ] **Step 6: Manually verify**

```bash
curl "http://localhost:3001/api/products/aggregations/reportingByBrand?limit=5"
```

- [ ] **Step 7: Commit**

```bash
git add src/controllers/productController.ts src/routes/products.ts tests/controllers/productController.test.ts tests/utils/testHelpers.ts
git commit -m "feat: add reportingByBrand aggregation endpoint"
```

---

## Task 19: Atlas Search endpoint

**Files:**
- Modify: `src/types/index.ts` (add `SearchPhrase`, `RawProductSearchQuery`, `SearchProductsResponse`)
- Modify: `src/controllers/productController.ts` (add `searchProducts`)
- Modify: `src/routes/products.ts` (add `GET /search`)
- Modify: `tests/controllers/productController.test.ts`

**Interfaces:**
- Produces: `searchProducts`, consumed by no later task.
- Requires an Atlas Search index named `productSearchIndex` — created manually in
  this task (cannot be created through the driver).

- [ ] **Step 1: Create the Atlas Search index (manual)**

In the Atlas UI: your cluster → "Search" tab → "Create Search Index" → JSON Editor →
database `musika`, collection `products` → index name `productSearchIndex` → paste:

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "brand": { "type": "string" },
      "tags": { "type": "string" },
      "seller": { "type": "string" }
    }
  }
}
```

Create the index and wait for its status to show "Active" (usually under a minute on
M0).

- [ ] **Step 2: Add types to `src/types/index.ts`**

```typescript
export interface SearchPhrase {
  phrase?: { query: string; path: string };
  text?: {
    query: string;
    path: string;
    matchCriteria?: "any" | "all";
    fuzzy?: { maxEdits: number; prefixLength: number };
  };
  compound?: {
    should?: Array<{
      phrase?: { query: string; path: string };
      text?: {
        query: string;
        path: string;
        matchCriteria?: "any" | "all";
        fuzzy?: { maxEdits: number; prefixLength: number };
      };
    }>;
    minimumShouldMatch?: number;
  };
}

export type RawProductSearchQuery = {
  brand?: string;
  tags?: string;
  seller?: string;
  limit?: string;
  skip?: string;
  searchOperator?: string;
};

export interface SearchProductsResponse {
  products: Product[];
  totalCount: number;
}
```

- [ ] **Step 3: Add the failing test**

Add to `tests/utils/testHelpers.ts`:

```typescript
export const SAMPLE_SEARCH_RESULTS = [
  { _id: new ObjectId(), name: "Nova Wireless Speaker", brand: "Nova", tags: ["bestseller"], price: 49.99 },
];
```

Add:

```typescript
  describe("searchProducts", () => {
    it("returns 400 when no search parameters are provided", async () => {
      mockRequest = createMockRequest({ query: {} });

      await searchProducts(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 400, "At least one search parameter must be provided", "NO_SEARCH_PARAMETERS");
    });

    it("returns 400 for an invalid searchOperator", async () => {
      mockRequest = createMockRequest({ query: { brand: "Nova", searchOperator: "invalid" } });

      await searchProducts(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
    });

    it("returns search results with total count", async () => {
      mockRequest = createMockRequest({ query: { brand: "Nova" } });
      mockToArray.mockResolvedValue([{ totalCount: [{ count: 1 }], results: SAMPLE_SEARCH_RESULTS }]);

      await searchProducts(mockRequest as Request, mockResponse as Response);

      expect(mockAggregate).toHaveBeenCalled();
      expectSuccessResponse(
        mockCreateSuccessResponse,
        { products: SAMPLE_SEARCH_RESULTS, totalCount: 1 },
        "Found 1 products matching the search criteria"
      );
    });
  });
```

Update the controller and `testHelpers` imports.

- [ ] **Step 4: Run the test to verify it fails**

```bash
npx jest tests/controllers/productController.test.ts
```

Expected: FAIL — function not exported yet.

- [ ] **Step 5: Implement `searchProducts` in `src/controllers/productController.ts`**

Add the import:

```typescript
import { SearchPhrase, RawProductSearchQuery, SearchProductsResponse } from "../types";
```

Append:

```typescript
export async function searchProducts(req: Request, res: Response): Promise<void> {
  const productsCollection = getCollection<Product>("products");

  const {
    brand,
    tags,
    seller,
    limit = "20",
    skip = "0",
    searchOperator = "must",
  }: RawProductSearchQuery = req.query;

  const validOperators = ["must", "should", "mustNot", "filter"];
  if (!validOperators.includes(searchOperator)) {
    res
      .status(400)
      .json(
        createErrorResponse(
          `Invalid searchOperator '${searchOperator}'. Must be one of: ${validOperators.join(", ")}`,
          "INVALID_SEARCH_OPERATOR"
        )
      );
    return;
  }

  const searchPhrases: SearchPhrase[] = [];

  function addFuzzyFieldSearch(path: string, value?: string): void {
    if (!value) return;
    searchPhrases.push({
      compound: {
        should: [
          { phrase: { query: value, path } },
          { text: { query: value, path, matchCriteria: "all" } },
          { text: { query: value, path, matchCriteria: "all", fuzzy: { maxEdits: 1, prefixLength: 2 } } },
        ],
        minimumShouldMatch: 1,
      },
    });
  }

  addFuzzyFieldSearch("brand", brand);
  addFuzzyFieldSearch("tags", tags);
  addFuzzyFieldSearch("seller", seller);

  if (searchPhrases.length === 0) {
    res.status(400).json(createErrorResponse("At least one search parameter must be provided", "NO_SEARCH_PARAMETERS"));
    return;
  }

  const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const skipNum = Math.max(parseInt(skip) || 0, 0);

  const pipeline = [
    { $search: { index: "productSearchIndex", compound: { [searchOperator]: searchPhrases } } },
    {
      $facet: {
        totalCount: [{ $count: "count" }],
        results: [
          { $skip: skipNum },
          { $limit: limitNum },
          {
            $project: {
              _id: 1,
              name: 1,
              price: 1,
              shortDescription: 1,
              description: 1,
              categories: 1,
              brand: 1,
              tags: 1,
              seller: 1,
              imageUrl: 1,
              condition: 1,
              countryOfOrigin: 1,
              rating: 1,
            },
          },
        ],
      },
    },
  ];

  const results = await productsCollection.aggregate(pipeline).toArray();
  const facetResult = results[0] || {};
  const totalCount = facetResult.totalCount?.[0]?.count || 0;
  const products = facetResult.results || [];

  const response: SearchProductsResponse = { products, totalCount };

  res.json(createSuccessResponse(response, `Found ${totalCount} products matching the search criteria`));
}
```

- [ ] **Step 6: Wire the route in `src/routes/products.ts`**

Add **above** `router.get("/:id", ...)`:

```typescript
/**
 * @swagger
 * /api/products/search:
 *   get:
 *     summary: Search products via Atlas Search
 *     description: Compound fuzzy/phrase search over brand, tags, and seller.
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Search results
 */
router.get("/search", asyncHandler(productController.searchProducts));
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npm run test:unit
```

- [ ] **Step 8: Manually verify against Atlas (index must show "Active")**

```bash
curl "http://localhost:3001/api/products/search?brand=Nova"
```

Expected: matching products with search scoring applied. If you get zero results
immediately after creating the index, wait ~30-60 seconds for it to finish building.

- [ ] **Step 9: Commit**

```bash
git add src/types/index.ts src/controllers/productController.ts src/routes/products.ts tests/controllers/productController.test.ts tests/utils/testHelpers.ts
git commit -m "feat: add Atlas Search endpoint over brand/tags/seller"
```

---

## Task 20: Voyage AI embeddings

**Files:**
- Create: `src/utils/voyageClient.ts`
- Test: `tests/utils/voyageClient.test.ts`
- Create: `scripts/generateEmbeddings.ts`

**Interfaces:**
- Consumes: `getCollection`, `connectToDatabase`, `closeDatabaseConnection` from
  `config/database.ts`; `Product` type.
- Produces: `generateVoyageEmbedding(text, apiKey, inputType)`, `VoyageAuthError`,
  `VoyageAPIError` — consumed by `vectorSearchProducts` in Task 21. Populates the
  `embedded_products` collection.

- [ ] **Step 1: Get a Voyage AI API key if you skipped it in Task 4**

Go to https://www.voyageai.com/, sign up, generate a key, and uncomment/set
`VOYAGE_API_KEY` in your `.env`.

- [ ] **Step 2: Write the failing test for `voyageClient.ts`**

```typescript
// tests/utils/voyageClient.test.ts
import { generateVoyageEmbedding, VoyageAuthError, VoyageAPIError } from "../../src/utils/voyageClient";

global.fetch = jest.fn();

describe("generateVoyageEmbedding", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it("returns the embedding array on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    });

    const result = await generateVoyageEmbedding("a product description", "fake-key");

    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("throws VoyageAuthError on a 401 response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });

    await expect(generateVoyageEmbedding("text", "bad-key")).rejects.toThrow(VoyageAuthError);
  });

  it("throws VoyageAPIError on other non-ok responses", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server error",
    });

    await expect(generateVoyageEmbedding("text", "fake-key")).rejects.toThrow(VoyageAPIError);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx jest tests/utils/voyageClient.test.ts
```

Expected: FAIL — `Cannot find module '../../src/utils/voyageClient'`.

- [ ] **Step 4: Implement `src/utils/voyageClient.ts`**

```typescript
export class VoyageAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoyageAuthError";
  }
}

export class VoyageAPIError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "VoyageAPIError";
    this.statusCode = statusCode;
  }
}

interface VoyageAIResponse {
  data: Array<{ embedding: number[] }>;
}

export async function generateVoyageEmbedding(
  text: string,
  apiKey: string,
  inputType: "query" | "document" = "query"
): Promise<number[]> {
  const requestBody = {
    input: [text],
    model: "voyage-3-large",
    output_dimension: 2048,
    input_type: inputType,
  };

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new VoyageAuthError("Invalid Voyage AI API key. Please check your VOYAGE_API_KEY in the .env file");
    }
    throw new VoyageAPIError(`Voyage AI API returned status ${response.status}: ${errorText}`, response.status);
  }

  const data = (await response.json()) as VoyageAIResponse;
  if (!data.data?.[0]?.embedding) {
    throw new VoyageAPIError("Invalid response format from Voyage AI API", 500);
  }
  return data.data[0].embedding;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest tests/utils/voyageClient.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Implement `scripts/generateEmbeddings.ts`**

```typescript
import dotenv from "dotenv";
dotenv.config();

import { connectToDatabase, closeDatabaseConnection, getCollection } from "../src/config/database";
import { generateVoyageEmbedding } from "../src/utils/voyageClient";
import { Product } from "../src/types";
import logger from "../src/utils/logger";

async function run() {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    logger.error("VOYAGE_API_KEY is not set in .env — cannot generate embeddings");
    process.exit(1);
  }

  await connectToDatabase();
  const productsCollection = getCollection<Product>("products");
  const embeddedCollection = getCollection("embedded_products");

  const products = await productsCollection.find({}).toArray();
  logger.info(`Generating embeddings for ${products.length} products...`);

  let count = 0;
  for (const product of products) {
    const text = [product.name, product.shortDescription, product.description].filter(Boolean).join(". ");

    const embedding = await generateVoyageEmbedding(text, apiKey, "document");

    await embeddedCollection.updateOne(
      { _id: product._id },
      { $set: { description_embedding_voyage_3_large: embedding } },
      { upsert: true }
    );

    count++;
    if (count % 20 === 0) {
      logger.info(`Embedded ${count}/${products.length} products`);
    }
  }

  logger.info(`Done. Embedded ${count} products.`);
  await closeDatabaseConnection();
}

run().catch((error) => {
  logger.error("Embedding generation failed:", error);
  process.exit(1);
});
```

- [ ] **Step 7: Run it against your real data**

```bash
npm run embeddings
```

Expected: logs progress every 20 products and finishes with "Done. Embedded 150
products." (adjust for however many you seeded). This calls the real Voyage AI API —
expect it to take a few minutes for 150 products.

- [ ] **Step 8: Commit**

```bash
git add src/utils/voyageClient.ts tests/utils/voyageClient.test.ts scripts/generateEmbeddings.ts
git commit -m "feat: add Voyage AI embedding client and generation script"
```

---

## Task 21: Vector Search endpoint

**Files:**
- Modify: `src/types/index.ts` (add `VectorSearchResult`)
- Modify: `src/controllers/productController.ts` (add `vectorSearchProducts`)
- Modify: `src/routes/products.ts` (add `GET /vector-search`)
- Modify: `tests/controllers/productController.test.ts`

**Interfaces:**
- Consumes: `generateVoyageEmbedding`, `VoyageAuthError`, `VoyageAPIError` from
  `utils/voyageClient.ts` (Task 20).
- Produces: `vectorSearchProducts`, consumed by no later task.
- Requires a Vector Search index named `vector_index` — created manually in this task.

- [ ] **Step 1: Create the Vector Search index (manual)**

In the Atlas UI: your cluster → "Search" tab → "Create Search Index" → choose
"Vector Search" → JSON Editor → database `musika`, collection `embedded_products` →
index name `vector_index` → paste:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "description_embedding_voyage_3_large",
      "numDimensions": 2048,
      "similarity": "cosine"
    }
  ]
}
```

Create the index and wait for "Active" status.

- [ ] **Step 2: Add `VectorSearchResult` to `src/types/index.ts`**

```typescript
export interface VectorSearchResult {
  _id: string;
  name: string;
  shortDescription?: string;
  imageUrl?: string;
  price?: number;
  categories?: string[];
  brand?: string;
  score: number;
}
```

- [ ] **Step 3: Add the failing test**

Add to `tests/utils/testHelpers.ts`:

```typescript
export const SAMPLE_VECTOR_RESULTS = [
  { _id: new ObjectId(), score: 0.85 },
  { _id: new ObjectId(), score: 0.78 },
];

export function createMockVoyageResponse(dimensions = 2048) {
  return { data: [{ embedding: new Array(dimensions).fill(0.1) }] };
}
```

At the top of the test file (it already mocks `global.fetch` for other purposes only
if a prior task added it — if not, add it):

```typescript
global.fetch = jest.fn();
```

Add:

```typescript
  describe("vectorSearchProducts", () => {
    beforeEach(() => {
      process.env.VOYAGE_API_KEY = "test-key";
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => createMockVoyageResponse(),
      });
    });

    afterEach(() => {
      delete process.env.VOYAGE_API_KEY;
    });

    it("returns 400 when q is missing", async () => {
      mockRequest = createMockRequest({ query: {} });

      await vectorSearchProducts(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(mockStatus, mockJson, 400, "Search query is required", "MISSING_QUERY_PARAMETER");
    });

    it("returns 400 when VOYAGE_API_KEY is not configured", async () => {
      delete process.env.VOYAGE_API_KEY;
      mockRequest = createMockRequest({ query: { q: "wireless speaker" } });

      await vectorSearchProducts(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
    });

    it("returns similar products sorted by score", async () => {
      mockRequest = createMockRequest({ query: { q: "wireless speaker" } });
      // First toArray() call is embeddedCollection.aggregate(...).toArray() (vector matches),
      // second is productsCollection.find(...).toArray() (the default mocked find chain
      // from earlier tasks also resolves through mockToArray) — queue both in call order.
      mockToArray.mockResolvedValueOnce(SAMPLE_VECTOR_RESULTS).mockResolvedValueOnce([]);

      await vectorSearchProducts(mockRequest as Request, mockResponse as Response);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.voyageai.com/v1/embeddings",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
```

Update the controller and `testHelpers` imports.

- [ ] **Step 4: Run the test to verify it fails**

```bash
npx jest tests/controllers/productController.test.ts
```

Expected: FAIL — function not exported yet.

- [ ] **Step 5: Implement `vectorSearchProducts` in `src/controllers/productController.ts`**

Add the import:

```typescript
import { generateVoyageEmbedding, VoyageAuthError, VoyageAPIError } from "../utils/voyageClient";
import { VectorSearchResult } from "../types";
```

Append:

```typescript
export async function vectorSearchProducts(req: Request, res: Response): Promise<void> {
  const { q, limit = "10" } = req.query;

  if (!q || typeof q !== "string" || q.trim().length === 0) {
    res.status(400).json(createErrorResponse("Search query is required", "MISSING_QUERY_PARAMETER"));
    return;
  }

  if (!process.env.VOYAGE_API_KEY || process.env.VOYAGE_API_KEY.trim().length === 0) {
    res
      .status(400)
      .json(
        createErrorResponse(
          "Vector search unavailable: VOYAGE_API_KEY not configured. Please add your API key to the .env file",
          "SERVICE_UNAVAILABLE"
        )
      );
    return;
  }

  const limitNum = Math.min(Math.max(parseInt(limit as string) || 10, 1), 50);

  try {
    const queryVector = await generateVoyageEmbedding(q.trim(), process.env.VOYAGE_API_KEY, "query");

    const embeddedCollection = getCollection("embedded_products");
    const vectorSearchPipeline = [
      {
        $vectorSearch: {
          index: "vector_index",
          path: "description_embedding_voyage_3_large",
          queryVector,
          numCandidates: limitNum * 20,
          limit: limitNum,
        },
      },
      { $project: { _id: 1, score: { $meta: "vectorSearchScore" } } },
    ];

    const vectorResults = await embeddedCollection.aggregate(vectorSearchPipeline).toArray();

    if (vectorResults.length === 0) {
      res.json(createSuccessResponse([], `No similar products found for query: '${q}'`));
      return;
    }

    const productIds = vectorResults.map((doc) => doc._id);
    const scoreMap = new Map<string, number>();
    vectorResults.forEach((doc) => scoreMap.set(doc._id.toString(), doc.score));

    const productsCollection = getCollection<Product>("products");
    const products = await productsCollection.find({ _id: { $in: productIds } }).toArray();

    const finalResults: VectorSearchResult[] = products
      .map((product) => ({
        _id: product._id!.toString(),
        name: product.name,
        shortDescription: product.shortDescription,
        imageUrl: product.imageUrl,
        price: product.price,
        categories: product.categories || [],
        brand: product.brand,
        score: scoreMap.get(product._id!.toString()) || 0,
      }))
      .sort((a, b) => b.score - a.score);

    res.json(createSuccessResponse(finalResults, `Found ${finalResults.length} similar products for query: '${q}'`));
  } catch (error) {
    logger.error("Vector search error:", error);

    if (error instanceof VoyageAuthError) {
      res
        .status(401)
        .json(
          createErrorResponse(error.message, "VOYAGE_AUTH_ERROR", "Please verify your VOYAGE_API_KEY is correct in the .env file")
        );
      return;
    }

    if (error instanceof VoyageAPIError) {
      res.status(503).json(createErrorResponse("Vector search service unavailable", "VOYAGE_API_ERROR", error.message));
      return;
    }

    res
      .status(500)
      .json(
        createErrorResponse(
          "Error performing vector search",
          "VECTOR_SEARCH_ERROR",
          error instanceof Error ? error.message : "Unknown error"
        )
      );
  }
}
```

Add the `logger` import at the top of `productController.ts` if not already present:

```typescript
import logger from "../utils/logger";
```

- [ ] **Step 6: Wire the route in `src/routes/products.ts`**

Add **above** `router.get("/:id", ...)`:

```typescript
/**
 * @swagger
 * /api/products/vector-search:
 *   get:
 *     summary: Semantic search via MongoDB Vector Search
 *     description: Uses Voyage AI embeddings and $vectorSearch to find products with semantically similar descriptions.
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Vector search results with similarity scores
 */
router.get("/vector-search", asyncHandler(productController.vectorSearchProducts));
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npm run test:unit
```

- [ ] **Step 8: Manually verify against Atlas (index must show "Active", embeddings must be generated)**

```bash
curl "http://localhost:3001/api/products/vector-search?q=a compact wireless speaker for the kitchen"
```

Expected: a ranked list of semantically similar products with `score` fields.

- [ ] **Step 9: Commit**

```bash
git add src/types/index.ts src/controllers/productController.ts src/routes/products.ts tests/controllers/productController.test.ts tests/utils/testHelpers.ts
git commit -m "feat: add Vector Search endpoint using Voyage AI embeddings"
```

---

## Task 22: Swagger/OpenAPI documentation

**Files:**
- Create: `src/config/swagger.ts`
- Modify: `src/app.ts` (mount `/api-docs`)

**Interfaces:**
- Consumes: none new.
- Produces: `swaggerSpec`, mounted at `/api-docs` via `swagger-ui-express`.

- [ ] **Step 1: Implement `src/config/swagger.ts`**

```typescript
import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Musika API",
      version: "1.0.0",
      description:
        "Express.js backend demonstrating MongoDB operations against a product catalog. " +
        "Provides CRUD, text/Atlas/vector search, filtering, pagination, and aggregation reporting.",
      contact: { name: "API Support" },
      license: { name: "MIT" },
    },
    servers: [{ url: "http://localhost:3001", description: "Development server" }],
    tags: [
      { name: "Products", description: "Product CRUD operations and queries" },
      { name: "Info", description: "API information" },
    ],
    components: {
      schemas: {
        Product: {
          type: "object",
          required: ["name", "price"],
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            name: { type: "string", example: "Nova Wireless Speaker" },
            price: { type: "number", example: 49.99 },
            shortDescription: { type: "string" },
            description: { type: "string" },
            categories: { type: "array", items: { type: "string" }, example: ["Electronics"] },
            brand: { type: "string", example: "Nova" },
            tags: { type: "array", items: { type: "string" } },
            seller: { type: "string" },
            weightGrams: { type: "integer" },
            condition: { type: "string", enum: ["new", "used", "refurbished"] },
            imageUrl: { type: "string" },
            countryOfOrigin: { type: "string" },
            sku: { type: "string" },
            rating: {
              type: "object",
              properties: {
                average: { type: "number" },
                count: { type: "integer" },
              },
            },
          },
        },
        CreateProductRequest: {
          type: "object",
          required: ["name", "price"],
          properties: {
            name: { type: "string" },
            price: { type: "number" },
            categories: { type: "array", items: { type: "string" } },
            brand: { type: "string" },
          },
        },
        UpdateProductRequest: {
          type: "object",
          description: "All fields are optional for partial updates",
          properties: {
            name: { type: "string" },
            price: { type: "number" },
            categories: { type: "array", items: { type: "string" } },
          },
        },
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string" },
            data: { type: "object" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                message: { type: "string" },
                code: { type: "string" },
                details: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts", "./src/app.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
```

- [ ] **Step 2: Mount it in `src/app.ts`**

Add the import:

```typescript
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
```

Add after `app.use(requestLogger);` and before `app.use("/api/products", productsRouter);`:

```typescript
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```

Update the root endpoint's `endpoints` object to include `documentation: "/api-docs"`.

- [ ] **Step 3: Verify docs render**

```bash
npm run dev
```

Visit `http://localhost:3001/api-docs` in a browser. Expected: Swagger UI loads and
lists all Products endpoints (list, get-by-id, categories, search, vector-search,
the three aggregations, create, batch-create, update, batch-update, delete,
batch-delete, find-and-delete) grouped under the "Products" tag.

- [ ] **Step 4: Commit**

```bash
git add src/config/swagger.ts src/app.ts
git commit -m "feat: add Swagger/OpenAPI documentation at /api-docs"
```

---

## Task 23: Integration test suite

**Files:**
- Create: `jest.config.json`
- Create: `jest.integration.config.json`
- Create: `tests/setup.ts`
- Create: `tests/integration/setup.ts`
- Create: `tests/integration/product.integration.test.ts`

**Interfaces:**
- Consumes: `app` from `src/app.ts`; `connectToDatabase`, `closeDatabaseConnection`
  from `config/database.ts`.
- Produces: `npm test` (unit, via `jest.config.json`) and `npm run test:integration`
  (via `jest.integration.config.json`), both runnable independently.

- [ ] **Step 1: Create `jest.config.json`**

```json
{
  "preset": "ts-jest",
  "testEnvironment": "node",
  "roots": ["<rootDir>/src", "<rootDir>/tests"],
  "testMatch": ["**/?(*.)+(spec|test).ts"],
  "testPathIgnorePatterns": ["/node_modules/", "/tests/integration/"],
  "transform": { "^.+\\.ts$": "ts-jest" },
  "collectCoverageFrom": ["src/**/*.ts", "!src/**/*.d.ts"],
  "coverageDirectory": "coverage",
  "coverageReporters": ["text", "lcov", "html"],
  "setupFilesAfterEnv": ["<rootDir>/tests/setup.ts"]
}
```

- [ ] **Step 2: Create `jest.integration.config.json`**

```json
{
  "preset": "ts-jest",
  "testEnvironment": "node",
  "roots": ["<rootDir>/tests/integration"],
  "testMatch": ["**/integration/**/*.test.ts"],
  "transform": { "^.+\\.ts$": "ts-jest" },
  "setupFilesAfterEnv": ["<rootDir>/tests/integration/setup.ts"],
  "testTimeout": 60000
}
```

- [ ] **Step 3: Create `tests/setup.ts`**

```typescript
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX = "10000";
process.env.MONGODB_URI = "mongodb://localhost:27017/test_musika";
process.env.PORT = "3002";

jest.setTimeout(30000);

global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
```

- [ ] **Step 4: Create `tests/integration/setup.ts`**

```typescript
import { connectToDatabase, closeDatabaseConnection } from "../../src/config/database";
import dotenv from "dotenv";

dotenv.config();
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX = "10000";

jest.setTimeout(120000);

export function isIntegrationTestEnabled(): boolean {
  return !!process.env.MONGODB_URI;
}

let hasShownSkipMessage = false;

export const describeIntegration: jest.Describe = isIntegrationTestEnabled()
  ? describe
  : ((...args: Parameters<jest.Describe>) => {
      if (!hasShownSkipMessage) {
        console.log(`
Integration tests skipped: MONGODB_URI environment variable is not set
`);
        hasShownSkipMessage = true;
      }
      return describe.skip(...args);
    }) as jest.Describe;

beforeAll(async () => {
  if (!isIntegrationTestEnabled()) return;
  await connectToDatabase();
});

afterAll(async () => {
  if (!isIntegrationTestEnabled()) return;
  await closeDatabaseConnection();
});
```

- [ ] **Step 5: Write `tests/integration/product.integration.test.ts`**

```typescript
import request from "supertest";
import { app } from "../../src/app";
import { describeIntegration } from "./setup";

describeIntegration("Product API (integration)", () => {
  let createdProductId: string;

  it("GET /api/products returns a list of products", async () => {
    const response = await request(app).get("/api/products");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("POST /api/products creates a product", async () => {
    const response = await request(app)
      .post("/api/products")
      .send({ name: "Integration Test Widget", price: 12.34, categories: ["Electronics"] });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe("Integration Test Widget");
    createdProductId = response.body.data._id;
  });

  it("GET /api/products/:id retrieves the created product", async () => {
    const response = await request(app).get(`/api/products/${createdProductId}`);

    expect(response.status).toBe(200);
    expect(response.body.data._id).toBe(createdProductId);
  });

  it("PATCH /api/products/:id updates the product", async () => {
    const response = await request(app).patch(`/api/products/${createdProductId}`).send({ price: 15.99 });

    expect(response.status).toBe(200);
    expect(response.body.data.price).toBe(15.99);
  });

  it("DELETE /api/products/:id deletes the product", async () => {
    const response = await request(app).delete(`/api/products/${createdProductId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.deletedCount).toBe(1);
  });

  it("GET /api/products/:id returns 404 after deletion", async () => {
    const response = await request(app).get(`/api/products/${createdProductId}`);

    expect(response.status).toBe(404);
  });

  it("GET /api/products/aggregations/reportingByCategory returns category stats", async () => {
    const response = await request(app).get("/api/products/aggregations/reportingByCategory");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});
```

- [ ] **Step 6: Run the unit suite to confirm it's unaffected**

```bash
npm test
```

Expected: PASS, same test count as before (integration tests are excluded via
`testPathIgnorePatterns`).

- [ ] **Step 7: Run the integration suite against your real Atlas cluster**

```bash
npm run test:integration
```

Expected: PASS (7 tests), running against your real seeded `musika` database.

- [ ] **Step 8: Commit**

```bash
git add jest.config.json jest.integration.config.json tests/setup.ts tests/integration/setup.ts tests/integration/product.integration.test.ts
git commit -m "test: add integration test suite against a real MongoDB instance"
```

---

## Task 24: README and final verification pass

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: none — this is documentation only.

- [ ] **Step 1: Write the full `README.md`**

```markdown
# Musika

Express.js + TypeScript + MongoDB backend for a product catalog API, built as a
step-by-step replica of MongoDB's sample-app-nodejs-mflix architecture, applied to
an e-commerce domain.

## Stack

Node.js, TypeScript, Express 5, MongoDB (official driver, no ODM), Winston, Jest +
Supertest, ESLint + Prettier, Swagger/OpenAPI.

## Setup

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`
2. Copy \`.env.example\` to \`.env\` and fill in your MongoDB Atlas connection string
   (and, optionally, a Voyage AI API key for vector search).
3. Seed sample data:
   \`\`\`bash
   npm run seed
   \`\`\`
4. (Optional, for vector search) Generate embeddings:
   \`\`\`bash
   npm run embeddings
   \`\`\`
5. Start the dev server:
   \`\`\`bash
   npm run dev
   \`\`\`
6. Open API docs at http://localhost:3001/api-docs

## Scripts

- \`npm run dev\` — start the dev server with ts-node
- \`npm run build\` / \`npm start\` — compile and run the production build
- \`npm run seed\` — populate \`products\`/\`reviews\` with sample data
- \`npm run embeddings\` — generate Voyage AI embeddings into \`embedded_products\`
- \`npm test\` / \`npm run test:unit\` — unit tests (mocked database)
- \`npm run test:integration\` — integration tests against a real MongoDB instance
- \`npm run lint\` / \`npm run format\` — ESLint / Prettier

## API surface

CRUD, filtering/pagination/text search, Atlas Search, Vector Search, and three
aggregation-reporting endpoints under \`/api/products\`. Full details in Swagger UI
at \`/api-docs\` once the server is running.

## Required external setup

- MongoDB Atlas cluster (see \`docs/superpowers/specs/2026-07-28-backend-design.md\`
  for full setup steps)
- Atlas Search index \`productSearchIndex\` on \`products\` (brand/tags/seller)
- Atlas Vector Search index \`vector_index\` on \`embedded_products\`
  (\`description_embedding_voyage_3_large\`, 2048 dimensions, cosine similarity)
- Voyage AI API key, for the embeddings script and vector search endpoint
```

- [ ] **Step 2: Run the full verification pass**

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
npm run test:integration
```

Expected: all five commands succeed with zero errors/failures. This confirms lint is
clean, types check, the production build compiles, and both test suites pass against
your real Atlas cluster.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: write full README with setup instructions"
```

---

## Post-plan checklist

After Task 24, you have a complete backend covering every item in the spec: 9 CRUD
endpoints, filtering/pagination/text search, 3 aggregation endpoints, Atlas Search,
Vector Search, Swagger docs, rate limiting, structured logging, and both unit and
integration test suites — built incrementally with an explanation of each new
MongoDB/Express/TypeScript concept as it was introduced.
