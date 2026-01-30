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
          <div class="wave" :class="{ active: isSpeaking }">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="status-text">
            <span v-if="isHost" class="host-status">主持人</span>
            <span v-else-if="isMuted" class="muted">静音中</span>
            <span v-else-if="!canSpeak" class="no-speak">等待发言</span>
            <span v-else class="speaking">可以发言</span>
          </div>
          <!-- 音频质量指示 -->
          <div class="audio-quality" :class="qualityClass">
            <span>通话质量: {{ qualityText }}</span>
          </div>
        </div>
        
        <!-- 参会者列表 -->
        <div class="participants-section">
          <!-- 自己 -->
          <div class="participant-card host" :class="{ 'is-self': true }">
            <div class="avatar host-avatar">{{ (localName || '我').charAt(0).toUpperCase() }}</div>
            <div class="info">
              <span class="name">{{ localName || '我' }} {{ isHost ? '(主持人)' : '' }}</span>
              <span class="status">{{ isMuted ? '静音' : '在线' }}</span>
            </div>
            <div class="actions">
              <button v-if="!isHost" :class="['btn-action', isMuted && 'active']" @click="toggleMute" :disabled="!canSpeak">
                {{ isMuted ? '取消静音' : '静音' }}
              </button>
              <button v-if="isHost" class="btn-end" @click="endMeeting">结束会议</button>
            </div>
          </div>
          
          <!-- 其他参会者 -->
          <div v-for="user in participants" :key="user.socketId" 
               class="participant-card"
               :class="{ 'muted': user.muted, 'is-host': user.isHost }">
            <div class="avatar">{{ user.name.charAt(0).toUpperCase() }}</div>
            <div class="info">
              <span class="name">{{ user.name }} {{ user.isHost ? '(主持人)' : '' }}</span>
              <span class="status">
                {{ user.muted ? '已静音' : '在线' }}
                <span v-if="user.speaking" class="speaking-indicator">正在发言</span>
              </span>
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
      <button v-if="!isHost" :class="['control-btn', isMuted && 'active']" @click="toggleMute" :disabled="!canSpeak">
        {{ isMuted ? '取消静音' : '静音' }}
      </button>
      <button :class="['control-btn', showChat && 'active']" @click="showChat = !showChat">
        聊天
      </button>
      <button class="control-btn leave" @click="leaveMeeting">
        {{ isHost ? '离开会议' : '退出会议' }}
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
const isSpeaking = ref(false)
const audioQuality = ref('good') // good, fair, poor

const socket = ref(null)
const isMuted = ref(true)
const showChat = ref(false)
const chatMsg = ref('')
const duration = ref('00:00')
const startTime = Date.now()
const peerConnections = new Map()

const canSpeak = computed(() => isHost.value || !locked.value)

const qualityClass = computed(() => `quality-${audioQuality.value}`)
const qualityText = computed(() => {
  const map = { good: '良好', fair: '一般', poor: '较差' }
  return map[audioQuality.value] || '未知'
})

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
      messages.value.push({ 
        name: '系统', 
        content: locked.value ? '会议已锁定' : '会议已解锁', 
        isSelf: false 
      })
    }
  } catch (e) {
    console.error('锁定操作失败:', e)
  }
}

const endMeeting = async () => {
  if (!confirm('确定要结束会议吗？所有参会者将被移出。')) return
  
  try {
    await fetch(`/api/meetings/${meeting.value.id}/end`, { method: 'POST' })
    socket.value?.emit('leave-room', { meetingId: route.params.no })
    socket.value?.disconnect()
    stopAudio()
    alert('会议已结束')
    router.push('/')
  } catch (e) {
    console.error('结束会议失败:', e)
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
      await fetch(`/api/meetings/${meeting.value.id}/remove/${user.id}`, { method: 'POST' })
    } catch (e) {
      console.error('移出操作失败:', e)
    }
  }
}

const startAudio = async () => {
  try {
    // 优化的音频配置
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,      // 回声消除
        noiseSuppression: true,       // 噪声抑制
        autoGainControl: true,        // 自动增益控制
        latency: 0,                   // 低延迟
        channelCount: 1,              // 单声道足够
        sampleRate: 48000             // 高采样率
      }
    })
    
    window.localAudioStream = stream
    monitorAudioQuality(stream)
  } catch (e) {
    console.warn('无法访问麦克风:', e)
    // 降级尝试
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      window.localAudioStream = stream
    } catch (e2) {
      console.error('无法访问麦克风:', e2)
    }
  }
}

const monitorAudioQuality = (stream) => {
  const context = new (window.AudioContext || window.webkitAudioContext)()
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 256
  source.connect(analyser)
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount)
  
  const check = () => {
    if (!window.localAudioStream) {
      context.close()
      return
    }
    
    analyser.getByteFrequencyData(dataArray)
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length
    
    // 检测是否在说话
    isSpeaking.value = average > 20 && !isMuted.value
    
    // 根据音量调整音频质量指示
    if (average > 50) {
      audioQuality.value = 'good'
    } else if (average > 20) {
      audioQuality.value = 'good'
    } else {
      audioQuality.value = 'fair'
    }
    
    requestAnimationFrame(check)
  }
  
  context.resume()
  check()
}

const stopAudio = () => {
  if (window.localAudioStream) {
    window.localAudioStream.getTracks().forEach(t => t.stop())
    window.localAudioStream = null
  }
}

const connectSocket = () => {
  socket.value = io({
    transports: ['websocket', 'polling'],  // 优先 websocket
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  })
  
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
      stopAudio()
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
    messages.value.push({ name: '系统', content: '会议已锁定，请等待主持人允许发言', isSelf: false })
  })

  socket.value.on('meeting-unlocked', () => {
    locked.value = false
    messages.value.push({ name: '系统', content: '会议已解锁，可以发言', isSelf: false })
  })

  socket.value.on('meeting-ended', () => {
    alert('会议已结束')
    stopAudio()
    socket.value?.disconnect()
    router.push('/')
  })

  socket.value.on('chat-message', (msg) => {
    messages.value.push(msg)
    nextTick(() => {
      if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    })
  })

  socket.value.on('disconnect', () => {
    console.log('Socket disconnected')
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
      
      // 主持人始终可以发言
      if (isHost.value) {
        isMuted.value = false
      }
      
      localParticipantId.value = Date.now()
      messages.value = data.data.chats.map(c => ({ name: c.senderName, content: c.content, isSelf: false }))
    } else {
      alert(data.message || '会议不存在')
      router.push('/')
    }
  } catch (e) {
    router.push('/')
  }
}

const toggleMute = () => {
  // 主持人始终可以说话
  if (isHost.value) {
    isMuted.value = !isMuted.value
    if (window.localAudioStream) {
      window.localAudioStream.getAudioTracks().forEach(t => t.enabled = !isMuted.value)
    }
    return
  }
  
  // 非主持人需要等待允许
  if (locked.value) {
    alert('请等待主持人允许发言')
    return
  }
  
  isMuted.value = !isMuted.value
  if (window.localAudioStream) {
    window.localAudioStream.getAudioTracks().forEach(t => t.enabled = !isMuted.value)
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
  stopAudio()
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
  await startAudio()
  connectSocket()
  timer = setInterval(updateDuration, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  stopAudio()
  peerConnections.forEach(pc => pc.close())
  socket.value?.disconnect()
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
  background: #4caf50;
  animation: wave 0.5s ease-in-out infinite;
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

.status-text { 
  color: #888; 
  font-size: 14px; 
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.status-text .muted { color: #ff4d4f; }
.status-text .no-speak { color: #ff9800; }
.status-text .speaking { color: #4caf50; }
.status-text .host-status { color: #ffd700; }

.audio-quality {
  font-size: 12px;
  color: #666;
}

.audio-quality.quality-good { color: #4caf50; }
.audio-quality.quality-fair { color: #ff9800; }
.audio-quality.quality-poor { color: #ff4d4f; }

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
.participant-card.muted { opacity: 0.5; }
.participant-card.is-host { 
  border-color: #ffd700; 
  background: linear-gradient(135deg, #1a1a1a 0%, #141414 100%);
}

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

.host-avatar {
  background: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%);
  color: #000;
}

.info { flex: 1; }
.info .name { display: block; color: #fff; font-size: 16px; margin-bottom: 4px; }
.info .status { color: #666; font-size: 12px; display: flex; align-items: center; gap: 8px; }

.speaking-indicator {
  color: #4caf50;
  font-size: 11px;
}

.actions { display: flex; gap: 8px; }

.btn-action, .btn-remove, .btn-end {
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
.btn-action:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-remove {
  background: transparent;
  color: #ff4d4f;
  border: 1px solid #ff4d4f;
}

.btn-remove:hover { background: #ff4d4f; color: #fff; }

.btn-end {
  background: #ff4d4f;
  color: #fff;
  border: none;
}

.btn-end:hover { background: #ff6b6b; }

.controls {
  display: flex;
  justify-content: center;
  gap: 24px;
  padding: 24px;
  background: #141414;
  border-top: 1px solid #222;
}

.control-btn {
  min-width: 140px;
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
.control-btn.leave { background: #444; }
.control-btn.leave:hover { background: #555; }

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
  .controls { gap: 16px; flex-wrap: wrap; }
  .control-btn { min-width: 100px; padding: 14px 16px; font-size: 12px; }
}
</style>
