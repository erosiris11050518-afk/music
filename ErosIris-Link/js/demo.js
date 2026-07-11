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

  var CASE_TEMPLATES = SP.CASE_TEMPLATES || [];

  function importCaseTemplates() {
    if (!active || !Store) return { added: 0, updated: 0 };
    var added = 0, updated = 0;
    Store.batch(function () {
      CASE_TEMPLATES.forEach(function (item) {
        var exists = Store.state.deviceTemplates.some(function (current) {
          return current.type === item.type && current.name === item.name;
        });
        if (exists) return;
        var result = Store.mergeTemplate(JSON.parse(JSON.stringify(item)));
        if (result === 'added') added++; else if (result === 'updated') updated++;
      });
    });
    state.caseImported = true;
    save();
    if (SP.renderAll) SP.renderAll();
    if (SP.toast) SP.toast(added
      ? '案例模板已补齐：新增 ' + added + ' 个型号，可以开始反推啦'
      : '36 个案例型号已经齐全，没有重复添加');
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
