/* gridversions.js — 每稿一套独立的推进格 + 单元列表
   每个 spine 版本（稿）拥有自己的 cells 和 units，切换稿时整体切换。
   单元按「稿」隔离，互不影响。 */
(function () {

  function newDraftId() {
    return 'd' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 4);
  }

  function ensureDraftIds(book) {
    const s = book.steps && book.steps.spine;
    if (!s || !Array.isArray(s.versions)) return;
    s.versions.forEach(v => {
      if (!v.draftId) v.draftId = newDraftId();
    });
  }

  function currentDraftId(book) {
    const s = book.steps && book.steps.spine;
    if (!s || !s.versions || !s.versions.length) return null;
    const v = s.versions[s.sel];
    if (!v) return null;
    if (!v.draftId) v.draftId = newDraftId();
    return v.draftId;
  }

  function slotOf(book, draftId, create) {
    if (!book.drafts) book.drafts = {};
    if (!book.drafts[draftId]) {
      if (!create) return null;
      book.drafts[draftId] = {
        id: draftId,
        spine: [],
        units: [],
        createdAt: Date.now(),
        unitId: null
      };
    }
    return book.drafts[draftId];
  }

  /* 把当前活动数据存回它所属的稿 */
  function stash(book) {
    const id = book.activeDraftId;
    if (!id) return;
    const slot = slotOf(book, id, true);
    slot.spine = book.spine || [];
    (book.units || []).forEach(u => { if (!u.draftId) u.draftId = id; });
    slot.units = (book.units || []).filter(u => u.draftId === id);
    slot.unitId = book.unitId || null;
  }

  function load(book, draftId) {
    if (!draftId) return;
    if (book.activeDraftId && book.activeDraftId !== draftId) stash(book);
    const slot = slotOf(book, draftId, true);
    book.activeDraftId = draftId;
    book.spine = slot.spine || [];
    book.units = slot.units || [];
    book.unitId = slot.unitId || null;
  }

  function switchTo(book, draftId) {
    if (!book || !draftId) return;
    if (book.activeDraftId === draftId) return;
    stash(book);
    load(book, draftId);
  }

  /* 初始化：老数据把现有的归成第一稿 */
  function migrate(book) {
    if (!book) return book;
    ensureDraftIds(book);
    const cur = currentDraftId(book);
    if (!book.drafts) book.drafts = {};
    if (!book.activeDraftId) book.activeDraftId = cur;

    if (cur && !book.drafts[cur]) {
      book.drafts[cur] = {
        id: cur,
        spine: book.spine || [],
        units: (book.units || []).map(u => Object.assign({}, u, { draftId: cur })),
        createdAt: Date.now(),
        unitId: book.unitId || null
      };
      book.units = book.drafts[cur].units;
    } else if (cur && book.drafts[cur]) {
      const slot = book.drafts[cur];
      if (!book.spine || !book.spine.length) book.spine = slot.spine;
      if (!book.units || !book.units.length) book.units = slot.units;
      (book.units || []).forEach(u => { if (!u.draftId) u.draftId = cur; });
    }
    /* 把当前活动数据同步进槽，保证一致 */
    if (book.activeDraftId === cur) {
      const slot = slotOf(book, cur, true);
      slot.spine = book.spine || [];
      slot.units = book.units || [];
      (book.units || []).forEach(u => { u.draftId = cur; });
      slot.unitId = book.unitId || null;
    }
    return book;
  }

  function statsOf(book, draftId) {
    const slot = (book.drafts || {})[draftId];
    if (!slot) return { units: 0, done: 0, cells: 0 };
    const units = slot.units || [];
    return {
      units: units.length,
      cells: (slot.spine || []).length,
      done: units.filter(u => u.steps && u.steps.polish && u.steps.polish.status === 'done').length
    };
  }

  function dropDraft(book, draftId) {
    if (book.drafts) delete book.drafts[draftId];
  }

  window.DRAFTS = { newDraftId, ensureDraftIds, currentDraftId, slotOf, stash, load, switchTo, migrate, statsOf, dropDraft };
})();
