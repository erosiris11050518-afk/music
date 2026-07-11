/* ============================================================
   demo.js — 极光体验室：不限基础体验 + 轻量额度 + 小蝶案例
   仅在 URL 含 demo=1 时启用，正式工作台不受影响。
   ============================================================ */

(function () {
  var SP = window.SP = window.SP || {};
  var Store = SP.Store;
  var params;
  try { params = new URLSearchParams(window.location.search || ''); } catch (e) { params = null; }
  var active = !!(params && params.get('demo') === '1');
  var KEY = 'erosiris.auroraRoomQuotaV1';
  var LIMIT = 3;
  var exportDepth = 0;
  var exportBatchUntil = 0;

  function el(id) { return document.getElementById(id); }
  function load() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!data || typeof data !== 'object') data = {};
    data.export = Math.max(0, +data.export || 0);
    data.advanced = Math.max(0, +data.advanced || 0);
    data.inviteShown = !!data.inviteShown;
    data.caseImported = !!data.caseImported;
    return data;
  }
  var state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    renderBadge();
  }
  function remaining(kind) { return Math.max(0, LIMIT - (+state[kind] || 0)); }

  function copyWechat() {
    function done() { if (SP.toast) SP.toast('微信号 ErosAUC 已复制'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText('ErosAUC').then(done, function () { prompt('微信号', 'ErosAUC'); });
    } else {
      prompt('微信号', 'ErosAUC');
    }
  }

  function showInvite(force) {
    if (!active || (!force && state.inviteShown) || !SP.openModal) return;
    if (!state.inviteShown) {
      state.inviteShown = true;
      save();
    }
    SP.openModal(
      '<div class="modal-head"><h3>小蝶想认识认真体验的你</h3>' +
      '<button class="btn icon" data-close-modal>✕</button></div>' +
      '<div class="modal-body demo-invite">' +
      '<img src="assets/author/wechat.jpg" alt="作者微信二维码">' +
      '<div><p>你已经开始探索进阶能力啦。</p>' +
      '<p>想体验完整模板、工程导出和更多功能，欢迎添加作者参与内测，也欢迎告诉我你最想优化的工作流程。</p>' +
      '<div class="demo-wechat"><span>微信号</span><b>ErosAUC</b></div></div></div>' +
      '<div class="modal-foot"><button class="btn ghost" data-close-modal>稍后再说</button>' +
      '<button class="btn primary" id="demo-copy-wechat">复制微信号</button></div>'
    );
    var copy = el('demo-copy-wechat');
    if (copy) copy.onclick = copyWechat;
  }

  function showLimit(kind, label) {
    if (!SP.openModal) return;
    var name = kind === 'export' ? '导出体验' : '高级功能体验';
    SP.openModal(
      '<div class="modal-head"><h3>' + name + '已完成</h3>' +
      '<button class="btn icon" data-close-modal>✕</button></div>' +
      '<div class="modal-body demo-limit"><b>' + label + '</b>' +
      '<p>基础反推、智能连线、功率检查和案例模板仍然可以无限体验。</p>' +
      '<p>完整能力可以从小蝶的「关于作者」再次了解。</p></div>' +
      '<div class="modal-foot"><button class="btn primary" data-close-modal>继续体验</button></div>'
    );
  }

  function consume(kind, label, action) {
    if (!active) return action ? action() : true;
    if (remaining(kind) <= 0) {
      showLimit(kind, label);
      return false;
    }
    state[kind]++;
    save();
    var result = action ? action() : true;
    if (SP.toast) SP.toast(label + ' · 剩余 ' + remaining(kind) + ' 次体验');
    if (!state.inviteShown) setTimeout(showInvite, 500);
    return result;
  }

  function template(type, name, ins, outs, specs, role) {
    var item = { type: type, name: name, ins: ins, outs: outs, specs: specs || {} };
    if (role) item.speakerRole = role;
    return item;
  }
  var CASE_TEMPLATES = [
    template('speaker', 'DO106', 1, 1, { powered: 'passive', power: 120, ohms: 8, size: '6.5' }, 'fullrange'),
    template('speaker', 'DO108', 1, 1, { powered: 'passive', power: 150, ohms: 8, size: '8' }, 'fullrange'),
    template('speaker', 'DO110', 1, 1, { powered: 'passive', power: 250, ohms: 8, size: '10' }, 'fullrange'),
    template('speaker', 'DO112', 1, 1, { powered: 'passive', power: 300, ohms: 8, size: '12' }, 'fullrange'),
    template('speaker', 'DO115', 1, 1, { powered: 'passive', power: 400, ohms: 8, size: '15' }, 'fullrange'),
    template('speaker', 'DO115H', 1, 1, { powered: 'passive', power: 600, ohms: 8, size: '15' }, 'fullrange'),
    template('speaker', 'DO215', 1, 1, { powered: 'passive', power: 800, ohms: 4, size: '双' }, 'fullrange'),
    template('speaker', '206M', 2, 2, { powered: 'passive', power: 280, ohms: 12, size: '双' }, 'fullrange'),
    template('speaker', 'DO115S', 1, 1, { powered: 'passive', power: 600, ohms: 8, size: '15' }, 'sub'),
    template('speaker', 'DO118S', 1, 1, { powered: 'passive', power: 600, ohms: 8, size: '18' }, 'sub'),
    template('speaker', 'DO218S', 1, 1, { powered: 'passive', power: 1200, ohms: 4, size: '双' }, 'sub'),
    template('speaker', 'K212S', 1, 1, { powered: 'passive', power: 700, ohms: 4, size: '双' }, 'sub'),
    template('speaker', 'K18S', 1, 1, { powered: 'passive', power: 600, ohms: 8, size: '18' }, 'sub'),
    template('speaker', '有源双6寸', 1, 1, { powered: 'active', power: 350, size: '双6寸' }, 'fullrange'),
    template('speaker', '有源超低18', 1, 1, { powered: 'active', power: 1200, size: '18' }, 'sub'),
    template('amp', 'FA1500', 2, 2, { rackU: 3, power: 1500 }),
    template('amp', 'FA1250', 2, 2, { rackU: 2, power: 1250 }),
    template('amp', 'FA900', 2, 2, { rackU: 2, power: 900 }),
    template('amp', 'FA700', 2, 2, { rackU: 2, power: 700 }),
    template('amp', 'FA500', 2, 2, { rackU: 2, power: 500 }),
    template('amp', 'SA2002', 2, 2, { rackU: 2, power: 2000 }),
    template('amp', 'SA1402', 2, 2, { rackU: 2, power: 1400 }),
    template('amp', 'SA1002', 2, 2, { rackU: 2, power: 1000 }),
    template('amp', 'SA802', 2, 2, { rackU: 2, power: 800 }),
    template('amp', 'SA602', 2, 2, { rackU: 1, power: 600 }),
    template('amp', 'SA202', 2, 2, { rackU: 1, power: 200 }),
    template('amp', 'SA2004', 4, 4, { rackU: 2, power: 2000 }),
    template('amp', 'SA1404', 4, 4, { rackU: 2, power: 1400 }),
    template('amp', 'SA1004', 4, 4, { rackU: 2, power: 1000 }),
    template('amp', 'SA804', 4, 4, { rackU: 2, power: 800 }),
    template('amp', 'SA604', 4, 4, { rackU: 1, power: 600 }),
    template('dsp', 'Unit48', 4, 8, { rackU: 1 }),
    template('dsp', 'DS48', 4, 8, { rackU: 1 }),
    template('dsp', 'DS36', 3, 6, {}),
    template('dsp', 'DS24', 2, 4, { rackU: 1 }),
    template('mixer', 'WING RACK', 16, 8, { rackU: 3 })
  ];

  function importCaseTemplates() {
    if (!active || !Store) return { added: 0, updated: 0 };
    var added = 0, updated = 0;
    Store.batch(function () {
      CASE_TEMPLATES.forEach(function (item) {
        var result = Store.mergeTemplate(JSON.parse(JSON.stringify(item)));
        if (result === 'added') added++; else if (result === 'updated') updated++;
      });
    });
    state.caseImported = true;
    save();
    if (SP.renderAll) SP.renderAll();
    if (SP.toast) SP.toast('案例模板已准备好：36 个型号，可以开始反推啦');
    return { added: added, updated: updated };
  }

  function wrapExport(name, label) {
    var original = SP[name];
    if (typeof original !== 'function') return;
    SP[name] = function () {
      var self = this, args = arguments;
      if (!active || exportDepth || Date.now() < exportBatchUntil) return original.apply(self, args);
      return consume('export', label, function () {
        exportDepth++;
        try { return original.apply(self, args); } finally { exportDepth--; }
      });
    };
  }

  function guardClick(e, kind, label, batch) {
    if (!active) return true;
    if (remaining(kind) <= 0) {
      e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      showLimit(kind, label);
      return false;
    }
    state[kind]++;
    if (batch) exportBatchUntil = Date.now() + 2500;
    save();
    if (SP.toast) SP.toast(label + ' · 剩余 ' + remaining(kind) + ' 次体验');
    if (!state.inviteShown) setTimeout(showInvite, 500);
    return true;
  }

  function renderBadge() {
    if (!active || !document.body) return;
    var badge = el('demo-quota-badge');
    if (!badge) {
      badge = document.createElement('button');
      badge.id = 'demo-quota-badge';
      badge.className = 'demo-quota-badge';
      badge.type = 'button';
      badge.title = '极光体验室额度';
      var right = document.querySelector('.topbar-right');
      if (right) right.insertBefore(badge, right.firstChild);
    }
    badge.textContent = '体验室 · 导出 ' + remaining('export') + ' · 进阶 ' + remaining('advanced');
    badge.onclick = function () {
      if (SP.toast) SP.toast('基础反推不限次 · 导出和进阶功能各可体验 3 次');
    };
  }

  SP.Demo = {
    active: active,
    limit: LIMIT,
    remaining: remaining,
    consume: consume,
    showInvite: showInvite,
    importCaseTemplates: importCaseTemplates,
    caseImported: function () { return !!state.caseImported; },
    templates: CASE_TEMPLATES.slice()
  };

  if (!active) return;
  document.documentElement.classList.add('demo-mode');

  wrapExport('exportPNG', '图片导出');
  wrapExport('exportPNGWidth', '高清框图导出');
  wrapExport('exportDiagramPDF', 'PDF 导出');
  wrapExport('exportGridPNG', '路由图导出');
  wrapExport('csvDownload', 'Excel / CSV 导出');

  var dante = SP.openDanteConfig;
  if (typeof dante === 'function') {
    SP.openDanteConfig = function () {
      var self = this, args = arguments;
      return consume('advanced', 'Dante 高级路由', function () { return dante.apply(self, args); });
    };
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest(
      '#report-excel,#cfg-export,#cfg-tpl-export,#tplp-lib-out,#tplp-lib-out-top,' +
      '#cfg-import,#cfg-tpl-import,#tplp-lib-in,#tplp-csv-single,#tplp-csv-folder,' +
      '#report-generate,[data-slot-use]') : null;
    if (!t) return;
    var id = t.id || '';
    if (/^(report-excel|cfg-export|cfg-tpl-export|tplp-lib-out|tplp-lib-out-top)$/.test(id)) {
      guardClick(e, 'export', '文件导出', true);
    } else {
      guardClick(e, 'advanced', id === 'report-generate' ? '完整报告生成' : '高级数据功能', false);
    }
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('demo-mode');
    renderBadge();
  });
})();
