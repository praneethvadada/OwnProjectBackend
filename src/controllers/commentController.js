// src/controllers/commentController.js
import * as CommentModel from "../models/commentModel.js";

export const postComment = async (req, res) => {
  try {
    const topic_id = req.params.topicId;
    const { parent_comment_id=null, content } = req.body;
    if (!content) return res.status(400).json({ message: "content required" });
    const id = await CommentModel.createComment({ topic_id, parent_comment_id, user_id: req.user?.id || null, content });
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message:"server error" });
  }
};

export const getComments = async (req, res) => {
  const topic_id = req.params.topicId;
  const rows = await CommentModel.getCommentsByTopic(topic_id);
  // optionally, build nested tree on server or send flat list and let client nest
  res.json(rows);
};

export const likeComment = async (req, res) => {
  const comment_id = req.params.commentId;
  const user_id = req.user?.id;
  if (!user_id) return res.status(401).json({ message: "login required" });
  const ok = await CommentModel.likeComment(comment_id, user_id);
  if (!ok) return res.status(409).json({ message: "already liked" });
  res.json({ message: "liked" });
};
