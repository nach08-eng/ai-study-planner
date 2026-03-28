const express = require("express");
const { OAuth2Client } = require("google-auth-library");
const { getStore } = require("../config/db");

const usersRouter = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function isOnboarded(user) {
  return Boolean(
    user &&
      user.name &&
      Array.isArray(user.interests) &&
      user.interests.length &&
      Array.isArray(user.strengths) &&
      user.strengths.length &&
      Array.isArray(user.skills) &&
      user.skills.length
  );
}

usersRouter.post("/auth/google", async (req, res, next) => {
  try {
    const { credential } = req.body || {};
    if (!credential) {
      return res.status(400).json({ message: "Google credential is required." });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ message: "GOOGLE_CLIENT_ID is not configured." });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!payload?.sub) {
      return res.status(401).json({ message: "Invalid Google token." });
    }

    const store = await getStore();
    const existing = await store.getUser(payload.sub);
    const user = await store.upsertUser({
      id: payload.sub,
      name: existing?.name || payload.name || payload.email || "Google User",
      interests: existing?.interests || [],
      strengths: existing?.strengths || [],
      skills: existing?.skills || [],
      studyTime: existing?.studyTime || 90,
      goal: existing?.goal || "",
      selectedCareer: existing?.selectedCareer || ""
    });
    const dashboard = await store.getDashboard(user.id);

    res.json({
      user,
      dashboard,
      onboarded: isOnboarded(user)
    });
  } catch (error) {
    next({
      status: 401,
      message: "Google sign-in failed.",
      details: error.message
    });
  }
});

usersRouter.post("/onboarding", async (req, res, next) => {
  try {
    const store = await getStore();
    const user = await store.upsertUser(req.body || {});
    const dashboard = await store.getDashboard(user.id);

    res.status(201).json({
      user,
      dashboard,
      onboarded: isOnboarded(user)
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
