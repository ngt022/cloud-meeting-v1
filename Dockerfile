FROM node:22-alpine

WORKDIR /app

# 1. 服务端
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install

COPY server/src ./src
COPY server/data ./data

# 2. 客户端（单独目录）
WORKDIR /app/client
COPY client/package*.json ./
COPY client/vite.config.js ./
COPY client/index.html ./
COPY client/src ./src

RUN npm install

# 构建到 /app/dist
RUN npm run build

# 3. 清理客户端不需要的文件
WORKDIR /app

EXPOSE 3000

CMD ["node", "server/src/app.js"]
