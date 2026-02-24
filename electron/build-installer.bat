@echo off
setlocal enabledelayedexpansion

echo.
echo  ╔═══════════════════════════════════════════════════════╗
echo  ║     CleanPos Installer Builder - Posso One Suite      ║
echo  ╚═══════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Checking Node.js version...
node --version

:: Check if npm is available
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not available!
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo.
    echo [2/4] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
) else (
    echo [2/4] Dependencies already installed.
)

:: Check for icon
if not exist "build\icon.ico" (
    echo.
    echo [WARNING] No icon.ico found in build folder!
    echo.
    echo To create an icon:
    echo   1. Open build\icon.svg in a browser
    echo   2. Screenshot or convert to PNG (256x256)
    echo   3. Use https://convertico.com to convert PNG to ICO
    echo   4. Save as build\icon.ico
    echo.
    echo Or press any key to continue without custom icon...
    pause >nul
)

:: Build the installer
echo.
echo [3/4] Building Windows installer...
echo This may take a few minutes...
echo.

call npm run build:win

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

echo.
echo [4/4] Build complete!
echo.
echo ═══════════════════════════════════════════════════════════
echo   SUCCESS! Installer created in: dist\
echo.
if exist "dist\CleanPos-Setup-1.0.0.exe" (
    echo   File: CleanPos-Setup-1.0.0.exe
    echo.
)
echo ═══════════════════════════════════════════════════════════
echo.

:: Open dist folder
explorer dist

pause
