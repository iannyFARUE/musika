import { Request, Response } from "express";
import { Document, ObjectId, Sort } from "mongodb";
import { getCollection } from "../config/database";
import { createErrorResponse, createSuccessResponse, validateRequiredFields } from "../utils/errorHandler";
import { convertFilterObjectIds, InvalidMongoQueryError, sanitizeBatchFilter, sanitizeUpdateFields } from "../utils/mongoQuery";
import { CreateProductRequest, Product, RawProductQuery, UpdateProductRequest } from "../types";

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
