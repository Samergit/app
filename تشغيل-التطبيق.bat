@echo off
chcp 65001 >nul
title تطبيق أوقاف دمشق
echo =================================================
echo   تطبيق تبادل مستلزمات المساجد - مديرية اوقاف دمشق
echo =================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [!] لم يتم العثور على Node.js
  echo     فضلا حمّله وثبّته من:  https://nodejs.org
  echo     ثم شغّل هذا الملف مرة اخرى.
  echo.
  pause
  exit /b
)
echo تشغيل الخادم... سيفتح المتصفح تلقائيا بعد لحظات.
start "" http://localhost:3000
node server.js
pause
