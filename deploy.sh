#!/bin/bash

echo "🚀 CloudMeeting 部署脚本"
echo "========================"

# 1. 构建前端
echo ""
echo "📦 步骤1: 构建前端..."
cd client && npm install && npm run build
echo "✅ 前端构建完成"

# 2. 复制前端到服务端
echo ""
echo "📦 步骤2: 复制前端到服务端..."
cp -r dist ../server/
echo "✅ 前端已复制到 server/dist"

# 3. 构建 Docker 镜像
echo ""
echo "📦 步骤3: 构建 Docker 镜像..."
cd ..
docker-compose build
echo "✅ Docker 镜像构建完成"

# 4. 启动服务
echo ""
echo "🚀 步骤4: 启动服务..."
docker-compose up -d
echo "✅ 服务已启动"

echo ""
echo "========================"
echo "✅ 部署完成！"
echo "访问地址: http://你的服务器IP:3000"
echo "========================"
