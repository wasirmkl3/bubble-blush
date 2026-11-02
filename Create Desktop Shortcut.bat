@echo off
rem Creates "Bubble Blush POS" shortcuts on the Desktop (normal + silent printing).
setlocal
set "DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d=[Environment]::GetFolderPath('Desktop'); $w=New-Object -ComObject WScript.Shell;" ^
  "$s=$w.CreateShortcut((Join-Path $d 'Bubble Blush POS.lnk')); $s.TargetPath=$env:DIR+'Start Bubble Blush POS.bat'; $s.WorkingDirectory=$env:DIR; $s.IconLocation=$env:DIR+'pos\assets\icon.ico'; $s.WindowStyle=7; $s.Save();" ^
  "$s=$w.CreateShortcut((Join-Path $d 'Bubble Blush POS (fast print).lnk')); $s.TargetPath=$env:DIR+'Start Bubble Blush POS (silent printing).bat'; $s.WorkingDirectory=$env:DIR; $s.IconLocation=$env:DIR+'pos\assets\icon.ico'; $s.WindowStyle=7; $s.Save()"
if errorlevel 1 (
  echo Could not create the shortcut. You can still double-click "Start Bubble Blush POS.bat".
) else (
  echo Done! Look for "Bubble Blush POS" on your Desktop.
)
pause
endlocal
