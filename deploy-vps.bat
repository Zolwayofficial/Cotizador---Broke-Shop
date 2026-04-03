@echo off
setlocal
rem Wrapper Windows: la logica local vive en PowerShell.
rem El Bash remoto se genera dentro de deploy-vps.ps1 y no debe mezclarse aqui.
rem No metas copia ni shell remoto en este .bat; eso vive en deploy-vps.ps1.
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%deploy-vps.ps1" %*
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" (
  echo.
  echo Despliegue fallido con codigo %EXIT_CODE%.
)
exit /b %EXIT_CODE%
