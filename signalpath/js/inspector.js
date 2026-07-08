/* ============================================================
   inspector.js — 右侧设备栏（检查器）+ 连接清单抽屉 +
                  添加设备 / 型号模板管理（含模板→实例同步）
   取代 v1 的「设备机架」与「信号分配」两个左侧面板。
   ============================================================ */

(function () {
  var Store = SP.Store;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }

  SP.selectedDeviceId = SP.selectedDeviceId || '';

  /* ================= 模态框 ================= */

  function openModal(html) {
    var overlay = el('modal-overlay');
    el('modal-box').innerHTML = html;
    overlay.hidden = false;
    return overlay;
  }
  function closeModal() {
    el('modal-overlay').hidden = true;
    el('modal-box').classList.remove('modal-wide');
    el('modal-box').innerHTML = '';
  }
  SP.openModal = openModal;
  SP.closeModal = closeModal;

  document.addEventListener('click', function (e) {
    if (e.target.id === 'modal-overlay' || e.target.closest('[data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  /* 图片上传：压缩到 128px 内，存 IndexedDB 返回 id */
  function loadThumb(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 128 / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        var cx = c.getContext('2d');
        cx.fillStyle = '#ffffff';           /* JPEG 无透明通道，先铺白底 */
        cx.fillRect(0, 0, c.width, c.height);
        cx.drawImage(img, 0, 0, c.width, c.height);
        cb(SP.Images.put(c.toDataURL('image/jpeg', 0.82)));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  SP.loadThumb = loadThumb;

  /* ================= 选中联动：设备栏 / 框图 / 连接清单 ================= */

  SP.selectDevice = function (id, scroll) {
    SP.selectedDeviceId = id || '';
    SP.multiSelected = [];
    var routeDev = Store.getDevice(SP.selectedDeviceId);
    if (routeDev && (routeDev.type === 'mixer' || routeDev.type === 'dsp')) {
      SP.routePageId = routeDev.id;
      if (routeDev.type === 'mixer') Store.setActiveMixer(routeDev.id);
      var mixerView = el('view-mixer');
      if (mixerView && mixerView.classList.contains('active') && SP.renderMixerView) {
        SP.renderMixerView();
      }
    }
    var dia = el('wiring-diagram');
    if (dia) {
      dia.querySelectorAll('[data-node]').forEach(function (g) {
        if (g.classList) g.classList.toggle('sel', g.dataset.node === SP.selectedDeviceId);
      });
    }
    var tbl = el('wiring-table-wrap');
    if (tbl) {
      tbl.querySelectorAll('tr[data-sid]').forEach(function (tr) {
        tr.classList.toggle('hl',
          tr.dataset.sid === SP.selectedDeviceId || tr.dataset.tid === SP.selectedDeviceId);
      });
    }
    SP.renderInspector();
  };

  /* ================= 信号来源下拉（原信号分配逻辑） ================= */

  /* 一次性建立「输出口 → 已接目标」查表，供本次渲染的所有下拉框共用 */
  function buildTakenMap() {
    var taken = {};
    Store.state.connections.forEach(function (c) {
      var t = Store.getDevice(c.tid);
      taken[c.sid + ':' + c.sport] = t ? t.name : '?';
    });
    return taken;
  }

  function sourceOptions(cur, taken) {
    if (!taken) taken = buildTakenMap();
    var html = '<option value="">— 未连接 —</option>';
    Store.state.devices.forEach(function (d) {
      var vis = Store.visibleOuts(d);
      if (!vis.length) return;
      html += '<optgroup label="' + esc(d.name) + '">';
      vis.forEach(function (i) {
        var v = d.id + ':' + i;
        /* 1:1 规则：占用中的输出口标明当前去向，选中即改接到本输入 */
        var suffix = (v !== cur && taken[v]) ? '　(已接 → ' + esc(taken[v]) + ')' : '';
        html += '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' +
          esc(Store.outLabelOf(d, i)) + suffix + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  function setInputSource(tid, tport, value) {
    if (!value) {
      Store.disconnect(tid, tport);
      return { ok: true, msg: '' };
    }
    var parts = value.split(':');
    var res = Store.connect(tid, tport, parts[0], +parts[1]);
    return res || { ok: true, msg: '' };
  }

  function runSmartAssign(devId) {
    var res = Store.smartAssign(devId);
    if (!res.lines.length) { SP.toast(res.msg || '没有可分配的空闲输出', true); return; }
    SP.renderAll();
    SP.toast('智能分配完成 ' + res.lines.length + ' 路（⌘Z 可撤销）');
  }

  /* 清 IN / 清 OUT（设备栏按钮与 ⌘I / ⌘O 快捷键共用） */
  SP.clearSelectedWires = function (side) {
    var dev = Store.getDevice(SP.selectedDeviceId);
    if (!dev) { SP.toast('请先选中一台设备', true); return; }
    var n = Store.clearDeviceConnections(dev.id, side);
    if (!n) { SP.toast('「' + dev.name + '」没有' + (side === 'inputs' ? '输入' : '输出') + '端连线', true); return; }
    SP.renderAll();
    SP.toast('已清空「' + dev.name + '」' + (side === 'inputs' ? '输入' : '输出') + '端 ' + n + ' 条连线（⌘Z 可撤销）');
  };

  /* 复制选中设备（⌘D 与按钮共用），自动编号命名 */
  SP.duplicateSelected = function () {
    var dev = Store.getDevice(SP.selectedDeviceId);
    if (!dev) { SP.toast('请先选中一台设备', true); return; }
    Store.cloneDevice(dev.id, 1);
    SP.renderAll();
    SP.toast('已复制「' + dev.name + '」并自动编号（⌘Z 可撤销）');
  };

  /* ================= 右侧设备栏 ================= */

  SP.renderInspector = function () {
    var host = el('insp-body');
    if (!host) return;
    var dev = Store.getDevice(SP.selectedDeviceId);
    var cnt = el('insp-count');
    if (cnt) cnt.textContent = Store.state.devices.length ? Store.state.devices.length + ' 台' : '';
    if ((SP.multiSelected || []).length > 1) renderList(host, SP.multiSelected.length);
    else if (dev) renderDetail(host, dev);
    else renderList(host);
  };

  /* 删除框选/选中的设备（Delete / 退格快捷键调用） */
  SP.deleteSelected = function () {
    var ids = (SP.multiSelected || []).slice();
    if (!ids.length && SP.selectedDeviceId) ids = [SP.selectedDeviceId];
    if (!ids.length) return;
    var n = Store.removeDevices(ids);
    SP.multiSelected = [];
    SP.selectedDeviceId = '';
    SP.renderAll();
    if (SP.toast) SP.toast('已删除 ' + n + ' 台设备（⌘Z 可撤销）');
  };

  /* --- 数量统计行：1调音台 1DSP 5功放 8全频 2超低 2有源全频 2有源超低 --- */
  function deviceStats() {
    var n = { mixer: 0, dsp: 0, amp: 0, other: 0 };
    var spk = {};   /* role + powered → count */
    Store.state.devices.forEach(function (d) {
      if (d.type === 'speaker') {
        var key = (Store.speakerPowered(d) ? 'a-' : 'p-') + (d.speakerRole || 'fullrange');
        spk[key] = (spk[key] || 0) + 1;
      } else if (n[d.type] !== undefined) n[d.type]++;
      else n.other++;
    });
    var parts = [];
    if (n.mixer) parts.push(n.mixer + ' 调音台');
    if (n.dsp) parts.push(n.dsp + ' DSP');
    if (n.amp) parts.push(n.amp + ' 功放');
    SP.SPEAKER_ROLES.forEach(function (r) {
      if (spk['p-' + r.key]) parts.push(spk['p-' + r.key] + ' ' + r.name);
    });
    SP.SPEAKER_ROLES.forEach(function (r) {
      if (spk['a-' + r.key]) parts.push(spk['a-' + r.key] + ' 有源' + r.name);
    });
    if (n.other) parts.push(n.other + ' 其他');
    return parts;
  }

  /* --- 设备总列表（未选中 / 框选多台时） --- */
  function renderList(host, multiCount) {
    var st = Store.state;
    if (!st.devices.length) {
      host.innerHTML = '<div class="empty-hint">还没有设备。<br>点上方「＋ 添加」，' +
        '或按 <kbd>⌘K</kbd> 快速布局。</div>';
      return;
    }
    var stats = deviceStats();
    var statsHtml = stats.length
      ? '<div class="insp-stats">' + stats.map(function (s) {
          return '<span class="insp-stat">' + esc(s) + '</span>';
        }).join('') +
        '<button class="insp-stat-btn" id="insp-all-tpl" title="把画布上所有设备按名称系列存入模板库，快速布局可直接调用">一键模板</button>' +
        '</div>'
      : '';
    var multiHtml = multiCount
      ? '<div class="insp-stats" style="border-color:var(--amber)"><span class="insp-stat" style="color:var(--amber)">已框选 ' +
        multiCount + ' 台 · Delete/退格 删除</span></div>'
      : '';
    host.innerHTML = multiHtml + statsHtml + st.devices.map(function (d, di) {
      var info = Store.typeInfo(d.type);
      var color = d.color || SP.typeColor(d.type);
      var spk = d.type === 'speaker'
        ? ' · ' + SP.speakerRoleInfo(d.speakerRole).name +
          (d.specs && d.specs.powered === 'active' ? '(有源)' : '') +
          (d.reverseParallel && d.reverseParallel.locked
            ? ' · 并联×' + d.reverseParallel.parallel + ' ' +
              d.reverseParallel.index + '/' + d.reverseParallel.groupSize
            : '')
        : '';
      /* 功率/连接警示同步到设备栏（与框图 ⚠ 角标一致） */
      var hasWarn = Store.state.connections.some(function (c) {
        return (c.sid === d.id || c.tid === d.id) && Store.connWarning(c);
      });
      return '<div class="insp-row" data-device="' + d.id + '" style="border-left-color:' + esc(color) + '">' +
        '<span class="type-chip" style="background:' + esc(color) + '">' + esc(info.name) + '</span>' +
        '<span class="insp-row-name" title="' + esc(d.name) + '">' + esc(d.name) + '</span>' +
        (hasWarn ? '<span class="warn-flag" data-warn-dev="' + d.id + '" title="点击查看报警详情">⚠</span>' : '') +
        '<span class="insp-row-io">' + d.inputs.length + '进' + Store.visibleOuts(d).length + '出' + esc(spk) + '</span>' +
        '<span class="insp-row-acts">' +
        '<button class="btn icon" data-move="-1" data-id="' + d.id + '" title="上移（影响智能连接顺序）"' + (di === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button class="btn icon" data-move="1" data-id="' + d.id + '" title="下移"' + (di === st.devices.length - 1 ? ' disabled' : '') + '>▼</button>' +
        '</span></div>';
    }).join('');

    host.querySelectorAll('[data-warn-dev]').forEach(function (w) {
      w.addEventListener('click', function (e) {
        e.stopPropagation();
        SP.openWarnDetails(w.dataset.warnDev);
      });
    });

    var allTpl = el('insp-all-tpl');
    if (allTpl) allTpl.addEventListener('click', function () {
      var r = Store.saveAllTemplates();
      SP.toast('一键模板完成：新增 ' + r.added + ' 个、更新 ' + r.updated + ' 个型号模板');
    });

    host.querySelectorAll('.insp-row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        if (SP.switchView) SP.switchView('wiring');   /* 从其他页点击也能定位 */
        SP.selectDevice(row.dataset.device, true);
        var dia = el('wiring-diagram');
        if (dia) SP.focusSelectedInDiagram(dia);
      });
    });
    host.querySelectorAll('[data-move]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        Store.moveDevice(b.dataset.id, +b.dataset.move);
        SP.renderInspector();
        SP.renderWiringDiagram(el('wiring-diagram'));
      });
    });
  }

  /* --- 选中设备详情 --- */
  function renderDetail(host, dev) {
    var info = Store.typeInfo(dev.type);
    var color = dev.color || SP.typeColor(dev.type);
    var img = SP.Images.get(dev.imgId);
    var taken = buildTakenMap();

    /* 规格区块（按类型） */
    var specHtml = '';
    var s = dev.specs || {};
    if (dev.type === 'amp') {
      specHtml =
        '<div class="insp-grid2">' +
        '<div class="cfg-field"><label>功率 W</label><input type="text" data-spec="power" value="' + esc(s.power || '') + '" placeholder="如 800"></div>' +
        '<div class="cfg-field"><label>机柜 U 数</label><input type="number" data-spec="rackU" min="0" max="20" step="0.5" value="' + esc(s.rackU || '') + '" placeholder="如 2"></div>' +
        '</div>';
    } else if (dev.type === 'speaker') {
      specHtml =
        '<div class="insp-grid2">' +
        '<div class="cfg-field"><label>有源 / 无源</label><select data-spec="powered">' +
        '<option value="passive"' + (s.powered === 'active' ? '' : ' selected') + '>无源</option>' +
        '<option value="active"' + (s.powered === 'active' ? ' selected' : '') + '>有源</option></select></div>' +
        '<div class="cfg-field"><label>音箱分支</label><select id="insp-role">' +
        SP.SPEAKER_ROLES.map(function (r) {
          return '<option value="' + r.key + '"' + (r.key === (dev.speakerRole || 'fullrange') ? ' selected' : '') + '>' + esc(r.name) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="cfg-field"><label>功率 W</label><input type="text" data-spec="power" value="' + esc(s.power || '') + '" placeholder="如 500"></div>' +
        '<div class="cfg-field"><label>阻抗 Ω</label><input type="text" data-spec="ohms" value="' + esc(s.ohms || '') + '" placeholder="如 8"></div>' +
        '<div class="cfg-field"><label>尺寸（寸）</label><input type="text" data-spec="size" value="' + esc(s.size || '') + '" placeholder="如 12 / 双6寸"></div>' +
        '</div>';
    } else if (dev.type === 'dsp' || dev.type === 'mixer') {
      specHtml =
        '<div class="insp-grid2">' +
        '<div class="cfg-field"><label>机柜 U 数</label><input type="number" data-spec="rackU" min="0" max="20" step="0.5" value="' + esc(s.rackU || '') + '" placeholder="如 1"></div>' +
        '</div>';
    }

    /* 功放输出对：整机接地 + P/S/B 档 + 每口档位/增益 */
    var ampHtml = '';
    if (dev.type === 'amp' && dev.outputs.length) {
      var pairs = Math.ceil(dev.outputs.length / 2);
      var rows = '';
      for (var pi = 0; pi < pairs; pi++) {
        var a = pi * 2, b = a + 1;
        var mode = Store.ampPairMode(dev, pi);
        var pairLabel = dev.outputs[b]
          ? 'OUT' + (a + 1) + ' / OUT' + (b + 1)
          : 'OUT' + (a + 1);
        rows += '<div class="amp-pair"><div class="amp-pair-head"><span>' + esc(pairLabel) + '</span>' +
          '<span class="seg">' +
          ['P', 'S', 'B'].map(function (mo) {
            return '<button data-pair="' + pi + '" data-pmode="' + mo + '"' +
              (mode === mo ? ' class="on"' : '') + ' title="' +
              (mo === 'P' ? 'P 档（并联）' : mo === 'S' ? 'S 档（立体声）' : 'B 桥接（两口合并为一路大功率输出）') +
              '">' + (mo === 'B' ? 'B桥接' : mo + '档') + '</button>';
          }).join('') + '</span></div>' +
          Store.visibleOuts(dev).filter(function (i) { return i === a || i === b; }).map(function (i) {
            var p = dev.outputs[i];
            return '<div class="amp-out-row">' +
              '<span class="amp-out-label" title="' + esc(Store.outLabelOf(dev, i)) + '">' + esc(Store.outLabelOf(dev, i)) + '</span>' +
              '<input type="text" class="amp-gain" data-port="' + i + '" value="' + esc(p.gain || '') + '" placeholder="档位/增益"></div>';
          }).join('') +
          '</div>';
      }
      /* 接地是整机一个开关，与 P/S/B 档位同级 */
      ampHtml = '<div class="insp-sec-title">功放输出（P/S/B 按输出对设置）</div>' +
        '<div class="amp-global"><span>整机设置</span>' +
        '<label class="toggle-pill chk-ground"><input type="checkbox" id="insp-amp-ground"' +
        (s.grounded ? ' checked' : '') + '>接地</label></div>' +
        rows;
    }

    /* 路由：每个输入口选择来源 */
    var routeHtml = '';
    if (dev.inputs.length) {
      routeHtml = '<div class="insp-sec-title">路由 · 输入来源</div>' +
        dev.inputs.map(function (p, i) {
          var c = Store.sourceFor(dev.id, i);
          var cur = c ? (c.sid + ':' + c.sport) : '';
          var warn = c ? Store.connWarning(c) : null;
          return '<div class="patch-row' + (warn ? ' has-warn' : '') + '">' +
            '<span class="led ' + (c ? 'led-green' : 'led-off') + '"></span>' +
            '<span class="patch-port" title="' + esc(p.label) + '">' + esc(p.label) + '</span>' +
            '<select data-route-port="' + i + '">' + sourceOptions(cur, taken) + '</select>' +
            (warn ? '<span class="warn-flag" title="' + esc(warn) + '">⚠</span>' : '') +
            '</div>';
        }).join('');
    }

    /* 端口标注（折叠） */
    function labelRows(ports, side, prefix) {
      return ports.map(function (p, i) {
        return '<div class="port-label-row"><span>' + prefix + (i + 1) + '</span>' +
          '<input type="text" data-lab-side="' + side + '" data-lab-idx="' + i +
          '" value="' + esc(p.label) + '" placeholder="' + prefix + ' ' + (i + 1) + '"></div>';
      }).join('') || '<p class="cfg-note">无</p>';
    }
    var labelsHtml = '<details class="insp-fold"><summary>端口标注</summary>' +
      '<div class="insp-grid2">' +
      '<div><div class="cfg-note">输入口</div>' + labelRows(dev.inputs, 'in', 'IN') + '</div>' +
      '<div><div class="cfg-note">输出口</div>' + labelRows(dev.outputs, 'out', 'OUT') + '</div>' +
      '</div></details>';

    var smart = Store.smartAssignPreview(dev.id);

    host.innerHTML =
      '<div class="insp-detail-head">' +
      '<button class="btn ghost sm" id="insp-back">‹ 列表</button>' +
      '<span class="type-chip lg" style="background:' + esc(color) + '">' + esc(info.name) + '</span>' +
      (dev.type === 'speaker' ? '<span class="type-chip lg" style="background:#3f9970">' +
        esc(SP.speakerRoleInfo(dev.speakerRole).name) + '</span>' : '') +
      '<button class="btn icon danger" id="insp-del" title="删除设备">✕</button>' +
      '</div>' +

      '<div class="insp-grid2 name-row">' +
      '<div class="cfg-field"><label>设备名称</label><input type="text" id="insp-name" value="' + esc(dev.name) + '"></div>' +
      '<div class="cfg-field"><label>颜色</label><input type="color" id="insp-color" class="color-input-lg" value="' + esc(color) + '"></div>' +
      '</div>' +

      '<div class="cfg-field"><label>设备图片</label><div class="img-edit-row">' +
      '<span id="insp-img-preview">' + (img ? '<img src="' + img + '" class="dev-thumb lg">' : '<span class="cfg-note">未设置</span>') + '</span>' +
      '<input type="file" id="insp-img-file" accept="image/*" hidden>' +
      '<button class="btn ghost sm" id="insp-img-pick">上传</button>' +
      (img ? '<button class="btn ghost sm danger" id="insp-img-clear">移除</button>' : '') +
      '</div></div>' +

      '<div class="insp-grid2">' +
      '<div class="cfg-field"><label>输入路数</label><input type="number" id="insp-ins" min="0" max="128" value="' + dev.inputs.length + '"></div>' +
      '<div class="cfg-field"><label>输出路数</label><input type="number" id="insp-outs" min="0" max="128" value="' + dev.outputs.length + '"></div>' +
      '</div>' +
      specHtml + ampHtml +

      '<div class="insp-actions">' +
      (smart.count ? '<button class="btn primary sm" id="insp-smart">⚡ 智能分配 ' + smart.count + ' 路</button>'
        : '<button class="btn ghost sm" id="insp-smart">⚡ 智能分配</button>') +
      '<button class="btn ghost sm" id="insp-clear-in" title="清空进入本设备的连线（⌘I）">清 IN</button>' +
      '<button class="btn ghost sm" id="insp-clear-out" title="清空从本设备出去的连线（⌘O）">清 OUT</button>' +
      '<button class="btn ghost sm" id="insp-copy" title="复制本设备并自动编号（⌘D）">⧉ 复制</button>' +
      '<button class="btn ghost sm" id="insp-save-tpl" title="把本设备参数存为型号模板，快速布局可直接调用">存为模板</button>' +
      (dev.type === 'mixer' || dev.type === 'dsp' ? '<button class="btn ghost sm" id="insp-route-page">台内路由</button>' : '') +
      (dev.type === 'mixer' ? '<button class="btn ghost sm" id="insp-teach">接线教学</button>' : '') +
      '</div>' +

      routeHtml + labelsHtml;

    /* --- 绑定 --- */
    el('insp-back').addEventListener('click', function () { SP.selectDevice('', false); });
    el('insp-del').addEventListener('click', function () {
      var nm = dev.name;
      Store.removeDevice(dev.id);
      SP.selectedDeviceId = '';
      SP.renderAll();
      SP.toast('已删除「' + nm + '」（⌘Z 可撤销）');
    });
    el('insp-name').addEventListener('change', function () {
      var v = this.value.trim();
      if (v) { dev.name = v; Store.save(); SP.renderAll(); }
    });
    el('insp-color').addEventListener('change', function () {
      dev.color = this.value;
      Store.save();
      SP.renderAll();
    });
    el('insp-img-pick').addEventListener('click', function () { el('insp-img-file').click(); });
    el('insp-img-file').addEventListener('change', function () {
      var f = this.files[0];
      this.value = '';
      if (!f) return;
      loadThumb(f, function (imgId) {
        dev.imgId = imgId;
        Store.save();
        SP.renderAll();
      });
    });
    var imgClear = el('insp-img-clear');
    if (imgClear) imgClear.addEventListener('click', function () {
      dev.imgId = '';
      Store.save();
      SP.renderAll();
    });

    function applyIO() {
      var ins = Math.max(0, Math.min(128, +el('insp-ins').value || 0));
      var outs = Math.max(0, Math.min(128, +el('insp-outs').value || 0));
      if (ins === 0 && outs === 0) { alert('输入/输出路数不能同时为 0'); SP.renderInspector(); return; }
      Store.resizeDevice(dev, ins, outs);
      var removed = Store.cleanupConnectionErrors();
      SP.renderAll();
      if (removed.length) {
        setTimeout(function () {
          alert('以下不匹配连线已自动断开：\n\n' + removed.slice(0, 8).join('\n') +
            (removed.length > 8 ? '\n… 共 ' + removed.length + ' 条' : ''));
        }, 50);
      }
    }
    el('insp-ins').addEventListener('change', applyIO);
    el('insp-outs').addEventListener('change', applyIO);

    host.querySelectorAll('[data-spec]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var k = inp.dataset.spec;
        var v = inp.value && inp.value.trim ? inp.value.trim() : inp.value;
        if (!dev.specs) dev.specs = {};
        if (v) dev.specs[k] = v; else delete dev.specs[k];
        if (k === 'powered') dev.specs.powered = v === 'active' ? 'active' : 'passive';
        var removed = Store.cleanupConnectionErrors();
        Store.save();
        SP.renderAll();
        if (removed.length) {
          setTimeout(function () {
            alert('有源/无源变更后，以下不匹配连线已自动断开：\n\n' + removed.join('\n'));
          }, 50);
        }
      });
    });
    var roleSel = el('insp-role');
    if (roleSel) roleSel.addEventListener('change', function () {
      dev.speakerRole = this.value;
      Store.save();
      SP.renderAll();
    });

    /* 功放输出对 */
    host.querySelectorAll('[data-pmode]').forEach(function (b) {
      b.addEventListener('click', function () {
        var pair = +b.dataset.pair, mo = b.dataset.pmode;
        var hadWire = mo === 'B' && Store.consumersOf(dev.id, pair * 2 + 1).length;
        Store.setAmpPairMode(dev.id, pair, mo);
        /* P 档（并联）两路输出同信号，只需 1 根输入信号线：
           该对第二路输入已接线时，询问是否断开多余的那根 */
        if (mo === 'P') {
          var in2 = pair * 2 + 1;
          if (dev.inputs[in2] && Store.sourceFor(dev.id, in2)) {
            if (confirm('P 档只需 1 根信号线，是否断开 ' +
                dev.inputs[in2].label + ' 的多余连线？（可撤销）')) {
              Store.disconnect(dev.id, in2);
              SP.toast('已断开 ' + dev.inputs[in2].label + ' 的多余连线（⌘Z 可撤销）');
            }
          }
        }
        SP.renderAll();
        if (hadWire) SP.toast('已切 B 桥接，OUT' + (pair * 2 + 2) + ' 的连线已并入断开（⌘Z 可撤销）');
      });
    });
    host.querySelectorAll('.amp-gain').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var p = dev.outputs[+inp.dataset.port];
        if (p) { p.gain = inp.value.trim(); Store.save(); SP.renderWiringTable(); }
      });
    });
    var ampGround = el('insp-amp-ground');
    if (ampGround) ampGround.addEventListener('change', function () {
      if (!dev.specs) dev.specs = {};
      dev.specs.grounded = this.checked;
      Store.save();
      SP.renderWiringTable();
      if (SP.renderTeach) SP.renderTeach();
    });

    /* 路由 */
    host.querySelectorAll('[data-route-port]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var res = setInputSource(dev.id, +sel.dataset.routePort, sel.value);
        SP.renderAll();
        if (res.msg) setTimeout(function () {
          alert((res.ok ? '已连接，但请注意：\n' : '连接错误，已自动断开：\n') + res.msg);
        }, 50);
      });
    });

    /* 端口标注 */
    host.querySelectorAll('[data-lab-side]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var arr = inp.dataset.labSide === 'in' ? dev.inputs : dev.outputs;
        var i = +inp.dataset.labIdx;
        if (arr[i]) {
          arr[i].label = inp.value.trim() ||
            (inp.dataset.labSide === 'in' ? 'IN ' : 'OUT ') + (i + 1);
          Store.save();
          SP.renderAll();
        }
      });
    });

    /* 操作 */
    el('insp-smart').addEventListener('click', function () { runSmartAssign(dev.id); });
    el('insp-clear-in').addEventListener('click', function () { SP.clearSelectedWires('inputs'); });
    el('insp-clear-out').addEventListener('click', function () { SP.clearSelectedWires('outputs'); });
    el('insp-copy').addEventListener('click', function () { SP.duplicateSelected(); });
    el('insp-save-tpl').addEventListener('click', function () {
      var mode = Store.saveDeviceAsTemplate(dev);
      SP.toast(mode === 'added'
        ? '已存为新模板「' + Store.baseNameOf(dev.name) + '」'
        : '已更新模板「' + Store.baseNameOf(dev.name) + '」');
    });
    var routeBtn = el('insp-route-page');
    if (routeBtn) routeBtn.addEventListener('click', function () {
      SP.routePageId = dev.id;
      if (dev.type === 'mixer') Store.setActiveMixer(dev.id);
      if (SP.switchView) SP.switchView('mixer');
      if (SP.renderMixerView) SP.renderMixerView();
    });
    var teachBtn = el('insp-teach');
    if (teachBtn) teachBtn.addEventListener('click', function () {
      if (SP.openPatchTeach) SP.openPatchTeach(dev.id);
    });
  }

  /* ================= 报警详情弹窗（框图 ! 角标 / 设备栏 ⚠ 共用） ================= */

  SP.openWarnDetails = function (devId) {
    var dev = Store.getDevice(devId);
    if (!dev) return;
    var list = [];
    Store.state.connections.forEach(function (c) {
      if (c.sid !== dev.id && c.tid !== dev.id) return;
      var w = Store.connWarning(c);
      if (!w) return;
      var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
      list.push({ path: (s ? s.name : '?') + ' → ' + (t ? t.name : '?'), msg: w });
    });
    openModal(
      '<div class="modal-head"><h3>⚠ 报警详情 · ' + esc(dev.name) + '</h3>' +
      '<button class="btn icon" data-close-modal>✕</button></div>' +
      '<div class="modal-body">' +
      (list.length
        ? list.map(function (x) {
            return '<div class="warn-item"><b>' + esc(x.path) + '</b><br>' +
              '<span style="color:var(--red)">' + esc(x.msg) + '</span></div>';
          }).join('')
        : '<p class="cfg-note">当前没有关联报警。</p>') +
      '<p class="cfg-note">缺功率/阻抗的报警：在设备栏补填对应参数即可消除。</p>' +
      '</div>' +
      '<div class="modal-foot">' +
      '<button class="btn ghost" data-close-modal>关闭</button>' +
      '<button class="btn primary" id="warn-goto">去补填（打开设备详情）</button></div>'
    );
    var go = el('warn-goto');
    if (go) go.addEventListener('click', function () {
      closeModal();
      if (SP.switchView) SP.switchView('wiring');
      SP.selectDevice(dev.id, true);
      var dia = el('wiring-diagram');
      if (dia) SP.focusSelectedInDiagram(dia);
    });
  };

  /* ================= 右键菜单（框图节点） ================= */

  function hideContextMenu() {
    var menu = el('ctx-menu');
    if (menu) menu.hidden = true;
  }

  SP.showDeviceMenu = function (devId, x, y) {
    var dev = Store.getDevice(devId);
    var menu = el('ctx-menu');
    if (!dev || !menu) return;
    var info = Store.typeInfo(dev.type);
    var spec = SP.specString(dev);
    menu.innerHTML =
      '<div class="ctx-title">' +
      '<span class="type-chip" style="background:' + esc(dev.color || SP.typeColor(dev.type)) + '">' + esc(info.name) + '</span>' +
      '<strong title="' + esc(dev.name) + '">' + esc(dev.name) + '</strong>' +
      '</div>' +
      (spec ? '<div class="ctx-spec">' + esc(spec) + '</div>' : '') +
      '<div class="ctx-meta">IN × ' + dev.inputs.length + ' · OUT × ' + Store.visibleOuts(dev).length + '</div>' +
      (Store.smartAssignPreview(dev.id).count
        ? '<div class="ctx-smart">可智能分配 ' + Store.smartAssignPreview(dev.id).count + ' 路</div>' : '') +
      '<div class="ctx-actions">' +
      '<button class="mini-act" data-ctx-smart>智能分配</button>' +
      '<button class="mini-act" data-ctx-copy>复制 ⌘D</button>' +
      '<button class="mini-act" data-ctx-clear-in>清 IN ⌘I</button>' +
      '<button class="mini-act" data-ctx-clear-out>清 OUT ⌘O</button>' +
      (dev.type === 'mixer' ? '<button class="mini-act" data-ctx-teach>接线教学</button>' : '') +
      '<button class="mini-act danger" data-ctx-del>删除</button>' +
      '</div>';
    menu.hidden = false;
    var pad = 10, rectW = 280, rectH = 170;
    menu.style.left = Math.max(pad, Math.min(x, window.innerWidth - rectW - pad)) + 'px';
    menu.style.top = Math.max(pad, Math.min(y, window.innerHeight - rectH - pad)) + 'px';
    SP.selectDevice(dev.id, false);

    menu.querySelector('[data-ctx-smart]').onclick = function () { hideContextMenu(); runSmartAssign(dev.id); };
    menu.querySelector('[data-ctx-copy]').onclick = function () { hideContextMenu(); SP.duplicateSelected(); };
    menu.querySelector('[data-ctx-clear-in]').onclick = function () { hideContextMenu(); SP.clearSelectedWires('inputs'); };
    menu.querySelector('[data-ctx-clear-out]').onclick = function () { hideContextMenu(); SP.clearSelectedWires('outputs'); };
    var teach = menu.querySelector('[data-ctx-teach]');
    if (teach) teach.onclick = function () {
      hideContextMenu();
      if (SP.openPatchTeach) SP.openPatchTeach(dev.id);
    };
    menu.querySelector('[data-ctx-del]').onclick = function () {
      hideContextMenu();
      var nm = dev.name;
      Store.removeDevice(dev.id);
      SP.selectedDeviceId = '';
      SP.renderAll();
      SP.toast('已删除「' + nm + '」（⌘Z 可撤销）');
    };
  };

  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#ctx-menu')) hideContextMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideContextMenu();
  });

  /* ================= 添加设备 / 型号模板管理 ================= */

  function speakerPowerLabel(specs) {
    return specs && specs.powered === 'active' ? '有源' : '无源';
  }

  /* CSV 批量导入（模块级，添加设备弹窗与模板面板共用）。
     表头自动识别：通道数→功放；分支/阻抗→音响；类型(→调音台/DSP */
  SP.importCsvTemplates = function (text, refreshFn) {
    var rows = SP.csvParse(text);
    if (rows.length < 2) { SP.toast('CSV 内容为空或缺少数据行', true); return; }
    var head = rows[0].join('');
    var kind = head.indexOf('通道数') >= 0 ? 'amp'
      : (head.indexOf('分支') >= 0 || head.indexOf('阻抗') >= 0) ? 'speaker'
      : head.indexOf('类型(') >= 0 ? 'md' : null;
    if (!kind) { SP.toast('无法识别表头：请使用下载的填写模板', true); return; }
    var added = 0, updated = 0, skipped = 0;
    Store.batch(function () {
      rows.slice(1).forEach(function (r) {
        var t;
        if (kind === 'md') {
          var name0 = String(r[1] || '').trim();
          if (!name0) { skipped++; return; }
          var type0 = /DSP|dsp/.test(String(r[0] || '')) ? 'dsp' : 'mixer';
          t = { type: type0, name: name0,
            ins: Math.max(1, parseInt(r[2], 10) || 4),
            outs: Math.max(1, parseInt(r[3], 10) || 8), specs: {} };
          if (String(r[4] || '').trim()) t.specs.rackU = String(r[4]).trim();
        } else {
          var name = String(r[0] || '').trim();
          if (!name) { skipped++; return; }
          if (kind === 'amp') {
            var ch = parseInt(r[1], 10) === 4 ? 4 : 2;
            t = { type: 'amp', name: name, ins: ch, outs: ch, specs: {} };
            if (String(r[2] || '').trim()) t.specs.power = String(r[2]).trim();
            if (String(r[3] || '').trim()) t.specs.rackU = String(r[3]).trim();
          } else {
            var roleTx = String(r[1] || '');
            var role = /线阵/.test(roleTx) ? 'linearray' : /超低|低音/.test(roleTx) ? 'sub' : 'fullrange';
            t = { type: 'speaker', name: name, ins: 1, outs: 1, speakerRole: role, specs: {} };
            t.specs.powered = /有源/.test(String(r[2] || '')) ? 'active' : 'passive';
            if (String(r[3] || '').trim()) t.specs.power = String(r[3]).trim();
            if (String(r[4] || '').trim()) t.specs.ohms = String(r[4]).trim();
            if (String(r[5] || '').trim()) t.specs.size = String(r[5]).trim();
          }
        }
        var res = Store.mergeTemplate(t);
        if (res === 'added') added++; else if (res === 'updated') updated++; else skipped++;
      });
    });
    SP.toast('批量导入完成：新增 ' + added + ' · 更新 ' + updated +
      (skipped ? ' · 跳过 ' + skipped + ' 行（缺型号名）' : '') + '（⌘Z 可撤销）');
    if (refreshFn) refreshFn();
  };

  SP.pickCsvImport = function (refreshFn) {
    var fi = el('csv-import-file');
    if (!fi) return;
    fi.onchange = function () {
      var f = this.files[0];
      this.value = '';
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { SP.importCsvTemplates(reader.result, refreshFn); };
      reader.readAsText(f, 'utf-8');
    };
    fi.click();
  };

  /* ================= 模板管理面板（顶栏「模板」按钮）=================
     批量导入 / 模板库存档 / 六类横排自定义新建（字段按类差异化） */

  SP.openTemplatePanel = function () {
    var TCATS = [
      { key: 'mixer', title: '调音台', type: 'mixer' },
      { key: 'dsp', title: 'DSP', type: 'dsp' },
      { key: 'amp', title: '功放', type: 'amp' },
      { key: 'fullrange', title: '全频', type: 'speaker', role: 'fullrange' },
      { key: 'sub', title: '超低', type: 'speaker', role: 'sub' },
      { key: 'active', title: '有源 ▸', expander: true }
    ];
    var ACTIVE_CATS = [
      { key: 'afullrange', title: '有源全频', type: 'speaker', role: 'fullrange', active: true },
      { key: 'asub', title: '有源超低', type: 'speaker', role: 'sub', active: true }
    ];
    var showActive = false;
    var curCat = null;

    function countOf(c) {
      return Store.state.deviceTemplates.filter(function (t) {
        if (t.type !== c.type) return false;
        if (c.type !== 'speaker') return true;
        if ((t.speakerRole || SP.inferSpeakerRole(t.name)) !== c.role) return false;
        var act = t.specs && t.specs.powered === 'active';
        return c.active ? act : !act;
      }).length;
    }

    function catsHtml() {
      var list = TCATS.slice(0, 5).concat(showActive ? ACTIVE_CATS : [TCATS[5]]);
      return list.map(function (c) {
        var on = curCat && curCat.key === c.key;
        return '<button class="tplp-cat' + (on ? ' on' : '') + '" data-tcat="' + c.key + '">' +
          esc(c.title) + (c.expander ? '' : '<span class="mp-io">' + countOf(c) + '</span>') +
          '</button>';
      }).join('');
    }

    function formHtml(c) {
      if (!c) return '<p class="cfg-note">点上方类别新建模板；同名保存会更新原模板并可同步到在用设备。</p>';
      var f = '<div class="cfg-field"><label>型号名称</label><input type="text" id="tf-name" placeholder="如 WING RACK / FA900 / DD115H"></div>';
      if (c.type === 'mixer' || c.type === 'dsp') {
        f += '<div class="cfg-inline">' +
          '<div class="cfg-field"><label>输入路数</label><input type="number" id="tf-ins" min="1" max="128" value="' + (c.type === 'dsp' ? 4 : 16) + '"></div>' +
          '<div class="cfg-field"><label>输出路数</label><input type="number" id="tf-outs" min="1" max="128" value="8"></div>' +
          '<div class="cfg-field"><label>机柜U数</label><input type="number" id="tf-u" min="0" step="0.5" placeholder="选填"></div></div>';
      } else if (c.type === 'amp') {
        f += '<div class="cfg-inline">' +
          '<div class="cfg-field"><label>通道数</label><select id="tf-ch"><option value="2">2 通道（2进2出）</option><option value="4">4 通道（4进4出）</option></select></div>' +
          '<div class="cfg-field"><label>功率 W</label><input type="number" id="tf-w" min="0" placeholder="如 900"></div>' +
          '<div class="cfg-field"><label>机柜U数</label><input type="number" id="tf-u" min="0" step="0.5" placeholder="选填"></div></div>';
      } else if (c.active) {
        f += '<div class="cfg-inline">' +
          '<div class="cfg-field"><label>输入路数</label><input type="number" id="tf-ins" min="1" max="8" value="1"></div>' +
          '<div class="cfg-field"><label>输出路数</label><input type="number" id="tf-outs" min="0" max="8" value="1"></div>' +
          '<div class="cfg-field"><label>功率 W</label><input type="number" id="tf-w" min="0" placeholder="如 500"></div>' +
          '<div class="cfg-field"><label>尺寸（寸）</label><input type="text" id="tf-size" placeholder="如 15 / 双6寸"></div></div>';
      } else {
        f += '<div class="cfg-inline">' +
          '<div class="cfg-field"><label>输入路数</label><input type="number" id="tf-ins" min="1" max="8" value="1"></div>' +
          '<div class="cfg-field"><label>输出路数</label><input type="number" id="tf-outs" min="0" max="8" value="1"></div>' +
          '<div class="cfg-field"><label>功率 W</label><input type="number" id="tf-w" min="0" placeholder="如 500"></div>' +
          '<div class="cfg-field"><label>阻抗 Ω</label><input type="number" id="tf-ohm" min="0" placeholder="如 8"></div>' +
          '<div class="cfg-field"><label>尺寸（寸）</label><input type="text" id="tf-size" placeholder="如 15 / 双6寸"></div></div>';
      }
      f += '<button class="btn primary sm" id="tf-save">保存「' + esc(c.title) + '」模板</button>';
      return f;
    }

    SP.openModal(
      '<div class="modal-head"><h3>模板</h3>' +
      '<span class="head-note">批量导入 · 存档 · 自定义新建</span>' +
      '<button class="btn icon" data-close-modal>✕</button></div>' +
      '<div class="modal-body">' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' +
      '<button class="btn ghost sm" id="tplp-dl-spk">下载填写音响模板</button>' +
      '<button class="btn ghost sm" id="tplp-dl-amp">下载填写功放模板</button>' +
      '<button class="btn ghost sm" id="tplp-csv">批量导入CSV…</button>' +
      '<button class="btn ghost sm" id="tplp-all-tpl" title="把当前画布所有设备按名称系列存入模板库">一键模板</button>' +
      '<button class="btn ghost sm" id="tplp-lib-out" title="导出完整模板库 JSON">导出模板库JSON</button>' +
      '<button class="btn ghost sm" id="tplp-lib-in">导入模板库</button>' +
      '</div>' +
      '<div class="tplp-cats" id="tplp-cats">' + catsHtml() + '</div>' +
      '<div id="tplp-form" style="margin-top:12px">' + formHtml(null) + '</div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn primary" data-close-modal>完成</button></div>'
    );
    el('modal-box').classList.add('modal-wide');
    var box = el('modal-box');

    function refreshCats() {
      el('tplp-cats').innerHTML = catsHtml();
      bindCats();
    }
    function bindCats() {
      box.querySelectorAll('[data-tcat]').forEach(function (b) {
        b.addEventListener('click', function () {
          var key = b.dataset.tcat;
          if (key === 'active') { showActive = true; refreshCats(); return; }
          curCat = TCATS.concat(ACTIVE_CATS).filter(function (c) { return c.key === key; })[0];
          refreshCats();
          el('tplp-form').innerHTML = formHtml(curCat);
          bindForm();
        });
      });
    }
    function bindForm() {
      var save = el('tf-save');
      if (!save) return;
      save.addEventListener('click', function () {
        var name = (el('tf-name').value || '').trim();
        if (!name) { SP.toast('请填写型号名称', true); return; }
        var c = curCat;
        var t;
        function v(id) { var x = el(id); return x && x.value !== '' ? String(x.value).trim() : ''; }
        if (c.type === 'mixer' || c.type === 'dsp') {
          t = { type: c.type, name: name,
            ins: Math.max(1, +v('tf-ins') || 1), outs: Math.max(1, +v('tf-outs') || 1), specs: {} };
          if (v('tf-u')) t.specs.rackU = v('tf-u');
        } else if (c.type === 'amp') {
          var ch = +v('tf-ch') === 4 ? 4 : 2;
          t = { type: 'amp', name: name, ins: ch, outs: ch, specs: {} };
          if (v('tf-w')) t.specs.power = v('tf-w');
          if (v('tf-u')) t.specs.rackU = v('tf-u');
        } else {
          t = { type: 'speaker', name: name,
            ins: Math.max(1, +v('tf-ins') || 1), outs: Math.max(0, +v('tf-outs') || 0),
            speakerRole: c.role,
            specs: { powered: c.active ? 'active' : 'passive' } };
          if (v('tf-w')) t.specs.power = v('tf-w');
          if (!c.active && v('tf-ohm')) t.specs.ohms = v('tf-ohm');
          if (v('tf-size')) t.specs.size = v('tf-size');
        }
        var res = Store.mergeTemplate(t);
        Store.save();
        refreshCats();
        SP.toast((res === 'added' ? '已新增' : '已更新') + '模板「' + name + '」');
      });
    }
    bindCats();

    el('tplp-dl-spk').addEventListener('click', function () {
      SP.csvDownload('signalpath-音响填写模板.csv', [
        ['型号名称', '分支(全频/超低/线阵列)', '有源无源(有源/无源)', '功率W', '阻抗Ω', '尺寸（寸）'],
        ['DD115H', '全频', '无源', '500', '8', '15'],
        ['双6寸全频', '全频', '无源', '350', '8', '双6寸']
      ]);
    });
    el('tplp-dl-amp').addEventListener('click', function () {
      SP.csvDownload('signalpath-功放填写模板.csv', [
        ['型号名称', '通道数(2或4)', '功率W', 'U数'],
        ['FA900', '4', '900', '2']
      ]);
    });
    el('tplp-csv').addEventListener('click', function () { SP.pickCsvImport(refreshCats); });
    el('tplp-all-tpl').addEventListener('click', function () {
      if (!Store.state.devices.length) { SP.toast('画布上还没有设备', true); return; }
      var r = Store.saveAllTemplates();
      refreshCats();
      SP.toast('一键模板完成：新增 ' + r.added + ' · 更新 ' + r.updated + '（⌘Z 可撤销）');
    });
    el('tplp-lib-out').addEventListener('click', function () { SP.exportTemplateJson(); });
    el('tplp-lib-in').addEventListener('click', function () { el('tpl-lib-file').click(); });
  };

  SP.openAddDevice = function () {
    var tpls = Store.state.deviceTemplates;
    var groupKeys = SP.TYPE_ORDER.filter(function (tk) { return tk !== 'speaker'; });
    tpls.forEach(function (t) {
      if (t.type !== 'speaker' && groupKeys.indexOf(t.type) < 0) groupKeys.push(t.type);
    });
    function templateItem(t, i) {
      var outs = Array.isArray(t.outs) ? t.outs.length : t.outs;
      var spk = t.type === 'speaker' ? ' · ' + speakerPowerLabel(t.specs || {}) : '';
      var instN = Store.templateInstances(t.tplId).length;
      return '<div class="tpl-item" data-tpl="' + i + '">' +
        '<span class="type-chip" style="background:' + esc(SP.typeColor(t.type)) + '">' +
        esc(Store.typeInfo(t.type).name) + '</span>' +
        '<span class="tpl-name">' + esc(t.name) + '</span>' +
        '<span class="tpl-io">IN ' + t.ins + ' · OUT ' + outs + spk +
        (instN ? ' · 在用 ' + instN + ' 台' : '') + '</span>' +
        '<button class="btn icon" data-tpl-edit="' + i + '" title="编辑模板（可同步到在用设备）">✎</button>' +
        '<button class="btn icon" data-tpl-del="' + i + '" title="删除模板">✕</button>' +
        '</div>';
    }
    var groups = groupKeys.map(function (tk) {
      var items = [];
      tpls.forEach(function (t, i) {
        if (t.type !== tk) return;
        items.push(templateItem(t, i));
      });
      if (!items.length) return '';
      return '<div class="tpl-group-title">' + esc(Store.typeInfo(tk).name) + '</div>' + items.join('');
    });
    SP.SPEAKER_ROLES.forEach(function (role) {
      var items = [];
      tpls.forEach(function (t, i) {
        if (t.type !== 'speaker') return;
        var r = t.speakerRole || SP.inferSpeakerRole(t.name);
        if (r === role.key) items.push(templateItem(t, i));
      });
      if (items.length) groups.push('<div class="tpl-group-title">音箱 · ' + esc(role.name) + '</div>' + items.join(''));
    });
    groups = groups.join('');

    function typeOptions(selected) {
      var opts = Object.keys(SP.DEVICE_TYPES).map(function (k) {
        return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' +
          esc(SP.DEVICE_TYPES[k].name) + '</option>';
      });
      Store.state.customTypes.forEach(function (t) {
        opts.push('<option value="' + t.key + '"' + (t.key === selected ? ' selected' : '') + '>' +
          esc(t.name) + '</option>');
      });
      opts.push('<option value="__new__">＋ 新增自定义类型…</option>');
      return opts.join('');
    }
    function roleOptions(selected) {
      selected = selected || 'fullrange';
      return SP.SPEAKER_ROLES.map(function (r) {
        return '<option value="' + r.key + '"' + (r.key === selected ? ' selected' : '') + '>' +
          esc(r.name) + '</option>';
      }).join('');
    }

    openModal(
      '<div class="modal-head"><h3>添加设备</h3>' +
      '<button class="btn icon" data-close-modal>✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="mode-switch">' +
      '<button class="active" data-mode="tpl">从型号模板</button>' +
      '<button data-mode="custom">自定义新建</button>' +
      '<button data-mode="csv">批量导入</button></div>' +

      '<div id="add-pane-csv" style="display:none">' +
      '<p class="cfg-note" style="margin-top:0">① 下载 CSV 填写模板（Excel 直接打开编辑）→ ② 填好后回传 → ' +
      '③ 自动按名称合并进模板库，快速布局立即可用，并可被「配置 → 导出模板库」整体存档。</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
      '<button class="btn ghost sm" id="csv-dl-speaker">下载填写音响模板</button>' +
      '<button class="btn ghost sm" id="csv-dl-amp">下载填写功放模板</button>' +
      '<button class="btn primary sm" id="csv-upload">选择填好的 CSV 导入…</button>' +
      '</div>' +
      '<p class="cfg-note">音响列：型号名称 / 分支(全频·超低·线阵列) / 有源无源 / 功率W / 阻抗Ω / 尺寸（寸）<br>' +
      '功放列：型号名称 / 通道数(2或4) / 功率W / U数。缺型号名或数值非法的行会跳过并汇总提示。</p>' +
      '</div>' +

      '<div id="add-pane-tpl">' +
      '<div class="tpl-list">' + (groups || '<p class="cfg-note">模板已全部删除，可点下方新增。</p>') + '</div>' +
      '<button class="btn ghost sm" id="tpl-new" style="margin-bottom:12px">＋ 新增常用型号</button>' +

      '<div id="tpl-form" style="display:none">' +
      '<div class="tpl-group-title" id="tpl-form-title">新增常用型号</div>' +
      '<div class="cfg-field"><label>类型</label><select id="tplf-type">' + typeOptions('mixer') + '</select></div>' +
      '<div class="cfg-inline" id="tplf-speaker-wrap" style="display:none">' +
      '<div class="cfg-field"><label>音箱分支</label><select id="tplf-role">' + roleOptions('fullrange') + '</select></div>' +
      '<div class="cfg-field"><label>有源 / 无源</label><select id="tplf-powered">' +
      '<option value="passive">无源</option><option value="active">有源</option></select></div></div>' +
      '<div class="cfg-field" id="tplf-newtype-wrap" style="display:none">' +
      '<label>新类型名称</label><input type="text" id="tplf-newtype"></div>' +
      '<div class="cfg-field"><label>型号名称</label><input type="text" id="tplf-name" placeholder="如：WING RACK / Midas M32R"></div>' +
      '<div class="cfg-inline">' +
      '<div class="cfg-field"><label>输入路数</label><input type="number" id="tplf-ins" min="0" max="128" value="2"></div>' +
      '<div class="cfg-field"><label>输出路数</label><input type="number" id="tplf-outs" min="0" max="128" value="2"></div>' +
      '<div class="cfg-field"><label>机柜 U 数</label><input type="number" id="tplf-racku" min="0" max="20" step="0.5" placeholder="选填"></div>' +
      '<div class="cfg-field"><label>功率 W</label><input type="text" id="tplf-power" placeholder="功放/有源音箱填"></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<button class="btn primary sm" id="tplf-save">保存型号</button>' +
      '<button class="btn ghost sm" id="tplf-cancel">取消</button></div>' +
      '</div>' +

      '<div class="cfg-inline">' +
      '<div class="cfg-field"><label>设备名称（可修改）</label>' +
      '<input type="text" id="add-tpl-name" placeholder="先在上方选择一个型号"></div>' +
      '<div class="cfg-field"><label>数量（多台自动编号）</label>' +
      '<input type="number" id="add-count" min="1" max="64" value="1"></div>' +
      '</div>' +
      '</div>' +

      '<div id="add-pane-custom" style="display:none">' +
      '<div class="cfg-field"><label>设备类型</label>' +
      '<select id="add-type">' + typeOptions('mixer') + '</select></div>' +
      '<div class="cfg-inline" id="add-speaker-wrap" style="display:none">' +
      '<div class="cfg-field"><label>音箱分支</label><select id="add-role">' + roleOptions('fullrange') + '</select></div>' +
      '<div class="cfg-field"><label>有源 / 无源</label><select id="add-powered">' +
      '<option value="passive">无源</option><option value="active">有源</option></select></div></div>' +
      '<div class="cfg-field" id="add-newtype-wrap" style="display:none">' +
      '<label>新类型名称</label><input type="text" id="add-newtype" placeholder="如：无线接收机 / 播放器"></div>' +
      '<div class="cfg-field"><label>设备名称</label>' +
      '<input type="text" id="add-name" placeholder="如：返听功放 2 号"></div>' +
      '<div class="cfg-inline">' +
      '<div class="cfg-field"><label>输入路数</label><input type="number" id="add-ins" min="0" max="128" value="2"></div>' +
      '<div class="cfg-field"><label>输出路数</label><input type="number" id="add-outs" min="0" max="128" value="2"></div>' +
      '<div class="cfg-field"><label>数量</label><input type="number" id="add-count2" min="1" max="64" value="1"></div>' +
      '</div></div>' +

      '</div>' +
      '<div class="modal-foot">' +
      '<button class="btn ghost" data-close-modal>取消</button>' +
      '<button class="btn primary" id="add-confirm">添加设备</button></div>'
    );

    el('modal-box').classList.add('modal-wide');
    var mode = 'tpl', selTpl = -1;
    var box = el('modal-box');

    box.querySelectorAll('.mode-switch button').forEach(function (b) {
      b.addEventListener('click', function () {
        mode = b.dataset.mode;
        box.querySelectorAll('.mode-switch button').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
        el('add-pane-tpl').style.display = mode === 'tpl' ? '' : 'none';
        el('add-pane-custom').style.display = mode === 'custom' ? '' : 'none';
        el('add-pane-csv').style.display = mode === 'csv' ? '' : 'none';
      });
    });

    /* --- 批量导入：CSV 填写模板下载 / 回传解析（表头自动识别音响或功放） --- */
    el('csv-dl-speaker').addEventListener('click', function () {
      SP.csvDownload('signalpath-音响填写模板.csv', [
        ['型号名称', '分支(全频/超低/线阵列)', '有源无源(有源/无源)', '功率W', '阻抗Ω', '尺寸（寸）'],
        ['DD115H', '全频', '无源', '500', '8', '15'],
        ['双6寸全频', '全频', '无源', '350', '8', '双6寸']
      ]);
    });
    el('csv-dl-amp').addEventListener('click', function () {
      SP.csvDownload('signalpath-功放填写模板.csv', [
        ['型号名称', '通道数(2或4)', '功率W', 'U数'],
        ['FA900', '4', '900', '2']
      ]);
    });

    el('csv-upload').addEventListener('click', function () {
      SP.pickCsvImport(SP.openAddDevice);
    });

    box.querySelectorAll('.tpl-item').forEach(function (b) {
      b.addEventListener('click', function (e) {
        if (e.target.closest('[data-tpl-edit]') || e.target.closest('[data-tpl-del]')) return;
        selTpl = +b.dataset.tpl;
        box.querySelectorAll('.tpl-item').forEach(function (x) {
          x.classList.toggle('sel', x === b);
        });
        el('add-tpl-name').value = tpls[selTpl].name;
      });
    });

    /* --- 模板新增 / 编辑（编辑保存后可同步到实例） --- */
    var editingTpl = -1;

    function showTplForm(idx) {
      editingTpl = idx;
      var t = idx >= 0 ? tpls[idx] : null;
      el('tpl-form-title').textContent = t ? '编辑常用型号：' + t.name : '新增常用型号';
      if (t) {
        var sel = el('tplf-type');
        var has = Array.prototype.some.call(sel.options, function (o) { return o.value === t.type; });
        if (has) sel.value = t.type;
        el('tplf-speaker-wrap').style.display = t.type === 'speaker' ? '' : 'none';
        el('tplf-role').value = t.speakerRole || SP.inferSpeakerRole(t.name);
        el('tplf-powered').value = (t.specs && t.specs.powered === 'active') ? 'active' : 'passive';
        el('tplf-name').value = t.name;
        el('tplf-ins').value = t.ins;
        el('tplf-outs').value = Array.isArray(t.outs) ? t.outs.length : t.outs;
        el('tplf-racku').value = (t.specs && t.specs.rackU) || '';
        el('tplf-power').value = (t.specs && t.specs.power) || '';
      } else {
        el('tplf-type').value = 'mixer';
        el('tplf-speaker-wrap').style.display = 'none';
        el('tplf-name').value = '';
        el('tplf-ins').value = 2;
        el('tplf-outs').value = 2;
        el('tplf-racku').value = '';
        el('tplf-power').value = '';
      }
      el('tpl-form').style.display = '';
    }

    box.querySelectorAll('[data-tpl-edit]').forEach(function (b) {
      b.addEventListener('click', function () { showTplForm(+b.dataset.tplEdit); });
    });
    box.querySelectorAll('[data-tpl-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = tpls[+b.dataset.tplDel];
        if (!t) return;
        Store.removeDeviceTemplate(+b.dataset.tplDel);
        SP.toast('已删除模板「' + t.name + '」，已添加的设备不受影响（⌘Z 可撤销）');
        SP.openAddDevice();
      });
    });
    el('tpl-new').addEventListener('click', function () { showTplForm(-1); });
    el('tplf-cancel').addEventListener('click', function () {
      el('tpl-form').style.display = 'none';
    });
    el('tplf-type').addEventListener('change', function () {
      el('tplf-newtype-wrap').style.display = this.value === '__new__' ? '' : 'none';
      el('tplf-speaker-wrap').style.display = this.value === 'speaker' ? '' : 'none';
      if (this.value === 'speaker') {
        el('tplf-ins').value = 1;
        el('tplf-outs').value = 1;
      }
    });
    el('tplf-save').addEventListener('click', function () {
      var type = el('tplf-type').value;
      if (type === '__new__') {
        var tn = el('tplf-newtype').value.trim();
        if (!tn) { alert('请填写新类型名称'); return; }
        type = Store.addCustomType(tn);
      }
      var name = el('tplf-name').value.trim();
      if (!name) { alert('请填写型号名称'); return; }
      var ins = Math.max(0, Math.min(128, +el('tplf-ins').value || 0));
      var outs = Math.max(0, Math.min(128, +el('tplf-outs').value || 0));
      var old = editingTpl >= 0 ? tpls[editingTpl] : null;
      var outsVal = (old && Array.isArray(old.outs) && old.outs.length === outs) ? old.outs : outs;
      var t = { type: type, name: name, ins: ins, outs: outsVal };
      t.specs = Object.assign({}, old && old.specs);
      var u = el('tplf-racku').value.trim();
      var pw = el('tplf-power').value.trim();
      if (u) t.specs.rackU = u; else delete t.specs.rackU;
      if (pw) t.specs.power = pw; else delete t.specs.power;
      if (type === 'speaker') {
        t.speakerRole = el('tplf-role').value || 'fullrange';
        t.specs.powered = el('tplf-powered').value === 'active' ? 'active' : 'passive';
      }
      if (old && old.mixerDefaults) t.mixerDefaults = old.mixerDefaults;
      if (editingTpl >= 0) {
        Store.updateDeviceTemplate(editingTpl, t);
        /* 模板 → 在用设备直接同步（不改实例名字，可撤销） */
        var insts = Store.templateInstances(t.tplId);
        if (insts.length) {
          Store.syncTemplateInstances(editingTpl);
          SP.renderAll();
          SP.toast('模板已保存并同步到 ' + insts.length + ' 台在用设备（⌘Z 可撤销）');
        } else {
          SP.toast('模板已保存');
        }
      } else {
        Store.addDeviceTemplate(t);
        SP.toast('已新增模板「' + t.name + '」');
      }
      SP.openAddDevice();
    });

    el('add-type').addEventListener('change', function () {
      el('add-newtype-wrap').style.display = this.value === '__new__' ? '' : 'none';
      el('add-speaker-wrap').style.display = this.value === 'speaker' ? '' : 'none';
      if (this.value === 'speaker') {
        el('add-ins').value = 1;
        el('add-outs').value = 1;
      }
    });

    el('add-confirm').addEventListener('click', function () {
      var added = [];
      if (mode === 'tpl') {
        if (selTpl < 0 || !tpls[selTpl]) { alert('请先选择一个型号模板'); return; }
        var t = tpls[selTpl];
        var count = Math.max(1, Math.min(64, +el('add-count').value || 1));
        var baseName = el('add-tpl-name').value.trim() || t.name;
        var outs0 = Array.isArray(t.outs) ? t.outs.length : t.outs;
        var tplNames = count > 1 ? Store.numberedNames(baseName, count) : [baseName];
        added = Store.addDevices(tplNames.map(function (nm) {
          return {
            type: t.type, name: nm, ins: t.ins, outs: outs0,
            outLabels: Array.isArray(t.outs) ? t.outs : null,
            speakerRole: t.type === 'speaker' ? (t.speakerRole || SP.inferSpeakerRole(t.name)) : '',
            specs: Object.assign({}, t.specs || {}),
            mixerDefaults: t.mixerDefaults || null,
            tplId: t.tplId || ''
          };
        }));
      } else {
        var type = el('add-type').value;
        if (type === '__new__') {
          var tn = el('add-newtype').value.trim();
          if (!tn) { alert('请填写新类型名称'); return; }
          type = Store.addCustomType(tn);
        }
        var name = el('add-name').value.trim();
        if (!name) { alert('请填写设备名称'); return; }
        var ins = Math.max(0, Math.min(128, +el('add-ins').value || 0));
        var outs = Math.max(0, Math.min(128, +el('add-outs').value || 0));
        if (ins === 0 && outs === 0) { alert('输入/输出路数不能同时为 0'); return; }
        var count2 = Math.max(1, Math.min(64, +el('add-count2').value || 1));
        var opt = { type: type, name: name, ins: ins, outs: outs, specs: {} };
        if (type === 'speaker') {
          opt.speakerRole = el('add-role').value || 'fullrange';
          opt.specs.powered = el('add-powered').value === 'active' ? 'active' : 'passive';
        }
        var names = count2 > 1 ? Store.numberedNames(name, count2) : [name];
        names.forEach(function (nm) {
          added.push(Store.addDevice(Object.assign({}, opt, { name: nm })));
        });
      }
      closeModal();
      SP.renderAll();
      if (added[0]) setTimeout(function () { SP.selectDevice(added[0].id, true); }, 30);
    });
  };

  /* ================= 连接清单（底部抽屉表格） ================= */

  /* 连接清单排序模式：hier = 层级（调音台→DSP→功放→音箱）；added = 连线创建顺序 */
  SP.connSort = (function () {
    try { return localStorage.getItem('signalpath-connsort') === 'added' ? 'added' : 'hier'; }
    catch (e) { return 'hier'; }
  })();

  function connHierSort(conns) {
    var roleOrd = { linearray: 0, fullrange: 1, sub: 2 };
    function orderOf(d) {
      if (!d) return 9;
      if (d.type === 'mixer') return 0;
      if (d.type === 'dsp') return 1;
      if (d.type === 'amp') return 2;
      if (d.type === 'speaker') return 3 + (roleOrd[d.speakerRole || 'fullrange'] || 1) / 10;
      return 1.5;   /* 自定义类型放在 DSP 与功放之间 */
    }
    var rackIdx = {};
    Store.state.devices.forEach(function (d, i) { rackIdx[d.id] = i; });
    return conns.sort(function (a, b) {
      var oa = orderOf(Store.getDevice(a.sid)), ob = orderOf(Store.getDevice(b.sid));
      if (oa !== ob) return oa - ob;
      var ra = rackIdx[a.sid] || 0, rb = rackIdx[b.sid] || 0;
      if (ra !== rb) return ra - rb;
      if (a.sport !== b.sport) return a.sport - b.sport;
      var ta = rackIdx[a.tid] || 0, tb = rackIdx[b.tid] || 0;
      if (ta !== tb) return ta - tb;
      return a.tport - b.tport;
    });
  }
  SP.connHierSort = connHierSort;

  SP.renderWiringTable = function () {
    var host = el('wiring-table-wrap');
    if (!host) return;
    var st = Store.state;
    var conns = st.connections.slice();
    if (SP.connSort !== 'added') connHierSort(conns);
    var cnt = el('wiring-count');
    if (cnt) cnt.textContent = conns.length ? conns.length + ' 条连接' : '无连接';

    if (!conns.length) {
      host.innerHTML = '<div class="empty-hint">尚无连接。在框图上点输出口→输入口手动连线，或用「⚡ 一键智能连接」。</div>';
      return;
    }

    var rows = conns.map(function (c) {
      var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
      if (!s || !t) return '';
      var sp = s.outputs[c.sport], tp = t.inputs[c.tport];
      if (!sp || !tp) return '';
      var warn = Store.connWarning(c);
      var ampInfo = '—';
      if (s.type === 'amp') {
        var mode = Store.ampPairMode(s, Math.floor(c.sport / 2));
        ampInfo = '档位 ' + (sp.gain || '未填') + ' · ' +
          (s.specs && s.specs.grounded ? '接地' : '不接地') +
          ' · ' + (mode === 'B' ? 'B桥接' : mode + '档');
      }
      var cable = Store.cableOf(c);
      var cableOpts = SP.CABLE_TYPES.map(function (ct) {
        return '<option' + (ct === cable ? ' selected' : '') + '>' + esc(ct) + '</option>';
      }).join('');
      var key = c.tid + ':' + c.tport;
      return '<tr class="' + (warn ? 'row-warn' : '') + '" data-sid="' + c.sid + '" data-tid="' + c.tid + '">' +
        '<td><span class="cell-dev">' + esc(s.name) + '</span><br>' +
        '<span class="cell-port">' + esc(Store.outLabelOf(s, c.sport)) + '</span></td>' +
        '<td class="cell-arrow">→</td>' +
        '<td><span class="cell-dev">' + esc(t.name) + '</span><br>' +
        '<span class="cell-port">' + esc(tp.label) + '</span></td>' +
        '<td class="cell-cable">' +
        '<select class="conn-cable" data-key="' + key + '">' + cableOpts + '</select>' +
        '<input type="color" class="color-input conn-color" data-key="' + key +
        '" value="' + esc(Store.colorOf(c)) + '" title="连线颜色（框图中显示）">' +
        '<input type="number" class="conn-len" data-key="' + key + '" min="0" step="0.5"' +
        ' value="' + esc(c.lenM || '') + '" placeholder="米" title="线材长度（米），用于购线汇总">' +
        '<input type="text" class="conn-note" data-key="' + key +
        '" value="' + esc(c.note || '') + '" placeholder="备注" title="走线备注，显示在报告中">' +
        '</td>' +
        '<td class="cell-amp">' + esc(ampInfo) + '</td>' +
        '<td>' + (warn
          ? '<span class="tag warn" title="' + esc(warn) + '">警示</span>'
          : '<span class="tag ok">正常</span>') + '</td>' +
        '</tr>';
    }).join('');

    host.innerHTML = '<table class="sheet"><thead><tr>' +
      '<th>信号源</th><th></th><th>目标</th>' +
      '<th>线材 / 线色 / 长度</th>' +
      '<th>功放参数</th><th>校验</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';

    function findConn(key) {
      var parts = key.split(':');
      return Store.sourceFor(parts[0], +parts[1]);
    }
    host.querySelectorAll('.conn-cable').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var c = findConn(sel.dataset.key);
        if (c) {
          c.cable = sel.value;
          Store.save();
          if (SP.renderCables) SP.renderCables();
        }
      });
    });
    host.querySelectorAll('.conn-len').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var c = findConn(inp.dataset.key);
        if (c) {
          c.lenM = inp.value === '' ? '' : Math.max(0, +inp.value);
          Store.save();
          SP.renderWiringDiagram(el('wiring-diagram'));
          if (SP.renderCables) SP.renderCables();
        }
      });
    });
    host.querySelectorAll('.conn-note').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var c = findConn(inp.dataset.key);
        if (c) { c.note = inp.value.trim(); Store.save(); }
      });
    });
    host.querySelectorAll('.conn-color').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var c = findConn(inp.dataset.key);
        if (c) {
          c.color = inp.value;
          Store.save();
          SP.renderWiringDiagram(el('wiring-diagram'));
        }
      });
    });

    /* 重绘后恢复选中高亮 */
    if (SP.selectedDeviceId) {
      host.querySelectorAll('tr[data-sid]').forEach(function (tr) {
        tr.classList.toggle('hl',
          tr.dataset.sid === SP.selectedDeviceId || tr.dataset.tid === SP.selectedDeviceId);
      });
    }
  };

  /* ================= 功率报警：功放输出负载 / 并联阻抗 / 模式余量 ================= */

  SP.openPowerAlarm = function () {
    openModal(
      '<div class="modal-head"><h3>功率报警</h3>' +
      '<button class="btn icon" data-close-modal>✕</button></div>' +
      '<div class="modal-body" id="power-alarm-body"></div>' +
      '<div class="modal-foot"><button class="btn primary" data-close-modal>完成</button></div>'
    );
    el('modal-box').classList.add('modal-wide');

    function fmtW(n) { return n ? (Math.round(n * 10) / 10 + ' W') : '未填'; }
    function fmtOhm(n) { return n ? (Math.round(n * 100) / 100 + ' Ω') : '未填'; }
    function statusOf(r) {
      if (r.errors) return { cls: 'bad', tx: '报警' };
      if (r.warnings) return { cls: 'warn', tx: '提醒' };
      return { cls: 'ok', tx: '正常' };
    }

    function render() {
      var res = Store.powerAlarmResults(Store.state.powerAlarmMode);
      var modes = Store.powerAlarmModes || [];
      var body = el('power-alarm-body');
      if (!body) return;
      var modeHtml = '<div class="power-mode-row">' +
        modes.map(function (m) {
          return '<button class="' + (m.key === res.mode.key ? 'on' : '') +
            '" data-power-mode="' + m.key + '">' + esc(m.name) +
            '<small>×' + m.min + '–×' + m.max + '</small></button>';
        }).join('') + '</div>';
      var summary = '<div class="power-summary">' +
        '<span class="bad">报警 ' + res.summary.errors + '</span>' +
        '<span class="warn">提醒 ' + res.summary.warnings + '</span>' +
        '<span class="ok">正常 ' + res.summary.ok + '</span>' +
        '</div>';
      if (!res.rows.length) {
        body.innerHTML = modeHtml + summary +
          '<div class="empty-hint">没有检测到「功放 → 无源音箱」的连接。<br>填好功放功率、音箱功率和阻抗后再检查。</div>';
      } else {
        body.innerHTML = modeHtml + summary +
          '<p class="cfg-note">按每个功放输出口计算：link / 并联音箱会合并总功率；阻抗按并联公式计算。含超低负载时默认按 ×2–×4 选配并提示限幅。</p>' +
          '<div class="power-alarm-list">' + res.rows.map(function (r) {
            var st = statusOf(r);
            var spkNames = r.speakers.map(function (d) { return d.name; }).join('、');
            var issues = r.issues.length
              ? '<ul>' + r.issues.map(function (it) {
                  return '<li class="' + it.level + '">' + esc(it.text) + '</li>';
                }).join('') + '</ul>'
              : '<ul><li class="ok">功率余量和阻抗检查通过。</li></ul>';
            return '<div class="power-alarm-card ' + st.cls + '">' +
              '<div class="power-alarm-head">' +
              '<strong>' + esc(r.amp.name) + ' · ' + esc(Store.outLabelOf(r.amp, r.sport)) + '</strong>' +
              '<span class="tag ' + (st.cls === 'bad' ? 'warn' : st.cls) + '">' + st.tx + '</span>' +
              '</div>' +
              '<div class="power-load">' +
              '<span>负载：' + esc(spkNames) + '</span>' +
              '<span>音箱总功率 <b>' + fmtW(r.totalW) + '</b></span>' +
              '<span>功放功率 <b>' + fmtW(r.ampW) + '</b></span>' +
              '<span>建议 <b>' + fmtW(r.minNeed) + ' – ' + fmtW(r.maxNeed) + '</b></span>' +
              '<span>等效阻抗 <b>' + fmtOhm(r.loadOhms) + '</b></span>' +
              '</div>' + issues +
              '</div>';
          }).join('') + '</div>';
      }
      body.querySelectorAll('[data-power-mode]').forEach(function (b) {
        b.addEventListener('click', function () {
          Store.setPowerAlarmMode(b.dataset.powerMode);
          render();
          SP.renderWiringTable();
          SP.renderWiringDiagram(el('wiring-diagram'));
        });
      });
    }
    render();
  };

  /* ================= 绑定 ================= */

  document.addEventListener('DOMContentLoaded', function () {
    var addBtn = el('insp-add');
    if (addBtn) addBtn.addEventListener('click', SP.openAddDevice);

    /* 连接清单抽屉开合 */
    var drawer = el('conn-drawer');
    var toggle = el('drawer-toggle');
    if (drawer && toggle) {
      toggle.addEventListener('click', function () {
        drawer.classList.toggle('open');
        toggle.querySelector('.tri').textContent = drawer.classList.contains('open') ? '▾' : '▴';
      });
    }

    /* 连接清单排序切换 */
    var seg = el('conn-sort-seg');
    if (seg) {
      function syncSeg() {
        seg.querySelectorAll('button').forEach(function (b) {
          b.classList.toggle('on', b.dataset.sort === SP.connSort);
        });
      }
      seg.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          SP.connSort = b.dataset.sort === 'added' ? 'added' : 'hier';
          try { localStorage.setItem('signalpath-connsort', SP.connSort); } catch (e) {}
          syncSeg();
          SP.renderWiringTable();
        });
      });
      syncSeg();
    }

    /* 一键智能连接 / 全部清线 */
    SP.runSmartAssignAll = function () {
      var res = Store.smartAssignAll();
      if (!res.count) {
        SP.toast(res.remaining
          ? '没有可自动连接的线路：' + res.remaining + ' 路输入缺上游空闲输出'
          : '所有输入都已连接，无需补线', true);
        return;
      }
      SP.renderAll();
      SP.toast('一键智能连接完成 ' + res.count + ' 路' +
        (res.remaining ? '，仍有 ' + res.remaining + ' 路缺上游输出' : '') + '（⌘Z 可撤销）');
    };
    var smartBtn = el('btn-smart-all-diagram');
    if (smartBtn) smartBtn.addEventListener('click', SP.runSmartAssignAll);
    var powerBtn = el('btn-power-alarm');
    if (powerBtn) powerBtn.addEventListener('click', SP.openPowerAlarm);

    SP.clearAllWiresPrompt = function () {
      var n = Store.state.connections.length;
      if (!n) { SP.toast('当前没有任何连线', true); return; }
      Store.clearAllConnections();
      SP.renderAll();
      SP.toast('已清空 ' + n + ' 条连线（⌘Z 可撤销）');
    };
    var clearBtn = el('btn-clear-all-wires-diagram');
    if (clearBtn) clearBtn.addEventListener('click', SP.clearAllWiresPrompt);
  });
})();
