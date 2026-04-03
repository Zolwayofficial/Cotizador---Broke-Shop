#!/usr/bin/env bash

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

VPS_USER="${VPS_USER:-root}"
VPS_IP="${VPS_IP:-107.175.95.172}"
VPS_PATH="${VPS_PATH:-/var/www/importaiagent}"
DOMAIN="${DOMAIN:-$VPS_IP}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Falta comando requerido: $1" >&2
    exit 1
  fi
}

echo -e "${YELLOW}[1/7] Preparando entorno local...${NC}"
cd "$PROJECT_ROOT"

require_command ssh
require_command scp
require_command rsync
require_command npm

if [ ! -f ".env.production" ]; then
  echo "Falta .env.production. Crea el archivo real antes del despliegue." >&2
  exit 1
fi

if [ ! -d "client/node_modules" ]; then
  npm install --prefix client
fi

echo -e "${YELLOW}[2/7] Construyendo frontend...${NC}"
npm run client:build

echo -e "${YELLOW}[3/7] Subiendo archivos al VPS...${NC}"
ssh "${VPS_USER}@${VPS_IP}" "mkdir -p '${VPS_PATH}'"
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'client/node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.production' \
  --exclude 'data' \
  --exclude 'LOCAL_SECRETS.md' \
  --exclude 'backups' \
  --exclude 'output' \
  --exclude 'tmp' \
  --exclude 'secure' \
  --exclude 'coverage' \
  --exclude '*.log' \
  ./ "${VPS_USER}@${VPS_IP}:${VPS_PATH}/"

echo -e "${YELLOW}[4/7] Instalando dependencias y reiniciando servicio...${NC}"
ssh "${VPS_USER}@${VPS_IP}" "VPS_PATH='${VPS_PATH}' bash -s" <<'ENDSSH'
set -euo pipefail

cd "$VPS_PATH"
mkdir -p data data/logs

if [ ! -f ".env.production" ]; then
  echo "Falta .env.production en el VPS. Copialo manualmente antes de continuar." >&2
  exit 1
fi

if [ ! -f ".env" ]; then
  cp .env.production .env
fi

APP_PORT="$(grep '^PORT=' .env.production 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '[:space:]')"
WS_PORT="$(grep '^WS_PORT=' .env.production 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '[:space:]')"
if [ -z "$APP_PORT" ]; then
  echo "PORT falta en .env.production" >&2
  exit 1
fi
if [ -z "$WS_PORT" ]; then
  echo "WS_PORT falta en .env.production" >&2
  exit 1
fi

npm install --omit=dev

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

pm2 delete cotizador >/dev/null 2>&1 || true
pm2 start ecosystem.config.js --only cotizador --update-env
pm2 save

if command -v systemctl >/dev/null 2>&1; then
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
fi
ENDSSH

echo -e "${YELLOW}[5/7] Configurando Nginx...${NC}"
ssh "${VPS_USER}@${VPS_IP}" "DOMAIN='${DOMAIN}' VPS_PATH='${VPS_PATH}' bash -s" <<'ENDSSH'
set -euo pipefail

if command -v apt-get >/dev/null 2>&1 && ! command -v nginx >/dev/null 2>&1; then
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
fi

if command -v nginx >/dev/null 2>&1; then
  APP_PORT="$(grep '^PORT=' "$VPS_PATH/.env.production" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '[:space:]')"
  WS_PORT="$(grep '^WS_PORT=' "$VPS_PATH/.env.production" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '[:space:]')"
  if [ -z "$APP_PORT" ]; then
    echo "PORT falta en .env.production" >&2
    exit 1
  fi
  if [ -z "$WS_PORT" ]; then
    echo "WS_PORT falta en .env.production" >&2
    exit 1
  fi

  cat > /etc/nginx/sites-available/importaiagent <<'NGINX'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    location /ws {
        proxy_pass http://127.0.0.1:WS_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://127.0.0.1:APP_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGINX

  sed -i "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" /etc/nginx/sites-available/importaiagent
  sed -i "s/APP_PORT_PLACEHOLDER/${APP_PORT}/g" /etc/nginx/sites-available/importaiagent
  sed -i "s/WS_PORT_PLACEHOLDER/${WS_PORT}/g" /etc/nginx/sites-available/importaiagent

  ln -sf /etc/nginx/sites-available/importaiagent /etc/nginx/sites-enabled/importaiagent
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx || systemctl restart nginx
fi
ENDSSH

echo -e "${YELLOW}[6/7] Verificando servicio...${NC}"
ssh "${VPS_USER}@${VPS_IP}" "VPS_PATH='${VPS_PATH}' bash -s" <<'ENDSSH'
set -euo pipefail
APP_PORT="$(grep '^PORT=' "$VPS_PATH/.env.production" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '[:space:]')"
if [ -z "$APP_PORT" ]; then
  echo "PORT falta en .env.production" >&2
  exit 1
fi
pm2 status cotizador
curl -fsS "http://127.0.0.1:${APP_PORT}/api/monitor/health" | head -c 200
echo
ENDSSH

echo -e "${YELLOW}[7/7] Despliegue completado${NC}"
echo -e "${GREEN}Frontend: http://${VPS_IP}${NC}"
echo -e "${GREEN}API:      http://${VPS_IP}/api${NC}"
echo -e "${GREEN}WS:       ws://${VPS_IP}/ws${NC}"
