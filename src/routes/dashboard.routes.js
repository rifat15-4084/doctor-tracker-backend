/**
 * Dashboard routes.
 */
import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboard.controller.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Dashboard data is only available to authenticated users.
router.use(protect);

/** GET /api/dashboard/stats - every metric in a single response. */
router.get('/stats', getDashboardStats);

export default router;
