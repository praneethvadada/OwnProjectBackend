// src/models/userModel.js
import db from "../config/db.js";

export const findUserByEmail = async (email) => {
  const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  return rows[0];
};

export const findUserById = async (id) => {
  const [rows] = await db.query("SELECT id, name, email, role, bio, avatar_url, created_at FROM users WHERE id = ?", [id]);
  return rows[0];
};

export const createUser = async ({ name, email, password, role = "student", bio = null }) => {
  const [result] = await db.query(
    "INSERT INTO users (name, email, password, role, bio) VALUES (?, ?, ?, ?, ?)",
    [name, email, password, role, bio]
  );
  return result.insertId;
};
