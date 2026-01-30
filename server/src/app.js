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
  addChatMessage, getChatMessages,
  deleteMeeting, deleteParticipants, deleteChatMessages
} = require('./models');

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../dist')));

// 结束会议
app.post('/api/meetings/:id/end', (req, res) => {
  try {
    const { id } = req.params;
    updateMeetingStatus(id, 'ended');
    // 清理数据
    deleteChatMessages(id);
    deleteParticipants(id);
    deleteMeeting(id);
    
    io.to(`room:${id}`).emit('meeting-ended');
    res.json({ success: true });
  } catch (error) {
    console.error('结束会议失败:', error);
    res.status(500).json({ success: false, message: '操作失败' });
  }
});

// 静音参会者
app.post('/api/meetings/:id/mute/:participantId', (req, res) => {
  try {
    const { id, participantId } = req.params;
    const { mute } = req.body;
    io.to(`room:${id}`).emit('participant-muted', { 
      participantId: parseInt(participantId), 
      muted: mute 
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: '操作失败' });
  }
});

// 移出参会者
app.post('/api/meetings/:id/remove/:participantId', (req, res) => {
  try {
    const { id, participantId } = req.params;
    io.to(`room:${id}`).emit('participant-removed', { 
      participantId: parseInt(participantId) 
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: '操作失败' });
  }
});

// 锁定/解锁会议
app.post('/api/meetings/:id/lock', (req, res) => {
  try {
    const { id } = req.params;
    io.to(`room:${id}`).emit('meeting-locked');
    res.json({ success: true, locked: true });
  } catch (error) {
    res.status(500).json({ success: false, message: '操作失败' });
  }
});

app.post('/api/meetings/:id/unlock', (req, res) => {
  try {
    const { id } = req.params;
    io.to(`room:${id}`).emit('meeting-unlocked');
    res.json({ success: true, locked: false });
  } catch (error) {
    res.status(500).json({ success: false, message: '操作失败' });
  }
});

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
        meetingNo: meeting.meetingNo,
        title: meeting.title,
        hostName: meeting.hostName
      }
    });
  } catch (error) {
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
    if (meeting.status === 'ended') {
      return res.status(410).json({ success: false, message: '会议已结束' });
    }
    if (meeting.password && meeting.password !== password) {
      return res.status(401).json({ success: false, message: '会议密码错误' });
    }
    const participant = addParticipant(meeting.id, name, meeting.hostName === name);
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
    res.status(500).json({ success: false, message: '加入会议失败' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 房间管理
const rooms = new Map();
const roomLastActivity = new Map();

// 自动清理空房间（每30秒检查一次）
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, meetingId) => {
    const lastActivity = roomLastActivity.get(meetingId) || now;
    // 1分钟无活动则结束会议
    if (room.size === 0 && now - lastActivity > 60000) {
      console.log(`Auto-ending meeting ${meetingId} (no activity for 1 min)`);
      updateMeetingStatus(meetingId, 'ended');
      deleteChatMessages(meetingId);
      deleteParticipants(meetingId);
      deleteMeeting(meetingId);
      rooms.delete(meetingId);
      roomLastActivity.delete(meetingId);
    }
  });
}, 30000);

// 更新活动时间的函数
const updateActivity = (meetingId) => {
  roomLastActivity.set(meetingId, Date.now());
};

io.on('connection', (socket) => {
  socket.on('join-room', ({ meetingId, participantId, participantName, isHost }) => {
    updateActivity(meetingId);
    socket.join(`room:${meetingId}`);
    const room = rooms.get(meetingId) || new Map();
    room.set(socket.id, { 
      id: participantId, 
      name: participantName, 
      isHost: isHost || false,
      muted: !isHost,
      socketId: socket.id
    });
    rooms.set(meetingId, room);
    
    socket.to(`room:${meetingId}`).emit('user-joined', {
      socketId: socket.id,
      participantId,
      participantName,
      isHost
    });
    
    const users = Array.from(room.entries()).map(([id, user]) => ({
      socketId: id,
      ...user
    }));
    socket.emit('room-users', users);
  });

  socket.on('mute-self', ({ meetingId, muted }) => {
    const room = rooms.get(meetingId);
    if (room && room.has(socket.id)) {
      room.get(socket.id).muted = muted;
    }
  });

  socket.on('chat-message', ({ meetingId, senderName, content }) => {
    updateActivity(meetingId);
    const chat = addChatMessage(meetingId, senderName, content);
    io.to(`room:${meetingId}`).emit('chat-message', { 
      senderName, 
      content, 
      time: chat.createdAt 
    });
  });

  socket.on('leave-room', ({ meetingId }) => {
    updateActivity(meetingId);
    socket.leave(`room:${meetingId}`);
    const room = rooms.get(meetingId);
    if (room) {
      const user = room.get(socket.id);
      room.delete(socket.id);
      if (room.size === 0) {
        // 触发立即检查
        updateActivity(meetingId);
      }
      socket.to(`room:${meetingId}`).emit('user-left', { socketId: socket.id, participantId: user?.id });
    }
  });

  socket.on('disconnect', () => {
    rooms.forEach((room, meetingId) => {
      if (room.has(socket.id)) {
        updateActivity(meetingId);
        const user = room.get(socket.id);
        room.delete(socket.id);
        io.to(`room:${meetingId}`).emit('user-left', { socketId: socket.id, participantId: user?.id });
      }
    });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

const PORT = process.env.PORT || 3000;

initDb().then(() => {
  console.log('Database initialized');
  httpServer.listen(PORT, () => {
    console.log(`CloudMeeting running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Database init failed:', err);
  process.exit(1);
});
