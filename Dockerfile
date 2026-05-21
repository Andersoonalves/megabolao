# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma/        ./prisma/
RUN npm ci --ignore-scripts

COPY . .
RUN npx prisma generate
RUN npm run build:backend

# Remove devDependencies
RUN npm prune --production

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copia apenas o necessário
COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/dist/apps/backend ./dist
COPY --from=builder /app/prisma        ./prisma

# Gera Prisma client no runtime image
RUN npx prisma generate

EXPOSE 3000

# Roda migrations antes de subir o servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
