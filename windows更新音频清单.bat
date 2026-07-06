@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Update audio manifest

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 tools\update_manifest.py
  goto end
)
where python >nul 2>nul
if %errorlevel%==0 (
  python tools\update_manifest.py
  goto end
)

echo [!] 未检测到 Python / Python not found.
echo     请到 https://www.python.org/downloads/ 安装，
echo     安装时务必勾选 "Add Python to PATH"，然后重新双击本文件。

:end
echo.
pause
