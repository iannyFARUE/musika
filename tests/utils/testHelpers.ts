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
