const path = require("path");
const { createStore } = require("../lib/store");

let storePromise;

const getStore = async () => {
  if (!storePromise) {
    storePromise = createStore({
      dataDir: path.resolve(__dirname, "..", "..", "data"),
      connectionString: process.env.DATABASE_URL || "",
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
          : false
    });
  }

  return storePromise;
};

module.exports = { getStore };
