@echo off
rem Starts the print helper in a visible window so you can see errors.
rem Close this window to stop it. Log: %LOCALAPPDATA%\BubbleBlushPOS\print-helper.log
echo Bubble Blush print helper - leave this window open while testing.
echo If an error appears below, take a photo and send it to us.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0pos\helper\print-helper.ps1"
echo.
echo The helper stopped (or was already running in the background).
type "%LOCALAPPDATA%\BubbleBlushPOS\print-helper.log" 2>nul
pause
