/* gridmodel.js — 主线推进表的稳定 ID 模型
   核心：每格有固定 id，单元用 gridId 关联，不再依赖会变的序号 step。
   兼容旧数据：迁移时按原 step 生成 id，并把单元绑上去。 */
(function () {

  function newId(i) {
    return 'g' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5);
  }

  /* 保证每格都有 id、order（排序用） */
  function normalizeCells(cells) {
    const used = new Set();
    return (cells || []).map((c, i) => {
      let id = c.id;
      if (!id || used.has(id)) {
        id = newId(i);
        while (used.has(id)) id = newId(i);
      }
      used.add(id);
      return Object.assign({}, c, {
        id,
        order: typeof c.order === 'number' ? c.order : i + 1,
        step: i + 1            /* step 只作为显示序号，每次重新计算 */
      });
    });
  }

  /* 按 order 排序后重算显示序号 */
  function reindex(cells) {
    const key = c => {
      const o = Number(c && c.order);
      if (Number.isFinite(o) && o > 0) return o;
      const st = Number(c && c.step);
      if (Number.isFinite(st) && st > 0) return st;
      return 1e9;   /* 都没有的排到最后，避免挤乱已有的顺序 */
    };
    const sorted = [...(cells || [])].sort((a, b) => key(a) - key(b));
    sorted.forEach((c, i) => {
      c.order = i + 1;
      c.step = i + 1;
    });
    return sorted;
  }

  /* 迁移：旧数据只有 step，没有 id；单元只有 spineAt，没有 gridId */
  function migrate(book) {
    if (!book) return book;
    const raw = book.spine || [];
    if (!raw.length) return book;

    const needId = raw.some(c => !c.id);
    if (needId) {
      /* 按 step 排序后补 id */
      const sorted = [...raw].sort((a, b) => (a.step || 0) - (b.step || 0));
      const withId = sorted.map((c, i) => Object.assign({}, c, {
        id: c.id || newId(i),
        order: typeof c.order === 'number' ? c.order : (c.step || i + 1)
      }));
      book.spine = reindex(withId);
    } else if (raw.some(c => typeof c.order !== 'number')) {
      book.spine = reindex(raw);
    }

    /* 单元绑定：老单元只有 spineAt（旧序号），换算成 id */
    const byStep = new Map();
    book.spine.forEach(c => byStep.set(c.step, c));

    (book.units || []).forEach(u => {
      if (u.kind !== 'main') return;
      if (u.gridId) {
        /* 已有 gridId，检查格子还在不在 */
        if (!book.spine.some(c => c.id === u.gridId)) {
          u.orphan = true;
        }
        return;
      }
      /* 用旧 spineAt 找对应格 */
      const cell = byStep.get(u.spineAt);
      if (cell) {
        u.gridId = cell.id;
        u.orphan = false;
      } else if (u.spineAt > 0) {
        /* spineAt 指向不存在的格：孤儿 */
        u.orphan = true;
      } else {
        u.orphan = true;
      }
    });

    return book;
  }

  /* 取某单元的格子 */
  function cellOf(book, u) {
    if (!u || !u.gridId) return null;
    return (book.spine || []).find(c => c.id === u.gridId) || null;
  }

  /* 取某格的单元 */
  function unitOfCell(book, cell) {
    if (!cell) return null;
    return (book.units || []).find(u => u.kind === 'main' && u.gridId === cell.id) || null;
  }

  /* 从文本解析出的格子（无 id），与现有格子做差异比对 */
  function diffWithText(book, parsed) {
    const existing = book.spine || [];
    /* 按「标题相同」优先复用 id，其次按位置 */
    const result = [];
    const usedIds = new Set();

    parsed.forEach((p, i) => {
      let match = existing.find(c => !usedIds.has(c.id) && c.title === p.title);
      if (!match && existing[i] && !usedIds.has(existing[i].id)) match = existing[i];
      if (match) {
        usedIds.add(match.id);
        result.push(Object.assign({}, p, { id: match.id, order: i + 1 }));
      } else {
        result.push(Object.assign({}, p, { id: newId(i), order: i + 1 }));
      }
    });
    return reindex(result);
  }

  window.GRID = { newId, normalizeCells, reindex, migrate, cellOf, unitOfCell, diffWithText };
})();
