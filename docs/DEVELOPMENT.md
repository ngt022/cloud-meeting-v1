# Cloud Meeting 开发规范

## 核心原则

- **GitHub 为主** - 所有代码修改必须通过 GitHub 管理
- **主分支可部署** - `main` 分支始终保持可部署状态
- **自动部署** - 推送到 main 分支自动触发部署

## 工作流程

### 1. 创建功能分支

```bash
cd /Users/cjh/clawd/cloud-meeting-v1
git checkout -b feature/功能名称
```

### 2. 开发与提交

```bash
# 修改代码...
git add .
git commit -m "描述性消息"
```

### 3. 推送到云端分支

```bash
git push origin feature/功能名称
```

### 4. 创建 Pull Request

在 GitHub 上创建 PR：
- Base: main ← Compare: feature/功能名称
- 填写 PR 描述
- Review 后合并到 main

### 5. 自动部署

合并到 main 后，GitHub Actions 自动构建并部署到服务器。

## 分支命名规范

| 类型 | 示例 | 用途 |
|------|------|------|
| 功能分支 | `feature/screen-share` | 新功能开发 |
| 修复分支 | `fix/audio-bug` | Bug 修复 |
| 改进分支 | `improve/performance` | 性能优化 |

## 提交信息规范

```
类型: 简要描述

- 详细变更1
- 详细变更2
```

类型：
- `feat` - 新功能
- `fix` - Bug 修复
- `improve` - 改进优化
- `refactor` - 重构
- `docs` - 文档

## 禁止事项

❌ 不要直接推送到 main 分支（除非是 hotfix）  
❌ 不要提交 node_modules/ 或 dist/  
❌ 不要提交敏感信息（如 .env 文件）

## 快速开始

```bash
# 开始新功能
git checkout -b feature/xxx

# 完成开发后
git push origin feature/xxx
# → 在 GitHub 创建 PR → Review → 合并到 main
```

## 部署触发

推送到 main 分支 → GitHub Actions 构建 → 自动部署到服务器
