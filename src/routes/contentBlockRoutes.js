// src/routes/contentBlockRoutes.js
import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/roleMiddleware.js";
import * as BlockCtrl from "../controllers/blockController.js";

const router = express.Router();

// Create content block (protected: admin/author)
router.post("/", authenticate, requireAdmin, BlockCtrl.addBlock);

// Get blocks by topic id (public read)
router.get("/", BlockCtrl.getBlocks);


// update block
router.put("/:id", authenticate, requireAdmin, BlockCtrl.editBlock);

// delete block
router.delete("/:id", authenticate, requireAdmin, BlockCtrl.deleteBlock);

export default router;
