#!/bin/zsh
set -e

cd "$(dirname "$0")"

echo "SignalPath GitHub Pages 一键发布"
echo "目录：$(pwd)"
echo ""

if ! command -v git >/dev/null 2>&1; then
  echo "未找到 git，请先安装 Git 或 Xcode Command Line Tools。"
  read "PAUSE?按回车退出"
  exit 1
fi

if [ ! -d ".git" ]; then
  read "ANS?当前目录还不是 Git 仓库，是否初始化？输入 y 继续："
  if [ "$ANS" != "y" ] && [ "$ANS" != "Y" ]; then
    echo "已取消。"
    read "PAUSE?按回车退出"
    exit 0
  fi
  git init
  git branch -M main >/dev/null 2>&1 || true
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo ""
  echo "请先在 GitHub 新建一个空仓库，然后粘贴仓库地址。"
  echo "例如：git@github.com:你的用户名/signalpath.git"
  echo "或：  https://github.com/你的用户名/signalpath.git"
  read "REMOTE?GitHub 仓库地址："
  if [ -z "$REMOTE" ]; then
    echo "未填写仓库地址，已取消。"
    read "PAUSE?按回车退出"
    exit 1
  fi
  git remote add origin "$REMOTE"
else
  REMOTE="$(git remote get-url origin)"
fi

BRANCH="$(git branch --show-current 2>/dev/null || true)"
if [ -z "$BRANCH" ]; then
  BRANCH="main"
  git checkout -B "$BRANCH"
fi

git add index.html css js "$0"

if git diff --cached --quiet; then
  echo "没有检测到新的文件改动，跳过提交。"
else
  git commit -m "Publish SignalPath $(date '+%Y-%m-%d %H:%M:%S')"
fi

echo ""
echo "正在推送到 GitHub..."
git push -u origin "$BRANCH"

REMOTE="$(git remote get-url origin)"
REPO_PATH=""
case "$REMOTE" in
  git@github.com:*) REPO_PATH="${REMOTE#git@github.com:}" ;;
  https://github.com/*) REPO_PATH="${REMOTE#https://github.com/}" ;;
  http://github.com/*) REPO_PATH="${REMOTE#http://github.com/}" ;;
esac
REPO_PATH="${REPO_PATH%.git}"
USER_NAME="${REPO_PATH%%/*}"
REPO_NAME="${REPO_PATH#*/}"

echo ""
echo "推送完成。首次发布还需要在 GitHub 打开："
echo "Settings -> Pages -> Build and deployment -> Deploy from a branch"
echo "Branch 选择：$BRANCH / root，然后保存。"

if [ -n "$USER_NAME" ] && [ -n "$REPO_NAME" ] && [ "$USER_NAME" != "$REPO_NAME" ]; then
  if [ "$REPO_NAME" = "$USER_NAME.github.io" ]; then
    echo "发布地址通常是：https://$REPO_NAME/"
  else
    echo "发布地址通常是：https://$USER_NAME.github.io/$REPO_NAME/"
  fi
fi

echo ""
echo "如果页面没立刻打开，等 1-3 分钟再刷新。"
read "PAUSE?按回车退出"
