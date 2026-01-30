FROM node:22-alpine

WORKDIR /app

# 安装依赖
COPY server/package*.json ./
RUN npm install

# 复制服务端代码
COPY server/src ./src
COPY server/data ./data

# 暴露端口
EXPOSE 3000

# 启动
CMD ["node", "src/app.js"]
