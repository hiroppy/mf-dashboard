FROM node:22-bookworm-slim
WORKDIR /app
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate \
    && apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/meta/package.json ./packages/meta/
COPY packages/analytics/package.json ./packages/analytics/

RUN pnpm install --frozen-lockfile --filter "@mf-dashboard/web..."

COPY . .

# Build with the bundled demo DB; runtime data is mounted via volume and refreshed via /api/refresh.
RUN DB_PATH=/app/data/demo.db pnpm --filter @mf-dashboard/web build

EXPOSE 8765
CMD ["pnpm", "--filter", "@mf-dashboard/web", "start", "--port", "8765"]
