/* ============================================================
   mixer.js — 功能二：调音台内部信号路由
   配置（内置+自定义模板）/ 勾选矩阵（支持 CH 立体声链接）/ 清单
   ============================================================ */

(function () {
  var Store = SP.Store;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }
  function clampN(v, lo, hi) { return Math.max(lo, Math.min(hi, +v || lo)); }

  /* ================= 台面配置 ================= */

  SP.renderMixerConfig = function () {
    var m = Store.activeMixer();
    var userTpls = Store.state.userMixerTemplates;

    var userRows = userTpls.map(function (t, i) {
      return '<div class="utpl-row">' +
        '<span class="utpl-name" title="' + esc(t.name) + '">' + esc(t.name) + '</span>' +
        '<span class="utpl-io">' + t.channels + 'CH/' + t.buses + 'B/' + (t.mains || 0) + 'MAIN/' +
        t.matrices + 'MTX</span>' +
        '<button class="btn ghost sm utpl-apply" data-i="' + i + '">应用</button>' +
        '<button class="btn icon utpl-del" data-i="' + i + '" title="删除模板">✕</button>' +
        '</div>';
    }).join('');

    el('mixer-config').innerHTML =
      '<div class="cfg-field"><label>台面模板（自定义）</label>' +
      (userRows || '<p class="cfg-note" style="margin-top:0">还没有保存过。配置好当前台面后点下方按钮保存。</p>') +
      '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">' +
      '<button class="btn ghost sm" id="mx-add-tpl">新增模板</button>' +
      '<button class="btn ghost sm" id="mx-save-tpl">保存当前为模板</button>' +
      '</div></div>' +

      '<div class="cfg-inline">' +
      '<div class="cfg-field"><label>物理输入数量</label>' +
      '<input type="number" id="mx-physin" min="1" max="128" value="' + m.physIn + '"></div>' +
      '<div class="cfg-field"><label>物理输出数量</label>' +
      '<input type="number" id="mx-physout" min="1" max="128" value="' + m.physOut + '"></div>' +
      '<div class="cfg-field"><label>CH 通道数量</label>' +
      '<input type="number" id="mx-ch" min="1" max="128" value="' + m.channels + '"></div>' +
      '<div class="cfg-field"><label>BUS 数量</label>' +
      '<input type="number" id="mx-bus" min="0" max="64" value="' + m.buses + '"></div>' +
      '<div class="cfg-field"><label>MAIN 数量</label>' +
      '<input type="number" id="mx-main-count" min="0" max="64" value="' + (m.mains || 0) + '"></div>' +
      '<div class="cfg-field"><label>MATRIX 数量</label>' +
      '<input type="number" id="mx-mtx" min="0" max="64" value="' + m.matrices + '"></div>' +
      '</div>' +
      '<div class="cfg-field"><label>主输出声道</label>' +
      '<div class="radio-row">' +
      '<label><input type="radio" name="mx-main" value="LR"' + (m.mainMode === 'LR' ? ' checked' : '') + '> L / R</label>' +
      '<label><input type="radio" name="mx-main" value="Mono"' + (m.mainMode === 'Mono' ? ' checked' : '') + '> Mono</label>' +
      '</div></div>' +
      '<p class="cfg-note">信号流向：物理输入 → CH → BUS / MAIN / MATRIX → 物理输出。<br>' +
      '矩阵行首点「ST」可将相邻通道（1-2、3-4…）链接为立体声对。<br>' +
      '缩小数量时，超出范围的路由与链接会自动清理。</p>';

    function saveCurrentTemplate(name) {
      if (name === null) return;
      name = String(name || '').trim();
      if (!name) { alert('名称不能为空'); return; }
      Store.saveMixerTemplate(name);
      SP.renderMixerConfig();
    }

    el('mx-add-tpl').addEventListener('click', function () {
      var name = prompt('新模板名称：', '新台面模板');
      saveCurrentTemplate(name);
    });
    el('mx-save-tpl').addEventListener('click', function () {
      var name = prompt('模板名称（例如：周末驻场 · 16CH 标准路由）：');
      saveCurrentTemplate(name);
    });

    el('mixer-config').querySelectorAll('.utpl-apply').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = Store.state.userMixerTemplates[+b.dataset.i];
        if (!t) return;
        Store.applyMixerTemplate(t);
        SP.renderMixerView();
        if (SP.toast) SP.toast('已应用台面模板「' + t.name + '」（⌘Z 可撤销）');
      });
    });
    el('mixer-config').querySelectorAll('.utpl-del').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = Store.state.userMixerTemplates[+b.dataset.i];
        if (!t) return;
        Store.removeMixerTemplate(+b.dataset.i);
        SP.renderMixerConfig();
        if (SP.toast) SP.toast('已删除台面模板「' + t.name + '」（⌘Z 可撤销）');
      });
    });

    function applyNumbers() {
      Store.setMixerConfig({
        physIn: clampN(el('mx-physin').value, 1, 128),
        physOut: clampN(el('mx-physout').value, 1, 128),
        channels: clampN(el('mx-ch').value, 1, 128),
        buses: clampN(el('mx-bus').value, 0, 64),
        mains: clampN(el('mx-main-count').value, 0, 64),
        matrices: clampN(el('mx-mtx').value, 0, 64)
      });
      SP.renderMixerView();
    }
    ['mx-physin', 'mx-physout', 'mx-ch', 'mx-bus', 'mx-main-count', 'mx-mtx'].forEach(function (id) {
      el(id).addEventListener('change', applyNumbers);
    });
    el('mixer-config').querySelectorAll('input[name="mx-main"]').forEach(function (r) {
      r.addEventListener('change', function () {
        Store.setMixerConfig({ mainMode: this.value });
        SP.renderMixerView();
      });
    });
  };

  /* ================= 输入路由矩阵（物理输入 → CH） ================= */

  SP.renderInputPatchGrid = function () {
    var m = Store.activeMixer();
    var host = el('in-route-grid-wrap');
    var count = 0;

    var reset = el('btn-inpatch-reset');
    if (reset) {
      reset.onclick = function () {
        Store.resetInPatch();
        SP.renderInputPatchGrid();
        SP.renderMixerDiagram(el('mixer-diagram'));
      };
    }
    var doublePatch = el('btn-inpatch-double');
    if (doublePatch) {
      doublePatch.onclick = function () {
        Store.doubleInPatch();
        SP.renderInputPatchGrid();
        SP.renderMixerDiagram(el('mixer-diagram'));
      };
    }

    if (!m.physIn || !m.channels) {
      host.innerHTML = '<div class="empty-hint">当前没有可用的物理输入或 CH 通道。</div>';
      el('input-patch-count').textContent = '';
      return;
    }

    var head = '<tr><th class="rowhead rowhead-corner">输入 ＼ CH</th>';
    for (var ch = 0; ch < m.channels; ch++) {
      head += '<th class="grp-in">CH ' + (ch + 1) + '</th>';
    }
    head += '</tr>';

    var body = '';
    for (var i = 0; i < m.physIn; i++) {
      body += '<tr><th class="rowhead">IN ' + (i + 1) + '</th>';
      for (var c = 0; c < m.channels; c++) {
        var on = Store.hasInPatch(i, c);
        if (on) count++;
        body += '<td><button class="rcell c-in' + (on ? ' on' : '') + '" data-in="' + i +
          '" data-ch="' + c + '" title="IN ' + (i + 1) + ' → CH ' + (c + 1) + '"></button></td>';
      }
      body += '</tr>';
    }

    host.innerHTML = '<table class="route-grid"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
    el('input-patch-count').textContent = count
      ? count + ' 条输入分配' + (Store.inPatchIsIdentity() ? ' · 1:1' : '')
      : '尚无输入分配';

    host.querySelectorAll('.rcell').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Store.toggleInPatch(+btn.dataset.in, +btn.dataset.ch);
        SP.renderInputPatchGrid();
        SP.renderMixerDiagram(el('mixer-diagram'));
      });
    });
  };

  /* ================= 路由勾选矩阵（支持 ST 链接行合并） ================= */

  SP.renderRouteGrid = function () {
    var m = Store.activeMixer();
    var mains = Store.mainTargets();

    var cols = [];
    for (var b = 0; b < m.buses; b++) cols.push({ id: 'b' + b, label: 'B' + (b + 1), grp: 'bus' });
    mains.forEach(function (t) {
      cols.push({ id: t.id, label: t.label.replace(/^MAIN\s*/i, ''), grp: 'main' });
    });
    for (var x = 0; x < m.matrices; x++) cols.push({ id: 'x' + x, label: 'M' + (x + 1), grp: 'mtx' });

    if (!cols.length) {
      el('route-grid-wrap').innerHTML = '<div class="empty-hint">当前没有可用的发送目标。</div>';
      return;
    }

    var head = '<tr><th class="rowhead rowhead-corner">通道 ＼ 目标</th>';
    cols.forEach(function (c, i) {
      var grpStart = (i === 0 || cols[i - 1].grp !== c.grp) ? ' grp-start' : '';
      head += '<th class="grp-' + c.grp + grpStart + '" title="' +
        (c.grp === 'bus' ? 'BUS' : c.grp === 'mtx' ? 'MATRIX' : 'MAIN') + '">' + esc(c.label) + '</th>';
    });
    head += '</tr>';

    function cellRow(anchor, tipLabel) {
      var tds = '';
      for (var k = 0; k < cols.length; k++) {
        var c = cols[k];
        var grpStart = (k === 0 || cols[k - 1].grp !== c.grp) ? ' class="grp-start"' : '';
        var on = Store.hasRoute(anchor, c.id);
        tds += '<td' + grpStart + '>' +
          '<button class="rcell c-' + c.grp + (on ? ' on' : '') + '" data-ch="' + anchor +
          '" data-t="' + c.id + '" title="' + tipLabel + ' → ' +
          (c.grp === 'bus' ? 'BUS ' + c.label.slice(1) : c.grp === 'mtx' ? 'MATRIX ' + c.label.slice(1) : 'MAIN ' + c.label) +
          '"></button></td>';
      }
      return tds;
    }

    var body = '';
    for (var ci = 0; ci < m.channels; ci++) {
      var isAnchor = m.links.indexOf(ci) >= 0;
      if (isAnchor) {
        var lbl = 'CH ' + (ci + 1) + '-' + (ci + 2);
        body += '<tr class="row-st"><th class="rowhead">' +
          '<button class="link-btn on" data-link="' + ci + '" title="取消立体声链接">ST</button>' +
          lbl + '</th>' + cellRow(ci, lbl + ' (ST)') + '</tr>';
        ci++; /* 跳过被链接的下一通道 */
        continue;
      }
      var linkBtn = '';
      if (ci % 2 === 0 && ci + 1 < m.channels) {
        linkBtn = '<button class="link-btn" data-link="' + ci + '" title="与 CH ' +
          (ci + 2) + ' 链接为立体声对">ST</button>';
      }
      body += '<tr><th class="rowhead">' + linkBtn + 'CH ' + (ci + 1) + '</th>' +
        cellRow(ci, 'CH ' + (ci + 1)) + '</tr>';
    }

    var host = el('route-grid-wrap');
    host.innerHTML = '<table class="route-grid"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';

    host.querySelectorAll('.rcell').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Store.toggleRoute(+btn.dataset.ch, btn.dataset.t);
        btn.classList.toggle('on');
        SP.renderMixerDiagram(el('mixer-diagram'));
        SP.renderMixerTable();
      });
    });
    host.querySelectorAll('.link-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Store.toggleLink(+btn.dataset.link);
        SP.renderRouteGrid();
        SP.renderMixerDiagram(el('mixer-diagram'));
        SP.renderMixerTable();
      });
    });
  };

  /* ================= 输出路由矩阵（BUS / MAIN / MATRIX → 物理输出） ================= */

  SP.renderOutputPatchGrid = function () {
    var m = Store.activeMixer();
    var host = el('out-route-grid-wrap');
    var sources = Store.outPatchSources();
    var count = 0;

    if (!sources.length || !m.physOut) {
      host.innerHTML = '<div class="empty-hint">当前没有可用的发送源或物理输出。</div>';
      el('output-patch-count').textContent = '';
      return;
    }

    var head = '<tr><th class="rowhead rowhead-corner">源 ＼ OUTPUT</th>';
    for (var o = 0; o < m.physOut; o++) {
      head += '<th class="grp-out">OUT ' + (o + 1) + '</th>';
    }
    head += '</tr>';

    var body = sources.map(function (s) {
      var tr = '<tr><th class="rowhead">' + esc(s.label) + '</th>';
      for (var oi = 0; oi < m.physOut; oi++) {
        var on = Store.hasOutPatch(s.id, oi);
        if (on) count++;
        tr += '<td><button class="rcell c-' + s.grp + (on ? ' on' : '') + '" data-src="' + s.id +
          '" data-out="' + oi + '" title="' + esc(s.label) + ' → OUT ' + (oi + 1) + '"></button></td>';
      }
      return tr + '</tr>';
    }).join('');

    host.innerHTML = '<table class="route-grid"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
    el('output-patch-count').textContent = count ? count + ' 条输出分配' : '尚无输出分配';

    host.querySelectorAll('.rcell').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Store.toggleOutPatch(btn.dataset.src, +btn.dataset.out);
        SP.renderOutputPatchGrid();
        SP.renderMixerDiagram(el('mixer-diagram'));
      });
    });
  };

  /* ================= 路由清单表格 ================= */

  function targetName(t) {
    if (t[0] === 'b') return 'BUS ' + (+t.slice(1) + 1);
    if (t[0] === 'm') {
      var mains = Store.mainTargets();
      for (var i = 0; i < mains.length; i++) if (mains[i].id === t) return mains[i].label;
      return 'MAIN ' + (+t.slice(1) + 1);
    }
    if (t[0] === 'x') return 'MTX ' + (+t.slice(1) + 1);
    if (t === 'ML') return 'MAIN L';
    if (t === 'MR') return 'MAIN R';
    if (t === 'MM') return 'MAIN M';
    return t;
  }

  /* 供表格与报告复用：返回 [{ch, st, buses, mtxs, mains}] */
  SP.mixerRouteRows = function () {
    var m = Store.activeMixer();
    var out = [];
    for (var ci = 0; ci < m.channels; ci++) {
      var isAnchor = m.links.indexOf(ci) >= 0;
      var label = isAnchor ? 'CH ' + (ci + 1) + '-' + (ci + 2) : 'CH ' + (ci + 1);
      var r = Store.chRoutes(ci);
      if (r.length) {
        var buses = [], mtxs = [], mains = [];
        r.forEach(function (t) {
          if (t[0] === 'b') buses.push(targetName(t));
          else if (t[0] === 'x') mtxs.push(targetName(t));
          else mains.push(targetName(t));
        });
        out.push({ ch: label, st: isAnchor, buses: buses, mtxs: mtxs, mains: mains });
      }
      if (isAnchor) ci++;
    }
    return out;
  };

  SP.renderMixerTable = function () {
    var host = el('mixer-table-wrap');
    var rows = SP.mixerRouteRows();

    el('mixer-count').textContent = rows.length ? rows.length + ' 个通道有路由' : '';
    if (!rows.length) {
      host.innerHTML = '<div class="empty-hint">尚无路由。在上方矩阵中点选即可建立 CH → BUS / MAIN / MATRIX 的发送关系。</div>';
      return;
    }
    var html = rows.map(function (r) {
      return '<tr' + (r.st ? ' class="row-st"' : '') + '>' +
        '<td class="cell-dev">' + esc(r.ch) +
        (r.st ? ' <span class="tag st">ST</span>' : '') + '</td>' +
        '<td class="cell-port">' + (r.buses.join(', ') || '—') + '</td>' +
        '<td class="cell-port">' + (r.mains.join(', ') || '—') + '</td>' +
        '<td class="cell-port">' + (r.mtxs.join(', ') || '—') + '</td>' +
        '</tr>';
    }).join('');
    host.innerHTML = '<table class="sheet"><thead><tr>' +
      '<th>通道</th><th>→ BUS</th><th>→ MAIN</th><th>→ MATRIX</th>' +
      '</tr></thead><tbody>' + html + '</tbody></table>';
  };

  /* ================= 汇总渲染 ================= */

  /* 调音台 + DSP 页选择条 —— 每台设备各自一页内部路由 */
  SP.routePageId = SP.routePageId || '';

  function routePageDev() {
    var d = Store.getDevice(SP.routePageId);
    if (d && (d.type === 'mixer' || d.type === 'dsp')) return d;
    var list = Store.state.devices.filter(function (x) {
      return x.type === 'mixer' || x.type === 'dsp';
    });
    return list[0] || Store.activeMixerDev();
  }

  function syncSelectedRouteDev(d) {
    if (!d) return;
    SP.selectedDeviceId = d.id;
    SP.multiSelected = [];
    SP.renderInspector();
    var dia = el('wiring-diagram');
    if (dia && SP.applyDiagramSelection) SP.applyDiagramSelection(dia);
  }

  SP.renderMixerPages = function () {
    var host = el('mixer-page-list');
    if (!host) return;
    var devs = Store.state.devices.filter(function (d) {
      return d.type === 'mixer' || d.type === 'dsp';
    });
    var cur = routePageDev();
    var note = el('mixer-page-note');
    if (note) note.textContent = devs.length ? devs.length + ' 台 · 各自独立路由' : '';
    if (!devs.length) {
      host.innerHTML = '<div class="empty-hint">尚未添加调音台或 DSP。<br>下方为独立台面配置，不与设备绑定。</div>';
      return;
    }
    host.innerHTML = '<div class="mixer-pages">' + devs.map(function (d) {
      var on = cur && d.id === cur.id;
      var io = d.type === 'mixer'
        ? (d.mixer ? d.mixer.channels : d.inputs.length) + 'CH'
        : d.inputs.length + '进' + d.outputs.length + '出';
      return '<button class="mixer-page-btn' + (on ? ' on' : '') + '" data-mixpage="' + d.id +
        '" title="' + esc(d.name) + '">' +
        '<span class="type-chip" style="background:' + esc(d.color || SP.typeColor(d.type)) + '">' +
        esc(Store.typeInfo(d.type).name) + '</span>' + esc(d.name) +
        '<span class="mp-io">' + io + '</span></button>';
    }).join('') + '</div>';
  };

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-mixpage]');
    if (!b) return;
    var d = Store.getDevice(b.dataset.mixpage);
    if (!d) return;
    SP.routePageId = d.id;
    if (d.type === 'mixer') Store.setActiveMixer(d.id);
    syncSelectedRouteDev(d);
    SP.renderMixerView();
  });

  /* ---------- DSP 页：内部矩阵（IN × OUT）+ 每路输出 RMS/PEAK 压限 ---------- */

  function renderDspView(d) {
    var r = Store.ensureDspRoute(d);

    /* 台面配置区 → DSP 说明 + 压限表 */
    el('mixer-config').innerHTML =
      '<p class="cfg-note" style="margin-top:0">' + esc(d.name) + ' · ' +
      d.inputs.length + ' 进 ' + d.outputs.length + ' 出。<br>' +
      '右侧矩阵点选 IN → OUT 的内部分配；每路输出可填 RMS / PEAK 压限（Limit）保护值，' +
      '数据与设备栏联动，纳入报告。</p>';

    /* 输入矩阵区 → IN × OUT 矩阵 */
    var head = '<tr><th class="rowhead rowhead-corner">IN ＼ OUT</th>';
    for (var o = 0; o < d.outputs.length; o++) head += '<th class="grp-out">OUT ' + (o + 1) + '</th>';
    head += '</tr>';
    var body = '';
    var count = 0;
    for (var i = 0; i < d.inputs.length; i++) {
      body += '<tr><th class="rowhead">' + esc(d.inputs[i].label) + '</th>';
      for (var o2 = 0; o2 < d.outputs.length; o2++) {
        var on = Store.hasDspRoute(d, i, o2);
        if (on) count++;
        body += '<td><button class="rcell c-out' + (on ? ' on' : '') + '" data-dsp-in="' + i +
          '" data-dsp-out="' + o2 + '" title="' + esc(d.inputs[i].label) + ' → OUT ' + (o2 + 1) + '"></button></td>';
      }
      body += '</tr>';
    }
    var grid = el('in-route-grid-wrap');
    grid.innerHTML = '<table class="route-grid"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
    el('input-patch-count').textContent = count ? count + ' 条内部分配' : '尚无内部分配';
    grid.querySelectorAll('.rcell').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Store.toggleDspRoute(d.id, +btn.dataset.dspIn, +btn.dataset.dspOut);
        SP.renderMixerView();
      });
    });

    /* 发送/输出矩阵区：DSP 页不适用 */
    el('route-grid-wrap').innerHTML = '<div class="empty-hint">DSP 页无发送矩阵。IN→OUT 分配见上方内部矩阵。</div>';
    el('out-route-grid-wrap').innerHTML = '<div class="empty-hint">DSP 页无输出分配矩阵。</div>';

    /* 信号流向图：IN → OUT 两列 */
    var t = SP.diagramTheme();
    var nodeW = 84, nodeH = 18, gapY = 8, gapX = 170, margin = 40, titleH = 30;
    var maxN = Math.max(d.inputs.length, d.outputs.length, 1);
    var totalH = titleH + margin + maxN * (nodeH + gapY) + margin;
    var totalW = margin * 2 + nodeW * 2 + gapX;
    function yOf(count, i) {
      var colH = count * (nodeH + gapY) - gapY;
      return titleH + margin + (maxN * (nodeH + gapY) - gapY - colH) / 2 + i * (nodeH + gapY);
    }
    var svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + totalW + '" height="' + totalH +
      '" viewBox="0 0 ' + totalW + ' ' + totalH + '">'];
    Object.keys(r.matrix).forEach(function (ik) {
      (r.matrix[ik] || []).forEach(function (oi) {
        var y1 = yOf(d.inputs.length, +ik) + nodeH / 2;
        var y2 = yOf(d.outputs.length, oi) + nodeH / 2;
        var x1 = margin + nodeW, x2 = margin + nodeW + gapX;
        var dx = gapX / 2;
        svg.push('<path fill="none" stroke="#4fbf8b" stroke-width="1.3" opacity=".8" d="M' +
          x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 + ' ' + x2 + ' ' + y2 + '"/>');
      });
    });
    function col(x, title, ports, isOut) {
      svg.push('<text x="' + (x + nodeW / 2) + '" y="' + (titleH - 6) + '" text-anchor="middle" fill="' +
        t.faint + '" font-size="10" font-weight="700">' + esc(title) + '</text>');
      ports.forEach(function (p, i) {
        var y = yOf(ports.length, i);
        var lm = isOut ? (r.limits[i] || {}) : null;
        svg.push('<rect x="' + x + '" y="' + y + '" width="' + nodeW + '" height="' + nodeH +
          '" rx="3" fill="' + t.nodeFill + '" stroke="' + t.nodeStroke + '"/>');
        svg.push('<text x="' + (x + nodeW / 2) + '" y="' + (y + 12.5) + '" text-anchor="middle" fill="' +
          t.dim + '" font-size="9" font-family="Menlo,monospace">' + esc(p.label) + '</text>');
        if (lm && (lm.rms || lm.peak)) {
          svg.push('<text x="' + (x + nodeW + 6) + '" y="' + (y + 12.5) + '" fill="#eda63d" font-size="8">' +
            esc((lm.rms ? 'RMS ' + lm.rms : '') + (lm.peak ? ' PK ' + lm.peak : '')) + '</text>');
        }
      });
    }
    col(margin, '输入', d.inputs, false);
    col(margin + nodeW + gapX, '输出 · Limit', d.outputs, true);
    svg.push('</svg>');
    el('mixer-diagram').innerHTML = svg.join('');

    /* 路由清单区 → 压限编辑表 */
    var rows = d.outputs.map(function (p, oi) {
      var lm = r.limits[oi] || {};
      return '<tr><td class="cell-port">' + esc(p.label) + '</td>' +
        '<td><input type="text" class="conn-note dsp-lim" data-out="' + oi + '" data-k="rms" value="' +
        esc(lm.rms || '') + '" placeholder="如 -6dB / 100W"></td>' +
        '<td><input type="text" class="conn-note dsp-lim" data-out="' + oi + '" data-k="peak" value="' +
        esc(lm.peak || '') + '" placeholder="如 -3dB / 400W"></td></tr>';
    }).join('');
    el('mixer-table-wrap').innerHTML =
      '<table class="sheet"><thead><tr><th>输出口</th><th>RMS Limit（长期压限保护）</th>' +
      '<th>PEAK Limit（峰值压限保护）</th></tr></thead><tbody>' + rows + '</tbody></table>';
    el('mixer-count').textContent = d.name + ' · 输出压限';
    el('mixer-table-wrap').querySelectorAll('.dsp-lim').forEach(function (inp) {
      inp.addEventListener('change', function () {
        Store.setDspLimit(d.id, +inp.dataset.out, inp.dataset.k, inp.value);
        SP.renderMixerView();
      });
    });
  }

  SP.renderMixerView = function () {
    var cur = routePageDev();
    if (cur) SP.routePageId = cur.id;
    if (cur && cur.type === 'mixer' &&
        (!Store.activeMixerDev() || Store.activeMixerDev().id !== cur.id)) {
      Store.setActiveMixer(cur.id);
    }
    /* 活动调音台失效时自动切到第一台 */
    var mds = Store.mixerDevices();
    if (!cur && mds.length) {
      Store.setActiveMixer(mds[0].id);
      cur = mds[0];
    }
    SP.renderMixerPages();
    if (cur && cur.type === 'dsp') {
      renderDspView(cur);
      return;
    }
    SP.renderMixerConfig();
    SP.renderInputPatchGrid();
    SP.renderRouteGrid();
    SP.renderOutputPatchGrid();
    SP.renderMixerDiagram(el('mixer-diagram'));
    SP.renderMixerTable();
  };
})();
