#!/usr/bin/env bash
# dev-start.sh — inicia todo o ambiente de desenvolvimento do NossoBolão
# Uso: ./dev-start.sh [--no-frontend] [--reset-db]

set -euo pipefail

NO_FRONTEND=false
RESET_DB=false
for arg in "$@"; do
  case $arg in
    --no-frontend) NO_FRONTEND=true ;;
    --reset-db)    RESET_DB=true ;;
  esac
done

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

log()  { echo -e "${GREEN}[dev]${NC} $1"; }
warn() { echo -e "${YELLOW}[dev]${NC} $1"; }
err()  { echo -e "${RED}[dev]${NC} $1"; }

# ── 1. Docker Desktop ────────────────────────────────────────────────────────
log "Verificando Docker..."
if ! docker info &>/dev/null; then
  warn "Docker não está rodando. Tentando iniciar..."
  open -a Docker 2>/dev/null || true
  echo -n "Aguardando Docker iniciar"
  for i in $(seq 1 30); do
    sleep 2
    if docker info &>/dev/null; then echo; break; fi
    echo -n "."
    if [ $i -eq 30 ]; then
      echo
      err "Docker não respondeu em 60s. Abra o Docker Desktop manualmente e rode novamente."
      exit 1
    fi
  done
fi
log "Docker OK"

# ── 2. Supabase ──────────────────────────────────────────────────────────────
log "Verificando Supabase..."
if ! curl -s http://127.0.0.1:54321/health &>/dev/null; then
  log "Supabase não está rodando. Iniciando..."
  npx supabase start
else
  log "Supabase já está rodando"
fi

if $RESET_DB; then
  warn "Resetando banco de dados..."
  npx supabase db reset
  log "Banco resetado"
fi

# Aplicar migrations pendentes sem reset
log "Aplicando migrations pendentes..."
npx supabase migration up 2>/dev/null || true

# ── 3. Redis ─────────────────────────────────────────────────────────────────
log "Verificando Redis..."
if ! redis-cli ping &>/dev/null 2>&1; then
  warn "Redis não está rodando. Tentando iniciar via brew..."
  brew services start redis 2>/dev/null || true
  sleep 2
  if ! redis-cli ping &>/dev/null 2>&1; then
    warn "Redis não iniciou — BullMQ pode falhar. Inicie com: brew services start redis"
  else
    log "Redis OK"
  fi
else
  log "Redis OK"
fi

# ── 4. Evolution API (WhatsApp) ──────────────────────────────────────────────
# v2.3.7+ corrige loop connecting + /connect retornando count=0 (issues #2365, #2430)
EVOLUTION_IMAGE="${EVOLUTION_IMAGE:-evoapicloud/evolution-api:v2.3.7}"

log "Verificando Evolution API..."
source .env 2>/dev/null || true

evolution_run() {
  docker run -d \
    --name evolution-api \
    -p 8080:8080 \
    -e AUTHENTICATION_API_KEY="${EVOLUTION_API_KEY:-changeme}" \
    -e SERVER_URL=http://localhost:8080 \
    -e DATABASE_PROVIDER=postgresql \
    -e DATABASE_CONNECTION_URI="postgresql://postgres:postgres@host.docker.internal:54322/postgres?schema=evolution" \
    -e CACHE_REDIS_ENABLED=false \
    -e CACHE_LOCAL_ENABLED=true \
    -e QRCODE_LIMIT=40 \
    -e CONFIG_SESSION_PHONE_CLIENT=Chrome \
    -e CONFIG_SESSION_PHONE_NAME=Chrome \
    -e CONFIG_SESSION_PHONE_VERSION=2.3000.1030831524 \
    -e DEL_INSTANCE=false \
    -e NODE_OPTIONS=--network-family-autoselection-attempt-timeout=1000 \
    -v evolution_instances:/evolution/instances \
    "$EVOLUTION_IMAGE"
}

if docker ps -a --format '{{.Names}}' | grep -q "^evolution-api$"; then
  CURRENT_IMAGE="$(docker inspect evolution-api --format '{{.Config.Image}}' 2>/dev/null || true)"
  if [ "$CURRENT_IMAGE" != "$EVOLUTION_IMAGE" ]; then
    warn "Recriando evolution-api ($CURRENT_IMAGE → $EVOLUTION_IMAGE)"
    docker rm -f evolution-api >/dev/null 2>&1 || true
    evolution_run
  elif ! curl -s http://localhost:8080/ &>/dev/null; then
    log "Iniciando container evolution-api..."
    docker start evolution-api
  else
    log "Evolution API já está rodando ($EVOLUTION_IMAGE)"
  fi
elif ! curl -s http://localhost:8080/ &>/dev/null; then
  warn "Container evolution-api não existe. Criando ($EVOLUTION_IMAGE)..."
  evolution_run
fi

if ! curl -s http://localhost:8080/ &>/dev/null; then
  echo -n "Aguardando Evolution API"
  for i in $(seq 1 15); do
    sleep 2
    if curl -s http://localhost:8080/ &>/dev/null; then echo; break; fi
    echo -n "."
    if [ "$i" -eq 15 ]; then
      echo
      warn "Evolution API não respondeu em 30s — WhatsApp pode não funcionar"
    fi
  done
fi

# ── 5. Backend NestJS ────────────────────────────────────────────────────────
log "Parando backend anterior (se houver)..."
pkill -f "ts-node-transpile-only.*main.ts" 2>/dev/null || true
sleep 1

log "Iniciando backend NestJS..."
npm run dev:backend &
BACKEND_PID=$!

echo -n "Aguardando backend na porta 3000"
for i in $(seq 1 20); do
  sleep 2
  if curl -s http://localhost:3000/api/v1/auth/mfa/status &>/dev/null 2>&1 || \
     lsof -ti :3000 &>/dev/null 2>&1; then
    echo; break
  fi
  echo -n "."
  if [ $i -eq 20 ]; then
    echo
    err "Backend não respondeu. Ver logs acima."
    exit 1
  fi
done
log "Backend OK (PID $BACKEND_PID)"

# ── 6. Frontend Angular (opcional) ──────────────────────────────────────────
if ! $NO_FRONTEND; then
  log "Iniciando frontend Angular..."
  npm run dev:frontend &
  FRONTEND_PID=$!
  log "Frontend iniciando em http://localhost:4400 (PID $FRONTEND_PID)"
fi

# ── Resumo ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  NossoBolão — ambiente de desenvolvimento ativo${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Supabase Studio : ${YELLOW}http://127.0.0.1:54323${NC}"
echo -e "  Backend API     : ${YELLOW}http://localhost:3000/api/v1${NC}"
echo -e "  Evolution API   : ${YELLOW}http://localhost:8080${NC}"
if ! $NO_FRONTEND; then
  echo -e "  Frontend        : ${YELLOW}http://localhost:4400${NC}"
fi
echo ""
echo -e "  Parar tudo: ${YELLOW}./dev-stop.sh${NC}"
echo ""

# Manter script vivo para que Ctrl+C pare os processos filhos
wait
