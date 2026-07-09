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
T('并联功率叠加：需 ≥2000W/通道', rc1.rows[0].needW === 2000);
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
T('搭配 10路 = 2×4通道 + 1×2通道', rc3.amp4N === 2 && rc3.amp2N === 1);
T('DSP = ⌈10输入 ÷ 8出⌉ = 2', rc3.dspN === 2);
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
/* 5：反推创建的有源音箱走外侧专用通道（DSP→有源的边为双段贝塞尔，且画布已加宽） */
var diaAv = fakeEl();
var avErr = null;
try { SP.renderWiringDiagram(diaAv); } catch (e) { avErr = e; }
T('含有源反推系统渲染不抛异常', !avErr, avErr && String(avErr));
T('有源信号线走外侧通道（双段路径特征）',
  /class="edge[^"]*"[^>]*d="M[^"]*C[^"]*C[^"]*"/.test(diaAv.innerHTML));

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

print('');
print('结果: ' + pass + ' 通过, ' + fail + ' 失败');
if (fail) throw new Error(fail + ' tests failed');
