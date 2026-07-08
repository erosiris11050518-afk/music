/* ============================================================
   quick.js — 快速布局面板（⌘K / ⌃空格）
   输入规则：按数字填当前格，空格跳下一格，退格清空当前格、
   再退格跳回上一格并清空。有源全频/超低两列默认收起，
   按 Shift 或点「展开有源」显示。支持预设模板存取。
   ============================================================ */

(function () {
  var Store = SP.Store;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }

  var CATS = [
    { key: 'mixer',      title: '调音台',     type: 'mixer' },
    { key: 'dsp',        title: 'DSP',        type: 'dsp' },
    { key: 'amp',        title: '功放',       type: 'amp' },
    { key: 'fullrange',  title: '全频音箱',   type: 'speaker', role: 'fullrange' },
    { key: 'sub',        title: '超低音箱',   type: 'speaker', role: 'sub' },
    { key: 'afullrange', title: '有源全频',   type: 'speaker', role: 'fullrange', active: true },
    { key: 'asub',       title: '有源超低',   type: 'speaker', role: 'sub', active: true }
  ];

  function catMatches(t, def) {
    if (t.type !== def.type) return false;
    if (def.type !== 'speaker') return true;
    if ((t.speakerRole || SP.inferSpeakerRole(t.name)) !== def.role) return false;
    /* 有源列优先列出有源模板，但无源模板也可选（创建时强制按列的有源属性） */
    return true;
  }

  SP.openQuickLayout = function () {
    var tpls = Store.state.deviceTemplates;
    var showActive = false;

    function tplOptions(def) {
      var html = '';
      tpls.forEach(function (t, i) {
        if (!catMatches(t, def)) return;
        var outs = Array.isArray(t.outs) ? t.outs.length : t.outs;
        html += '<option value="' + i + '">' + esc(t.name) +
          '（' + t.ins + '进' + outs + '出）</option>';
      });
      return html || '<option value="">无可用模板</option>';
    }

    function catColumn(def, idx) {
      var isActive = !!def.active;
      return '<div class="ql-col' + (isActive ? ' ql-active-col' : '') +
        '" data-ql-col="' + def.key + '"' + (isActive ? ' hidden' : '') + '>' +
        '<div class="ql-cat">' + esc(def.title) + '</div>' +
        '<input type="text" inputmode="numeric" class="ql-count" data-ql-count="' + idx +
        '" placeholder="0" autocomplete="off">' +
        '<select class="ql-tpl" data-ql-tpl="' + def.key + '" title="选择模板">' + tplOptions(def) + '</select>' +
        '</div>';
    }

    function presetChips() {
      var ps = Store.state.quickPresets || [];
      return ps.map(function (p, i) {
        return '<span class="ql-preset" data-preset="' + i + '" title="点击套用该预设">' +
          esc(p.name) + '<span class="x" data-preset-del="' + i + '" title="删除预设">✕</span></span>';
      }).join('');
    }

    SP.openModal(
      '<div class="modal-head"><h3>快速布局</h3>' +
      '<span class="head-note">⌘K · 数字填格 · 空格下一格 · 退格清空/回上格 · Shift 展开有源</span>' +
      '<button class="btn icon" data-close-modal>✕</button></div>' +
      '<div class="modal-body ql-body">' +
      '<p class="cfg-note ql-note" style="margin-top:0">依次输入 <b>调音台 · DSP · 功放 · 全频 · 超低</b> 的数量，回车创建并自动智能连接（一步可撤销）。</p>' +
      '<div class="ql-grid">' + CATS.map(catColumn).join('') + '</div>' +
      '<div style="margin-top:9px"><button class="ql-toggle-active" id="ql-show-active">▸ 展开有源音箱（Shift）</button></div>' +
      '<div class="ql-presets" id="ql-presets">' +
      '<button class="btn ghost sm" id="ql-save-preset" title="把当前各格数量与模板选择存为预设">存为预设</button>' +
      presetChips() +
      '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
      '<button class="btn ghost" data-close-modal>取消</button>' +
      '<button class="btn primary" id="ql-confirm">创建系统 ⏎</button></div>'
    );

    el('modal-box').classList.add('modal-wide');
    var box = el('modal-box');
    var counts = box.querySelectorAll('.ql-count');

    function visibleCounts() {
      return Array.prototype.filter.call(counts, function (inp) {
        var col = inp.closest('[data-ql-col]');
        return col && !col.hidden;
      });
    }
    function syncActiveCols() {
      box.querySelectorAll('.ql-active-col').forEach(function (col) {
        col.hidden = !showActive;
      });
      var tg = el('ql-show-active');
      if (tg) {
        tg.classList.toggle('on', showActive);
        tg.textContent = showActive ? '▾ 收起有源音箱' : '▸ 展开有源音箱（Shift）';
      }
    }
    function toggleActive() {
      showActive = !showActive;
      syncActiveCols();
    }
    el('ql-show-active').addEventListener('click', toggleActive);

    /* 数字 / 空格 / 退格 导航 */
    function focusAt(list, i) {
      if (i >= 0 && i < list.length) {
        list[i].focus();
        if (list[i].select) list[i].select();
      }
    }
    counts.forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        var list = visibleCounts();
        var pos = list.indexOf(inp);
        if (e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          focusAt(list, Math.min(pos + 1, list.length - 1));
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          if (inp.value !== '') {
            inp.value = '';
          } else if (pos > 0) {
            list[pos - 1].value = '';
            focusAt(list, pos - 1);
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          confirm2();
        } else if (e.key === 'Shift') {
          e.preventDefault();
          toggleActive();
        } else if (/^\d$/.test(e.key)) {
          e.preventDefault();
          var v = (inp.value + e.key).replace(/^0+(\d)/, '$1');
          inp.value = String(Math.min(128, +v));
        } else if (e.key.length === 1) {
          e.preventDefault();   /* 只接受数字 */
        }
      });
    });

    /* 预设：套用 / 删除 / 保存 */
    function applyPreset(p) {
      var d = p.data || {};
      CATS.forEach(function (def, i) {
        var inp = box.querySelector('[data-ql-count="' + i + '"]');
        if (inp) inp.value = d.counts && d.counts[def.key] ? d.counts[def.key] : '';
        var sel = box.querySelector('[data-ql-tpl="' + def.key + '"]');
        if (sel && d.tplNames && d.tplNames[def.key]) {
          Array.prototype.forEach.call(sel.options, function (o) {
            var t = tpls[+o.value];
            if (t && t.name === d.tplNames[def.key]) sel.value = o.value;
          });
        }
      });
      if (d.counts && (d.counts.afullrange || d.counts.asub) && !showActive) toggleActive();
      SP.toast('已套用预设「' + p.name + '」，回车创建');
    }
    function bindPresets() {
      box.querySelectorAll('[data-preset]').forEach(function (chip) {
        chip.addEventListener('click', function (e) {
          if (e.target.closest('[data-preset-del]')) return;
          var p = Store.state.quickPresets[+chip.dataset.preset];
          if (p) applyPreset(p);
        });
      });
      box.querySelectorAll('[data-preset-del]').forEach(function (x) {
        x.addEventListener('click', function () {
          var i = +x.dataset.presetDel;
          var p = Store.state.quickPresets[i];
          Store.removeQuickPreset(i);
          refreshPresets();
          SP.toast('已删除预设「' + (p ? p.name : '') + '」（⌘Z 可撤销）');
        });
      });
      var save = el('ql-save-preset');
      if (save) save.onclick = function () {
        var name = prompt('预设名称（如：驻场标准 / 小型婚礼）：');
        if (name === null) return;
        name = name.trim() || '预设 ' + ((Store.state.quickPresets || []).length + 1);
        var d = { counts: {}, tplNames: {} };
        CATS.forEach(function (def, i) {
          var inp = box.querySelector('[data-ql-count="' + i + '"]');
          var n = Math.max(0, Math.min(128, parseInt(inp && inp.value, 10) || 0));
          if (n) d.counts[def.key] = n;
          var sel = box.querySelector('[data-ql-tpl="' + def.key + '"]');
          var t = sel && sel.value !== '' ? tpls[+sel.value] : null;
          if (t) d.tplNames[def.key] = t.name;
        });
        Store.addQuickPreset(name, d);
        refreshPresets();
        SP.toast('已保存预设「' + name + '」');
      };
    }
    function refreshPresets() {
      var wrap = el('ql-presets');
      if (!wrap) return;
      wrap.innerHTML = '<button class="btn ghost sm" id="ql-save-preset">存为预设</button>' + presetChips();
      bindPresets();
    }
    bindPresets();

    function confirm2() {
      var items = [];
      CATS.forEach(function (def, i) {
        var inp = box.querySelector('[data-ql-count="' + i + '"]');
        var n = Math.max(0, Math.min(128, parseInt(inp && inp.value, 10) || 0));
        if (!n) return;
        var sel = box.querySelector('[data-ql-tpl="' + def.key + '"]');
        var t = sel && sel.value !== '' ? tpls[+sel.value] : null;
        if (!t) return;
        items.push({ tpl: t, count: n, powered: def.active ? 'active' : 'passive' });
      });
      if (!items.length) { SP.toast('请至少给一类设备填数量，例如 1 2 6 10 2', true); return; }
      var added = Store.quickLayout(items);
      SP.closeModal();
      SP.selectedDeviceId = '';
      SP.multiSelected = [];
      SP.renderAll();
      /* 自动进入全局视角展示成果 */
      var dia = el('wiring-diagram');
      if (dia) {
        SP.setDiagramZoom(SP.fitDiagramZoom(dia), dia);
        if (dia.scrollTo) dia.scrollTo({ left: 0, top: 0 });
        if (SP.syncZoomUI) SP.syncZoomUI();
        if (SP.syncFitBtn) SP.syncFitBtn();
      }
      SP.toast('已创建 ' + added.length + ' 台设备并完成智能连接（⌘Z 一步撤销）');
    }
    el('ql-confirm').addEventListener('click', confirm2);

    syncActiveCols();
    setTimeout(function () { focusAt(Array.prototype.slice.call(counts), 0); }, 30);
  };
})();
