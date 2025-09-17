// src/models/contentBlockModel.js
import db from "../config/db.js";

/**
 * Insert a content block. Payload fields that are objects/arrays will be stringified before insert.
 * Adjust/extend fields as needed.
 */
export const createBlock = async (payload) => {
  const {
    topic_id,
    block_type,
    title = null,
    subtitle1 = null,
    subtitle2 = null,
    subtitle3 = null,
    subtitle4 = null,
    text1 = null,
    text2 = null,
    text3 = null,
    text4 = null,
    text_style = null,
    code_snippets = null,
    links = null,
    example_boxes = null,
    note_boxes = null,
    practice_links = null,
    mcq_ref = null,
    block_order = 0,
    metadata = null
  } = payload;

  const subtitlePacked = JSON.stringify({ subtitle1, subtitle2, subtitle3, subtitle4 });
  const textPacked = JSON.stringify({ text1, text2, text3, text4 });

  const [res] = await db.query(
    `INSERT INTO content_blocks
    (topic_id, block_type, title, subtitle, text, text_style, carousel_images, code_snippets, links, example_meta, note_meta, mcq_ref, practice_links, block_order, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      topic_id,
      block_type,
      title,
      subtitlePacked,
      textPacked,
      text_style,
      null, // carousel_images not used for now
      code_snippets ? JSON.stringify(code_snippets) : null,
      links ? JSON.stringify(links) : null,
      example_boxes ? JSON.stringify(example_boxes) : null,
      note_boxes ? JSON.stringify(note_boxes) : null,
      mcq_ref,
      practice_links ? JSON.stringify(practice_links) : null,
      block_order,
      metadata ? JSON.stringify(metadata) : null
    ]
  );

  return res.insertId;
};

/**
 * Safe JSON parser: if `val` is null => null, if string => JSON.parse, if object => return as-is.
 */
function safeParse(val) {
  if (val === null || typeof val === "undefined") return null;
  if (typeof val === "string") {
    // Try parse, but fallback to raw string on error
    try {
      return JSON.parse(val);
    } catch (e) {
      return val;
    }
  }
  // already an object/array/number => return as-is
  return val;
}

/**
 * Fetch content blocks by topic_id and safely convert JSON-like columns.
 */
export const getBlocksByTopic = async (topic_id) => {
  const [rows] = await db.query("SELECT * FROM content_blocks WHERE topic_id = ? ORDER BY block_order, created_at", [topic_id]);

  return rows.map(r => ({
    id: r.id,
    topic_id: r.topic_id,
    block_type: r.block_type,
    title: r.title,
    subtitle: safeParse(r.subtitle),            // previously JSON stored
    text: safeParse(r.text),                    // previously JSON stored
    text_style: r.text_style,
    image: r.image,
    image_mime: r.image_mime,
    carousel_images: safeParse(r.carousel_images),
    code_snippets: safeParse(r.code_snippets),
    links: safeParse(r.links),
    example_meta: safeParse(r.example_meta),
    note_meta: safeParse(r.note_meta),
    mcq_ref: r.mcq_ref,
    practice_links: safeParse(r.practice_links),
    block_order: r.block_order,
    metadata: safeParse(r.metadata),
    created_at: r.created_at,
    updated_at: r.updated_at
  }));
};


// // src/models/contentBlockModel.js
// import db from "../config/db.js";

// export const createBlock = async (payload) => {
//   const {
//     topic_id,
//     block_type,
//     title = null,
//     subtitle1 = null,
//     subtitle2 = null,
//     subtitle3 = null,
//     subtitle4 = null,
//     text1 = null,
//     text2 = null,
//     text3 = null,
//     text4 = null,
//     text_style = null,
//     // code_snippets is expected as an array of { language, title, code_text }
//     code_snippets = null,
//     // links: array of { text, href }
//     links = null,
//     // example boxes and note boxes as array of objects
//     example_boxes = null,
//     note_boxes = null,
//     // practice links: array of { platform, url, title }
//     practice_links = null,
//     mcq_ref = null,
//     block_order = 0,
//     metadata = null
//   } = payload;

//   const [res] = await db.query(
//     `INSERT INTO content_blocks
//     (topic_id, block_type, title, subtitle, text, text_style, carousel_images, code_snippets, links, example_meta, note_meta, mcq_ref, practice_links, block_order, metadata)
//     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//     [
//       topic_id,
//       block_type,
//       title,
//       // storing subtitles together (we'll pack them as JSON into 'subtitle' column) OR you can modify DB
//       JSON.stringify({ subtitle1, subtitle2, subtitle3, subtitle4 }),
//       JSON.stringify({ text1, text2, text3, text4 }),
//       text_style,
//       null, // carousel_images (not used now)
//       JSON.stringify(code_snippets || null),
//       JSON.stringify(links || null),
//       JSON.stringify(example_boxes || null),
//       JSON.stringify(note_boxes || null),
//       mcq_ref,
//       JSON.stringify(practice_links || null),
//       block_order,
//       JSON.stringify(metadata || null)
//     ]
//   );

//   return res.insertId;
// };

// export const getBlocksByTopic = async (topic_id) => {
//   const [rows] = await db.query("SELECT * FROM content_blocks WHERE topic_id = ? ORDER BY block_order, created_at", [topic_id]);
//   return rows.map(r => ({
//     ...r,
//     subtitle: r.subtitle ? JSON.parse(r.subtitle) : null,
//     text: r.text ? JSON.parse(r.text) : null,
//     code_snippets: r.code_snippets ? JSON.parse(r.code_snippets) : null,
//     links: r.links ? JSON.parse(r.links) : null,
//     example_meta: r.example_meta ? JSON.parse(r.example_meta) : null,
//     note_meta: r.note_meta ? JSON.parse(r.note_meta) : null,
//     practice_links: r.practice_links ? JSON.parse(r.practice_links) : null,
//     metadata: r.metadata ? JSON.parse(r.metadata) : null
//   }));
// };

// export const updateBlockById = async (id, fields) => {
//   const set = [];
//   const vals = [];
//   for (const [k,v] of Object.entries(fields)) {
//     set.push(`${k} = ?`);
//     // If passing objects (links, code_snippets), stringify before sending
//     vals.push(typeof v === "object" && v !== null ? JSON.stringify(v) : v);
//   }
//   vals.push(id);
//   const [res] = await db.query(`UPDATE content_blocks SET ${set.join(", ")} WHERE id = ?`, vals);
//   return res.affectedRows;
// };

// export const deleteBlockById = async (id) => {
//   const [res] = await db.query("DELETE FROM content_blocks WHERE id = ?", [id]);
//   return res.affectedRows;
// };