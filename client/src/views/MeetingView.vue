<template>
  <div class="meeting">
    <!-- 顶部栏 -->
    <header class="header">
      <div class="meeting-info">
        <span class="title">{{ meeting?.title }}</span>
        <span class="meeting-no">{{ meeting?.meetingNo }}</span>
      </div>
      <div class="header-actions">
        <button class="btn-copy" @click="copyLink" :class="{ copied }">
          {{ copied ? '已复制' : '复制链接' }}
        </button>
        <button class="btn-lock" @click="toggleLock" :class="{ locked }">
          {{ locked ? '已锁定' : '锁定会议' }}
        </button>
        <span class="time">{{ duration }}</span>
        <span class="users">{{ participants.length + 1 }}人</span>
      </div>
    </header>

    <!-- 会议内容区 -->
    <div class="meeting-content" :class="{ 'with-chat': showChat }">
      <!-- 语音状态显示 -->
      <div class="audio-area">
        <div class="audio-visual">
          <div class="wave" :class="{ active: !isMuted && canSpeak }">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="status-text">
            <span v-if="isMuted" class="muted">静音中</span>
            <span v-else-if="!canSpeak" class="no-speak">等待主持人允许发言</span>
            <span v-else class="speaking">可以发言</span>
          </div>
        </div>
        
        <!-- 参会者列表 -->
        <div class="participants-section">
          <div class="participant-card" :class="{ 'is-host': isHost, 'is-self': true }">
            <div class="avatar">{{ (localName || '我').charAt(0).toUpperCase() }}</div>
            <div class="info">
              <span class="name">{{ localName || '我' }} {{ isHost ? '(主持人)' : '' }}</span>
              <span class="status">{{ isMuted ? '静音' : (canSpeak ? '在线' : '等待发言') }}</span>
            </div>
            <div class="actions" v-if="isHost">
              <button :class="['btn-action', isMuted && 'active']" @click="toggleMute">
                {{ isMuted ? '取消静音' : '静音' }}
              </button>
            </div>
          </div>
          
          <div v-for="user in participants" :key="user.socketId" 
               class="participant-card" 
               :class="{ 'is-host': user.isHost, 'muted': user.muted }">
            <div class="avatar">{{ user.name.charAt(0).toUpperCase() }}</div>
            <div class="info">
              <span class="name">{{ user.name }} {{ user.isHost ? '(主持人)' : '' }}</span>
              <span class="status">{{ user.muted ? '已静音' : '在线' }}</span>
            </div>
            <div class="actions" v-if="isHost && !user.isHost">
              <button :class="['btn-action', user.muted && 'active']" @click="muteParticipant(user)">
                {{ user.muted ? '取消静音' : '静音' }}
              </button>
              <button class="btn-remove" @click="removeParticipant(user)">
                移出
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 控制栏 -->
    <footer class="controls">
      <button :class="['control-btn', isMuted && 'active']" @click="toggleMute" :disabled="!canSpeak && !isHost">
        {{ isMuted ? '取消静音' : '静音' }}
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
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { io } from 'socket.io-client'

const route = useRoute()
const router = useRouter()

const meeting = ref(null)
const participants = ref([])
const messages = ref([])
const chatContainer = ref(null)
const localName = ref('')
const localParticipantId = ref(null)
const copied = ref(false)
const isHost = ref(false)
const locked = ref(false)

const socket = ref(null)
const isMuted = ref(true) // 默认静音
const showChat = ref(false)
const chatMsg = ref('')
const duration = ref('00:00')
const startTime = Date.now()

const canSpeak = computed(() => !isMuted.value && (isHost.value || !locked.value))

const copyLink = async () => {
  const link = window.location.origin + '/meeting/' + route.params.no
  try {
    await navigator.clipboard.writeText(link)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (e) {
    const textArea = document.createElement('textarea')
    textArea.value = link
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

const toggleLock = async () => {
  try {
    const url = locked.value 
      ? `/api/meetings/${meeting.value.id}/unlock`
      : `/api/meetings/${meeting.value.id}/lock`
    
    const res = await fetch(url, { method: 'POST' })
    const data = await res.json()
    
    if (data.success) {
      locked.value = data.locked
    }
  } catch (e) {
    console.error('锁定操作失败:', e)
  }
}

const muteParticipant = async (user) => {
  const mute = !user.muted
  try {
    await fetch(`/api/meetings/${meeting.value.id}/mute/${user.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mute })
    })
  } catch (e) {
    console.error('静音操作失败:', e)
  }
}

const removeParticipant = async (user) => {
  if (confirm(`确定要将 ${user.name} 移出会议吗？`)) {
    try {
      await fetch(`/api/meetings/${meeting.value.id}/remove/${user.id}`, {
        method: 'POST'
      })
    } catch (e) {
      console.error('移出操作失败:', e)
    }
  }
}

const initAudio = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // 保存音频流但不自动播放，等待主持人允许
    window.localAudioStream = stream
  } catch (e) {
    console.warn('无法访问麦克风:', e)
  }
}

const connectSocket = () => {
  socket.value = io()
  
  socket.value.on('connect', () => {
    socket.value.emit('join-room', {
      meetingId: route.params.no,
      participantId: localParticipantId.value,
      participantName: localName.value || '匿名',
      isHost: isHost.value
    })
  })

  socket.value.on('room-users', (users) => {
    participants.value = users
  })

  socket.value.on('user-joined', (user) => {
    participants.value.push(user)
    messages.value.push({ name: '系统', content: `${user.participantName} 加入了会议`, isSelf: false })
  })

  socket.value.on('user-left', ({ socketId, participantId }) => {
    const user = participants.value.find(p => p.socketId === socketId || p.id === participantId)
    if (user) {
      messages.value.push({ name: '系统', content: `${user.name} 离开了会议`, isSelf: false })
    }
    participants.value = participants.value.filter(p => p.socketId !== socketId && p.id !== participantId)
  })

  socket.value.on('participant-muted', ({ participantId, muted }) => {
    // 如果是自己被静音
    if (participantId === localParticipantId.value) {
      isMuted.value = muted
      if (window.localAudioStream) {
        window.localAudioStream.getAudioTracks().forEach(t => t.enabled = !muted)
      }
    }
    
    const user = participants.value.find(p => p.id === participantId)
    if (user) {
      user.muted = muted
    }
  })

  socket.value.on('participant-removed', ({ participantId }) => {
    if (participantId === localParticipantId.value) {
      alert('您已被移出会议')
      socket.value?.disconnect()
      router.push('/')
    } else {
      const user = participants.value.find(p => p.id === participantId)
      if (user) {
        messages.value.push({ name: '系统', content: `${user.name} 已被移出会议`, isSelf: false })
      }
      participants.value = participants.value.filter(p => p.id !== participantId)
    }
  })

  socket.value.on('meeting-locked', () => {
    locked.value = true
    messages.value.push({ name: '系统', content: '会议已锁定，新参会者需要等待主持人允许才能发言', isSelf: false })
  })

  socket.value.on('meeting-unlocked', () => {
    locked.value = false
    messages.value.push({ name: '系统', content: '会议已解锁，所有参会者可以发言', isSelf: false })
  })

  socket.value.on('chat-message', (msg) => {
    messages.value.push(msg)
    nextTick(() => {
      if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    })
  })
}

const fetchMeeting = async () => {
  try {
    const res = await fetch(`/api/meetings/${route.params.no}`)
    const data = await res.json()
    if (data.success) {
      meeting.value = data.data.meeting
      
      const myName = route.query.name || localStorage.getItem('userName') || ''
      isHost.value = data.data.meeting.hostName === myName
      
      // 主持人默认可以发言，其他人默认静音
      if (!isHost.value) {
        isMuted.value = true
      }
      
      localParticipantId.value = Date.now()
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
  if (!isHost.value && locked.value) {
    alert('请等待主持人允许发言')
    return
  }
  
  isMuted.value = !isMuted.value
  if (window.localAudioStream) {
    window.localAudioStream.getAudioTracks().forEach(t => t.enabled = !isMuted.value)
  }
  
  // 通知其他人
  if (socket.value) {
    socket.value.emit('mute-self', { muted: isMuted.value })
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
  if (window.localAudioStream) {
    window.localAudioStream.getTracks().forEach(t => t.stop())
  }
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
  await initAudio()
  connectSocket()
  timer = setInterval(updateDuration, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  socket.value?.disconnect()
  if (window.localAudioStream) {
    window.localAudioStream.getTracks().forEach(t => t.stop())
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

.meeting-info { display: flex; align-items: center; gap: 20px; }
.meeting-info .title { color: #fff; font-size: 16px; font-weight: 500; }
.meeting-info .meeting-no { color: #666; font-size: 14px; font-family: monospace; }

.header-actions { display: flex; align-items: center; gap: 16px; }

.btn-copy, .btn-lock {
  padding: 8px 16px;
  background: #222;
  color: #fff;
  border: 1px solid #333;
  border-radius: 2px;
  font-size: 12px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-copy:hover, .btn-lock:hover { background: #333; }
.btn-copy.copied { background: #fff; color: #000; border-color: #fff; }
.btn-lock.locked { background: #ff4d4f; border-color: #ff4d4f; }

.time, .users { color: #888; font-size: 14px; }

.meeting-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 40px;
  gap: 40px;
  overflow-y: auto;
}

.meeting-content.with-chat { margin-right: 340px; }

.audio-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 40px;
}

.audio-visual {
  text-align: center;
}

.wave {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  height: 80px;
  margin-bottom: 16px;
}

.wave span {
  width: 4px;
  height: 20px;
  background: #333;
  border-radius: 2px;
  transition: all 0.3s;
}

.wave.active span {
  background: #fff;
  animation: wave 1s ease-in-out infinite;
}

.wave span:nth-child(1) { animation-delay: 0s; }
.wave span:nth-child(2) { animation-delay: 0.1s; }
.wave span:nth-child(3) { animation-delay: 0.2s; }
.wave span:nth-child(4) { animation-delay: 0.3s; }
.wave span:nth-child(5) { animation-delay: 0.4s; }

@keyframes wave {
  0%, 100% { height: 20px; }
  50% { height: 60px; }
}

.status-text { color: #888; font-size: 14px; letter-spacing: 2px; }
.status-text .muted { color: #ff4d4f; }
.status-text .no-speak { color: #ff9800; }
.status-text .speaking { color: #4caf50; }

.participants-section {
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.participant-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: #141414;
  border: 1px solid #222;
  border-radius: 4px;
  transition: all 0.2s;
}

.participant-card:hover { border-color: #333; }
.participant-card.muted { opacity: 0.6; }
.participant-card.is-host { border-color: #444; background: #1a1a1a; }
.participant-card.is-self { border-color: #444; }

.avatar {
  width: 48px;
  height: 48px;
  background: #222;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20px;
  font-weight: 500;
}

.is-host .avatar { background: #333; }

.info { flex: 1; }
.info .name { display: block; color: #fff; font-size: 16px; margin-bottom: 4px; }
.info .status { color: #666; font-size: 12px; }

.actions { display: flex; gap: 8px; }

.btn-action, .btn-remove {
  padding: 8px 16px;
  font-size: 12px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 1px;
}

.btn-action {
  background: #222;
  color: #fff;
  border: 1px solid #333;
}

.btn-action:hover { background: #333; }
.btn-action.active { background: #fff; color: #000; border-color: #fff; }

.btn-remove {
  background: transparent;
  color: #ff4d4f;
  border: 1px solid #ff4d4f;
}

.btn-remove:hover { background: #ff4d4f; color: #fff; }

.controls {
  display: flex;
  justify-content: center;
  gap: 24px;
  padding: 24px;
  background: #141414;
  border-top: 1px solid #222;
}

.control-btn {
  min-width: 120px;
  padding: 16px 24px;
  border-radius: 4px;
  border: none;
  background: #222;
  color: #fff;
  font-size: 14px;
  letter-spacing: 2px;
  cursor: pointer;
  transition: all 0.3s;
}

.control-btn:hover { background: #333; }
.control-btn.active { background: #fff; color: #000; }
.control-btn:disabled { opacity: 0.4; cursor: not-allowed; }
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
  .meeting-content.with-chat { margin-right: 0; }
  .chat-panel { width: 100%; }
  .header-actions .btn-copy, .header-actions .btn-lock { display: none; }
  .controls { gap: 16px; }
  .control-btn { min-width: 80px; padding: 14px 16px; font-size: 12px; }
}
</style>
