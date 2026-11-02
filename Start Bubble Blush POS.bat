@echo off
rem ============================================================
rem  Bubble Blush POS launcher
rem  1. Starts the print helper (sends bills straight to the
rem     receipt printer, so the paper stops after the bill).
rem  2. Opens the POS as its own app window in Microsoft Edge.
rem     Data is kept in a dedicated Edge profile so it is never
rem     mixed with normal browsing or wiped by "clear history".
rem ============================================================
setlocal
set "APP=%~dp0pos\index.html"
if not exist "%APP%" (
  echo Could not find "%APP%".
  echo Keep this file in the same folder as the "pos" folder.
  pause
  exit /b 1
)
set "HELPER=%~dp0pos\helper\print-helper.ps1"
if exist "%HELPER%" (
  start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%HELPER%"
)
set "PROFILE=%LOCALAPPDATA%\BubbleBlushPOS\browser"
set "URL=file:///%APP:\=/%?launcher=1"
set "EXTRA="
if /i "%~1"=="silent" set "EXTRA=--kiosk-printing"
start "" msedge --user-data-dir="%PROFILE%" --app="%URL%" --start-maximized --no-first-run --no-default-browser-check %EXTRA%
endlocal
