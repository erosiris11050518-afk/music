#!/bin/bash
# 双击运行：在本机 8642 端口启动本地服务器并自动打开页面。
# 不要直接双击 index.html（file:// 方式会被浏览器拦截音频加载和文件夹扫描）。
cd "$(dirname "$0")"
( sleep 1; open "http://localhost:8642" ) &
echo "服务器运行中：http://localhost:8642 （按 Ctrl+C 停止）"
python3 -m http.server 8642 2>/dev/null || {
  echo "8642 端口已被占用——很可能服务器已经在运行，直接用浏览器打开 http://localhost:8642 即可。"
  read -n 1 -s -r -p "按任意键关闭..."
}
