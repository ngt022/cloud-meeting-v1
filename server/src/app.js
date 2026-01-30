require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { 
  initDb,
  createMeeting, getMeetingByNo, getMeetingById, updateMeetingStatus,
  addParticipant, getParticipants,
  addChatMessage, getChatMessages
} = require('./models');

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// 初始化数据库
initDb().then(() => {
  console.log('Database initialized');
}).catch(err => {
  console.error('Database init failed:', err);
});

// 中间件
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../dist')));

// API 路由
app.post('/api/meetings', (req, res) => {
  try {
    const { title, hostName, password } = req.body;
    if (!title || !hostName) {
      return res.status(400).json({ success: false, message: '请填写会议名称和您的名称' });
    }

    const meeting = createMeeting(title, hostName, password || null);
    addParticipant(meeting.id, hostName, true);

    res.json({
      success: true,
      data: {
        meetingId: meeting.id,
 meeting.meetingNo,
        title:        meetingNo: meeting.title,
        hostName: meeting.hostName
      }
    });
  } catch (error) {
    console.error('创建会议失败:', error);
    res.status(500).json({ success: false, message: '创建会议失败' });
  }
});

app.get('/api/meetings/:meetingNo', (req, res) => {
  try {
    const meeting = getMeetingByNo(req.params.meetingNo);

    if (!meeting) {
      return res.status(404).json({ success: false, message: '会议不存在' });
    }

    const participants = getParticipants(meeting.id);
    const chats = getChatMessages(meeting.id);

    res.json({
      success: true,
      data: {
        meeting: {
          id: meeting.id,
          meetingNo: meeting.meetingNo,
          title: meeting.title,
          hostName: meeting.hostName,
          password: !!meeting.password,
          status: meeting.status
        },
        participants,
        chats
      }
    });
  } catch (error) {
    console.error('获取会议信息失败:', error);
    res.status(500).json({ success: false, message: '获取会议信息失败' });
  }
});

app.post('/api/meetings/:id/join', (req, res) => {
  try {
    const { name, password } = req.body;
    const meeting = getMeetingById(req.params.id);

    if (!meeting) {
      return res.status(404).json({ success: false, message: '会议不存在' });
    }

    if (meeting.password && meeting.password !== password) {
      return res.status(401).json({ success: false, message: '会议密码错误' });
    }

    const participant = addParticipant(meeting.id, name, false);
    if (meeting.status === 'waiting') {
      updateMeetingStatus(meeting.id, 'ongoing');
    }

    res.json({
      success: true,
      data: {
        participantId: participant.id,
        meetingNo: meeting.meetingNo
      }
    });
  } catch (error) {
    console.error('加入会议失败:', error);
    res.status(500).json({ success: false, message: '加入会议失败' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Socket.IO 信令
const rooms = new Map();

io.on('connection', (socket) => {
  socket.on('join-room', ({ meetingId, participantId, participantName }) => {
    socket.join(`room:${meetingId}`);
    
    const room = rooms.get(meetingId) || new Map();
    room.set(socket.id, { id: participantId, name: participantName });
    rooms.set(meetingId, room);

    socket.to(`room:${meetingId}`).emit('user-joined', {
      socketId: socket.id,
      participantId,
      participantName
    });

    const users = Array.from(room.entries()).map(([id, user]) => ({
      socketId: id,
      ...user
    }));
    socket.emit('room-users', users);
  });

  socket.on('offer', ({ meetingId, offer, targetSocketId }) => {
    socket.to(targetSocketId).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ meetingId, answer, targetSocketId }) => {
    socket.to(targetSocketId).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ meetingId, candidate, targetSocketId }) => {
    socket.to(targetSocketId).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('chat-message', ({ meetingId, senderName, content }) => {
    const chat = addChatMessage(meetingId, senderName, content);
    io.to(`room:${meetingId}`).emit('chat-message', { 
      senderName, 
      content, 
      time: chat.createdAt 
    });
  });

  socket.on('leave-room', ({ meetingId }) => {
    socket.leave(`room:${meetingId}`);
    const room = rooms.get(meetingId);
    if (room) {
      room.delete(socket.id);
      if (room.size === 0) {
        rooms.delete(meetingId);
      }
    }
    socket.to(`room:${meetingId}`).emit('user-left', { socketId: socket.id });
  });

  socket.on('disconnect', () => {
    rooms.forEach((room, meetingId) => {
      if (room.has(socket.id)) {
        room.delete(socket.id);
        io.to(`room:${meetingId}`).emit('user-left', { socketId: socket.id });
        if (room.size === 0) {
          rooms.delete(meetingId);
        }
      }
    });
  });
});

// 前端路由 (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`🚀 CloudMeeting running on http://localhost:${PORT}`);
});
