const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'leads.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    problem    TEXT,
    urgency    TEXT,
    district   TEXT,
    name       TEXT,
    phone      TEXT,
    city       TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);

const insert = db.prepare(
  `INSERT INTO leads (problem, urgency, district, name, phone, city)
   VALUES ($problem, $urgency, $district, $name, $phone, $city)`
);

module.exports = {
  saveLead(data) {
    const { lastInsertRowid } = insert.run({
      $problem:  data.problem,
      $urgency:  data.urgency,
      $district: data.district,
      $name:     data.name,
      $phone:    data.phone,
      $city:     data.city,
    });
    return { id: lastInsertRowid, ...data, created_at: new Date().toISOString() };
  },
  getLeads() {
    return db.prepare('SELECT * FROM leads ORDER BY id DESC').all();
  },
};
