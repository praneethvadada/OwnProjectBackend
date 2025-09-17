// src/controllers/blockController.js
import * as ContentBlock from "../models/contentBlockModel.js";

export const addBlock = async (req, res) => {
  try {
    // Expect JSON body matching the model fields
    const payload = req.body;

    // basic validation
    if (!payload || !payload.topic_id || !payload.block_type) {
      return res.status(400).json({ message: "topic_id and block_type are required" });
    }

    // Normalize small things
    payload.block_type = String(payload.block_type).trim();
    payload.block_order = payload.block_order !== undefined ? Number(payload.block_order) : 0;

    const id = await ContentBlock.createBlock(payload);
    return res.status(201).json({ id, message: "Content block created" });
  } catch (err) {
    console.error("addBlock error:", err);
    return res.status(500).json({ message: "Server error while creating content block" });
  }
};

export const getBlocks = async (req, res) => {
  try {
    const topic_id = req.query.topic_id;
    if (!topic_id) return res.status(400).json({ message: "topic_id query param required" });
    const blocks = await ContentBlock.getBlocksByTopic(topic_id);
    return res.json(blocks);
  } catch (err) {
    console.error("getBlocks error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const editBlock = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid block id" });

    // Accept fields allowed
    const allowed = ["title","subtitle","text","text_style","code_snippets","links","example_meta","note_meta","mcq_ref","practice_links","block_order","metadata"];
    const fields = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        fields[k] = req.body[k];
      }
    }
    if (Object.keys(fields).length === 0) return res.status(400).json({ message: "No updatable fields provided" });

    // Stringify objects inside model if necessary is handled in model.updateBlockById
    const affected = await ContentBlock.updateBlockById(id, fields);
    if (!affected) return res.status(404).json({ message: "Content block not found" });
    return res.json({ message: "Content block updated", id });
  } catch (err) {
    console.error("editBlock error:", err);
    return res.status(500).json({ message: "Server error while updating content block" });
  }
};

export const deleteBlock = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid block id" });
    const affected = await ContentBlock.deleteBlockById(id);
    if (!affected) return res.status(404).json({ message: "Content block not found" });
    return res.json({ message: "Content block deleted" });
  } catch (err) {
    console.error("deleteBlock error:", err);
    return res.status(500).json({ message: "Server error while deleting content block" });
  }
};
