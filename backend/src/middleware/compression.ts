import { Response, NextFunction, Request } from "express";

export const cacheHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Set cache headers based on endpoint
  if (req.method === "GET") {
    const path = req.path;
    
    if (path.includes("/static/") || path.includes("/images/")) {
      // Static assets - cache for 1 year
      res.set("Cache-Control", "public, max-age=31536000, immutable");
    } else if (path.includes("/api/")) {
      // API responses - no cache
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
    }
  }
  
  next();
};

export const compressionHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.set("Content-Encoding", "gzip");
  next();
};

export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("X-XSS-Protection", "1; mode=block");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
};
