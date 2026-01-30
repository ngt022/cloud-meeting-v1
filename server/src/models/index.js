const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join('/tmp', 'meeting.db');

let db = null;
let SQL = null;

const initDb = async () => {
  if (db) return db;
  console.log('Initializing database...');
  SQL = await initSqlJs();
  
  if (fs.existsSync(dbPath)) {
    console.log('Loading existing database from:', dbPath);
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    console.log('Creating new database at:', dbPath);
    db = new SQL.Database();
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
    saveDb();
  }
  console.log('Database initialized, row count:', db.exec('SELECT COUNT(*) FROM meetings')[0].values[0][0]);
  return db;
};

const saveDb = () => {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
      console.log('Database saved');
    } catch (err) {
      console.error('Save failed:', err.message);
    }
  }
};

const generateMeetingNo = () => Math.random().toString().substring(2, 12);

const createMeeting = (title, hostName, password) => {
  const meetingNo = generateMeetingNo();
  const actualStartTime = new Date().toISOString();
  console.log('Creating meeting:', meetingNo, title);
  
  db.run('INSERT INTO meetings (title, hostName, meetingNo, password, status, actualStartTime, maxParticipants, createdAt) VALUES (?,?,?,?,?,?,?,?)', 
    [title, hostName, meetingNo, password || null, 'waiting', actualStartTime, 100, new Date().toISOString()]);
  
  saveDb();
  
  // Verify by querying all meetings
  const all = db.exec('SELECT id, meetingNo, title FROM meetings');
  console.log('All meetings after insert:', all.length > 0 ? all[0].values : 'none');
  
  // Return meeting info
  return { id: Date.now(), meetingNo, title, hostName };
};

const getMeetingByNo = (meetingNo) => {
  console.log('Querying meeting:', meetingNo);
  const stmt = db.prepare('SELECT * FROM meetings WHERE meetingNo = ?');
  stmt.bind([meetingNo]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    console.log('Found:', row);
    return row;
  }
  stmt.free();
  console.log('Not found');
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

module.exports = { initDb, createMeeting, getMeetingByNo, getMeetingById, updateMeetingStatus, addParticipant, getParticipants, addChatMessage, getChatMessages };
