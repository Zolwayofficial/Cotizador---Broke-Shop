#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${APP_PATH:-/var/www/importaiagent}"
APP_NAME="importaiagent"
PM2_APP_NAME="cotizador"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Falta comando requerido: $1" >&2
    exit 1
  fi
}

echo "============================================================"
echo "  IMPORTAIAGENT - BOOTSTRAP VPS"
echo "============================================================"

echo -e "${GREEN}[1/7] Instalando dependencias del sistema...${NC}"
sudo apt-get update -qq
sudo apt-get install -y -qq curl nginx certbot python3-certbot-nginx build-essential

echo -e "${GREEN}[2/7] Verificando Node.js 20...${NC}"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
echo "  Node: $(node -v) | npm: $(npm -v)"

echo -e "${GREEN}[3/7] Preparando proyecto...${NC}"
cd "$PROJECT_ROOT"
npm install
npm install --prefix client
npm run client:build
mkdir -p data data/logs

echo -e "${GREEN}[4/7] Revisando entorno de produccion...${NC}"
if [ ! -f ".env.production" ]; then
  echo "Falta .env.production. Copialo en el VPS antes de continuar." >&2
  exit 1
fi

if [ ! -f ".env" ]; then
  cp .env.production .env
fi

APP_PORT="$(
  grep '^PORT=' .env.production 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '[:space:]'
)"
WS_PORT="$(
  grep '^WS_PORT=' .env.production 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '[:space:]'
)"
if [ -z "$APP_PORT" ]; then
  echo "PORT falta en .env.production" >&2
  exit 1
fi
if [ -z "$WS_PORT" ]; then
  echo "WS_PORT falta en .env.production" >&2
  exit 1
fi

NODE_ENV=production npm run production:check

echo -e "${GREEN}[5/7] Configurando PM2...${NC}"
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2 --silent
fi

pm2 delete "$PM2_APP_NAME" >/dev/null 2>&1 || true
pm2 start ecosystem.config.js --only "$PM2_APP_NAME" --update-env
pm2 save
if command -v systemctl >/dev/null 2>&1; then
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
fi

echo -e "${GREEN}[6/7] Configurando Nginx...${NC}"
DOMAIN="$(
  grep '^DOMAIN=' .env.production 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '[:space:]'
)"
if [ -z "$DOMAIN" ]; then
  DOMAIN="importaiagent.com"
fi

sudo tee "/etc/nginx/sites-available/$APP_NAME" >/dev/null <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    location /ws {
        proxy_pass http://127.0.0.1:${WS_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

sudo ln -sf "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/$APP_NAME"
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx || sudo systemctl restart nginx

echo -e "${GREEN}[7/7] Verificando servicio...${NC}"
curl -fsS "http://127.0.0.1:${APP_PORT}/api/monitor/health" | head -c 200
echo

echo
echo "Bootstrap completado."
echo "App path:  $APP_PATH"
echo "Dominio:   $DOMAIN"
echo "PM2 app:   $PM2_APP_NAME"
echo "Nginx site:/etc/nginx/sites-available/$APP_NAME"
