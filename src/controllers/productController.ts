import { Request, Response } from "express";
import { Document, ObjectId, Sort } from "mongodb";
import { getCollection } from "../config/database";
import { createErrorResponse, createSuccessResponse, validateRequiredFields } from "../utils/errorHandler";
import {
  convertFilterObjectIds,
  escapeRegexLiteral,
  InvalidMongoQueryError,
  sanitizeBatchFilter,
  sanitizeUpdateFields,
} from "../utils/mongoQuery";
import {
  AggregationReview,
  CreateProductRequest,
  Product,
  ProductFilter,
  ProductWithReviewsResult,
  RawProductQuery,
  RawProductSearchQuery,
  SearchPhrase,
  SearchProductsResponse,
  UpdateProductRequest,
} from "../types";

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
