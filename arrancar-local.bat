@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo No se encontro Node.js en el PATH.
  pause
  exit /b 1
)

echo Iniciando start-local.js con Node.js del PATH
node start-local.js
if errorlevel 1 (
  echo.
  echo El servidor se cerro con error. Revisa el mensaje de arriba.
  pause
)
