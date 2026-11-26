@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DimercPuente.vbs" 2>nul
rmdir /S /Q "%LOCALAPPDATA%\DimercPuente" 2>nul
echo Puente de impresion desinstalado.
pause
