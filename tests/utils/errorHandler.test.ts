import {
  createSuccessResponse,
  createErrorResponse,
  validateRequiredFields,
  asyncHandler,
  ValidationError,
} from "../../src/utils/errorHandler";
import { Request, Response, NextFunction } from "express";

describe("createSuccessResponse", () => {
  it("wraps data with success:true and a default message", () => {
    const result = createSuccessResponse({ id: 1 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 1 });
    expect(result.message).toBe("Operation completed successfully");
    expect(typeof result.timestamp).toBe("string");
  });

  it("uses a custom message when provided", () => {
    const result = createSuccessResponse([], "Found 0 items");
    expect(result.message).toBe("Found 0 items");
  });
});

describe("createErrorResponse", () => {
  it("wraps a message, code, and details with success:false", () => {
    const result = createErrorResponse("Bad input", "BAD_INPUT", "field X missing");
    expect(result.success).toBe(false);
    expect(result.error).toEqual({
      message: "Bad input",
      code: "BAD_INPUT",
      details: "field X missing",
    });
  });
});

describe("validateRequiredFields", () => {
  it("does not throw when all required fields are present", () => {
    expect(() =>
      validateRequiredFields({ name: "Widget", price: 10 }, ["name", "price"])
    ).not.toThrow();
  });

  it("throws ValidationError listing missing fields", () => {
    expect(() => validateRequiredFields({ name: "Widget" }, ["name", "price"])).toThrow(
      ValidationError
    );
    expect(() => validateRequiredFields({ name: "Widget" }, ["name", "price"])).toThrow(
      "Missing required fields: price"
    );
  });
});

describe("asyncHandler", () => {
  it("forwards async errors to next()", async () => {
    const req = {} as Request;
    const res = {} as Response;
    const next = jest.fn() as NextFunction;
    const failingHandler = asyncHandler(async () => {
      throw new Error("boom");
    });

    await failingHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
