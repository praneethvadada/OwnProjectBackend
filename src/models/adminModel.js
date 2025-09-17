// src/models/adminModel.js
import db from "../config/db.js";

export const findAdminByEmail = async (email) => {
  const [rows] = await db.query("SELECT * FROM admins WHERE email = ?", [email]);
  return rows[0];
};

export const findAdminById = async (id) => {
  const [rows] = await db.query("SELECT id, name, email, is_super, created_at FROM admins WHERE id = ?", [id]);
  return rows[0];
};

export const createAdmin = async ({ name, email, password, phone, is_super = 0 }) => {
  const [result] = await db.query(
    "INSERT INTO admins (name, email, password, phone, is_super) VALUES (?, ?, ?, ?, ?)",
    [name, email, password, phone, is_super]
  );
  return result.insertId;
};
