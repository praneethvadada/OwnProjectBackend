// src/controllers/mcqController.js
import * as McqModel from "../models/mcqModel.js";

export const createMcq = async (req, res) => {
  try {
    const id = await McqModel.createMcq(req.body);
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error" });
  }
};

export const getMcq = async (req, res) => {
  const mcq = await McqModel.getMcqById(req.params.id);
  if (!mcq) return res.status(404).json({ message: "not found" });
  res.json(mcq);
};
