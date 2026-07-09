/* ============================================================
   keys.js — 快捷键系统：统一注册表 + 介绍/自定义改键面板
   自定义绑定持久化到 localStorage，可恢复默认。
   Mod = Mac 的 ⌘ / 其他平台的 Ctrl；Ctrl = 物理 Control 键。
   ============================================================ */

(function () {
  var Store = SP.Store;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var IS_MAC = /Mac|iP(hone|ad|od)/.test(navigator.platform || '');
  var LS_KEY = 'signalpath-keys-v2';

  /* 动作定义：combos 为默认键位（可多个），custom 覆盖后整组替换 */
  function diagramBox() { return document.getElementById('wiring-diagram'); }

  var ACTIONS = [
    { id: 'quickLayout', name: '快速布局', desc: '打开数字快速建系统面板',
      combos: ['Ctrl+1', 'Mod+K'],
      run: function () { SP.openQuickLayout(); } },
    { id: 'zoomIn', name: '放大', desc: '框图放大一档（视口中心为锚点）',
      combos: ['=', 'Shift+='],
      run: function () { var b = diagramBox(); if (b) SP.zoomAt(b, (SP.diagramZoom || 1) * 1.2); } },
    { id: 'zoomOut', name: '缩小', desc: '框图缩小一档',
      combos: ['-'],
      run: function () { var b = diagramBox(); if (b) SP.zoomAt(b, (SP.diagramZoom || 1) / 1.2); } },
    { id: 'zoomFit', name: '全局视角 / 定位当前', desc: '双态切换：整图放得下 ↔ 居中到选中设备',
      combos: ['0'],
      run: function () {
        var btn = document.getElementById('btn-zoom-fit');
        if (btn && btn.click) btn.click();
      } },
    { id: 'deleteSel', name: '删除选中 / 框选设备', desc: '删除当前选中或框选的设备（可撤销）',
      combos: ['Backspace', 'Delete'],
      run: function () { if (SP.deleteSelected) SP.deleteSelected(); } },
    { id: 'undo', name: '撤销', desc: '撤销上一步操作',
      combos: ['Mod+Z'],
      run: function () { if (Store.undo()) SP.renderAll(); } },
    { id: 'redo', name: '重做', desc: '重做刚撤销的操作',
      combos: ['Mod+X'],
      run: function () { if (Store.redo()) SP.renderAll(); } },
    { id: 'duplicate', name: '复制选中设备', desc: '复制并自动编号（X号）',
      combos: ['Mod+D'], needSelection: true,
      run: function () { SP.duplicateSelected(); } },
    { id: 'clearIn', name: '清 IN', desc: '清空选中设备输入端的全部连线',
      combos: ['Mod+I'], needSelection: true,
      run: function () { SP.clearSelectedWires('inputs'); } },
    { id: 'clearOut', name: '清 OUT', desc: '清空选中设备输出端的全部连线',
      combos: ['Mod+O'], needSelection: true,
      run: function () { SP.clearSelectedWires('outputs'); } }
  ];

  var custom = {};
  try { custom = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { custom = {}; }

  function combosOf(a) {
    return (custom[a.id] && custom[a.id].length) ? custom[a.id] : a.combos;
  }
  function saveCustom() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(custom)); } catch (e) {}
  }

  /* 事件 → 组合串。Mac 上 ⌘=Mod、Control=Ctrl；其他平台 Ctrl=Mod */
  function eventCombo(e) {
    var parts = [];
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    if (IS_MAC) {
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.metaKey) parts.push('Mod');
    } else {
      if (e.ctrlKey) parts.push('Mod');
      if (e.metaKey) parts.push('Meta');
    }
    var key;
    var code = e.code || '';
    if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
    else if (/^Digit\d$/.test(code)) key = code.slice(5);
    else if (code === 'Space' || e.key === ' ') key = 'Space';
    else key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    parts.push(key);
    return parts.join('+');
  }

  function isModifierKey(e) {
    return ['Shift', 'Control', 'Alt', 'Meta'].indexOf(e.key) >= 0;
  }

  /* 组合串美化显示 */
  function pretty(combo) {
    return combo.split('+').map(function (p) {
      if (p === 'Mod') return IS_MAC ? '⌘' : 'Ctrl';
      if (p === 'Ctrl') return IS_MAC ? '⌃' : 'Ctrl';
      if (p === 'Shift') return IS_MAC ? '⇧' : 'Shift';
      if (p === 'Alt') return IS_MAC ? '⌥' : 'Alt';
      if (p === 'Space') return '空格';
      return p;
    }).join(IS_MAC ? '' : '+');
  }
  SP.prettyCombo = pretty;
  SP.actionCombo = function (id) {
    for (var i = 0; i < ACTIONS.length; i++) {
      if (ACTIONS[i].id === id) return pretty(combosOf(ACTIONS[i])[0]);
    }
    return '';
  };

  var capturing = null;   /* 改键监听中：{action, done} */

  document.addEventListener('keydown', function (e) {
    /* 改键捕获优先 */
    if (capturing) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { capturing.done(null); capturing = null; return; }
      if (isModifierKey(e)) return;   /* 等待非修饰键 */
      var combo = eventCombo(e);
      capturing.done(combo);
      capturing = null;
      return;
    }
    /* 焦点在输入控件时不触发快捷键 */
    var tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
    if (isModifierKey(e)) return;
    var combo = eventCombo(e);
    /* 弹窗打开时屏蔽无修饰键的全局快捷键（缩放 =/-/0、Delete 等），
       让弹窗自己的键盘交互（数字/空格/退格/Shift）不被抢走 */
    var overlay = document.getElementById('modal-overlay');
    if (overlay && !overlay.hidden &&
        combo.indexOf('Mod+') < 0 && combo.indexOf('Ctrl+') < 0 && combo.indexOf('Alt+') < 0) {
      return;
    }
    for (var i = 0; i < ACTIONS.length; i++) {
      var a = ACTIONS[i];
      if (combosOf(a).indexOf(combo) < 0) continue;
      e.preventDefault();
      if (a.needSelection && !Store.getDevice(SP.selectedDeviceId)) return;
      a.run();
      return;
    }
  }, true);

  /* ================= 快捷键介绍 / 改键面板 ================= */

  SP.openKeysPanel = function () {
    function rows() {
      return ACTIONS.map(function (a) {
        var chips = combosOf(a).map(function (c, ci) {
          return '<kbd class="key-chip" data-key-act="' + a.id + '" data-key-slot="' + ci +
            '" title="点击后按新键重新绑定">' + esc(pretty(c)) + '</kbd>';
        }).join(' ');
        return '<div class="key-row">' +
          '<div class="key-info"><b>' + esc(a.name) + '</b>' +
          '<span class="cfg-note">' + esc(a.desc) + (a.needSelection ? '（需先选中设备）' : '') + '</span></div>' +
          '<div class="key-chips">' + chips + '</div>' +
          '</div>';
      }).join('');
    }

    SP.openModal(
      '<div class="modal-head"><h3>快捷键</h3>' +
      '<button class="btn icon" data-close-modal>✕</button></div>' +
      '<div class="modal-body">' +
      '<p class="cfg-note" style="margin-top:0">点击键位后按下新组合即可改键（Esc 取消）。' +
      (IS_MAC ? '注意：⌃空格 可能被系统输入法切换占用，可改键或用 ⌘K。' : '') + '</p>' +
      '<div id="keys-list">' + rows() + '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
      '<button class="btn ghost" id="keys-reset">恢复默认</button>' +
      '<button class="btn primary" data-close-modal>完成</button></div>'
    );

    var box = el('modal-box');

    function bind() {
      box.querySelectorAll('.key-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var actId = chip.dataset.keyAct;
          var slot = +chip.dataset.keySlot;
          var action = null;
          ACTIONS.forEach(function (a) { if (a.id === actId) action = a; });
          if (!action) return;
          chip.classList.add('listening');
          chip.textContent = '按下新键…';
          capturing = {
            action: action,
            done: function (combo) {
              if (combo) {
                /* 冲突检测：与其他动作重复时提示并放弃 */
                var clash = null;
                ACTIONS.forEach(function (a2) {
                  if (a2.id === actId) return;
                  if (combosOf(a2).indexOf(combo) >= 0) clash = a2;
                });
                if (clash) {
                  alert('「' + pretty(combo) + '」已被「' + clash.name + '」占用，请换一个组合。');
                } else {
                  var arr = combosOf(action).slice();
                  arr[slot] = combo;
                  custom[actId] = arr;
                  saveCustom();
                }
              }
              refresh();
            }
          };
        });
      });
    }
    function refresh() {
      var list = el('keys-list');
      if (list) { list.innerHTML = rows(); bind(); }
    }
    bind();

    el('keys-reset').addEventListener('click', function () {
      custom = {};
      saveCustom();
      refresh();
      if (SP.toast) SP.toast('快捷键已恢复默认');
    });
  };
})();
