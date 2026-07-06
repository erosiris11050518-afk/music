@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Ear Training Publish

echo ============================================
echo  Ear Training 一键发布
echo ============================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [!] 未检测到 git，请先安装 Git。
  pause
  exit /b 1
)

echo [1/4] 构建静态发布包...
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 tools\build_static.py
) else (
  python tools\build_static.py
)
if errorlevel 1 (
  echo [!] 构建失败。
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [2/4] 初始化 git 仓库...
  git init
  git branch -M main
) else (
  echo [2/4] git 仓库已就绪。
)

echo [3/4] 提交本地改动...
git add .
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Update site %date% %time%"
) else (
  echo 没有新的改动需要提交。
)

echo [4/4] 推送到 GitHub...
git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo [!] 还没有设置 GitHub 远程仓库 origin。
  echo 请先执行一次：
  echo git remote add origin https://github.com/^<你的用户名^>/^<仓库名^>.git
  echo git push -u origin main
  pause
  exit /b 1
)

git push
if errorlevel 1 (
  echo [!] 推送失败，请检查 GitHub 登录状态、网络或远程仓库权限。
  pause
  exit /b 1
)

echo.
echo 发布已触发。请到 GitHub 仓库的 Actions 页面查看 Deploy Static Site。
pause
