<template>
  <div class="meeting">
    <!-- 顶部栏 -->
    <header class="header">
      <div class="meeting-info">
        <span class="title">{{ meeting?.title }}</span>
        <span class="meeting-no">会议号: {{ meeting?.meetingNo }}</span>
      </div>
      <div class="header-actions">
        <span class="time">{{ duration }}</span>
        <span class="users">👥 {{ participants.length + 1 }}人</span>
      </div>
    </header>

    <!-- 视频区域 -->
    <div class="video-container" :class="{ 'with-chat': showChat }">
      <!-- 主视频 -->
      <div class="main-video">
        <video ref="localVideo" autoplay muted playsinline></video>
        <div class="video-label">
          <span>我 {{ isMuted ? '🔇' : '' }}</span>
        </div>
      </div>

      <!-- 小窗口 -->
      <div class="participants">
        <div 
          v-for="user in otherParticipants" 
          :key="user.socketId"
          class="participant"
          @click="switchVideo(user)"
        >
          <div class="participant-video">
            <video :ref="el => setVideoRef(el, user.socketId)" autoplay playsinline></video>
            <div class="video-label">{{ user.name }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 控制栏 -->
    <footer class="controls">
      <button :class="['control-btn', isMuted && 'active']" @click="toggleMute">
        {{ isMuted ? '🔇' : '🎤' }}
      </button>
      <button :class="['control-btn', isVideoOff && 'active']" @click="toggleVideo">
        {{ isVideoOff ? '📷' : '📹' }}
      </button>
      <button :class="['control-btn', isScreenSharing && 'active']" @click="toggleScreenShare">
        🖥️
      </button>
      <button :class="['control-btn', showChat && 'active']" @click="showChat = !showChat">
        💬
      </button>
      <button class="control-btn danger" @click="leaveMeeting">
        📴
      </button>
    </footer>

    <!-- 聊天面板 -->
    <aside class="chat-panel" v-if="showChat">
      <div class="chat-header">
        <span>聊天</span>
        <button @click="showChat = false">×</button>
      </div>
      <div class="chat-messages" ref="chatContainer">
        <div v-for="(msg, i) in messages" :key="i" :class="['chat-msg', msg.isSelf && 'self']">
          <span class="sender">{{ msg.name }}</span>
          <span class="content">{{ msg.content }}</span>
        </div>
      </div>
      <div class="chat-input">
        <input v-model="chatMsg" placeholder="输入消息..." @keyup.enter="sendMessage" />
        <button @click="sendMessage">发送</button>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { io } from 'socket.io-client'

const route = useRoute()
const router = useRouter()

const meeting = ref(null)
const participants = ref([])
const messages = ref([])
const localVideo = ref(null)
const videoRefs = ref({})
const chatContainer = ref(null)

const socket = ref(null)
const isMuted = ref(false)
const isVideoOff = ref(false)
const isScreenSharing = ref(false)
const showChat = ref(false)
const chatMsg = ref('')
const duration = ref('00:00')
const startTime = Date.now()

const otherParticipants = computed(() => participants.value.filter(p => p.socketId !== socket.value?.id))

const setVideoRef = (el, socketId) => {
  if (el) videoRefs.value[socketId] = el
}

const initMedia = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    if (localVideo.value) localVideo.value.srcObject = stream
  } catch (e) {
    console.warn('无法访问媒体设备:', e)
  }
}

const connectSocket = () => {
  socket.value = io()
  
  socket.value.on('connect', () => {
    socket.value.emit('join-room', {
      meetingId: route.params.id,
      participantId: Date.now(),
      participantName: localStorage.getItem('userName') || '匿名'
    })
  })

  socket.value.on('room-users', (users) => {
    participants.value = users
  })

  socket.value.on('user-joined', (user) => {
    participants.value.push(user)
    messages.value.push({ name: '系统', content: `${user.participantName} 加入了会议`, isSelf: false })
  })

  socket.value.on('user-left', ({ socketId }) => {
    const user = participants.value.find(p => p.socketId === socketId)
    if (user) {
      messages.value.push({ name: '系统', content: `${user.name} 离开了会议`, isSelf: false })
    }
    participants.value = participants.value.filter(p => p.socketId !== socketId)
  })

  socket.value.on('offer', async ({ offer, from }) => {
    const pc = getPeerConnection(from)
    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket.value.emit('answer', { meetingId: route.params.id, answer, targetSocketId: from })
  })

  socket.value.on('answer', async ({ answer, from }) => {
    const pc = getPeerConnection(from)
    await pc.setRemoteDescription(new RTCSessionDescription(answer))
  })

  socket.value.on('ice-candidate', async ({ candidate, from }) => {
    const pc = getPeerConnection(from)
    if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate))
  })

  socket.value.on('chat-message', (msg) => {
    messages.value.push(msg)
    nextTick(() => {
      if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    })
  })
}

const peerConnections = new Map()
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

const getPeerConnection = (targetSocketId) => {
  if (!peerConnections.has(targetSocketId)) {
    const pc = new RTCPeerConnection(config)
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.value.emit('ice-candidate', { meetingId: route.params.id, candidate: e.candidate, targetSocketId })
      }
    }
    pc.ontrack = (e) => {
      const videoEl = videoRefs.value[targetSocketId]
      if (videoEl && e.streams[0]) {
        videoEl.srcObject = e.streams[0]
      }
    }
    
    if (localVideo.value?.srcObject) {
      localVideo.value.srcObject.getTracks().forEach(track => pc.addTrack(track, localVideo.value.srcObject))
    }
    
    peerConnections.set(targetSocketId, pc)
  }
  return peerConnections.get(targetSocketId)
}

const fetchMeeting = async () => {
  try {
    const res = await fetch(`/api/meetings/${route.params.id}`)
    const data = await res.json()
    if (data.success) {
      meeting.value = data.data.meeting
      messages.value = data.data.chats.map(c => ({ name: c.senderName, content: c.content, isSelf: false }))
    } else {
      alert('会议不存在')
      router.push('/')
    }
  } catch (e) {
    router.push('/')
  }
}

const toggleMute = () => {
  isMuted.value = !isMuted.value
  if (localVideo.value?.srcObject) {
    localVideo.value.srcObject.getAudioTracks().forEach(t => t.enabled = !isMuted.value)
  }
}

const toggleVideo = () => {
  isVideoOff.value = !isVideoOff.value
  if (localVideo.value?.srcObject) {
    localVideo.value.srcObject.getVideoTracks().forEach(t => t.enabled = !isVideoOff.value)
  }
}

const toggleScreenShare = async () => {
  if (isScreenSharing.value) {
    isScreenSharing.value = false
    initMedia()
  } else {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      if (localVideo.value) localVideo.value.srcObject = stream
      isScreenSharing.value = true
      stream.getVideoTracks()[0].onended = () => {
        isScreenSharing.value = false
        initMedia()
      }
    } catch {
      alert('屏幕共享失败')
    }
  }
}

const sendMessage = async () => {
  if (!chatMsg.value.trim()) return
  const name = localStorage.getItem('userName') || '匿名'
  socket.value.emit('chat-message', { meetingId: route.params.id, senderName: name, content: chatMsg.value })
  messages.value.push({ name: name, content: chatMsg.value, isSelf: true })
  chatMsg.value = ''
}

const leaveMeeting = () => {
  socket.value?.emit('leave-room', { meetingId: route.params.id })
  socket.value?.disconnect()
  router.push('/')
}

let timer = null
const updateDuration = () => {
  const diff = Math.floor((Date.now() - startTime) / 1000)
  const m = Math.floor(diff / 60)
  const s = diff % 60
  duration.value = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

onMounted(async () => {
  await fetchMeeting()
  await initMedia()
  connectSocket()
  timer = setInterval(updateDuration, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  peerConnections.forEach(pc => pc.close())
  socket.value?.disconnect()
  if (localVideo.value?.srcObject) {
    localVideo.value.srcObject.getTracks().forEach(t => t.stop())
  }
})
</script>

<style scoped>
.meeting {
  height: 100vh;
  background: #0f0f1a;
  display: flex;
  flex-direction: column;
  margin: -20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: rgba(255,255,255,0.05);
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.meeting-info .title { color: #fff; font-size: 16px; font-weight: 500; margin-right: 16px; }
.meeting-info .meeting-no { color: rgba(255,255,255,0.5); font-size: 14px; }
.header-actions { display: flex; gap: 16px; color: rgba(255,255,255,0.7); font-size: 14px; }

.video-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
}

.video-container.with-chat { margin-right: 320px; }

.main-video {
  flex: 1;
  background: #1a1a2e;
  border-radius: 16px;
  position: relative;
  overflow: hidden;
}

.main-video video { width: 100%; height: 100%; object-fit: cover; }
.video-label { position: absolute; bottom: 12px; left: 12px; background: rgba(0,0,0,0.5); padding: 6px 12px; border-radius: 6px; color: #fff; font-size: 14px; }

.participants { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
.participant { width: 120px; height: 80px; flex-shrink: 0; cursor: pointer; }
.participant-video { width: 100%; height: 100%; background: #1a1a2e; border-radius: 8px; overflow: hidden; position: relative; }
.participant-video video { width: 100%; height: 100%; object-fit: cover; }
.participant-video .video-label { font-size: 12px; padding: 4px 8px; }

.controls {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  background: rgba(255,255,255,0.05);
  border-top: 1px solid rgba(255,255,255,0.1);
}

.control-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.1);
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  transition: all 0.3s;
}

.control-btn:hover { background: rgba(255,255,255,0.2); }
.control-btn.active { background: #ff4d4f; }
.control-btn.danger { background: #ff4d4f; }

.chat-panel {
  position: fixed;
  right: 0;
  top: 0;
  width: 320px;
  height: 100vh;
  background: #fff;
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
}

.chat-header button { width: 32px; height: 32px; border-radius: 50%; border: none; background: #f3f4f6; font-size: 20px; cursor: pointer; }

.chat-messages { flex: 1; overflow-y: auto; padding: 16px; }

.chat-msg { margin-bottom: 12px; }
.chat-msg .sender { display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px; }
.chat-msg .content { display: inline-block; padding: 10px 14px; background: #f3f4f6; border-radius: 12px; font-size: 14px; }
.chat-msg.self { text-align: right; }
.chat-msg.self .content { background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; }

.chat-input {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #e5e7eb;
}

.chat-input input { flex: 1; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; outline: none; }
.chat-input button { padding: 10px 20px; background: #667eea; color: #fff; border: none; border-radius: 8px; cursor: pointer; }

@media (max-width: 768px) {
  .video-container.with-chat { margin-right: 0; }
  .chat-panel { width: 100%; }
  .participants { display: none; }
  .control-btn { width: 48px; height: 48px; font-size: 20px; }
}
</style>
