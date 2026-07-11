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

  var demoMode = false;
  try { demoMode = new URLSearchParams(window.location.search || '').get('demo') === '1'; } catch (e) {}
  var POS_KEY = demoMode ? 'erosiris.auroraGuideFloatPos' : 'signalpath.guideFloatPos';
  var COURSE_KEY = demoMode ? 'erosiris.auroraGuideCoursesV1' : 'signalpath.guideCoursesV1';
  var TIP_KEY = demoMode ? 'erosiris.auroraGuideTipsV1' : 'signalpath.guideTipsV1';
  var WELCOME_MS = 3000;
  var WELCOME_LINES = [
    '我可以教你帅气的 3 秒反推系统喔！',
    '第一次来？点我，我会一步一步带你玩转工作台。',
    '不会导入模板？交给小蝶带路就好啦。',
    '想把工程备份得稳稳的？我可以教你。',
    '每个按钮我都认识，点我一起逛逛吧！'
  ];
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
      templates: (st.deviceTemplates || []).length,
      quickPresets: (st.quickPresets || []).length,
      reversePresets: (st.reversePresets || []).length,
      mixers: st.devices.filter(function (d) { return d.type === 'mixer'; }).length,
      switches: st.devices.filter(function (d) { return d.type === 'switch'; }).length
    };
  }

  /* ================= 高亮带路 ================= */

  var spotTimer = null, spotEl = null, calloutEl = null;
  function resolveTarget(ref) {
    if (!ref) return null;
    if (typeof ref !== 'string') return ref;
    if (ref.charAt(0) !== '#' && /^[A-Za-z][\w:.-]*$/.test(ref)) {
      var byId = el(ref);
      if (byId) return byId;
    }
    if (document.querySelector) {
      try { return document.querySelector(ref.charAt(0) === '#' ? ref : ref); } catch (e) {}
    }
    return ref.charAt(0) === '#' ? el(ref.slice(1)) : null;
  }
  function removeCallout() {
    if (calloutEl && calloutEl.parentNode) calloutEl.parentNode.removeChild(calloutEl);
    calloutEl = null;
  }
  function clearSpot() {
    if (spotTimer) { clearTimeout(spotTimer); spotTimer = null; }
    if (spotEl && spotEl.classList) spotEl.classList.remove('guide-spot');
    if (document.querySelectorAll) {
      document.querySelectorAll('.guide-spot').forEach(function (node) {
        if (node.classList) node.classList.remove('guide-spot');
      });
    }
    spotEl = null;
    removeCallout();
  }
  function placeCallout(target, text) {
    if (!target || !text || !document.body || !target.getBoundingClientRect) return;
    removeCallout();
    var r = target.getBoundingClientRect();
    if (!r || (!r.width && !r.height)) return;
    var d = document.createElement('div');
    d.className = 'guide-callout';
    d.textContent = text;
    document.body.appendChild(d);
    var w = d.offsetWidth || 230, h = d.offsetHeight || 48;
    var vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
    var left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
    var top = r.bottom + 10;
    var above = false;
    if (top + h > vh - 8) { top = Math.max(8, r.top - h - 10); above = true; }
    d.style.left = Math.round(left) + 'px';
    d.style.top = Math.round(top) + 'px';
    d.classList.toggle('above', above);
    calloutEl = d;
  }
  /* 支持 id / CSS selector；课程步骤可保持高亮直到用户完成。 */
  function spotlight(ref, opt) {
    clearSpot();
    opt = opt || {};
    var t = resolveTarget(ref);
    if (!t) return false;
    spotEl = t;
    if (!opt.persist) spotTimer = setTimeout(clearSpot, opt.duration || 8000);
    if (t.classList) t.classList.add('guide-spot');
    if (t.scrollIntoView) { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }
    if (opt.text) setTimeout(function () { placeCallout(t, opt.text); }, 30);
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

  /* ================= 基础教学 + 主界面进阶教学 ================= */

  var COURSE_ORDER = ['templates', 'reverse', 'cables', 'report', 'excel'];
  var ADVANCED_ORDER = ['advanced-global', 'advanced-config-json', 'advanced-config-switch',
    'advanced-views', 'advanced-canvas', 'advanced-viewport', 'advanced-inspector'];
  var ALL_COURSE_ORDER = COURSE_ORDER.concat(ADVANCED_ORDER);
  var COURSES = {
    templates: {
      title: '建立音响型号库', short: '音响数据', time: '约 4 分钟',
      steps: [
        { text: '先打开顶栏的「模板库」。小蝶会带你认识下载、导入、提取和备份入口。',
          target: '#btn-templates', callout: '第一步：打开模板库', wait: 'click' },
        { text: '模板数据有两种进入方式：下载表格填写后导入，或从当前案例提取已有设备。请选择这次要学习的路线。',
          manual: true, choices: [
            ['course-path-download', '下载表格并导入', 'primary'],
            ['course-path-extract', '从当前案例提取', '']
          ], extra: '<div class="gd-concept"><b>模板类功能都在这里：</b>预览、下载填写表、导出导入、提取当前案例、自定义新建。</div>' }
      ],
      variants: {
        download: [
          { text: '点击「下载填写模版表」页签。', target: '[data-tpl-mode="download"]',
            callout: '进入下载填写模版表', wait: 'click', ensure: 'templates' },
          { text: '下载包含全频、超低、有源音响、功放、DSP 和调音台的模板总表。', target: '#tplp-dl-all',
            callout: '下载模板总表', wait: 'click', ensure: 'templates' },
          { text: '请用 Excel 打开刚下载的表格并填写。表头不要改名、不要合并单元格；填写完成后回到这里继续。',
            manual: true, extra: '<div class="gd-fill-guide">' +
              '<b>音响表格填写重点</b>' +
              '<span>型号名称：必填，例如 206M</span>' +
              '<span>输入/输出：常见音响填 1进1出</span>' +
              '<span>功率：必填，用于功放反推</span>' +
              '<span>阻抗：无源音响必填；有源不填</span>' +
              '<span>尺寸：可填 15、18、双6寸</span></div>',
            nextLabel: '我填好了，继续导入' },
          { text: '回到模板库后，点击「导出导入」。', target: '[data-tpl-mode="import"]',
            callout: '进入导出导入', wait: 'click', ensure: 'templates' },
          { text: '点击「导入CSV模板」，选择刚刚填写的 .xls 或 .csv 文件。', target: '#tplp-csv-single',
            callout: '选择填写好的模板文件', wait: 'click', ensure: 'templates' },
          { text: '选择文件后系统会自动识别表头并合并同名型号。看到导入结果提示后继续检查模板。',
            manual: true, eventTarget: '#csv-import-file', wait: 'change',
            extra: '<div class="gd-concept">同名型号会更新原模板；表头不符合标准的文件会被跳过。</div>',
            nextLabel: '检查导入结果' },
          { text: '进入「模板库预览」，按全频、超低或有源分类检查刚导入的型号和参数。',
            target: '[data-tpl-mode="preview"]', callout: '检查模板库预览', wait: 'click', ensure: 'templates' },
          { text: '最后导出一次模板库作为备份。数量预设、反推预设和台面模板也会一起保存。',
            target: '#tplp-lib-out-top', callout: '导出完整模板库备份', wait: 'click', ensure: 'templates' }
        ],
        extract: [
          { text: '点击「提取当前案例中的模板」。画布已有设备会列在这里。',
            target: '[data-tpl-mode="capture"]', callout: '提取当前案例中的模板', wait: 'click', ensure: 'templates' },
          { text: '先检查“完整/待补全”状态。音响需要功率，无源音响还需要阻抗；调音台和 DSP 需要输入输出路数。',
            manual: true, target: '[data-capture-row]', callout: '补全后勾选要保存的设备', ensure: 'templates',
            extra: '<div class="gd-concept">待补全的行不能加入模板库。填写后状态会即时更新。</div>' },
          { text: '勾选需要保存的设备，然后点击「确认加入模板库」。',
            target: '#tplp-capture-merge', callout: '确认加入模板库', wait: 'click', ensure: 'templates' },
          { text: '进入模板库预览，检查刚提取的型号。', target: '[data-tpl-mode="preview"]',
            callout: '查看提取结果', wait: 'click', ensure: 'templates' },
          { text: '导出模板库完成备份。', target: '#tplp-lib-out-top',
            callout: '导出模板库备份', wait: 'click', ensure: 'templates' }
        ]
      }
    },
    reverse: {
      title: '用模板进行音响反推', short: '音响反推', time: '约 4 分钟',
      steps: [
        { text: '打开「快速布局」。如果还没有自己的音响型号，可以先完成第一课。',
          target: '#btn-quick', callout: '打开快速布局', wait: 'click' },
        { text: '切换到「音响反推」。', target: '[data-ql-mode="reverse"]',
          callout: '进入音响反推', wait: 'click', ensure: 'quick' },
        { text: '先填写全频和超低数量。需要多种型号时可以添加多个音响组。',
          target: '[data-rv-cnt]', callout: '填写音响数量', manual: true, ensure: 'reverse',
          extra: '<div class="gd-concept">数量为 0 的组不会创建；Shift 可以展开有源音响。</div>' },
        { text: '从模板候选中选择型号。选择后功率和阻抗会自动带入；没有模板时也可以直接填写参数。',
          target: '[data-rv-tpl]', callout: '选择已导入的音响型号', manual: true, ensure: 'reverse' },
        { text: '检查余量倍率、超低倍率和功放最低负载。新手可以先保留默认值。',
          target: '#rv-ratio', callout: '检查反推参数', manual: true, ensure: 'reverse' },
        { text: '确认音响组后，小蝶会保留当前型号和接线方式，准备创建系统。', manual: true,
          choices: [['course-confirm-groups', '确认全部音响组', 'primary'], ['course-next', '我已经确认', '']], ensure: 'reverse' },
        { text: '检查实时反推结果，然后点击「创建系统」。系统会生成设备、连线并按功放分组排版。',
          target: '#ql-confirm', callout: '创建整套系统', wait: 'click', ensure: 'reverse' }
      ]
    },
    cables: {
      title: '补齐线材和采购数量', short: '线材填写', time: '约 3 分钟',
      steps: [
        { text: '打开「线材清单」。它会根据设备连线自动生成，无需重复建表。',
          target: '[data-view="cables"]', callout: '进入线材清单', wait: 'click' },
        { text: '先找到线材明细里的长度输入框，填写单条线路的实际米数。',
          target: '.conn-len', callout: '填写单条线长', manual: true, ensure: 'cables',
          emptyText: '当前还没有连线。请先完成音响反推并创建系统，再回来填写线材。' },
        { text: '同类线材很多时，可以在分组标题处填写统一长度，并应用到未填写项目。',
          target: '.grp-len', callout: '按线材类型批量填写', manual: true, ensure: 'cables' },
        { text: '也可以勾选需要统一处理的行。', target: '.cb-row',
          callout: '勾选多条线路', wait: 'click', ensure: 'cables' },
        { text: '填写统一长度或备注，然后点击应用。', target: '#cb-sel-len',
          callout: '填写选中线路的统一长度', manual: true, ensure: 'cables' },
        { text: '点击「应用长度」完成批量填写。', target: '#cb-sel-apply',
          callout: '应用到选中线路', wait: 'click', ensure: 'cables' },
        { text: '回到页面上方检查总根数、总米数和待补长度。采购时建议增加 10%–15% 余量。',
          target: '#cable-summary', callout: '检查采购汇总', manual: true, ensure: 'cables' }
      ]
    },
    report: {
      title: '生成完整工程报告', short: '工程报告', time: '约 3 分钟',
      steps: [
        { text: '点击顶栏「报告」。', target: '#btn-report', callout: '打开报告中心', wait: 'click' },
        { text: '勾选需要的报告章节。设备清单、连接清单、线材、供电和路由都可以独立选择。',
          target: '[data-report-part]', callout: '选择报告章节', manual: true, ensure: 'report' },
        { text: '需要完整报告时可以使用“全选”；也可以“全不选”后只选择交付内容。',
          target: '#report-all', callout: '快速全选报告章节', wait: 'click', ensure: 'report' },
        { text: '点击章节名称，右侧预览会跳到对应位置。', target: '.report-jump',
          callout: '点击章节名称查看预览', wait: 'click', ensure: 'report' },
        { text: '打印或给甲方交付时，可以勾选“浅色打印版”节省墨水。',
          target: '[data-report-light]', callout: '切换浅色打印版', wait: 'click', ensure: 'report' },
        { text: '点击「生成报告」，在浏览器打印界面中选择打印机或保存为 PDF。',
          target: '#report-generate', callout: '生成可打印报告', wait: 'click', ensure: 'report' }
      ]
    },
    excel: {
      title: '导出工程数据 Excel', short: 'Excel 导出', time: '约 2 分钟',
      steps: [
        { text: '再次打开「报告」。Excel 导出与报告章节选择共用一个入口。',
          target: '#btn-report', callout: '打开报告中心', wait: 'click' },
        { text: 'Excel 导出会处理设备清单、连接清单和线材购买汇总。请确认这些章节已勾选。',
          target: '[data-report-part="deviceList"]', callout: '勾选设备清单等数据章节', manual: true, ensure: 'report',
          extra: '<div class="gd-concept">相同型号会合并计数；线材汇总依赖上一课填写的长度。</div>' },
        { text: '点击「导出 Excel」。系统会下载 Excel 可直接打开的 UTF-8 CSV 文件。',
          target: '#report-excel', callout: '导出 Excel 数据文件', wait: 'click', ensure: 'report' }
      ]
    },
    'advanced-global': {
      title: '认识全局顶栏', short: '全局顶栏', time: '约 4 分钟', level: 'advanced',
      steps: [
        { text: '左上角房屋按钮返回欢迎界面。工作台数据会继续保存在本机，返回不会清空当前工程。',
          target: '#btn-welcome', callout: '返回欢迎界面', manual: true, ensure: 'main' },
        { text: '主题按钮在白天玻璃与黑夜哑光之间切换。你的选择会自动记住。',
          target: '#btn-theme', callout: '切换昼夜主题', manual: true, ensure: 'main' },
        { text: '「报告」打开工程报告中心，可选择章节、预览、打印 PDF，也能导出 Excel 数据。',
          target: '#btn-report', callout: '工程报告中心', manual: true, ensure: 'main' },
        { text: '「快速布局」是建系统的主要入口：数量布局适合快速搭建，音响反推会根据音响型号和数量选择整套设备。',
          target: '#btn-quick', callout: '数量布局与音响反推', manual: true, ensure: 'main' },
        { text: '「模板库」管理音响、功放、DSP、调音台和交换机型号，也负责表格下载、批量导入与整库备份。',
          target: '#btn-templates', callout: '设备模板中心', manual: true, ensure: 'main' },
        { text: '「配置」用于保存、导入、导出和切换完整工程配置，适合管理多个项目版本。',
          target: '#btn-config', callout: '工程配置管理', manual: true, ensure: 'main' },
        { text: '「清空数据」会清除当前工程的设备与连线。它是危险操作，但执行后仍可以立即撤销。教学不会替你点击。',
          target: '#btn-clear', callout: '危险操作：清空当前工程', manual: true, ensure: 'main',
          extra: '<div class="gd-course-warn">小蝶只讲解，不会执行清空操作。</div>' },
        { text: '「快捷键」可以查看和修改常用操作按键。熟悉后能显著减少鼠标移动。',
          target: '#btn-keys', callout: '查看与修改快捷键', manual: true, ensure: 'main' },
        { text: '顶栏「撤销」回退最近一次数据操作，例如创建、删除、连接或修改设备。',
          target: '#btn-undo', callout: '撤销数据操作', manual: true, ensure: 'main' },
        { text: '顶栏「重做」恢复刚刚撤销的数据操作。中间的小字会提示自动保存状态。',
          target: '#btn-redo', callout: '重做数据操作', manual: true, ensure: 'main' }
      ]
    },
    'advanced-config-json': {
      title: '掌握全局 JSON 备份', short: '全局备份', time: '约 5 分钟', level: 'advanced',
      steps: [
        { text: '点击顶栏「配置」，我们先分清“完整配置 JSON”和“模板库 JSON”各自保存什么。',
          target: '#btn-config', callout: '打开配置与备份中心', wait: 'click', ensure: 'main' },
        { text: '先记住最重要的一点：「导出当前配置」保存当前工程的一份完整全局快照，不只保存画布。',
          target: '#cfg-export', callout: '导出当前完整配置 JSON', manual: true, ensure: 'config',
          extra: '<div class="gd-fill-guide"><b>完整配置 JSON 包含</b>' +
            '<span>当前全部设备、端口参数与设备图片</span>' +
            '<span>音频连线、Dante 互联、台内路由与线材长度</span>' +
            '<span>框图方向、手动排版和工程设置</span>' +
            '<span>完整模板库、快速预设、反推预设和台面模板</span></div>' },
        { text: '想一想：如果只导出模板库，能不能恢复当前项目的设备和连线？答案是不能。模板库文件只负责可复用资料。',
          target: '#cfg-tpl-export', callout: '这是轻量模板库存档', manual: true, ensure: 'config',
          extra: '<div class="gd-concept"><b>判断口诀：</b>要恢复整个项目，用“当前配置”；只分享型号和预设，用“模板库”。</div>' },
        { text: '正式项目做到一个可回退节点时，就导出一次当前配置。下载后建议按“项目-日期-阶段”重命名，例如：体育馆-0711-连线确认.json。',
          target: '#cfg-export', callout: '重要节点就留一份 JSON', manual: true, ensure: 'config',
          extra: '<div class="gd-concept">好的文件名应该让三个月后的你，不打开文件也知道它属于哪个项目、哪一天、哪个阶段。</div>' },
        { text: '「导入配置文件」可以一次选择一个或多个 JSON。每个文件都会成为一套可切换配置，并保留文件名作为配置名称。',
          target: '#cfg-import', callout: '导入一套或多套完整配置', manual: true, ensure: 'config',
          extra: '<div class="gd-course-warn">导入后先核对项目名称和设备数量，不要立刻删除原配置。</div>' },
        { text: '导入配置后，请检查设备数量、音响型号、连线数量、模板库和报告预览。能打开不等于内容一定是你要的版本。',
          target: '#cfg-slot-list', callout: '先识别新出现的配置', manual: true, ensure: 'config',
          extra: '<div class="gd-fill-guide"><b>恢复后的五项检查</b>' +
            '<span>项目设备数量是否正确</span><span>模板型号与功率参数是否完整</span>' +
            '<span>主信号链和 Dante 互联是否存在</span><span>线材长度与备注是否保留</span>' +
            '<span>报告章节是否能正常预览</span></div>' },
        { text: '最后认识「导入模板库」：它按名称合并型号和预设，适合给现有工程补充资料；它不是完整工程恢复。',
          target: '#cfg-tpl-import', callout: '合并模板与预设资料', manual: true, ensure: 'config' },
        { text: '形成习惯：浏览器自动保存负责“继续工作”，JSON 外部备份负责“真正可恢复”。重要工程不要只留在一个浏览器里。',
          manual: true, ensure: 'config',
          extra: '<div class="gd-course-done">推荐至少保留：本机工作副本 + 项目阶段 JSON + 异地或云端副本。</div>' }
      ]
    },
    'advanced-config-switch': {
      title: '掌握多配置切换', short: '配置切换', time: '约 4 分钟', level: 'advanced',
      steps: [
        { text: '再次打开「配置」。配置槽适合并排管理方案 A、方案 B、旧版和最终版。',
          target: '#btn-config', callout: '打开多配置管理', wait: 'click', ensure: 'main' },
        { text: '带“当前”标记的是正在编辑的配置。所有新增、删除、连线和模板修改都会写入这一套。',
          target: '.cfg-slot-name .tag.ok', callout: '确认当前正在编辑哪一套', manual: true, ensure: 'config',
          extra: '<div class="gd-course-warn">操作前先看“当前”标记，避免把修改做进错误方案。</div>' },
        { text: '其他可见配置会显示「切换」。切换时系统先封存当前状态，再整体载入目标配置。',
          target: '[data-slot-use]', callout: '切换到另一套完整配置', manual: true, ensure: 'config',
          emptyText: '当前只有一套配置。先导入另一份完整配置 JSON，就会出现“切换”按钮。' },
        { text: '配置切换是“整套替换”，不是把两个项目合并。设备、连线、路由、线材和模板库都会跟随目标配置一起变化。',
          target: '#cfg-slot-list', callout: '每个配置槽都是独立全局状态', manual: true, ensure: 'config',
          extra: '<div class="gd-concept"><b>思考：</b>方案 A 新增的模板会自动出现在方案 B 吗？不会，除非重新导入模板库或配置文件。</div>' },
        { text: '「临时移除」只是把某套配置从可见列表隐藏，数据仍保留，适合减少干扰；它不是备份，也不是删除。',
          target: '[data-slot-hide]', callout: '隐藏但保留配置数据', manual: true, ensure: 'config' },
        { text: '被临时移除的配置会出现「恢复」，恢复后重新回到可切换列表。',
          target: '#cfg-slot-list', callout: '在列表中恢复隐藏配置', manual: true, ensure: 'config',
          extra: '<div class="gd-concept">整理列表优先用“临时移除”；确认已有外部 JSON 后，才考虑彻底删除。</div>' },
        { text: '「删除」会彻底移除非当前配置，而且不进入撤销栈。删除前先切换核对，再导出该配置 JSON。',
          target: '[data-slot-del]:not([disabled])', callout: '不可撤销：彻底删除配置', manual: true, ensure: 'config',
          emptyText: '当前没有可删除的非当前配置。导入第二套配置后这里才会启用。',
          extra: '<div class="gd-course-warn">小蝶只讲解，不会替你删除配置。</div>' },
        { text: '多套配置不会被“导出当前配置”一次打包。正确做法是逐套切换、逐套核对、逐套导出，并使用不同文件名。',
          target: '#cfg-export', callout: '当前是哪套，就导出哪套', manual: true, ensure: 'config',
          extra: '<div class="gd-fill-guide"><b>推荐的多方案流程</b>' +
            '<span>切换方案 A → 核对 → 导出 A.json</span><span>切换方案 B → 核对 → 导出 B.json</span>' +
            '<span>明确最终版 → 再导出“最终版.json”</span><span>确认外部文件可用后再整理旧配置槽</span></div>' },
        { text: '把配置槽当作“工作台上的方案切换器”，把 JSON 当作“离开浏览器也能恢复的项目档案”。两者配合，才是稳妥的项目管理。',
          manual: true, ensure: 'config',
          extra: '<div class="gd-course-done">现在请回答自己：当前方案叫什么？最近一次外部 JSON 备份是什么时候？能否在另一台电脑恢复？</div>' }
      ]
    },
    'advanced-views': {
      title: '认识工作页面', short: '页面切换', time: '约 3 分钟', level: 'advanced',
      steps: [
        { text: '「设备连线」是第一主界面，用来查看设备层级、自动连线、排版和设备详情。',
          target: '[data-view="wiring"]', callout: '设备连线主界面', manual: true, ensure: 'main' },
        { text: '「线材清单」根据当前连线自动生成线材类型、根数和长度统计。',
          target: '[data-view="cables"]', callout: '线材与采购统计', manual: true, ensure: 'main' },
        { text: '「接线教学」把设备接口照片、端口和实际接线关系组合成现场教学图。',
          target: '[data-view="teach"]', callout: '现场接线教学', manual: true, ensure: 'main' },
        { text: '「台内路由」管理调音台输入、发送、输出矩阵和 Dante 通道分配。',
          target: '[data-view="mixer"]', callout: '调音台内部路由', manual: true, ensure: 'main' },
        { text: function (s) { return s.switches
            ? '添加交换机后会出现「交换机路由」，用于查看网口互联状态；具体 Dante 通道路由仍在台内路由中管理。'
            : '添加交换机后，这里会自动出现「交换机路由」页签，用于查看网口互联状态；当前工程还没有交换机。'; },
          target: '#tab-netroute', callout: '有交换机时自动出现', manual: true, ensure: 'main' }
      ]
    },
    'advanced-canvas': {
      title: '认识连线画布工具', short: '连线工具', time: '约 4 分钟', level: 'advanced',
      steps: [
        { text: '「一键智能连接」会为未连接设备补齐合理的信号链，同时保留已经存在的有效连线。',
          target: '#btn-smart-all-diagram', callout: '补齐未连接信号链', manual: true, ensure: 'wiring' },
        { text: '「全部清线」只清除连线，不删除设备。适合保留设备清单后重新规划走线，可撤销。',
          target: '#btn-clear-all-wires-diagram', callout: '危险操作：清除全部连线', manual: true, ensure: 'wiring',
          extra: '<div class="gd-course-warn">不会删除设备，但会清除当前全部连线。</div>' },
        { text: '「清设备」清除当前连线图里的设备及关联连线，但不会删除模板库。教学不会替你点击。',
          target: '#btn-clear-devices-diagram', callout: '危险操作：清除画布设备', manual: true, ensure: 'wiring' },
        { text: '「功率报警」检查功放余量、并联总功率和最低阻抗，帮助发现不安全或不足的配置。',
          target: '#btn-power-alarm', callout: '检查功率与阻抗', manual: true, ensure: 'wiring' },
        { text: '「切换横版」在纵向信号流和横向信号流之间切换，不改变设备或连线数据。',
          target: '#btn-diagram-orient', callout: '切换框图方向', manual: true, ensure: 'wiring' },
        { text: '「默认对齐」重新按信号层级和功放分组排版，优先减少线路交叉。',
          target: '#btn-diagram-align-default', callout: '恢复智能整齐排版', manual: true, ensure: 'wiring' },
        { text: '「相对对齐」保留手动调整后的相对顺序，再让设备对齐自己的上下级。',
          target: '#btn-diagram-align-relative', callout: '保留关系的柔性对齐', manual: true, ensure: 'wiring' }
      ]
    },
    'advanced-viewport': {
      title: '认识视角与导出', short: '视角导出', time: '约 3 分钟', level: 'advanced',
      steps: [
        { text: '多台调音台时，这个下拉框可以在整体视图与单台调音台下游视图之间切换。',
          target: '#diagram-scope', callout: '整体或分台视图', manual: true, ensure: 'wiring' },
        { text: '「全局视角/定位当前」在看清整张图与聚焦当前设备之间切换。快捷键是 0。',
          target: '#btn-zoom-fit', callout: '全图与当前设备双态切换', manual: true, ensure: 'wiring' },
        { text: '数字「0」现在也是按钮。点击它和按键盘 0 完全一样，同样切换全局视角与定位当前。',
          target: '#btn-zoom-shortcut-fit', callout: '点击或按键盘 0', manual: true, ensure: 'wiring' },
        { text: '减号按钮让画布以视口中心为锚点缩小一档，不会改变设备位置。键盘减号仍然可用。',
          target: '#btn-zoom-shortcut-out', callout: '点击缩小一档', manual: true, ensure: 'wiring' },
        { text: '缩放滑杆精确控制画布比例，也可以使用加减键或按住快捷键滚动。',
          target: '#zoom-range', callout: '调整框图缩放比例', manual: true, ensure: 'wiring' },
        { text: '加号按钮让画布以视口中心为锚点放大一档。缩放百分比和滑杆会同时更新。',
          target: '#btn-zoom-shortcut-in', callout: '点击放大一档', manual: true, ensure: 'wiring' },
        { text: '画布工具栏的「撤销」只回退框图排版动作，不影响设备和连线数据。',
          target: '#btn-wdiagram-undo', callout: '撤销框图排版', manual: true, ensure: 'wiring' },
        { text: '「导出」可以选择 2K、4K、8K 图片或 PDF，适合施工图、汇报和存档。',
          target: '#btn-diagram-export', callout: '导出框图', manual: true, ensure: 'wiring' },
        { text: '画布工具栏的「重做」恢复刚撤销的框图排版动作。',
          target: '#btn-wdiagram-redo', callout: '重做框图排版', manual: true, ensure: 'wiring' }
      ]
    },
    'advanced-inspector': {
      title: '认识设备栏与连接清单', short: '设备与清单', time: '约 3 分钟', level: 'advanced',
      steps: [
        { text: '右侧「添加」用于从模板选择设备，或创建自定义设备。添加后会进入当前工程。',
          target: '#insp-add', callout: '添加单台设备', manual: true, ensure: 'wiring' },
        { text: '点击设备栏中的设备可以查看参数、端口、图片和单设备智能分配；右键还能打开更多操作。',
          target: '#insp-body', callout: '选择设备查看详情', manual: true, ensure: 'wiring',
          emptyText: '当前没有设备，完成音响反推或点击添加后就能在这里选择设备。' },
        { text: '底部「连接清单」可以展开或收起，所有画布连线都会同步出现在这里。',
          target: '#drawer-toggle', callout: '展开连接清单', manual: true, ensure: 'wiring' },
        { text: '「层级顺序」按调音台、DSP、功放、音响的信号方向排列连接。',
          target: '[data-sort="hier"]', callout: '按信号层级排序', manual: true, ensure: 'wiring' },
        { text: '「添加顺序」按连线创建时间排列，适合检查最近接入的线路。',
          target: '[data-sort="added"]', callout: '按创建先后排序', manual: true, ensure: 'wiring' }
      ]
    }
  };

  function loadCourseData() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(COURSE_KEY) || 'null'); } catch (e) {}
    if (!d || typeof d !== 'object') d = {};
    if (!d.completed) d.completed = {};
    if (!d.skipped) d.skipped = {};
    if (!d.active || !COURSES[d.active.id]) d.active = null;
    return d;
  }
  var courseData = loadCourseData();
  var courseRun = courseData.active;
  function saveCourseData() {
    courseData.active = courseRun;
    try { localStorage.setItem(COURSE_KEY, JSON.stringify(courseData)); } catch (e) {}
  }
  function courseDef() { return courseRun && COURSES[courseRun.id]; }
  function courseSteps() {
    var c = courseDef();
    if (!c) return [];
    if (courseRun.variant && c.variants && c.variants[courseRun.variant]) return c.variants[courseRun.variant];
    return c.steps || [];
  }
  function courseStep() { return courseSteps()[courseRun ? courseRun.index : -1]; }
  function stepText(step) { return typeof step.text === 'function' ? step.text(appState()) : step.text; }
  function courseCardHtml(id, index) {
    var c = COURSES[id], done = !!courseData.completed[id], skipped = !!courseData.skipped[id];
    var state = done ? ' done' : (skipped ? ' skipped' : '');
    var icon = done ? '✓' : (skipped ? '免' : (index + 1));
    var note = done ? '已完成 · 可回看' : (skipped ? '已免学 · 可回看' : c.time);
    return '<button class="gd-course' + state + '" data-gd="course-' + id + '">' +
      '<i>' + icon + '</i><span><b>' + esc(c.short) + '</b><small>' + esc(note) + '</small></span></button>';
  }
  function courseCardsHtml() {
    var doneN = 0, skippedN = 0, advancedN = 0;
    COURSE_ORDER.forEach(function (id) {
      if (courseData.completed[id]) doneN++;
      else if (courseData.skipped[id]) skippedN++;
    });
    ADVANCED_ORDER.forEach(function (id) { if (courseData.completed[id]) advancedN++; });
    return '<div class="gd-course-head"><b>五门基础教学</b><span>' + doneN + ' 已完成' +
      (skippedN ? ' · ' + skippedN + ' 已免学' : '') + '</span></div>' +
      '<div class="gd-course-grid">' + COURSE_ORDER.map(courseCardHtml).join('') + '</div>' +
      '<div class="gd-course-tools">' + (doneN === COURSE_ORDER.length
        ? '<span class="gd-course-status done">基础教学已完成 · 可随时回看</span>'
        : (skippedN
          ? '<span class="gd-course-status skipped">基础教学已免学 · 可随时回看</span>'
          : '<button data-gd="course-skip-request">申请免学</button><span>免学后仍可随时回看</span>')) + '</div>' +
      '<div class="gd-course-head advanced"><b>第一主界面 · 进阶教学</b><span>' + advancedN + ' / ' +
      ADVANCED_ORDER.length + ' 已完成</span></div>' +
      '<div class="gd-course-grid advanced">' + ADVANCED_ORDER.map(courseCardHtml).join('') + '</div>';
  }
  function ensureCourseContext(step) {
    if (!step || !step.ensure) return;
    if (step.ensure === 'main' || step.ensure === 'wiring') {
      if (SP.closeModal) SP.closeModal();
      if (step.ensure === 'wiring' && SP.switchView) SP.switchView('wiring');
    }
    if (step.ensure === 'config' && !el('cfg-slot-list')) {
      var cfgBtn = el('btn-config');
      if (cfgBtn && cfgBtn.click) cfgBtn.click();
    }
    if (step.ensure === 'templates') {
      if (!el('tplp-body') && SP.openTemplatePanel) SP.openTemplatePanel();
      if (step.target && !resolveTarget(step.target)) {
        var mode = '';
        if (step.target === '#tplp-dl-all') mode = 'download';
        else if (step.target === '#tplp-csv-single') mode = 'import';
        else if (step.target === '#tplp-capture-merge' || step.target === '[data-capture-row]') mode = 'capture';
        else if (step.target === '[data-tpl-mode="preview"]') mode = '';
        if (mode) {
          var mt = resolveTarget('[data-tpl-mode="' + mode + '"]');
          if (mt && mt.click) mt.click();
        }
      }
    }
    if (step.ensure === 'quick' && !el('ql-pane-count') && SP.openQuickLayout) SP.openQuickLayout();
    if (step.ensure === 'reverse' && !reverseOpen() && SP.openQuickLayout) SP.openQuickLayout({ mode: 'reverse' });
    if (step.ensure === 'cables' && SP.switchView) SP.switchView('cables');
    if (step.ensure === 'report' && !el('report-preview') && SP.openReportOptions) SP.openReportOptions();
  }
  function courseTargetExists(step) { return !step.target || !!resolveTarget(step.target); }
  function renderCourseStep() {
    var c = courseDef(), steps = courseSteps(), step = courseStep();
    if (!c || !step) { finishCourse(); return; }
    ensureCourseContext(step);
    var n = courseRun.index + 1, total = steps.length;
    var extra = '<div class="gd-progress"><span style="width:' + Math.round(n / total * 100) + '%"></span></div>' +
      '<div class="gd-step-meta">' + esc(c.title) + ' · ' + n + '/' + total + '</div>' + (step.extra || '');
    if (step.target && !courseTargetExists(step) && step.emptyText) {
      extra += '<div class="gd-course-warn">' + esc(step.emptyText) + '</div>';
    }
    var chips = [];
    if (step.choices) {
      step.choices.forEach(function (x) { chips.push(chip(x[0], x[1], x[2])); });
    } else if (step.manual || step.wait === 'change') {
      chips.push(chip('course-next', step.nextLabel || '完成这一步，继续', 'primary'));
    }
    if (step.target) chips.push(chip('course-locate', '重新定位'));
    if (courseRun.index > 0) chips.push(chip('course-back', '上一步'));
    chips.push(chip('course-pause', '暂停教学'));
    render({ id: 'course', text: stepText(step), chips: chips, extra: extra });
    saveCourseData();
    clearSpot();
    if (step.target && courseTargetExists(step)) {
      setTimeout(function () {
        spotlight(step.target, { persist: true, text: (step.callout || ('步骤 ' + n + '/' + total)) });
      }, 80);
    }
  }
  function startCourse(id) {
    if (!COURSES[id]) return;
    courseRun = { id: id, index: 0, variant: '' };
    saveCourseData();
    renderCourseStep();
  }
  function chooseCourseVariant(name) {
    var c = courseDef();
    if (!c || !c.variants || !c.variants[name]) return;
    courseRun.variant = name;
    courseRun.index = 0;
    renderCourseStep();
  }
  function nextCourseStep() {
    if (!courseRun) return;
    courseRun.index++;
    if (courseRun.index >= courseSteps().length) finishCourse();
    else renderCourseStep();
  }
  function backCourseStep() {
    if (!courseRun) return;
    courseRun.index = Math.max(0, courseRun.index - 1);
    renderCourseStep();
  }
  function pauseCourse() {
    clearSpot();
    saveCourseData();
    go('home');
  }
  function resumeCourse() { if (courseRun) renderCourseStep(); }
  function finishCourse() {
    var id = courseRun && courseRun.id;
    if (!id) { go('home'); return; }
    courseData.completed[id] = true;
    delete courseData.skipped[id];
    courseRun = null;
    saveCourseData();
    clearSpot();
    var order = COURSES[id].level === 'advanced' ? ADVANCED_ORDER : COURSE_ORDER;
    var nextId = order[order.indexOf(id) + 1];
    render({ id: 'courseDone', text: '这门教学完成啦。你已经掌握「' + COURSES[id].title + '」。',
      chips: (nextId ? [chip('course-' + nextId, '继续下一课：' + COURSES[nextId].short, 'primary')] : [])
        .concat([chip('home', '返回教学首页')]),
      extra: '<div class="gd-course-done">✓ 已记录学习进度，下次打开小蝶仍会保留。</div>' });
  }

  function requestSkipBasics() {
    clearSpot();
    render({ id: 'courseSkip', text: '如果你已经熟悉基础流程，可以申请免学五门基础教学。课程不会删除，之后仍能逐门回看。',
      chips: [chip('course-skip-confirm', '确认申请免学', 'primary'), chip('home', '暂时不免学')],
      extra: '<div class="gd-course-warn">免学只跳过基础进度，不会改变设备、模板或工程数据。</div>' });
  }

  function skipBasics() {
    COURSE_ORDER.forEach(function (id) {
      if (!courseData.completed[id]) courseData.skipped[id] = true;
    });
    if (courseRun && COURSE_ORDER.indexOf(courseRun.id) >= 0) courseRun = null;
    saveCourseData();
    clearSpot();
    render({ id: 'courseSkipped', text: '基础教学已标记免学。所有课程仍保留在教学首页，想复习时直接点击课程卡片。',
      chips: [chip('course-advanced-global', '开始进阶教学', 'primary'), chip('home', '返回教学首页')],
      extra: '<div class="gd-course-done">✓ 已免学 · 随时可以回看基础教学</div>' });
  }
  function matchesCourseTarget(node, selector) {
    if (!node || !selector) return false;
    var target = resolveTarget(selector);
    if (node === target) return true;
    if (node.closest) { try { return !!node.closest(selector); } catch (e) {} }
    return false;
  }
  function courseEvent(type, node) {
    var step = courseStep();
    if (!courseRun || !step) return;
    var selector = type === 'change' ? step.eventTarget : step.target;
    if (step.wait !== type || !matchesCourseTarget(node, selector)) return;
    setTimeout(nextCourseStep, 100);
  }

  /* ================= 每次一条拓展技巧 ================= */

  var EXT_TIPS = [
    { id: 'quick-preset', title: '保存数量预设', text: '常用设备数量和型号可以保存成数量预设，下次在快速布局里一键套用。',
      target: '[data-act="ql-save-preset"]', prepare: 'quick' },
    { id: 'reverse-preset', title: '保存反推预设', text: '常用音响组合、倍率和设备选择可以保存为反推预设。',
      target: '[data-act="rv-save-preset"]', prepare: 'reverse' },
    { id: 'template-backup', title: '备份全部模板和预设', text: '模板库导出会同时保存设备模板、数量预设、反推预设和台面模板。',
      target: '#tplp-lib-out-top', prepare: 'templates' },
    { id: 'config-backup', title: '备份当前工程', text: '“导出当前配置”保存的是当前完整工程案例，适合项目存档和换电脑恢复。',
      target: '#cfg-export', prepare: 'config' },
    { id: 'smart-connect', title: '一键补齐线路', text: '一键智能连接会补充未连接线路，并保留已经正确连接的线路。',
      target: '#btn-smart-all-diagram' },
    { id: 'align', title: '快速整理框图', text: '默认对齐按功放分组整理系统；相对对齐适合手动移动后重新排整齐。',
      target: '#btn-diagram-align-default' },
    { id: 'power', title: '检查功放余量', text: '功率报警会结合演出倍率、阻抗和并联负载检查功放是否安全。',
      target: '#btn-power-alarm' },
    { id: 'diagram-export', title: '导出高清系统图', text: '框图可以导出 2K、4K、8K PNG 或 PDF。',
      target: '#btn-diagram-export' },
    { id: 'teach', title: '生成接线教学页', text: '接线教学可以按设备查看接口、输入设备和输出走向，还能导出 PNG。',
      target: '[data-view="teach"]' },
    { id: 'mixer', title: '认识台内路由', text: '台内路由包含输入分配、发送矩阵和输出分配，适合系统完成后继续配置。',
      target: '[data-view="mixer"]' },
    { id: 'dante', title: 'Dante 与交换机', text: '有多台调音台或交换机时，可以继续学习网口互联和 Dante 通道分配。',
      target: '#btn-mixer-dante', prepare: 'mixer', dante: true }
  ];
  var currentTip = null;
  function loadTipData() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(TIP_KEY) || 'null'); } catch (e) {}
    return d && typeof d === 'object' ? d : { seen: [] };
  }
  var tipData = loadTipData();
  function saveTipData() {
    try { localStorage.setItem(TIP_KEY, JSON.stringify(tipData)); } catch (e) {}
  }
  function chooseTip() {
    var s = appState();
    var list = EXT_TIPS.filter(function (t) { return !t.dante || s.switches || s.mixers > 1; });
    var unseen = list.filter(function (t) { return (tipData.seen || []).indexOf(t.id) < 0; });
    if (!unseen.length) { tipData.seen = []; unseen = list.slice(); }
    currentTip = unseen[Math.floor(Math.random() * unseen.length)] || list[0] || null;
    return currentTip;
  }
  function tipHtml() {
    var t = chooseTip();
    if (!t) return '';
    return '<button class="gd-tip" data-gd="tip-open"><span>顺便学一招</span><b>' + esc(t.title) + '</b><i>›</i></button>';
  }
  function showTip() {
    var t = currentTip || chooseTip();
    if (!t) return;
    if ((tipData.seen || []).indexOf(t.id) < 0) tipData.seen.push(t.id);
    if (tipData.seen.length > 6) tipData.seen = tipData.seen.slice(-6);
    saveTipData();
    render({ id: 'tip', text: t.text,
      chips: [chip('tip-locate', '带我找到这个功能', 'primary'), chip('home', '暂时不学')],
      extra: '<div class="gd-step-meta">拓展教学 · 每次只推荐一项</div>' });
  }
  function locateTip() {
    var t = currentTip;
    if (!t) return;
    if (t.prepare === 'quick' && SP.openQuickLayout) SP.openQuickLayout();
    if (t.prepare === 'reverse' && SP.openQuickLayout) SP.openQuickLayout({ mode: 'reverse' });
    if (t.prepare === 'templates' && SP.openTemplatePanel) SP.openTemplatePanel();
    if (t.prepare === 'config') { var b = el('btn-config'); if (b && b.click) b.click(); }
    if (t.prepare === 'mixer' && SP.switchView) SP.switchView('mixer');
    setTimeout(function () {
      if (!spotlight(t.target, { persist: true, text: t.title })) {
        var m = el('guide-msg');
        if (m) m.innerHTML = msgHtml('这个入口需要先完成相关数据或打开对应页面。之后我再带你来。');
      }
    }, 100);
  }

  /* ================= 步骤定义 ================= */

  var STEPS = {};

  STEPS.home = function () {
    var s = appState();
    var demoNeedsCase = SP.Demo && SP.Demo.active && !SP.Demo.caseImported();
    var basicsHandled = COURSE_ORDER.every(function (id) {
      return courseData.completed[id] || courseData.skipped[id];
    });
    var text = demoNeedsCase
      ? '欢迎来到极光体验室。要不要让我先导入一套真实案例模板？36 个型号准备好后，你可以马上体验完整反推。'
      : courseRun
      ? '欢迎回来，上次的教学进度还在。可以继续，也可以选择其他课程。'
      : (basicsHandled
        ? '基础流程已经处理好啦。下面的进阶教学会带你认识第一主界面的每一个按钮。'
        : (s.hasUserTpls
        ? '型号库已经准备好了。五门基础教学会从音响数据一直带到工程交付。'
        : '嗨，我是小蝶。第一次来就从“音响数据”开始，我会一步一步带你操作。'));
    var chips = [];
    var demoCaseActions = demoNeedsCase
      ? '<div class="gd-demo-case-actions">' +
        chip('demo-case-import', '帮我导入案例模板', 'primary') +
        chip('demo-case-skip', '先自己看看') + '</div>'
      : '';
    if (courseRun) chips.push(chip('course-resume', '继续上次教学', 'primary'));
    else if (basicsHandled) chips.push(chip('course-advanced-global', '开始主界面进阶教学', 'primary'));
    else if (!demoNeedsCase) chips.push(chip('course-templates', '从第一课开始', 'primary'));
    if (s.devices && !s.connections) chips.push(chip('smart-all', '一键连接现有设备'));
    chips.push(chip('faq2', '常见问题'));
    if (SP.Demo && SP.Demo.active) chips.push(chip('demo-author', '关于作者'));
    return { id: 'home', text: text, chips: chips,
      extra: demoCaseActions + courseCardsHtml() + tipHtml() };
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
    'demo-case-import': function () {
      if (SP.Demo && SP.Demo.importCaseTemplates) SP.Demo.importCaseTemplates();
      go('counts');
    },
    'demo-case-skip': function () { go('counts'); },
    'demo-author': function () {
      closePanel();
      if (SP.Demo && SP.Demo.showInvite) SP.Demo.showInvite(true);
    },
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

  ALL_COURSE_ORDER.forEach(function (id) {
    ACTIONS['course-' + id] = function () { startCourse(id); };
  });
  ACTIONS['course-resume'] = resumeCourse;
  ACTIONS['course-next'] = nextCourseStep;
  ACTIONS['course-back'] = backCourseStep;
  ACTIONS['course-pause'] = pauseCourse;
  ACTIONS['course-locate'] = function () {
    var step = courseStep();
    if (!step || !step.target) return;
    ensureCourseContext(step);
    setTimeout(function () {
      spotlight(step.target, { persist: true, text: step.callout || '就在这里' });
    }, 80);
  };
  ACTIONS['course-path-download'] = function () { chooseCourseVariant('download'); };
  ACTIONS['course-path-extract'] = function () { chooseCourseVariant('extract'); };
  ACTIONS['course-confirm-groups'] = function () {
    runCommand('两个都确认');
    nextCourseStep();
  };
  ACTIONS['course-skip-request'] = requestSkipBasics;
  ACTIONS['course-skip-confirm'] = skipBasics;
  ACTIONS['tip-open'] = showTip;
  ACTIONS['tip-locate'] = locateTip;

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
    return 'right:48px;bottom:40px;';
  }
  function panelHtml() {
    var welcome = WELCOME_LINES[Math.floor(Math.random() * WELCOME_LINES.length)] || WELCOME_LINES[0];
    return '<button class="gd-welcome" id="guide-welcome" data-guide-welcome type="button">' + esc(welcome) + '</button>' +
      '<button class="rv-ai-orb" data-guide-toggle data-guide-drag title="小蝶引导：点我" aria-label="小蝶引导">' +
      '<img class="rv-ai-img" id="guide-img" alt="" hidden><span class="rv-ai-symbol">🦋</span><span class="rv-ai-pulse"></span></button>' +
      '<div class="rv-ai-pop gd-pop">' +
      '<div class="rv-ai-title"><b>小蝶新手教学</b>' +
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
    clearSpot();
  }

  SP.Guide = {
    go: go,
    act: act,
    spotlight: spotlight,
    close: closePanel,
    courses: COURSES,
    startCourse: startCourse,
    resumeCourse: resumeCourse,
    nextCourse: nextCourseStep,
    skipBasics: skipBasics,
    welcomeLines: WELCOME_LINES.slice(),
    welcomeDuration: WELCOME_MS,
    progress: function () {
      return { active: courseRun, completed: courseData.completed, skipped: courseData.skipped };
    }
  };

  SP.initGuide = function () {
    if (!document.body || el('guide-float')) return;
    var host = document.createElement('div');
    host.id = 'guide-float';
    host.className = 'global-ai-float is-active';
    host.setAttribute('style', floatStyle());
    host.innerHTML = panelHtml();
    document.body.appendChild(host);
    setupIcon(host);

    var welcomeBubble = el('guide-welcome');
    function placeWelcomeBubble() {
      if (!welcomeBubble || !host.getBoundingClientRect) return;
      var r = host.getBoundingClientRect();
      var leftSide = r.left + r.width / 2 < (window.innerWidth || 1200) / 2;
      welcomeBubble.classList.toggle('align-left', leftSide);
    }
    placeWelcomeBubble();
    setTimeout(function () {
      if (welcomeBubble && welcomeBubble.classList) welcomeBubble.classList.add('is-hidden');
    }, WELCOME_MS);

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
      placeWelcomeBubble();
      return { left: left, top: top };
    }
    var initialStoredPos = savedPos();
    if (initialStoredPos && isFinite(+initialStoredPos.left) && isFinite(+initialStoredPos.top)) {
      move(+initialStoredPos.left, +initialStoredPos.top);
    }
    window.addEventListener('resize', function () {
      if (!host.getBoundingClientRect) return;
      var r = host.getBoundingClientRect();
      move(r.left, r.top);
    });
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

    /* 课程完成条件：真实点击/文件选择完成后自动进入下一步。 */
    document.addEventListener('click', function (e) { courseEvent('click', e.target); });
    document.addEventListener('change', function (e) { courseEvent('change', e.target); });

    /* 点击：蝴蝶开关面板；面板内 chips 统一分发 */
    host.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-guide-welcome]')) {
        if (welcomeBubble && welcomeBubble.classList) welcomeBubble.classList.add('is-hidden');
        host.classList.add('is-open');
        go('home');
        return;
      }
      if (e.target.closest && e.target.closest('[data-guide-collapse]')) {
        closePanel();
        return;
      }
      var c = e.target.closest && e.target.closest('[data-gd]');
      if (c) { act(c.dataset.gd); return; }
      if (e.target.closest && e.target.closest('[data-guide-toggle]')) {
        if (suppressClick) { suppressClick = false; return; }
        if (welcomeBubble && welcomeBubble.classList) welcomeBubble.classList.add('is-hidden');
        var opening = !host.classList.contains('is-open');
        if (opening) {
          host.classList.add('is-open');
          go('home');
        } else {
          closePanel();
        }
      }
    });
  };
})();
