<template>
  <div class="meeting-container">
    <div class="stage" :class="{ 'has-screen-share': isScreenSharing }">
      <div v-if="isScreenSharing && screenShareStream" class="screen-share-container">
        <video ref="screenShareVideo" class="screen-share-video" autoplay playsinline></video>
        <div class="share-indicator">
          <span class="dot"></span>
          正在共享屏幕
        </div>
      </div>
      
      <div class="video-grid" :class="{ 'compact': isScreenSharing }">
        <template v-for="user in participants" :key="user.socketId">
          <div class="video-tile" :class="{ 'speaking': user.isSpeaking, 'is-host': user.isHost }">
            <video v-if="user.hasVideo" class="video-element" autoplay playsinline :muted="user.socketId === socket?.id"></video>
            <div v-else class="avatar-placeholder">{{ user.name.charAt(0).toUpperCase() || "?" }}</div>
            <div class="video-overlay">
              <span class="name-badge">{{ user.name }}</span>
              <div class="status-icons">
                <span v-if="user.isHost" class="icon host-icon">👑</span>
                <span v-if="user.isMuted" class="icon muted-icon">🔇</span>
              </div>
            </div>
          </div>
        </template>
        
        <div class="video-tile local" :class="{ 'speaking': isSpeaking && !isMuted }">
          <video v-if="hasVideo" ref="localVideo" class="video-element" autoplay muted playsinline></video>
          <div v-else class="avatar-placeholder small">{{ localName.charAt(0).toUpperCase() || "我" }}</div>
          <div class="video-overlay">
            <span class="name-badge">{{ localName }}</span>
            <div class="status-icons">
              <span class="icon">👤</span>
              <span v-if="isMuted" class="icon muted-icon">🔇</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <Transition name="fade">
      <div v-if="isMuted && isTryingToSpeak" class="muted-toast">
        <span class="icon">🔇</span>
        <span>您当前处于静音状态</span>
        <button @click="toggleAudio">点击解除静音</button>
      </div>
    </Transition>
    
    <aside class="sidebar" :class="{ 'open': sidebarOpen }">
      <div class="sidebar-tabs">
        <button :class="['tab', sidebarTab === 'members' && 'active']" @click="sidebarTab = 'members'">成员</button>
        <button :class="['tab', sidebarTab === 'chat' && 'active']" @click="sidebarTab = 'chat'">聊天</button>
        <button class="tab close-btn" @click="sidebarOpen = false">×</button>
      </div>
      
      <div v-show="sidebarTab === 'members'" class="sidebar-content members-list">
        <div class="member-item host">
          <div class="avatar">{{ localName.charAt(0).toUpperCase() || "我" }}</div>
          <div class="info">
            <span class="name">{{ localName }} (我)</span>
            <span class="role">主持人</span>
          </div>
        </div>
        
        <div v-for="user in participants" :key="user.socketId" class="member-item" :class="{ 'muted': user.isMuted }">
          <div class="avatar" :class="{ 'is-host': user.isHost }">{{ user.name.charAt(0).toUpperCase() || "?" }}</div>
          <div class="info">
            <span class="name">{{ user.name }}<span v-if="user.isHost" class="role-badge">主持人</span></span>
            <span class="status">{{ user.isMuted ? '静音' : '在线' }}</span>
          </div>
          <div v-if="isHost && !user.isHost" class="actions">
            <button class="btn-icon" @click="toggleMuteUser(user)">{{ user.isMuted ? '🔊' : '🔇' }}</button>
            <button class="btn-icon remove" @click="removeUser(user)">🚪</button>
          </div>
        </div>
        
        <div v-if="isHost" class="host-controls">
          <button class="btn-control" :class="{ 'active': isAllMuted }" @click="toggleMuteAll">{{ isAllMuted ? '解除全体静音' : '全体静音' }}</button>
          <button class="btn-control" :class="{ 'active': isLocked }" @click="toggleLock">{{ isLocked ? '解锁会议' : '锁定会议' }}</button>
        </div>
      </div>
      
      <div v-show="sidebarTab === 'chat'" class="sidebar-content chat-panel">
        <div class="chat-messages" ref="chatContainer">
          <div v-for="(msg, index) in messages" :key="index" class="chat-message" :class="{ 'self': msg.isSelf }">
            <span class="sender">{{ msg.name }}</span>
            <span class="content">{{ msg.content }}</span>
          </div>
        </div>
        <div class="chat-input-area">
          <input v-model="chatMessage" placeholder="输入消息..." @keyup.enter="sendChatMessage" />
          <button class="btn-send" @click="sendChatMessage">发送</button>
        </div>
      </div>
    </aside>
    
    <footer class="control-bar">
      <div class="controls-wrapper">
        <button class="control-btn" :class="{ 'active': !isMuted, 'muted': isMuted }" @click="toggleAudio">
          <span class="btn-icon">{{ isMuted ? '🔇' : '🎤' }}</span>
          <span class="btn-text">{{ isMuted ? '静音' : '取消静音' }}</span>
        </button>
        <button class="control-btn" :class="{ 'active': hasVideo }" @click="toggleVideo">
          <span class="btn-icon">{{ hasVideo ? '📹' : '📷' }}</span>
          <span class="btn-text">{{ hasVideo ? '关闭视频' : '开启视频' }}</span>
        </button>
        <button class="control-btn share-btn" :class="{ 'active': isScreenSharing }" @click="toggleScreenShare">
          <span class="btn-icon">🖥️</span>
          <span class="btn-text">{{ isScreenSharing ? '停止共享' : '共享屏幕' }}</span>
        </button>
        <button class="control-btn" @click="openSidebar('members')">
          <span class="btn-icon">👥</span>
          <span class="btn-text">成员</span>
        </button>
        <button class="control-btn" @click="openSidebar('chat')">
          <span class="btn-icon">💬</span>
          <span class="btn-text">聊天</span>
        </button>
        <button class="control-btn end-btn" @click="handleEndMeeting">
          <span class="btn-icon">📴</span>
          <span class="btn-text">{{ isHost ? '结束会议' : '离开会议' }}</span>
        </button>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWebRTC } from '@/composables/useWebRTC'

const route = useRoute()
const router = useRouter()
const { 
  initLocalAudio, initLocalVideo, initScreenShare,
  getLocalAudioStream, getLocalVideoStream,
  setup, handleUserJoined, handleUserLeft,
  updateAudioTrack, updateVideoTrack,
  handleOffer, handleAnswer, handleIceCandidate,
  connectToAllPeers,
  addScreenShareTrack, removeScreenShareTrack,
  cleanup
} = useWebRTC()

const socket = ref(null)
const meetingId = ref(null)
const localName = ref('')
const isHost = ref(false)
const participantId = ref(null)

// 媒体状态
const isMuted = ref(true)
const hasVideo = ref(false)
const isSpeaking = ref(false)
const localVideo = ref(null)

// 屏幕共享
const isScreenSharing = ref(false)
const screenShareStream = ref(null)
const screenShareVideo = ref(null)

// 参会者列表
const participants = ref([])

// 侧边栏
const sidebarOpen = ref(false)
const sidebarTab = ref('members')

// 聊天
const chatMessage = ref('')
const messages = ref([])
const chatContainer = ref(null)

// 主持人控制
const isAllMuted = ref(false)
const isLocked = ref(false)

const meetingNo = route.params.meetingNo

// 主持人控制功能
const toggleMuteUser = async (user) => {
  try {
    await fetch(`/api/meetings/${meetingId.value}/mute/${user.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mute: !user.isMuted, isHost: isHost.value })
    })
  } catch (e) {
    console.error('静音操作失败:', e)
  }
}

const removeUser = async (user) => {
  try {
    await fetch(`/api/meetings/${meetingId.value}/remove/${user.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetIsHost: user.isHost })
    })
  } catch (e) {
    console.error('移出操作失败:', e)
  }
}

const toggleMuteAll = async () => {
  try {
    const action = isAllMuted.value ? 'unmute-all' : 'mute-all'
    socket.value.emit(action, { meetingId: meetingId.value })
    isAllMuted.value = !isAllMuted.value
  } catch (e) {
    console.error('全体静音操作失败:', e)
  }
}

const toggleLock = async () => {
  try {
    const action = isLocked.value ? 'unlock' : 'lock'
    await fetch(`/api/meetings/${meetingId.value}/${action}`, { method: 'POST' })
    isLocked.value = !isLocked.value
  } catch (e) {
    console.error('锁定操作失败:', e)
  }
}

const handleEndMeeting = async () => {
  if (isHost.value) {
    try {
      await fetch(`/api/meetings/${meetingId.value}/end`, { method: 'POST' })
      router.push('/')
    } catch (e) {
      console.error('结束会议失败:', e)
    }
  } else {
    socket.value.emit('leave-room', { meetingId: meetingId.value })
    cleanup()
    router.push('/')
  }
}

// 屏幕共享功能
const toggleScreenShare = async () => {
  if (isScreenSharing.value) {
    // 停止屏幕共享
    try {
      socket.value.emit('stop-screen-share', { meetingId: meetingId.value })
    } catch (e) {
      console.error('停止屏幕共享失败:', e)
    }
    
    isScreenSharing.value = false
    screenShareStream.value = null
    
    // 恢复摄像头
    removeScreenShareTrack()
    
    // 重新绑定本地视频
    if (hasVideo.value && localVideo.value) {
      const videoStream = getLocalVideoStream()
      if (videoStream) {
        localVideo.value.srcObject = videoStream
      }
    }
  } else {
    // 开始屏幕共享
    const stream = await initScreenShare()
    if (stream) {
      isScreenSharing.value = true
      screenShareStream.value = stream
      
      // 显示屏幕共享视频
      await nextTick()
      if (screenShareVideo.value) {
        screenShareVideo.value.srcObject = stream
      }
      
      // 通知服务器开始屏幕共享
      socket.value.emit('start-screen-share', { 
        meetingId: meetingId.value, 
        participantId: participantId.value 
      })
      
      // 将屏幕共享轨道添加到所有对等连接
      addScreenShareTrack()
      
      // 监听屏幕共享结束事件（用户通过浏览器UI停止共享）
      stream.getVideoTracks()[0].onended = () => {
        if (isScreenSharing.value) {
          toggleScreenShare()
        }
      }
    }
  }
}

// 初始化媒体设备
const initMedia = async () => {
  const audioStream = await initLocalAudio()
  if (audioStream) {
    isMuted.value = false
  }
  
  const videoStream = await initLocalVideo()
  if (videoStream) {
    hasVideo.value = true
    await nextTick()
    if (localVideo.value) {
      localVideo.value.srcObject = videoStream
    }
  }
}

const toggleAudio = () => {
  isMuted.value = !isMuted.value
  updateAudioTrack(!isMuted.value)
  socket.value.emit('toggle-audio', { 
    meetingId: meetingId.value, 
    participantId: participantId.value, 
    isMuted: isMuted.value 
  })
}

const toggleVideo = () => {
  hasVideo.value = !hasVideo.value
  updateVideoTrack(hasVideo.value)
  socket.value.emit('toggle-video', { 
    meetingId: meetingId.value, 
    participantId: participantId.value, 
    hasVideo: hasVideo.value 
  })
}

// 侧边栏控制
const openSidebar = (tab) => {
  sidebarOpen.value = true
  sidebarTab.value = tab
}

// 聊天功能
const sendChatMessage = () => {
  if (!chatMessage.value.trim()) return
  
  socket.value.emit('chat-message', {
    meetingId: meetingId.value,
    senderName: localName.value,
    content: chatMessage.value,
    senderSocketId: socket.value.id
  })
  
  // 显示自己的消息
  messages.value.push({
    name: localName.value,
    content: chatMessage.value,
    isSelf: true
  })
  
  chatMessage.value = ''
  
  // 滚动到底部
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

// 加入会议
const joinMeeting = async () => {
  try {
    const name = localStorage.getItem('meetingName') || prompt('请输入您的名称') || '匿名'
    localStorage.setItem('meetingName', name)
    localName.value = name
    
    const res = await fetch(`/api/meetings/${meetingNo}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    
    const data = await res.json()
    if (data.success) {
      meetingId.value = data.data.meetingId
      participantId.value = data.data.participantId
      isHost.value = data.data.isHost
      
      // 连接 Socket.IO
      socket.value = io()
      setup(socket.value, meetingId.value)
      
      // WebRTC 事件处理
      socket.value.on('webrtc-offer', handleOffer)
      socket.value.on('webrtc-answer', handleAnswer)
      socket.value.on('webrtc-ice-candidate', handleIceCandidate)
      
      // 用户状态变化
      socket.value.on('participant-updated', async (data) => {
        const user = participants.value.find(u => u.socketId === data.socketId)
        if (user) {
          if (typeof data.isMuted !== 'undefined') user.isMuted = data.isMuted
          if (typeof data.hasVideo !== 'undefined') user.hasVideo = data.hasVideo
        }
      })
      
      socket.value.on('participant-muted', (data) => {
        if (data.participantId === participantId.value) {
          isMuted.value = data.muted
          updateAudioTrack(!data.muted)
        }
      })
      
      // 屏幕共享事件
      socket.value.on('screen-share-started', async ({ socketId, participantName }) => {
        console.log('屏幕共享开始:', participantName)
      })
      
      socket.value.on('screen-share-stopped', () => {
        console.log('屏幕共享停止')
      })
      
      // 举手事件
      socket.value.on('hand-raised', ({ socketId, name }) => {
        console.log(name, '举手了')
      })
      
      socket.value.on('hand-lowered', ({ socketId }) => {
        console.log('有人放下手了')
      })
      
      socket.value.on('speak-allowed', ({ socketId, name }) => {
        console.log(name, '被允许发言')
      })
      
      socket.value.on('speak-disallowed', ({ socketId }) => {
        console.log('某人被禁止发言')
      })
      
      // 加入房间
      socket.value.emit('join-room', {
        meetingId: meetingId.value,
        participantId: participantId.value,
        participantName: localName.value,
        isHost: isHost.value
      })
      
      // 用户事件
      socket.value.on('room-users', async (users) => {
        participants.value = users.filter(u => u.socketId !== socket.value.id)
        connectToAllPeers(users)
      })
      
      socket.value.on('user-joined', handleUserJoined)
      
      socket.value.on('user-left', ({ socketId }) => {
        handleUserLeft({ socketId })
        participants.value = participants.value.filter(p => p.socketId !== socketId)
      })
      
      // 会议事件
      socket.value.on('meeting-ended', () => {
        alert('会议已结束')
        cleanup()
        router.push('/')
      })
      
      socket.value.on('all-muted', () => {
        isAllMuted.value = true
        if (!isHost.value) {
          isMuted.value = true
          updateAudioTrack(false)
        }
      })
      
      socket.value.on('all-unmuted', () => {
        isAllMuted.value = false
        if (!isHost.value) {
          isMuted.value = false
          updateAudioTrack(true)
        }
      })
      
      socket.value.on('meeting-locked', () => {
        isLocked.value = true
      })
      
      socket.value.on('meeting-unlocked', () => {
        isLocked.value = false
      })
      
      // 聊天事件
      socket.value.on('chat-message', (data) => {
        messages.value.push({
          name: data.senderName,
          content: data.content,
          isSelf: false
        })
        nextTick(() => {
          if (chatContainer.value) {
            chatContainer.value.scrollTop = chatContainer.value.scrollHeight
          }
        })
      })
      
      socket.value.on('chat-sent', () => {
        // 发送成功
      })
      
      socket.value.on('danmaku', (data) => {
        console.log('弹幕:', data)
      })
      
      socket.value.on('participant-removed', () => {
        alert('您已被移出会议')
        cleanup()
        router.push('/')
      })
      
      // 初始化本地媒体
      await initMedia()
      
    } else {
      alert(data.message || '加入会议失败')
      router.push('/')
    }
  } catch (e) {
    console.error('加入会议失败:', e)
    alert('加入会议失败')
    router.push('/')
  }
}

onMounted(() => {
  joinMeeting()
})

onUnmounted(() => {
  if (socket.value) {
    socket.value.emit('leave-room', { meetingId: meetingId.value })
  }
  cleanup()
})

</script>

<style scoped>



</style>