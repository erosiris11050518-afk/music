/* ============================================================
   quick.js — 快速布局面板（⌃1 / ⌘K）
   数量布局：按数字填格，空格下一格，退格清空/回上格，
   有源列默认收起（Shift 或点按展开）；线阵列留占位口子。
   音响反推：选音响和功率倍率，反推功放/DSP 数量与功率建议。
   支持预设模板存取。
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

    /* ---------- 反推页：动态音响行 + 并联 + 2/4通道搭配 ---------- */
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
    /* 音响行数据模型：tplIdx(-1=手填) */
    var rvRows = [{ role: 'fullrange', tplIdx: -1, name: '', power: '', ohms: '', count: '', parallel: 1 }];

    function rvSpkOptions(row) {
      var html = '<option value="-1"' + (row.tplIdx === -1 ? ' selected' : '') + '>— 手填音响信息 —</option>';
      tpls.forEach(function (t, i) {
        if (t.type !== 'speaker') return;
        if ((t.speakerRole || SP.inferSpeakerRole(t.name)) !== row.role) return;
        var w = powTpl(t);
        html += '<option value="' + i + '"' + (row.tplIdx === i ? ' selected' : '') +
          (w ? '' : ' disabled') + '>' + esc(t.name) +
          (w ? '（' + w + 'W' + (t.specs.ohms ? '/' + t.specs.ohms + 'Ω' : '') + '）' : '（缺功率）') +
          '</option>';
      });
      return html;
    }

    function rvRowsHtml() {
      return rvRows.map(function (r, i) {
        var manual = r.tplIdx === -1;
        return '<div class="rv-row" data-rv="' + i + '">' +
          '<select data-rv-role="' + i + '">' +
          '<option value="fullrange"' + (r.role === 'fullrange' ? ' selected' : '') + '>全频</option>' +
          '<option value="sub"' + (r.role === 'sub' ? ' selected' : '') + '>超低</option></select>' +
          '<select data-rv-tpl="' + i + '">' + rvSpkOptions(r) + '</select>' +
          (manual
            ? '<input type="text" data-rv-name="' + i + '" placeholder="名称" value="' + esc(r.name) + '" style="width:90px">' +
              '<input type="number" data-rv-w="' + i + '" placeholder="功率W*" value="' + esc(r.power) + '" style="width:72px">' +
              '<input type="number" data-rv-o="' + i + '" placeholder="阻抗Ω" value="' + esc(r.ohms) + '" style="width:64px">' +
              '<button class="btn icon" data-rv-save="' + i + '" title="把手填音响存为模板">💾</button>'
            : '') +
          '<label class="cfg-note" style="margin:0">数量</label>' +
          '<input type="number" data-rv-n="' + i + '" min="0" max="128" value="' + esc(r.count) + '" style="width:56px" placeholder="0">' +
          '<label class="cfg-note" style="margin:0" title="每通道并联只数：功放 1 路带几只（需阻抗，注意并联阻抗减半、功率叠加）">并联</label>' +
          '<select data-rv-par="' + i + '">' + [1, 2, 3, 4].map(function (n) {
            return '<option value="' + n + '"' + (r.parallel === n ? ' selected' : '') + '>' +
              (n === 1 ? '不并联' : n + '只/通道') + '</option>';
          }).join('') + '</select>' +
          '<button class="btn icon danger" data-rv-del="' + i + '" title="删除本行">✕</button>' +
          '</div>';
      }).join('');
    }

    var rvPane =
      '<div id="ql-pane-rv" style="display:none">' +
      '<p class="cfg-note" style="margin-top:0">逐行添加音响（至少填功率；并联须填阻抗），' +
      '按倍率反推功放/DSP 数量，路数全部向上取整保富余。并联音箱创建后自动串接。</p>' +
      '<div id="rv-rows">' + rvRowsHtml() + '</div>' +
      '<button class="btn ghost sm" id="rv-add-row" style="margin:6px 0 12px">＋ 添加一种音响</button>' +
      '<div class="ql-presets rv-presets" id="rv-presets">' +
      '<button class="btn ghost sm" id="rv-view-current">查看当前</button>' +
      '<button class="btn ghost sm" id="rv-save-preset">保存反推模板</button>' +
      '<button class="btn ghost sm" id="rv-update-templates">更新到一键模板</button>' +
      rvPresetChips() +
      '</div>' +
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
      '<input type="number" id="rv-ratio-custom" min="1" max="6" step="0.1" value="1.5"></div>' +
      '<div class="cfg-field"><label>功放最低负载</label>' +
      '<select id="rv-minohm"><option value="4" selected>4Ω（常规机型）</option>' +
      '<option value="2">2Ω（低阻机型）</option></select></div>' +
      '<div class="cfg-field"><label>功放使用模式</label>' +
      '<select id="rv-ampmode"><option value="mix" selected>搭配使用（4通道优先）</option>' +
      '<option value="2">只用 2 通道</option><option value="4">只用 4 通道</option></select></div>' +
      '<div class="cfg-field" id="rv-amp2-wrap"><label>2 通道功放模板</label>' + rvSelect('rv-amp2-tpl', 'amp', 2) + '</div>' +
      '<div class="cfg-field" id="rv-amp4-wrap"><label>4 通道功放模板</label>' + rvSelect('rv-amp4-tpl', 'amp', 4) + '</div>' +
      '<div class="cfg-field"><label>DSP 模板（默认 4进8出）</label>' + rvSelect('rv-dsp-tpl', 'dsp', 4) + '</div>' +
      '<div class="cfg-field"><label>调音台模板 / 数量</label><div style="display:flex;gap:6px">' +
      rvSelect('rv-mixer-tpl', 'mixer') +
      '<input type="number" id="rv-mixer-n" min="0" max="8" value="1" style="width:56px"></div></div>' +
      '</div>' +
      '<div class="insp-stats" id="rv-calc" style="display:block"></div>' +
      '</div>';

    SP.openModal(
      '<div class="modal-head"><h3>快速布局</h3>' +
      '<span class="head-note">⌃1 / ⌘K · 数字填格 · 空格下一格 · 退格清空/回上格 · Shift 展开有源</span>' +
      '<button class="btn icon" data-close-modal>✕</button></div>' +
      '<div class="modal-body ql-body">' +
      '<div class="mode-switch">' +
      '<button class="active" data-ql-mode="count">数量布局</button>' +
      '<button data-ql-mode="reverse">音响反推</button></div>' +
      '<div id="ql-pane-count">' +
      '<p class="cfg-note ql-note" style="margin-top:0">依次输入 <b>调音台 · DSP · 功放 · 全频 · 超低</b> 的数量，回车创建并自动智能连接（一步可撤销）。</p>' +
      '<div class="ql-grid">' + CATS.map(catColumn).join('') + '</div>' +
      '<div style="margin-top:9px"><button class="ql-toggle-active" id="ql-show-active">▸ 展开有源音箱（Shift）</button></div>' +
      '<div class="ql-presets" id="ql-presets">' +
      '<button class="btn ghost sm" id="ql-view-current" title="把当前画布数量和模板选择刷新到本面板">查看当前</button>' +
      '<button class="btn ghost sm" id="ql-save-preset" title="把当前各格数量与模板选择存为预设">存为预设</button>' +
      '<button class="btn ghost sm" id="ql-all-tpl" title="把画布上所有已填写内容的设备存入模板库，并导出 1 个总文件 + 分类 CSV">一键模板</button>' +
      presetChips() +
      '</div>' +
      '</div>' +
      rvPane +
      '</div>' +
      '<div class="modal-foot">' +
      '<button class="btn ghost" data-close-modal>取消</button>' +
      '<button class="btn primary" id="ql-confirm">创建系统 ⏎</button></div>'
    );

    el('modal-box').classList.add('modal-wide');
    var box = el('modal-box');
    var counts = box.querySelectorAll('.ql-count[data-ql-count]');

    /* --- 页签切换 --- */
    box.querySelectorAll('[data-ql-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        mode = b.dataset.qlMode;
        box.querySelectorAll('[data-ql-mode]').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
        el('ql-pane-count').style.display = mode === 'count' ? '' : 'none';
        el('ql-pane-rv').style.display = mode === 'reverse' ? '' : 'none';
        if (mode === 'reverse') { syncAmpModeUI(); rvCalcShow(); }
      });
    });

    function visibleCounts() {
      return Array.prototype.filter.call(counts, function (inp) {
        var col = inp.closest('[data-ql-col]');
        return col && !col.hidden && !inp.disabled;
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

    /* --- 数字 / 空格 / 退格 导航 --- */
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

    /* --- 预设：套用 / 删除 / 保存 --- */
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
      var b = el('ql-view-current');
      if (b) b.classList.toggle('on', true);
      SP.toast('已刷新为当前画布的数量布局');
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
      };
      var cur = el('ql-view-current');
      if (cur) cur.onclick = loadCurrentCount;
    }
    function refreshPresets() {
      var wrap = el('ql-presets');
      if (!wrap) return;
      wrap.innerHTML = '<button class="btn ghost sm" id="ql-view-current">查看当前</button>' +
        '<button class="btn ghost sm" id="ql-save-preset">存为预设</button>' +
        '<button class="btn ghost sm" id="ql-all-tpl">一键模板</button>' + presetChips();
      bindPresets();
      var ab = el('ql-all-tpl');
      if (ab) ab.addEventListener('click', function () {
        if (!Store.state.devices.length) { SP.toast('画布上还没有设备', true); return; }
        var r = Store.saveAllTemplates();
        SP.exportTemplateBundle();
        SP.toast('一键模板：新增 ' + r.added + ' · 更新 ' + r.updated + '，已开始导出存档');
      });
    }
    bindPresets();

    /* --- 反推：行渲染 / 取值 / 实时计算 --- */
    function rvTpl(id) {
      var sel = el(id);
      return sel && sel.value !== '' ? tpls[+sel.value] : null;
    }
    function rvRatio() {
      var sel = el('rv-ratio');
      if (sel && sel.value === 'custom') {
        return Math.max(1, +el('rv-ratio-custom').value || 1.5);
      }
      return +((sel && sel.value) || 1.5);
    }
    /* 行 → reverseCalc 输入（模板行取模板参数，手填行取输入框） */
    function rvRowData(r) {
      if (r.tplIdx >= 0 && tpls[r.tplIdx]) {
        var t = tpls[r.tplIdx];
        return { name: t.name, power: powTpl(t), ohms: +(t.specs && t.specs.ohms) || 0,
          count: +r.count || 0, parallel: r.parallel, tpl: t, role: r.role };
      }
      return { name: r.name || '手填音响', power: +r.power || 0, ohms: +r.ohms || 0,
        count: +r.count || 0, parallel: r.parallel, tpl: null, role: r.role };
    }
    function rvCompute() {
      var rows = rvRows.map(rvRowData);
      var mode = el('rv-ampmode').value;
      var amp2 = rvTpl('rv-amp2-tpl'), amp4 = rvTpl('rv-amp4-tpl');
      var dspT = rvTpl('rv-dsp-tpl'), mixT = rvTpl('rv-mixer-tpl');
      var mixN = Math.max(0, parseInt(el('rv-mixer-n').value, 10) || 0);
      var calc = Store.reverseCalc(rows, {
        ratio: rvRatio(),
        ampMode: mode,
        amp2W: amp2 ? powTpl(amp2) : 0,
        amp4W: amp4 ? powTpl(amp4) : 0,
        minOhms: +el('rv-minohm').value || 4,
        dspOuts: dspT ? outsOf(dspT) : 8
      });
      return { rows: rows, calc: calc, mode: mode, amp2: amp2, amp4: amp4,
        dspT: dspT, mixT: mixT, mixN: mixN };
    }
    function reverseSnapshot() {
      var ratioSel = el('rv-ratio');
      function nameOf(id) { var t = rvTpl(id); return t ? t.name : ''; }
      return {
        rows: rvRows.map(function (r) {
          var t = r.tplIdx >= 0 ? tpls[r.tplIdx] : null;
          return { role: r.role, tplName: t ? t.name : '', name: r.name,
            power: r.power, ohms: r.ohms, count: r.count, parallel: r.parallel };
        }),
        ratio: ratioSel ? ratioSel.value : '1.5',
        ratioCustom: el('rv-ratio-custom') ? el('rv-ratio-custom').value : '1.5',
        minOhms: el('rv-minohm') ? el('rv-minohm').value : '4',
        ampMode: el('rv-ampmode') ? el('rv-ampmode').value : 'mix',
        amp2Name: nameOf('rv-amp2-tpl'), amp4Name: nameOf('rv-amp4-tpl'),
        dspName: nameOf('rv-dsp-tpl'), mixerName: nameOf('rv-mixer-tpl'),
        mixerN: el('rv-mixer-n') ? el('rv-mixer-n').value : '1'
      };
    }
    function applyReverseSnapshot(d) {
      d = d || {};
      rvRows = (d.rows && d.rows.length ? d.rows : [{ role: 'fullrange', tplIdx: -1, name: '', power: '', ohms: '', count: '', parallel: 1 }]).map(function (r) {
        var idx = r.tplName ? tplIndexByName('speaker', r.tplName, r.role) : -1;
        return { role: r.role || 'fullrange', tplIdx: idx,
          name: r.name || '', power: r.power || '', ohms: r.ohms || '',
          count: r.count || '', parallel: Math.max(1, +r.parallel || 1) };
      });
      refreshRvRows();
      if (el('rv-ratio')) el('rv-ratio').value = d.ratio || '1.5';
      if (el('rv-ratio-custom')) el('rv-ratio-custom').value = d.ratioCustom || '1.5';
      if (el('rv-minohm')) el('rv-minohm').value = d.minOhms || '4';
      if (el('rv-ampmode')) el('rv-ampmode').value = d.ampMode || 'mix';
      if (el('rv-mixer-n')) el('rv-mixer-n').value = d.mixerN || '1';
      setSelectByTplName('rv-amp2-tpl', d.amp2Name);
      setSelectByTplName('rv-amp4-tpl', d.amp4Name);
      setSelectByTplName('rv-dsp-tpl', d.dspName);
      setSelectByTplName('rv-mixer-tpl', d.mixerName);
      if (el('rv-ratio-custom-wrap')) {
        el('rv-ratio-custom-wrap').style.display = el('rv-ratio').value === 'custom' ? '' : 'none';
      }
      syncAmpModeUI();
      rvCalcShow();
    }
    function reverseFromCurrent() {
      var mixers = Store.state.devices.filter(function (d) { return d.type === 'mixer'; });
      var dsps = Store.state.devices.filter(function (d) { return d.type === 'dsp'; });
      var amps = Store.state.devices.filter(function (d) { return d.type === 'amp'; });
      var map = {};
      Store.state.devices.forEach(function (d) {
        if (d.type !== 'speaker' || (d.specs && d.specs.powered === 'active')) return;
        var rp = d.reverseParallel || {};
        var par = Math.max(1, +rp.parallel || 1);
        var name = tplNameOfDevice(d);
        var sp = d.specs || {};
        var key = [d.speakerRole || 'fullrange', name, sp.power || '', sp.ohms || '', par].join('::');
        if (!map[key]) {
          map[key] = { role: d.speakerRole || 'fullrange', tplName: name,
            name: name, power: sp.power || '', ohms: sp.ohms || '', count: 0, parallel: par };
        }
        map[key].count++;
      });
      var amp2 = amps.filter(function (d) { return d.inputs.length === 2 || d.outputs.length === 2; });
      var amp4 = amps.filter(function (d) { return d.inputs.length === 4 || d.outputs.length === 4; });
      return {
        rows: Object.keys(map).map(function (k) { return map[k]; }),
        ratio: el('rv-ratio') ? el('rv-ratio').value : '1.5',
        ratioCustom: el('rv-ratio-custom') ? el('rv-ratio-custom').value : '1.5',
        minOhms: el('rv-minohm') ? el('rv-minohm').value : '4',
        ampMode: amp2.length && amp4.length ? 'mix' : amp4.length ? '4' : amp2.length ? '2' : 'mix',
        amp2Name: amp2[0] ? tplNameOfDevice(amp2[0]) : '',
        amp4Name: amp4[0] ? tplNameOfDevice(amp4[0]) : '',
        dspName: dsps[0] ? tplNameOfDevice(dsps[0]) : '',
        mixerName: mixers[0] ? tplNameOfDevice(mixers[0]) : '',
        mixerN: mixers.length || 1
      };
    }
    function bindRvPresets() {
      var wrap = el('rv-presets');
      if (!wrap) return;
      wrap.querySelectorAll('[data-rv-preset]').forEach(function (chip) {
        chip.addEventListener('click', function (e) {
          if (e.target.closest('[data-rv-preset-del]')) return;
          var p = (Store.state.reversePresets || [])[+chip.dataset.rvPreset];
          if (p) { applyReverseSnapshot(p.data); SP.toast('已套用反推模板「' + p.name + '」'); }
        });
      });
      wrap.querySelectorAll('[data-rv-preset-del]').forEach(function (x) {
        x.addEventListener('click', function () {
          var i = +x.dataset.rvPresetDel;
          var p = (Store.state.reversePresets || [])[i];
          Store.removeReversePreset(i);
          refreshRvPresets();
          SP.toast('已删除反推模板「' + (p ? p.name : '') + '」（⌘Z 可撤销）');
        });
      });
      var cur = el('rv-view-current');
      if (cur) cur.onclick = function () {
        applyReverseSnapshot(reverseFromCurrent());
        cur.classList.toggle('on', true);
        SP.toast('已刷新为当前画布的音响反推配置');
      };
      var save = el('rv-save-preset');
      if (save) save.onclick = function () {
        var name = prompt('反推模板名称（如：双全频+超低并联）：');
        if (name === null) return;
        name = name.trim() || '反推模板 ' + ((Store.state.reversePresets || []).length + 1);
        Store.addReversePreset(name, reverseSnapshot());
        refreshRvPresets();
        SP.toast('已保存反推模板「' + name + '」');
      };
      var upd = el('rv-update-templates');
      if (upd) upd.onclick = updateReverseTemplates;
    }
    function refreshRvPresets() {
      var wrap = el('rv-presets');
      if (!wrap) return;
      wrap.innerHTML =
        '<button class="btn ghost sm" id="rv-view-current">查看当前</button>' +
        '<button class="btn ghost sm" id="rv-save-preset">保存反推模板</button>' +
        '<button class="btn ghost sm" id="rv-update-templates">更新到一键模板</button>' +
        rvPresetChips();
      bindRvPresets();
    }
    function updateReverseTemplates() {
      var added = 0, updated = 0, skipped = 0;
      Store.batch(function () {
        rvRows.forEach(function (r) {
          if (r.tplIdx >= 0) return;
          if (!r.name || !+r.power) { skipped++; return; }
          var t = { type: 'speaker', name: r.name, ins: 1, outs: 1,
            speakerRole: r.role, specs: { powered: 'passive', power: String(r.power) } };
          if (+r.ohms) t.specs.ohms = String(r.ohms);
          var res = Store.mergeTemplate(t);
          if (res === 'added') added++; else if (res === 'updated') updated++;
        });
      });
      if (Store.state.devices.length) {
        var all = Store.saveAllTemplates();
        added += all.added;
        updated += all.updated;
      }
      tpls = Store.state.deviceTemplates;
      refreshRvRows();
      SP.toast('已更新到一键模板：新增 ' + added + ' · 更新 ' + updated +
        (skipped ? ' · 跳过 ' + skipped + ' 行（缺名称/功率）' : ''));
    }
    function rvCalcShow() {
      var host = el('rv-calc');
      if (!host) return;
      var r = rvCompute();
      var c = r.calc;
      if (!c.rows.length && !c.errors.length) {
        host.innerHTML = '<span class="insp-stat">填写音响数量后自动反推</span>';
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
      if (c.dspN) parts.push('<span class="insp-stat">DSP <b>' + c.dspN + '</b> 台</span>');
      c.warns.forEach(function (w) {
        parts.push('<span class="insp-stat" style="color:var(--red);border-color:var(--red)">' + esc(w) + '</span>');
      });
      c.errors.forEach(function (w) {
        parts.push('<span class="insp-stat" style="color:var(--red);border-color:var(--red)">✕ ' + esc(w) + '</span>');
      });
      host.innerHTML = parts.join('');
    }
    function bindRvRows() {
      var host = el('rv-rows');
      if (!host) return;
      host.querySelectorAll('[data-rv-role]').forEach(function (s) {
        s.addEventListener('change', function () {
          var r = rvRows[+s.dataset.rvRole];
          r.role = s.value;
          r.tplIdx = -1;
          refreshRvRows();
        });
      });
      host.querySelectorAll('[data-rv-tpl]').forEach(function (s) {
        s.addEventListener('change', function () {
          rvRows[+s.dataset.rvTpl].tplIdx = +s.value;
          refreshRvRows();
        });
      });
      function bindVal(attr, key) {
        host.querySelectorAll('[' + attr + ']').forEach(function (inp) {
          inp.addEventListener('input', function () {
            rvRows[+inp.getAttribute(attr)][key] = inp.value;
            rvCalcShow();
          });
        });
      }
      bindVal('data-rv-name', 'name');
      bindVal('data-rv-w', 'power');
      bindVal('data-rv-o', 'ohms');
      bindVal('data-rv-n', 'count');
      host.querySelectorAll('[data-rv-par]').forEach(function (s) {
        s.addEventListener('change', function () {
          rvRows[+s.dataset.rvPar].parallel = +s.value;
          rvCalcShow();
        });
      });
      host.querySelectorAll('[data-rv-save]').forEach(function (b) {
        b.addEventListener('click', function () {
          var r = rvRows[+b.dataset.rvSave];
          if (!r.name || !+r.power) { SP.toast('存模板需要名称和功率', true); return; }
          var t = { type: 'speaker', name: r.name, ins: 1, outs: 1,
            speakerRole: r.role, specs: { powered: 'passive', power: String(r.power) } };
          if (+r.ohms) t.specs.ohms = String(r.ohms);
          Store.mergeTemplate(t);
          Store.save();
          SP.toast('已存为音响模板「' + r.name + '」');
        });
      });
      host.querySelectorAll('[data-rv-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          rvRows.splice(+b.dataset.rvDel, 1);
          if (!rvRows.length) rvRows.push({ role: 'fullrange', tplIdx: -1, name: '', power: '', ohms: '', count: '', parallel: 1 });
          refreshRvRows();
        });
      });
    }
    function refreshRvRows() {
      var host = el('rv-rows');
      if (!host) return;
      host.innerHTML = rvRowsHtml();
      bindRvRows();
      rvCalcShow();
    }
    /* 8：一键模板 —— 存库 + 打包导出（总 JSON + 分类 CSV） */
    var allTplBtn = el('ql-all-tpl');
    if (allTplBtn) allTplBtn.addEventListener('click', function () {
      if (!Store.state.devices.length) { SP.toast('画布上还没有设备', true); return; }
      var r = Store.saveAllTemplates();
      SP.exportTemplateBundle();
      SP.toast('一键模板：新增 ' + r.added + ' · 更新 ' + r.updated + '，已开始导出存档');
    });

    el('rv-add-row').addEventListener('click', function () {
      rvRows.push({ role: rvRows.length ? 'sub' : 'fullrange', tplIdx: -1, name: '', power: '', ohms: '', count: '', parallel: 1 });
      refreshRvRows();
    });
    bindRvRows();
    bindRvPresets();
    function syncAmpModeUI() {
      var mode = el('rv-ampmode').value;
      el('rv-amp2-wrap').style.display = mode === '4' ? 'none' : '';
      el('rv-amp4-wrap').style.display = mode === '2' ? 'none' : '';
    }
    ['rv-ratio', 'rv-ratio-custom', 'rv-minohm', 'rv-ampmode',
     'rv-amp2-tpl', 'rv-amp4-tpl', 'rv-dsp-tpl', 'rv-mixer-tpl', 'rv-mixer-n'].forEach(function (id) {
      var x = el(id);
      if (x) x.addEventListener('input', function () {
        el('rv-ratio-custom-wrap').style.display = el('rv-ratio').value === 'custom' ? '' : 'none';
        syncAmpModeUI();
        rvCalcShow();
      });
    });

    /* --- 创建 --- */
    function confirm2() {
      if (mode === 'reverse') {
        var r = rvCompute();
        var c = r.calc;
        if (c.errors.length) { SP.toast(c.errors[0], true); return; }
        if (!c.rows.length) { SP.toast('请先添加音响并填写数量', true); return; }
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
        var added = Store.reverseLayout({
          mixerTpl: r.mixT, mixerCount: r.mixN,
          dspTpl: r.dspT, dspCount: c.dspN,
          amp2Tpl: r.amp2, amp4Tpl: r.amp4,
          speakerRows: speakerRows
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
    el('ql-confirm').addEventListener('click', confirm2);

    /* 反推页里的输入框回车也能创建 */
    box.querySelectorAll('#ql-pane-rv input').forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); confirm2(); }
      });
    });

    syncActiveCols();
    setTimeout(function () {
      focusAt(Array.prototype.slice.call(counts).filter(function (x) { return !x.disabled; }), 0);
    }, 30);
  };
})();
