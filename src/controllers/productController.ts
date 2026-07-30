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
