<template>
  <div class="home">
    <div class="hero">
      <div class="hero-content">
        <h1>📹 CloudMeeting</h1>
        <p class="subtitle">一键开会，极简体验</p>
        <button class="btn-start" @click="showCreateModal = true">
          ⚡ 立即开会
        </button>
        <div class="join-link" @click="showJoinModal = true">
          🔑 输入会议号加入 >
        </div>
      </div>
      <div class="hero-visual">
        <div class="preview-grid">
          <div class="preview-user" v-for="i in 4" :key="i">
            <div class="avatar">U{{ i }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建会议弹窗 -->
    <div class="modal" v-if="showCreateModal" @click.self="showCreateModal = false">
      <div class="modal-content">
        <h2>创建会议</h2>
        <div class="form-group">
          <label>您的名称</label>
          <input v-model="createForm.name" placeholder="请输入您的名称" maxlength="20" />
        </div>
        <div class="form-group">
          <label>会议主题</label>
          <input v-model="createForm.title" placeholder="请输入会议主题" maxlength="50" />
        </div>
        <div class="form-group">
          <label>会议密码 <span class="optional">(可选)</span></label>
          <input v-model="createForm.password" type="password" placeholder="设置密码保护会议" maxlength="10" />
        </div>
        <button class="btn-primary" @click="createMeeting" :disabled="!canCreate || creating">
          {{ creating ? '创建中...' : '创建会议' }}
        </button>
        <button class="btn-close" @click="showCreateModal = false">取消</button>
      </div>
    </div>

    <!-- 加入会议弹窗 -->
    <div class="modal" v-if="showJoinModal" @click.self="showJoinModal = false">
      <div class="modal-content">
        <h2>加入会议</h2>
        <div class="form-group">
          <label>您的名称</label>
          <input v-model="joinForm.name" placeholder="请输入您的名称" maxlength="20" />
        </div>
        <div class="form-group">
          <label>会议号</label>
          <input v-model="joinForm.meetingNo" placeholder="请输入12位会议号" maxlength="12" @input="joinForm.meetingNo = joinForm.meetingNo.replace(/\D/g, '')" />
        </div>
        <div class="form-group">
          <label>会议密码 <span class="optional">(可选)</span></label>
          <input v-model="joinForm.password" type="password" placeholder="请输入会议密码" maxlength="10" />
        </div>
        <button class="btn-primary" @click="joinMeeting" :disabled="!canJoin || joining">
          {{ joining ? '加入中...' : '加入会议' }}
        </button>
        <button class="btn-close" @click="showJoinModal = false">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const showCreateModal = ref(false)
const showJoinModal = ref(false)
const creating = ref(false)
const joining = ref(false)

const createForm = reactive({ name: '', title: '', password: '' })
const joinForm = reactive({ name: '', meetingNo: '', password: '' })

const canCreate = computed(() => createForm.name.trim() && createForm.title.trim())
const canJoin = computed(() => joinForm.name.trim() && joinForm.meetingNo.length === 12)

const createMeeting = async () => {
  if (!canCreate.value) return
  creating.value = true
  
  try {
    const res = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: createForm.title,
        hostName: createForm.name,
        password: createForm.password
      })
    })
    const data = await res.json()
    if (data.success) {
      router.push(`/meeting/${data.data.meetingId}`)
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
    const res = await fetch(`/api/meetings/${joinForm.meetingNo}`)
    const data = await res.json()
    
    if (data.success) {
      const joinRes = await fetch(`/api/meetings/${data.data.meeting.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: joinForm.name,
          password: joinForm.password
        })
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
</script>

<style scoped>
.home { min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }

.hero {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 60px;
}

.hero-content { text-align: center; color: #fff; }

.hero-content h1 { font-size: 56px; margin-bottom: 16px; }

.subtitle { font-size: 24px; opacity: 0.9; margin-bottom: 48px; }

.btn-start {
  display: inline-block;
  padding: 18px 48px;
  background: #fff;
  color: #667eea;
  border: none;
  border-radius: 50px;
  font-size: 20px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
}

.btn-start:hover { transform: translateY(-3px); box-shadow: 0 15px 50px rgba(0,0,0,0.3); }

.join-link {
  margin-top: 24px;
  font-size: 16px;
  opacity: 0.8;
  cursor: pointer;
}

.join-link:hover { opacity: 1; }

.hero-visual .preview-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.preview-user {
  width: 140px;
  height: 100px;
  background: rgba(255,255,255,0.2);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #f093fb, #f5576c);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  font-size: 20px;
}

.modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

.modal-content {
  background: #fff;
  border-radius: 24px;
  padding: 40px;
  width: 100%;
  max-width: 420px;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.modal-content h2 { text-align: center; margin-bottom: 32px; color: #1a1a2e; }

.form-group { margin-bottom: 24px; }

.form-group label { display: block; margin-bottom: 8px; color: #374151; font-weight: 500; }

.optional { color: #9ca3af; font-weight: normal; }

.form-group input {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  font-size: 16px;
  transition: all 0.3s;
}

.form-group input:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 4px rgba(102,126,234,0.1); }

.btn-primary {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary:hover:not(:disabled) { opacity: 0.9; }

.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-close {
  width: 100%;
  padding: 16px;
  background: #f3f4f6;
  color: #6b7280;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  cursor: pointer;
  margin-top: 12px;
  transition: all 0.3s;
}

.btn-close:hover { background: #e5e7eb; }

@media (max-width: 768px) {
  .hero { flex-direction: column; padding: 60px 20px; }
  .hero-content h1 { font-size: 36px; }
  .subtitle { font-size: 18px; }
  .btn-start { padding: 14px 36px; font-size: 18px; }
  .hero-visual { display: none; }
}
</style>
