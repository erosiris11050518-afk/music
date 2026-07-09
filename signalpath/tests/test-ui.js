/* SignalPath v2 UI 启动路径测试：完整加载 + DOMContentLoaded + 各弹窗入口不抛异常 */

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
load('js/keys.js');
load('js/cables.js');
load('js/mixer.js');
load('js/teach.js');
load('js/report.js');
load('js/main.js');

print('== 模块加载 ==');
T('全部 11 个模块加载无异常', true);
T('SP.Store / renderAll 前置就绪', !!SP.Store && !!SP.renderWiringDiagram);

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
  function tryRun(name, fn) {
    var err = null;
    try { fn(); } catch (e) { err = e; }
    T(name, !err, err && (err + ' @ ' + ((err.stack || '').split('\n')[0] || '')));
  }
  tryRun('快速布局面板 openQuickLayout', function () { SP.openQuickLayout(); });
  var qlHtml = registry['modal-box'].innerHTML;
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
  T('反推为上下结构 + 功放自动匹配标记',
    qlHtml.indexOf('rv-stack') >= 0 && qlHtml.indexOf('rv-settings-panel') >= 0 &&
    qlHtml.indexOf('rv-result-panel') >= 0 && qlHtml.indexOf('rv-right') < 0 &&
    qlHtml.indexOf('rv-amp2-flag') >= 0);
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
  var wbSheets = SP.templateWorkbookSheets();
  T('模板总表按类目分 sheet 且顺序正确',
    wbSheets.map(function (s) { return s.name; }).join('|') ===
    '全频|超低|全频有源|超低有源|功放|DSP|调音台');
  T('模板总表各类字段差异化',
    wbSheets[0].columns.join('|') === '型号名称|输入路数|输出路数|功率W|阻抗Ω|尺寸（寸）' &&
    wbSheets[2].columns.join('|') === '型号名称|输入路数|输出路数|功率W|尺寸（寸）' &&
    wbSheets[4].columns.join('|') === '型号名称|输入路数|输出路数|机柜U数|功率W' &&
    wbSheets[5].columns.join('|') === '型号名称|输入路数|输出路数|机柜U数');
  SP.closeModal();
  tryRun('CSV 批量导入支持尺寸文本', function () {
    SP.importCsvTemplates('\ufeff型号名称,分支(全频/超低/线阵列),有源无源(有源/无源),功率W,阻抗Ω,尺寸（寸）\n双6寸测试,全频,无源,350,8,双6寸');
  });
  var textSizeTpl = Store.state.deviceTemplates.filter(function (t) { return t.name === '双6寸测试'; })[0];
  T('CSV 尺寸（寸）可保存“双6寸”', textSizeTpl && textSizeTpl.specs && textSizeTpl.specs.size === '双6寸');
  tryRun('CSV 总表批量导入支持多类模板', function () {
    SP.importCsvTemplates('\ufeff类别,型号名称,输入路数,输出路数,机柜U数,功率W,阻抗Ω,尺寸（寸）\n全频有源,总表双6寸,1,1,,350,,双6寸\n功放,总表四通道功放,4,4,2,1200,,');
  });
  var totalActiveTpl = Store.state.deviceTemplates.filter(function (t) { return t.name === '总表双6寸'; })[0];
  var totalAmpTpl = Store.state.deviceTemplates.filter(function (t) { return t.name === '总表四通道功放'; })[0];
  T('CSV 总表导入有源尺寸文本与功放路数',
    totalActiveTpl && totalActiveTpl.specs.powered === 'active' &&
    totalActiveTpl.specs.size === '双6寸' &&
    totalAmpTpl && totalAmpTpl.ins === 4 && totalAmpTpl.outs === 4 &&
    totalAmpTpl.specs.power === '1200');
  tryRun('模板总表 xls 多 sheet 可导入', function () {
    SP.importCsvTemplates(SP.buildTemplateWorkbookXml());
  });
  var xlsActiveTpl = Store.state.deviceTemplates.filter(function (t) { return t.name === '有源双6寸'; })[0];
  T('xls sheet 导入保留有源尺寸文本',
    xlsActiveTpl && xlsActiveTpl.specs.powered === 'active' && xlsActiveTpl.specs.size === '双6寸');
  /* 纯解析函数：识别表头返回模板数组，不识别返回 null */
  var parsedGood = SP.parseTemplatesFromText('\ufeff型号名称,通道数(2或4),功率W,U数\nFA解析,4,900,2');
  T('parseTemplatesFromText 识别功放表', parsedGood && parsedGood.templates.length === 1 &&
    parsedGood.templates[0].type === 'amp' && parsedGood.templates[0].ins === 4);
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
    SP.exportFilename('signalpath-设备清单.csv').indexOf('ErosIris-Link+') === 0 &&
    SP.exportFilename('signalpath-设备清单.csv').indexOf('设备清单.csv') > 0);

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
  T('报告预览已生成（srcdoc 非空）', (registry['report-preview'].srcdoc || '').indexOf('SIGNALPATH') >= 0);
  T('报告含线材购买汇总', registry['report-preview'].srcdoc.indexOf('线材购买汇总') >= 0);
  T('报告含机柜长度建议', registry['report-preview'].srcdoc.indexOf('机柜长度建议') >= 0);
  T('报告含供电功率建议', registry['report-preview'].srcdoc.indexOf('供电功率建议') >= 0);
  T('报告含三档演出级别', registry['report-preview'].srcdoc.indexOf('摇滚') >= 0);
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
  T('浅色主题下框图仍有内容', registry['wiring-diagram'].innerHTML.indexOf('data-node') >= 0);
  tryRun('缩放 zoomAt / fit / focus', function () {
    var box = registry['wiring-diagram'];
    box.querySelector = function (s) { return null; };   /* 无 svg 桩时应安全返回 */
    SP.zoomAt(box, 1.2);
    SP.fitDiagramZoom(box);
    SP.focusSelectedInDiagram(box);
  });

  done = true;
  print('');
  print('结果: ' + pass + ' 通过, ' + fail + ' 失败');
  if (fail) throw new Error(fail + ' UI tests failed');
});
