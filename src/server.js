// src/server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import topicRoutes from "./routes/topicRoutes.js";
import blockRoutes from "./routes/blockRoutes.js";
import mcqRoutes from "./routes/mcqRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import contentBlockRoutes from "./routes/contentBlockRoutes.js";
import * as TopicCtrl from "./controllers/topicController.js";

dotenv.config();

const app = express();

// Middleware
app.use(express.json());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
const RESERVED_ROOTS = new Set(["api","auth","static","assets","admin","health","_env","public"]);

// Routes

// app.get(/^\/(.*)$/, async (req, res, next) => {
//   try {
//     const path = (req.params && req.params[0]) ? req.params[0] : ""; // captured by regex
//     if (!path) return next(); // allow root '/' to be handled by your existing root handler

//     // get first segment to compare with reserved prefixes
//     const firstSeg = path.split("/")[0].toLowerCase();
//     if (RESERVED_ROOTS.has(firstSeg)) {
//       return next(); // not a content slug - pass to next middleware/route
//     }

//     // Hand off to a controller function that resolves by slug path
//     // We call a controller specifically built for root slug resolution:
//     return TopicCtrl.resolveByRootPath(req, res, next);
//   } catch (err) {
//     console.error("root-slug handler error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// });


// root slug route: catch everything not reserved
app.get(/^\/(.*)$/, (req, res, next) => {
  const path = req.params && req.params[0] ? req.params[0] : "";
  if (!path) return next(); // let '/' or other handlers handle it
  const first = path.split("/")[0].toLowerCase();
  if (RESERVED_ROOTS.has(first)) return next();
  // forward to resolver
  return TopicCtrl.resolveByRootPath(req, res, next);
});

app.get("/", (req, res) => res.send("Tech Tutorials API"));
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);
app.use("/api/topics", topicRoutes);
app.use("/api", blockRoutes);         // blockRoutes uses /:topicId/blocks
app.use("/api/mcqs", mcqRoutes);
app.use("/api", commentRoutes);
app.use("/api/content-blocks", contentBlockRoutes);

// Server
const PORT = process.env.PORT || 5001; // switched from 5000 to 5001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
