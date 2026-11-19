/* app.js — 长篇工坊界面与流程控制 */
window.APP_VERSION = 'v67-volphases';
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;
    return n;
  };
  const stage = $('#stage');
  const els = {
    project: $('#tbProject'), sub: $('#tbSub'), steps: $('#steps'),
    dockInfo: $('#dockInfo'), bGen: $('#btnGen'), bRegen: $('#btnRegen'), bRevise: $('#btnRevise'),
    bApprove: $('#btnApprove'), bStop: $('#btnStop'), bUnits: $('#btnUnits'),
    bBook: $('#btnBook'), bFacts: $('#btnFacts'), bAudit: $('#btnAudit'), bFb: $('#btnFb'), bChapter: $('#btnChapter'), bGrid: $('#btnGrid')
  };

  let cur = Books.current();
  if (cur) cur = Books.migrateBook(cur);
  const app = { streamEl: null };
  let busy = null;
  let view = 'home';           // home | book | units | unit | settings
  let curStep = 'book';        // 全书层当前工序
  let curUnitStep = 'topic';   // 单元层当前工序

  /* ---------- 工具 ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._h);
    toast._h = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function sheet(html, onMount) {
    /* 弹窗打开时把悬浮意见窗收起来，避免遮挡 */
    if (window.FBFLOAT && FBFLOAT.isShowing && FBFLOAT.isShowing()) {
      window.__fbWasShowing = true;
      FBFLOAT.hide();
    }
    const s = $('#sheet');
    $('#sheetBody').innerHTML = html;
    s.hidden = false;
    s.classList.remove('hide');
    if (onMount) onMount($('#sheetBody'));
    const close = $('.close', $('#sheetBody'));
    if (close) close.onclick = closeSheet;
    s.onclick = (e) => { if (e.target === s) closeSheet(); };
  }
  function closeSheet() {
    $('#sheet').hidden = true; $('#sheet').classList.add('hide');
    /* 弹窗关闭后恢复之前开着的悬浮意见窗 */
    if (window.__fbWasShowing && window.FBFLOAT) {
      window.__fbWasShowing = false;
      FBFLOAT.show();
    }
  }
  function fmtTime(ts) {
    const d = new Date(ts);
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  function persist() {
    if (!cur) return;
    if (!Books.save(cur)) toast('保存失败：存储可能已满，请先导出备份');
  }
  function curUnit() { return cur ? Books.curUnit(cur) : null; }
  function docOf(step) { const v = step.versions[step.sel]; return v ? v.text : ''; }

  function setStream(txt) {
    if (app.streamEl) { app.streamEl.textContent = txt; app.streamEl.classList.add('streaming'); }
  }
  function endStream() {
    if (app.streamEl) app.streamEl.classList.remove('streaming');
    app.streamEl = null;
  }

  /* ---------- 顶部 ---------- */
  function renderTop() {
    if (view === 'home' || !cur) {
      els.project.textContent = '长篇工坊';
      els.sub.textContent = '选择或新建一本书 · ' + (window.APP_VERSION || '');
      els.bUnits.hidden = true;
      if (els.bBook) els.bBook.hidden = true;
      if (els.bFacts) els.bFacts.hidden = true;
      if (els.bAudit) els.bAudit.hidden = true;
      if (els.bChapter) els.bChapter.hidden = true;
      if (els.bGrid) els.bGrid.hidden = true;
      return;
    }
    els.project.textContent = cur.title;
    const u = curUnit();
    if (view === 'unit' && u) {
      const t = LEngine.tierOf(u);
      els.sub.textContent = `第${u.idx + 1}篇 · ${u.kind === 'side' ? '副线' : '主线'} · ${t.name}档 约${t.words}字`;
    } else if (view === 'chapter') {
      const st = CHAPTER.stats(cur);
      els.sub.textContent = `章节编排 · ${st.count} 章 · ${st.words.toLocaleString()} 字`;
    } else if (view === 'grid') {
      els.sub.textContent = `主线推进表 · ${(cur.spine || []).length} 格（可编辑）`;
    } else if (view === 'backup') {
      const n = (cur ? 0 : 0);
      els.sub.textContent = '备份与恢复 · 全部数据';
    } else if (view === 'audit') {
      const dn = cur.units.filter(u => LEngine.docOf(u.steps.relay)).length;
      els.sub.textContent = `进度对账 · 已完成 ${dn} 篇`;
    } else if (view === 'facts') {
      const pn = ((cur.facts && cur.facts.people) || []).length;
      const fn = (cur.foreshadow || []).filter(x => x.status === 'open').length;
      els.sub.textContent = `硬事实表 · ${pn} 人 · ${fn} 条待收伏笔`;
    } else if (view === 'units') {
      els.sub.textContent = `共 ${cur.units.length} 篇 · 目标 ${(cur.target / 10000).toFixed(0)} 万字 · 规划 ${(LEngine.totalWords(cur) / 10000).toFixed(1)} 万字`;
    } else {
      els.sub.textContent = '全书层 · ' + (LT.BOOK_STEP_NAME[curStep] || '');
    }
    els.bUnits.hidden = false;
    if (els.bBook) els.bBook.hidden = false;
    if (els.bFacts) els.bFacts.hidden = false;
    if (els.bAudit) els.bAudit.hidden = false;
    if (els.bChapter) els.bChapter.hidden = false;
    if (els.bGrid) els.bGrid.hidden = false;
  }

  /* ---------- 步骤条 ---------- */
  function renderSteps() {
    els.steps.innerHTML = '';
    if (view === 'home' || view === 'settings' || !cur) { els.steps.hidden = true; return; }
    els.steps.hidden = false;

    if (view === 'units') {
      els.steps.hidden = true;
      return;
    }

    if (view === 'book') {
      LT.BOOK_STEPS.forEach((k, i) => {
        const s = cur.steps[k];
        const cls = 'step-chip ' + (curStep === k ? 'cur ' : '') + (s.status === 'done' ? 'ok' : (s.versions.length ? '' : 'lock'));
        const c = el('button', cls);
        c.appendChild(el('span', 'dot'));
        c.appendChild(el('span', '', (i + 1) + ' ' + LT.BOOK_STEP_NAME[k]));
        c.onclick = () => {
          if (busy) { toast('正在生成，先等一下'); return; }
          curStep = k; persist(); render();
        };
        els.steps.appendChild(c);
      });
      /* 第四格：单元列表 */
      const c = el('button', 'step-chip');
      c.appendChild(el('span', 'dot'));
      c.appendChild(el('span', '', '4 单元列表 →'));
      c.onclick = () => { if (busy) return; view = 'units'; render(); };
      els.steps.appendChild(c);
      return;
    }

    if (view === 'unit') {
      const u = curUnit();
      if (!u) return;
      const list = LT.UNIT_STEPS;
      list.forEach((k, i) => {
        const s = u.steps[k];
        const cls = 'step-chip ' + (curUnitStep === k ? 'cur ' : '')
          + (s.status === 'stale' ? 'stale-step' : (s.status === 'done' ? 'ok' : (docOf(s) || (k === 'draft' && (s.parts || []).some(Boolean)) ? '' : 'lock')));
        const c = el('button', cls);
        c.appendChild(el('span', 'dot'));
        c.appendChild(el('span', '', (i + 1) + ' ' + LT.UNIT_STEP_NAME[k]));
        c.onclick = () => {
          if (busy) { toast('正在生成，先等一下'); return; }
          curUnitStep = k; render();
        };
        els.steps.appendChild(c);
      });
    }
  }

  /* ---------- 主渲染 ---------- */
  function render() {
    /* 记下渲染前的视图，单元列表用它判断是否「刚切入」 */
    window.__prevView = window.__curView || 'home';
    syncCur();
    /* 先隐藏悬浮意见窗，需要它的页面会在渲染中重新绑定 */
    if (window.FBFLOAT) FBFLOAT.hide();
    if (cur) Books.migrateBook(cur);
    renderTop();
    renderSteps();
    $('#btnExport').hidden = !(cur && view !== 'home');
    $('#dock').classList.toggle('empty', !cur || view === 'home' || view === 'units' || view === 'facts' || view === 'audit' || view === 'backup' || view === 'grid' || view === 'chapter');
    stage.innerHTML = '';
    window.__curView = view;   /* 记录本次渲染的视图，供下次判断 */
    if (view === 'home') { renderHome(); updateDock(); return; }
    if (view === 'settings') { renderSettings(); updateDock(); return; }
    if (view === 'backup') { BACKUPUI.renderBackup(); updateDock(); return; }
    if (!cur) { view = 'home'; renderHome(); return; }
    if (view === 'units') { UNITUI.renderUnitList(); updateDock(); return; }
    if (view === 'facts') { FACTSUI.renderFacts(); updateDock(); return; }
    if (view === 'audit') { AUDITUI.renderAudit(); updateDock(); return; }
    if (view === 'grid') { GRIDUI.renderGrid(); updateDock(); return; }
    if (view === 'chapter') { CHAPTERUI.renderChapter(); updateDock(); return; }
    if (view === 'book') { BOOKUI.renderBook(); updateDock(); return; }
    if (view === 'unit') { UNITUI2.renderUnit(); updateDock(); return; }
  }

  /* ---------- 底栏 ---------- */
  function updateDock() {
    const hide = () => ['bRevise', 'bRegen', 'bGen', 'bApprove', 'bFb'].forEach(k => { if (els[k]) els[k].hidden = true; });
    if (!cur || view === 'home' || view === 'units' || view === 'settings' || view === 'facts' || view === 'audit' || view === 'backup' || view === 'grid' || view === 'chapter') { hide(); els.dockInfo.textContent = ''; return; }

    const isUnit = view === 'unit';
    const u = curUnit();
    const k = isUnit ? curUnitStep : curStep;
    const s = isUnit ? (u ? u.steps[k] : null) : cur.steps[k];
    if (!s) { hide(); return; }

    const isDraft = isUnit && k === 'draft';
    const has = isDraft ? !!(s.parts && s.parts[s.partIdx || 0]) : !!docOf(s);
    const fb = (s.feedback || '').trim();
    const bz = !!busy;

    els.bGen.hidden = bz || has;
    els.bRevise.hidden = bz || !has;
    els.bRegen.hidden = bz || !has;
    els.bApprove.hidden = bz || !has;

    /* 「意见」唤回按钮：只有在有可写意见的环节、且窗口被关掉时才显示 */
    if (els.bFb) {
      const canFb = !!s && (has || !!fb || (s.versions && s.versions.length));
      const needShow = window.FBFLOAT && FBFLOAT.hasTarget() && !FBFLOAT.isShowing();
      els.bFb.hidden = !(canFb && needShow);
    }

    els.bGen.textContent = isDraft ? '写这一节' : '生成';
    els.bRevise.textContent = isDraft ? '✎ 改本节' : '✎ 改原稿';
    els.bRevise.classList.toggle('need-fb', !fb);
    els.bRevise.title = fb
      ? '带原稿 + 意见：只改你提到的地方，其它段落保持不动'
      : '先在右边写审核意见';
    if (isUnit && k === 'polish') {
      els.bRevise.textContent = '✎ 按意见改';
      els.bRevise.title = '带原稿 + 意见，只改你提到的地方（长稿会自动分段）';
      els.bRegen.textContent = '↻ 重新润色';
      els.bRegen.title = '让 AI 分段全局润色。会改写文字，可能把没问题的改差';
    } else {
      els.bRegen.textContent = fb
        ? (isDraft ? '↻ 重写本节' : '↻ 按意见重写')
        : (isDraft ? '↻ 重写本节' : '↻ 重新生成');
      els.bRegen.title = fb
        ? '带意见但不带原稿：从头再写一版，可能和你原来的不一样'
        : '不带任何东西，重新生成一版';
    }

    if (isUnit) {
      const order = LT.UNIT_STEPS;
      const i = order.indexOf(k);
      const last = i === order.length - 1;
      if (k === 'polish') {
        els.bApprove.textContent = '通过 · 不用润色，进入交棒单';
      } else {
        els.bApprove.textContent = last
          ? (k === 'relay' ? '完成 · 这篇定稿了' : '完成 · 本篇定稿')
          : '通过 · 进入' + LT.UNIT_STEP_NAME[order[i + 1]];
      }
    } else {
      const i = LT.BOOK_STEPS.indexOf(k);
      els.bApprove.textContent = i === LT.BOOK_STEPS.length - 1 ? '通过 · 去建单元列表' : '通过 · 进入' + LT.BOOK_STEP_NAME[LT.BOOK_STEPS[i + 1]];
    }

    if (bz) {
      els.dockInfo.textContent = busy.label + ' · 已生成 ' + LEngine.cw(busy.text || '') + ' 字';
    } else if (isDraft) {
      const written = (s.parts || []).filter(Boolean).length;
      const total = LEngine.outlinePlan(LEngine.unitDoc(u, 'outline')).length || LEngine.tierOf(u).parts;
      const w = (s.parts || []).filter(Boolean).reduce((a, p) => a + LEngine.cw(p.body), 0);
      els.dockInfo.textContent = `已写 ${written}/${total} 节 · ${w} 字（目标 ${LEngine.tierOf(u).words}）`;
    } else {
      const n = LEngine.cw(docOf(s));
      els.dockInfo.textContent = has
        ? `已生成 ${n} 字 · ${s.status === 'done' ? '已通过' : (fb ? '待按意见修改' : '待审核')}`
        : (s.feedback ? '有意见未生成' : '点「生成」开始');
    }
  }

  /* ---------- 首页：书库 ---------- */
  function renderHome() {
    view = 'home';
    renderTop();
    const list = Books.all();

    /* 顶部：标题 + 备份入口 */
    const head = el('div', 'shelf-head');
    const hl = el('div', 'sh-left');
    hl.appendChild(el('h2', 'sh-title', '我的书架'));
    hl.appendChild(el('span', 'sh-sub', list.length ? '共 ' + list.length + ' 本' : '还没有书'));
    head.appendChild(hl);
    const bkBtn = el('button', 'shelf-tool', '⤓ 备份');
    bkBtn.onclick = () => { view = 'backup'; render(); }; 
    head.appendChild(bkBtn);
    stage.appendChild(head);

    /* 书架网格 */
    const shelf = el('div', 'shelf');

    /* 新建封面（虚线 + 号） */
    const add = el('button', 'book-add');
    add.appendChild(el('div', 'ba-plus', '＋'));
    add.appendChild(el('div', 'ba-text', '新建长篇'));
    add.onclick = createBook;
    shelf.appendChild(add);

    /* 每本书一张封面 */
    list.forEach(b => shelf.appendChild(bookCover(b)));

    stage.appendChild(shelf);

    if (!list.length) {
      const tip = el('div', 'shelf-tip');
      tip.textContent = '一本书 = 一条主线 + 30 个左右的短篇单元。先从「全书总纲」开始。';
      stage.appendChild(tip);
    }
  }

  /* ---------- 单本书封面 ---------- */
  function bookCover(b) {
    const done = (b.units || []).filter(u => u.steps && u.steps.polish && u.steps.polish.status === 'done').length;
    const total = (b.units || []).length;
    const stale = (b.units || []).filter(u => u.stale).length;

    /* 进度：定稿数 / 总篇数 */
    let written = 0;
    (b.units || []).forEach(u => {
      const p = LEngine.docOf(u.steps.polish);
      written += p ? LEngine.cw(p) : LEngine.cw(LEngine.joinDraft(u));
    });
    const pct = total ? Math.round(done / total * 100) : 0;

    /* 书脊色：按 id 稳定生成 */
    const hue = hashHue(b.id || b.title || 'x');

    const card = el('div', 'book');
    card.style.setProperty('--h', hue);

    /* 封面主体 */
    const cover = el('div', 'bk-cover');
    const spine = el('div', 'bk-spine');
    cover.appendChild(spine);

    const inner = el('div', 'bk-inner');
    const t = el('div', 'bk-title', b.title || '未命名长篇');
    inner.appendChild(t);
    if (b.brief && b.brief.genre) inner.appendChild(el('div', 'bk-genre', b.brief.genre));
    cover.appendChild(inner);

    if (stale) cover.appendChild(el('div', 'bk-badge', stale + ' 待重跑'));
    card.appendChild(cover);

    /* 封面下方信息 */
    const info = el('div', 'bk-info');
    const line1 = el('div', 'bi-line');
    line1.appendChild(el('span', 'bi-main', done + ' / ' + total + ' 篇定稿'));
    line1.appendChild(el('span', 'bi-sub', (b.target / 10000).toFixed(0) + ' 万字'));
    info.appendChild(line1);

    const bar = el('div', 'bi-bar');
    const fill = el('i');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    info.appendChild(bar);

    info.appendChild(el('div', 'bi-foot', written ? written.toLocaleString() + ' 字' : '未开始'));
    card.appendChild(info);

    /* 操作 */
    const acts = el('div', 'bk-acts');
    const open = el('button', 'bk-open', '打开');
    open.onclick = () => openBook(b.id);
    const del = el('button', 'bk-del', '⋯');
    del.title = '更多';
    del.onclick = (e) => {
      e.stopPropagation();
      bookMenu(b, () => { if (cur && cur.id === b.id) cur = null; render(); });
    };
    acts.appendChild(open); acts.appendChild(del);
    card.appendChild(acts);

    card.onclick = (e) => {
      if (e.target.closest('button')) return;
      openBook(b.id);
    };
    return card;
  }

  /* 书封颜色：稳定的色相 */
  function hashHue(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }

  /* 书的更多操作 */
  function bookMenu(b, after) {
    let html = '<h2>' + (b.title || '未命名长篇') + '<button class="close">×</button></h2>';
    html += '<div class="menu-list">';
    html += '<button class="menu-item" data-a="open">📖 打开</button>';
    html += '<button class="menu-item" data-a="rename">✎ 重命名</button>';
    html += '<button class="menu-item danger" data-a="del">🗑 删除这本书</button>';
    html += '</div>';
    sheet(html, (root) => {
      root.querySelectorAll('[data-a]').forEach(btn => {
        btn.onclick = () => {
          const a = btn.dataset.a;
          if (a === 'open') { closeSheet(); openBook(b.id); return; }
          if (a === 'rename') {
            closeSheet();
            const t = prompt('书名', b.title || '');
            if (t && t.trim()) {
              b.title = t.trim();
              Books.save(b); render();
            }
            return;
          }
          if (a === 'del') {
            closeSheet();
            if (!confirm('删除《' + b.title + '》？\n\n正文会一起删掉，建议先导出备份。')) return;
            Books.remove(b.id);
            if (after) after();
          }
        };
      });
    });
  }


  function createBook() {
    const b = Books.newBook();
    Books.save(b);
    Books.setCurrent(b.id);
    cur = b;
    curStep = 'book';
    view = 'book';
    render();
  }

  function openBook(id) {
    Books.setCurrent(id);
    cur = Books.get(id);
    if (!cur) { toast('这本书不见了'); return; }
    const u = Books.curUnit(cur);
    if (u) { view = 'unit'; curUnitStep = nextUnitStep(u); }
    else view = 'book';
    render();
  }

  /* 内存里的 cur 与 localStorage 里的当前书脱节时，重新对齐。
     （页面恢复、外部改存储、多标签页等场景） */
  function syncCur() {
    const id = Books.currentId();
    if (!id) return false;
    if (!cur || cur.id !== id) {
      const b = Books.get(id);
      if (b) { cur = b; return true; }
    }
    return false;
  }

  function nextUnitStep(u) {
    const order = LT.UNIT_STEPS;
    for (const k of order) {
      if (!docOf(u.steps[k]) && !(k === 'draft' && (u.steps.draft.parts || []).some(Boolean))) return k;
    }
    return order[order.length - 1];
  }

  /* ---------- 设置 ---------- */
  function renderSettings() {
    const cfg = Store.cfg();
    const c = el('div', 'card');
    const h = el('h3', '', '接口设置');
    h.appendChild(el('span', 'tag', '与短篇工坊共用同一份配置'));
    c.appendChild(h);
    const mk = (label, val, ph, type) => {
      const f = el('div', 'field');
      f.appendChild(el('label', '', label));
      const i = el('input');
      i.type = type || 'text';
      i.value = val || '';
      i.placeholder = ph || '';
      i.oninput = () => { i.dataset.v = i.value; };
      i.dataset.v = val || '';
      i.dataset.k = label;
      f.appendChild(i);
      return f;
    };
    const fUrl = mk('Base URL', cfg.baseUrl, 'https://api.deepseek.com/v1');
    const fKey = mk('API Key', cfg.apiKey, 'sk-…', 'password');
    const fModel = mk('模型', cfg.model, 'deepseek-chat');
    c.appendChild(fUrl); c.appendChild(fKey); c.appendChild(fModel);

    const tf = el('div', 'field');
    tf.appendChild(el('label', '', '温度'));
    const ti = el('input'); ti.type = 'range'; ti.min = '0'; ti.max = '1.5'; ti.step = '0.1'; ti.value = String(cfg.temperature);
    const tv = el('span', 'words', String(cfg.temperature));
    ti.oninput = () => { tv.textContent = ti.value; ti.dataset.v = ti.value; };
    ti.dataset.v = ti.value;
    tf.appendChild(ti); tf.appendChild(tv);
    c.appendChild(tf);

    const mtf = el('div', 'field');
    mtf.appendChild(el('label', '', '单次输出上限（max_tokens）'));
    const mti = el('input'); mti.type = 'number'; mti.value = String(cfg.maxTokens || 32000);
    mtf.appendChild(mti);
    c.appendChild(mtf);

    /* 两个开关 */
    const sw = (label, hint, checked, key) => {
      const row = el('div', 'switch-row');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!checked; cb.dataset.sw = key;
      const lb = el('label', '', label);
      const box = el('span', 'sw-box');
      box.appendChild(cb);
      row.appendChild(box); row.appendChild(lb);
      const wrap = el('div', '');
      wrap.appendChild(row);
      if (hint) wrap.appendChild(el('div', 'hint', hint));
      return wrap;
    };
    c.appendChild(sw('流式输出', '边写边显示。关掉后要等整段生成完才出现。', cfg.stream !== false, 'stream'));
    c.appendChild(sw('关闭深度思考', '豆包 seed 系列默认开启深度思考。勾上会传 thinking.type=disabled，长文生成快很多。', cfg.noThinking !== false, 'noThinking'));
    c.appendChild(el('div', 'hint', '模型名带 doubao-seed / seed- 才会自动传关闭参数；glm-5-3 起官方不支持关闭，会自动跳过。'));

    const acts = el('div', 'sheet-acts');
    const save = el('button', 'primary-btn', '保存');
    save.onclick = () => {
      const patch = {
        baseUrl: fUrl.querySelector('input').value.trim(),
        apiKey: fKey.querySelector('input').value.trim(),
        model: fModel.querySelector('input').value.trim(),
        temperature: parseFloat(ti.value),
        maxTokens: parseInt(mti.value, 10) || 32000
      };
      c.querySelectorAll('[data-sw]').forEach(cb => { patch[cb.dataset.sw] = cb.checked; });
      Store.setCfg(patch);
      toast('已保存');
      view = cur ? (cur.units.length ? 'units' : 'book') : 'home';
      render();
    };
    const test = el('button', 'ghost-btn', '测试连接');
    test.onclick = async () => {
      test.disabled = true; test.textContent = '测试中…';
      try {
        Store.setCfg({
          baseUrl: fUrl.querySelector('input').value.trim(),
          apiKey: fKey.querySelector('input').value.trim(),
          model: fModel.querySelector('input').value.trim()
        });
        const r = await API.testConn();
        toast('连接正常：' + String(r).slice(0, 20));
      } catch (e) {
        alert('连接失败：' + e.message);
      }
      test.disabled = false; test.textContent = '测试连接';
    };
    acts.appendChild(save); acts.appendChild(test);
    c.appendChild(acts);
    stage.appendChild(c);

    /* 版本信息 + 强制更新 */
    const vc = el('div', 'card');
    vc.appendChild(el('h3', '', '版本'));
    const ver = window.APP_VERSION || '未知';
    vc.appendChild(el('div', 'kv')).appendChild(el('b', '', ver));
    vc.appendChild(el('div', 'hint', '如果功能没生效，说明设备还在用旧缓存。点下面按钮强制清缓存重载。'));
    const fb = el('button', 'primary-btn wide', '强制清缓存并重载');
    fb.onclick = async () => {
      fb.disabled = true; fb.textContent = '清理中…';
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
          const rs = await navigator.serviceWorker.getRegistrations();
          for (const r of rs) await r.unregister();
        }
        if (window.caches) {
          const ks = await caches.keys();
          for (const k of ks) await caches.delete(k);
        }
      } catch (e) {}
      location.replace(location.pathname + '?fresh=' + Date.now());
    };
    vc.appendChild(fb);

    const bk = el('button', 'ghost-btn wide', '⤓ 备份与恢复');
    bk.onclick = () => { view = 'backup'; render(); };
    vc.appendChild(bk);
    stage.appendChild(vc);

    /* 存储状态 */
    stage.appendChild(storageCard());

    /* 结构变动记录 */
    if (cur && cur.history && cur.history.length) {
      const hc = el('div', 'card');
      const hh = el('h3', '', '结构变动记录');
      hh.appendChild(el('span', 'tag', '最近 ' + Math.min(20, cur.history.length) + ' 条'));
      hc.appendChild(hh);
      hc.appendChild(el('div', 'hint', '改档、合并、删除、同步等操作都会记在这里，方便回溯。'));
      hc.appendChild(UNITUI.historyList(cur));
      stage.appendChild(hc);
    }
  }

  /* ---------- 存储状态卡片 ---------- */
  function storageCard() {
    const c = el('div', 'card');
    const h = el('h3', '', '存储');
    h.appendChild(el('span', 'tag', 'localStorage'));
    c.appendChild(h);

    const box = el('div', 'st-box');
    box.appendChild(el('div', 'st-loading', '读取中…'));
    c.appendChild(box);

    const refresh = async () => {
      box.innerHTML = '';
      try {
        const est = (navigator.storage && navigator.storage.estimate)
          ? await navigator.storage.estimate() : null;
        const usage = est ? est.usage : null;
        const quota = est ? est.quota : null;

        /* 本应用实际占用（算 localStorage 的所有键） */
        let own = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          const v = localStorage.getItem(k) || '';
          own += (k.length + v.length) * 2;   // UTF-16 估算
        }

        const fmt = (b) => {
          if (b == null) return '—';
          if (b < 1024) return b + ' B';
          if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
          if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
          return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
        };

        const row = (label, val, cls) => {
          const r = el('div', 'kv');
          r.appendChild(el('span', '', label));
          r.appendChild(el('b', cls || '', val));
          return r;
        };

        box.appendChild(row('本应用占用', fmt(own)));
        if (usage != null) box.appendChild(row('该站点已用', fmt(usage)));
        if (quota != null) box.appendChild(row('可用配额', fmt(quota)));

        if (usage != null && quota) {
          const pct = Math.min(100, (usage / quota) * 100);
          const bar = el('div', 'st-bar');
          const fill = el('i');
          fill.style.width = pct.toFixed(1) + '%';
          bar.appendChild(fill);
          box.appendChild(bar);
          box.appendChild(el('div', 'st-sub', '已用 ' + pct.toFixed(2) + '% 配额'));
        }

        /* 持久模式 */
        const pRow = el('div', 'st-persist');
        let persisted = null;
        if (navigator.storage && navigator.storage.persisted) {
          try { persisted = await navigator.storage.persisted(); } catch (e) {}
        }
        const state = el('div', 'st-state' + (persisted ? ' on' : ''));
        state.textContent = persisted === null
          ? '不支持查询'
          : (persisted ? '✓ 已开启持久存储' : '⚠ 未开启（数据可能被系统自动清理）');
        pRow.appendChild(state);

        if (persisted === false && navigator.storage && navigator.storage.persist) {
          const btn = el('button', 'primary-btn wide', '申请持久存储');
          btn.onclick = async () => {
            btn.disabled = true; btn.textContent = '申请中…';
            try {
              const ok = await navigator.storage.persist();
              toast(ok ? '已开启持久存储' : '系统未批准（添加到主屏后更容易通过）');
            } catch (e) { toast('申请失败'); }
            refresh();
          };
          pRow.appendChild(btn);
        }
        box.appendChild(pRow);

        /* 分节版本统计与全书去重 */
        if (cur) {
          let totalVers = 0, overCount = 0;
          (cur.units || []).forEach(u => {
            const parts = (u.steps && u.steps.draft && u.steps.draft.parts) || [];
            parts.forEach(part => {
              const n = PARTVER.count(part);
              totalVers += n;
              if (PARTVER.needsTrim(part)) overCount++;
            });
          });

          const vr = el('div', 'kv');
          vr.appendChild(el('span', '', '分节历史版本'));
          vr.appendChild(el('b', '', totalVers + ' 版'));
          box.appendChild(vr);

          if (overCount > 0) {
            const w = el('div', 'st-note');
            w.textContent = '有 ' + overCount + ' 个分节的历史稿件超过 5 版，建议在正文页清理。';
            box.appendChild(w);
          }

          if (totalVers > 0) {
            const ded = el('button', 'ghost-btn wide', '全书去重（合并重复的版本）');
            ded.onclick = () => {
              if (!confirm('扫描全书分节版本，把内容完全相同的合并成一条。\n\n不会删除任何不同的内容。继续？')) return;
              const removed = PARTVER.dedupeBook(cur);
              A.persist();
              toast(removed ? '已合并 ' + removed + ' 条重复版本' : '没有发现重复版本');
              refresh();
            };
            box.appendChild(ded);
          }
        }
      } catch (e) {
        box.appendChild(el('div', 'st-sub', '读取失败：' + e.message));
      }
    };
    setTimeout(refresh, 0);

    const again = el('button', 'ghost-btn wide', '刷新');
    again.onclick = () => refresh();
    c.appendChild(again);
    return c;
  }

  /* ---------- 事件绑定 ---------- */
  $('#btnHome').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    view = 'home'; render();
  };
  $('#btnUnits').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    if (!cur) return;
    view = 'units'; render();
  };
  $('#btnBook').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    if (!cur) return;
    view = 'book';
    /* 优先进入「有内容但还没通过」的那一环，其次第一个没做完的 */
    const order = LT.BOOK_STEPS;
    const withContent = order.find(k => {
      const s = cur.steps[k];
      return docOf(s) && s.status !== 'done';
    });
    const lastWithContent = [...order].reverse().find(k => docOf(cur.steps[k]));
    const firstEmpty = order.find(k => !docOf(cur.steps[k]));
    curStep = withContent || lastWithContent || firstEmpty || order[0];
    render();
  };
  $('#btnAudit').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    if (!cur) return;
    view = 'audit'; render();
  };
  $('#btnGrid').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    if (!cur) return;
    view = 'grid'; render();
  };
  $('#btnChapter').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    if (!cur) return;
    view = 'chapter'; render();
  };
  $('#btnFacts').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    if (!cur) return;
    view = 'facts'; render();
  };
  $('#btnSet').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    view = 'settings'; render();
  };
  $('#btnFb').onclick = () => {
    if (window.FBFLOAT) {
      FBFLOAT.init();
      FBFLOAT.show();
    }
  };
  $('#btnStop').onclick = () => {
    if (busy && busy.ctrl) { busy.ctrl.abort(); toast('已停止'); }
  };

  window.APP = {
    el, $, toast, sheet, closeSheet, persist, render, renderTop, updateDock,
    stage,
    get cur() { return cur; },
    get busy() { return busy; },
    setBusy(b) { busy = b; updateDock(); },
    get app() { return app; },
    get view() { return view; },
    setView(v) { view = v; },
    get curStep() { return curStep; },
    setCurStep(k) { curStep = k; },
    get curUnitStep() { return curUnitStep; },
    setCurUnitStep(k) { curUnitStep = k; },
    curUnit, docOf, setStream, endStream, persist, fmtTime, openBook, nextUnitStep, syncCur
  };

  /* 启动渲染 */
  render();
  /* 不再注册 Service Worker：它会把旧 JS 缓存住，导致更新后功能不生效。
     GitHub Pages 本身就够快，离线能力不值得为此牺牲更新可靠性。 */
  if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
    navigator.serviceWorker.getRegistrations().then(rs => {
      rs.forEach(r => r.unregister());
    }).catch(() => {});
  }
})();
