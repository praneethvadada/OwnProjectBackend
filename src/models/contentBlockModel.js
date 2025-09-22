// src/models/contentBlockModel.js
import db from "../config/db.js";
import crypto from "crypto";

/**
 * safeParse - robustly parse a value that *may* be JSON.
 * - If val is null/undefined -> returns null
 * - If val is already an object/array -> returns it
 * - If val is a string starting with { or [ -> try JSON.parse, otherwise return the original string
 * - Otherwise return the original value
 */
function safeParse(val) {
  if (val === null || typeof val === "undefined") return null;

  // Already parsed object/array
  if (typeof val === "object") return val;

  if (typeof val === "string") {
    const s = val.trim();
    if (s === "") return null;
    const first = s[0];
    if (first === "{" || first === "[") {
      try {
        return JSON.parse(s);
      } catch (e) {
        // invalid JSON string (e.g. "[object Object]") — return original string to avoid throwing
        return s;
      }
    }
    // not JSON — return raw string
    return s;
  }

  // other primitive types
  return val;
}

/**
 * stableStringify - deterministic stringifier for objects/arrays used when computing content hashes.
 * Guarantees same output for objects with same keys regardless of insertion order.
 */
// function stableStringify(obj) {
//   if (obj === null || typeof obj === "undefined") return "";
//   if (typeof obj === "string") return obj.trim();
//   if (typeof obj === "number" || typeof obj === "boolean") return String(obj);

//   if (Array.isArray(obj)) {
//     // map each element through stableStringify
//     return `[${obj.map((el) => stableStringify(el)).join(",")}]`;
//   }

//   if (typeof obj === "object") {
//     const keys = Object.keys(obj).sort();
//     const parts = keys.map((k) => `${k}:${stableStringify(obj[k])}`);
//     return `{${parts.join(",")}}`;
//   }

//   // fallback
//   return String(obj);
// }

// /**
//  * computeContentHashFromComponents
//  * - components: array or value (we normalize to array)
//  * - returns hex SHA-256
//  */
// function computeContentHashFromComponents(components) {
//   const normalized = stableStringify(components || []);
//   return crypto.createHash("sha256").update(normalized).digest("hex");
// }




function stableStringify(obj) {
  if (obj === null || obj === undefined) return "";
  if (typeof obj === "string") return obj.trim();
  if (typeof obj === "object") {
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map(k => `${k}:${stableStringify(obj[k])}`).join(",")}}`;
  }
  return String(obj);
}
function computeContentHashFromComponents(components) {
  return crypto.createHash("sha256").update(stableStringify(components || [])).digest("hex");
}



/**
 * createBlock(payload)
 * - payload: { topic_id, block_type, components (array), block_order, metadata }
 * - Returns: { id, existed } where existed=true if duplicate was detected (via content_hash)
 */
export const createBlock = async (payload) => {
  const {
    topic_id,
    block_type = "page",
    components = null,
    block_order = 0,
    metadata = null
  } = payload;

  // Normalize components: prefer array; if passed as string, try to parse
  let comps = null;
  if (components === null || typeof components === "undefined") {
    comps = null;
  } else if (typeof components === "string") {
    try {
      comps = JSON.parse(components);
    } catch (e) {
      // if it's a plain string, store as a single paragraph component
      comps = [{ type: "paragraph", text: components }];
    }
  } else {
    comps = components;
  }

  const componentsJson = comps ? JSON.stringify(comps) : null;
  const contentHash = computeContentHashFromComponents(comps || []);

  try {
    const [res] = await db.query(
      `INSERT INTO content_blocks
        (topic_id, block_type, components, block_order, metadata, content_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        topic_id,
        block_type,
        componentsJson,
        block_order,
        metadata ? JSON.stringify(metadata) : null,
        contentHash
      ]
    );

    return { id: res.insertId, existed: false };
  } catch (err) {
    // handle duplicate (unique index on topic_id + content_hash)
    if (err && err.code === "ER_DUP_ENTRY") {
      const [rows] = await db.query(
        "SELECT id FROM content_blocks WHERE topic_id = ? AND content_hash = ? LIMIT 1",
        [topic_id, contentHash]
      );
      if (rows && rows.length > 0) return { id: rows[0].id, existed: true };
    }
    throw err;
  }
};

/**
 * getBlocksByTopic(topic_id)
 * - returns array of content block objects with safely parsed JSON fields
 */
export const getBlocksByTopic = async (topic_id) => {
  const [rows] = await db.query(
    `SELECT id, topic_id, block_type, components, block_order, metadata, created_at, updated_at
     FROM content_blocks
     WHERE topic_id = ?
     ORDER BY block_order, created_at`,
    [topic_id]
  );

  return rows.map((r) => ({
    id: r.id,
    topic_id: r.topic_id,
    block_type: r.block_type,
    components: safeParse(r.components),
    block_order: r.block_order,
    metadata: safeParse(r.metadata),
    created_at: r.created_at,
    updated_at: r.updated_at
  }));
};


export const getBlockById = async (id) => {
  const [rows] = await db.query(
    `SELECT id, topic_id, block_type, components, block_order, metadata, created_at, updated_at
     FROM content_blocks WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    topic_id: r.topic_id,
    block_type: r.block_type,
    components: r.components ? JSON.parse(r.components) : null,
    block_order: r.block_order,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
};

// --- update block by id ---
export const updateBlockById = async (id, payload) => {
  // allowed updatable columns: block_type, components, block_order, metadata, title (if you keep title column), etc.
  // We will accept a flexible payload and map/serialize JSON fields.
  const allowed = ["block_type", "block_order", "metadata", "components", "title"];
  const setParts = [];
  const vals = [];

  if (!payload || typeof payload !== "object") throw new Error("Invalid payload");

  if (Object.prototype.hasOwnProperty.call(payload, "components")) {
    vals.push(JSON.stringify(payload.components));
    setParts.push("components = ?");
    // recompute content_hash if components change
    const hash = computeContentHashFromComponents(payload.components);
    vals.push(hash);
    setParts.push("content_hash = ?");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "block_type")) {
    vals.push(payload.block_type);
    setParts.push("block_type = ?");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "block_order")) {
    vals.push(Number.isFinite(Number(payload.block_order)) ? Number(payload.block_order) : 0);
    setParts.push("block_order = ?");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "metadata")) {
    vals.push(JSON.stringify(payload.metadata));
    setParts.push("metadata = ?");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "title")) {
    vals.push(payload.title);
    setParts.push("title = ?");
  }

  if (setParts.length === 0) return 0; // nothing to update

  vals.push(id); // where id = ?

  const sql = `UPDATE content_blocks SET ${setParts.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  const [res] = await db.query(sql, vals);
  return res.affectedRows;
};

// --- delete block by id ---
export const deleteBlockById = async (id) => {
  const [res] = await db.query("DELETE FROM content_blocks WHERE id = ?", [id]);
  return res.affectedRows;
};


// export const updateBlockById = async (id, payload) => {
//   // allowed updatable columns: block_type, components, block_order, metadata, title (if you keep title column), etc.
//   // We will accept a flexible payload and map/serialize JSON fields.
//   const allowed = ["block_type", "block_order", "metadata", "components", "title"];
//   const setParts = [];
//   const vals = [];

//   if (!payload || typeof payload !== "object") throw new Error("Invalid payload");

//   if (Object.prototype.hasOwnProperty.call(payload, "components")) {
//     vals.push(JSON.stringify(payload.components));
//     setParts.push("components = ?");
//     // recompute content_hash if components change
//     const hash = computeContentHashFromComponents(payload.components);
//     vals.push(hash);
//     setParts.push("content_hash = ?");
//   }

//   if (Object.prototype.hasOwnProperty.call(payload, "block_type")) {
//     vals.push(payload.block_type);
//     setParts.push("block_type = ?");
//   }

//   if (Object.prototype.hasOwnProperty.call(payload, "block_order")) {
//     vals.push(Number.isFinite(Number(payload.block_order)) ? Number(payload.block_order) : 0);
//     setParts.push("block_order = ?");
//   }

//   if (Object.prototype.hasOwnProperty.call(payload, "metadata")) {
//     vals.push(JSON.stringify(payload.metadata));
//     setParts.push("metadata = ?");
//   }

//   if (Object.prototype.hasOwnProperty.call(payload, "title")) {
//     vals.push(payload.title);
//     setParts.push("title = ?");
//   }

//   if (setParts.length === 0) return 0; // nothing to update

//   vals.push(id); // where id = ?

//   const sql = `UPDATE content_blocks SET ${setParts.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
//   const [res] = await db.query(sql, vals);
//   return res.affectedRows;
// };

// // --- delete block by id ---
// export const deleteBlockById = async (id) => {
//   const [res] = await db.query("DELETE FROM content_blocks WHERE id = ?", [id]);
//   return res.affectedRows;
// };





// // src/models/contentBlockModel.js
// import db from "../config/db.js";
// import crypto from "crypto";

// function stableStringify(obj) {
//   if (obj === null || obj === undefined) return "";
//   if (typeof obj === "string") return obj.trim();
//   if (typeof obj === "object") {
//     if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
//     const keys = Object.keys(obj).sort();
//     return `{${keys.map(k => `${k}:${stableStringify(obj[k])}`).join(",")}}`;
//   }
//   return String(obj);
// }

// function computeContentHashFromComponents(components) {
//   return crypto.createHash("sha256").update(stableStringify(components)).digest("hex");
// }

// export const createBlock = async (payload) => {
//   const {
//     topic_id,
//     block_type = "page",
//     components = null,
//     block_order = 0,
//     metadata = null
//   } = payload;

//   // components should be an array; normalize to JSON string
//   const componentsJson = components ? JSON.stringify(components) : null;
//   // compute content hash deterministically (prefer using components)
//   const contentHash = computeContentHashFromComponents(components || []);

//   try {
//     const [res] = await db.query(
//       `INSERT INTO content_blocks
//       (topic_id, block_type, components, block_order, metadata, content_hash)
//       VALUES (?, ?, ?, ?, ?, ?)`,
//       [topic_id, block_type, componentsJson, block_order, metadata ? JSON.stringify(metadata) : null, contentHash]
//     );
//     return { id: res.insertId, existed: false };
//   } catch (err) {
//     if (err && err.code === "ER_DUP_ENTRY") {
//       const [rows] = await db.query(
//         "SELECT id FROM content_blocks WHERE topic_id = ? AND content_hash = ? LIMIT 1",
//         [topic_id, contentHash]
//       );
//       if (rows && rows.length > 0) return { id: rows[0].id, existed: true };
//     }
//     throw err;
//   }
// };

// export const getBlocksByTopic = async (topic_id) => {
//   const [rows] = await db.query(
//     `SELECT id, topic_id, block_type, components, block_order, metadata, created_at, updated_at
//      FROM content_blocks
//      WHERE topic_id = ?
//      ORDER BY block_order, created_at`,
//     [topic_id]
//   );

//   return rows.map(r => ({
//     id: r.id,
//     topic_id: r.topic_id,
//     block_type: r.block_type,
//     components: r.components ? JSON.parse(r.components) : null,
//     block_order: r.block_order,
//     metadata: r.metadata ? JSON.parse(r.metadata) : null,
//     created_at: r.created_at,
//     updated_at: r.updated_at
//   }));
// };



// // // src/models/contentBlockModel.js
// // import db from "../config/db.js";
// // import crypto from "crypto";

// // /* ---------- Helpers ---------- */

// // function safeParse(val) {
// //   if (val === null || typeof val === "undefined") return null;
// //   if (typeof val === "string") {
// //     try { return JSON.parse(val); } catch (e) { return val; }
// //   }
// //   return val;
// // }

// // function stableStringify(obj) {
// //   if (obj === null || obj === undefined) return "";
// //   if (typeof obj === "string") return obj.trim();
// //   if (typeof obj === "object") {
// //     if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
// //     const keys = Object.keys(obj).sort();
// //     return `{${keys.map(k=>`${k}:${stableStringify(obj[k])}`).join(",")}}`;
// //   }
// //   return String(obj);
// // }

// // function computeContentHash(payload) {
// //   const p = {
// //     block_type: payload.block_type || "text",
// //     title: payload.title || "",
// //     subtitles: {
// //       subtitle1: payload.subtitle1 ?? null,
// //       subtitle2: payload.subtitle2 ?? null,
// //       subtitle3: payload.subtitle3 ?? null,
// //       subtitle4: payload.subtitle4 ?? null
// //     },
// //     texts: {
// //       text1: payload.text1 ?? null,
// //       text2: payload.text2 ?? null,
// //       text3: payload.text3 ?? null,
// //       text4: payload.text4 ?? null
// //     },
// //     code_snippets: payload.code_snippets || null,
// //     links: payload.links || null,
// //     example_boxes: payload.example_boxes || null,
// //     note_boxes: payload.note_boxes || null
// //   };
// //   const normalized = stableStringify(p);
// //   return crypto.createHash("sha256").update(normalized).digest("hex");
// // }

// // /* ---------- Exports: createBlock, getBlocksByTopic ---------- */

// // /**
// //  * createBlock(payload)
// //  * returns { id, existed } — existed=true when duplicate detected
// //  */
// // export const createBlock = async (payload) => {
// //   const {
// //     topic_id,
// //     block_type = "text",
// //     title = null,
// //     subtitle1 = null, subtitle2 = null, subtitle3 = null, subtitle4 = null,
// //     text1 = null, text2 = null, text3 = null, text4 = null,
// //     text_style = null,
// //     code_snippets = null, links = null,
// //     example_boxes = null, note_boxes = null,
// //     practice_links = null, mcq_ref = null,
// //     block_order = 0,
// //     metadata = null
// //   } = payload;

// //   const subtitlePacked = JSON.stringify({ subtitle1, subtitle2, subtitle3, subtitle4 });
// //   const textPacked = JSON.stringify({ text1, text2, text3, text4 });

// //   const hashPayload = {
// //     block_type, title, subtitle1, subtitle2, subtitle3, subtitle4,
// //     text1, text2, text3, text4, code_snippets, links, example_boxes, note_boxes
// //   };
// //   const contentHash = computeContentHash(hashPayload);

// //   try {
// //     const [res] = await db.query(
// //       `INSERT INTO content_blocks
// //       (topic_id, block_type, title, subtitle, text, text_style, carousel_images, code_snippets, links, example_meta, note_meta, mcq_ref, practice_links, block_order, metadata, content_hash)
// //       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
// //       [
// //         topic_id, block_type, title, subtitlePacked, textPacked, text_style,
// //         null,
// //         code_snippets ? JSON.stringify(code_snippets) : null,
// //         links ? JSON.stringify(links) : null,
// //         example_boxes ? JSON.stringify(example_boxes) : null,
// //         note_boxes ? JSON.stringify(note_boxes) : null,
// //         mcq_ref,
// //         practice_links ? JSON.stringify(practice_links) : null,
// //         block_order,
// //         metadata ? JSON.stringify(metadata) : null,
// //         contentHash
// //       ]
// //     );
// //     return { id: res.insertId, existed: false };
// //   } catch (err) {
// //     if (err && err.code === "ER_DUP_ENTRY") {
// //       // find existing id and return it
// //       const [rows] = await db.query("SELECT id FROM content_blocks WHERE topic_id = ? AND content_hash = ? LIMIT 1", [topic_id, contentHash]);
// //       if (rows && rows.length > 0) return { id: rows[0].id, existed: true };
// //     }
// //     throw err;
// //   }
// // };

// // /**
// //  * getBlocksByTopic(topic_id)
// //  * returns an array of blocks with parsed JSON fields
// //  */
// // export const getBlocksByTopic = async (topic_id) => {
// //   const [rows] = await db.query(
// //     `SELECT id, topic_id, block_type, title, subtitle, text, text_style, image, image_mime, carousel_images,
// //             code_snippets, links, example_meta, note_meta, mcq_ref, practice_links, block_order, metadata, created_at, updated_at
// //      FROM content_blocks
// //      WHERE topic_id = ?
// //      ORDER BY block_order, created_at`,
// //     [topic_id]
// //   );

// //   return rows.map(r => ({
// //     id: r.id,
// //     topic_id: r.topic_id,
// //     block_type: r.block_type,
// //     title: r.title,
// //     subtitle: safeParse(r.subtitle),
// //     text: safeParse(r.text),
// //     text_style: r.text_style,
// //     image: r.image,
// //     image_mime: r.image_mime,
// //     carousel_images: safeParse(r.carousel_images),
// //     code_snippets: safeParse(r.code_snippets),
// //     links: safeParse(r.links),
// //     example_meta: safeParse(r.example_meta),
// //     note_meta: safeParse(r.note_meta),
// //     mcq_ref: r.mcq_ref,
// //     practice_links: safeParse(r.practice_links),
// //     block_order: r.block_order,
// //     metadata: safeParse(r.metadata),
// //     created_at: r.created_at,
// //     updated_at: r.updated_at
// //   }));
// // };



// // // // src/models/contentBlockModel.js
// // // import db from "../config/db.js";
// // // import crypto from "crypto";

// // // function stableStringify(obj) {
// // //   if (obj === null || obj === undefined) return "";
// // //   if (typeof obj === "string") return obj.trim();
// // //   if (typeof obj === "object") {
// // //     if (Array.isArray(obj)) {
// // //       return `[${obj.map(stableStringify).join(",")}]`;
// // //     } else {
// // //       const keys = Object.keys(obj).sort();
// // //       return `{${keys.map(k => `${k}:${stableStringify(obj[k])}`).join(",")}}`;
// // //     }
// // //   }
// // //   return String(obj);
// // // }

// // // function computeContentHash(payload) {
// // //   const p = {
// // //     block_type: payload.block_type || "text",
// // //     title: payload.title || "",
// // //     subtitles: {
// // //       subtitle1: payload.subtitle1 ?? null,
// // //       subtitle2: payload.subtitle2 ?? null,
// // //       subtitle3: payload.subtitle3 ?? null,
// // //       subtitle4: payload.subtitle4 ?? null
// // //     },
// // //     texts: {
// // //       text1: payload.text1 ?? null,
// // //       text2: payload.text2 ?? null,
// // //       text3: payload.text3 ?? null,
// // //       text4: payload.text4 ?? null
// // //     },
// // //     code_snippets: payload.code_snippets || null,
// // //     links: payload.links || null,
// // //     example_boxes: payload.example_boxes || null,
// // //     note_boxes: payload.note_boxes || null
// // //   };
// // //   const normalized = stableStringify(p);
// // //   return crypto.createHash("sha256").update(normalized).digest("hex");
// // // }

// // // /**
// // //  * createBlock(payload) -> returns { id, existed: boolean }
// // //  * Ensures content_hash is inserted; if a unique constraint triggers, returns existing id and existed=true.
// // //  */
// // // export const createBlock = async (payload) => {
// // //   const {
// // //     topic_id,
// // //     block_type = "text",
// // //     title = null,
// // //     subtitle1 = null, subtitle2 = null, subtitle3 = null, subtitle4 = null,
// // //     text1 = null, text2 = null, text3 = null, text4 = null,
// // //     text_style = null,
// // //     code_snippets = null, links = null,
// // //     example_boxes = null, note_boxes = null,
// // //     practice_links = null, mcq_ref = null,
// // //     block_order = 0,
// // //     metadata = null
// // //   } = payload;

// // //   const subtitlePacked = JSON.stringify({ subtitle1, subtitle2, subtitle3, subtitle4 });
// // //   const textPacked = JSON.stringify({ text1, text2, text3, text4 });

// // //   // compute content hash deterministically
// // //   const contentHash = computeContentHash({
// // //     block_type, title, subtitle1, subtitle2, subtitle3, subtitle4,
// // //     text1, text2, text3, text4, code_snippets, links, example_boxes, note_boxes
// // //   });

// // //   try {
// // //     const [res] = await db.query(
// // //       `INSERT INTO content_blocks
// // //       (topic_id, block_type, title, subtitle, text, text_style, carousel_images, code_snippets, links, example_meta, note_meta, mcq_ref, practice_links, block_order, metadata, content_hash)
// // //       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
// // //       [
// // //         topic_id, block_type, title, subtitlePacked, textPacked, text_style,
// // //         null,
// // //         code_snippets ? JSON.stringify(code_snippets) : null,
// // //         links ? JSON.stringify(links) : null,
// // //         example_boxes ? JSON.stringify(example_boxes) : null,
// // //         note_boxes ? JSON.stringify(note_boxes) : null,
// // //         mcq_ref,
// // //         practice_links ? JSON.stringify(practice_links) : null,
// // //         block_order,
// // //         metadata ? JSON.stringify(metadata) : null,
// // //         contentHash
// // //       ]
// // //     );
// // //     return { id: res.insertId, existed: false };
// // //   } catch (err) {
// // //     if (err && err.code === "ER_DUP_ENTRY") {
// // //       // find and return existing id
// // //       const [rows] = await db.query("SELECT id FROM content_blocks WHERE topic_id = ? AND content_hash = ? LIMIT 1", [topic_id, contentHash]);
// // //       if (rows && rows.length > 0) return { id: rows[0].id, existed: true };
// // //     }
// // //     throw err;
// // //   }
// // // };


// // // // // src/models/contentBlockModel.js (createBlock excerpt)
// // // // import db from "../config/db.js";

// // // // export const createBlock = async (payload) => {
// // // //   const {
// // // //     topic_id,
// // // //     block_type = "text",
// // // //     title = null,
// // // //     subtitle1 = null, subtitle2 = null, subtitle3 = null, subtitle4 = null,
// // // //     text1 = null, text2 = null, text3 = null, text4 = null,
// // // //     text_style = null,
// // // //     code_snippets = null, links = null,
// // // //     example_boxes = null, note_boxes = null,
// // // //     practice_links = null, mcq_ref = null,
// // // //     block_order = 0,
// // // //     metadata = null
// // // //   } = payload;

// // // //   const subtitlePacked = JSON.stringify({ subtitle1, subtitle2, subtitle3, subtitle4 });
// // // //   const textPacked = JSON.stringify({ text1, text2, text3, text4 });

// // // //   const [res] = await db.query(
// // // //     `INSERT INTO content_blocks
// // // //      (topic_id, block_type, title, subtitle, text, text_style, carousel_images, code_snippets, links, example_meta, note_meta, mcq_ref, practice_links, block_order, metadata)
// // // //      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
// // // //     [
// // // //       topic_id, block_type, title, subtitlePacked, textPacked, text_style,
// // // //       null,
// // // //       code_snippets ? JSON.stringify(code_snippets) : null,
// // // //       links ? JSON.stringify(links) : null,
// // // //       example_boxes ? JSON.stringify(example_boxes) : null,
// // // //       note_boxes ? JSON.stringify(note_boxes) : null,
// // // //       mcq_ref,
// // // //       practice_links ? JSON.stringify(practice_links) : null,
// // // //       block_order,
// // // //       metadata ? JSON.stringify(metadata) : null
// // // //     ]
// // // //   );
// // // //   return res.insertId;
// // // // };



// // // // // // src/models/contentBlockModel.js
// // // // // import db from "../config/db.js";

// // // // // /**
// // // // //  * Insert a content block. Payload fields that are objects/arrays will be stringified before insert.
// // // // //  * Adjust/extend fields as needed.
// // // // //  */
// // // // // export const createBlock = async (payload) => {
// // // // //   const {
// // // // //     topic_id,
// // // // //     block_type,
// // // // //     title = null,
// // // // //     subtitle1 = null,
// // // // //     subtitle2 = null,
// // // // //     subtitle3 = null,
// // // // //     subtitle4 = null,
// // // // //     text1 = null,
// // // // //     text2 = null,
// // // // //     text3 = null,
// // // // //     text4 = null,
// // // // //     text_style = null,
// // // // //     code_snippets = null,
// // // // //     links = null,
// // // // //     example_boxes = null,
// // // // //     note_boxes = null,
// // // // //     practice_links = null,
// // // // //     mcq_ref = null,
// // // // //     block_order = 0,
// // // // //     metadata = null
// // // // //   } = payload;

// // // // //   const subtitlePacked = JSON.stringify({ subtitle1, subtitle2, subtitle3, subtitle4 });
// // // // //   const textPacked = JSON.stringify({ text1, text2, text3, text4 });

// // // // //   const [res] = await db.query(
// // // // //     `INSERT INTO content_blocks
// // // // //     (topic_id, block_type, title, subtitle, text, text_style, carousel_images, code_snippets, links, example_meta, note_meta, mcq_ref, practice_links, block_order, metadata)
// // // // //     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
// // // // //     [
// // // // //       topic_id,
// // // // //       block_type,
// // // // //       title,
// // // // //       subtitlePacked,
// // // // //       textPacked,
// // // // //       text_style,
// // // // //       null, // carousel_images not used for now
// // // // //       code_snippets ? JSON.stringify(code_snippets) : null,
// // // // //       links ? JSON.stringify(links) : null,
// // // // //       example_boxes ? JSON.stringify(example_boxes) : null,
// // // // //       note_boxes ? JSON.stringify(note_boxes) : null,
// // // // //       mcq_ref,
// // // // //       practice_links ? JSON.stringify(practice_links) : null,
// // // // //       block_order,
// // // // //       metadata ? JSON.stringify(metadata) : null
// // // // //     ]
// // // // //   );

// // // // //   return res.insertId;
// // // // // };

// // // // // /**
// // // // //  * Safe JSON parser: if `val` is null => null, if string => JSON.parse, if object => return as-is.
// // // // //  */
// // // // // function safeParse(val) {
// // // // //   if (val === null || typeof val === "undefined") return null;
// // // // //   if (typeof val === "string") {
// // // // //     // Try parse, but fallback to raw string on error
// // // // //     try {
// // // // //       return JSON.parse(val);
// // // // //     } catch (e) {
// // // // //       return val;
// // // // //     }
// // // // //   }
// // // // //   // already an object/array/number => return as-is
// // // // //   return val;
// // // // // }

// // // // // /**
// // // // //  * Fetch content blocks by topic_id and safely convert JSON-like columns.
// // // // //  */
// // // // // export const getBlocksByTopic = async (topic_id) => {
// // // // //   const [rows] = await db.query("SELECT * FROM content_blocks WHERE topic_id = ? ORDER BY block_order, created_at", [topic_id]);

// // // // //   return rows.map(r => ({
// // // // //     id: r.id,
// // // // //     topic_id: r.topic_id,
// // // // //     block_type: r.block_type,
// // // // //     title: r.title,
// // // // //     subtitle: safeParse(r.subtitle),            // previously JSON stored
// // // // //     text: safeParse(r.text),                    // previously JSON stored
// // // // //     text_style: r.text_style,
// // // // //     image: r.image,
// // // // //     image_mime: r.image_mime,
// // // // //     carousel_images: safeParse(r.carousel_images),
// // // // //     code_snippets: safeParse(r.code_snippets),
// // // // //     links: safeParse(r.links),
// // // // //     example_meta: safeParse(r.example_meta),
// // // // //     note_meta: safeParse(r.note_meta),
// // // // //     mcq_ref: r.mcq_ref,
// // // // //     practice_links: safeParse(r.practice_links),
// // // // //     block_order: r.block_order,
// // // // //     metadata: safeParse(r.metadata),
// // // // //     created_at: r.created_at,
// // // // //     updated_at: r.updated_at
// // // // //   }));
// // // // // };


// // // // // // // src/models/contentBlockModel.js
// // // // // // import db from "../config/db.js";

// // // // // // export const createBlock = async (payload) => {
// // // // // //   const {
// // // // // //     topic_id,
// // // // // //     block_type,
// // // // // //     title = null,
// // // // // //     subtitle1 = null,
// // // // // //     subtitle2 = null,
// // // // // //     subtitle3 = null,
// // // // // //     subtitle4 = null,
// // // // // //     text1 = null,
// // // // // //     text2 = null,
// // // // // //     text3 = null,
// // // // // //     text4 = null,
// // // // // //     text_style = null,
// // // // // //     // code_snippets is expected as an array of { language, title, code_text }
// // // // // //     code_snippets = null,
// // // // // //     // links: array of { text, href }
// // // // // //     links = null,
// // // // // //     // example boxes and note boxes as array of objects
// // // // // //     example_boxes = null,
// // // // // //     note_boxes = null,
// // // // // //     // practice links: array of { platform, url, title }
// // // // // //     practice_links = null,
// // // // // //     mcq_ref = null,
// // // // // //     block_order = 0,
// // // // // //     metadata = null
// // // // // //   } = payload;

// // // // // //   const [res] = await db.query(
// // // // // //     `INSERT INTO content_blocks
// // // // // //     (topic_id, block_type, title, subtitle, text, text_style, carousel_images, code_snippets, links, example_meta, note_meta, mcq_ref, practice_links, block_order, metadata)
// // // // // //     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
// // // // // //     [
// // // // // //       topic_id,
// // // // // //       block_type,
// // // // // //       title,
// // // // // //       // storing subtitles together (we'll pack them as JSON into 'subtitle' column) OR you can modify DB
// // // // // //       JSON.stringify({ subtitle1, subtitle2, subtitle3, subtitle4 }),
// // // // // //       JSON.stringify({ text1, text2, text3, text4 }),
// // // // // //       text_style,
// // // // // //       null, // carousel_images (not used now)
// // // // // //       JSON.stringify(code_snippets || null),
// // // // // //       JSON.stringify(links || null),
// // // // // //       JSON.stringify(example_boxes || null),
// // // // // //       JSON.stringify(note_boxes || null),
// // // // // //       mcq_ref,
// // // // // //       JSON.stringify(practice_links || null),
// // // // // //       block_order,
// // // // // //       JSON.stringify(metadata || null)
// // // // // //     ]
// // // // // //   );

// // // // // //   return res.insertId;
// // // // // // };

// // // // // // export const getBlocksByTopic = async (topic_id) => {
// // // // // //   const [rows] = await db.query("SELECT * FROM content_blocks WHERE topic_id = ? ORDER BY block_order, created_at", [topic_id]);
// // // // // //   return rows.map(r => ({
// // // // // //     ...r,
// // // // // //     subtitle: r.subtitle ? JSON.parse(r.subtitle) : null,
// // // // // //     text: r.text ? JSON.parse(r.text) : null,
// // // // // //     code_snippets: r.code_snippets ? JSON.parse(r.code_snippets) : null,
// // // // // //     links: r.links ? JSON.parse(r.links) : null,
// // // // // //     example_meta: r.example_meta ? JSON.parse(r.example_meta) : null,
// // // // // //     note_meta: r.note_meta ? JSON.parse(r.note_meta) : null,
// // // // // //     practice_links: r.practice_links ? JSON.parse(r.practice_links) : null,
// // // // // //     metadata: r.metadata ? JSON.parse(r.metadata) : null
// // // // // //   }));
// // // // // // };

// // // // // // export const updateBlockById = async (id, fields) => {
// // // // // //   const set = [];
// // // // // //   const vals = [];
// // // // // //   for (const [k,v] of Object.entries(fields)) {
// // // // // //     set.push(`${k} = ?`);
// // // // // //     // If passing objects (links, code_snippets), stringify before sending
// // // // // //     vals.push(typeof v === "object" && v !== null ? JSON.stringify(v) : v);
// // // // // //   }
// // // // // //   vals.push(id);
// // // // // //   const [res] = await db.query(`UPDATE content_blocks SET ${set.join(", ")} WHERE id = ?`, vals);
// // // // // //   return res.affectedRows;
// // // // // // };

// // // // // // export const deleteBlockById = async (id) => {
// // // // // //   const [res] = await db.query("DELETE FROM content_blocks WHERE id = ?", [id]);
// // // // // //   return res.affectedRows;
// // // // // // };