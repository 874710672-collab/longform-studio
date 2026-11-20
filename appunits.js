/* appunits.js — 单元列表：合并/拆分/改档/重跑（依赖闭包） */
(function () {
  const A = window.APP;
  const el = A.el;
  const toast = A.toast;
  const stage = A.stage;

  function cur() { return A.cur; }

  function renderUnitList() {
    const b = cur();
    const units = b.units;

    /* 概览 */
    const top = el('div', 'card');
    const h = el('h3', '', '单元列表');
    const done = units.filter(u => u.steps.polish.status === 'done').length;
    const stale = units.filter(u => u.stale).length;
    h.appendChild(el('span', 'tag', `${units.length} 篇 · 定稿 ${done}${stale ? ' · 待重跑 ' + stale : ''}`));
    top.appendChild(h);

    const stat = el('div', 'stat-row');
    const mainN = units.filter(u => u.kind === 'main').length;
    const sideN = units.filter(u => u.kind === 'side').length;
    const writ = (label, v) => {
      const d = el('div', 'stat');
      d.appendChild(el('b', '', String(v)));
      d.appendChild(el('span', '', label));
      return d;
    };
    stat.appendChild(writ('主线', mainN));
    stat.appendChild(writ('副线', sideN));
    stat.appendChild(writ('已定稿', done));
    stat.appendChild(writ('规划设计', (LEngine.totalWords(b) / 10000).toFixed(1) + '万'));
    top.appendChild(stat);

    const bar = el('div', 'list-acts');
    const bbook = el('button', 'mini', '◈ 全书层');
    bbook.onclick = () => { A.setView('book'); A.render(); };
    const bfacts = el('button', 'mini', '◉ 事实表');
    bfacts.onclick = () => { A.setView('facts'); A.render(); };
    const bgrid = el('button', 'mini', '▦ 推进表');
    bgrid.onclick = () => { A.setView('grid'); A.render(); };
    const bn = el('button', 'mini on', '＋ 新建单元');
    bn.onclick = () => addUnit(b);
    const bchk = el('button', 'mini', '▦ 容量体检');
    bchk.onclick = () => capacityReport(b);
    bar.appendChild(bbook); bar.appendChild(bfacts); bar.appendChild(bgrid);
    bar.appendChild(bn); bar.appendChild(bchk);
    top.appendChild(bar);
    stage.appendChild(top);

    if (!units.length) {
      const c = el('div', 'card');
      c.appendChild(el('div', 'empty-tip', '还没有单元。回到全书层生成「主线推进表」，会自动建出单元列表。'));
      stage.appendChild(c);
      return;
    }

    /* 单元行 */
    const list = el('div', 'unit-list');
    units.forEach(u => {
      const t = LEngine.tierOf(u);
      const row = el('div', 'unit-row' + (u.stale ? ' stale' : '') + (u.kind === 'side' ? ' side' : '') + (u.orphan ? ' orphan' : ''));
      row.dataset.unitIdx = String(u.idx);
      const head = el('div', 'ur-head');
      head.appendChild(el('span', 'ur-n', String(u.idx + 1)));
      head.appendChild(el('span', 'ur-t', u.title));
      head.appendChild(el('span', 'ur-tier ' + u.tier, t.name));
      row.appendChild(head);

      const meta = el('div', 'ur-meta');
      meta.appendChild(el('span', '', `${u.kind === 'side' ? '副线' : (u.orphan ? '无对应格' : '第' + u.spineAt + '格')} · ${u.beats} 事件 · 约${t.words}字`));
      const chk = LT.capacityCheck(u.beats, u.tier);
      if (chk.level !== 'ok') meta.appendChild(el('span', 'badge ' + chk.level, chk.level === 'dense' ? '偏密' : '偏薄'));
      if (u.stale) meta.appendChild(el('span', 'badge stale-b', '待重跑'));
      if (u.orphan) meta.appendChild(el('span', 'badge dense', '孤立'));
      if (u.spineDirty) {
        const b = el('span', 'badge thin', '计划已变');
        b.title = '推进表更新过，但这一篇已有内容，档位和事件数没跟着改';
        meta.appendChild(b);
      }
      row.appendChild(meta);

      /* 进度 */
      const order = LT.UNIT_STEPS;
      const prog = el('div', 'ur-prog');
      order.forEach(k => {
        const s = u.steps[k];
        const has = k === 'draft' ? (s.parts || []).some(Boolean) : !!A.docOf(s);
        const d = el('span', 'prog-dot' + (s.status === 'done' ? ' done' : has ? ' has' : ''));
        d.title = LT.UNIT_STEP_NAME[k];
        prog.appendChild(d);
      });
      const wcount = LEngine.cw(LEngine.docOf(u.steps.polish) || LEngine.joinDraft(u));
      prog.appendChild(el('span', 'ur-w', wcount ? wcount + ' 字' : '未写'));
      row.appendChild(prog);

      /* 操作 */
      const acts = el('div', 'ur-acts');
      const bOpen = el('button', 'mini on', '打开');
      bOpen.onclick = () => openUnit(b, u);
      const bTier = el('button', 'mini', '改档');
      bTier.onclick = () => changeTier(b, u);
      const bBeats = el('button', 'mini', '事件数');
      bBeats.onclick = () => changeBeats(b, u);
      const bMore = el('button', 'mini', '⋯');
      bMore.onclick = () => moreMenu(b, u);
      acts.appendChild(bOpen); acts.appendChild(bTier); acts.appendChild(bBeats); acts.appendChild(bMore);
      row.appendChild(acts);
      list.appendChild(row);
    });
    stage.appendChild(list);

    /* 自动定位到当前进度 */
    scheduleAutoScroll(b);

    /* 浮动「定位」按钮：挂 body，避免被 stage 的滚动容器带走 */
    const fabNode = gotoFab(b);
    if (fabNode && fabNode.nodeType === 1) document.body.appendChild(fabNode);
  }

  /* 计算「当前应该定位到哪一篇」 */
  function targetUnitIdx(b) {
    const units = b.units || [];
    if (!units.length) return -1;

    const curU = Books.curUnit(b);
    /* 有明确打开的单元，就用它 */
    if (curU) {
      const finished = curU.steps.polish && curU.steps.polish.status === 'done';
      if (finished) {
        /* 跑完了 → 定位到下一篇 */
        const next = curU.idx + 1;
        return next < units.length ? next : curU.idx;
      }
      return curU.idx;
    }

    /* 没有打开的单元：找第一个未定稿的 */
    const firstUndone = units.findIndex(u => !(u.steps.polish && u.steps.polish.status === 'done'));
    return firstUndone >= 0 ? firstUndone : units.length - 1;
  }

  /* 只在「从别的页面切入」时自动滚动 */
  function scheduleAutoScroll(b) {
    const fromOther = window.__prevView !== 'units';
    if (!fromOther) return;   // 已经在单元列表里反复渲染，不重置位置

    const target = targetUnitIdx(b);
    if (target < 0) return;

    /* 等 DOM 布局完成再滚 */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const st = document.getElementById('stage');
        if (!st) return;
        const row = st.querySelector('[data-unit-idx="' + target + '"]');
        if (!row) return;
        const top = row.offsetTop - st.clientHeight / 2 + row.offsetHeight / 2;
        st.scrollTop = Math.max(0, top);
      });
    });
  }

  /* 浮动「定位到当前」按钮 */
  function gotoFab(b) {
    const target = targetUnitIdx(b);
    const units = b.units || [];
    if (target < 0 || target >= units.length) return document.createDocumentFragment();

    const u = units[target];
    const wrap = el('div', 'fab-goto');

    /* 文案看「当前实际在进行的那一篇」，不是目标行 */
    const curU = Books.curUnit(b);
    const curDone = curU && curU.steps.polish && curU.steps.polish.status === 'done';
    const showNext = !!curU && curDone;   // 当前那篇跑完了 → 提示下一篇
    const label = el('span', 'fg-label');
    label.textContent = (showNext ? '下一篇：第 ' : '正在跑：第 ') + (u.idx + 1) + ' 篇';

    const btn = el('button', 'fg-btn');
    btn.appendChild(el('span', 'fg-ico', '⌖'));
    btn.appendChild(el('span', '', '定位'));

    wrap.appendChild(label);
    wrap.appendChild(btn);

    const doScroll = () => {
      const st = document.getElementById('stage');
      if (!st) return;
      const row = st.querySelector('[data-unit-idx="' + u.idx + '"]');
      if (!row) return;
      const top = row.offsetTop - st.clientHeight / 2 + row.offsetHeight / 2;
      st.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    };
    btn.onclick = doScroll;

    /* 滚到目标附近就自动隐藏，避免挡视线 */
    const st = document.getElementById('stage');
    const checkVisible = () => {
      const row = st.querySelector('[data-unit-idx="' + u.idx + '"]');
      if (!row) return;
      const rect = row.getBoundingClientRect();
      const stRect = st.getBoundingClientRect();
      const visible = rect.bottom > stRect.top + 40 && rect.top < stRect.bottom - 40;
      wrap.classList.toggle('hide', visible);
    };
    if (st) {
      st.addEventListener('scroll', checkVisible, { passive: true });
      setTimeout(checkVisible, 120);
    }

    return wrap;
  }

  function openUnit(b, u) {
    b.unitId = u.id;
    A.setView('unit');
    A.setCurUnitStep(A.nextUnitStep(u));
    A.persist();
    A.render();
  }

  /* ---------- 改档 ---------- */
  function changeTier(b, u) {
    const head = `<h2>改档位 · 第${u.idx + 1}篇<button class="close">×</button></h2>`;
    let html = head + `<div class="hint">当前：${LT.TIERS[u.tier].name}档 ${LT.TIERS[u.tier].min}-${LT.TIERS[u.tier].max} 字 · ${u.beats} 个事件</div>`;
    html += '<div class="tier-row" style="margin-top:12px">';
    Object.keys(LT.TIERS).forEach(k => {
      const t = LT.TIERS[k];
      const chk = LT.capacityCheck(u.beats, k);
      html += `<button class="tier-btn${u.tier === k ? ' on' : ''}" data-tier="${k}"><b>${t.name}档</b><span>${t.min}-${t.max} 字 · ${t.parts} 节</span><span class="cap ${chk.level}">${chk.level === 'ok' ? '容量合适' : (chk.level === 'dense' ? '偏密' : '偏薄')}</span></button>`;
    });
    html += '</div>';
    html += `<div class="hint" style="margin-top:14px">改档后如果大纲已经写了，需要按新档重排大纲（节数会变）。</div>`;
    html += `<div class="sheet-acts"><button class="ghost-btn" id="tierOnly">只改字数</button><button class="primary-btn" id="tierReplan">按新档重排大纲</button></div>`;

    A.sheet(html, (root) => {
      root.querySelectorAll('[data-tier]').forEach(btn => {
        btn.onclick = () => {
          root.querySelectorAll('[data-tier]').forEach(x => x.classList.remove('on'));
          btn.classList.add('on');
          root.dataset.pick = btn.dataset.tier;
        };
      });
      root.dataset.pick = u.tier;
      root.querySelector('#tierOnly').onclick = () => {
        const k = root.dataset.pick;
        if (k === u.tier) { A.closeSheet(); return; }
        u.tier = k;
        Books.pushHistory(b, '改档位', `第${u.idx + 1}篇 → ${LT.TIERS[k].name}档（只改字数）`);
        A.persist(); A.closeSheet(); A.render();
        toast('已改为 ' + LT.TIERS[k].name + '档');
      };
      root.querySelector('#tierReplan').onclick = () => {
        const k = root.dataset.pick;
        u.tier = k;
        /* 大纲作废 */
        u.steps.outline.versions = [];
        u.steps.outline.sel = 0;
        u.steps.outline.status = 'idle';
        u.steps.outline.feedback = '';
        const n = LEngine.markStale(b, u.idx, '改档重排大纲');
        Books.pushHistory(b, '改档并重排', `第${u.idx + 1}篇 → ${LT.TIERS[k].name}档，标记 ${n} 篇待重跑`);
        A.persist(); A.closeSheet(); A.render();
        toast('大纲已作废，从本篇起 ' + n + ' 篇待重跑');
      };
    });
  }

  /* ---------- 改事件数 ---------- */
  function changeBeats(b, u) {
    const t = LT.TIERS[u.tier];
    let html = `<h2>事件数 · 第${u.idx + 1}篇<button class="close">×</button></h2>`;
    html += `<div class="hint">事件数决定这一篇的合理字数：每个事件约 ${LT.BEAT_LO}-${LT.BEAT_HI} 字。<br>当前档位「${t.name}」允许 ${t.min}-${t.max} 字。</div>`;
    html += `<div class="field" style="margin-top:12px"><label>本单元要覆盖的关键事件数</label><input type="number" id="beatsIn" value="${u.beats}" min="1" max="20"></div>`;
    html += `<div id="beatsChk"></div>`;
    html += `<div class="sheet-acts"><button class="primary-btn" id="beatsOk">确定</button></div>`;
    A.sheet(html, (root) => {
      const inp = root.querySelector('#beatsIn');
      const chkBox = root.querySelector('#beatsChk');
      const upd = () => {
        const n = parseInt(inp.value, 10) || 0;
        const r = LT.capacityCheck(n, u.tier);
        chkBox.innerHTML = `<div class="cap-tip ${r.level}">${r.msg}</div>`;
      };
      inp.oninput = upd;
      upd();
      root.querySelector('#beatsOk').onclick = () => {
        const n = parseInt(inp.value, 10) || u.beats;
        u.beats = n;
        const r = LT.capacityCheck(n, u.tier);
        Books.pushHistory(b, '改事件数', `第${u.idx + 1}篇 → ${n} 个事件`);
        A.persist(); A.closeSheet(); A.render();
        if (r.level !== 'ok') toast(r.msg);
        else toast('已设为 ' + n + ' 个事件');
      };
    });
  }

  /* ---------- 更多操作 ---------- */
  function moreMenu(b, u) {
    let html = `<h2>第${u.idx + 1}篇 · ${u.title}<button class="close">×</button></h2>`;
    html += '<div class="menu-list">';
    html += `<button class="menu-item" data-a="up">↑ 上移一位</button>`;
    html += `<button class="menu-item" data-a="down">↓ 下移一位</button>`;
    html += `<button class="menu-item" data-a="merge">⊟ 与下一篇合并</button>`;
    html += `<button class="menu-item" data-a="split">⊞ 拆成两篇</button>`;
    html += `<button class="menu-item" data-a="kind">⇄ 改为主线/副线</button>`;
    html += `<button class="menu-item" data-a="rerun">↻ 从本篇重跑</button>`;
    html += `<button class="menu-item danger" data-a="del">🗑 删除本篇</button>`;
    html += '</div>';
    A.sheet(html, (root) => {
      root.querySelectorAll('.menu-item').forEach(btn => {
        btn.onclick = () => {
          const a = btn.dataset.a;
          A.closeSheet();
          if (a === 'up') moveUnit(b, u, -1);
          if (a === 'down') moveUnit(b, u, 1);
          if (a === 'merge') mergeUnit(b, u);
          if (a === 'split') splitUnit(b, u);
          if (a === 'kind') changeKind(b, u);
          if (a === 'rerun') rerunFrom(b, u);
          if (a === 'del') delUnit(b, u);
        };
      });
    });
  }

  function moveUnit(b, u, dir) {
    const i = b.units.indexOf(u);
    const j = i + dir;
    if (j < 0 || j >= b.units.length) { toast('到头了'); return; }
    b.units[i] = b.units[j];
    b.units[j] = u;
    LEngine.renumber(b);
    const from = Math.min(i, j);
    const n = LEngine.markStale(b, from, '顺序变动');
    Books.pushHistory(b, '移动单元', `第${i + 1}篇 ↔ 第${j + 1}篇，标记 ${n} 篇`);
    A.persist(); A.render();
    toast('已移动，' + n + ' 篇待重跑');
  }

  function mergeUnit(b, u) {
    const i = b.units.indexOf(u);
    const next = b.units[i + 1];
    if (!next) { toast('这是最后一篇，没有可合并的对象'); return; }
    if (!confirm(`把「${u.title}」和「${next.title}」合并成一篇？\n\n原文会保留在合并记录里，可以撤回。`)) return;
    const sumBeats = u.beats + next.beats;
    let tier = 'm';
    if (next.tier === 'l' || u.tier === 'l') tier = 'l';
    else if (u.tier === 's' && next.tier === 's' && sumBeats <= 3) tier = 's';
    const merged = Books.newUnit(b.id, u.idx, {
      kind: u.kind, tier, beats: Math.min(sumBeats, 12),
      title: u.title, spineAt: u.spineAt
    });
    merged.mergedFrom = [
      { id: u.id, title: u.title, steps: JSON.parse(JSON.stringify(u.steps)), idx: u.idx },
      { id: next.id, title: next.title, steps: JSON.parse(JSON.stringify(next.steps)), idx: next.idx }
    ];
    b.units[i] = merged;
    b.units.splice(i + 1, 1);
    LEngine.renumber(b);
    const n = LEngine.markStale(b, i, '合并单元');
    Books.pushHistory(b, '合并单元', `${u.title} + ${next.title} → ${merged.title}，标记 ${n} 篇`);
    A.persist(); A.render();
    toast('已合并，' + n + ' 篇待重跑');
  }

  function splitUnit(b, u) {
    if (u.beats < 2) { toast('事件数少于 2，没法拆'); return; }
    const half = Math.floor(u.beats / 2);
    const a = Books.newUnit(b.id, u.idx, { kind: u.kind, tier: 's', beats: u.beats - half, title: u.title + '（上）', spineAt: u.spineAt });
    const c = Books.newUnit(b.id, u.idx + 1, { kind: u.kind, tier: 's', beats: half, title: u.title + '（下）', spineAt: u.spineAt });
    a.mergedFrom = [{ id: u.id, title: u.title, steps: JSON.parse(JSON.stringify(u.steps)), idx: u.idx }];
    c.mergedFrom = [{ id: u.id, title: u.title + '（原文）', steps: JSON.parse(JSON.stringify(u.steps)), idx: u.idx }];
    const i = b.units.indexOf(u);
    b.units.splice(i, 1, a, c);
    LEngine.renumber(b);
    const n = LEngine.markStale(b, i, '拆分单元');
    Books.pushHistory(b, '拆分单元', `${u.title} → 上下两篇，标记 ${n} 篇`);
    A.persist(); A.render();
    toast('已拆成两篇，' + n + ' 篇待重跑');
  }

  function changeKind(b, u) {
    u.kind = u.kind === 'main' ? 'side' : 'main';
    if (u.kind === 'main' && u.spineAt < 0) u.spineAt = Math.max(1, u.idx);
    Books.pushHistory(b, '改单元类型', `第${u.idx + 1}篇 → ${u.kind === 'main' ? '主线' : '副线'}`);
    A.persist(); A.render();
    toast('已改为' + (u.kind === 'main' ? '主线' : '副线') + '单元');
  }

  function rerunFrom(b, u) {
    if (!confirm(`从第${u.idx + 1}篇起全部标记为待重跑？\n\n已写好的正文不会删除，只是标灰，重跑时会覆盖。`)) return;
    const n = LEngine.markStale(b, u.idx, '手动标记重跑');
    Books.pushHistory(b, '批量标记重跑', `从第${u.idx + 1}篇起 ${n} 篇`);
    A.persist(); A.render();
    toast(n + ' 篇已标记待重跑');
  }

  function delUnit(b, u) {
    if (!confirm(`删除「${u.title}」？`)) return;
    const i = b.units.indexOf(u);
    b.units.splice(i, 1);
    LEngine.renumber(b);
    LEngine.markStale(b, i, '删除上游单元');
    Books.pushHistory(b, '删除单元', u.title);
    A.persist(); A.render();
    toast('已删除');
  }

  function addUnit(b) {
    const u = Books.newUnit(b.id, b.units.length, { kind: 'main', tier: 'm', beats: 5, title: '新单元' });
    b.units.push(u);
    LEngine.renumber(b);
    Books.pushHistory(b, '新建单元', '第' + b.units.length + '篇');
    A.persist(); A.render();
  }

  /* ---------- 容量体检 ---------- */
  function capacityReport(b) {
    const issues = [];
    b.units.forEach(u => {
      const r = LT.capacityCheck(u.beats, u.tier);
      if (r.level !== 'ok') issues.push({ u, r });
    });
    const total = LEngine.totalWords(b);
    const diff = total - b.target;

    /* 实际已写字数：按定稿优先，没有定稿用正文拼接 */
    const wOf = (u) => {
      const p = LEngine.docOf(u.steps.polish);
      if (p) return LEngine.cw(p);
      return LEngine.cw(LEngine.joinDraft(u));
    };
    const written = b.units.reduce((a, u) => a + wOf(u), 0);
    const doneUnits = b.units.filter(u => LEngine.unitHasContent(u)).length;
    const pct = total > 0 ? Math.round((written / total) * 100) : 0;
    const rest = total - written;

    let html = `<h2>容量体检<button class="close">×</button></h2>`;

    /* 实际进度 */
    html += `<div class="cap-progress">
      <div class="cp-row">
        <span>已写</span>
        <b>${written.toLocaleString()} 字</b>
        <span class="cp-pct">${pct}%</span>
      </div>
      <div class="cp-bar"><i style="width:${Math.min(100, pct)}%"></i></div>
      <div class="cp-sub">完成 ${doneUnits} / ${b.units.length} 篇 · 还差 ${rest > 0 ? rest.toLocaleString() : 0} 字到规划总量</div>
    </div>`;

    html += `<div class="kv"><span>目标总字数</span><b>${(b.target / 10000).toFixed(0)} 万字</b></div>`;
    html += `<div class="kv"><span>规划总字数</span><b class="${Math.abs(diff) > b.target * 0.12 ? 'warn-txt' : ''}">${(total / 10000).toFixed(1)} 万字</b></div>`;
    html += `<div class="kv"><span>已写总字数</span><b class="ok-txt">${written.toLocaleString()} 字</b></div>`;
    html += `<div class="kv"><span>规划与目标差额</span><b class="${Math.abs(diff) > b.target * 0.12 ? 'warn-txt' : ''}">${diff > 0 ? '+' : ''}${(diff / 10000).toFixed(1)} 万</b></div>`;
    if (Math.abs(diff) > b.target * 0.12) {
      html += `<div class="cap-tip dense">规划总字数和目标偏差超过 12%，建议调整单元数量或档位分配。</div>`;
    }
    html += '<h3 style="margin-top:18px;font-size:15px">单篇进度</h3>';
    html += '<div class="unit-wlist">';
    b.units.forEach(u => {
      const w = wOf(u);
      const tw = LEngine.tierOf(u).words;
      const has = LEngine.unitHasContent(u);
      const finished = u.steps.polish.status === 'done';
      const st = finished ? '定稿' : (has ? '进行中' : '未开始');
      const cls = finished ? 'done' : (has ? 'doing' : 'todo');
      html += `<div class="uw-row ${cls}">
        <span class="uw-n">${u.idx + 1}</span>
        <span class="uw-t">${u.title || '未命名'}</span>
        <span class="uw-s">${st}</span>
        <b class="uw-w">${w ? w.toLocaleString() : '—'}</b>
        <span class="uw-t2">/ ${tw.toLocaleString()}</span>
      </div>`;
    });
    html += '</div>';

    html += '<h3 style="margin-top:18px;font-size:15px">容量问题</h3>';
    if (!issues.length) html += '<div class="cap-tip ok">所有单元的「事件数 × 字数」都落在合理区间。</div>';
    else {
      html += '<div class="issue-list">';
      issues.forEach(({ u, r }) => {
        html += `<div class="issue-row ${r.level}"><b>第${u.idx + 1}篇 ${u.title}</b><span>${r.msg}</span></div>`;
      });
      html += '</div>';
    }
    A.sheet(html);
  }

  window.UNITUI = { renderUnitList, openUnit };

  /* 供设置页复用：渲染结构变动记录 */
  window.UNITUI.historyList = function (b) {
    const wrap = document.createElement('div');
    wrap.className = 'hist-list';
    const list = (b.history || []).slice(0, 20);
    if (!list.length) {
      const d = document.createElement('div');
      d.className = 'hint';
      d.textContent = '还没有记录';
      wrap.appendChild(d);
      return wrap;
    }
    list.forEach(h => {
      const row = document.createElement('div');
      row.className = 'hist-row';
      const t = document.createElement('span');
      t.textContent = A.fmtTime(h.at);
      const a = document.createElement('b');
      a.textContent = h.action;
      const d = document.createElement('span');
      d.className = 'sub';
      d.textContent = h.detail || '';
      row.appendChild(t); row.appendChild(a); row.appendChild(d);
      wrap.appendChild(row);
    });
    return wrap;
  };
})();
