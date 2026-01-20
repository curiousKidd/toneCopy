import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 20  // 최대 10쌍 (원본 10개 + 수정본 10개)
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPG and PNG allowed.'));
    }
    cb(null, true);
  }
});

export const validateFileContent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  if (!files) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'NO_FILES',
        message: 'No files uploaded'
      }
    });
  }

  // Basic validation - in production, add magic number validation
  for (const fieldname in files) {
    for (const file of files[fieldname]) {
      if (file.size > MAX_FILE_SIZE) {
        return res.status(413).json({
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`
          }
        });
      }
    }
  }

  next();
};
