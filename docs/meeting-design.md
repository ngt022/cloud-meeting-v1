# 会议系统设计文档

## 一、权限逻辑（主持人 vs 参会者）

关系的核心在于"秩序管理"。为了保证会议不被干扰，权限通常采用分级管理。

### 权限维度

| 功能 | 主持人（Host） | 参会者（User/Participant） |
|------|--------------|--------------------------|
| **音视频控制** | 强制静音、强制关闭某人摄像头、解除全体静音 | 只能操作自己的音视频（除非被主持人强制禁止） |
| **屏幕共享** | 随时开启、可抢占共享者的共享、设置谁可以共享 | 需获得主持人许可才可发起共享 |
| **会议秩序** | 开启/关闭聊天、踢出成员、锁定会议（禁止新人进入） | 仅能查看成员列表或进行群聊 |
| **结束会议** | 全员结束会议（彻底关闭房间） | 离开会议（个人退出，房间继续存在） |

## 二、UI界面设计

采用**"内容中心化+悬浮控制条"**的设计语言。

### 1. 布局结构

- **主体区（舞台）**：采用动态网格布局。当有人打开屏幕共享时，共享屏幕占80%面积，人像大概排在右侧或顶部。
- **控制栏（工具箱）**：默认常驻底部（或鼠标移动时唤起），采用半透明深色背景，以突出重要功能。
- **侧边栏（Sidebar）**：默认隐藏，点击按钮后从右侧弹出，用于显示"成员列表"或"聊天窗口"。

### 2. 底部控制栏 - 7个基础按钮

从左至右：

| 序号 | 按钮 | 功能说明 |
|-----|------|---------|
| 1 | **麦克风控制** | 一键开启/关闭音频，带有实时音量波纹显示 |
| 2 | **摄像头控制** | 一键开启/关闭视频 |
| 3 | **共享屏幕** | 核心功能入口，点击后弹出窗口选择（全屏或特定应用） |
| 4 | **成员列表** | 点击弹出侧边栏，显示成员列表。对主持人：列表旁边带有"整体静音"和"移出"功能 |
| 5 | **聊天窗口** | 点击弹出侧边栏，用于发送文字或文件 |
| 6 | **更多设置（...）** | 隐藏非高频功能（如背景虚化、录音、切换麦克风设备等），保留真相 |
| 7 | **结束按钮（红色）** | 对用户显示"离开会议"，对主持人显示"全员结束" |

## 三、详细功能说明

### 麦克风控制
- 点击切换静音/发言状态
- 实时显示音量波纹（当未静音时）
- 主持人可以看到所有参会者的音量状态

### 摄像头控制
- 点击切换开启/关闭视频
- 开启时显示本地视频预览
- 主持人可以强制关闭某人的摄像头

### 共享屏幕
- 点击后弹出系统选择器（全屏/应用窗口/标签页）
- 共享开始后，屏幕内容占主体区80%
- 主持人可以随时抢占共享
- 参会者需要主持人许可才能共享

### 成员列表（侧边栏）
- 显示所有参会者
- 主持人权限：
  - 整体静音/解除静音
  - 移出某个成员
  - 锁定会议
- 参会者只能查看

### 聊天窗口（侧边栏）
- 实时文字聊天
- 支持发送文件
- 历史消息记录

### 更多设置
- 背景虚化开关
- 录音开关
- 切换麦克风设备
- 切换摄像头设备
- 网络状态显示

### 结束按钮
- 参会者：离开会议（其他人继续）
- 主持人：结束会议（全员踢出，房间关闭）

## 四、技术实现要点

### 前端
- Vue3 Composition API
- WebRTC for 音视频传输
- getDisplayMedia for 屏幕共享
- Web Audio API for 音量波纹
- CSS Grid/Flexbox for 动态布局

### 后端
- Socket.IO for 实时通信
- 会议状态管理
- 权限验证
- 信令服务器（WebRTC）

### 数据结构

```typescript
interface Participant {
  id: string;
  name: string;
  socketId: string;
  isHost: boolean;
  isMuted: boolean;      // 是否被静音
  hasVideo: boolean;      // 是否有视频
  canShare: boolean;      // 是否可以共享屏幕
  isHandRaised: boolean;  // 是否举手
  audioLevel?: number;    // 音频等级（实时）
}

interface Meeting {
  id: string;
  meetingNo: string;
  title: string;
  hostId: string;
  isLocked: boolean;
  isAllMuted: boolean;
  screenSharerId?: string;  // 当前共享者ID
  createdAt: Date;
}
```

## 五、Socket事件定义

### 客户端 -> 服务器
- `join-room` - 加入房间
- `leave-room` - 离开房间
- `toggle-audio` - 切换音频
- `toggle-video` - 切换视频
- `request-screen-share` - 请求屏幕共享（需要主持人许可）
- `start-screen-share` - 开始共享
- `stop-screen-share` - 停止共享
- `mute-all` - 全员静音（主持人）
- `unmute-all` - 解除全员静音（主持人）
- `mute-participant` - 静音某人（主持人）
- `remove-participant` - 移出某人（主持人）
- `lock-meeting` - 锁定会议（主持人）
- `unlock-meeting` - 解锁会议（主持人）
- `allow-screen-share` - 允许某人共享（主持人）
- `chat-message` - 聊天消息
- `hand-raise` - 举手
- `hand-lower` - 取消举手

### 服务器 -> 客户端
- `room-users` - 房间用户列表
- `user-joined` - 用户加入
- `user-left` - 用户离开
- `participant-updated` - 参会者状态更新
- `screen-share-started` - 屏幕共享开始
- `screen-share-stopped` - 屏幕共享停止
- `meeting-locked` - 会议锁定
- `meeting-unlocked` - 会议解锁
- `chat-message` - 聊天消息
- `hand-raised` - 有人举手
- `all-muted` - 全员静音
- `all-unmuted` - 解除全员静音
