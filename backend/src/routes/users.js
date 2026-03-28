const express = require("express");
const { getStore } = require("../config/db");

const usersRouter = express.Router();

usersRouter.post("/onboarding", async (req, res, next) => {
  try {
    const store = await getStore();
    const user = await store.upsertUser(req.body || {});
    const dashboard = await store.getDashboard(user.id);

    res.status(201).json({
      user,
      dashboard
    });
  } catch (error) {
    next(error);
  }
});

usersRouter.get("/users/:userId", async (req, res, next) => {
  try {
    const store = await getStore();
    const userId = req.params.userId;
    const dashboard = await store.getDashboard(userId);

    if (!dashboard) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/users/:userId/reset", async (req, res, next) => {
  try {
    const store = await getStore();
    await store.resetUserProgress(req.params.userId);
    res.json({ message: "Workspace reset." });
  } catch (error) {
    next(error);
  }
});

module.exports = { usersRouter };
