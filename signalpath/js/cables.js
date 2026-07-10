/* ============================================================
   cables.js — 线材清单（独立页）
   按线材类型汇总根数/总米数/待补长度，明细可直接编辑。
   ============================================================ */

(function () {
  var Store = SP.Store;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }
  function fmtLen(n) {
    return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '') + ' m';
  }
  function lengthSummaryHtml(g) {
    var list = g.lengthBreakdown || [];
    if (!list.length) return '<div class="cable-card-lengths muted">长度规格待补</div>';
    return '<div class="cable-card-lengths">' + list.map(function (x) {
      return '<span><b>' + esc(fmtLen(x.len)) + '</b><em>' + x.count + '根</em></span>';
    }).join('') + '</div>';
  }

  SP.renderCables = function () {
    var sumHost = el('cable-summary');
    var tblHost = el('cable-table-wrap');
    if (!sumHost || !tblHost) return;

    var groups = Store.cableSummary();
    var note = el('cable-page-note');
    if (note) {
      var total = 0;
      groups.forEach(function (g) { total += g.count; });
      note.textContent = total ? total + ' 条连接' : '';
    }

    /* --- 汇总卡片 --- */
    if (!groups.length) {
      sumHost.innerHTML = '<div class="empty-hint">还没有连线。回「设备连线」页搭好系统后，这里自动生成购线汇总。</div>';
      tblHost.innerHTML = '';
      return;
    }
    var grandCount = 0, grandMeters = 0, grandMissing = 0;
    groups.forEach(function (g) {
      grandCount += g.count;
      grandMeters += g.meters || 0;
      grandMissing += g.missing || 0;
    });
    grandMeters = Math.round(grandMeters * 10) / 10;
    sumHost.innerHTML = groups.map(function (g) {
      return '<div class="cable-card">' +
        '<div class="cable-card-type">' + esc(g.type) + '</div>' +
        lengthSummaryHtml(g) +
        '<div class="cable-card-nums">合计 <b>' + g.count + '</b> 根 · <b>' +
        (g.meters ? g.meters : '—') + '</b> 米</div>' +
        (g.missing
          ? '<div class="cable-card-missing">⚠ ' + g.missing + ' 根未填长度</div>'
          : '<div class="cable-card-ok">长度已齐</div>') +
        '</div>';
    }).join('') +
      '<div class="cable-grand-total">' +
      '<span>总计</span><b>' + grandMeters + '</b><em>米</em><b>' + grandCount + '</b><em>根</em>' +
      (grandMissing ? '<i>另有 ' + grandMissing + ' 根未填长度</i>' : '') +
      '</div>' +
      '<p class="cfg-note cable-tip">购线建议：按汇总米数加 10–15% 余量下单；未填长度的先在下表补齐。</p>';

    /* --- 明细表：按线材类型分组（组头色条 + 小计 + 组内批量长度），
       解决整表颜色杂乱难分辨；行首复选框支持勾选后统一填长度。 --- */
    var conns = Store.state.connections.slice();
    if (SP.connHierSort) SP.connHierSort(conns);

    var GROUP_COLORS = { '卡农信号线': '#6ba3c4', '6.5信号线': '#6ba3c4',
      '音箱线': '#4fbf8b', 'RCA莲花线': '#a08fc0', '网线(Dante)': '#e3c163' };
    var byType = {}, typeOrder = [];
    conns.forEach(function (c) {
      var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
      if (!s || !t) return;
      if (!c.net && (!s.outputs[c.sport] || !t.inputs[c.tport])) return;
      var k = Store.cableOf(c);
      if (!byType[k]) { byType[k] = []; typeOrder.push(k); }
      byType[k].push(c);
    });
    var bySource = {}, sourceOrder = [];
    conns.forEach(function (c) {
      var s = Store.getDevice(c.sid);
      if (!s || (!c.net && !s.outputs[c.sport])) return;
      if (!bySource[c.sid]) { bySource[c.sid] = { dev: s, conns: [], ports: {} }; sourceOrder.push(c.sid); }
      bySource[c.sid].conns.push(c);
      bySource[c.sid].ports[c.sport] = true;
    });

    /* 13：组内按信号源设备分块，相邻块交替底色；块首行显示设备名 */
    function rowHtml(c, blockCls, devKey) {
      var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
      var cable = Store.cableOf(c);
      var cableOpts = SP.CABLE_TYPES.map(function (ct) {
        return '<option' + (ct === cable ? ' selected' : '') + '>' + esc(ct) + '</option>';
      }).join('');
      var key = c.tid + ':' + c.tport;
      var noLen = !(parseFloat(c.lenM) > 0);
      return '<tr class="' + blockCls + (noLen ? ' row-warn' : '') + '">' +
        '<td><input type="checkbox" class="cb-row" data-key="' + key +
        '" data-sid="' + c.sid + '" data-sport="' + c.sport + '" data-dev-key="' + devKey + '"></td>' +
        '<td><span class="cell-port" style="padding-left:9px">' +
        esc(Store.outLabelOf(s, c.sport)) + '</span></td>' +
        '<td class="cell-arrow">→</td>' +
        '<td><span class="cell-dev">' + esc(t.name) + '</span> <span class="cell-port">' +
        esc(c.tport >= 0 && t.inputs[c.tport] ? t.inputs[c.tport].label : '网口') + '</span></td>' +
        '<td><select class="conn-cable" data-key="' + key + '">' + cableOpts + '</select></td>' +
        '<td><input type="number" class="conn-len" data-key="' + key + '" min="0" step="0.5" value="' +
        esc(c.lenM || '') + '" placeholder="米"></td>' +
        '<td><input type="color" class="color-input conn-color" data-key="' + key + '" value="' +
        esc(Store.colorOf(c)) + '"></td>' +
        '<td><input type="text" class="conn-note" data-key="' + key + '" value="' +
        esc(c.note || '') + '" placeholder="走线备注"></td>' +
        '</tr>';
    }

    var devGroups = {}, devGroupSeq = 0;
    function deviceHeadHtml(k, sid, list, blockCls, devKey) {
      var s = Store.getDevice(sid);
      if (!s) return '';
      return '<tr class="cable-dev-head ' + blockCls + '">' +
        '<td><input type="checkbox" class="cb-dev" data-dev-key="' + devKey + '"></td>' +
        '<td colspan="3"><span class="cell-dev" style="border-left:3px solid ' +
        esc(s.color || SP.typeColor(s.type)) + ';padding-left:8px">' + esc(s.name) +
        '</span><span class="cfg-note" style="display:inline;margin-left:8px">' +
        list.length + ' 路 OUT</span></td>' +
        '<td colspan="4"><span class="dev-batch">批量长度 ' +
        '<input type="number" class="conn-len dev-len" data-dev-key="' + devKey + '" min="0" step="0.5" placeholder="米">' +
        '<button class="btn ghost sm" data-dev-len-apply="' + devKey + '">应用长度</button>' +
        ' 批量备注 <input type="text" class="conn-note dev-note" data-dev-key="' + devKey + '" placeholder="备注" style="width:90px">' +
        '<button class="btn ghost sm" data-dev-note-apply="' + devKey + '">应用备注</button>' +
        '<label class="chk-ground"><input type="checkbox" class="dev-override" data-dev-key="' + devKey + '" checked>覆盖已填</label>' +
        '</span></td></tr>';
    }

    var bodies = typeOrder.map(function (k) {
      var list = byType[k];
      var meters = 0, missing = 0;
      list.forEach(function (c) {
        var m = parseFloat(c.lenM);
        if (m > 0) meters += m; else missing++;
      });
      var gc = GROUP_COLORS[k] || '#7f8b99';
      var head = '<tr class="cable-group-head"><td colspan="8">' +
        '<span class="grp-bar" style="background:' + gc + '"></span>' +
        '<b>' + esc(k) + '</b><span class="cfg-note" style="display:inline;margin:0 8px">' +
        list.length + ' 根 · ' + (Math.round(meters * 10) / 10 || '—') + ' 米' +
        (missing ? ' · ⚠' + missing + ' 根未填' : '') + '</span>' +
        '<span class="grp-batch">批量长度 ' +
        '<input type="number" class="conn-len grp-len" data-gtype="' + esc(k) + '" min="0" step="0.5" placeholder="米">' +
        '<button class="btn ghost sm" data-grp-apply="' + esc(k) + '">应用长度</button>' +
        ' 批量备注 <input type="text" class="conn-note grp-note" data-gtype="' + esc(k) + '" placeholder="备注" style="width:90px">' +
        '<button class="btn ghost sm" data-grp-note-apply="' + esc(k) + '">应用备注</button>' +
        '<label class="chk-ground"><input type="checkbox" class="grp-override" data-gtype="' + esc(k) + '" checked>覆盖已填</label>' +
        '</span></td></tr>';
      var srcOrder = [], bySrc = {};
      list.forEach(function (c) {
        if (!bySrc[c.sid]) { bySrc[c.sid] = []; srcOrder.push(c.sid); }
        bySrc[c.sid].push(c);
      });
      var rows = srcOrder.map(function (sid, blockIdx) {
        var devKey = 'dg' + (devGroupSeq++);
        var blockCls = blockIdx % 2 ? 'dev-block-b' : 'dev-block-a';
        devGroups[devKey] = bySrc[sid];
        return deviceHeadHtml(k, sid, bySrc[sid], blockCls, devKey) +
          bySrc[sid].map(function (c) { return rowHtml(c, blockCls, devKey); }).join('');
      }).join('');
      return '<tbody class="cable-group">' + head + rows + '</tbody>';
    }).join('');

    tblHost.innerHTML =
      '<div class="cable-source-picker">按设备选择 ' +
      sourceOrder.map(function (sid) {
        var g = bySource[sid];
        return '<button class="btn ghost sm" data-src-pick="' + sid + '">' +
          esc(g.dev.name) + ' · ' + g.conns.length + '</button>';
      }).join('') +
      '<span id="cb-src-ports" class="src-port-picks"></span></div>' +
      '<div class="cable-batch-bar">已勾选 <b id="cb-sel-n">0</b> 行：统一长度 ' +
      '<input type="number" class="conn-len" id="cb-sel-len" min="0" step="0.5" placeholder="米">' +
      '<button class="btn ghost sm" id="cb-sel-apply">应用长度</button>' +
      '　统一备注 <input type="text" class="conn-note" id="cb-sel-note" placeholder="备注" style="width:110px">' +
      '<button class="btn ghost sm" id="cb-sel-note-apply">应用备注</button></div>' +
      '<table class="sheet cable-grouped"><thead><tr>' +
      '<th></th><th>信号源</th><th></th><th>目标</th><th>线材</th><th>长度 m</th><th>线色</th><th>备注</th>' +
      '</tr></thead>' + bodies + '</table>';

    /* --- 批量长度 / 批量备注：组内应用、勾选行应用（各为单个撤销步骤） --- */
    function applyField(list, field, value, overwrite, label) {
      var n = 0;
      Store.batch(function () {
        list.forEach(function (c) {
          var has = field === 'lenM' ? parseFloat(c.lenM) > 0 : !!(c.note && c.note.trim());
          if (has && !overwrite) return;
          c[field] = value;
          n++;
        });
      });
      if (n) {
        SP.renderCables();
        SP.renderWiringTable();
        SP.toast('已为 ' + n + ' 根线' + label + '（⌘Z 可撤销）');
      } else {
        SP.toast('没有可应用的行（勾选「覆盖已填」可强制）', true);
      }
    }
    function grpOverride(k) {
      var ov = tblHost.querySelector('.grp-override[data-gtype="' + k + '"]');
      return !!(ov && ov.checked);
    }
    tblHost.querySelectorAll('[data-grp-apply]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.grpApply;
        var inp = tblHost.querySelector('.grp-len[data-gtype="' + k + '"]');
        var len = inp && inp.value !== '' ? Math.max(0, +inp.value) : null;
        if (len === null) { SP.toast('先在组头填入长度（米）', true); return; }
        applyField(byType[k] || [], 'lenM', len, grpOverride(k), '填入长度 ' + len + ' 米');
      });
    });
    tblHost.querySelectorAll('[data-grp-note-apply]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.grpNoteApply;
        var inp = tblHost.querySelector('.grp-note[data-gtype="' + k + '"]');
        var note = inp ? inp.value.trim() : '';
        applyField(byType[k] || [], 'note', note, grpOverride(k),
          note ? '填入备注「' + note + '」' : '清空备注');
      });
    });
    function devOverride(key) {
      var ov = tblHost.querySelector('.dev-override[data-dev-key="' + key + '"]');
      return !!(ov && ov.checked);
    }
    tblHost.querySelectorAll('[data-dev-len-apply]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.dataset.devLenApply;
        var inp = tblHost.querySelector('.dev-len[data-dev-key="' + key + '"]');
        var len = inp && inp.value !== '' ? Math.max(0, +inp.value) : null;
        if (len === null) { SP.toast('先在设备行填入长度（米）', true); return; }
        applyField(devGroups[key] || [], 'lenM', len, devOverride(key), '填入长度 ' + len + ' 米');
      });
    });
    tblHost.querySelectorAll('[data-dev-note-apply]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.dataset.devNoteApply;
        var inp = tblHost.querySelector('.dev-note[data-dev-key="' + key + '"]');
        var note = inp ? inp.value.trim() : '';
        applyField(devGroups[key] || [], 'note', note, devOverride(key),
          note ? '填入备注「' + note + '」' : '清空备注');
      });
    });
    function updateSelCount() {
      var n = tblHost.querySelectorAll('.cb-row:checked').length;
      var cnt = el('cb-sel-n');
      if (cnt) cnt.textContent = n;
    }
    tblHost.querySelectorAll('.cb-dev').forEach(function (cb) {
      cb.addEventListener('change', function () {
        tblHost.querySelectorAll('.cb-row[data-dev-key="' + cb.dataset.devKey + '"]').forEach(function (r) {
          r.checked = cb.checked;
        });
        updateSelCount();
      });
    });
    function setSourceChecked(sid, checked, sport) {
      tblHost.querySelectorAll('.cb-row[data-sid="' + sid + '"]').forEach(function (cb) {
        if (sport === undefined || +cb.dataset.sport === +sport) cb.checked = checked;
      });
      updateSelCount();
    }
    function renderPortPicks(sid) {
      var host = el('cb-src-ports');
      var g = bySource[sid];
      if (!host || !g) return;
      var ports = Object.keys(g.ports).sort(function (a, b) { return +a - +b; });
      host.innerHTML = ports.map(function (p) {
        return '<button class="btn ghost sm src-port on" data-src-port="' + sid + ':' + p + '">' +
          esc(Store.outLabelOf(g.dev, +p)) + '</button>';
      }).join('');
      host.querySelectorAll('[data-src-port]').forEach(function (b) {
        b.addEventListener('click', function () {
          var parts = b.dataset.srcPort.split(':');
          var on = b.classList.toggle('on');
          setSourceChecked(parts[0], on, +parts[1]);
        });
      });
    }
    tblHost.querySelectorAll('[data-src-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var sid = b.dataset.srcPick;
        var rows = tblHost.querySelectorAll('.cb-row[data-sid="' + sid + '"]');
        var allOn = rows.length && Array.prototype.every.call(rows, function (cb) { return cb.checked; });
        setSourceChecked(sid, !allOn);
        b.classList.toggle('on', !allOn);
        renderPortPicks(sid);
        var portHost = el('cb-src-ports');
        if (portHost) portHost.querySelectorAll('.src-port').forEach(function (p) { p.classList.toggle('on', !allOn); });
      });
    });
    function selRows() {
      var out = [];
      tblHost.querySelectorAll('.cb-row:checked').forEach(function (cb) {
        var parts = cb.dataset.key.split(':');
        var c = Store.sourceFor(parts[0], +parts[1]);
        if (c) out.push(c);
      });
      return out;
    }
    tblHost.querySelectorAll('.cb-row').forEach(function (cb) {
      cb.addEventListener('change', updateSelCount);
    });
    var selApply = el('cb-sel-apply');
    if (selApply) selApply.addEventListener('click', function () {
      var inp = el('cb-sel-len');
      var len = inp && inp.value !== '' ? Math.max(0, +inp.value) : null;
      if (len === null) { SP.toast('先填入统一长度（米）', true); return; }
      var list = selRows();
      if (!list.length) { SP.toast('先勾选要批量填长度的行', true); return; }
      applyField(list, 'lenM', len, true, '填入长度 ' + len + ' 米');
    });
    var selNoteApply = el('cb-sel-note-apply');
    if (selNoteApply) selNoteApply.addEventListener('click', function () {
      var inp = el('cb-sel-note');
      var note = inp ? inp.value.trim() : '';
      var list = selRows();
      if (!list.length) { SP.toast('先勾选要批量填备注的行', true); return; }
      applyField(list, 'note', note, true, note ? '填入备注「' + note + '」' : '清空备注');
    });

    function findConn(key) {
      var parts = key.split(':');
      return Store.sourceFor(parts[0], +parts[1]);
    }
    tblHost.querySelectorAll('.conn-cable').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var c = findConn(sel.dataset.key);
        if (c) { c.cable = sel.value; Store.save(); SP.renderCables(); SP.renderWiringTable(); }
      });
    });
    tblHost.querySelectorAll('.conn-len').forEach(function (inp) {
      if (!inp.dataset.key) return;
      inp.addEventListener('change', function () {
        var c = findConn(inp.dataset.key);
        if (c) {
          c.lenM = inp.value === '' ? '' : Math.max(0, +inp.value);
          Store.save();
          SP.renderCables();
          SP.renderWiringTable();
        }
      });
    });
    tblHost.querySelectorAll('.conn-color').forEach(function (inp) {
      if (!inp.dataset.key) return;
      inp.addEventListener('change', function () {
        var c = findConn(inp.dataset.key);
        if (c) {
          c.color = inp.value;
          Store.save();
          SP.renderWiringDiagram(el('wiring-diagram'));
        }
      });
    });
    tblHost.querySelectorAll('.conn-note').forEach(function (inp) {
      if (!inp.dataset.key) return;
      inp.addEventListener('change', function () {
        var c = findConn(inp.dataset.key);
        if (c) { c.note = inp.value.trim(); Store.save(); SP.renderWiringTable(); }
      });
    });
  };
})();
