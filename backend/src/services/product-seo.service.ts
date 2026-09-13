import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export interface ProductSeoData {
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  slug: string;
  ogImage?: string;
  ogDescription?: string;
}

export class ProductSeoService {
  static async getSeo(storeId: string, productId: string) {
    try {
      const product = await db.product.findUnique({
        where: { id: productId },
      });

      if (!product || product.storeId !== storeId) {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      let seo = await db.productSeo.findUnique({
        where: { productId },
      });

      if (!seo) {
        seo = await db.productSeo.create({
          data: {
            productId,
            slug: product.sku.toLowerCase().replace(/\s+/g, "-"),
          },
        });
      }

      return seo;
    } catch (error) {
      throw error;
    }
  }

  static async updateSeo(storeId: string, productId: string, data: Partial<ProductSeoData>) {
    try {
      const product = await db.product.findUnique({
        where: { id: productId },
      });

      if (!product || product.storeId !== storeId) {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      let seo = await db.productSeo.findUnique({
        where: { productId },
      });

      if (!seo) {
        seo = await db.productSeo.create({
          data: {
            productId,
            slug: data.slug || product.sku.toLowerCase().replace(/\s+/g, "-"),
            metaTitle: data.metaTitle,
            metaDescription: data.metaDescription,
            metaKeywords: data.metaKeywords,
            ogImage: data.ogImage,
            ogDescription: data.ogDescription,
          },
        });
      } else {
        seo = await db.productSeo.update({
          where: { productId },
          data: {
            metaTitle: data.metaTitle ?? seo.metaTitle,
            metaDescription: data.metaDescription ?? seo.metaDescription,
            metaKeywords: data.metaKeywords ?? seo.metaKeywords,
            slug: data.slug ?? seo.slug,
            ogImage: data.ogImage ?? seo.ogImage,
            ogDescription: data.ogDescription ?? seo.ogDescription,
          },
        });
      }

      return seo;
    } catch (error) {
      throw error;
    }
  }

  static async getBySlug(storeId: string, slug: string) {
    try {
      const seo = await db.productSeo.findUnique({
        where: { slug },
        include: {
          product: {
            where: { storeId },
          },
        },
      });

      if (!seo || !seo.product) {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      return seo;
    } catch (error) {
      throw error;
    }
  }
}
