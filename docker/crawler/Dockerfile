FROM node:22-bookworm-slim
WORKDIR /app
ENV PNPM_HOME=/pnpm \
    COREPACK_HOME=/pnpm/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PATH=/pnpm:$PATH \
    HOME=/home/node

RUN mkdir -p /pnpm \
    && corepack enable \
    && apt-get update && apt-get install -y --no-install-recommends curl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

ARG SUPERCRONIC_VERSION=v0.2.30
ARG SUPERCRONIC_SHA256_AMD64=55f3a65b6ef29856d948230a96448f6ec7376d39fca367fae49d2512167e29e5
ARG SUPERCRONIC_SHA256_ARM64=21a665f278fd2feb95012df3d3e0de28df2d7968acd84eea47d732c521257974
RUN arch="$(dpkg --print-architecture)" \
    && case "${arch}" in \
      amd64) supercronic_arch="amd64"; supercronic_sha256="${SUPERCRONIC_SHA256_AMD64}" ;; \
      arm64) supercronic_arch="arm64"; supercronic_sha256="${SUPERCRONIC_SHA256_ARM64}" ;; \
      *) echo "Unsupported architecture: ${arch}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${supercronic_arch}" \
      -o /tmp/supercronic \
    && echo "${supercronic_sha256}  /tmp/supercronic" | sha256sum -c - \
    && install -m 0755 /tmp/supercronic /usr/local/bin/supercronic \
    && rm -f /tmp/supercronic

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/crawler/package.json ./apps/crawler/
COPY packages/db/package.json ./packages/db/
COPY packages/date-utils/package.json ./packages/date-utils/
COPY packages/meta/package.json ./packages/meta/
COPY packages/analytics/package.json ./packages/analytics/

RUN package_manager=$(node -p "require('./package.json').packageManager") \
    && corepack prepare "$package_manager" --activate \
    && pnpm install --frozen-lockfile --prod --filter "@mf-dashboard/crawler..." --ignore-scripts \
    && pnpm rebuild --pending --filter "@mf-dashboard/crawler..." \
    && pnpm --filter @mf-dashboard/crawler exec playwright install --with-deps chromium \
    && rm -rf /pnpm/store /var/lib/apt/lists/*

COPY . .

RUN mkdir -p /app/data /app/crawler-state \
    && chmod 1777 /app/crawler-state
USER node

ENTRYPOINT ["/usr/bin/tini", "--", "supercronic", "/app/docker/crawler/crontab"]
