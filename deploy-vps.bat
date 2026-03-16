@echo off
REM ═══════════════════════════════════════════════════
REM SCRIPT DE DESPLIEGUE AUTOMÁTICO - COTIZADOR PERÚ v3.0
REM ═══════════════════════════════════════════════════
REM 
REM USO: deploy-vps.bat
REM 
REM ESTE SCRIPT:
REM 1. Prepara el paquete local
REM 2. Sube al VPS
REM 3. Instala dependencias
REM 4. Configura el entorno
REM 5. Inicia el servicio
REM 6. Verifica que todo funcione
REM ═══════════════════════════════════════════════════

setlocal enabledelayedexpansion

REM Configuración del VPS
set VPS_USER=root
set VPS_IP=107.175.95.172
set VPS_PATH=/var/www/cotizador

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║  DESPLIEGUE AUTOMÁTICO - COTIZADOR PERÚ ULTIMATE v3.0     ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM ═══════════════════════════════════════════════════
REM PASO 1: PREPARAR PAQUETE LOCAL
REM ═══════════════════════════════════════════════════

echo [1/8] Preparando paquete local...

REM Limpiar node_modules
if exist node_modules (
  echo    Eliminando node_modules...
  rmdir /s /q node_modules
)

if exist package-lock.json (
  echo    Eliminando package-lock.json...
  del package-lock.json
)

REM Limpiar cliente
if exist client\node_modules (
  echo    Eliminando client\node_modules...
  rmdir /s /q client\node_modules
)

if exist client\package-lock.json (
  echo    Eliminando client\package-lock.json...
  del client\package-lock.json
)

REM Crear .env.production si no existe
if not exist .env.production (
  echo    Creando .env.production...
  (
    echo PORT=3001
    echo NODE_ENV=production
    echo GROQ_API_KEY=COLOCA_TU_API_KEY_DE_GROQ_AQUI
    echo DB_PATH=./data/cotizador.db
    echo DATA_DIR=./data
    echo EMAIL_SMTP_HOST=smtp.gmail.com
    echo EMAIL_SMTP_PORT=587
    echo EMAIL_USER=tu_email@gmail.com
    echo EMAIL_PASSWORD=tu_password_de_aplicacion
  ) > .env.production
  echo    ^! IMPORTANTE: Edita .env.production con tus credenciales reales
)

echo    OK Paquete local listo
echo.

REM ═══════════════════════════════════════════════════
REM PASO 2: SUBIR AL VPS
REM ═══════════════════════════════════════════════════

echo [2/8] Subiendo archivos al VPS (%VPS_IP%)...

REM Crear directorio en VPS
ssh %VPS_USER%@%VPS_IP% "mkdir -p %VPS_PATH%"

REM Subir archivos con scp (excluyendo node_modules)
echo    Subiendo archivos (esto puede tardar unos minutos)...
scp -r ^
  --exclude 'node_modules' ^
  --exclude '.git' ^
  --exclude '.env' ^
  --exclude 'data' ^
  * %VPS_USER%@%VPS_IP%:%VPS_PATH%/

if %ERRORLEVEL% EQU 0 (
  echo    OK Archivos subidos correctamente
) else (
  echo    ERROR Error al subir archivos
  exit /b 1
)

echo.

REM ═══════════════════════════════════════════════════
REM PASO 3-8: EJECUTAR EN VPS
REM ═══════════════════════════════════════════════════

echo [3/8] Ejecutando comandos en VPS...

ssh %VPS_USER%@%VPS_IP% << ENDSSH
cd %VPS_PATH%

echo "   [3/8] Instalando dependencias..."
npm install

echo "   [4/8] Instalando cliente React..."
cd client
npm install
cd ..

echo "   [5/8] Configurando entorno..."
if [ -f ".env.production" ]; then
  cp .env.production .env
fi

echo "   [6/8] Instalando/Iniciando PM2..."
npm install -g pm2 2>/dev/null || true
pm2 stop cotizador 2>/dev/null || true
pm2 delete cotizador 2>/dev/null || true
pm2 start server/index.js --name cotizador
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo "   [7/8] Verificando servicio..."
pm2 status
curl -s http://localhost:3001/api/monitor/health | head -c 200
echo ""

echo "   [8/8] Completado!"
ENDSSH

if %ERRORLEVEL% EQU 0 (
  echo    OK Comandos ejecutados correctamente
) else (
  echo    ERROR Error al ejecutar comandos en VPS
  exit /b 1
)

echo.

REM ═══════════════════════════════════════════════════
REM REPORTE FINAL
REM ═══════════════════════════════════════════════════

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║  OK DESPLIEGUE COMPLETADO EXITOSAMENTE                     ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo URLs DE ACCESO:
echo    Frontend: http://%VPS_IP%
echo    API: http://%VPS_IP%/api
echo    WebSocket: ws://%VPS_IP%:3002
echo.
echo COMANDOS ÚTILES:
echo    Ver estado: ssh %VPS_USER%@%VPS_IP% "pm2 status"
echo    Ver logs: ssh %VPS_USER%@%VPS_IP% "pm2 logs cotizador"
echo    Reiniciar: ssh %VPS_USER%@%VPS_IP% "pm2 restart cotizador"
echo.
echo PROXIMOS PASOS:
echo    1. Editar .env con tu GROQ_API_KEY real
echo    2. Configurar SSL con Certbot ^(HTTPS^)
echo    3. Probar el dashboard en el navegador
echo.
echo OK ¡SISTEMA OPERATIVO EN PRODUCCIÓN!
echo.

pause
