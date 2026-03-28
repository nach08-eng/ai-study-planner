require("dotenv").config();

const { createApp } = require("./app");

const app = createApp();
const PORT = process.env.PORT || https://ai-study-planner-bgvf.onrender.com;

app.listen(PORT, () => {
  console.log(`AI Career Guidance API running on port ${PORT}`);
});
