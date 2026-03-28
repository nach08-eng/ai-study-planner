const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const {
  normalizeList,
  createDashboardFromState
} = require("./storeShared");

function createDefaultState() {
  return {
    users: [],
    careers: [],
    skillGaps: [],
    plans: [],
    tasks: [],
    chats: []
  };
}

async function loadState(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (_error) {
    return createDefaultState();
  }
}

async function saveState(filePath, state) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}

function mergeUniqueById(collection, item) {
  const index = collection.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    collection[index] = { ...collection[index], ...item };
    return collection[index];
  }

  collection.push(item);
  return item;
}

async function createJsonStore({ dataDir }) {
  const filePath = path.join(dataDir, "career-planner-state.json");
  let state = await loadState(filePath);

  const persist = async () => {
    await saveState(filePath, state);
  };

  const upsertUser = async (profile) => {
    const now = new Date().toISOString();
    const user = {
      id: profile.id || crypto.randomUUID(),
      name: profile.name || "Anonymous Learner",
      interests: normalizeList(profile.interests),
      strengths: normalizeList(profile.strengths),
      skills: normalizeList(profile.skills),
      studyTime: Number(profile.studyTime || 90),
      goal: profile.goal || "",
      selectedCareer: profile.selectedCareer || "",
      updatedAt: now,
      createdAt: profile.createdAt || now
    };

    mergeUniqueById(state.users, user);
    await persist();
    return user;
  };

  const getUser = async (userId) => state.users.find((user) => user.id === userId) || null;

  const saveCareers = async (userId, careers) => {
    const now = new Date().toISOString();
    const records = careers.map((career) => ({
      id: crypto.randomUUID(),
      userId,
      title: career.title,
      reason: career.reason,
      duration: career.duration,
      createdAt: now
    }));

    state.careers = [...state.careers.filter((career) => career.userId !== userId), ...records];
    await persist();
    return records;
  };

  const saveSkillGap = async (userId, careerTitle, skillGap) => {
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      userId,
      careerTitle,
      skillGap,
      createdAt: now
    };

    state.skillGaps = [...state.skillGaps.filter((entry) => entry.userId !== userId), record];
    await persist();
    return record;
  };

  const savePlan = async ({ userId, careerTitle, dailyStudyTime, plan }) => {
    const now = new Date().toISOString();
    const previousTasks = state.tasks.filter((task) => task.userId === userId);
    const completedTexts = new Set(
      previousTasks.filter((task) => task.completed).map((task) => task.text.toLowerCase())
    );

    const expandedDays = plan.map((day, dayIndex) => ({
      day: day.day || dayIndex + 1,
      topic: day.topic || day.learning_topic || "",
      practiceTask: day.practiceTask || day.practice_task || "",
      miniProject: day.miniProject || day.mini_project || "",
      tasks: (day.tasks || []).map((taskText, taskIndex) => ({
        id: crypto.randomUUID(),
        day: day.day || dayIndex + 1,
        order: taskIndex,
        text: taskText,
        completed: completedTexts.has(String(taskText).toLowerCase()),
        completedAt: null,
        createdAt: now,
        updatedAt: now
      }))
    }));

    state.tasks = [
      ...state.tasks.filter((task) => task.userId !== userId),
      ...expandedDays.flatMap((day) => day.tasks.map((task) => ({ ...task, userId })))
    ];

    const record = {
      id: crypto.randomUUID(),
      userId,
      careerTitle,
      dailyStudyTime: Number(dailyStudyTime || 90),
      days: expandedDays,
      createdAt: now,
      updatedAt: now
    };

    state.plans = [...state.plans.filter((planRecord) => planRecord.userId !== userId), record];

    const userIndex = state.users.findIndex((user) => user.id === userId);
    if (userIndex >= 0) {
      state.users[userIndex].selectedCareer = careerTitle;
      state.users[userIndex].studyTime = Number(dailyStudyTime || state.users[userIndex].studyTime);
      state.users[userIndex].updatedAt = now;
    }

    await persist();
    return record;
  };

  const toggleTask = async ({ userId, taskId, completed }) => {
    const now = new Date().toISOString();
    const taskIndex = state.tasks.findIndex(
      (task) => task.id === taskId && task.userId === userId
    );

    if (taskIndex < 0) {
      return null;
    }

    state.tasks[taskIndex] = {
      ...state.tasks[taskIndex],
      completed: Boolean(completed),
      completedAt: completed ? now : null,
      updatedAt: now
    };

    const planIndex = state.plans.findIndex((plan) => plan.userId === userId);
    if (planIndex >= 0) {
      const currentPlan = state.plans[planIndex];
      currentPlan.days = currentPlan.days.map((day) => ({
        ...day,
        tasks: day.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                completed: Boolean(completed),
                completedAt: completed ? now : null,
                updatedAt: now
              }
            : task
        )
      }));
      currentPlan.updatedAt = now;
    }

    await persist();
    return state.tasks[taskIndex];
  };

  const appendChat = async ({ userId, role, content }) => {
    const record = {
      id: crypto.randomUUID(),
      userId,
      role,
      content,
      createdAt: new Date().toISOString()
    };
    state.chats.push(record);
    await persist();
    return record;
  };

  const getDashboard = async (userId) => {
    const user = await getUser(userId);
    if (!user) {
      return null;
    }

    return createDashboardFromState(user, state);
  };

  const resetUserProgress = async (userId) => {
    state.careers = state.careers.filter((career) => career.userId !== userId);
    state.skillGaps = state.skillGaps.filter((entry) => entry.userId !== userId);
    state.plans = state.plans.filter((plan) => plan.userId !== userId);
    state.tasks = state.tasks.filter((task) => task.userId !== userId);
    state.chats = state.chats.filter((chat) => chat.userId !== userId);
    const userIndex = state.users.findIndex((user) => user.id === userId);
    if (userIndex >= 0) {
      state.users[userIndex].selectedCareer = "";
      state.users[userIndex].updatedAt = new Date().toISOString();
    }
    await persist();
  };

  const health = async () => ({
    storage: "json",
    users: state.users.length,
    plans: state.plans.length,
    tasks: state.tasks.length
  });

  return {
    upsertUser,
    getUser,
    saveCareers,
    saveSkillGap,
    savePlan,
    toggleTask,
    appendChat,
    getDashboard,
    resetUserProgress,
    health
  };
}

module.exports = { createJsonStore };
