# Musika

Express.js + TypeScript + MongoDB backend for a product catalog API, built as a
step-by-step replica of MongoDB's [sample-app-nodejs-mflix](https://github.com/mongodb/docs-sample-apps)
architecture, applied to an e-commerce domain instead of movies.

## Stack

Node.js, TypeScript (strict mode), Express 5, MongoDB Atlas via the official `mongodb`
driver (no ODM), Winston, Jest + Supertest, ESLint + Prettier, Swagger/OpenAPI,
Voyage AI (embeddings for Vector Search).

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your MongoDB Atlas connection string.
   Note: if your database password contains an `@` or other URI-reserved character
   (`:`, `/`, `?`, `#`, `%`), percent-encode it (e.g. `@` → `%40`) or the connection
   string will fail to parse.
3. Seed sample data:
   ```bash
   npm run seed
   ```
   This populates `products` (150 documents) and `reviews` (~500-700 documents,
   randomly distributed).
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Open API docs at http://localhost:3001/api-docs

### Enabling Atlas Search

1. In the Atlas UI: your cluster → **Search** tab → **Create Search Index** → JSON
   Editor → database `musika`, collection `products` → **index name `productSearchIndex`**
   (double check the name field — it's separate from the JSON body and defaults to
   `default` if left unset).
2. Definition:
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
3. Wait for status **Active**, then `GET /api/products/search?brand=<value>` will work.

### Enabling Vector Search

1. Add `VOYAGE_API_KEY` to `.env` (get one at https://www.voyageai.com/).
2. Generate embeddings for all seeded products:
   ```bash
   npm run embeddings
   ```
   This batches requests (10 products/call) with a delay between batches to stay
   under Voyage's free-tier rate limit (3 requests/minute without a payment method
   on file) — takes about 5 minutes for 150 products.
3. In Atlas: **Search** tab → **Create Search Index** → **Vector Search** → database
   `musika`, collection `embedded_products` → index name `vector_index`:
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
4. Wait for **Active**, then `GET /api/products/vector-search?q=<natural language query>`
   will work.

## Scripts

- `npm run dev` — start the dev server with ts-node
- `npm run build` / `npm start` — compile and run the production build
- `npm run seed` — populate `products`/`reviews` with sample data (clears existing data first)
- `npm run embeddings` — generate Voyage AI embeddings into `embedded_products`
- `npm test` / `npm run test:unit` — unit tests (mocked database, no network calls)
- `npm run test:integration` — integration tests against a real MongoDB instance
  (requires `MONGODB_URI` in `.env`; self-skips otherwise)
- `npm run lint` / `npm run format` — ESLint / Prettier

## API surface

All routes are under `/api/products`:

- **CRUD**: `GET /`, `GET /:id`, `POST /`, `POST /batch`, `PATCH /:id`, `PATCH /`,
  `DELETE /:id`, `DELETE /`, `DELETE /:id/find-and-delete`
- **Queries**: `GET /categories` (distinct), filtering/pagination/sorting on `GET /`
  (`q`, `category`, `minPrice`, `maxPrice`, `minRating`, `limit`, `skip`, `sortBy`, `sortOrder`)
- **Search**: `GET /search` (Atlas Search, fuzzy/phrase over brand/tags/seller),
  `GET /vector-search` (semantic search via Voyage AI embeddings)
- **Aggregations**: `GET /aggregations/reportingByReviews`,
  `GET /aggregations/reportingByCategory`, `GET /aggregations/reportingByBrand`

Full interactive docs at `/api-docs` once the server is running.

## Project structure

```
musika/
  src/
    config/       database connection, Swagger config
    controllers/  business logic for each endpoint
    middleware/   rate limiting, request logging
    routes/       Express route definitions + Swagger JSDoc
    types/        TypeScript interfaces and type aliases
    utils/        error handling, logging, query sanitization, Voyage AI client
    app.ts        Express app bootstrap
  tests/
    controllers/  unit tests (mocked database)
    integration/  integration tests (real database via Supertest)
    utils/        shared test fixtures/helpers
  scripts/
    seed.ts               generates and inserts sample products/reviews
    generateEmbeddings.ts backfills Voyage AI embeddings for Vector Search
```

## Design notes

- No ODM: the raw MongoDB driver is used throughout so the actual query and
  aggregation APIs are visible, not abstracted away.
- Batch update/delete endpoints sanitize user-supplied filter/update objects through
  an explicit field/operator allow-list (`src/utils/mongoQuery.ts`) before they reach
  the driver — this is the NoSQL-injection defense (an unrestricted filter object like
  `{"$where": "..."}` would otherwise let a caller run arbitrary query logic).
- Unit tests mock the database collection entirely; integration tests exercise the
  real Express app + real MongoDB via Supertest. Both matter: unit tests catch logic
  bugs fast, integration tests catch wiring/routing bugs unit tests can't see.
