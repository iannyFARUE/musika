import { ObjectId } from "mongodb";
import { Request, Response } from "express";

export const TEST_OBJECT_IDS = {
  VALID: "507f1f77bcf86cd799439011",
  VALID_2: "507f1f77bcf86cd799439012",
  INVALID: "invalid-id",
};

export const SAMPLE_PRODUCT = {
  _id: TEST_OBJECT_IDS.VALID,
  name: "Test Widget",
  price: 19.99,
  categories: ["Electronics"],
};

export const SAMPLE_PRODUCTS = [
  { _id: TEST_OBJECT_IDS.VALID, name: "Test Widget 1", price: 19.99, categories: ["Electronics"] },
  { _id: TEST_OBJECT_IDS.VALID_2, name: "Test Widget 2", price: 29.99, categories: ["Home & Kitchen"] },
];

export function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return { query: {}, params: {}, body: {}, ...overrides };
}

export function createMockResponse(): {
  mockJson: jest.Mock;
  mockStatus: jest.Mock;
  mockResponse: Partial<Response>;
} {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnThis();
  const mockResponse = { json: mockJson, status: mockStatus, setHeader: jest.fn() };
  return { mockJson, mockStatus, mockResponse };
}

export function expectSuccessResponse(mockCreateSuccessResponse: jest.Mock, data: any, message: string) {
  expect(mockCreateSuccessResponse).toHaveBeenCalledWith(data, message);
}

export const SAMPLE_REQUESTS = {
  CREATE_PRODUCT: { name: "New Widget", price: 24.99, categories: ["Electronics"] },
  BATCH_CREATE: [
    { name: "Batch Widget 1", price: 9.99 },
    { name: "Batch Widget 2", price: 14.99 },
  ],
};

export const SAMPLE_RESPONSES = {
  INSERT_ONE: { acknowledged: true, insertedId: "507f1f77bcf86cd799439099" },
  INSERT_MANY: { acknowledged: true, insertedCount: 2, insertedIds: { 0: "id1", 1: "id2" } },
  UPDATE_ONE: { matchedCount: 1, modifiedCount: 1 },
  UPDATE_MANY: { matchedCount: 5, modifiedCount: 3 },
};

export const SAMPLE_REVIEWS_AGGREGATION = [
  {
    _id: new ObjectId(),
    name: "Test Widget",
    categories: ["Electronics"],
    ratingAverage: 4.5,
    recentReviews: [
      {
        _id: new ObjectId(),
        reviewerName: "Jane Doe",
        reviewerEmail: "jane@example.com",
        text: "Great product!",
        date: new Date("2024-01-01"),
      },
    ],
    totalReviews: 5,
  },
];

export const SAMPLE_CATEGORY_AGGREGATION = [
  { category: "Electronics", productCount: 12, averagePrice: 45.5, highestPrice: 199.99, lowestPrice: 9.99, totalReviews: 340 },
  { category: "Books", productCount: 8, averagePrice: 15.2, highestPrice: 29.99, lowestPrice: 4.99, totalReviews: 120 },
];

export const SAMPLE_BRAND_AGGREGATION = [
  { brand: "Nova", productCount: 18, averageRating: 4.2 },
  { brand: "Zenith", productCount: 14, averageRating: 3.9 },
];

export const SAMPLE_SEARCH_RESULTS = [
  { _id: new ObjectId(), name: "Nova Wireless Speaker", brand: "Nova", tags: ["bestseller"], price: 49.99 },
];

export function expectErrorResponse(
  mockStatus: jest.Mock,
  mockJson: jest.Mock,
  statusCode: number,
  errorMessage: string,
  errorCode: string
) {
  expect(mockStatus).toHaveBeenCalledWith(statusCode);
  expect(mockJson).toHaveBeenCalledWith({
    success: false,
    message: errorMessage,
    error: { message: errorMessage, code: errorCode, details: undefined },
    timestamp: "2024-01-01T00:00:00.000Z",
  });
}
