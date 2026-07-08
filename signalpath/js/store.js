/* ============================================================
   store.js — 数据模型、模板、localStorage 持久化
   ============================================================ */

var SP = window.SP = window.SP || {};

/* ---------- 内置设备类型 ---------- */

SP.DEVICE_TYPES = {
  mixer:   { name: '调音台', abbr: 'MIX' },
  dsp:     { name: 'DSP',    abbr: 'DSP' },
  amp:     { name: '功放',   abbr: 'AMP' },
  speaker: { name: '音箱',   abbr: 'SPK' }
};

SP.TYPE_ORDER = ['mixer', 'dsp', 'amp', 'speaker'];

/* 各类型默认颜色（可被每台设备单独覆盖） */
SP.TYPE_COLORS = {
  mixer: '#eda63d', dsp: '#6ba3c4', amp: '#a08fc0', speaker: '#4fbf8b'
};
SP.typeColor = function (type) { return SP.TYPE_COLORS[type] || '#7f8b99'; };

/* ---------- 线材类型 ---------- */

SP.CABLE_TYPES = ['卡农信号线', '6.5信号线', '音箱线', 'RCA莲花线', '网线(Dante)', '其他'];

/* ---------- 端口接口类型（接线教学标注用） ---------- */

SP.CONN_TYPES = ['XLR', 'TRS', 'Line', 'RCA', 'SpeakON'];

/* 默认接口：音箱=音响线接口 SpeakON（有源音箱输入除外），功放输出=SpeakON，其余=卡农 XLR */
SP.defaultConn = function (dev, side) {
  if (!dev) return 'XLR';
  var active = dev.specs && dev.specs.powered === 'active';
  if (dev.type === 'speaker') {
    if (side === 'in' && active) return 'XLR';
    return 'SpeakON';
  }
  if (dev.type === 'amp' && side === 'out') return 'SpeakON';
  return 'XLR';
};

/* ---------- 外围输入设备类别（话筒/乐器等，仅清单管理） ---------- */

SP.GEAR_CATS = ['话筒', '乐器', 'DI盒', '播放设备', '无线系统', '其他'];

/* ---------- 常见型号模板（路数为常用配置，可在自定义中调整） ---------- */

SP.SPEAKER_ROLES = [
  { key: 'linearray', name: '线阵列', order: 0 },
  { key: 'fullrange', name: '全频', order: 1 },
  { key: 'sub', name: '超低', order: 2 }
];

SP.speakerRoleInfo = function (role) {
  for (var i = 0; i < SP.SPEAKER_ROLES.length; i++) {
    if (SP.SPEAKER_ROLES[i].key === role) return SP.SPEAKER_ROLES[i];
  }
  return SP.SPEAKER_ROLES[1];
};

SP.inferSpeakerRole = function (name) {
  name = String(name || '');
  if (/线阵|line/i.test(name)) return 'linearray';
  if (/超低|低音|sub/i.test(name)) return 'sub';
  return 'fullrange';
};

SP.TEMPLATES = [
  { type: 'mixer', name: 'WING RACK', ins: 24, outs: 8,
    mixerDefaults: { channels: 24, buses: 16, mains: 4, matrices: 8, mainMode: 'LR' } },
  { type: 'mixer', name: 'MR18', ins: 18, outs: 8,
    mixerDefaults: { channels: 16, buses: 0, mains: 1, matrices: 0, mainMode: 'Mono' } },
  { type: 'dsp', name: 'Unit48', ins: 4, outs: 8 },
  { type: 'amp', name: '两通道功放（2进2出）', ins: 2, outs: 2 },
  { type: 'amp', name: '四通道功放（4进4出）', ins: 4, outs: 4 },
  { type: 'speaker', name: '线阵列音箱', ins: 1, outs: 1, speakerRole: 'linearray' },
  { type: 'speaker', name: '全频音箱', ins: 1, outs: 1, speakerRole: 'fullrange' },
  { type: 'speaker', name: '超低音箱', ins: 1, outs: 1, speakerRole: 'sub' }
];

SP.MIXER_TEMPLATES = [];

/* 规格显示：纯数字自动补单位，其余原样显示 */
SP.specString = function (d) {
  var s = d.specs || {};
  function clean(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }
  function fmt(v, u) {
    v = clean(v);
    return /^\d+(\.\d+)?$/.test(v) ? v + u : v;
  }
  var parts = [];
  if (d.type === 'amp' && s.power) parts.push(fmt(s.power, 'W'));
  if (d.type === 'speaker') {
    parts.push(s.powered === 'active' ? '有源' : '无源');
    if (s.ohms) parts.push(fmt(s.ohms, 'Ω'));
    if (s.power) parts.push(fmt(s.power, 'W'));
    if (s.size) parts.push(fmt(s.size, '寸'));
  }
  if ((d.type === 'mixer' || d.type === 'dsp' || d.type === 'amp') && s.rackU) {
    parts.push(fmt(s.rackU, 'U'));
  }
  return parts.join(' · ');
};

/* ---------- Store ---------- */

/* 本地存储配额告警：只弹一次，避免刷屏 */
SP.warnStorage = (function () {
  var warned = false;
  return function () {
    if (warned) return;
    warned = true;
    alert('警告：浏览器本地存储空间已满，最新改动可能没有保存！\n\n建议立即：\n1. 点顶栏「导出配置」备份当前数据；\n2. 删除不需要的配置槽或部分设备图片后重试。');
  };
})();

SP.Store = (function () {
  var KEY = 'signalpath-v2';
  var LEGACY_KEY = 'signalpath-v1';   /* v1 数据只读迁移，原样保留作备份 */

  function defaultMixer() {
    return { physIn: 16, channels: 16, buses: 6, mains: 2, matrices: 4, mainMode: 'LR',
      physOut: 8, routes: {}, links: [], inPatch: null, outPatch: {} };
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function mainIds(m) {
    var n = Math.max(0, Math.min(64, +m.mains || 0));
    var arr = [];
    for (var i = 0; i < n; i++) arr.push('m' + i);
    return arr;
  }
  function normalizeTargetId(id) {
    if (id === 'ML' || id === 'MM') return 'm0';
    if (id === 'MR') return 'm1';
    return id;
  }
  function validTarget(m, id) {
    id = normalizeTargetId(id);
    if (id[0] === 'b') return +id.slice(1) < m.buses;
    if (id[0] === 'x') return +id.slice(1) < m.matrices;
    if (id[0] === 'm') return +id.slice(1) < m.mains;
    return false;
  }

  /* 台面数据补齐：物理输出 / 输入分配（默认 1:1 直通）/ 输出分配 */
  function normalizeMixer(m) {
    if (m.physOut === undefined || m.physOut === null) m.physOut = 8;
    if (m.mains === undefined || m.mains === null) m.mains = m.mainMode === 'Mono' ? 1 : 2;
    m.mains = Math.max(0, Math.min(64, +m.mains || 0));
    if (!m.links) m.links = [];
    if (!m.routes) m.routes = {};
    if (!m.outPatch) m.outPatch = {};
    if (!m.inPatch) {
      m.inPatch = {};
      var n = Math.min(m.physIn, m.channels);
      for (var i = 0; i < n; i++) m.inPatch[i] = [i];
    } else {
      var ip = {};
      Object.keys(m.inPatch).forEach(function (k) {
        if (+k >= m.physIn) return;
        var raw = Array.isArray(m.inPatch[k]) ? m.inPatch[k] : [];
        var arr = raw.filter(function (c) { return c >= 0 && c < m.channels; });
        if (arr.length) ip[k] = arr;
      });
      m.inPatch = ip;
    }
    var nr = {};
    Object.keys(m.routes || {}).forEach(function (ci) {
      if (+ci >= m.channels) return;
      var seen = {};
      var arr = (m.routes[ci] || []).map(normalizeTargetId).filter(function (t) {
        if (!validTarget(m, t) || seen[t]) return false;
        seen[t] = true;
        return true;
      });
      if (arr.length) nr[ci] = arr;
    });
    m.routes = nr;
    var op = {};
    Object.keys(m.outPatch).forEach(function (sid) {
      sid = normalizeTargetId(sid);
      if (!validTarget(m, sid)) return;
      var raw = Array.isArray(m.outPatch[sid]) ? m.outPatch[sid] : [];
      var arr = raw.filter(function (o) { return o >= 0 && o < m.physOut; });
      if (arr.length) op[sid] = arr;
    });
    m.outPatch = op;
    return m;
  }

  function defaultState() {
    return { devices: [], connections: [], customTypes: [], inputGear: [],
      userMixerTemplates: [], deviceTemplates: JSON.parse(JSON.stringify(SP.TEMPLATES)),
      deviceTemplatesVersion: 4, mixer: defaultMixer(), activeMixerId: '',
      diagramLayout: 'topdown', diagramOrient: 'v', seq: 1, quickPresets: [], reversePresets: [],
      powerAlarmMode: 'show',
      power: { eff: 0.7, headroom: 1.3, mixerW: 150, dspW: 50, seqW: 30 } };
  }

  /* v1 → v2 升级（幂等，可处理旧导入/旧配置槽数据）：
     图片 dataURL 入 IndexedDB 改存 id、线长数字化 lenM+note、功放 P/S/B 档按输出对存储 */
  function upgradeData(s) {
    (s.devices || []).forEach(function (d) {
      delete d.collapsed;   /* v2 框图节点不再支持收起 */
      if (d.img && /^data:/.test(d.img)) d.imgId = SP.Images.put(d.img);
      if (d.img !== undefined) delete d.img;
      if (d.panelImg && /^data:/.test(d.panelImg)) d.panelImgId = SP.Images.put(d.panelImg);
      if (d.panelImg !== undefined) delete d.panelImg;
      if (d.type === 'amp') {
        var pairs = Math.ceil((d.outputs || []).length / 2);
        if (!Array.isArray(d.ampPairModes)) {
          d.ampPairModes = [];
          for (var pi = 0; pi < pairs; pi++) {
            var a = d.outputs[pi * 2], b = d.outputs[pi * 2 + 1];
            d.ampPairModes.push(
              (a && a.mode === 'B') || (b && b.mode === 'B') ? 'B'
                : (a && a.mode === 'S') ? 'S' : 'P');
          }
        }
        while (d.ampPairModes.length < pairs) d.ampPairModes.push('P');
        d.ampPairModes.length = pairs;
        /* 接地从每输出口迁移为整机一个开关 */
        if (!d.specs) d.specs = {};
        if (d.specs.grounded === undefined) {
          d.specs.grounded = true;
        }
        (d.outputs || []).forEach(function (p) { if (p) delete p.grounded; });
      }
      /* DSP 内部矩阵/压限数据：清掉越界项 */
      if (d.dspRoute) {
        var mx = {};
        Object.keys(d.dspRoute.matrix || {}).forEach(function (k) {
          if (+k >= d.inputs.length) return;
          var raw = Array.isArray(d.dspRoute.matrix[k]) ? d.dspRoute.matrix[k] : [];
          var arr = raw.filter(function (o) { return o < d.outputs.length; });
          if (arr.length) mx[k] = arr;
        });
        d.dspRoute.matrix = mx;
        var lm = {};
        Object.keys(d.dspRoute.limits || {}).forEach(function (k) {
          if (+k < d.outputs.length) lm[k] = d.dspRoute.limits[k];
        });
        d.dspRoute.limits = lm;
      }
    });
    s.quickPresets = s.quickPresets || [];
    s.reversePresets = s.reversePresets || [];
    (s.connections || []).forEach(function (c) {
      if (c.lenM === undefined) {
        var raw = String(c.len || '');
        var m = raw.match(/(\d+(?:\.\d+)?)\s*(?:m|M|米)?/);
        c.lenM = m ? +m[1] : '';
        var rest = m ? raw.replace(m[0], '').trim() : raw.trim();
        if (rest && !c.note) c.note = rest;
      }
      if (c.len !== undefined) delete c.len;
      if (c.note === undefined) c.note = '';
    });
    (s.deviceTemplates || []).forEach(function (t) {
      if (!t.tplId) t.tplId = 'tpl' + (s.seq++);
    });
    if (!s.power) s.power = { eff: 0.7, headroom: 1.3, mixerW: 150, dspW: 50, seqW: 30 };
    if (!s.powerAlarmMode) s.powerAlarmMode = 'show';
  }

  /* 旧版本数据 / 导入数据补齐缺失字段 */
  function normalize(s) {
    s.inputGear = s.inputGear || [];
    s.userMixerTemplates = s.userMixerTemplates || [];
    if (!s.diagramLayout) s.diagramLayout = 'topdown';
    if (s.diagramOrient !== 'h') s.diagramOrient = 'v';
    upgradeData(s);
    /* v3：播种新的默认常用型号（WING RACK / MR18 / Unit48 / 两类功放 / 三类音箱），
       迁移时保留用户自建的型号（按名称去重） */
    if (!s.deviceTemplates) {
      s.deviceTemplates = JSON.parse(JSON.stringify(SP.TEMPLATES));
      s.deviceTemplatesVersion = 4;
    } else if (s.deviceTemplatesVersion !== 4) {
      var seeds = JSON.parse(JSON.stringify(SP.TEMPLATES));
      var seen = {};
      seeds.forEach(function (t) { seen[t.name] = true; });
      s.deviceTemplates.forEach(function (t) {
        if (!seen[t.name]) { seeds.push(t); seen[t.name] = true; }
      });
      s.deviceTemplates = seeds;
      s.deviceTemplatesVersion = 4;
    }
    if (s.mixer) normalizeMixer(s.mixer);
    (s.devices || []).forEach(function (d) {
      if (!d.color) d.color = SP.typeColor(d.type);
      if (!d.specs) d.specs = {};
      if (d.type === 'amp') {
        if (d.specs.grounded === undefined) d.specs.grounded = true;
        (d.outputs || []).forEach(function (p) { if (p) delete p.grounded; });
      }
      if (d.type === 'dsp') ensureDspRoute(d);
      if (d.type === 'speaker') {
        if (!d.speakerRole) d.speakerRole = SP.inferSpeakerRole(d.name);
        if (d.specs.powered !== 'active') d.specs.powered = 'passive';
        if (d.reverseParallel) {
          var rp = d.reverseParallel;
          if (!rp.groupId) rp.groupId = '';
          rp.parallel = Math.max(1, +rp.parallel || 1);
          rp.groupSize = Math.max(1, +rp.groupSize || rp.parallel);
          rp.index = Math.max(1, +rp.index || 1);
          rp.channel = Math.max(1, +rp.channel || 1);
          rp.locked = rp.locked !== false;
        }
      }
    });
    (s.connections || []).forEach(function (c) {
      if (c.cable === undefined) c.cable = '';
      if (c.color === undefined) c.color = '';
    });
    /* 桥接对的被合并端口上不允许保留连线 */
    s.connections = (s.connections || []).filter(function (c) {
      var sd = null;
      for (var i = 0; i < (s.devices || []).length; i++) {
        if (s.devices[i].id === c.sid) { sd = s.devices[i]; break; }
      }
      if (!sd || sd.type !== 'amp' || c.sport % 2 !== 1) return true;
      return (sd.ampPairModes || [])[(c.sport - 1) / 2] !== 'B';
    });
    /* 接线教学：乐器清单条目补 id；调音台的输入接线表清理失效项 */
    (s.inputGear || []).forEach(function (g) {
      if (!g.id) g.id = 'g' + (s.seq++);
    });
    (s.devices || []).forEach(function (d) {
      if (d.type !== 'mixer') return;
      if (!d.gearPatch) { d.gearPatch = {}; return; }
      var gp = {};
      Object.keys(d.gearPatch).forEach(function (k) {
        var gid = d.gearPatch[k];
        if (+k < d.inputs.length &&
            (s.inputGear || []).some(function (g) { return g.id === gid; })) {
          gp[k] = gid;
        }
      });
      d.gearPatch = gp;
    });
    /* 多调音台：旧全局台面数据迁移给第一台调音台；校正活动台 id */
    var mixDevs = (s.devices || []).filter(function (d) { return d.type === 'mixer'; });
    mixDevs.forEach(function (d, i) {
      if (!d.mixer && i === 0 && s.mixer) {
        d.mixer = JSON.parse(JSON.stringify(s.mixer));
      }
      if (d.mixer) normalizeMixer(d.mixer);
    });
    if (!s.activeMixerId || !mixDevs.some(function (d) { return d.id === s.activeMixerId; })) {
      s.activeMixerId = mixDevs.length ? mixDevs[0].id : '';
    }
    return s;
  }

  function snapshotState() { return JSON.stringify(state); }
  function snapshotMixer() { return JSON.stringify(M() || defaultMixer()); }
  function snapshotArea(name) {
    if (name === 'diagram') {
      return JSON.stringify({
        diagramLayout: state.diagramLayout || 'topdown',
        diagramOrient: state.diagramOrient || 'v',
        connections: state.connections,
        devices: state.devices.map(function (d) {
          return {
            id: d.id,
            px: d.px === undefined ? null : d.px,
            py: d.py === undefined ? null : d.py,
            collapsed: !!d.collapsed
          };
        })
      });
    }
    if (name === 'mixerDiagram') return snapshotMixer();
    if (name === 'inPatch') return JSON.stringify(M().inPatch || {});
    if (name === 'routeGrid') return JSON.stringify({ routes: M().routes || {}, links: M().links || [] });
    if (name === 'outPatch') return JSON.stringify(M().outPatch || {});
    return '';
  }
  function restoreAreaSnapshot(name, snap) {
    var data = JSON.parse(snap);
    if (name === 'diagram') {
      state.diagramLayout = data.diagramLayout || 'topdown';
      state.diagramOrient = data.diagramOrient === 'h' ? 'h' : 'v';
      if (data.connections) state.connections = data.connections;
      var map = {};
      (data.devices || []).forEach(function (d) { map[d.id] = d; });
      state.devices.forEach(function (d) {
        var x = map[d.id];
        if (!x) return;
        if (x.px === null || x.px === undefined) delete d.px; else d.px = x.px;
        if (x.py === null || x.py === undefined) delete d.py; else d.py = x.py;
        d.collapsed = !!x.collapsed;
      });
    } else if (name === 'mixerDiagram') {
      setMixerData(normalizeMixer(Object.assign(defaultMixer(), data)));
    } else if (name === 'inPatch') {
      var m1 = M();
      m1.inPatch = data || {};
      normalizeMixer(m1);
    } else if (name === 'routeGrid') {
      var m2 = M();
      m2.routes = data.routes || {};
      m2.links = data.links || [];
      normalizeMixer(m2);
    } else if (name === 'outPatch') {
      var m3 = M();
      m3.outPatch = data || {};
      normalizeMixer(m3);
    }
    save({ noHistory: true });
  }
  function trimStack(a) {
    var max = 80;
    while (a.length > max) a.shift();
  }
  var AREA_NAMES = ['diagram', 'mixerDiagram', 'inPatch', 'routeGrid', 'outPatch'];

  var state;
  try {
    var raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);
    if (raw) {
      state = Object.assign(defaultState(), JSON.parse(raw));
      state.mixer = Object.assign(defaultMixer(), state.mixer);
      normalize(state);
    }
  } catch (e) { /* 损坏数据回退到默认 */ }
  var firstRun = !state;
  if (!state) state = defaultState();
  var undoStack = [], redoStack = [];
  var areaStacks = {};
  AREA_NAMES.forEach(function (name) { areaStacks[name] = { undo: [], redo: [] }; });
  var lastSnapshot = snapshotState();
  var lastAreaSnapshots = {};
  AREA_NAMES.forEach(function (name) { lastAreaSnapshots[name] = snapshotArea(name); });

  /* 批量事务：期间所有 save 跳过，结束时统一存一次 → 撤销时整批 = 一步 */
  var batching = false;
  function batch(fn) {
    batching = true;
    try { fn(); } finally { batching = false; }
    save();
  }

  function save(opt) {
    if (batching) return;
    opt = opt || {};
    var snap = snapshotState();
    var areaSnaps = {};
    AREA_NAMES.forEach(function (name) { areaSnaps[name] = snapshotArea(name); });
    if (!opt.noHistory) {
      if (lastSnapshot && snap !== lastSnapshot) {
        undoStack.push(lastSnapshot);
        trimStack(undoStack);
        redoStack = [];
      }
      AREA_NAMES.forEach(function (name) {
        if (lastAreaSnapshots[name] && areaSnaps[name] !== lastAreaSnapshots[name]) {
          areaStacks[name].undo.push(lastAreaSnapshots[name]);
          trimStack(areaStacks[name].undo);
          areaStacks[name].redo = [];
        }
      });
    }
    lastSnapshot = snap;
    AREA_NAMES.forEach(function (name) { lastAreaSnapshots[name] = areaSnaps[name]; });
    var stored = true;
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { stored = false; if (SP.warnStorage) SP.warnStorage(); }
    var el = document.getElementById('save-indicator');
    if (el) {
      if (stored) {
        var t = new Date();
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        el.textContent = '已保存 ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds());
        el.classList.add('flash');
        setTimeout(function () { el.classList.remove('flash'); }, 900);
      } else {
        el.textContent = '⚠ 存储已满，未保存';
      }
    }
    if (SP.updateHistoryButtons) SP.updateHistoryButtons();
    if (SP.onStoreSaved && !opt.skipConfig) SP.onStoreSaved(state);
  }

  function restoreWholeSnapshot(snap) {
    state = Object.assign(defaultState(), JSON.parse(snap));
    state.mixer = Object.assign(defaultMixer(), state.mixer || {});
    normalize(state);
    save({ noHistory: true });
  }

  function undo() {
    if (!undoStack.length) return false;
    redoStack.push(snapshotState());
    trimStack(redoStack);
    restoreWholeSnapshot(undoStack.pop());
    return true;
  }
  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(snapshotState());
    trimStack(undoStack);
    restoreWholeSnapshot(redoStack.pop());
    return true;
  }
  function canUndo() { return !!undoStack.length; }
  function canRedo() { return !!redoStack.length; }

  function resetHistory() {
    undoStack = []; redoStack = [];
    AREA_NAMES.forEach(function (name) { areaStacks[name] = { undo: [], redo: [] }; });
    lastSnapshot = snapshotState();
    AREA_NAMES.forEach(function (name) { lastAreaSnapshots[name] = snapshotArea(name); });
    if (SP.updateHistoryButtons) SP.updateHistoryButtons();
  }

  function undoArea(name) {
    var h = areaStacks[name];
    if (!h || !h.undo.length) return false;
    h.redo.push(snapshotArea(name));
    trimStack(h.redo);
    restoreAreaSnapshot(name, h.undo.pop());
    return true;
  }
  function redoArea(name) {
    var h = areaStacks[name];
    if (!h || !h.redo.length) return false;
    h.undo.push(snapshotArea(name));
    trimStack(h.undo);
    restoreAreaSnapshot(name, h.redo.pop());
    return true;
  }
  function canUndoArea(name) { return !!(areaStacks[name] && areaStacks[name].undo.length); }
  function canRedoArea(name) { return !!(areaStacks[name] && areaStacks[name].redo.length); }

  function uid() { return 'd' + (state.seq++); }

  /* ---------- 设备类型 ---------- */

  function typeInfo(type) {
    if (SP.DEVICE_TYPES[type]) return SP.DEVICE_TYPES[type];
    for (var i = 0; i < state.customTypes.length; i++) {
      if (state.customTypes[i].key === type) return state.customTypes[i];
    }
    return { name: type, abbr: 'DEV' };
  }

  function addCustomType(name) {
    var key = 'ct' + (state.seq++);
    var abbr = name.replace(/\s/g, '').slice(0, 3).toUpperCase() || 'DEV';
    state.customTypes.push({ key: key, name: name, abbr: abbr });
    return key;
  }

  /* ---------- 设备 ---------- */

  function makePorts(count, labels, prefix, isAmpOut) {
    var arr = [];
    for (var i = 0; i < count; i++) {
      var p = { label: (labels && labels[i]) ? labels[i] : prefix + ' ' + (i + 1) };
      if (isAmpOut) p.gain = '';
      arr.push(p);
    }
    return arr;
  }

  function makeDevice(opt) {
    var dev = {
      id: uid(),
      type: opt.type,
      name: opt.name,
      color: opt.color || SP.typeColor(opt.type),
      imgId: '',
      tplId: opt.tplId || '',
      speakerRole: opt.type === 'speaker' ? (opt.speakerRole || 'fullrange') : '',
      specs: opt.specs || {},
      inputs: makePorts(opt.ins, opt.inLabels, 'IN', false),
      outputs: makePorts(opt.outs, opt.outLabels, 'OUT', opt.type === 'amp')
    };
    if (dev.type === 'amp') {
      if (dev.specs.grounded === undefined) dev.specs.grounded = true;
      dev.ampPairModes = [];
      /* 新功放默认 S 档（立体声，两路独立） */
      for (var pi = 0; pi < Math.ceil(dev.outputs.length / 2); pi++) dev.ampPairModes.push('S');
    }
    if (dev.type === 'dsp') ensureDspRoute(dev);
    if (dev.type === 'speaker' && dev.specs.powered !== 'active') dev.specs.powered = 'passive';
    if (dev.type === 'mixer') {
      dev.mixer = defaultMixerFor(dev, opt.mixerDefaults || null);
      if (!activeMixerDev()) state.activeMixerId = dev.id;
    }
    return dev;
  }

  function addDevice(opt) {
    var dev = makeDevice(opt);
    state.devices.push(dev);
    save();
    return dev;
  }

  function addDevices(opts) {
    var added = [];
    (opts || []).forEach(function (opt) {
      var dev = makeDevice(opt);
      state.devices.push(dev);
      added.push(dev);
    });
    if (added.length) save();
    return added;
  }

  function getDevice(id) {
    for (var i = 0; i < state.devices.length; i++) {
      if (state.devices[i].id === id) return state.devices[i];
    }
    return null;
  }

  function removeDevice(id) {
    state.devices = state.devices.filter(function (d) { return d.id !== id; });
    state.connections = state.connections.filter(function (c) {
      return c.sid !== id && c.tid !== id;
    });
    if (state.activeMixerId === id) {
      var mds = mixerDevices();
      state.activeMixerId = mds.length ? mds[0].id : '';
    }
    save();
  }

  /* 批量删除（框选 + Delete）：整批 = 一步撤销 */
  function removeDevices(ids) {
    if (!ids || !ids.length) return 0;
    var n = 0;
    batch(function () {
      ids.forEach(function (id) {
        if (getDevice(id)) { removeDevice(id); n++; }
      });
    });
    return n;
  }

  /* 清空全部设备与连线（可撤销） */
  function clearAllDevices() {
    var n = state.devices.length;
    if (n) {
      batch(function () {
        state.devices = [];
        state.connections = [];
        state.activeMixerId = '';
      });
    }
    return n;
  }

  /* ---------- DSP 内部矩阵 + 输出压限（RMS / PEAK Limit） ---------- */

  function ensureDspRoute(d) {
    if (!d.dspRoute) {
      d.dspRoute = { matrix: {}, limits: {} };
      var n = Math.min(d.inputs.length, d.outputs.length);
      for (var i = 0; i < n; i++) d.dspRoute.matrix[i] = [i];   /* 默认 1:1 直通 */
    } else {
      if (!d.dspRoute.matrix) d.dspRoute.matrix = {};
      if (!d.dspRoute.limits) d.dspRoute.limits = {};
    }
    var mx = {};
    Object.keys(d.dspRoute.matrix || {}).forEach(function (k) {
      var inIdx = +k;
      if (inIdx < 0 || inIdx >= d.inputs.length) return;
      var seen = {};
      var raw = Array.isArray(d.dspRoute.matrix[k]) ? d.dspRoute.matrix[k] : [];
      var arr = raw.filter(function (o) {
        o = +o;
        if (o < 0 || o >= d.outputs.length || seen[o]) return false;
        seen[o] = true;
        return true;
      });
      if (arr.length) mx[inIdx] = arr;
    });
    d.dspRoute.matrix = mx;
    var lm = {};
    Object.keys(d.dspRoute.limits || {}).forEach(function (k) {
      if (+k >= 0 && +k < d.outputs.length) lm[k] = d.dspRoute.limits[k];
    });
    d.dspRoute.limits = lm;
    return d.dspRoute;
  }
  function hasDspRoute(dev, inIdx, outIdx) {
    var r = ensureDspRoute(dev).matrix[inIdx];
    return !!r && r.indexOf(outIdx) >= 0;
  }
  function toggleDspRoute(devId, inIdx, outIdx) {
    var d = getDevice(devId);
    if (!d) return;
    var m = ensureDspRoute(d).matrix;
    var r = m[inIdx] || (m[inIdx] = []);
    var i = r.indexOf(outIdx);
    if (i >= 0) r.splice(i, 1); else r.push(outIdx);
    if (!r.length) delete m[inIdx];
    save();
  }
  function setDspLimit(devId, outIdx, key, val) {
    var d = getDevice(devId);
    if (!d) return;
    var lm = ensureDspRoute(d).limits;
    var o = lm[outIdx] || (lm[outIdx] = {});
    val = String(val || '').trim();
    if (val) o[key] = val; else delete o[key];
    if (!Object.keys(o).length) delete lm[outIdx];
    save();
  }

  /* ---------- 快速布局预设模板 ---------- */

  function addQuickPreset(name, data) {
    state.quickPresets.push({ name: name, data: data });
    save();
  }
  function removeQuickPreset(idx) {
    state.quickPresets.splice(idx, 1);
    save();
  }

  function addReversePreset(name, data) {
    state.reversePresets = state.reversePresets || [];
    var p = { name: name, data: JSON.parse(JSON.stringify(data || {})) };
    var idx = -1;
    state.reversePresets.forEach(function (x, i) { if (x.name === name) idx = i; });
    if (idx >= 0) state.reversePresets[idx] = p; else state.reversePresets.push(p);
    save();
  }

  function removeReversePreset(idx) {
    state.reversePresets = state.reversePresets || [];
    state.reversePresets.splice(idx, 1);
    save();
  }

  /* ---------- 设备 → 模板（存为模板 / 一键模板） ---------- */

  function baseNameOf(name) {
    return String(name || '').replace(/\s*\d+号$/, '').trim();
  }

  /* 按名称去重：已有同名模板则更新，否则新增；设备回填 tplId 以便后续同步 */
  function saveDeviceAsTemplate(dev) {
    var base = baseNameOf(dev.name) || dev.name;
    var t = {
      type: dev.type,
      name: base,
      ins: dev.inputs.length,
      outs: dev.outputs.map(function (p) { return p.label; }),
      specs: JSON.parse(JSON.stringify(dev.specs || {})),
      color: dev.color || ''
    };
    if (dev.type === 'speaker') t.speakerRole = dev.speakerRole || 'fullrange';
    var idx = -1;
    state.deviceTemplates.forEach(function (x, i) { if (x.name === base) idx = i; });
    var mode;
    if (idx >= 0) {
      t.tplId = state.deviceTemplates[idx].tplId || ('tpl' + (state.seq++));
      if (state.deviceTemplates[idx].mixerDefaults) t.mixerDefaults = state.deviceTemplates[idx].mixerDefaults;
      state.deviceTemplates[idx] = t;
      mode = 'updated';
    } else {
      t.tplId = 'tpl' + (state.seq++);
      state.deviceTemplates.push(t);
      mode = 'added';
    }
    /* 同名系列设备统一挂到该模板 */
    state.devices.forEach(function (d) {
      if (baseNameOf(d.name) === base && d.type === dev.type) d.tplId = t.tplId;
    });
    save();
    return mode;
  }

  /* ---------- 模板库整体存档：设备模板 + 快速布局预设 + 台面模板 ---------- */

  function exportTemplateLib() {
    return {
      __signalpathTplLib: 1,
      deviceTemplates: JSON.parse(JSON.stringify(state.deviceTemplates)),
      quickPresets: JSON.parse(JSON.stringify(state.quickPresets || [])),
      reversePresets: JSON.parse(JSON.stringify(state.reversePresets || [])),
      userMixerTemplates: JSON.parse(JSON.stringify(state.userMixerTemplates || []))
    };
  }

  /* 设备模板按「类型+名称」合并去重：同名更新、新名追加。返回 'added' | 'updated' */
  function mergeTemplate(t) {
    if (!t || !t.name) return null;
    var idx = -1;
    state.deviceTemplates.forEach(function (x, i) {
      if (x.name === t.name && x.type === t.type) idx = i;
    });
    if (idx >= 0) {
      t.tplId = state.deviceTemplates[idx].tplId || ('tpl' + (state.seq++));
      state.deviceTemplates[idx] = t;
      return 'updated';
    }
    var dup = state.deviceTemplates.some(function (x) { return x.tplId && x.tplId === t.tplId; });
    if (!t.tplId || dup) t.tplId = 'tpl' + (state.seq++);
    state.deviceTemplates.push(t);
    return 'added';
  }

  function importTemplateLib(data) {
    var res = { dev: 0, presets: 0, reversePresets: 0, mixerTpls: 0 };
    batch(function () {
      (data.deviceTemplates || []).forEach(function (t) {
        if (mergeTemplate(JSON.parse(JSON.stringify(t)))) res.dev++;
      });
      state.quickPresets = state.quickPresets || [];
      (data.quickPresets || []).forEach(function (p) {
        if (!p || !p.name) return;
        var i = -1;
        state.quickPresets.forEach(function (x, j) { if (x.name === p.name) i = j; });
        if (i >= 0) state.quickPresets[i] = p; else state.quickPresets.push(p);
        res.presets++;
      });
      state.reversePresets = state.reversePresets || [];
      (data.reversePresets || []).forEach(function (p) {
        if (!p || !p.name) return;
        var ri = -1;
        state.reversePresets.forEach(function (x, j) { if (x.name === p.name) ri = j; });
        if (ri >= 0) state.reversePresets[ri] = p; else state.reversePresets.push(p);
        res.reversePresets++;
      });
      state.userMixerTemplates = state.userMixerTemplates || [];
      (data.userMixerTemplates || []).forEach(function (m) {
        if (!m || !m.name) return;
        var i2 = -1;
        state.userMixerTemplates.forEach(function (x, j) { if (x.name === m.name) i2 = j; });
        if (i2 >= 0) state.userMixerTemplates[i2] = m; else state.userMixerTemplates.push(m);
        res.mixerTpls++;
      });
    });
    return res;
  }

  /* 一键模板：把画布上所有设备按名称系列归类存入模板库 */
  function saveAllTemplates() {
    var seen = {};
    var added = 0, updated = 0;
    batch(function () {
      state.devices.forEach(function (d) {
        var base = baseNameOf(d.name) || d.name;
        var key = d.type + '::' + base;
        if (seen[key]) return;
        seen[key] = true;
        if (saveDeviceAsTemplate(d) === 'added') added++; else updated++;
      });
    });
    return { added: added, updated: updated };
  }

  function clearDeviceConnections(id, side) {
    var before = state.connections.length;
    side = side || 'all';
    state.connections = state.connections.filter(function (c) {
      if (side === 'inputs') return c.tid !== id;
      if (side === 'outputs') return c.sid !== id;
      return c.sid !== id && c.tid !== id;
    });
    if (state.connections.length !== before) save();
    return before - state.connections.length;
  }

  function moveDevice(id, dir) {
    var i = state.devices.findIndex(function (d) { return d.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= state.devices.length) return;
    var t = state.devices[i];
    state.devices[i] = state.devices[j];
    state.devices[j] = t;
    save();
  }

  /* ---------- 批量复制设备（自动编号命名） ---------- */

  function cloneDevice(id, count) {
    var dev = getDevice(id);
    if (!dev || count < 1) return 0;
    var m = dev.name.match(/^(.*?)\s*(\d+)号$/);
    var base = m ? m[1] : dev.name;
    var maxN = 1;
    state.devices.forEach(function (d) {
      var mm = d.name.match(/^(.*?)\s*(\d+)号$/);
      if (mm && mm[1] === base) maxN = Math.max(maxN, +mm[2]);
      else if (d.name === base) maxN = Math.max(maxN, 1);
    });
    var at = state.devices.indexOf(dev);
    for (var k = 1; k <= count; k++) {
      var copy = JSON.parse(JSON.stringify(dev));
      copy.id = uid();
      copy.name = base + ' ' + (maxN + k) + '号';
      delete copy.px; delete copy.py;      /* 副本回到自动排版位置 */
      state.devices.splice(at + k, 0, copy);
    }
    save();
    return count;
  }

  /* ---------- 批量添加命名：返回 base 1号 / 2号…（接续已有编号） ---------- */

  function numberedNames(base, count) {
    var m = base.match(/^(.*?)\s*(\d+)号$/);
    if (m) base = m[1];
    var maxN = 0;
    state.devices.forEach(function (d) {
      var mm = d.name.match(/^(.*?)\s*(\d+)号$/);
      if (mm && mm[1] === base) maxN = Math.max(maxN, +mm[2]);
      else if (d.name === base) maxN = Math.max(maxN, 1);
    });
    var names = [];
    for (var k = 1; k <= count; k++) names.push(base + ' ' + (maxN + k) + '号');
    return names;
  }

  /* ---------- 智能分配：为该设备的未接输入按序接入上游空闲输出 ---------- */

  function autoSourceTypes(dev) {
    if (dev.type === 'dsp') return ['mixer'];
    if (dev.type === 'amp') return ['dsp', 'mixer'];
    /* 智能连接默认不自动并联：音箱只自动接功放/线路口，多余音箱提示未接。
       手动音箱→音箱并联仍然允许（见 canAutoConnect 的 manual 分支 / connectionError）。 */
    if (dev.type === 'speaker') return speakerPowered(dev) ? ['dsp', 'mixer'] : ['amp'];
    if (dev.type === 'mixer') return [];
    return ['mixer', 'dsp'];   /* 自定义类型只自动接线路级上游，避免误接功放输出 */
  }

  function canAutoConnect(target, source) {
    if (!target || !source || target.id === source.id) return false;
    if (target.type === 'speaker') {
      /* 音箱 → 音箱 并联仅限手动连线（智能分配不会走到这里，autoSourceTypes 已排除） */
      if (source.type === 'speaker') {
        return speakerPowered(source) === speakerPowered(target) &&
          (source.speakerRole || 'fullrange') === (target.speakerRole || 'fullrange');
      }
      if (speakerPowered(target)) {
        return signalOf(source, 'out') === 'line';
      }
      return source.type === 'amp' && signalOf(source, 'out') === 'speaker';
    }
    if (signalOf(source, 'out') !== signalOf(target, 'in')) return false;
    if (target.type === 'amp') return source.type === 'dsp' || source.type === 'mixer';
    if (target.type === 'dsp') return source.type === 'mixer';
    if (target.type === 'mixer') return false;
    return source.type !== 'amp' && source.type !== 'speaker';
  }

  function autoFreeOuts(dev) {
    var pref = autoSourceTypes(dev), outs = [];
    for (var pi = 0; pi < pref.length; pi++) {
      var tk = pref[pi];
      state.devices.forEach(function (s) {
        if (s.type !== tk || !canAutoConnect(dev, s)) return;
        s.outputs.forEach(function (p, i) {
          if (isHiddenOut(s, i)) return;
          if (!consumersOf(s.id, i).length) outs.push({ dev: s, port: i });
        });
      });
      if (outs.length) break;
    }
    return outs;
  }

  function smartAssign(id) {
    var dev = getDevice(id);
    if (!dev) return { lines: [], msg: '' };

    var freeInputs = [];
    dev.inputs.forEach(function (p, i) {
      if (!sourceFor(dev.id, i)) freeInputs.push(i);
    });
    if (!freeInputs.length) {
      return { lines: [], msg: '「' + dev.name + '」的所有输入口都已连接。' };
    }

    var freeOuts = autoFreeOuts(dev);
    if (!freeOuts.length) {
      return { lines: [], msg: dev.type === 'mixer'
        ? '调音台通常是信号源，没有可自动接入的上游输出。'
        : dev.type === 'speaker'
          ? (speakerPowered(dev)
            ? '有源音箱只自动接调音台 / DSP 信号线输出；当前没有可用空闲输出（可手动并联）。'
            : '无源音箱只自动接功放音响线输出；当前没有可用空闲输出（可手动并联）。')
          : '上游设备没有可安全自动分配的空闲输出口。' };
    }

    var n = Math.min(freeInputs.length, freeOuts.length);
    var lines = [];
    for (var k = 0; k < n; k++) {
      var o = freeOuts[k], ti = freeInputs[k];
      var r = connect(dev.id, ti, o.dev.id, o.port);
      if (r && r.ok === false) continue;
      lines.push(o.dev.name + ' · ' + o.dev.outputs[o.port].label +
        ' → ' + dev.inputs[ti].label);
    }
    return { lines: lines, msg: '' };
  }

  /* 一键智能连接：按信号层级（DSP → 功放 → 音箱）依次给所有未接输入补线，
     保证上游先接好、下游再级联；同层内按机架顺序。 */
  function smartAssignAll() {
    var roleOrd = { linearray: 0, fullrange: 1, sub: 2 };
    function layerOf(d) {
      if (d.type === 'mixer') return -1;   /* 信号源，不参与 */
      if (d.type === 'dsp') return 1;
      if (d.type === 'amp') return 2;
      if (d.type === 'speaker') return 3 + (roleOrd[d.speakerRole || 'fullrange'] || 1) / 10;
      return 1.5;   /* 自定义类型 */
    }
    var order = state.devices
      .map(function (d, i) { return { d: d, i: i, l: layerOf(d) }; })
      .filter(function (x) { return x.l >= 0; })
      .sort(function (a, b) { return a.l - b.l || a.i - b.i; });

    var lines = [];
    var count = 0;
    order.forEach(function (x) {
      var r = smartAssign(x.d.id);
      if (r.lines.length) {
        lines.push('— ' + x.d.name + '：');
        r.lines.forEach(function (l) { lines.push('　' + l); });
        count += r.lines.length;
      }
    });
    var lockedN = enforceReverseParallelGroups();
    if (lockedN) {
      lines.push('— 反推并联串接：');
      lines.push('　已恢复 ' + lockedN + ' 条受控并联串接线');
      count += lockedN;
    }
    /* 仍未接的输入口（不含调音台的话筒/线路输入）；音响单独统计只数用于提示 */
    var remaining = 0;
    var speakerLeft = 0;
    state.devices.forEach(function (d) {
      if (d.type === 'mixer') return;
      var unfed = false;
      d.inputs.forEach(function (pt, i) {
        if (!sourceFor(d.id, i)) { remaining++; unfed = true; }
      });
      if (unfed && d.type === 'speaker') speakerLeft++;
    });
    return { lines: lines, count: count, remaining: remaining, speakerLeft: speakerLeft };
  }

  /* 一键清空全部连线（可通过撤销恢复） */
  function clearAllConnections() {
    var n = state.connections.length;
    if (n) {
      state.connections = [];
      save();
    }
    return n;
  }

  function smartAssignPreview(id) {
    var dev = getDevice(id);
    if (!dev) return { count: 0, msg: '' };
    var freeInputs = [];
    dev.inputs.forEach(function (p, i) {
      if (!sourceFor(dev.id, i)) freeInputs.push(i);
    });
    if (!freeInputs.length) return { count: 0, msg: '所有输入口都已连接。' };
    var freeOuts = autoFreeOuts(dev);
    return { count: Math.min(freeInputs.length, freeOuts.length), inputs: freeInputs.length, outputs: freeOuts.length };
  }

  /* ---------- 型号模板管理 ---------- */

  function addDeviceTemplate(t) {
    if (!t.tplId) t.tplId = 'tpl' + (state.seq++);
    state.deviceTemplates.push(t);
    save();
  }
  function updateDeviceTemplate(idx, t) {
    if (!state.deviceTemplates[idx]) return;
    t.tplId = state.deviceTemplates[idx].tplId || ('tpl' + (state.seq++));
    state.deviceTemplates[idx] = t;
    save();
  }
  function removeDeviceTemplate(idx) { state.deviceTemplates.splice(idx, 1); save(); }

  /* 模板 → 实例同步：同步路数/端口标注/规格(U数等)/颜色，不改实例名字 */
  function templateInstances(tplId) {
    if (!tplId) return [];
    return state.devices.filter(function (d) { return d.tplId === tplId; });
  }

  function syncTemplateInstances(idx) {
    var t = state.deviceTemplates[idx];
    if (!t || !t.tplId) return 0;
    var list = templateInstances(t.tplId);
    if (!list.length) return 0;
    var outs0 = Array.isArray(t.outs) ? t.outs.length : t.outs;
    batch(function () {
      list.forEach(function (d) {
        resizeDevice(d, t.ins, outs0);
        if (Array.isArray(t.outs)) {
          t.outs.forEach(function (lb, i) { if (d.outputs[i]) d.outputs[i].label = lb; });
        }
        var keepPowered = d.type === 'speaker' && d.specs ? d.specs.powered : null;
        d.specs = Object.assign({}, d.specs, t.specs || {});
        if (keepPowered) d.specs.powered = keepPowered;   /* 有源/无源是实例自己的选择 */
        if (t.color) d.color = t.color;
        if (d.type === 'speaker' && t.speakerRole) d.speakerRole = t.speakerRole;
      });
      cleanupConnectionErrors();
    });
    return list.length;
  }

  /* ---------- 快速布局：批量建设备 + 一键智能连接 = 单个撤销步骤。
     item.parallel > 1 的音箱行：智能连接后自动把未接音箱串到已接音箱后
     （SpeakON 菊花链：功放 OUT → 音箱1 → 音箱2 …） ---------- */

  function chainParallelSpeakers(devs, par) {
    if (par <= 1) return;
    var keepLeaders = Math.ceil(devs.length / par);
    var kept = 0;
    devs.forEach(function (d) {
      var c = sourceFor(d.id, 0);
      var s = c && getDevice(c.sid);
      if (!s || s.type === 'speaker') return;
      kept++;
      if (kept > keepLeaders) disconnect(d.id, 0, true);
    });
    function fed(d) {
      return d.inputs.some(function (p, i) { return !!sourceFor(d.id, i); });
    }
    var leaders = devs.filter(fed);
    var followers = devs.filter(function (d) { return !fed(d); });
    var fi = 0;
    leaders.forEach(function (lead) {
      var prev = lead;
      for (var k = 1; k < par && fi < followers.length; k++) {
        var next = followers[fi++];
        var r = connect(next.id, 0, prev.id, 0);
        if (r && r.ok === false) break;
        prev = next;
      }
    });
  }

  function makeDevicesFromTemplate(t, count, opt) {
    opt = opt || {};
    var out = [];
    if (!t || !count) return out;
    var outs0 = Array.isArray(t.outs) ? t.outs.length : t.outs;
    var names = count > 1 ? numberedNames(t.name, count) : [t.name];
    names.forEach(function (nm) {
      var specs = Object.assign({}, t.specs || {});
      if (t.type === 'speaker') specs.powered = opt.powered === 'active' ? 'active' : 'passive';
      var dev = makeDevice({
        type: t.type, name: nm, ins: t.ins, outs: outs0,
        outLabels: Array.isArray(t.outs) ? t.outs : null,
        speakerRole: t.type === 'speaker' ? (t.speakerRole || SP.inferSpeakerRole(t.name)) : '',
        specs: specs, mixerDefaults: t.mixerDefaults || null, tplId: t.tplId || ''
      });
      state.devices.push(dev);
      out.push(dev);
    });
    return out;
  }

  function freeLineOuts(devs) {
    var outs = [];
    (devs || []).forEach(function (d) {
      (d.outputs || []).forEach(function (p, i) {
        if (isHiddenOut(d, i)) return;
        if (!consumersOf(d.id, i).length) outs.push({ dev: d, port: i });
      });
    });
    return outs;
  }

  function connectSequential(sourceDevs, targets) {
    var outs = freeLineOuts(sourceDevs);
    var n = Math.min(outs.length, targets.length);
    for (var i = 0; i < n; i++) {
      connect(targets[i].dev.id, targets[i].port, outs[i].dev.id, outs[i].port);
    }
    return n;
  }

  function speakerGroups(devs, par, rowNo) {
    var groups = [];
    if (!devs.length) return groups;
    par = Math.max(1, +par || 1);
    for (var i = 0; i < devs.length; i += par) {
      var g = devs.slice(i, i + par);
      var groupId = 'rpg' + (state.seq++);
      g.forEach(function (d, j) {
        d.reverseParallel = {
          groupId: groupId, parallel: par, groupSize: g.length,
          index: j + 1, channel: groups.length + 1, row: rowNo || 0,
          locked: par > 1
        };
      });
      groups.push(g);
    }
    return groups;
  }

  function chainLockedGroup(group) {
    if (!group || !group.length) return 0;
    group.sort(function (a, b) {
      return ((a.reverseParallel || {}).index || 1) - ((b.reverseParallel || {}).index || 1);
    });
    var n = 0;
    for (var i = 1; i < group.length; i++) {
      disconnect(group[i].id, 0, true);
      var r = connect(group[i].id, 0, group[i - 1].id, 0);
      var c = sourceFor(group[i].id, 0);
      if (c) {
        c.reverseParallelGroupId = (group[i].reverseParallel || {}).groupId || '';
        c.reverseParallel = true;
      }
      if (!r || r.ok !== false) n++;
    }
    return n;
  }

  function enforceReverseParallelGroups() {
    var groups = {};
    state.devices.forEach(function (d) {
      if (d.type !== 'speaker' || !d.reverseParallel || !d.reverseParallel.locked) return;
      var gid = d.reverseParallel.groupId;
      if (!gid) return;
      (groups[gid] = groups[gid] || []).push(d);
    });
    var count = 0;
    Object.keys(groups).forEach(function (gid) {
      count += chainLockedGroup(groups[gid]);
    });
    return count;
  }

  function reverseLayout(plan) {
    plan = plan || {};
    var added = [];
    batch(function () {
      var mixers = makeDevicesFromTemplate(plan.mixerTpl, plan.mixerCount || 0);
      var dsps = makeDevicesFromTemplate(plan.dspTpl, plan.dspCount || 0);
      added = added.concat(mixers, dsps);

      var ampInputs = [];
      var rowPlans = [];
      (plan.speakerRows || []).forEach(function (row, ri) {
        var amps4 = makeDevicesFromTemplate(plan.amp4Tpl, row.a4 || 0);
        var amps2 = makeDevicesFromTemplate(plan.amp2Tpl, row.a2 || 0);
        var amps = amps4.concat(amps2);
        var speakers = makeDevicesFromTemplate(row.tpl, row.count || 0, { powered: 'passive' });
        added = added.concat(amps, speakers);
        amps.forEach(function (amp) {
          (amp.inputs || []).forEach(function (p, i) { ampInputs.push({ dev: amp, port: i }); });
        });
        rowPlans.push({ row: row, amps: amps, speakers: speakers, groups: speakerGroups(speakers, row.parallel || 1, ri + 1) });
      });

      if (mixers.length && dsps.length) {
        var dspInputs = [];
        dsps.forEach(function (dsp) {
          (dsp.inputs || []).forEach(function (p, i) { dspInputs.push({ dev: dsp, port: i }); });
        });
        connectSequential(mixers, dspInputs);
      }
      connectSequential(dsps.length ? dsps : mixers, ampInputs);

      rowPlans.forEach(function (rp) {
        var ampOuts = [];
        rp.amps.forEach(function (amp) {
          visibleOuts(amp).forEach(function (oi) {
            if (!consumersOf(amp.id, oi).length) ampOuts.push({ dev: amp, port: oi });
          });
        });
        rp.groups.forEach(function (g, gi) {
          if (!g.length || !ampOuts[gi]) return;
          connect(g[0].id, 0, ampOuts[gi].dev.id, ampOuts[gi].port);
          chainLockedGroup(g);
        });
      });
      state.diagramLayout = 'smart';
    });
    return added;
  }

  function quickLayout(items) {
    var added = [];
    var perItem = [];
    batch(function () {
      (items || []).forEach(function (it) {
        var mine = [];
        perItem.push(mine);
        if (!it.tpl || !it.count) return;
        var t = it.tpl;
        var outs0 = Array.isArray(t.outs) ? t.outs.length : t.outs;
        var names = it.count > 1 ? numberedNames(t.name, it.count) : [t.name];
        names.forEach(function (nm) {
          var specs = Object.assign({}, t.specs || {});
          if (t.type === 'speaker') {
            specs.powered = it.powered === 'active' ? 'active' : 'passive';
          }
          var dev = makeDevice({
            type: t.type, name: nm, ins: t.ins, outs: outs0,
            outLabels: Array.isArray(t.outs) ? t.outs : null,
            speakerRole: t.type === 'speaker' ? (t.speakerRole || SP.inferSpeakerRole(t.name)) : '',
            specs: specs, mixerDefaults: t.mixerDefaults || null, tplId: t.tplId || ''
          });
          state.devices.push(dev);
          added.push(dev);
          mine.push(dev);
        });
      });
      if (added.length) {
        smartAssignAll();
        (items || []).forEach(function (it, idx) {
          if (it.tpl && it.tpl.type === 'speaker' && (it.parallel || 1) > 1) {
            chainParallelSpeakers(perItem[idx], it.parallel);
          }
        });
        state.diagramLayout = 'smart';   /* 12：交叉更少的对齐方案自动生效 */
      }
    });
    return added;
  }

  /* ---------- 音响反推（纯函数，可测）----------
     rows: [{ name, power(W), ohms(Ω), count, parallel(每通道并联只数,默认1) }]
     opt:  { ratio, ampMode:'2'|'4'|'mix', amp2W, amp4W, minOhms(4|2), dspOuts, mixerN }
     规则：不同型号音响不混用同一台功放；搭配模式 4 通道优先，
     余 ≤2 路补 1 台 2 通道，余 3 路补 1 台 4 通道；全部向上取整保富余。 */
  function reverseCalc(rows, opt) {
    opt = opt || {};
    var ratio = +opt.ratio || 1.5;
    var minOhms = +opt.minOhms || 4;
    var res = { rows: [], amp2N: 0, amp4N: 0, dspN: 0, ampInputs: 0,
      warns: [], errors: [], channels: 0 };
    (rows || []).forEach(function (r) {
      var count = Math.max(0, +r.count || 0);
      if (!count) return;
      var par = Math.max(1, +r.parallel || 1);
      var w = +r.power || 0;
      var ohm = +r.ohms || 0;
      var label = r.name || '未命名音响';
      if (!w) { res.errors.push(label + '：缺功率，无法反推'); return; }
      if (par > 1 && !ohm) { res.errors.push(label + '：并联必须填写阻抗'); return; }
      var loadW = w * par;                       /* 并联功率叠加 */
      var loadOhm = ohm ? Math.round(ohm / par * 100) / 100 : 0;   /* 并联阻抗减半 */
      var needW = Math.ceil(loadW * ratio);
      var ch = Math.ceil(count / par);
      if (loadOhm && loadOhm < minOhms) {
        res.warns.push('⚠ ' + label + '：并联后 ' + loadOhm + 'Ω 低于功放最低负载 ' +
          minOhms + 'Ω' + (minOhms === 4 ? '（可切换 2Ω 低阻机型）' : ''));
      }
      var a2 = 0, a4 = 0;
      if (opt.ampMode === '2') {
        a2 = Math.ceil(ch / 2);
      } else if (opt.ampMode === '4') {
        a4 = Math.ceil(ch / 4);
      } else {
        a4 = Math.floor(ch / 4);
        var rem = ch % 4;
        if (rem === 3) a4 += 1;          /* 余 3 路补 1 台 4 通道 */
        else if (rem > 0) a2 += 1;       /* 余 1-2 路补 1 台 2 通道 */
      }
      if (a2 && opt.amp2W && opt.amp2W < needW) {
        res.warns.push('⚠ 2通道功放功率不足：' + label + ' 需 ≥' + needW +
          'W/通道，所选仅 ' + opt.amp2W + 'W');
      }
      if (a4 && opt.amp4W && opt.amp4W < needW) {
        res.warns.push('⚠ 4通道功放功率不足：' + label + ' 需 ≥' + needW +
          'W/通道，所选仅 ' + opt.amp4W + 'W');
      }
      res.amp2N += a2;
      res.amp4N += a4;
      res.channels += ch;
      res.rows.push({ name: label, needW: needW, ch: ch, loadW: loadW,
        loadOhm: loadOhm, par: par, count: count, a2: a2, a4: a4 });
    });
    res.ampInputs = res.amp2N * 2 + res.amp4N * 4;
    res.dspN = res.ampInputs ? Math.ceil(res.ampInputs / Math.max(1, +opt.dspOuts || 8)) : 0;
    return res;
  }

  function resizeDevice(dev, ins, outs) {
    var isAmp = dev.type === 'amp';
    while (dev.inputs.length < ins) dev.inputs.push({ label: 'IN ' + (dev.inputs.length + 1) });
    while (dev.inputs.length > ins) dev.inputs.pop();
    while (dev.outputs.length < outs) {
      var p = { label: 'OUT ' + (dev.outputs.length + 1) };
      if (isAmp) p.gain = '';
      dev.outputs.push(p);
    }
    while (dev.outputs.length > outs) dev.outputs.pop();
    if (isAmp) {
      if (!dev.specs) dev.specs = {};
      if (dev.specs.grounded === undefined) dev.specs.grounded = true;
      var pairs = Math.ceil(dev.outputs.length / 2);
      if (!Array.isArray(dev.ampPairModes)) dev.ampPairModes = [];
      while (dev.ampPairModes.length < pairs) dev.ampPairModes.push('S');
      dev.ampPairModes.length = pairs;
    }
    if (dev.type === 'dsp') ensureDspRoute(dev);
    state.connections = state.connections.filter(function (c) {
      var s = getDevice(c.sid), t = getDevice(c.tid);
      return s && t && c.sport < s.outputs.length && c.tport < t.inputs.length;
    });
    save();
  }

  /* ---------- 功放输出对模式（P 并联 / S 立体声 / B 桥接） ---------- */

  function ampPairMode(dev, pair) {
    return (dev.ampPairModes && dev.ampPairModes[pair]) || 'P';
  }

  /* 选 B 桥接：该对的奇数端口并入偶数端口，其上连线自动断开（可撤销） */
  function setAmpPairMode(devId, pair, mode) {
    var dev = getDevice(devId);
    if (!dev || dev.type !== 'amp') return;
    if (!Array.isArray(dev.ampPairModes)) dev.ampPairModes = [];
    dev.ampPairModes[pair] = mode === 'B' ? 'B' : mode === 'S' ? 'S' : 'P';
    if (mode === 'B') {
      var hidden = pair * 2 + 1;
      state.connections = state.connections.filter(function (c) {
        return !(c.sid === dev.id && c.sport === hidden);
      });
    }
    save();
  }

  /* 桥接对的奇数端口在框图/连接中隐藏 */
  function isHiddenOut(dev, i) {
    return !!dev && dev.type === 'amp' && i % 2 === 1 && ampPairMode(dev, (i - 1) / 2) === 'B';
  }

  function visibleOuts(dev) {
    var arr = [];
    (dev.outputs || []).forEach(function (p, i) {
      if (!isHiddenOut(dev, i)) arr.push(i);
    });
    return arr;
  }

  function outLabelOf(dev, i) {
    var p = dev.outputs[i];
    if (!p) return '';
    if (dev.type === 'amp' && i % 2 === 0 && ampPairMode(dev, i / 2) === 'B') {
      return p.label + ' (BTL桥接)';
    }
    return p.label;
  }

  /* ---------- 端口接口类型（可按口覆盖默认值） ---------- */

  function portConn(dev, side, i) {
    var p = side === 'in' ? dev.inputs[i] : dev.outputs[i];
    return (p && p.conn) || SP.defaultConn(dev, side);
  }
  function setPortConn(devId, side, i, conn) {
    var dev = getDevice(devId);
    if (!dev) return;
    var p = side === 'in' ? dev.inputs[i] : dev.outputs[i];
    if (!p) return;
    if (conn && conn !== SP.defaultConn(dev, side)) p.conn = conn;
    else delete p.conn;
    save();
  }

  /* ---------- 信号类型（用于类型一致性警示 / 线材默认值） ---------- */

  function speakerPowered(dev) {
    return !!(dev && dev.type === 'speaker' && dev.specs && dev.specs.powered === 'active');
  }

  function signalOf(dev, dir) {
    if (dev.type === 'amp' && dir === 'out') return 'speaker';
    if (dev.type === 'speaker') return speakerPowered(dev) ? 'line' : 'speaker';
    return 'line';
  }
  function signalName(sig) { return sig === 'speaker' ? '喇叭级' : '线路级'; }

  /* ---------- 连接（以输入口为主键：一个输入只允许一个来源） ---------- */

  function sourceFor(tid, tport) {
    for (var i = 0; i < state.connections.length; i++) {
      var c = state.connections[i];
      if (c.tid === tid && c.tport === tport) return c;
    }
    return null;
  }

  function consumersOf(sid, sport) {
    return state.connections.filter(function (c) {
      return c.sid === sid && c.sport === sport;
    });
  }

  function connect(tid, tport, sid, sport) {
    /* 1:1 规则：输入口只有一个来源，输出口也只接一个目标 —
       新连接会同时替换掉该输入口的旧来源和该输出口的旧去向 */
    var srcDev = getDevice(sid);
    if (srcDev && isHiddenOut(srcDev, sport)) {
      return { ok: false, msg: '该输出口处于 BTL 桥接模式，已并入相邻端口，不能单独连线。' };
    }
    var next = { tid: tid, tport: tport, sid: sid, sport: sport, cable: '', color: '', lenM: '', note: '' };
    var error = connectionError(next);
    if (error) {
      state.connections = state.connections.filter(function (c) {
        return !(c.tid === tid && c.tport === tport);
      });
      save();
      return { ok: false, msg: error };
    }
    state.connections = state.connections.filter(function (c) {
      return !(c.tid === tid && c.tport === tport) &&
             !(c.sid === sid && c.sport === sport);
    });
    state.connections.push(next);
    save();
    return { ok: true, msg: connWarning(next) || '' };
  }

  function disconnect(tid, tport, noSave) {
    state.connections = state.connections.filter(function (c) {
      return !(c.tid === tid && c.tport === tport);
    });
    if (!noSave) save();
  }

  function connWarning(c) {
    var s = getDevice(c.sid), t = getDevice(c.tid);
    if (!s || !t) return null;
    var list = [];
    var err = connectionError(c);
    if (err) list.push(err);
    var so = signalOf(s, 'out'), ti = signalOf(t, 'in');
    if (!err && so !== ti) {
      list.push('信号类型不一致：' + signalName(so) + '输出 → ' + signalName(ti) + '输入');
    }
    var pw = powerWarning(c);
    if (pw) list.push(pw);
    return list.length ? list.join('；') : null;
  }

  function connectionError(c) {
    var s = getDevice(c.sid), t = getDevice(c.tid);
    if (!s || !t || t.type !== 'speaker') return null;
    var so = signalOf(s, 'out');
    if (speakerPowered(t) && so === 'speaker') {
      return '有源音箱不能接音响线/功放输出。';
    }
    if (!speakerPowered(t) && so === 'line') {
      return '无源音箱不能接信号线，必须接功放音响线。';
    }
    return null;
  }

  function cleanupConnectionErrors() {
    var removed = [];
    state.connections = state.connections.filter(function (c) {
      var err = connectionError(c);
      if (!err) return true;
      var s = getDevice(c.sid), t = getDevice(c.tid);
      removed.push((s ? s.name : '?') + ' → ' + (t ? t.name : '?') + '：' + err);
      return false;
    });
    if (removed.length) save();
    return removed;
  }

  function powerNumber(v) {
    var nums = String(v || '').match(/\d+(?:\.\d+)?/g);
    if (!nums || !nums.length) return 0;
    return nums.map(function (n) { return +n; }).reduce(function (a, b) { return Math.max(a, b); }, 0);
  }

  function fmtPower(n) {
    return Math.round(n * 10) / 10 + 'W';
  }

  function fmtOhms(n) {
    return Math.round(n * 100) / 100 + 'Ω';
  }

  function ohmsNumber(v) {
    var nums = String(v || '').match(/\d+(?:\.\d+)?/g);
    if (!nums || !nums.length) return 0;
    return nums.map(function (n) { return +n; })
      .filter(function (n) { return n > 0; })
      .reduce(function (a, b) { return Math.min(a, b); }, Infinity) || 0;
  }

  var POWER_ALARM_MODES = [
    { key: 'speech', name: '会议 / 广播（人声）', min: 1.0, max: 1.3 },
    { key: 'show', name: '商演 / 流行乐队 / KTV', min: 1.5, max: 2.0 },
    { key: 'heavy', name: '电音 / 说唱 / 重金属 / 超低炮', min: 2.0, max: 4.0 }
  ];

  function powerAlarmMode(key) {
    for (var i = 0; i < POWER_ALARM_MODES.length; i++) {
      if (POWER_ALARM_MODES[i].key === key) return POWER_ALARM_MODES[i];
    }
    return POWER_ALARM_MODES[1];
  }

  function setPowerAlarmMode(key) {
    state.powerAlarmMode = powerAlarmMode(key).key;
    save({ noHistory: true });
  }

  function collectPassiveSpeakerLoad(dev, list, seen) {
    if (!dev || dev.type !== 'speaker' || speakerPowered(dev) || seen[dev.id]) return;
    seen[dev.id] = true;
    list.push(dev);
    visibleOuts(dev).forEach(function (oi) {
      consumersOf(dev.id, oi).forEach(function (c) {
        var t = getDevice(c.tid);
        if (t && t.type === 'speaker' && !speakerPowered(t)) {
          collectPassiveSpeakerLoad(t, list, seen);
        }
      });
    });
  }

  function powerAlarmForOutput(ampId, sport, modeKey) {
    var amp = getDevice(ampId);
    if (!amp || amp.type !== 'amp' || isHiddenOut(amp, sport)) return null;
    var roots = [];
    consumersOf(amp.id, sport).forEach(function (c) {
      var t = getDevice(c.tid);
      if (t && t.type === 'speaker' && !speakerPowered(t)) roots.push(t);
    });
    if (!roots.length) return null;

    var speakers = [];
    roots.forEach(function (sp) { collectPassiveSpeakerLoad(sp, speakers, {}); });
    if (!speakers.length) return null;

    var mode = powerAlarmMode(modeKey || state.powerAlarmMode);
    var ampW = powerNumber(amp.specs && amp.specs.power);
    var totalW = 0, invOhms = 0;
    var missingPower = [], missingOhms = [], hasSub = false;
    speakers.forEach(function (sp) {
      var w = powerNumber(sp.specs && sp.specs.power);
      var ohm = ohmsNumber(sp.specs && sp.specs.ohms);
      if (w) totalW += w; else missingPower.push(sp);
      if (ohm) invOhms += 1 / ohm; else missingOhms.push(sp);
      if ((sp.speakerRole || 'fullrange') === 'sub') hasSub = true;
    });
    var loadOhms = (!missingOhms.length && invOhms > 0) ? 1 / invOhms : 0;
    var minFactor = hasSub ? 2 : mode.min;
    var maxFactor = hasSub ? 4 : mode.max;
    var minNeed = totalW ? totalW * minFactor : 0;
    var maxNeed = totalW ? totalW * maxFactor : 0;
    var issues = [];
    function issue(level, text) { issues.push({ level: level, text: text }); }

    if (!ampW) {
      issue('warn', '功放未填写功率，无法判断余量。');
    }
    if (missingPower.length) {
      issue('warn', '以下音箱未填写功率：' + missingPower.map(function (d) { return d.name; }).join('、'));
    }
    if (totalW && ampW) {
      if (ampW < totalW) {
        issue('error', '功放功率 ' + fmtPower(ampW) + ' 小于音箱总功率 ' + fmtPower(totalW) + '。');
      }
      if (ampW < minNeed) {
        issue('error', '功放余量不足：' + mode.name + ' 建议至少 ×' + minFactor +
          '，需要 ' + fmtPower(minNeed) + '。');
      } else if (ampW > maxNeed) {
        issue('warn', '功放高于建议上限 ×' + maxFactor + '（' + fmtPower(maxNeed) +
          '），请设置 DSP RMS/PEAK Limit 做限幅保护。');
      }
    }
    if (speakers.length > 1 && missingOhms.length) {
      issue('warn', '并联负载缺少阻抗，无法完整计算：' +
        missingOhms.map(function (d) { return d.name; }).join('、'));
    }
    if (loadOhms && loadOhms < 4) {
      issue('error', (speakers.length > 1 ? '并联后' : '') + '负载阻抗 ' +
        fmtOhms(loadOhms) + ' 小于 4Ω，请减少并联或更换功放/接法。');
    }
    if (hasSub) {
      issue('info', '含超低负载，默认按总功率 ×2～×4 选配，并严格设置限幅。');
    }

    var errors = issues.filter(function (x) { return x.level === 'error'; }).length;
    var warns = issues.filter(function (x) { return x.level === 'warn'; }).length;
    return {
      amp: amp, sport: sport, mode: mode, speakers: speakers, hasSub: hasSub,
      ampW: ampW, totalW: Math.round(totalW * 10) / 10,
      loadOhms: loadOhms ? Math.round(loadOhms * 100) / 100 : 0,
      minFactor: minFactor, maxFactor: maxFactor,
      minNeed: Math.round(minNeed * 10) / 10, maxNeed: Math.round(maxNeed * 10) / 10,
      issues: issues, errors: errors, warnings: warns,
      ok: !errors && !warns && !!ampW && !!totalW
    };
  }

  function powerAlarmResults(modeKey) {
    var mode = powerAlarmMode(modeKey || state.powerAlarmMode);
    var rows = [];
    state.devices.forEach(function (d) {
      if (d.type !== 'amp') return;
      visibleOuts(d).forEach(function (oi) {
        var r = powerAlarmForOutput(d.id, oi, mode.key);
        if (r) rows.push(r);
      });
    });
    var summary = { errors: 0, warnings: 0, ok: 0 };
    rows.forEach(function (r) {
      summary.errors += r.errors;
      summary.warnings += r.warnings;
      if (r.ok) summary.ok++;
    });
    return { mode: mode, rows: rows, summary: summary };
  }

  function powerWarning(c) {
    var s = getDevice(c.sid), t = getDevice(c.tid);
    if (!s || !t || s.type !== 'amp' || t.type !== 'speaker') return null;
    if (speakerPowered(t)) return null;
    var r = powerAlarmForOutput(s.id, c.sport, state.powerAlarmMode);
    if (!r) return null;
    var list = r.issues.filter(function (x) { return x.level === 'error' || x.level === 'warn'; });
    if (!list.length) return null;
    return '功率报警（' + r.mode.name + '）：' + list.map(function (x) { return x.text; }).join('；');
  }

  /* ---------- 统计：线材汇总 / 机柜 U 数 / 供电功率 ---------- */

  function cableSummary() {
    var groups = {};
    var order = [];
    state.connections.forEach(function (c) {
      if (!getDevice(c.sid) || !getDevice(c.tid)) return;
      var k = cableOf(c);
      if (!groups[k]) {
        groups[k] = { type: k, count: 0, meters: 0, missing: 0, lengths: {} };
        order.push(k);
      }
      var g = groups[k];
      g.count++;
      var m = parseFloat(c.lenM);
      if (m > 0) {
        var rounded = Math.round(m * 10) / 10;
        var lk = String(rounded);
        g.meters += rounded;
        g.lengths[lk] = (g.lengths[lk] || 0) + 1;
      } else {
        g.missing++;
      }
    });
    return order.map(function (k) {
      groups[k].meters = Math.round(groups[k].meters * 10) / 10;
      groups[k].lengthBreakdown = Object.keys(groups[k].lengths)
        .sort(function (a, b) { return parseFloat(a) - parseFloat(b); })
        .map(function (len) { return { len: parseFloat(len), count: groups[k].lengths[len] }; });
      return groups[k];
    });
  }

  function rackSummary() {
    var byType = {};
    var totalU = 0;
    var missing = [];
    state.devices.forEach(function (d) {
      if (d.type !== 'mixer' && d.type !== 'dsp' && d.type !== 'amp') return;
      var u = parseFloat(d.specs && d.specs.rackU);
      if (u > 0) {
        byType[d.type] = (byType[d.type] || 0) + u;
        totalU += u;
      } else {
        missing.push(d);
      }
    });
    var seqU = 1;   /* 电源时序器默认 1U */
    return {
      byType: byType, totalU: totalU, seqU: seqU, missing: missing,
      suggestMin: Math.ceil(totalU + seqU + 3),   /* 散热+安装余量 3–5U */
      suggestMax: Math.ceil(totalU + seqU + 5)
    };
  }

  /* 供电功率：功放/有源音箱额定功率 ÷ 效率 × 节目负载系数 + 周边固定值，× 动态余量 */
  var POWER_LEVELS = [
    { key: 'conf', name: '会议 / 背景音乐', factor: 0.125 },
    { key: 'std',  name: '常规演出 / 流行', factor: 0.25 },
    { key: 'rock', name: '摇滚 / 电音大动态', factor: 0.4 }
  ];
  var STD_BREAKERS = [10, 16, 20, 25, 32, 40, 63, 100, 125];

  function powerSummary() {
    var cfg = state.power || {};
    var eff = +cfg.eff || 0.7;
    var headroom = +cfg.headroom || 1.3;
    var ampW = 0, spkW = 0, mixers = 0, dsps = 0;
    var missing = [];
    state.devices.forEach(function (d) {
      if (d.type === 'amp') {
        var w = powerNumber(d.specs && d.specs.power);
        if (w) ampW += w; else missing.push(d);
      } else if (d.type === 'speaker' && speakerPowered(d)) {
        var w2 = powerNumber(d.specs && d.specs.power);
        if (w2) spkW += w2; else missing.push(d);
      } else if (d.type === 'mixer') mixers++;
      else if (d.type === 'dsp') dsps++;
    });
    var fixed = mixers * (+cfg.mixerW || 150) + dsps * (+cfg.dspW || 50) + (+cfg.seqW || 30);
    var levels = POWER_LEVELS.map(function (lv) {
      var draw = (ampW + spkW) / eff * lv.factor + fixed;
      var total = draw * headroom;
      var kw = Math.max(1, Math.ceil(total / 1000));
      var amps = total / 220;
      var breaker = null;
      for (var i = 0; i < STD_BREAKERS.length; i++) {
        if (STD_BREAKERS[i] >= amps * 1.25) { breaker = STD_BREAKERS[i]; break; }
      }
      return {
        key: lv.key, name: lv.name, factor: lv.factor,
        draw: Math.round(draw), total: Math.round(total),
        kw: kw, amps: Math.round(amps * 10) / 10,
        breaker: breaker, threePhase: kw > 7
      };
    });
    return { ampW: ampW, spkW: spkW, fixed: fixed, eff: eff, headroom: headroom,
      mixers: mixers, dsps: dsps, missing: missing, levels: levels };
  }

  /* 线材：未手动指定时按信号类型给默认值 */
  function cableOf(c) {
    if (c.cable) return c.cable;
    var s = getDevice(c.sid);
    return (s && signalOf(s, 'out') === 'speaker') ? '音箱线' : '卡农信号线';
  }

  /* 线色：连接自定义色 > 源设备颜色 */
  function colorOf(c) {
    if (c.color) return c.color;
    var s = getDevice(c.sid);
    return (s && s.color) || '#d99a3f';
  }

  /* 是否喇叭级线路（框图中加粗显示） */
  function isSpeakerRun(c) {
    var s = getDevice(c.sid);
    return !!s && signalOf(s, 'out') === 'speaker';
  }

  /* ---------- 接线教学：乐器/话筒 ↔ 调音台输入 ---------- */

  function gearById(id) {
    for (var i = 0; i < state.inputGear.length; i++) {
      if (state.inputGear[i].id === id) return state.inputGear[i];
    }
    return null;
  }
  function setGearPatch(devId, port, gearId) {
    var d = getDevice(devId);
    if (!d || d.type !== 'mixer') return;
    if (!d.gearPatch) d.gearPatch = {};
    if (gearId) d.gearPatch[port] = gearId;
    else delete d.gearPatch[port];
    save();
  }
  /* ---------- 外围输入设备清单 ---------- */

  function addGear() {
    state.inputGear.push({ id: 'g' + (state.seq++), name: '', cat: SP.GEAR_CATS[0], qty: 1, note: '' });
    save();
  }
  function removeGear(idx) {
    state.inputGear.splice(idx, 1);
    save();
  }

  /* ---------- 多调音台：每台调音台设备各有一份台内路由（存于 dev.mixer） ---------- */

  function mixerDevices() {
    return state.devices.filter(function (d) { return d.type === 'mixer'; });
  }
  function defaultMixerFor(d, overrides) {
    var m = defaultMixer();
    m.physIn = Math.max(1, d.inputs.length || 16);
    m.channels = m.physIn;
    m.physOut = Math.max(1, d.outputs.length || 8);
    /* 型号模板可自带台面默认值（CH/BUS/MAIN/MATRIX 数量等） */
    if (overrides) Object.assign(m, overrides);
    m.inPatch = null;
    return normalizeMixer(m);
  }
  function activeMixerDev() {
    var d = getDevice(state.activeMixerId);
    return (d && d.type === 'mixer') ? d : null;
  }
  /* 当前操作的台面：优先活动调音台设备；没有调音台时退回独立台面 state.mixer */
  function M() {
    var d = activeMixerDev();
    if (d) {
      if (!d.mixer) d.mixer = defaultMixerFor(d);
      return d.mixer;
    }
    return state.mixer;
  }
  /* 整体替换当前台面数据（模板应用 / 撤销恢复用） */
  function setMixerData(m) {
    var d = activeMixerDev();
    if (d) d.mixer = m; else state.mixer = m;
  }
  function setActiveMixer(id) {
    var d = getDevice(id);
    if (!d || d.type !== 'mixer') return;
    if (!d.mixer) d.mixer = defaultMixerFor(d);
    state.activeMixerId = id;
    save({ noHistory: true });   /* 翻页不产生撤销步骤 */
  }

  /* ---------- 调音台路由 ---------- */

  function mainTargets() {
    var m = M();
    var ids = mainIds(m);
    return ids.map(function (id, i) {
      var label;
      if (m.mains === 1 && m.mainMode === 'Mono') label = 'MAIN M';
      else if (m.mains === 2 && m.mainMode === 'LR') label = i === 0 ? 'MAIN L' : 'MAIN R';
      else label = 'MAIN ' + (i + 1);
      return { id: id, label: label };
    });
  }

  function chRoutes(ci) { return M().routes[ci] || []; }

  function hasRoute(ci, target) { return chRoutes(ci).indexOf(target) >= 0; }

  function toggleRoute(ci, target) {
    var r = M().routes[ci] || (M().routes[ci] = []);
    var idx = r.indexOf(target);
    if (idx >= 0) r.splice(idx, 1); else r.push(target);
    if (!r.length) delete M().routes[ci];
    save();
  }

  function setMixerConfig(cfg) {
    Object.assign(M(), cfg);
    var m = M();
    if (m.mains === undefined || m.mains === null) m.mains = m.mainMode === 'Mono' ? 1 : 2;
    m.mains = Math.max(0, Math.min(64, +m.mains || 0));
    Object.keys(m.routes).forEach(function (ci) {
      if (+ci >= m.channels) { delete m.routes[ci]; return; }
      var seen = {};
      m.routes[ci] = m.routes[ci].map(normalizeTargetId).filter(function (t) {
        if (!validTarget(m, t) || seen[t]) return false;
        seen[t] = true;
        return true;
      });
      if (!m.routes[ci].length) delete m.routes[ci];
    });
    m.links = (m.links || []).filter(function (ci) {
      return ci % 2 === 0 && ci + 1 < m.channels;
    });
    /* 输入分配：键 < 物理输入数，目标 < 通道数 */
    var ip = {};
    Object.keys(m.inPatch || {}).forEach(function (k) {
      if (+k >= m.physIn) return;
      var arr = (m.inPatch[k] || []).filter(function (c) { return c < m.channels; });
      if (arr.length) ip[k] = arr;
    });
    m.inPatch = ip;
    /* 输出分配：来源仍然存在，目标 < 物理输出数 */
    var op = {};
    Object.keys(m.outPatch || {}).forEach(function (sid) {
      sid = normalizeTargetId(sid);
      if (!validTarget(m, sid)) return;
      var arr = (m.outPatch[sid] || []).filter(function (o) { return o < m.physOut; });
      if (arr.length) op[sid] = arr;
    });
    m.outPatch = op;
    save();
  }

  /* ---------- 输入分配（IN → CH）/ 输出分配（BUS/MTX/MAIN → OUT） ---------- */

  function toggleInPatch(inIdx, chIdx) {
    var m = M();
    if (!m.inPatch) normalizeMixer(m);
    var r = m.inPatch[inIdx] || (m.inPatch[inIdx] = []);
    var i = r.indexOf(chIdx);
    if (i >= 0) r.splice(i, 1); else r.push(chIdx);
    if (!r.length) delete m.inPatch[inIdx];
    save();
  }
  function hasInPatch(inIdx, chIdx) {
    var r = M().inPatch[inIdx];
    return !!r && r.indexOf(chIdx) >= 0;
  }
  function resetInPatch() {
    var m = M();
    m.inPatch = {};
    var n = Math.min(m.physIn, m.channels);
    for (var i = 0; i < n; i++) m.inPatch[i] = [i];
    save();
  }
  function doubleInPatch() {
    var m = M();
    m.inPatch = {};
    for (var i = 0; i < m.physIn; i++) {
      var a = i * 2, b = a + 1;
      var arr = [];
      if (a < m.channels) arr.push(a);
      if (b < m.channels) arr.push(b);
      if (arr.length) m.inPatch[i] = arr;
    }
    save();
  }
  /* 输入分配是否为标准 1:1 直通 */
  function inPatchIsIdentity() {
    var m = M();
    var n = Math.min(m.physIn, m.channels);
    var keys = Object.keys(m.inPatch);
    if (keys.length !== n) return false;
    for (var i = 0; i < n; i++) {
      var r = m.inPatch[i];
      if (!r || r.length !== 1 || r[0] !== i) return false;
    }
    return true;
  }

  function toggleOutPatch(sid, outIdx) {
    var m = M();
    var r = m.outPatch[sid] || (m.outPatch[sid] = []);
    var i = r.indexOf(outIdx);
    if (i >= 0) r.splice(i, 1); else r.push(outIdx);
    if (!r.length) delete m.outPatch[sid];
    save();
  }
  function hasOutPatch(sid, outIdx) {
    var r = M().outPatch[sid];
    return !!r && r.indexOf(outIdx) >= 0;
  }
  function outPatchSources() {
    var m = M();
    var out = [];
    for (var b = 0; b < m.buses; b++) out.push({ id: 'b' + b, grp: 'bus', label: 'BUS ' + (b + 1) });
    mainTargets().forEach(function (t) {
      out.push({ id: t.id, grp: 'main', label: t.label });
    });
    for (var x = 0; x < m.matrices; x++) out.push({ id: 'x' + x, grp: 'mtx', label: 'MATRIX ' + (x + 1) });
    return out;
  }

  /* ---------- CH 立体声链接（相邻奇偶对：1-2、3-4…，存偶数下标锚点） ---------- */

  /* 返回该通道所属链接对的锚点下标；未链接返回 null */
  function linkAnchor(ci) {
    var L = M().links;
    if (L.indexOf(ci) >= 0) return ci;
    if (ci % 2 === 1 && L.indexOf(ci - 1) >= 0) return ci - 1;
    return null;
  }

  function toggleLink(ci) {
    if (ci % 2 !== 0 || ci + 1 >= M().channels) return;
    var L = M().links;
    var i = L.indexOf(ci);
    if (i >= 0) {
      L.splice(i, 1);
    } else {
      L.push(ci);
      /* 合并两个通道已有的路由到锚点通道 */
      var a = M().routes[ci] || [];
      var b = M().routes[ci + 1] || [];
      var merged = a.slice();
      b.forEach(function (t) { if (merged.indexOf(t) < 0) merged.push(t); });
      if (merged.length) M().routes[ci] = merged;
      else delete M().routes[ci];
      delete M().routes[ci + 1];
    }
    save();
  }

  /* ---------- 用户自定义台内路由模板 ---------- */

  function saveMixerTemplate(name) {
    /* 整套台面：配置 + 路由 + 链接 + 输入/输出分配 */
    var t = JSON.parse(JSON.stringify(M()));
    t.name = name;
    state.userMixerTemplates.push(t);
    save();
  }

  function applyMixerTemplate(t) {
    var copy = JSON.parse(JSON.stringify(t));
    delete copy.name;
    /* 旧版模板缺少的字段用默认值补齐 */
    if (!copy.inPatch) copy.inPatch = null;
    setMixerData(normalizeMixer(Object.assign(defaultMixer(), copy)));
    save();
  }

  function removeMixerTemplate(idx) {
    state.userMixerTemplates.splice(idx, 1);
    save();
  }

  /* ---------- 整体替换（导入 / 示例 / 清空） ---------- */

  function replaceState(next, opt) {
    opt = opt || {};
    state = Object.assign(defaultState(), next);
    state.mixer = Object.assign(defaultMixer(), state.mixer || {});
    normalize(state);
    save({ noHistory: !!opt.noHistory, skipConfig: !!opt.skipConfig });
    if (opt.resetHistory) resetHistory();
  }

  return {
    get state() { return state; },
    firstRun: firstRun,
    save: save,
    batch: batch,
    quickLayout: quickLayout,
    reverseLayout: reverseLayout,
    reverseCalc: reverseCalc,
    ampPairMode: ampPairMode,
    setAmpPairMode: setAmpPairMode,
    isHiddenOut: isHiddenOut,
    visibleOuts: visibleOuts,
    outLabelOf: outLabelOf,
    portConn: portConn,
    setPortConn: setPortConn,
    templateInstances: templateInstances,
    syncTemplateInstances: syncTemplateInstances,
    cableSummary: cableSummary,
    rackSummary: rackSummary,
    powerSummary: powerSummary,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    undoArea: undoArea,
    redoArea: redoArea,
    canUndoArea: canUndoArea,
    canRedoArea: canRedoArea,
    resetHistory: resetHistory,
    typeInfo: typeInfo,
    addCustomType: addCustomType,
    addDevice: addDevice,
    addDevices: addDevices,
    getDevice: getDevice,
    removeDevice: removeDevice,
    removeDevices: removeDevices,
    clearAllDevices: clearAllDevices,
    ensureDspRoute: ensureDspRoute,
    hasDspRoute: hasDspRoute,
    toggleDspRoute: toggleDspRoute,
    setDspLimit: setDspLimit,
    addQuickPreset: addQuickPreset,
    removeQuickPreset: removeQuickPreset,
    addReversePreset: addReversePreset,
    removeReversePreset: removeReversePreset,
    baseNameOf: baseNameOf,
    saveDeviceAsTemplate: saveDeviceAsTemplate,
    saveAllTemplates: saveAllTemplates,
    exportTemplateLib: exportTemplateLib,
    importTemplateLib: importTemplateLib,
    mergeTemplate: mergeTemplate,
    clearDeviceConnections: clearDeviceConnections,
    moveDevice: moveDevice,
    cloneDevice: cloneDevice,
    numberedNames: numberedNames,
    smartAssign: smartAssign,
    smartAssignAll: smartAssignAll,
    clearAllConnections: clearAllConnections,
    smartAssignPreview: smartAssignPreview,
    addDeviceTemplate: addDeviceTemplate,
    updateDeviceTemplate: updateDeviceTemplate,
    removeDeviceTemplate: removeDeviceTemplate,
    resizeDevice: resizeDevice,
    signalOf: signalOf,
    speakerPowered: speakerPowered,
    signalName: signalName,
    sourceFor: sourceFor,
    consumersOf: consumersOf,
    connect: connect,
    disconnect: disconnect,
    connWarning: connWarning,
    connectionError: connectionError,
    cleanupConnectionErrors: cleanupConnectionErrors,
    powerAlarmModes: POWER_ALARM_MODES,
    setPowerAlarmMode: setPowerAlarmMode,
    powerAlarmResults: powerAlarmResults,
    cableOf: cableOf,
    colorOf: colorOf,
    isSpeakerRun: isSpeakerRun,
    gearById: gearById,
    setGearPatch: setGearPatch,
    addGear: addGear,
    removeGear: removeGear,
    activeMixer: M,
    activeMixerDev: activeMixerDev,
    mixerDevices: mixerDevices,
    setActiveMixer: setActiveMixer,
    mainTargets: mainTargets,
    chRoutes: chRoutes,
    hasRoute: hasRoute,
    toggleRoute: toggleRoute,
    setMixerConfig: setMixerConfig,
    toggleInPatch: toggleInPatch,
    hasInPatch: hasInPatch,
    resetInPatch: resetInPatch,
    doubleInPatch: doubleInPatch,
    inPatchIsIdentity: inPatchIsIdentity,
    toggleOutPatch: toggleOutPatch,
    hasOutPatch: hasOutPatch,
    outPatchSources: outPatchSources,
    linkAnchor: linkAnchor,
    toggleLink: toggleLink,
    saveMixerTemplate: saveMixerTemplate,
    applyMixerTemplate: applyMixerTemplate,
    removeMixerTemplate: removeMixerTemplate,
    replaceState: replaceState,
    defaultState: defaultState
  };
})();
