/* appchapter.js — 章节编排：左编辑区 + 右对照区 + 目录抽屉 */
(function () {
  const A = window.APP;
  const el = A.el;
  const toast = A.toast;
  const stage = A.stage;

  function cur() { return A.cur; }

  /* 当前打开的目录抽屉；null 表示关闭 */
  let drawerOpen = false;
  /* 对照区当前载入的单元 */
  let compareUnitId = null;

  function renderChapter() {
    const b = cur();
    if (!b) { A.setView('home'); A.render(); return; }
    CHAPTER.init(b);

    /* 章节页不需要审核意见悬浮窗：彻底清除绑定，避免 rAF 里被重新显示 */
    if (window.FBFLOAT && FBFLOAT.clear) FBFLOAT.clear();
    else if (window.FBFLOAT) FBFLOAT.hide();

    /* 主体：左右分栏（顶栏信息已并入左侧头部） */
    const wrap = el('div', 'ch-split');
    const left = el('div', 'ch-left');
    const right = el('div', 'ch-right');
    wrap.appendChild(left);
    wrap.appendChild(right);
    stage.appendChild(wrap);

    /* 左：目录按钮 + 章节编辑 */
    left.appendChild(leftHead(b));
    left.appendChild(editorCard(b));

    /* 右：对照区 */
    right.appendChild(compareCard(b));

    /* 抽屉 */
    if (drawerOpen) {
      /* 抽屉要压在顶栏下方：实测页头 + 步骤条的总高度 */
      const head = document.getElementById('titlebarProj') || document.querySelector('.topbar, #topbar');
      const steps = document.getElementById('steps');
      let top = 0;
      if (steps) top = Math.max(top, steps.getBoundingClientRect().bottom);
      if (head) {
        const hb = head.getBoundingClientRect();
        if (hb.height) top = Math.max(top, hb.bottom);
      }
      if (!top || top < 40) top = 96;   /* 兜底 */
      document.documentElement.style.setProperty('--ch-drawer-top', Math.round(top) + 'px');
      stage.appendChild(drawerEl(b));
    }
  }

  /* ---------- 左侧头部：目录 / 新建 / 导出（一行） ---------- */
  function leftHead(b) {
    const row = el('div', 'ch-lefthead');
    const btn = el('button', 'ch-toc-btn');
    btn.appendChild(el('span', 'toc-ico', '☰'));
    btn.appendChild(el('span', '', '目录'));
    const st = CHAPTER.stats(b);
    btn.appendChild(el('span', 'toc-n', String(st.count)));
    btn.onclick = () => { drawerOpen = !drawerOpen; A.render(); };
    row.appendChild(btn);

    const add = el('button', 'mini', '＋ 新建章节');
    add.onclick = () => {
      const ch = CHAPTER.create(b);
      A.persist(); A.render();
      toast('已新建「' + ch.title + '」');
    };
    const exp = el('button', 'mini', '导出');
    exp.onclick = () => exportBook(b);
    row.appendChild(add);
    row.appendChild(exp);
    return row;
  }

  /* ---------- 目录抽屉 ---------- */
  function drawerEl(b) {
    const mask = el('div', 'ch-mask');
    mask.onclick = () => { drawerOpen = false; A.render(); };

    const panel = el('div', 'ch-drawer');
    const head = el('div', 'dr-head');
    head.appendChild(el('b', '', '章节目录'));
    const close = el('button', 'mini', '收起');
    close.onclick = () => { drawerOpen = false; A.render(); };
    head.appendChild(close);
    panel.appendChild(head);

    const addBtn = el('button', 'primary-btn wide', '＋ 新建章节');
    addBtn.onclick = () => {
      CHAPTER.create(b);
      A.persist(); A.render();
    };
    panel.appendChild(addBtn);

    const chapters = CHAPTER.list(b);
    if (!chapters.length) {
      panel.appendChild(el('div', 'empty-tip', '还没有章节。点上面新建，或从右边对照区载入正文。'));
    } else {
      const list = el('div', 'ch-toc-list');
      chapters.forEach((c, i) => {
        const isCur = (CHAPTER.current(b) || {}).id === c.id;
        const row = el('div', 'toc-row' + (isCur ? ' on' : ''));
        const n = el('span', 'toc-i', String(i + 1));
        row.appendChild(n);
        const mid = el('div', 'toc-mid');
        mid.appendChild(el('div', 'toc-t', c.title || '未命名'));
        mid.appendChild(el('div', 'toc-m', (LEngine.cw(c.body) || 0) + ' 字'));
        row.appendChild(mid);

        const acts = el('div', 'toc-acts');
        const up = el('button', 'toc-btn', '↑');
        up.onclick = (e) => { e.stopPropagation(); if (CHAPTER.move(b, c.id, -1)) { A.persist(); A.render(); } };
        const dn = el('button', 'toc-btn', '↓');
        dn.onclick = (e) => { e.stopPropagation(); if (CHAPTER.move(b, c.id, 1)) { A.persist(); A.render(); } };
        const del = el('button', 'toc-btn danger-t', '×');
        del.onclick = (e) => {
          e.stopPropagation();
          if (!confirm(`删除「${c.title || '未命名'}」？\n\n这只删除章节编排里的副本，原单元正文不受影响。`)) return;
          CHAPTER.remove(b, c.id);
          A.persist(); A.render();
        };
        acts.appendChild(up); acts.appendChild(dn); acts.appendChild(del);
        row.appendChild(acts);

        row.onclick = () => {
          b.chaptering.sel = c.id;
          drawerOpen = false;
          A.persist(); A.render();
        };
        list.appendChild(row);
      });
      panel.appendChild(list);
    }

    mask.appendChild(panel);
    return mask;
  }

  /* ---------- 章节编辑区 ---------- */
  function editorCard(b) {
    const c = CHAPTER.current(b);
    const card = el('div', 'ch-edit');

    if (!c) {
      card.appendChild(el('div', 'empty-tip',
        '还没有章节。\n\n点「＋ 新建章节」开始，或者在右边对照区载入某一篇的定稿正文。'));
      return card;
    }

    /* 标题输入 */
    const trow = el('div', 'ce-title-row');
    const ti = el('input');
    ti.className = 'ce-title';
    ti.value = c.title || '';
    ti.placeholder = '章节标题';
    ti.oninput = () => { c.title = ti.value; A.persist(); };
    trow.appendChild(ti);
    card.appendChild(trow);

    /* 来源提示 */
    if (c.sourceUnitIdx != null) {
      const src = el('div', 'ce-src');
      src.textContent = `正文副本来自第 ${c.sourceUnitIdx + 1} 篇 · 修改这里不影响原稿`;
      card.appendChild(src);
    }

    /* 正文编辑 */
    const ta = el('textarea');
    ta.className = 'ce-body';
    ta.placeholder = '在这里写，或从右边载入正文…';
    ta.value = c.body || '';
    ta.oninput = () => {
      c.body = ta.value;
      c.updatedAt = Date.now();
      A.persist();
      /* 只更新字数，不重渲染，避免光标跳动 */
      const w = card.querySelector('.ce-words');
      if (w) w.textContent = LEngine.cw(ta.value) + ' 字';
    };
    card.appendChild(ta);

    const foot = el('div', 'ce-foot');
    foot.appendChild(el('span', 'ce-words', (LEngine.cw(c.body) || 0) + ' 字'));
    const cp = el('button', 'mini', '复制');
    cp.title = '复制本章全文';
    cp.onclick = () => {
      const txt = (ta.value || '');
      if (!txt.trim()) { toast('本章还是空的'); return; }
      BOOKUI.copyText(txt);
      toast('已复制 ' + txt.length + ' 字');
    };
    foot.appendChild(cp);
    card.appendChild(foot);

    return card;
  }

  /* ---------- 对照区 ---------- */
  function compareCard(b) {
    const card = el('div', 'ch-compare');
    const head = el('div', 'cc-head');
    head.appendChild(el('b', '', '对照区'));
    head.appendChild(el('span', 'cc-sub', '载入定稿正文用于参考，不影响原稿'));
    card.appendChild(head);

    const units = CHAPTER.availableUnits(b);
    if (!units.length) {
      card.appendChild(el('div', 'empty-tip', '还没有已写内容的单元。写完正文或润色后，这里可以载入参考。'));
      return card;
    }

    /* 选择器 */
    const selRow = el('div', 'cc-selrow');
    const sel = el('select');
    sel.className = 'cc-select';
    sel.appendChild(new Option('— 选择一篇 —', ''));
    units.forEach(u => {
      sel.appendChild(new Option(`第${u.idx + 1}篇 ${u.title}（${u.words}字）`, u.id));
    });
    if (compareUnitId && units.some(u => u.id === compareUnitId)) sel.value = compareUnitId;
    sel.onchange = () => { compareUnitId = sel.value; A.render(); };
    selRow.appendChild(sel);
    card.appendChild(selRow);

    /* 预览 */
    if (compareUnitId) {
      const u = units.find(x => x.id === compareUnitId);
      const body = CHAPTER.unitBody((b.units || []).find(x => x.id === compareUnitId));
      const pre = el('div', 'cc-body');
      pre.textContent = body || '（空）';
      card.appendChild(pre);

      const ops = el('div', 'cc-ops');
      const curCh = CHAPTER.current(b);

      const loadInto = el('button', 'primary-btn', curCh ? '覆盖到「' + trim(curCh.title, 8) + '」' : '载入为新章节');
      loadInto.onclick = () => {
        if (curCh) {
          if (!confirm(`把第${u.idx + 1}篇的正文载入到「${curCh.title}」？\n\n会覆盖该章现有内容（原单元不受影响）。`)) return;
          CHAPTER.loadFromUnit(b, compareUnitId, curCh.id);
          toast('已载入到当前章节');
        } else {
          CHAPTER.loadFromUnit(b, compareUnitId, null);
          toast('已载入为新章节');
        }
        A.persist(); A.render();
      };
      ops.appendChild(loadInto);

      const asNew = el('button', 'ghost-btn', '另建新章节');
      asNew.onclick = () => {
        CHAPTER.loadFromUnit(b, compareUnitId, null);
        A.persist(); A.render();
        toast('已新建章节并载入');
      };
      ops.appendChild(asNew);
      card.appendChild(ops);
    } else {
      card.appendChild(el('div', 'cc-hint', '从上面选一篇，看它的定稿正文。'));
    }

    return card;
  }

  function trim(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /* ---------- 导出 ---------- */
  function exportBook(b) {
    const chapters = CHAPTER.list(b);
    if (!chapters.length) { toast('还没有章节'); return; }
    const txt = chapters.map((c, i) =>
      `${c.title || ('第 ' + (i + 1) + ' 章')}\n\n${c.body || ''}`
    ).join('\n\n\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt)
        .then(() => toast('已复制 ' + chapters.length + ' 章，共 ' + LEngine.cw(txt) + ' 字'),
              () => toast('复制失败'));
    } else {
      toast('复制失败');
    }
  }

  window.CHAPTERUI = { renderChapter };
})();
