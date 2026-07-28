import { MongoClient, Db, Collection, Document, ServerApiVersion } from "mongodb";
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

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
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
    const existingTextIndex = existingIndexes.find(
      (index) => index.key && index.key._fts === "text"
    );

    if (existingTextIndex) {
      logger.debug(
        `Text search index '${existingTextIndex.name}' already exists on products collection`
      );
      return;
    }

    await productsCollection.createIndex(
      { name: "text", shortDescription: "text", description: "text" },
      { name: TEXT_INDEX_NAME, background: true }
    );
    logger.info(
      `Text search index '${TEXT_INDEX_NAME}' created successfully for products collection`
    );
  } catch (error) {
    logger.warn("Could not create text search index:", error);
    logger.warn("Text search functionality may not work without the index");
  }
}
