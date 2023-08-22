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


db.serialize(function() {
  db.run(createTableQuery)
});

module.exports = db;