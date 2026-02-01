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



</script>

<style scoped>



</style>