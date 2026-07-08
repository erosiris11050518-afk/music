#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the static publish artifact for CDN hosting.

The source project stays as plain HTML/CSS/JS/assets. This script only refreshes
the audio manifest and copies deployable files into dist/.
"""
import os
import re
import shutil
import sys

import update_manifest


ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
DIST = os.path.join(ROOT, 'dist')
PUBLISH_ITEMS = ('index.html', 'mix-export.html', 'assets', 'audio', 'libs', 'signalpath')
IGNORE_NAMES = {
    '.DS_Store',
    '__MACOSX',
    'Thumbs.db',
    'desktop.ini',
}
ABSOLUTE_PATH_PATTERNS = (
    re.compile(r'''(?:src|href)\s*=\s*["']/(?!/)''', re.I),
    re.compile(r'''fetch\s*\(\s*["']/(?!/)''', re.I),
    re.compile(r'''url\s*\(\s*["']?/(?!/)''', re.I),
)


def fail(message):
    print('[build] ERROR: %s' % message, file=sys.stderr)
    return 1


def validate_html_assets():
    html_files = [name for name in PUBLISH_ITEMS if name.endswith('.html')]
    for name in html_files:
        path = os.path.join(ROOT, name)
        if not os.path.isfile(path):
            return fail('%s not found' % name)

        with open(path, 'r', encoding='utf-8') as fh:
            html = fh.read()

        for pattern in ABSOLUTE_PATH_PATTERNS:
            match = pattern.search(html)
            if match:
                return fail('%s has absolute root asset path near: %r' % (name, html[match.start():match.start() + 80]))

    return 0


def ignore(_dir, names):
    return [name for name in names if name in IGNORE_NAMES]


def copy_item(name):
    src = os.path.join(ROOT, name)
    dst = os.path.join(DIST, name)
    if not os.path.exists(src):
        return fail('%s not found' % name)
    if os.path.isdir(src):
        shutil.copytree(src, dst, ignore=ignore)
    else:
        shutil.copy2(src, dst)
    return 0


def main():
    rc = update_manifest.main()
    if rc:
        return rc

    rc = validate_html_assets()
    if rc:
        return rc

    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST, exist_ok=True)

    for item in PUBLISH_ITEMS:
        rc = copy_item(item)
        if rc:
            return rc

    open(os.path.join(DIST, '.nojekyll'), 'w', encoding='utf-8').close()

    print('[build] Static artifact ready: %s' % DIST)
    print('[build] Publish root contains: %s' % ', '.join(PUBLISH_ITEMS))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
