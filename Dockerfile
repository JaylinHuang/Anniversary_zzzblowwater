FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Railway / 容器内需监听所有网卡，否则公网探测失败
ENV HOSTNAME=0.0.0.0
# Zeabur 上传文件时要在容器里用 wget 把压缩包拉下来再解压
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/sql.js ./node_modules/sql.js
RUN mkdir -p /app/data/uploads
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server.js"]
