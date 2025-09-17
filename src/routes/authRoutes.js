// src/routes/authRoutes.js
import express from "express";
import { adminRegister, userRegister, login } from "../controllers/authController.js";

const router = express.Router();

// Public
router.post("/register/user", userRegister);
router.post("/login", login);

// Admin register should ideally be protected; for initial setup you can enable it.
// Once an initial admin exists, disable or protect this route with requireSuperAdmin.
router.post("/register/admin", adminRegister);

export default router;
