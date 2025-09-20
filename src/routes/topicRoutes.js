// src/routes/topicRoutes.js
import express from "express";
import * as TopicCtrl from "../controllers/topicController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/roleMiddleware.js";
import * as TopicContentCtrl from "../controllers/topicContentController.js";

const router = express.Router();

function ensureFn(fn, name) {
  if (typeof fn === "function") return fn;
  return (req, res) => res.status(500).json({ message: `${name} is not a function` });
}

const safeCreate = ensureFn(TopicCtrl.createTopic, "createTopic");
const safeEdit = ensureFn(TopicCtrl.editTopic, "editTopic");
const safeDelete = ensureFn(TopicCtrl.deleteTopic, "deleteTopic");
const safeGetById = ensureFn(TopicCtrl.getTopicById, "getTopicById");
const safeGetChildren = ensureFn(TopicCtrl.getChildren, "getChildren");
const safeGetBySlug = ensureFn(TopicCtrl.getTopicBySlugPath, "getTopicBySlugPath");
const safeGetTree = ensureFn(TopicCtrl.getTopicTree, "getTopicTree");



// dedicated root topics endpoint
router.get("/root", TopicCtrl.getRootTopics);

// Create
router.post("/add", authenticate, requireAdmin, safeCreate);

// Update / Delete
router.put("/:id", authenticate, requireAdmin, safeEdit);
router.delete("/:id", authenticate, requireAdmin, safeDelete);

// Get by ID (includes blocks & immediate children)
router.get("/:id", safeGetById);

// list children (use "null" for top-level)
router.get("/children/:id", safeGetChildren);

// recursive tree
router.get("/tree/:id", safeGetTree);

// slug resolver (API): use regex to capture everything after /slug/
router.get(/^\/slug\/(.*)$/, safeGetBySlug);

// Add content by topic id (protected)
router.post("/:id/content", authenticate, requireAdmin, TopicContentCtrl.addContentByTopicId);

// Add content by slug wildcard (protected) — use regex to capture arbitrary path after /slug/
router.post(/^\/slug\/(.*)\/content$/, authenticate, requireAdmin, TopicContentCtrl.addContentBySlug);

router.post("/:parentId/reorder", authenticate, requireAdmin, TopicCtrl.bulkReorderHandler);

export default router;



// import express from "express";
// import {
//   createTopic,
//   editTopic,
//   deleteTopic,
//   getTopicBySlugPath
// } from "../controllers/topicController.js";
// import { requireAdmin } from "../middleware/roleMiddleware.js";
// import { authenticate } from "../middleware/authMiddleware.js";

// const router = express.Router();

// const ensureFn = (fn) => async (req, res, next) => {
//   try {
//     await fn(req, res, next);
//   } catch (err) {
//     console.error("Route error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // create
// router.post("/", authenticate, requireAdmin, ensureFn(createTopic));

// // ✅ regex catch-all for slug path
// router.get(/^\/slug\/(.*)$/, ensureFn(getTopicBySlugPath));

// // update / delete
// router.put("/:id", authenticate, requireAdmin, ensureFn(editTopic));
// router.delete("/:id", authenticate, requireAdmin, ensureFn(deleteTopic));

// export default router;



// // import express from "express";
// // import {
// //   createTopic,
// //   getTopicBySlugPath,
// //   editTopic,
// //   deleteTopic
// // } from "../controllers/topicController.js";
// // import { requireAdmin } from "../middleware/roleMiddleware.js";
// // import { authenticate } from "../middleware/authMiddleware.js";

// // const router = express.Router();

// // const ensureFn = (fn) => async (req, res, next) => {
// //   try {
// //     await fn(req, res, next);
// //   } catch (err) {
// //     console.error("Route error:", err);
// //     res.status(500).json({ message: "Server error" });
// //   }
// // };

// // router.post("/", authenticate, requireAdmin, ensureFn(createTopic));

// // // ✅ Express 5 wildcard syntax
// // router.get("/slug/:slugPath*", ensureFn(getTopicBySlugPath));

// // router.put("/:id", authenticate, requireAdmin, ensureFn(editTopic));
// // router.delete("/:id", authenticate, requireAdmin, ensureFn(deleteTopic));

// // export default router;


// // // import express from "express";
// // // import {
// // //   createTopic,
// // //   getTopicBySlugPath,
// // //   editTopic,
// // //   deleteTopic
// // // } from "../controllers/topicController.js";
// // // import { requireAdmin } from "../middleware/roleMiddleware.js";
// // // import { authenticate } from "../middleware/authMiddleware.js";

// // // const router = express.Router();

// // // const ensureFn = (fn) => async (req, res, next) => {
// // //   try {
// // //     await fn(req, res, next);
// // //   } catch (err) {
// // //     console.error("Route error:", err);
// // //     res.status(500).json({ message: "Server error" });
// // //   }
// // // };

// // // router.post("/", authenticate, requireAdmin, ensureFn(createTopic));

// // // // ✅ Express 5 compatible catch-all slug route
// // // router.get("/slug/:slugPath(*)", ensureFn(getTopicBySlugPath));

// // // router.put("/:id", authenticate, requireAdmin, ensureFn(editTopic));
// // // router.delete("/:id", authenticate, requireAdmin, ensureFn(deleteTopic));

// // // export default router;



// // // // // src/routes/topicRoutes.js
// // // // import express from "express";
// // // // import {
// // // //   createTopic,
// // // //   getTopicBySlugPath,
// // // //   editTopic,
// // // //   deleteTopic
// // // // } from "../controllers/topicController.js";
// // // // import { requireAdmin } from "../middleware/roleMiddleware.js";
// // // // import { authenticate } from "../middleware/authMiddleware.js";

// // // // const router = express.Router();

// // // // // Wrap with try/catch helper
// // // // const ensureFn = (fn) => async (req, res, next) => {
// // // //   try {
// // // //     await fn(req, res, next);
// // // //   } catch (err) {
// // // //     console.error("Route error:", err);
// // // //     res.status(500).json({ message: "Server error" });
// // // //   }
// // // // };

// // // // // Existing routes...
// // // // router.post("/", authenticate, requireAdmin, ensureFn(createTopic));

// // // // // ✅ Wildcard route for slug path
// // // // router.get("/slug/*", ensureFn(getTopicBySlugPath));

// // // // router.put("/:id", authenticate, requireAdmin, ensureFn(editTopic));
// // // // router.delete("/:id", authenticate, requireAdmin, ensureFn(deleteTopic));

// // // // export default router;



// // // // // // src/routes/topicRoutes.js
// // // // // import express from "express";
// // // // // import {
// // // // //   createTopic,
// // // // //   getTopicBySlugPath,
// // // // //   editTopic,
// // // // //   deleteTopic
// // // // // } from "../controllers/topicController.js";
// // // // // import {  requireAdmin } from "../middleware/roleMiddleware.js";
// // // // // import { authenticate } from "../middleware/authMiddleware.js";
// // // // // import * as TopicCtrl from "../controllers/topicController.js";  // ✅ ensure this line exists

// // // // // const router = express.Router();

// // // // // // Wrap with try/catch helper
// // // // // const ensureFn = (fn) => async (req, res, next) => {
// // // // //   try {
// // // // //     await fn(req, res, next);
// // // // //   } catch (err) {
// // // // //     console.error("Route error:", err);
// // // // //     res.status(500).json({ message: "Server error" });
// // // // //   }
// // // // // };

// // // // // // Existing routes...
// // // // // router.post("/", authenticate, requireAdmin, ensureFn(createTopic));
// // // // // // router.get("/slug/*", ensureFn(getTopicBySlugPath));
// // // // // // router.get("/slug/:slugPath(.*)", TopicCtrl.getTopicBySlugPath);
// // // // // // slug resolver (wildcard route) - public
// // // // // // router.get("/slug/:slugPath*", TopicCtrl.getTopicBySlugPath);
// // // // // // router.get("/slug/:slugPath(.*)", TopicCtrl.getTopicBySlugPath);
// // // // // // slug resolver (wildcard route) - public
// // // // // router.get("/slug/:slugPath*", ensureFn(getTopicBySlugPath));

// // // // // // 🔹 New ones (just wrap directly)
// // // // // router.put("/:id", authenticate, requireAdmin, ensureFn(editTopic));
// // // // // router.delete("/:id", authenticate, requireAdmin, ensureFn(deleteTopic));

// // // // // export default router;



// // // // // // // src/routes/topicRoutes.js
// // // // // // import express from "express";
// // // // // // import * as TopicCtrl from "../controllers/topicController.js";
// // // // // // import { authenticate } from "../middleware/authMiddleware.js";
// // // // // // import { requireAdmin } from "../middleware/roleMiddleware.js";
// // // // // // import { editTopic, deleteTopic } from "../controllers/topicController.js";

// // // // // // const router = express.Router();

// // // // // // function ensureFn(fn, name) {
// // // // // //   if (typeof fn === "function") return fn;
// // // // // //   return (req, res, next) => {
// // // // // //     const msg = `${name} is not a function. Check your import/export in the module.`;
// // // // // //     console.error(msg);
// // // // // //     return res.status(500).json({ message: msg });
// // // // // //   };
// // // // // // }

// // // // // // // safe wrappers
// // // // // // const safeAuthenticate = ensureFn(authenticate, "authenticate");
// // // // // // const safeRequireAdmin = ensureFn(requireAdmin, "requireAdmin");
// // // // // // const safeCreateTopic = ensureFn(TopicCtrl.createTopic, "TopicCtrl.createTopic");
// // // // // // const safeGetChildren = ensureFn(TopicCtrl.getChildren, "TopicCtrl.getChildren");
// // // // // // const safeGetTopicBySlugPath = ensureFn(TopicCtrl.getTopicBySlugPath, "TopicCtrl.getTopicBySlugPath");

// // // // // // // create topic (admin or author)
// // // // // // router.post("/", safeAuthenticate, safeRequireAdmin, safeCreateTopic);

// // // // // // // get children (public)
// // // // // // router.get("/children/:id", safeGetChildren);
// // // // // // router.put("/:id", safeAuthenticate, safeRequireAdmin, safeEditTopic);
// // // // // // router.delete("/:id", safeAuthenticate, safeRequireAdmin, safeDeleteTopic);

// // // // // // // slug resolver (wildcard route) - public
// // // // // // // Use a RegExp route to capture everything after /slug/ without using path-to-regexp modifiers
// // // // // // // The captured group will be available in req.params[0]
// // // // // // router.get(/^\/slug\/(.*)$/, safeGetTopicBySlugPath);

// // // // // // export default router;



// // // // // // // // src/routes/topicRoutes.js
// // // // // // // import express from "express";
// // // // // // // import * as TopicCtrl from "../controllers/topicController.js";
// // // // // // // import { authenticate } from "../middleware/authMiddleware.js";
// // // // // // // import { requireAdmin } from "../middleware/roleMiddleware.js";

// // // // // // // const router = express.Router();

// // // // // // // function ensureFn(fn, name) {
// // // // // // //   if (typeof fn === "function") return fn;
// // // // // // //   // return a function that throws a clear error when called
// // // // // // //   return (req, res, next) => {
// // // // // // //     const msg = `${name} is not a function. Check your import/export in the module.`;
// // // // // // //     console.error(msg);
// // // // // // //     res.status(500).json({ message: msg });
// // // // // // //   };
// // // // // // // }

// // // // // // // // Wrap imports so route registration never throws a TypeError
// // // // // // // const safeAuthenticate = ensureFn(authenticate, "authenticate");
// // // // // // // const safeRequireAdmin = ensureFn(requireAdmin, "requireAdmin");
// // // // // // // const safeCreateTopic = ensureFn(TopicCtrl.createTopic, "TopicCtrl.createTopic");
// // // // // // // const safeGetChildren = ensureFn(TopicCtrl.getChildren, "TopicCtrl.getChildren");
// // // // // // // const safeGetTopicBySlugPath = ensureFn(TopicCtrl.getTopicBySlugPath, "TopicCtrl.getTopicBySlugPath");

// // // // // // // // create topic (admin or author)
// // // // // // // router.post("/", safeAuthenticate, safeRequireAdmin, safeCreateTopic);

// // // // // // // // get children (public)
// // // // // // // router.get("/children/:id", safeGetChildren);

// // // // // // // // slug resolver (wildcard route) - public
// // // // // // // router.get("/slug/:slugPath(*)", safeGetTopicBySlugPath);

// // // // // // // export default router;
