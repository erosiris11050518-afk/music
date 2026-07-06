@echo off
chcp 65001 >nul
cd /d "%~dp0"
title EarTrainer Local Server
echo ============================================
echo  本地服务器 / Local server:
echo  http://localhost:8642
echo  按 Ctrl+C 停止 / Press Ctrl+C to stop
echo ============================================
echo.

rem 2 秒后自动打开浏览器（等服务器先起来）
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8642"

rem 优先用 py 启动器，其次 python
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m http.server 8642
  goto end
)
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8642
  goto end
)

echo [!] 未检测到 Python / Python not found.
echo     请到 https://www.python.org/downloads/ 安装，
echo     安装时务必勾选 "Add Python to PATH"，然后重新双击本文件。

:end
echo.
echo 若提示端口被占用（10048），说明服务器可能已在运行，
echo 直接在浏览器打开 http://localhost:8642 即可。
pause
