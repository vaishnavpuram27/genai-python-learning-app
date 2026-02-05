import { Router } from "express";
import authMiddleware from "../../middleware/auth.js";
import { login, me, signup } from "../../controllers/authController.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", authMiddleware, me);

export default router;
