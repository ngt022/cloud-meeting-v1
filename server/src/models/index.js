const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/meeting.db');

const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;
let SQL = null;

const initDb = async () => {
  if (db) return db;
  SQL = await initSqlJs();
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
    db.run(`CREATE TABLE IF NOT EXISTS meetings (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, hostName TEXT NOT NULL, meetingNo TEXT UNIQUE NOT NULL, password TEXT, status TEXT DEFAULT 'waiting', actualStartTime TEXT, actualEndTime TEXT, maxParticipants INTEGER DEFAULT 100, createdAt TEXT DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, meetingId INTEGER NOT NULL, name TEXT NOT NULL, isHost INTEGER DEFAULT 0, joinedAt TEXT DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, meetingId INTEGER NOT NULL, senderName TEXT NOT NULL, content TEXT NOT NULL, createdAt TEXT DEFAULT CURRENT_TIMESTAMP)`);
  }
  saveDb();
  return db;
};

const saveDb = () => {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
};

const generateMeetingNo = () => Math.random().toString().substring(2, 12);

const createMeeting = (title, hostName, password) => {
  const meetingNo = generateMeetingNo();
  const actualStartTime = new Date().toISOString();
  
  db.run('INSERT INTO meetings (title, hostName, meetingNo, password, status, actualStartTime, maxParticipants, createdAt) VALUES (?,?,?,?,?,?,?,?)', 
    [title, hostName, meetingNo, password || null, 'waiting', actualStartTime, 100, new Date().toISOString()]);
  
  // Get the last inserted ID
  const result = db.exec('SELECT id FROM meetings WHERE rowid = last_insert_rowid()');
  let id = 0;
  if (result.length > 0 && result[0].values.length > 0) {
    id = result[0].values[0][0];
  }
  
  saveDb();
  return { id, meetingNo, title, hostName };
};

const getMeetingByNo = (meetingNo) => {
  const stmt = db.prepare('SELECT * FROM meetings WHERE meetingNo = ?');
  stmt.bind([meetingNo]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
};

const getMeetingById = (id) => {
  const stmt = db.prepare('SELECT * FROM meetings WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
};

const updateMeetingStatus = (id, status) => {
  const actualTime = status === 'ended' ? 'actualEndTime' : 'actualStartTime';
  const time = new Date().toISOString();
  db.run(`UPDATE meetings SET status = ?, ${actualTime} = ? WHERE id = ?`, [status, time, id]);
  saveDb();
};

const addParticipant = (meetingId, name, isHost) => {
  const joinedAt = new Date().toISOString();
  db.run('INSERT INTO participants (meetingId, name, isHost, joinedAt) VALUES (?,?,?,?)', [meetingId, name, isHost ? 1 : 0, joinedAt]);
  
  const result = db.exec('SELECT id FROM participants WHERE rowid = last_insert_rowid()');
  let id = 0;
  if (result.length > 0 && result[0].values.length > 0) {
    id = result[0].values[0][0];
  }
  
  saveDb();
  return { id, meetingId, name, isHost: !!isHost, joinedAt };
};

const getParticipants = (meetingId) => {
  const stmt = db.prepare('SELECT * FROM participants WHERE meetingId = ?');
  stmt.bind([meetingId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
};

const addChatMessage = (meetingId, senderName, content) => {
  const createdAt = new Date().toISOString();
  db.run('INSERT INTO chat_messages (meetingId, senderName, content, createdAt) VALUES (?,?,?,?)', [meetingId, senderName, content, createdAt]);
  
  const result = db.exec('SELECT id FROM chat_messages WHERE rowid = last_insert_rowid()');
  let id = 0;
  if (result.length > 0 && result[0].values.length > 0) {
    id = result[0].values[0][0];
  }
  
  saveDb();
  return { id, meetingId, senderName, content, createdAt };
};

const getChatMessages = (meetingId) => {
  const stmt = db.prepare('SELECT * FROM chat_messages WHERE meetingId = ? ORDER BY createdAt ASC LIMIT 100');
  stmt.bind([meetingId]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
};

module.exports = { initDb, createMeeting, getMeetingByNo, getMeetingById, updateMeetingStatus, addParticipant, getParticipants, addChatMessage, getChatMessages };
