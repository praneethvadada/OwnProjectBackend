// src/models/topicModel.js
import db from "../config/db.js";

/* Basic getters */
export const getTopicById = async (id) => {
  const [rows] = await db.query("SELECT * FROM topics WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
};

// export const getChildren = async (parent_id) => {
//   // order by order_no (top-first) then title
//   const [rows] = await db.query("SELECT * FROM topics WHERE parent_id <=> ? ORDER BY order_no ASC, title ASC", [parent_id]);
//   return rows;
// };

export const getChildren = async (parent_id) => {
  const [rows] = await db.query("SELECT * FROM topics WHERE parent_id <=> ? ORDER BY order_no ASC, title ASC", [parent_id]);
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

/* Create topic (legacy) - delegates to createTopicWithOrder for consistent behavior */
export const createTopic = async ({ parent_id = null, title, slug, description = null, author_id = null, order_no = null, is_published = 0, metadata = null }) => {
  return await createTopicWithOrder({ parent_id, title, slug, description, author_id, order_no, is_published, metadata });
};

/**
 * Create topic while inserting at requested order_no (or at top by default)
 * payload: { parent_id, title, slug, description, author_id, metadata, is_published, order_no }
 * Returns inserted id.
 */
// export const createTopicWithOrder = async (payload) => {
//   const {
//     parent_id = null,
//     title,
//     slug,
//     description = null,
//     author_id = null,
//     metadata = null,
//     is_published = 0,
//     order_no = null // if null => insert at top (0)
//   } = payload;

//   const conn = await db.getConnection();
//   try {
//     await conn.beginTransaction();

//     const normalizedSlug = String(slug).trim().toLowerCase();

//     // compute insertion order and shift siblings
//     let insertOrder;
//     if (order_no === null) {
//       // insert at top => bump all siblings' order_no by +1
//       if (parent_id === null) {
//         await conn.query(`UPDATE topics SET order_no = order_no + 1 WHERE parent_id IS NULL`);
//       } else {
//         await conn.query(`UPDATE topics SET order_no = order_no + 1 WHERE parent_id = ?`, [parent_id]);
//       }
//       insertOrder = 0;
//     } else {
//       const ord = Number.isFinite(Number(order_no)) ? Math.max(0, Number(order_no)) : 0;
//       if (parent_id === null) {
//         await conn.query(`UPDATE topics SET order_no = order_no + 1 WHERE parent_id IS NULL AND order_no >= ?`, [ord]);
//       } else {
//         await conn.query(`UPDATE topics SET order_no = order_no + 1 WHERE parent_id = ? AND order_no >= ?`, [parent_id, ord]);
//       }
//       insertOrder = ord;
//     }

//     // compute full_path using parent if exists
//     let full_path;
//     if (!parent_id) {
//       full_path = normalizedSlug;
//     } else {
//       const [parentRows] = await conn.query("SELECT id, full_path FROM topics WHERE id = ? LIMIT 1", [parent_id]);
//       const parentRow = parentRows && parentRows[0] ? parentRows[0] : null;
//       const parentFull = parentRow ? parentRow.full_path : null;
//       full_path = parentFull ? `${parentFull}/${normalizedSlug}` : `${normalizedSlug}`;
//     }

//     const [res] = await conn.query(
//       `INSERT INTO topics (parent_id, title, slug, description, author_id, metadata, is_published, order_no, full_path, created_at, updated_at)
//        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
//       [
//         parent_id,
//         title,
//         normalizedSlug,
//         description,
//         author_id,
//         metadata ? JSON.stringify(metadata) : null,
//         is_published ? 1 : 0,
//         insertOrder,
//         full_path
//       ]
//     );

//     await conn.commit();
//     conn.release();
//     return res.insertId;
//   } catch (err) {
//     await conn.rollback();
//     conn.release();
//     throw err;
//   }
// };




/**
 * Create topic while inserting at requested order_no.
 * If order_no === null => append to the end (so first created has order_no = 0).
 */
// export const createTopicWithOrder = async (payload) => {
//   const {
//     parent_id = null,
//     title,
//     slug,
//     description = null,
//     author_id = null,
//     metadata = null,
//     is_published = 0,
//     order_no = null // if null => append
//   } = payload;

//   const conn = await db.getConnection();
//   try {
//     await conn.beginTransaction();

//     const normalizedSlug = String(slug).trim().toLowerCase();

//     // compute current max order for siblings
//     let [maxRows] = [];
//     if (parent_id === null) {
//       [maxRows] = await conn.query(`SELECT COALESCE(MAX(order_no), -1) AS m FROM topics WHERE parent_id IS NULL`);
//     } else {
//       [maxRows] = await conn.query(`SELECT COALESCE(MAX(order_no), -1) AS m FROM topics WHERE parent_id = ?`, [parent_id]);
//     }
//     const maxOrder = (maxRows && maxRows[0]) ? Number(maxRows[0].m) : -1;

//     let insertOrder;
//     if (order_no === null) {
//       // append: new order = maxOrder + 1
//       insertOrder = maxOrder + 1;
//       // no shifting needed
//     } else {
//       // insert at provided order => shift siblings with order_no >= provided
//       const ord = Number.isFinite(Number(order_no)) ? Math.max(0, Number(order_no)) : 0;
//       if (parent_id === null) {
//         await conn.query(`UPDATE topics SET order_no = order_no + 1 WHERE parent_id IS NULL AND order_no >= ?`, [ord]);
//       } else {
//         await conn.query(`UPDATE topics SET order_no = order_no + 1 WHERE parent_id = ? AND order_no >= ?`, [parent_id, ord]);
//       }
//       insertOrder = ord;
//     }

//     // compute full_path using parent if exists
//     let full_path;
//     if (!parent_id) {
//       full_path = normalizedSlug;
//     } else {
//       const [parentRows] = await conn.query("SELECT id, full_path FROM topics WHERE id = ? LIMIT 1", [parent_id]);
//       const parentRow = parentRows && parentRows[0] ? parentRows[0] : null;
//       const parentFull = parentRow ? parentRow.full_path : null;
//       full_path = parentFull ? `${parentFull}/${normalizedSlug}` : `${normalizedSlug}`;
//     }

//     const [res] = await conn.query(
//       `INSERT INTO topics (parent_id, title, slug, description, author_id, metadata, is_published, order_no, full_path, created_at, updated_at)
//        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
//       [
//         parent_id,
//         title,
//         normalizedSlug,
//         description,
//         author_id,
//         metadata ? JSON.stringify(metadata) : null,
//         is_published ? 1 : 0,
//         insertOrder,
//         full_path
//       ]
//     );

//     await conn.commit();
//     conn.release();
//     return res.insertId;
//   } catch (err) {
//     await conn.rollback();
//     conn.release();
//     throw err;
//   }
// };



/**
 * Create topic while inserting at requested order_no.
 * If order_no === null => append to the end (so first created has order_no = 0).
 * If order_no provided but already occupied -> fallback to append (maxOrder + 1).
 */
export const createTopicWithOrder = async (payload) => {
  const {
    parent_id = null,
    title,
    slug,
    description = null,
    author_id = null,
    metadata = null,
    is_published = 0,
    order_no = null // if null => append
  } = payload;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const normalizedSlug = String(slug).trim().toLowerCase();

    // compute current max order for siblings
    let maxRows;
    if (parent_id === null) {
      [maxRows] = await conn.query(`SELECT COALESCE(MAX(order_no), -1) AS m FROM topics WHERE parent_id IS NULL`);
    } else {
      [maxRows] = await conn.query(`SELECT COALESCE(MAX(order_no), -1) AS m FROM topics WHERE parent_id = ?`, [parent_id]);
    }
    const maxOrder = (maxRows && maxRows[0]) ? Number(maxRows[0].m) : -1;

    let insertOrder;

    if (order_no === null) {
      // append: new order = maxOrder + 1
      insertOrder = maxOrder + 1;
      // no shifting needed
    } else {
      // client asked for a specific position
      const requested = Number.isFinite(Number(order_no)) ? Math.max(0, Number(order_no)) : 0;

      // check if requested index is already occupied
      let [existRows] = [];
      if (parent_id === null) {
        [existRows] = await conn.query(`SELECT 1 FROM topics WHERE parent_id IS NULL AND order_no = ? LIMIT 1`, [requested]);
      } else {
        [existRows] = await conn.query(`SELECT 1 FROM topics WHERE parent_id = ? AND order_no = ? LIMIT 1`, [parent_id, requested]);
      }

      const isOccupied = existRows && existRows.length > 0;

      if (isOccupied) {
        // fallback: append at end (do NOT shift existing)
        insertOrder = maxOrder + 1;
      } else {
        // position is free: perform shift of siblings >= requested, then insert
        if (parent_id === null) {
          await conn.query(`UPDATE topics SET order_no = order_no + 1 WHERE parent_id IS NULL AND order_no >= ?`, [requested]);
        } else {
          await conn.query(`UPDATE topics SET order_no = order_no + 1 WHERE parent_id = ? AND order_no >= ?`, [parent_id, requested]);
        }
        insertOrder = requested;
      }
    }

    // compute full_path using parent if exists
    let full_path;
    if (!parent_id) {
      full_path = normalizedSlug;
    } else {
      const [parentRows] = await conn.query("SELECT id, full_path FROM topics WHERE id = ? LIMIT 1", [parent_id]);
      const parentRow = parentRows && parentRows[0] ? parentRows[0] : null;
      const parentFull = parentRow ? parentRow.full_path : null;
      full_path = parentFull ? `${parentFull}/${normalizedSlug}` : `${normalizedSlug}`;
    }

    const [res] = await conn.query(
      `INSERT INTO topics (parent_id, title, slug, description, author_id, metadata, is_published, order_no, full_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        parent_id,
        title,
        normalizedSlug,
        description,
        author_id,
        metadata ? JSON.stringify(metadata) : null,
        is_published ? 1 : 0,
        insertOrder,
        full_path
      ]
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
 * Reorder a topic inside its parent to new_order_no (0-based).
 * Adjusts sibling order_no values to preserve contiguous ordering.
 * Returns true if success, false if topic not found.
 */
// export const reorderTopic = async (id, newOrderNo) => {
//   const conn = await db.getConnection();
//   try {
//     await conn.beginTransaction();

//     // get existing topic
//     const [rows] = await conn.query(`SELECT id, parent_id, order_no FROM topics WHERE id = ? LIMIT 1`, [id]);
//     if (!rows || rows.length === 0) {
//       await conn.rollback();
//       conn.release();
//       return false;
//     }

//     const t = rows[0];
//     const parent_id = t.parent_id === null ? null : t.parent_id;
//     const oldOrder = Number.isFinite(Number(t.order_no)) ? Number(t.order_no) : 0;
//     let newOrder = Number.isFinite(Number(newOrderNo)) ? Number(newOrderNo) : 0;
//     if (newOrder < 0) newOrder = 0;

//     // find max order for siblings to cap newOrder
//     let maxRes;
//     if (parent_id === null) {
//       [maxRes] = await conn.query(`SELECT MAX(order_no) AS m FROM topics WHERE parent_id IS NULL`);
//     } else {
//       [maxRes] = await conn.query(`SELECT MAX(order_no) AS m FROM topics WHERE parent_id = ?`, [parent_id]);
//     }
//     const maxOrder = (maxRes && maxRes.length && maxRes[0].m !== null) ? Number(maxRes[0].m) : 0;
//     if (newOrder > maxOrder) newOrder = maxOrder;

//     if (newOrder === oldOrder) {
//       await conn.commit();
//       conn.release();
//       return true; // nothing to do
//     }

//     if (newOrder < oldOrder) {
//       // moving up: increment siblings in [newOrder, oldOrder-1] by +1
//       if (parent_id === null) {
//         await conn.query(
//           `UPDATE topics SET order_no = order_no + 1
//            WHERE parent_id IS NULL AND order_no >= ? AND order_no < ?`,
//           [newOrder, oldOrder]
//         );
//       } else {
//         await conn.query(
//           `UPDATE topics SET order_no = order_no + 1
//            WHERE parent_id = ? AND order_no >= ? AND order_no < ?`,
//           [parent_id, newOrder, oldOrder]
//         );
//       }
//     } else {
//       // moving down: decrement siblings in [oldOrder+1, newOrder] by -1
//       if (parent_id === null) {
//         await conn.query(
//           `UPDATE topics SET order_no = order_no - 1
//            WHERE parent_id IS NULL AND order_no <= ? AND order_no > ?`,
//           [newOrder, oldOrder]
//         );
//       } else {
//         await conn.query(
//           `UPDATE topics SET order_no = order_no - 1
//            WHERE parent_id = ? AND order_no <= ? AND order_no > ?`,
//           [parent_id, newOrder, oldOrder]
//         );
//       }
//     }

//     // set topic's order_no to newOrder
//     await conn.query(`UPDATE topics SET order_no = ? WHERE id = ?`, [newOrder, id]);

//     await conn.commit();
//     conn.release();
//     return true;
//   } catch (err) {
//     await conn.rollback();
//     conn.release();
//     throw err;
//   }
// };



/**
 * Bulk reorder children for a parent.
 * parentId: int|null  (use null for root topics)
 * items: [{ id: <topicId>, order_index: <requestedIndex> }, ...]  (may be partial)
 *
 * Returns an array of { id, order_no } after reordering.
 */

// export const bulkReorderChildren = async (parentId, items = []) => {
//   // normalize parentId for SQL (<=> operator handles NULL)
//   const conn = await db.getConnection();
//   try {
//     if (!Array.isArray(items)) throw new Error("items must be an array");

//     await conn.beginTransaction();

//     // 1) fetch current children in their current order to preserve relative order for missing children
//     const [currentRows] = await conn.query(
//       `SELECT id, order_no FROM topics WHERE parent_id <=> ? ORDER BY order_no ASC, id ASC`,
//       [parentId]
//     );
//     const currentIds = currentRows.map(r => r.id);

//     // 2) validate provided ids (they must belong to this parent)
//     const providedIds = items.map(it => Number(it.id)).filter(id => Number.isFinite(id) && id > 0);
//     for (const pid of providedIds) {
//       if (!currentIds.includes(pid)) {
//         throw new Error(`Topic id ${pid} does not belong to parent ${parentId}`);
//       }
//     }

//     // 3) build a placeholder array large enough for requested indices or current length
//     const maxRequestedIndex = items.reduce((m, x) => {
//       const idx = Number.isFinite(Number(x.order_index)) ? Number(x.order_index) : -1;
//       return Math.max(m, idx);
//     }, -1);

//     // desired length at least number of children
//     const totalChildren = currentIds.length;
//     const size = Math.max(totalChildren, maxRequestedIndex + 1);

//     // initialize slots with null (meaning empty)
//     const slots = new Array(size).fill(null);

//     // map to track which ids have been placed
//     const placed = new Set();

//     // 4) place provided items into slots (clamping negative indices to 0)
//     for (const it of items) {
//       const id = Number(it.id);
//       if (!Number.isFinite(id) || id <= 0) continue;
//       let idx = Number.isFinite(Number(it.order_index)) ? Number(it.order_index) : null;
//       if (idx === null) {
//         // if no index specified for this item, skip here (we'll append later)
//         continue;
//       }
//       if (idx < 0) idx = 0;
//       if (idx >= slots.length) {
//         // if requested index beyond current slots, extend slots
//         const extra = idx - slots.length + 1;
//         for (let i = 0; i < extra; i++) slots.push(null);
//       }
//       // if slot already occupied, find next free slot to preserve stability
//       let pos = idx;
//       while (pos < slots.length && slots[pos] !== null) pos += 1;
//       if (pos >= slots.length) slots.push(id);
//       else slots[pos] = id;
//       placed.add(id);
//     }

//     // 5) fill remaining empty slots with not-provided children in their current order
//     const remaining = currentIds.filter(id => !placed.has(id));
//     let ri = 0;
//     for (let s = 0; s < slots.length; s++) {
//       if (slots[s] === null) {
//         if (ri < remaining.length) {
//           slots[s] = remaining[ri++];
//         } else {
//           // no more remaining; keep null for now
//           slots[s] = null;
//         }
//       }
//     }
//     // if any remaining left (slots full but remaining exist), append them
//     while (ri < remaining.length) {
//       slots.push(remaining[ri++]);
//     }

//     // 6) compress to contiguous 0..N-1 removing any nulls
//     const finalSeq = slots.filter(x => x !== null).map(x => Number(x));

//     // 7) persist changes transactionally:
//     // Clear order_no for this parent to avoid intermediate unique conflicts
//     await conn.query(`UPDATE topics SET order_no = NULL WHERE parent_id <=> ?`, [parentId]);

//     // Update each id with its new index
//     for (let i = 0; i < finalSeq.length; i++) {
//       const id = finalSeq[i];
//       await conn.query(`UPDATE topics SET order_no = ? WHERE id = ?`, [i, id]);
//     }

//     await conn.commit();
//     conn.release();

//     // return resulting mapping
//     return finalSeq.map((id, idx) => ({ id, order_no: idx }));
//   } catch (err) {
//     await conn.rollback();
//     conn.release();
//     throw err;
//   }
// };




export const bulkReorderChildren = async (parentId, items = []) => {
  const conn = await db.getConnection();
  try {
    if (!Array.isArray(items)) throw new Error("items must be an array");

    await conn.beginTransaction();

    // 1) fetch current children to preserve relative order
    const [currentRows] = await conn.query(
      `SELECT id, order_no FROM topics WHERE parent_id <=> ? ORDER BY order_no ASC, id ASC`,
      [parentId]
    );
    const currentIds = currentRows.map(r => r.id);

    // 2) validate provided ids (they must belong to this parent)
    const providedIds = items.map(it => Number(it.id)).filter(id => Number.isFinite(id) && id > 0);
    for (const pid of providedIds) {
      if (!currentIds.includes(pid)) {
        throw new Error(`Topic id ${pid} does not belong to parent ${parentId}`);
      }
    }

    // 3) determine max requested order_no
    const maxRequestedOrder = items.reduce((m, x) => {
      const o = Number.isFinite(Number(x.order_no)) ? Number(x.order_no) : -1;
      return Math.max(m, o);
    }, -1);

    const totalChildren = currentIds.length;
    const size = Math.max(totalChildren, maxRequestedOrder + 1);

    // 4) initialize slots and map for placed ids
    const slots = new Array(size).fill(null);
    const placed = new Set();

    // 5) place provided items into slots
    for (const it of items) {
      const id = Number(it.id);
      if (!Number.isFinite(id) || id <= 0) continue;

      let idx = Number.isFinite(Number(it.order_no)) ? Number(it.order_no) : 0;
      if (idx < 0) idx = 0;
      if (idx >= slots.length) {
        const extra = idx - slots.length + 1;
        for (let i = 0; i < extra; i++) slots.push(null);
      }

      let pos = idx;
      while (pos < slots.length && slots[pos] !== null) pos += 1;
      slots[pos] = id;
      placed.add(id);
    }

    // 6) fill remaining empty slots with not-provided children
    const remaining = currentIds.filter(id => !placed.has(id));
    let ri = 0;
    for (let s = 0; s < slots.length; s++) {
      if (slots[s] === null && ri < remaining.length) {
        slots[s] = remaining[ri++];
      }
    }
    while (ri < remaining.length) {
      slots.push(remaining[ri++]);
    }

    // 7) final sequence 0..N-1
    const finalSeq = slots.filter(x => x !== null).map(x => Number(x));

    // 8) persist changes
    for (let i = 0; i < finalSeq.length; i++) {
      const id = finalSeq[i];
      await conn.query(`UPDATE topics SET order_no = ? WHERE id = ?`, [i, id]);
    }

    await conn.commit();
    conn.release();

    // 9) return mapping in same format as requested
    return finalSeq.map((id, idx) => ({ id, order_no: idx }));
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

    const simpleKeys = ["title", "description", "order_no", "is_published", "metadata"];
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
      `SELECT t.id, t.title, t.slug, t.description, t.metadata, t.order_no, t.is_published, t.created_at,
              COALESCE(c.child_count, 0) AS child_count
       FROM topics t
       LEFT JOIN (
         SELECT parent_id, COUNT(*) AS child_count
         FROM topics
         GROUP BY parent_id
       ) c ON t.id = c.parent_id
       WHERE t.parent_id IS NULL
       ORDER BY t.order_no ASC, t.title ASC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // parse metadata (if JSON)
    return rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null }));
  } else {
    const [rows] = await db.query(
      `SELECT id, title, slug, description, metadata, order_no, is_published, created_at
       FROM topics
       WHERE parent_id IS NULL
       ORDER BY order_no ASC, title ASC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null }));
  }
};


// // src/models/topicModel.js
// import db from "../config/db.js";

// /* Basic getters */
// export const getTopicById = async (id) => {
//   const [rows] = await db.query("SELECT * FROM topics WHERE id = ? LIMIT 1", [id]);
//   return rows[0] || null;
// };

// export const getChildren = async (parent_id) => {
//   const [rows] = await db.query("SELECT * FROM topics WHERE parent_id <=> ? ORDER BY order_index, title", [parent_id]);
//   return rows;
// };

// /* Get by full_path */
// export const getTopicByFullPath = async (fullPath) => {
//   if (!fullPath) return null;
//   const [rows] = await db.query("SELECT * FROM topics WHERE full_path = ? LIMIT 1", [fullPath]);
//   return rows[0] || null;
// };

// /* Walk segments (fallback) */
// export const getTopicBySlugPath = async (segments = []) => {
//   if (!Array.isArray(segments) || segments.length === 0) return null;
//   let parentId = null;
//   let topic = null;
//   for (const seg of segments) {
//     const [rows] = await db.query("SELECT * FROM topics WHERE parent_id <=> ? AND slug = ? LIMIT 1", [parentId, seg]);
//     if (!rows || rows.length === 0) return null;
//     topic = rows[0];
//     parentId = topic.id;
//   }
//   return topic;
// };

// /* Helper compute full_path recursively */
// const computeFullPathSync = (id, rowsMap, cache) => {
//   // rowsMap: Map(id -> {id, parent_id, slug})
//   if (cache.has(id)) return cache.get(id);
//   const node = rowsMap.get(id);
//   if (!node) return null;
//   if (!node.parent_id) {
//     cache.set(id, node.slug);
//     return node.slug;
//   }
//   const parentPath = computeFullPathSync(node.parent_id, rowsMap, cache);
//   const path = parentPath ? `${parentPath}/${node.slug}` : node.slug;
//   cache.set(id, path);
//   return path;
// };

// /* Create topic — compute full_path and insert (transaction) */
// export const createTopic = async ({ parent_id = null, title, slug, description = null, author_id = null, order_index = 0, is_published = 0 }) => {
//   const conn = await db.getConnection();
//   try {
//     await conn.beginTransaction();

//     const normalizedSlug = String(slug).trim().toLowerCase();

//     // compute parent full path if parent exists
//     let full_path;
//     if (!parent_id) {
//       full_path = normalizedSlug;
//     } else {
//       const parent = await conn.query("SELECT id, full_path, parent_id, slug FROM topics WHERE id = ? LIMIT 1", [parent_id]);
//       const parentRow = parent[0][0];
//       const parentFull = parentRow ? parentRow.full_path : null;
//       full_path = parentFull ? `${parentFull}/${normalizedSlug}` : `${normalizedSlug}`; // fallback if parentFull missing
//     }

//     const [res] = await conn.query(
//       `INSERT INTO topics (parent_id, title, slug, description, author_id, order_index, is_published, full_path)
//        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
//       [parent_id, title, normalizedSlug, description, author_id, order_index, is_published, full_path]
//     );

//     await conn.commit();
//     conn.release();
//     return res.insertId;
//   } catch (err) {
//     await conn.rollback();
//     conn.release();
//     throw err;
//   }
// };

// /**
//  * Update topic. If slug or parent changes, recompute full_path for this topic and all descendants.
//  * This implementation finds descendants (full_path LIKE 'old/full/path/%') and updates them by string replace.
//  */
// export const updateTopicById = async (id, fields) => {
//   const conn = await db.getConnection();
//   try {
//     await conn.beginTransaction();
//     // fetch existing
//     const [existingRows] = await conn.query("SELECT * FROM topics WHERE id = ? LIMIT 1", [id]);
//     if (!existingRows || existingRows.length === 0) {
//       await conn.rollback();
//       conn.release();
//       return 0;
//     }
//     const existing = existingRows[0];

//     // normalize slug if present
//     if (fields.slug) fields.slug = String(fields.slug).trim().toLowerCase();

//     const simpleKeys = ["title", "description", "order_index", "is_published"];
//     const setParts = [];
//     const vals = [];

//     // prepare updates
//     for (const key of Object.keys(fields)) {
//       if (key === "parent_id" || key === "slug") continue; // handle later
//       if (simpleKeys.includes(key)) {
//         setParts.push(`${key} = ?`);
//         vals.push(fields[key]);
//       }
//     }

//     let parentChanged = Object.prototype.hasOwnProperty.call(fields, "parent_id") && String(fields.parent_id) !== String(existing.parent_id);
//     let slugChanged = Object.prototype.hasOwnProperty.call(fields, "slug") && fields.slug !== existing.slug;

//     // If parent or slug changed, compute new full_path
//     let newFullPath = existing.full_path;
//     if (parentChanged || slugChanged) {
//       const newSlug = slugChanged ? fields.slug : existing.slug;
//       const newParentId = parentChanged ? fields.parent_id : existing.parent_id;

//       // Compute new parent full path:
//       let parentFull = null;
//       if (newParentId) {
//         const [parentRows] = await conn.query("SELECT id, full_path FROM topics WHERE id = ? LIMIT 1", [newParentId]);
//         parentFull = parentRows[0] ? parentRows[0].full_path : null;
//       }

//       newFullPath = parentFull ? `${parentFull}/${newSlug}` : `${newSlug}`;
//       // set parent_id and slug in update
//       setParts.push("parent_id = ?");
//       vals.push(newParentId);
//       setParts.push("slug = ?");
//       vals.push(newSlug);

//       // replace full_path for this topic
//       setParts.push("full_path = ?");
//       vals.push(newFullPath);
//     }

//     if (setParts.length > 0) {
//       vals.push(id);
//       const [res] = await conn.query(`UPDATE topics SET ${setParts.join(", ")} WHERE id = ?`, vals);
//       // if parent/slug changed, update descendants
//       if (parentChanged || slugChanged) {
//         const oldPrefix = existing.full_path;
//         const newPrefix = newFullPath;
//         if (oldPrefix) {
//           // find descendants
//           const [descRows] = await conn.query("SELECT id, full_path FROM topics WHERE full_path LIKE CONCAT(?,'/%')", [oldPrefix]);
//           for (const d of descRows) {
//             const oldPath = d.full_path;
//             const rest = oldPath.slice(oldPrefix.length + 1); // skip "oldPrefix/"
//             const updated = `${newPrefix}/${rest}`;
//             await conn.query("UPDATE topics SET full_path = ? WHERE id = ?", [updated, d.id]);
//           }
//         }
//       }
//     }

//     await conn.commit();
//     conn.release();
//     return 1;
//   } catch (err) {
//     await conn.rollback();
//     conn.release();
//     throw err;
//   }
// };

// /* Delete */
// export const deleteTopicById = async (id) => {
//   const conn = await db.getConnection();
//   try {
//     await conn.beginTransaction();
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



// /**
//  * Get root-level topics (parent_id IS NULL) with pagination.
//  * options: { limit = 50, offset = 0, includeChildCount = false }
//  */
// export const getRootTopics = async (options = {}) => {
//   const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 50;
//   const offset = Number.isFinite(Number(options.offset)) ? Number(options.offset) : 0;
//   const includeChildCount = !!options.includeChildCount;

//   if (includeChildCount) {
//     const [rows] = await db.query(
//       `SELECT t.id, t.title, t.slug, t.description, t.metadata, t.order_index, t.is_published, t.created_at,
//               COALESCE(c.child_count, 0) AS child_count
//        FROM topics t
//        LEFT JOIN (
//          SELECT parent_id, COUNT(*) AS child_count
//          FROM topics
//          GROUP BY parent_id
//        ) c ON t.id = c.parent_id
//        WHERE t.parent_id IS NULL
//        ORDER BY t.order_index ASC, t.title ASC
//        LIMIT ? OFFSET ?`,
//       [limit, offset]
//     );

//     // parse metadata (if JSON)
//     return rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null }));
//   } else {
//     const [rows] = await db.query(
//       `SELECT id, title, slug, description, metadata, order_index, is_published, created_at
//        FROM topics
//        WHERE parent_id IS NULL
//        ORDER BY order_index ASC, title ASC
//        LIMIT ? OFFSET ?`,
//       [limit, offset]
//     );

//     return rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null }));
//   }
// };




// // // src/models/topicModel.js
// // import db from "../config/db.js";

// // export const createTopic = async ({ parent_id=null, title, slug, description=null, author_id=null, order_index=0, is_published=0 }) => {
// //   const [res] = await db.query(
// //     `INSERT INTO topics (parent_id, title, slug, description, author_id, order_index, is_published)
// //      VALUES (?,?,?,?,?,?,?)`,
// //     [parent_id, title, slug, description, author_id, order_index, is_published]
// //   );
// //   return res.insertId;
// // };

// // export const updateTopic = async (id, fields) => {
// //   const set = [];
// //   const vals = [];
// //   for (const [k,v] of Object.entries(fields)) {
// //     set.push(`${k} = ?`);
// //     vals.push(v);
// //   }
// //   vals.push(id);
// //   const [res] = await db.query(`UPDATE topics SET ${set.join(", ")} WHERE id = ?`, vals);
// //   return res.affectedRows;
// // };

// // export const getTopicById = async (id) => {
// //   const [rows] = await db.query("SELECT * FROM topics WHERE id = ?", [id]);
// //   return rows[0];
// // };

// // export const getChildren = async (parent_id) => {
// //   const [rows] = await db.query("SELECT * FROM topics WHERE parent_id = ? ORDER BY order_index, title", [parent_id]);
// //   return rows;
// // };

// // /**
// //  * Resolve a slug-path array to a single topic.
// //  * segments = ['python','dict','advanced']
// //  */
// // export const getTopicBySlugPath = async (segments) => {
// //   if (!segments || segments.length === 0) return null;
// //   let parentId = null;
// //   let topic = null;
// //   for (const seg of segments) {
// //     const [rows] = await db.query("SELECT * FROM topics WHERE parent_id <=> ? AND slug = ? LIMIT 1", [parentId, seg]);
// //     if (!rows || rows.length === 0) {
// //       return null;
// //     }
// //     topic = rows[0];
// //     parentId = topic.id;
// //   }
// //   return topic;
// // };

// // export const listTopTopics = async () => {
// //   const [rows] = await db.query("SELECT * FROM topics WHERE parent_id IS NULL ORDER BY order_index, title");
// //   return rows;
// // };


// // export const updateTopicById = async (id, fields) => {
// //   const set = [];
// //   const vals = [];
// //   Object.entries(fields).forEach(([k,v]) => {
// //     set.push(`${k} = ?`);
// //     vals.push(v);
// //   });
// //   vals.push(id);
// //   const [res] = await db.query(`UPDATE topics SET ${set.join(", ")} WHERE id = ?`, vals);
// //   return res.affectedRows;
// // };

// // export const deleteTopicById = async (id) => {
// //   // We will use a transaction to delete the topic (cascade will remove children & linked rows)
// //   const conn = await db.getConnection();
// //   try {
// //     await conn.beginTransaction();

// //     // Optional pre-delete hooks:
// //     // - fetch content_blocks with blob images to delete files from storage
// //     // - remove entries from search index, file storage, etc.
// //     // Example: const [blocks] = await conn.query("SELECT id, image FROM content_blocks WHERE topic_id = ?", [id]);

// //     // Perform delete (this will cascade)
// //     const [res] = await conn.query("DELETE FROM topics WHERE id = ?", [id]);

// //     await conn.commit();
// //     conn.release();
// //     return res.affectedRows;
// //   } catch (err) {
// //     await conn.rollback();
// //     conn.release();
// //     throw err;
// //   }
// // };