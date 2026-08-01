import dotenv from "dotenv";
dotenv.config({ quiet: true });

import { connectToDatabase, closeDatabaseConnection, getCollection } from "../src/config/database";
import { generateVoyageEmbeddingsBatch } from "../src/utils/voyageClient";
import { Product } from "../src/types";
import logger from "../src/utils/logger";

const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 21000; // stay under Voyage's free-tier 3 requests/minute limit

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

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
  const batches = chunk(products, BATCH_SIZE);
  logger.info(
    `Generating embeddings for ${products.length} products in ${batches.length} batches of ${BATCH_SIZE}...`
  );

  let count = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const texts = batch.map((product) =>
      [product.name, product.shortDescription, product.description].filter(Boolean).join(". ")
    );

    const embeddings = await generateVoyageEmbeddingsBatch(texts, apiKey, "document");

    for (let j = 0; j < batch.length; j++) {
      await embeddedCollection.updateOne(
        { _id: batch[j]._id },
        { $set: { description_embedding_voyage_3_large: embeddings[j] } },
        { upsert: true }
      );
      count++;
    }

    logger.info(`Embedded batch ${i + 1}/${batches.length} (${count}/${products.length} products)`);

    if (i < batches.length - 1) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  logger.info(`Done. Embedded ${count} products.`);
  await closeDatabaseConnection();
}

run().catch((error) => {
  logger.error("Embedding generation failed:", error);
  process.exit(1);
});
