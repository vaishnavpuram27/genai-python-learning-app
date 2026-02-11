import { Router } from "express";
import authRoutes from "./authRoutes.js";
import classRoutes from "./classRoutes.js";
import lessonRoutes from "./lessonRoutes.js";
import healthRoutes from "./healthRoutes.js";
import progressRoutes from "./progressRoutes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/classes", classRoutes);
router.use("/lessons", lessonRoutes);
router.use("/health", healthRoutes);
router.use("/progress", progressRoutes);

export default router;
