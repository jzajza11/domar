const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || '/data/accounts.db';
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE,
    user_id INTEGER,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

function addAccount(phone, userId, status) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO accounts (phone_number, user_id, status) VALUES (?, ?, ?)', [phone, userId, status], function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

function getAccountByPhone(phone) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM accounts WHERE phone_number = ?', [phone], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getAccountsByUser(userId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM accounts WHERE user_id = ?', [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getAllAccounts() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM accounts', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function removeAccount(phone) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM accounts WHERE phone_number = ?', [phone], function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

module.exports = {
  addAccount,
  getAccountByPhone,
  getAccountsByUser,
  getAllAccounts,
  removeAccount,
};