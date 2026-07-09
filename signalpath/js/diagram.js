/* ============================================================
   diagram.js — SVG 框图自动排版 + 手动拖动微调 + 高清导出
   v2：彩色类型标签 + 大号设备名 / 桥接输出对合并 /
       以锚点为中心的缩放（滑杆=视口中心，滚轮=鼠标位置）
   ============================================================ */

(function () {
  var Store = SP.Store;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* 内嵌样式：保证单独导出的 SVG/PNG 与页面显示一致（随明暗主题切换） */
  var SANS = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  var MONO = '"SF Mono",Menlo,Consolas,monospace';

  function isLightTheme() {
    return document.documentElement &&
      document.documentElement.getAttribute &&
      document.documentElement.getAttribute('data-theme') === 'light';
  }

  /* 框图主题色板：dark = 石墨深底，light = 纸白底 */
  function diagramTheme() {
    return isLightTheme() ? {
      nodeFill: '#ffffff', nodeStroke: '#aeb7c2',
      speakerFill: '#f2f9f5',
      title: '#11161c', dim: '#4f5966', faint: '#76818e',
      tick: '#9aa4b0', implicit: '#c4cad2', bg: '#f5f6f8', red: '#c94f3f',
      chipTx: '#ffffff', sel: '#c47f16', plug: '#2a2f36'
    } : {
      nodeFill: '#1a2028', nodeStroke: '#53606e',
      speakerFill: '#17231f',
      title: '#f8fafc', dim: '#aeb8c4', faint: '#7d8996',
      tick: '#4a5560', implicit: '#3a4450', bg: '#0f1318', red: '#e0604f',
      chipTx: '#0f1318', sel: '#eda63d', plug: '#c9d0d9'
    };
  }

  SP.diagramTheme = diagramTheme;   /* 供接线教学页取主题色 */

  /* CJK 感知的 SVG 文本宽度估算 / 按像素宽裁剪（中文全宽、西文约 0.58 倍） */
  SP.svgTextW = function (str, size) {
    str = String(str || '');
    var w = 0;
    for (var i = 0; i < str.length; i++) w += str.charCodeAt(i) > 255 ? size : size * 0.58;
    return w;
  };
  SP.clipSvgText = function (str, size, maxW) {
    str = String(str || '');
    if (SP.svgTextW(str, size) <= maxW) return str;
    var w = 0, out = '';
    for (var i = 0; i < str.length; i++) {
      var cw = str.charCodeAt(i) > 255 ? size : size * 0.58;
      if (w + cw > maxW - size) break;
      out += str[i];
      w += cw;
    }
    return out + '…';
  };

  function svgStyle() {
    var t = diagramTheme();
    return '<style>' +
      '.node-box{fill:' + t.nodeFill + ';stroke:' + t.nodeStroke + ';stroke-width:1.25}' +
      '.node-box.speaker-node{fill:' + t.speakerFill + ';stroke-width:1.8}' +
      '[data-node].sel .node-box{stroke:' + t.sel + ';stroke-width:2.2}' +
      '.speaker-glow{fill:none;stroke:#4fbf8b;stroke-width:1;opacity:.4}' +
      '.node-title{fill:' + t.title + ';font:800 14px ' + SANS + ';letter-spacing:0}' +
      '.node-spec{fill:' + t.dim + ';font:10px ' + MONO + '}' +
      '.chip-tx{font:800 9.5px ' + SANS + ';letter-spacing:.08em}' +
      '.port-num{fill:' + t.faint + ';font:600 10.5px ' + MONO + '}' +
      '.port-num.linked{fill:' + t.dim + '}' +
      '.port-hit{fill:transparent;stroke:transparent;cursor:crosshair}' +
      '.manual-source .port-num{fill:#eda63d;font-weight:700}' +
      '.manual-source .port-hit{stroke:#eda63d;stroke-width:1;fill:rgba(237,166,61,.12)}' +
      '.node-smart-bg{fill:rgba(237,166,61,.15);stroke:#eda63d;stroke-width:.8}' +
      '.node-smart{fill:#eda63d;font:700 8.5px ' + SANS + '}' +
      '.wire-preview{stroke:#eda63d;stroke-dasharray:6 5;fill:none;stroke-width:1.6;pointer-events:none}' +
      '.edge{fill:none;opacity:.82}' +
      '.edge.warn{stroke-dasharray:5 3}' +
      '.edge.parallel-chain{stroke-dasharray:7 3;opacity:.95}' +
      '.parallel-badge-bg{fill:rgba(79,191,139,.16);stroke:#4fbf8b;stroke-width:.8}' +
      '.parallel-badge{fill:#4fbf8b;font:700 8.5px ' + SANS + '}' +
      '.mx-node{fill:' + t.nodeFill + ';stroke:' + t.nodeStroke + '}' +
      '.mx-node.st{stroke:#eda63d;stroke-width:1.4}' +
      '.mx-label{fill:' + t.dim + ';font:9px ' + MONO + '}' +
      '.mx-label.st{fill:#eda63d}' +
      '.mx-coltitle{fill:' + t.faint + ';font:700 10px ' + SANS + ';letter-spacing:.12em}' +
      '.mx-edge{fill:none;stroke-width:1.3;opacity:.8}' +
      '.mx-edge.implicit{stroke:' + t.implicit + ';opacity:.9}' +
      '.mx-edge.to-bus{stroke:#6ba3c4}' +
      '.mx-edge.to-mtx{stroke:#a08fc0}' +
      '.mx-edge.to-main{stroke:#eda63d}' +
      '.mx-edge.to-out{stroke:#4fbf8b}' +
      '</style>';
  }

  /* 彩色类型/分支标签（chip），返回 svg 片段与占宽 */
  function contrastText(hex) {
    var m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    if (!m) return '#ffffff';
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#11161c' : '#ffffff';
  }
  function speakerRoleColor(d) {
    var role = d.speakerRole || 'fullrange';
    if (role === 'linearray') return '#e3c163';
    if (role === 'sub') return '#e0604f';
    return '#35c783';
  }
  function categoryLabel(d, info) {
    if (d.type !== 'speaker') return info.name;
    var label = SP.speakerRoleInfo(d.speakerRole).name;
    return Store.speakerPowered(d) ? '有源' + label : label;
  }
  function chipSvg(x, y, label, color) {
    var w = Math.round(SP.svgTextW(label, 9.5)) + 18;
    var tx = contrastText(color);
    var svg = '<rect x="' + x + '" y="' + y + '" width="' + w +
      '" height="18" rx="5" fill="' + color + '" stroke="' + tx + '" stroke-opacity=".22"/>' +
      '<text class="chip-tx" fill="' + tx + '" x="' + (x + w / 2) + '" y="' + (y + 12.5) +
      '" text-anchor="middle">' + esc(label) + '</text>';
    return { w: w, svg: svg };
  }

  /* ================= 设备连线框图 ================= */

  /* 分台视图：'all' = 整体；否则为调音台 id，只显示该台及其下游可达设备 */
  SP.diagramScope = SP.diagramScope || 'all';

  SP.renderWiringDiagram = function (container) {
    var stAll = Store.state;
    if (!stAll.devices.length) {
      container.innerHTML = '<div class="empty-hint big">还没有设备。<br>' +
        '按 <kbd>⌃1</kbd> 或 <kbd>⌘K</kbd> 打开快速布局，输入 5 个数字即可搭好系统。</div>';
      return;
    }
    /* 作用域过滤后的只读视图（分台模式）；写操作仍走 Store */
    var st = stAll;
    var scopeId = SP.diagramScope !== 'all' && Store.getDevice(SP.diagramScope)
      ? SP.diagramScope : null;
    if (scopeId) {
      var keep = {};
      keep[scopeId] = true;
      var grow = true;
      while (grow) {
        grow = false;
        stAll.connections.forEach(function (c) {
          if (keep[c.sid] && !keep[c.tid]) { keep[c.tid] = true; grow = true; }
        });
      }
      st = {
        devices: stAll.devices.filter(function (d) { return keep[d.id]; }),
        connections: stAll.connections.filter(function (c) { return keep[c.sid] && keep[c.tid]; }),
        diagramOrient: stAll.diagramOrient,
        diagramLayout: stAll.diagramLayout
      };
    }
    var horiz = st.diagramOrient === 'h';   /* 横版：信号从左到右；竖版：从上到下 */
    var speakerLinkParent = {};             /* 下游 link 音箱 -> 上游音箱 */
    var speakerLinkConns = [];
    function isSpeakerLinkConn(c) {
      var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
      return !!(s && t && s.type === 'speaker' && t.type === 'speaker');
    }
    st.connections.forEach(function (c) {
      if (!isSpeakerLinkConn(c)) return;
      speakerLinkConns.push(c);
      if (!speakerLinkParent[c.tid]) speakerLinkParent[c.tid] = c.sid;
    });
    var primaryConnections = st.connections.filter(function (c) { return !isSpeakerLinkConn(c); });

    /* --- 分层：按类型给初始层，再依据连线关系松弛，保证信号沿主方向流动。
       音箱之间的 link 不参与全局分层，下游音箱稍后跟随上游音箱摆放。 */
    var typeLayer = { mixer: 0, dsp: 1, amp: 2 };
    var layer = {};
    st.devices.forEach(function (d) {
      if (d.type === 'speaker') layer[d.id] = 3;
      else layer[d.id] = (typeLayer[d.type] !== undefined) ? typeLayer[d.type] : 1;
    });
    for (var it = 0; it < st.devices.length + 2; it++) {
      var changed = false;
      primaryConnections.forEach(function (c) {
        if (layer[c.sid] === undefined || layer[c.tid] === undefined) return;
        if (layer[c.tid] <= layer[c.sid]) { layer[c.tid] = layer[c.sid] + 1; changed = true; }
      });
      if (!changed) break;
    }

    var mainDevices = st.devices.filter(function (d) { return !speakerLinkParent[d.id]; });
    if (!mainDevices.length) mainDevices = st.devices.slice();
    var used = [];
    mainDevices.forEach(function (d) {
      if (used.indexOf(layer[d.id]) < 0) used.push(layer[d.id]);
    });
    used.sort(function (a, b) { return a - b; });
    function spkOrd(d) {
      if (d.type !== 'speaker') return -1;   /* 非音箱保持机架原序在前 */
      var roleO = { linearray: 0, fullrange: 1, sub: 2 };
      return (Store.speakerPowered(d) ? 10 : 0) + (roleO[d.speakerRole || 'fullrange'] || 1);
    }
    var lanes = used.map(function (l) {
      return mainDevices
        .map(function (d, i) { return { d: d, i: i }; })
        .filter(function (x) { return layer[x.d.id] === l; })
        .sort(function (a, b) { return spkOrd(a.d) - spkOrd(b.d) || a.i - b.i; })
        .map(function (x) { return x.d; });
    });

    /* --- 尺寸参数 --- */
    var portSp = 24, margin = 42;
    var gapMain = horiz ? 150 : 140;   /* 沿信号方向的层间距 */
    var gapCross = horiz ? 40 : 56;    /* 同层设备间距 */

    function visOuts(d) { return Store.visibleOuts(d); }

    function headBand(d) {
      /* 横版竖框的顶部文字区：标签行 + 名称 + 规格 */
      return 48 + (SP.specString(d) ? 15 : 0);
    }

    function nodeW(d) {
      if (horiz) {
        var spec = SP.specString(d);
        var need = Math.max(SP.svgTextW(d.name, 14), SP.svgTextW(spec, 10)) + 52;
        var base = Math.max(d.collapsed ? 176 : 160, need);
        return Math.min(340, base);
      }
      if (d.collapsed) return d.type === 'speaker' ? 200 : 184;
      var nPorts = Math.max(d.inputs.length, visOuts(d).length, 1);
      var spec2 = SP.specString(d);
      var textNeed = Math.max(SP.svgTextW(d.name, 14), SP.svgTextW(spec2, 10)) + 86;
      var minW = d.type === 'speaker' ? 236 : 190;
      return Math.min(460, Math.max(minW, nPorts * portSp + 40, textNeed));
    }

    function nodeH(d) {
      if (horiz) {
        var head = headBand(d);
        if (d.collapsed) return head + 20;
        var nPorts = Math.max(d.inputs.length, visOuts(d).length, 1);
        return Math.max(head + nPorts * 20 + 14, head + 34);
      }
      if (d.collapsed) return 66;
      return SP.specString(d) ? 98 : 86;
    }

    /* 主方向厚度 / 交叉方向长度（竖版：厚=高、长=宽；横版：厚=宽、长=高） */
    function thickOf(d) { return horiz ? nodeW(d) : nodeH(d); }
    function crossOf(d) { return horiz ? nodeH(d) : nodeW(d); }

    var laneThick = lanes.map(function (lane) {
      var t = 0;
      lane.forEach(function (d) { t = Math.max(t, thickOf(d)); });
      return t;
    });
    var laneCross = lanes.map(function (lane) {
      var c = 0;
      lane.forEach(function (d) { c += crossOf(d) + gapCross; });
      return c - gapCross;
    });
    var maxCross = Math.max.apply(null, laneCross);
    var lanePos = [];
    var mainCursor = margin;
    laneThick.forEach(function (t) {
      lanePos.push(mainCursor);
      mainCursor += t + gapMain;
    });

    var pos = {};
    function setPos(d, mainP, crossP) {
      pos[d.id] = horiz
        ? { x: mainP, y: crossP, w: nodeW(d), h: nodeH(d) }
        : { x: crossP, y: mainP, w: nodeW(d), h: nodeH(d) };
    }
    function crossCenter(id) {
      var p = pos[id];
      return horiz ? p.y + p.h / 2 : p.x + p.w / 2;
    }
    function applyManual(lane) {
      lane.forEach(function (d) {
        if (!pos[d.id]) return;
        if (d.px !== undefined && d.px !== null) pos[d.id].x = d.px;
        if (d.py !== undefined && d.py !== null) pos[d.id].y = d.py;
      });
    }

    /* 对齐上级：按层顺序居中排列。
       12：层内用重心法（按上级连线的平均中心）排序减少交叉，
       但保持音箱的角色分组（全频→超低→有源）不被打乱。 */
    function placeAlignUp() {
      lanes.forEach(function (lane, li) {
        var order = lane;
        if (li > 0) {
          order = lane.map(function (d, i) {
            var centers = [];
            primaryConnections.forEach(function (c) {
              if (c.tid === d.id && pos[c.sid]) centers.push(crossCenter(c.sid));
            });
            var bc = centers.length
              ? centers.reduce(function (a, b) { return a + b; }, 0) / centers.length
              : null;
            return { d: d, i: i, bc: bc };
          }).sort(function (a, b) {
            var ga = spkOrd(a.d), gb = spkOrd(b.d);
            if (ga !== gb) return ga - gb;
            var ka = a.bc === null ? Infinity : a.bc;
            var kb = b.bc === null ? Infinity : b.bc;
            if (ka !== kb) return ka - kb;
            return a.i - b.i;
          }).map(function (x) { return x.d; });
        }
        var cross = margin + (maxCross - laneCross[li]) / 2;
        order.forEach(function (d) {
          setPos(d, lanePos[li], cross);
          cross += crossOf(d) + gapCross;
        });
        applyManual(lane);
      });
    }

    /* 同层间连线交叉计数（顺序反转即交叉），用于自动挑对齐方式 */
    function countCrossings() {
      var edges = [];
      primaryConnections.forEach(function (c) {
        if (!pos[c.sid] || !pos[c.tid]) return;
        edges.push({ s: crossCenter(c.sid), t: crossCenter(c.tid),
          ls: layer[c.sid], lt: layer[c.tid] });
      });
      var n = 0;
      for (var i = 0; i < edges.length; i++) {
        for (var j = i + 1; j < edges.length; j++) {
          var a = edges[i], b = edges[j];
          if (a.ls !== b.ls || a.lt !== b.lt) continue;
          if ((a.s - b.s) * (a.t - b.t) < 0) n++;
        }
      }
      return n;
    }
    /* 对齐下级：从末层往回，尽量对准各自下游设备的中心 */
    function placeAlignDown() {
      for (var li = lanes.length - 1; li >= 0; li--) {
        var lane = lanes[li];
        var cursor = margin + (maxCross - laneCross[li]) / 2;
        var items = lane.map(function (d) {
          var centers = [];
          primaryConnections.forEach(function (c) {
            if (c.sid === d.id && pos[c.tid]) centers.push(crossCenter(c.tid));
          });
          var desired;
          if (centers.length) {
            desired = centers.reduce(function (a, b) { return a + b; }, 0) / centers.length;
          } else {
            desired = cursor + crossOf(d) / 2;
          }
          cursor += crossOf(d) + gapCross;
          return { dev: d, size: crossOf(d), desired: desired };
        }).sort(function (a, b) { return a.desired - b.desired; });

        var prevEnd = margin - gapCross;
        items.forEach(function (itx) {
          var c2 = Math.max(margin, itx.desired - itx.size / 2, prevEnd + gapCross);
          setPos(itx.dev, lanePos[li], c2);
          prevEnd = c2 + itx.size;
        });
        applyManual(lane);
      }
    }
    if (st.diagramLayout === 'bottomup') {
      placeAlignDown();
    } else if (st.diagramLayout === 'smart') {
      /* 12：智能模式（快速布局后默认）——上/下两种对齐都算一遍，取交叉更少的 */
      placeAlignUp();
      var upCross = countCrossings();
      var upPos = JSON.parse(JSON.stringify(pos));
      placeAlignDown();
      if (countCrossings() > upCross) pos = upPos;
    } else {
      placeAlignUp();
    }

    function portLocalCross(d, pi, isInput) {
      var count, rank;
      if (isInput) {
        count = Math.max(1, d.inputs.length);
        rank = Math.max(0, Math.min(count - 1, pi));
      } else {
        var vis = visOuts(d);
        count = Math.max(1, vis.length);
        rank = vis.indexOf(pi);
        if (rank < 0) rank = 0;
      }
      if (horiz) {
        var head = d.collapsed ? 0 : headBand(d);
        var h = nodeH(d);
        var zone0 = head + 4;
        var zoneH = h - head - 10;
        if (d.collapsed) { zone0 = 0; zoneH = h; }
        return zone0 + zoneH * (rank + 1) / (count + 1);
      }
      return nodeW(d) * (rank + 1) / (count + 1);
    }
    function portCrossFromPos(d, pi, isInput) {
      var p = pos[d.id];
      if (!p) return null;
      return (horiz ? p.y : p.x) + portLocalCross(d, pi, isInput);
    }
    function placeLinkedSpeakers() {
      if (!speakerLinkConns.length) return;
      var linkGap = horiz ? 46 : 42;
      for (var pass = 0; pass < st.devices.length; pass++) {
        speakerLinkConns.forEach(function (c) {
          var parent = Store.getDevice(c.sid), child = Store.getDevice(c.tid);
          if (!parent || !child || !pos[parent.id]) return;
          var pp = pos[parent.id];
          var childCross = portCrossFromPos(parent, c.sport, false) -
            portLocalCross(child, c.tport, true);
          if (horiz) {
            pos[child.id] = {
              x: pp.x + pp.w + linkGap,
              y: Math.max(margin, childCross),
              w: nodeW(child),
              h: nodeH(child)
            };
          } else {
            pos[child.id] = {
              x: Math.max(margin, childCross),
              y: pp.y + pp.h + linkGap,
              w: nodeW(child),
              h: nodeH(child)
            };
          }
        });
      }
    }
    placeLinkedSpeakers();

    /* 画布尺寸（随手动位置扩展） */
    var mainExtent = lanes.length ? lanePos[lanes.length - 1] + laneThick[lanes.length - 1] + margin : margin * 2;
    var crossExtent = margin * 2 + maxCross;
    var totalW = horiz ? mainExtent : crossExtent;
    var totalH = horiz ? crossExtent : mainExtent;
    st.devices.forEach(function (d) {
      var p = pos[d.id];
      if (!p) return;
      totalW = Math.max(totalW, p.x + p.w + margin);
      totalH = Math.max(totalH, p.y + p.h + margin);
    });

    /* 13：调音台/DSP → 有源音箱的信号线走画布外侧专用通道，
       不再穿越功放层与无源音箱（有源音箱本就排在最外）。 */
    function isActiveFeed(c) {
      var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
      return !!(s && t && (s.type === 'mixer' || s.type === 'dsp') &&
        t.type === 'speaker' && Store.speakerPowered(t));
    }
    var outerLane = 0;
    if (st.connections.some(isActiveFeed)) {
      if (horiz) { totalH += 76; outerLane = totalH - 46; }
      else { totalW += 76; outerLane = totalW - 46; }
    }

    /* 端口坐标：竖版在上/下边缘按宽度分布；横版在左/右边缘、文字区以下按高度分布。
       输出口只排可见端口（桥接对合并后奇数口隐藏）。 */
    function portPoint(id, pi, isInput) {
      var p = pos[id], d = Store.getDevice(id);
      var count, rank;
      if (isInput) {
        count = d.inputs.length;
        rank = pi;
      } else {
        var vis = visOuts(d);
        count = vis.length;
        rank = vis.indexOf(pi);
        if (rank < 0) rank = 0;
      }
      if (horiz) {
        var head = d.collapsed ? 0 : headBand(d);
        var zone0 = p.y + head + 4;
        var zoneH = p.h - head - 10;
        if (d.collapsed) { zone0 = p.y; zoneH = p.h; }
        return {
          x: isInput ? p.x : p.x + p.w,
          y: zone0 + zoneH * (rank + 1) / (count + 1)
        };
      }
      return {
        x: p.x + p.w * (rank + 1) / (count + 1),
        y: isInput ? p.y : p.y + p.h
      };
    }
    function inPoint(id, pi) { return portPoint(id, pi, true); }
    function outPoint(id, pi) { return portPoint(id, pi, false); }

    function edgePath(a, b) {
      if (horiz) {
        var dxx = Math.max(34, Math.abs(b.x - a.x) / 2);
        return 'M' + a.x + ' ' + a.y + ' C' + (a.x + dxx) + ' ' + a.y + ' ' +
          (b.x - dxx) + ' ' + b.y + ' ' + b.x + ' ' + b.y;
      }
      var dy = Math.max(34, Math.abs(b.y - a.y) / 2);
      return 'M' + a.x + ' ' + a.y + ' C' + a.x + ' ' + (a.y + dy) + ' ' +
        b.x + ' ' + (b.y - dy) + ' ' + b.x + ' ' + b.y;
    }

    /* 有源音箱专用外侧走线：出口 → 外侧通道 → 目标 */
    function outerEdgePath(a, b) {
      if (horiz) {
        var midX = (a.x + b.x) / 2;
        return 'M' + a.x + ' ' + a.y +
          ' C' + (a.x + 46) + ' ' + a.y + ' ' + midX + ' ' + outerLane + ' ' + midX + ' ' + outerLane +
          ' C' + midX + ' ' + outerLane + ' ' + (b.x - 46) + ' ' + b.y + ' ' + b.x + ' ' + b.y;
      }
      var midY = (a.y + b.y) / 2;
      return 'M' + a.x + ' ' + a.y +
        ' C' + a.x + ' ' + (a.y + 46) + ' ' + outerLane + ' ' + midY + ' ' + outerLane + ' ' + midY +
        ' C' + outerLane + ' ' + midY + ' ' + b.x + ' ' + (b.y - 46) + ' ' + b.x + ' ' + b.y;
    }

    var theme = diagramTheme();
    var tickColor = theme.tick;
    var svg = [];
    svg.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + totalW + '" height="' + totalH +
      '" viewBox="0 0 ' + totalW + ' ' + totalH + '" style="touch-action:none">');
    svg.push(svgStyle());
    svg.push('<defs>' +
      '<filter id="node-shadow" x="-18%" y="-24%" width="136%" height="158%">' +
      '<feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000000" flood-opacity=".24"/>' +
      '</filter>' +
      '<marker id="arrow-signal" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">' +
      '<path d="M0,0 L8,4 L0,8 Z" fill="context-stroke"/></marker>' +
      '<marker id="arrow-speaker" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="8" markerHeight="8" orient="auto">' +
      '<path d="M0,0 L12,6 L0,12 Z" fill="context-stroke"/></marker>' +
      '</defs>');

    /* --- 连线 ---
       信号线：细弱曲线 + 两端小圆点（卡农/Line 级）
       音响线：中粗曲线 + 两端插头块（SpeakON 卡口造型），一眼区分 --- */
    function plugRect(pt, atStart) {
      /* 插头块沿信号方向：竖版端点切线朝下，横版朝右 */
      var pl = theme.plug;
      if (horiz) {
        var x0 = atStart ? pt.x : pt.x - 11;
        return '<rect x="' + x0 + '" y="' + (pt.y - 3.5) + '" width="11" height="7" rx="2" fill="' + pl + '"/>' +
          '<rect x="' + (atStart ? pt.x + 8 : pt.x - 13) + '" y="' + (pt.y - 2.2) +
          '" width="2.4" height="4.4" rx="1" fill="' + pl + '" opacity=".55"/>';
      }
      var y0 = atStart ? pt.y : pt.y - 11;
      return '<rect x="' + (pt.x - 3.5) + '" y="' + y0 + '" width="7" height="11" rx="2" fill="' + pl + '"/>' +
        '<rect x="' + (pt.x - 2.2) + '" y="' + (atStart ? pt.y + 8 : pt.y - 13) +
        '" width="4.4" height="2.4" rx="1" fill="' + pl + '" opacity=".55"/>';
    }
    st.connections.forEach(function (c) {
      if (!pos[c.sid] || !pos[c.tid]) return;
      var a = outPoint(c.sid, c.sport), b = inPoint(c.tid, c.tport);
      var warn = Store.connWarning(c);
      var color = warn ? theme.red : Store.colorOf(c);
      var speakerRun = Store.isSpeakerRun(c);
      var parallelChain = !!c.reverseParallel;
      var title = '<title>' + esc(Store.cableOf(c)) + (c.lenM ? ' · ' + esc(c.lenM) + 'm' : '') +
        (c.note ? ' · ' + esc(c.note) : '') +
        (parallelChain ? ' · 反推受控并联串接' : '') +
        (warn ? ' ⚠ ' + warn : '') + '</title>';
      if (speakerRun) {
        svg.push('<path class="edge' + (warn ? ' warn' : '') + (parallelChain ? ' parallel-chain' : '') +
          '" stroke="' + color +
          '" stroke-width="2.2" d="' + edgePath(a, b) + '">' + title + '</path>');
        svg.push(plugRect(a, true));
        svg.push(plugRect(b, false));
      } else {
        var d2 = (outerLane && isActiveFeed(c)) ? outerEdgePath(a, b) : edgePath(a, b);
        svg.push('<path class="edge' + (warn ? ' warn' : '') + '" stroke="' + color +
          '" stroke-width="1.4" marker-end="url(#arrow-signal)" d="' + d2 + '">' + title + '</path>');
        svg.push('<circle class="edge-dot" fill="' + color + '" cx="' + a.x + '" cy="' + a.y + '" r="2.4"/>');
        svg.push('<circle class="edge-dot" fill="' + color + '" cx="' + b.x + '" cy="' + b.y + '" r="2.6"/>');
      }
    });

    /* --- 节点 --- */
    st.devices.forEach(function (d) {
      var p = pos[d.id];
      var info = Store.typeInfo(d.type);
      var color = d.color || SP.typeColor(d.type);
      var isSpeaker = d.type === 'speaker';
      var img = SP.Images.get(d.imgId);
      var spec = SP.specString(d);
      var sel = SP.selectedDeviceId === d.id ? ' class="sel"' : '';
      svg.push('<g data-node="' + d.id + '"' + sel + ' style="cursor:grab">');
      if (isSpeaker) {
        svg.push('<rect class="speaker-glow" x="' + (p.x - 4) + '" y="' + (p.y - 4) + '" width="' + (p.w + 8) +
          '" height="' + (p.h + 8) + '" rx="9"/>');
      }
      svg.push('<rect class="node-box' + (isSpeaker ? ' speaker-node' : '') + '" x="' + p.x + '" y="' + p.y + '" width="' + p.w +
        '" height="' + p.h + '" rx="' + (isSpeaker ? 8 : 6) + '" filter="url(#node-shadow)"' +
        (isSpeaker ? ' style="stroke:' + speakerRoleColor(d) + '"' : '') + '/>');

      /* 14：功率/信号警示角标（hover 看原因），与设备栏 ⚠ 同步 */
      var warnMsg = '';
      st.connections.forEach(function (c) {
        if (warnMsg || (c.sid !== d.id && c.tid !== d.id)) return;
        var w = Store.connWarning(c);
        if (w) warnMsg = w;
      });
      if (warnMsg) {
        svg.push('<g data-warn="' + d.id + '" style="cursor:pointer">' +
          '<circle cx="' + (p.x + p.w - 2) + '" cy="' + (p.y + 2) +
          '" r="8" fill="' + theme.red + '"/>' +
          '<text x="' + (p.x + p.w - 2) + '" y="' + (p.y + 5.5) +
          '" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="700">!</text>' +
          '<title>点击查看报警详情</title></g>');
      }

      /* 类型/分支标签：居中高对比显示，音箱直接显示全频/超低/线阵等角色 */
      function drawChips(cx, cy) {
        var chipColor = isSpeaker ? speakerRoleColor(d) : color;
        var label = categoryLabel(d, info);
        var c1 = chipSvg(0, cy, label, chipColor);
        c1 = chipSvg(cx - c1.w / 2, cy, label, chipColor);
        svg.push(c1.svg);
      }
      function drawParallelBadge(x, y) {
        var rp = d.reverseParallel;
        if (!rp || !rp.locked) return;
        var tx = '并联×' + (rp.parallel || 1) + ' ' + (rp.index || 1) + '/' + (rp.groupSize || rp.parallel || 1);
        svg.push('<rect class="parallel-badge-bg" x="' + x + '" y="' + y +
          '" width="74" height="15" rx="3"/>');
        svg.push('<text class="parallel-badge" x="' + (x + 37) + '" y="' + (y + 10.5) +
          '" text-anchor="middle">' + esc(tx) + '</text>');
      }

      if (horiz) {
        /* 横版竖框：顶部色条 + 标签行 + 居中名称，端口沿左右边缘 */
        svg.push('<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w +
          '" height="3" rx="1.5" fill="' + (isSpeaker ? speakerRoleColor(d) : color) + '"/>');
        var cx = p.x + p.w / 2;
        var availW = p.w - 20;
        drawChips(cx, p.y + 8);
        if (img) {
          svg.push('<image href="' + img + '" x="' + (p.x + p.w - 30) + '" y="' + (p.y + 7) +
            '" width="22" height="22" preserveAspectRatio="xMidYMid slice" clip-path="inset(0 round 4px)"/>');
        }
        svg.push('<text class="node-title" text-anchor="middle" x="' + cx + '" y="' + (p.y + 43) + '">' +
          esc(SP.clipSvgText(d.name, 14, availW)) + '<title>' + esc(d.name) + '</title></text>');
        if (spec) {
          svg.push('<text class="node-spec" text-anchor="middle" x="' + cx + '" y="' + (p.y + 58) + '">' +
            esc(SP.clipSvgText(spec, 10, availW)) + '<title>' + esc(spec) + '</title></text>');
        }
        var smartH = Store.smartAssignPreview(d.id);
        if (smartH.count) {
          var hbx = p.x + (p.w - 66) / 2, hby = p.y + p.h - 20;
          svg.push('<rect class="node-smart-bg" x="' + hbx + '" y="' + hby + '" width="66" height="15" rx="3"/>');
          svg.push('<text class="node-smart" x="' + (hbx + 33) + '" y="' + (hby + 10.5) +
            '" text-anchor="middle">智能 ' + smartH.count + '</text>');
        }
        drawParallelBadge(p.x + (p.w - 74) / 2, p.y + p.h - (smartH.count ? 38 : 20));
      } else {
        /* 竖版横框：左侧色条 + 标签行 + 大号名称，端口沿上下边缘 */
        var sideColor = isSpeaker ? speakerRoleColor(d) : color;
        svg.push('<rect x="' + p.x + '" y="' + p.y + '" width="5" height="' + p.h +
          '" rx="2.5" fill="' + sideColor + '"/>');
        var centerX = p.x + p.w / 2;
        drawChips(centerX, p.y + 18);
        if (img) {
          svg.push('<image href="' + img + '" x="' + (p.x + p.w - 42) + '" y="' + (p.y + 18) +
            '" width="28" height="28" preserveAspectRatio="xMidYMid slice" clip-path="inset(0 round 5px)"/>');
        }
        var availW2 = p.w - 40 - (img ? 28 : 0);
        svg.push('<text class="node-title" text-anchor="middle" x="' + centerX + '" y="' + (p.y + 55) + '">' +
          esc(SP.clipSvgText(d.name, 14, availW2)) + '<title>' + esc(d.name) + '</title></text>');
        if (spec && !d.collapsed) {
          svg.push('<text class="node-spec" text-anchor="middle" x="' + centerX + '" y="' + (p.y + 70) + '">' +
            esc(SP.clipSvgText(spec, 10, availW2)) + '<title>' + esc(spec) + '</title></text>');
        }
        var smart = Store.smartAssignPreview(d.id);
        if (smart.count) {
          var bx = p.x + p.w - 78, by = p.y + p.h - 21;
          svg.push('<rect class="node-smart-bg" x="' + bx + '" y="' + by + '" width="66" height="15" rx="3"/>');
          svg.push('<text class="node-smart" x="' + (bx + 33) + '" y="' + (by + 10.5) +
            '" text-anchor="middle">智能 ' + smart.count + '</text>');
        }
        drawParallelBadge(p.x + 12, p.y + p.h - 21);
      }

      /* 端口（两种版式共用数据，仅坐标/文字锚点不同） */
      if (!d.collapsed) {
        d.inputs.forEach(function (port, i) {
          var pt = inPoint(d.id, i);
          var isLinked = !!Store.sourceFor(d.id, i);
          var linked = isLinked ? ' linked' : '';
          var lbl = horiz
            ? '<text class="port-num' + linked + '" x="' + (pt.x + 8) + '" y="' + (pt.y + 4) + '">' + (i + 1) +
              '<title>' + esc(port.label) + '</title></text>'
            : '<text class="port-num' + linked + '" text-anchor="middle" x="' + pt.x +
              '" y="' + (pt.y + 15) + '">' + (i + 1) + '<title>' + esc(port.label) + '</title></text>';
          svg.push('<g data-in-device="' + d.id + '" data-in-port="' + i + '"><circle class="port-hit" cx="' + pt.x +
            '" cy="' + pt.y + '" r="11"/>' +
            '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="3" fill="' + (isLinked ? '#4fbf8b' : tickColor) + '"/>' + lbl + '</g>');
        });
        Store.visibleOuts(d).forEach(function (i) {
          var pt = outPoint(d.id, i);
          var isLinked = !!Store.consumersOf(d.id, i).length;
          var linked = isLinked ? ' linked' : '';
          var manual = SP.manualWire && SP.manualWire.sid === d.id && SP.manualWire.sport === i ? ' class="manual-source"' : '';
          var bridged = Store.outLabelOf(d, i) !== (d.outputs[i] || {}).label;
          var numTx = (i + 1) + (bridged ? 'B' : '');
          var lbl = horiz
            ? '<text class="port-num' + linked + '" text-anchor="end" x="' + (pt.x - 8) + '" y="' + (pt.y + 4) + '">' + numTx +
              '<title>' + esc(Store.outLabelOf(d, i)) + '</title></text>'
            : '<text class="port-num' + linked + '" text-anchor="middle" x="' + pt.x +
              '" y="' + (pt.y - 8) + '">' + numTx + '<title>' + esc(Store.outLabelOf(d, i)) + '</title></text>';
          svg.push('<g data-out-device="' + d.id + '" data-out-port="' + i + '"' + manual + '><circle class="port-hit" cx="' + pt.x +
            '" cy="' + pt.y + '" r="11"/>' +
            '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="' + (bridged ? 4 : 3) + '" fill="' + (isLinked ? '#4fbf8b' : tickColor) + '"/>' + lbl + '</g>');
        });
      }
      svg.push('</g>');
    });

    svg.push('</svg>');
    container.innerHTML = svg.join('');
    lastWiringContainer = container;
    /* 供「相对对齐」使用的本次排版快照 */
    SP._layout = {
      horiz: horiz,
      lanes: lanes.map(function (lane) { return lane.map(function (d) { return d.id; }); }),
      lanePos: lanePos,
      pos: pos
    };
    SP.applyDiagramZoom(container);
    applySelection(container);
    bindDrag(container);
    bindWheelZoom(container);
    bindBlankClick(container);
    setupManualPreview(container);
  };

  /* ================= 相对对齐：整层平移，保留层内相对排布 ================= */

  SP.relAlignLayout = function (mode, container) {
    var L = SP._layout;
    if (!L) return;
    var st = Store.state;
    function isSpeakerLinkConn(c) {
      var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
      return !!(s && t && s.type === 'speaker' && t.type === 'speaker');
    }
    var primaryConnections = st.connections.filter(function (c) { return !isSpeakerLinkConn(c); });
    function crossCenterOf(id) {
      var p = L.pos[id];
      return L.horiz ? p.y + p.h / 2 : p.x + p.w / 2;
    }
    /* 11：整层排整齐 —— 保持当前左右（上下）顺序不变，等间距排列，
       整组中心对齐到上级（或下级）连线的平均中心，主轴吸附回本层行。 */
    var gap = L.horiz ? 40 : 56;
    function crossSizeOf(id) {
      var p = L.pos[id];
      return L.horiz ? p.h : p.w;
    }
    function tidyLane(laneIds, li, useSources) {
      var ids = laneIds.filter(function (id) { return L.pos[id]; });
      if (!ids.length) return;
      /* 按当前中心排序 = 保留相对顺序 */
      ids.sort(function (a, b) { return crossCenterOf(a) - crossCenterOf(b); });
      var total = 0;
      ids.forEach(function (id) { total += crossSizeOf(id) + gap; });
      total -= gap;
      /* 目标组中心：上级/下级连线的平均中心；没有连线时保持当前组中心 */
      var centers = [];
      ids.forEach(function (id) {
        primaryConnections.forEach(function (c) {
          if (useSources && c.tid === id && L.pos[c.sid]) centers.push(crossCenterOf(c.sid));
          if (!useSources && c.sid === id && L.pos[c.tid]) centers.push(crossCenterOf(c.tid));
        });
      });
      var target;
      if (centers.length) {
        target = centers.reduce(function (a, b) { return a + b; }, 0) / centers.length;
      } else {
        var cur = ids.map(crossCenterOf);
        target = cur.reduce(function (a, b) { return a + b; }, 0) / cur.length;
      }
      var cursor = Math.max(8, target - total / 2);
      ids.forEach(function (id) {
        var d = Store.getDevice(id);
        var p = L.pos[id];
        if (!d || !p) { cursor += gap; return; }
        if (L.horiz) {
          d.py = Math.round(cursor);
          d.px = Math.round(L.lanePos[li]);
          p.y = cursor;
        } else {
          d.px = Math.round(cursor);
          d.py = Math.round(L.lanePos[li]);
          p.x = cursor;
        }
        cursor += crossSizeOf(id) + gap;
      });
    }
    if (mode === 'down') {
      for (var li = L.lanes.length - 1; li >= 0; li--) tidyLane(L.lanes[li], li, false);
    } else {
      for (var lj = 0; lj < L.lanes.length; lj++) tidyLane(L.lanes[lj], lj, lj > 0);
    }
    Store.save();
    SP.renderWiringDiagram(container);
  };

  /* 切换横版 / 竖版（清除手动拖动位置，按新方向重新自动排版） */
  SP.setDiagramOrient = function (o, container) {
    Store.state.diagramOrient = o === 'h' ? 'h' : 'v';
    Store.state.devices.forEach(function (d) { delete d.px; delete d.py; });
    Store.save();
    if (container) SP.renderWiringDiagram(container);
  };

  var lastWiringContainer = null;

  /* --- 选中设备 → 框图节点描边高亮（单选 + 框选多选） --- */
  SP.multiSelected = SP.multiSelected || [];
  function applySelection(container) {
    container.querySelectorAll('[data-node]').forEach(function (g) {
      if (!g.classList) return;
      var id = g.dataset.node;
      g.classList.toggle('sel', id === SP.selectedDeviceId || SP.multiSelected.indexOf(id) >= 0);
    });
  }
  SP.applyDiagramSelection = applySelection;

  /* ================= 缩放（锚点补偿，画面不漂移） ================= */

  SP.diagramZoom = (function () {
    var v = 100;
    try { v = +localStorage.getItem('signalpath-zoom') || 100; } catch (e) {}
    return Math.min(2, Math.max(0.1, v / 100));
  })();

  SP.applyDiagramZoom = function (container) {
    var svgEl = container.querySelector('svg');
    if (!svgEl || !svgEl.viewBox) return;
    var vb = svgEl.viewBox.baseVal;
    if (!vb || !vb.width) return;
    svgEl.setAttribute('width', Math.max(1, Math.round(vb.width * SP.diagramZoom)));
    svgEl.setAttribute('height', Math.max(1, Math.round(vb.height * SP.diagramZoom)));
  };

  SP.setDiagramZoom = function (z, container) {
    /* 下限 10%：保证特大系统的「全局视角」也能整图放下（滑杆手动范围仍为 25%-200%） */
    SP.diagramZoom = Math.min(2, Math.max(0.1, z));
    try { localStorage.setItem('signalpath-zoom', String(Math.round(SP.diagramZoom * 100))); } catch (e) {}
    if (container) SP.applyDiagramZoom(container);
  };

  /* 以锚点为中心缩放：缩放前后锚点对应的图内容坐标保持在同一屏幕位置。
     不传 clientX/Y 时锚点 = 容器视口中心（滑杆/按钮用），传了 = 鼠标位置（滚轮用）。 */
  SP.zoomAt = function (container, z, clientX, clientY) {
    var rect = container.getBoundingClientRect();
    var ax = clientX === undefined ? container.clientWidth / 2 : clientX - rect.left;
    var ay = clientY === undefined ? container.clientHeight / 2 : clientY - rect.top;
    var oldZ = SP.diagramZoom || 1;
    var cx = (container.scrollLeft + ax) / oldZ;
    var cy = (container.scrollTop + ay) / oldZ;
    SP.setDiagramZoom(z, container);
    var nz = SP.diagramZoom;
    container.scrollLeft = Math.max(0, cx * nz - ax);
    container.scrollTop = Math.max(0, cy * nz - ay);
    if (SP.syncZoomUI) SP.syncZoomUI();
  };

  /* 点击画布灰色空白区（SVG 之外）也取消选中 */
  function bindBlankClick(container) {
    if (container._spBlankBound) return;
    container._spBlankBound = true;
    container.addEventListener('click', function (e) {
      if (e.target !== container) return;
      if (SP.manualWire) {
        SP.manualWire = null;
        SP.renderWiringDiagram(container);
        return;
      }
      if (SP.selectedDeviceId || SP.multiSelected.length) {
        SP.multiSelected = [];
        if (SP.selectDevice) SP.selectDevice('', false);
      }
    });
  }

  /* Ctrl/Cmd + 滚轮（含触控板捏合）以鼠标位置为锚点缩放 */
  function bindWheelZoom(container) {
    if (container._spWheelBound) return;
    container._spWheelBound = true;
    container.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      var factor = Math.exp(-e.deltaY * 0.01);
      SP.zoomAt(container, (SP.diagramZoom || 1) * factor, e.clientX, e.clientY);
    }, { passive: false });
  }
  SP.bindWheelZoom = bindWheelZoom;

  /* 全局视角：宽和高同时放得下（横版/竖版都能一眼看全） */
  SP.fitDiagramZoom = function (container) {
    var svgEl = container.querySelector('svg');
    if (!svgEl || !svgEl.viewBox) return 1;
    var vb = svgEl.viewBox.baseVal;
    if (!vb || !vb.width || !vb.height) return 1;
    var availW = Math.max(120, (container.clientWidth || 0) - 18);
    var availH = Math.max(120, (container.clientHeight || 0) - 18);
    var ratio = Math.min(availW / vb.width, availH / vb.height);
    if (!isFinite(ratio) || ratio <= 0) return 1;
    return Math.min(2, Math.max(0.1, ratio));
  };

  /* 局部视角：自动选择合适倍率，瞬时把高亮设备放到视口正中。无高亮时取第一台设备。 */
  SP.focusSelectedInDiagram = function (container) {
    var svgEl = container.querySelector('svg');
    if (!svgEl) return;
    var target = svgEl.querySelector('g.sel .node-box') ||
                 svgEl.querySelector('[data-node] .node-box');
    if (!target || !container.scrollTo) return;
    var x = +target.getAttribute('x'), y = +target.getAttribute('y');
    var w = +target.getAttribute('width'), h = +target.getAttribute('height');
    var cw = container.clientWidth || 800, ch = container.clientHeight || 500;

    /* 倍率：让设备约占视口宽 28% / 高 22%，且明显大于全局视角，钳制在 0.7–1.5 */
    var zw = 0.28 * cw / Math.max(1, w);
    var zh = 0.22 * ch / Math.max(1, h);
    var z = Math.min(zw, zh);
    var fit = SP.fitDiagramZoom(container);
    z = Math.max(z, fit * 1.4);
    z = Math.min(1.5, Math.max(0.7, z));
    if (!isFinite(z) || z <= 0) z = 1;
    SP.setDiagramZoom(z, container);

    /* 页面若滚到了别处，先把框图面板本身带回视野 */
    if (container.getBoundingClientRect && window.innerHeight) {
      var r = container.getBoundingClientRect();
      if ((r.top < 60 || r.bottom > window.innerHeight) && container.scrollIntoView) {
        container.scrollIntoView({ block: 'nearest' });
      }
    }

    /* 瞬时移动，设备中心对准容器视口中心 */
    container.scrollTo({
      left: Math.max(0, (x + w / 2) * z - cw / 2),
      top: Math.max(0, (y + h / 2) * z - ch / 2),
      behavior: 'auto'
    });
    if (SP.syncZoomUI) SP.syncZoomUI();
  };

  /* ================= 手动连线：虚线跟随鼠标 ================= */

  function setupManualPreview(container) {
    var svgEl = container.querySelector('svg');
    if (!svgEl || !SP.manualWire) return;
    var g = svgEl.querySelector('[data-out-device="' + SP.manualWire.sid +
      '"][data-out-port="' + SP.manualWire.sport + '"]');
    if (!g) { SP.manualWire = null; return; }
    var c = g.querySelector('.port-hit');
    var sx = +c.getAttribute('cx'), sy = +c.getAttribute('cy');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'wire-preview');
    path.setAttribute('d', 'M' + sx + ' ' + sy);
    svgEl.appendChild(path);

    function toSvg(ev) {
      var r = svgEl.getBoundingClientRect();
      var vb = svgEl.viewBox.baseVal;
      return {
        x: (ev.clientX - r.left) * vb.width / r.width,
        y: (ev.clientY - r.top) * vb.height / r.height
      };
    }
    svgEl.addEventListener('pointermove', function (ev) {
      if (!SP.manualWire) return;
      var p = toSvg(ev);
      if (Store.state.diagramOrient === 'h') {
        var dxx = Math.max(24, Math.abs(p.x - sx) / 2);
        path.setAttribute('d', 'M' + sx + ' ' + sy +
          ' C' + (sx + dxx) + ' ' + sy + ' ' + (p.x - dxx) + ' ' + p.y + ' ' + p.x + ' ' + p.y);
      } else {
        var dy = Math.max(24, Math.abs(p.y - sy) / 2);
        path.setAttribute('d', 'M' + sx + ' ' + sy +
          ' C' + sx + ' ' + (sy + dy) + ' ' + p.x + ' ' + (p.y - dy) + ' ' + p.x + ' ' + p.y);
      }
    });
  }

  /* Esc 取消手动连线 */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && SP.manualWire && lastWiringContainer) {
      SP.manualWire = null;
      SP.renderWiringDiagram(lastWiringContainer);
    }
  });

  /* --- 节点拖动（鼠标 / 触屏），位置存入设备并持久化 --- */

  function bindDrag(container) {
    if (typeof PointerEvent === 'undefined') return;
    var svgEl = container.querySelector('svg');
    if (!svgEl) return;
    /* 空白处按下：拖出选框 = 框选多台设备；原地松开 = 取消选中/取消手动连线 */
    svgEl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('[data-node],[data-in-device],[data-out-device]')) return;
      e.preventDefault();
      var vb = svgEl.viewBox.baseVal;
      var r0 = svgEl.getBoundingClientRect();
      function toSvg(ev) {
        return {
          x: (ev.clientX - r0.left) * vb.width / Math.max(1, r0.width),
          y: (ev.clientY - r0.top) * vb.height / Math.max(1, r0.height)
        };
      }
      var start = toSvg(e);
      var rect = null;
      var dragging = false;

      function onMove(ev) {
        var p = toSvg(ev);
        if (!dragging && Math.abs(p.x - start.x) < 6 && Math.abs(p.y - start.y) < 6) return;
        dragging = true;
        if (!rect) {
          rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('class', 'marquee-rect');
          svgEl.appendChild(rect);
        }
        rect.setAttribute('x', Math.min(start.x, p.x));
        rect.setAttribute('y', Math.min(start.y, p.y));
        rect.setAttribute('width', Math.abs(p.x - start.x));
        rect.setAttribute('height', Math.abs(p.y - start.y));
      }
      function onUp(ev) {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if (!dragging) {
          /* 原地点击空白：取消手动连线 / 取消选中回到列表 */
          if (SP.manualWire) {
            SP.manualWire = null;
            SP.renderWiringDiagram(container);
          } else if (SP.selectedDeviceId || SP.multiSelected.length) {
            SP.multiSelected = [];
            if (SP.selectDevice) SP.selectDevice('', false);
          }
          return;
        }
        var p = toSvg(ev);
        var x0 = Math.min(start.x, p.x), x1 = Math.max(start.x, p.x);
        var y0 = Math.min(start.y, p.y), y1 = Math.max(start.y, p.y);
        var ids = [];
        svgEl.querySelectorAll('[data-node]').forEach(function (g) {
          var box = g.querySelector('.node-box');
          if (!box) return;
          var bx = +box.getAttribute('x'), by = +box.getAttribute('y');
          var bw = +box.getAttribute('width'), bh = +box.getAttribute('height');
          if (bx < x1 && bx + bw > x0 && by < y1 && by + bh > y0) ids.push(g.dataset.node);
        });
        if (rect && rect.parentNode) rect.parentNode.removeChild(rect);
        SP.multiSelected = ids;
        SP.selectedDeviceId = ids.length === 1 ? ids[0] : '';
        applySelection(container);
        if (SP.renderInspector) SP.renderInspector();
        if (ids.length && SP.toast) {
          SP.toast('已框选 ' + ids.length + ' 台设备，按 Delete / 退格 删除（可撤销）');
        }
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
    /* 12：报警角标点击 → 详情弹窗 */
    svgEl.querySelectorAll('[data-warn]').forEach(function (g) {
      g.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      g.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (SP.openWarnDetails) SP.openWarnDetails(g.dataset.warn);
      });
    });
    svgEl.querySelectorAll('[data-out-device]').forEach(function (g) {
      g.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
      });
      g.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        SP.manualWire = { sid: g.dataset.outDevice, sport: +g.dataset.outPort };
        SP.renderWiringDiagram(container);
      });
    });
    svgEl.querySelectorAll('[data-in-device]').forEach(function (g) {
      g.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
      });
      g.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!SP.manualWire) {
          alert('请先点击一个输出端口，再点击目标输入端口。');
          return;
        }
        var tid = g.dataset.inDevice, tport = +g.dataset.inPort;
        var res = Store.connect(tid, tport, SP.manualWire.sid, SP.manualWire.sport) || { ok: true, msg: '' };
        SP.manualWire = null;
        if (SP.renderAll) SP.renderAll(); else SP.renderWiringDiagram(container);
        if (res.msg) setTimeout(function () {
          alert((res.ok ? '已连接，但请注意：\n' : '连接错误，已自动断开：\n') + res.msg);
        }, 50);
      });
    });
    svgEl.querySelectorAll('[data-node]').forEach(function (g) {
      g.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        if (SP.showDeviceMenu) SP.showDeviceMenu(g.dataset.node, e.clientX, e.clientY);
      });
      g.addEventListener('pointerdown', function (e) {
        if (e.button === 2) return;
        var dev = Store.getDevice(g.dataset.node);
        if (!dev) return;
        e.preventDefault();
        /* 按下即高亮：选中反馈零延迟（设备栏定位放到松开时） */
        if (SP.selectDevice) SP.selectDevice(dev.id, false);
        var rect = g.querySelector('.node-box');
        var baseX = +rect.getAttribute('x'), baseY = +rect.getAttribute('y');
        var startX = e.clientX, startY = e.clientY;
        var dragging = false, raf = 0;
        var THRESHOLD = 5;   /* 超过 5px 才算拖动，指尖/鼠标抖动一律视为点击 */

        function onMove(ev) {
          var dx = ev.clientX - startX, dy = ev.clientY - startY;
          if (!dragging && Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
          dragging = true;
          var z = SP.diagramZoom || 1;
          dev.px = Math.max(8, Math.round(baseX + dx / z));
          dev.py = Math.max(8, Math.round(baseY + dy / z));
          if (!raf) {
            raf = requestAnimationFrame(function () {
              raf = 0;
              SP.renderWiringDiagram(container);
            });
          }
        }
        function onUp() {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
          if (dragging) Store.save();
          else if (SP.selectDevice) SP.selectDevice(dev.id, true);
        }
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      });
    });
  }

  /* 重置为自动排版 */
  SP.resetDiagramLayout = function (container, mode) {
    Store.state.diagramLayout = mode === 'bottomup' ? 'bottomup' : 'topdown';
    Store.state.devices.forEach(function (d) { delete d.px; delete d.py; });
    Store.save();
    SP.renderWiringDiagram(container);
  };

  /* ================= 台内信号流向图（左右结构，支持 ST 链接） ================= */

  SP.renderMixerDiagram = function (container) {
    var m = Store.activeMixer();
    var mains = Store.mainTargets();

    /* CH 列：立体声链接对合并为一个节点 */
    var chNodes = [];
    for (var ci = 0; ci < m.channels; ci++) {
      if (m.links.indexOf(ci) >= 0 && ci + 1 < m.channels) {
        chNodes.push({ label: 'CH ' + (ci + 1) + '/' + (ci + 2), st: true, chs: [ci, ci + 1], anchor: ci });
        ci++; /* 跳过被链接的下一个通道 */
      } else {
        chNodes.push({ label: 'CH ' + (ci + 1), st: false, chs: [ci], anchor: ci });
      }
    }
    var chIndexToNode = {};
    chNodes.forEach(function (n, idx) {
      n.chs.forEach(function (c) { chIndexToNode[c] = idx; });
    });

    var colDefs = [
      { title: '物理输入', count: m.physIn,        label: function (i) { return 'IN ' + (i + 1); } },
      { title: 'CH 通道',  count: chNodes.length,  label: function (i) { return chNodes[i].label; } },
      { title: 'BUS',      count: m.buses,         label: function (i) { return 'BUS ' + (i + 1); } },
      { title: 'MAIN',     count: mains.length,    label: function (i) { return mains[i].label; } },
      { title: 'MATRIX',   count: m.matrices,      label: function (i) { return 'MTX ' + (i + 1); } },
      { title: '物理输出', count: m.physOut,       label: function (i) { return 'OUT ' + (i + 1); } }
    ];

    var nodeW = 74, nodeH = 18, gapY = 8, gapX = 108, margin = 40, titleH = 30;
    var maxCount = Math.max.apply(null, colDefs.map(function (c) { return Math.max(c.count, 1); }));
    var totalH = titleH + margin + maxCount * (nodeH + gapY) + margin;
    var totalW = margin * 2 + colDefs.length * nodeW + (colDefs.length - 1) * gapX;

    function nodeXY(ci2, i) {
      var col = colDefs[ci2];
      var colH = col.count * (nodeH + gapY) - gapY;
      var y0 = titleH + margin + (maxCount * (nodeH + gapY) - gapY - colH) / 2;
      return { x: margin + ci2 * (nodeW + gapX), y: y0 + i * (nodeH + gapY) };
    }
    function rightOf(ci2, i) { var p = nodeXY(ci2, i); return { x: p.x + nodeW, y: p.y + nodeH / 2 }; }
    function leftOf(ci2, i)  { var p = nodeXY(ci2, i); return { x: p.x, y: p.y + nodeH / 2 }; }

    function edge(a, b, cls) {
      var dx = Math.max(30, (b.x - a.x) / 2);
      return '<path class="mx-edge ' + cls + '" d="M' + a.x + ' ' + a.y +
        ' C' + (a.x + dx) + ' ' + a.y + ' ' + (b.x - dx) + ' ' + b.y + ' ' + b.x + ' ' + b.y + '"/>';
    }

    var svg = [];
    svg.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + totalW + '" height="' + totalH +
      '" viewBox="0 0 ' + totalW + ' ' + totalH + '">');
    svg.push(svgStyle());

    /* 物理输入 → CH 节点 */
    var seenIn = {};
    Object.keys(m.inPatch || {}).forEach(function (ik) {
      var inIdx = +ik;
      if (inIdx >= m.physIn) return;
      (m.inPatch[ik] || []).forEach(function (ch) {
        var ni = chIndexToNode[ch];
        var key = inIdx + ':' + ni;
        if (ni !== undefined && !seenIn[key]) {
          seenIn[key] = true;
          svg.push(edge(rightOf(0, inIdx), leftOf(1, ni), 'implicit'));
        }
      });
    });

    var mainIndex = {};
    mains.forEach(function (t, idx) { mainIndex[t.id] = idx; });
    chNodes.forEach(function (n, idx) {
      Store.chRoutes(n.anchor).forEach(function (t) {
        var from = rightOf(1, idx);
        if (t[0] === 'b') {
          var bi = +t.slice(1);
          if (bi < m.buses) svg.push(edge(from, leftOf(2, bi), 'to-bus'));
        } else if (mainIndex[t] !== undefined) {
          svg.push(edge(from, leftOf(3, mainIndex[t]), 'to-main'));
        } else if (t[0] === 'x') {
          var xi = +t.slice(1);
          if (xi < m.matrices) svg.push(edge(from, leftOf(4, xi), 'to-mtx'));
        }
      });
    });
    Object.keys(m.outPatch || {}).forEach(function (sid) {
      var from;
      if (sid[0] === 'b') {
        var bi = +sid.slice(1);
        if (bi < m.buses) from = rightOf(2, bi);
      } else if (sid[0] === 'x') {
        var xi = +sid.slice(1);
        if (xi < m.matrices) from = rightOf(4, xi);
      } else if (mainIndex[sid] !== undefined) {
        from = rightOf(3, mainIndex[sid]);
      }
      if (!from) return;
      (m.outPatch[sid] || []).forEach(function (oi) {
        if (oi < m.physOut) svg.push(edge(from, leftOf(5, oi), 'to-out'));
      });
    });

    colDefs.forEach(function (col, ci2) {
      var x = margin + ci2 * (nodeW + gapX);
      svg.push('<text class="mx-coltitle" x="' + (x + nodeW / 2) + '" y="' + (titleH - 6) +
        '" text-anchor="middle">' + esc(col.title) + '</text>');
      for (var i2 = 0; i2 < col.count; i2++) {
        var p = nodeXY(ci2, i2);
        var st = (ci2 === 1 && chNodes[i2].st) ? ' st' : '';
        svg.push('<rect class="mx-node' + st + '" x="' + p.x + '" y="' + p.y + '" width="' + nodeW +
          '" height="' + nodeH + '" rx="3"/>');
        svg.push('<text class="mx-label' + st + '" x="' + (p.x + nodeW / 2) + '" y="' + (p.y + 12.5) +
          '" text-anchor="middle">' + esc(col.label(i2)) + '</text>');
      }
    });

    svg.push('</svg>');
    container.innerHTML = svg.join('');
  };

  /* ================= 高清 PNG / PDF 导出 ================= */

  /* scale 倍率导出；失败（Safari canvas 上限等）自动减半重试 */
  SP.exportPNG = function (container, filename, scale) {
    var svgEl = container.querySelector('svg');
    if (!svgEl) { alert('当前没有可导出的图。'); return; }
    scale = scale || 3;
    var vb = svgEl.viewBox.baseVal;
    var w = vb && vb.width ? vb.width : svgEl.width.baseVal.value;
    var h = vb && vb.height ? vb.height : svgEl.height.baseVal.value;
    var xml = new XMLSerializer().serializeToString(svgEl)
      .replace(/width="[^"]*"/, 'width="' + w + '"')
      .replace(/height="[^"]*"/, 'height="' + h + '"');
    var img = new Image();

    function attempt(sc, retried) {
      var c = document.createElement('canvas');
      c.width = Math.round(w * sc);
      c.height = Math.round(h * sc);
      var ctx = c.getContext('2d');
      var drew = false;
      try {
        ctx.fillStyle = diagramTheme().bg;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        /* 超限 canvas 读回全透明/全黑，用 toBlob null 判定 */
        drew = true;
      } catch (e) { drew = false; }
      if (!drew) {
        if (!retried && sc > 1.5) { attempt(sc / 2, true); return; }
        alert('导出失败，请重试或选择更低分辨率。');
        return;
      }
      c.toBlob(function (blob) {
        if (!blob) {
          if (!retried && sc > 1.5) {
            alert('该分辨率超出浏览器画布上限，已自动降为一半分辨率导出。');
            attempt(sc / 2, true);
          } else {
            alert('导出失败，请重试或选择更低分辨率。');
          }
          return;
        }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = SP.exportFilename ? SP.exportFilename(filename) : filename;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      }, 'image/png');
    }

    img.onload = function () { attempt(scale, false); };
    img.onerror = function () { alert('导出失败，请重试。'); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  };

  /* 按目标像素宽导出（2K/4K/8K），倍率下限 1 */
  SP.exportPNGWidth = function (container, filename, targetW) {
    var svgEl = container.querySelector('svg');
    if (!svgEl) { alert('当前没有可导出的图。'); return; }
    var vb = svgEl.viewBox.baseVal;
    var w = vb && vb.width ? vb.width : 1000;
    SP.exportPNG(container, filename, Math.max(1, targetW / w));
  };

  /* PDF：打印窗口方案（浏览器「存储为 PDF」），零依赖 */
  SP.exportDiagramPDF = function (container, title) {
    var svgEl = container.querySelector('svg');
    if (!svgEl) { alert('当前没有可导出的图。'); return; }
    var vb = svgEl.viewBox.baseVal;
    var xml = new XMLSerializer().serializeToString(svgEl)
      .replace(/width="[^"]*"/, 'width="' + (vb ? vb.width : 1000) + '"')
      .replace(/height="[^"]*"/, 'height="' + (vb ? vb.height : 600) + '"');
    var landscape = vb && vb.width > vb.height;
    var w = window.open('', '_blank');
    if (!w) { alert('浏览器拦截了新窗口，请允许本页打开弹窗后重试。'); return; }
    var t = diagramTheme();
    w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' +
      title + '</title><style>' +
      '@page{size:A4 ' + (landscape ? 'landscape' : 'portrait') + ';margin:10mm}' +
      '*{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'body{background:' + t.bg + '}' +
      'svg{width:100%;height:auto;display:block}' +
      '.no-print{position:fixed;top:14px;right:14px}' +
      '.no-print button{background:#eda63d;color:#1a1206;border:none;border-radius:6px;' +
      'font:600 14px sans-serif;padding:10px 18px;cursor:pointer}' +
      '@media print{.no-print{display:none}}' +
      '</style></head><body>' +
      '<div class="no-print"><button onclick="window.print()">打印 / 存为 PDF</button></div>' +
      xml + '</body></html>');
    w.document.close();
  };
})();
