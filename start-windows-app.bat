@echo off
title Aplicacion Windows Admin
cd /d "%~dp0\windows-admin"
npm run electron:dev
pause
