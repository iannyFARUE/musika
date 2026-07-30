import { Request, Response } from "express";
import {
  TEST_OBJECT_IDS,
  SAMPLE_PRODUCT,
  SAMPLE_PRODUCTS,
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

const mockGetCollection = jest.fn(() => ({
  find: mockFind.mockReturnValue({
    toArray: mockToArray,
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
  }),
  findOne: mockFindOne,
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

jest.mock("../../src/utils/errorHandler", () => ({
  createSuccessResponse: mockCreateSuccessResponse,
  createErrorResponse: mockCreateErrorResponse,
  validateRequiredFields: jest.fn(),
}));

import { getAllProducts, getProductById } from "../../src/controllers/productController";

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
});
