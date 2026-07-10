/* ============================================================
   guide.js — 小蝶智能引导 🦋
   纯点击式向导：状态感知问答 + 数量填写 + 高亮带路。
   后端复用反推指令层（SP.applySpeakerVoiceCommand），
   不含任何语音识别 / 不要求打字。
   ============================================================ */

(function () {
  var Store = SP.Store;
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var POS_KEY = 'signalpath.guideFloatPos';
  var ICON_SRCS = [
    'assets/brand/ai-voice-icon.png',
    'assets/brand/ai-voice-icon.webp',
    'assets/brand/ai-voice-icon.svg'
  ];

  /* ================= 状态感知 ================= */

  function seedNameSet() {
    var set = {};
    (SP.TEMPLATES || []).forEach(function (t) { set[t.name] = true; });
    return set;
  }
  /* 用户自己导入/新建的音响模板（判断"模板库还是默认状态吗"） */
  function userSpeakerTpls() {
    var seed = seedNameSet();
    return (Store.state.deviceTemplates || []).filter(function (t) {
      return t.type === 'speaker' && !seed[t.name];
    });
  }
  function speakerTplsByRole(role) {
    return (Store.state.deviceTemplates || []).filter(function (t) {
      return t.type === 'speaker' &&
        (t.speakerRole || 'fullrange') === role &&
        !(t.specs && t.specs.powered === 'active');
    });
  }
  function appState() {
    var st = Store.state;
    return {
      devices: st.devices.length,
      connections: st.connections.length,
      hasUserTpls: userSpeakerTpls().length > 0,
      mixers: st.devices.filter(function (d) { return d.type === 'mixer'; }).length
    };
  }

  /* ================= 高亮带路 ================= */

  var spotTimer = null, spotEl = null;
  function clearSpot() {
    if (spotTimer) { clearTimeout(spotTimer); spotTimer = null; }
    if (spotEl && spotEl.classList) spotEl.classList.remove('guide-spot');
    spotEl = null;
  }
  /* 高亮一个真实按钮：脉冲光圈 + 滚动到可见，8 秒后自动熄灭 */
  function spotlight(id) {
    clearSpot();
    var t = el(id);
    if (!t) return false;
    spotEl = t;
    /* 先挂自动熄灭定时器再加高亮类（测试桩的 setTimeout 同步执行，顺序反了会秒清） */
    spotTimer = setTimeout(clearSpot, 8000);
    if (t.classList) t.classList.add('guide-spot');
    if (t.scrollIntoView) { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }
    return true;
  }

  /* ================= 指令桥（复用反推指令层） ================= */

  function reverseOpen() {
    var overlay = el('modal-overlay');
    var rvPane = el('ql-pane-rv');
    return !!(rvPane && rvPane.style && rvPane.style.display !== 'none' &&
      overlay && !overlay.hidden && typeof SP.applySpeakerVoiceCommand === 'function');
  }
  function runCommand(text) {
    if (!reverseOpen()) SP.openQuickLayout({ mode: 'reverse' });
    return typeof SP.applySpeakerVoiceCommand === 'function'
      ? SP.applySpeakerVoiceCommand(text) : null;
  }

  /* ================= 渲染 ================= */

  var current = 'home';
  function msgHtml(text) { return '🦋 ' + text; }
  function chip(key, label, kind) {
    return '<button class="gd-chip' + (kind ? ' ' + kind : '') + '" data-gd="' + esc(key) + '">' +
      label + '</button>';
  }
  function render(step) {
    current = step.id;
    var m = el('guide-msg');
    if (m) m.innerHTML = msgHtml(step.text);
    var o = el('guide-opts');
    if (o) o.innerHTML = (step.chips || []).join('');
    var x = el('guide-extra');
    if (x) {
      x.innerHTML = step.extra || '';
      x.hidden = !step.extra;
    }
    var back = el('guide-home');
    if (back) back.hidden = step.id === 'home';
  }

  /* ================= 步骤定义 ================= */

  var STEPS = {};

  STEPS.home = function () {
    var s = appState();
    var text, chips = [];
    if (!s.devices) {
      text = s.hasUserTpls
        ? '你的型号库已经就位。要几只音响？我帮你把功放、DSP、调音台一起算好。'
        : '嗨，我是小蝶。第一次来？30 秒帮你搭出一套系统，先从音响开始。';
      chips.push(chip('counts', '🚀 配一套系统', 'primary'));
      chips.push(chip('import', s.hasUserTpls ? '📥 再导入型号' : '📥 导入我的音响型号'));
      chips.push(chip('teach', '🎓 接线教学'));
    } else if (!s.connections) {
      text = '画布上有 ' + s.devices + ' 台设备但还没有连线——要我一键接好吗？';
      chips.push(chip('smart-all', '⚡ 一键智能连接', 'primary'));
      chips.push(chip('counts', '➕ 再配一批音响'));
      chips.push(chip('faq', '❓ 常见问题'));
    } else {
      text = '系统已经连好 ' + s.connections + ' 条线。接下来做什么？';
      chips.push(chip('align', '🧭 排整齐'));
      chips.push(chip('power-check', '🔍 功率检查'));
      chips.push(chip('report', '📄 生成报告'));
      chips.push(chip('cables', '🧵 要买多少线'));
      chips.push(chip('counts', '➕ 再配一批音响'));
    }
    chips.push(chip('faq2', '❓ 常见问题'));
    return { id: 'home', text: text, chips: chips };
  };

  STEPS.counts = function () {
    var s = appState();
    var fulls = speakerTplsByRole('fullrange');
    var subs = speakerTplsByRole('sub');
    function opts(list) {
      var html = '<option value="">智能推荐（库存最多）</option>';
      list.forEach(function (t) {
        html += '<option value="' + esc(t.name) + '">' + esc(t.name) +
          (t.specs && t.specs.power ? '（' + esc(t.specs.power) + 'W）' : '') + '</option>';
      });
      return html;
    }
    var extra =
      '<div class="gd-row"><span class="gd-lab">全频</span>' +
      '<input type="number" id="guide-n-full" min="0" max="64" inputmode="numeric" ' +
      'placeholder="0" class="gd-num" autofocus>' +
      '<span class="gd-lab">只</span>' +
      '<select id="guide-tpl-full" class="gd-sel">' + opts(fulls) + '</select></div>' +
      '<div class="gd-row"><span class="gd-lab">超低</span>' +
      '<input type="number" id="guide-n-sub" min="0" max="64" inputmode="numeric" ' +
      'placeholder="0" class="gd-num">' +
      '<span class="gd-lab">只</span>' +
      '<select id="guide-tpl-sub" class="gd-sel">' + opts(subs) + '</select></div>';
    return {
      id: 'counts',
      text: '你要几只全频、几只超低？选好型号（或交给我智能推荐），功放 DSP 调音台我来算。' +
        (s.hasUserTpls ? '' : '（现在用的是内置模板，导入你的型号表会更准）'),
      chips: [
        chip('counts-apply', '✨ 帮我配好', 'primary'),
        chip('import', '📥 先导入型号'),
      ],
      extra: extra
    };
  };

  STEPS.afterCounts = function () {
    return {
      id: 'afterCounts',
      text: '写进反推啦！功放 / DSP / 调音台已自动计算。看一眼卡片没问题的话，下一步确认音响组。',
      chips: [
        chip('confirm-groups', '✅ 全部确认', 'primary'),
        chip('counts', '↺ 改数量 / 型号')
      ]
    };
  };

  STEPS.create = function () {
    return {
      id: 'create',
      text: '最后一步：创建系统。我可以直接帮你点，也可以把按钮点亮你自己来。',
      chips: [
        chip('do-create', '🚀 直接帮我创建', 'primary'),
        chip('show-create', '💡 点亮按钮，我自己点')
      ]
    };
  };

  STEPS.afterCreate = function () {
    return {
      id: 'afterCreate',
      text: '系统创建好了 🎉 设备已按功放分组默认对齐、连线完成。接下来推荐：',
      chips: [
        chip('power-check', '🔍 功率检查'),
        chip('cables', '🧵 看要买多少线'),
        chip('report', '📄 生成报告')
      ]
    };
  };

  STEPS.import = function () {
    return {
      id: 'import',
      text: '把你的音响型号表（CSV / Excel）导入模板库，反推和快速布局就能直接用你的真实设备。' +
        '我把入口点亮了：模板库 → 「导入CSV模板」，也支持整个文件夹批量导入。',
      chips: [
        chip('open-tpl', '📂 打开模板库', 'primary'),
        chip('counts', '✔ 导好了，继续配系统')
      ]
    };
  };

  STEPS.faq = function () {
    return {
      id: 'faq',
      text: '常见问题，点哪个看哪个：',
      chips: [
        chip('faq-parallel', '音响怎么并联串接？'),
        chip('faq-dante', 'Dante / 交换机怎么连？'),
        chip('faq-cable', '怎么算要买多少线？'),
        chip('faq-report', '怎么导出报告？'),
        chip('faq-undo', '点错了怎么撤销？'),
        chip('faq-teach', '演出前怎么接话筒乐器？')
      ]
    };
  };

  STEPS['faq-parallel'] = function () {
    return {
      id: 'faq-parallel',
      text: '无源音响可以两只串成一条链共用一个功放通道（并联串接），系统会自动折算阻抗和功率余量。' +
        '在反推面板里我可以直接帮你预览。',
      chips: [
        chip('do-parallel', '给全频做 并联×2 预览'),
        chip('confirm-parallel', '✅ 确认并联预览'),
        chip('faq', '← 返回问题列表')
      ]
    };
  };

  STEPS['faq-dante'] = function () {
    return {
      id: 'faq-dante',
      text: '多台调音台互联走 Dante：① 添加一台交换机（模板库里有）② 右键调音台 → 网口线连到交换机' +
        '③ 右键调音台 → 「Dante 分配」勾选哪些通道走网络。框图上调音台会伸出青绿色 dante 小节点。',
      chips: [
        chip('open-tpl', '📂 打开模板库加交换机'),
        chip('faq', '← 返回问题列表')
      ]
    };
  };

  STEPS['faq-cable'] = function () {
    return {
      id: 'faq-cable',
      text: '「线材清单」页会按线材类型汇总数量和长度，补齐每条线的米数后还能给购线建议（建议加 10–15% 余量）。',
      chips: [
        chip('cables', '🧵 带我去线材清单', 'primary'),
        chip('faq', '← 返回问题列表')
      ]
    };
  };

  STEPS['faq-report'] = function () {
    return {
      id: 'faq-report',
      text: '「报告」能生成设备清单、连接清单、购线汇总、供电建议的多页文档，可打印或存 PDF 给甲方。',
      chips: [
        chip('report', '📄 现在生成', 'primary'),
        chip('faq', '← 返回问题列表')
      ]
    };
  };

  STEPS['faq-undo'] = function () {
    return {
      id: 'faq-undo',
      text: '几乎所有操作都能撤销：⌘Z 撤销、⌘X 重做（顶栏也有按钮，我点亮给你看）。放心大胆点。',
      chips: [chip('faq', '← 返回问题列表')]
    };
  };

  STEPS['faq-teach'] = function () {
    return {
      id: 'faq-teach',
      text: '「接线教学」页给每台调音台生成话筒/乐器接入表和输出走向卡，照着接就行。',
      chips: [
        chip('teach', '🎓 打开接线教学', 'primary'),
        chip('faq', '← 返回问题列表')
      ]
    };
  };

  /* ================= 动作 ================= */

  function go(name) {
    var fn = STEPS[name];
    if (fn) render(fn());
  }

  var ACTIONS = {
    counts: function () { go('counts'); },
    import: function () { go('import'); },
    faq: function () { go('faq'); },
    faq2: function () { go('faq'); },
    teach: function () {
      closePanel();
      if (SP.switchView) SP.switchView('teach');
      SP.toast('接线教学：左边选调音台，右边是接入表和输出卡。');
    },
    cables: function () {
      closePanel();
      if (SP.switchView) SP.switchView('cables');
      SP.toast('线材清单：上面是购线汇总，下面逐条补长度。');
    },
    report: function () {
      closePanel();
      if (SP.openReportOptions) SP.openReportOptions();
    },
    align: function () {
      closePanel();
      if (SP.defaultAlignLayout) SP.defaultAlignLayout(el('wiring-diagram'));
      SP.toast('已按功放分组默认对齐（⌘Z 可撤销）');
    },
    'power-check': function () {
      closePanel();
      if (SP.openPowerAlarm) SP.openPowerAlarm();
    },
    'smart-all': function () {
      closePanel();
      var b = el('btn-smart-all-diagram');
      if (b && b.click) b.click();
    },
    'open-tpl': function () {
      closePanel();
      if (SP.openTemplatePanel) SP.openTemplatePanel();
      setTimeout(function () { spotlight('tplp-csv-single'); }, 120);
    },
    'counts-apply': function () {
      var nFull = Math.max(0, parseInt((el('guide-n-full') || {}).value, 10) || 0);
      var nSub = Math.max(0, parseInt((el('guide-n-sub') || {}).value, 10) || 0);
      if (!nFull && !nSub) {
        var m = el('guide-msg');
        if (m) m.innerHTML = msgHtml('先填一个数量吧——全频或超低至少一只。');
        return;
      }
      var tplFull = (el('guide-tpl-full') || {}).value || '';
      var tplSub = (el('guide-tpl-sub') || {}).value || '';
      var parts = [];
      if (nFull) parts.push(nFull + '只全频' + tplFull);
      if (nSub) parts.push(nSub + '只超低' + tplSub);
      runCommand('我要' + parts.join('，'));
      /* 未指定型号的组 → 库存最多的顶上 */
      if (nFull && !tplFull) runCommand('全频选库存最多的');
      if (nSub && !tplSub) runCommand('超低选库存最多的');
      go('afterCounts');
    },
    'confirm-groups': function () {
      runCommand('确认全频');
      runCommand('确认超低');
      go('create');
    },
    'do-create': function () {
      var b = el('ql-confirm');
      if (b && b.click) b.click();
      go('afterCreate');
    },
    'show-create': function () {
      if (!reverseOpen()) SP.openQuickLayout({ mode: 'reverse' });
      spotlight('ql-confirm');
      var m = el('guide-msg');
      if (m) m.innerHTML = msgHtml('就是那个亮起来的「创建系统」按钮，点它！');
    },
    'do-parallel': function () {
      runCommand('全频并联串接2只');
      var m = el('guide-msg');
      if (m) m.innerHTML = msgHtml('并联×2 预览已生成，看下卡片再点确认。');
    },
    'confirm-parallel': function () {
      runCommand('确认并联');
    }
  };

  function act(key) {
    var fn = ACTIONS[key];
    if (fn) fn();
    else if (STEPS[key]) go(key);
  }

  /* ================= 浮动面板 ================= */

  function savedPos() {
    try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null') || null; } catch (e) { return null; }
  }
  function floatStyle() {
    var p = savedPos();
    if (p && isFinite(+p.left) && isFinite(+p.top)) {
      return 'left:' + Math.max(8, +p.left) + 'px;top:' + Math.max(8, +p.top) + 'px;';
    }
    return 'right:18px;bottom:18px;';
  }
  function panelHtml() {
    return '<button class="rv-ai-orb" data-guide-toggle data-guide-drag title="小蝶引导：点我" aria-label="小蝶引导">' +
      '<img class="rv-ai-img" id="guide-img" alt="" hidden><span class="rv-ai-symbol">🦋</span><span class="rv-ai-pulse"></span></button>' +
      '<div class="rv-ai-pop gd-pop">' +
      '<div class="rv-ai-title"><b>小蝶引导</b>' +
      '<button class="gd-home" id="guide-home" data-gd="home" title="回到主菜单" hidden>⌂</button>' +
      '<button class="rv-ai-collapse" data-guide-collapse title="收起" aria-label="收起引导面板"></button></div>' +
      '<div class="gd-msg" id="guide-msg"></div>' +
      '<div class="gd-extra" id="guide-extra" hidden></div>' +
      '<div class="gd-opts" id="guide-opts"></div>' +
      '</div>';
  }
  function setupIcon(host) {
    var img = el('guide-img');
    if (!img) return;
    var idx = 0;
    function fallback() {
      img.hidden = true;
      if (host && host.classList) host.classList.remove('has-custom-ai-icon');
    }
    function tryNext() {
      if (idx >= ICON_SRCS.length) { fallback(); return; }
      img.src = ICON_SRCS[idx++];
    }
    img.onload = function () {
      img.hidden = false;
      if (host && host.classList) host.classList.add('has-custom-ai-icon');
    };
    img.onerror = tryNext;
    tryNext();
  }
  function closePanel() {
    var host = el('guide-float');
    if (host && host.classList) host.classList.remove('is-open');
  }

  SP.Guide = { go: go, act: act, spotlight: spotlight, close: closePanel };

  SP.initGuide = function () {
    if (!document.body || el('guide-float')) return;
    var host = document.createElement('div');
    host.id = 'guide-float';
    host.className = 'global-ai-float is-active';
    host.setAttribute('style', floatStyle());
    host.innerHTML = panelHtml();
    document.body.appendChild(host);
    setupIcon(host);

    /* 拖拽（pointer 统一鼠标/触屏；>6px 才算拖，不吞点击） */
    var drag = null, suppressClick = false, THRESHOLD = 6;
    function move(left, top) {
      var w = host.offsetWidth || 340, h = host.offsetHeight || 80;
      var maxL = Math.max(8, (window.innerWidth || 1200) - w - 8);
      var maxT = Math.max(8, (window.innerHeight || 800) - h - 8);
      left = Math.max(8, Math.min(maxL, left));
      top = Math.max(8, Math.min(maxT, top));
      host.style.left = left + 'px';
      host.style.top = top + 'px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
      return { left: left, top: top };
    }
    host.addEventListener('pointerdown', function (e) {
      if (!(e.target.closest && e.target.closest('[data-guide-drag]'))) return;
      var r = host.getBoundingClientRect();
      drag = { dx: (e.clientX || 0) - r.left, dy: (e.clientY || 0) - r.top,
        startX: e.clientX || 0, startY: e.clientY || 0, pos: null, moved: false };
      suppressClick = false;
    });
    document.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (!drag.moved &&
          Math.abs((e.clientX || 0) - drag.startX) <= THRESHOLD &&
          Math.abs((e.clientY || 0) - drag.startY) <= THRESHOLD) return;
      drag.moved = true;
      suppressClick = true;
      drag.pos = move((e.clientX || 0) - drag.dx, (e.clientY || 0) - drag.dy);
      if (e.preventDefault) e.preventDefault();
    });
    function endDrag() {
      if (drag && drag.pos) {
        try { localStorage.setItem(POS_KEY, JSON.stringify({ left: Math.round(drag.pos.left), top: Math.round(drag.pos.top) })); } catch (e) {}
      }
      drag = null;
    }
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);

    /* 点击：蝴蝶开关面板；面板内 chips 统一分发 */
    host.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-guide-collapse]')) {
        closePanel();
        return;
      }
      var c = e.target.closest && e.target.closest('[data-gd]');
      if (c) { act(c.dataset.gd); return; }
      if (e.target.closest && e.target.closest('[data-guide-toggle]')) {
        if (suppressClick) { suppressClick = false; return; }
        var opening = !host.classList.contains('is-open');
        host.classList.toggle('is-open', opening);
        if (opening) go('home');
      }
    });
  };
})();
