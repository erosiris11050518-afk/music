#!/bin/bash
# 双击运行：扫描 audio/imports/ 下各乐器文件夹，生成/更新 manifest.json。
# 每次往 imports 里增删音频后运行一次即可（用目录列表型服务器如 python http.server 则可不用）。
# Windows 电脑请双击“更新音频清单.bat”。
cd "$(dirname "$0")"
python3 tools/update_manifest.py
echo
echo "完成。可以关闭本窗口。"
