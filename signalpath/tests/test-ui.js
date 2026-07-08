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
    removeEventListener: function () {},
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

  print('== 各功能入口不抛异常 ==');
  function tryRun(name, fn) {
    var err = null;
    try { fn(); } catch (e) { err = e; }
    T(name, !err, err && (err + ' @ ' + ((err.stack || '').split('\n')[0] || '')));
  }
  tryRun('快速布局面板 openQuickLayout', function () { SP.openQuickLayout(); });
  T('快速布局含查看当前与反推模板工具', registry['modal-box'].innerHTML.indexOf('查看当前') >= 0 &&
    registry['modal-box'].innerHTML.indexOf('保存反推模板') >= 0 &&
    registry['modal-box'].innerHTML.indexOf('更新到一键模板') >= 0);
  SP.closeModal();
  tryRun('添加设备弹窗 openAddDevice', function () { SP.openAddDevice(); SP.closeModal(); });
  tryRun('模板面板 openTemplatePanel', function () { SP.openTemplatePanel(); });
  T('模板面板区分 JSON 模板库与 CSV 批量导入',
    registry['modal-box'].innerHTML.indexOf('导出模板库JSON') >= 0 &&
    registry['modal-box'].innerHTML.indexOf('批量导入CSV') >= 0 &&
    registry['modal-box'].innerHTML.indexOf('下载填写音响模板') >= 0 &&
    registry['modal-box'].innerHTML.indexOf('一键模板') >= 0);
  SP.closeModal();
  tryRun('CSV 批量导入支持尺寸文本', function () {
    SP.importCsvTemplates('\ufeff型号名称,分支(全频/超低/线阵列),有源无源(有源/无源),功率W,阻抗Ω,尺寸（寸）\n双6寸测试,全频,无源,350,8,双6寸');
  });
  var textSizeTpl = Store.state.deviceTemplates.filter(function (t) { return t.name === '双6寸测试'; })[0];
  T('CSV 尺寸（寸）可保存“双6寸”', textSizeTpl && textSizeTpl.specs && textSizeTpl.specs.size === '双6寸');
  tryRun('快捷键面板 openKeysPanel', function () { SP.openKeysPanel(); SP.closeModal(); });

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
