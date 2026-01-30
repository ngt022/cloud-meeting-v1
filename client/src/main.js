import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/HomeView.vue') },
    { path: '/meeting/:no', component: () => import('./views/MeetingView.vue') },
    { path: '/join/:meetingNo?', component: () => import('./views/JoinView.vue') }
  ]
})

const app = createApp(App)
app.use(router)
app.mount('#app')

setTimeout(() => {
  const loading = document.getElementById('loading')
  if (loading) loading.remove()
}, 100)
