import express from "express";
import authMiddleware from "../../middleware/auth.js";
import ensureDb from "../../middleware/ensureDb.js";
import validateObjectId from "../../middleware/validateObjectId.js";
import {
  listTemplates, getTemplate, publishTemplate,
  updateTemplate, deleteTemplate, importTemplate,
} from "../../controllers/hubController.js";

const router = express.Router();
router.use(authMiddleware, ensureDb);

router.get("/", listTemplates);
router.get("/:templateId", validateObjectId("templateId"), getTemplate);
router.post("/", publishTemplate);
router.put("/:templateId", validateObjectId("templateId"), updateTemplate);
router.delete("/:templateId", validateObjectId("templateId"), deleteTemplate);
router.post("/:templateId/import", validateObjectId("templateId"), importTemplate);

export default router;
