// src/routes/mcqRoutes.js
import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/roleMiddleware.js";
import * as McqCtrl from "../controllers/mcqController.js";

const router = express.Router();

router.post("/", authenticate, requireAdmin, McqCtrl.createMcq);
router.get("/:id", McqCtrl.getMcq);

export default router;
