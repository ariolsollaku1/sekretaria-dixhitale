# syntax=docker/dockerfile:1
# Multi-stage build on Next.js standalone output (AC-6). Build context is the repo root.
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
# prisma/ is needed by the `postinstall` (prisma generate).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Prisma CLI used only by the entrypoint for `migrate deploy` (the standalone bundle has no CLI).
# Kept in its own directory so it cannot clash with the app's traced node_modules.
FROM base AS migrator
ARG PRISMA_VERSION=7.10.1
RUN apk add --no-cache openssl \
    && mkdir /migrate && cd /migrate \
    && npm init -y >/dev/null \
    && npm install --omit=dev --no-audit --no-fund prisma@${PRISMA_VERSION}
COPY prisma.config.ts /migrate/
COPY prisma /migrate/prisma

FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache openssl
WORKDIR /app
# Standalone output bundles only the production dependencies it needs; no dev deps, no .env.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=migrator --chown=node:node /migrate /migrate
COPY --chown=node:node infra/docker/app-entrypoint.sh /usr/local/bin/app-entrypoint.sh
RUN chmod +x /usr/local/bin/app-entrypoint.sh \
    && mkdir -p /data/files && chown node:node /data/files
USER node
EXPOSE 3000
ENTRYPOINT ["app-entrypoint.sh"]
CMD ["node", "server.js"]
