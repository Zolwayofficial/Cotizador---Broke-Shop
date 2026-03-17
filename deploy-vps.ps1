param(
  [string]$VpsUser = $(if ($env:VPS_USER) { $env:VPS_USER } else { "root" }),
  [string]$VpsIp = $(if ($env:VPS_IP) { $env:VPS_IP } else { "107.175.95.172" }),
  [string]$VpsPath = $(if ($env:VPS_PATH) { $env:VPS_PATH } else { "/var/www/cotizador" })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stagingPath = Join-Path $env:TEMP ("cotizador-stage-" + [guid]::NewGuid().ToString("N"))
$archiveName = "cotizador-deploy-$timestamp.tgz"
$archivePath = Join-Path $env:TEMP $archiveName
$remoteScriptName = "deploy-remote-$timestamp.sh"
$remoteScriptPath = Join-Path $env:TEMP $remoteScriptName
$originalLocation = Get-Location

function Write-Step($message) {
  Write-Host ""
  Write-Host $message -ForegroundColor Yellow
}

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "No se encontro el comando requerido: $name"
  }
}

function Remove-IfExists($path) {
  if (Test-Path $path) {
    Remove-Item $path -Recurse -Force
  }
}

try {
  Set-Location $projectRoot

  Require-Command "ssh"
  Require-Command "scp"
  Require-Command "tar.exe"
  Require-Command "npm.cmd"

  Write-Step "[1/7] Preparando entorno local..."

  if (-not (Test-Path ".env.production")) {
    @"
PORT=3000
NODE_ENV=production
GROQ_API_KEY=COLOCA_TU_API_KEY_DE_GROQ_AQUI
DB_PATH=./data/cotizador.db
DATA_DIR=./data
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_password_de_aplicacion
"@ | Set-Content ".env.production"
    Write-Host "Se creo .env.production con valores de ejemplo. Editalo antes de usar IA y correo." -ForegroundColor Yellow
  }

  if (-not (Test-Path "client\node_modules")) {
    Write-Host "Instalando dependencias del cliente..."
    & npm.cmd install --prefix client
  }

  Write-Step "[2/7] Construyendo frontend..."
  & npm.cmd run client:build

  Write-Step "[3/7] Empaquetando proyecto..."
  Remove-IfExists $stagingPath
  Remove-IfExists $archivePath
  Remove-IfExists $remoteScriptPath
  New-Item -ItemType Directory -Path $stagingPath | Out-Null

  $excludedNames = @(".git", "node_modules", "data", ".env", "coverage")

  Get-ChildItem -Force $projectRoot | Where-Object {
    $excludedNames -notcontains $_.Name
  } | ForEach-Object {
    Copy-Item $_.FullName -Destination $stagingPath -Recurse -Force
  }

  Remove-IfExists (Join-Path $stagingPath "client\node_modules")
  Remove-IfExists (Join-Path $stagingPath "local-start.err.log")
  Remove-IfExists (Join-Path $stagingPath "local-start.out.log")

  & tar.exe -czf $archivePath -C $stagingPath .

  $remoteScript = @'
#!/usr/bin/env bash
set -euo pipefail

APP_PATH="$1"
ARCHIVE_NAME="$2"

cd "$APP_PATH"
mkdir -p data
tar -xzf "$ARCHIVE_NAME"
rm -f "$ARCHIVE_NAME"

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

if command -v apt-get >/dev/null 2>&1; then
  if ! command -v nginx >/dev/null 2>&1; then
    apt-get update -y
    DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
  fi

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

curl -fsS http://127.0.0.1:3000/api/monitor/health | head -c 200
echo

rm -f "$0"
'@

  [System.IO.File]::WriteAllText(
    $remoteScriptPath,
    $remoteScript.Replace("`r`n", "`n"),
    (New-Object System.Text.UTF8Encoding($false))
  )

  Write-Step "[4/7] Subiendo paquete al VPS..."
  & ssh "$VpsUser@$VpsIp" "mkdir -p '$VpsPath'"
  & scp $archivePath "$VpsUser@$VpsIp:$VpsPath/$archiveName"
  & scp $remoteScriptPath "$VpsUser@$VpsIp:$VpsPath/$remoteScriptName"

  Write-Step "[5/7] Instalando y reiniciando servicio en VPS..."
  & ssh "$VpsUser@$VpsIp" "bash '$VpsPath/$remoteScriptName' '$VpsPath' '$archiveName'"

  Write-Step "[6/7] Verificando servicio remoto..."
  & ssh "$VpsUser@$VpsIp" "pm2 status cotizador"

  Write-Step "[7/7] Despliegue completado"
  Write-Host "Frontend: http://$VpsIp" -ForegroundColor Green
  Write-Host "API:      http://$VpsIp/api" -ForegroundColor Green
  Write-Host "WS:       ws://$VpsIp/ws" -ForegroundColor Green
}
catch {
  Write-Error $_
  exit 1
}
finally {
  Set-Location $originalLocation
  Remove-IfExists $stagingPath
  Remove-IfExists $archivePath
  Remove-IfExists $remoteScriptPath
}
