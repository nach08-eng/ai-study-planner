require("dotenv").config();

const { createApp } = require("./app");

const app = createApp();
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`AI Career Guidance API running on port ${PORT}`);
});
