import { Router } from 'express';
import { correctionController } from '../controllers/correctionController';
import { upload, validateFileContent } from '../middleware/fileValidator';

const router = Router();

router.post(
  '/apply',
  upload.fields([
    { name: 'image', maxCount: 1 }
  ]),
  validateFileContent,
  correctionController.apply.bind(correctionController)
);

export default router;
