const express = require("express");

const { getStore } = require("../config/db");
const { callOpenAIJson } = require("../lib/ai");
const { getRoadmapBlocks, tokenize } = require("../lib/careerData");

const plansRouter = express.Router();

function buildFallbackPlan({ careerTitle, skillGap, dailyStudyTime }) {
  const blocks = getRoadmapBlocks(careerTitle);
  const totalDays = 7;
  const maxTasksPerDay = dailyStudyTime <= 60 ? 3 : 4;
  const prioritizedSkills = (skillGap || []).slice(0, 6).map((item) => item.skill);

  return Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    const block = blocks[index % blocks.length];
    const focus = prioritizedSkills[index % Math.max(prioritizedSkills.length, 1)] || block.topic;
    return {
      day,
      topic: `${block.difficulty}: ${focus}`,
      practiceTask: `Practice ${focus.toLowerCase()} with a guided exercise`,
      miniProject: `Create a small ${careerTitle.toLowerCase()}-style project around ${focus.toLowerCase()}`,
      tasks: [
        `Watch or read one focused lesson about ${focus}`,
        `Complete a hands-on exercise for ${focus}`,
        `Review what you learned and summarize the key points`,
        ...(maxTasksPerDay > 3
          ? [`Build a mini project step around ${careerTitle}`]
          : [])
      ].slice(0, maxTasksPerDay)
    };
  });
}

plansRouter.post("/generate-plan", async (req, res, next) => {
  try {
    const store = await getStore();
    const { userId, careerTitle, skillGap = [], dailyStudyTime = 90 } = req.body;

    if (!userId || !careerTitle) {
      return res.status(400).json({ message: "userId and careerTitle are required." });
    }

    const user = await store.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const parsedPlan = await callOpenAIJson({
      schemaName: "adaptive_study_plan",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          plan: {
            type: "array",
            minItems: 5,
            maxItems: 14,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                day: { type: "integer" },
                topic: { type: "string" },
                practiceTask: { type: "string" },
                miniProject: { type: "string" },
                tasks: {
                  type: "array",
                  minItems: 2,
                  maxItems: 4,
                  items: { type: "string" }
                }
              },
              required: ["day", "topic", "practiceTask", "miniProject", "tasks"]
            }
          }
        },
        required: ["plan"]
      },
      instructions:
        "Create a practical study plan for a learner with 1-2 hours per day. Each day must include a learning topic, a practice task, and a mini project. Keep the plan progressive and realistic.",
      input: {
        careerTitle,
        currentSkills: user.skills,
        skillGap,
        dailyStudyTime,
        interests: user.interests,
        strengths: user.strengths,
        goal: user.goal || ""
      },
      fallback: () => ({
        plan: buildFallbackPlan({ careerTitle, skillGap, dailyStudyTime })
      })
    });

    const plan = await store.savePlan({
      userId,
      careerTitle,
      dailyStudyTime,
      plan: parsedPlan.plan
    });

    const dashboard = await store.getDashboard(userId);
    res.json({
      plan: plan.days,
      careerTitle,
      dailyStudyTime,
      dashboard
    });
  } catch (error) {
    next(error);
  }
});

plansRouter.post("/update-plan", async (req, res, next) => {
  try {
    const store = await getStore();
    const { userId, signal, daysToAdjust = 3, reason = "" } = req.body;

    if (!userId || !signal) {
      return res.status(400).json({ message: "userId and signal are required." });
    }

    const dashboard = await store.getDashboard(userId);
    if (!dashboard?.plan) {
      return res.status(404).json({ message: "No active plan found." });
    }

    const currentPlan = dashboard.plan;
    const currentCareer = currentPlan.careerTitle;
    const completedTexts = dashboard.tasks
      .filter((task) => task.completed)
      .map((task) => task.text.toLowerCase());

    const updated = await callOpenAIJson({
      schemaName: "updated_study_plan",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          plan: {
            type: "array",
            minItems: 5,
            maxItems: 14,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                day: { type: "integer" },
                topic: { type: "string" },
                practiceTask: { type: "string" },
                miniProject: { type: "string" },
                tasks: {
                  type: "array",
                  minItems: 2,
                  maxItems: 4,
                  items: { type: "string" }
                }
              },
              required: ["day", "topic", "practiceTask", "miniProject", "tasks"]
            }
          }
        },
        required: ["plan"]
      },
      instructions:
        "Adjust the next days of a study plan based on user performance. If the learner is struggling, reduce workload and simplify tasks. If the learner is progressing quickly, gradually increase difficulty. Preserve momentum and keep each day under 2 hours.",
      input: {
        careerTitle: currentCareer,
        signal,
        reason,
        daysToAdjust,
        progress: dashboard.progress,
        existingPlan: currentPlan.days,
        completedTaskTexts: completedTexts
      },
      fallback: () => {
        const tweaked = buildFallbackPlan({
          careerTitle: currentCareer,
          skillGap: dashboard.skillGap?.skillGap || [],
          dailyStudyTime: dashboard.profile?.studyTime || 90
        }).map((day, index) => ({
          ...day,
          tasks:
            signal === "easier"
              ? day.tasks.slice(0, 2)
              : signal === "harder"
                ? [...day.tasks, `Extend day ${index + 1} with one stretch challenge`]
                : day.tasks
        }));

        return { plan: tweaked };
      }
    });

    const merged = await store.savePlan({
      userId,
      careerTitle: currentCareer,
      dailyStudyTime: dashboard.profile?.studyTime || 90,
      plan: updated.plan
    });

    res.json({
      plan: merged.days,
      message:
        signal === "easier"
          ? "Plan reduced to a lighter workload."
          : signal === "harder"
            ? "Plan increased with a tougher progression."
            : "Plan updated.",
      dashboard: await store.getDashboard(userId)
    });
  } catch (error) {
    next(error);
  }
});

plansRouter.patch("/tasks/:taskId", async (req, res, next) => {
  try {
    const store = await getStore();
    const { taskId } = req.params;
    const { userId, completed } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required." });
    }

    const task = await store.toggleTask({
      userId,
      taskId,
      completed: Boolean(completed)
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    res.json({
      task,
      dashboard: await store.getDashboard(userId)
    });
  } catch (error) {
    next(error);
  }
});

plansRouter.get("/dashboard/:userId", async (req, res, next) => {
  try {
    const store = await getStore();
    const dashboard = await store.getDashboard(req.params.userId);

    if (!dashboard) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

module.exports = { plansRouter };
