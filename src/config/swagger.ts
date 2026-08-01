import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Musika API",
      version: "1.0.0",
      description:
        "Express.js backend demonstrating MongoDB operations against a product catalog. " +
        "Provides CRUD, text/Atlas/vector search, filtering, pagination, and aggregation reporting.",
      contact: { name: "API Support" },
      license: { name: "MIT" },
    },
    servers: [{ url: "http://localhost:3001", description: "Development server" }],
    tags: [
      { name: "Products", description: "Product CRUD operations and queries" },
      { name: "Info", description: "API information" },
    ],
    components: {
      schemas: {
        Product: {
          type: "object",
          required: ["name", "price"],
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            name: { type: "string", example: "Nova Wireless Speaker" },
            price: { type: "number", example: 49.99 },
            shortDescription: { type: "string" },
            description: { type: "string" },
            categories: { type: "array", items: { type: "string" }, example: ["Electronics"] },
            brand: { type: "string", example: "Nova" },
            tags: { type: "array", items: { type: "string" } },
            seller: { type: "string" },
            weightGrams: { type: "integer" },
            condition: { type: "string", enum: ["new", "used", "refurbished"] },
            imageUrl: { type: "string" },
            countryOfOrigin: { type: "string" },
            sku: { type: "string" },
            rating: {
              type: "object",
              properties: {
                average: { type: "number" },
                count: { type: "integer" },
              },
            },
          },
        },
        CreateProductRequest: {
          type: "object",
          required: ["name", "price"],
          properties: {
            name: { type: "string" },
            price: { type: "number" },
            categories: { type: "array", items: { type: "string" } },
            brand: { type: "string" },
          },
        },
        UpdateProductRequest: {
          type: "object",
          description: "All fields are optional for partial updates",
          properties: {
            name: { type: "string" },
            price: { type: "number" },
            categories: { type: "array", items: { type: "string" } },
          },
        },
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string" },
            data: { type: "object" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                message: { type: "string" },
                code: { type: "string" },
                details: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts", "./src/app.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
