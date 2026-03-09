import { Router } from 'express';
import { usersController } from '../controllers/users.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/profile', usersController.getProfile);
router.patch('/profile', usersController.updateProfile);
router.get('/search', usersController.search);
router.get('/stats', usersController.stats);
router.delete('/deactivate', usersController.deactivate);

export default router;
