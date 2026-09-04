@echo off
REM =====================================================================
REM  RostiControl - Deshabilitar bloqueo de Windows (Escritorio Seguro)
REM ---------------------------------------------------------------------
REM  Objetivo: que el equipo NUNCA quede en la pantalla de bloqueo/login
REM  (escritorio seguro "Winlogon"), que el control remoto no puede ver.
REM  Tambien neutraliza el "Bloquear al finalizar sesion" de TeamViewer,
REM  porque TeamViewer usa la API LockWorkStation() y la politica de abajo
REM  se la deniega Windows.
REM
REM  Debe correr como Administrador o SYSTEM (escribe en HKLM = toda la maquina).
REM  Los cambios aplican de inmediato, sin reinicio.
REM =====================================================================

echo Aplicando configuracion anti-bloqueo...

REM 1) Impedir que la maquina se bloquee (Win+L, Ctrl+Alt+Supr^>Bloquear,
REM    y la llamada LockWorkStation que hace TeamViewer al cerrar sesion)
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v DisableLockWorkstation /t REG_DWORD /d 1 /f

REM 2) Sin bloqueo automatico por inactividad (0 = desactivado)
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v InactivityTimeoutSecs /t REG_DWORD /d 0 /f

REM 3) Protector de pantalla SIN contrasena, para todos los usuarios (politica)
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Control Panel\Desktop" /v ScreenSaveActive /t REG_SZ /d 0 /f
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Control Panel\Desktop" /v ScreenSaverIsSecure /t REG_SZ /d 0 /f

REM 4) No pedir contrasena al reanudar desde suspension (por si el equipo duerme)
powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_NONE 0e796bdb-100d-47d6-a2d5-f7d2daa51f51 0
powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_NONE 0e796bdb-100d-47d6-a2d5-f7d2daa51f51 0
powercfg /SETACTIVE SCHEME_CURRENT

echo.
echo Listo. Configuracion aplicada a nivel maquina.
echo NOTA: Si el equipo ya esta bloqueado AHORA, hay que desbloquearlo una
echo       vez (fisicamente o con la contrasena); de ahi en adelante ya no
echo       se vuelve a bloquear.
