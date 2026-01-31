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
      const [stream] = event.streams
      remoteAudioStreams.value.set(targetSocketId, stream)
    }

    // 连接状态变化
    pc.onconnectionstatechange = () => {
      console.log(`与 ${targetSocketId} 的连接状态:`, pc.connectionState)
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        handleConnectionFailure(targetSocketId)
      }
    }

    peerConnections.value.set(targetSocketId, pc)
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
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.value.emit('webrtc-offer', {
        meetingId: meetingId.value,
        targetSocketId,
        offer
      })
    } catch (e) {
      console.error('创建 offer 失败:', e)
    }
  }

  // 处理收到的 offer
  const handleOffer = async ({ fromSocketId, offer }) => {
    const pc = createPeerConnection(fromSocketId)
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.value.emit('webrtc-answer', {
        meetingId: meetingId.value,
        targetSocketId: fromSocketId,
        answer
      })
    } catch (e) {
      console.error('处理 offer 失败:', e)
    }
  }

  // 处理收到的 answer
  const handleAnswer = async ({ fromSocketId, answer }) => {
    const pc = peerConnections.value.get(fromSocketId)
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
      } catch (e) {
        console.error('处理 answer 失败:', e)
      }
    }
  }

  // 处理收到的 ICE candidate
  const handleIceCandidate = async ({ fromSocketId, candidate }) => {
    const pc = peerConnections.value.get(fromSocketId)
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (e) {
        console.error('添加 ICE candidate 失败:', e)
      }
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
    const pc = peerConnections.value.get(socketId)
    if (pc) {
      pc.close()
      peerConnections.value.delete(socketId)
    }
    remoteAudioStreams.value.delete(socketId)
  }

  // 更新本地音频轨道状态（静音/取消静音）
  const updateLocalAudioTrack = (enabled) => {
    if (localAudioStream) {
      localAudioStream.getAudioTracks().forEach(track => {
        track.enabled = enabled
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
