@echo off
echo Installing ScreenRec dependencies...
echo.

echo [1/2] Installing server dependencies...
cd /d %~dp0server
call npm install
if errorlevel 1 (echo Server install failed & pause & exit /b 1)

echo.
echo [2/2] Installing client dependencies...
cd /d %~dp0client
call npm install
if errorlevel 1 (echo Client install failed & pause & exit /b 1)

echo.
echo ============================================
echo  Setup complete! Run start.bat to launch.
echo ============================================
echo.
pause
