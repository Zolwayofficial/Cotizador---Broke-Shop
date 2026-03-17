#!/usr/bin/env bash

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

VPS_USER="${VPS_USER:-root}"
VPS_IP="${VPS_IP:-107.175.95.172}"
VPS_PATH="${VPS_PATH:-/var/www/cotizador}"
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
  cat > .env.production <<'EOF'
PORT=3000
NODE_ENV=production
GROQ_API_KEY=COLOCA_TU_API_KEY_DE_GROQ_AQUI
DB_PATH=./data/cotizador.db
DATA_DIR=./data
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_password_de_aplicacion
EOF
  echo "Se creo .env.production con valores de ejemplo. Editalo antes del despliegue real."
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
  --exclude 'data' \
  --exclude 'coverage' \
  --exclude '*.log' \
  ./ "${VPS_USER}@${VPS_IP}:${VPS_PATH}/"

echo -e "${YELLOW}[4/7] Instalando dependencias y reiniciando servicio...${NC}"
ssh "${VPS_USER}@${VPS_IP}" "VPS_PATH='${VPS_PATH}' bash -s" <<'ENDSSH'
set -euo pipefail

cd "$VPS_PATH"
mkdir -p data

if [ -f ".env.production" ]; then
  cp .env.production .env
fi

npm install --omit=dev

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

PORT="${PORT:-3000}" pm2 delete cotizador >/dev/null 2>&1 || true
PORT="${PORT:-3000}" pm2 start server/index.js --name cotizador --update-env
pm2 save

if command -v systemctl >/dev/null 2>&1; then
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
fi
ENDSSH

echo -e "${YELLOW}[5/7] Configurando Nginx...${NC}"
ssh "${VPS_USER}@${VPS_IP}" "bash -s" <<'ENDSSH'
set -euo pipefail

if command -v apt-get >/dev/null 2>&1 && ! command -v nginx >/dev/null 2>&1; then
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
fi

if command -v nginx >/dev/null 2>&1; then
  cat > /etc/nginx/sites-available/cotizador <<'NGINX'
server {
    listen 80;
    server_name _;

    location /ws {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGINX

  ln -sf /etc/nginx/sites-available/cotizador /etc/nginx/sites-enabled/cotizador
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx || systemctl restart nginx
fi
ENDSSH

echo -e "${YELLOW}[6/7] Verificando servicio...${NC}"
ssh "${VPS_USER}@${VPS_IP}" "pm2 status cotizador && curl -fsS http://127.0.0.1:3000/api/monitor/health | head -c 200 && echo"

echo -e "${YELLOW}[7/7] Despliegue completado${NC}"
echo -e "${GREEN}Frontend: http://${VPS_IP}${NC}"
echo -e "${GREEN}API:      http://${VPS_IP}/api${NC}"
echo -e "${GREEN}WS:       ws://${VPS_IP}/ws${NC}"
