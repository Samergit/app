@echo off
title Awqaf Public Tunnel
echo ==================================================
echo   Public tunnel for  http://localhost:3000
echo   Keep this window OPEN. The public URL appears below.
echo ==================================================
echo.
call npx --yes tunnelmole 3000
echo.
echo If it failed, install once:  npm install -g tunnelmole
pause
