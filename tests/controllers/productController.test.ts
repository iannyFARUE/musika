import { Request, Response } from "express";
import {
  TEST_OBJECT_IDS,
  SAMPLE_PRODUCT,
  SAMPLE_PRODUCTS,
  SAMPLE_REQUESTS,
  SAMPLE_RESPONSES,
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
const mockInsertOne = jest.fn();
const mockInsertMany = jest.fn();
const mockUpdateOne = jest.fn();
const mockUpdateMany = jest.fn();
const mockDeleteOne = jest.fn();
const mockDeleteMany = jest.fn();
const mockFindOneAndDelete = jest.fn();

const mockGetCollection = jest.fn(() => ({
  find: mockFind.mockReturnValue({
    toArray: mockToArray,
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
  }),
  findOne: mockFindOne,
  insertOne: mockInsertOne,
  insertMany: mockInsertMany,
  updateOne: mockUpdateOne,
  updateMany: mockUpdateMany,
  deleteOne: mockDeleteOne,
  deleteMany: mockDeleteMany,
  findOneAndDelete: mockFindOneAndDelete,
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

jest.mock("../../src/utils/errorHandler", () => {
  const actual = jest.requireActual("../../src/utils/errorHandler");
  return {
    createSuccessResponse: mockCreateSuccessResponse,
    createErrorResponse: mockCreateErrorResponse,
    validateRequiredFields: actual.validateRequiredFields,
  };
});

import {
  getAllProducts,
  getProductById,
  createProduct,
  createProductsBatch,
  updateProduct,
  updateProductsBatch,
  deleteProduct,
  deleteProductsBatch,
  findAndDeleteProduct,
} from "../../src/controllers/productController";

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

      expectErrorResponse(
        mockStatus,
        mockJson,
        400,
        "Request body must be a non-empty array of product objects",
        "INVALID_INPUT"
      );
    });
  });

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

      expectErrorResponse(
        mockStatus,
        mockJson,
        400,
        "Both filter and update objects are required",
        "MISSING_REQUIRED_FIELDS"
      );
    });

    it("rejects an unsupported filter field", async () => {
      mockRequest = createMockRequest({ body: { filter: { notAField: 1 }, update: { price: 5 } } });

      await updateProductsBatch(mockRequest as Request, mockResponse as Response);

      expectErrorResponse(
        mockStatus,
        mockJson,
        400,
        "Filter contains an unsupported field or operator",
        "INVALID_FILTER"
      );
    });

    it("updates matching products", async () => {
      mockRequest = createMockRequest({ body: { filter: { brand: "Nova" }, update: { price: 5 } } });
      mockUpdateMany.mockResolvedValue(SAMPLE_RESPONSES.UPDATE_MANY);

      await updateProductsBatch(mockRequest as Request, mockResponse as Response);

      expect(mockUpdateMany).toHaveBeenCalledWith({ brand: "Nova" }, { $set: { price: 5 } });
    });
  });

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
      mockDeleteOne.mockResolvedValue({ deletedCount: 1 });

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
      mockDeleteMany.mockResolvedValue({ deletedCount: 10 });

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
});
