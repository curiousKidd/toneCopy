import { Router } from 'express';
import { trainingController } from '../controllers/trainingController';
import { upload, validateFileContent } from '../middleware/fileValidator';

const router = Router();

router.post(
  '/analyze',
  upload.fields([
    { name: 'original_images', maxCount: 10 },
    { name: 'adjusted_images', maxCount: 10 }
  ]),
  validateFileContent,
  trainingController.analyze.bind(trainingController)
);

export default router;
