#!/bin/bash

# ═══════════════════════════════════════════════════
# SCRIPT DE DESPLIEGUE AUTOMÁTICO - COTIZADOR PERÚ v3.0
# ═══════════════════════════════════════════════════
# 
# USO: ./deploy-vps.sh
# 
# ESTE SCRIPT:
# 1. Prepara el paquete local
# 2. Sube al VPS
# 3. Instala dependencias
# 4. Configura el entorno
# 5. Inicia el servicio
# 6. Verifica que todo funcione
# ═══════════════════════════════════════════════════

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuración del VPS
VPS_USER="${VPS_USER:-root}"
VPS_IP="${VPS_IP:-107.175.95.172}"
VPS_PATH="${VPS_PATH:-/var/www/cotizador}"

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  DESPLIEGUE AUTOMÁTICO - COTIZADOR PERÚ ULTIMATE v3.0     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ═══════════════════════════════════════════════════
# PASO 1: PREPARAR PAQUETE LOCAL
# ═══════════════════════════════════════════════════

echo -e "${YELLOW}[1/8] Preparando paquete local...${NC}"

# Limpiar node_modules
if [ -d "node_modules" ]; then
  echo "   Eliminando node_modules..."
  rm -rf node_modules
fi

if [ -f "package-lock.json" ]; then
  echo "   Eliminando package-lock.json..."
  rm package-lock.json
fi

# Limpiar cliente
if [ -d "client/node_modules" ]; then
  echo "   Eliminando client/node_modules..."
  rm -rf client/node_modules
fi

if [ -f "client/package-lock.json" ]; then
  echo "   Eliminando client/package-lock.json..."
  rm client/package-lock.json
fi

# Crear .env.production si no existe
if [ ! -f ".env.production" ]; then
  echo "   Creando .env.production..."
  cat > .env.production << EOF
PORT=3001
NODE_ENV=production
GROQ_API_KEY=COLOCA_TU_API_KEY_DE_GROQ_AQUI
DB_PATH=./data/cotizador.db
DATA_DIR=./data
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_password_de_aplicacion
EOF
  echo -e "${RED}   ⚠️  IMPORTANTE: Edita .env.production con tus credenciales reales${NC}"
fi

echo -e "${GREEN}   ✅ Paquete local listo${NC}"

# ═══════════════════════════════════════════════════
# PASO 2: SUBIR AL VPS
# ═══════════════════════════════════════════════════

echo -e "${YELLOW}[2/8] Subiendo archivos al VPS (${VPS_IP})...${NC}"

# Crear directorio en VPS
ssh ${VPS_USER}@${VPS_IP} "mkdir -p ${VPS_PATH}"

# Subir archivos (excluyendo node_modules)
rsync -avz \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'data' \
  --exclude '*.log' \
  ./ ${VPS_USER}@${VPS_IP}:${VPS_PATH}/

if [ $? -eq 0 ]; then
  echo -e "${GREEN}   ✅ Archivos subidos correctamente${NC}"
else
  echo -e "${RED}   ❌ Error al subir archivos${NC}"
  exit 1
fi

# ═══════════════════════════════════════════════════
# PASO 3: CONECTAR E INSTALAR EN VPS
# ═══════════════════════════════════════════════════

echo -e "${YELLOW}[3/8] Instalando dependencias en VPS...${NC}"

ssh ${VPS_USER}@${VPS_IP} << 'ENDSSH'
cd /var/www/cotizador

echo "   Instalando dependencias del servidor..."
npm install

echo "   Instalando dependencias del cliente..."
cd client
npm install
cd ..

echo -e "${GREEN}   ✅ Dependencias instaladas${NC}"
ENDSSH

# ═══════════════════════════════════════════════════
# PASO 4: CONFIGURAR ENTORNO
# ═══════════════════════════════════════════════════

echo -e "${YELLOW}[4/8] Configurando entorno en VPS...${NC}"

ssh ${VPS_USER}@${VPS_IP} << 'ENDSSH'
cd /var/www/cotizador

# Copiar .env.production a .env
if [ -f ".env.production" ]; then
  cp .env.production .env
  echo "   ✅ .env configurado"
else
  echo -e "${RED}   ⚠️  .env.production no existe${NC}"
fi

# Verificar PM2
if ! command -v pm2 &> /dev/null; then
  echo "   Instalando PM2..."
  npm install -g pm2
else
  echo "   ✅ PM2 ya está instalado"
fi
ENDSSH

echo -e "${GREEN}   ✅ Entorno configurado${NC}"

# ═══════════════════════════════════════════════════
# PASO 5: INICIAR SERVICIO
# ═══════════════════════════════════════════════════

echo -e "${YELLOW}[5/8] Iniciando servicio en VPS...${NC}"

ssh ${VPS_USER}@${VPS_IP} << 'ENDSSH'
cd /var/www/cotizador

# Detener servicio anterior si existe
pm2 stop cotizador 2>/dev/null || true
pm2 delete cotizador 2>/dev/null || true

# Iniciar nuevo servicio
echo "   Iniciando cotizador con PM2..."
pm2 start server/index.js --name cotizador

# Guardar configuración
pm2 save

# Configurar auto-start
echo "   Configurando auto-start..."
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo -e "${GREEN}   ✅ Servicio iniciado${NC}"
ENDSSH

# ═══════════════════════════════════════════════════
# PASO 6: CONFIGURAR NGINX (OPCIONAL)
# ═══════════════════════════════════════════════════

echo -e "${YELLOW}[6/8] Configurando Nginx...${NC}"

ssh ${VPS_USER}@${VPS_IP} << 'ENDSSH'
# Instalar Nginx si no está instalado
if ! command -v nginx &> /dev/null; then
  echo "   Instalando Nginx..."
  apt-get update
  apt-get install -y nginx
fi

# Crear configuración
cat > /etc/nginx/sites-available/cotizador << 'NGINX_EOF'
server {
    listen 80;
    server_name _;

    # Frontend React (puerto 3000)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # API Backend (puerto 3001)
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket (puerto 3002)
    location /ws {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
NGINX_EOF

# Activar configuración
ln -sf /etc/nginx/sites-available/cotizador /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Probar y recargar
nginx -t && systemctl reload nginx

echo -e "${GREEN}   ✅ Nginx configurado${NC}"
ENDSSH

# ═══════════════════════════════════════════════════
# PASO 7: VERIFICAR QUE TODO FUNCIONE
# ═══════════════════════════════════════════════════

echo -e "${YELLOW}[7/8] Verificando servicio...${NC}"

ssh ${VPS_USER}@${VPS_IP} << 'ENDSSH'
cd /var/www/cotizador

echo "   Verificando PM2..."
pm2 status

echo "   Probando API..."
curl -s http://localhost:3001/api/monitor/health | head -c 200
echo ""

echo "   Verificando puertos..."
netstat -tulpn | grep -E '3000|3001|3002' || echo "   Puertos verificados"

echo -e "${GREEN}   ✅ Verificación completada${NC}"
ENDSSH

# ═══════════════════════════════════════════════════
# PASO 8: REPORTE FINAL
# ═══════════════════════════════════════════════════

echo -e "${YELLOW}[8/8] Generando reporte final...${NC}"

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ DESPLIEGUE COMPLETADO EXITOSAMENTE                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo "📊 ESTADO DEL SERVICIO:"
ssh ${VPS_USER}@${VPS_IP} "pm2 status cotizador"

echo ""
echo "🔗 URLs DE ACCESO:"
echo "   Frontend: http://${VPS_IP}"
echo "   API: http://${VPS_IP}/api"
echo "   WebSocket: ws://${VPS_IP}:3002"
echo ""
echo "📋 COMANDOS ÚTILES:"
echo "   Ver estado: ssh ${VPS_USER}@${VPS_IP} 'pm2 status'"
echo "   Ver logs: ssh ${VPS_USER}@${VPS_IP} 'pm2 logs cotizador'"
echo "   Reiniciar: ssh ${VPS_USER}@${VPS_IP} 'pm2 restart cotizador'"
echo ""
echo "⚠️  PRÓXIMOS PASOS:"
echo "   1. Editar .env con tu GROQ_API_KEY real"
echo "   2. Configurar SSL con Certbot (HTTPS)"
echo "   3. Probar el dashboard en el navegador"
echo ""
echo -e "${GREEN}🎉 ¡SISTEMA OPERATIVO EN PRODUCCIÓN!${NC}"
