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

  function roleLabel(role) { return role === 'sub' ? '超低' : '全频'; }
  function normToken(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[^\w\u4e00-\u9fa5]/g, '');
  }
  function normalizeSpeakerVoiceText(s) {
    s = String(s || '');
    var map = { '〇': '零', '○': '零', '幺': '一', '壹': '一', '贰': '二', '貳': '二', '俩': '两',
      '叁': '三', '參': '三', '肆': '四', '伍': '五', '陆': '六', '陸': '六', '柒': '七', '捌': '八', '玖': '九', '拾': '十' };
    s = s.replace(/[〇○幺壹贰貳俩叁參肆伍陆陸柒捌玖拾]/g, function (c) { return map[c] || c; });
    s = s.replace(/(\d+|[一二两三四五六七八九十]+)\s*(?:对|双)/g, function (_, n) {
      var v = cnNumber(n);
      return v ? (v * 2) + '只' : _;
    });
    s = s.replace(/全\s*(?:屏|凭|評|评|品|平|苹|瓶|频)/g, '全频')
      .replace(/全拼/g, '全频')
      .replace(/全品/g, '全频')
      .replace(/全屏/g, '全频')
      .replace(/全瓶/g, '全频')
      .replace(/全凭/g, '全频')
      .replace(/全评/g, '全频')
      .replace(/全平/g, '全频')
      .replace(/超\s*(?:底|地|抵|迪|低)/g, '超低')
      .replace(/低音炮|重低音|低频|低音/g, '超低')
      .replace(/有\s*(?:缘|原|圆|元|源)|油源|优源|有电源|电源音响|主动音响|带功放音响|自带功放音响|自带功放/g, '有源')
      .replace(/无\s*(?:缘|原|源)|被动音响|不带功放音响|不带功放/g, '无源')
      .replace(/并联串联|并连串接|并连串结|并联串结|并联穿接|串联|串接/g, '并联串接')
      .replace(/并\s*联/g, '并联')
      .replace(/([0-9一二两三四五六七八九十]+)\s*(?:字|子|仔)(?=\s*(?:全频|超低|有源|无源|音箱|音响|[A-Za-z0-9]))/g, '$1只')
      .replace(/([0-9一二两三四五六七八九十]+)\s*(?:支|只|个|台|之|枝)/g, '$1只')
      .replace(/([0-9一二两三四五六七八九十]+)\s*箱/g, '$1只')
      .replace(/第([0-9一二两三四五六七八九十]+)只/g, '第$1个')
      .replace(/两只都/g, '两个都');
    return s;
  }
  function cnNumber(s) {
    s = String(s || '').trim();
    if (/^\d+$/.test(s)) return +s;
    var map = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (s === '十') return 10;
    var m = s.match(/^十([一二两三四五六七八九])$/);
    if (m) return 10 + map[m[1]];
    m = s.match(/^([一二两三四五六七八九])十([一二两三四五六七八九])?$/);
    if (m) return map[m[1]] * 10 + (m[2] ? map[m[2]] : 0);
    return map[s] || 0;
  }
  function roleFromText(s) {
    s = String(s || '').toLowerCase();
    if (/超低|低音|sub/.test(s)) return 'sub';
    if (/全频|full/.test(s)) return 'fullrange';
    return '';
  }
  function rolesFromText(s) {
    var out = [];
    if (/全频|full/i.test(s)) out.push('fullrange');
    if (/超低|低音|sub/i.test(s)) out.push('sub');
    return out;
  }
  function activeFromText(s) {
    s = String(s || '');
    if (/无源|被动/.test(s)) return false;
    if (/有源|主动|自带功放|带功放/.test(s)) return true;
    return undefined;
  }
  function connectionFromText(s) {
    s = String(s || '');
    if (!/并联串接|并联|一通道带|每通道/.test(s)) return null;
    var m = s.match(/(?:并联串接|并联|一通道带|每通道)\s*(\d+|[二两三四])只?/) ||
      s.match(/(\d+|[二两三四])只?\s*(?:一组|每通道)/);
    return { mode: 'parallel', units: Math.max(2, Math.min(4, cnNumber(m && m[1]) || 2)) };
  }
  function speakerTplRole(t) { return t.speakerRole || SP.inferSpeakerRole(t.name); }
  function speakerTplPowered(t) { return !!(t.specs && t.specs.powered === 'active'); }
  function tplStock(t) {
    var s = (t && t.specs) || {};
    var vals = [t && t.stock, t && t.inventory, t && t.qty, t && t['库存'],
      s.stock, s.inventory, s.qty, s['库存']];
    for (var i = 0; i < vals.length; i++) {
      if (vals[i] === undefined || vals[i] === null || vals[i] === '') continue;
      var n = Number(vals[i]);
      if (isFinite(n)) return Math.max(0, n);
    }
    return null;
  }
  function speakerTplMatches(t, role, active) {
    if (!t || t.type !== 'speaker') return false;
    if (role && speakerTplRole(t) !== role) return false;
    if (active !== undefined && speakerTplPowered(t) !== !!active) return false;
    return true;
  }
  function speakerTemplateMatch(query, role, active, templates) {
    var q = normToken(query);
    if (!q) return null;
    var list = templates || (Store.state && Store.state.deviceTemplates) || [];
    var loose = null;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!speakerTplMatches(t, role, active)) continue;
      var n = normToken(t.name);
      if (n === q || (t.tplId && normToken(t.tplId) === q)) return { tpl: t, idx: i, exact: true };
      if (!loose && (n.indexOf(q) >= 0 || q.indexOf(n) >= 0)) loose = { tpl: t, idx: i, exact: false };
    }
    return loose;
  }
  function modelTokenPattern() {
    return '([A-Za-z0-9][A-Za-z0-9_-]*[A-Za-z][A-Za-z0-9_-]*)';
  }
  function cleanVoiceText(text) {
    return normalizeSpeakerVoiceText(text).replace(/[，。；、,.;]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function voiceCountMentions(raw) {
    var text = cleanVoiceText(raw);
    var out = [], re = /(\d+|[一二两三四五六七八九十]+)\s*(?:只|个|支|台)/g, m;
    while ((m = re.exec(text))) out.push({ count: cnNumber(m[1]), text: m[0] });
    return out.filter(function (x) { return x.count > 0; });
  }
  function unusedVoiceCounts(raw, groups) {
    var mentions = voiceCountMentions(raw);
    var used = {};
    (groups || []).forEach(function (g) {
      for (var i = 0; i < mentions.length; i++) {
        if (used[i] || mentions[i].count !== +g.count) continue;
        used[i] = true;
        break;
      }
    });
    return mentions.filter(function (_, i) { return !used[i]; }).map(function (x) { return x.count; });
  }
  function parseSpeakerGroupsFromText(raw, templates) {
    var text = cleanVoiceText(raw);
    var groups = [], spans = [];
    var num = '(\\d+|[一二两三四五六七八九十]+)';
    var role = '((?:有源|无源)\\s*(?:全频|超低|低音|sub)|(?:全频|超低|低音|sub)\\s*(?:有源|无源)|(?:全频|超低|低音|sub))';
    var model = modelTokenPattern();
    function overlaps(a, b) { return a[0] < b[1] && b[0] < a[1]; }
    function push(span, roleText, countText, modelText) {
      if (spans.some(function (x) { return overlaps(x, span); })) return;
      if (span[0] > 0 && /[A-Za-z0-9_-]/.test(text.charAt(span[0] - 1))) return;
      var r = roleFromText(roleText), count = cnNumber(countText);
      if (!r || !count) return;
      var model = String(modelText || '').replace(/^(用|选|选择|型号)/, '').trim();
      var spanText = text.slice(span[0], span[1]);
      var active = activeFromText(roleText + ' ' + spanText);
      var hit = model ? speakerTemplateMatch(model, r, active, templates) : null;
      var conn = connectionFromText(spanText);
      groups.push({
        role: r, count: count, templateId: hit ? (hit.tpl.tplId || hit.tpl.name) : null,
        active: active !== undefined ? active : (hit ? speakerTplPowered(hit.tpl) : false),
        templateName: hit ? hit.tpl.name : null, templateQuery: hit ? model : (model || null),
        connectionMode: conn ? conn.mode : null, unitsPerChannel: conn ? conn.units : null
      });
      spans.push(span);
    }
    function pushModel(span, modelText, countText, roleText) {
      if (spans.some(function (x) { return overlaps(x, span); })) return;
      var q = String(modelText || '').trim();
      var count = cnNumber(countText);
      if (!q || !count) return;
      var explicitRole = roleFromText(roleText || '');
      var spanText = text.slice(span[0], span[1]);
      var active = activeFromText((roleText || '') + ' ' + spanText);
      var hit = speakerTemplateMatch(q, explicitRole || '', active, templates);
      var resolvedRole = explicitRole || (hit ? speakerTplRole(hit.tpl) : 'fullrange');
      var conn = connectionFromText(spanText);
      groups.push({
        role: resolvedRole, count: count, templateId: hit ? (hit.tpl.tplId || hit.tpl.name) : null,
        active: active !== undefined ? active : (hit ? speakerTplPowered(hit.tpl) : false),
        templateName: hit ? hit.tpl.name : null, templateQuery: q,
        connectionMode: conn ? conn.mode : null, unitsPerChannel: conn ? conn.units : null
      });
      spans.push(span);
    }
    var m;
    var re5 = new RegExp(num + '\\s*(?:个|只|支|台)?\\s*(?:' + role + '\\s*)?(?:并联串接|并联)\\s*(?:的)?\\s*' + model, 'ig');
    while ((m = re5.exec(text))) pushModel([m.index, re5.lastIndex], m[3], m[1], m[2] || '');
    var re6 = new RegExp(num + '\\s*(?:个|只|支|台)?\\s*' + model + '\\s*(?:并联串接|并联)', 'ig');
    while ((m = re6.exec(text))) pushModel([m.index, re6.lastIndex], m[2], m[1], '');
    var re1 = new RegExp(num + '\\s*(?:个|只|支|台)?\\s*' + role + '\\s*(?:用|选|选择|型号)?\\s*' + model + '?', 'ig');
    while ((m = re1.exec(text))) push([m.index, re1.lastIndex], m[2], m[1], m[3]);
    var re2 = new RegExp(role + '\\s*' + num + '\\s*(?:个|只|支|台)?\\s*(?:用|选|选择|型号)?\\s*' + model + '?', 'ig');
    while ((m = re2.exec(text))) push([m.index, re2.lastIndex], m[1], m[2], m[3]);
    var re4a = new RegExp(model + '\\s*(?:([一二两三四五六七八九十]+)\\s*(?:个|只|支|台)?|(\\d+)\\s*(?:个|只|支|台))', 'ig');
    while ((m = re4a.exec(text))) pushModel([m.index, re4a.lastIndex], m[1], m[2] || m[3], '');
    var re4b = new RegExp(model + '(?:\\s+(?:来|要|用|给我|给|需要)?\\s*|\\s*(?:来|要|用|给我|给|需要)\\s*)' +
      num + '\\s*(?:个|只|支|台)?', 'ig');
    while ((m = re4b.exec(text))) pushModel([m.index, re4b.lastIndex], m[1], m[2], '');
    var re3 = new RegExp(num + '(?:\\s*(?:个|只|支|台)\\s*(?:音箱|音响|箱子)?\\s*|\\s+)' + model, 'ig');
    while ((m = re3.exec(text))) pushModel([m.index, re3.lastIndex], m[2], m[1], '');
    return groups;
  }
  function parseOrdinalPick(text) {
    var m = String(text || '').match(/第?(\d+|[一二两三四五六七八九十]+)个/);
    return m ? cnNumber(m[1]) : 0;
  }

  SP.speakerTemplateStock = tplStock;
  SP.normalizeSpeakerVoiceText = normalizeSpeakerVoiceText;
  SP.parseSpeakerVoiceCommand = function (text, opt) {
    opt = opt || {};
    var raw = normalizeSpeakerVoiceText(text).trim();
    var compact = raw.replace(/\s+/g, '');
    var templates = opt.templates || (Store.state && Store.state.deviceTemplates) || [];
    var modelTerm = modelTokenPattern();
    if (/撤销|撤回|回退|上一步|取消刚刚|取消刚才|删掉刚刚|删掉刚才|不要刚刚|不要刚才/.test(compact)) {
      return { intent: 'undo_last', text: raw };
    }
    var parsedGroups = parseSpeakerGroupsFromText(raw, templates);
    if (parsedGroups.length) {
      var missingCounts = unusedVoiceCounts(raw, parsedGroups);
      var isAppend = /再加|再要|再来|还要|另外|还有|补一|补个|补上|追加|多一组|新建一组|来一组|来\d+只|来[一二两三四五六七八九十]+只/.test(compact);
      var isModify = /刚刚|刚才|上一组|前面那个|前一组|这一组|这个|改成|不是|数量改为|数量改|换成/.test(compact);
      return {
        intent: 'create_speaker_groups',
        mode: isModify ? 'modify' : (isAppend ? 'append' : 'replace'),
        groups: parsedGroups,
        missingCounts: missingCounts
      };
    }
    if (/确认.*(?:并联|串接)|(?:并联|串接).*确认/.test(compact)) return { intent: 'confirm_connection_mode', mode: 'parallel' };
    var par = compact.match(/(全频|超低|低音|sub)?(?:.*?)(?:并联串接|并联|串接|一通道带)(\d+|[二两三四])只?/i);
    if (par) {
      return { intent: 'set_connection_mode', mode: 'parallel',
        roles: par[1] ? [roleFromText(par[1])] : rolesFromText(raw),
        units: Math.max(2, cnNumber(par[2]) || 2), preview: true };
    }
    if (/确认/.test(compact)) {
      var cr = rolesFromText(raw);
      return { intent: 'confirm_groups', roles: (/两个|全部|全都|都/.test(compact) || !cr.length) ? ['all'] : cr };
    }
    var selections = [];
    var bothRank = compact.match(/(?:两个|全部|全都|都).*(?:用|选|选择)第?(\d+|[一二两三四五六七八九十]+)个/);
    if (bothRank) {
      selections.push({ role: 'fullrange', pick: 'rank', rank: cnNumber(bothRank[1]) || 1 });
      selections.push({ role: 'sub', pick: 'rank', rank: cnNumber(bothRank[1]) || 1 });
    }
    ['fullrange', 'sub'].forEach(function (r) {
      var label = r === 'sub' ? '(?:超低|低音|sub)' : '(?:全频)';
      var stockRe = new RegExp(label + '.*库存最多');
      if (stockRe.test(compact)) selections.push({ role: r, pick: 'stock' });
      var rankRe = new RegExp(label + '(?:用|选|选择)?第?(\\d+|[一二两三四五六七八九十]+)个');
      var rm = compact.match(rankRe);
      if (rm) selections.push({ role: r, pick: 'rank', rank: cnNumber(rm[1]) || 1 });
      var modelRe = new RegExp(label + '(?:给我用|型号是|换成|改成|要|用|选|选择|型号|给|是)?' + modelTerm, 'i');
      var mm = compact.match(modelRe);
      if (mm && !/库存|第/.test(mm[1])) selections.push({ role: r, pick: 'model', query: mm[1] });
    });
    var modelOnly = selections.length ? null : compact.match(new RegExp('(?:用|选|选择|型号)?' + modelTerm + '$', 'i'));
    if (modelOnly) {
      var hitOnly = speakerTemplateMatch(modelOnly[1], '', false, templates);
      if (hitOnly) selections.push({ role: speakerTplRole(hitOnly.tpl), pick: 'model', query: modelOnly[1] });
    }
    if (selections.length) return { intent: 'select_templates', selections: selections };
    if (/功放|放大器|后级|dsp|DSP|处理器|调音台|调音臺|数字台|数位台|交换机|dante|Dante/.test(raw)) {
      return { intent: 'ignore_system_device', text: raw };
    }
    var bareCounts = unusedVoiceCounts(raw, []);
    if (bareCounts.length) return { intent: 'incomplete_count', counts: bareCounts, text: raw };
    var bareRoles = rolesFromText(raw);
    if (bareRoles.length) return { intent: 'incomplete_role', roles: bareRoles, text: raw };
    return { intent: 'unknown', text: raw };
  };

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
    /* 调音台输出侧不足兜底提示（含数量布局；只提示、不自动加台） */
    var mixShort = mixerShortage();
    var msg = '已创建 ' + added.length + ' 台设备并完成智能连接（⌘Z 一步撤销）';
    if (mixShort) msg += '；⚠ 调音台输出不足（需 ' + mixShort.need + ' 路仅 ' + mixShort.have +
      ' 路），部分下游未接，请手动加调音台或换更大型号';
    else if (left) msg += '；还有 ' + left + ' 只音响未接上（功放输出不足）';
    SP.toast(msg, !!(mixShort || left));
  }

  /* 画布上调音台输出是否喂不满下游：有 DSP 喂 DSP 输入，无 DSP 直推功放输入+有源音箱 */
  function mixerShortage() {
    var devs = Store.state.devices;
    var mixers = devs.filter(function (d) { return d.type === 'mixer'; });
    if (!mixers.length) return null;
    var dsps = devs.filter(function (d) { return d.type === 'dsp'; });
    var have = 0;
    mixers.forEach(function (m) { have += Store.visibleOuts(m).length; });
    var need;
    if (dsps.length) {
      need = dsps.reduce(function (a, d) { return a + d.inputs.length; }, 0);
    } else {
      var ampIns = devs.filter(function (d) { return d.type === 'amp'; })
        .reduce(function (a, d) { return a + d.inputs.length; }, 0);
      var activeN = devs.filter(function (d) {
        return d.type === 'speaker' && d.specs && d.specs.powered === 'active';
      }).length;
      need = ampIns + activeN;
    }
    return have < need ? { need: need, have: have } : null;
  }

  SP.openQuickLayout = function (opt) {
    opt = opt || {};
    var tpls = Store.state.deviceTemplates;
    var showActive = false;
    var mode = (opt.mode === 'reverse' || opt.command) ? 'reverse' : 'count';   /* count = 数量布局；reverse = 音响反推 */

    /* ================= 数量布局（count 页）HTML ================= */

    function tplOptions(def, selName) {
      var html = '';
      /* 功放列首项「智能配接」并默认选中：不点具体型号即按欧姆/功率自动配 */
      if (def.key === 'amp') {
        html += '<option value="auto"' + (selName ? '' : ' selected') + '>智能配接</option>';
      }
      tpls.forEach(function (t, i) {
        if (!catMatches(t, def)) return;
        var sel = selName && t.name === selName ? ' selected' : '';
        html += '<option value="' + i + '"' + sel + '>' + esc(t.name) +
          '（' + t.ins + '进' + outsOf(t) + '出' +
          (t.specs && t.specs.power ? ' · ' + t.specs.power + (def.key === 'amp' ? 'W@8Ω' : 'W') : '') +
          (def.key === 'amp' && t.specs && t.specs.power4 ? ' · ' + t.specs.power4 + 'W@4Ω' : '') +
          '）</option>';
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
    function pow4Tpl(t) { return powerNum(t.specs && t.specs.power4); }
    function ohmTpl(t) { return +(t.specs && t.specs.ohms) || 0; }
    /* auto=true 时首项为「智能配接」并默认选中（功放下拉用）；不点具体型号即自动配 */
    function rvSelect(id, type, chFilter, defName, auto) {
      var items = [];
      tpls.forEach(function (t, i) {
        if (t.type !== type) return;
        if (chFilter && t.ins !== chFilter) return;
        items.push({ t: t, idx: i, outs: outsOf(t) });
      });
      var selIdx = -1;
      if (!auto) {
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
      }
      var html = items.map(function (it, n) {
        var t = it.t;
        return '<option value="' + it.idx + '"' + (n === selIdx ? ' selected' : '') + '>' + esc(t.name) +
          '（' + t.ins + '进' + outsOf(t) + '出' +
          (t.specs && t.specs.power ? ' · ' + t.specs.power + 'W@8Ω' : '') +
          (t.specs && t.specs.power4 ? ' · ' + t.specs.power4 + 'W@4Ω' : '') + '）</option>';
      }).join('');
      var autoOpt = auto ? '<option value="auto" selected>智能配接（按欧姆/功率自动选）</option>' : '';
      return '<select id="' + id + '">' + autoOpt + (html || '<option value="">无可用模板</option>') + '</select>';
    }

    var rvRecentNames = SP._rvRecentSpeakerTemplates || (SP._rvRecentSpeakerTemplates = []);

    /* 组模型：支持同类多组（不同型号全频/超低同时入场）；active 组不参与功放反推 */
    function newGroup(role, active) {
      return { role: role, active: !!active, count: '', tplIdx: -1,
        name: '', power: '', ohms: '', parallel: 1,
        connectionMode: 'independent', unitsPerChannel: 1, parallelDraft: 0,
        status: 'selecting-template', aiExact: '' };
    }
    var rvGroups = [newGroup('fullrange', false), newGroup('sub', false)];
    var rvShowActive = false;
    var rvVoiceUndoStack = [];
    /* 功放「智能配接」状态即下拉 value==='auto'（选具体型号则固定），无需额外标志 */
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

    function normalizeRvGroup(g) {
      if (!g) return g;
      if (!g.connectionMode) g.connectionMode = (+g.parallel || 1) > 1 ? 'parallel' : 'independent';
      if (g.connectionMode !== 'parallel') g.connectionMode = 'independent';
      g.unitsPerChannel = Math.max(1, Math.min(4, +g.unitsPerChannel || +g.parallel || 1));
      g.parallel = g.connectionMode === 'parallel' ? g.unitsPerChannel : 1;
      if (!g.status) g.status = g.tplIdx >= 0 || +g.power ? 'pending-confirm' : 'selecting-template';
      return g;
    }
    function groupParallel(g, override) {
      if (override !== undefined) return Math.max(1, +override || 1);
      normalizeRvGroup(g);
      return (!g.active && g.connectionMode === 'parallel') ? Math.max(2, +g.unitsPerChannel || 2) : 1;
    }
    function markGroupDirty(g) {
      if (!g) return;
      g.status = (g.tplIdx >= 0 || +g.power) ? 'pending-confirm' : 'selecting-template';
    }
    function rememberTpl(t) {
      if (!t || !t.name) return;
      rvRecentNames = rvRecentNames.filter(function (n) { return n !== t.name; });
      rvRecentNames.unshift(t.name);
      if (rvRecentNames.length > 12) rvRecentNames.length = 12;
      SP._rvRecentSpeakerTemplates = rvRecentNames;
    }
    function applyTplToGroup(g, idx, exact) {
      if (!g) return false;
      g.tplIdx = +idx;
      g.aiExact = exact || g.aiExact || '';
      if (g.tplIdx >= 0 && tpls[g.tplIdx]) {
        var tp = tpls[g.tplIdx];
        g.power = String(powTpl(tp) || '');
        g.ohms = String((tp.specs && tp.specs.ohms) || '');
        g.name = '';
        g.status = 'pending-confirm';
        rememberTpl(tp);
        return true;
      }
      g.status = 'selecting-template';
      return false;
    }
    function rvTemplateItemsFor(g) {
      normalizeRvGroup(g);
      var need = Math.max(0, parseInt(g.count, 10) || 0);
      var exact = normToken(g.aiExact || '');
      var items = [];
      tpls.forEach(function (t, ti) {
        if (!speakerTplMatches(t, g.role, g.active)) return;
        var stock = tplStock(t);
        var enough = stock !== null && (!need || stock >= need);
        var hit = exact && normToken(t.name).indexOf(exact) >= 0;
        var recent = rvRecentNames.indexOf(t.name);
        items.push({ t: t, idx: ti, stock: stock, enough: enough, exact: !!hit,
          recent: recent >= 0 ? recent : 9999, orig: ti, power: powTpl(t) });
      });
      items.sort(function (a, b) {
        if (a.enough !== b.enough) return a.enough ? -1 : 1;
        if (a.exact !== b.exact) return a.exact ? -1 : 1;
        if (a.recent !== b.recent) return a.recent - b.recent;
        var as = a.stock === null ? -1 : a.stock;
        var bs = b.stock === null ? -1 : b.stock;
        if (as !== bs) return bs - as;
        return a.orig - b.orig;
      });
      return items;
    }
    function stockNoteHtml(item, g) {
      if (!item || item.stock === null) return '';
      var need = Math.max(0, parseInt(g.count, 10) || 0);
      if (need && item.stock < need) {
        return '<em class="rv-stock bad">库存' + item.stock + '只，需要' + need + '只</em>';
      }
      return '<em class="rv-stock">库存' + item.stock + '只</em>';
    }
    function rvTplOptionsFor(g, i) {
      var html = '<option value="-1"' + (g.tplIdx === -1 ? ' selected' : '') + '>（选择模板）</option>';
      rvTemplateItemsFor(g).forEach(function (it) {
        var t = it.t, ti = it.idx, w = it.power;
        html += '<option value="' + ti + '"' + (g.tplIdx === ti ? ' selected' : '') +
          (w ? '' : ' disabled') + '>' + esc(t.name) +
          (w ? '（' + w + 'W' + (t.specs.ohms ? '/' + t.specs.ohms + 'Ω' : '') + '）' : '（缺功率）') +
          (it.stock === null ? '' : ' · 库存' + it.stock + '只') +
          '</option>';
      });
      return html;
    }

    function rvTemplateChoicesHtml(g, i) {
      var items = rvTemplateItemsFor(g).slice(0, 6);
      if (!items.length) return '<div class="rv-tpl-list empty">暂无' + roleLabel(g.role) + '模板</div>';
      return '<div class="rv-tpl-list">' +
        '<div class="rv-tpl-title">' + (g.tplIdx >= 0 ? '可切换型号' : '请选择' + roleLabel(g.role) + '型号') + '</div>' +
        items.map(function (it) {
          var t = it.t, selected = g.tplIdx === it.idx;
          return '<button class="rv-tpl-chip' + (selected ? ' on' : '') + (it.power ? '' : ' disabled') + '"' +
            ' data-act="rv-pick-tpl" data-i="' + i + '" data-tpl="' + it.idx + '"' +
            (it.power ? '' : ' disabled') + ' title="' + esc(t.name) + '">' +
            '<b>' + esc(t.name) + '</b>' +
            '<span>' + (it.power ? it.power + 'W' + ((t.specs && t.specs.ohms) ? ' / ' + t.specs.ohms + 'Ω' : '') : '缺功率') + '</span>' +
            stockNoteHtml(it, g) + '</button>';
        }).join('') + '</div>';
    }
    function rvOneCalcLineHtml(g, i, par) {
      var row = groupData(g, i, par);
      if (!row.count || !row.power) return '<span class="muted">填写数量和型号后显示</span>';
      if (row.active) return '<span>有源占用 <b>' + row.count + '</b> 路线路输出</span>';
      var c = Store.reverseCalc([row], {
        ratio: rvRatio(),
        subRatio: rvSubRatio(),
        ampMode: (el('rv-ampmode') || {}).value || 'mix',
        amp2W: rvTpl('rv-amp2-tpl') ? powTpl(rvTpl('rv-amp2-tpl')) : 0,
        amp4W: rvTpl('rv-amp4-tpl') ? powTpl(rvTpl('rv-amp4-tpl')) : 0,
        amp2W4: rvTpl('rv-amp2-tpl') ? pow4Tpl(rvTpl('rv-amp2-tpl')) : 0,
        amp4W4: rvTpl('rv-amp4-tpl') ? pow4Tpl(rvTpl('rv-amp4-tpl')) : 0,
        minOhms: +((el('rv-minohm') || {}).value) || 4
      });
      if (c.errors.length) return '<span class="bad">' + esc(c.errors[0]) + '</span>';
      if (c.warns.length) return '<span class="bad">' + esc(c.warns[0]) + '</span>';
      var parts = c.rows[0] ? [reverseRowStatHtml(c.rows[0])] : [];
      if (c.amp2N) parts.push('2通道功放 ' + c.amp2N + ' 台');
      if (c.amp4N) parts.push('4通道功放 ' + c.amp4N + ' 台');
      if (c.dspN) parts.push('DSP ' + c.dspN + ' 台');
      return parts.join(' · ');
    }
    function rvGroupCalcHtml(g, i) {
      if (!g.count && g.tplIdx < 0 && !+g.power) return '';
      return '<div class="rv-mini-calc">' + rvOneCalcLineHtml(g, i) + '</div>';
    }
    function rvConnectionHtml(g, i) {
      if (g.active) return '';
      normalizeRvGroup(g);
      var draft = +g.parallelDraft ? Math.max(2, Math.min(4, +g.parallelDraft || 2)) : 0;
      var html = '<div class="rv-conn">' +
        '<div class="rv-conn-head"><span>接线方式</span><div class="seg rv-conn-seg">' +
        '<button data-act="rv-mode" data-mode="independent" data-i="' + i + '"' +
        (g.connectionMode === 'independent' ? ' class="on"' : '') + '>独立</button>' +
        '<button data-act="rv-mode" data-mode="parallel" data-i="' + i + '"' +
        (g.connectionMode === 'parallel' ? ' class="on"' : '') + '>并联串接</button>' +
        '</div></div>';
      if (g.connectionMode === 'parallel' && !draft) {
        html += '<div class="rv-conn-note">并联串接 ' + groupParallel(g) + ' 只 / 通道</div>';
      }
      if (draft) {
        html += '<div class="rv-par-preview">' +
          '<div class="rv-par-picks">' + [2, 3, 4].map(function (n) {
            return '<button class="btn ghost sm' + (draft === n ? ' on' : '') + '" data-act="rv-par-draft" data-i="' + i +
              '" data-units="' + n + '">' + n + '只</button>';
          }).join('') + '</div>' +
          '<div class="rv-par-compare"><b>独立</b><span>' + rvOneCalcLineHtml(g, i, 1) + '</span></div>' +
          '<div class="rv-par-compare after"><b>并联串接' + draft + '只</b><span>' + rvOneCalcLineHtml(g, i, draft) + '</span></div>' +
          '<div class="rv-par-actions"><button class="btn primary sm" data-act="rv-par-confirm" data-i="' + i + '">确认并联串接</button>' +
          '<button class="btn ghost sm" data-act="rv-par-cancel" data-i="' + i + '">保持独立</button></div>' +
          '</div>';
      }
      return html + '</div>';
    }
    function rvStatusHtml(g) {
      normalizeRvGroup(g);
      var cls = g.status === 'confirmed' ? ' ok' : (g.status === 'pending-confirm' ? ' warn' : '');
      var text = g.status === 'confirmed' ? '已确认' : (g.status === 'pending-confirm' ? '待确认' : '待选型号');
      return '<i class="rv-status' + cls + '">' + text + '</i>';
    }

    /* 一张卡：标题✕ / 数量 / 功率 / 阻抗 / 模板 / 并联 —— 全部打字输入，无加减按钮 */
    function rvCardHtml(g, i) {
      normalizeRvGroup(g);
      var usingTpl = g.tplIdx >= 0 && tpls[g.tplIdx];
      var t = usingTpl ? tpls[g.tplIdx] : null;
      var powerVal = usingTpl ? String(powTpl(t) || '') : g.power;
      var ohmsVal = usingTpl ? String((t.specs && t.specs.ohms) || '') : g.ohms;
      var ro = usingTpl ? ' readonly' : '';
      var canDel = rvGroups.filter(groupVisible).length > 1;
      var ratioNote = (!g.active && g.role === 'sub') ? '<i class="rv-tag-note">超低余量×' + rvSubRatio() + '</i>' : '';
      return '<div class="rv-card' + (g.active ? ' rv-active' : '') + (g.aiHit ? ' rv-ai-hit' : '') +
        '" data-rv-card="' + i + '">' +
        '<div class="rv-card-head"><span>' + esc(groupTitle(g, i)) +
        (g.active ? '<i class="rv-tag-note">不反推</i>' : ratioNote) + '</span>' + rvStatusHtml(g) +
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
        rvTemplateChoicesHtml(g, i) +
        rvConnectionHtml(g, i) +
        rvGroupCalcHtml(g, i) +
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

    var RV_AI_POS_KEY = 'signalpath.rvAiFloatPos';
    function rvAiSavedPos() {
      try { return JSON.parse(localStorage.getItem(RV_AI_POS_KEY) || 'null') || null; } catch (e) { return null; }
    }
    function rvAiFloatStyle() {
      var p = rvAiSavedPos();
      if (p && isFinite(+p.left) && isFinite(+p.top)) {
        return 'left:' + Math.max(8, +p.left) + 'px;top:' + Math.max(8, +p.top) + 'px;';
      }
      return 'right:18px;bottom:18px;';
    }
    function rvAiFloatHtml() {
      return '<div class="rv-ai-float is-active is-open" id="rv-ai-float" style="' + rvAiFloatStyle() + '">' +
        '<button class="rv-ai-orb" data-act="rv-ai-toggle" data-rv-ai-drag title="快捷指令">' +
        '<img class="rv-ai-img" alt="" hidden><span class="rv-ai-symbol">⚡</span><span class="rv-ai-pulse"></span></button>' +
        '<div class="rv-ai-pop">' +
        '<div class="rv-ai-title"><b>快捷指令</b><span>回车执行</span></div>' +
        '<div class="rv-ai-row"><input id="rv-ai-text" type="text" placeholder="我要6只206M，4只118S / 全频用第二个 / 两个都确认"></div>' +
        '<div class="rv-ai-hint" id="rv-ai-hint">输入数量+型号回车执行；匹配到模板后自动判断全频或超低。</div>' +
        '</div></div>';
    }

    /* 6：上下结构 —— 模板调用 / 参数 / 音响卡片 / 实时结果，避免右侧挤压 */
    var rvPane =
      '<div id="ql-pane-rv"' + (mode === 'reverse' ? '' : ' style="display:none"') + '><div class="rv-stack">' +
      '<div id="rv-preset-tools">' + reversePresetToolsHtml() + '</div>' +
      '<section class="rv-settings-panel">' +
      '<div class="insp-grid2">' +
      '<div class="cfg-field"><label>余量倍率（场景）</label>' +
      '<select id="rv-ratio">' +
      '<option value="1.2">1.2 · 会议人声</option>' +
      '<option value="1.5" selected>1.5 · 驻唱小场</option>' +
      '<option value="2">2 · 商演乐队</option>' +
      '<option value="3">3 · DJ摇滚</option>' +
      '<option value="4">4 · 电音超低</option>' +
      '<option value="custom">自定义…</option></select></div>' +
      '<div class="cfg-field" id="rv-ratio-custom-wrap" style="display:none"><label>自定义倍率</label>' +
      '<input type="text" inputmode="decimal" data-num id="rv-ratio-custom" value="1.5"></div>' +
      '<div class="cfg-field"><label>超低余量倍率</label>' +
      '<select id="rv-subratio">' +
      '<option value="2" selected>2 · 默认超低</option>' +
      '<option value="3">3 · 大动态超低</option>' +
      '<option value="4">4 · 电音超低</option>' +
      '<option value="custom">自定义…</option></select></div>' +
      '<div class="cfg-field" id="rv-subratio-custom-wrap" style="display:none"><label>超低自定义</label>' +
      '<input type="text" inputmode="decimal" data-num id="rv-subratio-custom" value="2"></div>' +
      '<div class="cfg-field"><label>功放最低负载</label>' +
      '<select id="rv-minohm"><option value="4" selected>4Ω（常规机型）</option>' +
      '<option value="2">2Ω（低阻机型）</option></select></div>' +
      '<div class="cfg-field"><label>功放使用模式</label>' +
      '<select id="rv-ampmode"><option value="mix" selected>搭配使用（4通道优先）</option>' +
      '<option value="2">只用 2 通道</option><option value="4">只用 4 通道</option></select></div>' +
      '<div class="cfg-field" id="rv-amp2-wrap"><label>2 通道功放模板' +
      '<em class="rv-auto-flag" id="rv-amp2-flag" hidden></em></label>' + rvSelect('rv-amp2-tpl', 'amp', 2, '', true) + '</div>' +
      '<div class="cfg-field" id="rv-amp4-wrap"><label>4 通道功放模板' +
      '<em class="rv-auto-flag" id="rv-amp4-flag" hidden></em></label>' + rvSelect('rv-amp4-tpl', 'amp', 4, '', true) + '</div>' +
      '<div class="cfg-field"><label>DSP 模板（默认 4进8出）</label>' + rvSelect('rv-dsp-tpl', 'dsp', 4) + '</div>' +
      '<div class="cfg-field"><label>调音台模板 / 数量</label><div style="display:flex;gap:6px">' +
      rvSelect('rv-mixer-tpl', 'mixer') +
      '<input type="text" inputmode="numeric" data-num id="rv-mixer-n" value="1" style="width:56px"></div></div>' +
      '</div>' +
      '</section>' +
      '<section class="rv-input-panel">' +
      '<p class="cfg-note ql-note">每组卡片：<b>数量 → 功率 → 阻抗</b> 竖排直接打字；' +
      '默认独立接线；并联串接需预览后确认；空格跳下一组数量格；Shift 展开有源。</p>' +
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
      '<button' + (mode === 'count' ? ' class="active"' : '') + ' data-ql-mode="count">数量布局</button>' +
      '<button' + (mode === 'reverse' ? ' class="active"' : '') + ' data-ql-mode="reverse">音响反推</button></div>' +
      '<div id="ql-pane-count"' + (mode === 'count' ? '' : ' style="display:none"') + '>' +
      '<div id="ql-preset-tools">' + countPresetToolsHtml() + '</div>' +
      '<p class="cfg-note ql-note" style="margin-top:0">依次输入 <b>调音台 · DSP · 功放 · 全频 · 超低</b> 的数量，回车创建并自动智能连接（一步可撤销）。</p>' +
      '<div class="ql-grid">' + CATS.map(catColumn).join('') + '</div>' +
      '<div class="insp-stats" id="ql-calc" style="display:block;margin-top:10px"></div>' +
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
      '<span class="foot-left" id="rv-foot-actions"' + (mode === 'reverse' ? '' : ' style="display:none"') + '>' +
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
    var rvAiDrag = null, rvAiSuppressClick = false;
    function rvAiFloat() { return el('rv-ai-float'); }
    function activateRvAi(openPanel) {
      var f = rvAiFloat();
      if (!f) return;
      f.classList.add('is-active');
      if (openPanel !== false) f.classList.add('is-open');
      if (openPanel !== false) {
        raf(function () {
          var inp = el('rv-ai-text');
          if (inp && inp.focus) inp.focus();
        });
      }
    }
    function toggleRvAi(openPanel) {
      var f = rvAiFloat();
      if (!f) return;
      f.classList.add('is-active');
      var open = openPanel === undefined ? !f.classList.contains('is-open') : !!openPanel;
      f.classList.toggle('is-open', open);
      if (open) activateRvAi(true);
    }
    function saveRvAiPos(left, top) {
      try { localStorage.setItem(RV_AI_POS_KEY, JSON.stringify({ left: Math.round(left), top: Math.round(top) })); } catch (e) {}
    }
    function moveRvAiFloat(left, top) {
      var f = rvAiFloat(), pane = el('ql-pane-rv') || box;
      if (!f || !pane) return;
      var maxLeft = Math.max(8, (pane.clientWidth || 900) - (f.offsetWidth || 300) - 8);
      var maxTop = Math.max(8, (pane.clientHeight || 560) - (f.offsetHeight || 80) - 8);
      left = Math.max(8, Math.min(maxLeft, left));
      top = Math.max(8, Math.min(maxTop, top));
      f.style.left = left + 'px';
      f.style.top = top + 'px';
      f.style.right = 'auto';
      f.style.bottom = 'auto';
      return { left: left, top: top };
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
      qlCalcShow();
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
      qlCalcShow();
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
      qlCalcShow();
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

    function qlSelectedTpl(key) {
      var sel = box.querySelector('[data-ql-tpl="' + key + '"]');
      if (!sel || sel.value === '' || sel.value === 'auto') return null;
      return tpls[+sel.value];
    }
    function qlCountOf(def) {
      var inp = box.querySelector('[data-ql-count="' + CATS.indexOf(def) + '"]');
      return Math.max(0, Math.min(128, parseInt(inp && inp.value, 10) || 0));
    }
    function qlBuildAutoPlan() {
      var passive = [], activeRows = [];
      var mixerTpl = null, dspTpl = null, mixerCount = 0, dspCount = 0;
      CATS.forEach(function (def) {
        if (def.soon) return;
        var n = qlCountOf(def);
        if (!n) return;
        var t = qlSelectedTpl(def.key);
        if (def.key === 'mixer') { mixerTpl = t; mixerCount = t ? n : 0; return; }
        if (def.key === 'dsp') { dspTpl = t; dspCount = t ? n : 0; return; }
        if (!t || def.type !== 'speaker') return;
        if (def.active) activeRows.push({ tpl: t, count: n });
        else passive.push({ tpl: t, name: t.name, power: powTpl(t), ohms: ohmTpl(t),
          count: n, parallel: 1, role: def.role });
      });
      var calc = Store.reverseCalc(passive, {
        ratio: 1.5, subRatio: 2, ampMode: 'mix', minOhms: 4,
        dspOuts: dspTpl ? outsOf(dspTpl) : 8,
        activeCount: activeRows.reduce(function (a, r) { return a + r.count; }, 0)
      });
      var speakerRows = [], ampWarns = [];
      calc.rows.forEach(function (row, i) {
        var src = passive[i];
        var choice = autoAmpChoice(row);
        var ch = choice.channels || 4;
        if (!choice.tpl) ampWarns.push(row.name + '：模板库暂无可用功放');
        else if (!choice.fit) ampWarns.push(row.name + '：未找到完全满足功率/负载的功放，暂用 ' + choice.tpl.name);
        speakerRows.push({
          tpl: src.tpl, count: src.count, parallel: src.parallel,
          a2: ch === 2 ? Math.ceil(row.ch / 2) : 0,
          a4: ch === 4 ? Math.ceil(row.ch / 4) : 0,
          amp2Tpl: ch === 2 ? choice.tpl : null,
          amp4Tpl: ch === 4 ? choice.tpl : null,
          calcRow: row, ampTpl: choice.tpl, ampChannels: ch
        });
      });
      return { passive: passive, activeRows: activeRows, calc: calc, speakerRows: speakerRows,
        mixerTpl: mixerTpl, mixerCount: mixerCount, dspTpl: dspTpl, dspCount: dspCount,
        ampWarns: ampWarns };
    }
    function qlCalcShow() {
      var host = el('ql-calc');
      if (!host) return;
      var ampSel = box.querySelector('[data-ql-tpl="amp"]');
      if (!ampSel || ampSel.value !== 'auto') {
        host.innerHTML = '<span class="insp-stat">功放已固定型号，创建后按现有智能连接规则接线</span>';
        return;
      }
      var plan = qlBuildAutoPlan();
      if (!plan.passive.length && !plan.activeRows.length) {
        host.innerHTML = '<span class="insp-stat">填写无源音响数量后自动显示单通道功率和功放配接</span>';
        return;
      }
      var parts = [];
      plan.calc.rows.forEach(function (row, i) {
        var boosted = row.loadOhm && Math.abs(row.loadOhm - 8) > 0.01;
        var sp = plan.speakerRows[i] || {};
        parts.push('<span class="insp-stat' + (boosted ? ' rv-boost' : '') + '">' +
          reverseRowStatHtml(row) +
          (sp.ampTpl ? ' · ' + esc(sp.ampTpl.name) + ' ×' + ((sp.a4 || 0) + (sp.a2 || 0)) + '台' : '') +
          '</span>');
      });
      if (plan.activeRows.length) {
        var activeN = plan.activeRows.reduce(function (a, r) { return a + r.count; }, 0);
        parts.push('<span class="insp-stat rv-active">有源占用 <b>' + activeN + '</b> 路线路输出（不配功放）</span>');
      }
      plan.calc.warns.concat(plan.ampWarns).forEach(function (w) {
        parts.push('<span class="insp-stat" style="color:var(--red);border-color:var(--red)">⚠ ' + esc(w) + '</span>');
      });
      plan.calc.errors.forEach(function (w) {
        parts.push('<span class="insp-stat" style="color:var(--red);border-color:var(--red)">✕ ' + esc(w) + '</span>');
      });
      host.innerHTML = parts.join('');
    }

    /* ================= 反推：数据与计算 ================= */

    function rvTpl(id) {
      var sel = el(id);
      if (!sel || sel.value === '' || sel.value === 'auto') return null;
      return tpls[+sel.value];
    }
    function rvIsAuto(id) {
      var sel = el(id);
      return !sel || sel.value === 'auto';
    }
    function rvRatio() {
      var sel = el('rv-ratio');
      if (sel && sel.value === 'custom') {
        return Math.max(1, +((el('rv-ratio-custom') || {}).value) || 1.5);
      }
      return +((sel && sel.value) || 1.5);
    }
    function rvSubRatio() {
      var sel = el('rv-subratio');
      if (sel && sel.value === 'custom') {
        return Math.max(1, +((el('rv-subratio-custom') || {}).value) || 2);
      }
      return +((sel && sel.value) || 2);
    }
    function groupData(g, idx, overrideParallel) {
      normalizeRvGroup(g);
      var count = Math.max(0, parseInt(g.count, 10) || 0);
      if (g.tplIdx >= 0 && tpls[g.tplIdx]) {
        var t = tpls[g.tplIdx];
        return { name: t.name, power: powTpl(t), ohms: +(t.specs && t.specs.ohms) || 0,
          count: count, parallel: g.active ? 1 : groupParallel(g, overrideParallel), tpl: t,
          role: g.role, active: g.active };
      }
      /* 未填名称时用与卡片一致的「类型+编号」（全频① / 超低②…），不再出现“手填音响” */
      var fallback = groupTitle(g, idx !== undefined ? idx : rvGroups.indexOf(g));
      return { name: g.name || fallback,
        power: +g.power || 0, ohms: +g.ohms || 0,
        count: count, parallel: g.active ? 1 : groupParallel(g, overrideParallel), tpl: null,
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
    /* 达标所需 8Ω 标称功率（各无源组 needRatedW 的最大值，含并联/阻抗换算） */
    function rvNeedProfile(rows) {
      var probe = Store.reverseCalc(rows, {
        ratio: rvRatio(), subRatio: rvSubRatio(), ampMode: 'mix',
        minOhms: +((el('rv-minohm') || {}).value) || 4
      });
      var best = { needRatedW: 0, needW: 0, needLoadW: 0, loadOhm: 0 };
      probe.rows.forEach(function (r) {
        var w = r.needRatedW || r.needW || 0;
        if (w > best.needRatedW) {
          best = { needRatedW: w, needW: r.needW || 0, needLoadW: r.needLoadW || 0, loadOhm: r.loadOhm || 0 };
        }
      });
      return best;
    }
    /* 智能配接 or 手动固定：返回 {tpl, auto} */
    function rvResolveAmp(id, channels, needProfile) {
      if (rvIsAuto(id)) {
        return { tpl: Store.pickAmpTemplate(tpls, {
          channels: channels,
          needRatedW: needProfile.needRatedW,
          needW: needProfile.needW,
          needLoadW: needProfile.needLoadW,
          loadOhm: needProfile.loadOhm
        }), auto: true };
      }
      return { tpl: rvTpl(id), auto: false };
    }
    function rvCompute() {
      var rows = rvPassiveRows();
      var actRows = rvActiveRows();
      var activeCount = actRows.reduce(function (a, r) { return a + r.count; }, 0);
      var ampMode = (el('rv-ampmode') || {}).value || 'mix';
      var needProfile = rvNeedProfile(rows);
      var a2 = rvResolveAmp('rv-amp2-tpl', 2, needProfile);
      var a4 = rvResolveAmp('rv-amp4-tpl', 4, needProfile);
      var amp2 = a2.tpl, amp4 = a4.tpl;
      var dspT = rvTpl('rv-dsp-tpl'), mixT = rvTpl('rv-mixer-tpl');
      var mixN = Math.max(0, parseInt((el('rv-mixer-n') || {}).value, 10) || 0);
      var calc = Store.reverseCalc(rows, {
        ratio: rvRatio(),
        subRatio: rvSubRatio(),
        ampMode: ampMode,
        amp2W: amp2 ? powTpl(amp2) : 0,
        amp4W: amp4 ? powTpl(amp4) : 0,
        amp2W4: amp2 ? pow4Tpl(amp2) : 0,
        amp4W4: amp4 ? pow4Tpl(amp4) : 0,
        minOhms: +((el('rv-minohm') || {}).value) || 4,
        dspOuts: dspT ? outsOf(dspT) : 0,   /* 无 DSP 模板 = 直推，不建 DSP */
        dspIns: dspT ? dspT.ins : 0,
        activeCount: activeCount
      });
      return { rows: rows, activeRows: actRows, activeCount: activeCount, calc: calc,
        ampMode: ampMode, amp2: amp2, amp4: amp4, amp2Auto: a2.auto, amp4Auto: a4.auto,
        needRated: needProfile.needRatedW, ratio: rvRatio(), subRatio: rvSubRatio(),
        dspT: dspT, mixT: mixT, mixN: mixN };
    }

    function reverseRowStatHtml(row) {
      var name = esc(row.name) + (row.par > 1 ? '（并联' + row.par + '只）' : '');
      var load = +row.loadOhm || 8;
      var specialLoad = Math.abs(load - 8) > 0.01;
      var notes = [];
      if (specialLoad) notes.push(load + 'Ω 负载');
      if (row.ratio) notes.push((row.role === 'sub' ? '超低余量×' : '余量×') + row.ratio);
      if (row.factor) notes.push('折算系数×' + Math.round(row.factor * 100) / 100);
      return name + '：单通道需 <b>≥' + (row.needRatedW || row.needW) + 'W</b>' +
        (specialLoad ? '@8Ω' : '/通道') +
        (notes.length ? '（' + notes.join('，') + '）' : '') +
        ' 共' + row.count + '只 占 ' + row.ch + ' 路';
    }

    function reverseActiveNeedW(rows, ratio, subRatio) {
      return (rows || []).reduce(function (sum, row) {
        var rr = row.role === 'sub' ? (subRatio || ratio || 1) : (ratio || 1);
        return sum + Math.ceil((+row.power || 0) * (+row.count || 0) * rr);
      }, 0);
    }
    function reverseTotalStatHtml(calc, activeRows, ratio, subRatio) {
      var passive = calc.totalNeedW || (calc.rows || []).reduce(function (sum, row) {
        return sum + (row.needRatedW || row.needW || 0) * (row.ch || 0);
      }, 0);
      var active = reverseActiveNeedW(activeRows, ratio, subRatio);
      var total = Math.ceil(passive + active);
      if (!total) return '';
      var detail = active ? '（无源功放 ' + passive + 'W + 有源音响 ' + active + 'W）' : '（所有通道合计）';
      return '总功率 <b>≥' + total + 'W</b>' + detail;
    }

    function ampFitsRow(t, row) {
      if (!t || !row) return false;
      var minOhm = +(t.specs && t.specs.ohms) || 4;
      if (row.loadOhm && row.loadOhm < minOhm) return false;
      return Store.ampRatedEquivalentPower(t.specs || {}, row.loadOhm) >= (row.needRatedW || row.needW || 0);
    }
    function pickAmpForRow(channels, row) {
      return Store.pickAmpTemplate(tpls, {
        channels: channels,
        needRatedW: row.needRatedW,
        needW: row.needW,
        needLoadW: row.needLoadW,
        loadOhm: row.loadOhm
      });
    }
    function autoAmpChoice(row) {
      var a4 = pickAmpForRow(4, row);
      var a2 = pickAmpForRow(2, row);
      if (ampFitsRow(a4, row)) return { tpl: a4, channels: 4, fit: true };
      if (ampFitsRow(a2, row)) return { tpl: a2, channels: 2, fit: true };
      if (a4) return { tpl: a4, channels: 4, fit: false };
      if (a2) return { tpl: a2, channels: 2, fit: false };
      return { tpl: null, channels: 0, fit: false };
    }

    /* 智能配接时，在标签处显示解析到的实际型号 */
    function rvShowAmpAutoFlag(r) {
      function upd(flagId, wrapId, auto, tpl) {
        var flag = el(flagId), wrap = el(wrapId);
        var visible = wrap && (!wrap.hidden);
        if (!flag) return;
        if (auto && visible) {
          flag.hidden = false;
          flag.textContent = tpl ? '→ ' + tpl.name : '（模板库暂无功放）';
        } else {
          flag.hidden = true;
        }
      }
      upd('rv-amp2-flag', 'rv-amp2-wrap', r.amp2Auto, r.amp2);
      upd('rv-amp4-flag', 'rv-amp4-wrap', r.amp4Auto, r.amp4);
    }

    function rvCalcShow() {
      var host = el('rv-calc');
      if (!host) return;
      var r = rvCompute();
      rvShowAmpAutoFlag(r);
      var c = r.calc;
      var act = r.activeRows || [];
      if (!c.rows.length && !c.errors.length && !act.length) {
        host.innerHTML = '<span class="insp-stat">填写各组数量后自动反推</span>';
        return;
      }
      var parts = [];
      c.rows.forEach(function (row) {
        var boosted = row.loadOhm && Math.abs(row.loadOhm - 8) > 0.01;
        parts.push('<span class="insp-stat' + (boosted ? ' rv-boost' : '') + '">' +
          reverseRowStatHtml(row) + '</span>');
      });
      if (c.amp2N) parts.push('<span class="insp-stat">2通道功放 <b>' + c.amp2N + '</b> 台</span>');
      if (c.amp4N) parts.push('<span class="insp-stat">4通道功放 <b>' + c.amp4N + '</b> 台</span>');
      if (r.activeCount) {
        parts.push('<span class="insp-stat rv-active">有源占用 <b>' + r.activeCount + '</b> 路线路输出（不反推功放）</span>');
      }
      if (c.dspN) parts.push('<span class="insp-stat">DSP <b>' + c.dspN + '</b> 台</span>');
      /* 调音台输出侧不足：有 DSP 时喂满全部 DSP 输入，无 DSP 时直推功放+有源。
         只提示、不自动加台（型号/数量仍手动填） */
      if (c.mixerFeeds) {
        var mixOuts = r.mixT ? outsOf(r.mixT) * Math.max(1, r.mixN) : 0;
        if (mixOuts < c.mixerFeeds) {
          parts.push('<span class="insp-stat" style="color:var(--red);border-color:var(--red)">⚠ 调音台输出不足：需 ' +
            c.mixerFeeds + ' 路' + (c.dspN ? '（喂 ' + c.dspN + ' 台 DSP）' : '') +
            '，仅 ' + mixOuts + ' 路，请手动增加调音台数量或换更大型号</span>');
        }
      }
      c.warns.forEach(function (w) {
        parts.push('<span class="insp-stat" style="color:var(--red);border-color:var(--red)">' + esc(w) + '</span>');
      });
      c.errors.forEach(function (w) {
        parts.push('<span class="insp-stat" style="color:var(--red);border-color:var(--red)">✕ ' + esc(w) + '</span>');
      });
      var totalHtml = reverseTotalStatHtml(c, act, r.ratio || rvRatio(), r.subRatio || rvSubRatio());
      if (totalHtml) parts.push('<span class="insp-stat rv-total">' + totalHtml + '</span>');
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
        normalizeRvGroup(g);
        rows.push({ role: g.role, active: g.active, tplName: t ? t.name : '',
          name: g.name, power: g.power, ohms: g.ohms, count: g.count,
          parallel: groupParallel(g), connectionMode: g.connectionMode,
          unitsPerChannel: g.unitsPerChannel, status: g.status });
      });
      return {
        rows: rows,
        ratio: ratioSel ? ratioSel.value : '1.5',
        ratioCustom: (el('rv-ratio-custom') || {}).value || '1.5',
        subRatio: (el('rv-subratio') || {}).value || '2',
        subRatioCustom: (el('rv-subratio-custom') || {}).value || '2',
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
          g.connectionMode = r.connectionMode || (g.parallel > 1 ? 'parallel' : 'independent');
          g.unitsPerChannel = Math.max(1, +r.unitsPerChannel || g.parallel || 1);
          g.status = r.status || (g.tplIdx >= 0 || +g.power ? 'pending-confirm' : 'selecting-template');
          normalizeRvGroup(g);
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
      if (el('rv-subratio')) el('rv-subratio').value = d.subRatio || '2';
      if (el('rv-subratio-custom')) el('rv-subratio-custom').value = d.subRatioCustom || '2';
      if (el('rv-minohm')) el('rv-minohm').value = d.minOhms || '4';
      if (el('rv-ampmode')) el('rv-ampmode').value = d.ampMode || 'mix';
      if (el('rv-mixer-n')) el('rv-mixer-n').value = d.mixerN || '1';
      /* 快照带功放名 = 固定该型号；没带 = 回到「智能配接」 */
      if (el('rv-amp2-tpl')) el('rv-amp2-tpl').value = 'auto';
      if (el('rv-amp4-tpl')) el('rv-amp4-tpl').value = 'auto';
      if (d.amp2Name) setSelectByTplName('rv-amp2-tpl', d.amp2Name);
      if (d.amp4Name) setSelectByTplName('rv-amp4-tpl', d.amp4Name);
      setSelectByTplName('rv-dsp-tpl', d.dspName);
      setSelectByTplName('rv-mixer-tpl', d.mixerName);
      if (el('rv-ratio-custom-wrap')) {
        el('rv-ratio-custom-wrap').style.display = (el('rv-ratio') || {}).value === 'custom' ? '' : 'none';
      }
      if (el('rv-subratio-custom-wrap')) {
        el('rv-subratio-custom-wrap').style.display = (el('rv-subratio') || {}).value === 'custom' ? '' : 'none';
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
        subRatio: (el('rv-subratio') || {}).value || '2',
        subRatioCustom: (el('rv-subratio-custom') || {}).value || '2',
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

    function rvGroupsAreBlank() {
      return !rvGroups.some(function (g) {
        return (parseInt(g.count, 10) || 0) || g.tplIdx >= 0 || g.name || +g.power || +g.ohms;
      });
    }
    function cloneRvGroups(groups) {
      return JSON.parse(JSON.stringify(groups || []));
    }
    function pushRvVoiceUndo() {
      rvVoiceUndoStack.push({ groups: cloneRvGroups(rvGroups), showActive: rvShowActive });
      if (rvVoiceUndoStack.length > 30) rvVoiceUndoStack.shift();
    }
    function restoreRvVoiceSnapshot(s) {
      if (!s) return false;
      rvGroups = cloneRvGroups(s.groups);
      rvShowActive = !!s.showActive;
      refreshRvCards();
      return true;
    }
    function parsedTplIndex(pg) {
      var q = pg.templateQuery || pg.templateName || pg.templateId || '';
      if (!q) return -1;
      var active = pg.active === undefined ? undefined : !!pg.active;
      for (var i = 0; i < tpls.length; i++) {
        var t = tpls[i];
        if (!speakerTplMatches(t, pg.role, active)) continue;
        if ((pg.templateId && (t.tplId === pg.templateId || t.name === pg.templateId)) ||
            (pg.templateName && t.name === pg.templateName)) return i;
      }
      var hit = speakerTemplateMatch(q, pg.role, active, tpls);
      return hit ? hit.idx : -1;
    }
    function applyParsedConnection(g, pg) {
      if (!g || g.active || pg.connectionMode !== 'parallel') return;
      g.connectionMode = 'parallel';
      g.unitsPerChannel = Math.max(2, Math.min(4, +pg.unitsPerChannel || 2));
      g.parallel = g.unitsPerChannel;
      g.parallelDraft = 0;
    }
    function groupFromParsed(pg) {
      var g = newGroup(pg.role || 'fullrange', !!pg.active);
      g.count = String(pg.count || '');
      g.aiExact = pg.templateQuery || pg.templateName || '';
      g.aiHit = true;
      var idx = parsedTplIndex(pg);
      if (idx >= 0) applyTplToGroup(g, idx, g.aiExact);
      else g.status = 'selecting-template';
      applyParsedConnection(g, pg);
      normalizeRvGroup(g);
      return g;
    }
    function setAiHint(msg, bad) {
      var h = el('rv-ai-hint');
      if (h) {
        h.textContent = msg;
        h.classList.toggle('bad', !!bad);
      }
      if (!h && msg) SP.toast(msg, !!bad);
    }
    function firstEditableGroup(role, active) {
      var hasActive = active !== undefined;
      var list = rvGroups.filter(function (g) { return g.role === role && (hasActive ? g.active === !!active : !g.active); });
      if (!list.length) {
        var g = newGroup(role, !!active);
        rvGroups.push(g);
        if (active) rvShowActive = true;
        return g;
      }
      return list.filter(function (g) { return g.status !== 'confirmed'; })[0] || list[0];
    }
    function applyCreateSpeakerGroups(cmd) {
      var next = (cmd.groups || []).map(groupFromParsed);
      if (!next.length) { setAiHint('没有识别到全频或超低数量', true); return; }
      if (next.some(function (g) { return g.active; })) rvShowActive = true;
      if (cmd.mode === 'modify') {
        next.forEach(function (ng) {
          var g = firstEditableGroup(ng.role, ng.active);
          g.count = ng.count;
          g.aiHit = true;
          g.aiExact = ng.aiExact || g.aiExact || '';
          if (ng.tplIdx >= 0) applyTplToGroup(g, ng.tplIdx, ng.aiExact);
          else markGroupDirty(g);
          applyParsedConnection(g, ng);
        });
      } else if (cmd.mode === 'replace' && rvGroupsAreBlank()) {
        rvGroups = next;
      } else {
        rvGroups = rvGroups.concat(next);
      }
      refreshRvCards('data-rv-cnt', rvGroups.length - 1);
      var msg = '收到，先记下 ' + next.map(function (g) {
        return (g.active ? '有源' : '') + roleLabel(g.role) + ' ' + g.count + '只';
      }).join('、') + '。';
      if (cmd.missingCounts && cmd.missingCounts.length) {
        msg += ' 后面的 ' + cmd.missingCounts.join('、') + '只还差类型或型号，请继续说。';
      } else if (next.some(function (g) { return g.tplIdx < 0; })) {
        msg += ' 接下来告诉我型号就行。';
      } else {
        msg += ' 信息齐啦，可以继续补充或确认。';
      }
      setAiHint(msg);
    }
    function targetGroupsForSelection(sel) {
      var roles = sel.role === 'all' ? ['fullrange', 'sub'] : [sel.role];
      return roles.map(firstEditableGroup);
    }
    function applySelectionToGroup(g, sel) {
      if (!g) return false;
      var idx = -1;
      if (sel.pick === 'rank') {
        var ranked = rvTemplateItemsFor(g);
        idx = ranked[(sel.rank || 1) - 1] ? ranked[(sel.rank || 1) - 1].idx : -1;
      } else if (sel.pick === 'stock') {
        var stockItems = rvTemplateItemsFor(g).filter(function (it) { return it.stock !== null; });
        idx = stockItems[0] ? stockItems[0].idx : -1;
      } else if (sel.pick === 'model') {
        var hit = speakerTemplateMatch(sel.query, g.role, g.active, tpls);
        idx = hit ? hit.idx : -1;
        g.aiExact = sel.query || '';
      }
      if (idx < 0) return false;
      g.aiHit = true;
      return applyTplToGroup(g, idx, sel.query || g.aiExact);
    }
    function applySelectTemplates(cmd) {
      var ok = 0;
      (cmd.selections || []).forEach(function (sel) {
        targetGroupsForSelection(sel).forEach(function (g) {
          if (applySelectionToGroup(g, sel)) ok++;
        });
      });
      refreshRvCards();
      setAiHint(ok ? '已选择 ' + ok + ' 组型号，反推结果已刷新。' : '没有匹配到可用型号，请在候选型号里点选。', !ok);
    }
    function groupConfirmIssue(g, i) {
      normalizeRvGroup(g);
      if (!parseInt(g.count, 10)) return groupTitle(g, i) + '：请先填写数量';
      if (g.tplIdx < 0) return groupTitle(g, i) + '：请先选择型号';
      if (g.parallelDraft) return groupTitle(g, i) + '：并联预览还未确认';
      var t = tpls[g.tplIdx], st = tplStock(t), need = parseInt(g.count, 10) || 0;
      if (st !== null && need > st) return groupTitle(g, i) + '：库存' + st + '只，需要' + need + '只';
      if (g.active) return '';
      var row = groupData(g, i);
      var c = Store.reverseCalc([row], {
        ratio: rvRatio(), subRatio: rvSubRatio(),
        ampMode: (el('rv-ampmode') || {}).value || 'mix',
        minOhms: +((el('rv-minohm') || {}).value) || 4
      });
      return c.errors[0] || c.warns[0] || '';
    }
    function confirmRvGroups(roles) {
      var all = roles.indexOf('all') >= 0;
      var targets = rvGroups.map(function (g, i) { return { g: g, i: i }; })
        .filter(function (x) { return groupVisible(x.g) && (all || roles.indexOf(x.g.role) >= 0); });
      if (!targets.length) { setAiHint('没有可确认的音响组', true); return; }
      for (var k = 0; k < targets.length; k++) {
        var issue = groupConfirmIssue(targets[k].g, targets[k].i);
        if (issue) { setAiHint(issue, true); return; }
      }
      targets.forEach(function (x) { x.g.status = 'confirmed'; });
      refreshRvCards();
      setAiHint('已确认 ' + targets.length + ' 组音响。');
    }
    function applyConnectionCommand(cmd) {
      var roles = (cmd.roles && cmd.roles.length) ? cmd.roles : ['fullrange', 'sub'];
      var units = Math.max(2, Math.min(4, +cmd.units || 2));
      var n = 0;
      rvGroups.forEach(function (g) {
        if (g.active || roles.indexOf(g.role) < 0) return;
        g.parallelDraft = units;
        markGroupDirty(g);
        n++;
      });
      refreshRvCards();
      setAiHint(n ? '已生成并联串接' + units + '只/通道预览，请确认后生效。' : '没有可并联串接的无源音响组', !n);
    }
    function confirmParallelDrafts() {
      var n = 0;
      rvGroups.forEach(function (g) {
        if (g.active || !g.parallelDraft) return;
        g.connectionMode = 'parallel';
        g.unitsPerChannel = Math.max(2, Math.min(4, +g.parallelDraft || 2));
        g.parallel = g.unitsPerChannel;
        g.parallelDraft = 0;
        markGroupDirty(g);
        n++;
      });
      refreshRvCards();
      setAiHint(n ? '已确认 ' + n + ' 组并联串接设置。' : '当前没有待确认的并联串接预览', !n);
    }
    function undoLastVoiceStep() {
      var last = rvVoiceUndoStack.pop();
      if (last && restoreRvVoiceSnapshot(last)) {
        setAiHint('已撤销刚刚那一步，可以继续说新的需求。');
        return true;
      }
      if (Store.undo && Store.undo()) {
        SP.renderAll();
        setAiHint('已撤销上一步。');
        return true;
      }
      setAiHint('现在没有可撤销的步骤啦。', true);
      return false;
    }
    function applySpeakerVoiceCommand(text) {
      var cmd = SP.parseSpeakerVoiceCommand(text, { templates: tpls });
      if (cmd.intent === 'undo_last') undoLastVoiceStep();
      else if (cmd.intent === 'create_speaker_groups') { pushRvVoiceUndo(); applyCreateSpeakerGroups(cmd); }
      else if (cmd.intent === 'select_templates') { pushRvVoiceUndo(); applySelectTemplates(cmd); }
      else if (cmd.intent === 'confirm_groups') { pushRvVoiceUndo(); confirmRvGroups(cmd.roles || ['all']); }
      else if (cmd.intent === 'set_connection_mode') { pushRvVoiceUndo(); applyConnectionCommand(cmd); }
      else if (cmd.intent === 'confirm_connection_mode') { pushRvVoiceUndo(); confirmParallelDrafts(); }
      else if (cmd.intent === 'incomplete_count') {
        setAiHint('收到，先记下 ' + (cmd.counts || []).join('、') + '只。还差类型或型号，请继续说。', true);
      } else if (cmd.intent === 'incomplete_role') {
        setAiHint('好，听到' + (cmd.roles || []).map(roleLabel).join('、') + '了，还需要几只呢？', true);
      } else if (cmd.intent === 'ignore_system_device') {
        setAiHint('功放、DSP、调音台先保持智能选配；请继续告诉我音响数量、类型或型号。');
      } else setAiHint('这句有点糊，再说一次就好。可以说：我要8只全频，4只超低。', true);
      return cmd;
    }
    SP.applySpeakerVoiceCommand = applySpeakerVoiceCommand;

    function syncAmpModeUI() {
      var m = (el('rv-ampmode') || {}).value || 'mix';
      if (el('rv-amp2-wrap')) el('rv-amp2-wrap').style.display = m === '4' ? 'none' : '';
      if (el('rv-amp4-wrap')) el('rv-amp4-wrap').style.display = m === '2' ? 'none' : '';
    }

    /* ================= 创建 ================= */

    function confirm2() {
      if (mode === 'reverse') {
        var r = rvCompute();   /* 智能配接在 rvCompute 内已解析为具体功放 */
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
      /* 收集各列：功放列默认「智能配接」，按无源音箱功率/阻抗/通道自动解析 */
      var picks = [], ampAuto = null, passiveRows = [];
      var ampSel0 = box.querySelector('[data-ql-tpl="amp"]');
      var ampWantsAuto = ampSel0 && ampSel0.value === 'auto';
      CATS.forEach(function (def, i) {
        if (def.soon) return;
        var inp = box.querySelector('[data-ql-count="' + i + '"]');
        var n = Math.max(0, Math.min(128, parseInt(inp && inp.value, 10) || 0));
        if (!n) return;
        var sel = box.querySelector('[data-ql-tpl="' + def.key + '"]');
        var val = sel ? sel.value : '';
        if (def.key === 'amp' && val === 'auto') { ampAuto = { count: n }; return; }
        var t = val !== '' && val !== 'auto' ? tpls[+val] : null;
        if (!t) return;
        if (def.type === 'speaker' && !def.active) {
          passiveRows.push({ name: t.name, power: powTpl(t), ohms: ohmTpl(t),
            count: n, parallel: 1, role: def.role });
        }
        picks.push({ tpl: t, count: n, powered: def.active ? 'active' : 'passive' });
      });
      if (ampWantsAuto && passiveRows.length && !ampAuto) {
        var plan = qlBuildAutoPlan();
        if (plan.calc.errors.length) { SP.toast(plan.calc.errors[0], true); return; }
        var missAmp = plan.speakerRows.filter(function (r) { return !r.ampTpl; });
        if (missAmp.length) { SP.toast(missAmp[0].calcRow.name + '：模板库暂无可用功放', true); return; }
        var addedAuto = Store.reverseLayout({
          mixerTpl: plan.mixerTpl, mixerCount: plan.mixerCount,
          dspTpl: plan.dspTpl, dspCount: plan.dspCount,
          speakerRows: plan.speakerRows,
          activeRows: plan.activeRows
        });
        afterCreate(addedAuto);
        var warnAuto = plan.calc.warns.concat(plan.ampWarns)[0];
        if (warnAuto) setTimeout(function () { SP.toast(warnAuto, true); }, 2800);
        return;
      }
      if (ampWantsAuto) {
        var calcAuto = Store.reverseCalc(passiveRows, {
          ratio: 1.5, subRatio: 2, ampMode: 'mix', minOhms: 4
        });
        var profile = { needRatedW: 0, needW: 0, needLoadW: 0, loadOhm: 0 };
        (calcAuto.rows || []).forEach(function (r) {
          var w = r.needRatedW || r.needW || 0;
          if (w > profile.needRatedW) profile = {
            needRatedW: w, needW: r.needW || 0, needLoadW: r.needLoadW || 0, loadOhm: r.loadOhm || 0
          };
        });
        function pickCountAmp(channels) {
          return Store.pickAmpTemplate(tpls, {
            channels: channels || 0,
            needRatedW: profile.needRatedW,
            needW: profile.needW,
            needLoadW: profile.needLoadW,
            loadOhm: profile.loadOhm
          }) || (channels ? Store.pickAmpTemplate(tpls, {
            needRatedW: profile.needRatedW,
            needW: profile.needW,
            needLoadW: profile.needLoadW,
            loadOhm: profile.loadOhm
          }) : null);
        }
        if (ampAuto && ampAuto.count) {
          var avgCh = calcAuto.channels ? Math.ceil(calcAuto.channels / ampAuto.count) : 0;
          var chPref = avgCh > 2 ? 4 : avgCh ? 2 : 0;
          var ampT = pickCountAmp(chPref);
          if (!ampT) { SP.toast('模板库暂无功放，无法智能配接（请先在模板库新建功放）', true); return; }
          picks.push({ tpl: ampT, count: ampAuto.count, powered: 'passive' });
        } else if (passiveRows.length) {
          if (calcAuto.errors.length) { SP.toast(calcAuto.errors[0], true); return; }
          if (calcAuto.amp2N) {
            var amp2T = pickCountAmp(2);
            if (!amp2T) { SP.toast('需要 2 通道功放模板（可在模板库新建）', true); return; }
            picks.push({ tpl: amp2T, count: calcAuto.amp2N, powered: 'passive' });
          }
          if (calcAuto.amp4N) {
            var amp4T = pickCountAmp(4);
            if (!amp4T) { SP.toast('需要 4 通道功放模板（可在模板库新建）', true); return; }
            picks.push({ tpl: amp4T, count: calcAuto.amp4N, powered: 'passive' });
          }
        }
      }
      if (!picks.length) { SP.toast('请至少给一类设备填数量，例如 1 2 6 10 2', true); return; }
      afterCreate(Store.quickLayout(picks));
    }

    /* ================= 事件委托：拖动 / click ================= */

    on('mousedown', function (e) {
      var handle = e.target.closest && e.target.closest('[data-rv-ai-drag]');
      if (!handle) return;
      var f = rvAiFloat();
      var pane = el('ql-pane-rv') || box;
      if (!f || !pane || !f.getBoundingClientRect || !pane.getBoundingClientRect) return;
      var fr = f.getBoundingClientRect();
      var pr = pane.getBoundingClientRect();
      rvAiDrag = {
        dx: (e.clientX || 0) - fr.left,
        dy: (e.clientY || 0) - fr.top,
        paneLeft: pr.left,
        paneTop: pr.top,
        startX: e.clientX || 0,
        startY: e.clientY || 0,
        pos: null
      };
      rvAiSuppressClick = false;
      if (e.preventDefault) e.preventDefault();
    });

    on('mousemove', function (e) {
      if (!rvAiDrag) return;
      var x = (e.clientX || 0) - rvAiDrag.paneLeft - rvAiDrag.dx;
      var y = (e.clientY || 0) - rvAiDrag.paneTop - rvAiDrag.dy;
      if (Math.abs((e.clientX || 0) - rvAiDrag.startX) > 3 ||
          Math.abs((e.clientY || 0) - rvAiDrag.startY) > 3) {
        rvAiSuppressClick = true;
      }
      rvAiDrag.pos = moveRvAiFloat(x, y);
      if (e.preventDefault) e.preventDefault();
    });

    function endRvAiDrag() {
      if (rvAiDrag && rvAiDrag.pos) saveRvAiPos(rvAiDrag.pos.left, rvAiDrag.pos.top);
      rvAiDrag = null;
    }
    on('mouseup', endRvAiDrag);
    on('mouseleave', endRvAiDrag);

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
        if (mode === 'reverse') { syncAmpModeUI(); rvCalcShow(); activateRvAi(true); }
        else raf(function () { focusFirstCount(false); });
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
      else if (act === 'rv-ai-toggle') {
        if (rvAiSuppressClick) { rvAiSuppressClick = false; return; }
        toggleRvAi();
      }
      else if (act === 'rv-ai-apply') {
        var ai = el('rv-ai-text');
        applySpeakerVoiceCommand(ai ? ai.value : '');
      } else if (act === 'rv-pick-tpl') {
        var pi = +actBtn.dataset.i;
        if (rvGroups[pi]) {
          applyTplToGroup(rvGroups[pi], +actBtn.dataset.tpl, '');
          refreshRvCards();
          setAiHint('已选择' + groupTitle(rvGroups[pi], pi) + '型号，反推结果已刷新。');
        }
      } else if (act === 'rv-mode') {
        var mi = +actBtn.dataset.i, mg = rvGroups[mi];
        if (mg) {
          if (actBtn.dataset.mode === 'parallel') {
            mg.parallelDraft = Math.max(2, +mg.unitsPerChannel || 2);
          } else {
            mg.connectionMode = 'independent';
            mg.unitsPerChannel = 1;
            mg.parallel = 1;
            mg.parallelDraft = 0;
            markGroupDirty(mg);
          }
          refreshRvCards();
        }
      } else if (act === 'rv-par-draft') {
        var di = +actBtn.dataset.i, dg = rvGroups[di];
        if (dg) { dg.parallelDraft = Math.max(2, Math.min(4, +actBtn.dataset.units || 2)); refreshRvCards(); }
      } else if (act === 'rv-par-confirm') {
        var ci = +actBtn.dataset.i, cg = rvGroups[ci];
        if (cg) {
          cg.connectionMode = 'parallel';
          cg.unitsPerChannel = Math.max(2, Math.min(4, +cg.parallelDraft || 2));
          cg.parallel = cg.unitsPerChannel;
          cg.parallelDraft = 0;
          markGroupDirty(cg);
          refreshRvCards();
          setAiHint('已确认' + groupTitle(cg, ci) + '并联串接设置。');
        }
      } else if (act === 'rv-par-cancel') {
        var xi = +actBtn.dataset.i, xg = rvGroups[xi];
        if (xg) {
          xg.connectionMode = 'independent';
          xg.unitsPerChannel = 1;
          xg.parallel = 1;
          xg.parallelDraft = 0;
          markGroupDirty(xg);
          refreshRvCards();
        }
      }
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
          rvViewStash = { snap: reverseSnapshot() };
          applyReverseSnapshot(reverseFromCurrent());
          rvViewing = true;
          actBtn.classList.add('on');
          SP.toast('已按当前画布还原本次案例的反推过程（再点一次返回）');
        } else {
          applyReverseSnapshot((rvViewStash && rvViewStash.snap) || {});
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
      if (t.getAttribute('data-ql-count') !== null) {
        var cleanN = t.value.replace(/\D/g, '');
        if (cleanN !== t.value) t.value = cleanN;
        qlCalcShow();
        return;
      }
      if (t.getAttribute('data-rv-cnt') !== null) {
        var g1 = rvGroups[+t.getAttribute('data-rv-cnt')];
        if (g1) {
          g1.count = t.value.replace(/\D/g, '');
          if (g1.count !== t.value) t.value = g1.count;
          markGroupDirty(g1);
          rvCalcShow();
        }
        return;
      }
      if (t.getAttribute('data-rv-w') !== null) {
        var g2 = rvGroups[+t.getAttribute('data-rv-w')];
        if (g2 && g2.tplIdx < 0) { g2.power = t.value; markGroupDirty(g2); rvCalcShow(); }
        return;
      }
      if (t.getAttribute('data-rv-o') !== null) {
        var g3 = rvGroups[+t.getAttribute('data-rv-o')];
        if (g3 && g3.tplIdx < 0) { g3.ohms = t.value; markGroupDirty(g3); rvCalcShow(); }
        return;
      }
      if (t.getAttribute('data-rv-name') !== null) {
        var g4 = rvGroups[+t.getAttribute('data-rv-name')];
        if (g4) { g4.name = t.value; markGroupDirty(g4); }
        return;
      }
      if (t.id === 'rv-ratio-custom' || t.id === 'rv-subratio-custom' || t.id === 'rv-mixer-n') rvCalcShow();
    });

    on('change', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-ql-tpl') !== null) { qlCalcShow(); return; }
      if (t.getAttribute('data-rv-tpl') !== null) {
        var i = +t.getAttribute('data-rv-tpl');
        var g = rvGroups[i];
        if (g) {
          applyTplToGroup(g, +t.value, '');
          refreshRvCards('data-rv-tpl', i);
        }
        return;
      }
      if (t.getAttribute('data-rv-par') !== null) {
        var gp = rvGroups[+t.getAttribute('data-rv-par')];
        if (gp) {
          gp.unitsPerChannel = Math.max(1, +t.value || 1);
          gp.connectionMode = gp.unitsPerChannel > 1 ? 'parallel' : 'independent';
          gp.parallel = groupParallel(gp);
          markGroupDirty(gp);
          rvCalcShow();
        }
        return;
      }
      if (t.id === 'rv-ratio') {
        if (el('rv-ratio-custom-wrap')) {
          el('rv-ratio-custom-wrap').style.display = t.value === 'custom' ? '' : 'none';
        }
        rvCalcShow();
        return;
      }
      if (t.id === 'rv-subratio') {
        if (el('rv-subratio-custom-wrap')) {
          el('rv-subratio-custom-wrap').style.display = t.value === 'custom' ? '' : 'none';
        }
        refreshRvCards();
        return;
      }
      if (t.id === 'rv-ampmode') { syncAmpModeUI(); rvCalcShow(); return; }
      if (t.id === 'rv-amp2-tpl' || t.id === 'rv-amp4-tpl' ||
          t.id === 'rv-minohm' || t.id === 'rv-dsp-tpl' || t.id === 'rv-mixer-tpl') { rvCalcShow(); return; }
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
      if (e.key === 'Enter' && t && t.id === 'rv-ai-text') {
        e.preventDefault();
        applySpeakerVoiceCommand(t.value || '');
        return;
      }
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
            if (isQlCell) qlCalcShow();
            if (isRvCell) { var gg = rvGroups[+t.getAttribute('data-rv-cnt')]; if (gg) { gg.count = ''; markGroupDirty(gg); rvCalcShow(); } }
          } else if (pos > 0) {
            var pv = list[pos - 1];
            pv.value = '';
            if (isQlCell) qlCalcShow();
            if (isRvCell && pv.getAttribute('data-rv-cnt') !== null) {
              var gp2 = rvGroups[+pv.getAttribute('data-rv-cnt')];
              if (gp2) { gp2.count = ''; markGroupDirty(gp2); rvCalcShow(); }
            }
            pv.focus();
            if (pv.select) pv.select();
          }
        } else if (/^\d$/.test(e.key)) {
          e.preventDefault();
          var v = (t.value + e.key).replace(/^0+(\d)/, '$1');
          t.value = String(Math.min(128, +v));
          if (isQlCell) qlCalcShow();
          if (isRvCell) { var gg2 = rvGroups[+t.getAttribute('data-rv-cnt')]; if (gg2) { gg2.count = t.value; markGroupDirty(gg2); rvCalcShow(); } }
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
          if (target.getAttribute('data-ql-count') !== null) qlCalcShow();
          if (target.getAttribute('data-rv-cnt') !== null) {
            var gf = rvGroups[+target.getAttribute('data-rv-cnt')];
            if (gf) { gf.count = e.key; markGroupDirty(gf); rvCalcShow(); }
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
    if (mode === 'reverse') {
      rvCalcShow();
      if (opt.command) applySpeakerVoiceCommand(opt.command);
    } else {
      qlCalcShow();
      raf(function () { focusFirstCount(false); });
    }
  };
})();
