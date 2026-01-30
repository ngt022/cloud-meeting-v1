FROM node:22-alpine

WORKDIR /app

# 1. 先处理服务端
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install

COPY server/src ./src
COPY server/data ./data

# 2. 再处理客户端（不覆盖服务端）
WORKDIR /app
COPY client/package*.json ./client/
COPY client/vite.config.js ./client/
COPY client/index.html ./client/
COPY client/src ./client/src

WORKDIR /app/client
RUN npm install && npm run build

# 3. 复制客户端构建产物到 /app/dist
RUN mkdir -p /app/dist && cp -r /app/client/dist/* /app/dist/

# 4. 返回 /app 启动
WORKDIR /app

EXPOSE 3000

CMD ["node", "server/src/app.js"]
