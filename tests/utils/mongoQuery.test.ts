import { ObjectId } from "mongodb";
import {
  escapeRegexLiteral,
  InvalidMongoQueryError,
  sanitizeBatchFilter,
  sanitizeUpdateFields,
  convertFilterObjectIds,
} from "../../src/utils/mongoQuery";

describe("escapeRegexLiteral", () => {
  it("escapes regex special characters", () => {
    expect(escapeRegexLiteral("a.b*c")).toBe("a\\.b\\*c");
  });
});

describe("sanitizeBatchFilter", () => {
  it("allows known fields and operators", () => {
    const result = sanitizeBatchFilter({ price: { $gte: 10 }, brand: "Nova" });
    expect(result).toEqual({ price: { $gte: 10 }, brand: "Nova" });
  });

  it("rejects unknown fields", () => {
    expect(() => sanitizeBatchFilter({ notAField: "x" })).toThrow(InvalidMongoQueryError);
  });

  it("rejects disallowed operators", () => {
    expect(() => sanitizeBatchFilter({ price: { $where: "1==1" } })).toThrow(InvalidMongoQueryError);
  });

  it("rejects top-level operator keys", () => {
    expect(() => sanitizeBatchFilter({ $or: [{ price: 1 }] })).toThrow(InvalidMongoQueryError);
  });
});

describe("sanitizeUpdateFields", () => {
  it("allows known product fields", () => {
    const result = sanitizeUpdateFields({ name: "New Name", price: 15 });
    expect(result).toEqual({ name: "New Name", price: 15 });
  });

  it("rejects unknown fields", () => {
    expect(() => sanitizeUpdateFields({ notAField: true })).toThrow(InvalidMongoQueryError);
  });

  it("rejects operator keys", () => {
    expect(() => sanitizeUpdateFields({ $set: { price: 1 } })).toThrow(InvalidMongoQueryError);
  });
});

describe("convertFilterObjectIds", () => {
  it("converts a valid $in array of id strings to ObjectIds", () => {
    const id = new ObjectId().toString();
    const result = convertFilterObjectIds({ _id: { $in: [id] } });
    expect(result._id.$in[0]).toBeInstanceOf(ObjectId);
  });

  it("throws for an invalid id string in $in", () => {
    expect(() => convertFilterObjectIds({ _id: { $in: ["not-an-id"] } })).toThrow(InvalidMongoQueryError);
  });

  it("passes through filters with no _id.$in", () => {
    const result = convertFilterObjectIds({ price: { $gte: 10 } });
    expect(result).toEqual({ price: { $gte: 10 } });
  });
});
