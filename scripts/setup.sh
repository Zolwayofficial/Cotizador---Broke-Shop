#!/bin/bash
set -e

echo "═══════════════════════════════════════════"
echo "⬡ Cotizador de Importación Perú v2.0"
echo "  Setup automático para Ubuntu VPS"
echo "═══════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── 1. System dependencies ──
echo -e "${GREEN}[1/7] Instalando dependencias del sistema...${NC}"
sudo apt-get update -qq
sudo apt-get install -y -qq curl nginx certbot python3-certbot-nginx build-essential

# ── 2. Node.js (v20 LTS) ──
echo -e "${GREEN}[2/7] Instalando Node.js 20...${NC}"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
echo "  Node: $(node -v) · npm: $(npm -v)"

# ── 3. PM2 (process manager) ──
echo -e "${GREEN}[3/7] Instalando PM2...${NC}"
sudo npm install -g pm2 --silent 2>/dev/null || true

# ── 4. Project dependencies ──
echo -e "${GREEN}[4/7] Instalando dependencias del proyecto...${NC}"
cd "$(dirname "$0")/.."
npm install --production --silent

# ── 5. Data directory ──
echo -e "${GREEN}[5/7] Preparando directorio de datos...${NC}"
mkdir -p data

if [ ! -f data/nandina.json ]; then
  echo -e "${YELLOW}  ⚠ No se encontró data/nandina.json${NC}"
  echo "  Coloca nandina.json (o NANDINA.TXT + NANDTASA.TXT) en data/"
  echo "  El servidor los procesará automáticamente al iniciar."
fi

# ── 6. Environment ──
echo -e "${GREEN}[6/7] Configurando entorno...${NC}"
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${YELLOW}  ⚠ Creado .env desde .env.example — edita las API keys${NC}"
  echo "  nano .env"
fi

# ── 7. Nginx ──
echo -e "${GREEN}[7/7] Configurando Nginx...${NC}"
DOMAIN=$(grep DOMAIN .env 2>/dev/null | cut -d= -f2 | tr -d ' ')
if [ -z "$DOMAIN" ]; then
  DOMAIN="localhost"
fi

sudo tee /etc/nginx/sites-available/cotizador > /dev/null << NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # API — larger body for document uploads
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        client_max_body_size 10M;
        proxy_read_timeout 120s;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|svg|ico|woff2)$ {
        proxy_pass http://127.0.0.1:3000;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/cotizador /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "═══════════════════════════════════════════"
echo -e "${GREEN}✓ Setup completo!${NC}"
echo "═══════════════════════════════════════════"
echo ""
echo "Próximos pasos:"
echo ""
echo "  1. Edita la configuración:"
echo "     nano .env"
echo ""
echo "  2. Coloca la base arancelaria:"
echo "     cp /ruta/a/nandina.json data/"
echo "     # O coloca NANDINA.TXT + NANDTASA.TXT en data/"
echo ""
echo "  3. Inicia el servidor:"
echo "     pm2 start server/index.js --name cotizador"
echo "     pm2 save"
echo "     pm2 startup"
echo ""
echo "  4. (Opcional) SSL con Let's Encrypt:"
echo "     sudo certbot --nginx -d ${DOMAIN}"
echo ""
echo "  5. Verifica:"
echo "     curl http://localhost:3000/api/nandina/status"
echo ""
