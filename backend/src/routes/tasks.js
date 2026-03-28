const express = require("express");
const Task = require("../models/Task");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

router.post("/", async (req, res) => {
  try {
    const { title, description, email, scheduledAt } = req.body;
    if (!title || !description || !email || !scheduledAt) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const task = await Task.create({
      userId: req.user.id,
      userEmail: req.user.email,
      title,
      description,
      email,
      scheduledAt
    });
    return res.status(201).json(task);
  } catch (error) {
    return res.status(500).json({ message: "Failed to create task." });
  }
});

router.get("/", async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.user.id }).sort({
      scheduledAt: 1,
      createdAt: -1
    });
    return res.json(tasks);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch tasks." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, email, scheduledAt } = req.body;

    const task = await Task.findOne({ _id: id, userId: req.user.id });
    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    task.title = title ?? task.title;
    task.description = description ?? task.description;
    task.email = email ?? task.email;
    task.scheduledAt = scheduledAt ?? task.scheduledAt;

    // If a sent task is rescheduled/updated, send it again in future.
    if (task.status === "sent") {
      task.status = "pending";
      task.emailSentAt = null;
    }

    await task.save();
    return res.json(task);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update task." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Task.findOneAndDelete({ _id: id, userId: req.user.id });
    if (!deleted) {
      return res.status(404).json({ message: "Task not found." });
    }
    return res.json({ message: "Task deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete task." });
  }
});

module.exports = router;
