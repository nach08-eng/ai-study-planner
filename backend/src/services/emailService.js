const nodemailer = require("nodemailer");

let transporter;

const getTransporter = () => {
  if (!transporter) {
    const hasSmtp =
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_PORT;

    // If SMTP is not configured, "send" emails by logging them.
    // This keeps the app fully runnable for local development.
    if (!hasSmtp) {
      transporter = nodemailer.createTransport({ jsonTransport: true });
      console.log("SMTP not configured; email will be logged only.");
    } else {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }
  }
  return transporter;
};

const sendTaskReminderEmail = async (task) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || "no-reply@localhost",
    to: task.email,
    subject: "Task Reminder",
    text: `Task title: ${task.title}\nDescription: ${task.description}\nScheduled time: ${new Date(
      task.scheduledAt
    ).toLocaleString()}`
  };

  const tx = getTransporter();
  return tx.sendMail(mailOptions);
};

module.exports = { sendTaskReminderEmail };
