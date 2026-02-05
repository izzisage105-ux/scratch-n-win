const { Low } = require("lowdb");
const { Memory } = require("lowdb");

const adapter = new Memory();
const db = new Low(adapter);

async function initDB() {
  await db.read();
  db.data ||= {
    users: [],
    games: [],
    deposits: []
  };
  await db.write();
}

initDB();

module.exports = db;
