// scripts/migrate_text_to_components.js
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// import db from "../config/db.js";
import crypto from "crypto";
import db from "./../config/db.js";

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
function computeHash(components) {
  return crypto.createHash("sha256").update(stableStringify(components)).digest("hex");
}

async function run() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // fetch rows where components IS NULL (old format)
    const [rows] = await conn.query("SELECT * FROM content_blocks WHERE components IS NULL");
    console.log("Rows to convert:", rows.length);

    for (const r of rows) {
      // Build components array from subtitle/text JSON columns (if present)
      // We expect subtitle/text stored as JSON strings like {"subtitle1":..., "subtitle2":...}
      let components = [];
      try {
        const subtitleObj = r.subtitle ? JSON.parse(r.subtitle) : null;
        const textObj = r.text ? JSON.parse(r.text) : null;

        if (r.title) components.push({ type: "heading", level: 2, text: r.title });

        // iterate subtitle1..subtitle4 -> heading level 3
        if (subtitleObj) {
          ["subtitle1","subtitle2","subtitle3","subtitle4"].forEach(k=>{
            if (subtitleObj[k]) {
              components.push({ type:"heading", level: 3, text: subtitleObj[k]});
              const textKey = "text" + k.replace("subtitle",""); // map subtitle1 -> text1
              if (textObj && textObj[textKey]) {
                components.push({ type:"paragraph", text: textObj[textKey]});
              }
            }
          });
        } else if (textObj) {
          // fallback: text1..text4
          ["text1","text2","text3","text4"].forEach(k=>{
            if (textObj[k]) {
              components.push({ type: "paragraph", text: textObj[k] });
            }
          });
        }

        // code_snippets field exists as JSON array in your schema from earlier — include them
        if (r.code_snippets) {
          const codes = typeof r.code_snippets === "string" ? JSON.parse(r.code_snippets) : r.code_snippets;
          for (const cs of (codes||[])) {
            components.push({ type:"code", title: cs.title || null, language: cs.language || null, code: cs.code_text || cs.code || null });
          }
        }

        // examples & notes
        if (r.example_meta) {
          const exs = typeof r.example_meta === "string" ? JSON.parse(r.example_meta) : r.example_meta;
          for (const e of (exs||[])) components.push({ type: "example", title: e.title || null, content: e.content || null });
        }
        if (r.note_meta) {
          const notes = typeof r.note_meta === "string" ? JSON.parse(r.note_meta) : r.note_meta;
          for (const n of (notes||[])) components.push({ type: "note", note_type: n.type || "info", content: n.content || null });
        }

        // links/practice links
        if (r.links) {
          const links = typeof r.links === "string" ? JSON.parse(r.links) : r.links;
          components.push({ type: "links", items: links });
        }
        if (r.practice_links) {
          const pl = typeof r.practice_links === "string" ? JSON.parse(r.practice_links) : r.practice_links;
          for (const p of (pl||[])) components.push({ type: "practice_link", platform: p.platform, url: p.url, title: p.title });
        }
      } catch (e) {
        console.error("Parse error for id", r.id, e);
        // default fallback: single paragraph with legacy text fields
        components = [{ type:"paragraph", text: r.text || r.title || "" }];
      }

      const componentsJson = JSON.stringify(components);
      const hash = computeHash(components);

      await conn.query("UPDATE content_blocks SET components = ?, content_hash = ? WHERE id = ?", [componentsJson, hash, r.id]);
    }

    await conn.commit();
    console.log("Migration complete.");
    conn.release();
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

run();
