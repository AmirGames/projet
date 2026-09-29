import { promises as fs } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { getEnv } from "../../config/env";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/errorHandler";
import { detecterType, extensionDuType } from "../../utils/file-type";

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

/**
 * L'extension vient du contenu du fichier, jamais du nom ni du type annoncés
 * par le client : ils se forgent.
 */
function extractExtension(buffer: Buffer): string {
  const type = detecterType(buffer);
  if (!type) {
    throw new ApiError(400, "Type de fichier non autorisé. Utilisez JPG, PNG, WebP ou PDF.", "INVALID_FILE_TYPE");
  }
  return extensionDuType(type);
}

export class FileUploadService {
  static async uploadDocument(
    buffer: Buffer,
    filename: string,
    folder: "drivers" | "merchants" | "deliveries",
    mimeType?: string
  ): Promise<{ url: string; publicId: string }> {
    if (isCloudinaryConfigured()) {
      return this.uploadToCloudinary(buffer, filename, folder);
    } else {
      return this.uploadLocal(buffer, filename, folder, mimeType);
    }
  }

  /**
   * Une image faite pour être vue de tous : le logo d'une boutique.
   *
   * Les pièces justificatives sont servies sous jeton sur Cloudinary ; un logo
   * s'affiche dans la liste des restaurants, à n'importe quel visiteur.
   */
  static async uploadPublicImage(
    buffer: Buffer,
    filename: string,
    mimeType?: string
  ): Promise<{ url: string; publicId: string }> {
    if (isCloudinaryConfigured()) {
      return this.uploadToCloudinary(buffer, filename, "stores", true);
    }
    return this.uploadLocal(buffer, filename, "stores", mimeType);
  }

  private static async uploadToCloudinary(
    buffer: Buffer,
    filename: string,
    folder: "drivers" | "merchants" | "deliveries" | "stores",
    publique = false
  ): Promise<{ url: string; publicId: string }> {
    const cloud = await getCloudinary();

    return new Promise((resolve, reject) => {
      const stream = cloud.uploader.upload_stream(
        {
          folder: publique ? `public/${folder}` : `documents/${folder}`,
          resource_type: publique ? "image" : "auto",
          // Un nom tiré au hasard : deux boutiques envoyant « logo.png » ne
          // s'écrasent pas l'une l'autre.
          public_id: publique
            ? `${Date.now()}-${randomBytes(8).toString("hex")}`
            : filename.replace(/\.[^.]+$/, ""),
          overwrite: true,
          ...(publique ? {} : { access_mode: "token" }),
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
    folder: "drivers" | "merchants" | "deliveries" | "stores",
    mimeType?: string
  ): Promise<{ url: string; publicId: string }> {
    await ensureUploadsDir();

    const ext = extractExtension(buffer);

    logger.info("uploadLocal - Processing file:", { filename, mimeType, extractedExt: ext });

    // Nom tiré au hasard (128 bits), sans horodatage : l'heure du dépôt ne
    // doit rien laisser deviner, même si le contrôle d'accès de /api/files
    // reste la vraie protection.
    const safeFilename = `${randomBytes(16).toString("hex")}.${ext}`;
    const relativePath = join(folder, safeFilename);
    const fullPath = join(UPLOADS_DIR, relativePath);

    try {
      await fs.mkdir(join(UPLOADS_DIR, folder), { recursive: true });
      await fs.writeFile(fullPath, buffer);

      const url = `${API_URL}/uploads/${relativePath}`;
      logger.info("Local file uploaded", { path: relativePath, size: buffer.length, ext });

      return {
        url,
        publicId: safeFilename,
      };
    } catch (error) {
      logger.error("Failed to upload file locally", { error, filename, ext });
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
