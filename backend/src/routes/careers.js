const express = require("express");

const { getStore } = require("../config/db");
const { callOpenAIJson } = require("../lib/ai");
const {
  getFallbackCareerSuggestions,
  getFallbackSkillGap,
  getCareerTemplate,
  tokenize
} = require("../lib/careerData");

const careersRouter = express.Router();

careersRouter.post("/generate-careers", async (req, res, next) => {
  try {
    const store = await getStore();
    const userId = req.body.userId || req.body.user_id;
    const profile = req.body.profile || (userId ? await store.getUser(userId) : null);

    if (!profile) {
      return res.status(400).json({ message: "Profile is required." });
    }

    const careers = await callOpenAIJson({
      schemaName: "career_suggestions",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          careers: {
            type: "array",
            minItems: 2,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                reason: { type: "string" },
                duration: { type: "string" }
              },
              required: ["title", "reason", "duration"]
            }
          }
        },
        required: ["careers"]
      },
      instructions:
        "You are an expert career mentor. Return only the best 2-3 career paths for the learner. Keep the answer practical, encouraging, and specific.",
      input: {
        interests: profile.interests,
        strengths: profile.strengths,
        currentSkills: profile.skills,
        goal: profile.goal || "",
        dailyStudyTime: profile.studyTime || 90
      },
      fallback: () => ({ careers: getFallbackCareerSuggestions(profile) })
    });

    await store.saveCareers(profile.id || userId, careers.careers);
    res.json(careers);
  } catch (error) {
    next(error);
  }
});

careersRouter.post("/skill-gap", async (req, res, next) => {
  try {
    const store = await getStore();
    const { userId, careerTitle, currentSkills } = req.body;

    if (!userId || !careerTitle) {
      return res.status(400).json({ message: "userId and careerTitle are required." });
    }

    const user = (await store.getUser(userId)) || {};
    const template = getCareerTemplate(careerTitle);
    const fallbackSkills = getFallbackSkillGap(
      currentSkills || user.skills || [],
      careerTitle
    );

    const result = await callOpenAIJson({
      schemaName: "skill_gap_analysis",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          skill_gap: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                skill: { type: "string" },
                level: { type: "string" },
                priority: { type: "integer" }
              },
              required: ["skill", "level", "priority"]
            }
          }
        },
        required: ["skill_gap"]
      },
      instructions:
        "Compare the learner's current skills to the selected career and return only the missing or weak skills in beginner-to-advanced priority order.",
      input: {
        careerTitle,
        currentSkills: currentSkills || user.skills || [],
        requiredSkills: template?.requiredSkills || fallbackSkills.map((skill) => skill.skill)
      },
      fallback: () => ({ skill_gap: fallbackSkills.filter((item) => item.missing !== false) })
    });

    const record = await store.saveSkillGap(userId, careerTitle, result.skill_gap);
    res.json({
      skill_gap: result.skill_gap,
      career: careerTitle,
      requiredSkills: template?.requiredSkills || [],
      record
    });
  } catch (error) {
    next(error);
  }
});

careersRouter.get("/careers/templates", (_req, res) => {
  res.json({
    careers: getFallbackCareerSuggestions({
      interests: ["tech", "design", "business"],
      strengths: ["logic", "creativity", "communication"],
      skills: tokenize([])
    })
  });
});

module.exports = { careersRouter };
