import { promises as fs } from "fs";
import { join } from "path";
import { getEnv } from "../config/env";
import { logger } from "../config/logger";

const env = getEnv();
const UPLOADS_DIR = join(process.cwd(), "uploads");
const API_URL = env.API_URL || "http://localhost:3001";

let cloudinary: any = null;

// Lazy-load cloudinary seulement si configuré
async function getCloudinary() {
  if (!cloudinary && isCloudinaryConfigured()) {
    const { v2 } = await import("cloudinary");
    cloudinary = v2;
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
  }
  return cloudinary;
}

function isCloudinaryConfigured(): boolean {
  return !!(
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET
  );
}

async function ensureUploadsDir() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (error) {
    logger.error("Failed to create uploads directory", { error });
  }
}

export class FileUploadService {
  static async uploadDocument(
    buffer: Buffer,
    filename: string,
    folder: "drivers" | "merchants"
  ): Promise<{ url: string; publicId: string }> {
    if (isCloudinaryConfigured()) {
      return this.uploadToCloudinary(buffer, filename, folder);
    } else {
      return this.uploadLocal(buffer, filename, folder);
    }
  }

  private static async uploadToCloudinary(
    buffer: Buffer,
    filename: string,
    folder: "drivers" | "merchants"
  ): Promise<{ url: string; publicId: string }> {
    const cloud = await getCloudinary();

    return new Promise((resolve, reject) => {
      const stream = cloud.uploader.upload_stream(
        {
          folder: `documents/${folder}`,
          resource_type: "auto",
          public_id: filename.replace(/\.[^.]+$/, ""),
          overwrite: true,
          access_mode: "token",
        },
        (error: any, result: any) => {
          if (error) {
            logger.error("Cloudinary upload failed", { error });
            reject(error);
          } else if (result) {
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
            });
          } else {
            reject(new Error("No result from Cloudinary"));
          }
        }
      );

      stream.end(buffer);
    });
  }

  private static async uploadLocal(
    buffer: Buffer,
    filename: string,
    folder: "drivers" | "merchants"
  ): Promise<{ url: string; publicId: string }> {
    await ensureUploadsDir();

    const ext = filename.split(".").pop() || "bin";
    const safeFilename = `${folder}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const relativePath = join(folder, safeFilename);
    const fullPath = join(UPLOADS_DIR, relativePath);

    try {
      await fs.mkdir(join(UPLOADS_DIR, folder), { recursive: true });
      await fs.writeFile(fullPath, buffer);

      const url = `${API_URL}/uploads/${relativePath}`;
      logger.info("Local file uploaded", { path: relativePath });

      return {
        url,
        publicId: safeFilename,
      };
    } catch (error) {
      logger.error("Failed to upload file locally", { error });
      throw error;
    }
  }

  static async deleteDocument(publicId: string): Promise<void> {
    if (isCloudinaryConfigured()) {
      try {
        const cloud = await getCloudinary();
        await cloud.uploader.destroy(publicId);
      } catch (error) {
        logger.warn("Failed to delete document from Cloudinary", {
          publicId,
          error,
        });
      }
    } else {
      try {
        const fullPath = join(UPLOADS_DIR, publicId);
        await fs.unlink(fullPath);
        logger.info("Local file deleted", { publicId });
      } catch (error) {
        logger.warn("Failed to delete local file", { publicId, error });
      }
    }
  }
}
