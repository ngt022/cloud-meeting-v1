const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/meeting.db');
console.log('Database path:', dbPath);

const db = new Database(dbPath);

// 删除旧表重新创建
db.exec('DROP TABLE IF EXISTS participants');
db.exec('DROP TABLE IF EXISTS chat_messages');
db.exec('DROP TABLE IF EXISTS meetings');

// 重新创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
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
  );

  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meetingId INTEGER NOT NULL,
    name TEXT NOT NULL,
    isHost INTEGER DEFAULT 0,
    joinedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meetingId INTEGER NOT NULL,
    senderName TEXT NOT NULL,
    content TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('Database tables created');

const generateMeetingNo = () => Math.random().toString().substring(2, 12);

// Meetings
const createMeeting = (title, hostName, password) => {
  const meetingNo = generateMeetingNo();
  const actualStartTime = new Date().toISOString();
  
  const stmt = db.prepare('INSERT INTO meetings (title, hostName, meetingNo, password, status, actualStartTime) VALUES (?, ?, ?, ?, ?, ?)');
  const result = stmt.run(title, hostName, meetingNo, password || null, 'waiting', actualStartTime);
  
  const id = result.lastInsertRowid;
  console.log('Meeting created:', { id, meetingNo, title });
  
  return { id, meetingNo, title, hostName };
};

const getMeetingByNo = (meetingNo) => {
  return db.prepare('SELECT * FROM meetings WHERE meetingNo = ?').get(meetingNo);
};

const getMeetingById = (id) => {
  return db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
};

const updateMeetingStatus = (id, status) => {
  const actualTime = status === 'ended' ? 'actualEndTime' : 'actualStartTime';
  const time = new Date().toISOString();
  db.prepare('UPDATE meetings SET status = ?, ' + actualTime + ' = ? WHERE id = ?').run(status, time, id);
};

// Participants
const addParticipant = (meetingId, name, isHost) => {
  const joinedAt = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO participants (meetingId, name, isHost, joinedAt) VALUES (?, ?, ?, ?)');
  const result = stmt.run(meetingId, name, isHost ? 1 : 0, joinedAt);
  
  const id = result.lastInsertRowid;
  return { id, meetingId, name, isHost: !!isHost, joinedAt };
};

const getParticipants = (meetingId) => {
  return db.prepare('SELECT * FROM participants WHERE meetingId = ?').all(meetingId);
};

// Chat
const addChatMessage = (meetingId, senderName, content) => {
  const createdAt = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO chat_messages (meetingId, senderName, content, createdAt) VALUES (?, ?, ?, ?)');
  const result = stmt.run(meetingId, senderName, content, createdAt);
  return { id: result.lastInsertRowid, meetingId, senderName, content, createdAt };
};

const getChatMessages = (meetingId) => {
  return db.prepare('SELECT * FROM chat_messages WHERE meetingId = ? ORDER BY createdAt ASC LIMIT 100').all(meetingId);
};

module.exports = {
  db,
  createMeeting,
  getMeetingByNo,
  getMeetingById,
  updateMeetingStatus,
  addParticipant,
  getParticipants,
  addChatMessage,
  getChatMessages
};
