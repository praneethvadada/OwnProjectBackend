import express from "express";
import { presignForUpload } from "../controllers/uploadController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.post("/presign", authenticate, requireAdmin, presignForUpload);
export default router;
