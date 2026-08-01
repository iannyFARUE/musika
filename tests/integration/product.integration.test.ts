import request from "supertest";
import { app } from "../../src/app";
import { describeIntegration } from "./setup";

describeIntegration("Product API (integration)", () => {
  let createdProductId: string;

  it("GET /api/products returns a list of products", async () => {
    const response = await request(app).get("/api/products");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("POST /api/products creates a product", async () => {
    const response = await request(app)
      .post("/api/products")
      .send({ name: "Integration Test Widget", price: 12.34, categories: ["Electronics"] });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe("Integration Test Widget");
    createdProductId = response.body.data._id;
  });

  it("GET /api/products/:id retrieves the created product", async () => {
    const response = await request(app).get(`/api/products/${createdProductId}`);

    expect(response.status).toBe(200);
    expect(response.body.data._id).toBe(createdProductId);
  });

  it("PATCH /api/products/:id updates the product", async () => {
    const response = await request(app).patch(`/api/products/${createdProductId}`).send({ price: 15.99 });

    expect(response.status).toBe(200);
    expect(response.body.data.price).toBe(15.99);
  });

  it("DELETE /api/products/:id deletes the product", async () => {
    const response = await request(app).delete(`/api/products/${createdProductId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.deletedCount).toBe(1);
  });

  it("GET /api/products/:id returns 404 after deletion", async () => {
    const response = await request(app).get(`/api/products/${createdProductId}`);

    expect(response.status).toBe(404);
  });

  it("GET /api/products/aggregations/reportingByCategory returns category stats", async () => {
    const response = await request(app).get("/api/products/aggregations/reportingByCategory");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});
