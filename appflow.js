/* appflow.js — 分节正文视图 + 所有生成的调度 */
(function () {
  const A = window.APP;
  const el = A.el;
  const toast = A.toast;
  const stage = A.stage;
  function cur() { return A.cur; }

  /* 上游环节重新生成后，把下游环节标记为「需重做」。
     不清空已有内容，只是提示：这些内容是基于旧的上游写的。 */
  function markDownstreamStale(u, fromStep) {
    const order = LT.UNIT_STEPS;
    const i = order.indexOf(fromStep);
    if (i < 0) return [];
    const touched = [];
    order.slice(i + 1).forEach(k => {
      const s = u.steps[k];
      if (!s) return;
      const has = k === 'draft'
        ? (s.parts || []).some(Boolean)
        : !!(s.versions && s.versions[s.sel]);
      if (has && s.status !== 'stale') {
        s.status = 'stale';
        touched.push(LT.UNIT_STEP_NAME[k]);
      }
    });
    return touched;
  }

  /* ================= 分节正文 ================= */
  function renderDraft(b, u) {
    const d = u.steps.draft;
    const plan = LEngine.outlinePlan(LEngine.unitDoc(u, 'outline'));
    const total = plan.length || LEngine.tierOf(u).parts;
    const idx = Math.min(d.partIdx || 0, Math.max(0, total - 1));
    d.partIdx = idx;
    const busy = A.busy;

    const wrap = el('div', 'split');
    const left = el('div');
    const right = el('div');
    wrap.appendChild(left); wrap.appendChild(right);
    stage.appendChild(wrap);

    /* 左：当前节 */
    const card = el('div', 'card');
    const h = el('h3', '', '分节正文');
    const written = (d.parts || []).filter(Boolean).length;
    h.appendChild(el('span', 'tag', `第 ${idx + 1}/${total} 节 · 已写 ${written} 节`));
    card.appendChild(h);

    const curPart = d.parts[idx];
    const box = el('div', 'card');
    const pre = el('div', 'doc');
    const isStreaming = busy && busy.mode === 'unit-draft' && busy.partIdx === idx;
    pre.textContent = curPart ? curPart.body : (isStreaming ? '' : '点底部「写这一节」生成。');
    if (isStreaming) pre.classList.add('streaming');
    box.appendChild(pre);
    if (curPart && !isStreaming) {
      const ops = el('div', 'doc-ops');
      const b1 = el('button', 'mini', '手动编辑');
      b1.onclick = () => editPart(b, u, idx, pre);
      const b2 = el('button', 'mini', '复制');
      b2.onclick = () => BOOKUI.copyText(curPart.body);
      const b3 = el('button', 'mini', '✧ 校验');
      b3.onclick = () => showIssues(b, u, curPart.body);
      ops.appendChild(b1); ops.appendChild(b2); ops.appendChild(b3);
      box.appendChild(ops);
      box.appendChild(el('div', 'words', '本节 ' + LEngine.cw(curPart.body) + ' 字 · 目标 ' + ((plan[idx] && plan[idx].words) || '—')));
      if (curPart.issues && curPart.issues.length) {
        const ib = el('div', 'issue-list');
        curPart.issues.forEach(i => {
          const r = el('div', 'issue-row ' + (i.level === 'error' ? 'dense' : 'thin'), i.msg);
          ib.appendChild(r);
        });
        box.appendChild(ib);
      }
    }
    left.appendChild(card);
    left.appendChild(box);

    /* 节导航 */
    const nav = el('div', 'part-nav');
    const prev = el('button', 'mini', '← 上一节');
    prev.disabled = idx <= 0;
    prev.onclick = () => { d.partIdx = idx - 1; A.persist(); A.render(); };
    const next = el('button', 'mini', '下一节 →');
    next.disabled = idx >= total - 1;
    next.onclick = () => { d.partIdx = idx + 1; A.persist(); A.render(); };
    nav.appendChild(prev); nav.appendChild(next);
    box.appendChild(nav);

    /* 右：节列表 + 意见 + 批量 */
    const listBox = el('div', 'card');
    listBox.appendChild(el('h3', '', '全部节'));
    const pl = el('div', 'parts');
    for (let i = 0; i < total; i++) {
      const pt = d.parts[i];
      const row = el('div', 'part-row' + (i === idx ? ' on' : '') + (pt ? ' done' : ''));
      row.appendChild(el('span', 'pi', String(i + 1)));
      row.appendChild(el('span', 'pt', (plan[i] && plan[i].title) || ('第' + (i + 1) + '节')));
      row.appendChild(el('span', 'pw', pt ? LEngine.cw(pt.body) + '字' : ((plan[i] && plan[i].words) ? plan[i].words + '字' : '')));
      row.onclick = () => { d.partIdx = i; A.persist(); A.render(); };
      pl.appendChild(row);
    }
    listBox.appendChild(pl);

    const tw = (d.parts || []).filter(Boolean).reduce((a, p) => a + LEngine.cw(p.body), 0);
    listBox.appendChild(el('div', 'words', `合计 ${tw} 字 / 目标 ${LEngine.tierOf(u).words} 字`));

    const auto = el('button', 'primary-btn wide', busy ? '生成中…' : (written ? '全自动续写剩余节' : '全自动写完所有节'));
    auto.disabled = !!busy;
    auto.onclick = () => autoWrite(b, u);
    listBox.appendChild(auto);

    /* 本篇写完后：出润色稿 */
    if (written >= total) {
      const go = el('button', 'ghost-btn wide', '正文写完 · 拼成整篇');
      go.onclick = () => {
        d.versions = [{ text: LEngine.joinDraft(u), at: Date.now() }];
        d.sel = 0;
        d.status = 'done';
        d.partIdx = 0;
        A.persist();
        A.setCurUnitStep('polish');
        A.render();
        toast('已拼成整篇');
      };
      listBox.appendChild(go);
    }
    right.appendChild(listBox);
    right.appendChild(BOOKUI.feedbackCard(d, 'draft'));

    A.app.streamEl = pre;
  }

  function editPart(b, u, idx, pre) {
    const d = u.steps.draft;
    const ta = el('textarea');
    ta.className = 'doc-edit';
    ta.value = d.parts[idx].body;
    pre.replaceWith(ta);
    ta.focus();
    const done = el('button', 'primary-btn', '保存');
    done.onclick = () => {
      d.parts[idx].body = ta.value;
      d.parts[idx].issues = LCHECK.checkText(b, u, ta.value);
      A.persist(); A.render();
    };
    ta.after(done);
  }

  function showIssues(b, u, text) {
    const all = LCHECK.checkText(b, u, text).concat(LCHECK.checkUnitAgainstFacts(b, u));
    if (!all.length) { A.toast('没发现问题'); return; }
    let html = `<h2>校验结果<button class="close">×</button></h2><div class="issue-list">`;
    all.forEach(i => { html += `<div class="issue-row ${i.level === 'error' ? 'dense' : 'thin'}">${i.msg}</div>`; });
    html += '</div>';
    A.sheet(html);
  }

  /* ================= 调度：全书层 ================= */
  async function genBook(key) {
    const b = cur();
    const s = b.steps[key];
    if (A.busy) return;
    const ctrl = new AbortController();
    const label = '正在写' + LT.BOOK_STEP_NAME[key];
    A.setBusy({ ctrl, label, text: '', key });
    A.render();
    A.setStream('');
    try {
      const out = await LEngine.genBookStep(b, key, (d, full) => {
        A.setBusy(Object.assign({}, A.busy, { text: full }));
        A.setStream(full);
        A.updateDock();
      }, ctrl.signal);
      if (!out || !String(out).trim()) throw new Error('返回为空，可能被截断了');
      s.versions.push({ text: String(out).trim(), at: Date.now() });
      s.sel = s.versions.length - 1;
      s.status = 'ready';
      Books.save(b);
      A.setBusy(null);
      A.render();
      A.toast('已生成，读一遍再决定是否通过');
    } catch (e) {
      A.setBusy(null);
      A.endStream();
      A.render();
      if (e.name !== 'AbortError') alert('生成失败：' + e.message);
    }
  }

  async function reviseBook(key) {
    const b = cur();
    const s = b.steps[key];
    if (!A.docOf(s)) { A.toast('先生成'); return; }
    if (!(s.feedback || '').trim()) { A.toast('先写审核意见'); return; }
    const ctrl = new AbortController();
    A.setBusy({ ctrl, label: '正在按意见改', text: '', key });
    A.render();
    try {
      const out = await LEngine.genBookStep(b, key, (d, full) => {
        A.setBusy(Object.assign({}, A.busy, { text: full }));
        A.setStream(full); A.updateDock();
      }, ctrl.signal);
      s.versions.push({ text: String(out).trim(), at: Date.now() });
      s.sel = s.versions.length - 1;
      Books.save(b);
      A.setBusy(null); A.render();
      A.toast('已按意见改，旧稿还在「稿 N」里');
    } catch (e) {
      A.setBusy(null); A.endStream(); A.render();
      if (e.name !== 'AbortError') alert('失败：' + e.message);
    }
  }

  /* ================= 调度：单元层 ================= */
  async function genUnit(key) {
    const b = cur();
    const u = A.curUnit();
    if (!u || A.busy) return;
    const s = u.steps[key];
    const ctrl = new AbortController();
    A.setBusy({ ctrl, label: '正在写' + LT.UNIT_STEP_NAME[key], text: '', key, unitId: u.id });
    A.render();
    A.setStream('');
    try {
      const out = await LEngine.genUnitStep(b, u, key, (d, full) => {
        A.setBusy(Object.assign({}, A.busy, { text: full }));
        A.setStream(full); A.updateDock();
      }, ctrl.signal);
      if (!out || !String(out).trim()) throw new Error('返回为空，可能被截断了');
      const isFirstDraft = !(s.versions && s.versions.length);
      s.versions.push({ text: String(out).trim(), at: Date.now() });
      s.sel = s.versions.length - 1;
      s.status = 'ready';
      /* 重新生成上游：把下游标记成需重做（内容保留，不清空） */
      const touched = markDownstreamStale(u, key);
      Books.save(b);
      A.setBusy(null);
      A.render();
      A.toast(touched.length
        ? '已生成。下游「' + touched.join('、') + '」是旧的，建议重新生成'
        : '已生成');
    } catch (e) {
      A.setBusy(null); A.endStream(); A.render();
      if (e.name !== 'AbortError') alert('生成失败：' + e.message);
    }
  }

  async function reviseUnit(key) {
    const b = cur();
    const u = A.curUnit();
    const s = u.steps[key];
    if (!(s.feedback || '').trim()) { A.toast('先写审核意见'); return; }
    /* 复用生成，把意见作为反馈带入 */
    return genUnit(key);
  }

  /* ---- 单节 ---- */
  async function genOnePart(b, u, idx) {
    const d = u.steps.draft;
    const ctrl = new AbortController();
    A.setBusy({ ctrl, label: '正在写第' + (idx + 1) + '节', text: '', mode: 'unit-draft', partIdx: idx });
    A.render();
    try {
      const out = await LEngine.genPart(b, u, idx, (dl, full) => {
        A.setBusy(Object.assign({}, A.busy, { text: full }));
        A.setStream(full); A.updateDock();
      }, ctrl.signal);
      const plan = LEngine.outlinePlan(LEngine.unitDoc(u, 'outline'));
      d.parts[idx] = {
        title: (plan[idx] && plan[idx].title) || ('第' + (idx + 1) + '节'),
        body: String(out).trim(),
        issues: LCHECK.checkText(b, u, String(out))
      };
      d.status = 'ready';
      Books.save(b);
      A.setBusy(null); A.render();
    } catch (e) {
      A.setBusy(null); A.endStream(); A.render();
      if (e.name !== 'AbortError') alert('生成失败：' + e.message);
    }
  }

  async function autoWrite(b, u) {
    const d = u.steps.draft;
    const plan = LEngine.outlinePlan(LEngine.unitDoc(u, 'outline'));
    const total = plan.length || LEngine.tierOf(u).parts;
    let start = 0;
    while (start < total && d.parts[start]) start++;
    if (start >= total) { A.toast('所有节都写完了'); return; }

    const ctrl = new AbortController();
    let cancelled = false;
    ctrl.signal.addEventListener('abort', () => { cancelled = true; });
    A.setBusy({ ctrl, label: '正在写第' + (start + 1) + '节', text: '', mode: 'unit-draft', partIdx: start });
    A.render();

    try {
      await LEngine.autoDraft(b, u, start, {
        signal: ctrl.signal,
        cancelled: () => cancelled,
        onDelta: (i, dl, full) => {
          A.setBusy(Object.assign({}, A.busy, { text: full, partIdx: i, label: '正在写第' + (i + 1) + '节' }));
          A.setStream(full); A.updateDock();
        },
        onPartDone: (i, uu) => {
          if (uu.steps.draft.parts[i]) {
            uu.steps.draft.parts[i].issues = LCHECK.checkText(b, uu, uu.steps.draft.parts[i].body);
          }
          Books.save(b);
          const nx = i + 1;
          A.setBusy(Object.assign({}, A.busy, { partIdx: Math.min(nx, total - 1), label: '正在写第' + (nx + 1) + '节', text: '' }));
          A.render();
        }
      });
      A.setBusy(null);
      A.render();
      A.toast('全部写完了');
    } catch (e) {
      A.setBusy(null);
      A.endStream();
      A.render();
      if (e.name !== 'AbortError' && e.message !== '已停止') alert('中断：' + e.message);
      else A.toast('已停止，已写的节都保留了');
    }
  }

  /* ---- 整篇润色 ---- */
  async function polishUnit(b, u) {
    const ctrl = new AbortController();
    let cancelled = false;
    ctrl.signal.addEventListener('abort', () => { cancelled = true; });
    A.setBusy({ ctrl, label: '正在分段润色', text: '' });
    A.render();
    try {
      const out = await LEngine.polishInChunks(b, u, {
        signal: ctrl.signal,
        cancelled: () => cancelled,
        onProgress: (i, n, acc) => {
          A.setBusy(Object.assign({}, A.busy, { label: '正在润色第' + (i + 1) + '/' + n + ' 段', text: acc }));
          A.setStream(acc); A.updateDock();
        }
      });
      const s = u.steps.polish;
      s.versions.push({ text: out, at: Date.now() });
      s.sel = s.versions.length - 1;
      s.status = 'ready';
      Books.save(b);
      A.setBusy(null); A.render();
      A.toast('润色完成');
    } catch (e) {
      A.setBusy(null); A.endStream(); A.render();
      if (e.name !== 'AbortError') alert('润色失败：' + e.message);
    }
  }

  /* ---- 通过 ---- */
  function approve() {
    const b = cur();
    if (A.view === 'book') {
      const k = A.curStep;
      const s = b.steps[k];
      if (!A.docOf(s)) { A.toast('还没有内容'); return; }
      s.status = 'done';
      /* 人物总表通过 → 自动写入硬事实表 */
      if (k === 'cast') {
        const r = LEngine.parseCast(A.docOf(s));
        if (r.people.length) {
          b.facts.people = r.people;
          if (r.world.length) b.facts.world = r.world;
          b.steps.cast.status = 'done';
          A.toast('已自动导入 ' + r.people.length + ' 人到硬事实表');
        } else {
          A.toast('没解析出人物，检查格式是否用「｜」分隔');
        }
      }
      const i = LT.BOOK_STEPS.indexOf(k);
      if (i < LT.BOOK_STEPS.length - 1) A.setCurStep(LT.BOOK_STEPS[i + 1]);
      else {
        /* 推进表通过：生成/更新单元列表，然后进单元页 */
        const cells = LEngine.parseSpine(A.docOf(s));
        if (cells.length) {
          b.spine = cells;
          if (!b.units.length) LEngine.buildUnitsFromSpine(b, true);
          else {
            /* 已有单元：只补新增的格子，已写的不动 */
            const have = new Set(b.units.filter(u => u.kind === 'main').map(u => u.spineAt));
            cells.filter(c => !have.has(c.step)).forEach(c => {
              b.units.push(Books.newUnit(b.id, b.units.length, {
                kind: 'main', tier: { 小: 's', 中: 'm', 大: 'l' }[c.size] || 'm',
                beats: c.beats || 5, title: c.title, spineAt: c.step
              }));
            });
            LEngine.renumber(b);
          }
        }
        A.setView('units');
      }
      Books.save(b); A.render();
      return;
    }
    if (A.view === 'unit') {
      const u = A.curUnit();
      const k = A.curUnitStep;
      const s = u.steps[k];
      if (k === 'draft') {
        const written = (s.parts || []).filter(Boolean).length;
        if (!written) { A.toast('先写正文'); return; }
        s.versions = [{ text: LEngine.joinDraft(u), at: Date.now() }];
        s.sel = 0;
        s.status = 'done';
        A.setCurUnitStep('polish');
        Books.save(b); A.render();
        return;
      }
      if (!A.docOf(s)) { A.toast('还没有内容'); return; }
      s.status = 'done';
      /* 出场配置通过 → 自动把新增人物写入硬事实表 */
      if (k === 'setting') {
        const added = LEngine.parseNewPeople(A.docOf(s)).map(p => ({ name: p.name, gender: p.gender, age: p.age, role: p.role, voice: p.voice }));
        let n = 0;
        added.forEach(p => {
          if (!p.name) return;
          if ((b.facts.people || []).some(x => x.name === p.name)) return;
          b.facts.people.push({
            name: p.name, gender: p.gender, age: p.age, role: p.role,
            voice: p.voice, firstUnit: u.idx + 1, status: ''
          });
          n++;
        });
        if (n) A.toast('已自动写入 ' + n + ' 个新人物');
      }
      if (k === 'relay') {
        UNITUI2.applyRelayNow(b, u, A.docOf(s));
        return;
      }
      const order = LT.UNIT_STEPS;
      const i = order.indexOf(k);
      if (i < order.length - 1) A.setCurUnitStep(order[i + 1]);
      else {
        A.setView('units');
        A.toast('本篇完成');
      }
      Books.save(b); A.render();
    }
  }

  /* ================= 绑定按钮 ================= */
  const genBtn = document.getElementById('btnGen');
  const regenBtn = document.getElementById('btnRegen');
  const reviseBtn = document.getElementById('btnRevise');
  const approveBtn = document.getElementById('btnApprove');

  genBtn.onclick = () => {
    if (A.busy || !cur()) return;
    if (A.view === 'book') { genBook(A.curStep); return; }
    if (A.view === 'unit') {
      const u = A.curUnit();
      if (A.curUnitStep === 'draft') {
        genOnePart(cur(), u, u.steps.draft.partIdx || 0);
      } else if (A.curUnitStep === 'polish') {
        polishUnit(cur(), u);
      } else {
        genUnit(A.curUnitStep);
      }
    }
  };
  /* ↻ 重新生成：有意见就带着意见（不带原稿），没意见就纯重写 */
  regenBtn.onclick = () => {
    if (A.busy || !cur()) return;
    const b = cur();
    if (A.view === 'unit' && A.curUnitStep === 'polish') { polishUnit(b, A.curUnit()); return; }
    if (A.view === 'unit' && A.curUnitStep === 'draft') {
      const u = A.curUnit();
      const d = u.steps.draft;
      const idx = d.partIdx || 0;
      if ((d.feedback || '').trim()) { REVISEUI.partReviseFresh(b, u, idx); return; }
      genOnePart(b, u, idx);
      return;
    }
    const c = (A.view === 'unit') ? A.curUnit().steps[A.curUnitStep] : b.steps[A.curStep];
    if ((c.feedback || '').trim()) REVISEUI.reviseFresh();
    else REVISEUI.regen();
  };
  /* ✎ 按意见改原稿：带原稿 + 意见，只改提到的地方 */
  reviseBtn.onclick = () => {
    if (A.busy || !cur()) return;
    const b = cur();
    if (A.view === 'unit' && A.curUnitStep === 'draft') {
      const u = A.curUnit();
      REVISEUI.partReviseKeep(b, u, u.steps.draft.partIdx || 0);
      return;
    }
    if (A.view === 'unit' && A.curUnitStep === 'polish') { polishUnit(b, A.curUnit()); return; }
    REVISEUI.reviseKeep();
  };
  approveBtn.onclick = () => { if (!A.busy) approve(); };

  /* 导出 */
  document.getElementById('btnExport').onclick = () => {
    const b = cur();
    if (!b) return;
    let html = `<h2>导出《${b.title}》<button class="close">×</button></h2>`;
    html += `<div class="hint">已定稿 ${b.units.filter(u => u.steps.polish.status === 'done').length} 篇</div>`;
    html += '<div class="menu-list">';
    html += '<button class="menu-item" data-a="body">正文全文（含未定稿）</button>';
    html += '<button class="menu-item" data-a="final">只导定稿</button>';
    html += '<button class="menu-item" data-a="outline">大纲合集</button>';
    html += '<button class="menu-item" data-a="relay">交棒单合集</button>';
    html += '<button class="menu-item" data-a="json">整本书数据（备份）</button>';
    html += '</div>';
    A.sheet(html, (root) => {
      root.querySelectorAll('.menu-item').forEach(btn => {
        btn.onclick = () => {
          const a = btn.dataset.a;
          let txt = '';
          if (a === 'json') txt = JSON.stringify(b, null, 2);
          else if (a === 'body' || a === 'final') {
            txt = b.units.filter(u => a === 'body' || u.steps.polish.status === 'done').map(u => {
              const body = LEngine.docOf(u.steps.polish) || LEngine.joinDraft(u);
              const ch = u.chapterLabel ? '第' + u.chapterLabel + '章 ' : '';
              return `${ch}${u.title}\n\n${body}`;
            }).join('\n\n\n');
          } else if (a === 'outline') {
            txt = b.units.map(u => `【第${u.idx + 1}篇】${u.title}\n${LEngine.docOf(u.steps.outline)}`).join('\n\n');
          } else if (a === 'relay') {
            txt = b.units.map(u => `【第${u.idx + 1}篇】${u.title}\n${LEngine.docOf(u.steps.relay)}`).join('\n\n');
          }
          if (!txt.trim()) { A.toast('没有内容'); return; }
          BOOKUI.copyText(txt);
          A.closeSheet();
        };
      });
    });
  };

  window.FLOW = { renderDraft, genBook, genUnit, genOnePart, autoWrite, polishUnit, approve };
})();
