import multer from "multer";
import { ApiError } from "./errorHandler";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.memoryStorage();

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(
      new ApiError(
        400,
        "Type de fichier non autorisé. Utilisez JPG, PNG, WebP ou PDF.",
        "INVALID_FILE_TYPE"
      )
    );
  } else {
    cb(null, true);
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});
