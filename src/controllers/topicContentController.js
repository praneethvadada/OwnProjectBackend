// src/controllers/topicContentController.js
import * as Topic from "../models/topicModel.js";
import * as ContentBlock from "../models/contentBlockModel.js";

export const addContentByTopicId = async (req, res) => {
  try {
    const topicId = Number(req.params.id);
    if (!topicId || Number.isNaN(topicId)) return res.status(400).json({ message: "Invalid topic id" });

    const topic = await Topic.getTopicById(topicId);
    if (!topic) return res.status(404).json({ message: "Topic not found" });

    // body should contain components array and optional metadata/block_order
    const payload = {
      topic_id: topicId,
      block_type: req.body.block_type || "page",
      components: req.body.components || null,
      block_order: req.body.block_order || 0,
      metadata: req.body.metadata || null
    };

    const result = await ContentBlock.createBlock(payload);
    if (result.existed) return res.status(409).json({ message: "Duplicate content", id: result.id });
    return res.status(201).json({ id: result.id, message: "Content block created" });
  } catch (err) {
    console.error("addContentByTopicId error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const addContentBySlug = async (req, res) => {
  try {
    const wildcard = req.params && typeof req.params[0] === "string" ? req.params[0] : "";
    const segments = String(wildcard).split("/").filter(Boolean).map(s => s.trim().toLowerCase());
    if (segments.length === 0) return res.status(400).json({ message: "No slug provided" });

    const fullPath = segments.join("/");
    let topic = await Topic.getTopicByFullPath(fullPath);
    if (!topic) topic = await Topic.getTopicBySlugPath(segments);
    if (!topic) return res.status(404).json({ message: "Topic not found" });

    const payload = {
      topic_id: topic.id,
      block_type: req.body.block_type || "page",
      components: req.body.components || null,
      block_order: req.body.block_order || 0,
      metadata: req.body.metadata || null
    };

    const result = await ContentBlock.createBlock(payload);
    if (result.existed) return res.status(409).json({ message: "Duplicate content", id: result.id });
    return res.status(201).json({ id: result.id, message: "Content block created" });
  } catch (err) {
    console.error("addContentBySlug error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};



// // src/controllers/topicContentController.js
// import * as Topic from "../models/topicModel.js";
// import * as ContentBlock from "../models/contentBlockModel.js";

// /**
//  * Add content by topic id:
//  * POST /api/topics/:id/content
//  */
// export const addContentByTopicId = async (req, res) => {
//   try {
//     const topicId = Number(req.params.id);
//     if (!topicId || Number.isNaN(topicId)) return res.status(400).json({ message: "Invalid topic id" });

//     const topic = await Topic.getTopicById(topicId);
//     if (!topic) return res.status(404).json({ message: "Topic not found" });

//     const payload = buildContentPayload(req.body);
//     payload.topic_id = topicId;

//     // IMPORTANT: createBlock should return { id, existed }
//     const result = await ContentBlock.createBlock(payload);

//     // If createBlock reports it already existed, return 409 Conflict
//     if (result && result.existed) {
//       return res.status(409).json({ message: "Duplicate content", id: result.id });
//     }

//     return res.status(201).json({ id: result.id, message: "Content block created" });
//   } catch (err) {
//     console.error("addContentByTopicId error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// };

// /**
//  * Add content by slug path:
//  * POST /api/topics/slug/<wildcard>/content
//  * (router will supply wildcard as req.params[0])
//  */
// export const addContentBySlug = async (req, res) => {
//   try {
//     // read wildcard captured by regex route as req.params[0]
//     const wildcard = req.params && typeof req.params[0] === "string" ? req.params[0] : "";
//     const segments = String(wildcard).split("/").filter(Boolean).map(s => s.trim().toLowerCase());
//     if (segments.length === 0) return res.status(400).json({ message: "No slug provided" });

//     // prefer direct full_path lookup
//     const fullPath = segments.join("/");
//     let topic = await Topic.getTopicByFullPath(fullPath);

//     // fallback to segment-walk if needed
//     if (!topic) topic = await Topic.getTopicBySlugPath(segments);

//     if (!topic) return res.status(404).json({ message: "Topic not found" });

//     const payload = buildContentPayload(req.body);
//     payload.topic_id = topic.id;

//     // IMPORTANT: createBlock should return { id, existed }
//     const result = await ContentBlock.createBlock(payload);

//     if (result && result.existed) {
//       return res.status(409).json({ message: "Duplicate content", id: result.id });
//     }

//     return res.status(201).json({ id: result.id, message: "Content block created" });
//   } catch (err) {
//     console.error("addContentBySlug error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// };

// /**
//  * Helper: normalize body into the createBlock payload shape expected by contentBlockModel.createBlock
//  * Accepts flexible fields from client and maps them.
//  */
// function buildContentPayload(body = {}) {
//   // default values
//   const payload = {
//     block_type: body.block_type || "text",
//     title: body.title || null,
//     // accept subtitle1..4 or subtitle array/obj
//     subtitle1: body.subtitle1 ?? null,
//     subtitle2: body.subtitle2 ?? null,
//     subtitle3: body.subtitle3 ?? null,
//     subtitle4: body.subtitle4 ?? null,
//     text1: body.text1 ?? body.body ?? null,
//     text2: body.text2 ?? null,
//     text3: body.text3 ?? null,
//     text4: body.text4 ?? null,
//     text_style: body.text_style || null,
//     code_snippets: body.code_snippets || null,         // expect array of {language,title,code_text}
//     links: body.links || null,                         // expect array of {text, href}
//     example_boxes: body.example_boxes || body.examples || null,
//     note_boxes: body.note_boxes || null,
//     practice_links: body.practice_links || null,
//     mcq_ref: body.mcq_ref || null,
//     block_order: Number.isFinite(Number(body.block_order)) ? Number(body.block_order) : 0,
//     metadata: body.metadata || null
//   };
//   return payload;
// }



// // // src/controllers/topicContentController.js
// // import * as Topic from "../models/topicModel.js";
// // import * as ContentBlock from "../models/contentBlockModel.js";

// // /**
// //  * Add content by topic id:
// //  * POST /api/topics/:id/content
// //  */
// // export const addContentByTopicId = async (req, res) => {
// //   try {
// //     const topicId = Number(req.params.id);
// //     if (!topicId || Number.isNaN(topicId)) return res.status(400).json({ message: "Invalid topic id" });

// //     const topic = await Topic.getTopicById(topicId);
// //     if (!topic) return res.status(404).json({ message: "Topic not found" });

// //     const payload = buildContentPayload(req.body);
// //     payload.topic_id = topicId;

// //     const id = await ContentBlock.createBlock(payload);
// //     return res.status(201).json({ id, message: "Content block created" });
// //   } catch (err) {
// //     console.error("addContentByTopicId error:", err);
// //     return res.status(500).json({ message: "Server error" });
// //   }
// // };

// // /**
// //  * Add content by slug path:
// //  * POST /api/topics/slug/<wildcard>/content
// //  * (router will supply wildcard as req.params[0])
// //  */
// // export const addContentBySlug = async (req, res) => {
// //   try {
// //     // read wildcard captured by regex route as req.params[0]
// //     const wildcard = req.params && typeof req.params[0] === "string" ? req.params[0] : "";
// //     const segments = String(wildcard).split("/").filter(Boolean).map(s => s.trim().toLowerCase());
// //     if (segments.length === 0) return res.status(400).json({ message: "No slug provided" });

// //     // prefer direct full_path lookup
// //     const fullPath = segments.join("/");
// //     let topic = await Topic.getTopicByFullPath(fullPath);

// //     // fallback to segment-walk if needed
// //     if (!topic) topic = await Topic.getTopicBySlugPath(segments);

// //     if (!topic) return res.status(404).json({ message: "Topic not found" });

// //     const payload = buildContentPayload(req.body);
// //     payload.topic_id = topic.id;

// //     const id = await ContentBlock.createBlock(payload);
// //     return res.status(201).json({ id, message: "Content block created" });
// //   } catch (err) {
// //     console.error("addContentBySlug error:", err);
// //     return res.status(500).json({ message: "Server error" });
// //   }
// // };

// // /**
// //  * Helper: normalize body into the createBlock payload shape expected by contentBlockModel.createBlock
// //  * Accepts flexible fields from client and maps them.
// //  */
// // function buildContentPayload(body = {}) {
// //   // default values
// //   const payload = {
// //     block_type: body.block_type || "text",
// //     title: body.title || null,
// //     // accept subtitle1..4 or subtitle array/obj
// //     subtitle1: body.subtitle1 ?? null,
// //     subtitle2: body.subtitle2 ?? null,
// //     subtitle3: body.subtitle3 ?? null,
// //     subtitle4: body.subtitle4 ?? null,
// //     text1: body.text1 ?? body.body ?? null,
// //     text2: body.text2 ?? null,
// //     text3: body.text3 ?? null,
// //     text4: body.text4 ?? null,
// //     text_style: body.text_style || null,
// //     code_snippets: body.code_snippets || null,         // expect array of {language,title,code_text}
// //     links: body.links || null,                         // expect array of {text, href}
// //     example_boxes: body.example_boxes || body.examples || null,
// //     note_boxes: body.note_boxes || null,
// //     practice_links: body.practice_links || null,
// //     mcq_ref: body.mcq_ref || null,
// //     block_order: Number.isFinite(Number(body.block_order)) ? Number(body.block_order) : 0,
// //     metadata: body.metadata || null
// //   };
// //   return payload;
// // }
