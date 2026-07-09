/* ============================================================
   quick.js — 快速布局面板（⌃1 / ⌘K）
   v2.5：全面事件委托（keydown/click/input/change 各一个监听器挂在
   弹窗上，杜绝“某一处绑定失败导致整体失效”）；打开/切页即聚焦；
   Shift 任意焦点下展开有源。
   数量布局：数字填格，空格下一格，退格清空/回上格。
   音响反推：多组竖向卡片（数量→功率→阻抗 纵向排布），支持同类多组；
   有源不参与功放反推但占用 DSP/调音台输出通道。
   ============================================================ */

(function () {
  var Store = SP.Store;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }
  function powerNum(v) {
    var nums = String(v || '').match(/\d+(?:\.\d+)?/g);
    if (!nums || !nums.length) return 0;
    return nums.map(Number).reduce(function (a, b) { return Math.max(a, b); }, 0);
  }
  function outsOf(t) { return Array.isArray(t.outs) ? t.outs.length : t.outs; }
  var CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

  var CATS = [
    { key: 'mixer',      title: '调音台',     type: 'mixer' },
    { key: 'dsp',        title: 'DSP',        type: 'dsp' },
    { key: 'amp',        title: '功放',       type: 'amp' },
    { key: 'fullrange',  title: '全频音箱',   type: 'speaker', role: 'fullrange' },
    { key: 'sub',        title: '超低音箱',   type: 'speaker', role: 'sub' },
    { key: 'linearray',  title: '线阵列',     type: 'speaker', role: 'linearray', soon: true },
    { key: 'afullrange', title: '有源全频',   type: 'speaker', role: 'fullrange', active: true },
    { key: 'asub',       title: '有源超低',   type: 'speaker', role: 'sub', active: true }
  ];

  function catMatches(t, def) {
    if (t.type !== def.type) return false;
    if (def.type !== 'speaker') return true;
    if ((t.speakerRole || SP.inferSpeakerRole(t.name)) !== def.role) return false;
    return true;
  }

  /* 创建后统计未接音响并提示（默认不自动并联，多余音响保持未接） */
  function afterCreate(added) {
    SP.closeModal();
    SP.selectedDeviceId = '';
    SP.multiSelected = [];
    SP.renderAll();
    var dia = el('wiring-diagram');
    if (dia) {
      SP.setDiagramZoom(SP.fitDiagramZoom(dia), dia);
      if (dia.scrollTo) dia.scrollTo({ left: 0, top: 0 });
      if (SP.syncZoomUI) SP.syncZoomUI();
      if (SP.syncFitBtn) SP.syncFitBtn();
    }
    var left = 0;
    Store.state.devices.forEach(function (d) {
      if (d.type !== 'speaker') return;
      var fed = d.inputs.some(function (p, i) { return !!Store.sourceFor(d.id, i); });
      if (!fed) left++;
    });
    var msg = '已创建 ' + added.length + ' 台设备并完成智能连接（⌘Z 一步撤销）';
    if (left) msg += '；还有 ' + left + ' 只音响未接上（功放输出不足）';
    SP.toast(msg, !!left);
  }

  SP.openQuickLayout = function () {
    var tpls = Store.state.deviceTemplates;
    var showActive = false;
    var mode = 'count';   /* count = 数量布局；reverse = 音响反推 */

    /* ================= 数量布局（count 页）HTML ================= */

    function tplOptions(def, selName) {
      var html = '';
      tpls.forEach(function (t, i) {
        if (!catMatches(t, def)) return;
        var sel = selName && t.name === selName ? ' selected' : '';
        html += '<option value="' + i + '"' + sel + '>' + esc(t.name) +
          '（' + t.ins + '进' + outsOf(t) + '出' +
          (t.specs && t.specs.power ? ' · ' + t.specs.power + 'W' : '') + '）</option>';
      });
      return html || '<option value="">无可用模板</option>';
    }

    function catColumn(def, idx) {
      var isActive = !!def.active;
      if (def.soon) {
        return '<div class="ql-col ql-soon" data-ql-col="' + def.key + '">' +
          '<div class="ql-cat">' + esc(def.title) + '</div>' +
          '<input type="text" class="ql-count" disabled placeholder="—">' +
          '<div class="cfg-note" style="text-align:center;margin:0">敬请期待</div>' +
          '</div>';
      }
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
    function rvPresetChips() {
      var ps = Store.state.reversePresets || [];
      return ps.map(function (p, i) {
        return '<span class="ql-preset" data-rv-preset="' + i + '" title="点击套用反推模板">' +
          esc(p.name) + '<span class="x" data-rv-preset-del="' + i + '" title="删除反推模板">✕</span></span>';
      }).join('');
    }
    function presetOptions(list, emptyText) {
      list = list || [];
      if (!list.length) return '<option value="">' + esc(emptyText) + '</option>';
      return list.map(function (p, i) {
        return '<option value="' + i + '">' + esc(p.name) + '</option>';
      }).join('');
    }
    function countPresetToolsHtml() {
      return '<div class="ql-template-call">' +
        '<label>调用数量模板</label>' +
        '<select id="ql-preset-select">' + presetOptions(Store.state.quickPresets, '暂无数量模板') + '</select>' +
        '<button class="btn ghost sm" data-act="ql-apply-preset">套用</button>' +
        '<button class="btn ghost sm" data-act="ql-rename-preset">重命名</button>' +
        '<button class="btn ghost sm danger" data-act="ql-delete-preset">删除</button>' +
        '</div>';
    }
    function reversePresetToolsHtml() {
      return '<div class="ql-template-call">' +
        '<label>调用反推模板</label>' +
        '<select id="rv-preset-select">' + presetOptions(Store.state.reversePresets, '暂无反推模板') + '</select>' +
        '<button class="btn ghost sm" data-act="rv-apply-preset">套用</button>' +
        '<button class="btn ghost sm" data-act="rv-rename-preset">重命名</button>' +
        '<button class="btn ghost sm danger" data-act="rv-delete-preset">删除</button>' +
        '</div>';
    }
    function tplIndexByName(type, name, role) {
      var idx = -1;
      tpls.forEach(function (t, i) {
        if (idx >= 0 || t.type !== type || t.name !== name) return;
        if (type === 'speaker' && role && (t.speakerRole || SP.inferSpeakerRole(t.name)) !== role) return;
        idx = i;
      });
      return idx;
    }
    function setSelectByTplName(id, name) {
      var sel = el(id);
      if (!sel || !name) return;
      Array.prototype.forEach.call(sel.options || [], function (o) {
        var t = tpls[+o.value];
        if (t && t.name === name) sel.value = o.value;
      });
    }
    function tplNameOfDevice(d) {
      var base = Store.baseNameOf(d.name) || d.name;
      for (var i = 0; i < tpls.length; i++) {
        if (d.tplId && tpls[i].tplId === d.tplId) return tpls[i].name;
      }
      for (var j = 0; j < tpls.length; j++) {
        if (tpls[j].type === d.type && tpls[j].name === base) return tpls[j].name;
      }
      return base;
    }

    /* ================= 音响反推（reverse 页）：多组卡片 ================= */

    function powTpl(t) { return powerNum(t.specs && t.specs.power); }
    function rvSelect(id, type, chFilter, defName) {
      var items = [];
      tpls.forEach(function (t, i) {
        if (t.type !== type) return;
        if (chFilter && t.ins !== chFilter) return;
        items.push({ t: t, idx: i, outs: outsOf(t) });
      });
      var selIdx = -1;
      items.forEach(function (it, n) {
        if (selIdx < 0 && id === 'rv-dsp-tpl' && it.t.name === 'Unit48' &&
            it.t.ins === 4 && it.outs === 8) selIdx = n;
      });
      items.forEach(function (it, n) {
        if (selIdx < 0 && id === 'rv-dsp-tpl' && it.t.ins === 4 && it.outs === 8) selIdx = n;
      });
      items.forEach(function (it, n) {
        if (selIdx < 0 && defName && it.t.name.indexOf(defName) >= 0) selIdx = n;
      });
      var html = items.map(function (it, n) {
        var t = it.t;
        return '<option value="' + it.idx + '"' + (n === selIdx ? ' selected' : '') + '>' + esc(t.name) +
          '（' + t.ins + '进' + outsOf(t) + '出' +
          (t.specs && t.specs.power ? ' · ' + t.specs.power + 'W' : '') + '）</option>';
      }).join('');
      return '<select id="' + id + '">' + (html || '<option value="">无可用模板</option>') + '</select>';
    }

    /* 组模型：支持同类多组（不同型号全频/超低同时入场）；active 组不参与功放反推 */
    function newGroup(role, active) {
      return { role: role, active: !!active, count: '', tplIdx: -1,
        name: '', power: '', ohms: '', parallel: 1 };
    }
    var rvGroups = [newGroup('fullrange', false), newGroup('sub', false)];
    var rvShowActive = false;
    /* 4：功放自动匹配（最接近满足需求）——手动选过后不再自动改 */
    var amp2Manual = false, amp4Manual = false;
    /* 5：「查看当前案例反推过程」双态：点亮载入画布，点灭还原之前的填写 */
    var rvViewing = false, rvViewStash = null;

    function groupTitle(g, i) {
      var n = 0, ord = 0;
      rvGroups.forEach(function (x, j) {
        if (x.role === g.role && x.active === g.active) {
          n++;
          if (j === i) ord = n;
        }
      });
      var base = (g.active ? '有源' : '') + (g.role === 'sub' ? '超低' : '全频');
      return n > 1 ? base + (CIRCLED[ord - 1] || ord) : base;
    }
    function groupVisible(g) { return !g.active || rvShowActive; }

    function rvTplOptionsFor(g, i) {
      var html = '<option value="-1"' + (g.tplIdx === -1 ? ' selected' : '') + '>（选择模板）</option>';
      tpls.forEach(function (t, ti) {
        if (t.type !== 'speaker') return;
        if ((t.speakerRole || SP.inferSpeakerRole(t.name)) !== g.role) return;
        var isActive = t.specs && t.specs.powered === 'active';
        if (isActive !== g.active) return;
        var w = powTpl(t);
        html += '<option value="' + ti + '"' + (g.tplIdx === ti ? ' selected' : '') +
          (w ? '' : ' disabled') + '>' + esc(t.name) +
          (w ? '（' + w + 'W' + (t.specs.ohms ? '/' + t.specs.ohms + 'Ω' : '') + '）' : '（缺功率）') +
          '</option>';
      });
      return html;
    }

    /* 一张卡：标题✕ / 数量 / 功率 / 阻抗 / 模板 / 并联 —— 全部打字输入，无加减按钮 */
    function rvCardHtml(g, i) {
      var usingTpl = g.tplIdx >= 0 && tpls[g.tplIdx];
      var t = usingTpl ? tpls[g.tplIdx] : null;
      var powerVal = usingTpl ? String(powTpl(t) || '') : g.power;
      var ohmsVal = usingTpl ? String((t.specs && t.specs.ohms) || '') : g.ohms;
      var ro = usingTpl ? ' readonly' : '';
      var canDel = rvGroups.filter(groupVisible).length > 1;
      return '<div class="rv-card' + (g.active ? ' rv-active' : '') + '" data-rv-card="' + i + '">' +
        '<div class="rv-card-head"><span>' + esc(groupTitle(g, i)) +
        (g.active ? '<i class="rv-tag-note">不反推</i>' : '') + '</span>' +
        (canDel ? '<button class="btn icon danger" data-act="rv-del" data-i="' + i + '" title="删除本组">✕</button>' : '') +
        '</div>' +
        '<input type="text" inputmode="numeric" class="rv-count" data-rv-cnt="' + i +
        '" value="' + esc(g.count) + '" placeholder="0" autocomplete="off" title="数量（数字键输入，空格跳下一组）">' +
        '<input type="text" inputmode="decimal" data-num data-rv-w="' + i +
        '" value="' + esc(powerVal) + '" placeholder="功率 W*"' + ro + '>' +
        (g.active ? '' :
          '<input type="text" inputmode="decimal" data-num data-rv-o="' + i +
          '" value="' + esc(ohmsVal) + '" placeholder="阻抗 Ω"' + ro + '>') +
        '<select data-rv-tpl="' + i + '" title="选模板自动带出功率/阻抗；选（选择模板）项则直接打字输入">' +
        rvTplOptionsFor(g, i) + '</select>' +
        (g.active ? '' :
          '<select data-rv-par="' + i + '" title="每通道并联只数（需阻抗；并联阻抗减半、功率叠加）">' +
          [1, 2, 3, 4].map(function (n) {
            return '<option value="' + n + '"' + (g.parallel === n ? ' selected' : '') + '>' +
              (n === 1 ? '不并联' : '并联 ' + n + ' 只') + '</option>';
          }).join('') + '</select>') +
        (usingTpl ? '' :
          '<input type="text" data-rv-name="' + i + '" value="' + esc(g.name) + '" placeholder="名称（选填）">' +
          '<button class="btn ghost sm" data-act="rv-save-tpl" data-i="' + i + '" title="把本组音响参数存为模板">存为模板</button>') +
        '</div>';
    }

    function rvCardsHtml() {
      var cards = rvGroups.map(function (g, i) {
        return groupVisible(g) ? rvCardHtml(g, i) : '';
      }).join('');
      var adds = '<div class="rv-add-row">' +
        '<button class="btn ghost sm" data-act="rv-add" data-role="fullrange">＋ 全频</button>' +
        '<button class="btn ghost sm" data-act="rv-add" data-role="sub">＋ 超低</button>' +
        (rvShowActive
          ? '<button class="btn ghost sm" data-act="rv-add" data-role="fullrange" data-active="1">＋ 有源全频</button>' +
            '<button class="btn ghost sm" data-act="rv-add" data-role="sub" data-active="1">＋ 有源超低</button>'
          : '') +
        '<button class="ql-toggle-active' + (rvShowActive ? ' on' : '') + '" data-act="rv-toggle-active">' +
        (rvShowActive ? '▾ 收起有源（不参与反推）' : '▸ 展开有源（Shift · 不参与反推）') + '</button>' +
        '</div>';
      return '<div class="rv-cards">' + cards + '</div>' + adds;
    }

    /* 6：上下结构 —— 模板调用 / 参数 / 音响卡片 / 实时结果，避免右侧挤压 */
    var rvPane =
      '<div id="ql-pane-rv" style="display:none"><div class="rv-stack">' +
      '<div id="rv-preset-tools">' + reversePresetToolsHtml() + '</div>' +
      '<section class="rv-settings-panel">' +
      '<div class="insp-grid2">' +
      '<div class="cfg-field"><label>功率倍率（场景）</label>' +
      '<select id="rv-ratio">' +
      '<option value="1.2">1.2 · 会议人声</option>' +
      '<option value="1.5" selected>1.5 · 驻唱小场</option>' +
      '<option value="2">2 · 商演乐队</option>' +
      '<option value="3">3 · DJ摇滚</option>' +
      '<option value="4">4 · 电音超低</option>' +
      '<option value="custom">自定义…</option></select></div>' +
      '<div class="cfg-field" id="rv-ratio-custom-wrap" style="display:none"><label>自定义倍率</label>' +
      '<input type="text" inputmode="decimal" data-num id="rv-ratio-custom" value="1.5"></div>' +
      '<div class="cfg-field"><label>功放最低负载</label>' +
      '<select id="rv-minohm"><option value="4" selected>4Ω（常规机型）</option>' +
      '<option value="2">2Ω（低阻机型）</option></select></div>' +
      '<div class="cfg-field"><label>功放使用模式</label>' +
      '<select id="rv-ampmode"><option value="mix" selected>搭配使用（4通道优先）</option>' +
      '<option value="2">只用 2 通道</option><option value="4">只用 4 通道</option></select></div>' +
      '<div class="cfg-field" id="rv-amp2-wrap"><label>2 通道功放模板' +
      '<em class="rv-auto-flag" id="rv-amp2-flag" hidden>已自动匹配</em></label>' + rvSelect('rv-amp2-tpl', 'amp', 2) + '</div>' +
      '<div class="cfg-field" id="rv-amp4-wrap"><label>4 通道功放模板' +
      '<em class="rv-auto-flag" id="rv-amp4-flag" hidden>已自动匹配</em></label>' + rvSelect('rv-amp4-tpl', 'amp', 4) + '</div>' +
      '<div class="cfg-field"><label>DSP 模板（默认 4进8出）</label>' + rvSelect('rv-dsp-tpl', 'dsp', 4) + '</div>' +
      '<div class="cfg-field"><label>调音台模板 / 数量</label><div style="display:flex;gap:6px">' +
      rvSelect('rv-mixer-tpl', 'mixer') +
      '<input type="text" inputmode="numeric" data-num id="rv-mixer-n" value="1" style="width:56px"></div></div>' +
      '</div>' +
      '</section>' +
      '<section class="rv-input-panel">' +
      '<p class="cfg-note ql-note" style="margin-top:0">每组卡片：<b>数量 → 功率 → 阻抗</b> 竖排直接打字；' +
      '可加多组应对不同型号；空格跳下一组数量格；Shift 展开有源。</p>' +
      '<div id="rv-cards-wrap">' + rvCardsHtml() + '</div>' +
      '<div class="ql-presets rv-presets" id="rv-presets">' + rvPresetChips() + '</div>' +
      '</section>' +
      '<section class="rv-result-panel">' +
      '<div class="insp-stats" id="rv-calc" style="display:block"></div>' +
      '</section>' +
      '</div></div>';

    SP.openModal(
      '<div class="modal-head"><h3>快速布局</h3>' +
      '<span class="head-note">⌃1 / ⌘K · 数字填格 · 空格下一格 · 退格清空/回上格 · Shift 展开有源</span>' +
      '<button class="btn icon" data-close-modal>✕</button></div>' +
      '<div class="modal-body ql-body">' +
      '<div class="mode-switch">' +
      '<button class="active" data-ql-mode="count">数量布局</button>' +
      '<button data-ql-mode="reverse">音响反推</button></div>' +
      '<div id="ql-pane-count">' +
      '<div id="ql-preset-tools">' + countPresetToolsHtml() + '</div>' +
      '<p class="cfg-note ql-note" style="margin-top:0">依次输入 <b>调音台 · DSP · 功放 · 全频 · 超低</b> 的数量，回车创建并自动智能连接（一步可撤销）。</p>' +
      '<div class="ql-grid">' + CATS.map(catColumn).join('') + '</div>' +
      '<div style="margin-top:9px"><button class="ql-toggle-active" id="ql-show-active" data-act="ql-toggle-active">▸ 展开有源音箱（Shift）</button></div>' +
      '<div class="ql-presets" id="ql-presets">' +
      '<button class="btn ghost sm" data-act="ql-view-current" title="把当前画布数量和模板选择刷新到本面板">查看当前</button>' +
      '<button class="btn ghost sm" data-act="ql-save-preset" title="把当前各格数量与模板选择存为预设">存为预设</button>' +
      '<button class="btn ghost sm" data-act="ql-all-tpl" title="把画布上所有已填写内容的设备存入模板库，并导出 1 个总文件 + 分类 CSV">一键模板</button>' +
      presetChips() +
      '</div>' +
      '</div>' +
      rvPane +
      '</div>' +
      '<div class="modal-foot">' +
      '<span class="foot-left" id="rv-foot-actions" style="display:none">' +
      '<button class="btn ghost" data-act="rv-view-current" title="把当前画布的音响反推配置刷新到本面板，查看这次案例的反推过程">查看当前案例反推过程</button>' +
      '<button class="btn ghost" data-act="rv-save-preset" title="把当前反推配置存为反推模板">保存为反推模板</button>' +
      '</span>' +
      '<span class="foot-spacer"></span>' +
      '<button class="btn ghost" data-close-modal>取消</button>' +
      '<button class="btn primary" id="ql-confirm" data-act="confirm">创建系统 ⏎</button></div>'
    );

    el('modal-box').classList.add('modal-wide');
    el('modal-box').classList.add('modal-quick');
    var box = el('modal-box');

    /* 【关键】modal-box 是常驻复用元素：先拆掉上一次打开时挂的委托监听器，
       否则每开一次面板叠加一套处理器（输入 1 变 11、再输入变 128 的根因） */
    if (box._qlHandlers) {
      box._qlHandlers.forEach(function (h) { box.removeEventListener(h[0], h[1]); });
    }
    box._qlHandlers = [];
    function on(type, fn) {
      box.addEventListener(type, fn);
      box._qlHandlers.push([type, fn]);
    }

    /* ================= 聚焦 ================= */

    function focusFirstCount(preferEmpty) {
      var sel = mode === 'count' ? '.ql-count[data-ql-count]' : '.rv-count[data-rv-cnt]';
      var list = Array.prototype.filter.call(box.querySelectorAll(sel), function (x) {
        if (x.disabled) return false;
        var col = x.closest && x.closest('[hidden]');
        return !col;
      });
      if (!list.length) return;
      var target = list[0];
      if (preferEmpty) {
        for (var i = 0; i < list.length; i++) {
          if (!String(list[i].value || '').trim()) { target = list[i]; break; }
        }
      }
      target.focus();
      if (target.select) target.select();
    }
    function raf(fn) {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
      else fn();
    }

    /* ================= 数量布局辅助 ================= */

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

    function applyPreset(p) {
      var d = p.data || {};
      CATS.forEach(function (def, i) {
        if (def.soon) return;
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
    function loadCurrentCount() {
      var countsByKey = {}, tplByKey = {};
      Store.state.devices.forEach(function (d) {
        var key = d.type;
        if (d.type === 'speaker') {
          var active = d.specs && d.specs.powered === 'active';
          var role = d.speakerRole || SP.inferSpeakerRole(d.name);
          key = active ? (role === 'sub' ? 'asub' : 'afullrange') : role;
        }
        countsByKey[key] = (countsByKey[key] || 0) + 1;
        if (!tplByKey[key]) tplByKey[key] = tplNameOfDevice(d);
      });
      CATS.forEach(function (def, i) {
        if (def.soon) return;
        var inp = box.querySelector('[data-ql-count="' + i + '"]');
        if (inp) inp.value = countsByKey[def.key] || '';
        var sel = box.querySelector('[data-ql-tpl="' + def.key + '"]');
        if (sel && tplByKey[def.key]) {
          Array.prototype.forEach.call(sel.options, function (o) {
            var t = tpls[+o.value];
            if (t && t.name === tplByKey[def.key]) sel.value = o.value;
          });
        }
      });
      if ((countsByKey.afullrange || countsByKey.asub) && !showActive) toggleActive();
      SP.toast('已刷新为当前画布的数量布局');
    }
    function saveCountPreset() {
      var name = prompt('预设名称（如：驻场标准 / 小型婚礼）：');
      if (name === null) return;
      name = name.trim() || '预设 ' + ((Store.state.quickPresets || []).length + 1);
      var d = { counts: {}, tplNames: {} };
      CATS.forEach(function (def, i) {
        if (def.soon) return;
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
    }
    function selectedCountPresetIndex() {
      var sel = el('ql-preset-select');
      return sel && sel.value !== '' ? +sel.value : -1;
    }
    function applySelectedCountPreset() {
      var i = selectedCountPresetIndex();
      var p = Store.state.quickPresets[i];
      if (!p) { SP.toast('还没有可调用的数量模板', true); return; }
      applyPreset(p);
    }
    function renameSelectedCountPreset() {
      var i = selectedCountPresetIndex();
      var p = Store.state.quickPresets[i];
      if (!p) { SP.toast('请先选择数量模板', true); return; }
      var name = prompt('数量模板名称：', p.name);
      if (name === null) return;
      name = name.trim();
      if (!name) { SP.toast('名称不能为空', true); return; }
      p.name = name;
      Store.save();
      refreshPresets();
      var sel = el('ql-preset-select');
      if (sel) sel.value = String(i);
      SP.toast('已重命名数量模板「' + name + '」');
    }
    function deleteSelectedCountPreset() {
      var i = selectedCountPresetIndex();
      var p = Store.state.quickPresets[i];
      if (!p) { SP.toast('请先选择数量模板', true); return; }
      Store.removeQuickPreset(i);
      refreshPresets();
      SP.toast('已删除数量模板「' + p.name + '」（⌘Z 可撤销）');
    }
    function refreshPresets() {
      var wrap = el('ql-presets');
      if (wrap) {
        wrap.innerHTML =
          '<button class="btn ghost sm" data-act="ql-view-current">查看当前</button>' +
          '<button class="btn ghost sm" data-act="ql-save-preset">存为预设</button>' +
          '<button class="btn ghost sm" data-act="ql-all-tpl">一键模板</button>' + presetChips();
      }
      var tools = el('ql-preset-tools');
      if (tools) tools.innerHTML = countPresetToolsHtml();
    }
    function runAllTpl() {
      if (!Store.state.devices.length) { SP.toast('画布上还没有设备', true); return; }
      var r = Store.saveAllTemplates();
      SP.exportTemplateBundle();
      SP.toast('一键模板：新增 ' + r.added + ' · 更新 ' + r.updated + '，已开始导出存档');
    }

    /* ================= 反推：数据与计算 ================= */

    function rvTpl(id) {
      var sel = el(id);
      return sel && sel.value !== '' ? tpls[+sel.value] : null;
    }
    function rvRatio() {
      var sel = el('rv-ratio');
      if (sel && sel.value === 'custom') {
        return Math.max(1, +((el('rv-ratio-custom') || {}).value) || 1.5);
      }
      return +((sel && sel.value) || 1.5);
    }
    function groupData(g, idx) {
      var count = Math.max(0, parseInt(g.count, 10) || 0);
      if (g.tplIdx >= 0 && tpls[g.tplIdx]) {
        var t = tpls[g.tplIdx];
        return { name: t.name, power: powTpl(t), ohms: +(t.specs && t.specs.ohms) || 0,
          count: count, parallel: g.active ? 1 : g.parallel, tpl: t,
          role: g.role, active: g.active };
      }
      /* 未填名称时用与卡片一致的「类型+编号」（全频① / 超低②…），不再出现“手填音响” */
      var fallback = groupTitle(g, idx !== undefined ? idx : rvGroups.indexOf(g));
      return { name: g.name || fallback,
        power: +g.power || 0, ohms: +g.ohms || 0,
        count: count, parallel: g.active ? 1 : g.parallel, tpl: null,
        role: g.role, active: g.active };
    }
    function rvPassiveRows() {
      return rvGroups.map(function (g, i) { return g.active ? null : groupData(g, i); })
        .filter(function (r) { return r && r.count > 0; });
    }
    function rvActiveRows() {
      return rvGroups.map(function (g, i) { return g.active ? groupData(g, i) : null; })
        .filter(function (r) { return r && r.count > 0; });
    }
    function rvCompute() {
      var rows = rvPassiveRows();
      var actRows = rvActiveRows();
      var activeCount = actRows.reduce(function (a, r) { return a + r.count; }, 0);
      var ampMode = (el('rv-ampmode') || {}).value || 'mix';
      var amp2 = rvTpl('rv-amp2-tpl'), amp4 = rvTpl('rv-amp4-tpl');
      var dspT = rvTpl('rv-dsp-tpl'), mixT = rvTpl('rv-mixer-tpl');
      var mixN = Math.max(0, parseInt((el('rv-mixer-n') || {}).value, 10) || 0);
      var calc = Store.reverseCalc(rows, {
        ratio: rvRatio(),
        ampMode: ampMode,
        amp2W: amp2 ? powTpl(amp2) : 0,
        amp4W: amp4 ? powTpl(amp4) : 0,
        minOhms: +((el('rv-minohm') || {}).value) || 4,
        dspOuts: dspT ? outsOf(dspT) : 8,
        activeCount: activeCount
      });
      return { rows: rows, activeRows: actRows, activeCount: activeCount, calc: calc,
        ampMode: ampMode, amp2: amp2, amp4: amp4, dspT: dspT, mixT: mixT, mixN: mixN };
    }

    /* 4：功放自动选用 —— 满足功率倍率需求里最接近的那台；都不满足选最大（保留红警） */
    function rvMaxNeedW() {
      var ratio = rvRatio(), maxW = 0;
      rvGroups.forEach(function (g, i) {
        if (g.active) return;
        var d = groupData(g, i);
        if (!d.count || !d.power) return;
        maxW = Math.max(maxW, Math.ceil(d.power * d.parallel * ratio));
      });
      return maxW;
    }
    function autoPickAmp(selId, flagId, manual) {
      var sel = el(selId), flag = el(flagId);
      if (!sel) return;
      if (manual) { if (flag) flag.hidden = true; return; }
      var need = rvMaxNeedW();
      if (!need) { if (flag) flag.hidden = true; return; }
      var bestFit = null, bestFitW = Infinity, bestMax = null, bestMaxW = -1;
      Array.prototype.forEach.call(sel.options || [], function (o) {
        if (o.value === '' || o.disabled) return;
        var t = tpls[+o.value];
        if (!t) return;
        var w = powTpl(t);
        if (!w) return;
        if (w >= need && w < bestFitW) { bestFitW = w; bestFit = o.value; }
        if (w > bestMaxW) { bestMaxW = w; bestMax = o.value; }
      });
      var target = bestFit !== null ? bestFit : bestMax;
      if (target !== null) {
        if (sel.value !== String(target)) sel.value = target;
        if (flag) flag.hidden = false;
      } else if (flag) {
        flag.hidden = true;
      }
    }
    function autoPickAmps() {
      autoPickAmp('rv-amp2-tpl', 'rv-amp2-flag', amp2Manual);
      autoPickAmp('rv-amp4-tpl', 'rv-amp4-flag', amp4Manual);
    }

    function rvCalcShow() {
      var host = el('rv-calc');
      if (!host) return;
      autoPickAmps();   /* 先自动匹配功放，再按所选功放计算 */
      var r = rvCompute();
      var c = r.calc;
      var act = r.activeRows || [];
      if (!c.rows.length && !c.errors.length && !act.length) {
        host.innerHTML = '<span class="insp-stat">填写各组数量后自动反推</span>';
        return;
      }
      var parts = [];
      c.rows.forEach(function (row) {
        parts.push('<span class="insp-stat">' + esc(row.name) + '：需 <b>≥' + row.needW +
          'W</b>/通道' + (row.par > 1 ? ' · 并联' + row.par + '只 ' + row.loadOhm + 'Ω/' + row.loadW + 'W' : '') +
          ' · 占 ' + row.ch + ' 路</span>');
      });
      if (c.amp2N) parts.push('<span class="insp-stat">2通道功放 <b>' + c.amp2N + '</b> 台</span>');
      if (c.amp4N) parts.push('<span class="insp-stat">4通道功放 <b>' + c.amp4N + '</b> 台</span>');
      if (r.activeCount) {
        parts.push('<span class="insp-stat rv-active">有源占用 <b>' + r.activeCount + '</b> 路线路输出（不反推功放）</span>');
      }
      if (c.dspN) parts.push('<span class="insp-stat">DSP <b>' + c.dspN + '</b> 台</span>');
      /* 无 DSP 直推：校验调音台输出是否够（功放输入 + 有源） */
      if (!r.dspT && c.lineFeeds) {
        var mixOuts = r.mixT ? outsOf(r.mixT) * Math.max(1, r.mixN) : 0;
        if (mixOuts < c.lineFeeds) {
          parts.push('<span class="insp-stat" style="color:var(--red);border-color:var(--red)">⚠ 调音台输出不足：需 ' +
            c.lineFeeds + ' 路，仅 ' + mixOuts + ' 路</span>');
        }
      }
      c.warns.forEach(function (w) {
        parts.push('<span class="insp-stat" style="color:var(--red);border-color:var(--red)">' + esc(w) + '</span>');
      });
      c.errors.forEach(function (w) {
        parts.push('<span class="insp-stat" style="color:var(--red);border-color:var(--red)">✕ ' + esc(w) + '</span>');
      });
      host.innerHTML = parts.join('');
    }

    /* 重渲染卡片区（保持某张卡内焦点） */
    function refreshRvCards(focusAttr, focusIdx) {
      var wrap = el('rv-cards-wrap');
      if (!wrap) return;
      wrap.innerHTML = rvCardsHtml();
      rvCalcShow();
      if (focusAttr !== undefined) {
        raf(function () {
          var t = wrap.querySelector('[' + focusAttr + '="' + focusIdx + '"]');
          if (t) { t.focus(); if (t.select) t.select(); }
        });
      }
    }
    function toggleRvActive() {
      rvShowActive = !rvShowActive;
      refreshRvCards();
    }
    function refreshRvPresets() {
      var wrap = el('rv-presets');
      if (wrap) wrap.innerHTML = rvPresetChips();
      var tools = el('rv-preset-tools');
      if (tools) tools.innerHTML = reversePresetToolsHtml();
    }

    /* ================= 反推：快照 / 查看当前 ================= */

    function reverseSnapshot() {
      var ratioSel = el('rv-ratio');
      function nameOf(id) { var t = rvTpl(id); return t ? t.name : ''; }
      var rows = [];
      rvGroups.forEach(function (g) {
        var count = Math.max(0, parseInt(g.count, 10) || 0);
        if (!count) return;
        var t = g.tplIdx >= 0 ? tpls[g.tplIdx] : null;
        rows.push({ role: g.role, active: g.active, tplName: t ? t.name : '',
          name: g.name, power: g.power, ohms: g.ohms, count: g.count, parallel: g.parallel });
      });
      return {
        rows: rows,
        ratio: ratioSel ? ratioSel.value : '1.5',
        ratioCustom: (el('rv-ratio-custom') || {}).value || '1.5',
        minOhms: (el('rv-minohm') || {}).value || '4',
        ampMode: (el('rv-ampmode') || {}).value || 'mix',
        amp2Name: nameOf('rv-amp2-tpl'), amp4Name: nameOf('rv-amp4-tpl'),
        dspName: nameOf('rv-dsp-tpl'), mixerName: nameOf('rv-mixer-tpl'),
        mixerN: (el('rv-mixer-n') || {}).value || '1'
      };
    }
    function applyReverseSnapshot(d) {
      d = d || {};
      var rows = d.rows && d.rows.length ? d.rows : null;
      if (rows) {
        rvGroups = rows.map(function (r) {
          var g = newGroup(r.role || 'fullrange', !!r.active);
          g.tplIdx = r.tplName ? tplIndexByName('speaker', r.tplName, g.role) : -1;
          g.name = r.name || '';
          g.power = r.power || '';
          g.ohms = r.ohms || '';
          g.count = r.count || '';
          g.parallel = Math.max(1, +r.parallel || 1);
          return g;
        });
        if (!rvGroups.some(function (g) { return !g.active; })) rvGroups.unshift(newGroup('fullrange', false));
        rvShowActive = rvGroups.some(function (g) { return g.active; });
      } else {
        rvGroups = [newGroup('fullrange', false), newGroup('sub', false)];
      }
      refreshRvCards();
      if (el('rv-ratio')) el('rv-ratio').value = d.ratio || '1.5';
      if (el('rv-ratio-custom')) el('rv-ratio-custom').value = d.ratioCustom || '1.5';
      if (el('rv-minohm')) el('rv-minohm').value = d.minOhms || '4';
      if (el('rv-ampmode')) el('rv-ampmode').value = d.ampMode || 'mix';
      if (el('rv-mixer-n')) el('rv-mixer-n').value = d.mixerN || '1';
      setSelectByTplName('rv-amp2-tpl', d.amp2Name);
      setSelectByTplName('rv-amp4-tpl', d.amp4Name);
      setSelectByTplName('rv-dsp-tpl', d.dspName);
      setSelectByTplName('rv-mixer-tpl', d.mixerName);
      /* 快照里带功放名 = 尊重原选择；没带 = 交给自动匹配 */
      amp2Manual = !!d.amp2Name;
      amp4Manual = !!d.amp4Name;
      if (el('rv-ratio-custom-wrap')) {
        el('rv-ratio-custom-wrap').style.display = (el('rv-ratio') || {}).value === 'custom' ? '' : 'none';
      }
      syncAmpModeUI();
      rvCalcShow();
    }
    /* 按 (角色+有源+型号+参数+并联) 聚合当前画布 → 多组 */
    function reverseFromCurrent() {
      var mixers = Store.state.devices.filter(function (d) { return d.type === 'mixer'; });
      var dsps = Store.state.devices.filter(function (d) { return d.type === 'dsp'; });
      var amps = Store.state.devices.filter(function (d) { return d.type === 'amp'; });
      var map = {}, order = [];
      Store.state.devices.forEach(function (d) {
        if (d.type !== 'speaker') return;
        var active = !!(d.specs && d.specs.powered === 'active');
        var rp = d.reverseParallel || {};
        var par = active ? 1 : Math.max(1, +rp.parallel || 1);
        var name = tplNameOfDevice(d);
        var sp = d.specs || {};
        var key = [d.speakerRole || 'fullrange', active ? 'a' : 'p', name,
          sp.power || '', sp.ohms || '', par].join('::');
        if (!map[key]) {
          map[key] = { role: d.speakerRole || 'fullrange', active: active, tplName: name,
            name: name, power: sp.power || '', ohms: sp.ohms || '', count: 0, parallel: par };
          order.push(key);
        }
        map[key].count++;
      });
      var amp2 = amps.filter(function (d) { return d.inputs.length === 2 || d.outputs.length === 2; });
      var amp4 = amps.filter(function (d) { return d.inputs.length === 4 || d.outputs.length === 4; });
      return {
        rows: order.map(function (k) { return map[k]; }),
        ratio: (el('rv-ratio') || {}).value || '1.5',
        ratioCustom: (el('rv-ratio-custom') || {}).value || '1.5',
        minOhms: (el('rv-minohm') || {}).value || '4',
        ampMode: amp2.length && amp4.length ? 'mix' : amp4.length ? '4' : amp2.length ? '2' : 'mix',
        amp2Name: amp2[0] ? tplNameOfDevice(amp2[0]) : '',
        amp4Name: amp4[0] ? tplNameOfDevice(amp4[0]) : '',
        dspName: dsps[0] ? tplNameOfDevice(dsps[0]) : '',
        mixerName: mixers[0] ? tplNameOfDevice(mixers[0]) : '',
        mixerN: mixers.length || 1
      };
    }
    function saveReversePreset() {
      var name = prompt('反推模板名称（如：双全频+超低并联）：');
      if (name === null) return;
      name = name.trim() || '反推模板 ' + ((Store.state.reversePresets || []).length + 1);
      Store.addReversePreset(name, reverseSnapshot());
      refreshRvPresets();
      SP.toast('已保存反推模板「' + name + '」');
    }
    function selectedReversePresetIndex() {
      var sel = el('rv-preset-select');
      return sel && sel.value !== '' ? +sel.value : -1;
    }
    function applySelectedReversePreset() {
      var i = selectedReversePresetIndex();
      var p = (Store.state.reversePresets || [])[i];
      if (!p) { SP.toast('还没有可调用的反推模板', true); return; }
      applyReverseSnapshot(p.data);
      SP.toast('已套用反推模板「' + p.name + '」');
    }
    function renameSelectedReversePreset() {
      var i = selectedReversePresetIndex();
      var p = (Store.state.reversePresets || [])[i];
      if (!p) { SP.toast('请先选择反推模板', true); return; }
      var name = prompt('反推模板名称：', p.name);
      if (name === null) return;
      name = name.trim();
      if (!name) { SP.toast('名称不能为空', true); return; }
      p.name = name;
      Store.save();
      refreshRvPresets();
      var sel = el('rv-preset-select');
      if (sel) sel.value = String(i);
      SP.toast('已重命名反推模板「' + name + '」');
    }
    function deleteSelectedReversePreset() {
      var i = selectedReversePresetIndex();
      var p = (Store.state.reversePresets || [])[i];
      if (!p) { SP.toast('请先选择反推模板', true); return; }
      Store.removeReversePreset(i);
      refreshRvPresets();
      SP.toast('已删除反推模板「' + p.name + '」（⌘Z 可撤销）');
    }
    function saveGroupAsTemplate(i) {
      var g = rvGroups[i];
      if (!g) return;
      if (!g.name || !+g.power) { SP.toast('存模板需要名称和功率', true); return; }
      var t = { type: 'speaker', name: g.name, ins: 1, outs: 1,
        speakerRole: g.role, specs: { powered: g.active ? 'active' : 'passive', power: String(g.power) } };
      if (!g.active && +g.ohms) t.specs.ohms = String(g.ohms);
      Store.mergeTemplate(t);
      Store.save();
      tpls = Store.state.deviceTemplates;
      refreshRvCards();
      SP.toast('已存为音响模板「' + g.name + '」');
    }

    function syncAmpModeUI() {
      var m = (el('rv-ampmode') || {}).value || 'mix';
      if (el('rv-amp2-wrap')) el('rv-amp2-wrap').style.display = m === '4' ? 'none' : '';
      if (el('rv-amp4-wrap')) el('rv-amp4-wrap').style.display = m === '2' ? 'none' : '';
    }

    /* ================= 创建 ================= */

    function confirm2() {
      if (mode === 'reverse') {
        autoPickAmps();   /* 创建前兜底跑一次自动匹配（未触发过实时计算时） */
        var r = rvCompute();
        var c = r.calc;
        var actRows = r.activeRows || [];
        if (c.errors.length) { SP.toast(c.errors[0], true); return; }
        if (!c.rows.length && !actRows.length) { SP.toast('请先填写各组音响数量', true); return; }
        if (c.amp2N && !r.amp2) { SP.toast('需要 2 通道功放模板（可在模板库新建）', true); return; }
        if (c.amp4N && !r.amp4) { SP.toast('需要 4 通道功放模板（可在模板库新建）', true); return; }
        var speakerRows = [];
        var calcIdx = 0;
        r.rows.forEach(function (row) {
          if (!row.count || !row.power) return;
          var cr = c.rows[calcIdx++];
          var tpl = row.tpl || {
            type: 'speaker', name: row.name, ins: 1, outs: 1,
            speakerRole: row.role,
            specs: { powered: 'passive', power: String(row.power),
              ohms: row.ohms ? String(row.ohms) : undefined }
          };
          speakerRows.push({ tpl: tpl, count: row.count, parallel: row.parallel,
            a2: cr ? cr.a2 : 0, a4: cr ? cr.a4 : 0, ch: cr ? cr.ch : 0 });
        });
        var activeRows = actRows.map(function (row) {
          var tpl = row.tpl || {
            type: 'speaker', name: row.name, ins: 1, outs: 1,
            speakerRole: row.role,
            specs: { powered: 'active', power: String(row.power) }
          };
          return { tpl: tpl, count: row.count };
        });
        var added = Store.reverseLayout({
          mixerTpl: r.mixT, mixerCount: r.mixN,
          dspTpl: r.dspT, dspCount: c.dspN,
          amp2Tpl: r.amp2, amp4Tpl: r.amp4,
          speakerRows: speakerRows,
          activeRows: activeRows
        });
        afterCreate(added);
        if (c.warns.length) {
          setTimeout(function () { SP.toast(c.warns[0], true); }, 2800);
        }
        return;
      }
      var items2 = [];
      CATS.forEach(function (def, i) {
        if (def.soon) return;
        var inp = box.querySelector('[data-ql-count="' + i + '"]');
        var n = Math.max(0, Math.min(128, parseInt(inp && inp.value, 10) || 0));
        if (!n) return;
        var sel = box.querySelector('[data-ql-tpl="' + def.key + '"]');
        var t = sel && sel.value !== '' ? tpls[+sel.value] : null;
        if (!t) return;
        items2.push({ tpl: t, count: n, powered: def.active ? 'active' : 'passive' });
      });
      if (!items2.length) { SP.toast('请至少给一类设备填数量，例如 1 2 6 10 2', true); return; }
      afterCreate(Store.quickLayout(items2));
    }

    /* ================= 事件委托：click ================= */

    on('click', function (e) {
      var modeBtn = e.target.closest && e.target.closest('[data-ql-mode]');
      if (modeBtn) {
        mode = modeBtn.dataset.qlMode;
        box.querySelectorAll('[data-ql-mode]').forEach(function (x) {
          x.classList.toggle('active', x === modeBtn);
        });
        if (el('ql-pane-count')) el('ql-pane-count').style.display = mode === 'count' ? '' : 'none';
        if (el('ql-pane-rv')) el('ql-pane-rv').style.display = mode === 'reverse' ? '' : 'none';
        var footActs = el('rv-foot-actions');
        if (footActs) footActs.style.display = mode === 'reverse' ? '' : 'none';
        if (mode === 'reverse') { syncAmpModeUI(); rvCalcShow(); }
        raf(function () { focusFirstCount(false); });
        return;
      }
      var chip = e.target.closest && e.target.closest('[data-preset]');
      if (chip && !e.target.closest('[data-preset-del]')) {
        var p0 = Store.state.quickPresets[+chip.dataset.preset];
        if (p0) applyPreset(p0);
        return;
      }
      var del = e.target.closest && e.target.closest('[data-preset-del]');
      if (del) {
        var di = +del.dataset.presetDel;
        var dp = Store.state.quickPresets[di];
        Store.removeQuickPreset(di);
        refreshPresets();
        SP.toast('已删除预设「' + (dp ? dp.name : '') + '」（⌘Z 可撤销）');
        return;
      }
      var rvChip = e.target.closest && e.target.closest('[data-rv-preset]');
      if (rvChip && !e.target.closest('[data-rv-preset-del]')) {
        var rp = (Store.state.reversePresets || [])[+rvChip.dataset.rvPreset];
        if (rp) { applyReverseSnapshot(rp.data); SP.toast('已套用反推模板「' + rp.name + '」'); }
        return;
      }
      var rvDel = e.target.closest && e.target.closest('[data-rv-preset-del]');
      if (rvDel) {
        var ri = +rvDel.dataset.rvPresetDel;
        var rpp = (Store.state.reversePresets || [])[ri];
        Store.removeReversePreset(ri);
        refreshRvPresets();
        SP.toast('已删除反推模板「' + (rpp ? rpp.name : '') + '」（⌘Z 可撤销）');
        return;
      }
      var actBtn = e.target.closest && e.target.closest('[data-act]');
      if (!actBtn) return;
      var act = actBtn.dataset.act;
      if (act === 'confirm') confirm2();
      else if (act === 'ql-toggle-active') toggleActive();
      else if (act === 'ql-view-current') loadCurrentCount();
      else if (act === 'ql-save-preset') saveCountPreset();
      else if (act === 'ql-all-tpl') runAllTpl();
      else if (act === 'ql-apply-preset') applySelectedCountPreset();
      else if (act === 'ql-rename-preset') renameSelectedCountPreset();
      else if (act === 'ql-delete-preset') deleteSelectedCountPreset();
      else if (act === 'rv-toggle-active') toggleRvActive();
      else if (act === 'rv-add') {
        rvGroups.push(newGroup(actBtn.dataset.role || 'fullrange', actBtn.dataset.active === '1'));
        refreshRvCards('data-rv-cnt', rvGroups.length - 1);
      } else if (act === 'rv-del') {
        rvGroups.splice(+actBtn.dataset.i, 1);
        if (!rvGroups.length) rvGroups.push(newGroup('fullrange', false));
        refreshRvCards();
      } else if (act === 'rv-save-tpl') {
        saveGroupAsTemplate(+actBtn.dataset.i);
      } else if (act === 'rv-view-current') {
        /* 5：双态 —— 点亮载入画布反推过程，点灭还原之前的填写内容 */
        if (!rvViewing) {
          rvViewStash = { snap: reverseSnapshot(), m2: amp2Manual, m4: amp4Manual };
          applyReverseSnapshot(reverseFromCurrent());
          rvViewing = true;
          actBtn.classList.add('on');
          SP.toast('已按当前画布还原本次案例的反推过程（再点一次返回）');
        } else {
          applyReverseSnapshot((rvViewStash && rvViewStash.snap) || {});
          amp2Manual = rvViewStash ? rvViewStash.m2 : false;
          amp4Manual = rvViewStash ? rvViewStash.m4 : false;
          rvViewing = false;
          rvViewStash = null;
          actBtn.classList.remove('on');
          rvCalcShow();
          SP.toast('已返回查看之前的填写内容');
        }
      } else if (act === 'rv-save-preset') {
        saveReversePreset();
      } else if (act === 'rv-apply-preset') {
        applySelectedReversePreset();
      } else if (act === 'rv-rename-preset') {
        renameSelectedReversePreset();
      } else if (act === 'rv-delete-preset') {
        deleteSelectedReversePreset();
      }
    });

    /* ================= 事件委托：input / change ================= */

    on('input', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      /* 纯数字/小数过滤（含粘贴） */
      if (t.getAttribute('data-num') !== null) {
        var clean = String(t.value || '').replace(/[^\d.]/g, '');
        if (clean !== t.value) t.value = clean;
      }
      if (t.getAttribute('data-rv-cnt') !== null) {
        var g1 = rvGroups[+t.getAttribute('data-rv-cnt')];
        if (g1) { g1.count = t.value.replace(/\D/g, ''); if (g1.count !== t.value) t.value = g1.count; rvCalcShow(); }
        return;
      }
      if (t.getAttribute('data-rv-w') !== null) {
        var g2 = rvGroups[+t.getAttribute('data-rv-w')];
        if (g2 && g2.tplIdx < 0) { g2.power = t.value; rvCalcShow(); }
        return;
      }
      if (t.getAttribute('data-rv-o') !== null) {
        var g3 = rvGroups[+t.getAttribute('data-rv-o')];
        if (g3 && g3.tplIdx < 0) { g3.ohms = t.value; rvCalcShow(); }
        return;
      }
      if (t.getAttribute('data-rv-name') !== null) {
        var g4 = rvGroups[+t.getAttribute('data-rv-name')];
        if (g4) g4.name = t.value;
        return;
      }
      if (t.id === 'rv-ratio-custom' || t.id === 'rv-mixer-n') rvCalcShow();
    });

    on('change', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-rv-tpl') !== null) {
        var i = +t.getAttribute('data-rv-tpl');
        var g = rvGroups[i];
        if (g) {
          g.tplIdx = +t.value;
          if (g.tplIdx >= 0 && tpls[g.tplIdx]) {
            /* 选模板：自动带出功率/阻抗（只读显示） */
            var tp = tpls[g.tplIdx];
            g.power = String(powTpl(tp) || '');
            g.ohms = String((tp.specs && tp.specs.ohms) || '');
          }
          refreshRvCards('data-rv-tpl', i);
        }
        return;
      }
      if (t.getAttribute('data-rv-par') !== null) {
        var gp = rvGroups[+t.getAttribute('data-rv-par')];
        if (gp) { gp.parallel = +t.value; rvCalcShow(); }
        return;
      }
      if (t.id === 'rv-ratio') {
        if (el('rv-ratio-custom-wrap')) {
          el('rv-ratio-custom-wrap').style.display = t.value === 'custom' ? '' : 'none';
        }
        rvCalcShow();
        return;
      }
      if (t.id === 'rv-ampmode') { syncAmpModeUI(); rvCalcShow(); return; }
      if (t.id === 'rv-amp2-tpl') { amp2Manual = true; rvCalcShow(); return; }
      if (t.id === 'rv-amp4-tpl') { amp4Manual = true; rvCalcShow(); return; }
      if (t.id === 'rv-minohm' || t.id === 'rv-dsp-tpl' || t.id === 'rv-mixer-tpl') { rvCalcShow(); return; }
    });

    /* ================= 事件委托：keydown / keyup（含 Shift） ================= */

    var shiftPending = false;
    function isFreeTextTarget(t) {
      /* 名称等自由文本框：Shift 用于大写，不触发展开 */
      return !!(t && t.getAttribute && t.getAttribute('data-rv-name') !== null);
    }
    function countCellsOf(pane) {
      var sel = pane === 'count' ? '.ql-count[data-ql-count]' : '.rv-count[data-rv-cnt]';
      return Array.prototype.filter.call(box.querySelectorAll(sel), function (x) {
        if (x.disabled) return false;
        return !(x.closest && x.closest('[hidden]'));
      });
    }

    on('keydown', function (e) {
      if (e.key === 'Shift') { shiftPending = true; return; }
      shiftPending = false;

      var t = e.target;
      var tag = (t && t.tagName) || '';
      if (e.key === 'Enter' && tag !== 'TEXTAREA') {
        e.preventDefault();
        confirm2();
        return;
      }

      var isQlCell = t && t.getAttribute && t.getAttribute('data-ql-count') !== null;
      var isRvCell = t && t.getAttribute && t.getAttribute('data-rv-cnt') !== null;
      if (isQlCell || isRvCell) {
        var list = countCellsOf(isQlCell ? 'count' : 'reverse');
        var pos = list.indexOf(t);
        if (e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          var nx = list[Math.min(pos + 1, list.length - 1)];
          if (nx) { nx.focus(); if (nx.select) nx.select(); }
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          if (t.value !== '') {
            t.value = '';
            if (isRvCell) { var gg = rvGroups[+t.getAttribute('data-rv-cnt')]; if (gg) { gg.count = ''; rvCalcShow(); } }
          } else if (pos > 0) {
            var pv = list[pos - 1];
            pv.value = '';
            if (isRvCell && pv.getAttribute('data-rv-cnt') !== null) {
              var gp2 = rvGroups[+pv.getAttribute('data-rv-cnt')];
              if (gp2) { gp2.count = ''; rvCalcShow(); }
            }
            pv.focus();
            if (pv.select) pv.select();
          }
        } else if (/^\d$/.test(e.key)) {
          e.preventDefault();
          var v = (t.value + e.key).replace(/^0+(\d)/, '$1');
          t.value = String(Math.min(128, +v));
          if (isRvCell) { var gg2 = rvGroups[+t.getAttribute('data-rv-cnt')]; if (gg2) { gg2.count = t.value; rvCalcShow(); } }
        } else if (e.key.length === 1) {
          e.preventDefault();   /* 数量格只接受数字 */
        }
        return;
      }

      /* 兜底：焦点不在任何输入控件时按数字 → 跳到第一个空数量格并填入 */
      if (/^\d$/.test(e.key) && !/INPUT|SELECT|TEXTAREA/.test(tag)) {
        var cells = countCellsOf(mode === 'count' ? 'count' : 'reverse');
        if (cells.length) {
          e.preventDefault();
          var target = cells[0];
          for (var ci = 0; ci < cells.length; ci++) {
            if (!String(cells[ci].value || '').trim()) { target = cells[ci]; break; }
          }
          target.focus();
          target.value = e.key;
          if (target.getAttribute('data-rv-cnt') !== null) {
            var gf = rvGroups[+target.getAttribute('data-rv-cnt')];
            if (gf) { gf.count = e.key; rvCalcShow(); }
          }
        }
      }
    });

    on('keyup', function (e) {
      if (e.key !== 'Shift') return;
      if (!shiftPending) return;
      shiftPending = false;
      if (isFreeTextTarget(e.target)) return;
      /* 单独按下并松开 Shift：任意焦点下展开/收起有源 */
      if (mode === 'count') toggleActive();
      else toggleRvActive();
    });

    /* ================= 初始化 ================= */

    syncActiveCols();
    syncAmpModeUI();
    raf(function () { focusFirstCount(false); });
  };
})();
