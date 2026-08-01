export class VoyageAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoyageAuthError";
  }
}

export class VoyageAPIError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "VoyageAPIError";
    this.statusCode = statusCode;
  }
}

interface VoyageAIResponse {
  data: Array<{ embedding: number[] }>;
}

async function callVoyageEmbeddingsAPI(
  texts: string[],
  apiKey: string,
  inputType: "query" | "document"
): Promise<number[][]> {
  const requestBody = {
    input: texts,
    model: "voyage-3-large",
    output_dimension: 2048,
    input_type: inputType,
  };

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new VoyageAuthError("Invalid Voyage AI API key. Please check your VOYAGE_API_KEY in the .env file");
    }
    throw new VoyageAPIError(`Voyage AI API returned status ${response.status}: ${errorText}`, response.status);
  }

  const data = (await response.json()) as VoyageAIResponse;
  if (!data.data || data.data.length !== texts.length) {
    throw new VoyageAPIError("Invalid response format from Voyage AI API", 500);
  }
  return data.data.map((entry) => entry.embedding);
}

/**
 * Generates a single embedding. Used at query time (one search phrase per request).
 */
export async function generateVoyageEmbedding(
  text: string,
  apiKey: string,
  inputType: "query" | "document" = "query"
): Promise<number[]> {
  const [embedding] = await callVoyageEmbeddingsAPI([text], apiKey, inputType);
  return embedding;
}

/**
 * Generates embeddings for multiple texts in a single API call.
 * Used for bulk backfill (scripts/generateEmbeddings.ts) to stay within
 * Voyage's free-tier requests-per-minute limit.
 */
export async function generateVoyageEmbeddingsBatch(
  texts: string[],
  apiKey: string,
  inputType: "query" | "document" = "document"
): Promise<number[][]> {
  return callVoyageEmbeddingsAPI(texts, apiKey, inputType);
}
