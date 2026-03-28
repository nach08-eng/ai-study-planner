const { createJsonStore } = require("./jsonStore");
const { createPostgresStore } = require("./postgresStore");

async function createStore({ dataDir, connectionString, ssl }) {
  if (connectionString) {
    return createPostgresStore({ connectionString, ssl });
  }

  return createJsonStore({ dataDir });
}

module.exports = { createStore };
