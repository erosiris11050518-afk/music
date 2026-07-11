/* ============================================================
   db.js — IndexedDB 图片存储 + 内存缓存
   state 里只存图片 id，dataURL 统一放这里，避免撑爆 localStorage。
   put/get/remove 全部同步（内存缓存），落盘异步、失败不阻塞。
   ============================================================ */

var SP = window.SP = window.SP || {};

SP.exportDateStamp = function (d) {
  d = d || new Date();
  return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
};

SP.exportBaseName = function (d) {
  return 'ErosIris-Link+' + SP.exportDateStamp(d);
};

SP.exportFilename = function (name, ext) {
  var base = SP.exportBaseName();
  if (ext) return base + (name ? '-' + name : '') + '.' + ext.replace(/^\./, '');
  name = String(name || '').trim();
  if (!name) return base;
  if (name.indexOf('ErosIris-Link+') === 0) return name;
  var suffix = '', dot = name.match(/(\.[^.\/]+)$/);
  if (dot) {
    suffix = dot[1];
    name = name.slice(0, -suffix.length);
  }
  /* 接受旧 SignalPath 文件名，导出时统一为 ErosIris-Link。 */
  name = name.replace(/^(?:signalpath|ErosIris-Link)-?/i, '').replace(/-\d{8}$/i, '');
  if (/^\d{8}$/.test(name)) name = '';
  return base + (name ? '-' + name : '') + suffix;
};

SP.Images = (function () {
  var DB_NAME = 'signalpath-img';
  var STORE = 'images';
  var db = null;
  var cache = {};          /* id -> dataURL */
  var pending = [];        /* db 打开前积压的写操作 [id, dataURL|null] */

  function uid() {
    return 'img-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function persist(id, data) {
    if (!db) { pending.push([id, data]); return; }
    try {
      var os = db.transaction(STORE, 'readwrite').objectStore(STORE);
      if (data === null) os.delete(id); else os.put(data, id);
    } catch (e) { /* 落盘失败不影响本次会话 */ }
  }

  function init() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) { resolve(); return; }
      var req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (e) { resolve(); return; }
      req.onupgradeneeded = function () {
        req.result.createObjectStore(STORE);
      };
      req.onerror = function () { resolve(); };
      req.onsuccess = function () {
        db = req.result;
        try {
          var os = db.transaction(STORE, 'readonly').objectStore(STORE);
          var cur = os.openCursor();
          cur.onsuccess = function () {
            var c = cur.result;
            if (c) {
              /* 本次会话已写入的（迁移/导入）比库里的新，不覆盖 */
              if (cache[c.key] === undefined) cache[c.key] = c.value;
              c.continue();
            } else {
              pending.forEach(function (w) { persist(w[0], w[1]); });
              pending = [];
              resolve();
            }
          };
          cur.onerror = function () { resolve(); };
        } catch (e) { resolve(); }
      };
    });
  }

  function put(dataUrl) {
    var id = uid();
    cache[id] = dataUrl;
    persist(id, dataUrl);
    return id;
  }
  function get(id) { return id ? (cache[id] || '') : ''; }
  function remove(id) {
    if (!id) return;
    delete cache[id];
    persist(id, null);
  }

  return { init: init, put: put, get: get, remove: remove };
})();
