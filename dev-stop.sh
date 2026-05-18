#!/usr/bin/env bash
# dev-stop.sh — para todos os processos do ambiente de desenvolvimento

GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${GREEN}[dev]${NC} $1"; }

log "Parando backend NestJS..."
pkill -f "ts-node-transpile-only.*main.ts" 2>/dev/null && log "Backend parado" || log "Backend não estava rodando"

log "Parando frontend Angular..."
pkill -f "nx serve frontend" 2>/dev/null && log "Frontend parado" || log "Frontend não estava rodando"

log "Parando Evolution API..."
docker stop evolution-api 2>/dev/null && log "Evolution API parada" || log "Evolution API não estava rodando"

log "Parando Supabase..."
npx supabase stop 2>/dev/null && log "Supabase parado" || log "Supabase não estava rodando"

echo ""
echo -e "${GREEN}Ambiente parado.${NC}"
