const express = require("express");

const { getStore } = require("../config/db");
const { callOpenAIJson } = require("../lib/ai");

const chatRouter = express.Router();

chatRouter.post("/chat", async (req, res, next) => {
  try {
    const store = await getStore();
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ message: "userId and message are required." });
    }

    const dashboard = await store.getDashboard(userId);
    if (!dashboard) {
      return res.status(404).json({ message: "User not found." });
    }

    await store.appendChat({
      userId,
      role: "user",
      content: message
    });

    const reply = await callOpenAIJson({
      schemaName: "career_mentor_chat",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          reply: { type: "string" },
          suggested_actions: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["reply", "suggested_actions"]
      },
      instructions:
        "You are a practical AI career mentor. Respond clearly, briefly, and helpfully. Use the user's selected career, progress, and current plan as context. Offer actionable next steps when appropriate.",
      input: {
        userMessage: message,
        profile: dashboard.profile,
        selectedCareer: dashboard.plan?.careerTitle || dashboard.profile?.selectedCareer || "",
        progress: dashboard.progress,
        todayTasks: dashboard.dashboard.todayTasks,
        skillGap: dashboard.skillGap?.skillGap || [],
        plan: dashboard.plan?.days || []
      },
      fallback: () => ({
        reply: buildFallbackReply(dashboard, message),
        suggested_actions: buildFallbackActions(dashboard)
      })
    });

    await store.appendChat({
      userId,
      role: "assistant",
      content: reply.reply
    });

    res.json({
      ...reply,
      context: {
        selectedCareer: dashboard.plan?.careerTitle || dashboard.profile?.selectedCareer || "",
        progress: dashboard.progress
      }
    });
  } catch (error) {
    next(error);
  }
});

function buildFallbackReply(dashboard, message) {
  const career = dashboard.plan?.careerTitle || "your target career";
  const todayCount = dashboard.dashboard.todayTasks?.length || 0;
  const completion = dashboard.progress?.completionPercentage || 0;

  if (/today|study/i.test(message)) {
    return `Focus on ${todayCount || 2} key tasks today for ${career}. Keep the first block simple, then finish with a short reflection.`;
  }

  if (/ready|interview/i.test(message)) {
    return completion >= 70
      ? `You're in a strong position for ${career} interviews. Keep polishing your project stories, fundamentals, and practice answers.`
      : `You're making progress, but I would strengthen the core skills for ${career} before interviews. Aim for at least 70% completion and one solid mini project.`;
  }

  if (/joins|sql/i.test(message)) {
    return "Think of SQL joins as ways to combine rows from two tables. Start with INNER JOIN, then LEFT JOIN, and practice with tiny datasets first.";
  }

  return `Based on your current plan for ${career}, I recommend staying consistent, finishing today's tasks, and using one extra review block this week.`;
}

function buildFallbackActions(dashboard) {
  const completion = dashboard.progress?.completionPercentage || 0;
  if (completion < 30) {
    return ["Finish one lesson", "Practice for 20 minutes", "Ask me for a simpler explanation"];
  }
  if (completion < 70) {
    return ["Complete today's tasks", "Review yesterday's notes", "Build one small project step"];
  }
  return ["Push into an advanced topic", "Polish your project portfolio", "Practice interview-style questions"];
}

module.exports = { chatRouter };
