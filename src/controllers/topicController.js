// src/controllers/topicController.js
import * as Topic from "../models/topicModel.js";
import * as ContentBlock from "../models/contentBlockModel.js";
import * as TopicModel from "../models/topicModel.js";
/* Create */
export const createTopic = async (req, res) => {
  try {
    const { parent_id = null, title, slug, description = null, order_index = 0, is_published = 0 } = req.body;
    if (!title || !slug) return res.status(400).json({ message: "title and slug required" });
    const id = await Topic.createTopic({ parent_id, title, slug, description, order_index, is_published, author_id: req.user?.id || null });
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

/* Get by id: return topic + blocks + immediate children */
// export const getTopicById = async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     // if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid topic id" });
//     const topic = await Topic.getTopicById(id);
//     if (!topic) return res.status(404).json({ message: "Topic not found" });
//     const blocks = await ContentBlock.getBlocksByTopic(topic.id);
//     const children = await Topic.getChildren(topic.id);
//     return res.json({ topic, blocks, children });
//   } catch (err) {
//     console.error("getTopicById error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// };


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



// // src/controllers/topicController.js
// import * as Topic from "../models/topicModel.js";
// import * as ContentBlock from "../models/contentBlockModel.js";

// /**
//  * Create a new topic (subject / subtopic)
//  */
// export const createTopic = async (req, res) => {
//   try {
//     const { parent_id = null, title, slug, description = null, order_index = 0, is_published = 0 } = req.body;

//     if (!title || !slug) {
//       return res.status(400).json({ message: "title and slug are required" });
//     }

//     const normalizedSlug = String(slug).trim().toLowerCase();

//     const payload = {
//       parent_id,
//       title,
//       slug: normalizedSlug,
//       description,
//       author_id: req.user?.id || null,
//       order_index,
//       is_published,
//     };

//     const id = await Topic.createTopic(payload);
//     return res.status(201).json({ id, title, slug: normalizedSlug });
//   } catch (err) {
//     console.error("createTopic error:", err);
//     if (err && err.code === "ER_DUP_ENTRY") {
//       return res.status(409).json({ message: "Slug already exists under this parent. Choose a different slug." });
//     }
//     return res.status(500).json({ message: "Server error while creating topic" });
//   }
// };

// /**
//  * Get children topics for given parent id.
//  */
// export const getChildren = async (req, res) => {
//   try {
//     const raw = req.params.id;
//     const parentId = raw === "null" ? null : Number(raw);
//     const children = await Topic.getChildren(parentId);
//     return res.json(children);
//   } catch (err) {
//     console.error("getChildren error:", err);
//     return res.status(500).json({ message: "Server error while fetching children" });
//   }
// };

// /**
//  * Resolve a topic from a slug path (wildcard)
//  */
// // export const getTopicBySlugPath = async (req, res) => {
// //   try {
// //     // Express wildcard (*) puts the match into req.params[0]
// //     const slugPath = req.params[0] || "";
// //     const segments = slugPath.split("/").filter(Boolean);

// //     if (segments.length === 0) {
// //       return res.status(400).json({ message: "No slug provided in path" });
// //     }

// //     const topic = await Topic.getTopicBySlugPath(segments);
// //     if (!topic) return res.status(404).json({ message: "Topic not found" });

// //     const blocks = await ContentBlock.getBlocksByTopic(topic.id);
// //     return res.json({ topic, blocks });
// //   } catch (err) {
// //     console.error("getTopicBySlugPath error:", err);
// //     return res.status(500).json({ message: "Server error while resolving slug path" });
// //   }
// // };



// export const getTopicBySlugPath = async (req, res) => {
//   try {
//     const slugPath = req.params.slugPath || "";   // comes from :slugPath(*)
//     const segments = slugPath.split("/").filter(Boolean);

//     if (segments.length === 0) {
//       return res.status(400).json({ message: "No slug provided in path" });
//     }

//     const topic = await Topic.getTopicBySlugPath(segments);
//     if (!topic) return res.status(404).json({ message: "Topic not found" });

//     const blocks = await ContentBlock.getBlocksByTopic(topic.id);
//     return res.json({ topic, blocks });
//   } catch (err) {
//     console.error("getTopicBySlugPath error:", err);
//     return res.status(500).json({ message: "Server error while resolving slug path" });
//   }
// };



// export const editTopic = async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     if (!id) return res.status(400).json({ message: "Invalid topic id" });

//     const allowed = ["title","slug","description","parent_id","order_index","is_published"];
//     const fields = {};
//     for (const k of allowed) {
//       if (Object.prototype.hasOwnProperty.call(req.body, k)) fields[k] = req.body[k];
//     }
//     if (Object.keys(fields).length === 0) return res.status(400).json({ message: "No updatable fields provided" });

//     if (fields.slug) fields.slug = String(fields.slug).trim().toLowerCase();

//     const affected = await Topic.updateTopicById(id, fields);
//     if (!affected) return res.status(404).json({ message: "Topic not found" });
//     return res.json({ message: "Topic updated", id });
//   } catch (err) {
//     console.error("editTopic error:", err);
//     if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Slug conflict under same parent" });
//     return res.status(500).json({ message: "Server error while updating topic" });
//   }
// };

// // Delete topic (DELETE /api/topics/:id)
// export const deleteTopic = async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     if (!id) return res.status(400).json({ message: "Invalid topic id" });

//     const affected = await Topic.deleteTopicById(id);
//     if (!affected) return res.status(404).json({ message: "Topic not found" });

//     return res.json({ message: "Topic and all its children/content deleted" });
//   } catch (err) {
//     console.error("deleteTopic error:", err);
//     return res.status(500).json({ message: "Server error while deleting topic" });
//   }
// };




// /**
//  * Resolve a root-level URL path like `/python/python_variables_names` to a topic + blocks.
//  * This function expects the path to be in req.params[0] (regex route) or req.path.
//  */
// export const resolveByRootPath = async (req, res, next) => {
//   try {
//     // read wildcard from req.params[0] (regex route) or other fallbacks
//     let wildcard = "";
//     if (req.params && typeof req.params[0] === "string") {
//       wildcard = req.params[0];
//     } else if (req.path && req.path.startsWith("/")) {
//       wildcard = req.path.slice(1);
//     } else {
//       return next(); // nothing to resolve
//     }

//     // normalize: remove trailing slash, split, lowercase
//     const segments = String(wildcard)
//       .replace(/\/+$/, "")          // remove trailing slashes
//       .split("/")
//       .filter(Boolean)
//       .map(s => String(s).trim().toLowerCase());

//     if (segments.length === 0) return next();

//     // Use existing model function to walk the slug segments
//     const topic = await Topic.getTopicBySlugPath(segments);
//     if (!topic) {
//       return res.status(404).json({ message: "Not found" }); // frontend expects 404
//     }

//     const blocks = await ContentBlock.getBlocksByTopic(topic.id);

//     // return JSON (you can also render server-side HTML here if desired)
//     return res.json({ topic, blocks });

//   } catch (err) {
//     console.error("resolveByRootPath error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// };



// // // src/controllers/topicController.js
// // import * as Topic from "../models/topicModel.js";
// // import * as ContentBlock from "../models/contentBlockModel.js";

// // /**
// //  * Create a new topic (subject / subtopic)
// //  */
// // export const createTopic = async (req, res) => {
// //   try {
// //     const { parent_id = null, title, slug, description = null, order_index = 0, is_published = 0 } = req.body;

// //     if (!title || !slug) {
// //       return res.status(400).json({ message: "title and slug are required" });
// //     }

// //     const normalizedSlug = String(slug).trim().toLowerCase();

// //     const payload = {
// //       parent_id,
// //       title,
// //       slug: normalizedSlug,
// //       description,
// //       author_id: req.user?.id || null,
// //       order_index,
// //       is_published,
// //     };

// //     const id = await Topic.createTopic(payload);
// //     return res.status(201).json({ id, title, slug: normalizedSlug });
// //   } catch (err) {
// //     console.error("createTopic error:", err);
// //     if (err && err.code === "ER_DUP_ENTRY") {
// //       return res.status(409).json({ message: "Slug already exists under this parent. Choose a different slug." });
// //     }
// //     return res.status(500).json({ message: "Server error while creating topic" });
// //   }
// // };

// // /**
// //  * Get children topics for given parent id.
// //  */
// // export const getChildren = async (req, res) => {
// //   try {
// //     const raw = req.params.id;
// //     const parentId = raw === "null" ? null : Number(raw);
// //     const children = await Topic.getChildren(parentId);
// //     return res.json(children);
// //   } catch (err) {
// //     console.error("getChildren error:", err);
// //     return res.status(500).json({ message: "Server error while fetching children" });
// //   }
// // };

// // /**
// //  * Resolve a topic from a slug path (wildcard)
// //  * Works with regex route (/^\/slug\/(.*)$/) or with named param routes
// //  */
// // // export const getTopicBySlugPath = async (req, res) => {
// // //   try {
// // //     // Support multiple ways of receiving the wildcard:
// // //     // 1) If router used named param: req.params.slugPath
// // //     // 2) If router used regex: req.params[0]
// // //     // 3) Fallback to req.path (strip prefix)
// // //     let wildcard = "";

// // //     if (req.params && typeof req.params.slugPath === "string") {
// // //       wildcard = req.params.slugPath;
// // //     } else if (req.params && typeof req.params[0] === "string") {
// // //       wildcard = req.params[0];
// // //     } else if (req.path && req.path.startsWith("/slug/")) {
// // //       wildcard = req.path.replace(/^\/slug\//, "");
// // //     } else if (req.url && req.url.startsWith("/slug/")) {
// // //       wildcard = req.url.replace(/^\/slug\//, "");
// // //     }

// // //     const segments = String(wildcard)
// // //       .split("/")
// // //       .filter(Boolean)
// // //       .map((s) => String(s).trim().toLowerCase());

// // //     if (segments.length === 0) {
// // //       return res.status(400).json({ message: "No slug provided in path" });
// // //     }

// // //     const topic = await Topic.getTopicBySlugPath(segments);
// // //     if (!topic) return res.status(404).json({ message: "Topic not found" });

// // //     const blocks = await ContentBlock.getBlocksByTopic(topic.id);
// // //     return res.json({ topic, blocks });
// // //   } catch (err) {
// // //     console.error("getTopicBySlugPath error:", err);
// // //     return res.status(500).json({ message: "Server error" });
// // //   }
// // // };


// // // src/controllers/topicController.js
// // // export const getTopicBySlugPath = (req, res) => {
// // //   const slugPath = req.params.slugPath; // "tech/programming/javascript"
// // //   const segments = slugPath.split("/");

// // //   res.json({ slugPath, segments });
// // // };


// // export const getTopicBySlugPath = (req, res) => {
// //   const slugPath = req.params.slugPath;   // "a/b/c"
// //   const segments = slugPath ? slugPath.split("/") : [];
// //   res.json({ slugPath, segments });
// // };


// // export const editTopic = async (req, res) => {
// //   try {
// //     const id = Number(req.params.id);
// //     if (!id) return res.status(400).json({ message: "Invalid topic id" });

// //     const allowed = ["title","slug","description","parent_id","order_index","is_published"];
// //     const fields = {};
// //     for (const k of allowed) {
// //       if (Object.prototype.hasOwnProperty.call(req.body, k)) fields[k] = req.body[k];
// //     }
// //     if (Object.keys(fields).length === 0) return res.status(400).json({ message: "No updatable fields provided" });

// //     // normalize slug if present
// //     if (fields.slug) fields.slug = String(fields.slug).trim().toLowerCase();

// //     const affected = await Topic.updateTopicById(id, fields);
// //     if (!affected) return res.status(404).json({ message: "Topic not found" });
// //     return res.json({ message: "Topic updated", id });
// //   } catch (err) {
// //     console.error("editTopic error:", err);
// //     if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Slug conflict under same parent" });
// //     return res.status(500).json({ message: "Server error while updating topic" });
// //   }
// // };

// // // Delete topic (DELETE /api/topics/:id)
// // export const deleteTopic = async (req, res) => {
// //   try {
// //     const id = Number(req.params.id);
// //     if (!id) return res.status(400).json({ message: "Invalid topic id" });

// //     const affected = await Topic.deleteTopicById(id);
// //     if (!affected) return res.status(404).json({ message: "Topic not found" });

// //     return res.json({ message: "Topic and all its children/content deleted" });
// //   } catch (err) {
// //     console.error("deleteTopic error:", err);
// //     return res.status(500).json({ message: "Server error while deleting topic" });
// //   }
// // };


// // // // src/controllers/topicController.js
// // // import * as Topic from "../models/topicModel.js";
// // // import * as ContentBlock from "../models/contentBlockModel.js";

// // // /**
// // //  * Create a new topic (subject / subtopic)
// // //  * Protected: should be used with authenticate + requireAdmin / requireAuthor middleware
// // //  *
// // //  * Body expected:
// // //  * {
// // //  *   parent_id: null | int,
// // //  *   title: "Python",
// // //  *   slug: "python",
// // //  *   description: "...",
// // //  *   order_index: 0,
// // //  *   is_published: 0 | 1
// // //  * }
// // //  */
// // // export const createTopic = async (req, res) => {
// // //   try {
// // //     const { parent_id = null, title, slug, description = null, order_index = 0, is_published = 0 } = req.body;

// // //     if (!title || !slug) {
// // //       return res.status(400).json({ message: "title and slug are required" });
// // //     }

// // //     // optional: normalize slug (lowercase, trim)
// // //     const normalizedSlug = String(slug).trim().toLowerCase();

// // //     const payload = {
// // //       parent_id,
// // //       title,
// // //       slug: normalizedSlug,
// // //       description,
// // //       author_id: req.user?.id || null,
// // //       order_index,
// // //       is_published,
// // //     };

// // //     const id = await Topic.createTopic(payload);
// // //     return res.status(201).json({ id, title, slug: normalizedSlug });
// // //   } catch (err) {
// // //     console.error("createTopic error:", err);
// // //     // handle duplicate (unique_parent_slug) case
// // //     if (err && err.code === "ER_DUP_ENTRY") {
// // //       return res.status(409).json({ message: "Slug already exists under this parent. Choose a different slug." });
// // //     }
// // //     return res.status(500).json({ message: "Server error while creating topic" });
// // //   }
// // // };

// // // /**
// // //  * Get children topics for given parent id.
// // //  * If parent id is "null" string, it will fetch top-level topics (parent_id IS NULL).
// // //  * Public endpoint.
// // //  */
// // // export const getChildren = async (req, res) => {
// // //   try {
// // //     const raw = req.params.id;
// // //     const parentId = raw === "null" ? null : Number(raw);
// // //     const children = await Topic.getChildren(parentId);
// // //     return res.json(children);
// // //   } catch (err) {
// // //     console.error("getChildren error:", err);
// // //     return res.status(500).json({ message: "Server error while fetching children" });
// // //   }
// // // };

// // // /**
// // //  * Resolve a topic from a slug path (wildcard)
// // //  * Example: /api/topics/slug/python/dict/advanced
// // //  * returns { topic, blocks }
// // //  */
// // // export const getTopicBySlugPath = async (req, res) => {
// // //   try {
// // //     // route: /api/topics/slug/:slugPath(*)
// // //     const wildcard = req.params.slugPath || ""; // e.g. "python/dict/advanced"
// // //     const segments = wildcard.split("/").filter(Boolean).map(s => String(s).trim().toLowerCase());
// // //     const topic = await Topic.getTopicBySlugPath(segments);
// // //     if (!topic) return res.status(404).json({ message: "Topic not found" });

// // //     const blocks = await ContentBlock.getBlocksByTopic(topic.id);
// // //     return res.json({ topic, blocks });
// // //   } catch (err) {
// // //     console.error("getTopicBySlugPath error:", err);
// // //     return res.status(500).json({ message: "Server error" });
// // //   }
// // // };


// // // // // src/controllers/topicController.js
// // // // import * as Topic from "../models/topicModel.js";
// // // // import * as ContentBlock from "../models/contentBlockModel.js";

// // // // export const getTopicBySlugPath = async (req, res) => {
// // // //   try {
// // // //     // route: /api/topics/slug/:slugPath(*)
// // // //     const wildcard = req.params.slugPath || ""; // e.g. "python/dict/advanced"
// // // //     const segments = wildcard.split("/").filter(Boolean);
// // // //     const topic = await Topic.getTopicBySlugPath(segments);
// // // //     if (!topic) return res.status(404).json({ message: "Topic not found" });

// // // //     const blocks = await ContentBlock.getBlocksByTopic(topic.id);
// // // //     return res.json({ topic, blocks });
// // // //   } catch (err) {
// // // //     console.error(err);
// // // //     res.status(500).json({ message: "Server error" });
// // // //   }
// // // // };
