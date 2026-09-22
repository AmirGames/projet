import path from 'path';
import fs from 'fs';
import { logger } from '../config/logger';
import { ApiError } from '../middleware/errorHandler';

/**
 * Service de gestion des uploads de fichiers.
 * Stocke localement dans ./uploads, avec extraction correcte de l'extension.
 */
export class FileUploadService {
  private static readonly UPLOAD_DIR = path.join(process.cwd(), 'uploads');
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ];

  private static readonly MIME_TO_EXT: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };

  static {
    // Créer le répertoire uploads s'il n'existe pas
    if (!fs.existsSync(FileUploadService.UPLOAD_DIR)) {
      fs.mkdirSync(FileUploadService.UPLOAD_DIR, { recursive: true });
    }
  }

  /**
   * Upload un fichier et retourne l'URL d'accès.
   * @param file - Fichier upload via multer
   * @param context - Contexte de l'upload (ex: "driver-identity")
   * @returns URL d'accès au fichier
   */
  static uploadFile(
    file: Express.Multer.File,
    context: string
  ): string {
    if (!file) {
      throw new ApiError(400, 'Aucun fichier fourni', 'NO_FILE');
    }

    // Vérifier le type MIME
    if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new ApiError(
        400,
        `Type de fichier non autorisé: ${file.mimetype}. Acceptés: ${this.ALLOWED_MIME_TYPES.join(', ')}`,
        'INVALID_FILE_TYPE'
      );
    }

    // Vérifier la taille
    if (file.size > this.MAX_FILE_SIZE) {
      throw new ApiError(
        400,
        `Fichier trop volumineux. Maximum: ${this.MAX_FILE_SIZE / 1024 / 1024}MB`,
        'FILE_TOO_LARGE'
      );
    }

    // Extraire l'extension correcte du MIME type
    const extension = this.MIME_TO_EXT[file.mimetype] || '';
    if (!extension) {
      throw new ApiError(
        400,
        'Impossible de déterminer le type de fichier',
        'UNKNOWN_FILE_TYPE'
      );
    }

    // Générer un nom de fichier unique
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 9);
    const filename = `${context}-${randomStr}-${timestamp}${extension}`;

    const filepath = path.join(this.UPLOAD_DIR, filename);

    try {
      // Sauvegarder le fichier
      fs.writeFileSync(filepath, file.buffer);

      logger.info('File uploaded', {
        filename,
        context,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        extension,
      });

      // Retourner l'URL relative (le frontend ou proxy servira les fichiers)
      return `/uploads/${filename}`;
    } catch (error) {
      throw new ApiError(500, 'Erreur lors de la sauvegarde du fichier', 'UPLOAD_FAILED');
    }
  }

  /**
   * Supprime un fichier.
   */
  static deleteFile(fileUrl: string): void {
    try {
      const filename = path.basename(fileUrl);
      const filepath = path.join(this.UPLOAD_DIR, filename);

      // Vérifier que le chemin est bien dans le répertoire uploads
      const resolvedPath = path.resolve(filepath);
      const resolvedDir = path.resolve(this.UPLOAD_DIR);

      if (!resolvedPath.startsWith(resolvedDir)) {
        throw new ApiError(403, 'Accès refusé', 'INVALID_PATH');
      }

      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        logger.info('File deleted', { filename });
      }
    } catch (error) {
      logger.warn('Failed to delete file', {
        fileUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Vérifie que le fichier existe et est accessible.
   */
  static fileExists(fileUrl: string): boolean {
    try {
      const filename = path.basename(fileUrl);
      const filepath = path.join(this.UPLOAD_DIR, filename);

      const resolvedPath = path.resolve(filepath);
      const resolvedDir = path.resolve(this.UPLOAD_DIR);

      if (!resolvedPath.startsWith(resolvedDir)) {
        return false;
      }

      return fs.existsSync(filepath);
    } catch {
      return false;
    }
  }
}
