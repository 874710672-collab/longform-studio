/* chaptermodel.js — 章节编排：手动把定稿正文拆成章节
   关键：章节里的正文是「副本」，与单元定稿完全独立。
   删改章节都不影响 units[].steps.polish 的原稿。 */
(function () {

  function uid() {
    return 'c' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 4);
  }

  /* 结构：
     book.chaptering = {
       chapters: [ { id, title, body, sourceUnitId, sourceUnitIdx, createdAt, updatedAt } ],
       sel: chapterId | null
     }
  */

  function init(book) {
    if (!book) return book;
    if (!book.chaptering || typeof book.chaptering !== 'object') {
      book.chaptering = { chapters: [], sel: null };
    }
    if (!Array.isArray(book.chaptering.chapters)) book.chaptering.chapters = [];
    if (book.chaptering.sel === undefined) book.chaptering.sel = null;
    return book;
  }

  function list(book) {
    if (!book) return [];
    init(book);
    return book.chaptering.chapters;
  }

  function get(book, id) {
    return list(book).find(c => c.id === id) || null;
  }

  function current(book) {
    if (!book) return null;
    init(book);
    const id = book.chaptering.sel;
    if (!id) return list(book)[0] || null;
    return get(book, id) || list(book)[0] || null;
  }

  /* 新建一章 */
  function create(book, opt) {
    init(book);
    opt = opt || {};
    const ch = {
      id: uid(),
      title: opt.title || '第 ' + (book.chaptering.chapters.length + 1) + ' 章',
      body: opt.body || '',
      sourceUnitId: opt.sourceUnitId || '',
      sourceUnitIdx: opt.sourceUnitIdx != null ? opt.sourceUnitIdx : null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    book.chaptering.chapters.push(ch);
    book.chaptering.sel = ch.id;
    return ch;
  }

  function update(book, id, patch) {
    const ch = get(book, id);
    if (!ch) return null;
    Object.assign(ch, patch, { updatedAt: Date.now() });
    return ch;
  }

  function remove(book, id) {
    init(book);
    const i = book.chaptering.chapters.findIndex(c => c.id === id);
    if (i < 0) return false;
    book.chaptering.chapters.splice(i, 1);
    if (book.chaptering.sel === id) {
      book.chaptering.sel = book.chaptering.chapters.length
        ? book.chaptering.chapters[Math.min(i, book.chaptering.chapters.length - 1)].id
        : null;
    }
    return true;
  }

  function move(book, id, dir) {
    const arr = list(book);
    const i = arr.findIndex(c => c.id === id);
    if (i < 0) return false;
    const j = i + dir;
    if (j < 0 || j >= arr.length) return false;
    const [item] = arr.splice(i, 1);
    arr.splice(j, 0, item);
    return true;
  }

  /* 取某个单元的定稿正文（优先润色稿，其次分节正文拼接） */
  function unitBody(u) {
    if (!u) return '';
    const p = window.LEngine ? LEngine.docOf(u.steps.polish) : '';
    if (p && p.trim()) return p.trim();
    return window.LEngine ? LEngine.joinDraft(u) : '';
  }

  /* 载入单元定稿作为副本 */
  function loadFromUnit(book, unitId, targetChapterId) {
    const u = (book.units || []).find(x => x.id === unitId);
    if (!u) return null;
    const body = unitBody(u);
    if (targetChapterId) {
      return update(book, targetChapterId, {
        body,
        sourceUnitId: u.id,
        sourceUnitIdx: u.idx
      });
    }
    return create(book, {
      title: u.title || ('第 ' + (u.idx + 1) + ' 篇'),
      body,
      sourceUnitId: u.id,
      sourceUnitIdx: u.idx
    });
  }

  /* 是否有已定稿的单元可作为来源 */
  function availableUnits(book) {
    return (book.units || [])
      .filter(u => {
        const b = unitBody(u);
        return b && b.trim().length > 0;
      })
      .map(u => ({
        id: u.id,
        idx: u.idx,
        title: u.title,
        words: window.LEngine ? LEngine.cw(unitBody(u)) : 0,
        finished: !!(u.steps.polish && u.steps.polish.versions && u.steps.polish.versions.length)
      }));
  }

  /* 统计 */
  function stats(book) {
    const arr = list(book);
    const words = arr.reduce((a, c) => a + (window.LEngine ? LEngine.cw(c.body) : c.body.length), 0);
    return { count: arr.length, words };
  }

  window.CHAPTER = {
    init, list, get, current, create, update, remove, move,
    unitBody, loadFromUnit, availableUnits, stats
  };
})();
