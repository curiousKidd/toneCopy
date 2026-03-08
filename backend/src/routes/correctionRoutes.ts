import { Router } from 'express';
import { correctionController } from '../controllers/correctionController';
import { upload, validateFileContent } from '../middleware/fileValidator';

const router = Router();

// 단일 이미지 보정
router.post(
  '/apply',
  upload.fields([
    { name: 'image', maxCount: 1 }
  ]),
  validateFileContent,
  correctionController.apply.bind(correctionController)
);

// 배치 이미지 보정 (최대 20장)
router.post(
  '/batch',
  upload.fields([
    { name: 'images', maxCount: 20 }
  ]),
  validateFileContent,
  correctionController.applyBatch.bind(correctionController)
);

export default router;
