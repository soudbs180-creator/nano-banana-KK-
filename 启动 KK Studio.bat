@echo off
chcp 65001 >nul
title KK Studio
cd /d "%~dp0"

:: 1. Clean up old processes
taskkill /F /IM node.exe >nul 2>nul
taskkill /F /IM "KK Studio.exe" >nul 2>nul

:: 2. Create the hidden launcher script
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%~dp0" 
echo WshShell.Run "cmd /c npm run dev", 0, False
echo Set WshShell = Nothing
) > "%TEMP%\kk_hidden_launch.vbs"

:: 3. Run the hidden script
cscript //nologo "%TEMP%\kk_hidden_launch.vbs"

:: 4. Clean up VBS
del "%TEMP%\kk_hidden_launch.vbs"

:: 5. Exit immediately (User sees nothing)
exit
