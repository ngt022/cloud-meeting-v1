<template>
  <div class="meeting-container">
    <!-- 主舞台区域 -->
    <div class="stage" :class="{ 'has-screen-share': isScreenSharing }">
      <!-- 屏幕共享内容 -->
      <div v-if="isScreenSharing && screenShareStream" class="screen-share-container">
        <video 
          ref="screenShareVideo"
          class="screen-share-video"
          autoplay 
          playsinline
        ></video>
        <div class="share-indicator">
          <span class="dot"></span>
          正在共享屏幕：{{ screenSharerName }}
        </div>
      </div>

      <!-- 视频网格布局（按发言排序） -->
      <div class="video-grid" :class="{ 'compact': isScreenSharing }">
        <!-- 按发言状态排序：正在说话的人排在前面 -->
        <template v-for="user in sortedParticipants" :key="user.socketId">
          <div 
            class="video-tile"
            :class="{ 
              'speaking': user.isSpeaking,
              'is-host': user.isHost,
              'active-speaker': user.socketId === activeSpeakerId
            }"
          >
            <video 
              v-if="user.hasVideo"
              :ref="el => setVideoRef(user.socketId, el)"
              class="video-element" 
              autoplay 
              playsinline
              :muted="user.socketId === socket?.id"
            ></video>
            <div v-else class="avatar-placeholder">
              {{ (user.name || '?').charAt(0).toUpperCase() }}
            </div>
            
            <!-- 发言者指示器 -->
            <div v-if="user.isSpeaking" class="speaker-indicator">
              <span class="wave-ring"></span>
              <span class="wave-ring"></span>
              <span class="wave-ring"></span>
            </div>
            
            <div class="video-overlay">
              <span class="name-badge">
                {{ user.name }}
                <span v-if="user.socketId === socket?.id" class="self-badge">(我)</span>
              </span>
              <div class="status-icons">
                <span v-if="user.isHost" class="icon host-icon">👑</span>
                <span v-if="user.isMuted" class="icon muted-icon">🔇</span>
                <span v-if="user.isMutedByHost" class="icon forced-muted">🚫</span>
              </div>
            </div>
          </div>
        </template>

        <!-- 本地视频（右下角小窗） -->
        <div class="video-tile local" :class="{ 'speaking': isSpeaking && !isMuted }">
          <video 
            v-if="hasVideo && localVideoStream"
            ref="localVideo" 
            class="video-element" 
            autoplay 
            muted 
            playsinline
          ></video>
          <div v-else class="avatar-placeholder small">
            {{ (localName || '我').charAt(0).toUpperCase() }}
          </div>
          
          <!-- 本地音量波纹 -->
          <div v-if="!isMuted && audioLevel > 5" class="local-audio-wave">
            <div class="wave-circle" :style="{ width: (20 + audioLevel) + 'px', height: (20 + audioLevel) + 'px' }"></div>
          </div>
          
          <div class="video-overlay">
            <span class="name-badge">{{ localName }}</span>
            <div class="status-icons">
              <span class="icon">👤</span>
              <span v-if="isMuted" class="icon muted-icon">🔇</span>
              <span v-if="isMutedByHost" class="icon forced-muted">🚫</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 静音状态气泡提示 -->
    <Transition name="fade">
      <div v-if="isMuted && isTryingToSpeak" class="muted-toast">
        <span class="icon">🔇</span>
        <span>您当前处于静音状态，请开启麦克风后再发言</span>
        <button class="btn-unmute-hint" @click="toggleAudio">点击解除静音</button>
      </div>
    </Transition>

    <!-- 网络状态提示 -->
    <div v-if="networkQuality === 'poor'" class="network-warning">
      <span class="icon">⚠️</span>
      <span>网络不稳定，建议关闭视频以节省带宽</span>
      <button @click="toggleVideo">关闭视频</button>
    </div>

    <!-- 侧边栏 -->
    <aside class="sidebar" :class="{ 'open': sidebarOpen }">
      <div class="sidebar-tabs">
        <button 
          :class="['tab', sidebarTab === 'members' && 'active']"
          @click="sidebarTab = 'members'"
        >
          成员 ({{ participants.length + 1 }})
        </button>
        <button 
          :class="['tab', sidebarTab === 'chat' && 'active']"
          @click="sidebarTab = 'chat'"
        >
          聊天
        </button>
        <button class="tab close-btn" @click="sidebarOpen = false">×</button>
      </div>

      <!-- 成员列表 -->
      <div v-show="sidebarTab === 'members'" class="sidebar-content members-list">
        <!-- 主持人 -->
        <div class="member-item host">
          <div class="avatar">{{ (localName || '我').charAt(0).toUpperCase() }}</div>
          <div class="info">
            <span class="name">{{ localName }} (我)</span>
            <span class="role">主持人</span>
          </div>
          <div class="status-badge" :class="{ muted: isMuted }">
            {{ isMuted ? '静音中' : '发言中' }}
          </div>
        </div>

        <!-- 参会者 -->
        <div 
          v-for="user in participants" 
          :key="user.socketId"
          class="member-item"
          :class="{ 
            'muted': user.isMuted,
            'is-speaking': user.isSpeaking,
            'active': user.socketId === activeSpeakerId
          }"
        >
          <div class="avatar" :class="{ 'is-host': user.isHost, 'speaking-avatar': user.isSpeaking }">
            {{ (user.name || '?').charAt(0).toUpperCase() }}
          </div>
          <div class="info">
            <span class="name">
              {{ user.name }}
              <span v-if="user.isHost" class="role-badge">主持人</span>
              <span v-if="user.socketId === activeSpeakerId" class="speaking-badge">🎤 正在发言</span>
            </span>
            <span class="status">{{ getUserStatus(user) }}</span>
          </div>
          <div v-if="isHost && !user.isHost" class="actions">
            <button 
              class="btn-icon" 
              @click="toggleMuteUser(user)"
              :title="user.isMuted ? '取消静音' : '静音'"
              :class="{ 'muted-btn': !user.isMuted }"
            >
              {{ user.isMuted ? '🔊' : '🔇' }}
            </button>
            <button class="btn-icon remove" @click="removeUser(user)" title="移出">🚪</button>
          </div>
        </div>

        <!-- 主持人控制区 -->
        <div v-if="isHost" class="host-controls">
          <button 
            class="btn-control"
            :class="{ 'active': isAllMuted }"
            @click="toggleMuteAll"
          >
            {{ isAllMuted ? '解除全体静音' : '全体静音' }}
          </button>
          <div class="mute-option" v-if="!isAllMuted">
            <label>
              <input type="checkbox" v-model="allowSelfUnmute">
              允许参会者自行解除静音
            </label>
          </div>
          <button 
            class="btn-control"
            :class="{ 'active': isLocked }"
            @click="toggleLock"
          >
            {{ isLocked ? '解锁会议' : '锁定会议' }}
          </button>
        </div>
      </div>

      <!-- 聊天 -->
      <div v-show="sidebarTab === 'chat'" class="sidebar-content chat-panel">
        <div class="chat-messages" ref="chatContainer">
          <div 
            v-for="(msg, index) in messages" 
            :key="index"
            class="chat-message"
            :class="{ 'self': msg.isSelf }"
          >
            <span class="sender">{{ msg.name }}</span>
            <span class="content">{{ msg.content }}</span>
          </div>
        </div>
        <div class="chat-input-area">
          <input 
            v-model="chatMessage"
            placeholder="输入消息..."
            @keyup.enter="sendChatMessage"
          />
          <button class="btn-send" @click="sendChatMessage">发送</button>
        </div>
      </div>
    </aside>

    <!-- 底部控制栏 -->
    <footer class="control-bar">
      <div class="controls-wrapper">
        <!-- 麦克风控制 -->
        <button 
          class="control-btn"
          :class="{ 
            'active': !isMuted, 
            'muted': isMuted,
            'forced-muted': isMutedByHost
          }"
          @click="toggleAudio"
          :title="getMuteTooltip"
        >
          <span class="btn-icon">
            <span v-if="isMutedByHost" class="mute-slash"></span>
            {{ isMuted ? '🔇' : '🎤' }}
          </span>
          <span class="btn-text">{{ isMuted ? '静音' : '取消静音' }}</span>
          
          <!-- 音量波纹指示器 -->
          <div v-if="!isMuted && audioLevel > 5" class="audio-ripple">
            <span class="ripple" :style="{ height: audioLevel + '%' }"></span>
            <span class="ripple" :style="{ height: (audioLevel * 0.8) + '%' }"></span>
            <span class="ripple" :style="{ height: (audioLevel * 0.6) + '%' }"></span>
          </div>
        </button>

        <!-- 摄像头控制 -->
        <button 
          class="control-btn"
          :class="{ 'active': hasVideo }"
          @click="toggleVideo"
          :title="hasVideo ? '关闭摄像头' : '开启摄像头'"
        >
          <span class="btn-icon">{{ hasVideo ? '📹' : '📷' }}</span>
          <span class="btn-text">{{ hasVideo ? '关闭视频' : '开启视频' }}</span>
        </button>

        <!-- 屏幕共享 -->
        <button 
          class="control-btn share-btn"
          :class="{ 'active': isScreenSharing }"
          @click="toggleScreenShare"
          :title="isScreenSharing ? '停止共享' : '共享屏幕'"
        >
          <span class="btn-icon">🖥️</span>
          <span class="btn-text">{{ isScreenSharing ? '停止共享' : '共享屏幕' }}</span>
        </button>

        <!-- 成员列表 -->
        <button 
          class="control-btn"
          :class="{ 'active': sidebarOpen && sidebarTab === 'members' }"
          @click="openSidebar('members')"
          title="成员列表"
        >
          <span class="btn-icon">👥</span>
          <span class="btn-text">成员</span>
        </button>

        <!-- 聊天 -->
        <button 
          class="control-btn"
          :class="{ 'active': sidebarOpen && sidebarTab === 'chat' }"
          @click="openSidebar('chat')"
          title="聊天"
        >
          <span class="btn-icon">💬</span>
          <span class="btn-text">聊天</span>
        </button>

        <!-- 更多设置 -->
        <div class="control-btn settings-btn" @click="showSettings = !showSettings">
          <span class="btn-icon">⋯</span>
          <span class="btn-text">更多</span>
          
          <div v-if="showSettings" class="settings-popup">
            <div class="setting-item">
              <span>背景虚化</span>
              <label class="switch">
                <input type="checkbox" v-model="backgroundBlur">
                <span class="slider"></span>
              </label>
            </div>
            <div class="setting-item">
              <span>录音</span>
              <label class="switch">
                <input type="checkbox" v-model="isRecording">
                <span class="slider"></span>
              </label>
            </div>
            <div class="setting-item" @click="showDeviceSelector = true">
              <span>切换设备</span>
              <span class="arrow">›</span>
            </div>
            <div class="setting-item">
              <span>长按空格通话 (PTT)</span>
              <label class="switch">
                <input type="checkbox" v-model="pttMode">
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- 结束按钮 -->
        <button 
          class="control-btn end-btn"
          @click="handleEndMeeting"
        >
          <span class="btn-icon">📴</span>
          <span class="btn-text">{{ isHost ? '结束会议' : '离开会议' }}</span>
        </button>
      </div>
    </footer>

    <!-- 设备选择器 -->
    <div v-if="showDeviceSelector" class="modal-overlay" @click="showDeviceSelector = false">
      <div class="modal-content" @click.stop>
        <h3>选择设备</h3>
        
        <div v-if="!hasAudioDevice || !hasVideoDevice" class="device-warning">
          <span class="icon">⚠️</span>
          <span>{{ getDeviceWarning }}</span>
        </div>
        
        <div class="device-section">
          <label>麦克风</label>
          <select v-model="selectedAudioDevice" @change="changeAudioDevice" :disabled="!hasAudioDevice">
            <option v-if="!hasAudioDevice" value="">未检测到麦克风</option>
            <option v-for="device in audioDevices" :key="device.deviceId" :value="device.deviceId">
              {{ device.label || `麦克风 ${device.deviceId.slice(0, 8)}` }}
            </option>
          </select>
        </div>
        <div class="device-section">
          <label>摄像头</label>
          <select v-model="selectedVideoDevice" @change="changeVideoDevice" :disabled="!hasVideoDevice">
            <option v-if="!hasVideoDevice" value="">未检测到摄像头</option>
            <option v-for="device in videoDevices" :key="device.deviceId" :value="device.deviceId">
              {{ device.label || `摄像头 ${device.deviceId.slice(0, 8)}` }}
            </option>
          </select>
        </div>
        <button class="btn-close" @click="showDeviceSelector = false">关闭</button>
      </div>
    </div>

    <!-- 屏幕共享选择器 -->
    <div v-if="showScreenSharePicker" class="modal-overlay" @click="cancelScreenShare">
      <div class="modal-content share-picker" @click.stop>
        <h3>选择共享内容</h3>
        <div class="share-options">
          <button class="share-option" @click="startScreenShare('screen')">
            <span class="icon">🖥️</span>
            <span class="label">共享整个屏幕</span>
          </button>
          <button class="share-option" @click="startScreenShare('window')">
            <span class="icon">📱</span>
            <span class="label">共享应用窗口</span>
          </button>
          <button class="share-option" @click="startScreenShare('tab')">
            <span class="icon">📑</span>
            <span class="label">共享浏览器标签页</span>
          </button>
        </div>
        <button class="btn-close" @click="cancelScreenShare">取消</button>
      </div>
    </div>

    <!-- 被主持人静音确认弹窗 -->
    <div v-if="showForceMuteDialog" class="modal-overlay">
      <div class="modal-content force-mute-dialog">
        <h3>您已被主持人静音</h3>
        <p>主持人已关闭您的麦克风。您需要手动点击下方按钮才能再次开启。</p>
        <button class="btn-confirm" @click="confirmUnmute">我知道了，确认开启麦克风</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { io } from 'socket.io-client'

const route = useRoute()
const router = useRouter()

// Refs
const localVideo = ref(null)
const screenShareVideo = ref(null)
const chatContainer = ref(null)
const videoRefs = ref({})

// State
const meeting = ref(null)
const participants = ref([])
const messages = ref([])
const localName = ref('')
const localParticipantId = ref(null)
const isHost = ref(false)
const isMuted = ref(true)
const isMutedByHost = ref(false)
const hasVideo = ref(false)
const isScreenSharing = ref(false)
const isSpeaking = ref(false)
const audioLevel = ref(0)
const backgroundBlur = ref(false)
const isRecording = ref(false)
const pttMode = ref(false)
const showSettings = ref(false)
const showDeviceSelector = ref(false)
const showScreenSharePicker = ref(false)
const showForceMuteDialog = ref(false)
const isTryingToSpeak = ref(false)

// Sidebar
const sidebarOpen = ref(false)
const sidebarTab = ref('members')

// Devices
const audioDevices = ref([])
const videoDevices = ref([])
const selectedAudioDevice = ref('')
const selectedVideoDevice = ref('')
const hasAudioDevice = computed(() => audioDevices.value.length > 0)
const hasVideoDevice = computed(() => videoDevices.value.length > 0)

// Screen share
let screenShareStream = null
const screenSharerName = ref('')

// Meeting state
const isLocked = ref(false)
const isAllMuted = ref(false)
const allowSelfUnmute = ref(true)

// Network
const networkQuality = ref('good')

// Active speaker
const activeSpeakerId = ref(null)
const handRaisedUsers = ref([]) // 举手用户列表

// Socket
const socket = ref(null)

// Media streams
let localAudioStream = null
let localVideoStream = null

// Audio context
let audioContext = null
let analyser = null
let audioDataArray = null
let animationFrame = null

// PTT mode
let isPttPressed = false

// 举手
const raiseHand = () => {
  socket.value?.emit('raise-hand', { meetingId: route.params.no })
}

// 取消举手
const lowerHand = () => {
  socket.value?.emit('lower-hand', { meetingId: route.params.no })
}

// 允许某用户发言（主持人）
const allowSpeak = (user) => {
  socket.value?.emit('allow-speak', {
    meetingId: route.params.no,
    targetSocketId: user.socketId
  })
}

// Methods
const setVideoRef = (socketId, el) => {
  if (el) videoRefs.value[socketId] = el
}

const getUserStatus = (user) => {
  if (user.isMutedByHost) return '已被静音'
  if (user.isMuted) return '静音中'
  if (user.isSpeaking) return '正在发言'
  return '在线'
}

const getMuteTooltip = () => {
  if (isMutedByHost.value) return '您已被主持人静音'
  return isMuted.value ? '点击取消静音' : '点击静音'
}

const getDeviceWarning = computed(() => {
  if (!hasAudioDevice.value && !hasVideoDevice.value) return '未检测到麦克风和摄像头'
  if (!hasAudioDevice.value) return '未检测到麦克风'
  if (!hasVideoDevice.value) return '未检测到摄像头'
  return ''
})

const sortedParticipants = computed(() => {
  return [...participants.value].sort((a, b) => {
    if (a.isSpeaking && !b.isSpeaking) return -1
    if (!a.isSpeaking && b.isSpeaking) return 1
    if (a.isHost && !b.isHost) return -1
    if (!a.isHost && b.isHost) return 1
    return 0
  })
})

const toggleAudio = async () => {
  if (isMutedByHost.value) {
    showForceMuteDialog.value = true
    return
  }
  
  isMuted.value = !isMuted.value
  
  if (localAudioStream) {
    localAudioStream.getAudioTracks().forEach(t => {
      t.enabled = !isMuted.value
    })
  }
  
  socket.value?.emit('toggle-audio', {
    meetingId: route.params.no,
    participantId: localParticipantId.value,
    isMuted: isMuted.value
  })
}

const confirmUnmute = () => {
  isMutedByHost.value = false
  isMuted.value = false
  showForceMuteDialog.value = false
  
  if (localAudioStream) {
    localAudioStream.getAudioTracks().forEach(t => t.enabled = true)
  }
  
  socket.value?.emit('toggle-audio', {
    meetingId: route.params.no,
    participantId: localParticipantId.value,
    isMuted: false
  })
}

const toggleVideo = async () => {
  if (hasVideo.value) {
    hasVideo.value = false
    if (localVideoStream) {
      localVideoStream.getTracks().forEach(t => t.stop())
      localVideoStream = null
    }
  } else {
    try {
      const constraints = selectedVideoDevice.value 
        ? { video: { deviceId: selectedVideoDevice.value } }
        : { video: true }
      localVideoStream = await navigator.mediaDevices.getUserMedia(constraints)
      hasVideo.value = true
      if (localVideo.value) {
        localVideo.value.srcObject = localVideoStream
      }
    } catch (e) {
      console.error('无法访问摄像头:', e)
      alert('无法访问摄像头，请检查权限设置')
    }
  }
  
  socket.value?.emit('toggle-video', {
    meetingId: route.params.no,
    participantId: localParticipantId.value,
    hasVideo: hasVideo.value
  })
}

const toggleScreenShare = async () => {
  if (isScreenSharing.value) {
    stopScreenShare()
  } else {
    showScreenSharePicker.value = true
  }
}

const startScreenShare = async (type) => {
  try {
    const constraints = { video: { cursor: 'always' }, audio: true }
    screenShareStream = await navigator.mediaDevices.getDisplayMedia(constraints)
    showScreenSharePicker.value = false
    isScreenSharing.value = true
    
    if (screenShareVideo.value) {
      screenShareVideo.value.srcObject = screenShareStream
    }
    
    socket.value?.emit('start-screen-share', {
      meetingId: route.params.no,
      participantId: localParticipantId.value
    })
    
    screenShareStream.getVideoTracks()[0].onended = () => {
      stopScreenShare()
    }
  } catch (e) {
    console.error('屏幕共享失败:', e)
    showScreenSharePicker.value = false
  }
}

const stopScreenShare = () => {
  if (screenShareStream) {
    screenShareStream.getTracks().forEach(t => t.stop())
    screenShareStream = null
  }
  isScreenSharing.value = false
  screenSharerName.value = ''
  socket.value?.emit('stop-screen-share', {
    meetingId: route.params.no,
    participantId: localParticipantId.value
  })
}

const cancelScreenShare = () => {
  showScreenSharePicker.value = false
}

const openSidebar = (tab) => {
  if (sidebarOpen.value && sidebarTab.value === tab) {
    sidebarOpen.value = false
  } else {
    sidebarTab.value = tab
    sidebarOpen.value = true
  }
}

const toggleMuteUser = (user) => {
  const newMuteState = !user.isMuted
  socket.value?.emit('mute-participant', {
    meetingId: route.params.no,
    targetSocketId: user.socketId,
    mute: newMuteState
  })
}

const removeUser = (user) => {
  if (confirm(`确定要将 ${user.name} 移出会议吗？`)) {
    socket.value?.emit('remove-participant', {
      meetingId: route.params.no,
      targetSocketId: user.socketId
    })
  }
}

const toggleMuteAll = () => {
  if (isAllMuted.value) {
    socket.value?.emit('unmute-all', { meetingId: route.params.no })
    isAllMuted.value = false
  } else {
    socket.value?.emit('mute-all', { 
      meetingId: route.params.no,
      allowSelfUnmute: allowSelfUnmute.value
    })
    isAllMuted.value = true
  }
}

const toggleLock = async () => {
  try {
    const url = isLocked.value 
      ? `/api/meetings/${meeting.value.id}/unlock`
      : `/api/meetings/${meeting.value.id}/lock`
    const res = await fetch(url, { method: 'POST' })
    const data = await res.json()
    if (data.success) {
      isLocked.value = !isLocked.value
    }
  } catch (e) {
    console.error('锁定操作失败:', e)
  }
}

const changeAudioDevice = async () => {
  if (localAudioStream) {
    localAudioStream.getTracks().forEach(t => t.stop())
  }
  try {
    localAudioStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: selectedAudioDevice.value }
    })
    if (!isMuted.value) {
      localAudioStream.getAudioTracks().forEach(t => t.enabled = true)
    }
  } catch (e) {
    console.error('切换麦克风失败:', e)
  }
}

const changeVideoDevice = async () => {
  if (localVideoStream) {
    localVideoStream.getTracks().forEach(t => t.stop())
  }
  await toggleVideo()
}

const chatMessage = ref('')
const sendChatMessage = () => {
  if (!chatMessage.value.trim()) return
  messages.value.push({
    name: localName.value,
    content: chatMessage.value,
    isSelf: true
  })
  socket.value?.emit('chat-message', {
    meetingId: route.params.no,
    senderName: localName.value,
    content: chatMessage.value
  })
  chatMessage.value = ''
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

const handleEndMeeting = () => {
  if (isHost.value) {
    if (confirm('确定要结束会议吗？所有参会者将被移出。')) {
      endMeeting()
    }
  } else {
    leaveMeeting()
  }
}

const endMeeting = async () => {
  try {
    await fetch(`/api/meetings/${meeting.value.id}/end`, { method: 'POST' })
    cleanup()
    router.push('/')
  } catch (e) {
    console.error('结束会议失败:', e)
  }
}

const leaveMeeting = () => {
  cleanup()
  router.push('/')
}

const cleanup = () => {
  socket.value?.emit('leave-room', { meetingId: route.params.no })
  socket.value?.disconnect()
  if (localAudioStream) localAudioStream.getTracks().forEach(t => t.stop())
  if (localVideoStream) localVideoStream.getTracks().forEach(t => t.stop())
  if (screenShareStream) screenShareStream.getTracks().forEach(t => t.stop())
  if (audioContext) audioContext.close()
  if (animationFrame) cancelAnimationFrame(animationFrame)
}

const initAudioMonitoring = () => {
  if (!localAudioStream) return
  
  audioContext = new (window.AudioContext || window.webkitAudioContext)()
  analyser = audioContext.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = 0.8
  
  const source = audioContext.createMediaStreamSource(localAudioStream)
  source.connect(analyser)
  
  audioDataArray = new Uint8Array(analyser.frequencyBinCount)
  
  const updateLevel = () => {
    if (!localAudioStream) {
      audioLevel.value = 0
      animationFrame = requestAnimationFrame(updateLevel)
      return
    }
    
    analyser.getByteFrequencyData(audioDataArray)
    
    let sum = 0
    for (let i = 0; i < audioDataArray.length; i++) {
      sum += audioDataArray[i]
    }
    const average = sum / audioDataArray.length
    
    audioLevel.value = Math.min(100, audioLevel.value * 0.7 + average * 1.5 * 0.3)
    
    const wasSpeaking = isSpeaking.value
    isSpeaking.value = !isMuted.value && average > 20
    
    if (isSpeaking.value && isMuted.value) {
      isTryingToSpeak.value = true
      setTimeout(() => {
        isTryingToSpeak.value = false
      }, 3000)
    }
    
    animationFrame = requestAnimationFrame(updateLevel)
  }
  updateLevel()
}

const handlePttKeydown = (e) => {
  if (!pttMode.value || e.repeat) return
  if (e.code === 'Space') {
    e.preventDefault()
    if (isMuted.value && !isMutedByHost.value) {
      isMuted.value = false
      if (localAudioStream) {
        localAudioStream.getAudioTracks().forEach(t => t.enabled = true)
      }
    }
    isPttPressed = true
  }
}

const handlePttKeyup = (e) => {
  if (!pttMode.value) return
  if (e.code === 'Space') {
    e.preventDefault()
    if (!isMutedByHost.value && isPttPressed) {
      isMuted.value = true
      if (localAudioStream) {
        localAudioStream.getAudioTracks().forEach(t => t.enabled = false)
      }
      socket.value?.emit('toggle-audio', {
        meetingId: route.params.no,
        participantId: localParticipantId.value,
        isMuted: true
      })
    }
    isPttPressed = false
  }
}

const initSocket = () => {
  socket.value = io({
    transports: ['websocket', 'polling'],
    reconnection: true
  })
  
  socket.value.on('connect', () => {
    socket.value.emit('join-room', {
      meetingId: route.params.no,
      participantId: localParticipantId.value,
      participantName: localName.value,
      isHost: isHost.value
    })
  })

  socket.value.on('room-users', (users) => {
    participants.value = users.filter(u => u.socketId !== socket.value.id)
    updateActiveSpeaker()
  })

  socket.value.on('user-joined', (user) => {
    participants.value.push(user)
    messages.value.push({
      name: '系统',
      content: `${user.name} 加入了会议`,
      isSelf: false
    })
    updateActiveSpeaker()
  })

  socket.value.on('user-left', ({ socketId }) => {
    const user = participants.value.find(p => p.socketId === socketId)
    if (user) {
      messages.value.push({
        name: '系统',
        content: `${user.name} 离开了会议`,
        isSelf: false
      })
    }
    participants.value = participants.value.filter(p => p.socketId !== socketId)
    updateActiveSpeaker()
  })

  socket.value.on('participant-updated', (data) => {
    const user = participants.value.find(p => p.socketId === data.socketId)
    if (user) {
      Object.assign(user, data)
    }
    if (data.socketId === socket.value.id) {
      if (data.isMuted !== undefined) {
        isMuted.value = data.isMuted
        isMutedByHost.value = data.isMutedByHost || false
      }
      if (data.hasVideo !== undefined) hasVideo.value = data.hasVideo
    }
    updateActiveSpeaker()
  })

  socket.value.on('screen-share-started', ({ participantName }) => {
    isScreenSharing.value = true
    screenSharerName.value = participantName
  })

  socket.value.on('screen-share-stopped', () => {
    isScreenSharing.value = false
    screenSharerName.value = ''
  })

  socket.value.on('meeting-locked', () => {
    isLocked.value = true
    messages.value.push({ name: '系统', content: '会议已锁定', isSelf: false })
  })

  socket.value.on('meeting-unlocked', () => {
    isLocked.value = false
    messages.value.push({ name: '系统', content: '会议已解锁', isSelf: false })
  })

  socket.value.on('all-muted', ({ allowSelfUnmute: allow }) => {
    isAllMuted.value = true
    isMuted.value = true
    isMutedByHost.value = !allow
    allowSelfUnmute.value = allow
    if (localAudioStream) {
      localAudioStream.getAudioTracks().forEach(t => t.enabled = false)
    }
  })

  socket.value.on('all-unmuted', () => {
    isAllMuted.value = false
    isMuted.value = false
    isMutedByHost.value = false
    if (localAudioStream) {
      localAudioStream.getAudioTracks().forEach(t => t.enabled = true)
    }
  })

  socket.value.on('chat-message', (msg) => {
    if (!msg.isSelf) {
      messages.value.push(msg)
      nextTick(() => {
        if (chatContainer.value) {
          chatContainer.value.scrollTop = chatContainer.value.scrollHeight
        }
      })
    }
  })

  socket.value.on('meeting-ended', () => {
    alert('会议已结束')
    cleanup()
    router.push('/')
  })
}

const updateActiveSpeaker = () => {
  const speakingUser = participants.value.find(p => p.isSpeaking)
  activeSpeakerId.value = speakingUser ? speakingUser.socketId : null
}

const initMediaDevices = async () => {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .catch(() => {})
    
    const devices = await navigator.mediaDevices.enumerateDevices()
    audioDevices.value = devices.filter(d => d.kind === 'audioinput')
    videoDevices.value = devices.filter(d => d.kind === 'videoinput')
    
    if (audioDevices.value.length) selectedAudioDevice.value = audioDevices.value[0].deviceId
    if (videoDevices.value.length) selectedVideoDevice.value = videoDevices.value[0].deviceId
  } catch (e) {
    console.error('获取设备列表失败:', e)
  }
}

const fetchMeeting = async () => {
  try {
    const res = await fetch(`/api/meetings/${route.params.no}`)
    const data = await res.json()
    if (data.success) {
      meeting.value = data.data.meeting
      localName.value = route.query.name || localStorage.getItem('userName') || '匿名用户'
      isHost.value = data.data.meeting.hostName.trim().toLowerCase() === localName.value.trim().toLowerCase()
      isMuted.value = !isHost.value
      localParticipantId.value = Date.now()
    } else {
      alert(data.message || '会议不存在')
      router.push('/')
    }
  } catch (e) {
    router.push('/')
  }
}

onMounted(async () => {
  localName.value = route.query.name || localStorage.getItem('userName') || '匿名用户'
  await fetchMeeting()
  await initMediaDevices()
  
  try {
    localAudioStream = await navigator.mediaDevices.getUserMedia({ 
      audio: selectedAudioDevice.value ? { deviceId: selectedAudioDevice.value } : true 
    })
    initAudioMonitoring()
  } catch (e) {
    console.warn('无法访问麦克风:', e)
  }
  
  // 监听 PTT 模式
  if (pttMode.value) {
    window.addEventListener('keydown', handlePttKeydown)
    window.addEventListener('keyup', handlePttKeyup)
  }
  
  initSocket()
})

onUnmounted(() => {
  cleanup()
  window.removeEventListener('keydown', handlePttKeydown)
  window.removeEventListener('keyup', handlePttKeyup)
})

// 监听 PTT 模式变化
import { watch } from 'vue'
watch(pttMode, (val) => {
  if (val) {
    window.addEventListener('keydown', handlePttKeydown)
    window.addEventListener('keyup', handlePttKeyup)
  } else {
    window.removeEventListener('keydown', handlePttKeydown)
    window.removeEventListener('keyup', handlePttKeyup)
  }
})
</style>
