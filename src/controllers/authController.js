// src/controllers/authController.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

import { findAdminByEmail, createAdmin } from "../models/adminModel.js";
import { findUserByEmail, createUser } from "../models/userModel.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const SALT_ROUNDS = 10;

/* Admin signup (only call this for first admin or via protected route) */
export const adminRegister = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Missing fields" });

    const existing = await findAdminByEmail(email);
    if (existing) return res.status(409).json({ message: "Admin with email already exists" });

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const adminId = await createAdmin({ name, email, password: hashed, phone, is_super: 0 });
    return res.status(201).json({ id: adminId, name, email });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* User signup */
export const userRegister = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Missing fields" });

    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ message: "User with email already exists" });

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = await createUser({ name, email, password: hashed, role });
    return res.status(201).json({ id: userId, name, email });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* Login (for both admins and users) */
export const login = async (req, res) => {
  try {
    const { email, password, as } = req.body; // `as` = 'admin' or 'user'
    if (!email || !password || !as) return res.status(400).json({ message: "email, password and as (admin|user) required" });

    if (as === "admin") {
      const admin = await findAdminByEmail(email);
      if (!admin) return res.status(401).json({ message: "Invalid credentials" });
      const match = await bcrypt.compare(password, admin.password);
      if (!match) return res.status(401).json({ message: "Invalid credentials" });

      const payload = { id: admin.id, role: "admin", is_super: admin.is_super };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      return res.json({ token, user: { id: admin.id, name: admin.name, email: admin.email, role: "admin" } });
    }

    // user login
    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ message: "Invalid credentials" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const payload = { id: user.id, role: user.role || "student" };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};
