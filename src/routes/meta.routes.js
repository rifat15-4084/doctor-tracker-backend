/**
 * Meta routes - option lists for the filter dropdowns.
 */
import { Router } from 'express';
import { getFilterOptions } from '../controllers/meta.controller.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// The option lists are derived from real records, so they are protected too.
router.use(protect);

/** GET /api/meta/filters - specialisations, hospitals, conditions, doctors. */
router.get('/filters', getFilterOptions);

export default router;
