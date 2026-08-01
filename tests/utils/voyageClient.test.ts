import {
  generateVoyageEmbedding,
  generateVoyageEmbeddingsBatch,
  VoyageAuthError,
  VoyageAPIError,
} from "../../src/utils/voyageClient";

global.fetch = jest.fn();

describe("generateVoyageEmbedding", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it("returns the embedding array on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    });

    const result = await generateVoyageEmbedding("a product description", "fake-key");

    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("throws VoyageAuthError on a 401 response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });

    await expect(generateVoyageEmbedding("text", "bad-key")).rejects.toThrow(VoyageAuthError);
  });

  it("throws VoyageAPIError on other non-ok responses", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server error",
    });

    await expect(generateVoyageEmbedding("text", "fake-key")).rejects.toThrow(VoyageAPIError);
  });
});

describe("generateVoyageEmbeddingsBatch", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it("returns one embedding per input text, in order", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.1] }, { embedding: [0.2, 0.2] }, { embedding: [0.3, 0.3] }],
      }),
    });

    const result = await generateVoyageEmbeddingsBatch(["a", "b", "c"], "fake-key");

    expect(result).toEqual([
      [0.1, 0.1],
      [0.2, 0.2],
      [0.3, 0.3],
    ]);
  });

  it("throws VoyageAPIError when the response length doesn't match the input length", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.1] }] }),
    });

    await expect(generateVoyageEmbeddingsBatch(["a", "b"], "fake-key")).rejects.toThrow(VoyageAPIError);
  });
});
