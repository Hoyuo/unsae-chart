# 빌드 컨텍스트: apps/chart  (이 폴더만으로 빌드된다)
#   docker build -t unsae-chart apps/chart
FROM node:22-slim AS build
RUN npm install -g pnpm@10.29.3
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-workspace
COPY tsconfig.json tsup.config.ts ./
COPY src src
RUN pnpm build

# 의존성까지 dist/index.js 하나로 번들돼 있어 node_modules가 필요 없다
FROM node:22-slim
ENV NODE_ENV=production PORT=8788
WORKDIR /app
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:8788/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
