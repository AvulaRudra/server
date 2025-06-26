import express from 'express';
import WrongEntry from '../models/WrongEntry.js';

const router = express.Router();

// 🧠 Get all wrong entries
router.get('/wrong-entries', async (req, res) => {
  try {
    const all = await WrongEntry.find().sort({ updatedAt: -1 });
    res.json(all);
  } catch (err) {
    console.error("Failed to fetch wrong entries:", err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

// ✅ Add new wrong entry (used by presales)
router.post('/wrong-entries', async (req, res) => {
  const { project, field, rejectedItem, reason } = req.body;
  if (!project || !field || !rejectedItem || !reason) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const saved = await WrongEntry.create({ project, field, rejectedItem, reason });
    res.json({ success: true, entry: saved });
  } catch (err) {
    console.error("Error saving wrong entry:", err);
    res.status(500).json({ error: "Failed to save wrong entry" });
  }
});

// ❌ Delete wrong entry
router.delete('/wrong-entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await WrongEntry.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to delete wrong entry:", err);
    res.status(500).json({ error: 'Deletion failed' });
  }
});

export default router;
