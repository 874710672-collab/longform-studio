/* bookstore.js — 长篇工坊数据层：book / unit / facts / foreshadow / spine
   复用短篇工坊的 Store（配置、项目列表），新增长篇模型。 */
(function () {
  const K_BOOKS = 'll_books_v1';
  const K_CUR = 'll_cur_v1';
  const K_UNIT = 'll_unit_v1';   // 当前查看的单元

  function loadJSON(k, d) {
    try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch (e) { return d; }
  }
  function saveJSON(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { console.error(e); return false; }
  }
  function uid(p) { return (p || 'u') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* 档位：沿用短篇三档 */
  const TIERS = {
    s: { name: '小', min: 3000, max: 5000, parts: 3, beats: [2, 3] },
    m: { name: '中', min: 8000, max: 12000, parts: 5, beats: [4, 7] },
    l: { name: '大', min: 15000, max: 20000, parts: 7, beats: [8, 12] }
  };

  /* 每个 beat 折算字数：用于「内容 vs 字数」的机械校验 */
  const BEAT_LO = 1500;
  const BEAT_HI = 2000;

  function tierWords(tier) {
    const t = TIERS[tier] || TIERS.m;
    return { min: t.min, max: t.max, parts: t.parts };
  }

  /* 依据 beats 数给出容量诊断 */
  function capacityCheck(beats, tier) {
    const t = TIERS[tier] || TIERS.m;
    const lo = beats * BEAT_LO, hi = beats * BEAT_HI;
    if (!beats) return { level: 'ok', msg: '未设 beats 数，无法校验容量' };
    if (hi > t.max && lo > t.max) {
      return { level: 'dense', msg: `内容太密：${beats} 个事件约需 ${lo}-${hi} 字，超过「${t.name}」档上限 ${t.max} 字。建议升档或拆成两个单元` };
    }
    if (lo < t.min && hi < t.min) {
      return { level: 'thin', msg: `内容撑不住：${beats} 个事件约需 ${lo}-${hi} 字，撑不满「${t.name}」档下限 ${t.min} 字。建议降档或与相邻单元合并` };
    }
    return { level: 'ok', msg: `容量合适：${beats} 个事件约需 ${lo}-${hi} 字，「${t.name}」档 ${t.min}-${t.max} 字` };
  }

  /* ---------------- 单元 ---------------- */
  function newUnit(bookId, idx, opt) {
    opt = opt || {};
    const tier = opt.tier || 'm';
    return {
      id: uid('n'),
      bookId, idx,
      kind: opt.kind || 'main',
      tier,
      beats: opt.beats || (tier === 's' ? 2 : tier === 'l' ? 8 : 5),
      title: opt.title || ('第' + (idx + 1) + '篇'),
      spineAt: opt.spineAt != null ? opt.spineAt : (opt.kind === 'side' ? -1 : idx),
      gridId: opt.gridId || '',      // 绑定的推进表格子 id（主线用）
      orphan: false,                  // 格子已被删掉时置 true
      plants: [], pays: [],
      relayIn: '',
      readerKnowledge: '',
      chapterLabel: '',
      mergedFrom: [],
      stale: false,
      staleReason: '',
      steps: {
        topic:   { status: 'idle', versions: [], sel: 0, feedback: '' },
        setting: { status: 'idle', versions: [], sel: 0, feedback: '' },
        outline: { status: 'idle', versions: [], sel: 0, feedback: '' },
        draft:   { status: 'idle', versions: [], sel: 0, feedback: '', parts: [], partIdx: 0 },
        polish:  { status: 'idle', versions: [], sel: 0, feedback: '' },
        relay:   { status: 'idle', versions: [], sel: 0, feedback: '' }
      }
    };
  }

  const UNIT_STEPS = ['topic', 'setting', 'outline', 'draft', 'polish', 'relay'];
  const UNIT_STEP_NAME = {
    topic: '单元立意', setting: '出场配置', outline: '分节大纲',
    draft: '分节正文', polish: '润色成稿', relay: '交棒单'
  };

  function migrateUnit(u) {
    if (!u || typeof u !== 'object') return u;
    if (!TIERS[u.tier]) u.tier = 'm';
    if (!u.kind) u.kind = 'main';
    if (typeof u.beats !== 'number') u.beats = 5;
    if (!Array.isArray(u.plants)) u.plants = [];
    if (!Array.isArray(u.pays)) u.pays = [];
    if (!Array.isArray(u.mergedFrom)) u.mergedFrom = [];
    if (typeof u.gridId !== 'string') u.gridId = '';
    if (typeof u.orphan !== 'boolean') u.orphan = false;
    if (typeof u.relayIn !== 'string') u.relayIn = '';
    if (typeof u.stale !== 'boolean') u.stale = false;
    if (!u.steps || typeof u.steps !== 'object') u.steps = {};
    UNIT_STEPS.forEach(k => {
      const d = { status: 'idle', versions: [], sel: 0, feedback: '' };
      if (k === 'draft') { d.parts = []; d.partIdx = 0; }
      const o = u.steps[k] || (u.steps[k] = {});
      Object.keys(d).forEach(key => { if (o[key] === undefined) o[key] = d[key]; });
      if (!Array.isArray(o.versions)) o.versions = [];
      if (o.sel == null) o.sel = 0;
      if (o.versions.length && (o.sel < 0 || o.sel >= o.versions.length)) o.sel = o.versions.length - 1;
      if (k === 'draft' && !Array.isArray(o.parts)) o.parts = [];
    });
    return u;
  }

  /* ---------------- 书 ---------------- */
  function newBook() {
    return {
      id: uid('b'),
      type: 'book',
      title: '未命名长篇',
      target: 380000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      brief: { genre: '', tags: '', idea: '', pov: '第三人称', style: '', avoid: '' },
      facts: { people: [], world: [], items: [], anchors: [] },
      spine: [],
      stages: [],               // 三级推进（固定 3 个）
      volumes: [],              // 卷结构（含所属级与格范围）
      foreshadow: [],
      units: [],
      readerKnowledge: [],
      fsSeq: 0,
      drafts: {},               // 每稿独立数据 { draftId: { spine, units, unitId } }
      activeDraftId: null,      // 当前活动的稿
      level: 'book',            // book | units | unit
      bookStep: 'book',         // book | cast | spine
      unitId: null,
      history: [],
      steps: {
        book:  { status: 'idle', versions: [], sel: 0, feedback: '' },
        cast:  { status: 'idle', versions: [], sel: 0, feedback: '' },
        spine: { status: 'idle', versions: [], sel: 0, feedback: '' },
        audit: { status: 'idle', versions: [], sel: 0, feedback: '' }
      }
    };
  }

  const BOOK_STEPS = ['book', 'cast', 'spine'];
  const BOOK_STEP_NAME = { book: '全书总纲', cast: '人物总表', spine: '主线推进表' };

  function migrateBook(b) {
    if (!b || typeof b !== 'object') return b;
    const d = newBook();
    if (b.type !== 'book') b.type = 'book';
    if (!b.brief || typeof b.brief !== 'object') b.brief = d.brief;
    Object.keys(d.brief).forEach(k => { if (b.brief[k] === undefined) b.brief[k] = d.brief[k]; });
    if (!b.facts || typeof b.facts !== 'object') b.facts = d.facts;
    ['people', 'world', 'items', 'anchors'].forEach(k => {
      if (!Array.isArray(b.facts[k])) b.facts[k] = [];
    });
    ['spine', 'foreshadow', 'units', 'readerKnowledge', 'history', 'stages', 'volumes'].forEach(k => {
      if (!Array.isArray(b[k])) b[k] = [];
    });
    b.units.forEach(migrateUnit);
    /* 推进表格子补 id，单元补 gridId（兼容老数据） */
    if (window.GRID) GRID.migrate(b);
    /* 每稿独立单元列表（兼容老数据） */
    if (window.DRAFTS) DRAFTS.migrate(b);
    if (typeof b.fsSeq !== 'number') b.fsSeq = b.foreshadow.length;
    if (!b.level) b.level = 'book';
    if (!b.bookStep) b.bookStep = 'book';
    if (!b.steps || typeof b.steps !== 'object') b.steps = {};
    ['book', 'cast', 'spine', 'audit'].forEach(k => {
      const dd = { status: 'idle', versions: [], sel: 0, feedback: '' };
      const o = b.steps[k] || (b.steps[k] = {});
      Object.keys(dd).forEach(key => { if (o[key] === undefined) o[key] = dd[key]; });
      if (!Array.isArray(o.versions)) o.versions = [];
      if (o.sel == null) o.sel = 0;
      if (o.versions.length && (o.sel < 0 || o.sel >= o.versions.length)) o.sel = o.versions.length - 1;
    });
    if (typeof b.target !== 'number') b.target = 380000;
    if (typeof b.title !== 'string') b.title = '未命名长篇';
    return b;
  }

  const Books = {
    all() {
      const l = loadJSON(K_BOOKS, []);
      if (!Array.isArray(l)) return [];
      l.forEach(migrateBook);
      return l;
    },
    currentId() { return localStorage.getItem(K_CUR) || null; },
    setCurrent(id) { localStorage.setItem(K_CUR, id); },
    get(id) {
      const b = this.all().find(x => x.id === id);
      return b ? migrateBook(b) : null;
    },
    current() { return this.get(this.currentId()); },
    save(b) {
      b.updatedAt = Date.now();
      const list = this.all();
      const i = list.findIndex(x => x.id === b.id);
      if (i >= 0) list[i] = b; else list.unshift(b);
      return saveJSON(K_BOOKS, list);
    },
    remove(id) {
      const list = this.all().filter(b => b.id !== id);
      saveJSON(K_BOOKS, list);
      if (this.currentId() === id) {
        if (list[0]) this.setCurrent(list[0].id); else localStorage.removeItem(K_CUR);
      }
    },
    /* 当前单元 */
    curUnit(b) {
      if (!b) return null;
      return b.units.find(u => u.id === b.unitId) || null;
    },
    saveUnitId(id) { localStorage.setItem(K_UNIT, id || ''); },
    lastUnitId() { return localStorage.getItem(K_UNIT) || ''; },

    newBook, newUnit, migrateBook, migrateUnit, uid,
    pushHistory(b, action, detail) {
      b.history.unshift({ at: Date.now(), action, detail: detail || '' });
      if (b.history.length > 200) b.history.length = 200;
    }
  };

  window.Books = Books;
  window.LT = { TIERS, UNIT_STEPS, UNIT_STEP_NAME, BOOK_STEPS, BOOK_STEP_NAME, BEAT_LO, BEAT_HI, tierWords, capacityCheck, uid };
})();
