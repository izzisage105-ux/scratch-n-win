const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');
const fs = require('fs');

const file = path.join(__dirname, '../database.json');

// Initialize database
async function initializeDB() {
    const adapter = new JSONFile(file);
    const db = new Low(adapter, {
        users: [],
        games: [],
        withdrawals: [],
        deposits: [],
        settings: { audioEnabled: true }
    });

    await db.read();
    await db.write();
    
    console.log('✅ LowDB initialized');
    return db;
}

module.exports = { initializeDB };