import { ref, onUnmounted } from 'vue'
import { io } from 'socket.io-client'

export function useSocket() {
  const socket = ref(null)
  const connected = ref(false)

  const connect = () => {
    socket.value = io(window.location.origin, {
      transports: ['websocket', 'polling']
    })

    socket.value.on('connect', () => {
      connected.value = true
    })

    socket.value.on('disconnect', () => {
      connected.value = false
    })
  }

  const disconnect = () => {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
    }
  }

  onUnmounted(disconnect)

  return {
    socket,
    connected,
    connect,
    disconnect
  }
}
