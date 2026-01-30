FROM node:22-alpine

WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装服务端依赖
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install

# 复制服务端代码
COPY server/src ./src
COPY server/data ./data

# 构建前端
WORKDIR /app
COPY client/package*.json ./
COPY client ./
RUN npm install && npm run build

# 复制前端 build 到 /app/dist
RUN mv client/dist ./dist

WORKDIR /app

# 暴露端口
EXPOSE 3000

# 启动
CMD ["node", "src/app.js"]
