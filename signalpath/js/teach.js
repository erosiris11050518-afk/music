/* ============================================================
   teach.js — 接线教学页（v2：调音台 / DSP / 功放 / 音箱 全类型）
   每台设备独立展示页：背板照片 + 接口阵列 + 标注卡 + 箭头示意，
   与主页面连接数据实时同步；端口接口类型（XLR/TRS/Line/RCA/SpeakON）
   可逐口设置，音箱默认 SpeakON。
   ============================================================ */

(function () {
  var Store = SP.Store;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }

  function themeC() {
    if (SP.diagramTheme) return SP.diagramTheme();
    return { nodeFill: '#1e242c', nodeStroke: '#3a4450', title: '#e8ecf1',
      dim: '#93a0ae', faint: '#5d6875', bg: '#10141a', tick: '#4a5560' };
  }

  SP.teachDeviceId = '';

  function teachDevice() {
    var d = Store.getDevice(SP.teachDeviceId);
    if (d) return d;
    var all = Store.state.devices;
    if (all.length) { SP.teachDeviceId = all[0].id; return all[0]; }
    return null;
  }

  /* 右键/设备栏 → 进入接线教学 */
  SP.openPatchTeach = function (devId) {
    SP.teachDeviceId = devId;
    if (SP.switchView) SP.switchView('teach');
    SP.renderTeach();
  };

  /* ================= 左侧：设备选择列表 + 输入设备清单 ================= */

  function renderTeachDevList() {
    var host = el('teach-dev-list');
    if (!host) return;
    var st = Store.state;
    if (!st.devices.length) {
      host.innerHTML = '<div class="empty-hint">还没有设备。<br>先在「设备连线」页添加。</div>';
      return;
    }
    var cur = teachDevice();
    var groups = [];
    SP.TYPE_ORDER.forEach(function (tk) {
      var items = st.devices.filter(function (d) { return d.type === tk; });
      if (!items.length) return;
      groups.push('<div class="tpl-group-title">' + esc(Store.typeInfo(tk).name) + '</div>' +
        items.map(function (d) {
          var on = cur && cur.id === d.id;
          return '<button class="teach-dev-btn' + (on ? ' on' : '') + '" data-teach-dev="' + d.id + '">' +
            '<span class="dot" style="background:' + esc(d.color || SP.typeColor(d.type)) + '"></span>' +
            esc(d.name) +
            (SP.Images.get(d.panelImgId) ? '<span class="has-img" title="已上传接口图">📷</span>' : '') +
            '</button>';
        }).join(''));
    });
    /* 自定义类型设备 */
    var others = st.devices.filter(function (d) { return SP.TYPE_ORDER.indexOf(d.type) < 0; });
    if (others.length) {
      groups.push('<div class="tpl-group-title">其他</div>' + others.map(function (d) {
        var on = cur && cur.id === d.id;
        return '<button class="teach-dev-btn' + (on ? ' on' : '') + '" data-teach-dev="' + d.id + '">' +
          '<span class="dot" style="background:' + esc(d.color || SP.typeColor(d.type)) + '"></span>' +
          esc(d.name) + '</button>';
      }).join(''));
    }
    host.innerHTML = groups.join('');
    host.querySelectorAll('[data-teach-dev]').forEach(function (b) {
      b.addEventListener('click', function () {
        SP.teachDeviceId = b.dataset.teachDev;
        SP.renderTeach();
      });
    });
  }

  /* 输入设备清单（话筒/乐器，与调音台 IN 对应） */
  SP.renderGear = function () {
    var host = el('teach-gear-list');
    if (!host) return;
    var gear = Store.state.inputGear;
    var cnt = el('teach-gear-count');
    if (cnt) cnt.textContent = gear.length ? gear.length + ' 项' : '';

    var rows = gear.map(function (g, i) {
      return '<div class="gear-row" data-idx="' + i + '">' +
        '<input type="text" class="g-name" value="' + esc(g.name) + '" placeholder="名称，如：主唱话筒 / 电钢琴">' +
        '<input type="text" class="g-note" value="' + esc(g.note || '') + '" placeholder="备注：经 DI盒 / 无线接收等">' +
        '<button class="btn icon g-del" title="删除">✕</button>' +
        '</div>';
    }).join('');

    host.innerHTML = (rows || '<div class="empty-hint">话筒、乐器、DI 盒等进台设备在这里登记，可对应到调音台输入。</div>') +
      '<button class="btn ghost sm g-add" style="margin-top:8px">＋ 添加一项</button>';

    var addBtn = host.querySelector('.g-add');
    if (addBtn) addBtn.addEventListener('click', function () {
      Store.addGear();
      SP.renderTeach();
    });
    host.querySelectorAll('.gear-row').forEach(function (row) {
      var g = gear[+row.dataset.idx];
      if (!g) return;
      row.querySelector('.g-name').addEventListener('change', function () { g.name = this.value.trim(); Store.save(); SP.renderTeach(); });
      row.querySelector('.g-note').addEventListener('change', function () { g.note = this.value.trim(); Store.save(); SP.renderTeach(); });
      row.querySelector('.g-del').addEventListener('click', function () {
        Store.removeGear(+row.dataset.idx);
        SP.renderTeach();
      });
    });
  };

  /* ================= 端口条目数据（示意图与表格共用） ================= */

  /* OUT 去向：来自「设备连线」的真实连接 */
  function outEntries(dev) {
    return Store.visibleOuts(dev).map(function (i) {
      var op = dev.outputs[i];
      var us = Store.consumersOf(dev.id, i);
      var dest = '未接', cable = '';
      if (us.length) {
        var td = Store.getDevice(us[0].tid);
        if (td) dest = td.name + '（' + ((td.inputs[us[0].tport] || {}).label || '') + '）';
        cable = Store.cableOf(us[0]) + (us[0].lenM ? ' · ' + us[0].lenM + 'm' : '');
      }
      var conn = Store.portConn(dev, 'out', i);
      return {
        port: i, label: Store.outLabelOf(dev, i), conn: conn, dest: dest, cable: cable,
        on: !!us.length,
        text: (i + 1) + '  ' + Store.outLabelOf(dev, i) + ' [' + conn + ']  →  ' + dest
      };
    });
  }

  /* IN 来源：调音台 = 输入设备清单（gearPatch）；其余 = 上游连接 */
  function inEntries(dev) {
    var gp = dev.gearPatch || {};
    return dev.inputs.map(function (ip, i) {
      var conn = Store.portConn(dev, 'in', i);
      var src = '未接', on = false, cable = '';
      if (dev.type === 'mixer') {
        var g = gp[i] ? Store.gearById(gp[i]) : null;
        if (g) { src = (g.name || '未命名') + (g.note ? ' / ' + g.note : ''); on = true; }
      } else {
        var c = Store.sourceFor(dev.id, i);
        if (c) {
          var sd = Store.getDevice(c.sid);
          if (sd) {
            src = sd.name + '（' + Store.outLabelOf(sd, c.sport) + '）';
            cable = Store.cableOf(c) + (c.lenM ? ' · ' + c.lenM + 'm' : '');
            on = true;
          }
        }
      }
      return {
        port: i, label: ip.label, conn: conn, src: src, cable: cable, on: on,
        text: (i + 1) + '  ' + ip.label + ' [' + conn + ']  ←  ' + src
      };
    });
  }

  /* ================= 接线示意图（SVG，全部内联属性，可直接导出） ================= */

  /* 泛化版：任意设备渲染进任意容器（报告导出复用） */
  SP.renderTeachDiagramFor = function (dev, container) {
    if (!dev || !container) return;
    var t = themeC();
    var W = 1240, left = 44;
    var plugCols = 8, connSp = 64, rowGap = 74;
    var plugBlockW = 22 + (plugCols - 1) * connSp + 48;
    var cardX = left + plugBlockW + 164;
    var cardW = W - cardX - left;
    var y = 30;
    var p = [];

    function text(x, ty, str, size, color, weight, anchor) {
      p.push('<text x="' + x + '" y="' + ty + '" fill="' + color + '" font-size="' + size + '"' +
        (weight ? ' font-weight="' + weight + '"' : '') +
        (anchor ? ' text-anchor="' + anchor + '"' : '') +
        ' font-family=\'-apple-system,"PingFang SC",Menlo,sans-serif\'>' + esc(str) + '</text>');
    }

    var info = Store.typeInfo(dev.type);
    text(left, y, dev.name + ' · ' + info.name + '接线示意图', 15, t.title, 700);
    var spec = SP.specString(dev);
    if (spec) text(left + SP.svgTextW(dev.name + ' · ' + info.name + '接线示意图', 15) + 16, y, spec, 10, t.dim);
    y += 10;

    /* 背板/接口照片（如已上传，放最上方对照） */
    var panelImg = SP.Images.get(dev.panelImgId);
    if (panelImg) {
      var iw = W - left * 2;
      var ih = Math.round(iw * (dev.panelImgH || 0) / Math.max(1, dev.panelImgW || 1)) || 300;
      ih = Math.min(ih, 460);
      y += 14;
      p.push('<image href="' + panelImg + '" x="' + left + '" y="' + y +
        '" width="' + iw + '" height="' + ih + '" preserveAspectRatio="xMidYMid meet"/>');
      y += ih + 28;
    } else {
      y += 18;
    }

    /* 接口图形：SpeakON 画方形卡口，XLR/其他画圆形三芯 */
    function drawPlug(cx, cy, on, connType) {
      var strokeC = on ? '#4fbf8b' : t.nodeStroke;
      if (connType === 'SpeakON') {
        p.push('<rect x="' + (cx - 13) + '" y="' + (cy - 13) + '" width="26" height="26" rx="6" fill="' +
          t.nodeFill + '" stroke="' + strokeC + '" stroke-width="' + (on ? 2 : 1.2) + '"/>');
        p.push('<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="none" stroke="' + t.dim + '" stroke-width="1.4"/>');
        p.push('<rect x="' + (cx - 1.5) + '" y="' + (cy - 8) + '" width="3" height="5" fill="' + t.dim + '"/>');
      } else {
        p.push('<circle cx="' + cx + '" cy="' + cy + '" r="15" fill="' + t.nodeFill +
          '" stroke="' + strokeC + '" stroke-width="' + (on ? 2 : 1.2) + '"/>');
        p.push('<circle cx="' + (cx - 5) + '" cy="' + (cy + 4) + '" r="2" fill="' + t.dim + '"/>' +
          '<circle cx="' + (cx + 5) + '" cy="' + (cy + 4) + '" r="2" fill="' + t.dim + '"/>' +
          '<circle cx="' + cx + '" cy="' + (cy - 6) + '" r="2" fill="' + t.dim + '"/>');
      }
    }

    /* 一段接口阵列：左侧接口组与右侧卡片组同步居中，线缆分道进入卡片 */
    function drawSection(title, entries, accent) {
      var count = entries.length;
      if (!count) return;
      text(left, y + 4, title, 12, t.dim, 700);
      var secTop = y + 20;
      var rows = Math.ceil(count / plugCols);
      var cardGap = 22;
      var cardHs = [];
      var cardsH = 0;
      for (var r = 0; r < rows; r++) {
        var lineCount = Math.min(plugCols, count - r * plugCols);
        cardHs[r] = lineCount * 16 + 18;
        cardsH += cardHs[r] + (r ? cardGap : 0);
      }
      var plugsH = rows ? (rows - 1) * rowGap + 52 : 0;
      var secH = Math.max(plugsH, cardsH);
      var plugBaseY = secTop + (secH - plugsH) / 2 + 26;
      var cardY = secTop + (secH - cardsH) / 2;

      for (var r2 = 0; r2 < rows; r2++) {
        var rowY = plugBaseY + r2 * rowGap;
        var n = Math.min(plugCols, count - r2 * plugCols);
        for (var i = 0; i < n; i++) {
          var idx = r2 * plugCols + i;
          var cx = left + 22 + i * connSp;
          var en = entries[idx];
          text(cx, rowY - 24, String(idx + 1), 10.5, en.on ? t.title : t.dim, 600, 'middle');
          drawPlug(cx, rowY, en.on, en.conn);
          text(cx, rowY + 27, en.conn, 7.5, en.on ? t.dim : t.faint, 600, 'middle');
        }

        /* 本行的标注卡 */
        var lines = [];
        for (var k = r2 * plugCols; k < Math.min(count, r2 * plugCols + plugCols); k++) lines.push(entries[k]);
        var cardH = cardHs[r2];
        p.push('<rect x="' + cardX + '" y="' + cardY + '" width="' + cardW + '" height="' + cardH +
          '" rx="8" fill="' + t.nodeFill + '" stroke="' + t.nodeStroke + '"/>');
        lines.forEach(function (ln, li) {
          text(cardX + 12, cardY + 19 + li * 16,
            SP.clipSvgText(ln.text, 11, cardW - 24), 11, ln.on ? t.title : t.faint);
        });
        /* 箭头：行右端 → 独立走线通道 → 卡片 */
        var ax1 = cardX - 8, ay1 = cardY + cardH / 2;
        var ax0 = left + 22 + (n - 1) * connSp + 30, ay0 = rowY;
        var laneBase = cardX - 100;
        var laneX = Math.max(ax0 + 38, laneBase - r2 * 20);
        laneX = Math.min(laneX, cardX - 48);
        var midY = (ay0 + ay1) / 2;
        var d = 'M' + ax0 + ' ' + ay0 +
          ' C ' + (ax0 + 34) + ' ' + ay0 + ', ' + laneX + ' ' + ay0 + ', ' + laneX + ' ' + midY +
          ' C ' + laneX + ' ' + ay1 + ', ' + (ax1 - 34) + ' ' + ay1 + ', ' + ax1 + ' ' + ay1;
        p.push('<path d="' + d + '" fill="none" stroke="' + t.bg +
          '" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>');
        p.push('<path d="' + d + '" fill="none" stroke="' + accent +
          '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#ta)"/>');
        cardY += cardH + cardGap;
      }
      y = secTop + secH + 30;
    }

    /* 功放拨档教学：P/S/B 档位、增益、整机接地（与设备栏设置同步） */
    if (dev.type === 'amp') {
      var lines = [];
      var pairs = Math.ceil(dev.outputs.length / 2);
      for (var pi = 0; pi < pairs; pi++) {
        var mode = Store.ampPairMode(dev, pi);
        var pa = pi * 2, pb = pa + 1;
        var lbl = dev.outputs[pb] ? 'OUT' + (pa + 1) + '/' + (pb + 1) : 'OUT' + (pa + 1);
        var modeTx = mode === 'B' ? 'B 桥接 —— 两口合并为一路大功率输出，只接 OUT' + (pa + 1)
          : mode === 'S' ? 'S 档（立体声）—— 两路独立放大'
          : 'P 档（并联）—— 两路同信号输出';
        lines.push(lbl + '：' + modeTx + ' · 增益 ' + ((dev.outputs[pa] || {}).gain || '未设'));
      }
      lines.push('整机接地：' + (dev.specs && dev.specs.grounded ? '✔ 已接地（消除底噪/防触电）' : '✘ 不接地') +
        (dev.specs && dev.specs.power ? ' · 额定功率 ' + dev.specs.power + 'W' : ''));
      text(left, y + 4, '拨档教学 · 后面板开关设置', 12, t.dim, 700);
      var cardTop = y + 14;
      var cardH2 = lines.length * 17 + 18;
      p.push('<rect x="' + left + '" y="' + cardTop + '" width="' + (W - left * 2) +
        '" height="' + cardH2 + '" rx="8" fill="' + t.nodeFill + '" stroke="#eda63d" stroke-width="1.2"/>');
      lines.forEach(function (ln, li) {
        text(left + 14, cardTop + 21 + li * 17, SP.clipSvgText(ln, 11.5, W - left * 2 - 28),
          11.5, li === lines.length - 1 ? '#eda63d' : t.title);
      });
      y = cardTop + cardH2 + 26;
    }

    var outs = outEntries(dev);
    if (outs.length) {
      drawSection('OUT 输出 · 去向（来自设备连线）', outs, '#eda63d');
    }
    var ins = inEntries(dev);
    if (ins.length) {
      drawSection(dev.type === 'mixer'
        ? 'IN 输入 · 接入设备（来自输入设备清单）'
        : 'IN 输入 · 信号来源（来自设备连线）', ins, '#6ba3c4');
    }

    var H = y + 8;
    container.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<defs><marker id="ta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">' +
      '<path d="M0,0 L8,4 L0,8 Z" fill="context-stroke"/></marker></defs>' +
      p.join('') + '</svg>';
  };

  function renderTeachDiagram() {
    var container = el('teach-diagram');
    if (!container) return;
    var dev = teachDevice();
    if (!dev) {
      container.innerHTML = '<div class="empty-hint">添加设备后，这里会自动生成接线示意图。</div>';
      return;
    }
    SP.renderTeachDiagramFor(dev, container);
  }

  /* ================= 接线清单表格（含接口类型 / 调音台 IN↔乐器映射） ================= */

  function connOptions(cur) {
    return SP.CONN_TYPES.map(function (ct) {
      return '<option' + (ct === cur ? ' selected' : '') + '>' + esc(ct) + '</option>';
    }).join('');
  }

  function renderTeachTable() {
    var host = el('teach-table-wrap');
    if (!host) return;
    var dev = teachDevice();
    if (!dev) { host.innerHTML = ''; return; }
    var gear = Store.state.inputGear;
    var gp = dev.gearPatch || {};

    function gearOpts(cur) {
      return '<option value="">— 未接 —</option>' + gear.map(function (g) {
        return '<option value="' + g.id + '"' + (g.id === cur ? ' selected' : '') + '>' +
          esc((g.name || '未命名') + (g.note ? '（' + g.note + '）' : '')) + '</option>';
      }).join('');
    }

    var ins = inEntries(dev);
    var inRows = ins.map(function (en) {
      var srcCell;
      if (dev.type === 'mixer') {
        srcCell = '<select data-teach-in="' + en.port + '">' + gearOpts(gp[en.port] || '') + '</select>';
      } else {
        srcCell = en.on ? esc(en.src) : '<span class="cell-port">—</span>';
      }
      return '<tr>' +
        '<td class="cell-port">' + esc(en.label) + '</td>' +
        '<td><select class="conn-type-sel" data-conn-side="in" data-conn-port="' + en.port + '">' +
        connOptions(en.conn) + '</select></td>' +
        '<td class="cell-dev">' + srcCell + '</td>' +
        '<td class="cell-port">' + esc(en.cable || '') + '</td>' +
        '</tr>';
    }).join('');

    var outs = outEntries(dev);
    var outRows = outs.map(function (en) {
      return '<tr>' +
        '<td class="cell-port">' + esc(en.label) + '</td>' +
        '<td><select class="conn-type-sel" data-conn-side="out" data-conn-port="' + en.port + '">' +
        connOptions(en.conn) + '</select></td>' +
        '<td class="cell-dev">' + (en.on ? esc(en.dest) : '<span class="cell-port">—</span>') + '</td>' +
        '<td class="cell-port">' + esc(en.cable) + '</td>' +
        '</tr>';
    }).join('');

    var cnt = el('teach-count');
    if (cnt) {
      var linked = ins.filter(function (e) { return e.on; }).length;
      cnt.textContent = linked + ' 路已接 / ' + ins.length + ' 路输入';
    }

    host.innerHTML =
      (inRows
        ? '<table class="sheet"><thead><tr><th>输入口</th><th>接口</th><th>' +
          (dev.type === 'mixer' ? '接入设备（话筒/乐器）' : '信号来源') +
          '</th><th>线材</th></tr></thead><tbody>' + inRows + '</tbody></table>'
        : '') +
      (outRows
        ? '<table class="sheet" style="margin-top:14px"><thead><tr><th>输出口</th><th>接口</th>' +
          '<th>去向（设备 / 端口）</th><th>线材</th></tr></thead><tbody>' + outRows + '</tbody></table>'
        : '');

    host.querySelectorAll('[data-teach-in]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        Store.setGearPatch(dev.id, +sel.dataset.teachIn, sel.value);
        SP.renderTeach();
      });
    });
    host.querySelectorAll('.conn-type-sel').forEach(function (sel) {
      sel.addEventListener('change', function () {
        Store.setPortConn(dev.id, sel.dataset.connSide, +sel.dataset.connPort, sel.value);
        SP.renderTeach();
      });
    });
  }

  /* ================= 汇总渲染 ================= */

  SP.renderTeach = function () {
    var dev = teachDevice();
    var note = el('teach-dev-note');
    if (note) {
      note.textContent = dev
        ? dev.name + ' · ' + dev.inputs.length + ' 进 ' + Store.visibleOuts(dev).length + ' 出'
        : '';
    }
    var clearBtn = el('btn-teach-img-clear');
    if (clearBtn) clearBtn.style.display = dev && SP.Images.get(dev.panelImgId) ? '' : 'none';
    renderTeachDevList();
    SP.renderGear();
    renderTeachDiagram();
    renderTeachTable();
  };

  /* 上传面板照片：优先保留清晰度，过大的图再高质量压缩，存 IndexedDB */
  function loadPanelImg(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var raw = reader.result;
        var canKeepOriginal = /^image\/(jpeg|png|webp)$/i.test(file.type || '') &&
          file.size <= 3 * 1024 * 1024;
        if (canKeepOriginal) {
          cb(SP.Images.put(raw), img.width, img.height);
          return;
        }

        var maxEdge = Math.max(1, Math.max(img.width, img.height));
        var scale = Math.min(1, 2600 / maxEdge);
        var minScale = Math.min(1, 1800 / maxEdge);
        var maxChars = 4.2 * 1024 * 1024;
        var best = null;

        function drawAndEncode(sc, quality) {
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * sc));
          c.height = Math.max(1, Math.round(img.height * sc));
          var cx = c.getContext('2d');
          if (cx.imageSmoothingEnabled !== undefined) cx.imageSmoothingEnabled = true;
          if (cx.imageSmoothingQuality !== undefined) cx.imageSmoothingQuality = 'high';
          cx.fillStyle = '#ffffff';
          cx.fillRect(0, 0, c.width, c.height);
          cx.drawImage(img, 0, 0, c.width, c.height);
          return { data: c.toDataURL('image/jpeg', quality), w: c.width, h: c.height };
        }

        [0.94, 0.9, 0.86].some(function (q) {
          best = drawAndEncode(scale, q);
          return best.data.length <= maxChars;
        });
        if (best && best.data.length > maxChars && scale > minScale) {
          best = drawAndEncode(minScale, 0.9);
        }
        cb(SP.Images.put(best.data), best.w, best.h);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var pick = el('btn-teach-img');
    if (pick) pick.addEventListener('click', function () {
      if (!teachDevice()) { alert('还没有设备。'); return; }
      el('teach-img-file').click();
    });
    var file = el('teach-img-file');
    if (file) {
      file.addEventListener('change', function () {
        var f = this.files[0];
        this.value = '';
        var dev = teachDevice();
        if (!f || !dev) return;
        loadPanelImg(f, function (imgId, w, h) {
          if (dev.panelImgId) SP.Images.remove(dev.panelImgId);
          dev.panelImgId = imgId;
          dev.panelImgW = w;
          dev.panelImgH = h;
          Store.save();
          SP.renderTeach();
        });
      });
    }
    var clear = el('btn-teach-img-clear');
    if (clear) {
      clear.addEventListener('click', function () {
        var dev = teachDevice();
        if (!dev || !dev.panelImgId) return;
        SP.Images.remove(dev.panelImgId);
        dev.panelImgId = '';
        dev.panelImgW = 0;
        dev.panelImgH = 0;
        Store.save();
        SP.renderTeach();
        if (SP.toast) SP.toast('已移除「' + dev.name + '」的接口图片');
      });
    }
    var png = el('btn-teach-png');
    if (png) {
      png.addEventListener('click', function () {
        var dev = teachDevice();
        if (!dev) { alert('还没有设备。'); return; }
        SP.exportPNG(el('teach-diagram'), SP.exportFilename(dev.name + '-接线示意图', 'png'), 3);
      });
    }
  });
})();
