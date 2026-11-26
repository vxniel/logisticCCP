@echo off
chcp 65001 >nul
title Instalar puente de impresion Dimerc
set DEST=%LOCALAPPDATA%\DimercPuente
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%~dp0Puente_Impresion_Dimerc.ps1" "%DEST%\" >nul
if not exist "%DEST%\impresoras_ip.txt" echo.>"%DEST%\impresoras_ip.txt"
> "%DEST%\iniciar.vbs" echo CreateObject("Wscript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%DEST%\Puente_Impresion_Dimerc.ps1""", 0
copy /Y "%DEST%\iniciar.vbs" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DimercPuente.vbs" >nul
wscript "%DEST%\iniciar.vbs"
echo.
echo Listo: el puente de impresion quedo instalado y se inicia solo con Windows.
echo Para impresoras por red (IP) escribe las IP en: %DEST%\impresoras_ip.txt
echo Ahora abre la app, Herramientas ^> Impresoras ^> Buscar.
pause
