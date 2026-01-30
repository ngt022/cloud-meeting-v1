# CloudMeeting - 极简视频会议

一个无需注册登录的网页视频会议系统。

## ✨ 特点

- **无需注册** - 输入名称即可使用
- **极简设计** - 打开就用，扫码分享
- **网页版** - 浏览器直接使用，无需下载
- **一键部署** - Docker 容器化部署

## 🚀 快速开始

### 本地开发

```bash
# 安装依赖
npm run install:all

# 启动
npm run dev
```

访问 http://localhost:5173

### Docker 部署

```bash
# 一键启动
docker-compose up -d

# 访问
# http://your-server:3000
```

## 📖 使用方法

1. **创建会议**
   - 输入你的名称
   - 输入会议主题
   - 可选设置密码
   - 点击"创建会议"

2. **加入会议**
   - 输入你的名称
   - 输入12位会议号
   - 输入会议密码（如有）
   - 点击"加入会议"

3. **会议中**
   - 🎤 麦克风开关
   - 📹 摄像头开关
   - 🖥️ 屏幕共享
   - 💬 实时聊天
   - 📴 离开会议

## 📱 访问方式

- 电脑端：浏览器打开
- 手机端：浏览器打开，支持移动端适配

## 🔧 技术栈

- 前端：Vue3 + Socket.IO Client
- 后端：Node.js + Express + Socket.IO
- 数据库：SQLite
- 部署：Docker

## 📁 目录结构

```
CloudMeeting/
├── docker-compose.yml
├── Dockerfile
├── server/
│   └── src/
│       ├── app.js        # 主入口
│       └── models/       # 数据模型
├── client/
│   └── src/
│       ├── views/        # 页面
│       └── composables/  # 逻辑
└── package.json
```

## ⚙️ 配置

如需修改端口，编辑 `docker-compose.yml`：

```yaml
ports:
  - "3000:3000"  # 修改这里
```

## 📄 许可证

MIT
