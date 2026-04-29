FROM mcr.microsoft.com/playwright:v1.58.2-jammy
WORKDIR /app
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate \
    && apt-get update && apt-get install -y --no-install-recommends curl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

ARG SUPERCRONIC_VERSION=v0.2.30
RUN curl -fsSL "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
      -o /usr/local/bin/supercronic \
    && chmod +x /usr/local/bin/supercronic

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/crawler/package.json ./apps/crawler/
COPY packages/db/package.json ./packages/db/
COPY packages/meta/package.json ./packages/meta/

RUN pnpm install --frozen-lockfile --filter "@mf-dashboard/crawler..."

COPY . .

RUN chmod +x /app/docker/crawler/entrypoint.sh /app/docker/crawler/run-crawl.sh

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/crawler/entrypoint.sh"]
