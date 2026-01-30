<template>
  <div class="home">
    <div class="header">
      <h1>CloudMeeting</h1>
      <p>极简视频会议 - 无需注册，开箱即用</p>
    </div>

    <div class="actions">
      <button class="btn-primary large" @click="showCreateModal = true">
        创建会议
      </button>
      <button class="btn-secondary large" @click="showJoinModal = true">
        加入会议
      </button>
    </div>

    <!-- 创建会议弹窗 -->
    <div class="modal" v-if="showCreateModal" @click.self="showCreateModal = false">
      <div class="modal-content">
        <h2>创建会议</h2>
        <div class="form-group">
          <label>会议名称</label>
          <input v-model="createForm.title" placeholder="请输入会议名称" />
        </div>
        <div class="form-group">
          <label>您的名称</label>
          <input v-model="createForm.name" placeholder="请输入您的名称" />
        </div>
        <div class="form-group">
          <label>会议密码 (可选)</label>
          <input v-model="createForm.password" type="password" placeholder="留空则无需密码" />
        </div>
        <div class="modal-actions">
          <button class="btn-primary" @click="createMeeting" :disabled="!canCreate || creating">
            {{ creating ? '创建中...' : '创建会议' }}
          </button>
          <button class="btn-close" @click="showCreateModal = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 加入会议弹窗 -->
    <div class="modal" v-if="showJoinModal" @click.self="showJoinModal = false">
      <div class="modal-content">
        <h2>加入会议</h2>
        <div class="form-group">
          <label>会议号</label>
          <input v-model="joinForm.no" placeholder="请输入8位会议号" />
        </div>
        <div class="form-group">
          <label>您的名称</label>
          <input v-model="joinForm.name" placeholder="请输入您的名称" />
        </div>
        <div class="form-group">
          <label>会议密码 (如需)</label>
          <input v-model="joinForm.password" type="password" placeholder="留空则无需密码" />
        </div>
        <div class="modal-actions">
          <button class="btn-primary" @click="joinMeeting" :disabled="!canJoin || joining">
            {{ joining ? '加入中...' : '加入会议' }}
          </button>
          <button class="btn-close" @click="showJoinModal = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const showCreateModal = ref(false)
const showJoinModal = ref(false)
const creating = ref(false)
const joining = ref(false)

const createForm = ref({ title: '', name: '', password: '' })
const joinForm = ref({ no: '', name: '', password: '' })

const canCreate = computed(() => createForm.value.title.trim() && createForm.value.name.trim())
const canJoin = computed(() => joinForm.value.no.trim() && joinForm.value.name.trim())

const createMeeting = async () => {
  if (!canCreate.value) return
  creating.value = true
  
  try {
    const res = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: createForm.value.title,
        hostName: createForm.value.name,
        password: createForm.value.password || undefined
      })
    })
    const data = await res.json()
    
    if (data.success) {
      showCreateModal.value = false
      createForm.value = { title: '', name: '', password: '' }
      router.push(`/meeting/${data.data.meetingNo}`)
    } else {
      alert(data.message || '创建失败')
    }
  } catch (e) {
    alert('创建失败')
  }
  creating.value = false
}

const joinMeeting = async () => {
  if (!canJoin.value) return
  joining.value = true
  
  try {
    const res = await fetch(`/api/meetings/${joinForm.value.no}`)
    const data = await res.json()
    
    if (data.success) {
      const meeting = data.data.meeting
      
      if (meeting.password) {
        const password = prompt('请输入会议密码')
        if (password !== meeting.password) {
          alert('密码错误')
          joining.value = false
          return
        }
      }
      
      const joinRes = await fetch(`/api/meetings/${meeting.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: joinForm.value.name,
          password: joinForm.value.password || undefined
        })
      })
      const joinData = await joinRes.json()
      
      if (joinData.success) {
        showJoinModal.value = false
        joinForm.value = { no: '', name: '', password: '' }
        router.push(`/meeting/${meeting.meetingNo}`)
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
</script>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: #0a0a0a;
}

.header {
  text-align: center;
  margin-bottom: 60px;
}

.header h1 {
  font-size: 48px;
  font-weight: 300;
  margin-bottom: 16px;
  color: #fff;
  letter-spacing: 4px;
}

.header p {
  font-size: 14px;
  color: #666;
  letter-spacing: 2px;
}

.actions {
  display: flex;
  gap: 24px;
}

button.large {
  padding: 18px 56px;
  font-size: 16px;
  letter-spacing: 2px;
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #141414;
  padding: 48px;
  border-radius: 4px;
  width: 90%;
  max-width: 400px;
  border: 1px solid #222;
}

.modal-content h2 {
  margin-bottom: 32px;
  text-align: center;
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

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 32px;
}

.btn-primary {
  flex: 1;
  padding: 14px;
  background: #fff;
  color: #000;
  border: none;
  border-radius: 2px;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 2px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-primary:hover:not(:disabled) {
  background: #ddd;
}

.btn-secondary {
  padding: 14px 40px;
  background: transparent;
  color: #fff;
  border: 1px solid #fff;
  border-radius: 2px;
  font-size: 14px;
  letter-spacing: 2px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-secondary:hover {
  background: #fff;
  color: #000;
}

.btn-close {
  flex: 1;
  padding: 14px;
  background: transparent;
  color: #666;
  border: 1px solid #333;
  border-radius: 2px;
  font-size: 14px;
  letter-spacing: 2px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-close:hover {
  border-color: #555;
  color: #fff;
}
</style>
