<template>
  <div class="join">
    <div class="join-card">
      <h1>📹 CloudMeeting</h1>
      <p>输入会议号加入会议</p>
      
      <div class="form">
        <input 
          v-model="name" 
          placeholder="您的名称"
          maxlength="20"
          @input="saveName"
        />
        <input 
          v-model="meetingNo" 
          placeholder="会议号"
          maxlength="12"
          @input="meetingNo = meetingNo.replace(/\D/g, '')"
        />
        <input 
          v-model="password" 
          type="password"
          placeholder="会议密码 (可选)"
          maxlength="10"
        />
        <button @click="handleJoin" :disabled="!canJoin || joining">
          {{ joining ? '加入中...' : '加入会议' }}
        </button>
      </div>
      
      <div class="back" @click="$router.push('/')">
        返回首页
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const name = ref('')
const meetingNo = ref('')
const password = ref('')
const joining = ref(false)

const canJoin = computed(() => name.value.trim() && meetingNo.value.length === 12)

const saveName = () => {
  localStorage.setItem('userName', name.value)
}

const handleJoin = async () => {
  if (!canJoin.value) return
  joining.value = true
  
  try {
    localStorage.setItem('userName', name.value)
    
    const res = await fetch(`/api/meetings/${meetingNo.value}`)
    const data = await res.json()
    
    if (data.success) {
      const joinRes = await fetch(`/api/meetings/${data.data.meeting.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.value, password: password.value })
      })
      const joinData = await joinRes.json()
      if (joinData.success) {
        router.push(`/meeting/${data.data.meeting.id}`)
      } else {
        alert(joinData.message || '加入失败')
      }
    } else {
      alert(data.message || '会议不存在')
    }
  } catch (e) {
    alert('加入失败')
  }
  joining.value = false
}

onMounted(() => {
  name.value = localStorage.getItem('userName') || ''
  if (route.params.meetingNo) {
    meetingNo.value = route.params.meetingNo
  }
})
</script>

<style scoped>
.join {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.join-card {
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  padding: 48px;
  width: 100%;
  max-width: 400px;
  text-align: center;
}

h1 { font-size: 32px; margin-bottom: 8px; color: #1a1a2e; }
p { color: #64748b; margin-bottom: 32px; }

.form { display: flex; flex-direction: column; gap: 16px; }

input {
  width: 100%;
  padding: 16px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  font-size: 16px;
  transition: all 0.3s;
}

input:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 4px rgba(102,126,234,0.1); }

button {
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

button:hover:not(:disabled) { opacity: 0.9; transform: translateY(-2px); }
button:disabled { opacity: 0.6; cursor: not-allowed; }

.back {
  margin-top: 24px;
  color: #667eea;
  cursor: pointer;
}

.back:hover { text-decoration: underline; }
</style>
