<template>
  <div class="join">
    <div class="container">
      <h1>加入会议</h1>
      
      <div class="form-group">
        <label>会议号</label>
        <input 
          v-model="meetingNo" 
          placeholder="请输入会议号"
          maxlength="12"
        />
      </div>

      <div class="form-group">
        <label>您的名称</label>
        <input 
          v-model="name" 
          placeholder="请输入您的名称"
          maxlength="20"
        />
      </div>

      <div class="form-group" v-if="needsPassword">
        <label>会议密码</label>
        <input 
          v-model="password" 
          type="password"
          placeholder="请输入会议密码"
        />
      </div>

      <button class="btn-primary" @click="checkMeeting" :disabled="!canCheck">
        下一步
      </button>
      
      <button class="btn-back" @click="$router.push('/')">
        返回首页
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const meetingNo = ref('')
const name = ref('')
const password = ref('')
const needsPassword = ref(false)
const meetingId = ref(null)
const meetingData = ref(null)

const canCheck = computed(() => meetingNo.value.trim() && name.value.trim())

onMounted(() => {
  if (route.params.no) {
    meetingNo.value = route.params.no
  }
})

const checkMeeting = async () => {
  if (!canCheck.value) return
  
  try {
    const res = await fetch(`/api/meetings/${meetingNo.value}`)
    const data = await res.json()
    
    if (data.success) {
      meetingData.value = data.data.meeting
      meetingId.value = data.data.meeting.id
      needsPassword.value = !!data.data.meeting.password
      
      if (!needsPassword.value) {
        joinMeeting()
      }
    } else {
      alert(data.message || '会议不存在')
    }
  } catch (e) {
    alert('检查会议失败')
  }
}

const joinMeeting = async () => {
  try {
    const res = await fetch(`/api/meetings/${meetingId.value}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.value,
        password: password.value || undefined
      })
    })
    const data = await res.json()
    
    if (data.success) {
      router.push({
        path: '/meeting',
        query: { 
          no: meetingNo.value,
          id: meetingId.value,
          name: name.value
        }
      })
    } else {
      alert(data.message || '加入失败')
    }
  } catch (e) {
    alert('加入失败')
  }
}
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

.container {
  background: white;
  padding: 40px;
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
}

h1 {
  text-align: center;
  margin-bottom: 32px;
  color: #333;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
}

.form-group input {
  width: 100%;
  padding: 14px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
}

.form-group input:focus {
  border-color: #667eea;
  outline: none;
}

.btn-primary {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 12px;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-back {
  width: 100%;
  padding: 14px;
  background: #f0f0f0;
  color: #666;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
}
</style>
