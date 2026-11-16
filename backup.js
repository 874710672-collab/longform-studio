/* backup.js — 全量数据备份与恢复
   覆盖所有 localStorage 键：书库、配置、当前指针。
   恢复时支持「合并」和「覆盖」两种模式。 */
(function () {
  const KEYS = {
    books: 'll_books_v1',
    curBook: 'll_cur_v1',
    curUnit: 'll_unit_v1',
    cfg: 'ts_cfg_v1',
    projects: 'ts_projects_v1',
    curProj: 'ts_cur_v1'
  };

  const FORMAT = 'longform-studio-backup';
  const VERSION = 1;

  function readAll() {
    const out = {};
    Object.keys(KEYS).forEach(k => {
      const raw = localStorage.getItem(KEYS[k]);
      if (raw === null) return;
      try { out[k] = JSON.parse(raw); }
      catch (e) { out[k] = raw; }
    });
    return out;
  }

  /* 生成备份对象 */
  function build() {
    const data = readAll();
    const books = data.books || [];
    const units = books.reduce((a, b) => a + (b.units ? b.units.length : 0), 0);
    const done = books.reduce((a, b) =>
      a + (b.units || []).filter(u => u.steps && u.steps.polish && u.steps.polish.status === 'done').length, 0);
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      app: window.APP_VERSION || '',
      stats: { books: books.length, units, done },
      data
    };
  }

  function sizeText(obj) {
    const s = JSON.stringify(obj);
    const bytes = new Blob([s]).size;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  /* 触发文件下载 */
  function download(obj, filename) {
    const s = JSON.stringify(obj, null, 1);
    const blob = new Blob([s], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
  }

  function stamp() {
    const d = new Date();
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
  }

  /* ---------- 恢复 ---------- */

  /* 校验备份结构 */
  function validate(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, msg: '不是有效的 JSON' };
    if (obj.format !== FORMAT) {
      if (obj.data && obj.data.books) return { ok: true, warn: '旧格式备份，仍可导入' };
      if (obj.id && obj.units) return { ok: true, warn: '这是「单本书」导出，只能导入这一本' };
      return { ok: false, msg: '这不是本应用的备份文件' };
    }
    if (!obj.data || !obj.data.books) return { ok: false, msg: '备份缺少书库数据' };
    return { ok: true, warn: '' };
  }

  /* 合并：按 id 去重，同 id 取 updatedAt 较新的 */
  function mergeBooks(localList, incomingList) {
    const map = new Map();
    (localList || []).forEach(b => map.set(b.id, b));
    let added = 0, updated = 0, skipped = 0;
    (incomingList || []).forEach(b => {
      const had = map.get(b.id);
      if (!had) { map.set(b.id, b); added++; return; }
      const t1 = had.updatedAt || 0;
      const t2 = b.updatedAt || 0;
      if (t2 > t1) { map.set(b.id, b); updated++; }
      else skipped++;
    });
    return { list: [...map.values()], added, updated, skipped };
  }

  /* 执行导入 */
  function apply(obj, mode) {
    const v = validate(obj);
    if (!v.ok) throw new Error(v.msg);

    /* 兼容三种输入：完整备份 / 旧格式 / 单本书 */
    let incoming;
    if (obj.format === FORMAT) {
      incoming = obj.data;
    } else if (obj.data && obj.data.books) {
      incoming = obj.data;
    } else if (obj.id && obj.units) {
      incoming = { books: [obj] };
    } else {
      throw new Error('无法识别的内容');
    }

    const result = { mode, added: 0, updated: 0, replaced: 0, books: 0 };

    if (mode === 'replace') {
      /* 覆盖：仅覆盖书库，配置保留（避免把 API Key 洗掉） */
      const n = (incoming.books || []).length;
      localStorage.setItem(KEYS.books, JSON.stringify(incoming.books || []));
      result.replaced = n;
      result.books = n;
      /* 当前书指针如果指向不存在的书，清掉 */
      const curId = localStorage.getItem(KEYS.curBook);
      if (curId && !(incoming.books || []).some(b => b.id === curId)) {
        localStorage.removeItem(KEYS.curBook);
      }
    } else {
      /* 合并 */
      const local = JSON.parse(localStorage.getItem(KEYS.books) || '[]');
      const m = mergeBooks(local, incoming.books || []);
      localStorage.setItem(KEYS.books, JSON.stringify(m.list));
      result.added = m.added;
      result.updated = m.updated;
      result.books = m.list.length;
      /* 合并模式下配置只在本地为空时补 */
      if (incoming.cfg && !localStorage.getItem(KEYS.cfg)) {
        localStorage.setItem(KEYS.cfg, JSON.stringify(incoming.cfg));
        result.cfgImported = true;
      }
    }

    /* 覆盖模式下，如果本地没有配置而备份里有，也补上 */
    if (mode === 'replace' && incoming.cfg && !localStorage.getItem(KEYS.cfg)) {
      localStorage.setItem(KEYS.cfg, JSON.stringify(incoming.cfg));
      result.cfgImported = true;
    }

    return result;
  }

  window.BACKUP = {
    KEYS, build, apply, validate, download, sizeText, stamp, readAll
  };
})();
