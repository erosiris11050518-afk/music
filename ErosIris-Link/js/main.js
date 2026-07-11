/* ============================================================
   main.js — 启动流程（IndexedDB 就绪后渲染）/ 视图切换 /
             主题 / 缩放工具条 / 配置槽（含临时移除）/ 导入导出
   ============================================================ */

(function () {
  var Store = SP.Store;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function welcomeCommand() {
    if (!window.location || !window.location.search || typeof URLSearchParams === 'undefined') return '';
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('from') !== 'welcome') return '';
      return (params.get('reverse') || '').trim().slice(0, 240);
    } catch (e) { return ''; }
  }

  function isWelcomeEntry() {
    if (!window.location || !window.location.search || typeof URLSearchParams === 'undefined') return false;
    try { return new URLSearchParams(window.location.search).get('from') === 'welcome'; }
    catch (e) { return false; }
  }

  function welcomeScene() {
    if (!window.location || !window.location.search || typeof URLSearchParams === 'undefined') return -1;
    try {
      var n = Number(new URLSearchParams(window.location.search).get('scene'));
      return Number.isInteger(n) && n >= 0 && n <= 12 ? n : -1;
    } catch (e) { return -1; }
  }

  function syncWelcomeLink() {
    var link = el('btn-welcome');
    if (!link) return;
    var scene = welcomeScene();
    if (scene < 0) {
      try { scene = Number(localStorage.getItem('signalpath-welcome-scene')); } catch (e) { scene = -1; }
    }
    var demo = '';
    try { demo = new URLSearchParams(window.location.search).get('demo') === '1' ? '&demo=1' : ''; } catch (e) {}
    link.href = 'welcome-reverse-prototype/index.html?from=workbench' + demo +
      (Number.isInteger(scene) && scene >= 0 ? '&v=' + scene : '');
  }

  function clearWelcomeCommand() {
    if (!window.history || !window.history.replaceState || !window.location) return;
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete('reverse');
      url.searchParams.delete('from');
      url.searchParams.delete('theme');
      url.searchParams.delete('scene');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  /* ================= Toast 轻提示（替代确认弹窗：直接执行 + 提示可撤销） ================= */

  var toastTimer = 0;
  SP.toast = function (msg, warn) {
    if (!document.body) return;
    var t = el('sp-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'sp-toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.toggle('warn', !!warn);
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  };

  /* ================= 配置槽：导入多个 JSON 后切换对比（v2 支持临时移除） ================= */

  var ConfigSlots = (function () {
    var demoMode = false;
    try { demoMode = new URLSearchParams(window.location.search || '').get('demo') === '1'; } catch (e) {}
    var KEY = demoMode ? 'erosiris-aurora-config-slots-v2' : 'signalpath-config-slots-v2';
    var LEGACY = demoMode ? '' : 'signalpath-config-slots-v1';
    var slots = [], activeId = 'work';

    function cloneState() { return JSON.parse(JSON.stringify(Store.state)); }
    function uid() { return 'cfg-' + Date.now() + '-' + Math.floor(Math.random() * 100000); }
    function saveSlots() {
      try { localStorage.setItem(KEY, JSON.stringify({ activeId: activeId, slots: slots })); }
      catch (e) { if (SP.warnStorage) SP.warnStorage(); }
    }
    function find(id) {
      for (var i = 0; i < slots.length; i++) if (slots[i].id === id) return slots[i];
      return null;
    }
    function ensureWorkSlot() {
      /* 活动槽 data 为 null：其内容始终以主存储为准，避免整份 state 存两遍 */
      if (!slots.length) slots.push({ id: 'work', name: '当前配置', data: null, hidden: false, updated: Date.now() });
      if (!find(activeId) || find(activeId).hidden) {
        var vis = slots.filter(function (s) { return !s.hidden; });
        activeId = vis.length ? vis[0].id : slots[0].id;
      }
    }
    function load() {
      try {
        var raw = localStorage.getItem(KEY) || (LEGACY && localStorage.getItem(LEGACY));
        if (raw) {
          var pack = JSON.parse(raw);
          slots = Array.isArray(pack.slots) ? pack.slots : [];
          activeId = pack.activeId || 'work';
          slots.forEach(function (s) { if (s.hidden === undefined) s.hidden = false; });
        }
      } catch (e) {
        slots = [];
        activeId = 'work';
      }
      ensureWorkSlot();
    }
    function render() {
      var sel = el('config-switch');
      if (!sel) return;
      sel.innerHTML = slots.filter(function (s) { return !s.hidden; }).map(function (s) {
        return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>';
      }).join('');
      sel.value = activeId;
    }
    /* 把当前主存储内容封存进即将离开的活动槽 */
    function stashActive() {
      var s = find(activeId);
      if (!s) return;
      s.data = cloneState();
      s.updated = Date.now();
    }
    function init() {
      load();
      var s = find(activeId);
      if (s && s.data) {
        /* 兼容旧格式：活动槽曾存整份数据 → 恢复后转为 null 引用 */
        Store.replaceState(s.data, { noHistory: true, resetHistory: true, skipConfig: true });
        s.data = null;
      }
      render();
      saveSlots();
    }
    function switchTo(id) {
      if (id === activeId) return;
      var target = find(id);
      if (!target || !target.data) { render(); return; }
      stashActive();
      activeId = id;
      Store.replaceState(target.data, { noHistory: true, resetHistory: true, skipConfig: true });
      target.data = null;
      saveSlots();
      render();
      SP.renderAll();
    }
    function addImported(name, data) {
      stashActive();
      activeId = uid();
      slots.push({ id: activeId, name: name || '导入配置', data: null, hidden: false, updated: Date.now() });
      Store.replaceState(data, { noHistory: true, resetHistory: true, skipConfig: true });
      saveSlots();
      render();
      SP.renderAll();
    }
    function setHidden(id, hidden) {
      var s = find(id);
      if (!s) return;
      if (hidden && id === activeId) {
        /* 临时移除活动槽：先切到另一个可见槽 */
        var other = slots.filter(function (x) { return x.id !== id && !x.hidden; })[0];
        if (!other) { alert('至少要保留一个可见配置。'); return; }
        stashActive();
        s.hidden = true;
        activeId = other.id;
        Store.replaceState(other.data || Store.defaultState(), { noHistory: true, resetHistory: true, skipConfig: true });
        other.data = null;
        saveSlots();
        render();
        SP.renderAll();
        return;
      }
      s.hidden = hidden;
      saveSlots();
      render();
    }
    function removeSlot(id) {
      var s = find(id);
      if (!s || id === activeId) { alert('不能删除当前正在使用的配置。'); return; }
      slots = slots.filter(function (x) { return x.id !== id; });
      ensureWorkSlot();
      saveSlots();
      render();
    }
    function onStoreSaved() {}
    return {
      init: init, switchTo: switchTo, addImported: addImported,
      setHidden: setHidden, removeSlot: removeSlot, onStoreSaved: onStoreSaved,
      get slots() { return slots; }, get activeId() { return activeId; }
    };
  })();

  SP.onStoreSaved = function () { ConfigSlots.onStoreSaved(); };

  /* 配置面板：切换 / 临时移除 / 恢复 / 删除 / 导入 / 导出 合并入口 */
  function exportConfig() {
    var data = JSON.parse(JSON.stringify(Store.state));
    var images = {};
    (data.devices || []).forEach(function (dv) {
      [dv.imgId, dv.panelImgId].forEach(function (id) {
        if (id && SP.Images.get(id)) images[id] = SP.Images.get(id);
      });
    });
    if (Object.keys(images).length) data.__images = images;
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = SP.exportFilename('配置', 'json');
    a.click();
    URL.revokeObjectURL(a.href);
    SP.toast('配置已导出（含图片）');
  }

  SP.exportTemplateJson = function () {
    var lib = Store.exportTemplateLib();
    var blob = new Blob([JSON.stringify(lib, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = SP.exportFilename('模板库', 'json');
    a.click();
    URL.revokeObjectURL(a.href);
    SP.toast('模板库 JSON 已导出（型号模板 ' + lib.deviceTemplates.length +
      ' · 快速预设 ' + lib.quickPresets.length +
      ' · 反推模板 ' + (lib.reversePresets || []).length +
      ' · 台面 ' + lib.userMixerTemplates.length + '）');
  };

  /* 8：模板打包导出 —— 1 个总文件（模板库 JSON）+ 按类别分文件 CSV（可回导） */
  SP.exportTemplateBundle = function () {
    var d = new Date();
    var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var lib = Store.exportTemplateLib();
    var blob = new Blob([JSON.stringify(lib, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = SP.exportFilename('模板库总文件', 'json');
    a.click();
    URL.revokeObjectURL(a.href);
    var tpls = Store.state.deviceTemplates;
    var roleName = { linearray: '线阵列', fullrange: '全频', sub: '超低' };
    var spkRows = [['型号名称', '分支(全频/超低/线阵列)', '有源无源(有源/无源)', '输入路数', '输出路数', '功率W', '阻抗Ω', '尺寸（寸）']];
    var ampRows = [['型号名称', '通道数(2或4)', '输入路数', '输出路数', '机柜U数',
      '功率W@8Ω', '4Ω功率W(选填)', '最低负载Ω(选填，默认4)']];
    var mixerRows = [['类型(调音台/DSP)', '型号名称', '输入路数', '输出路数', '机柜U数']];
    var dspRows = [['类型(调音台/DSP)', '型号名称', '输入路数', '输出路数', '机柜U数']];
    tpls.forEach(function (t) {
      var s = t.specs || {};
      var outs = Array.isArray(t.outs) ? t.outs.length : t.outs;
      if (t.type === 'speaker') {
        spkRows.push([t.name, roleName[t.speakerRole || 'fullrange'] || '全频',
          s.powered === 'active' ? '有源' : '无源', t.ins || 1, outs || 1,
          s.power || '', s.powered === 'active' ? '' : (s.ohms || ''), s.size || '']);
      } else if (t.type === 'amp') {
        ampRows.push([t.name, outs === 4 ? 4 : 2, t.ins || outs || 2, outs || t.ins || 2,
          s.rackU || '', s.power || '', s.power4 || '', s.ohms || '']);
      } else if (t.type === 'mixer') {
        mixerRows.push(['调音台', t.name, t.ins, outs, s.rackU || '']);
      } else if (t.type === 'dsp') {
        dspRows.push(['DSP', t.name, t.ins, outs, s.rackU || '']);
      }
    });
    var files = 1;
    /* 连续触发下载间隔一点，避免浏览器拦截 */
    var queue = [];
    if (spkRows.length > 1) queue.push([SP.exportFilename('模板-音响', 'csv'), spkRows]);
    if (ampRows.length > 1) queue.push([SP.exportFilename('模板-功放', 'csv'), ampRows]);
    if (mixerRows.length > 1) queue.push([SP.exportFilename('模板-调音台', 'csv'), mixerRows]);
    if (dspRows.length > 1) queue.push([SP.exportFilename('模板-DSP', 'csv'), dspRows]);
    queue.forEach(function (q, i) {
      setTimeout(function () { SP.csvDownload(q[0], q[1]); }, 250 * (i + 1));
      files++;
    });
    SP.toast('模板已导出：1 个总文件 + ' + (files - 1) + ' 个分类 CSV');
  };

  function openConfigPanel() {
    function rows() {
      return ConfigSlots.slots.map(function (s) {
        var isActive = s.id === ConfigSlots.activeId;
        return '<div class="cfg-slot-row' + (s.hidden ? ' hidden-slot' : '') + '">' +
          '<span class="cfg-slot-name">' + esc(s.name) + (isActive ? ' <span class="tag ok">当前</span>' : '') +
          (s.hidden ? ' <span class="tag warn">已移除</span>' : '') + '</span>' +
          '<span class="cfg-slot-acts">' +
          (!isActive && !s.hidden
            ? '<button class="btn primary sm" data-slot-use="' + s.id + '">切换</button>' : '') +
          (s.hidden
            ? '<button class="btn ghost sm" data-slot-show="' + s.id + '">恢复</button>'
            : '<button class="btn ghost sm" data-slot-hide="' + s.id + '"' + '>临时移除</button>') +
          '<button class="btn ghost sm danger" data-slot-del="' + s.id + '"' +
          (isActive ? ' disabled' : '') + '>删除</button>' +
          '</span></div>';
      }).join('');
    }
    SP.openModal(
      '<div class="modal-head"><h3>配置</h3>' +
      '<button class="btn icon" data-close-modal>✕</button></div>' +
      '<div class="modal-body">' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">' +
      '<button class="btn ghost sm" id="cfg-export">导出当前配置</button>' +
      '<button class="btn ghost sm" id="cfg-import">导入配置文件…</button>' +
      '<button class="btn ghost sm" id="cfg-tpl-export" title="把设备型号模板 + 快速布局预设 + 台面模板整体存档为一个文件">导出模板库</button>' +
      '<button class="btn ghost sm" id="cfg-tpl-import" title="从模板库文件恢复全部模板（按名称合并去重）">导入模板库</button>' +
      '</div>' +
      '<p class="cfg-note" id="cfg-global-note" style="margin-top:0"><b>当前配置 JSON</b> 是完整全局快照：设备、连线、路由、线材、图片、模板库和各类预设都会保存。</p>' +
      '<p class="cfg-note" style="margin-top:0"><b>模板库 JSON</b> 包含：设备型号模板、快速布局预设、音响反推模板、台面模板。' +
      '换电脑 / 从链接打开时导入一次即可恢复全部模板。</p>' +
      '<p class="cfg-note" id="cfg-slot-note" style="margin-top:0">点「切换」在多套完整配置间对比；「临时移除」只是从列表隐藏（数据保留）；「删除」彻底移除。</p>' +
      '<div id="cfg-slot-list">' + rows() + '</div>' +
      '</div><div class="modal-foot"><button class="btn primary" data-close-modal>完成</button></div>'
    );
    var box = el('modal-box');
    function bind() {
      var ex = el('cfg-export');
      if (ex) ex.onclick = exportConfig;
      var im = el('cfg-import');
      if (im) im.onclick = function () { el('import-file').click(); };
      var tex = el('cfg-tpl-export');
      if (tex) tex.onclick = SP.exportTemplateJson;
      var tim = el('cfg-tpl-import');
      if (tim) tim.onclick = function () { el('tpl-lib-file').click(); };
      box.querySelectorAll('[data-slot-use]').forEach(function (b) {
        b.addEventListener('click', function () {
          ConfigSlots.switchTo(b.dataset.slotUse);
          SP.closeModal();
          SP.toast('已切换配置');
        });
      });
      box.querySelectorAll('[data-slot-hide]').forEach(function (b) {
        b.addEventListener('click', function () { ConfigSlots.setHidden(b.dataset.slotHide, true); refresh(); });
      });
      box.querySelectorAll('[data-slot-show]').forEach(function (b) {
        b.addEventListener('click', function () { ConfigSlots.setHidden(b.dataset.slotShow, false); refresh(); });
      });
      box.querySelectorAll('[data-slot-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          /* 彻底删除不在撤销栈里，保留唯一一个确认 */
          if (!confirm('彻底删除该配置？不可恢复。')) return;
          ConfigSlots.removeSlot(b.dataset.slotDel);
          refresh();
        });
      });
    }
    function refresh() {
      var list = el('cfg-slot-list');
      if (list) { list.innerHTML = rows(); bind(); }
    }
    bind();
  }

  SP.updateHistoryButtons = function () {
    var u = el('btn-undo'), r = el('btn-redo');
    if (u) u.disabled = !Store.canUndo();
    if (r) r.disabled = !Store.canRedo();
    [
      ['btn-wdiagram-undo', 'btn-wdiagram-redo', 'diagram'],
      ['btn-mixdiag-undo', 'btn-mixdiag-redo', 'mixerDiagram'],
      ['btn-inpatch-undo', 'btn-inpatch-redo', 'inPatch'],
      ['btn-route-undo', 'btn-route-redo', 'routeGrid'],
      ['btn-outpatch-undo', 'btn-outpatch-redo', 'outPatch']
    ].forEach(function (row) {
      var bu = el(row[0]), br = el(row[1]);
      if (bu) bu.disabled = !Store.canUndoArea(row[2]);
      if (br) br.disabled = !Store.canRedoArea(row[2]);
    });
  };

  /* 路由矩阵 PNG：从数据直接绘制 canvas（Safari 对 foreignObject 光栅化不稳定） */
  SP.exportGridPNG = function (kind, filename) {
    var m = Store.activeMixer();
    var light = document.documentElement.getAttribute('data-theme') === 'light';
    var C = light
      ? { bg: '#ffffff', grid: '#c9ced6', head: '#eef0f3', headTx: '#5a6572', rowTx: '#5a6572', cellBg: '#f7f8fa' }
      : { bg: '#14171b', grid: '#2b333d', head: '#20262d', headTx: '#93a0ae', rowTx: '#93a0ae', cellBg: '#10141a' };
    var GRP = { bus: '#6ba3c4', mtx: '#a08fc0', main: '#eda63d', in_: '#6ba3c4', out: '#4fbf8b' };

    var rows = [], cols = [], isOn;
    if (kind === 'in') {
      for (var i = 0; i < m.physIn; i++) rows.push({ label: 'IN ' + (i + 1) });
      for (var c = 0; c < m.channels; c++) cols.push({ label: 'C' + (c + 1), grp: 'in_' });
      isOn = function (r, c2) { return Store.hasInPatch(r, c2); };
    } else if (kind === 'out') {
      Store.outPatchSources().forEach(function (src) {
        rows.push({ label: src.label, id: src.id,
          grp: src.id[0] === 'b' ? 'bus' : src.id[0] === 'x' ? 'mtx' : 'main' });
      });
      for (var o = 0; o < m.physOut; o++) cols.push({ label: 'O' + (o + 1), grp: 'out' });
      isOn = function (r, c2) { return Store.hasOutPatch(rows[r].id, c2); };
    } else {
      for (var ci = 0; ci < m.channels; ci++) {
        if (m.links.indexOf(ci) >= 0 && ci + 1 < m.channels) {
          rows.push({ label: 'CH ' + (ci + 1) + '-' + (ci + 2), anchor: ci });
          ci++;
        } else {
          rows.push({ label: 'CH ' + (ci + 1), anchor: ci });
        }
      }
      for (var b = 0; b < m.buses; b++) cols.push({ label: 'B' + (b + 1), grp: 'bus', id: 'b' + b });
      Store.mainTargets().forEach(function (t) {
        cols.push({ label: String(t.label).replace('MAIN ', ''), grp: 'main', id: t.id });
      });
      for (var x = 0; x < m.matrices; x++) cols.push({ label: 'M' + (x + 1), grp: 'mtx', id: 'x' + x });
      isOn = function (r, c2) { return Store.hasRoute(rows[r].anchor, cols[c2].id); };
    }
    if (!rows.length || !cols.length) { alert('当前矩阵没有内容可导出。'); return; }

    var scale = 2, cw = 34, ch = 30, headW = 116, headH = 30, pad = 14;
    var W = pad * 2 + headW + cols.length * cw;
    var H = pad * 2 + headH + rows.length * ch;
    var cv = document.createElement('canvas');
    cv.width = W * scale;
    cv.height = H * scale;
    var ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.font = '10px Menlo, monospace';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = C.head;
    ctx.fillRect(pad, pad, headW + cols.length * cw, headH);
    ctx.fillRect(pad, pad, headW, headH + rows.length * ch);

    cols.forEach(function (col, ci2) {
      var x = pad + headW + ci2 * cw;
      ctx.fillStyle = C.headTx;
      ctx.textAlign = 'center';
      ctx.fillText(col.label, x + cw / 2, pad + 19);
      ctx.fillStyle = GRP[col.grp] || '#888';
      ctx.fillRect(x, pad + headH - 3, cw, 2);
    });
    rows.forEach(function (row, r) {
      var y = pad + headH + r * ch;
      ctx.fillStyle = C.rowTx;
      ctx.textAlign = 'right';
      ctx.fillText(row.label.length > 15 ? row.label.slice(0, 14) + '…' : row.label,
        pad + headW - 8, y + 19);
      cols.forEach(function (col, c2) {
        var x = pad + headW + c2 * cw;
        ctx.fillStyle = C.cellBg;
        ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
        if (isOn(r, c2)) {
          ctx.fillStyle = GRP[kind === 'out' ? rows[r].grp : cols[c2].grp] || '#eda63d';
          ctx.fillRect(x + 8, y + 7, cw - 16, ch - 14);
        }
      });
    });

    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gc = 0; gc <= cols.length; gc++) {
      var gx = pad + headW + gc * cw;
      ctx.moveTo(gx + .5, pad);
      ctx.lineTo(gx + .5, H - pad);
    }
    for (var gr = 0; gr <= rows.length; gr++) {
      var gy = pad + headH + gr * ch;
      ctx.moveTo(pad, gy + .5);
      ctx.lineTo(W - pad, gy + .5);
    }
    ctx.moveTo(pad + .5, pad);
    ctx.lineTo(pad + .5, H - pad);
    ctx.stroke();

    cv.toBlob(function (blob) {
      if (!blob) { alert('导出失败，请重试。'); return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = SP.exportFilename ? SP.exportFilename(filename) : filename;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }, 'image/png');
  };

  /* ================= 汇总渲染 ================= */

  /* 分台视图选择器：整体 / 每台调音台一页 */
  function syncScopeSelect() {
    var sel = el('diagram-scope');
    if (!sel) return;
    var mixers = Store.mixerDevices();
    var html = '<option value="all">整体视图</option>' + mixers.map(function (d) {
      return '<option value="' + esc(d.id) + '">分台 · ' + esc(d.name) + '</option>';
    }).join('');
    sel.innerHTML = html;
    if (SP.diagramScope !== 'all' && !Store.getDevice(SP.diagramScope)) SP.diagramScope = 'all';
    sel.value = SP.diagramScope || 'all';
    sel.style.display = mixers.length > 1 ? '' : 'none';   /* 单台时隐藏，保持干净 */
  }

  SP.renderAll = function () {
    syncScopeSelect();
    SP.renderInspector();
    SP.renderWiringTable();
    SP.renderWiringDiagram(el('wiring-diagram'));
    SP.renderMixerView();
    if (SP.renderNetRoute) SP.renderNetRoute();
    if (SP.renderTeach) SP.renderTeach();
    if (SP.renderCables) SP.renderCables();
    if (SP.syncOrientBtn) SP.syncOrientBtn();
    if (SP.syncFitBtn) SP.syncFitBtn();
  };

  /* ================= 初始化 ================= */

  document.addEventListener('DOMContentLoaded', function () {

    /* ---------- 主视图切换 ---------- */
    SP.switchView = function (name) {
      el('main-tabs').querySelectorAll('.tab').forEach(function (x) {
        x.classList.toggle('active', x.dataset.view === name);
      });
      document.querySelectorAll('.view').forEach(function (v) {
        v.classList.toggle('active', v.id === 'view-' + name);
      });
      if (name === 'mixer' && SP.renderMixerView) SP.renderMixerView();
      if (name === 'netroute' && SP.renderNetRoute) SP.renderNetRoute();
      if (name === 'cables' && SP.renderCables) SP.renderCables();
      if (name === 'teach' && SP.renderTeach) SP.renderTeach();
    };
    el('main-tabs').querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { SP.switchView(t.dataset.view); });
    });

    /* ---------- 黑 / 白主题 ---------- */
    function applyTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('signalpath-theme', t); } catch (e) {}
      var themeMeta = el('theme-color');
      if (themeMeta) themeMeta.setAttribute('content', t === 'light' ? '#eaf2f6' : '#0a1017');
      var b = el('btn-theme');
      if (b) {
        b.textContent = t === 'light' ? '☾' : '☀︎';
        b.title = t === 'light' ? '切换到黑色主题' : '切换到白色主题';
      }
    }
    var savedTheme = 'dark';
    try { savedTheme = localStorage.getItem('signalpath-theme') || 'dark'; } catch (e) {}
    applyTheme(savedTheme);
    var themeBtn = el('btn-theme');
    if (themeBtn) themeBtn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('signalpath-theme-source', 'manual'); } catch (e) {}
      applyTheme(cur);
      SP.renderAll();   /* 框图内嵌 SVG 样式需按新主题重新生成 */
    });

    /* ---------- 分台视图切换 ---------- */
    var scopeSel = el('diagram-scope');
    if (scopeSel) scopeSel.addEventListener('change', function () {
      SP.diagramScope = this.value || 'all';
      var box = el('wiring-diagram');
      SP.renderWiringDiagram(box);
      SP.setDiagramZoom(SP.fitDiagramZoom(box), box);
      if (box.scrollTo) box.scrollTo({ left: 0, top: 0 });
      if (SP.syncZoomUI) SP.syncZoomUI();
      if (SP.syncFitBtn) SP.syncFitBtn();
      SP.toast(this.value === 'all' ? '已切回整体视图' : '分台视图：只显示该调音台及其下游设备');
    });

    /* ---------- 相对对齐算法入口（按钮已收起，算法保留） ---------- */
    var relUp = el('btn-rel-align-up');
    if (relUp) relUp.addEventListener('click', function () {
      SP.relAlignLayout('up', el('wiring-diagram'));
      SP.toast('已按相对位置对齐上级（可撤销）');
    });
    var relDown = el('btn-rel-align-down');
    if (relDown) relDown.addEventListener('click', function () {
      SP.relAlignLayout('down', el('wiring-diagram'));
      SP.toast('已按相对位置对齐下级（可撤销）');
    });
    /* ---------- 框图缩放（滑杆 = 视口中心锚点） ---------- */
    function syncZoomUI() {
      var z = Math.round((SP.diagramZoom || 1) * 100);
      var range = el('zoom-range');
      if (range) range.value = z;
      var val = el('zoom-val');
      if (val) val.textContent = z + '%';
      var zin = el('btn-zoom-shortcut-in');
      var zout = el('btn-zoom-shortcut-out');
      if (zin) zin.disabled = z >= 200;
      if (zout) zout.disabled = z <= 10;
    }
    SP.syncZoomUI = syncZoomUI;
    var zoomRange = el('zoom-range');
    if (zoomRange) zoomRange.addEventListener('input', function () {
      SP.zoomAt(el('wiring-diagram'), this.value / 100);
      var zv = el('zoom-val');
      if (zv) zv.textContent = this.value + '%';
      if (SP.syncFitBtn) SP.syncFitBtn();
    });
    /* 一键视角切换：全局（整图放得下）↔ 局部（定位到高亮设备） */
    function syncFitBtn() {
      var box = el('wiring-diagram');
      var fit = SP.fitDiagramZoom(box);
      var atFit = Math.abs((SP.diagramZoom || 1) - fit) < 0.02;
      var b = el('btn-zoom-fit');
      if (!b) return;
      b.textContent = atFit ? '定位当前' : '全局视角';
      b.title = atFit
        ? '当前为全局视角。点击放大并居中定位到高亮设备'
        : '点击缩放到能一眼看清全部设备的全局视角';
      var zero = el('btn-zoom-shortcut-fit');
      if (zero) {
        zero.title = b.title + '（快捷键 0）';
        zero.setAttribute('aria-label', b.textContent);
      }
    }
    SP.syncFitBtn = syncFitBtn;
    var zoomFitBtn = el('btn-zoom-fit');
    function toggleFitView() {
      var box = el('wiring-diagram');
      var fit = SP.fitDiagramZoom(box);
      var atFit = Math.abs((SP.diagramZoom || 1) - fit) < 0.02;
      if (atFit) {
        SP.focusSelectedInDiagram(box);
      } else {
        SP.setDiagramZoom(fit, box);
        if (box.scrollTo) box.scrollTo({ left: 0, top: 0 });
      }
      syncZoomUI();
      syncFitBtn();
    }
    if (zoomFitBtn) zoomFitBtn.addEventListener('click', toggleFitView);
    var zoomShortcutFit = el('btn-zoom-shortcut-fit');
    if (zoomShortcutFit) zoomShortcutFit.addEventListener('click', toggleFitView);
    function zoomStep(factor) {
      var box = el('wiring-diagram');
      SP.zoomAt(box, (SP.diagramZoom || 1) * factor);
      syncZoomUI();
      syncFitBtn();
    }
    var zoomShortcutOut = el('btn-zoom-shortcut-out');
    if (zoomShortcutOut) zoomShortcutOut.addEventListener('click', function () { zoomStep(1 / 1.2); });
    var zoomShortcutIn = el('btn-zoom-shortcut-in');
    if (zoomShortcutIn) zoomShortcutIn.addEventListener('click', function () { zoomStep(1.2); });
    syncZoomUI();

    /* ---------- 框图工具条 ---------- */
    var wUndo = el('btn-wdiagram-undo');
    if (wUndo) wUndo.addEventListener('click', function () {
      if (Store.undoArea('diagram')) SP.renderAll();
    });
    var wRedo = el('btn-wdiagram-redo');
    if (wRedo) wRedo.addEventListener('click', function () {
      if (Store.redoArea('diagram')) SP.renderAll();
    });
    var resetTop = el('btn-diagram-reset');
    if (resetTop) resetTop.addEventListener('click', function () {
      SP.resetDiagramLayout(el('wiring-diagram'), 'topdown');
    });
    /* 默认对齐：按功放分组重排（清手动位 → 整齐树布局） */
    var alignDefault = el('btn-diagram-align-default');
    if (alignDefault) alignDefault.addEventListener('click', function () {
      SP.defaultAlignLayout(el('wiring-diagram'));
      SP.toast('已按功放分组默认对齐（可撤销）');
    });
    /* 相对对齐：保持当前相对顺序，逐层等间距对准下级 */
    var alignRelative = el('btn-diagram-align-relative');
    if (alignRelative) alignRelative.addEventListener('click', function () {
      SP.relAlignLayout('down', el('wiring-diagram'));
      SP.toast('已按当前相对位置对齐下级（可撤销）');
    });
    SP.syncOrientBtn = function () {
      var b = el('btn-diagram-orient');
      if (!b) return;
      var h = Store.state.diagramOrient === 'h';
      b.textContent = h ? '切换竖版' : '切换横版';
      b.title = h
        ? '当前为横版（信号从左到右）。点击切回竖版（信号从上到下）'
        : '当前为竖版（信号从上到下）。点击切换为横版（信号从左到右）';
    };
    var orientBtn = el('btn-diagram-orient');
    if (orientBtn) orientBtn.addEventListener('click', function () {
      var box = el('wiring-diagram');
      var h = Store.state.diagramOrient === 'h';
      SP.setDiagramOrient(h ? 'v' : 'h', box);
      SP.setDiagramZoom(SP.fitDiagramZoom(box), box);
      if (box.scrollTo) box.scrollTo({ left: 0, top: 0 });
      SP.syncOrientBtn();
      syncZoomUI();
      syncFitBtn();
    });
    SP.syncOrientBtn();

    /* 导出下拉：PNG 2K/4K/8K + PDF */
    var exportBtn = el('btn-diagram-export');
    var exportPop = el('export-pop');
    if (exportBtn && exportPop) {
      exportBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        exportPop.hidden = !exportPop.hidden;
      });
      document.addEventListener('click', function (e) {
        if (!e.target.closest || !e.target.closest('#export-pop')) exportPop.hidden = true;
      });
      exportPop.querySelectorAll('[data-export-w]').forEach(function (b) {
        b.addEventListener('click', function () {
          exportPop.hidden = true;
          SP.exportPNGWidth(el('wiring-diagram'),
            SP.exportFilename('系统框图-' + b.textContent.trim(), 'png'), +b.dataset.exportW);
        });
      });
      var pdfBtn = exportPop.querySelector('[data-export-pdf]');
      if (pdfBtn) pdfBtn.addEventListener('click', function () {
        exportPop.hidden = true;
        SP.exportDiagramPDF(el('wiring-diagram'), 'ErosIris-Link 系统框图');
      });
    }

    /* ---------- 台内路由页按钮 ---------- */
    el('btn-mixdiag-png').addEventListener('click', function () {
      SP.exportPNG(el('mixer-diagram'), SP.exportFilename('台内路由', 'png'), 3);
    });
    el('btn-mixdiag-undo').addEventListener('click', function () {
      if (Store.undoArea('mixerDiagram')) SP.renderMixerView();
    });
    el('btn-mixdiag-redo').addEventListener('click', function () {
      if (Store.redoArea('mixerDiagram')) SP.renderMixerView();
    });
    el('btn-inpatch-undo').addEventListener('click', function () {
      if (Store.undoArea('inPatch')) {
        SP.renderInputPatchGrid();
        SP.renderMixerDiagram(el('mixer-diagram'));
      }
    });
    el('btn-inpatch-redo').addEventListener('click', function () {
      if (Store.redoArea('inPatch')) {
        SP.renderInputPatchGrid();
        SP.renderMixerDiagram(el('mixer-diagram'));
      }
    });
    el('btn-inpatch-png').addEventListener('click', function () {
      SP.exportGridPNG('in', SP.exportFilename('输入路由矩阵', 'png'));
    });
    el('btn-route-undo').addEventListener('click', function () {
      if (Store.undoArea('routeGrid')) {
        SP.renderRouteGrid();
        SP.renderMixerDiagram(el('mixer-diagram'));
        SP.renderMixerTable();
      }
    });
    el('btn-route-redo').addEventListener('click', function () {
      if (Store.redoArea('routeGrid')) {
        SP.renderRouteGrid();
        SP.renderMixerDiagram(el('mixer-diagram'));
        SP.renderMixerTable();
      }
    });
    el('btn-route-png').addEventListener('click', function () {
      SP.exportGridPNG('route', SP.exportFilename('发送路由矩阵', 'png'));
    });
    el('btn-outpatch-undo').addEventListener('click', function () {
      if (Store.undoArea('outPatch')) {
        SP.renderOutputPatchGrid();
        SP.renderMixerDiagram(el('mixer-diagram'));
      }
    });
    el('btn-outpatch-redo').addEventListener('click', function () {
      if (Store.redoArea('outPatch')) {
        SP.renderOutputPatchGrid();
        SP.renderMixerDiagram(el('mixer-diagram'));
      }
    });
    el('btn-outpatch-png').addEventListener('click', function () {
      SP.exportGridPNG('out', SP.exportFilename('输出路由矩阵', 'png'));
    });

    /* ---------- 顶栏 ---------- */
    el('btn-undo').addEventListener('click', function () {
      if (Store.undo()) SP.renderAll();
    });
    el('btn-redo').addEventListener('click', function () {
      if (Store.redo()) SP.renderAll();
    });
    el('btn-quick').addEventListener('click', function () { SP.openQuickLayout(); });
    var tplBtn = el('btn-templates');
    if (tplBtn) tplBtn.addEventListener('click', function () { SP.openTemplatePanel(); });
    el('btn-report').addEventListener('click', SP.openReportOptions);
    var keysBtn = el('btn-keys');
    if (keysBtn) keysBtn.addEventListener('click', function () { SP.openKeysPanel(); });
    el('btn-config').addEventListener('click', openConfigPanel);
    if (SP.initGuide) SP.initGuide();

    /* ---------- 导入配置（还原图片到 IndexedDB），入口在「配置」面板 ---------- */
    function importState(data) {
      if (data.__images) {
        var map = {};
        Object.keys(data.__images).forEach(function (oldId) {
          map[oldId] = SP.Images.put(data.__images[oldId]);
        });
        (data.devices || []).forEach(function (dv) {
          if (dv.imgId && map[dv.imgId]) dv.imgId = map[dv.imgId];
          if (dv.panelImgId && map[dv.panelImgId]) dv.panelImgId = map[dv.panelImgId];
        });
        delete data.__images;
      }
      return data;
    }
    /* ---------- 模板库导入：询问覆盖或合并 ---------- */
    el('tpl-lib-file').addEventListener('change', function () {
      var f = this.files[0];
      this.value = '';
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try {
          data = JSON.parse(reader.result);
          if (!data || !data.__signalpathTplLib) throw new Error('bad');
        } catch (e) {
          SP.toast('导入失败：不是有效的 ErosIris-Link 模板库文件', true);
          return;
        }
        if (SP.promptTemplateLibImport) {
          SP.promptTemplateLibImport(data, SP.afterTemplatePanelMutation);
        } else {
          Store.importTemplateLib(data);
          SP.renderAll();
        }
      };
      reader.readAsText(f);
    });

    el('import-file').addEventListener('change', function () {
      var files = Array.prototype.slice.call(this.files || []);
      this.value = '';
      if (!files.length) return;
      function readNext(idx) {
        var f = files[idx];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(reader.result);
            if (!data || !Array.isArray(data.devices)) throw new Error('bad format');
            var name = f.name.replace(/\.json$/i, '') || '导入配置';
            ConfigSlots.addImported(name, importState(data));
            if (idx + 1 < files.length) readNext(idx + 1);
          } catch (e) {
            alert('导入失败：' + f.name + ' 不是有效的 ErosIris-Link 配置。');
          }
        };
        reader.readAsText(f);
      }
      readNext(0);
    });

    /* ---------- 清设备：只清画布，案例模板、库存和各类预设全部保留 ---------- */
    el('btn-clear').addEventListener('click', function () {
      if (!Store.state.devices.length && !Store.state.connections.length) {
        SP.toast('当前已经没有设备，案例模板和库存仍保留', true);
        return;
      }
      var n = Store.clearAllDevices();
      SP.selectedDeviceId = '';
      SP.multiSelected = [];
      SP.diagramScope = 'all';
      SP.renderAll();
      SP.toast('已清空 ' + n + ' 台设备，案例模板和库存已保留（⌘Z 可撤销）');
    });

    /* ---------- 启动：IndexedDB 图片缓存就绪后再渲染 ---------- */
    SP.Images.init().then(function () {
      ConfigSlots.init();
      SP.renderAll();
      SP.updateHistoryButtons();
      syncFitBtn();
      var command = welcomeCommand();
      syncWelcomeLink();
      if (isWelcomeEntry()) clearWelcomeCommand();
      if (command && SP.openQuickLayout) {
        SP.openQuickLayout({ mode: 'reverse', command: command });
        SP.toast('已带入欢迎页内容，请检查型号和数量');
      }
    });
  });
})();
