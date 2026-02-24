@echo off
cd /d "%~dp0"
echo.
echo  ╔═══════════════════════════════════════╗
echo  ║     CleanPos - Posso One Suite        ║
echo  ║  Professional Dry Cleaning POS        ║
echo  ╚═══════════════════════════════════════╝
echo.
echo Starting CleanPos...
node_modules\.bin\electron.cmd .
pause
