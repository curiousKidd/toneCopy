import { Router } from 'express';
import { profileController } from '../controllers/profileController';
import { upload, validateFileContent } from '../middleware/fileValidator';

const router = Router();

router.get('/', profileController.list.bind(profileController));
router.get('/:id', profileController.get.bind(profileController));
router.delete('/:id', profileController.delete.bind(profileController));
router.patch('/:id', profileController.update.bind(profileController));

// 기존 프로필에 새 이미지 쌍 추가 학습
router.post(
  '/:id/retrain',
  upload.fields([
    { name: 'original_images', maxCount: 10 },
    { name: 'adjusted_images', maxCount: 10 }
  ]),
  validateFileContent,
  profileController.retrain.bind(profileController)
);

export default router;
