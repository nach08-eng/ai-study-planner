function normalizeList(values) {
  if (Array.isArray(values)) {
    return values.filter(Boolean);
  }

  return String(values || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function calculateStreak(tasks) {
  if (!tasks.length) {
    return 0;
  }

  const dayMap = new Map();
  for (const task of tasks) {
    const entry = dayMap.get(task.day) || { total: 0, completed: 0 };
    entry.total += 1;
    if (task.completed) {
      entry.completed += 1;
    }
    dayMap.set(task.day, entry);
  }

  const days = [...dayMap.entries()].sort((a, b) => a[0] - b[0]);
  let streak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const [, value] = days[index];
    if (value.total > 0 && value.total === value.completed) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function createDashboardFromState(user, state) {
  const userCareers = state.careers.filter((career) => career.userId === user.id);
  const userSkillGap = state.skillGaps.filter((entry) => entry.userId === user.id).at(-1) || null;
  const currentPlan =
    state.plans
      .filter((plan) => plan.userId === user.id)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .at(0) || null;
  const userTasks = state.tasks.filter((task) => task.userId === user.id);
  const completedTasks = userTasks.filter((task) => task.completed);
  const completionPercentage =
    userTasks.length === 0
      ? 0
      : Math.round((completedTasks.length / userTasks.length) * 100);
  const streak = calculateStreak(userTasks);

  const todayDay =
    currentPlan?.days?.find((day) => day.tasks?.some((task) => !task.completed))?.day ||
    currentPlan?.days?.[0]?.day ||
    1;

  const todayTasks = currentPlan?.days?.find((day) => day.day === todayDay)?.tasks || [];
  const weeklyProgress = (currentPlan?.days || []).map((day) => ({
    day: day.day,
    completed: day.tasks.filter((task) => task.completed).length,
    total: day.tasks.length,
    percentage:
      day.tasks.length === 0
        ? 0
        : Math.round((day.tasks.filter((task) => task.completed).length / day.tasks.length) * 100)
  }));

  return {
    profile: user,
    careers: userCareers.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    skillGap: userSkillGap,
    plan: currentPlan,
    tasks: userTasks.sort((a, b) => (a.day === b.day ? a.order - b.order : a.day - b.day)),
    progress: {
      completionPercentage,
      streak,
      completedTasks: completedTasks.length,
      totalTasks: userTasks.length,
      weeklyProgress
    },
    dashboard: {
      todayDay,
      todayTasks,
      motivationalMessage:
        currentPlan?.careerTitle && completionPercentage > 0
          ? `You're ${completionPercentage}% closer to becoming a ${currentPlan.careerTitle}.`
          : "Your adaptive study journey is ready to begin."
    },
    chat: state.chats.filter((entry) => entry.userId === user.id)
  };
}

module.exports = {
  normalizeList,
  calculateStreak,
  createDashboardFromState
};
