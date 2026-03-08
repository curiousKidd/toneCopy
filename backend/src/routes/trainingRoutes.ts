import { Router } from 'express';
import { trainingController } from '../controllers/trainingController';
import { upload, validateFileContent } from '../middleware/fileValidator';

const router = Router();

// 트레이닝 이미지 분석 (학습)
router.post(
  '/analyze',
  upload.fields([
    { name: 'original_images', maxCount: 10 },
    { name: 'adjusted_images', maxCount: 10 }
  ]),
  validateFileContent,
  trainingController.analyze.bind(trainingController)
);

// 프로필 정확도 측정
router.post(
  '/accuracy',
  upload.fields([
    { name: 'original_image', maxCount: 1 },
    { name: 'adjusted_image', maxCount: 1 }
  ]),
  validateFileContent,
  trainingController.measureAccuracy.bind(trainingController)
);

export default router;
