/* ErosIris-Link v2 UI 启动路径测试：完整加载 + DOMContentLoaded + 各弹窗入口不抛异常 */

var _ls = {};
var window = this;
window.indexedDB = undefined;
var navigator = { platform: 'MacIntel' };
var localStorage = {
  getItem: function (k) { return _ls.hasOwnProperty(k) ? _ls[k] : null; },
  setItem: function (k, v) { _ls[k] = String(v); },
  removeItem: function (k) { delete _ls[k]; }
};
window.localStorage = localStorage;
window.innerWidth = 1440;
window.innerHeight = 900;
window.addEventListener = function () {};

function makeEl(id) {
  var listeners = {};
  var el = {
    id: id || '',
    innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
    checked: false, scrollLeft: 0, scrollTop: 0, clientWidth: 800, clientHeight: 500,
    offsetTop: 0, offsetHeight: 40, srcdoc: '',
    dataset: {}, style: {}, files: [],
    classList: {
      _set: {},
      add: function (c) { this._set[c] = 1; },
      remove: function (c) { delete this._set[c]; },
      toggle: function (c, f) { if (f === undefined) f = !this._set[c]; if (f) this._set[c] = 1; else delete this._set[c]; return !!this._set[c]; },
      contains: function (c) { return !!this._set[c]; }
    },
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function (t, fn) {
      if (listeners[t]) listeners[t] = listeners[t].filter(function (x) { return x !== fn; });
    },
    fire: function (t, ev) { (listeners[t] || []).forEach(function (fn) { fn(ev || { target: el, preventDefault: function(){}, stopPropagation: function(){} }); }); },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    setAttribute: function () {}, getAttribute: function () { return null; },
    appendChild: function () {},
    focus: function () {}, click: function () {},
    scrollTo: function () {}, scrollIntoView: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500 }; },
    closest: function () { return null; },
    options: []
  };
  return el;
}

var registry = {};
var docListeners = {};
var document = {
  documentElement: {
    _theme: 'dark',
    getAttribute: function () { return this._theme; },
    setAttribute: function (k, v) { if (k === 'data-theme') this._theme = v; }
  },
  getElementById: function (id) {
    if (!registry[id]) registry[id] = makeEl(id);
    return registry[id];
  },
  addEventListener: function (t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
  createElement: function (tag) { return makeEl(''); },
  createElementNS: function () { return makeEl(''); },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; }
};
window.document = document;
var alerts = [];
var alert = function (m) { alerts.push(String(m)); };
window.alert = alert;
var confirm = function () { return true; };
var prompt = function () { return '1'; };
var setTimeout = function (fn) { fn(); return 0; };
var clearTimeout = function () {};
var requestAnimationFrame = function (fn) { fn(); return 0; };
var PointerEvent = undefined;
function XMLSerializer() { this.serializeToString = function () { return '<svg/>'; }; }
function Image() { var self = this; setTimeout(function(){ if (self.onerror) {} }); }
function FileReader() { this.readAsDataURL = function () {}; this.readAsText = function () {}; }
var URL = { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} };
function Blob() {}
window.open = function () { return { document: { write: function(){}, close: function(){} } }; };

/* main-tabs 需要 querySelectorAll 返回 tab 桩 */
var pass = 0, fail = 0;
function T(name, cond, err) {
  if (cond) { pass++; print('  ✓ ' + name); }
  else { fail++; print('  ✗ FAIL: ' + name + (err ? ' — ' + err : '')); }
}

load('js/db.js');
load('js/store.js');
load('js/diagram.js');
load('js/inspector.js');
load('js/quick.js');
load('js/guide.js');
load('js/keys.js');
load('js/cables.js');
load('js/mixer.js');
load('js/teach.js');
load('js/report.js');
load('js/main.js');
load('welcome-reverse-prototype/config.js');

print('== 模块加载 ==');
T('全部 12 个模块加载无异常', true);
T('SP.Store / renderAll 前置就绪', !!SP.Store && !!SP.renderWiringDiagram);
T('欢迎场景均声明工作台昼夜主题', window.SITE_CONFIG.scenes.every(function (scene) {
  return scene.workbenchTheme === 'light' || scene.workbenchTheme === 'dark';
}));
T('欢迎场景均配置轻量首帧图', window.SITE_CONFIG.scenes.every(function (scene) {
  return typeof scene.poster === 'string' && /\.jpg$/i.test(scene.poster);
}));
var rootEntryHtml = readFile('点我打开ErosIris-Link软件.html');
var githubEntryHtml = readFile('index.html');
var welcomeAppSource = readFile('welcome-reverse-prototype/app.js');
var welcomeHtml = readFile('welcome-reverse-prototype/index.html');
var guideSource = readFile('js/guide.js');
var demoSource = readFile('js/demo.js');
var diagramSource = readFile('js/diagram.js');
var skinSource = readFile('css/workbench-skin.css');
T('GitHub根入口始终转到软件入口并保留参数', githubEntryHtml.indexOf('点我打开ErosIris-Link软件.html') >= 0 &&
  githubEntryHtml.indexOf('target.search = window.location.search') >= 0 &&
  githubEntryHtml.indexOf('target.hash = window.location.hash') >= 0);
T('软件入口默认进入欢迎页', rootEntryHtml.indexOf("entryParams.get('workspace') === '1'") >= 0 &&
  rootEntryHtml.indexOf("welcome-reverse-prototype/index.html?from=root") >= 0);
T('欢迎页使用持久工作台参数避免刷新循环', welcomeAppSource.indexOf('url.searchParams.set("workspace", "1")') >= 0 &&
  rootEntryHtml.indexOf("entryParams.get('from') === 'welcome'") >= 0);
T('欢迎页首个场景在媒体就绪后显式播放', welcomeAppSource.indexOf('function playActiveVideo()') >= 0 &&
  welcomeAppSource.indexOf('addEventListener("canplay", playActiveVideo') >= 0 &&
  welcomeAppSource.indexOf('window.addEventListener("load", playActiveVideo') >= 0);
T('欢迎页优先当前视频并为卡顿播放自动重试', welcomeAppSource.indexOf('v.preload = i === initialScene ? "auto" : "none"') >= 0 &&
  welcomeAppSource.indexOf('function schedulePlaybackRetry(index)') >= 0 &&
  welcomeAppSource.indexOf('ensureVideoSource((i + 1) % videos.length, "auto")') >= 0);
T('小蝶默认位置向页面内侧移动且旧坐标会重新限位', guideSource.indexOf("return 'right:48px;bottom:40px;'") >= 0 &&
  guideSource.indexOf("window.addEventListener('resize'") >= 0);
T('手机和 iPad 入口绕过欢迎页且测试版参数继续保留',
  rootEntryHtml.indexOf('mobileUa || ipadDesktop || narrowTouch || compactViewport') >= 0 &&
  welcomeHtml.indexOf("target.searchParams.set('workspace', '1')") >= 0 &&
  welcomeHtml.indexOf("current.get('demo') === '1'") >= 0 &&
  welcomeHtml.indexOf('ipadDesktop') < welcomeHtml.indexOf('rel="preload"'));
T('欢迎页资源仅在确认桌面端后加载',
  welcomeHtml.indexOf('__EROSIRIS_WELCOME_DESKTOP__') >= 0 &&
  welcomeHtml.indexOf("document.write('<script src=\"config.js") >= 0 &&
  welcomeHtml.indexOf('mobileClient = mobileUa || ipadDesktop || narrowTouch || compactViewport') >= 0);
T('触控端单指滚动优先并禁用鼠标框选与设备拖动',
  diagramSource.indexOf('touch-action:pan-x pan-y') >= 0 &&
  diagramSource.indexOf('if (!isMouseInput(e) || mobileClient()) return') >= 0 &&
  diagramSource.indexOf('if (isTouchInput(e))') >= 0 &&
  skinSource.indexOf('@media (max-width: 720px), (pointer: coarse)') >= 0);
T('桌面批量选中使用强化高亮和明确删除入口',
  diagramSource.indexOf('has-multi-selection') >= 0 &&
  diagramSource.indexOf("classList.toggle('multi-sel'") >= 0 &&
  readFile('js/inspector.js').indexOf('insp-delete-multi') >= 0 &&
  skinSource.indexOf('.insp-multi-selection') >= 0);
T('极光体验室保留欢迎页并把 Demo 参数带入工作台',
  welcomeAppSource.indexOf('const demoMode = urlParams.get("demo") === "1"') >= 0 &&
  welcomeAppSource.indexOf('url.searchParams.set("demo", "1")') >= 0 &&
  rootEntryHtml.indexOf('js/demo.js') >= 0);
T('Demo 基础不限次，导出与进阶额度各为 3 次',
  demoSource.indexOf('var LIMIT = 3') >= 0 &&
  demoSource.indexOf("consume('export'") >= 0 &&
  demoSource.indexOf("consume('advanced'") >= 0);
T('Demo 工程、配置与教学进度使用独立存储区',
  readFile('js/store.js').indexOf('erosiris-aurora-state-v2') >= 0 &&
  readFile('js/main.js').indexOf('erosiris-aurora-config-slots-v2') >= 0 &&
  guideSource.indexOf('erosiris.auroraGuideCoursesV1') >= 0);
T('小蝶可导入 36 型号案例并仅主动邀请作者一次',
  demoSource.indexOf("'206M'") >= 0 && demoSource.indexOf("'DO115S'") >= 0 &&
  demoSource.indexOf('wechat.jpg') >= 0 && demoSource.indexOf('ErosAUC') >= 0 &&
  guideSource.indexOf("'demo-case-import'") >= 0);

print('== DOMContentLoaded 启动 ==');
var bootErr = null;
try {
  (docListeners['DOMContentLoaded'] || []).forEach(function (fn) { fn(); });
} catch (e) { bootErr = e; }
T('DOMContentLoaded 全部绑定无异常', !bootErr, bootErr && (bootErr + ' @ ' + (bootErr.stack || '').split('\n')[0]));

/* Images.init() 的 then 回调（boot）在微任务里；jsc 退出前会 drain。
   这里用一个 then 链在其后做断言。 */
var done = false;
Promise.resolve().then(function () {
  print('== 启动后渲染 ==');
  var Store = SP.Store;
  T('renderAll 已执行（设备栏有内容）', registry['insp-body'] && registry['insp-body'].innerHTML.length > 0);
  T('框图容器有内容', registry['wiring-diagram'] && registry['wiring-diagram'].innerHTML.length > 0);
  T('首次使用 firstRun 为真（空数据）', Store.firstRun === true);
  T('首次打开默认空白不自动弹快速布局', !registry['modal-box'] || registry['modal-box'].innerHTML === '');
  T('框图默认对齐下级', Store.state.diagramLayout === 'bottomup');

  print('== 各功能入口不抛异常 ==');
  Store.mergeTemplate({ type:'speaker', name:'206M', ins:1, outs:1, speakerRole:'fullrange',
    specs:{ powered:'passive', power:'450', ohms:'8', stock:'10' } });
  Store.mergeTemplate({ type:'speaker', name:'DO115', ins:1, outs:1, speakerRole:'fullrange',
    specs:{ powered:'passive', power:'500', ohms:'8', stock:'12' } });
  Store.mergeTemplate({ type:'speaker', name:'DO118S', ins:1, outs:1, speakerRole:'sub',
    specs:{ powered:'passive', power:'900', ohms:'8', stock:'6' } });
  Store.mergeTemplate({ type:'speaker', name:'DO118S少库存', ins:1, outs:1, speakerRole:'sub',
    specs:{ powered:'passive', power:'900', ohms:'8', stock:'2' } });
  var vp = SP.parseSpeakerVoiceCommand('我要8个全频，4个超低', { templates: Store.state.deviceTemplates });
  T('AI语音配系统：一次识别全频和超低数量',
    vp.intent === 'create_speaker_groups' && vp.groups.length === 2 &&
    vp.groups[0].role === 'fullrange' && vp.groups[0].count === 8 && vp.groups[0].templateId === null &&
    vp.groups[1].role === 'sub' && vp.groups[1].count === 4 && vp.groups[1].templateId === null);
  var vp2 = SP.parseSpeakerVoiceCommand('我要8只全频DO115，4只超低DO118S', { templates: Store.state.deviceTemplates });
  T('AI语音配系统：数量和型号可在一句话里识别',
    vp2.groups[0].templateName === 'DO115' && vp2.groups[1].templateName === 'DO118S');
  var vp2b = SP.parseSpeakerVoiceCommand('我要6只206M', { templates: Store.state.deviceTemplates });
  var vp2c = SP.parseSpeakerVoiceCommand('206M六只，DO118S四只', { templates: Store.state.deviceTemplates });
  T('AI语音配系统：无角色时按型号反查全频/超低',
    vp2b.intent === 'create_speaker_groups' && vp2b.groups[0].count === 6 &&
    vp2b.groups[0].role === 'fullrange' && vp2b.groups[0].templateName === '206M' &&
    vp2c.groups.length === 2 && vp2c.groups[0].templateName === '206M' &&
    vp2c.groups[1].role === 'sub' && vp2c.groups[1].templateName === 'DO118S');
  var vp2d = SP.parseSpeakerVoiceCommand('我要5支全屏八只', { templates: Store.state.deviceTemplates });
  var vp2e = SP.parseSpeakerVoiceCommand('我要六只全瓶，八字超低', { templates: Store.state.deviceTemplates });
  T('AI语音配系统：纠正全屏/支并保留缺失数量追问',
    vp2d.intent === 'create_speaker_groups' && vp2d.groups[0].role === 'fullrange' &&
    vp2d.groups[0].count === 5 && vp2d.missingCounts && vp2d.missingCounts[0] === 8 &&
    vp2e.groups.length === 2 && vp2e.groups[0].count === 6 && vp2e.groups[0].role === 'fullrange' &&
    vp2e.groups[1].count === 8 && vp2e.groups[1].role === 'sub');
  var vp3 = SP.parseSpeakerVoiceCommand('全频选第二个');
  var vp4 = SP.parseSpeakerVoiceCommand('两个都用第一个');
  var vp5 = SP.parseSpeakerVoiceCommand('超低选库存最多的');
  var vp5b = SP.parseSpeakerVoiceCommand('全频要206M', { templates: Store.state.deviceTemplates });
  var vp5c = SP.parseSpeakerVoiceCommand('超低型号是DO118S', { templates: Store.state.deviceTemplates });
  T('AI语音配系统：支持序号/两个都用/库存最多选择',
    vp3.intent === 'select_templates' && vp3.selections[0].rank === 2 &&
    vp4.selections.length === 2 && vp5.selections[0].pick === 'stock' &&
    vp5b.intent === 'select_templates' && vp5b.selections[0].query === '206M' &&
    vp5c.intent === 'select_templates' && vp5c.selections[0].query === 'DO118S');
  var vp6 = SP.parseSpeakerVoiceCommand('确认全频');
  var vp7 = SP.parseSpeakerVoiceCommand('超低并联串接2只');
  T('AI语音配系统：支持确认和并联串接预览',
    vp6.intent === 'confirm_groups' && vp6.roles[0] === 'fullrange' &&
    vp7.intent === 'set_connection_mode' && vp7.mode === 'parallel' && vp7.units === 2);
  var vp8 = SP.parseSpeakerVoiceCommand('然后再要3只并联的206M', { templates: Store.state.deviceTemplates });
  var vp9 = SP.parseSpeakerVoiceCommand('再加一对有缘全频', { templates: Store.state.deviceTemplates });
  var vp10 = SP.parseSpeakerVoiceCommand('再加一对全频有原音响', { templates: Store.state.deviceTemplates });
  T('AI语音配系统：支持追加、有源错字、一对和并联口语',
    vp8.intent === 'create_speaker_groups' && vp8.mode === 'append' &&
    vp8.groups[0].count === 3 && vp8.groups[0].templateName === '206M' &&
    vp8.groups[0].connectionMode === 'parallel' &&
    vp9.groups[0].active === true && vp9.groups[0].count === 2 &&
    vp10.groups[0].active === true && vp10.groups[0].role === 'fullrange');
  var vp11 = SP.parseSpeakerVoiceCommand('全频串联2只');
  var vp12 = SP.parseSpeakerVoiceCommand('撤销');
  var vp13 = SP.parseSpeakerVoiceCommand('功放用SA2002，调音台用WING RACK');
  T('AI语音配系统：串联纠正、撤销和系统设备交给智能选配',
    vp11.intent === 'set_connection_mode' && vp11.mode === 'parallel' && vp11.units === 2 &&
    vp12.intent === 'undo_last' && vp13.intent === 'ignore_system_device');
  function tryRun(name, fn) {
    var err = null;
    try { fn(); } catch (e) { err = e; }
    T(name, !err, err && (err + ' @ ' + ((err.stack || '').split('\n')[0] || '')));
  }
  tryRun('快速布局面板 openQuickLayout', function () { SP.openQuickLayout(); });
  var qlHtml = registry['modal-box'].innerHTML;
  T('快速布局默认优先音响反推，且数量布局仍可切换',
    qlHtml.indexOf('data-ql-mode="reverse"') < qlHtml.indexOf('data-ql-mode="count"') &&
    /class="active" data-ql-mode="reverse"/.test(qlHtml) &&
    qlHtml.indexOf('id="ql-pane-rv" style="display:none"') < 0 &&
    qlHtml.indexOf('id="ql-pane-count" style="display:none"') >= 0);
  T('反推底部含查看反推过程/保存反推模板，且移除更新到一键模板',
    qlHtml.indexOf('查看当前案例反推过程') >= 0 &&
    qlHtml.indexOf('保存为反推模板') >= 0 &&
    qlHtml.indexOf('更新到一键模板') < 0);
  T('反推为多组卡片（数量→功率→阻抗竖排）+ 可加组 + Shift 有源',
    qlHtml.indexOf('rv-cards') >= 0 &&
    qlHtml.indexOf('data-rv-cnt') >= 0 &&
    qlHtml.indexOf('data-rv-w') >= 0 &&
    qlHtml.indexOf('data-act="rv-add"') >= 0 &&
    qlHtml.indexOf('rv-toggle-active') >= 0);
  T('反推输入为纯文本打字（无 number 加减框）',
    qlHtml.indexOf('data-num') >= 0 &&
    registry['modal-box'].innerHTML.indexOf('id="ql-pane-rv"') >= 0);
  T('模板下拉为（选择模板），界面无“手填”字样',
    qlHtml.indexOf('（选择模板）') >= 0 && qlHtml.indexOf('手填') < 0);
  T('数量布局和反推模板都有明确调用入口',
    qlHtml.indexOf('调用数量模板') >= 0 && qlHtml.indexOf('id="ql-preset-select"') >= 0 &&
    qlHtml.indexOf('调用反推模板') >= 0 && qlHtml.indexOf('id="rv-preset-select"') >= 0);
  T('数量布局含智能配接结果区',
    qlHtml.indexOf('id="ql-calc"') >= 0 && qlHtml.indexOf('智能配接') >= 0);
  T('反推功率倍率文案改为余量倍率',
    qlHtml.indexOf('余量倍率（场景）') >= 0 && qlHtml.indexOf('功率倍率（场景）') < 0);
  T('反推含超低独立余量倍率',
    qlHtml.indexOf('超低余量倍率') >= 0 && qlHtml.indexOf('id="rv-subratio"') >= 0 &&
    qlHtml.indexOf('2 · 默认超低') >= 0);
  T('反推为上下结构 + 功放自动匹配标记',
    qlHtml.indexOf('rv-stack') >= 0 && qlHtml.indexOf('rv-settings-panel') >= 0 &&
    qlHtml.indexOf('rv-result-panel') >= 0 && qlHtml.indexOf('rv-right') < 0 &&
    qlHtml.indexOf('rv-amp2-flag') >= 0);
  T('语音识别已移除，反推弹窗保留型号候选和独立/并联串接状态',
    typeof window.SpeechRecognitionHandler === 'undefined' &&
    typeof SP.startGlobalSpeakerVoice === 'undefined' &&
    typeof SP.initGlobalSpeakerAi === 'undefined' &&
    qlHtml.indexOf('rv-ai-float') < 0 &&
    qlHtml.indexOf('rv-tpl-chip') >= 0 && qlHtml.indexOf('接线方式') >= 0 &&
    qlHtml.indexOf('独立') >= 0 && qlHtml.indexOf('并联串接') >= 0 &&
    qlHtml.indexOf('暂不支持串联') < 0);
  /* ---- 小蝶引导（纯点击，替代语音入口）---- */
  T('小蝶引导入口就绪', typeof SP.initGuide === 'function' && !!SP.Guide &&
    typeof SP.Guide.go === 'function' && typeof SP.Guide.act === 'function' &&
    typeof SP.Guide.spotlight === 'function');
  T('小蝶三秒欢迎词已配置', SP.Guide.welcomeDuration === 3000 &&
    Array.isArray(SP.Guide.welcomeLines) && SP.Guide.welcomeLines.length >= 5 &&
    SP.Guide.welcomeLines.some(function (line) { return line.indexOf('3 秒反推系统') >= 0; }));
  tryRun('引导主菜单渲染（状态感知）', function () {
    SP.closeModal();
    SP.Guide.go('home');
    if (!registry['guide-msg'].innerHTML || registry['guide-opts'].innerHTML.indexOf('常见问题') < 0) {
      throw new Error('主菜单没有渲染出选项');
    }
  });
  tryRun('引导数量步骤：输入框与型号下拉', function () {
    SP.Guide.go('counts');
    var ex = registry['guide-extra'].innerHTML;
    if (ex.indexOf('guide-n-full') < 0 || ex.indexOf('guide-n-sub') < 0 ||
        ex.indexOf('智能推荐') < 0 || registry['guide-msg'].innerHTML.indexOf('全频') < 0) {
      throw new Error('数量步骤缺输入或型号选择');
    }
  });
  tryRun('引导填数量 → 自动写进反推并选库存最多', function () {
    document.getElementById('guide-n-full').value = '6';
    document.getElementById('guide-n-sub').value = '4';
    document.getElementById('guide-tpl-full').value = '';
    document.getElementById('guide-tpl-sub').value = '';
    SP.Guide.act('counts-apply');
    var h = registry['rv-cards-wrap'].innerHTML;
    if (h.indexOf('206M') < 0 && h.indexOf('DO115') < 0) throw new Error('全频组没有按库存自动选型');
    if (h.indexOf('DO118S') < 0) throw new Error('超低组没有落卡片');
    if (registry['guide-msg'].innerHTML.indexOf('确认') < 0) throw new Error('没有进入确认引导步骤');
  });
  tryRun('引导确认音响组 → 创建步骤', function () {
    SP.Guide.act('confirm-groups');
    if (registry['guide-msg'].innerHTML.indexOf('创建') < 0) throw new Error('没有进入创建步骤');
  });
  tryRun('引导高亮带路 spotlight', function () {
    if (!SP.Guide.spotlight('ql-confirm', { persist: true })) throw new Error('spotlight 找不到目标');
    if (!registry['ql-confirm'].classList.contains('guide-spot')) throw new Error('目标没有加高亮类');
    SP.Guide.close();
    if (registry['ql-confirm'].classList.contains('guide-spot')) throw new Error('关闭小蝶后高亮文字仍残留');
  });
  tryRun('引导常见问题列表与回答', function () {
    SP.Guide.go('faq');
    if (registry['guide-opts'].innerHTML.indexOf('Dante') < 0) throw new Error('FAQ 列表缺项');
    SP.Guide.act('faq-cable');
    if (registry['guide-msg'].innerHTML.indexOf('线材') < 0) throw new Error('FAQ 回答没有渲染');
  });
  T('小蝶五门基础教学已注册', !!SP.Guide.courses &&
    ['templates', 'reverse', 'cables', 'report', 'excel'].every(function (id) {
      return !!SP.Guide.courses[id];
    }));
  T('小蝶主界面进阶教学已注册', !!SP.Guide.courses &&
    ['advanced-global', 'advanced-config-json', 'advanced-config-switch', 'advanced-views', 'advanced-canvas',
      'advanced-viewport', 'advanced-inspector'].every(function (id) {
      return !!SP.Guide.courses[id] && SP.Guide.courses[id].level === 'advanced';
    }));
  T('主界面关键按钮均纳入进阶教学且危险操作只讲解', (function () {
    var ids = ['advanced-global', 'advanced-config-json', 'advanced-config-switch', 'advanced-views', 'advanced-canvas',
      'advanced-viewport', 'advanced-inspector'];
    var steps = [];
    ids.forEach(function (id) { steps = steps.concat(SP.Guide.courses[id].steps || []); });
    var targets = steps.map(function (s) { return s.target; });
    var required = ['#btn-theme', '#btn-report', '#btn-quick', '#btn-templates', '#btn-config',
      '#btn-clear', '#btn-keys', '#btn-undo', '#btn-redo', '#btn-smart-all-diagram',
      '#btn-clear-all-wires-diagram', '#btn-clear-devices-diagram', '#btn-power-alarm',
      '#btn-diagram-orient', '#btn-diagram-align-default', '#btn-diagram-align-relative',
      '#diagram-scope', '#btn-zoom-fit', '#btn-zoom-shortcut-fit', '#btn-zoom-shortcut-out',
      '#zoom-range', '#btn-zoom-shortcut-in', '#btn-diagram-export',
      '#insp-add', '#drawer-toggle', '#cfg-export', '#cfg-import', '#cfg-tpl-export',
      '#cfg-tpl-import', '#cfg-slot-list', '[data-slot-use]', '[data-slot-hide]'];
    var danger = steps.filter(function (s) {
      return ['#btn-clear', '#btn-clear-all-wires-diagram', '#btn-clear-devices-diagram']
        .indexOf(s.target) >= 0;
    });
    return required.every(function (target) { return targets.indexOf(target) >= 0; }) &&
      danger.length === 3 && danger.every(function (s) { return s.manual && !s.wait; });
  })());
  tryRun('教学首页显示基础与进阶课程且每次只有一条拓展', function () {
    SP.Guide.go('home');
    var h = registry['guide-extra'].innerHTML;
    var courseN = (h.match(/class="gd-course/g) || []).length;
    var tipN = (h.match(/class="gd-tip/g) || []).length;
    if (courseN < 12 || tipN !== 1 || h.indexOf('Excel 导出') < 0 ||
        h.indexOf('第一主界面 · 进阶教学') < 0 || h.indexOf('申请免学') < 0) {
      throw new Error('课程中心内容不完整');
    }
  });
  T('配置进阶课讲清单套全局快照与逐套导出边界', (function () {
    var json = SP.Guide.courses['advanced-config-json'].steps;
    var slots = SP.Guide.courses['advanced-config-switch'].steps;
    var text = json.concat(slots).map(function (s) {
      return typeof s.text === 'string' ? s.text : '';
    }).join(' ');
    var deleteStep = slots.filter(function (s) {
      return s.target === '[data-slot-del]:not([disabled])';
    })[0];
    return json[0].ensure === 'main' && slots[0].ensure === 'main' &&
      text.indexOf('完整全局快照') >= 0 && text.indexOf('逐套切换、逐套核对、逐套导出') >= 0 &&
      text.indexOf('不是把两个项目合并') >= 0 && deleteStep && deleteStep.manual && !deleteStep.wait;
  })());
  tryRun('模板教学支持下载导入与当前案例提取双路线', function () {
    SP.Guide.startCourse('templates');
    SP.Guide.nextCourse();
    if (registry['guide-opts'].innerHTML.indexOf('下载表格并导入') < 0 ||
        registry['guide-opts'].innerHTML.indexOf('从当前案例提取') < 0) {
      throw new Error('模板教学缺少双路线选择');
    }
    SP.Guide.act('course-path-download');
    if (registry['guide-msg'].innerHTML.indexOf('下载填写模版表') < 0) {
      throw new Error('没有进入下载填写路线');
    }
  });
  tryRun('教学进度可暂停并恢复', function () {
    SP.Guide.act('course-pause');
    var p1 = SP.Guide.progress();
    if (!p1.active || p1.active.id !== 'templates') throw new Error('暂停后进度丢失');
    SP.Guide.resumeCourse();
    if (registry['guide-msg'].innerHTML.indexOf('下载填写模版表') < 0) {
      throw new Error('恢复后没有回到原步骤');
    }
  });
  tryRun('基础教学可申请免学且保留回看入口', function () {
    SP.Guide.act('course-skip-request');
    if (registry['guide-opts'].innerHTML.indexOf('确认申请免学') < 0) {
      throw new Error('免学缺少二次确认');
    }
    SP.Guide.act('course-skip-confirm');
    var p = SP.Guide.progress();
    if (!['templates', 'reverse', 'cables', 'report', 'excel'].every(function (id) {
      return p.skipped[id];
    })) throw new Error('基础课程没有全部标记免学');
    SP.Guide.go('home');
    if (registry['guide-extra'].innerHTML.indexOf('已免学 · 可回看') < 0) {
      throw new Error('免学后没有保留回看状态');
    }
    SP.Guide.startCourse('templates');
    if (registry['guide-msg'].innerHTML.indexOf('模板库') < 0) {
      throw new Error('免学课程无法重新回看');
    }
    SP.Guide.act('course-pause');
  });
  tryRun('AI语音配系统：命令应用到反推卡片', function () {
	    SP.closeModal();
	    SP.openQuickLayout({ mode: 'reverse' });
	    SP.applySpeakerVoiceCommand('我要8个全频，4个超低');
	    SP.applySpeakerVoiceCommand('全频要206M，超低型号是DO118S');
	    var h1 = registry['rv-cards-wrap'].innerHTML;
	    if (h1.indexOf('206M') < 0 || h1.indexOf('DO118S') < 0 ||
	        h1.indexOf('待确认') < 0 || h1.indexOf('独立') < 0) {
	      throw new Error('语音创建/选型未渲染到卡片');
	    }
    SP.applySpeakerVoiceCommand('全频并联串接2只');
    var h2 = registry['rv-cards-wrap'].innerHTML;
    if (h2.indexOf('确认并联串接') < 0 || h2.indexOf('并联串接2只') < 0) throw new Error('未生成并联串接预览');
    SP.applySpeakerVoiceCommand('确认并联串接');
    var h3 = registry['rv-cards-wrap'].innerHTML;
    if (h3.indexOf('确认并联串接') >= 0 ||
        (h3.indexOf('并联串接 2 只 / 通道') < 0 && h3.indexOf('并联串接2只') < 0)) {
      throw new Error('并联串接确认未生效');
    }
    SP.applySpeakerVoiceCommand('两个都确认');
    if (registry['rv-cards-wrap'].innerHTML.indexOf('已确认') < 0) throw new Error('组确认状态未生效');
    SP.applySpeakerVoiceCommand('再加一对有缘全频');
    if (registry['rv-cards-wrap'].innerHTML.indexOf('有源全频') < 0) throw new Error('有源全频未加入反推卡片');
    SP.applySpeakerVoiceCommand('撤销');
    if (registry['rv-cards-wrap'].innerHTML.indexOf('有源全频') >= 0) throw new Error('撤销没有回退上一条语音添加');
  });
  SP.closeModal();
  /* 1：重复打开面板不叠加委托监听（此前输入 1 变 11 的根因回归） */
  tryRun('重复打开面板：输入 1 仍是 1（监听器已去重）', function () {
    SP.openQuickLayout();
    SP.closeModal();
    SP.openQuickLayout();
    var cell = {
      tagName: 'INPUT', value: '',
      getAttribute: function (a) { return a === 'data-ql-count' ? '0' : null; },
      closest: function () { return null; },
      focus: function () {}, select: function () {}
    };
    registry['modal-box'].fire('keydown', {
      key: '1', code: 'Digit1', target: cell,
      preventDefault: function () {}, stopPropagation: function () {}
    });
    if (cell.value !== '1') throw new Error('监听器叠加：按 1 得到 "' + cell.value + '"');
  });
  SP.closeModal();
  /* 严格桩：getElementById 只认已渲染进 modal-box 的 id，未渲染返回 null，
     确保 openQuickLayout 初始化全程无 null 绑定异常（事件委托结构验证） */
  tryRun('严格桩下 openQuickLayout 初始化无异常', function () {
    var realGet = document.getElementById;
    document.getElementById = function (id) {
      if (id === 'modal-overlay' || id === 'modal-box') return realGet(id);
      var html = registry['modal-box'] ? registry['modal-box'].innerHTML : '';
      return html.indexOf('id="' + id + '"') >= 0 ? realGet(id) : null;
    };
    try { SP.openQuickLayout(); } finally { document.getElementById = realGet; }
  });
  SP.closeModal();
  tryRun('添加设备弹窗 openAddDevice', function () { SP.openAddDevice(); SP.closeModal(); });
  tryRun('模板面板 openTemplatePanel', function () { SP.openTemplatePanel(); });
  var tplPanelHtml = registry['modal-box'].innerHTML + (registry['tplp-body'] ? registry['tplp-body'].innerHTML : '');
  T('模板库面板含预览/下载/导出导入/提取/内部撤销',
    tplPanelHtml.indexOf('模板库导出') >= 0 &&
    tplPanelHtml.indexOf('模板库预览') >= 0 &&
    tplPanelHtml.indexOf('下载填写模版表') >= 0 &&
    tplPanelHtml.indexOf('导出导入') >= 0 &&
    tplPanelHtml.indexOf('提取当前案例中的模板') >= 0 &&
    tplPanelHtml.indexOf('模板库内部操作') >= 0);
  tryRun('配置面板说明完整配置包含模板库且支持多配置切换', function () {
    SP.closeModal();
    registry['btn-config'].fire('click');
    var cfgHtml = registry['modal-box'].innerHTML;
    if (cfgHtml.indexOf('完整全局快照') < 0 || cfgHtml.indexOf('模板库和各类预设') < 0 ||
        cfgHtml.indexOf('多套完整配置间对比') < 0) throw new Error('配置数据边界说明不完整');
    SP.closeModal();
  });
  T('单文件与文件夹 CSV 导入入口就绪',
    typeof SP.pickCsvImport === 'function' && typeof SP.pickCsvFolder === 'function' &&
    typeof SP.importCsvFolder === 'function' && typeof SP.catFromFilename === 'function');
  /* 文件名类目推断：按类目命名的单表 CSV 正确归类 */
  T('catFromFilename：有源优先于同名', SP.catFromFilename('全频有源.csv') === 'afullrange' &&
    SP.catFromFilename('超低有源.csv') === 'asub' &&
    SP.catFromFilename('全频.csv') === 'fullrange' && SP.catFromFilename('超低.csv') === 'sub' &&
    SP.catFromFilename('功放.csv') === 'amp' && SP.catFromFilename('DSP.csv') === 'dsp' &&
    SP.catFromFilename('调音台.csv') === 'mixer' && SP.catFromFilename('模板总表.xls') === null);
  var subCsv = '型号名称,输入路数,输出路数,功率W,阻抗Ω,尺寸（寸）\nSUB218,1,1,1000,4,18';
  var subPlain = SP.parseTemplatesFromText(subCsv);
  var subHinted = SP.parseTemplatesFromText(subCsv, { catHint: 'sub' });
  T('超低.csv 无提示误判全频、有提示归类超低',
    subPlain.templates[0].speakerRole === 'fullrange' &&
    subHinted.templates[0].speakerRole === 'sub' && subHinted.templates[0].specs.ohms === '4');
  var ampPlain = SP.parseTemplatesFromText('型号名称,输入路数,输出路数,机柜U数,功率W\nFA900,2,2,2,900');
  var ampHinted = SP.parseTemplatesFromText('型号名称,输入路数,输出路数,机柜U数,功率W\nFA900,2,2,2,900', { catHint: 'amp' });
  T('功放.csv 无提示不认、有提示识别为功放',
    ampPlain === null && ampHinted.templates[0].type === 'amp' &&
    ampHinted.templates[0].specs.power === '900' && ampHinted.templates[0].specs.rackU === '2');
  var dspHinted = SP.parseTemplatesFromText('型号名称,输入路数,输出路数,机柜U数\nUnit48,4,8,1', { catHint: 'dsp' });
  T('DSP.csv 有提示识别为 DSP', dspHinted.templates[0].type === 'dsp' &&
    dspHinted.templates[0].ins === 4 && dspHinted.templates[0].outs === 8);
  /* 总表（带类别列）不被文件名提示覆盖 */
  var totalCsv = '类别,型号名称,输入路数,输出路数,机柜U数,功率W,阻抗Ω,尺寸（寸）\n功放,FA900,2,2,2,900,,\n超低,SUB,1,1,,1000,4,18';
  var totalHinted = SP.parseTemplatesFromText(totalCsv, { catHint: 'fullrange' });
  T('总表带类别列时忽略文件名提示',
    totalHinted.templates.length === 2 && totalHinted.templates[0].type === 'amp' &&
    totalHinted.templates[1].speakerRole === 'sub');
  var wbSheets = SP.templateWorkbookSheets();
  T('模板总表按类目分 sheet 且顺序正确',
    wbSheets.map(function (s) { return s.name; }).join('|') ===
    '全频|超低|全频有源|超低有源|功放|DSP|调音台');
  T('模板总表各类字段差异化',
    wbSheets[0].columns.join('|') === '型号名称|输入路数|输出路数|功率W|阻抗Ω|尺寸（寸）' &&
    wbSheets[2].columns.join('|') === '型号名称|输入路数|输出路数|功率W|尺寸（寸）' &&
    wbSheets[4].columns.join('|') === '型号名称|输入路数|输出路数|机柜U数|功率W@8Ω|4Ω功率W(选填)|最低负载Ω(选填，默认4)' &&
    wbSheets[5].columns.join('|') === '型号名称|输入路数|输出路数|机柜U数');
  SP.closeModal();
  tryRun('CSV 批量导入支持尺寸文本', function () {
    SP.importCsvTemplates('\ufeff型号名称,分支(全频/超低/线阵列),有源无源(有源/无源),功率W,阻抗Ω,尺寸（寸）\n双6寸测试,全频,无源,350,8,双6寸');
  });
  var textSizeTpl = Store.state.deviceTemplates.filter(function (t) { return t.name === '双6寸测试'; })[0];
  T('CSV 尺寸（寸）可保存“双6寸”', textSizeTpl && textSizeTpl.specs && textSizeTpl.specs.size === '双6寸');
  tryRun('CSV 总表批量导入支持多类模板', function () {
    SP.importCsvTemplates('\ufeff类别,型号名称,输入路数,输出路数,机柜U数,功率W@8Ω,4Ω功率W(选填),阻抗Ω,尺寸（寸）\n全频有源,总表双6寸,1,1,,350,,,双6寸\n功放,总表四通道功放,4,4,2,1200,1800,4,');
  });
  var totalActiveTpl = Store.state.deviceTemplates.filter(function (t) { return t.name === '总表双6寸'; })[0];
  var totalAmpTpl = Store.state.deviceTemplates.filter(function (t) { return t.name === '总表四通道功放'; })[0];
  T('CSV 总表导入有源尺寸文本与功放路数',
    totalActiveTpl && totalActiveTpl.specs.powered === 'active' &&
    totalActiveTpl.specs.size === '双6寸' &&
    totalAmpTpl && totalAmpTpl.ins === 4 && totalAmpTpl.outs === 4 &&
    totalAmpTpl.specs.power === '1200' && totalAmpTpl.specs.power4 === '1800' &&
    totalAmpTpl.specs.ohms === '4');
  tryRun('模板总表 xls 多 sheet 可导入', function () {
    SP.importCsvTemplates(SP.buildTemplateWorkbookXml());
  });
  var xlsActiveTpl = Store.state.deviceTemplates.filter(function (t) { return t.name === '有源双6寸'; })[0];
  T('xls sheet 导入保留有源尺寸文本',
    xlsActiveTpl && xlsActiveTpl.specs.powered === 'active' && xlsActiveTpl.specs.size === '双6寸');
  /* 纯解析函数：识别表头返回模板数组，不识别返回 null */
  var parsedGood = SP.parseTemplatesFromText('\ufeff型号名称,通道数(2或4),功率W@8Ω,4Ω功率W(选填),最低负载Ω(选填，默认4),U数\nFA解析,4,900,1350,4,2');
  T('parseTemplatesFromText 识别功放表', parsedGood && parsedGood.templates.length === 1 &&
    parsedGood.templates[0].type === 'amp' && parsedGood.templates[0].ins === 4 &&
    parsedGood.templates[0].specs.power4 === '1350' && parsedGood.templates[0].specs.ohms === '4');
  T('parseTemplatesFromText 无法识别返回 null', SP.parseTemplatesFromText('无关内容\n1,2,3') === null);
  T('folder/prompt 导入入口存在',
    typeof SP.importCsvFolder === 'function' && typeof SP.pickCsvFolder === 'function' &&
    typeof SP.promptTemplateLibImport === 'function');
  /* 覆盖导入弹窗渲染出「覆盖/合并」两个选项 */
  tryRun('模板库导入弹窗（覆盖/合并）', function () {
    SP.promptTemplateLibImport({ __signalpathTplLib: 1, deviceTemplates: [], quickPresets: [],
      reversePresets: [], userMixerTemplates: [] });
  });
  var libDlgHtml = registry['modal-box'].innerHTML;
  T('导入弹窗含覆盖与合并按钮',
    libDlgHtml.indexOf('覆盖当前模板库') >= 0 && libDlgHtml.indexOf('合并入当前模板库') >= 0);
  SP.closeModal();
  tryRun('快捷键面板 openKeysPanel', function () { SP.openKeysPanel(); SP.closeModal(); });
  T('重做默认快捷键为⌘X', SP.actionCombo('redo') === '⌘X');
  T('导出文件名前缀为 ErosIris-Link+日期',
    SP.exportFilename('系统框图-4K', 'png').indexOf('ErosIris-Link+') === 0 &&
    SP.exportFilename('ErosIris-Link-设备清单.csv').indexOf('ErosIris-Link+') === 0 &&
    SP.exportFilename('ErosIris-Link-设备清单.csv').indexOf('设备清单.csv') > 0);

  /* 造点数据再测数据相关入口 */
  var tpls = Store.state.deviceTemplates;
  function tplFor(type, role) {
    for (var i = 0; i < tpls.length; i++) {
      var t = tpls[i];
      if (t.type !== type) continue;
      if (type === 'speaker' && (t.speakerRole || 'fullrange') !== role) continue;
      return t;
    }
    return null;
  }
  Store.quickLayout([
    { tpl: tplFor('mixer'), count: 1 },
    { tpl: tplFor('dsp'), count: 1 },
    { tpl: tplFor('amp'), count: 2 },
    { tpl: tplFor('speaker', 'fullrange'), count: 2, powered: 'active' },
    { tpl: tplFor('speaker', 'sub'), count: 1, powered: 'passive' }
  ]);
  tryRun('renderAll（带数据）', function () { SP.renderAll(); });
  T('设备栏渲染出列表行', registry['insp-body'].innerHTML.indexOf('insp-row') >= 0);
  T('设备栏含数量统计（有源全频）', registry['insp-body'].innerHTML.indexOf('insp-stats') >= 0 &&
    registry['insp-body'].innerHTML.indexOf('有源全频') >= 0);
  T('框图音响线带插头块（音箱线视觉）', registry['wiring-diagram'].innerHTML.indexOf('rx="2"') >= 0);
  var mixer = Store.state.devices.filter(function (d) { return d.type === 'mixer'; })[0];
  tryRun('选中设备 → 检查器详情', function () { SP.selectDevice(mixer.id, false); });
  T('详情包含路由区块', registry['insp-body'].innerHTML.indexOf('路由 · 输入来源') >= 0);
  var amp = Store.state.devices.filter(function (d) { return d.type === 'amp'; })[0];
  tryRun('选中功放 → P/S/B 对', function () { SP.selectDevice(amp.id, false); });
  T('详情包含功放输出对', registry['insp-body'].innerHTML.indexOf('B桥接') >= 0);
  /* 真浏览器中 innerHTML 赋值后子按钮必然可查；桩需模拟 */
  document.getElementById('ctx-menu').querySelector = function () { return makeEl(''); };
  tryRun('右键菜单 showDeviceMenu', function () { SP.showDeviceMenu(amp.id, 100, 100); });
  tryRun('教学页 renderTeach', function () { SP.renderTeach(); });
  T('教学页设备列表非空', registry['teach-dev-list'].innerHTML.indexOf('teach-dev-btn') >= 0);
  T('教学示意图有 SVG', registry['teach-diagram'].innerHTML.indexOf('<svg') >= 0);
  tryRun('线材页 renderCables', function () { SP.renderCables(); });
  T('线材汇总卡片非空', registry['cable-summary'].innerHTML.indexOf('cable-card') >= 0);
  T('线材页含设备/OUT批量选择与默认覆盖', registry['cable-table-wrap'].innerHTML.indexOf('cable-source-picker') >= 0 &&
    registry['cable-table-wrap'].innerHTML.indexOf('cable-dev-head') >= 0 &&
    registry['cable-table-wrap'].innerHTML.indexOf('dev-batch') >= 0 &&
    registry['cable-table-wrap'].innerHTML.indexOf('覆盖已填') >= 0 &&
    registry['cable-table-wrap'].innerHTML.indexOf('checked') >= 0);
  tryRun('连接清单表 renderWiringTable', function () { SP.renderWiringTable(); });
  T('连接清单含 lenM 输入框', registry['wiring-table-wrap'].innerHTML.indexOf('conn-len') >= 0);
  tryRun('报告选项弹窗 openReportOptions（含预览生成）', function () { SP.openReportOptions(); });
  T('报告预览已生成（srcdoc 非空）', (registry['report-preview'].srcdoc || '').indexOf('EROSIRIS-LINK') >= 0);
  T('报告含线材购买汇总', registry['report-preview'].srcdoc.indexOf('线材购买汇总') >= 0);
  T('报告含机柜长度建议', registry['report-preview'].srcdoc.indexOf('机柜长度建议') >= 0);
  T('报告含供电功率建议', registry['report-preview'].srcdoc.indexOf('供电功率建议') >= 0);
  T('报告含三档演出级别', registry['report-preview'].srcdoc.indexOf('摇滚') >= 0);
  tryRun('功率报警弹窗 openPowerAlarm', function () { SP.openPowerAlarm(); });
  T('功率报警追随余量倍率档位',
    registry['power-alarm-body'].innerHTML.indexOf('1.5 · 驻唱小场') >= 0 &&
    registry['power-alarm-body'].innerHTML.indexOf('最低 ×') >= 0 &&
    registry['power-alarm-body'].innerHTML.indexOf('–×') < 0);
  SP.closeModal();
  tryRun('清 IN / 清 OUT / 复制（选中功放）', function () {
    SP.selectDevice(amp.id, false);
    SP.clearSelectedWires('inputs');
    SP.clearSelectedWires('outputs');
    SP.duplicateSelected();
  });
  tryRun('主题切换重渲染', function () {
    document.documentElement.setAttribute('data-theme', 'light');
    SP.renderAll();
    document.documentElement.setAttribute('data-theme', 'dark');
    SP.renderAll();
  });
  var lightPalette, darkPalette;
  document.documentElement.setAttribute('data-theme', 'light');
  lightPalette = SP.diagramTheme();
  document.documentElement.setAttribute('data-theme', 'dark');
  darkPalette = SP.diagramTheme();
  T('昼夜框图色板同步切换', lightPalette.bg !== darkPalette.bg &&
    lightPalette.title !== darkPalette.title && lightPalette.sel !== darkPalette.sel);
  T('浅色主题下框图仍有内容', registry['wiring-diagram'].innerHTML.indexOf('data-node') >= 0);
  tryRun('0 / 减号 / 加号提示按钮可直接控制缩放', function () {
    SP.diagramZoom = 1;
    registry['btn-zoom-shortcut-in'].fire('click');
    if (Math.abs(SP.diagramZoom - 1.2) > 0.001) throw new Error('加号按钮没有放大');
    registry['btn-zoom-shortcut-out'].fire('click');
    if (Math.abs(SP.diagramZoom - 1) > 0.001) throw new Error('减号按钮没有缩小');
    SP.diagramZoom = 1.6;
    registry['btn-zoom-shortcut-fit'].fire('click');
    if (Math.abs(SP.diagramZoom - 1.6) < 0.001) throw new Error('0 按钮没有切换视角');
  });
  tryRun('缩放 zoomAt / fit / focus', function () {
    var box = registry['wiring-diagram'];
    box.querySelector = function (s) { return null; };   /* 无 svg 桩时应安全返回 */
    SP.zoomAt(box, 1.2);
    SP.fitDiagramZoom(box);
    SP.focusSelectedInDiagram(box);
  });
  /* ---- 交换机路由页 + Dante 报告纳入 ---- */
  var uiSw, uiMx;
  tryRun('交换机 + 网口线 + Dante 分配 + 交换机路由页', function () {
    uiSw = Store.addDevice({ type: 'switch', name: 'UI交换机', ins: 4, outs: 0 });
    uiMx = Store.addDevice({ type: 'mixer', name: 'UI调音台', ins: 8, outs: 8 });
    Store.setActiveMixer(uiMx.id);
    SP.routePageId = uiMx.id;
    var r = Store.addNetLink(uiMx.id, uiSw.id);
    if (!r.ok) throw new Error('网口线失败: ' + r.msg);
    Store.toggleDante(uiMx.id, 'out', 0);
    Store.toggleDante(uiMx.id, 'in', 2);
    SP.renderNetRoute();
  });
  T('交换机路由页签显示', registry['tab-netroute'].hidden === false);
  T('交换机路由页含网口与调音台',
    registry['netroute-body'].innerHTML.indexOf('网口 1') >= 0 &&
    registry['netroute-body'].innerHTML.indexOf('UI调音台') >= 0);
  T('交换机路由页只显示互联状态', registry['netroute-body'].innerHTML.indexOf('net-status-linked') >= 0 &&
    registry['netroute-body'].innerHTML.indexOf('Dante 输出') < 0);
  tryRun('Dante 配置弹窗 openDanteConfig', function () { SP.openDanteConfig(uiMx.id); });
  T('Dante 弹窗有通道 pill', registry['modal-box'].innerHTML.indexOf('rcell-pill') >= 0 ||
    registry['dante-cfg-body'].innerHTML.indexOf('rcell-pill') >= 0 ||
    (registry['modal-box'].innerHTML + '').indexOf('Dante') >= 0);
  SP.closeModal();
  tryRun('台内路由矩阵显示 Dante 色块', function () {
    SP.renderInputPatchGrid();
    SP.renderOutputPatchGrid();
  });
  T('台内路由矩阵含 Dante 色块与图例',
    (registry['in-route-grid-wrap'].innerHTML + registry['out-route-grid-wrap'].innerHTML).indexOf('dante-route') >= 0 &&
    (registry['in-route-grid-wrap'].innerHTML + registry['out-route-grid-wrap'].innerHTML).indexOf('dante-legend') >= 0);
  tryRun('报告纳入网络层（Dante）', function () { SP.openReportOptions(); });
  T('报告含网络层（Dante）', registry['report-preview'].srcdoc.indexOf('网络层（Dante）') >= 0);
  SP.closeModal();
  tryRun('框图渲染 Dante 短网线示意', function () {
    SP.renderWiringDiagram(registry['wiring-diagram']);
  });
  T('框图含 Dante 短网线且不画跨设备网口线',
    registry['wiring-diagram'].innerHTML.indexOf('dante-stub') >= 0 &&
    registry['wiring-diagram'].innerHTML.indexOf('net-edge') < 0);
  T('框图 Dante 标注交换机网口号',
    registry['wiring-diagram'].innerHTML.indexOf('dante-link-tag') >= 0 &&
    registry['wiring-diagram'].innerHTML.indexOf('网口 1') >= 0);
  tryRun('删交换机后路由页自动隐藏', function () {
    Store.removeDevice(uiSw.id);
    SP.renderNetRoute();
  });
  T('无交换机时页签隐藏', registry['tab-netroute'].hidden === true);

  tryRun('清设备：清空当前设备连线图全部设备', function () {
    if (!Store.state.devices.length) throw new Error('测试前应有设备');
    SP.clearDiagramDevicesPrompt();
  });
  T('清设备后设备与连线均为空，模板库保留',
    Store.state.devices.length === 0 && Store.state.connections.length === 0 &&
    Store.state.deviceTemplates.length > 0);

  done = true;
  print('');
  print('结果: ' + pass + ' 通过, ' + fail + ' 失败');
  if (fail) throw new Error(fail + ' UI tests failed');
});
