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

export default router;
