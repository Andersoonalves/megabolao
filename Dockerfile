# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma/        ./prisma/
RUN npm ci --ignore-scripts --legacy-peer-deps

COPY . .
RUN npx prisma generate
# Build shared libs (backend depende delas)
RUN npx tsc --project libs/shared-types/tsconfig.lib.json && \
    npx tsc --project libs/shared-utils/tsconfig.lib.json
# Build backend
RUN npx tsc --project apps/backend/tsconfig.app.json

# Remove devDependencies
RUN npm prune --production

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

# Copia apenas o necessário
COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/dist/apps/backend ./dist
COPY --from=builder /app/prisma        ./prisma

# Resolve @nossobolao/* path aliases: tsc compila libs em dist/libs/
# mas Node.js não resolve aliases do tsconfig em runtime — symlink resolve
RUN mkdir -p /app/node_modules/@nossobolao && \
    ln -sf /app/dist/libs/shared-types/src /app/node_modules/@nossobolao/shared-types && \
    ln -sf /app/dist/libs/shared-utils/src /app/node_modules/@nossobolao/shared-utils

EXPOSE 3000

# Roda migrations antes de subir o servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/apps/backend/src/main.js"]
