FROM node:22-bookworm AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    handbrake-cli \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app
ENV WATERMARK_FONT=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf

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

CMD ["pnpm", "worker"]
