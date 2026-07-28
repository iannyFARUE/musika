# Musika Backend — Design Spec

**Date:** 2026-07-28
**Status:** Approved

## Purpose

Replicate the architecture and MongoDB best practices demonstrated in MongoDB's
[sample-app-nodejs-mflix](https://github.com/mongodb/docs-sample-apps) reference backend,
applied to a new domain (e-commerce), as a deliberate step-by-step learning exercise rather
than a copy-paste port. The goal is to understand *why* each piece exists (Express 5,
the native MongoDB driver, TypeScript, aggregation pipelines, Atlas Search, Vector Search,
logging, testing) well enough to build similar backends independently afterward.

Backend only — no frontend/client.

## Build approach

Layered-incremental, in vertical feature slices of increasing complexity:

1. Scaffold the skeleton first (TS/lint config, env config, DB connection, logger, error
   handler) — no domain logic yet, but the app boots and connects to Atlas.
2. Build one vertical slice at a time (route + controller + types + Swagger doc + tests
   together), each slice adding one new MongoDB concept on top of a working app:
   basic CRUD → filtering/pagination/text search → aggregations → Atlas Search →
   Vector Search → final hardening pass.
3. Tests are written immediately after each slice is implemented and verified working
   (not strict pre-implementation TDD) — this verifies understanding of what was just
   built without adding red-green ceremony while still learning a new stack.

## Tech stack

Same stack as the reference app, plus linting/formatting:

- **Runtime/lang:** Node.js LTS 22, TypeScript 5, `ts-node` (dev), `tsc` (build), CommonJS output
- **Framework:** Express 5
- **Database:** MongoDB Atlas via the official `mongodb` Node driver (no ODM — the raw
  driver is used deliberately so the actual MongoDB query/aggregation API is learned,
  not an abstraction over it)
- **Docs:** `swagger-jsdoc` + `swagger-ui-express`, generated from JSDoc comments on routes
- **Logging:** `winston`, environment-aware (colorized console in dev, JSON in prod, silent in test)
- **Security/robustness:** `cors`, `express-rate-limit`, manual filter/update field
  allow-listing (prevents NoSQL injection via arbitrary operators)
- **Testing:** `jest` + `ts-jest` (unit), `supertest` (integration), separate Jest configs
  for unit vs. integration
- **Tooling (new vs. reference app):** ESLint + Prettier (flat config, `@typescript-eslint`,
  `eslint-config-prettier`)
- **Seeding (new vs. reference app):** `@faker-js/faker`-driven seed script, since there's
  no MongoDB-hosted sample dataset for this domain

## Project structure

```
musika/
  src/
    config/       (database.ts, swagger.ts)
    controllers/  (productController.ts)
    middleware/   (rateLimiter.ts, requestLogger.ts)
    routes/       (products.ts)
    types/        (index.ts)
    utils/        (errorHandler.ts, logger.ts, mongoQuery.ts)
    app.ts
  tests/
    controllers/
    integration/
    utils/
  scripts/        (seed.ts)
  .env.example
  package.json / tsconfig.json / jest.config.json / jest.integration.config.json
  eslint.config.js / .prettierrc
```

## Data model

Maps the reference app's movie/comment model onto e-commerce, preserving the same
*shape* of relationships (one primary collection with rich nested/array fields, one
child collection joined via `$lookup`) so every MongoDB pattern in the reference has a
direct equivalent.

| Reference (mflix) | Musika (products) | Purpose |
|---|---|---|
| `movies` collection | `products` collection | primary collection |
| `comments` collection | `reviews` collection | child collection, joined via `$lookup` |
| `title` | `name` | text-indexed |
| `plot` / `fullplot` | `shortDescription` / `description` | text-indexed |
| `genres` (array) | `categories` (array) | regex/filter field |
| `imdb.rating` / `imdb.votes` | `rating.average` / `rating.count` | nested numeric, range-filterable |
| `directors` / `writers` / `cast` (3 array/string fields, Atlas Search compound) | `brand` (string), `tags` (array), `seller` (string) | compound/fuzzy Atlas Search demo fields |
| `runtime`, `rated`, `poster`, `countries`, `languages`, `awards` | `weightGrams`, `condition` (`new`/`used`/`refurbished`), `imageUrl`, `countryOfOrigin`, `sku` | flavor fields, direct swaps |
| `year` (drives `reportingByYear`) | *dropped* — replaced by `reportingByCategory`/`reportingByBrand` (see Aggregations) | doesn't map naturally onto a product |

`reviews` schema: `{ _id, product_id, name, email, rating, text, date }` — direct analog
of `comments`.

Vector search: embeddings stored in a separate `embedded_products` collection
(`description_embedding_voyage_3_large` field), mirroring the reference's `embedded_movies`.

Indexes:
- Text index on `name`, `shortDescription`, `description` (created programmatically,
  like the reference's `verifyRequirements()`)
- Atlas Search index (`productSearchIndex`) compound over `brand`, `tags`, `seller`
  (created via Atlas UI/CLI — not creatable through the driver)
- Vector Search index (`vector_index`) on `embedded_products.description_embedding_voyage_3_large`
  (also created via Atlas UI/CLI)

## API surface

Same endpoint shape as the reference, remapped to `/api/products`:

**CRUD & queries**
- `GET /api/products` — filter by `q` (text search), `category`, `minPrice`/`maxPrice`,
  `minRating`, pagination (`limit`/`skip`), `sortBy`/`sortOrder`
- `GET /api/products/categories` — `distinct()` on `categories`
- `GET /api/products/:id` — `findOne()`
- `POST /api/products` — `insertOne()`
- `POST /api/products/batch` — `insertMany()`
- `PATCH /api/products/:id` — `updateOne()`
- `PATCH /api/products` — `updateMany()` with filter+update body
- `DELETE /api/products/:id` — `deleteOne()`
- `DELETE /api/products` — `deleteMany()` with required non-empty filter
- `DELETE /api/products/:id/find-and-delete` — `findOneAndDelete()`

**Search**
- `GET /api/products/search` — Atlas Search compound query over `brand`/`tags`/`seller`
  (phrase + fuzzy text scoring hierarchy)
- `GET /api/products/vector-search` — Voyage AI embedding + `$vectorSearch` over `embedded_products`

**Aggregations**
- `GET /api/products/aggregations/reportingByReviews` — products with most recent
  reviews (`$lookup` + `$sortArray` + `$slice`)
- `GET /api/products/aggregations/reportingByCategory` — category stats: count,
  avg/highest/lowest price, total review count (`$unwind` + `$group`)
- `GET /api/products/aggregations/reportingByBrand` — brands with most products, avg
  rating (`$group`)

Same response envelope (`SuccessResponse`/`ErrorResponse` with `success`, `message`,
`data`, `timestamp`), same `asyncHandler` wrapper, same rate-limiter-per-router pattern,
same Swagger JSDoc-per-route pattern.

## Cross-cutting concerns

Carried over from the reference, renamed to the product domain:

- **Error handling:** `asyncHandler` wrapper on every route, central `errorHandler`
  middleware, `ValidationError`/`InvalidMongoQueryError` custom error classes, MongoDB
  error code mapping (11000 duplicate key → 409, etc.)
- **Query safety:** allow-listed filter fields/operators for batch update/delete,
  regex-escaping for category filters, ObjectId conversion/validation for `$in` filters
  — the NoSQL-injection defense.
- **Logging:** `winston`, same level/env config, `requestLogger` middleware logging
  method/url/status/response-time
- **Rate limiting:** `express-rate-limit` on `/api/products`, overridable via env var for tests
- **CORS:** same comma-separated `CORS_ORIGINS` env pattern
- **Docs:** Swagger UI at `/api-docs`, JSDoc per route

## Testing strategy

Mirrors the reference's dual Jest config:

- `tests/controllers/*.test.ts` — unit tests against a mocked MongoDB collection
  (matches the reference's approach of mocking collection methods directly rather than
  hitting a DB)
- `tests/integration/*.integration.test.ts` — `supertest` against the real Express app +
  a real (test) MongoDB database, run via a separate `jest.integration.config.json`
- `tests/utils/testHelpers.ts` — shared fixtures/builders (e.g. `buildProduct()`)

## Environment setup (from zero)

1. Create a free MongoDB Atlas account + M0 free-tier cluster
2. Create a DB user + network access entry
3. Get the connection string → `.env`
4. Get a Voyage AI API key (free tier) for the vector-search step → `.env`
5. `scripts/seed.ts` (`npm run seed`) — generates ~100-200 realistic fake products +
   reviews with `@faker-js/faker` and inserts them into `musika.products` / `musika.reviews`
6. Index creation — text index created programmatically at startup; Atlas Search and
   Vector Search indexes created manually via Atlas UI/CLI using provided JSON definitions

## Build milestones

Each is a working, testable increment:

1. Skeleton: TS/ESLint/Prettier config, `.env` handling, DB connection module, logger,
   error handler, `app.ts` boots and connects to Atlas
2. Seed script + `Product`/`Review` types
3. Basic CRUD slice (all 9 CRUD/query endpoints) + unit tests
4. Text search + filtering/pagination refinements + tests
5. Aggregation pipelines (3 endpoints) + tests
6. Atlas Search endpoint + tests
7. Vector Search endpoint (Voyage AI) + tests
8. Swagger docs pass + rate limiting + integration test suite + README

## Technologies to understand

**Core — written/reasoned about daily**
- TypeScript fundamentals for backends: interfaces vs. types, generics (`Collection<T>`),
  `strict` mode, `tsconfig.json`'s `target`/`module`/`lib`
- Express 5 basics: routers, middleware chains, `req`/`res`/`next`, why async handlers
  need a wrapper since Express doesn't auto-catch rejected promises
- MongoDB Node driver: `MongoClient`, connection pooling/lifecycle, `ObjectId`, core CRUD
  methods, cursors vs. `.toArray()`
- Aggregation framework: `$match`, `$group`, `$unwind`, `$lookup`, `$project`, `$sort`,
  `$facet`, `$addFields` — the part of MongoDB most different from SQL
- Indexes: why queries need them, text indexes vs. regular indexes vs. Atlas Search
  indexes (three different things), `explain()`

**Important — configured/used less often**
- MongoDB Atlas Search: Lucene-based search engine layered on Atlas, `$search` stage,
  `compound` operator, fuzzy matching, vs. basic `$text` index
- Vector Search & embeddings: what an embedding represents, approximate nearest-neighbor
  search via `$vectorSearch`, why an external API call (Voyage AI) generates the query vector
- dotenv & environment config: 12-factor config, why secrets never get committed
- Winston logging: levels, transports, structured JSON vs. colorized console

**Good to know — supporting concepts**
- NoSQL injection: why unrestricted user-supplied filter objects are dangerous, and how
  field/operator allow-listing defends against it
- OpenAPI/Swagger: what an API spec is for, how `swagger-jsdoc` derives it from comments
- Jest + Supertest: unit tests (mocked collection) vs. integration tests (real DB + HTTP)
- CORS & rate limiting: what problem each solves at the HTTP layer

These will be explained in context, at the point the code that uses them is built,
rather than front-loaded.
