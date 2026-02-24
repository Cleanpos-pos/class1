@echo off
echo.
echo  Opening CleanPos Icon Generator...
echo.
echo  Instructions:
echo  1. Click "Download PNG" in the browser
echo  2. Go to https://convertico.com
echo  3. Upload the PNG and convert to ICO
echo  4. Save as "icon.ico" in the "build" folder
echo.

start "" "%~dp0build\generate-icon.html"

echo Press any key after you've saved icon.ico to the build folder...
pause >nul

if exist "%~dp0build\icon.ico" (
    echo.
    echo [SUCCESS] icon.ico found! You can now run build-installer.bat
) else (
    echo.
    echo [WARNING] icon.ico not found in build folder
    echo The installer will use a default icon.
)

pause
