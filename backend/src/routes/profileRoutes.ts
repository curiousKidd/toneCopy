import { Router } from 'express';
import { profileController } from '../controllers/profileController';

const router = Router();

router.get('/', profileController.list.bind(profileController));
router.get('/:id', profileController.get.bind(profileController));
router.delete('/:id', profileController.delete.bind(profileController));
router.patch('/:id', profileController.update.bind(profileController));

export default router;
