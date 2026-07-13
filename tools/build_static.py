#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the static publish artifact for CDN hosting.

The source project stays as plain HTML/CSS/JS/assets. This script only refreshes
the audio manifest and copies deployable files into dist/.
"""
import datetime
import os
import re
import shutil
import subprocess
import sys

import update_manifest


ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
DIST = os.path.join(ROOT, 'dist')
PUBLISH_ITEMS = (
    'index.html', 'mix-export.html', 'spongebob.html', 'assets', 'audio', 'libs',
    'ErosIris-Link', 'aurora-room', 'signalpath',
)
IGNORE_NAMES = {
    '.DS_Store',
    '__MACOSX',
    'Thumbs.db',
    'desktop.ini',
}

# Files that MUST exist in dist after a build. If any is missing the build fails
# loudly instead of publishing a broken Pages artifact (repo has file but the
# uploaded artifact does not). Paths are relative to dist/.
REQUIRED_AFTER_BUILD = (
    'index.html',
    'spongebob.html',
    'ErosIris-Link/index.html',
    'ErosIris-Link/点我打开ErosIris-Link软件.html',
    'ErosIris-Link/assets/brand/logo-title.png',
    'ErosIris-Link/css/style.css',
    'ErosIris-Link/js/main.js',
    'aurora-room/index.html',
    'signalpath/index.html',
)

# HTML files whose local css/js/asset references get an auto cache-busting ?v=
# appended at build time (dist only; source stays clean). This makes every push
# serve fresh files instead of a browser-cached old copy — no manual edits ever.
CACHE_BUST_HTML = (
    'ErosIris-Link/点我打开ErosIris-Link软件.html',
    'ErosIris-Link/welcome-reverse-prototype/index.html',
)
CACHE_BUST_EXT = ('css', 'js', 'png', 'svg', 'jpg', 'jpeg', 'webp', 'gif', 'ico')

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


def compute_version():
    """Build version tag YYYYMMDD-<shortsha>, e.g. 20260709-1b702cd.

    Uses GITHUB_SHA in CI, falls back to local git, then to 'dev'. Every push
    yields a new tag, so appended ?v= query strings bust caches automatically.
    """
    sha = os.environ.get('GITHUB_SHA', '')
    if not sha:
        try:
            sha = subprocess.check_output(
                ['git', 'rev-parse', 'HEAD'], cwd=ROOT
            ).decode('utf-8', 'ignore').strip()
        except Exception:
            sha = ''
    short = sha[:7] if sha else 'dev'
    date = datetime.datetime.utcnow().strftime('%Y%m%d')
    return '%s-%s' % (date, short)


def verify_required():
    missing = [rel for rel in REQUIRED_AFTER_BUILD
               if not os.path.isfile(os.path.join(DIST, *rel.split('/')))]
    if missing:
        return fail('required file(s) missing from dist after build: %s'
                    % ', '.join(missing))
    return 0


def apply_cache_busting(version):
    """Append ?v=<version> to local css/js/asset refs in the given dist HTML.

    Only rewrites relative local URLs ending in a known asset extension; leaves
    absolute/protocol/data:/anchor URLs and anything already carrying ?v= alone.
    """
    ext_alt = '|'.join(CACHE_BUST_EXT)
    # src="..." / href="..." (double or single quoted)
    attr_re = re.compile(
        r'''((?:src|href)\s*=\s*)(["'])([^"'?#]+?\.(?:%s))(["'])''' % ext_alt, re.I)
    # inline JS fallback like  this.src='assets/brand/logo-title.svg'
    js_re = re.compile(
        r'''((?:\.src\s*=\s*)|(?:=\s*))(["'])([^"'?#]+?\.(?:%s))(["'])''' % ext_alt, re.I)

    def is_local(url):
        return not re.match(r'(?:[a-z]+:)?//|data:|#|mailto:', url, re.I) \
            and not url.startswith('/')

    def bust(m):
        pre, q1, url, q2 = m.group(1), m.group(2), m.group(3), m.group(4)
        if not is_local(url):
            return m.group(0)
        return '%s%s%s?v=%s%s' % (pre, q1, url, version, q2)

    for rel in CACHE_BUST_HTML:
        path = os.path.join(DIST, *rel.split('/'))
        if not os.path.isfile(path):
            continue
        with open(path, 'r', encoding='utf-8') as fh:
            html = fh.read()
        html = attr_re.sub(bust, html)
        html = js_re.sub(bust, html)
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(html)
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

    version = compute_version()
    apply_cache_busting(version)

    rc = verify_required()
    if rc:
        return rc

    open(os.path.join(DIST, '.nojekyll'), 'w', encoding='utf-8').close()

    print('[build] Static artifact ready: %s' % DIST)
    print('[build] Publish root contains: %s' % ', '.join(PUBLISH_ITEMS))
    print('[build] Cache-bust version: %s' % version)
    print('[build] Required files verified: %s' % ', '.join(REQUIRED_AFTER_BUILD))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
