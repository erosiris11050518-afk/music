/* ============================================================
   report.js — 多页报告（打印 / 存为 PDF），全部模块可勾选：
   系统框图 / 设备清单 / 连接清单 / 线材购买汇总 / 机柜长度建议 /
   供电功率建议 / 台内路由 / 输入输出分配 / 接线教学页 / 输入设备清单
   ============================================================ */

(function () {
  var Store = SP.Store;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function reportHTML(opt) {
    opt = opt || {};
    function include(k) { return opt[k] !== false; }
    var st = Store.state;
    var d = new Date();
    var dateStr = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) +
      '-' + ('0' + d.getDate()).slice(-2);

    /* 设备清单 */
    var devRows = st.devices.map(function (dv) {
      return '<tr><td>' + esc(dv.name) + '</td><td>' + esc(Store.typeInfo(dv.type).name) +
        (dv.type === 'speaker' ? ' · ' + esc(SP.speakerRoleInfo(dv.speakerRole).name) : '') +
        '</td><td>' + esc(SP.specString(dv) || '—') + '</td>' +
        '<td class="num">' + dv.inputs.length + '</td><td class="num">' +
        Store.visibleOuts(dv).length + '</td></tr>';
    }).join('');

    /* 连接清单 */
    var conns = st.connections.slice();
    if (SP.connHierSort) SP.connHierSort(conns);
    var connRows = conns.map(function (c) {
      var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
      if (!s || !t) return '';
      var sp = s.outputs[c.sport], tp = t.inputs[c.tport];
      if (!c.net && (!sp || !tp)) return '';
      var tpLabel = tp ? tp.label : '网口';
      var amp = '—';
      if (s.type === 'amp') {
        var mode = Store.ampPairMode(s, Math.floor(c.sport / 2));
        amp = '档位 ' + (sp.gain || '未填') + ' · ' +
          (s.specs && s.specs.grounded ? '接地' : '不接地') +
          ' · ' + (mode === 'B' ? 'B桥接' : mode + '档');
        var la = Store.powerAlarmForOutput(s.id, c.sport);
        if (la && la.boosted) amp += ' · ' + la.loadOhms + 'Ω 可用 ' + la.ampW + 'W';
      }
      var warn = Store.connWarning(c);
      var lenTx = (c.lenM ? c.lenM + 'm' : '') + (c.note ? (c.lenM ? ' · ' : '') + c.note : '');
      return '<tr><td>' + esc(s.name) + ' / ' + esc(Store.outLabelOf(s, c.sport)) + '</td>' +
        '<td class="arr">→</td>' +
        '<td>' + esc(t.name) + ' / ' + esc(tpLabel) + '</td>' +
        '<td>' + esc(Store.cableOf(c)) + (lenTx ? '<br><span class="dimtx">' + esc(lenTx) + '</span>' : '') + '</td>' +
        '<td>' + esc(amp) + '</td>' +
        '<td>' + (warn ? '<span class="w">⚠ ' + esc(warn) + '</span>' : '✓') + '</td></tr>';
    }).join('');

    /* 线材购买汇总 */
    function fmtLen(n) {
      return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '') + ' m';
    }
    function cableLengthText(g) {
      return (g.lengthBreakdown || []).map(function (x) {
        return fmtLen(x.len) + ' ' + x.count + '根';
      }).join('，');
    }
    var cableGroups = Store.cableSummary();
    var cableTotalCount = 0, cableTotalMeters = 0, cableTotalMissing = 0;
    cableGroups.forEach(function (g) {
      cableTotalCount += g.count;
      cableTotalMeters += g.meters || 0;
      cableTotalMissing += g.missing || 0;
    });
    cableTotalMeters = Math.round(cableTotalMeters * 10) / 10;
    var cableRows = cableGroups.map(function (g) {
      return '<tr><td>' + esc(g.type) + '</td>' +
        '<td><b>' + esc(cableLengthText(g) || '—') + '</b></td>' +
        '<td class="num">' + (g.meters ? g.meters + ' 米' : '—') + '</td>' +
        '<td class="num">' + g.count + ' 根</td>' +
        '<td>' + (g.missing ? '<span class="w">⚠ ' + g.missing + ' 根未填长度</span>' : '✓ 已齐') + '</td></tr>';
    }).join('');

    /* 机柜长度建议 */
    var rack = Store.rackSummary();
    var rackTypeName = { mixer: '调音台', dsp: 'DSP', amp: '功放' };
    var rackRows = Object.keys(rack.byType).map(function (tk) {
      return '<tr><td>' + esc(rackTypeName[tk] || tk) + '</td><td class="num">' +
        rack.byType[tk] + ' U</td></tr>';
    }).join('') +
      '<tr><td>电源时序器（默认）</td><td class="num">' + rack.seqU + ' U</td></tr>' +
      '<tr><td><b>设备合计</b></td><td class="num"><b>' + (rack.totalU + rack.seqU) + ' U</b></td></tr>';
    var rackMissing = rack.missing.length
      ? '<p class="w">⚠ 以下设备未填 U 数，统计不完整，请在设备栏补填「机柜 U 数」：<br>' +
        rack.missing.map(function (dv) { return esc(dv.name); }).join('、') + '</p>'
      : '';

    /* 供电功率建议 */
    var power = Store.powerSummary();
    var powerRows = power.levels.map(function (lv) {
      return '<tr><td>' + esc(lv.name) + '</td>' +
        '<td class="num">×' + lv.factor + '</td>' +
        '<td class="num">' + lv.draw + ' W</td>' +
        '<td class="num">' + lv.total + ' W</td>' +
        '<td class="num"><b>' + lv.kw + ' kW</b></td>' +
        '<td class="num">' + lv.amps + ' A</td>' +
        '<td class="num">' + (lv.breaker ? lv.breaker + ' A' : '需三相/分路') + '</td>' +
        '<td>' + (lv.threePhase ? '建议三相供电' : '单相 220V 可行') + '</td></tr>';
    }).join('');
    var powerMissing = power.missing.length
      ? '<p class="w">⚠ 以下功放/有源音箱未填功率，估算偏低，请补填：<br>' +
        power.missing.map(function (dv) { return esc(dv.name); }).join('、') + '</p>'
      : '';

    /* 输入设备清单 */
    var gearRows = st.inputGear.map(function (g) {
      return '<tr><td>' + esc(g.name || '未命名') + '</td><td>' + esc(g.note || '—') + '</td></tr>';
    }).join('');

    /* 框图快照 + 台内路由 + 教学页（按报告配色临时重渲染，完成后恢复） */
    var wantLight = !!opt.light;
    var pageLight = document.documentElement.getAttribute('data-theme') === 'light';
    function grab(node) { var sv = node && node.querySelector('svg'); return sv ? sv.outerHTML : ''; }
    var wiringSVGHtml = '';
    var mixerSections = [];
    var teachPages = [];
    var prevActive = st.activeMixerId;
    function dspSvg(dv) {
      var r = Store.ensureDspRoute(dv);
      var t = SP.diagramTheme();
      var nodeW = 92, nodeH = 20, gapY = 9, gapX = 185, margin = 42, titleH = 32;
      var maxN = Math.max(dv.inputs.length, dv.outputs.length, 1);
      var totalH = titleH + margin + maxN * (nodeH + gapY) + margin;
      var totalW = margin * 2 + nodeW * 2 + gapX + 86;
      function yOf(count, i) {
        var colH = count * (nodeH + gapY) - gapY;
        return titleH + margin + (maxN * (nodeH + gapY) - gapY - colH) / 2 + i * (nodeH + gapY);
      }
      var svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + totalW + '" height="' + totalH +
        '" viewBox="0 0 ' + totalW + ' ' + totalH + '">'];
      Object.keys(r.matrix).forEach(function (ik) {
        (r.matrix[ik] || []).forEach(function (oi) {
          var y1 = yOf(dv.inputs.length, +ik) + nodeH / 2;
          var y2 = yOf(dv.outputs.length, oi) + nodeH / 2;
          var x1 = margin + nodeW, x2 = margin + nodeW + gapX;
          var dx = gapX / 2;
          svg.push('<path fill="none" stroke="#4fbf8b" stroke-width="1.4" opacity=".82" d="M' +
            x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 + ' ' + x2 + ' ' + y2 + '"/>');
        });
      });
      function col(x, title, ports, isOut) {
        svg.push('<text x="' + (x + nodeW / 2) + '" y="' + (titleH - 7) + '" text-anchor="middle" fill="' +
          t.faint + '" font-size="10" font-weight="700">' + esc(title) + '</text>');
        ports.forEach(function (p, i) {
          var y = yOf(ports.length, i);
          var lm = isOut ? (r.limits[i] || {}) : null;
          svg.push('<rect x="' + x + '" y="' + y + '" width="' + nodeW + '" height="' + nodeH +
            '" rx="4" fill="' + t.nodeFill + '" stroke="' + t.nodeStroke + '"/>');
          svg.push('<text x="' + (x + nodeW / 2) + '" y="' + (y + 13.5) + '" text-anchor="middle" fill="' +
            t.dim + '" font-size="9" font-family="Menlo,monospace">' + esc(p.label) + '</text>');
          if (lm && (lm.rms || lm.peak)) {
            svg.push('<text x="' + (x + nodeW + 8) + '" y="' + (y + 13.5) + '" fill="#eda63d" font-size="8.5">' +
              esc((lm.rms ? 'RMS ' + lm.rms : '') + (lm.peak ? '  PEAK ' + lm.peak : '')) + '</text>');
          }
        });
      }
      col(margin, '输入', dv.inputs, false);
      col(margin + nodeW + gapX, '输出 · Limit', dv.outputs, true);
      svg.push('</svg>');
      return svg.join('');
    }
    function dspMatrixRows(dv) {
      var r = Store.ensureDspRoute(dv);
      return dv.inputs.map(function (p, i) {
        var outs = (r.matrix[i] || []).slice().sort(function (a, b) { return a - b; })
          .map(function (oi) { return dv.outputs[oi] ? dv.outputs[oi].label : 'OUT ' + (oi + 1); }).join(', ');
        return '<tr><td>' + esc(p.label) + '</td><td>' + esc(outs || '—') + '</td></tr>';
      }).join('');
    }
    function dspLimitRows(dv) {
      var r = Store.ensureDspRoute(dv);
      return dv.outputs.map(function (p, i) {
        var lm = r.limits[i] || {};
        return '<tr><td>' + esc(p.label) + '</td><td>' + esc(lm.rms || '—') +
          '</td><td>' + esc(lm.peak || '—') + '</td></tr>';
      }).join('');
    }
    if (wantLight !== pageLight) {
      document.documentElement.setAttribute('data-theme', wantLight ? 'light' : 'dark');
    }
    try {
      if (include('wiringDiagram')) {
        var tmpW = document.createElement('div');
        SP.renderWiringDiagram(tmpW);
        wiringSVGHtml = grab(tmpW);
      }
      if (include('mixerDiagram') || include('inputPatch') || include('routes') || include('outputPatch')) {
        var routeDevs = st.devices.filter(function (dv) {
          return dv.type === 'mixer' || dv.type === 'dsp';
        });
        var targets = routeDevs.length ? routeDevs : [null];
        targets.forEach(function (md) {
          if (md && md.type === 'dsp') {
            mixerSections.push({
              kind: 'dsp',
              name: md.name,
              cfg: null,
              svg: dspSvg(md),
              dspMatrixRows: dspMatrixRows(md),
              dspLimitRows: dspLimitRows(md)
            });
            return;
          }
          if (md) Store.setActiveMixer(md.id);
          var m2 = Store.activeMixer();
          var tmpM = document.createElement('div');
          SP.renderMixerDiagram(tmpM);
          var routeRows = SP.mixerRouteRows().map(function (r) {
            return '<tr><td>' + esc(r.ch) + (r.st ? ' <span class="st">ST</span>' : '') + '</td>' +
              '<td>' + esc(r.buses.join(', ') || '—') + '</td>' +
              '<td>' + esc(r.mains.join(', ') || '—') + '</td>' +
              '<td>' + esc(r.mtxs.join(', ') || '—') + '</td></tr>';
          }).join('');
          var inPatchRows = Object.keys(m2.inPatch || {}).sort(function (a, b) { return +a - +b; }).map(function (ik) {
            var list = (m2.inPatch[ik] || []).slice().sort(function (a, b) { return a - b; })
              .map(function (ci) { return 'CH ' + (ci + 1); }).join(', ');
            return list ? '<tr><td>IN ' + (+ik + 1) + '</td><td>' + esc(list) + '</td></tr>' : '';
          }).join('');
          var outPatchRows = Store.outPatchSources().map(function (src) {
            var list = (m2.outPatch[src.id] || []).slice().sort(function (a, b) { return a - b; })
              .map(function (oi) { return 'OUT ' + (oi + 1); }).join(', ');
            return list ? '<tr><td>' + esc(src.label) + '</td><td>' + esc(list) + '</td></tr>' : '';
          }).join('');
          mixerSections.push({
            name: md ? md.name : '独立台面',
            cfg: m2,
            svg: grab(tmpM),
            routeRows: routeRows,
            inPatchRows: inPatchRows,
            outPatchRows: outPatchRows
          });
        });
      }
      if (opt.teachPages) {
        st.devices.forEach(function (dv) {
          var tmpT = document.createElement('div');
          SP.renderTeachDiagramFor(dv, tmpT);
          teachPages.push({ name: dv.name, svg: grab(tmpT) });
        });
      }
    } finally {
      if (prevActive && Store.getDevice(prevActive)) Store.setActiveMixer(prevActive);
      if (wantLight !== pageLight) {
        document.documentElement.setAttribute('data-theme', pageLight ? 'light' : 'dark');
      }
      SP.renderWiringDiagram(el('wiring-diagram'));
      if (SP.renderMixerView) SP.renderMixerView();
    }

    /* 报告配色：深色演示版 / 浅色打印省墨版 */
    var P = wantLight ? {
      bg: '#ffffff', text: '#1f242a', sub: '#5a6572', line: '#e0e3e8', line2: '#c9ced6',
      faint: '#7c8794', amber: '#b4770e', warn: '#c94f3f', dia: '#f4f5f7', diaB: '#d8dce1', btnTx: '#241a04'
    } : {
      bg: '#14171b', text: '#e8ecf1', sub: '#93a0ae', line: '#2b333d', line2: '#3a4450',
      faint: '#5d6875', amber: '#eda63d', warn: '#e0604f', dia: '#10141a', diaB: '#2b333d', btnTx: '#1a1206'
    };

    var head = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
      '<title>ErosIris-Link 系统报告 ' + dateStr + '</title><style>' +
      '*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'body{background:' + P.bg + ';color:' + P.text + ';font:13px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:24px}' +
      '.pg{page-break-after:always;padding-bottom:24px}' +
      '.pg:last-child{page-break-after:auto}' +
      'h1{font:700 20px monospace;letter-spacing:.12em;color:' + P.amber + '}' +
      '.sub{color:' + P.sub + ';font-size:12px;margin:4px 0 18px}' +
      'h2{font:700 13px sans-serif;letter-spacing:.1em;color:' + P.sub + ';border-left:3px solid ' + P.amber + ';' +
      'padding-left:8px;margin:22px 0 10px}' +
      '.dia{background:' + P.dia + ';border:1px solid ' + P.diaB + ';border-radius:8px;padding:12px;overflow:hidden}' +
      '.dia svg{max-width:100%;height:auto;display:block;margin:0 auto}' +
      'table{border-collapse:collapse;width:100%;font-size:12px}' +
      'th{text-align:left;font-size:10.5px;letter-spacing:.08em;color:' + P.faint + ';' +
      'border-bottom:1px solid ' + P.line2 + ';padding:6px 8px}' +
      'td{padding:5px 8px;border-bottom:1px solid ' + P.line + ';vertical-align:top}' +
      'td.num{text-align:right;font-family:monospace}' +
      '.dimtx{color:' + P.sub + ';font-size:11px}' +
      'td.arr{color:' + P.amber + '}' +
      '.w{color:' + P.warn + '}' +
      'p.w{font-size:12px;margin:8px 0}' +
      '.note{color:' + P.sub + ';font-size:11.5px;margin:8px 0}' +
      '.st{color:' + P.amber + ';border:1px solid ' + P.amber + ';border-radius:3px;font-size:10px;padding:0 4px}' +
      'tr{page-break-inside:avoid}' +
      '.no-print{position:fixed;top:14px;right:14px}' +
      '.no-print button{background:' + P.amber + ';color:' + P.btnTx + ';border:none;border-radius:6px;' +
      'font:600 14px sans-serif;padding:10px 18px;cursor:pointer}' +
      '@media print{.no-print{display:none}body{padding:0}}' +
      '</style></head><body>' +
      '<div class="no-print"><button onclick="window.print()">打印 / 存为 PDF</button></div>';

    var pages = [];
    var cover = '<h1>EROSIRIS-LINK · 音响系统报告</h1>' +
      '<p class="sub">生成日期：' + dateStr + ' ｜ 设备 ' + st.devices.length +
      ' 台 ｜ 连接 ' + st.connections.length + ' 条</p>';

    if (include('wiringDiagram') || include('deviceList')) {
      var p1 = cover;
      if (include('wiringDiagram')) {
        p1 += '<h2>系统接线示意图</h2>' +
          '<div class="dia">' + (wiringSVGHtml || '<p>（无设备）</p>') + '</div>';
      }
      if (include('deviceList')) {
        p1 += '<h2>设备清单</h2>' +
          '<table><thead><tr><th>设备</th><th>类型</th><th>规格</th><th>输入</th><th>输出</th></tr></thead>' +
          '<tbody>' + (devRows || '<tr><td colspan="5">—</td></tr>') + '</tbody></table>';
      }
      pages.push('<div class="pg">' + p1 + '</div>');
    }

    if (include('connections')) {
      pages.push('<div class="pg">' +
        '<h2>连接清单</h2>' +
        '<table><thead><tr><th>信号源（设备/端口）</th><th></th><th>目标（设备/端口）</th>' +
        '<th>线材 / 长度</th><th>功放参数</th><th>校验</th></tr></thead>' +
        '<tbody>' + (connRows || '<tr><td colspan="6">—</td></tr>') + '</tbody></table>' +
        '</div>');

      /* 网络层（Dante）：网口线 + 调音台 Dante 通道分配（有内容才出页） */
      var netConns = st.connections.filter(function (c) { return c.net; });
      var danteMixers = st.devices.filter(function (d) {
        return d.type === 'mixer' &&
          (Store.danteList(d, 'in').length || Store.danteList(d, 'out').length);
      });
      if (netConns.length || danteMixers.length) {
        var np = '<h2>网络层（Dante）</h2>';
        if (netConns.length) {
          np += '<table><thead><tr><th>设备 A</th><th></th><th>设备 B（端口）</th><th>长度</th></tr></thead><tbody>' +
            netConns.map(function (c) {
              var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
              if (!s || !t) return '';
              var tp = c.tport >= 0 && t.inputs[c.tport] ? t.inputs[c.tport].label : '网口';
              return '<tr><td>' + esc(s.name) + '</td><td class="arr">↔</td>' +
                '<td>' + esc(t.name) + ' / ' + esc(tp) + '</td>' +
                '<td>' + (c.lenM ? esc(c.lenM) + 'm' : '—') + '</td></tr>';
            }).join('') + '</tbody></table>';
        }
        if (danteMixers.length) {
          function danteLabels(d, side) {
            var ports = side === 'in' ? d.inputs : d.outputs;
            return Store.danteList(d, side).map(function (i) {
              return ports[i] ? ports[i].label : '#' + (i + 1);
            }).join('、') || '—';
          }
          np += '<table><thead><tr><th>调音台</th><th>Dante 输入</th><th>Dante 输出</th></tr></thead><tbody>' +
            danteMixers.map(function (d) {
              return '<tr><td>' + esc(d.name) + '</td><td>' + esc(danteLabels(d, 'in')) +
                '</td><td>' + esc(danteLabels(d, 'out')) + '</td></tr>';
            }).join('') + '</tbody></table>' +
            '<p class="note">标记为 Dante 的通道经网口线（交换机）传输，其余通道照常走信号线。</p>';
        }
        pages.push('<div class="pg">' + np + '</div>');
      }
    }

    /* 采购与工程建议页：线材 + 机柜 + 供电 */
    if (include('cableSummary') || include('rackSummary') || include('powerSummary')) {
      var pg = '';
      if (include('cableSummary')) {
        pg += '<h2>线材购买汇总</h2>' +
          '<table><thead><tr><th>线材类型</th><th>长度规格 / 根数</th><th>总长度</th><th>总根数</th><th>状态</th></tr></thead>' +
          '<tbody>' + (cableRows || '<tr><td colspan="5">—</td></tr>') +
          (cableRows ? '<tr><td><b>总计</b></td><td>' +
            (cableTotalMissing ? '<span class="w">另有 ' + cableTotalMissing + ' 根未填长度</span>' : '—') +
            '</td><td class="num"><b>' + cableTotalMeters + ' 米</b></td><td class="num"><b>' +
            cableTotalCount + ' 根</b></td><td>—</td></tr>' : '') +
          '</tbody></table>' +
          '<p class="note">建议按总米数加 10–15% 余量采购；「未填长度」的连线请回「线材清单」页补齐。</p>';
      }
      if (include('rackSummary')) {
        pg += '<h2>机柜长度建议</h2>' +
          '<table style="max-width:420px"><thead><tr><th>设备类型</th><th>合计</th></tr></thead>' +
          '<tbody>' + rackRows + '</tbody></table>' +
          '<p class="note">建议机柜高度：<b>' + rack.suggestMin + ' – ' + rack.suggestMax +
          ' U</b>（设备合计 + 时序器 1U + 预留 3–5U 散热与安装余量）。</p>' + rackMissing;
      }
      if (include('powerSummary')) {
        pg += '<h2>供电功率建议</h2>' +
          '<p class="note">算法：功放与有源音箱额定功率合计 ' + (power.ampW + power.spkW) +
          ' W ÷ 效率 ' + power.eff + ' × 节目负载系数 + 周边固定 ' + power.fixed +
          ' W（调音台×' + power.mixers + ' / DSP×' + power.dsps + ' / 时序器），再乘动态余量 ×' + power.headroom + '。</p>' +
          '<table><thead><tr><th>演出级别</th><th>负载系数</th><th>估算耗电</th><th>含余量</th>' +
          '<th>建议报电</th><th>220V 电流</th><th>建议空开</th><th>供电方式</th></tr></thead>' +
          '<tbody>' + powerRows + '</tbody></table>' + powerMissing +
          '<p class="note">空开按电流 ×1.25 向上取标准档；超过约 7 kW 建议申请三相电并把功放均分到三相。</p>';
      }
      pages.push('<div class="pg">' + pg + '</div>');
    }

    mixerSections.forEach(function (sec) {
      if (sec.kind === 'dsp') {
        var dspPg = '';
        if (include('mixerDiagram')) {
          dspPg += '<h2>DSP 台内路由 · ' + esc(sec.name) + '</h2>' +
            '<div class="dia">' + (sec.svg || '') + '</div>';
        }
        if (include('inputPatch') || include('routes')) {
          dspPg += '<h2>DSP 内部矩阵 · ' + esc(sec.name) + '</h2>' +
            '<table><thead><tr><th>输入</th><th>→ 输出</th></tr></thead>' +
            '<tbody>' + (sec.dspMatrixRows || '<tr><td colspan="2">—</td></tr>') + '</tbody></table>';
        }
        if (include('outputPatch')) {
          dspPg += '<h2>DSP 输出压限保护 · ' + esc(sec.name) + '</h2>' +
            '<table><thead><tr><th>输出口</th><th>RMS Limit</th><th>PEAK Limit</th></tr></thead>' +
            '<tbody>' + (sec.dspLimitRows || '<tr><td colspan="3">—</td></tr>') + '</tbody></table>';
        }
        if (dspPg) pages.push('<div class="pg">' + dspPg + '</div>');
        return;
      }
      var mc = sec.cfg;
      var pgHtml = '';
      if (include('mixerDiagram')) {
        pgHtml += '<h2>台内路由 · ' + esc(sec.name) + ' · ' + mc.physIn + 'IN / ' + mc.channels + 'CH / ' + mc.buses +
          'BUS / ' + (mc.mains || 0) + 'MAIN / ' + mc.matrices + 'MTX / ' + mc.physOut + 'OUT</h2>' +
          '<div class="dia">' + (sec.svg || '') + '</div>';
      }
      if (include('inputPatch')) {
        pgHtml += '<h2>输入分配 · ' + esc(sec.name) + '</h2>' +
          '<table><thead><tr><th>物理输入</th><th>→ CH</th></tr></thead>' +
          '<tbody>' + (sec.inPatchRows || '<tr><td colspan="2">—</td></tr>') + '</tbody></table>';
      }
      if (include('routes')) {
        pgHtml += '<h2>路由清单 · ' + esc(sec.name) + '</h2>' +
          '<table><thead><tr><th>通道</th><th>→ BUS</th><th>→ MAIN</th><th>→ MATRIX</th></tr></thead>' +
          '<tbody>' + (sec.routeRows || '<tr><td colspan="4">—</td></tr>') + '</tbody></table>';
      }
      if (include('outputPatch')) {
        pgHtml += '<h2>输出分配 · ' + esc(sec.name) + '</h2>' +
          '<table><thead><tr><th>源</th><th>→ OUTPUT</th></tr></thead>' +
          '<tbody>' + (sec.outPatchRows || '<tr><td colspan="2">—</td></tr>') + '</tbody></table>';
      }
      if (pgHtml) pages.push('<div class="pg">' + pgHtml + '</div>');
    });

    teachPages.forEach(function (tp) {
      pages.push('<div class="pg"><h2>接线教学 · ' + esc(tp.name) + '</h2>' +
        '<div class="dia">' + tp.svg + '</div></div>');
    });

    if (include('gear')) {
      pages.push('<div class="pg"><h2>输入设备清单（话筒 / 乐器）</h2>' +
        '<table><thead><tr><th>名称</th><th>备注（DI盒 / 中间设备等）</th></tr></thead>' +
        '<tbody>' + (gearRows || '<tr><td colspan="2">—</td></tr>') + '</tbody></table></div>');
    }
    if (!pages.length) pages.push('<div class="pg">' + cover + '<p class="sub">未选择任何报告内容。</p></div>');

    /* 6：目录侧栏 —— 每个 h2 编 id，生成悬浮 TOC，打印时隐藏 */
    var body = pages.join('');
    var toc = [];
    var secIdx = 0;
    body = body.replace(/<h2>([\s\S]*?)<\/h2>/g, function (m, txt) {
      var id = 'sec-' + (secIdx++);
      toc.push({ id: id, txt: txt.replace(/<[^>]+>/g, '') });
      return '<h2 id="' + id + '">' + txt + '</h2>';
    });
    var tocHtml = '';
    if (toc.length > 1) {
      tocHtml = '<style>@media screen{body{padding-left:196px}}' +
        '.toc{position:fixed;left:12px;top:14px;width:168px;max-height:90vh;overflow:auto;' +
        'background:' + P.dia + ';border:1px solid ' + P.diaB + ';border-radius:8px;padding:10px 12px;font-size:11px}' +
        '.toc b{display:block;color:' + P.amber + ';margin-bottom:6px;font-size:11.5px;letter-spacing:.08em}' +
        '.toc a{display:block;color:' + P.sub + ';text-decoration:none;padding:2.5px 0;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.toc a:hover{color:' + P.amber + '}' +
        '@media print{.toc{display:none}}</style>' +
        '<nav class="toc"><b>目录</b>' + toc.map(function (t) {
          return '<a href="#' + t.id + '">' + t.txt + '</a>';
        }).join('') + '</nav>';
    }
    return head + tocHtml + body + '</body></html>';
  }

  /* ---------- CSV（Excel 兼容，UTF-8 BOM）：报告导出与批量导入共用 ---------- */

  SP.csvBuild = function (rows) {
    return '\ufeff' + rows.map(function (r) {
      return r.map(function (v) {
        v = v === undefined || v === null ? '' : String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\r\n');
  };
  SP.csvDownload = function (filename, rows) {
    var blob = new Blob([SP.csvBuild(rows)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = SP.exportFilename ? SP.exportFilename(filename) : filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };
  SP.csvParse = function (text) {
    text = String(text || '').replace(/^\ufeff/, '');
    var rows = [], row = [], cur = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
        } else cur += ch;
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === ',') {
        row.push(cur); cur = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        rows.push(row); row = [];
      } else {
        cur += ch;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (v) { return String(v).trim() !== ''; });
    });
  };

  /* 6：报告 Excel 导出（按勾选局部导出；设备按型号合并计数） */
  function exportExcel(opt) {
    var st = Store.state;
    var files = 0;
    if (opt.deviceList !== false) {
      var groups = {}, order = [];
      st.devices.forEach(function (d) {
        var base = Store.baseNameOf(d.name) || d.name;
        var key = d.type + '::' + base;
        if (!groups[key]) { groups[key] = { base: base, d: d, n: 0 }; order.push(key); }
        groups[key].n++;
      });
      var rows = [['型号', '数量', '类型', '规格', '输入路数', '输出路数']];
      order.forEach(function (k) {
        var g = groups[k];
        rows.push([g.base, g.n,
          Store.typeInfo(g.d.type).name +
          (g.d.type === 'speaker' ? '·' + SP.speakerRoleInfo(g.d.speakerRole).name : ''),
          SP.specString(g.d) || '', g.d.inputs.length, Store.visibleOuts(g.d).length]);
      });
      SP.csvDownload('ErosIris-Link-设备清单.csv', rows);
      files++;
    }
    if (opt.connections !== false) {
      var conns = st.connections.slice();
      if (SP.connHierSort) SP.connHierSort(conns);
      var rows2 = [['信号源设备', '输出口', '目标设备', '输入口', '线材', '长度m', '备注']];
      conns.forEach(function (c) {
        var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
        if (!s || !t) return;
        rows2.push([s.name, Store.outLabelOf(s, c.sport), t.name,
          (t.inputs[c.tport] || {}).label || (c.net ? '网口' : ''),
          Store.cableOf(c), c.lenM || '', c.note || '']);
      });
      SP.csvDownload('ErosIris-Link-连接清单.csv', rows2);
      files++;
    }
    if (opt.cableSummary !== false) {
      var rows3 = [['线材类型', '数量(根)', '总长度(米)', '未填长度(根)']];
      Store.cableSummary().forEach(function (g) {
        rows3.push([g.type, g.count, g.meters || '', g.missing || 0]);
      });
      SP.csvDownload('ErosIris-Link-线材汇总.csv', rows3);
      files++;
    }
    SP.toast(files ? '已导出 ' + files + ' 个 Excel（CSV）文件' : '请至少勾选 设备清单/连接清单/线材购买汇总 之一', !files);
  }

  SP.openReport = function (opt) {
    var w = window.open('', '_blank');
    if (!w) { alert('浏览器拦截了新窗口，请允许本页打开弹窗后重试。'); return; }
    w.document.write(reportHTML(opt));
    w.document.close();
  };

  SP.openReportOptions = function () {
    var items = [
      ['wiringDiagram', '系统接线示意图', true],
      ['deviceList', '设备清单', true],
      ['connections', '连接清单', true],
      ['cableSummary', '线材购买汇总', true],
      ['rackSummary', '机柜长度建议', true],
      ['powerSummary', '供电功率建议', true],
      ['mixerDiagram', '台内信号流向图（调音台 / DSP）', true],
      ['inputPatch', '输入分配', true],
      ['routes', '路由清单', true],
      ['outputPatch', '输出分配', true],
      ['teachPages', '接线教学页（每台设备一页）', false],
      ['gear', '输入设备清单', true]
    ];
    /* 点击条目名称 → 预览滚动到对应章节的关键词映射 */
    var JUMP = {
      wiringDiagram: '系统接线示意图', deviceList: '设备清单', connections: '连接清单',
      cableSummary: '线材购买汇总', rackSummary: '机柜长度建议', powerSummary: '供电功率建议',
      mixerDiagram: '台内路由', inputPatch: '输入分配', routes: '路由清单',
      outputPatch: '输出分配', teachPages: '接线教学', gear: '输入设备清单'
    };
    var overlay = el('modal-overlay');
    var box = el('modal-box');
    box.classList.add('modal-wide');
    box.innerHTML = '<div class="modal-head"><h3>选择报告内容</h3>' +
      '<span class="head-note">点名称可跳转预览章节</span>' +
      '<button class="btn icon" data-close-modal>✕</button></div>' +
      '<div class="modal-body report-preview-body">' +
      '<div class="report-options">' +
      '<div style="display:flex;gap:6px">' +
      '<button class="btn ghost sm" id="report-all">全选</button>' +
      '<button class="btn ghost sm" id="report-none">全不选</button></div>' +
      items.map(function (it) {
        return '<label><input type="checkbox" data-report-part="' + it[0] + '"' +
          (it[2] ? ' checked' : '') + '> <span class="report-jump" data-jump="' + it[0] + '">' +
          esc(it[1]) + '</span></label>';
      }).join('') +
      '<label class="report-light-row"><input type="checkbox" data-report-light> 浅色打印版（白底省墨）</label>' +
      '</div>' +
      '<iframe class="report-preview" id="report-preview" title="报告预览"></iframe>' +
      '</div><div class="modal-foot">' +
      '<button class="btn ghost" data-close-modal>取消</button>' +
      '<button class="btn ghost" id="report-excel" title="导出勾选的 设备清单(同型号合并计数)/连接清单/线材汇总 为 Excel 可打开的 CSV">导出 Excel</button>' +
      '<button class="btn primary" id="report-generate">生成报告</button></div>';
    overlay.hidden = false;
    function currentOpt() {
      var opt = {};
      box.querySelectorAll('[data-report-part]').forEach(function (cb) {
        opt[cb.dataset.reportPart] = cb.checked;
      });
      var lightCb = box.querySelector('[data-report-light]');
      opt.light = !!(lightCb && lightCb.checked);
      return opt;
    }
    function updatePreview() {
      el('report-preview').srcdoc = reportHTML(currentOpt());
    }
    box.querySelectorAll('[data-report-part], [data-report-light]').forEach(function (cb) {
      cb.addEventListener('change', updatePreview);
    });
    /* 19：全选 / 全不选 */
    function setAll(v) {
      box.querySelectorAll('[data-report-part]').forEach(function (cb) { cb.checked = v; });
      updatePreview();
    }
    el('report-all').addEventListener('click', function () { setAll(true); });
    el('report-none').addEventListener('click', function () { setAll(false); });
    /* 6：点条目名称 → 预览跳到对应章节 */
    box.querySelectorAll('.report-jump').forEach(function (sp) {
      sp.addEventListener('click', function (e) {
        e.preventDefault();
        var kw = JUMP[sp.dataset.jump];
        var frame = el('report-preview');
        try {
          var doc = frame.contentDocument;
          if (!doc || !kw) return;
          var hs = doc.querySelectorAll('h2');
          for (var i = 0; i < hs.length; i++) {
            if (hs[i].textContent.indexOf(kw) >= 0) {
              hs[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
              return;
            }
          }
          SP.toast('该章节未勾选或报告中无内容', true);
        } catch (err) { /* srcdoc 尚未就绪时忽略 */ }
      });
    });
    updatePreview();
    el('report-excel').addEventListener('click', function () {
      exportExcel(currentOpt());
    });
    el('report-generate').addEventListener('click', function () {
      var opt = currentOpt();
      overlay.hidden = true;
      box.innerHTML = '';
      box.classList.remove('modal-wide');
      SP.openReport(opt);
    });
  };
})();
