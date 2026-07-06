#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""扫描 audio/imports/ 下各乐器文件夹，生成/更新 manifest.json。
macOS / Windows 通用，由根目录的“更新音频清单.command / .bat”调用，
也可以直接：python3 tools/update_manifest.py
"""
import json
import os

EXTS = {'.wav', '.wave', '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.opus',
        '.aif', '.aiff', '.caf', '.webm', '.mp4'}


def main():
    project_root = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    root = os.path.join(project_root, 'audio', 'imports')
    if not os.path.isdir(root):
        print('找不到目录: %s' % root)
        return 1

    manifest = {}
    for d in sorted(os.listdir(root)):
        p = os.path.join(root, d)
        if not os.path.isdir(p):
            continue
        files = sorted(
            f for f in os.listdir(p)
            if not f.startswith('.') and os.path.splitext(f)[1].lower() in EXTS
        )
        manifest[d] = files

    out = os.path.join(root, 'manifest.json')
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)

    print('manifest.json 已更新：')
    for k, v in manifest.items():
        print('  %s: %d 个文件' % (k, len(v)))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
