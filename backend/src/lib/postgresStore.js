const crypto = require("crypto");
const { Pool } = require("pg");

const { normalizeList, calculateStreak } = require("./storeShared");

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  interests JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  study_time INTEGER NOT NULL DEFAULT 90,
  goal TEXT NOT NULL DEFAULT '',
  selected_career TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS careers (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  duration TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skill_gaps (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  career_title TEXT NOT NULL,
  skill_gap JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  career_title TEXT NOT NULL,
  daily_study_time INTEGER NOT NULL DEFAULT 90,
  days JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  task_order INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS progress (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  completion_percentage INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  completed_tasks INTEGER NOT NULL DEFAULT 0,
  total_tasks INTEGER NOT NULL DEFAULT 0,
  weekly_progress JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_careers_user_id ON careers(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_gaps_user_id ON skill_gaps(user_id);
CREATE INDEX IF NOT EXISTS idx_plans_user_id ON plans(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
`;

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    interests: row.interests || [],
    strengths: row.strengths || [],
    skills: row.skills || [],
    studyTime: row.study_time,
    goal: row.goal,
    selectedCareer: row.selected_career,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapCareer(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    reason: row.reason,
    duration: row.duration,
    createdAt: toIso(row.created_at)
  };
}

function mapSkillGap(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    careerTitle: row.career_title,
    skillGap: row.skill_gap || [],
    createdAt: toIso(row.created_at)
  };
}

function mapTask(row) {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    day: row.day,
    order: row.task_order,
    text: row.text,
    completed: row.completed,
    completedAt: toIso(row.completed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapPlan(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    careerTitle: row.career_title,
    dailyStudyTime: row.daily_study_time,
    days: row.days || [],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

async function recalculateProgress(client, userId) {
  const tasksResult = await client.query(
    `SELECT id, day, completed
     FROM tasks
     WHERE user_id = $1
     ORDER BY day ASC, task_order ASC`,
    [userId]
  );

  const tasks = tasksResult.rows;
  const completedTasks = tasks.filter((task) => task.completed).length;
  const totalTasks = tasks.length;
  const completionPercentage =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  const weeklyProgressMap = new Map();
  for (const task of tasks) {
    const current = weeklyProgressMap.get(task.day) || { day: task.day, completed: 0, total: 0 };
    current.total += 1;
    if (task.completed) {
      current.completed += 1;
    }
    weeklyProgressMap.set(task.day, current);
  }

  const weeklyProgress = [...weeklyProgressMap.values()]
    .sort((a, b) => a.day - b.day)
    .map((entry) => ({
      ...entry,
      percentage: entry.total === 0 ? 0 : Math.round((entry.completed / entry.total) * 100)
    }));

  const streak = calculateStreak(tasks.map((task) => ({ day: task.day, completed: task.completed })));

  await client.query(
    `INSERT INTO progress (
      user_id,
      completion_percentage,
      streak,
      completed_tasks,
      total_tasks,
      weekly_progress,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      completion_percentage = EXCLUDED.completion_percentage,
      streak = EXCLUDED.streak,
      completed_tasks = EXCLUDED.completed_tasks,
      total_tasks = EXCLUDED.total_tasks,
      weekly_progress = EXCLUDED.weekly_progress,
      updated_at = NOW()`,
    [userId, completionPercentage, streak, completedTasks, totalTasks, JSON.stringify(weeklyProgress)]
  );
}

async function getDashboard(client, userId) {
  const userResult = await client.query(`SELECT * FROM users WHERE id = $1`, [userId]);
  if (!userResult.rows[0]) {
    return null;
  }

  const [careersResult, skillGapResult, planResult, tasksResult, progressResult, chatsResult] =
    await Promise.all([
      client.query(`SELECT * FROM careers WHERE user_id = $1 ORDER BY created_at DESC`, [userId]),
      client.query(
        `SELECT * FROM skill_gaps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId]
      ),
      client.query(
        `SELECT * FROM plans WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [userId]
      ),
      client.query(
        `SELECT * FROM tasks WHERE user_id = $1 ORDER BY day ASC, task_order ASC, created_at ASC`,
        [userId]
      ),
      client.query(`SELECT * FROM progress WHERE user_id = $1`, [userId]),
      client.query(`SELECT * FROM chats WHERE user_id = $1 ORDER BY created_at ASC`, [userId])
    ]);

  const profile = mapUser(userResult.rows[0]);
  const careers = careersResult.rows.map(mapCareer);
  const skillGap = mapSkillGap(skillGapResult.rows[0]);
  const tasks = tasksResult.rows.map(mapTask);
  const planRow = planResult.rows[0];
  let plan = mapPlan(planRow);

  if (plan) {
    plan.days = (plan.days || []).map((day) => ({
      ...day,
      tasks: tasks.filter((task) => task.day === day.day)
    }));
  }

  const todayDay =
    plan?.days?.find((day) => day.tasks.some((task) => !task.completed))?.day ||
    plan?.days?.[0]?.day ||
    1;
  const todayTasks = plan?.days?.find((day) => day.day === todayDay)?.tasks || [];

  const progressRow = progressResult.rows[0];
  const progress = progressRow
    ? {
        completionPercentage: progressRow.completion_percentage,
        streak: progressRow.streak,
        completedTasks: progressRow.completed_tasks,
        totalTasks: progressRow.total_tasks,
        weeklyProgress: progressRow.weekly_progress || []
      }
    : {
        completionPercentage: 0,
        streak: 0,
        completedTasks: 0,
        totalTasks: 0,
        weeklyProgress: []
      };

  return {
    profile,
    careers,
    skillGap,
    plan,
    tasks,
    progress,
    dashboard: {
      todayDay,
      todayTasks,
      motivationalMessage:
        plan?.careerTitle && progress.completionPercentage > 0
          ? `You're ${progress.completionPercentage}% closer to becoming a ${plan.careerTitle}.`
          : "Your adaptive study journey is ready to begin."
    },
    chat: chatsResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      role: row.role,
      content: row.content,
      createdAt: toIso(row.created_at)
    }))
  };
}

async function createPostgresStore({ connectionString, ssl }) {
  const pool = new Pool({
    connectionString,
    ssl
  });

  await pool.query(schemaSql);

  return {
    upsertUser: async (profile) => {
      const user = {
        id: profile.id || crypto.randomUUID(),
        name: profile.name || "Anonymous Learner",
        interests: normalizeList(profile.interests),
        strengths: normalizeList(profile.strengths),
        skills: normalizeList(profile.skills),
        studyTime: Number(profile.studyTime || 90),
        goal: profile.goal || "",
        selectedCareer: profile.selectedCareer || "",
        createdAt: profile.createdAt ? new Date(profile.createdAt) : new Date()
      };

      const result = await pool.query(
        `INSERT INTO users (
          id, name, interests, strengths, skills, study_time, goal, selected_career, created_at, updated_at
        )
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8, $9, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          interests = EXCLUDED.interests,
          strengths = EXCLUDED.strengths,
          skills = EXCLUDED.skills,
          study_time = EXCLUDED.study_time,
          goal = EXCLUDED.goal,
          selected_career = EXCLUDED.selected_career,
          updated_at = NOW()
        RETURNING *`,
        [
          user.id,
          user.name,
          JSON.stringify(user.interests),
          JSON.stringify(user.strengths),
          JSON.stringify(user.skills),
          user.studyTime,
          user.goal,
          user.selectedCareer,
          user.createdAt
        ]
      );

      return mapUser(result.rows[0]);
    },

    getUser: async (userId) => {
      const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
      return mapUser(result.rows[0]);
    },

    saveCareers: async (userId, careers) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM careers WHERE user_id = $1`, [userId]);

        const records = [];
        for (const career of careers) {
          const result = await client.query(
            `INSERT INTO careers (id, user_id, title, reason, duration)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [crypto.randomUUID(), userId, career.title, career.reason, career.duration]
          );
          records.push(mapCareer(result.rows[0]));
        }

        await client.query("COMMIT");
        return records;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    saveSkillGap: async (userId, careerTitle, skillGap) => {
      const result = await pool.query(
        `WITH removed AS (
          DELETE FROM skill_gaps WHERE user_id = $1
        )
        INSERT INTO skill_gaps (id, user_id, career_title, skill_gap)
        VALUES ($2, $1, $3, $4::jsonb)
        RETURNING *`,
        [userId, crypto.randomUUID(), careerTitle, JSON.stringify(skillGap)]
      );

      return mapSkillGap(result.rows[0]);
    },

    savePlan: async ({ userId, careerTitle, dailyStudyTime, plan }) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const now = new Date().toISOString();
        const previousTasksResult = await client.query(
          `SELECT text FROM tasks WHERE user_id = $1 AND completed = TRUE`,
          [userId]
        );
        const completedTexts = new Set(previousTasksResult.rows.map((row) => row.text.toLowerCase()));

        await client.query(`DELETE FROM tasks WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM plans WHERE user_id = $1`, [userId]);

        const planId = crypto.randomUUID();
        const expandedDays = [];

        for (let dayIndex = 0; dayIndex < plan.length; dayIndex += 1) {
          const day = plan[dayIndex];
          const mappedDay = {
            day: day.day || dayIndex + 1,
            topic: day.topic || day.learning_topic || "",
            practiceTask: day.practiceTask || day.practice_task || "",
            miniProject: day.miniProject || day.mini_project || "",
            tasks: []
          };

          for (let taskIndex = 0; taskIndex < (day.tasks || []).length; taskIndex += 1) {
            const taskText = day.tasks[taskIndex];
            const task = {
              id: crypto.randomUUID(),
              userId,
              planId,
              day: mappedDay.day,
              order: taskIndex,
              text: taskText,
              completed: completedTexts.has(String(taskText).toLowerCase()),
              completedAt: null,
              createdAt: now,
              updatedAt: now
            };

            await client.query(
              `INSERT INTO tasks (
                id, user_id, plan_id, day, task_order, text, completed, completed_at, created_at, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                task.id,
                task.userId,
                task.planId,
                task.day,
                task.order,
                task.text,
                task.completed,
                task.completedAt,
                task.createdAt,
                task.updatedAt
              ]
            );

            mappedDay.tasks.push(task);
          }

          expandedDays.push(mappedDay);
        }

        const planResult = await client.query(
          `INSERT INTO plans (
            id, user_id, career_title, daily_study_time, days, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
          RETURNING *`,
          [planId, userId, careerTitle, Number(dailyStudyTime || 90), JSON.stringify(expandedDays)]
        );

        await client.query(
          `UPDATE users
           SET selected_career = $2, study_time = $3, updated_at = NOW()
           WHERE id = $1`,
          [userId, careerTitle, Number(dailyStudyTime || 90)]
        );

        await recalculateProgress(client, userId);
        await client.query("COMMIT");
        return mapPlan(planResult.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    toggleTask: async ({ userId, taskId, completed }) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `UPDATE tasks
           SET completed = $3, completed_at = CASE WHEN $3 THEN NOW() ELSE NULL END, updated_at = NOW()
           WHERE id = $1 AND user_id = $2
           RETURNING *`,
          [taskId, userId, Boolean(completed)]
        );

        if (!result.rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }

        const planResult = await client.query(
          `SELECT * FROM plans WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
          [userId]
        );

        if (planResult.rows[0]) {
          const plan = planResult.rows[0];
          const updatedDays = (plan.days || []).map((day) => ({
            ...day,
            tasks: (day.tasks || []).map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    completed: Boolean(completed),
                    completedAt: completed ? new Date().toISOString() : null,
                    updatedAt: new Date().toISOString()
                  }
                : task
            )
          }));

          await client.query(
            `UPDATE plans SET days = $2::jsonb, updated_at = NOW() WHERE id = $1`,
            [plan.id, JSON.stringify(updatedDays)]
          );
        }

        await recalculateProgress(client, userId);
        await client.query("COMMIT");
        return mapTask(result.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    appendChat: async ({ userId, role, content }) => {
      const result = await pool.query(
        `INSERT INTO chats (id, user_id, role, content)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [crypto.randomUUID(), userId, role, content]
      );

      return {
        id: result.rows[0].id,
        userId: result.rows[0].user_id,
        role: result.rows[0].role,
        content: result.rows[0].content,
        createdAt: toIso(result.rows[0].created_at)
      };
    },

    getDashboard: async (userId) => getDashboard(pool, userId),

    resetUserProgress: async (userId) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM chats WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM progress WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM tasks WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM plans WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM skill_gaps WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM careers WHERE user_id = $1`, [userId]);
        await client.query(
          `UPDATE users SET selected_career = '', updated_at = NOW() WHERE id = $1`,
          [userId]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    health: async () => {
      const [usersResult, plansResult, tasksResult] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS count FROM users`),
        pool.query(`SELECT COUNT(*)::int AS count FROM plans`),
        pool.query(`SELECT COUNT(*)::int AS count FROM tasks`)
      ]);

      return {
        storage: "postgres",
        users: usersResult.rows[0].count,
        plans: plansResult.rows[0].count,
        tasks: tasksResult.rows[0].count
      };
    }
  };
}

module.exports = { createPostgresStore };
