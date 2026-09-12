import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ProductService } from "../services/product.service.js";
import { ApiError } from "../middleware/errorHandler.js";
import { logger } from "../config/logger.js";

const router = Router();

const createProductSchema = z.object({
  storeId: z.string().uuid(),
  sku: z.string().min(1, "SKU requis"),
  name: z.string().min(2, "Nom minimum 2 caractères"),
  description: z.string().optional(),
  price: z.number().positive("Prix doit être positif"),
  categoryId: z.string().uuid().optional(),
  stock: z.number().int().min(0, "Stock minimum 0").optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});

const updateProductSchema = z.object({
  sku: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  categoryId: z.string().uuid().optional(),
  stock: z.number().int().min(0).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});

// POST /products - Create product
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createProductSchema.parse(req.body);

    logger.info("Creating product", { name: body.name, sku: body.sku, storeId: body.storeId });

    const product = await ProductService.create(body);

    res.status(201).json({
      message: "Produit créé",
      product,
    });
  } catch (err) {
    next(err);
  }
});

// GET /products/:id - Get product by ID
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const product = await ProductService.getById(id);

    if (!product) {
      throw new ApiError(404, "Produit non trouvé", "NOT_FOUND");
    }

    res.json(product);
  } catch (err) {
    next(err);
  }
});

// GET /products/store/:storeId - Get products by store
router.get("/store/:storeId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const products = await ProductService.getByStoreId(storeId, limit, offset);
    const total = await ProductService.countByStoreId(storeId);

    res.json({
      products,
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /products/category/:categoryId - Get products by category
router.get("/category/:categoryId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { categoryId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const products = await ProductService.getByCategoryId(categoryId, limit, offset);

    res.json({
      products,
      pagination: {
        limit,
        offset,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /products/search/:storeId - Search products
router.get("/search/:storeId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.params;
    const { q } = req.query;

    if (!q || typeof q !== "string") {
      throw new ApiError(400, "Paramètre 'q' requis", "INVALID_INPUT");
    }

    const products = await ProductService.search(storeId, q, 50);

    res.json({
      query: q,
      results: products,
      count: products.length,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /products/:id - Update product
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const body = updateProductSchema.parse(req.body);

    logger.info("Updating product", { id });

    const product = await ProductService.update(id, body);

    if (!product) {
      throw new ApiError(404, "Produit non trouvé", "NOT_FOUND");
    }

    res.json({
      message: "Produit mis à jour",
      product,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /products/:id/stock - Update product stock
router.patch("/:id/stock", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (typeof quantity !== "number") {
      throw new ApiError(400, "Quantité requise", "INVALID_INPUT");
    }

    logger.info("Updating product stock", { id, quantity });

    const product = await ProductService.updateStock(id, quantity);

    if (!product) {
      throw new ApiError(404, "Produit non trouvé", "NOT_FOUND");
    }

    res.json({
      message: "Stock mis à jour",
      product,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /products/:id - Delete product
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const product = await ProductService.getById(id);

    if (!product) {
      throw new ApiError(404, "Produit non trouvé", "NOT_FOUND");
    }

    logger.info("Deleting product", { id });

    await ProductService.delete(id);

    res.json({
      message: "Produit supprimé",
    });
  } catch (err) {
    next(err);
  }
});

export default router;