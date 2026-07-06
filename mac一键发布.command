#!/bin/bash
# 双击运行：构建静态发布包，提交代码，并推送到 GitHub。
set -e
cd "$(dirname "$0")"

echo "============================================"
echo " Ear Training 一键发布"
echo "============================================"

if ! command -v git >/dev/null 2>&1; then
  echo "[!] 未检测到 git，请先安装 Git。"
  read -n 1 -s -r -p "按任意键关闭..."
  exit 1
fi

echo "[1/4] 构建静态发布包..."
python3 tools/build_static.py

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[2/4] 初始化 git 仓库..."
  git init
  git branch -M main
else
  echo "[2/4] git 仓库已就绪。"
fi

echo "[3/4] 提交本地改动..."
git add .
if git diff --cached --quiet; then
  echo "没有新的改动需要提交。"
else
  git commit -m "Update site $(date '+%Y-%m-%d %H:%M:%S')"
fi

echo "[4/4] 推送到 GitHub..."
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "[!] 还没有设置 GitHub 远程仓库 origin。"
  echo "请先执行一次："
  echo "git remote add origin https://github.com/<你的用户名>/<仓库名>.git"
  echo "git push -u origin main"
  read -n 1 -s -r -p "按任意键关闭..."
  exit 1
fi

git push
echo ""
echo "发布已触发。请到 GitHub 仓库的 Actions 页面查看 Deploy Static Site。"
read -n 1 -s -r -p "按任意键关闭..."
