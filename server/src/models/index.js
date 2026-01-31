const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Render 持久化卷或临时目录
const dbPath = process.env.DB_PATH || (process.env.RENDER ? '/var/data/meeting.db' : '/tmp/meeting.db');

let db = null;
let SQL = null;

// 确保目录存在
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
}

const initDb = async () => {
  if (db) return db;
  SQL = await initSqlJs();
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  db.run(`CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    title TEXT NOT NULL, 
    hostName TEXT NOT NULL, 
    meetingNo TEXT UNIQUE NOT NULL, 
    password TEXT, 
    status TEXT DEFAULT 'waiting', 
    actualStartTime TEXT, 
    actualEndTime TEXT, 
    maxParticipants INTEGER DEFAULT 100, 
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    meetingId INTEGER NOT NULL, 
    name TEXT NOT NULL, 
    isHost INTEGER DEFAULT 0, 
    joinedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    meetingId INTEGER NOT NULL, 
    senderName TEXT NOT NULL, 
    content TEXT NOT NULL, 
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  saveDb();
  return db;
};

const saveDb = () => {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (err) {
      console.error('Save failed:', err.message);
    }
  }
};

const generateMeetingNo = () => Math.random().toString().substring(2, 12);

const createMeeting = (title, hostName, password) => {
  const meetingNo = generateMeetingNo();
  const actualStartTime = new Date().toISOString();
  
  db.run('INSERT INTO meetings (title, hostName, meetingNo, password, status, actualStartTime, maxParticipants, createdAt) VALUES (?,?,?,?,?,?,?,?)', 
    [title, hostName, meetingNo, password || null, 'waiting', actualStartTime, 100, new Date().toISOString()]);
  
  saveDb();
  return { id: Date.now(), meetingNo, title, hostName };
};

const deleteMeeting = (id) => {
  try {
    db.run('DELETE FROM meetings WHERE id = ?', [id]);
    saveDb();
    console.log(`Deleted meeting ${id}`);
  } catch (e) {
    console.error('Failed to delete meeting:', e);
  }
};

const deleteParticipants = (meetingId) => {
  try {
    db.run('DELETE FROM participants WHERE meetingId = ?', [meetingId]);
    saveDb();
    console.log(`Deleted participants for meeting ${meetingId}`);
  } catch (e) {
    console.error('Failed to delete participants:', e);
  }
};

const deleteChatMessages = (meetingId) => {
  try {
    db.run('DELETE FROM chat_messages WHERE meetingId = ?', [meetingId]);
    saveDb();
    console.log(`Deleted chat messages for meeting ${meetingId}`);
  } catch (e) {
    console.error('Failed to delete chat messages:', e);
  }
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
  saveDb();
  return { id: Date.now(), meetingId, name, isHost: !!isHost, joinedAt };
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
  saveDb();
  return { id: Date.now(), meetingId, senderName, content, createdAt };
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

module.exports = { initDb, createMeeting, getMeetingByNo, getMeetingById, updateMeetingStatus, addParticipant, getParticipants, addChatMessage, getChatMessages, deleteMeeting, deleteParticipants, deleteChatMessages };
