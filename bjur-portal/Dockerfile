FROM node:22-bookworm AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    handbrake-cli \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app
ENV WATERMARK_FONT=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf
# Purely cosmetic — npm is only ever shelled out to via `npx prisma ...`, pnpm is the
# actual package manager here, so there's no reason to chase npm's own version nags.
ENV npm_config_update_notifier=false

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN pnpm build

# ── web: Next's traced standalone bundle — a fraction of the full node_modules ──────
FROM base AS runtime-web
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma

EXPOSE 3000
CMD ["node", "server.js"]

# ── worker: needs its own full deps (chokidar, tsx, nodemailer, ...) — none of that
# is reachable from Next's route graph, so standalone tracing can't shrink it ──────
FROM base AS runtime-worker
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/worker.ts ./worker.ts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json

# Apply pending migrations before the worker starts. This runs here rather than in
# runtime-web because the web image is Next's standalone bundle, which traces only
# what the route graph imports — `prisma` is a devDependency CLI, so it isn't in
# there, while this image copies node_modules wholesale and does have it.
#
# It runs in exactly one container on purpose: two of them racing `migrate deploy`
# against the same SQLite file is a lock error waiting to happen.
#
# Failing here is deliberate. A worker that can't migrate should stop loudly rather
# than run against a schema it doesn't match.
CMD ["sh", "-c", "npx prisma migrate deploy && pnpm worker"]
