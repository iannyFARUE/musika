import dotenv from "dotenv";
dotenv.config({ quiet: true });

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
