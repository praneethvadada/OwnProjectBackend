// src/models/commentModel.js
import db from "../config/db.js";

export const createComment = async ({ topic_id=null, parent_comment_id=null, user_id=null, content }) => {
  const [res] = await db.query(
    `INSERT INTO comments (topic_id, parent_comment_id, user_id, content) VALUES (?,?,?,?)`,
    [topic_id, parent_comment_id, user_id, content]
  );
  return res.insertId;
};

export const getCommentsByTopic = async (topic_id) => {
  const [rows] = await db.query("SELECT * FROM comments WHERE topic_id = ? ORDER BY created_at", [topic_id]);
  return rows;
};

export const likeComment = async (comment_id, user_id) => {
  // avoid duplicate likes
  const [exists] = await db.query("SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ? LIMIT 1", [comment_id, user_id]);
  if (exists && exists.length) return false;
  await db.query("INSERT INTO comment_likes (comment_id, user_id) VALUES (?,?)", [comment_id, user_id]);
  await db.query("UPDATE comments SET like_count = like_count + 1 WHERE id = ?", [comment_id]);
  return true;
};
