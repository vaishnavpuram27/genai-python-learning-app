import { Router } from "express";
import authRoutes from "./authRoutes.js";
import lessonRoutes from "./lessonRoutes.js";
import healthRoutes from "./healthRoutes.js";
import progressRoutes from "./progressRoutes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/lessons", lessonRoutes);
router.use("/health", healthRoutes);
router.use("/progress", progressRoutes);

export default router;
