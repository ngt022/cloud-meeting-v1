<template>
  <div class="meeting">
    <!-- 弹幕层 -->
    <div class="danmaku-layer" v-if="showDanmaku">
      <transition-group name="danmaku">
        <div 
          v-for="danmaku in activeDanmakus" 
          :key="danmaku.id"
          class="danmaku-item"
          :style="{ color: danmaku.color }"
        >
          {{ danmaku.senderName }}: {{ danmaku.content }}
        </div>
      </transition-group>
    </div>

    <!-- 顶部栏 -->
    <header class="header">
      <div class="meeting-info">
        <span class="title">{{ meeting?.title }}</span>
        <span class="meeting-no">{{ meeting?.meetingNo }}</span>
      </div>
      <div class="header-actions">
        <button class="btn-danmaku" @click="toggleDanmaku" :class="{ active: showDanmaku }">
          弹幕
        </button>
        <button class="btn-copy" @click="copyLink" :class="{ copied }">
          {{ copied ? '已复制' : '复制链接' }}
        </button>
        <button class="btn-lock" @click="toggleLock" :class="{ locked }">
          {{ locked ? '已锁定' : '锁定' }}
        </button>
        <span class="time">{{ duration }}</span>
        <span class="users">{{ participants.length + 1 }}人</span>
      </div>
    </header>

    <!-- 会议内容区 -->
    <div class="meeting-content" :class="{ 'with-chat': showChat }">
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
        </div>
        
        <div class="participants-section">
          <div class="participant-card host" :class="{ 'is-self': true }">
            <div class="avatar host-avatar">{{ (localName || '我').charAt(0).toUpperCase() }}</div>
            <div class="info">
              <span class="name">{{ localName }} <span v-if="isHost" class="role-tag host">主持人</span></span>
              <span class="status">{{ getLocalStatus() }}</span>
            </div>
            <div class="actions">
              <!-- 主持人控制 -->
              <template v-if="isHost">
                <button :class="['btn-action', !isMuted && 'active']" @click="toggleMute">
                  <span class="mute-icon">{{ isMuted ? '🔇' : '🎤' }}</span>
                  {{ isMuted ? '静音' : '发言中' }}
                </button>
                <button class="btn-end" @click="endMeeting">结束会议</button>
              </template>
              <!-- 听众控制 -->
              <template v-else>
                <button v-if="!handRaised && isMuted" class="btn-action hand-raise" @click="raiseHand">
                  🙋 举手发言
                </button>
                <button v-if="handRaised" class="btn-action hand-raised" @click="lowerHand">
                  🙋 取消举手
                </button>
              </template>
            </div>
          </div>
          
          <div v-for="user in participants" :key="user.socketId" 
               class="participant-card"
               :class="{ 'muted': user.muted, 'hand-raised': user.handRaised, 'can-speak': user.canSpeak }">
            <div class="avatar" :class="{ 'host-avatar': user.isHost }">{{ (user.name || '?').charAt(0).toUpperCase() }}</div>
            <div class="info">
              <span class="name">
                {{ user.name || '匿名用户' }}
                <span v-if="user.isHost" class="role-tag host">主持人</span>
                <span v-else-if="user.canSpeak" class="role-tag speaker">发言中</span>
                <span v-else-if="user.handRaised" class="role-tag hand-raised">举手</span>
              </span>
              <span class="status">{{ getUserStatus(user) }}</span>
            </div>
            <div class="actions" v-if="isHost && !user.isHost">
              <button v-if="user.handRaised" class="btn-action allow" @click="allowSpeak(user)">
                ✓ 允许发言
              </button>
              <button :class="['btn-action', user.muted && 'active']" @click="muteParticipant(user)">
                {{ user.muted ? '取消静音' : '静音' }}
              </button>
              <button class="btn-remove" @click="removeParticipant(user)">移出</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 控制栏 -->
    <footer class="controls">
      <!-- 主持人控制 -->
      <template v-if="isHost">
        <button :class="['control-btn', !isMuted && 'active']" @click="toggleMute">
          <span class="control-icon">{{ isMuted ? '🔇' : '🎤' }}</span>
          {{ isMuted ? '静音' : '发言中' }}
        </button>
        <button :class="['control-btn', showChat && 'active']" @click="showChat = !showChat">
          💬 聊天
        </button>
        <button class="control-btn leave" @click="endMeeting">结束会议</button>
      </template>
      <!-- 听众控制 -->
      <template v-else>
        <button v-if="!handRaised && isMuted" class="control-btn hand-raise" @click="raiseHand">
          🙋 举手发言
        </button>
        <button v-if="handRaised" class="control-btn hand-raised" @click="lowerHand">
          🙋 取消举手
        </button>
        <button :class="['control-btn', showChat && 'active']" @click="showChat = !showChat">
          💬 聊天
        </button>
        <button class="control-btn leave" @click="leaveMeeting">退出会议</button>
      </template>
    </footer>

    <!-- 聊天面板 -->
    <aside class="chat-panel" v-if="showChat">
      <div class="chat-header">
        <span>聊天</span>
        <button @click="showChat = false" class="btn-close-chat">X</button>
      </div>
      
      <!-- 会议信息栏 -->
      <div class="meeting-bar">
        <span class="meeting-no-display">{{ meeting?.meetingNo }}</span>
        <button class="btn-copy-no" @click="copyMeetingNo" :class="{ copied: noCopied }">
          {{ noCopied ? '已复制' : '复制' }}
        </button>
      </div>
      
      <div class="chat-messages" ref="chatContainer">
        <div v-for="(msg, i) in messages" :key="i" :class="['chat-msg', msg.isSelf && 'self']">
          <span class="sender">{{ msg.name }}</span>
          <span class="content">{{ msg.content }}</span>
        </div>
      </div>
      
      <!-- 表情面板 -->
      <div class="emoji-bar">
        <button class="btn-emoji" @click="showEmojiPicker = !showEmojiPicker">😊</button>
        <div class="emoji-picker" v-if="showEmojiPicker">
          <span 
            v-for="emoji in quickEmojis" 
            :key="emoji"
            class="emoji-item"
            @click="insertEmoji(emoji)"
          >{{ emoji }}</span>
        </div>
      </div>
      
      <div class="chat-input">
        <input 
          v-model="chatMsg" 
          placeholder="输入消息..." 
          @keyup.enter="sendMessage"
          ref="chatInput"
        />
        <button class="btn-send" @click="sendMessage">发送</button>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { io } from 'socket.io-client'
import { useWebRTC } from '../composables/useWebRTC'

const route = useRoute()
const router = useRouter()

// WebRTC
const webrtc = useWebRTC()
const audioElements = ref(new Map())

const meeting = ref(null)
const participants = ref([])
const messages = ref([])
const chatContainer = ref(null)
const chatInput = ref(null)
const localName = ref('')
const localParticipantId = ref(null)
const copied = ref(false)
const noCopied = ref(false)
const isHost = ref(false)
const locked = ref(false)
const isSpeaking = ref(false)
const showDanmaku = ref(true)
const activeDanmakus = ref([])
let danmakuId = 0

const socket = ref(null)
const isJoined = ref(false)
const isAllMuted = ref(false)  // 全员禁言状态
const handRaised = ref(false)  // 是否举手
const showEmojiPicker = ref(false)  // 是否显示表情选择器
const quickEmojis = ['😀','😂','👍','👎','🎉','🙏','❤️','🔥','💯','👍','👌','🙌','👏','😎','🤔']  // 常用表情
const isMuted = ref(true)
const showChat = ref(false)
const chatMsg = ref('')
const duration = ref('00:00')
const startTime = Date.now()

const canSpeak = computed(() => isHost.value || (localParticipantId.value && !isMuted.value))

const toggleDanmaku = () => {
  showDanmaku.value = !showDanmaku.value
}

const insertEmoji = (emoji) => {
  chatMsg.value += emoji
  showEmojiPicker.value = false
  chatInput.value?.focus()
}

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

const copyMeetingNo = async () => {
  const no = meeting.value?.meetingNo || route.params.no
  try {
    await navigator.clipboard.writeText(no)
    noCopied.value = true
    setTimeout(() => { noCopied.value = false }, 2000)
  } catch (e) {
    const textArea = document.createElement('textarea')
    textArea.value = no
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    noCopied.value = true
    setTimeout(() => { noCopied.value = false }, 2000)
  }
}

const toggleLock = async () => {
  try {
    const url = locked.value ? `/api/meetings/${meeting.value.id}/unlock` : `/api/meetings/${meeting.value.id}/lock`
    const res = await fetch(url, { method: 'POST' })
    const data = await res.json()
    if (data.success) {
      locked.value = data.locked
      messages.value.push({ name: '系统', content: locked.value ? '会议已锁定' : '会议已解锁', isSelf: false })
    }
  } catch (e) {
    console.error('锁定操作失败:', e)
  }
}

const endMeeting = async () => {
  if (!confirm('确定要结束会议吗？')) return
  try {
    await fetch(`/api/meetings/${meeting.value.id}/end`, { method: 'POST' })
    isJoined.value = false
    socket.value?.emit('leave-room', { meetingId: route.params.no })
    socket.value?.disconnect()
    webrtc.cleanup()
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
      body: JSON.stringify({ mute, isHost: user.isHost })
    })
  } catch (e) {
    console.error('静音操作失败:', e)
  }
}

const removeParticipant = async (user) => {
  if (confirm(`确定要将 ${user.name} 移出会议吗？`)) {
    try {
      await fetch(`/api/meetings/${meeting.value.id}/remove/${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetIsHost: user.isHost })
      })
    } catch (e) {
      console.error('移出操作失败:', e)
    }
  }
}

const startAudio = async () => {
  try {
    const stream = await webrtc.initLocalAudio()
    if (stream) {
      window.localAudioStream = stream
      monitorAudioQuality(stream)
    }
  } catch (e) {
    console.warn('无法访问麦克风:', e)
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
    isSpeaking.value = average > 20 && !isMuted.value
    requestAnimationFrame(check)
  }
  context.resume()
  check()
}

const stopAudio = () => {
  webrtc.cleanup()
  window.localAudioStream = null
}

const connectSocket = () => {
  socket.value = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5
  })
  
  // 初始化 WebRTC
  webrtc.setup(socket.value, route.params.no)
  
  socket.value.on('connect', () => {
    socket.value.emit('join-room', {
      meetingId: route.params.no,
      participantId: localParticipantId.value,
      participantName: localName.value || '匿名',
      isHost: isHost.value
    })
  })

  socket.value.on('room-users', (users) => {
    // 过滤掉自己，只显示其他参与者
    participants.value = users.filter(u => u.socketId !== socket.value.id)
    
    // 只有在已加入房间后才创建WebRTC连接
    if (isJoined.value) {
      // 为所有现有用户创建 WebRTC 连接（排除自己）
      const otherUsers = users.filter(u => u.socketId !== socket.value.id)
      webrtc.connectToAllPeers(otherUsers)
    }
  })

  socket.value.on('user-joined', (user) => {
    // 如果自己还没加入房间，忽略
    if (!isJoined.value && user.socketId === socket.value.id) {
      isJoined.value = true
      return
    }
    
    participants.value.push(user)
    messages.value.push({ name: '系统', content: `${user.participantName} 加入了会议`, isSelf: false })
    // 处理新用户加入，创建连接
    webrtc.handleUserJoined(user)
  })

  socket.value.on('user-left', ({ socketId, participantId }) => {
    const user = participants.value.find(p => p.socketId === socketId || p.id === participantId)
    if (user) {
      messages.value.push({ name: '系统', content: `${user.name} 离开了会议`, isSelf: false })
    }
    participants.value = participants.value.filter(p => p.socketId !== socketId && p.id !== participantId)
    // 清理 WebRTC 连接
    webrtc.handleUserLeft({ socketId })
  })

  // WebRTC 信令处理 - 只有在已加入房间后才处理
  socket.value.on('webrtc-offer', async (data) => {
    console.log('[Socket] 收到 webrtc-offer from:', data.fromSocketId)
    if (!isJoined.value) {
      console.log('[WebRTC] 未加入但处理offer')
    }
    await webrtc.handleOffer(data)
  })

  socket.value.on('webrtc-answer', async (data) => {
    console.log('[Socket] 收到 webrtc-answer from:', data.fromSocketId)
    if (!isJoined.value) {
      console.log('[WebRTC] 未加入但处理answer')
    }
    await webrtc.handleAnswer(data)
  })

  socket.value.on('webrtc-ice-candidate', async (data) => {
    console.log('[Socket] 收到 webrtc-ice-candidate from:', data.fromSocketId)
    if (!isJoined.value) {
      console.log('[WebRTC] 未加入但处理ice-candidate')
    }
    await webrtc.handleIceCandidate(data)
  })

  socket.value.on('chat-message', (msg) => {
    // 只接收别人发的消息
    if (!msg.isSelf) {
      messages.value.push(msg)
      nextTick(() => {
        if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
      })
    }
  })

  socket.value.on('chat-sent', () => {
    // 服务器确认消息已发送，无需操作
  })

  // 弹幕事件
  socket.value.on('danmaku', (danmaku) => {
    danmaku.id = ++danmakuId
    activeDanmakus.value.push(danmaku)
    // 5秒后移除
    setTimeout(() => {
      activeDanmakus.value = activeDanmakus.value.filter(d => d.id !== danmaku.id)
    }, 5000)
  })

  socket.value.on('participant-muted', ({ participantId, muted }) => {
    if (participantId === localParticipantId.value) {
      isMuted.value = muted
      webrtc.updateLocalAudioTrack(!muted)
    }
    const user = participants.value.find(p => p.id === participantId)
    if (user) user.muted = muted
  })

  socket.value.on('participant-removed', ({ participantId }) => {
    if (participantId === localParticipantId.value) {
      alert('您已被移出会议')
      isJoined.value = false
      webrtc.cleanup()
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
    messages.value.push({ name: '系统', content: '会议已锁定', isSelf: false })
  })

  socket.value.on('meeting-unlocked', () => {
    locked.value = false
    messages.value.push({ name: '系统', content: '会议已解锁', isSelf: false })
  })

  socket.value.on('meeting-ended', () => {
    alert('会议已结束')
    isJoined.value = false
    webrtc.cleanup()
    socket.value?.disconnect()
    router.push('/')
  })

  // 举手事件
  socket.value.on('hand-raised', (data) => {
    const user = participants.value.find(p => p.socketId === data.socketId)
    if (user) {
      user.handRaised = true
      messages.value.push({ name: '系统', content: `${data.participantName} 举手申请发言`, isSelf: false })
    }
  })

  socket.value.on('hand-lowered', (data) => {
    const user = participants.value.find(p => p.socketId === data.socketId)
    if (user) {
      user.handRaised = false
    }
  })

  // 允许发言事件
  socket.value.on('speaker-allowed', (data) => {
    if (data.socketId === socket.value.id) {
      // 是自己被允许发言
      isMuted.value = false
      handRaised.value = false
      webrtc.updateLocalAudioTrack(true)
    }
    const user = participants.value.find(p => p.socketId === data.socketId)
    if (user) {
      user.canSpeak = true
      user.handRaised = false
      user.muted = false
      messages.value.push({ name: '系统', content: `${data.participantName} 已被允许发言`, isSelf: false })
    }
  })

  // 禁止发言事件
  socket.value.on('speaker-disallowed', (data) => {
    if (data.socketId === socket.value.id) {
      // 是自己被禁止发言
      isMuted.value = true
      handRaised.value = false
      webrtc.updateLocalAudioTrack(false)
    }
    const user = participants.value.find(p => p.socketId === data.socketId)
    if (user) {
      user.canSpeak = false
      user.muted = true
    }
  })

  // 全员禁言事件
  socket.value.on('all-muted', () => {
    isAllMuted.value = true
    if (!isHost.value) {
      isMuted.value = true
      handRaised.value = false
      webrtc.updateLocalAudioTrack(false)
    }
    messages.value.push({ name: '系统', content: '主持人已开启全员禁言', isSelf: false })
  })

  // 解除全员禁言事件
  socket.value.on('all-unmuted', () => {
    isAllMuted.value = false
    if (!isHost.value) {
      isMuted.value = false
      webrtc.updateLocalAudioTrack(true)
    }
    messages.value.push({ name: '系统', content: '主持人已解除全员禁言', isSelf: false })
  })
}

const fetchMeeting = async () => {
  try {
    const res = await fetch(`/api/meetings/${route.params.no}`)
    const data = await res.json()
    if (data.success) {
      meeting.value = data.data.meeting
      
      // 获取用户名（从路由参数或localStorage）
      const userName = route.query.name || localStorage.getItem('userName') || '匿名用户'
      localName.value = userName
      localStorage.setItem('userName', userName)
      
      // 比较用户名判断是否为主持人（不区分大小写）
      isHost.value = data.data.meeting.hostName.trim().toLowerCase() === userName.trim().toLowerCase()
      
      // 主持人默认可以发言，听众默认静音
      isMuted.value = !isHost.value
      isAllMuted.value = false
      handRaised.value = false
      
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

const toggleMute = async () => {
  if (isHost.value) {
    isMuted.value = !isMuted.value
    webrtc.updateLocalAudioTrack(!isMuted.value)
    console.log('[Audio] 主持人静音状态:', isMuted.value)
    // 主持人也需要通知其他用户静音状态变化
    socket.value?.emit('participant-muted', {
      meetingId: route.params.no,
      participantId: localParticipantId.value,
      muted: isMuted.value
    })
    return
  }
  if (locked.value) {
    alert('请等待主持人允许发言')
    return
  }
  isMuted.value = !isMuted.value
  webrtc.updateLocalAudioTrack(!isMuted.value)
  console.log('[Audio] 静音状态变更:', isMuted.value)
  // 通知服务器静音状态变化
  socket.value?.emit('participant-muted', {
    meetingId: route.params.no,
    participantId: localParticipantId.value,
    muted: isMuted.value
  })
}

// 获取本地用户状态显示
const getLocalStatus = () => {
  if (isHost.value) return '主持人'
  if (isMuted.value) {
    if (handRaised.value) return '等待发言中...'
    return '静音中'
  }
  return '在线'
}

// 获取用户状态显示
const getUserStatus = (user) => {
  if (user.isHost) return '主持人'
  if (user.muted) {
    if (user.handRaised) return '举手申请发言'
    return '已静音'
  }
  return '在线'
}

// 举手发言
const raiseHand = () => {
  handRaised.value = true
  socket.value?.emit('raise-hand', { meetingId: route.params.no })
}

// 取消举手
const lowerHand = () => {
  handRaised.value = false
  // 取消发言权限，恢复静音状态
  if (!isHost.value) {
    isMuted.value = true
    webrtc.updateLocalAudioTrack(false)
  }
  socket.value?.emit('lower-hand', { meetingId: route.params.no })
}

// 允许用户发言
const allowSpeak = (user) => {
  socket.value?.emit('allow-speak', {
    meetingId: route.params.no,
    targetSocketId: user.socketId
  })
}

// 全员禁言/解除禁言
const toggleMuteAll = async () => {
  if (isAllMuted.value) {
    // 解除全员禁言
    socket.value?.emit('unmute-all', { meetingId: route.params.no })
    isAllMuted.value = false
  } else {
    // 全员禁言
    socket.value?.emit('mute-all', { meetingId: route.params.no })
    isAllMuted.value = true
  }
}

const sendMessage = async () => {
  if (!chatMsg.value.trim()) return
  const name = localName.value || '匿名'
  const content = chatMsg.value
  
  // 立即显示自己的消息
  messages.value.push({ name, content, isSelf: true })
  
  // 发送到服务器
  socket.value.emit('chat-message', { 
    meetingId: route.params.no, 
    senderName: name, 
    content: content,
    senderSocketId: socket.value.id
  })
  
  chatMsg.value = ''
  nextTick(() => {
    if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  })
}

const leaveMeeting = () => {
  isJoined.value = false
  socket.value?.emit('leave-room', { meetingId: route.params.no })
  socket.value?.disconnect()
  webrtc.cleanup()
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
  try {
    localName.value = route.query.name || localStorage.getItem('userName') || '匿名用户'
    localStorage.setItem('userName', localName.value)
    await fetchMeeting()
    await startAudio()
    connectSocket()
    timer = setInterval(updateDuration, 1000)
    
    // 监听远程音频流变化
    watch(() => webrtc.remoteAudioStreams.value, (streams) => {
      try {
        console.log('[Watch] 远程音频流变化:', streams.size)
        streams.forEach((stream, socketId) => {
          try {
            console.log('[Watch] 播放远程音频:', socketId, '轨道数:', stream.getTracks().length)
            playRemoteAudio(socketId, stream)
          } catch (e) {
            console.error('[Watch] 播放远程音频错误:', e)
          }
        })
      } catch (e) {
        console.error('[Watch] 监听错误:', e)
      }
    }, { deep: true })
  } catch (e) {
    console.error('[Error] 初始化失败:', e)
    alert('初始化失败，请刷新页面重试')
  }
})

// 全局错误处理，防止黑屏
window.addEventListener('error', (e) => {
  console.error('[Global Error]', e.error)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  webrtc.cleanup()
  socket.value?.disconnect()
})

// 播放远程音频
const playRemoteAudio = (socketId, stream) => {
  try {
    let audioEl = audioElements.value.get(socketId)
    if (!audioEl) {
      audioEl = new Audio()
      audioEl.setSinkId && audioEl.setSinkId('default').catch(() => {})
      audioElements.value.set(socketId, audioEl)
    }
    if (audioEl.srcObject !== stream) {
      audioEl.srcObject = stream
      audioEl.play().then(() => {
        console.log('[Audio] 播放成功')
      }).catch(e => {
        console.warn('[Audio] 播放需要用户交互:', e.message)
        // 延迟播放，等待用户交互
        const tryPlay = () => {
          audioEl.play().catch(() => {})
        }
        document.addEventListener('click', tryPlay, { once: true })
      })
    }
  } catch (e) {
    console.error('[Audio] 播放错误:', e)
  }
}
</script>

<style scoped>
.meeting {
  height: 100vh;
  background: #0a0a0a;
  display: flex;
  flex-direction: column;
  margin: -20px;
  position: relative;
  overflow: hidden;
}

/* 弹幕层 */
.danmaku-layer {
  position: fixed;
  top: 80px;
  left: 0;
  right: 0;
  height: 200px;
  pointer-events: none;
  z-index: 100;
  overflow: hidden;
}

.danmaku-item {
  position: absolute;
  right: -200px;
  font-size: 20px;
  font-weight: bold;
  text-shadow: 0 0 4px rgba(0,0,0,0.8);
  animation: danmaku-fly 8s linear forwards;
  white-space: nowrap;
}

@keyframes danmaku-fly {
  from { transform: translateX(0); }
  to { transform: translateX(calc(100vw + 200px)); }
}

.danmaku-enter-active, .danmaku-leave-active {
  transition: all 0.5s ease;
}
.danmaku-enter-from, .danmaku-leave-to {
  opacity: 0;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #141414;
  border-bottom: 1px solid #222;
  z-index: 10;
}

.meeting-info { display: flex; align-items: center; gap: 20px; }
.meeting-info .title { color: #fff; font-size: 16px; font-weight: 500; }
.meeting-info .meeting-no { color: #666; font-size: 14px; font-family: monospace; }

.header-actions { display: flex; align-items: center; gap: 16px; }

.btn-danmaku, .btn-copy, .btn-lock {
  padding: 8px 14px;
  background: #222;
  color: #fff;
  border: 1px solid #333;
  border-radius: 2px;
  font-size: 12px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-danmaku:hover, .btn-copy:hover, .btn-lock:hover { background: #333; }
.btn-danmaku.active { background: #4caf50; border-color: #4caf50; }
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
  z-index: 5;
}

.meeting-content.with-chat { margin-right: 340px; }

.audio-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 40px;
}

.audio-visual { text-align: center; }

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

@keyframes wave {
  0%, 100% { height: 20px; }
  50% { height: 60px; }
}

.status-text { color: #888; font-size: 14px; letter-spacing: 2px; }
.status-text .muted { color: #ff4d4f; }
.status-text .no-speak { color: #ff9800; }
.status-text .speaking { color: #4caf50; }
.status-text .host-status { color: #ffd700; }

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
.participant-card.hand-raised {
  border-color: #ff9800;
  box-shadow: 0 0 10px rgba(255, 152, 0, 0.3);
}
.participant-card.can-speak {
  border-color: #4caf50;
}
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

.avatar.host-avatar {
  background: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%);
  color: #000;
}

.info { flex: 1; }
.info .name { 
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff; 
  font-size: 16px; 
  margin-bottom: 4px; 
}
.info .status { color: #666; font-size: 12px; }

.role-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 2px;
  letter-spacing: 1px;
}
.role-tag.host {
  background: #ffd700;
  color: #000;
}
.role-tag.speaker {
  background: #4caf50;
  color: #fff;
}
.role-tag.hand-raised {
  background: #ff9800;
  color: #fff;
}

.actions { display: flex; gap: 8px; }

.btn-action, .btn-remove, .btn-end {
  padding: 8px 16px;
  font-size: 12px;
  border-radius: 2px;
  cursor: pointer;
  letter-spacing: 1px;
}

.btn-action {
  background: #222;
  color: #fff;
  border: 1px solid #333;
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-action:hover { background: #333; }
.btn-action.active { background: #fff; color: #000; border-color: #fff; }
.btn-action:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-action.allow { background: #4caf50; border-color: #4caf50; }
.btn-action.allow:hover { background: #45a049; }
.btn-action.hand-raise { background: #ff9800; border-color: #ff9800; }
.btn-action.hand-raise:hover { background: #f57c00; }
.btn-action.hand-raised { background: #ff9800; border-color: #ff9800; opacity: 0.8; }

.mute-icon { font-size: 14px; }

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
  z-index: 10;
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
.control-btn .control-icon { font-size: 16px; }

.chat-panel {
  position: fixed;
  right: 0;
  top: 0;
  width: 340px;
  height: 100vh;
  background: #141414;
  display: flex;
  flex-direction: column;
  z-index: 200;
  border-left: 1px solid #222;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #222;
  font-weight: 500;
  color: #fff;
  letter-spacing: 2px;
}

.btn-close-chat {
  width: 28px;
  height: 28px;
  border-radius: 2px;
  border: 1px solid #333;
  background: transparent;
  color: #888;
  font-size: 14px;
  cursor: pointer;
}

.chat-header + .meeting-bar {
  border-bottom: 1px solid #222;
}

.meeting-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #1a1a1a;
  border-bottom: 1px solid #222;
}

.meeting-no-display {
  font-family: monospace;
  color: #888;
  font-size: 12px;
  flex: 1;
}

.btn-copy-no, .btn-copy-link-chat {
  padding: 6px 10px;
  font-size: 10px;
  border-radius: 2px;
  cursor: pointer;
  letter-spacing: 1px;
  background: #222;
  color: #888;
  border: 1px solid #333;
  transition: all 0.2s;
}

.btn-copy-no:hover, .btn-copy-link-chat:hover {
  background: #333;
  color: #fff;
}

.btn-copy-no.copied, .btn-copy-link-chat.copied {
  background: #4caf50;
  color: #fff;
  border-color: #4caf50;
}

.chat-actions { display: flex; gap: 12px; }

.chat-actions button {
  width: 32px;
  height: 32px;
  border-radius: 2px;
  border: 1px solid #333;
  background: transparent;
  color: #888;
  font-size: 16px;
  cursor: pointer;
}

.btn-emoji { font-size: 18px !important; }

.emoji-picker {
  background: #1a1a1a;
  border-bottom: 1px solid #222;
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.emoji-section {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.emoji-item {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  font-size: 18px;
  transition: background 0.2s;
}

.emoji-item:hover { background: #333; }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.chat-msg { margin-bottom: 16px; }
.chat-msg .sender { display: block; font-size: 12px; color: #666; margin-bottom: 6px; }
.chat-msg .content { display: inline-block; padding: 10px 14px; background: #222; border-radius: 8px; font-size: 14px; color: #fff; }
.chat-msg.self { text-align: right; }
.chat-msg.self .content { background: #fff; color: #000; }

.emoji-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid #222;
  position: relative;
}

.btn-emoji {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: 1px solid #333;
  background: #222;
  color: #888;
  font-size: 16px;
  cursor: pointer;
}

.btn-emoji:hover {
  background: #333;
  color: #fff;
}

.emoji-picker {
  position: absolute;
  bottom: 100%;
  left: 16px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 280px;
  z-index: 300;
}

.emoji-item {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  font-size: 18px;
  transition: background 0.2s;
}

.emoji-item:hover {
  background: #333;
}

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

.chat-input .btn-send {
  padding: 12px 24px;
  background: #fff;
  color: #000;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  letter-spacing: 1px;
  font-size: 14px;
}

.chat-input .btn-send:hover {
  background: #ddd;
}

@media (max-width: 768px) {
  .meeting-content.with-chat { margin-right: 0; }
  .chat-panel { width: 100%; }
  .header-actions .btn-copy, .header-actions .btn-lock { display: none; }
  .controls { gap: 16px; flex-wrap: wrap; }
  .control-btn { min-width: 100px; padding: 14px 16px; font-size: 12px; }
}
</style>
