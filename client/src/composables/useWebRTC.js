import { ref, onUnmounted } from 'vue'

const peerConnections = ref(new Map())
const remoteAudioStreams = ref(new Map())
const remoteVideoStreams = ref(new Map())

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

// 本地流
let localAudioStream = null
let localVideoStream = null
let localScreenStream = null

export function useWebRTC() {
  const socket = ref(null)
  const meetingId = ref(null)

  // 初始化本地音频
  const initLocalAudio = async (deviceId = null) => {
    try {
      const constraints = deviceId 
        ? { audio: { deviceId: { exact: deviceId } } }
        : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
      localAudioStream = await navigator.mediaDevices.getUserMedia(constraints)
      return localAudioStream
    } catch (e) {
      console.error('无法访问麦克风:', e)
      return null
    }
  }

  // 初始化本地视频
  const initLocalVideo = async (deviceId = null) => {
    try {
      const constraints = deviceId
        ? { video: { deviceId: { exact: deviceId } } }
        : { video: { width: 640, height: 480 } }
      localVideoStream = await navigator.mediaDevices.getUserMedia(constraints)
      return localVideoStream
    } catch (e) {
      console.error('无法访问摄像头:', e)
      return null
    }
  }

  // 初始化屏幕共享
  const initScreenShare = async () => {
    try {
      localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true
      })
      return localScreenStream
    } catch (e) {
      console.error('屏幕共享失败:', e)
      return null
    }
  }

  // 获取本地流
  const getLocalAudioStream = () => localAudioStream
  const getLocalVideoStream = () => localVideoStream
  const getLocalScreenStream = () => localScreenStream

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

    // 添加本地视频轨道
    if (localVideoStream) {
      localVideoStream.getTracks().forEach(track => {
        pc.addTrack(track, localVideoStream)
      })
    }

    // 添加屏幕共享轨道
    if (localScreenStream) {
      localScreenStream.getVideoTracks().forEach(track => {
        pc.addTrack(track, localScreenStream)
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
      console.log('[WebRTC] 收到远程轨道 from:', targetSocketId)
      const [stream] = event.streams
      
      // 根据轨道类型区分音频和视频
      event.streams.forEach(s => {
        s.getTracks().forEach(track => {
          if (track.kind === 'audio') {
            remoteAudioStreams.value.set(targetSocketId, s)
          } else if (track.kind === 'video') {
            remoteVideoStreams.value.set(targetSocketId, s)
          }
        })
      })
    }

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] 与 ${targetSocketId} 的连接状态:`, pc.connectionState)
      if (pc.connectionState === 'failed') {
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
    remoteVideoStreams.value.delete(targetSocketId)
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
      console.error('[WebRTC] 创建 offer 失败:', e)
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
      console.error('[WebRTC] 处理 offer 失败:', e)
    }
  }

  // 处理收到的 answer
  const handleAnswer = async ({ fromSocketId, answer }) => {
    const pc = peerConnections.value.get(fromSocketId)
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
      } catch (e) {
        console.error('[WebRTC] 处理 answer 失败:', e)
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
        console.error('[WebRTC] 添加 ICE candidate 失败:', e)
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
    remoteVideoStreams.value.delete(socketId)
  }

  // 更新音频轨道状态
  const updateAudioTrack = (enabled) => {
    if (localAudioStream) {
      localAudioStream.getAudioTracks().forEach(track => {
        track.enabled = enabled
      })
    }
  }

  // 更新视频轨道状态
  const updateVideoTrack = (enabled) => {
    if (localVideoStream) {
      localVideoStream.getVideoTracks().forEach(track => {
        track.enabled = enabled
      })
    }
  }

  // 替换视频轨道（切换摄像头时使用）
  const replaceVideoTrack = async (newStream) => {
    if (!newStream) return
    
    localVideoStream = newStream
    const newTrack = newStream.getVideoTracks()[0]
    
    peerConnections.value.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video')
      if (sender && newTrack) {
        sender.replaceTrack(newTrack)
      }
    })
  }

  // 替换音频轨道（切换麦克风时使用）
  const replaceAudioTrack = async (newStream) => {
    if (!newStream) return
    
    localAudioStream = newStream
    const newTrack = newStream.getAudioTracks()[0]
    
    peerConnections.value.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio')
      if (sender && newTrack) {
        sender.replaceTrack(newTrack)
      }
    })
  }

  // 添加屏幕共享轨道
  const addScreenShareTrack = () => {
    if (!localScreenStream) return
    
    const videoTrack = localScreenStream.getVideoTracks()[0]
    
    peerConnections.value.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video')
      if (sender && videoTrack) {
        sender.replaceTrack(videoTrack)
      }
    })

    // 监听屏幕共享结束
    videoTrack.onended = () => {
      removeScreenShareTrack()
    }
  }

  // 移除屏幕共享轨道，恢复摄像头
  const removeScreenShareTrack = () => {
    if (localVideoStream) {
      const videoTrack = localVideoStream.getVideoTracks()[0]
      
      peerConnections.value.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack)
        }
      })
    }
  }

  // 获取远程流
  const getRemoteAudioStream = (socketId) => remoteAudioStreams.value.get(socketId)
  const getRemoteVideoStream = (socketId) => remoteVideoStreams.value.get(socketId)

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
    remoteVideoStreams.value.clear()
    
    if (localAudioStream) {
      localAudioStream.getTracks().forEach(t => t.stop())
      localAudioStream = null
    }
    if (localVideoStream) {
      localVideoStream.getTracks().forEach(t => t.stop())
      localVideoStream = null
    }
    if (localScreenStream) {
      localScreenStream.getTracks().forEach(t => t.stop())
      localScreenStream = null
    }
  }

  onUnmounted(() => {
    cleanup()
  })

  return {
    initLocalAudio,
    initLocalVideo,
    initScreenShare,
    getLocalAudioStream,
    getLocalVideoStream,
    getLocalScreenStream,
    setup,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    connectToAllPeers,
    handleUserJoined,
    handleUserLeft,
    updateAudioTrack,
    updateVideoTrack,
    replaceVideoTrack,
    replaceAudioTrack,
    addScreenShareTrack,
    removeScreenShareTrack,
    getRemoteAudioStream,
    getRemoteVideoStream,
    cleanup,
    peerConnections,
    remoteAudioStreams,
    remoteVideoStreams
  }
}
