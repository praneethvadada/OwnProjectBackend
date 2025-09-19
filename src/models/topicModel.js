// src/models/topicModel.js
import db from "../config/db.js";

/* Basic getters */
export const getTopicById = async (id) => {
  const [rows] = await db.query("SELECT * FROM topics WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
};

export const getChildren = async (parent_id) => {
  const [rows] = await db.query("SELECT * FROM topics WHERE parent_id <=> ? ORDER BY order_index, title", [parent_id]);
  return rows;
};

/* Get by full_path */
export const getTopicByFullPath = async (fullPath) => {
  if (!fullPath) return null;
  const [rows] = await db.query("SELECT * FROM topics WHERE full_path = ? LIMIT 1", [fullPath]);
  return rows[0] || null;
};

/* Walk segments (fallback) */
export const getTopicBySlugPath = async (segments = []) => {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  let parentId = null;
  let topic = null;
  for (const seg of segments) {
    const [rows] = await db.query("SELECT * FROM topics WHERE parent_id <=> ? AND slug = ? LIMIT 1", [parentId, seg]);
    if (!rows || rows.length === 0) return null;
    topic = rows[0];
    parentId = topic.id;
  }
  return topic;
};

/* Helper compute full_path recursively */
const computeFullPathSync = (id, rowsMap, cache) => {
  // rowsMap: Map(id -> {id, parent_id, slug})
  if (cache.has(id)) return cache.get(id);
  const node = rowsMap.get(id);
  if (!node) return null;
  if (!node.parent_id) {
    cache.set(id, node.slug);
    return node.slug;
  }
  const parentPath = computeFullPathSync(node.parent_id, rowsMap, cache);
  const path = parentPath ? `${parentPath}/${node.slug}` : node.slug;
  cache.set(id, path);
  return path;
};

/* Create topic — compute full_path and insert (transaction) */
export const createTopic = async ({ parent_id = null, title, slug, description = null, author_id = null, order_index = 0, is_published = 0 }) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const normalizedSlug = String(slug).trim().toLowerCase();

    // compute parent full path if parent exists
    let full_path;
    if (!parent_id) {
      full_path = normalizedSlug;
    } else {
      const parent = await conn.query("SELECT id, full_path, parent_id, slug FROM topics WHERE id = ? LIMIT 1", [parent_id]);
      const parentRow = parent[0][0];
      const parentFull = parentRow ? parentRow.full_path : null;
      full_path = parentFull ? `${parentFull}/${normalizedSlug}` : `${normalizedSlug}`; // fallback if parentFull missing
    }

    const [res] = await conn.query(
      `INSERT INTO topics (parent_id, title, slug, description, author_id, order_index, is_published, full_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [parent_id, title, normalizedSlug, description, author_id, order_index, is_published, full_path]
    );

    await conn.commit();
    conn.release();
    return res.insertId;
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
};

/**
 * Update topic. If slug or parent changes, recompute full_path for this topic and all descendants.
 * This implementation finds descendants (full_path LIKE 'old/full/path/%') and updates them by string replace.
 */
export const updateTopicById = async (id, fields) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // fetch existing
    const [existingRows] = await conn.query("SELECT * FROM topics WHERE id = ? LIMIT 1", [id]);
    if (!existingRows || existingRows.length === 0) {
      await conn.rollback();
      conn.release();
      return 0;
    }
    const existing = existingRows[0];

    // normalize slug if present
    if (fields.slug) fields.slug = String(fields.slug).trim().toLowerCase();

    const simpleKeys = ["title", "description", "order_index", "is_published"];
    const setParts = [];
    const vals = [];

    // prepare updates
    for (const key of Object.keys(fields)) {
      if (key === "parent_id" || key === "slug") continue; // handle later
      if (simpleKeys.includes(key)) {
        setParts.push(`${key} = ?`);
        vals.push(fields[key]);
      }
    }

    let parentChanged = Object.prototype.hasOwnProperty.call(fields, "parent_id") && String(fields.parent_id) !== String(existing.parent_id);
    let slugChanged = Object.prototype.hasOwnProperty.call(fields, "slug") && fields.slug !== existing.slug;

    // If parent or slug changed, compute new full_path
    let newFullPath = existing.full_path;
    if (parentChanged || slugChanged) {
      const newSlug = slugChanged ? fields.slug : existing.slug;
      const newParentId = parentChanged ? fields.parent_id : existing.parent_id;

      // Compute new parent full path:
      let parentFull = null;
      if (newParentId) {
        const [parentRows] = await conn.query("SELECT id, full_path FROM topics WHERE id = ? LIMIT 1", [newParentId]);
        parentFull = parentRows[0] ? parentRows[0].full_path : null;
      }

      newFullPath = parentFull ? `${parentFull}/${newSlug}` : `${newSlug}`;
      // set parent_id and slug in update
      setParts.push("parent_id = ?");
      vals.push(newParentId);
      setParts.push("slug = ?");
      vals.push(newSlug);

      // replace full_path for this topic
      setParts.push("full_path = ?");
      vals.push(newFullPath);
    }

    if (setParts.length > 0) {
      vals.push(id);
      const [res] = await conn.query(`UPDATE topics SET ${setParts.join(", ")} WHERE id = ?`, vals);
      // if parent/slug changed, update descendants
      if (parentChanged || slugChanged) {
        const oldPrefix = existing.full_path;
        const newPrefix = newFullPath;
        if (oldPrefix) {
          // find descendants
          const [descRows] = await conn.query("SELECT id, full_path FROM topics WHERE full_path LIKE CONCAT(?,'/%')", [oldPrefix]);
          for (const d of descRows) {
            const oldPath = d.full_path;
            const rest = oldPath.slice(oldPrefix.length + 1); // skip "oldPrefix/"
            const updated = `${newPrefix}/${rest}`;
            await conn.query("UPDATE topics SET full_path = ? WHERE id = ?", [updated, d.id]);
          }
        }
      }
    }

    await conn.commit();
    conn.release();
    return 1;
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
};

/* Delete */
export const deleteTopicById = async (id) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query("DELETE FROM topics WHERE id = ?", [id]);
    await conn.commit();
    conn.release();
    return res.affectedRows;
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
};



/**
 * Get root-level topics (parent_id IS NULL) with pagination.
 * options: { limit = 50, offset = 0, includeChildCount = false }
 */
export const getRootTopics = async (options = {}) => {
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 50;
  const offset = Number.isFinite(Number(options.offset)) ? Number(options.offset) : 0;
  const includeChildCount = !!options.includeChildCount;

  if (includeChildCount) {
    const [rows] = await db.query(
      `SELECT t.id, t.title, t.slug, t.description, t.metadata, t.order_index, t.is_published, t.created_at,
              COALESCE(c.child_count, 0) AS child_count
       FROM topics t
       LEFT JOIN (
         SELECT parent_id, COUNT(*) AS child_count
         FROM topics
         GROUP BY parent_id
       ) c ON t.id = c.parent_id
       WHERE t.parent_id IS NULL
       ORDER BY t.order_index ASC, t.title ASC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // parse metadata (if JSON)
    return rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null }));
  } else {
    const [rows] = await db.query(
      `SELECT id, title, slug, description, metadata, order_index, is_published, created_at
       FROM topics
       WHERE parent_id IS NULL
       ORDER BY order_index ASC, title ASC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null }));
  }
};




// // src/models/topicModel.js
// import db from "../config/db.js";

// export const createTopic = async ({ parent_id=null, title, slug, description=null, author_id=null, order_index=0, is_published=0 }) => {
//   const [res] = await db.query(
//     `INSERT INTO topics (parent_id, title, slug, description, author_id, order_index, is_published)
//      VALUES (?,?,?,?,?,?,?)`,
//     [parent_id, title, slug, description, author_id, order_index, is_published]
//   );
//   return res.insertId;
// };

// export const updateTopic = async (id, fields) => {
//   const set = [];
//   const vals = [];
//   for (const [k,v] of Object.entries(fields)) {
//     set.push(`${k} = ?`);
//     vals.push(v);
//   }
//   vals.push(id);
//   const [res] = await db.query(`UPDATE topics SET ${set.join(", ")} WHERE id = ?`, vals);
//   return res.affectedRows;
// };

// export const getTopicById = async (id) => {
//   const [rows] = await db.query("SELECT * FROM topics WHERE id = ?", [id]);
//   return rows[0];
// };

// export const getChildren = async (parent_id) => {
//   const [rows] = await db.query("SELECT * FROM topics WHERE parent_id = ? ORDER BY order_index, title", [parent_id]);
//   return rows;
// };

// /**
//  * Resolve a slug-path array to a single topic.
//  * segments = ['python','dict','advanced']
//  */
// export const getTopicBySlugPath = async (segments) => {
//   if (!segments || segments.length === 0) return null;
//   let parentId = null;
//   let topic = null;
//   for (const seg of segments) {
//     const [rows] = await db.query("SELECT * FROM topics WHERE parent_id <=> ? AND slug = ? LIMIT 1", [parentId, seg]);
//     if (!rows || rows.length === 0) {
//       return null;
//     }
//     topic = rows[0];
//     parentId = topic.id;
//   }
//   return topic;
// };

// export const listTopTopics = async () => {
//   const [rows] = await db.query("SELECT * FROM topics WHERE parent_id IS NULL ORDER BY order_index, title");
//   return rows;
// };


// export const updateTopicById = async (id, fields) => {
//   const set = [];
//   const vals = [];
//   Object.entries(fields).forEach(([k,v]) => {
//     set.push(`${k} = ?`);
//     vals.push(v);
//   });
//   vals.push(id);
//   const [res] = await db.query(`UPDATE topics SET ${set.join(", ")} WHERE id = ?`, vals);
//   return res.affectedRows;
// };

// export const deleteTopicById = async (id) => {
//   // We will use a transaction to delete the topic (cascade will remove children & linked rows)
//   const conn = await db.getConnection();
//   try {
//     await conn.beginTransaction();

//     // Optional pre-delete hooks:
//     // - fetch content_blocks with blob images to delete files from storage
//     // - remove entries from search index, file storage, etc.
//     // Example: const [blocks] = await conn.query("SELECT id, image FROM content_blocks WHERE topic_id = ?", [id]);

//     // Perform delete (this will cascade)
//     const [res] = await conn.query("DELETE FROM topics WHERE id = ?", [id]);

//     await conn.commit();
//     conn.release();
//     return res.affectedRows;
//   } catch (err) {
//     await conn.rollback();
//     conn.release();
//     throw err;
//   }
// };