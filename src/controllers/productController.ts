import { Request, Response } from "express";
import { ObjectId, Sort } from "mongodb";
import { getCollection } from "../config/database";
import { createErrorResponse, createSuccessResponse, validateRequiredFields } from "../utils/errorHandler";
import { CreateProductRequest, Product, RawProductQuery } from "../types";

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
      throw new Error(`Product at index ${index}: ${error instanceof Error ? error.message : "Unknown error"}`, {
        cause: error,
      });
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
