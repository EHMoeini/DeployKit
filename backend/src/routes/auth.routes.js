import { Router } from 'express';
import {
    register,
    login,
    refresh,
    logout,
    logoutAll,
    getMe,
} from '../controllers/auth.controller.js';
import { requireAuth, verifyCsrf } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/register', register);
router.post('/signup', register);
router.post('/login', login);
router.post('/refresh', verifyCsrf, refresh);
router.post('/logout', verifyCsrf, logout);
router.post('/logout-all', requireAuth, verifyCsrf, logoutAll);
router.get('/me', requireAuth, getMe);
router.get('/session', requireAuth, getMe);

export default router;
