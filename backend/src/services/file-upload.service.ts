import { v2 as cloudinary } from "cloudinary";
import { getEnv } from "../config/env";
import { logger } from "../config/logger";

const env = getEnv();

if (
  env.CLOUDINARY_CLOUD_NAME &&
  env.CLOUDINARY_API_KEY &&
  env.CLOUDINARY_API_SECRET
) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

export class FileUploadService {
  static isConfigured(): boolean {
    return !!(
      env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET
    );
  }

  static async uploadDocument(
    buffer: Buffer,
    filename: string,
    folder: "drivers" | "merchants"
  ): Promise<{ url: string; publicId: string }> {
    if (!this.isConfigured()) {
      throw new Error("Cloudinary is not configured");
    }

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `documents/${folder}`,
          resource_type: "auto",
          public_id: filename.replace(/\.[^.]+$/, ""),
          overwrite: true,
          access_mode: "token",
        },
        (error, result) => {
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

  static async deleteDocument(publicId: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      logger.warn("Failed to delete document from Cloudinary", {
        publicId,
        error,
      });
    }
  }
}
