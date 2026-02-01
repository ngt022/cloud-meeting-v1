<template>
  <div class="join">
    <div class="container">
      <h1>加入会议</h1>
      <p class="version">v1.0.2</p>
      
      <div class="form-group">
        <label>会议号</label>
        <input 
          v-model="meetingNo" 
          placeholder="请输入8位数字会议号"
          maxlength="12"
          @input="meetingNo = meetingNo.replace(/[^0-9]/g, '')"
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
          @keyup.enter="joinMeeting"
        />
      </div>

      <button class="btn-primary" @click="checkMeeting" :disabled="!canCheck">
        {{ needsPassword ? '加入会议' : '下一步' }}
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
      
      // 无密码直接加入，有密码显示密码输入框
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
        password: needsPassword.value ? password.value : undefined
      })
    })
    const data = await res.json()
    
    if (data.success) {
      // 保存用户名到 localStorage
      localStorage.setItem('userName', name.value)
      
      router.push({
        path: `/meeting/${meetingNo.value}`,
        query: { name: name.value }
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
  background: #0a0a0a;
  padding: 20px;
}

.container {
  background: #141414;
  padding: 48px;
  border-radius: 4px;
  width: 100%;
  max-width: 400px;
  border: 1px solid #222;
}

h1 {
  text-align: center;
  margin-bottom: 40px;
  font-weight: 300;
  color: #fff;
  letter-spacing: 4px;
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  margin-bottom: 10px;
  font-size: 12px;
  color: #888;
  letter-spacing: 1px;
}

.form-group input {
  width: 100%;
  padding: 14px;
  background: #0a0a0a;
  border: 1px solid #222;
  border-radius: 2px;
  font-size: 14px;
  color: #fff;
  letter-spacing: 1px;
}

.form-group input:focus {
  border-color: #444;
  outline: none;
}

.form-group input::placeholder {
  color: #444;
}

.version {
  text-align: center;
  color: #444;
  font-size: 12px;
  margin-bottom: 24px;
}

.btn-primary {
  width: 100%;
  padding: 16px;
  background: #fff;
  color: #000;
  border: none;
  border-radius: 2px;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 2px;
  cursor: pointer;
  margin-bottom: 12px;
  transition: all 0.3s;
}

.btn-primary:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-primary:hover:not(:disabled) {
  background: #ddd;
}

.btn-back {
  width: 100%;
  padding: 14px;
  background: transparent;
  color: #888;
  border: 1px solid #333;
  border-radius: 2px;
  font-size: 14px;
  letter-spacing: 2px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-back:hover {
  border-color: #555;
  color: #fff;
}
</style>
