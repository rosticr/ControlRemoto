@echo off
title RostiControl - Iniciador
echo ===================================================
echo Iniciando RostiControl en la Nube...
echo ===================================================

echo Conectando al Servidor Web (acceso.rosti.cr)...
start "RostiControl App" cmd /c "cd c:\ControlRemoto\windows-admin && npm run electron:dev"

echo.
echo La aplicacion de Windows se esta abriendo.
echo Puedes cerrar esta ventana.
pause
