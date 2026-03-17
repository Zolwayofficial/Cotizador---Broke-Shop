param(
  [string]$VpsHost = "107.175.95.172",
  [string]$VpsUser = "root",
  [string]$Domain = "importaiagent.com",
  [string]$VpsPath = "/var/www/importaiagent"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $env:VPS_PASSWORD) {
  throw "Define la variable VPS_PASSWORD antes de ejecutar este script."
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "No se encontro python en esta maquina."
}

Push-Location $projectRoot
try {
  & $python.Source "scripts/deploy_vps_direct.py" `
    --host $VpsHost `
    --user $VpsUser `
    --domain $Domain `
    --path $VpsPath
}
finally {
  Pop-Location
}
