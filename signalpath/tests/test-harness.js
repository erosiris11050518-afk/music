/* SignalPath v2 逻辑回归测试（JavaScriptCore 环境，DOM 桩） */

/* ---------- 环境桩 ---------- */
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
function fakeEl() {
  return {
    innerHTML: '', textContent: '', hidden: true, value: '', disabled: false,
    classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
    style: {},
    addEventListener: function(){},
    querySelector: function(){ return null; },
    querySelectorAll: function(){ return []; },
    setAttribute: function(){}, getAttribute: function(){ return null; }
  };
}
function svgWidth(html) {
  var m = /<svg[^>]* width="([^"]+)"/.exec(html || '');
  return m ? +m[1] : 0;
}
var document = {
  documentElement: { getAttribute: function(){ return 'dark'; }, setAttribute: function(){} },
  getElementById: function(){ return null; },
  addEventListener: function(){},
  createElement: function(){ return fakeEl(); },
  createElementNS: function(){ return fakeEl(); },
  querySelector: function(){ return null; },
  querySelectorAll: function(){ return []; }
};
window.document = document;
var alerts = [];
var alert = function (m) { alerts.push(String(m)); };
window.alert = alert;
var confirm = function(){ return true; };
var setTimeout = function(fn){ fn(); return 0; };
var requestAnimationFrame = function(fn){ fn(); return 0; };
var PointerEvent = undefined;

/* ---------- 预置一份 v1 旧数据，验证迁移 ---------- */
_ls['signalpath-v1'] = JSON.stringify({
  seq: 50,
  devices: [
    { id: 'd1', type: 'mixer', name: '老调音台', img: 'data:image/jpeg;base64,AAA',
      inputs: [{label:'IN 1'},{label:'IN 2'}], outputs: [{label:'OUT 1'},{label:'OUT 2'}] },
    { id: 'd2', type: 'amp', name: '老功放', specs: { power: '800' },
      inputs: [{label:'IN 1'},{label:'IN 2'}],
      outputs: [{label:'OUT 1', gain:'', grounded:false, mode:'B'},
                {label:'OUT 2', gain:'', grounded:false, mode:'B'}] },
    { id: 'd3', type: 'speaker', name: '老音箱', specs: { powered: 'passive', power: '500' },
      speakerRole: 'fullrange', collapsed: true,
      inputs: [{label:'IN 1'}], outputs: [{label:'OUT 1'}] }
  ],
  connections: [
    { sid: 'd1', sport: 0, tid: 'd2', tport: 0, cable: '', color: '', len: '10m 舞台左' },
    { sid: 'd2', sport: 0, tid: 'd3', tport: 0, cable: '', color: '', len: '' },
    { sid: 'd2', sport: 1, tid: 'd3', tport: 0, cable: '', color: '', len: '' }
  ],
  inputGear: [], activeMixerId: 'd1'
});

load('js/db.js');
load('js/store.js');
load('js/diagram.js');

var Store = SP.Store;
var pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; print('  ✓ ' + name); }
  else { fail++; print('  ✗ FAIL: ' + name); }
}
print('== 1. v1 → v2 迁移 ==');
var st = Store.state;
var d1 = Store.getDevice('d1'), d2 = Store.getDevice('d2'), d3 = Store.getDevice('d3');
T('设备迁移完整（3台）', st.devices.length === 3);
T('图片转为 imgId 引用', d1.imgId && d1.img === undefined && SP.Images.get(d1.imgId) === 'data:image/jpeg;base64,AAA');
T('collapsed 已清除', d3.collapsed === undefined);
T('功放端口 mode → ampPairModes B', d2.ampPairModes && d2.ampPairModes[0] === 'B');
var c1 = Store.sourceFor('d2', 0);
T('len "10m 舞台左" → lenM=10 + note', c1.lenM === 10 && c1.note === '舞台左' && c1.len === undefined);
T('桥接对奇数口连线被清理', !Store.consumersOf('d2', 1).length && Store.consumersOf('d2', 0).length === 1);
T('power 设置补齐', st.power && st.power.eff === 0.7);
T('模板有 tplId', st.deviceTemplates.every(function(t){ return !!t.tplId; }));

print('== 2. 桥接输出对 ==');
T('OUT2 隐藏', Store.isHiddenOut(d2, 1) === true);
T('visibleOuts = [0]', JSON.stringify(Store.visibleOuts(d2)) === '[0]');
T('BTL 标签', Store.outLabelOf(d2, 0).indexOf('BTL') >= 0);
var r = Store.connect('d3', 0, 'd2', 1);
T('隐藏口拒绝连线', r.ok === false && r.msg.indexOf('桥接') >= 0);
Store.setAmpPairMode('d2', 0, 'P');
T('切回 P 档后 OUT2 可见', Store.visibleOuts(d2).length === 2);

print('== 3. 智能连接规则 ==');
/* 有源音箱拒接功放输出 */
d3.specs.powered = 'active';
var r2 = Store.connect('d3', 0, 'd2', 0);
T('有源音箱拒接功放输出', r2.ok === false);
d3.specs.powered = 'passive';
var r3 = Store.connect('d3', 0, 'd1', 1);
T('无源音箱拒接线路输出', r3.ok === false);
var r4 = Store.connect('d3', 0, 'd2', 0);
T('无源音箱接功放 OK', r4.ok === true);

print('== 4. 快速布局（1 2 6 10 2）单撤销步骤 ==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
var tpls = Store.state.deviceTemplates;
function tplFor(type, role) {
  for (var i = 0; i < tpls.length; i++) {
    var t = tpls[i];
    if (t.type !== type) continue;
    if (type === 'speaker' && (t.speakerRole || 'fullrange') !== role) continue;
    if (type === 'amp' && t.ins !== 2) continue;   /* 2进2出功放 */
    return t;
  }
  return null;
}
var added = Store.quickLayout([
  { tpl: tplFor('mixer'), count: 1 },
  { tpl: tplFor('dsp'), count: 2 },
  { tpl: tplFor('amp'), count: 6 },
  { tpl: tplFor('speaker', 'fullrange'), count: 10, powered: 'passive' },
  { tpl: tplFor('speaker', 'sub'), count: 2, powered: 'passive' }
]);
T('创建 21 台设备', added.length === 21 && Store.state.devices.length === 21);
T('自动智能连接产生连线', Store.state.connections.length > 10);
var connCount = Store.state.connections.length;
/* 校验连线方向合法：不允许出现硬错误（信号级不匹配）；
   「功率报警」类提示是未填功率的引导性警示，属预期 */
var badConn = Store.state.connections.filter(function(c){ return !!Store.connectionError(c); });
T('智能连接全部无硬错误', badConn.length === 0);
T('自动编号（全频 10号 存在）', Store.state.devices.some(function(d){ return /10号$/.test(d.name); }));
T('快速布局 = 单个撤销步骤', Store.canUndo());
Store.undo();
T('一步撤销后回到空', Store.state.devices.length === 0);
Store.redo();
T('重做恢复 21 台 + 全部连线', Store.state.devices.length === 21 && Store.state.connections.length === connCount);

print('== 5. 统计 ==');
/* 填一些数据 */
Store.state.devices.forEach(function(d){
  if (d.type === 'amp') { d.specs.power = '800'; d.specs.rackU = '2'; }
  if (d.type === 'dsp') d.specs.rackU = '1';
  if (d.type === 'mixer') d.specs.rackU = '3';
});
Store.state.connections.forEach(function(c, i){ c.lenM = i < 5 ? 10 : ''; });
Store.save();
var cs = Store.cableSummary();
var totalRuns = 0, totalMeters = 0, missing = 0;
cs.forEach(function(g){ totalRuns += g.count; totalMeters += g.meters; missing += g.missing; });
T('线材汇总根数 = 连接数', totalRuns === Store.state.connections.length);
T('线材汇总米数 = 50', totalMeters === 50);
T('未填长度统计正确', missing === Store.state.connections.length - 5);
var rack = Store.rackSummary();
T('机柜 U 数 = 3+2+12 = 17', rack.totalU === 17);
T('建议机柜 = 21–23U（含时序器1U + 3–5U 余量）', rack.suggestMin === 21 && rack.suggestMax === 23);
T('无缺 U 设备', rack.missing.length === 0);
var pw = Store.powerSummary();
T('功放功率合计 4800W', pw.ampW === 4800);
T('周边固定 = 150 + 2×50 + 30 = 280W', pw.fixed === 280);
T('三档级别', pw.levels.length === 3);
var std = pw.levels[1];
/* 4800/0.7*0.25 + 280 = 1994.3 → ×1.3 = 2592.6 → 3kW */
T('常规演出档 ≈3kW', std.kw === 3);
T('常规演出档空开 16A（11.8A×1.25→16）', std.breaker === 16);
T('未触发三相建议', std.threePhase === false);

print('== 6. 模板同步 ==');
var ampTpl = tplFor('amp');
var idx = tpls.indexOf(ampTpl);
ampTpl.ins = 4; ampTpl.outs = 4; ampTpl.specs = Object.assign({}, ampTpl.specs, { rackU: '3' });
Store.updateDeviceTemplate(idx, ampTpl);
var n = Store.syncTemplateInstances(idx);
T('同步了 6 台功放', n === 6);
var amp1 = Store.state.devices.filter(function(d){ return d.type === 'amp'; })[0];
T('实例路数已同步为 4进4出', amp1.inputs.length === 4 && amp1.outputs.length === 4);
T('实例 U 数已同步', amp1.specs.rackU === '3');
T('实例名字未被改动', /号$/.test(amp1.name));
T('4通道功放有 2 组对模式', amp1.ampPairModes.length === 2);

print('== 7. 复制 / 清线 ==');
var mixer = Store.state.devices.filter(function(d){ return d.type === 'mixer'; })[0];
Store.cloneDevice(mixer.id, 1);
T('复制后自动编号', Store.state.devices.some(function(d){ return d.type === 'mixer' && /2号$/.test(d.name); }));
var spk = Store.state.devices.filter(function(d){ return d.type === 'speaker'; })[0];
var hadIn = !!Store.sourceFor(spk.id, 0);
Store.clearDeviceConnections(spk.id, 'inputs');
T('清 IN 生效', hadIn && !Store.sourceFor(spk.id, 0));

print('== 8. 框图渲染（DOM 桩，不抛异常 + SVG 内容）==');
var container = fakeEl();
var threw = false;
try { SP.renderWiringDiagram(container); } catch (e) { threw = true; print('    异常: ' + e + (e.stack ? '\n' + e.stack : '')); }
T('renderWiringDiagram 不抛异常', !threw);
T('SVG 含设备节点', container.innerHTML.indexOf('data-node=') >= 0);
T('SVG 含类型标签文字', container.innerHTML.indexOf('调音台') >= 0);
T('SVG 含连线', container.innerHTML.indexOf('class="edge') >= 0);
/* 横版 */
Store.state.diagramOrient = 'h';
threw = false;
try { SP.renderWiringDiagram(container); } catch (e) { threw = true; print('    异常: ' + e); }
T('横版渲染不抛异常', !threw);
Store.state.diagramOrient = 'v';

var m = Store.activeMixer();
threw = false;
try { SP.renderMixerDiagram(container); } catch (e) { threw = true; print('    异常: ' + e); }
T('台内流向图渲染不抛异常', !threw && container.innerHTML.indexOf('<svg') >= 0);

print('== 9. 音响并联（功放口用完自动串接） ==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
var tp2 = Store.state.deviceTemplates;
function tpl2(type, role, ins) {
  for (var i = 0; i < tp2.length; i++) {
    var t = tp2[i];
    if (t.type !== type) continue;
    if (type === 'speaker' && (t.speakerRole || 'fullrange') !== role) continue;
    if (ins && t.ins !== ins) continue;
    return t;
  }
  return null;
}
Store.quickLayout([
  { tpl: tpl2('mixer'), count: 1 },
  { tpl: tpl2('amp', null, 2), count: 1 },                          /* 2进2出功放：只有 2 个音响口 */
  { tpl: tpl2('speaker', 'fullrange'), count: 4, powered: 'passive' },
  { tpl: tpl2('speaker', 'sub'), count: 1, powered: 'passive' }
]);
var spks = Store.state.devices.filter(function(d){ return d.type === 'speaker' && d.speakerRole === 'fullrange'; });
var fed = spks.filter(function(d){ return !!Store.sourceFor(d.id, 0); });
T('默认不自动并联：4 只全频只有 2 只接上功放', fed.length === 2);
var chained = Store.state.connections.filter(function(c){
  var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
  return s && t && s.type === 'speaker' && t.type === 'speaker';
});
T('智能连接不产生音箱→音箱并联', chained.length === 0);
var res9 = Store.smartAssignAll();
T('未接音响数量统计（speakerLeft=3：2全频+1超低）', res9.speakerLeft === 3);
/* 手动并联仍允许：全频1 OUT → 全频3 IN */
var unfed = spks.filter(function(d){ return !Store.sourceFor(d.id, 0); })[0];
var rManual = Store.connect(unfed.id, 0, fed[0].id, 0);
T('手动音箱→音箱并联仍允许', rManual.ok === true);
Store.disconnect(unfed.id, 0);
/* 手动跨级校验：有源→无源仍禁止 */
var act = Store.addDevice({ type:'speaker', name:'有源箱', ins:1, outs:1,
  speakerRole:'fullrange', specs:{ powered:'active' } });
var rr = Store.connect(spks[0].id, 0, act.id, 0);
T('有源音箱输出不能接无源音箱', rr.ok === false);

print('== 10. 新增回归：默认S档 / CSV / 模板库 / 反推公式 ==');
var ampNew = Store.addDevice({ type:'amp', name:'新功放', ins:4, outs:4 });
T('新功放默认 S 档', Store.ampPairMode(ampNew, 0) === 'S' && Store.ampPairMode(ampNew, 1) === 'S');
/* 模板库存档 roundtrip */
Store.addQuickPreset('测试预设', { counts: { amp: 2 } });
Store.addReversePreset('测试反推', { rows: [{ role:'fullrange', name:'A', power:'500', count:'2', parallel:1 }] });
var lib = Store.exportTemplateLib();
T('模板库导出含设备/快速/反推/台面', Array.isArray(lib.deviceTemplates) &&
  Array.isArray(lib.quickPresets) && Array.isArray(lib.reversePresets) && lib.__signalpathTplLib === 1);
var before = Store.state.deviceTemplates.length;
var mres = Store.importTemplateLib({ __signalpathTplLib: 1,
  deviceTemplates: [{ type:'amp', name:'导入功放X', ins:2, outs:2, specs:{ power:'1200' } }],
  quickPresets: [{ name:'测试预设', data:{ counts:{ amp: 3 } } }],
  reversePresets: [{ name:'测试反推', data:{ rows:[{ role:'sub', name:'B', power:'800', count:'4', parallel:2 }] } }],
  userMixerTemplates: [] });
T('模板库导入合并（新增1模板、同名快速/反推预设更新）',
  Store.state.deviceTemplates.length === before + 1 && mres.dev === 1 &&
  Store.state.quickPresets.filter(function(p){ return p.name==='测试预设'; }).length === 1 &&
  Store.state.quickPresets.filter(function(p){ return p.name==='测试预设'; })[0].data.counts.amp === 3 &&
  Store.state.reversePresets.filter(function(p){ return p.name==='测试反推'; })[0].data.rows[0].role === 'sub');
/* mergeTemplate 同名更新 */
var m2 = Store.mergeTemplate({ type:'amp', name:'导入功放X', ins:4, outs:4, specs:{ power:'1500' } });
T('mergeTemplate 同名更新', m2 === 'updated');
/* 模板库导入：覆盖模式清空后完全替换 */
var rres = Store.importTemplateLib({ __signalpathTplLib: 1,
  deviceTemplates: [{ type:'mixer', name:'唯一台', ins:16, outs:8, specs:{} }],
  quickPresets: [], reversePresets: [], userMixerTemplates: [] }, { replace: true });
T('模板库导入覆盖：库中只剩 1 个模板',
  Store.state.deviceTemplates.length === 1 &&
  Store.state.deviceTemplates[0].name === '唯一台' &&
  Store.state.quickPresets.length === 0 && rres.replaced === true);

print('== 11. 音响反推 reverseCalc ==');
var rc1 = Store.reverseCalc(
  [{ name:'A', power:500, ohms:8, count:4, parallel:2 }],
  { ratio:2, ampMode:'4', amp4W:2500, minOhms:4, dspOuts:8 });
T('并联功率需求：500W×2 = 1000W', rc1.rows[0].loadW === 1000);
T('并联折算：需 ≥1334W@8Ω/通道，实际负载侧 2000W',
  rc1.rows[0].needW === 1334 && rc1.rows[0].needLoadW === 2000);
T('并联阻抗减半：4Ω', rc1.rows[0].loadOhm === 4);
T('4只并联2 → 占2路 → 1台4通道', rc1.rows[0].ch === 2 && rc1.amp4N === 1 && rc1.amp2N === 0);
T('功率足够无警告', rc1.warns.length === 0);
var rc2 = Store.reverseCalc(
  [{ name:'B', power:400, ohms:8, count:3, parallel:3 }],
  { ratio:1.5, ampMode:'2', amp2W:5000, minOhms:4 });
T('3只并联 2.67Ω 触发低阻警告', rc2.warns.length === 1 && rc2.warns[0].indexOf('低于功放最低负载') >= 0);
var rc2b = Store.reverseCalc(
  [{ name:'B', power:400, ohms:8, count:3, parallel:3 }],
  { ratio:1.5, ampMode:'2', amp2W:5000, minOhms:2 });
T('切 2Ω 低阻机型后不再警告', rc2b.warns.length === 0);
var rc3 = Store.reverseCalc(
  [{ name:'C', power:500, ohms:8, count:10, parallel:1 }],
  { ratio:1.5, ampMode:'mix', amp2W:800, amp4W:800, minOhms:4, dspOuts:8 });
T('搭配 10路：功率合适时优先 4通道 = 3×4通道', rc3.amp4N === 3 && rc3.amp2N === 0);
T('DSP = ⌈12输入 ÷ 8出⌉ = 2', rc3.dspN === 2);
var rc3b = Store.reverseCalc(
  [{ name:'C2', power:500, ohms:8, count:10, parallel:1 }],
  { ratio:1.5, ampMode:'mix', amp2W:900, amp4W:500, minOhms:4, dspOuts:8 });
T('搭配模式：4通道功率不够而2通道够时回退2通道', rc3b.amp4N === 0 && rc3b.amp2N === 5);
var rc4 = Store.reverseCalc(
  [{ name:'D', power:500, count:11, parallel:1 }],
  { ratio:1.5, ampMode:'mix', amp2W:800, amp4W:800 });
T('搭配 11路（余3）= 3×4通道', rc4.amp4N === 3 && rc4.amp2N === 0);
var rc5 = Store.reverseCalc([{ name:'E', power:0, count:2, parallel:1 }], {});
T('缺功率进 errors', rc5.errors.length === 1);
var rc6 = Store.reverseCalc([{ name:'F', power:500, ohms:0, count:4, parallel:2 }], {});
T('并联缺阻抗进 errors（禁止创建）', rc6.errors.length === 1);
var rc7 = Store.reverseCalc(
  [{ name:'G', power:500, ohms:8, count:2, parallel:2 }],
  { ratio:2, ampMode:'2', amp2W:500, minOhms:4 });
T('功放功率不足出警告', rc7.warns.some(function(w){ return w.indexOf('功率不足') >= 0; }));
var rc8 = Store.reverseCalc(
  [{ name:'H12', power:500, ohms:12, count:1, parallel:1 }],
  { ratio:1.5, ampMode:'4', amp4W:1200, minOhms:4 });
T('12Ω 单只按连续负载倍率折算：500÷0.75×1.5 = 1000W@8Ω', rc8.rows[0].needW === 1000);
var rc9 = Store.reverseCalc(
  [{ name:'H4', power:500, ohms:4, count:1, parallel:1 }],
  { ratio:1.5, ampMode:'4', amp4W:400, minOhms:4 });
T('4Ω 单只按连续负载倍率折算：500÷1.5×1.5 = 500W@8Ω', rc9.rows[0].needW === 500);
var rc10 = Store.reverseCalc(
  [{ name:'H6', power:500, ohms:6, count:1, parallel:1 }],
  { ratio:1.5, ampMode:'4', amp4W:700, minOhms:4 });
T('6Ω 单只按连续负载倍率折算：500÷1.25×1.5 = 600W@8Ω', rc10.rows[0].needW === 600);
var rcSub = Store.reverseCalc(
  [{ name:'DO218S', power:1200, ohms:4, count:2, parallel:1, role:'sub' }],
  { ratio:1.5, subRatio:2, ampMode:'4', amp4W:1600, minOhms:4 });
T('超低默认单独2倍：1200W/4Ω → 1600W@8Ω，2只占2路，总3200W',
  rcSub.rows[0].needW === 1600 && rcSub.rows[0].ratio === 2 &&
  rcSub.rows[0].ch === 2 && rcSub.totalNeedW === 3200);
T('反推总功率 = 单通道需求×占用通道', rc3.totalNeedW === 7500);

print('== 12. 反推创建 + 并联自动串接 ==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
var frTpl = { type:'speaker', name:'并联箱', ins:1, outs:1, speakerRole:'fullrange',
  specs:{ powered:'passive', power:'500', ohms:'8' } };
var amp4Tpl = null;
Store.state.deviceTemplates.forEach(function(t){ if (t.type==='amp' && t.ins===4) amp4Tpl = t; });
var addedRv = Store.quickLayout([
  { tpl: tplFor('mixer'), count: 1 },
  { tpl: tplFor('dsp'), count: 1 },
  { tpl: amp4Tpl, count: 1 },
  { tpl: frTpl, count: 4, powered: 'passive', parallel: 2 }
]);
T('反推创建 7 台设备', addedRv.length === 7);
var rvSpks = Store.state.devices.filter(function(d){ return d.type === 'speaker'; });
var rvFed = rvSpks.filter(function(d){ return !!Store.sourceFor(d.id, 0); });
T('并联串接：4 只全部有信号', rvFed.length === 4);
var rvChain = Store.state.connections.filter(function(c){
  var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
  return s && t && s.type === 'speaker' && t.type === 'speaker';
});
T('产生 2 条音箱串接线（2组×并联2）', rvChain.length === 2);
T('串接无硬错误', Store.state.connections.every(function(c){ return !Store.connectionError(c); }));
Store.undo();
T('反推创建一步撤销', Store.state.devices.length === 0);

Store.replaceState(Store.defaultState());
Store.resetHistory();
var mixDspTpl = { type:'dsp', name:'反推DSP 4进8出', ins:4, outs:8 };
var mixAmp4Tpl = { type:'amp', name:'反推4通道功放', ins:4, outs:4, specs:{ power:'2500' } };
var mixAmp2Tpl = { type:'amp', name:'反推2通道功放', ins:2, outs:2, specs:{ power:'2500' } };
var calcMix = Store.reverseCalc(
  [{ name:'反推全频', power:500, ohms:8, count:10, parallel:1 }],
  { ratio:2, ampMode:'mix', amp2W:2500, amp4W:2500, minOhms:4, dspOuts:8 });
Store.quickLayout([
  { tpl: tplFor('mixer'), count: 1 },
  { tpl: mixDspTpl, count: calcMix.dspN },
  { tpl: mixAmp4Tpl, count: calcMix.amp4N },
  { tpl: mixAmp2Tpl, count: calcMix.amp2N },
  { tpl: frTpl, count: 10, powered: 'passive', parallel: 1 }
]);
Store.smartAssignAll();
T('搭配模式创建后再智能连接无硬错误',
  Store.state.connections.every(function(c){ return !Store.connectionError(c); }));

Store.replaceState(Store.defaultState());
Store.resetHistory();
var rvMixerTpl = { type:'mixer', name:'反推专用调音台', ins:16, outs:8 };
var rvDspTpl = { type:'dsp', name:'反推专用DSP', ins:4, outs:8 };
var rvAmp4Tpl = { type:'amp', name:'反推专用4通道功放', ins:4, outs:4, specs:{ power:'2500' } };
var rvAmp2Tpl = { type:'amp', name:'反推专用2通道功放', ins:2, outs:2, specs:{ power:'2500' } };
var rvFullTpl = { type:'speaker', name:'反推专用全频', ins:1, outs:1,
  speakerRole:'fullrange', specs:{ powered:'passive', power:'500', ohms:'8' } };
var rvSubTpl = { type:'speaker', name:'反推专用超低', ins:1, outs:1,
  speakerRole:'sub', specs:{ powered:'passive', power:'800', ohms:'8' } };
var fullCalc = Store.reverseCalc([{ name:'反推专用全频', power:500, ohms:8, count:5, parallel:1 }],
  { ratio:2, ampMode:'mix', amp2W:2500, amp4W:2500, minOhms:4, dspOuts:8 }).rows[0];
var subCalc = Store.reverseCalc([{ name:'反推专用超低', power:800, ohms:8, count:4, parallel:2 }],
  { ratio:2, ampMode:'mix', amp2W:2500, amp4W:2500, minOhms:4, dspOuts:8 }).rows[0];
Store.reverseLayout({
  mixerTpl: rvMixerTpl, mixerCount: 1,
  dspTpl: rvDspTpl, dspCount: 2,
  amp2Tpl: rvAmp2Tpl, amp4Tpl: rvAmp4Tpl,
  speakerRows: [
    { tpl: rvFullTpl, count: 5, parallel: 1, a2: fullCalc.a2, a4: fullCalc.a4 },
    { tpl: rvSubTpl, count: 4, parallel: 2, a2: subCalc.a2, a4: subCalc.a4 }
  ]
});
var rvFull = Store.state.devices.filter(function(d){ return d.name.indexOf('反推专用全频') === 0; });
var rvSub = Store.state.devices.filter(function(d){ return d.name.indexOf('反推专用超低') === 0; });
var rvAmps = Store.state.devices.filter(function(d){ return d.type === 'amp'; });
var subAmpIds = {};
rvSub.forEach(function(sp){
  var c = Store.sourceFor(sp.id, 0);
  if (c) {
    var s = Store.getDevice(c.sid);
    if (s && s.type === 'amp') subAmpIds[s.id] = true;
  }
});
var fullAmpIds = {};
rvFull.forEach(function(sp){
  var c = Store.sourceFor(sp.id, 0);
  if (c) {
    var s = Store.getDevice(c.sid);
    if (s && s.type === 'amp') fullAmpIds[s.id] = true;
  }
});
var sharedAmp = Object.keys(subAmpIds).some(function(id){ return !!fullAmpIds[id]; });
T('反推专用布局：不同音响行不共用同一台功放', !sharedAmp && rvAmps.length === 3);
T('反推专用布局：并联音箱写入受控并联状态',
  rvSub.every(function(d){ return d.reverseParallel && d.reverseParallel.locked && d.reverseParallel.parallel === 2; }));
var subChains = Store.state.connections.filter(function(c){
  var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
  return s && t && s.type === 'speaker' && t.type === 'speaker' &&
    t.name.indexOf('反推专用超低') === 0 && c.reverseParallel;
});
T('反推专用布局：并联组产生受控音箱串接线', subChains.length === 2);
var follower = rvSub.filter(function(d){ return d.reverseParallel.index === 2; })[0];
var leader = rvSub.filter(function(d){ return d.reverseParallel.groupId === follower.reverseParallel.groupId && d.reverseParallel.index === 1; })[0];
var ampFree = rvAmps[0];
Store.connect(follower.id, 0, ampFree.id, 0);
T('测试前：并联从属音箱可被手动打乱为功放直连',
  Store.getDevice(Store.sourceFor(follower.id, 0).sid).type === 'amp');
Store.smartAssignAll();
T('一键智连会恢复反推受控并联串接',
  Store.sourceFor(follower.id, 0).sid === leader.id && Store.sourceFor(follower.id, 0).reverseParallel);
var dia2 = fakeEl();
SP.renderWiringDiagram(dia2);
T('框图显示反推并联状态标识', dia2.innerHTML.indexOf('parallel-badge') >= 0 &&
  dia2.innerHTML.indexOf('parallel-chain') >= 0);

print('== 13. 反推有源音箱（不参与反推，直接创建并接线路输出）==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
var avMixer = { type:'mixer', name:'有源反推台', ins:16, outs:8 };
var avDsp = { type:'dsp', name:'有源反推DSP', ins:4, outs:8 };
var avActive = { type:'speaker', name:'有源全频箱', ins:1, outs:1, speakerRole:'fullrange',
  specs:{ powered:'active', power:'800' } };
var avAdded = Store.reverseLayout({
  mixerTpl: avMixer, mixerCount: 1,
  dspTpl: avDsp, dspCount: 1,
  speakerRows: [],
  activeRows: [{ tpl: avActive, count: 3 }]
});
var avSpks = Store.state.devices.filter(function(d){ return d.type==='speaker'; });
T('有源反推：创建 1台+1台+3只 = 5 台', avAdded.length === 5 && avSpks.length === 3);
T('有源音箱均为 active', avSpks.every(function(d){ return d.specs.powered === 'active'; }));
var avFed = avSpks.filter(function(d){ return !!Store.sourceFor(d.id,0); });
T('有源音箱从 DSP/调音台线路输出接入（DSP 8出足够 3 只）', avFed.length === 3);
T('有源音箱不接功放（无功放存在）',
  Store.state.devices.filter(function(d){ return d.type==='amp'; }).length === 0);
var avSrc = Store.getDevice(Store.sourceFor(avSpks[0].id,0).sid);
T('有源音箱上游是 DSP', avSrc && avSrc.type === 'dsp');
/* 5：DSP→有源取消外侧专用通道，回到正常单段曲线 */
var diaAv = fakeEl();
var avErr = null;
try { SP.renderWiringDiagram(diaAv); } catch (e) { avErr = e; }
T('含有源反推系统渲染不抛异常', !avErr, avErr && String(avErr));
T('DSP→有源不再走外侧双段路径',
  !/class="edge[^"]*"[^>]*d="M[^"]*C[^"]*C[^"]*"/.test(diaAv.innerHTML));
T('DSP→有源不再为外侧通道额外加宽画布', svgWidth(diaAv.innerHTML) < 940);

Store.replaceState(Store.defaultState());
Store.resetHistory();
var mixOnlyAdded = Store.reverseLayout({
  mixerTpl: avMixer, mixerCount: 1,
  dspTpl: null, dspCount: 0,
  speakerRows: [],
  activeRows: [{ tpl: avActive, count: 2 }]
});
var diaMixActive = fakeEl();
var mixActiveErr = null;
try { SP.renderWiringDiagram(diaMixActive); } catch (e) { mixActiveErr = e; }
T('调音台直推有源渲染不抛异常', !mixActiveErr && mixOnlyAdded.length === 3,
  mixActiveErr && String(mixActiveErr));
T('调音台→有源保留局部绕线',
  /class="edge[^"]*"[^>]*d="M[^"]*C[^"]*C[^"]*"/.test(diaMixActive.innerHTML));
T('调音台→有源不再为外侧通道额外加宽画布', svgWidth(diaMixActive.innerHTML) < 650);

Store.replaceState(Store.defaultState());
Store.resetHistory();
var avAmp = { type:'amp', name:'有源混排功放', ins:2, outs:2 };
var avPassive = { type:'speaker', name:'无源全频箱', ins:1, outs:1, speakerRole:'fullrange',
  specs:{ powered:'passive', power:'500', ohms:'8' } };
Store.reverseLayout({
  mixerTpl: avMixer, mixerCount: 1,
  dspTpl: avDsp, dspCount: 1,
  speakerRows: [{ tpl: avPassive, count: 2, parallel: 1, a2: 1, amp2Tpl: avAmp }],
  activeRows: [{ tpl: avActive, count: 2 }]
});
var diaMixedActive = fakeEl();
SP.renderWiringDiagram(diaMixedActive);
var mixedDsp = Store.state.devices.filter(function(d){ return d.type === 'dsp'; })[0];
function layoutCrossCenter(id) {
  var p = SP._layout.pos[id];
  return SP._layout.horiz ? p.y + p.h / 2 : p.x + p.w / 2;
}
var dspTargets = [];
Store.state.connections.forEach(function(c) {
  if (c.sid === mixedDsp.id) dspTargets.push(c.tid);
});
var targetAvg = dspTargets.reduce(function(a, id){ return a + layoutCrossCenter(id); }, 0) / dspTargets.length;
var hasActiveTarget = dspTargets.some(function(id) {
  var d = Store.getDevice(id);
  return d && d.type === 'speaker' && Store.speakerPowered(d);
});
T('DSP 下级对齐同时统计功放和有源音箱',
  hasActiveTarget && Math.abs(layoutCrossCenter(mixedDsp.id) - targetAvg) < 1);

print('== 14. 有源占用 DSP 通道（reverseCalc activeCount）==');
/* 2 台 4 通道功放 = 8 输入 + 3 只有源 = 11 路 → DSP(8出) = 2 台 */
var rcA = Store.reverseCalc(
  [{ name:'占用测试全频', power:500, ohms:8, count:8, parallel:1 }],
  { ratio:1.5, ampMode:'4', amp4W:1000, minOhms:4, dspOuts:8, activeCount:3 });
T('8功放输入+3有源 → lineFeeds=11 → DSP 2 台',
  rcA.ampInputs === 8 && rcA.activeCount === 3 && rcA.lineFeeds === 11 && rcA.dspN === 2);
var rcB = Store.reverseCalc([], { dspOuts: 8, activeCount: 3 });
T('纯有源（无功放）也占 DSP：3 只 → 1 台', rcB.dspN === 1 && rcB.lineFeeds === 3);
var rcC = Store.reverseCalc(
  [{ name:'占用测试', power:500, ohms:8, count:10, parallel:1 }],
  { ratio:1.5, ampMode:'mix', amp2W:800, amp4W:800, minOhms:4, dspOuts:8 });
T('不传 activeCount 时行为不变（10输入→2台DSP）', rcC.dspN === 2 && rcC.activeCount === 0);

print('== 15. 清线→智连：并联锁定组按行回配功放（功率匹配不打乱）==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
/* 行1=超低（先建，800W 并联2）；行2=全频（500W 不并联）——行序与角色排序相反，
   专门验证不会按角色顺序跨行抢功放 */
var m15mix = { type:'mixer', name:'行配台', ins:16, outs:8 };
var m15dsp = { type:'dsp', name:'行配DSP', ins:4, outs:8 };
var m15ampSub = { type:'amp', name:'超低行功放', ins:2, outs:2, specs:{ power:'2500' } };
var m15sub = { type:'speaker', name:'行配超低', ins:1, outs:1, speakerRole:'sub',
  specs:{ powered:'passive', power:'800', ohms:'8' } };
var m15full = { type:'speaker', name:'行配全频', ins:1, outs:1, speakerRole:'fullrange',
  specs:{ powered:'passive', power:'500', ohms:'8' } };
Store.reverseLayout({
  mixerTpl: m15mix, mixerCount: 1,
  dspTpl: m15dsp, dspCount: 1,
  amp2Tpl: m15ampSub, amp4Tpl: null,
  speakerRows: [
    { tpl: m15sub, count: 4, parallel: 2, a2: 1, a4: 0, ch: 2 },
    { tpl: m15full, count: 2, parallel: 1, a2: 1, a4: 0, ch: 2 }
  ]
});
var r15amps = Store.state.devices.filter(function(d){ return d.type === 'amp'; });
T('两行各配 1 台功放且带行标', r15amps.length === 2 &&
  r15amps.every(function(a){ return a.reverseRow === 1 || a.reverseRow === 2; }));
function ampRowOfSpeaker(name) {
  var out = [];
  Store.state.devices.forEach(function(d){
    if (d.name.indexOf(name) !== 0) return;
    var c = Store.sourceFor(d.id, 0);
    if (!c) return;
    var src = Store.getDevice(c.sid);
    while (src && src.type === 'speaker') {           /* 沿并联链上溯到功放 */
      var cc = Store.sourceFor(src.id, 0);
      if (!cc) return;
      src = Store.getDevice(cc.sid);
    }
    if (src && src.type === 'amp') out.push(src.reverseRow);
  });
  return out;
}
var subRows0 = ampRowOfSpeaker('行配超低');
var fullRows0 = ampRowOfSpeaker('行配全频');
T('创建后：超低走行1功放、全频走行2功放',
  subRows0.length === 4 && subRows0.every(function(r){ return r === 1; }) &&
  fullRows0.length === 2 && fullRows0.every(function(r){ return r === 2; }));
/* 全部清线 → 一键智连 → 行配对与并联链必须恢复 */
Store.clearAllConnections();
T('清线后无连线但锁定元数据保留',
  Store.state.connections.length === 0 &&
  Store.state.devices.some(function(d){ return d.reverseParallel && d.reverseParallel.locked; }));
Store.smartAssignAll();
var subRows1 = ampRowOfSpeaker('行配超低');
var fullRows1 = ampRowOfSpeaker('行配全频');
T('智连恢复：超低仍回行1功放（不被全频抢走）',
  subRows1.length === 4 && subRows1.every(function(r){ return r === 1; }));
T('智连恢复：全频仍回行2功放', fullRows1.length === 2 && fullRows1.every(function(r){ return r === 2; }));
var chain15 = Store.state.connections.filter(function(c){
  var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
  return s && t && s.type === 'speaker' && t.type === 'speaker';
});
T('智连恢复：并联串接链完整（2 条）', chain15.length === 2);
T('智连恢复：无硬错误', Store.state.connections.every(function(c){ return !Store.connectionError(c); }));

Store.replaceState(Store.defaultState());
Store.resetHistory();
var q15mix = { type:'mixer', name:'数量行台', ins:16, outs:8 };
var q15dsp = { type:'dsp', name:'数量行DSP', ins:4, outs:8 };
var q15ampFull = { type:'amp', name:'数量全频专属功放', ins:2, outs:2, specs:{ power:'900' } };
var q15ampSub = { type:'amp', name:'数量超低专属功放', ins:2, outs:2, specs:{ power:'1800' } };
var q15full = { type:'speaker', name:'数量全频', ins:1, outs:1, speakerRole:'fullrange',
  specs:{ powered:'passive', power:'500', ohms:'8' } };
var q15sub = { type:'speaker', name:'数量超低', ins:1, outs:1, speakerRole:'sub',
  specs:{ powered:'passive', power:'900', ohms:'8' } };
Store.reverseLayout({
  mixerTpl: q15mix, mixerCount: 1,
  dspTpl: q15dsp, dspCount: 1,
  speakerRows: [
    { tpl: q15full, count: 2, parallel: 1, a2: 1, a4: 0, amp2Tpl: q15ampFull },
    { tpl: q15sub, count: 2, parallel: 1, a2: 1, a4: 0, amp2Tpl: q15ampSub }
  ]
});
function ampNameOfSpeakerPrefix(prefix) {
  var out = [];
  Store.state.devices.forEach(function(d){
    if (d.name.indexOf(prefix) !== 0) return;
    var c = Store.sourceFor(d.id, 0);
    if (!c) return;
    var src = Store.getDevice(c.sid);
    if (src && src.type === 'amp') out.push(src.name);
  });
  return out;
}
T('数量布局行级功放：创建时全频/超低走各自专属功放',
  ampNameOfSpeakerPrefix('数量全频').length === 2 &&
  ampNameOfSpeakerPrefix('数量超低').length === 2 &&
  ampNameOfSpeakerPrefix('数量全频').every(function(n){ return n.indexOf('数量全频专属功放') === 0; }) &&
  ampNameOfSpeakerPrefix('数量超低').every(function(n){ return n.indexOf('数量超低专属功放') === 0; }));
Store.clearAllConnections();
Store.smartAssignAll();
T('数量布局行级功放：清线后智连仍回各自专属功放',
  ampNameOfSpeakerPrefix('数量全频').length === 2 &&
  ampNameOfSpeakerPrefix('数量超低').length === 2 &&
  ampNameOfSpeakerPrefix('数量全频').every(function(n){ return n.indexOf('数量全频专属功放') === 0; }) &&
  ampNameOfSpeakerPrefix('数量超低').every(function(n){ return n.indexOf('数量超低专属功放') === 0; }));

print('== 16. 功放阻抗-功率换算（2–16Ω 连续折算 / 4Ω×1.5）==');
T('阻抗倍率：16Ω→0.5 / 12Ω→0.75 / 8Ω→1',
  Store.ampImpedanceFactor(16) === 0.5 &&
  Store.ampImpedanceFactor(12) === 0.75 &&
  Store.ampImpedanceFactor(8) === 1);
T('阻抗倍率：6Ω→1.25 / 4Ω→1.5', Store.ampImpedanceFactor(6) === 1.25 && Store.ampImpedanceFactor(4) === 1.5);
T('阻抗倍率：3Ω→1.75 / 2Ω→2', Store.ampImpedanceFactor(3) === 1.75 && Store.ampImpedanceFactor(2) === 2);
T('阻抗未知→不加成', Store.ampImpedanceFactor(0) === 1);
T('可用功率：1000W@8→1000 / @6→1250 / @4→1500 / @2→2000',
  Store.ampEffectivePower(1000, 8) === 1000 &&
  Store.ampEffectivePower(1000, 6) === 1250 &&
  Store.ampEffectivePower(1000, 4) === 1500 &&
  Store.ampEffectivePower(1000, 2) === 2000);
T('4Ω实填功率优先于默认1.5倍',
  Store.ampEffectivePower(1000, 4, 1650) === 1650 &&
  Store.ampEffectivePowerFromSpecs({ power:'1000', power4:'1650' }, 4) === 1650);
T('4Ω实填功率在6Ω时与8Ω标称插值',
  Store.ampEffectivePower(1000, 6, 1600) === 1300);
/* reverseCalc：先按当前负载倍率折算 @8Ω，再乘余量倍率 */
var rcZ = Store.reverseCalc(
  [{ name:'Z全频', power:500, ohms:8, count:2, parallel:2 }],
  { ratio:1.5, ampMode:'4', amp4W:1200, minOhms:4 });
T('反推行带 factor=1.5', rcZ.rows[0].factor === 1.5 && rcZ.rows[0].loadOhm === 4);
T('反推行 needLoadW=1500 / needRatedW=1000',
  rcZ.rows[0].needLoadW === 1500 && rcZ.rows[0].needW === 1000 && rcZ.rows[0].needRatedW === 1000);
T('1200W 功放 @8Ω 标称 ≥1000 → 无警告', rcZ.warns.length === 0);
var rcZ2 = Store.reverseCalc(
  [{ name:'Z全频', power:500, ohms:8, count:2, parallel:2 }],
  { ratio:1.5, ampMode:'4', amp4W:900, minOhms:4 });
T('900W 功放 @8Ω 标称 <1000 → 警告且提示 8Ω标称≥1000',
  rcZ2.warns.length === 1 && rcZ2.warns[0].indexOf('≥1000W') >= 0);
var rcZ3 = Store.reverseCalc(
  [{ name:'Z全频', power:500, ohms:8, count:2, parallel:2 }],
  { ratio:1.5, ampMode:'4', amp4W:900, amp4W4:1600, minOhms:4 });
T('填写4Ω实标1600W后折算 @8Ω≈1067W，满足1000W无报警', rcZ3.warns.length === 0);
/* powerAlarmForOutput / ampLoadSummary：真实 4Ω 并联负载 */
Store.replaceState(Store.defaultState());
Store.resetHistory();
var zAmp = Store.addDevice({ type:'amp', name:'Z功放', ins:2, outs:2, specs:{ power:'1000', power4:'1600', ohms:'4' } });
var zS1 = Store.addDevice({ type:'speaker', name:'Z音箱1', ins:1, outs:1, speakerRole:'fullrange', specs:{ powered:'passive', power:'500', ohms:'8' } });
var zS2 = Store.addDevice({ type:'speaker', name:'Z音箱2', ins:1, outs:1, speakerRole:'fullrange', specs:{ powered:'passive', power:'500', ohms:'8' } });
Store.connect(zS1.id, 0, zAmp.id, 0);      /* 功放 OUT1 → 音箱1 */
Store.connect(zS2.id, 0, zS1.id, 0);       /* 音箱1 → 音箱2（并联串接）*/
var la = Store.powerAlarmForOutput(zAmp.id, 0);
T('并联负载阻抗 = 4Ω', la.loadOhms === 4);
T('功放可用功率按 4Ω 实填 = 1600W', la.ampW === 1600 && la.ratedW === 1000 && la.rated4W === 1600 && la.usedRated4 === true);
T('4Ω 负载 1000W 音箱：1600 可用无 error', la.errors === 0);
var summ = Store.ampLoadSummary(zAmp.id);
T('ampLoadSummary 标注 4Ω 实填', summ.length === 1 && summ[0].boosted && summ[0].loadOhms === 4 && summ[0].ampW === 1600 && summ[0].usedRated4);
/* 单只 8Ω：不加成、不标注 */
Store.replaceState(Store.defaultState());
Store.resetHistory();
var eAmp = Store.addDevice({ type:'amp', name:'E功放', ins:2, outs:2, specs:{ power:'1000' } });
var eS = Store.addDevice({ type:'speaker', name:'E音箱', ins:1, outs:1, speakerRole:'fullrange', specs:{ powered:'passive', power:'500', ohms:'8' } });
Store.connect(eS.id, 0, eAmp.id, 0);
var la8 = Store.powerAlarmForOutput(eAmp.id, 0);
T('8Ω 单只：不加成', la8.loadOhms === 8 && la8.factor === 1 && la8.boosted === false && la8.ampW === 1000);
T('8Ω：ampLoadSummary 无 boosted 项', Store.ampLoadSummary(eAmp.id).filter(function(x){return x.boosted;}).length === 0);
Store.replaceState(Store.defaultState());
Store.resetHistory();
var pAmp = Store.addDevice({ type:'amp', name:'倍率功放', ins:2, outs:2, specs:{ power:'800' } });
var pS = Store.addDevice({ type:'speaker', name:'倍率音箱', ins:1, outs:1, speakerRole:'fullrange',
  specs:{ powered:'passive', power:'500', ohms:'8' } });
Store.connect(pS.id, 0, pAmp.id, 0);
var pa15 = Store.powerAlarmForOutput(pAmp.id, 0, 'show');
var pa2 = Store.powerAlarmForOutput(pAmp.id, 0, 'band');
T('功率报警：1.5倍档 800W ≥ 500×1.5，不报警', pa15.errors === 0 && pa15.warnings === 0 && pa15.ok);
T('功率报警：2倍档 800W < 500×2，报警', pa2.errors === 1 && pa2.issues[0].text.indexOf('最低需要 ×2') >= 0);
var pBig = Store.addDevice({ type:'amp', name:'大功放', ins:2, outs:2, specs:{ power:'3000' } });
var pS2 = Store.addDevice({ type:'speaker', name:'小音箱', ins:1, outs:1, speakerRole:'fullrange',
  specs:{ powered:'passive', power:'500', ohms:'8' } });
Store.connect(pS2.id, 0, pBig.id, 0);
var paBig = Store.powerAlarmForOutput(pBig.id, 0, 'speech');
T('功率报警：超过最低倍率后不因高于上限提醒', paBig.errors === 0 && paBig.warnings === 0 && paBig.ok);

print('== 17. 调音台输出不足提示（reverseCalc.mixerFeeds）==');
/* 有 DSP：mixerFeeds = dspN × dspIns（喂满 DSP 输入） */
var mf1 = Store.reverseCalc(
  [{ name:'MF全频', power:500, ohms:8, count:24, parallel:1 }],
  { ratio:1.5, ampMode:'4', amp4W:2500, minOhms:4, dspOuts:8, dspIns:4 });
T('有 DSP：mixerFeeds = dspN×dspIns',
  mf1.dspN === Math.ceil(mf1.ampInputs / 8) && mf1.dspInputs === mf1.dspN * 4 &&
  mf1.mixerFeeds === mf1.dspN * 4);
/* 无 DSP 直推：mixerFeeds = lineFeeds（功放输入 + 有源） */
var mf2 = Store.reverseCalc(
  [{ name:'MF全频', power:500, ohms:8, count:4, parallel:1 }],
  { ratio:1.5, ampMode:'2', amp2W:1500, minOhms:4, dspOuts:0, activeCount:2 });
T('无 DSP：mixerFeeds = lineFeeds', mf2.dspN === 0 && mf2.mixerFeeds === mf2.lineFeeds &&
  mf2.mixerFeeds === mf2.ampInputs + 2);

print('== 18. 单设备智能分配：并联组感知（尊重逻辑整体）==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
var saMix = { type:'mixer', name:'SA台', ins:16, outs:8 };
var saDsp = { type:'dsp', name:'SA-DSP', ins:4, outs:8 };
var saAmp = { type:'amp', name:'SA功放', ins:4, outs:4, specs:{ power:'2500' } };
var saSpk = { type:'speaker', name:'SA全频', ins:1, outs:1, speakerRole:'fullrange',
  specs:{ powered:'passive', power:'500', ohms:'8' } };
Store.reverseLayout({
  mixerTpl: saMix, mixerCount: 1, dspTpl: saDsp, dspCount: 1,
  amp2Tpl: null, amp4Tpl: saAmp,
  speakerRows: [{ tpl: saSpk, count: 4, parallel: 2, a2: 0, a4: 1, ch: 2 }]
});
var saSpks = Store.state.devices.filter(function(d){ return d.type==='speaker'; })
  .sort(function(a,b){ return (a.reverseParallel.groupId+a.reverseParallel.index).localeCompare(b.reverseParallel.groupId+b.reverseParallel.index); });
/* 找一个并联从属（index 2）与其组长（index 1，同 groupId） */
var follower = Store.state.devices.filter(function(d){
  return d.type==='speaker' && d.reverseParallel && d.reverseParallel.index === 2; })[0];
var gid = follower.reverseParallel.groupId;
var leader = Store.state.devices.filter(function(d){
  return d.type==='speaker' && d.reverseParallel && d.reverseParallel.groupId === gid && d.reverseParallel.index === 1; })[0];
T('parallelGroupOf 返回同组并按 index 排序',
  Store.parallelGroupOf(follower).length === 2 && Store.parallelGroupOf(follower)[0].id === leader.id);
/* 断开从属的串接，改接一个功放空闲口（模拟被打乱），再单设备智能分配从属 → 应串回组长 */
Store.disconnect(follower.id, 0);
var freeAmpOut = null;
Store.state.devices.forEach(function(d){
  if (d.type!=='amp' || freeAmpOut) return;
  Store.visibleOuts(d).forEach(function(oi){
    if (!freeAmpOut && !Store.consumersOf(d.id, oi).length) freeAmpOut = { id:d.id, port:oi };
  });
});
if (freeAmpOut) Store.connect(follower.id, 0, freeAmpOut.id, freeAmpOut.port);
T('打乱：从属暂接到功放输出',
  !freeAmpOut || Store.getDevice(Store.sourceFor(follower.id,0).sid).type === 'amp');
var saRes = Store.smartAssign(follower.id);
T('智能分配从属 → 串回组长（不抢功放口）',
  Store.sourceFor(follower.id,0).sid === leader.id && saRes.lines.length > 0);
/* 记录其它组连线数，验证「不影响整体」 */
var otherGroupLeader = Store.state.devices.filter(function(d){
  return d.type==='speaker' && d.reverseParallel && d.reverseParallel.index === 1 &&
    d.reverseParallel.groupId !== gid; })[0];
var otherSrcBefore = otherGroupLeader ? (Store.sourceFor(otherGroupLeader.id,0)||{}).sid : null;
/* 断开组长功放、单设备智能分配组长 → 组长接功放 + 从属串好 */
Store.clearDeviceConnections(leader.id, 'inputs');
Store.disconnect(follower.id, 0);
Store.smartAssign(leader.id);
T('智能分配组长 → 组长接功放且从属串回',
  Store.getDevice(Store.sourceFor(leader.id,0).sid).type === 'amp' &&
  Store.sourceFor(follower.id,0).sid === leader.id);
T('不影响整体：其它并联组组长连线未变',
  !otherGroupLeader || (Store.sourceFor(otherGroupLeader.id,0)||{}).sid === otherSrcBefore);
/* 普通（非并联）音箱仍按 reverseRow 接对应功放 */
Store.replaceState(Store.defaultState());
Store.resetHistory();
var nAmp = Store.addDevice({ type:'amp', name:'普通功放', ins:2, outs:2, specs:{ power:'1000' } });
var nSpk = Store.addDevice({ type:'speaker', name:'普通全频', ins:1, outs:1, speakerRole:'fullrange', specs:{ powered:'passive', power:'400', ohms:'8' } });
var nRes = Store.smartAssign(nSpk.id);
T('普通音箱智能分配 → 接功放', nRes.lines.length === 1 &&
  Store.getDevice(Store.sourceFor(nSpk.id,0).sid).type === 'amp');

print('== 19. 音箱单条功放线（其余口只用于 link）==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
var sfAmp = Store.addDevice({ type:'amp', name:'单线功放', ins:2, outs:2, specs:{ power:'1000' } });
var sfSpk2 = Store.addDevice({ type:'speaker', name:'双口无源箱', ins:2, outs:1,
  speakerRole:'fullrange', specs:{ powered:'passive', power:'500', ohms:'8' } });
var sfSpkB = Store.addDevice({ type:'speaker', name:'串接无源箱', ins:1, outs:1,
  speakerRole:'fullrange', specs:{ powered:'passive', power:'500', ohms:'8' } });
var sf1 = Store.connect(sfSpk2.id, 0, sfAmp.id, 0);
T('第一条功放音响线 OK', sf1.ok === true);
var sf2 = Store.connect(sfSpk2.id, 1, sfAmp.id, 1);
T('第二条功放线被拒（单条规则）', sf2.ok === false && sf2.msg.indexOf('一条') >= 0);
/* 同一输入口换接另一路功放输出 = 换线，不是第二条，应放行 */
var sf3 = Store.connect(sfSpk2.id, 0, sfAmp.id, 1);
T('同口换接功放输出仍 OK', sf3.ok === true);
/* 另一口接音箱 link 串接 OK */
var sf4 = Store.connect(sfSpkB.id, 0, sfSpk2.id, 0);
T('音箱→音箱 link 串接 OK', sf4.ok === true);
/* 有源音箱之间 link：默认允许 */
var sfAct1 = Store.addDevice({ type:'speaker', name:'有源A', ins:2, outs:1,
  speakerRole:'fullrange', specs:{ powered:'active', power:'800' } });
var sfAct2 = Store.addDevice({ type:'speaker', name:'有源B', ins:1, outs:1,
  speakerRole:'fullrange', specs:{ powered:'active', power:'800' } });
var sfA = Store.connect(sfAct2.id, 0, sfAct1.id, 0);
T('有源↔有源 link OK', sfA.ok === true);
var sfA2 = Store.connect(sfAct1.id, 0, sfAmp.id, 1);
T('有源不接功放（原规则仍在）', sfA2.ok === false);

print('== 20. 拖完自动挤开 + 恢复默认布局 ==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
var pdAmp = Store.addDevice({ type:'amp', name:'挤开功放', ins:2, outs:2, specs:{ power:'1000' } });
var pdS1 = Store.addDevice({ type:'speaker', name:'挤开箱1', ins:1, outs:1, speakerRole:'fullrange', specs:{ powered:'passive', power:'400', ohms:'8' } });
var pdS2 = Store.addDevice({ type:'speaker', name:'挤开箱2', ins:1, outs:1, speakerRole:'fullrange', specs:{ powered:'passive', power:'400', ohms:'8' } });
var pdS3 = Store.addDevice({ type:'speaker', name:'挤开箱3', ins:1, outs:1, speakerRole:'fullrange', specs:{ powered:'passive', power:'400', ohms:'8' } });
Store.connect(pdS1.id, 0, pdAmp.id, 0);
Store.connect(pdS2.id, 0, pdAmp.id, 1);
var pdBox = fakeEl();
SP.renderWiringDiagram(pdBox);
var pdL = SP._layout;
/* 模拟拖动：把 箱1 拖到与 箱2 重叠的位置（同时故意拖离本层行） */
var p2 = pdL.pos[pdS2.id];
pdS1.px = Math.round(p2.x + 10);
pdS1.py = Math.round(p2.y - 30);
SP.renderWiringDiagram(pdBox);
SP.settleAfterDrag(pdS1.id);
SP.renderWiringDiagram(pdBox);
pdL = SP._layout;
function pdStart(id){ return pdL.pos[id].x; }
function pdEnd(id){ return pdL.pos[id].x + pdL.pos[id].w; }
var pdLaneIdx = -1;
pdL.lanes.forEach(function(lane, i){ if (lane.indexOf(pdS1.id) >= 0) pdLaneIdx = i; });
var pdLane = pdL.lanes[pdLaneIdx].slice().sort(function(a,b){ return pdStart(a)-pdStart(b); });
var pdOverlap = false;
for (var pk = 1; pk < pdLane.length; pk++) {
  if (pdStart(pdLane[pk]) < pdEnd(pdLane[pk-1]) - 1) pdOverlap = true;
}
T('挤开后同层无重叠', !pdOverlap);
T('挤开后主轴吸附回本层行（向下对齐）', Math.abs(pdL.pos[pdS1.id].y - pdL.lanePos[pdLaneIdx]) < 1);
/* 相对顺序：箱1 拖到箱2 右侧一点 → 挤开后箱1 仍应在箱2 右侧 */
T('挤开后相对顺序不乱（箱1 在箱2 右侧）', pdStart(pdS1.id) > pdStart(pdS2.id));
/* 恢复默认布局：清 px/py，回到自动布局 */
var pdMode = Store.state.diagramLayout;
SP.restoreDefaultLayout(pdBox);
T('恢复默认布局：手动位置全部清除',
  Store.state.devices.every(function(d){ return d.px === undefined && d.py === undefined; }));
T('恢复默认布局：不改变布局模式', Store.state.diagramLayout === pdMode);

print('== 21. 交换机 + 网口线（Dante）==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
T('模板库有交换机', Store.state.deviceTemplates.some(function(t){ return t.type === 'switch'; }));
var nwSw = Store.addDevice({ type:'switch', name:'主交换机', ins:4, outs:0 });
var nwM1 = Store.addDevice({ type:'mixer', name:'FOH 台', ins:16, outs:8 });
var nwM2 = Store.addDevice({ type:'mixer', name:'监听台', ins:16, outs:8 });
var nwDsp = Store.addDevice({ type:'dsp', name:'NW-DSP', ins:4, outs:8 });
T('交换机网口标签', nwSw.inputs[0].label === '网口 1');
var nl1 = Store.addNetLink(nwM1.id, nwSw.id);
T('调音台→交换机 网口线 OK', nl1.ok === true && nl1.conn.net === true && nl1.conn.tport === 0);
var nl1b = Store.addNetLink(nwSw.id, nwM1.id);
T('重复网口线被拒', nl1b.ok === false);
var nl2 = Store.addNetLink(nwM2.id, nwSw.id);
T('第二台占下一个网口', nl2.ok === true && nl2.conn.tport === 1);
T('netLinksOf 汇总', Store.netLinksOf(nwSw.id).length === 2 && Store.netLinksOf(nwM1.id).length === 1);
/* 音频线不能接交换机 */
var nlAudio = Store.connect(nwSw.id, 2, nwM1.id, 0);
T('音频线接交换机被拒', nlAudio.ok === false);
/* 已接交换机的两台不允许再直连（有交换机就只走交换机） */
var nl3 = Store.addNetLink(nwM1.id, nwM2.id);
T('已上交换机的台不许直连', nl3.ok === false);
/* 智能连接不碰交换机 */
var nwRes = Store.smartAssign(nwSw.id);
T('交换机不参与音频智连', nwRes.lines.length === 0);
Store.smartAssignAll();
T('一键智连后网口线保留且交换机无音频线',
  Store.netLinksOf(nwSw.id).length === 2 &&
  Store.state.connections.every(function(c){
    var s = Store.getDevice(c.sid), t = Store.getDevice(c.tid);
    return c.net || (s.type !== 'switch' && t.type !== 'switch');
  }));
/* cleanup 不清网口线 */
Store.cleanupConnectionErrors();
T('cleanup 保留网口线', Store.netLinksOf(nwSw.id).length === 2);
/* 断开 */
Store.removeNetLink(nwM1.id, nwSw.id);
T('断开网口线', Store.netLinksOf(nwSw.id).length === 1 && !Store.netLinkBetween(nwM1.id, nwSw.id));
/* 线材汇总把网口线归为 网线(Dante) */
var nwSum = Store.cableSummary().filter(function(g){ return g.type === '网线(Dante)'; })[0];
var netN = Store.state.connections.filter(function(c){ return c.net; }).length;
T('线材汇总含网线(Dante)', !!nwSum && nwSum.count === netN && netN >= 1);
  /* 框图渲染：交换机独占顶层 + Dante 短网线示意 + Dante 小节点 */
  var nwBox = fakeEl();
  SP.renderWiringDiagram(nwBox);
  T('框图不再画跨设备 Dante 网口线', nwBox.innerHTML.indexOf('net-edge') < 0);
  T('框图含 Dante 短网线淡出示意', nwBox.innerHTML.indexOf('dante-stub') >= 0 &&
    nwBox.innerHTML.indexOf('dante-stub-fade') >= 0 &&
    nwBox.innerHTML.indexOf('data-switch-net') >= 0);
  T('框图含 Dante 小节点（dante 标注）', nwBox.innerHTML.indexOf('data-dante-node') >= 0 &&
    nwBox.innerHTML.indexOf('dante-dot') >= 0 &&
    nwBox.innerHTML.indexOf('>dante</text>') >= 0);
  T('框图 Dante 标注交换机网口号',
    nwBox.innerHTML.indexOf('dante-link-tag') >= 0 &&
    nwBox.innerHTML.indexOf('网口 2') >= 0);
  var nwL = SP._layout;
  function nwMain(id){ var p = nwL.pos[id]; return nwL.horiz ? p.x : p.y; }
  function nwCross(id){ var p = nwL.pos[id]; return nwL.horiz ? p.y + p.h / 2 : p.x + p.w / 2; }
  T('交换机在调音台上方（独占顶层）', nwMain(nwSw.id) < nwMain(nwM1.id));
  T('交换机默认对齐到已互联调音台', Math.abs(nwCross(nwSw.id) - nwCross(nwM2.id)) < 1);
/* 自定义网口数量 + 缩减断开越界网口线（不影响 nwM1 的通道测试） */
var swR = Store.setSwitchPorts(nwSw.id, 12);
T('交换机网口数可自定义', swR.ok === true && Store.getDevice(nwSw.id).inputs.length === 12);
Store.setSwitchPorts(nwSw.id, 1);
T('缩减网口断开越界网口线', Store.getDevice(nwSw.id).inputs.length === 1 &&
  Store.netLinksOf(nwSw.id).length <= 1);
Store.setSwitchPorts(nwSw.id, 8);

print('== 22. 调音台 Dante 分配 ==');
var dnM = nwM1;   /* 复用 16 in / 8 out 调音台 */
var dnR1 = Store.toggleDante(dnM.id, 'in', 0);
T('标记输入走 Dante', dnR1.ok === true && dnR1.on === true && Store.isDante(dnM, 'in', 0));
Store.toggleDante(dnM.id, 'in', 3);
Store.toggleDante(dnM.id, 'in', 1);
Store.toggleDante(dnM.id, 'in', 2);
T('danteList 排序', JSON.stringify(Store.danteList(dnM, 'in')) === '[0,1,2,3]');
var dnMore = Store.toggleDante(dnM.id, 'in', 4);
T('可超过 4 路（支持全选）', dnMore.ok === true && Store.danteList(dnM, 'in').length === 5);
var dnOff = Store.toggleDante(dnM.id, 'in', 1);
T('再点取消标记', dnOff.ok === true && dnOff.on === false && !Store.isDante(dnM, 'in', 1));
Store.toggleDante(dnM.id, 'out', 5);
T('输出独立计数', Store.danteList(dnM, 'out').length === 1 && Store.danteList(dnM, 'in').length === 4);
var dnAmpR = Store.toggleDante(nwDsp.id, 'in', 0);
T('非调音台被拒', dnAmpR.ok === false);
/* 批量：拖拽框选一段 + 整行全选 / 全不选 */
Store.setDante(dnM.id, 'in', [6, 7, 8], true);
T('批量设置一段 Dante', [6,7,8].every(function(i){ return Store.isDante(dnM, 'in', i); }));
Store.setDante(dnM.id, 'in', [6, 7], false);
T('批量取消一段', !Store.isDante(dnM, 'in', 6) && !Store.isDante(dnM, 'in', 7) && Store.isDante(dnM, 'in', 8));
Store.setDanteAll(dnM.id, 'in', true);
T('全选输入', Store.danteList(dnM, 'in').length === dnM.inputs.length);
Store.setDanteAll(dnM.id, 'in', false);
T('全不选输入', Store.danteList(dnM, 'in').length === 0);
/* normalize：越界端口清理 + 去重（不再截断到 4） */
dnM.danteIn = [0, 2, 99, -1, 1, 3, 5, 2, 3];
Store.replaceState(JSON.parse(JSON.stringify(Store.state)));
var dnM2 = Store.getDevice(dnM.id);
T('normalize 清越界+去重',
  JSON.stringify(dnM2.danteIn) === '[0,1,2,3,5]');

print('== 23. 接交换机自动清直连 ==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
var acM1 = Store.addDevice({ type:'mixer', name:'AC台1', ins:8, outs:8 });
var acM2 = Store.addDevice({ type:'mixer', name:'AC台2', ins:8, outs:8 });
var acSw = Store.addDevice({ type:'switch', name:'AC交换机', ins:4, outs:0 });
var ac1 = Store.addNetLink(acM1.id, acM2.id);
T('无交换机时可直连', ac1.ok === true && !!Store.netLinkBetween(acM1.id, acM2.id));
var acBox = fakeEl();
SP.renderWiringDiagram(acBox);
T('调音台直连 Dante 标注互联对象',
  acBox.innerHTML.indexOf('dante-link-tag-peer') >= 0 &&
  acBox.innerHTML.indexOf('AC台1') >= 0 &&
  acBox.innerHTML.indexOf('AC台2') >= 0);
var ac2 = Store.addNetLink(acM1.id, acSw.id);
T('接交换机成功', ac2.ok === true);
T('接交换机后自动清掉该台直连',
  !Store.netLinkBetween(acM1.id, acM2.id) && !!Store.netLinkBetween(acM1.id, acSw.id));

print('== 24. 默认对齐（按功放分组 + 功放居中于音箱）==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
var tMix = Store.addDevice({ type:'mixer', name:'T台', ins:8, outs:8 });
var tA = Store.addDevice({ type:'amp', name:'T功放A', ins:2, outs:2, specs:{ power:'1000' } });
var tB = Store.addDevice({ type:'amp', name:'T功放B', ins:2, outs:2, specs:{ power:'1000' } });
function tSpk(n){ return Store.addDevice({ type:'speaker', name:n, ins:1, outs:1, speakerRole:'fullrange', specs:{ powered:'passive', power:'400', ohms:'8' } }); }
var s1=tSpk('S1'), s2=tSpk('S2'), s3=tSpk('S3'), s4=tSpk('S4');
Store.connect(tA.id, 0, tMix.id, 0);   /* 功放A ← 台 OUT1 */
Store.connect(tB.id, 0, tMix.id, 1);   /* 功放B ← 台 OUT2 */
Store.connect(s1.id, 0, tA.id, 0);     /* S1 ← A OUT1 */
Store.connect(s2.id, 0, tA.id, 1);     /* S2 ← A OUT2 */
Store.connect(s3.id, 0, tB.id, 0);     /* S3 ← B OUT1 */
Store.connect(s4.id, 0, tB.id, 1);     /* S4 ← B OUT2 */
Store.state.diagramLayout = 'bottomup';
var tBox = fakeEl();
SP.renderWiringDiagram(tBox);
var tL = SP._layout;
function tc(id){ var p = tL.pos[id]; return tL.horiz ? p.y + p.h/2 : p.x + p.w/2; }
/* 叶层（音箱）顺序：按功放分组 S1,S2 | S3,S4 */
var leafLane = tL.lanes[tL.lanes.length - 1];
T('音箱层按功放分组连续排列',
  leafLane.indexOf(s1.id) >= 0 &&
  Math.abs(leafLane.indexOf(s1.id) - leafLane.indexOf(s2.id)) === 1 &&
  Math.abs(leafLane.indexOf(s3.id) - leafLane.indexOf(s4.id)) === 1 &&
  leafLane.indexOf(s2.id) < leafLane.indexOf(s3.id));
/* 功放居中在它的两只音箱中点 */
T('功放A 居中于 S1,S2', Math.abs(tc(tA.id) - (tc(s1.id) + tc(s2.id)) / 2) < 1);
T('功放B 居中于 S3,S4', Math.abs(tc(tB.id) - (tc(s3.id) + tc(s4.id)) / 2) < 1);
/* 功放A 组整体在 功放B 组左侧（不交叉、不插入） */
T('两组不交叉', tc(s2.id) < tc(s3.id) && tc(tA.id) < tc(tB.id));

print('== 25. 相对对齐逐设备保持上下级关系 ==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
var raMix = Store.addDevice({ type:'mixer', name:'RA台', ins:8, outs:8 });
var raD1 = Store.addDevice({ type:'dsp', name:'RA-DSP有下级', ins:2, outs:2 });
var raD2 = Store.addDevice({ type:'dsp', name:'RA-DSP无下级', ins:2, outs:2 });
var raAmp = Store.addDevice({ type:'amp', name:'RA功放', ins:2, outs:2, specs:{ power:'1000' } });
var raSpk = Store.addDevice({ type:'speaker', name:'RA音箱', ins:1, outs:1,
  speakerRole:'fullrange', specs:{ powered:'passive', power:'400', ohms:'8' } });
Store.connect(raD1.id, 0, raMix.id, 0);
Store.connect(raD2.id, 0, raMix.id, 1);
Store.connect(raAmp.id, 0, raD1.id, 0);
Store.connect(raSpk.id, 0, raAmp.id, 0);
Store.state.diagramLayout = 'bottomup';
var raBox = fakeEl();
SP.renderWiringDiagram(raBox);
function raCross(id){ var p = SP._layout.pos[id]; return SP._layout.horiz ? p.y + p.h / 2 : p.x + p.w / 2; }
var raD2Before = raCross(raD2.id);
SP.relAlignLayout('down', raBox);
T('相对对齐：无下级 DSP 保持当前位置', Math.abs(raCross(raD2.id) - raD2Before) < 1);
T('相对对齐：有下级 DSP 对齐自己的下级', Math.abs(raCross(raD1.id) - raCross(raAmp.id)) < 1);

print('== 26. 一键智能连接自动接 Dante 网口 ==');
Store.replaceState(Store.defaultState());
Store.resetHistory();
Store.addDevice({ type:'mixer', name:'SC台1', ins:8, outs:8 });
Store.addDevice({ type:'mixer', name:'SC台2', ins:8, outs:8 });
var scSw = Store.addDevice({ type:'switch', name:'SC交换机', ins:8, outs:0 });
Store.smartAssignAll();
T('智连把调音台接到交换机 1、2 口', Store.netLinksOf(scSw.id).length === 2 &&
  Store.state.connections.some(function(c){ return c.net && c.tid === scSw.id && c.tport === 0; }) &&
  Store.state.connections.some(function(c){ return c.net && c.tid === scSw.id && c.tport === 1; }));

print('');
print('结果: ' + pass + ' 通过, ' + fail + ' 失败');
if (fail) throw new Error(fail + ' tests failed');
