const cron = require("node-cron");
const Task = require("../models/Task");
const Notification = require("../models/Notification");
const { sendTaskReminderEmail } = require("../services/emailService");

const startReminderScheduler = (io) => {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      const dueTasks = await Task.find({
        status: "pending",
        scheduledAt: { $lte: now }
      });

      for (const task of dueTasks) {
        try {
          await sendTaskReminderEmail(task);

          task.status = "sent";
          task.emailSentAt = new Date();
          await task.save();

          const notification = await Notification.create({
            userId: task.userId,
            taskId: task._id,
            message: `Email sent for task: ${task.title}`
          });

          io.to(task.userId).emit("task:emailSent", { task, notification });
        } catch (taskError) {
          console.error(`Failed to send email for task ${task._id}:`, taskError.message);
        }
      }
    } catch (error) {
      console.error("Scheduler run failed:", error.message);
    }
  });
};

module.exports = startReminderScheduler;
