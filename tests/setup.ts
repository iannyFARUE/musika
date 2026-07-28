process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX = "10000";
process.env.MONGODB_URI = "mongodb://localhost:27017/test_musika";
process.env.PORT = "3002";

jest.setTimeout(30000);

global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
