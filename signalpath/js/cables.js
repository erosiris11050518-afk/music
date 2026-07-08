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

    /* --- 明细表 --- */
    var conns = Store.state.connections.slice();
    if (SP.connHierSort) SP.connHierSort(conns);

    var rows = conns.map(function (c) {
      var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
      if (!s || !t) return '';
      var sp = s.outputs[c.sport], tp = t.inputs[c.tport];
      if (!sp || !tp) return '';
      var cable = Store.cableOf(c);
      var cableOpts = SP.CABLE_TYPES.map(function (ct) {
        return '<option' + (ct === cable ? ' selected' : '') + '>' + esc(ct) + '</option>';
      }).join('');
      var key = c.tid + ':' + c.tport;
      var noLen = !(parseFloat(c.lenM) > 0);
      return '<tr' + (noLen ? ' class="row-warn"' : '') + '>' +
        '<td><span class="cell-dev">' + esc(s.name) + '</span> <span class="cell-port">' +
        esc(Store.outLabelOf(s, c.sport)) + '</span></td>' +
        '<td class="cell-arrow">→</td>' +
        '<td><span class="cell-dev">' + esc(t.name) + '</span> <span class="cell-port">' +
        esc(tp.label) + '</span></td>' +
        '<td><select class="conn-cable" data-key="' + key + '">' + cableOpts + '</select></td>' +
        '<td><input type="number" class="conn-len" data-key="' + key + '" min="0" step="0.5" value="' +
        esc(c.lenM || '') + '" placeholder="米"></td>' +
        '<td><input type="color" class="color-input conn-color" data-key="' + key + '" value="' +
        esc(Store.colorOf(c)) + '"></td>' +
        '<td><input type="text" class="conn-note" data-key="' + key + '" value="' +
        esc(c.note || '') + '" placeholder="走线备注"></td>' +
        '</tr>';
    }).join('');

    tblHost.innerHTML = '<table class="sheet"><thead><tr>' +
      '<th>信号源</th><th></th><th>目标</th><th>线材</th><th>长度 m</th><th>线色</th><th>备注</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';

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
      inp.addEventListener('change', function () {
        var c = findConn(inp.dataset.key);
        if (c) { c.note = inp.value.trim(); Store.save(); SP.renderWiringTable(); }
      });
    });
  };
})();
