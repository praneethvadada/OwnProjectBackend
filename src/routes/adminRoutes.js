// src/routes/adminRoutes.js
import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/roleMiddleware.js";

const router = express.Router();

// example protected admin-only route
router.get("/dashboard", authenticate, requireAdmin, (req, res) => {
  res.json({ message: "Welcome Admin", adminId: req.user.id });
});

export default router;
