const cors = require("cors");
const express = require("express");

const { getStore } = require("./config/db");
const { careersRouter } = require("./routes/careers");
const { plansRouter } = require("./routes/plans");
const { chatRouter } = require("./routes/chat");
const { usersRouter } = require("./routes/users");

const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || "http://localhost:5173"
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_req, res) => {
    const store = await getStore();
    const snapshot = await store.health();
    res.json({ status: "ok", storage: snapshot.storage });
  });

  app.use("/", usersRouter);
  app.use("/", careersRouter);
  app.use("/", plansRouter);
  app.use("/", chatRouter);

  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({
      message: error.message || "Something went wrong.",
      details: error.details || null
    });
  });

  return app;
};

module.exports = { createApp };
