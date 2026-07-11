#!/bin/bash
# 用 JavaScriptCore 做纯语法检查：Function 构造器只解析不执行
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
for f in "$@"; do
  out=$("$JSC" -e "
    var src = readFile('$f');
    try { new Function(src); print('OK $f'); }
    catch (e) { print('FAIL $f: ' + e.message); }
  " 2>&1)
  echo "$out"
done
