import express from "express";
import { asyncHandler } from "../utils/errorHandler";
import * as productController from "../controllers/productController";
import { productsRateLimiter } from "../middleware/rateLimiter";

const router = express.Router();

router.use(productsRateLimiter);

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     description: Retrieves products with pagination and sorting.
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of products
 */
router.get("/", asyncHandler(productController.getAllProducts));

/**
 * @swagger
 * /api/products/categories:
 *   get:
 *     summary: Get all distinct product categories
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of distinct categories
 */
router.get("/categories", asyncHandler(productController.getDistinctCategories));

/**
 * @swagger
 * /api/products/aggregations/reportingByReviews:
 *   get:
 *     summary: Get products with their most recent reviews
 *     description: Joins the reviews collection via $lookup and returns each product's N most recent reviews.
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Products with recent reviews
 */
router.get("/aggregations/reportingByReviews", asyncHandler(productController.getProductsWithMostRecentReviews));

/**
 * @swagger
 * /api/products/aggregations/reportingByCategory:
 *   get:
 *     summary: Get product statistics grouped by category
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Category statistics
 */
router.get("/aggregations/reportingByCategory", asyncHandler(productController.getProductsByCategoryWithStats));

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get a product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product found
 *       404:
 *         description: Product not found
 */
router.get("/:id", asyncHandler(productController.getProductById));

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     responses:
 *       201:
 *         description: Product created
 */
router.post("/", asyncHandler(productController.createProduct));

/**
 * @swagger
 * /api/products/batch:
 *   post:
 *     summary: Create multiple products
 *     tags: [Products]
 *     responses:
 *       201:
 *         description: Products created
 */
router.post("/batch", asyncHandler(productController.createProductsBatch));

/**
 * @swagger
 * /api/products/{id}:
 *   patch:
 *     summary: Update a product
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Product updated
 *       404:
 *         description: Product not found
 */
router.patch("/:id", asyncHandler(productController.updateProduct));

/**
 * @swagger
 * /api/products:
 *   patch:
 *     summary: Update multiple products matching a filter
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Products updated
 */
router.patch("/", asyncHandler(productController.updateProductsBatch));

/**
 * @swagger
 * /api/products/{id}/find-and-delete:
 *   delete:
 *     summary: Find and delete a product atomically
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Product found and deleted
 *       404:
 *         description: Product not found
 */
router.delete("/:id/find-and-delete", asyncHandler(productController.findAndDeleteProduct));

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Product deleted
 *       404:
 *         description: Product not found
 */
router.delete("/:id", asyncHandler(productController.deleteProduct));

/**
 * @swagger
 * /api/products:
 *   delete:
 *     summary: Delete multiple products matching a filter
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Products deleted
 */
router.delete("/", asyncHandler(productController.deleteProductsBatch));

export default router;
