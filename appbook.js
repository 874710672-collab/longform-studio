/* appbook.js — 全书层：总纲 / 人物总表 / 主线推进表 + 生成调度 */
(function () {
  const A = window.APP;
  const el = A.el;
  const toast = A.toast;
  const stage = A.stage;

  function cur() { return A.cur; }

  /* ---------- 全书层渲染 ---------- */
  function renderBook() {
    const b = cur();
    const k = A.curStep;
    const s = b.steps[k];

    /* 主线推进表：直接渲染可编辑的卡片视图（文本只作为来源，不再作为主界面） */
    if (k === 'spine') { renderSpineStep(b, s); return; }

    /* 简报 */
    stage.appendChild(briefCard(b));

    /* 总纲环节：显示三级推进卡片（可编辑） */
    if (k === 'book') stage.appendChild(stagesCard(b));

    /* 文档区 */
    const wrap = el('div', 'split');
    const left = el('div');
    const right = el('div');
    wrap.appendChild(left); wrap.appendChild(right);
    stage.appendChild(wrap);

    const card = el('div', 'card');
    const h = el('h3', '', LT.BOOK_STEP_NAME[k]);
    h.appendChild(el('span', 'tag', s.versions.length ? '稿 ' + (s.sel + 1) + '/' + s.versions.length : '未生成'));
    card.appendChild(h);

    if (s.versions.length > 1) card.appendChild(versionTabs(s, () => A.render()));

    const box = el('div', 'card');
    const pre = el('div', 'doc');
    const text = A.docOf(s);
    pre.textContent = text || (A.busy ? '' : placeholder(k));
    box.appendChild(pre);
    if (text && !A.busy) {
      const ops = el('div', 'doc-ops');
      const b1 = el('button', 'mini', '手动编辑');
      b1.onclick = () => toggleEdit(s, pre);
      ops.appendChild(b1);
      const b2 = el('button', 'mini', '复制');
      b2.onclick = () => copyText(text);
      ops.appendChild(b2);
      const b3 = el('button', 'mini fit-btn', '✧ AI 诊断');
      b3.onclick = () => doBookFit(k);
      ops.appendChild(b3);
      box.appendChild(ops);
      box.appendChild(el('div', 'words', '共 ' + LEngine.cw(text) + ' 字'));
    }
    left.appendChild(card);
    left.appendChild(box);

    /* 右侧：审核意见 + 解析结果 */
    right.appendChild(feedbackCard(s, k));

    if (k === 'cast' && text) right.appendChild(castPreview(b, text));
    if (k === 'spine' && text) right.appendChild(spinePreview(b, text));
    if (k === 'book' && text) right.appendChild(planPreview(b));

    A.app.streamEl = pre;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- 三级推进卡片（总纲环节） ---------- */
  function stagesCard(b) {
    const c = el('div', 'card');
    const h = el('h3', '', '三级推进');
    const text = LEngine.docOf(b.steps.book);
    /* 首次进入自动解析并存档 */
    if ((!b.stages || !b.stages.length) && text) {
      const parsed = LEngine.parseStages(text);
      if (parsed.length) { b.stages = parsed; A.persist(); }
    }
    const stages = (b.stages && b.stages.length) ? b.stages : [];
    h.appendChild(el('span', 'tag', stages.length ? stages.length + ' 级' : '未解析'));
    c.appendChild(h);

    if (!stages.length) {
      c.appendChild(el('div', 'hint', text
        ? '总纲里没有解析出【三级推进】。检查格式，或点下面的「重新解析」。'
        : '先生成全书总纲，这里会出现三级推进。'));
      if (text) {
        const btn = el('button', 'ghost-btn wide', '重新解析三级推进');
        btn.onclick = () => {
          b.stages = LEngine.parseStages(LEngine.docOf(b.steps.book));
          A.persist(); A.render();
          A.toast(b.stages.length ? '解析出 ' + b.stages.length + ' 级' : '还是没解析出来，检查【三级推进】格式');
        };
        c.appendChild(btn);
      }
      return c;
    }

    const list = el('div', 'stage-list');
    stages.forEach(st => {
      const row = el('div', 'stage-row');
      const head = el('div', 'st-head');
      head.appendChild(el('span', 'st-n', '第' + st.num + '级'));
      head.appendChild(el('b', 'st-name', st.name));
      if (st.fromVol && st.toVol) head.appendChild(el('span', 'st-range', '第' + st.fromVol + '-' + st.toVol + '卷'));
      row.appendChild(head);
      if (st.goal) {
        const g = el('div', 'st-line');
        g.appendChild(el('span', 'st-k', '目标'));
        g.appendChild(el('span', 'st-v', st.goal));
        row.appendChild(g);
      }
      if (st.conflict) {
        const g = el('div', 'st-line');
        g.appendChild(el('span', 'st-k', '矛盾'));
        g.appendChild(el('span', 'st-v', st.conflict));
        row.appendChild(g);
      }
      const ops = el('div', 'fi-ops');
      const ed = el('button', 'mini', '编辑');
      ed.onclick = () => editStage(b, st);
      ops.appendChild(ed);
      row.appendChild(ops);
      list.appendChild(row);
    });
    c.appendChild(list);
    return c;
  }

  /* 编辑一个级 */
  function editStage(b, st) {
    const plan = LEngine.sizePlan(b);
    let html = `<h2>编辑第 ${st.num} 级<button class="close">×</button></h2>`;
    html += `<div class="hint">三级固定不变，这里只能改内容。卷号范围要和总卷数（${plan.phases} 卷）对得上。</div>`;
    html += `<div class="field"><label>级名</label><input id="stName" value="${esc(st.name || '')}"></div>`;
    html += `<div class="field"><label>本级目标</label><textarea id="stGoal" rows="2">${esc(st.goal || '')}</textarea></div>`;
    html += `<div class="field"><label>本级主要矛盾</label><textarea id="stConflict" rows="2">${esc(st.conflict || '')}</textarea></div>`;
    html += `<div class="grid2">
      <div class="field"><label>起始卷</label><input type="number" id="stFrom" min="1" max="${plan.phases}" value="${st.fromVol || 1}"></div>
      <div class="field"><label>结束卷</label><input type="number" id="stTo" min="1" max="${plan.phases}" value="${st.toVol || plan.phases}"></div>
    </div>`;
    html += `<div class="sheet-acts"><button class="primary-btn" id="saveSt">保存</button></div>`;

    A.sheet(html, (root) => {
      root.querySelector('#saveSt').onclick = () => {
        st.name = root.querySelector('#stName').value.trim() || st.name;
        st.goal = root.querySelector('#stGoal').value.trim();
        st.conflict = root.querySelector('#stConflict').value.trim();
        st.fromVol = parseInt(root.querySelector('#stFrom').value, 10) || 1;
        st.toVol = parseInt(root.querySelector('#stTo').value, 10) || plan.phases;
        b.stages = LEngine.parseStages(LEngine.docOf(b.steps.book));
        /* 用编辑后的覆盖回到 b.stages */
        const i = b.stages.findIndex(x => x.num === st.num);
        if (i >= 0) b.stages[i] = st; else b.stages.push(st);
        Books.pushHistory(b, '编辑三级推进', '第' + st.num + '级 ' + st.name);
        A.persist(); A.closeSheet(); A.render();
        A.toast('已保存');
      };
    });
  }

  function renderSpineStep(b, s) {
    /* 简报 */
    stage.appendChild(briefCard(b));

    /* 分卷生成面板 */
    stage.appendChild(volumePanel(b));

    /* 稿件切换条：每稿有独立的格子与单元 */
    stage.appendChild(draftTabs(b, s));

    /* 有 AI 原文时，提供一个折叠的"查看原文" */
    const text = A.docOf(s);
    if (text) {
      const srcCard = el('div', 'card');
      const sh = el('div', 'brief-head');
      const hw = el('div', 'brief-title');
      hw.appendChild(el('h3', '', 'AI 生成的原文'));
      hw.appendChild(el('span', 'sub', LEngine.cw(text) + ' 字 · 稿 ' + (s.sel + 1) + '/' + (s.versions.length || 1)));
      sh.appendChild(hw);
      const tog = el('button', 'mini', '展开');
      sh.appendChild(tog);
      srcCard.appendChild(sh);

      const body = el('div');
      body.style.display = 'none';
      const pre = el('div', 'doc');
      pre.textContent = text;
      pre.style.maxHeight = '260px';
      pre.style.overflow = 'auto';
      body.appendChild(pre);

      const ops = el('div', 'doc-ops');
      const syncBtn = el('button', 'mini on', '⇩ 用这份原文重建格子');
      syncBtn.onclick = () => {
        if (!confirm('会用上面的原文重新解析成格子。\n标题相同的格子会保留原 ID（单元不失联），其余按位置对应。\n\n继续？')) return;
        const parsed = LEngine.parseSpine(text);
        if (!parsed.length) { toast('没解析出格子'); return; }
        b.spine = GRID.diffWithText(b, parsed);
        const rep = LEngine.syncUnitsWithSpine(b);
        Books.pushHistory(b, '按原文重建格子', `新增 ${rep.added} · 更新 ${rep.updated} · 孤立 ${rep.orphaned}`);
        A.persist(); A.render();
        toast(`已重建：新增 ${rep.added} · 更新 ${rep.updated}`);
      };
      ops.appendChild(syncBtn);
      const cp = el('button', 'mini', '复制');
      cp.onclick = () => BOOKUI.copyText(text);
      ops.appendChild(cp);
      body.appendChild(ops);

      tog.onclick = () => {
        const open = body.style.display === 'none';
        body.style.display = open ? '' : 'none';
        tog.textContent = open ? '收起' : '展开';
      };
      srcCard.appendChild(body);
      stage.appendChild(srcCard);
    }

    /* 卡片视图（复用 GRIDUI） */
    GRIDUI.renderGridBody(b);

    /* 审核意见：卡片视图里也要能写，否则「按意见改」用不了 */
    stage.appendChild(BOOKUI.feedbackCard(s, 'spine'));

    /* 自动定位 + 浮动定位按钮 */
    spineAutoScroll(b);
    /* 注意：按钮必须挂到 body —— stage 是 overflow:auto 的滚动容器，
       fixed 元素挂在里面会跟着内容一起滚动，看上去就像"没有按钮" */
    const fab = spineGotoFab(b);
    if (fab && fab.nodeType === 1) document.body.appendChild(fab);
  }

  /* ---------- 推进表定位 ---------- */

  /* 当前该关注哪一格：优先有内容的最后一格之后，退而求第一格没内容的 */
  function spineTargetStep(b) {
    const cells = b.spine || [];
    if (!cells.length) return -1;

    let lastDone = -1, firstOpen = -1;
    cells.forEach(c => {
      const u = GRID.unitOfCell(b, c);
      const done = u && LEngine.unitHasContent(u);
      if (done) lastDone = c.step;
      else if (firstOpen < 0) firstOpen = c.step;
    });

    if (firstOpen < 0) return lastDone;              /* 全写完了 */
    return firstOpen;                                 /* 第一格还没写的 */
  }

  /* 当前所在卷（用于文案） */
  function spineVolOf(b, step) {
    return (b.volumes || []).find(v => step >= v.fromStep && step <= v.toStep) || null;
  }

  /* 把某个元素滚到容器垂直居中的目标位置 */
  function centerScrollTop(st, node) {
    const nr = node.getBoundingClientRect();
    const sr = st.getBoundingClientRect();
    const delta = (nr.top + nr.height / 2) - (sr.top + st.clientHeight / 2);
    return Math.max(0, st.scrollTop + delta);
  }

  function spineAutoScroll(b) {
    /* 用「进入推进表的次数」判断：每次从外部切入才自动定位，
       页面内部重绘（改格子保存等）不重置滚动位置 */
    if (window.__spineAutoUsed === true) return;
    window.__spineAutoUsed = true;

    const target = spineTargetStep(b);
    if (target < 0) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const st = document.getElementById('stage');
        if (!st) return;
        const card = st.querySelector('.grid-card[data-step="' + target + '"]');
        if (!card) return;
        st.scrollTop = centerScrollTop(st, card);
      });
    });
  }

  function spineGotoFab(b) {
    const target = spineTargetStep(b);
    /* 没有任何格子时不显示（此时页面本来也没有可定位的东西） */
    if (target < 0) return document.createDocumentFragment();

    const vol = spineVolOf(b, target);
    const cell = (b.spine || []).find(c => c.step === target);
    const u = cell ? GRID.unitOfCell(b, cell) : null;
    const done = u && LEngine.unitHasContent(u);

    const wrap = el('div', 'fab-goto');
    wrap.dataset.spineGoto = '1';
    const label = el('span', 'fg-label');
    let txt = '第 ' + target + ' 格';
    if (vol) txt = '卷' + vol.vol + ' · ' + txt;
    if (cell && cell.title) txt += '　' + String(cell.title).slice(0, 10);
    label.textContent = txt;

    const btn = el('button', 'fg-btn');
    btn.appendChild(el('span', 'fg-ico', '⌖'));
    btn.appendChild(el('span', '', '定位'));
    wrap.appendChild(label);
    wrap.appendChild(btn);

    const doScroll = () => {
      const st = document.getElementById('stage');
      if (!st) return;
      const card = st.querySelector('.grid-card[data-step="' + target + '"]');
      if (!card) return;
      st.scrollTo({ top: centerScrollTop(st, card), behavior: 'smooth' });
    };
    btn.onclick = doScroll;

    /* 目标在视野内 → 按钮滑到底部隐藏；滚远了 → 重新出现 */
    const st = document.getElementById('stage');
    const checkVisible = () => {
      const card = st && st.querySelector('.grid-card[data-step="' + target + '"]');
      if (!card) return;
      const r = card.getBoundingClientRect();
      const sr = st.getBoundingClientRect();
      const visible = r.bottom > sr.top + 40 && r.top < sr.bottom - 40;
      wrap.classList.toggle('hide', visible);
    };
    if (st) {
      st.addEventListener('scroll', checkVisible, { passive: true });
      setTimeout(checkVisible, 150);
    }
    return wrap;
  }

  /* 卷结构面板（推进表上方） */
  function volumePanel(b) {
    const c = el('div', 'card');
    const plan = LEngine.volumePlan(b);
    const h = el('h3', '', '卷结构');
    h.appendChild(el('span', 'tag', plan.volumes.length ? plan.volumes.length + ' 卷' : '未生成'));
    c.appendChild(h);

    /* 没解析出级 */
    if (!plan.parsed) {
      c.appendChild(el('div', 'hint',
        '总纲里没有【三级推进】，先回「全书总纲」生成（或在此页点重新解析）。'));
      return c;
    }

    /* 有级但没卷 */
    if (!plan.hasVolumes) {
      const st = plan.stages.map(x => `第${x.num}级「${x.name}」：第${x.fromVol}-${x.toVol}卷`).join('\n');
      c.appendChild(el('div', 'hint', '三级推进已就绪：\n' + st + '\n\n下一步：生成全部卷。'));
      const btn = el('button', 'primary-btn wide', '生成全部卷（' + plan.phases + ' 卷）');
      btn.onclick = () => doGenVolumes(b);
      c.appendChild(btn);
      return c;
    }

    /* 有卷：按级分组显示 */
    plan.stages.forEach(st => {
      const vols = plan.volumes.filter(v => v.stageNum === st.num);
      if (!vols.length) return;

      const grp = el('div', 'vol-group');
      const gh = el('div', 'vg-head');
      gh.appendChild(el('span', 'vg-n', '第' + st.num + '级'));
      gh.appendChild(el('b', '', st.name));
      gh.appendChild(el('span', 'vg-sub', vols.length + ' 卷'));
      grp.appendChild(gh);

      vols.forEach(v => {
        let have = 0;
        for (let i = v.fromStep; i <= v.toStep; i++) {
          if ((b.spine || []).some(x => x.step === i)) have++;
        }
        const total = v.toStep - v.fromStep + 1;
        const full = have >= total;

        const row = el('div', 'vol-row' + (full ? ' done' : ''));
        const info = el('div', 'vol-info');
        const t = el('div', 'vol-title');
        t.appendChild(el('b', '', '卷' + v.vol + '　' + v.name));
        if (full) t.appendChild(el('span', 'vol-badge ok', '已完成'));
        else if (have > 0) t.appendChild(el('span', 'vol-badge part', have + '/' + total));
        info.appendChild(t);
        const sub = el('div', 'vol-sub');
        sub.textContent = '第' + v.fromStep + '-' + v.toStep + '格 · ' + (v.goal || '（无目标）');
        info.appendChild(sub);

        /* 卷内三阶段 */
        const phs = (v.phases && v.phases.length) ? v.phases : LEngine.autoPhases(v);
        if (phs && phs.length) {
          const phBox = el('div', 'vol-phases');
          phs.forEach(ph => {
            const card = el('div', 'vol-phase-card');
            const head = el('div', 'vpc-head');
            head.appendChild(el('span', 'vpc-no', '阶段' + ph.no));
            head.appendChild(el('span', 'vpc-name', ph.name || ''));
            head.appendChild(el('span', 'vpc-range', ph.fromStep + '-' + ph.toStep + '格'));
            card.appendChild(head);
            if (ph.goal) {
              const l = el('div', 'vpc-line');
              l.appendChild(el('span', 'vpc-tag', '目标'));
              l.appendChild(el('span', 'vpc-txt', ph.goal));
              card.appendChild(l);
            }
            if (ph.block) {
              const l = el('div', 'vpc-line');
              l.appendChild(el('span', 'vpc-tag', '阻力'));
              l.appendChild(el('span', 'vpc-txt', ph.block));
              card.appendChild(l);
            }
            if (ph.note) {
              const l = el('div', 'vpc-line');
              l.appendChild(el('span', 'vpc-tag', '说明'));
              l.appendChild(el('span', 'vpc-txt', ph.note));
              card.appendChild(l);
            }
            phBox.appendChild(card);
          });
          info.appendChild(phBox);
        }
        row.appendChild(info);

        /* 左侧：重做本卷结构（卷名/范围/目标/矛盾/三阶段），不碰格子 */
        const opsL = el('div', 'vol-ops-l');
        const reVol = el('button', 'mini vol-rebuild', '⟲ 重做卷');
        reVol.title = '只重新生成这一卷的卷结构，不动格子和单元';
        reVol.onclick = () => genOneVolumeUI(b, v);
        opsL.appendChild(reVol);
        row.appendChild(opsL);

        const ops = el('div', 'vol-ops');
        const ed = el('button', 'mini', '编辑');
        ed.onclick = () => editVolume(b, v);
        const gen = el('button', 'mini' + (full ? '' : ' on'), full ? '重新生成' : '生成这一卷');
        gen.onclick = () => genVolume(b, v, full);
        ops.appendChild(ed); ops.appendChild(gen);
        row.appendChild(ops);
        grp.appendChild(row);
      });
      c.appendChild(grp);
    });

    /* 底部操作 */
    const acts = el('div', 'list-acts');
    const regen = el('button', 'mini', '重新生成全部卷');
    regen.onclick = () => doGenVolumes(b, true);
    const whole = el('button', 'mini', '全文一次生成格子');
    whole.onclick = () => genWhole(b);
    acts.appendChild(regen); acts.appendChild(whole);
    c.appendChild(acts);

    return c;
  }

  /* 生成全部卷 */
  async function doGenVolumes(b, isRedo) {
    if (A.busy) return;
    if (isRedo) {
      const edited = (b.volumes || []).filter(v => v.phasesEdited).map(v => '卷' + v.vol).join('、');
      const fb = (b.steps.spine.feedback || '').trim();
      let msg = '重新生成全部卷？\n\n'
        + '· 卷名、任务目标、本卷矛盾会被覆盖\n'
        + '· 格子本身不受影响（但卷和格的对应会重排）\n';
      if (edited) msg += '· 你手动改过的三阶段会保留：' + edited + '\n';
      else msg += '· 三阶段会按新生成的内容替换\n';
      msg += fb ? '\n✅ 本次会带上审核意见：\n' + fb.slice(0, 120) : '\n（当前没有审核意见）';
      msg += '\n\n继续？';
      if (!confirm(msg)) return;
    }
    const ctrl = new AbortController();
    A.setBusy({ ctrl, label: '正在生成卷结构', text: '' });
    A.render();
    A.setStream('');
    try {
      const out = await LEngine.genVolumes(b, (d, full) => {
        A.setBusy(Object.assign({}, A.busy, { text: full }));
        A.setStream(full); A.updateDock();
      }, ctrl.signal);
      if (!out || !String(out).trim()) throw new Error('返回为空');
      const stages = (b.stages && b.stages.length) ? b.stages : LEngine.parseStages(LEngine.docOf(b.steps.book));
      const vols = LEngine.parseVolumes(out, stages);
      if (!vols.length) throw new Error('没有解析出卷，检查返回格式');

      /* 保留用户手改过的阶段：旧卷的阶段若被手动改过，优先沿用 */
      const oldVols = b.volumes || [];
      vols.forEach(nv => {
        const ov = oldVols.find(x => x.vol === nv.vol);
        if (ov && ov.phases && ov.phases.length && ov.phasesEdited) {
          nv.phases = LEngine.normalizePhases(nv.fromStep, nv.toStep,
            ov.phases.map(p => Object.assign({}, p)));
          nv.phasesEdited = true;
        }
      });

      b.volumes = vols;
      Books.pushHistory(b, '生成卷结构', vols.length + ' 卷');
      A.persist();
      A.setBusy(null); A.render();
      A.toast('已生成 ' + vols.length + ' 卷');
    } catch (e) {
      A.setBusy(null); A.endStream(); A.render();
      if (e.name !== 'AbortError') alert('生成失败：' + e.message);
    }
  }

  /* 编辑一卷 */
  function editVolume(b, v) {
    let html = `<h2>编辑卷${v.vol}<button class="close">×</button></h2>`;
    html += `<div class="hint">改格范围后，后面各卷会自动顺延。</div>`;
    html += `<div class="field"><label>卷名</label><input id="vName" value="${esc(v.name || '')}"></div>`;
    html += `<div class="grid2">
      <div class="field"><label>起始格</label><input type="number" id="vFrom" min="1" value="${v.fromStep}"></div>
      <div class="field"><label>结束格</label><input type="number" id="vTo" min="1" value="${v.toStep}"></div>
    </div>`;
    html += `<div class="field"><label>本卷目标</label><textarea id="vGoal" rows="2">${esc(v.goal || '')}</textarea></div>`;
    html += `<div class="field"><label>本卷矛盾</label><textarea id="vConflict" rows="2">${esc(v.conflict || '')}</textarea></div>`;

    const phs0 = (v.phases && v.phases.length) ? v.phases : LEngine.autoPhases(v);
    html += `<div class="field"><label>本卷三阶段（生成格子时按此分段推进）</label>`;
    html += `<div class="hint">格号必须首尾相接、覆盖本卷 ${v.fromStep}-${v.toStep}，保存时会自动规整。</div>`;
    phs0.forEach((ph, i) => {
      html += `<div class="ph-edit">
        <div class="ph-row">
          <span class="ph-no">阶段${i + 1}</span>
          <input type="number" class="ph-from" min="1" value="${ph.fromStep}" style="width:64px">
          <span>─</span>
          <input type="number" class="ph-to" min="1" value="${ph.toStep}" style="width:64px">
          <input class="ph-name" value="${esc(ph.name || '')}" placeholder="阶段名" style="flex:1">
        </div>
        <div class="ph-row2"><span class="ph-tag">目标</span><input class="ph-goal" value="${esc(ph.goal || '')}" placeholder="这一阶段结束时主角达成什么 / 跌到哪"></div>
        <div class="ph-row2"><span class="ph-tag">阻力</span><input class="ph-block" value="${esc(ph.block || '')}" placeholder="这几格具体卡住主角的人或事"></div>
        <div class="ph-row2"><span class="ph-tag">说明</span><input class="ph-note" value="${esc(ph.note || '')}" placeholder="场面背景（可留空）"></div>
      </div>`;
    });
    html += `</div>`;
    html += `<div class="sheet-acts"><button class="ghost-btn" id="phAuto">按本卷格数重分</button><button class="primary-btn" id="saveV">保存</button></div>`;

    A.sheet(html, (root) => {
      root.querySelector('#phAuto').onclick = () => {
        const nf = parseInt(root.querySelector('#vFrom').value, 10) || v.fromStep;
        const nt = parseInt(root.querySelector('#vTo').value, 10) || v.toStep;
        const tmp = LEngine.autoPhases({ fromStep: Math.min(nf, nt), toStep: Math.max(nf, nt) });
        const els = root.querySelectorAll('.ph-edit');
        els.forEach((pe, i) => {
          const a = tmp[i];
          pe.querySelector('.ph-from').value = a ? a.fromStep : '';
          pe.querySelector('.ph-to').value = a ? a.toStep : '';
          /* 用户已改过阶段名就保留，只重分格号 */
          const curName = pe.querySelector('.ph-name').value.trim();
          const isDefault = !curName || /^阶段\d+$/.test(curName) || ['被逼入局', '暗中蓄力', '正面摊牌', '收束余波'].indexOf(curName) >= 0;
          if (isDefault && a) pe.querySelector('.ph-name').value = a.name;
        });
      };
      root.querySelector('#saveV').onclick = () => {
        const nf = parseInt(root.querySelector('#vFrom').value, 10) || v.fromStep;
        const nt = parseInt(root.querySelector('#vTo').value, 10) || v.toStep;
        const diff = (nt - nf) - (v.toStep - v.fromStep);

        /* 先算出范围是否变了（必须在赋值前比较） */
        const newFrom = Math.min(nf, nt), newTo = Math.max(nf, nt);
        const rangeChanged = (newFrom !== v.fromStep || newTo !== v.toStep);

        v.name = root.querySelector('#vName').value.trim() || v.name;
        v.goal = root.querySelector('#vGoal').value.trim();
        v.conflict = root.querySelector('#vConflict').value.trim();

        /* 收集阶段（用户刚输入的新值） */
        const phEls = root.querySelectorAll('.ph-edit');
        const newPhs = [];
        phEls.forEach((pe, i) => {
          const fv = parseInt(pe.querySelector('.ph-from').value, 10);
          const tv = parseInt(pe.querySelector('.ph-to').value, 10);
          newPhs.push({
            no: i + 1,
            fromStep: Number.isFinite(fv) ? fv : 0,
            toStep: Number.isFinite(tv) ? tv : 0,
            name: pe.querySelector('.ph-name').value.trim() || ('阶段' + (i + 1)),
            goal: (pe.querySelector('.ph-goal') || {}).value ? pe.querySelector('.ph-goal').value.trim() : '',
            block: (pe.querySelector('.ph-block') || {}).value ? pe.querySelector('.ph-block').value.trim() : '',
            note: pe.querySelector('.ph-note').value.trim()
          });
        });

        v.fromStep = newFrom;
        v.toStep = newTo;

        v.phases = newPhs.length
          ? LEngine.normalizePhases(newFrom, newTo, newPhs)
          : LEngine.autoPhases(v);
        v.phasesEdited = true;   /* 标记：手改过，重新生成卷结构时保留 */

        /* 后续卷自动顺延 */
        if (diff !== 0) {
          const after = b.volumes.filter(x => x.vol > v.vol).sort((a, c) => a.vol - c.vol);
          after.forEach(x => { x.fromStep += diff; x.toStep += diff; });
        }
        Books.pushHistory(b, '编辑卷', '卷' + v.vol + ' 第' + v.fromStep + '-' + v.toStep + '格');
        A.persist(); A.closeSheet(); A.render();
        A.toast(diff !== 0 ? '已保存，后续卷已顺延 ' + diff + ' 格' : '已保存');
      };
    });
  }

  /* 只重做某一卷的卷结构（不动格子、不动单元） */
  async function genOneVolumeUI(b, v) {
    if (A.busy) return;
    const fb = (b.steps.spine.feedback || '').trim();
    let msg = '重新生成「卷' + v.vol + '　' + v.name + '」的卷结构？\n\n'
      + '· 会重做：卷名、格范围、本卷目标、本卷矛盾、三阶段\n'
      + '· 不会动：格子内容、单元内容\n'
      + '· 其他卷的内容不受影响（只是格号可能顺延）\n';
    msg += fb ? '\n本次会带上审核意见：\n' + fb.slice(0, 100) : '\n（当前没有审核意见）';
    msg += '\n\n继续？';
    if (!confirm(msg)) return;

    const ctrl = new AbortController();
    A.setBusy({ ctrl, label: '正在重做卷' + v.vol + '的结构', text: '' });
    A.render();
    A.setStream('');
    try {
      const out = await LEngine.genOneVolume(b, v, (d, full) => {
        A.setBusy(Object.assign({}, A.busy, { text: full }));
        A.setStream(full); A.updateDock();
      }, ctrl.signal);
      if (!out || !String(out).trim()) throw new Error('返回为空');

      const stages = (b.stages && b.stages.length) ? b.stages : LEngine.parseStages(LEngine.docOf(b.steps.book));
      const vols = LEngine.parseVolumes(out, stages);
      if (!vols.length) throw new Error('没有解析出卷，检查返回格式');

      /* 只取这一卷；若模型多输出了别的卷，一律忽略 */
      let nv = vols.find(x => x.vol === v.vol) || vols[0];
      nv.id = v.id;
      nv.vol = v.vol;
      nv.stageNum = v.stageNum || nv.stageNum;
      nv.stageId = v.stageId || nv.stageId;

      /* 起止格：左边界不许侵入上一卷（那会改到别人）；
         右边界可以变长，代价是后面的卷整体顺延 */
      const sorted = (b.volumes || []).slice().sort((a, c) => a.vol - c.vol);
      const idx = sorted.findIndex(x => x.vol === v.vol);
      const prevV = idx > 0 ? sorted[idx - 1] : null;
      const lo = prevV ? prevV.toStep + 1 : 1;

      let nf = Math.max(lo, nv.fromStep);
      let nt = Math.max(nf, nv.toStep);
      if (nf !== nv.fromStep) {
        A.toast('起点已抬到第 ' + nf + ' 格（不能侵入上一卷）');
      }
      nv.fromStep = nf;
      nv.toStep = nt;
      nv.phases = LEngine.normalizePhases(nf, nt, nv.phases || []);
      nv.phasesEdited = false;

      /* 计算后续卷的顺延量 */
      const diff = (nt - nf) - (v.toStep - v.fromStep);

      /* 只替换这一卷，其他卷对象原样保留 */
      const realIdx = b.volumes.findIndex(x => x.vol === v.vol);
      b.volumes[realIdx] = nv;

      /* 后续各卷整体平移（内容不变，只改格号） */
      if (diff !== 0) {
        b.volumes.filter(x => x.vol > v.vol).sort((a, c) => a.vol - c.vol).forEach(x => {
          x.fromStep += diff;
          x.toStep += diff;
          (x.phases || []).forEach(ph => { ph.fromStep += diff; ph.toStep += diff; });
        });
      }

      Books.pushHistory(b, '重做卷结构', '卷' + v.vol + '：' + nf + '-' + nt + '格' + (diff ? '，后续卷顺延 ' + diff + ' 格' : ''));
      A.persist();
      A.setBusy(null); A.render();
      A.toast('卷' + v.vol + '已重做' + (diff ? '，后续卷顺延 ' + diff + ' 格' : ''));
    } catch (e) {
      A.setBusy(null); A.endStream(); A.render();
      if (e.name !== 'AbortError') alert('生成失败：' + e.message);
    }
  }

  /* 生成一卷 */
  async function genVolume(b, v, isRedo) {
    if (A.busy) return;
    if (isRedo && !confirm('「卷' + v.vol + '　' + v.name + '」已经生成过。\n\n重新生成会覆盖这一卷的格子内容（已有的单元保留，只更新格子文本）。\n\n继续？')) return;

    const ctrl = new AbortController();
    A.setBusy({ ctrl, label: '正在生成卷' + v.vol + '（' + (v.toStep - v.fromStep + 1) + '格）', text: '' });
    A.render();
    A.setStream('');
    try {
      const out = await LEngine.genSpineRange(b, v.fromStep, v.toStep, (d, full) => {
        A.setBusy(Object.assign({}, A.busy, { text: full }));
        A.setStream(full); A.updateDock();
      }, ctrl.signal);
      if (!out || !String(out).trim()) throw new Error('返回为空，可能被截断了');

      const cells = LEngine.parseSpine(out);
      if (!cells.length) throw new Error('没有解析出格子，检查返回格式');
      const inRange = cells.filter(c => c.step >= v.fromStep && c.step <= v.toStep);
      if (!inRange.length) throw new Error('生成的格号不在 ' + v.fromStep + '-' + v.toStep + ' 范围内');

      /* 防「重写开头」检查 */
      const warn = LEngine.detectRestart(b, inRange, v.fromStep);
      if (warn) {
        const lines = warn.slice(0, 5).map(h => '· 第' + h.step + '格「' + h.title + '」：' + h.why).join('\n');
        const go = confirm('⚠ 检测到这一卷可能又从头写了一遍：\n\n' + lines
          + '\n\n原因通常是模型把第 ' + v.fromStep + ' 格当成了故事开头。\n\n'
          + '【取消】= 丢弃这次结果，稍后重新生成\n【确定】= 仍然保存');
        if (!go) {
          A.setBusy(null); A.endStream(); A.render();
          A.toast('已丢弃本次生成结果');
          return;
        }
      }

      const rep = LEngine.mergeCells(b, inRange);
      const sync = LEngine.syncUnitsWithSpine(b);
      Books.pushHistory(b, '分卷生成', '卷' + v.vol + '：新增 ' + rep.added + ' · 更新 ' + rep.updated);
      A.persist();
      A.setBusy(null); A.render();
      A.toast('卷' + v.vol + '完成：' + rep.added + ' 新格，' + rep.updated + ' 更新' + (sync.added ? '，新建 ' + sync.added + ' 单元' : ''));
    } catch (e) {
      A.setBusy(null); A.endStream(); A.render();
      if (e.name !== 'AbortError') alert('生成失败：' + e.message);
    }
  }

  /* 全文一次生成 */
  async function genWhole(b) {
    if (A.busy) return;
    const plan = LEngine.volumePlan(b);
    if (plan.mainUnits > 60) {
      if (!confirm('本书约 ' + plan.mainUnits + ' 格，一次生成很可能被截断。\n\n建议改用分卷生成。确定还要一次生成吗？')) return;
    }
    const ctrl = new AbortController();
    A.setBusy({ ctrl, label: '正在生成完整推进表', text: '' });
    A.render();
    A.setStream('');
    try {
      const out = await LEngine.genBookStep(b, 'spine', (d, full) => {
        A.setBusy(Object.assign({}, A.busy, { text: full }));
        A.setStream(full); A.updateDock();
      }, ctrl.signal);
      if (!out || !String(out).trim()) throw new Error('返回为空');
      const cells = LEngine.parseSpine(out);
      if (!cells.length) throw new Error('没有解析出格子');
      const rep = LEngine.mergeCells(b, cells);
      LEngine.syncUnitsWithSpine(b);
      b.steps.spine.versions.push({ text: String(out).trim(), at: Date.now() });
      b.steps.spine.sel = b.steps.spine.versions.length - 1;
      b.steps.spine.status = 'ready';
      Books.pushHistory(b, '全文生成推进表', '新增 ' + rep.added + ' · 更新 ' + rep.updated);
      A.persist();
      A.setBusy(null); A.render();
      A.toast('完成：' + cells.length + ' 格');
    } catch (e) {
      A.setBusy(null); A.endStream(); A.render();
      if (e.name !== 'AbortError') alert('生成失败：' + e.message);
    }
  }

  /* 稿件切换条 */
  function draftTabs(b, s) {
    const c = el('div', 'card');
    const h = el('h3', '', '推进表稿件');
    h.appendChild(el('span', 'tag', (s.versions.length || 0) + ' 稿 · 每稿独立单元'));
    c.appendChild(h);
    c.appendChild(el('div', 'hint',
      '每一稿有自己的格子列表和单元列表，互不影响。切换稿件会同时切换下面的格子与单元。'));

    if (!s.versions.length) {
      c.appendChild(el('div', 'empty-tip', '还没有稿件，先点「生成」。'));
      return c;
    }

    const active = DRAFTS.currentDraftId(b);
    const tabs = el('div', 'draft-tabs');
    s.versions.forEach((v, i) => {
      const st = DRAFTS.statsOf(b, v.draftId);
      const isCur = v.draftId === active;
      const t = el('button', 'draft-tab' + (isCur ? ' on' : ''));
      const top = el('div', 'dt-top');
      top.appendChild(el('b', '', '稿 ' + (i + 1)));
      if (isCur) top.appendChild(el('span', 'dt-cur', '当前'));
      t.appendChild(top);
      t.appendChild(el('div', 'dt-meta', `${st.cells} 格 · ${st.units} 篇`));
      t.onclick = () => {
        if (isCur) return;
        if (b.units.some(u => LEngine.unitHasContent(u))) {
          if (!confirm(`切到「稿 ${i + 1}」？\n\n当前稿（稿 ${s.sel + 1}）的格子和单元会保存，切回来还在。`)) return;
        }
        DRAFTS.stash(b);
        s.sel = i;
        const id = DRAFTS.currentDraftId(b);
        DRAFTS.load(b, id);
        Books.pushHistory(b, '切换推进稿', `稿 ${i + 1}`);
        A.persist(); A.render();
        toast('已切到稿 ' + (i + 1));
      };

      /* 删除稿件：至少保留一稿，且要二次确认 */
      const del = el('button', 'dt-del', '×');
      del.title = '删除这一稿';
      del.onclick = (e) => {
        e.stopPropagation();
        deleteDraft(b, s, i);
      };
      t.appendChild(del);

      tabs.appendChild(t);
    });
    c.appendChild(tabs);

    /* 新建一稿（当作新版本占位） */
    const acts = el('div', 'list-acts');
    const cp = el('button', 'mini', '⊕ 把当前稿复制成新稿');
    cp.onclick = () => {
      const curText = A.docOf(s) || '';
      s.versions.push({
        text: curText, at: Date.now(), draftId: DRAFTS.newDraftId(),
        copiedFrom: s.sel
      });
      const newIdx = s.versions.length - 1;
      DRAFTS.stash(b);
      s.sel = newIdx;
      const id = DRAFTS.currentDraftId(b);
      /* 复制当前格子与单元到新槽 */
      const src = DRAFTS.slotOf(b, b.activeDraftId, true);
      DRAFTS.stash(b);
      const newSlot = DRAFTS.slotOf(b, id, true);
      newSlot.spine = b.spine.map(x => Object.assign({}, x));
      newSlot.units = [];
      b.activeDraftId = id;
      DRAFTS.load(b, id);
      Books.pushHistory(b, '复制新稿', '稿 ' + (newIdx + 1));
      A.persist(); A.render();
      toast('已复制成稿 ' + (newIdx + 1) + '（格子复制，单元为空）');
    };
    acts.appendChild(cp);
    c.appendChild(acts);
    return c;
  }

  /* 删除某一稿（二次确认） */
  function deleteDraft(b, s, idx) {
    if (s.versions.length <= 1) {
      alert('至少要保留一稿，不能删除最后一稿。');
      return;
    }
    const v = s.versions[idx];
    const st = DRAFTS.statsOf(b, v.draftId);

    /* 判断这一稿有没有写过的内容 */
    let hasWork = false;
    const slot = (b.drafts || {})[v.draftId];
    if (slot && (slot.units || []).length) {
      hasWork = slot.units.some(u => LEngine.unitHasContent(u));
    }
    /* 如果删的是当前稿，看内存里的 */
    if (v.draftId === DRAFTS.currentDraftId(b)) {
      hasWork = (b.units || []).some(u => LEngine.unitHasContent(u));
    }

    /* 第一次确认 */
    const first = hasWork
      ? `稿 ${idx + 1} 里已经有写过内容（${st.units} 篇单元）。\n\n删除后这些正文、大纲、交棒单都会一起消失，无法恢复。\n\n确定要删除吗？`
      : `删除稿 ${idx + 1}？\n\n这一稿有 ${st.cells} 个格子、${st.units} 个单元（都还没写内容）。`;

    if (!confirm(first)) return;

    /* 有内容时二次确认，要求输入字数 */
    if (hasWork) {
      const typed = prompt(
        `最后确认：稿 ${idx + 1} 里有 ${st.units} 篇已写内容的单元。\n\n` +
        '这些内容删除后无法找回。\n' +
        '建议先用「⤓ 备份」导出一份。\n\n' +
        '确认删除请输入「删除」两个字：'
      );
      if (typed !== '删除') { toast('已取消'); return; }
    }

    /* 执行删除 */
    const wasCurrent = v.draftId === DRAFTS.currentDraftId(b);
    DRAFTS.dropDraft(b, v.draftId);
    s.versions.splice(idx, 1);

    if (wasCurrent) {
      /* 切到前一稿（或第一稿） */
      const ni = Math.max(0, Math.min(idx - 1, s.versions.length - 1));
      s.sel = ni;
      const id = DRAFTS.currentDraftId(b);
      DRAFTS.load(b, id);
    } else if (s.sel > idx) {
      s.sel -= 1;
    }

    Books.pushHistory(b, '删除推进稿', `稿 ${idx + 1}`);
    A.persist(); A.render();
    toast('已删除稿 ' + (idx + 1));
  }

  function placeholder(k) {
    if (k === 'book') return '点下面的「生成」，AI 会先写全书总纲：主线、主角弧光、反派动机、世界规则、三级推进、结尾落点。\n\n这一步只定骨架，不写细节。';
    if (k === 'cast') return '人物总表会输出结构化条目，直接进硬事实表。\n\n性别和说话方式是硬约束——后面每一篇都靠它保证人物不走样。';
    return '主线推进表把全书切成若干格，每格对应一个短篇单元。\n\n这一格决定每个单元写多少字、推多远、哪些牌不许提前打。';
  }

  /* ---------- 简报 ---------- */
  function briefCard(b) {
    const c = el('div', 'card');
    const head = el('div', 'brief-head');
    const hw = el('div', 'brief-title');
    hw.appendChild(el('h3', '', '全书简报'));
    const tw = el('input');
    tw.className = 'title-in';
    tw.placeholder = '书名';
    tw.value = b.title === '未命名长篇' ? '' : b.title;
    tw.oninput = () => { b.title = tw.value || '未命名长篇'; A.persist(); A.renderTop(); };
    tw.onblur = () => { if (!tw.value.trim()) tw.value = b.title; };
    hw.appendChild(tw);
    head.appendChild(hw);
    const btn = el('button', 'mini', '收起');
    head.appendChild(btn);
    c.appendChild(head);

    const body = el('div', 'brief-body');
    c.appendChild(body);
    btn.onclick = () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      btn.textContent = open ? '展开' : '收起';
    };

    const bd = b.brief;
    const mk = (key, label, ph, area, rows) => {
      const f = el('div', 'field');
      f.appendChild(el('label', '', label));
      const i = area ? el('textarea') : el('input');
      if (area) i.rows = rows || 2; else i.type = 'text';
      i.placeholder = ph || '';
      i.value = bd[key] || '';
      i.oninput = () => { bd[key] = i.value; A.persist(); };
      f.appendChild(i);
      return f;
    };

    const g = el('div', 'grid3');
    g.appendChild(mk('genre', '题材', '悬疑 / 都市异闻 / 女频…'));
    g.appendChild(mk('tags', '标签', '反转、复仇、家族…'));
    const pf = el('div', 'field');
    pf.appendChild(el('label', '', '人称视角'));
    const ps = el('select');
    ['第三人称', '第一人称', '双视角交替'].forEach(v => {
      const o = el('option', '', v); o.value = v;
      if (v === bd.pov) o.selected = true;
      ps.appendChild(o);
    });
    ps.onchange = () => { bd.pov = ps.value; A.persist(); };
    pf.appendChild(ps);
    g.appendChild(pf);
    body.appendChild(g);

    body.appendChild(mk('idea', '核心想法（越具体越好）', '例：一个替人处理遗物的年轻人，发现父亲也在一个没拆封的纸箱里', true, 3));

    const g2 = el('div', 'grid2');
    g2.appendChild(mk('style', '文风要求', '冷峻、对话多、少景物…', true));
    g2.appendChild(mk('avoid', '不要写的', '不要金手指、不要大团圆…', true));
    body.appendChild(g2);

    /* 目标字数 */
    const tf = el('div', 'field');
    tf.appendChild(el('label', '', '全书目标字数'));
    const tr = el('div', 'tier-row');
    const words = [300000, 350000, 380000, 400000];
    words.forEach(w => {
      const bb = el('button', 'tier-btn' + (b.target === w ? ' on' : ''));
      bb.appendChild(el('b', '', (w / 10000) + '万'));
      bb.appendChild(el('span', '', '约 ' + Math.round(w / 11000) + ' 篇'));
      bb.onclick = () => {
        b.target = w;
        A.persist(); A.render();
        toast('目标改为 ' + (w / 10000) + ' 万字，建议 ' + Math.round(w / 11000) + ' 个单元');
      };
      tr.appendChild(bb);
    });
    tf.appendChild(tr);

    /* 自定义目标字数（单位：万字，10-200） */
    const customRow = el('div', 'custom-word-row');
    const isPreset = words.indexOf(b.target) >= 0;
    const cLab = el('span', 'cw-label', '自定义');
    const cInp = el('input');
    cInp.type = 'number';
    cInp.className = 'cw-input';
    cInp.min = '10';
    cInp.max = '200';
    cInp.step = '1';
    cInp.placeholder = '38';
    cInp.value = isPreset ? '' : (Math.round(b.target / 10000) || '');
    const cUnit = el('span', 'cw-unit', '万字');

    const applyCustom = (silent) => {
      const raw = cInp.value.trim();
      if (!raw) {
        if (!silent) toast('请输入万字数字');
        return;
      }
      const n = Math.round(parseFloat(raw));
      if (!isFinite(n)) { toast('请输入数字'); return; }
      if (n < 10 || n > 200) {
        toast('范围是 10 - 200 万字');
        /* 回填当前实际值，避免输入框显示的和真实目标不一致 */
        cInp.value = String(Math.round(b.target / 10000));
        return;
      }
      b.target = n * 10000;
      A.persist(); A.render();
      toast('目标改为 ' + n + ' 万字，建议 ' + Math.round(b.target / 11000) + ' 个单元');
    };

    cInp.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); cInp.blur(); applyCustom(); }
    };
    /* 失焦时若值合法就应用（不弹太多提示） */
    cInp.onblur = () => {
      const raw = cInp.value.trim();
      if (!raw) {
        cInp.value = isPreset ? '' : String(Math.round(b.target / 10000));
        return;
      }
      const n = Math.round(parseFloat(raw));
      if (!isFinite(n)) {
        cInp.value = String(Math.round(b.target / 10000));
        return;
      }
      if (n < 10 || n > 200) {
        if (n) toast('范围是 10 - 200 万字');
        cInp.value = String(Math.round(b.target / 10000));
        return;
      }
      if (n * 10000 !== b.target) applyCustom(true);
    };

    const cBtn = el('button', 'mini cw-btn', '应用');
    cBtn.onclick = () => applyCustom();

    customRow.appendChild(cLab);
    customRow.appendChild(cInp);
    customRow.appendChild(cUnit);
    customRow.appendChild(cBtn);
    tf.appendChild(customRow);

    /* 当前目标 + 建议篇数 */
    const cHint = el('div', 'cw-hint');
    cHint.textContent = isPreset
      ? ''
      : '当前：' + (b.target / 10000).toFixed(0) + ' 万字 · 约 ' + Math.round(b.target / 11000) + ' 篇';
    if (cHint.textContent) tf.appendChild(cHint);

    body.appendChild(tf);

    const info = el('div', 'hint');
    info.textContent = `规划：${b.units.length} 篇 · 合计 ${(LEngine.totalWords(b) / 10000).toFixed(1)} 万字（目标 ${(b.target / 10000).toFixed(0)} 万）`;
    body.appendChild(info);

    /* 跳转入口 */
    const nav = el('div', 'list-acts');
    const bf = el('button', 'mini', '◉ 事实表');
    bf.onclick = () => { A.setView('facts'); A.render(); };
    const bu = el('button', 'mini', '▤ 单元列表');
    bu.onclick = () => { A.setView('units'); A.render(); };
    const bg = el('button', 'mini', '▦ 编辑推进表');
    bg.onclick = () => { A.setView('grid'); A.render(); };
    nav.appendChild(bf); nav.appendChild(bu); nav.appendChild(bg);
    body.appendChild(nav);
    return c;
  }

  /* 版本切换条：可删除（带确认） */
  function versionTabs(s, onPick, opt) {
    opt = opt || {};
    const vt = el('div', 'vers');
    const label = opt.label || '稿';
    const canDelete = s.versions.length > 1;

    s.versions.forEach((v, i) => {
      const wrap = el('div', 'ver-wrap');

      const t = el('button', 'ver-tab' + (i === s.sel ? ' on' : ''), label + ' ' + (i + 1));
      t.onclick = () => {
        if (i === s.sel) return;
        s.sel = i;
        A.persist();
        onPick();
      };
      wrap.appendChild(t);

      if (canDelete) {
        const x = el('button', 'ver-del', '×');
        x.title = '删除' + label + ' ' + (i + 1);
        x.onclick = (ev) => {
          ev.stopPropagation();
          deleteVersion(s, i, onPick, label);
        };
        wrap.appendChild(x);
      }

      vt.appendChild(wrap);
    });
    return vt;
  }

  /* 删除某一版（二次确认） */
  function deleteVersion(s, idx, onPick, label) {
    label = label || '稿';
    if (s.versions.length <= 1) {
      alert('至少要保留一份，不能删最后一稿。');
      return;
    }
    const v = s.versions[idx];
    const words = v && v.text ? LEngine.cw(v.text) : 0;

    const first = '删除「' + label + ' ' + (idx + 1) + '」？\n\n' +
      (words ? '这一份有 ' + words + ' 字内容。删除后无法恢复。' : '这一份还没有内容。');
    if (!confirm(first)) return;

    if (words > 200) {
      const typed = prompt(
        '最后确认：「' + label + ' ' + (idx + 1) + '」有 ' + words + ' 字。\n\n' +
        '删除后无法找回。建议先「导出」备份。\n\n' +
        '确认删除请输入「删除」两个字：'
      );
      if (typed !== '删除') { toast('已取消'); return; }
    }

    const wasCurrent = s.sel === idx;
    s.versions.splice(idx, 1);

    if (wasCurrent) {
      s.sel = Math.max(0, Math.min(idx, s.versions.length - 1));
    } else if (s.sel > idx) {
      s.sel -= 1;
    }
    if (!s.versions.length) { s.status = 'idle'; s.sel = 0; }

    Books.pushHistory(A.cur, '删除稿件', `${label} ${idx + 1}`);
    A.persist();
    onPick();
    toast('已删除' + label + ' ' + (idx + 1));
  }


  /* 审核意见：现在改为悬浮窗，这里是绑定入口（保留同名以避免改动调用点） */
  function feedbackCard(s, key) {
    if (!s) return document.createDocumentFragment();
    const label = LT.BOOK_STEP_NAME[key] || LT.UNIT_STEP_NAME[key] || '审核意见';
    /* 延迟一帧绑定，确保本轮 render 结束后 DOM 已就绪 */
    requestAnimationFrame(() => {
      if (window.FBFLOAT) {
        FBFLOAT.init();
        FBFLOAT.bind(s, label + ' · 审核意见');
      }
    });
    /* 返回空片段：不再往页面里插卡片 */
    return document.createDocumentFragment();
  }


  function toggleEdit(s, pre) {
    const ta = el('textarea');
    ta.className = 'doc-edit';
    ta.value = pre.textContent;
    pre.replaceWith(ta);
    ta.focus();
    const done = el('button', 'primary-btn', '保存');
    done.onclick = () => {
      if (!s.versions[s.sel]) s.versions[s.sel] = { text: '', at: Date.now() };
      s.versions[s.sel].text = ta.value;
      A.persist(); A.render();
    };
    ta.after(done);
  }

  function copyText(t) {
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('已复制'), () => toast('复制失败'));
    else { const ta = el('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('已复制'); }
  }

  /* ---------- 人物总表预览 ---------- */
  function castPreview(b, text) {
    const r = LEngine.parseCast(text);
    const c = el('div', 'card');
    const h = el('h3', '', '解析预览');
    h.appendChild(el('span', 'tag', r.people.length + ' 人 · ' + r.world.length + ' 条规则'));
    c.appendChild(h);

    if (r.people.length) {
      const tb = el('div', 'facts-table');
      r.people.forEach(p => {
        const row = el('div', 'fact-row');
        row.appendChild(el('b', '', p.name));
        if (p.roleTag) row.appendChild(el('span', 'role-tag', p.roleTag));
        const g = p.gender;
        row.appendChild(el('span', 'g' + (g === '男' ? 'm' : g === '女' ? 'f' : ' missing'),
          g || '缺性别'));
        row.appendChild(el('span', 'sub', [p.age ? p.age + '岁' : '', p.role].filter(Boolean).join(' · ')));
        if (p.voice) row.appendChild(el('div', 'voice', p.voice));
        tb.appendChild(row);
      });

      const bad = r.people.filter(p => !p.gender).length;
      if (bad) {
        c.appendChild(el('div', 'cap-tip thin',
          `有 ${bad} 个人物没解析出性别。人称检查会失效——建议先补上，或在「事实表」页手动编辑。`));
      }
      c.appendChild(tb);
    } else {
      c.appendChild(el('div', 'hint', '没解析出人物。格式必须是一行一个人，用「｜」分隔。'));
    }

    const btn = el('button', 'primary-btn wide', '应用到硬事实表');
    btn.onclick = () => {
      b.facts.people = r.people;
      if (r.world.length) b.facts.world = r.world;
      Books.pushHistory(b, '导入人物总表', r.people.length + ' 人');
      A.persist();
      toast('已应用：' + r.people.length + ' 人进入硬事实表');
      A.render();
    };
    c.appendChild(btn);
    return c;
  }

  /* ---------- 主线推进表预览 ---------- */
  function spinePreview(b, text) {
    const cells = LEngine.parseSpine(text);
    const c = el('div', 'card');
    const h = el('h3', '', '解析预览');
    h.appendChild(el('span', 'tag', cells.length + ' 格'));
    c.appendChild(h);

    cells.forEach(cell2 => {
      const row = el('div', 'cell-row');
      const top = el('div', 'cell-top');
      top.appendChild(el('span', 'cell-n', '第' + cell2.step + '格'));
      top.appendChild(el('span', 'cell-t', cell2.title));
      row.appendChild(top);
      if (cell2.promote) row.appendChild(el('div', 'cell-p', cell2.promote));
      const meta = el('div', 'cell-meta');
      meta.appendChild(el('span', 'badge', cell2.size + '档'));
      meta.appendChild(el('span', 'badge', cell2.beats + ' 个事件'));
      const chk = LT.capacityCheck(cell2.beats, { 小: 's', 中: 'm', 大: 'l' }[cell2.size] || 'm');
      meta.appendChild(el('span', 'badge ' + chk.level, chk.level === 'ok' ? '容量合适' : (chk.level === 'dense' ? '偏密' : '偏薄')));
      row.appendChild(meta);
      c.appendChild(row);
    });

    const btn = el('button', 'primary-btn wide', '生成单元列表');
    btn.onclick = () => {
      if (!cells.length) { toast('没解析出格子，检查格式'); return; }
      b.spine = cells;
      const n = LEngine.buildUnitsFromSpine(b, true);
      b.steps.spine.status = 'done';
      Books.pushHistory(b, '生成单元列表', n + ' 篇');
      A.persist();
      A.setView('units');
      A.render();
      toast('已生成 ' + n + ' 个单元');
    };
    c.appendChild(btn);
    return c;
  }

  function planPreview(b) {
    const c = el('div', 'card');
    c.appendChild(el('h3', '', '本书规划'));
    const main = b.spine.length || Math.round(b.target / 11000);
    const side = Math.max(4, Math.round(main * 0.25));
    const rows = [
      ['目标字数', (b.target / 10000).toFixed(0) + ' 万字'],
      ['主线单元', main + ' 篇'],
      ['副线单元', side + ' 篇'],
      ['合计', (main + side) + ' 篇'],
      ['平均每篇', Math.round(b.target / (main + side)) + ' 字']
    ];
    rows.forEach(r => {
      const row = el('div', 'kv');
      row.appendChild(el('span', '', r[0]));
      row.appendChild(el('b', '', r[1]));
      c.appendChild(row);
    });
    return c;
  }

  /* ---------- 生成调度 ---------- */
  function doBookFit(k) {
    const b = cur();
    const s = b.steps[k];
    const text = A.docOf(s);
    if (!text) { toast('先生成内容'); return; }
    toast('诊断功能待接入，可以先自己读一遍');
  }

  window.BOOKUI = { renderBook, feedbackCard, versionTabs, deleteVersion, toggleEdit, copyText };
})();
