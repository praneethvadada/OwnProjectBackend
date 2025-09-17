// scripts/populate_fullpath.js
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import db from "../src/config/db.js"; // assumes config/db.js exports mysql2/promise pool
// Node ESM: use `node scripts/populate_fullpath.js` from project root

async function buildMap() {
  const [rows] = await db.query("SELECT id, parent_id, slug FROM topics");
  const map = new Map();
  for (const r of rows) map.set(r.id, { id: r.id, parent_id: r.parent_id, slug: r.slug });
  return map;
}

function computePathForNode(nodeId, map, cache = new Map()) {
  if (cache.has(nodeId)) return cache.get(nodeId);
  const node = map.get(nodeId);
  if (!node) return null;
  if (node.parent_id === null || typeof node.parent_id === "undefined") {
    const p = node.slug;
    cache.set(nodeId, p);
    return p;
  }
  const parentPath = computePathForNode(node.parent_id, map, cache);
  const p = parentPath ? `${parentPath}/${node.slug}` : node.slug;
  cache.set(nodeId, p);
  return p;
}

async function main() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const map = await buildMap();

    const cache = new Map();
    for (const id of map.keys()) computePathForNode(id, map, cache);

    for (const [id, fullPath] of cache.entries()) {
      await conn.query("UPDATE topics SET full_path = ? WHERE id = ?", [fullPath, id]);
    }

    await conn.commit();
    console.log("✅ full_path populated for", cache.size, "topics");
  } catch (err) {
    await conn.rollback();
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
}

main();



// // src/scripts/populate_fullpath.js
// import path from "path";
// import { fileURLToPath } from "url";
// import dotenv from "dotenv";

// // compute directory of this file
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // assume .env is at project root (one level up from src/)
// const projectRoot = path.resolve(__dirname, ".."); // if file is src/scripts, projectRoot points to src/
// // if your .env is one level above src (i.e., at project root), adjust:
// const ENV_PATH = path.resolve(__dirname, "..", ".env"); // ../../.env if scripts in src/scripts and .env in project root use ../.env? adjust below

// // If your script is in src/scripts and .env is in project root, you need to go up two levels:
// const envCandidate1 = path.resolve(__dirname, "..", ".env");         // src/.env
// const envCandidate2 = path.resolve(__dirname, "..", "..", ".env");  // project_root/.env

// // Try project root first (envCandidate2), then src folder
// const chosenEnv = (await import('fs')).existsSync(envCandidate2) ? envCandidate2 :
//                   (await import('fs')).existsSync(envCandidate1) ? envCandidate1 :
//                   null;

// if (chosenEnv) {
//   dotenv.config({ path: chosenEnv });
//   console.log("Loaded env from:", chosenEnv);
// } else {
//   // fallback to default (cwd)
//   dotenv.config();
//   console.warn("Could not find .env at expected locations, falling back to default dotenv behaviour.");
// }

// // now import db (after dotenv has loaded)
// import db from "../config/db.js"; // relative to this script file

// async function buildMap() {
//   const [rows] = await db.query("SELECT id, parent_id, slug FROM topics");
//   const map = new Map();
//   for (const r of rows) map.set(r.id, { id: r.id, parent_id: r.parent_id, slug: r.slug });
//   return map;
// }

// function computePathForNode(nodeId, map, cache = new Map()) {
//   if (cache.has(nodeId)) return cache.get(nodeId);
//   const node = map.get(nodeId);
//   if (!node) return null;
//   if (node.parent_id === null || typeof node.parent_id === "undefined") {
//     const p = node.slug;
//     cache.set(nodeId, p);
//     return p;
//   }
//   const parentPath = computePathForNode(node.parent_id, map, cache);
//   const p = parentPath ? `${parentPath}/${node.slug}` : node.slug;
//   cache.set(nodeId, p);
//   return p;
// }

// async function main() {
//   const conn = await db.getConnection();
//   try {
//     await conn.beginTransaction();
//     const map = await buildMap();

//     const cache = new Map();
//     for (const id of map.keys()) {
//       computePathForNode(id, map, cache);
//     }

//     for (const [id, fullPath] of cache.entries()) {
//       await conn.query("UPDATE topics SET full_path = ? WHERE id = ?", [fullPath, id]);
//     }

//     await conn.commit();
//     console.log("✅ full_path populated for", cache.size, "topics");
//   } catch (err) {
//     await conn.rollback();
//     console.error("Migration failed:", err);
//   } finally {
//     conn.release();
//     process.exit(0);
//   }
// }

// main().catch(err => { console.error(err); process.exit(1); });
