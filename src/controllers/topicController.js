// src/controllers/topicController.js
import * as Topic from "../models/topicModel.js";
import * as ContentBlock from "../models/contentBlockModel.js";
import * as TopicModel from "../models/topicModel.js";
/* Create */
// export const createTopic = async (req, res) => {
//   try {
//     const { parent_id = null, title, slug, description = null, order_index = 0, is_published = 0 } = req.body;
//     if (!title || !slug) return res.status(400).json({ message: "title and slug required" });
//     const id = await Topic.createTopic({ parent_id, title, slug, description, order_index, is_published, author_id: req.user?.id || null });
//     return res.status(201).json({ id });
//   } catch (err) {
//     console.error("createTopic error:", err);
//     if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Slug conflict under same parent" });
//     return res.status(500).json({ message: "Server error" });
//   }
// };


/* Create */
export const createTopic = async (req, res) => {
  try {
    const {
      parent_id = null,
      title,
      slug,
      description = null,
      // allow client to specify order_no (optional). If omitted, we insert at top.
      order_no = null,
      is_published = 0
    } = req.body;

    if (!title || !slug) return res.status(400).json({ message: "title and slug required" });

    const id = await TopicModel.createTopicWithOrder({
      parent_id,
      title,
      slug,
      description,
      order_no,
      author_id: req.user?.id || null,
      metadata: req.body.metadata || null,
      is_published: is_published ? 1 : 0
    });

    return res.status(201).json({ id });
  } catch (err) {
    console.error("createTopic error:", err);
    if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Slug conflict under same parent" });
    return res.status(500).json({ message: "Server error" });
  }
};

/* Update */
export const editTopic = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });
    const fields = req.body;
    const affected = await Topic.updateTopicById(id, fields);
    if (!affected) return res.status(404).json({ message: "Topic not found" });
    return res.json({ message: "Topic updated", id });
  } catch (err) {
    console.error("editTopic error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
  
/* Delete */
export const deleteTopic = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });
    const affected = await Topic.deleteTopicById(id);
    if (!affected) return res.status(404).json({ message: "Topic not found" });
    return res.json({ message: "Topic and descendants deleted" });
  } catch (err) {
    console.error("deleteTopic error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};




export const getTopicById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid topic id" });
    }

    const topic = await TopicModel.getTopicById(id);
    if (!topic) return res.status(404).json({ message: "Topic not found" });

    // fetch child topics, blocks, etc...
    return res.json({ topic });
  } catch (err) {
    console.error("getTopicById error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};



/* Get immediate children */
export const getChildren = async (req, res) => {
  try {
    const raw = req.params.id;
    const parentId = raw === "null" ? null : Number(raw);
    const children = await Topic.getChildren(parentId);
    return res.json(children);
  } catch (err) {
    console.error("getChildren error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* Slug resolver (API): /api/topics/slug/* */
export const getTopicBySlugPath = async (req, res) => {
  try {
    // wildcard captured by regex route as req.params[0]
    const wildcard = req.params && req.params[0] ? req.params[0] : "";
    const segments = String(wildcard).split("/").filter(Boolean).map(s => s.trim().toLowerCase());
    if (segments.length === 0) return res.status(400).json({ message: "No slug provided" });

    // first try full_path lookup
    const fullPath = segments.join("/");
    let topic = await Topic.getTopicByFullPath(fullPath);

    // fallback: segment walk (if full_path not set or not found)
    if (!topic) {
      topic = await Topic.getTopicBySlugPath(segments);
    }

    if (!topic) return res.status(404).json({ message: "Topic not found" });

    const blocks = await ContentBlock.getBlocksByTopic(topic.id);
    const children = await Topic.getChildren(topic.id);
    return res.json({ topic, blocks, children });
  } catch (err) {
    console.error("getTopicBySlugPath error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* Resolve root-level path (frontend-style) - used by server root regex route */
export const resolveByRootPath = async (req, res, next) => {
  try {
    let wildcard = "";
    if (req.params && typeof req.params[0] === "string") wildcard = req.params[0];
    else if (req.path && req.path.startsWith("/")) wildcard = req.path.slice(1);

    const segments = String(wildcard).replace(/\/+$/, "").split("/").filter(Boolean).map(s => s.trim().toLowerCase());
    if (segments.length === 0) return next();

    // prefer full_path lookup
    const fullPath = segments.join("/");
    let topic = await Topic.getTopicByFullPath(fullPath);
    if (!topic) topic = await Topic.getTopicBySlugPath(segments);
    if (!topic) return res.status(404).json({ message: "Not found" });

    const blocks = await ContentBlock.getBlocksByTopic(topic.id);
    const children = await Topic.getChildren(topic.id);
    return res.json({ topic, blocks, children });
  } catch (err) {
    console.error("resolveByRootPath error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* Recursive tree - returns nested subtopics (with optional depth query param) */
async function buildTree(parentId, maxDepth = 5, depth = 0) {
  if (depth >= maxDepth) return [];
  const children = await Topic.getChildren(parentId);
  const out = [];
  for (const c of children) {
    const blocks = []; // optionally fetch blocks for each child if needed
    const sub = await buildTree(c.id, maxDepth, depth + 1);
    out.push({ topic: c, blocks, children: sub });
  }
  return out;
}

export const getTopicTree = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const depth = Number(req.query.depth) || 5;
    const tree = await buildTree(id || null, depth, 0);
    return res.json(tree);
  } catch (err) {
    console.error("getTopicTree error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


export const getRootTopics = async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const includeChildCount = req.query.includeChildCount === "1" || req.query.includeChildCount === "true";

    const rows = await TopicModel.getRootTopics({ limit, offset, includeChildCount });
    return res.json({ count: rows.length, topics: rows });
  } catch (err) {
    console.error("getRootTopics error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


// /**
//  * Reorder a topic.
//  * PUT /api/topics/:id/order
//  * Body: { order_no: <new position (0-based)> }
//  */
// export const reorderTopic = async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });

//     if (!("order_no" in req.body)) return res.status(400).json({ message: "order_no required in body" });
//     const newOrder = Number(req.body.order_no);
//     if (!Number.isFinite(newOrder) || newOrder < 0) return res.status(400).json({ message: "Invalid order_no" });

//     const ok = await TopicModel.reorderTopic(id, newOrder);
//     if (!ok) return res.status(404).json({ message: "Topic not found" });

//     return res.json({ message: "Topic reordered", id, order_no: newOrder });
//   } catch (err) {
//     console.error("reorderTopic error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// };



/**
 * POST /api/topics/:parentId/reorder
 * Body: [{ id: <topicId>, order_index: <desiredIndex> }, ...]
 */
// export const bulkReorderHandler = async (req, res) => {
//   try {
//     const rawParent = req.params.parentId;
//     const parentId = (rawParent === "null" || rawParent === "NULL") ? null : Number(rawParent);
//     if (parentId !== null && (!Number.isFinite(parentId) || parentId <= 0)) {
//       return res.status(400).json({ message: "Invalid parentId" });
//     }

//     const items = req.body;
//     if (!Array.isArray(items)) return res.status(400).json({ message: "Request body must be an array" });
//     if (items.length === 0) return res.status(400).json({ message: "Array must contain at least one item" });

//     for (const it of items) {
//   if (!("id" in it) || !("order_no" in it)) {
//     return res.status(400).json({ message: "Each item must contain id and order_no" });
//   }
//   if (!Number.isFinite(Number(it.id)) || !Number.isFinite(Number(it.order_no))) {
//     return res.status(400).json({ message: "id and order_no must be numbers" });
//   }
// }

//     // call model
//     const result = await TopicModel.bulkReorderChildren(parentId, items);
//     return res.json({ message: "Reorder applied", result });
//   } catch (err) {
//     console.error("bulkReorderHandler error:", err && err.message ? err.message : err);
//     if (err.message && err.message.startsWith("Topic id")) {
//       return res.status(400).json({ message: err.message });
//     }
//     return res.status(500).json({ message: "Server error" });
//   }
// };



export const bulkReorderHandler = async (req, res) => {
  try {
    const rawParent = req.params.parentId;
    const parentId = (rawParent === "null" || rawParent === "NULL") ? null : Number(rawParent);
    if (parentId !== null && (!Number.isFinite(parentId) || parentId <= 0)) {
      return res.status(400).json({ message: "Invalid parentId" });
    }

    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ message: "Request body must be an array" });
    if (items.length === 0) return res.status(400).json({ message: "Array must contain at least one item" });

    // validate each item has id and order_no
    for (const it of items) {
      if (!("id" in it) || !("order_no" in it)) {
        return res.status(400).json({ message: "Each item must contain id and order_no" });
      }
      if (!Number.isFinite(Number(it.id)) || !Number.isFinite(Number(it.order_no))) {
        return res.status(400).json({ message: "id and order_no must be numbers" });
      }
    }




    // call model
    const result = await TopicModel.bulkReorderChildren(parentId, items);
    return res.json({ message: "Reorder applied", result });
  } catch (err) {
    console.error("bulkReorderHandler error:", err && err.message ? err.message : err);
    if (err.message && err.message.startsWith("Topic id")) {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error" });
  }
};
