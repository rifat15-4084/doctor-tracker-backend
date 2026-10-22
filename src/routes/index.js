/**
 * API router - mounts every feature router under a single entry point.
 * The app mounts this router at `/api`.
 */
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import doctorRoutes from './doctor.routes.js';
import patientRoutes from './patient.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import metaRoutes from './meta.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/doctors', doctorRoutes);
router.use('/patients', patientRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/meta', metaRoutes);

export default router;
