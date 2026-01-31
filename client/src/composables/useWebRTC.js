import { ref, onUnmounted } from 'vue'

const peerConnections = ref(new Map())
const remoteAudioStreams = ref(new Map())
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
}

// 本地音频流
let localAudioStream = null
let isMutedState = true  // 静音状态锁

export function useWebRTC() {
  const socket = ref(null)
  const meetingId = ref(null)

  // 初始化本地音频
  const initLocalAudio = async () => {
    try {
      localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      return localAudioStream
    } catch (e) {
      console.error('无法访问麦克风:', e)
      return null
    }
  }

  // 获取本地音频流
  const getLocalAudioStream = () => localAudioStream

  // 创建对等连接
  const createPeerConnection = (targetSocketId) => {
    if (peerConnections.value.has(targetSocketId)) {
      return peerConnections.value.get(targetSocketId)
    }

    const pc = new RTCPeerConnection(ICE_SERVERS)

    // 添加本地音频轨道
    if (localAudioStream) {
      localAudioStream.getTracks().forEach(track => {
        pc.addTrack(track, localAudioStream)
      })
    }

    // 处理 ICE candidate
    pc.onicecandidate = (event) => {
      console.log('[WebRTC] ICE candidate 生成:', event.candidate ? '有' : 'null')
      if (event.candidate && socket.value) {
        socket.value.emit('webrtc-ice-candidate', {
          meetingId: meetingId.value,
          targetSocketId,
          candidate: event.candidate
        })
      }
    }

    // 处理远程轨道
    pc.ontrack = (event) => {
      console.log('[WebRTC] 收到远程轨道:', targetSocketId)
      const [stream] = event.streams
      console.log('[WebRTC] 远程流轨道数:', stream.getTracks().length)
      remoteAudioStreams.value.set(targetSocketId, stream)
    }

    // 连接状态变化
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] 与 ${targetSocketId} 的连接状态:`, pc.connectionState)
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        handleConnectionFailure(targetSocketId)
      }
    }

    peerConnections.value.set(targetSocketId, pc)
    console.log('[WebRTC] 创建对等连接:', targetSocketId, '当前总数:', peerConnections.value.size)
    return pc
  }

  // 处理连接失败
  const handleConnectionFailure = (targetSocketId) => {
    const pc = peerConnections.value.get(targetSocketId)
    if (pc) {
      pc.close()
      peerConnections.value.delete(targetSocketId)
    }
    remoteAudioStreams.value.delete(targetSocketId)
  }

  // 创建并发送 offer
  const createOffer = async (targetSocketId) => {
    const pc = createPeerConnection(targetSocketId)
    try {
      console.log('[WebRTC] 创建 offer:', targetSocketId)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      console.log('[WebRTC] 发送 offer:', targetSocketId)
      socket.value.emit('webrtc-offer', {
        meetingId: meetingId.value,
        targetSocketId,
        offer
      })
    } catch (e) {
      console.error('[WebRTC] 创建 offer 失败:', e)
    }
  }

  // 处理收到的 offer
  const handleOffer = async ({ fromSocketId, offer }) => {
    console.log('[WebRTC] 收到 offer:', fromSocketId)
    const pc = createPeerConnection(fromSocketId)
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      console.log('[WebRTC] 发送 answer:', fromSocketId)
      socket.value.emit('webrtc-answer', {
        meetingId: meetingId.value,
        targetSocketId: fromSocketId,
        answer
      })
    } catch (e) {
      console.error('[WebRTC] 处理 offer 失败:', e)
    }
  }

  // 处理收到的 answer
  const handleAnswer = async ({ fromSocketId, answer }) => {
    console.log('[WebRTC] 收到 answer:', fromSocketId)
    const pc = peerConnections.value.get(fromSocketId)
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
        console.log('[WebRTC] 设置远程描述成功:', fromSocketId)
      } catch (e) {
        console.error('[WebRTC] 处理 answer 失败:', e)
      }
    } else {
      console.warn('[WebRTC] 未找到对等连接:', fromSocketId)
    }
  }

  // 处理收到的 ICE candidate
  const handleIceCandidate = async ({ fromSocketId, candidate }) => {
    console.log('[WebRTC] 收到 ICE candidate:', fromSocketId)
    const pc = peerConnections.value.get(fromSocketId)
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (e) {
        console.error('[WebRTC] 添加 ICE candidate 失败:', e)
      }
    } else {
      console.warn('[WebRTC] 添加 ICE candidate 时未找到连接:', fromSocketId)
    }
  }

  // 为所有现有用户创建连接
  const connectToAllPeers = (users) => {
    users.forEach(user => {
      if (user.socketId !== socket.value?.id) {
        createOffer(user.socketId)
      }
    })
  }

  // 处理新用户加入
  const handleUserJoined = (user) => {
    // 新用户加入后，我们创建连接向其发起 offer
    setTimeout(() => {
      createOffer(user.socketId)
    }, 500)
  }

  // 处理用户离开
  const handleUserLeft = ({ socketId }) => {
    console.log('[WebRTC] 用户离开:', socketId)
    const pc = peerConnections.value.get(socketId)
    if (pc) {
      pc.close()
      peerConnections.value.delete(socketId)
    }
    remoteAudioStreams.value.delete(socketId)
    console.log('[WebRTC] 清理完成，剩余连接:', peerConnections.value.size)
  }

  // 更新本地音频轨道状态（静音/取消静音）
  const updateLocalAudioTrack = (enabled) => {
    // 使用状态锁，防止并发更新
    const newState = enabled
    if (newState === isMutedState) {
      console.log('[WebRTC] 音频状态无变化，跳过:', newState)
      return
    }
    isMutedState = newState
    
    console.log('[WebRTC] 更新本地音频轨道:', newState)
    if (localAudioStream) {
      localAudioStream.getAudioTracks().forEach(track => {
        console.log('[WebRTC] 音频轨道设置 enabled:', newState, '原状态:', track.enabled)
        track.enabled = newState
        console.log('[WebRTC] 音频轨道实际 enabled:', track.enabled)
      })
    }
  }

  // 获取远程音频流
  const getRemoteAudioStream = (socketId) => {
    return remoteAudioStreams.value.get(socketId)
  }

  // 获取所有远程音频流
  const getAllRemoteAudioStreams = () => {
    return remoteAudioStreams.value
  }

  // 设置 socket 和 meetingId
  const setup = (socketRef, meetingIdValue) => {
    socket.value = socketRef
    meetingId.value = meetingIdValue
  }

  // 清理所有连接
  const cleanup = () => {
    peerConnections.value.forEach(pc => pc.close())
    peerConnections.value.clear()
    remoteAudioStreams.value.clear()
    if (localAudioStream) {
      localAudioStream.getTracks().forEach(t => t.stop())
      localAudioStream = null
    }
    isMutedState = true  // 重置静音状态
  }

  // 检查是否静音
  const isMuted = () => {
    if (localAudioStream) {
      const audioTrack = localAudioStream.getAudioTracks()[0]
      return audioTrack ? !audioTrack.enabled : true
    }
    return true
  }

  onUnmounted(() => {
    cleanup()
  })

  return {
    initLocalAudio,
    getLocalAudioStream,
    setup,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    connectToAllPeers,
    handleUserJoined,
    handleUserLeft,
    updateLocalAudioTrack,
    getRemoteAudioStream,
    getAllRemoteAudioStreams,
    cleanup,
    isMuted,
    peerConnections,
    remoteAudioStreams
  }
}
