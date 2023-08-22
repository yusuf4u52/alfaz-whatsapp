var sqlite3 = require('sqlite3');
var mkdirp = require('mkdirp');

mkdirp.sync('./var/db');

const db = new sqlite3.Database('./var/db/alfaz.db');

// SQL query to create a table
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS wasessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT type UNIQUE 
  )
`;

db.serialize(function () {
  db.run(createTableQuery);
  db.run("CREATE TABLE IF NOT EXISTS federated_credentials ( \
    id INTEGER PRIMARY KEY, \
    user_id INTEGER NOT NULL, \
    provider TEXT NOT NULL, \
    subject TEXT NOT NULL, \
    UNIQUE (provider, subject) \
  )");
  db.run("CREATE TABLE IF NOT EXISTS users ( \
    id INTEGER PRIMARY KEY, \
    username TEXT UNIQUE, \
    hashed_password BLOB, \
    salt BLOB, \
    name TEXT \
  )");
});

module.exports = db;