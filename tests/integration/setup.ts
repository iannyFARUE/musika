import { connectToDatabase, closeDatabaseConnection } from "../../src/config/database";
import dotenv from "dotenv";

dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX = "10000";

jest.setTimeout(120000);

export function isIntegrationTestEnabled(): boolean {
  return !!process.env.MONGODB_URI;
}

let hasShownSkipMessage = false;

export const describeIntegration: jest.Describe = isIntegrationTestEnabled()
  ? describe
  : ((...args: Parameters<jest.Describe>) => {
      if (!hasShownSkipMessage) {
        console.log(`
Integration tests skipped: MONGODB_URI environment variable is not set
`);
        hasShownSkipMessage = true;
      }
      return describe.skip(...args);
    }) as jest.Describe;

beforeAll(async () => {
  if (!isIntegrationTestEnabled()) return;
  await connectToDatabase();
});

afterAll(async () => {
  if (!isIntegrationTestEnabled()) return;
  await closeDatabaseConnection();
});
