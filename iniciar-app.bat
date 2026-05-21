@echo off
title RostiControl - Iniciador
echo ===================================================
echo Iniciando RostiControl...
echo ===================================================

echo [1/2] Iniciando Servidor de Senalizacion (Puerto 3000)...
start "Signaling Server" cmd /c "cd c:\ControlRemoto\signaling-server && node server.js"

:: Esperar un par de segundos para que el servidor levante
timeout /t 2 /nobreak > nul

echo [2/2] Iniciando Aplicacion de Escritorio (Electron)...
start "RostiControl App" cmd /c "cd c:\ControlRemoto\windows-admin && npm run electron:dev"

echo.
echo Todo se ha iniciado correctamente en ventanas separadas.
echo Puedes cerrar esta ventana.
pause
