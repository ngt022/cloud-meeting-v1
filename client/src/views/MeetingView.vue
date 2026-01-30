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
        <span class="users">{{ participants.length + 1 }}人</span>
      </div>
    </header>

    <!-- 视频区域 -->
    <div class="video-container" :class="{ 'with-chat': showChat }">
      <!-- 主视频 -->
      <div class="main-video">
        <video ref="localVideo" autoplay muted playsinline></video>
        <div class="video-label">
          <span>{{ localName || '我' }}</span>
          <span v-if="isMuted" class="muted-icon">静音</span>
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
        {{ isMuted ? '静音' : '麦克风' }}
      </button>
      <button :class="['control-btn', isVideoOff && 'active']" @click="toggleVideo">
        {{ isVideoOff ? '关闭' : '摄像头' }}
      </button>
      <button :class="['control-btn', isScreenSharing && 'active']" @click="toggleScreenShare">
        共享
      </button>
      <button :class="['control-btn', showChat && 'active']" @click="showChat = !showChat">
        聊天
      </button>
      <button class="control-btn danger" @click="leaveMeeting">
        离开
      </button>
    </footer>

    <!-- 聊天面板 -->
    <aside class="chat-panel" v-if="showChat">
      <div class="chat-header">
        <span>聊天</span>
        <button @click="showChat = false">X</button>
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
const localName = ref('')

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
      meetingId: route.params.no,
      participantId: Date.now(),
      participantName: localName.value || '匿名'
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
    socket.value.emit('answer', { meetingId: route.params.no, answer, targetSocketId: from })
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
        socket.value.emit('ice-candidate', { meetingId: route.params.no, candidate: e.candidate, targetSocketId })
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
    const res = await fetch(`/api/meetings/${route.params.no}`)
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
  const name = localName.value || '匿名'
  socket.value.emit('chat-message', { meetingId: route.params.no, senderName: name, content: chatMsg.value })
  messages.value.push({ name: name, content: chatMsg.value, isSelf: true })
  chatMsg.value = ''
}

const leaveMeeting = () => {
  socket.value?.emit('leave-room', { meetingId: route.params.no })
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
  localName.value = route.query.name || localStorage.getItem('userName') || ''
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
  background: #0a0a0a;
  display: flex;
  flex-direction: column;
  margin: -20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #141414;
  border-bottom: 1px solid #222;
}

.meeting-info .title { color: #fff; font-size: 16px; font-weight: 500; margin-right: 20px; }
.meeting-info .meeting-no { color: #666; font-size: 14px; }
.header-actions { display: flex; gap: 24px; color: #888; font-size: 14px; }

.video-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 16px;
}

.video-container.with-chat { margin-right: 340px; }

.main-video {
  flex: 1;
  background: #141414;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
  border: 1px solid #222;
}

.main-video video { width: 100%; height: 100%; object-fit: cover; }
.video-label { 
  position: absolute; 
  bottom: 16px; 
  left: 16px; 
  background: rgba(0,0,0,0.6); 
  padding: 8px 14px; 
  border-radius: 2px; 
  color: #fff; 
  font-size: 14px;
  display: flex;
  gap: 12px;
  align-items: center;
}
.muted-icon { color: #ff4d4f; font-size: 12px; }

.participants { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 4px; }
.participant { width: 140px; height: 90px; flex-shrink: 0; cursor: pointer; }
.participant-video { width: 100%; height: 100%; background: #141414; border-radius: 4px; overflow: hidden; position: relative; border: 1px solid #222; }
.participant-video video { width: 100%; height: 100%; object-fit: cover; }
.participant-video .video-label { font-size: 12px; padding: 6px 10px; }

.controls {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding: 20px;
  background: #141414;
  border-top: 1px solid #222;
}

.control-btn {
  width: 64px;
  height: 64px;
  border-radius: 4px;
  border: none;
  background: #222;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.3s;
  letter-spacing: 1px;
}

.control-btn:hover { background: #333; }
.control-btn.active { background: #fff; color: #000; }
.control-btn.danger { background: #ff4d4f; }
.control-btn.danger:hover { background: #ff6b6b; }

.chat-panel {
  position: fixed;
  right: 0;
  top: 0;
  width: 340px;
  height: 100vh;
  background: #141414;
  display: flex;
  flex-direction: column;
  z-index: 10;
  border-left: 1px solid #222;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #222;
  font-weight: 500;
  color: #fff;
  letter-spacing: 2px;
}

.chat-header button { 
  width: 32px; 
  height: 32px; 
  border-radius: 2px; 
  border: 1px solid #333; 
  background: transparent; 
  color: #888; 
  font-size: 16px; 
  cursor: pointer; 
}

.chat-messages { flex: 1; overflow-y: auto; padding: 20px; }

.chat-msg { margin-bottom: 16px; }
.chat-msg .sender { display: block; font-size: 12px; color: #666; margin-bottom: 6px; }
.chat-msg .content { display: inline-block; padding: 12px 16px; background: #222; border-radius: 4px; font-size: 14px; color: #fff; }
.chat-msg.self { text-align: right; }
.chat-msg.self .content { background: #fff; color: #000; }

.chat-input {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid #222;
}

.chat-input input { 
  flex: 1; 
  padding: 12px 16px; 
  background: #0a0a0a; 
  border: 1px solid #222; 
  border-radius: 2px; 
  outline: none; 
  color: #fff;
  font-size: 14px;
}
.chat-input input::placeholder { color: #444; }

.chat-input button { 
  padding: 12px 24px; 
  background: #fff; 
  color: #000; 
  border: none; 
  border-radius: 2px; 
  cursor: pointer; 
  letter-spacing: 1px;
  font-size: 14px;
}

@media (max-width: 768px) {
  .video-container.with-chat { margin-right: 0; }
  .chat-panel { width: 100%; }
  .participants { display: none; }
  .control-btn { width: 56px; height: 56px; font-size: 11px; }
}
</style>
