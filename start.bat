@echo off
echo Starting VeoRec...
echo.

REM Start server
start "VeoRec Server" cmd /k "cd /d %~dp0server && npm start"

REM Wait a moment then start client
timeout /t 2 /nobreak >nul
start "VeoRec Client" cmd /k "cd /d %~dp0client && npm run dev"

echo.
echo Server: http://localhost:3001
echo Dashboard: http://localhost:5173
echo.
echo Load the Chrome extension from: %~dp0extension
echo (Chrome -> Extensions -> Load unpacked -> select the extension folder)
echo.
pause
