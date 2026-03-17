@echo off
setlocal
cd /d "%~dp0"
echo Iniciando Cotizador en http://localhost:3000
"C:\Program Files\nodejs\node.exe" start-local.js
if errorlevel 1 (
  echo.
  echo El servidor se cerro con error. Revisa el mensaje de arriba.
  pause
)
