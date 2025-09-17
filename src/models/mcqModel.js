// src/models/mcqModel.js
import db from "../config/db.js";

export const createMcq = async (data) => {
  const {
    title=null, description=null, topic_id=null, options, is_single_answer=1,
    correct_answers=null, code_snippets=null, question_type='practice', difficulty='Level1', images=null
  } = data;

  const [res] = await db.query(
    `INSERT INTO mcqs (title, description, topic_id, options, is_single_answer, correct_answers, code_snippets, question_type, difficulty, images)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [title, description, topic_id, JSON.stringify(options), is_single_answer, JSON.stringify(correct_answers || null), code_snippets, question_type, difficulty, images]
  );
  return res.insertId;
};

export const getMcqById = async (id) => {
  const [rows] = await db.query("SELECT * FROM mcqs WHERE id = ?", [id]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { ...r, options: r.options ? JSON.parse(r.options) : null, correct_answers: r.correct_answers ? JSON.parse(r.correct_answers) : null };
};
