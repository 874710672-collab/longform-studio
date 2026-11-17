/* appunit.js — 单元详情：立意/出场配置/大纲/正文/润色/交棒单 */
(function () {
  const A = window.APP;
  const el = A.el;
  const toast = A.toast;
  const stage = A.stage;

  function cur() { return A.cur; }

  function renderUnit() {
    const b = cur();
    const u = A.curUnit();
    if (!u) { A.setView('units'); A.render(); return; }
    const k = A.curUnitStep;
    if (u.kind === 'side') { /* 副线同样走完整六步，交棒单记录读者知识 */ }

    stage.appendChild(unitHead(b, u));
    if (u.stale) stage.appendChild(staleBanner(b, u));

    if (A.curUnitStep === 'draft') { FLOW.renderDraft(b, u); return; }

    const wrap = el('div', 'split');
    const left = el('div');
    const right = el('div');
    wrap.appendChild(left); wrap.appendChild(right);
    stage.appendChild(wrap);

    const s = u.steps[A.curUnitStep];
    const card = el('div', 'card');
    const h = el('h3', '', LT.UNIT_STEP_NAME[A.curUnitStep]);
    h.appendChild(el('span', 'tag', s.versions.length ? '稿 ' + (s.sel + 1) + '/' + s.versions.length : '未生成'));
    card.appendChild(h);
    if (s.versions.length > 1) card.appendChild(BOOKUI.versionTabs(s, () => A.render()));

    const box = el('div', 'card');
    /* 上游改过、这一步还是旧内容 → 提示但不清空 */
    if (s.status === 'stale' && A.docOf(s)) {
      const note = el('div', 'stale-note');
      const txt = el('div', '', '上游环节重新生成过，这一步的内容是基于旧稿写的，建议重新生成。');
      const act = el('button', 'act', '知道了，保留旧稿');
      act.onclick = () => { s.status = 'ready'; A.persist(); A.render(); };
      note.appendChild(txt); note.appendChild(act);
      box.appendChild(note);
    }
    const pre = el('div', 'doc');
    const text = A.docOf(s);
    pre.textContent = text || (A.busy ? '' : unitPlaceholder(A.curUnitStep, u));
    box.appendChild(pre);
    if (text && !A.busy) {
      const ops = el('div', 'doc-ops');
      const b1 = el('button', 'mini', '手动编辑');
      b1.onclick = () => BOOKUI.toggleEdit(s, pre);
      const b2 = el('button', 'mini', '复制');
      b2.onclick = () => BOOKUI.copyText(text);
      ops.appendChild(b1); ops.appendChild(b2);
      if (A.curUnitStep === 'relay') {
        const b3 = el('button', 'mini fit-btn', '↧ 应用到事实表');
        b3.onclick = () => applyRelayNow(b, u, text);
        ops.appendChild(b3);
      }
      box.appendChild(ops);
      box.appendChild(el('div', 'words', '共 ' + LEngine.cw(text) + ' 字'));
    }
    left.appendChild(card);
    left.appendChild(box);

    right.appendChild(BOOKUI.feedbackCard(s, A.curUnitStep));

    if (A.curUnitStep === 'outline' && text) right.appendChild(outlinePlanPreview(text, u));
    if (A.curUnitStep === 'setting' && text) right.appendChild(settingHint(b, u, text));
    if (A.curUnitStep === 'relay' && text) {
      right.appendChild(AUDITUI.relayCheckPanel(b, u, text));
      right.appendChild(relayPreview(b, u, text));
    }
    if (A.curUnitStep === 'polish' && text) right.appendChild(polishChecks(b, u, text));

    A.app.streamEl = pre;
  }

  function unitPlaceholder(k, u) {
    const map = {
      topic: `这一篇的立意。\n\n输入会带上：全书总纲、本篇对应的主线格子、上一篇的交棒单、硬事实表、待回收伏笔。\n\n输出会明确写清「本单元不许解决的事」——这是防止把后面的牌提前打光的关键。`,
      setting: '出场配置是增量的：\n\n· 已有人物只读，不许改姓名、性别、年龄、说话方式\n· 本篇新登场的人物在这里追加\n\n生成后在右边点「把新增人物写入事实表」，新人物才会进入硬事实表。',
      outline: `分节大纲。\n\n每节 3000-4000 字以内（太长会被截断），最后一节的钩子要直接呼应上一篇交棒单里的「留给下一单元的开场画面」。`,
      polish: '润色按节分段处理，避免一次输出太长被截断。最后一节会额外要求「收住本篇情绪 + 推向下一篇」。',
      relay: `交棒单决定下一篇能不能接上，这是整套流程里最关键的一份文档。\n\n写完点「应用到事实表」：\n· 新增伏笔自动编号入库\n· 已回收伏笔自动销账\n· 人物状态自动更新`
    };
    return map[k] || '';
  }

  /* ---------- 单元头部 ---------- */
  function unitHead(b, u) {
    const c = el('div', 'card unit-head');
    const top = el('div', 'uh-top');
    const tw = el('input');
    tw.className = 'title-in';
    tw.value = u.title;
    tw.oninput = () => { u.title = tw.value; A.persist(); A.renderTop(); };
    top.appendChild(tw);
    const kindBtn = el('button', 'mini' + (u.kind === 'side' ? ' side-b' : ''), u.kind === 'side' ? '副线' : '主线');
    kindBtn.onclick = () => {
      u.kind = u.kind === 'main' ? 'side' : 'main';
      Books.pushHistory(b, '改单元类型', `第${u.idx + 1}篇 → ${u.kind === 'main' ? '主线' : '副线'}`);
      A.persist(); A.render();
    };
    top.appendChild(kindBtn);
    c.appendChild(top);

    const meta = el('div', 'uh-meta');
    const t = LEngine.tierOf(u);
    meta.appendChild(el('span', '', `第 ${u.idx + 1} 篇 · ${u.kind === 'side' ? '副线' : '主线第 ' + u.spineAt + ' 格'}`));
    meta.appendChild(el('span', '', `${t.name}档 ${t.min}-${t.max} 字`));
    meta.appendChild(el('span', '', `${u.beats} 个事件`));
    if (u.chapterLabel) meta.appendChild(el('span', '', '章节：' + u.chapterLabel));
    c.appendChild(meta);

    const chk = LT.capacityCheck(u.beats, u.tier);
    if (chk.level !== 'ok') c.appendChild(el('div', 'cap-tip ' + chk.level, chk.msg));

    /* 导航 */
    const nav = el('div', 'uh-nav');
    const prev = el('button', 'mini', '← 上一篇');
    prev.disabled = u.idx === 0;
    prev.onclick = () => {
      const p = b.units[u.idx - 1];
      if (p) { b.unitId = p.id; A.setCurUnitStep(A.nextUnitStep(p)); A.persist(); A.render(); }
    };
    const next = el('button', 'mini', '下一篇 →');
    next.disabled = u.idx >= b.units.length - 1;
    next.onclick = () => {
      const p = b.units[u.idx + 1];
      if (p) { b.unitId = p.id; A.setCurUnitStep(A.nextUnitStep(p)); A.persist(); A.render(); }
    };
    const back = el('button', 'mini', '▤ 列表');
    back.onclick = () => { A.setView('units'); A.render(); };
    nav.appendChild(prev); nav.appendChild(back); nav.appendChild(next);
    c.appendChild(nav);
    return c;
  }

  function staleBanner(b, u) {
    const c = el('div', 'card stale-card');
    c.appendChild(el('div', 'stale-t', '⚠ 这一篇被标记为待重跑'));
    c.appendChild(el('div', 'hint', u.staleReason || '上游结构变动，交棒链断了。'));
    const act = el('button', 'mini', '取消标记（内容仍可用）');
    act.onclick = () => {
      LEngine.clearStale(b, u.id);
      Books.pushHistory(b, '取消待重跑', `第${u.idx + 1}篇`);
      A.persist(); A.render();
    };
    c.appendChild(act);
    return c;
  }

  /* ---------- 大纲预览 ---------- */
  function outlinePlanPreview(text, u) {
    const plan = LEngine.outlinePlan(text);
    const t = LEngine.tierOf(u);
    const sum = plan.reduce((a, p) => a + p.words, 0);
    const c = el('div', 'card');
    const h = el('h3', '', '节数与字数');
    h.appendChild(el('span', 'tag', plan.length + ' 节 · 合计约 ' + sum + ' 字'));
    c.appendChild(h);
    plan.forEach(p => {
      const row = el('div', 'kv');
      row.appendChild(el('span', '', p.title.slice(0, 18)));
      row.appendChild(el('b', p.words > 4000 ? 'warn-txt' : '', p.words ? p.words + ' 字' : '—'));
      c.appendChild(row);
    });
    if (Math.abs(sum - t.words) > t.words * 0.25) {
      c.appendChild(el('div', 'cap-tip dense', `大纲合计 ${sum} 字，与档位目标 ${t.words} 字偏差较大`));
    }
    plan.forEach(p => {
      if (p.words > 4000) c.appendChild(el('div', 'cap-tip dense', `「${p.title.slice(0, 12)}」单节 ${p.words} 字，超过 4000 容易被截断，建议拆开`));
    });
    return c;
  }

  function settingHint(b, u, text) {
    const c = el('div', 'card');
    c.appendChild(el('h3', '', '增量校验'));

    const known = (b.facts.people || []).map(p => p.name);
    const added = LEngine.parseNewPeople(text);
    const newRules = LEngine.parseNewWorldRules(text);
    const knownRules = (b.facts.world || []).map(w => (typeof w === 'string' ? w : w.rule));
    /* 过滤掉已经存在的规则（完全相同的文字） */
    const rulesToAdd = newRules.filter(r => knownRules.indexOf(r.rule) < 0);

    c.appendChild(el('div', 'hint',
      `已有人物 ${known.length} 个、规则 ${knownRules.length} 条（只读）。本篇新增 ${added.length} 人、${rulesToAdd.length} 条规则。`));

    /* ---------- 新增人物 ---------- */
    if (added.length) {
      const sec = el('div', 'inc-sec');
      const sh = el('div', 'inc-head');
      sh.appendChild(el('span', 'inc-title', '新增人物'));
      sh.appendChild(el('span', 'tag', added.length + ' 个'));
      sec.appendChild(sh);

      added.forEach(p => {
        const row = el('div', 'fact-row');
        row.appendChild(el('b', '', p.name));
        row.appendChild(el('span', 'g' + (p.gender === '男' ? 'm' : p.gender === '女' ? 'f' : ''), p.gender || '缺性别'));
        row.appendChild(el('span', 'sub', [p.age ? p.age + '岁' : '', p.role, p.rel].filter(Boolean).join(' · ')));
        if (p.voice) row.appendChild(el('div', 'voice', p.voice));
        sec.appendChild(row);
      });

      const btnP = el('button', 'primary-btn wide', '把新增人物写入事实表');
      btnP.onclick = () => {
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
        Books.pushHistory(b, '新增人物', `${u.idx + 1}篇 +${n} 人`);
        A.persist(); A.render();
        toast(n ? '已写入 ' + n + ' 人' : '没有新人物可写入');
      };
      sec.appendChild(btnP);
      c.appendChild(sec);
    }

    /* ---------- 新增世界规则 ---------- */
    if (rulesToAdd.length) {
      const sec = el('div', 'inc-sec');
      const sh = el('div', 'inc-head');
      sh.appendChild(el('span', 'inc-title', '新增世界规则'));
      sh.appendChild(el('span', 'tag', rulesToAdd.length + ' 条'));
      sec.appendChild(sh);

      rulesToAdd.forEach(r => {
        const row = el('div', 'fact-row');
        row.appendChild(el('span', '', r.rule));
        sec.appendChild(row);
      });

      const btnR = el('button', 'primary-btn wide', '把新增规则写入事实表');
      btnR.onclick = () => {
        if (!b.facts.world) b.facts.world = [];
        let n = 0;
        rulesToAdd.forEach(r => {
          const exists = (b.facts.world || []).some(w => {
            const t = typeof w === 'string' ? w : w.rule;
            return t === r.rule;
          });
          if (exists) return;
          b.facts.world.push({ rule: r.rule });
          n++;
        });
        Books.pushHistory(b, '新增世界规则', `${u.idx + 1}篇 +${n} 条`);
        A.persist(); A.render();
        toast(n ? '已写入 ' + n + ' 条规则' : '没有新规则可写入');
      };
      sec.appendChild(btnR);
      c.appendChild(sec);
    }

    /* ---------- 都没有 ---------- */
    if (!added.length && !rulesToAdd.length) {
      const hasSection = /【新增人物】|【新增世界规则】/.test(String(text || ''));
      c.appendChild(el('div', 'hint', hasSection
        ? '这一篇没有新增人物，也没有新增规则。'
        : '没解析出「新增人物」和「新增世界规则」两栏，检查格式是否用了【】标记。'));
    }

    return c;
  }


  /* ---------- 交棒单预览 ---------- */
  function relayPreview(b, u, text) {
    const r = LEngine.parseRelay(text);
    const c = el('div', 'card');
    c.appendChild(el('h3', '', '解析预览'));

    const sec = (t) => { const d = el('div', 'relay-sec'); d.appendChild(el('div', 'relay-h', t)); return d; };

    let d = sec('时间地点');
    d.appendChild(el('div', 'relay-b', r.timePlace || '—'));
    c.appendChild(d);

    d = sec('状态变化');
    if (r.changes.length) r.changes.forEach(x => {
      const row = el('div', 'kv');
      row.appendChild(el('span', '', x.name));
      row.appendChild(el('b', '', x.what));
      d.appendChild(row);
    });
    else d.appendChild(el('div', 'relay-b', '—'));
    c.appendChild(d);

    d = sec('新埋伏笔');
    if (r.plants.length) r.plants.forEach(x => d.appendChild(el('div', 'relay-b', `${x.desc} → ${x.planPay}`)));
    else d.appendChild(el('div', 'relay-b', '无'));
    c.appendChild(d);

    d = sec('下一单元必须接住');
    if (r.must.length) r.must.forEach((x, i) => d.appendChild(el('div', 'relay-b', (i + 1) + '. ' + x)));
    else d.appendChild(el('div', 'relay-b warn-txt', '没解析到——这是最关键的一栏，空了下一篇接不住'));
    c.appendChild(d);

    d = sec('开场画面');
    d.appendChild(el('div', 'relay-b', r.opening || '—'));
    c.appendChild(d);

    const btn = el('button', 'primary-btn wide', '应用到事实表');
    btn.onclick = () => applyRelayNow(b, u, text);
    c.appendChild(btn);
    return c;
  }

  function applyRelayNow(b, u, text) {
    const res = LEngine.applyRelay(b, u, text);
    u.steps.relay.status = 'done';
    Books.pushHistory(b, '应用交棒单', `第${u.idx + 1}篇：+${res.changed.plants} 伏笔 / 销账 ${res.changed.pays} / 状态 ${res.changed.states}`);
    A.persist(); A.render();
    A.toast(`已应用：新增 ${res.changed.plants} 条伏笔，销账 ${res.changed.pays} 条，更新 ${res.changed.states} 人状态`);
  }

  /* ---------- 润色检查 ---------- */
  function polishChecks(b, u, text) {
    const c = el('div', 'card');
    c.appendChild(el('h3', '', '程序校验'));
    const issues = LCHECK.checkText(b, u, text);
    const cross = LCHECK.checkUnitAgainstFacts(b, u);
    const all = issues.concat(cross);
    if (!all.length) c.appendChild(el('div', 'cap-tip ok', '没发现问题'));
    else {
      all.slice(0, 12).forEach(i => {
        const row = el('div', 'issue-row ' + (i.level === 'error' ? 'dense' : 'thin'));
        row.appendChild(el('span', '', i.msg));
        c.appendChild(row);
      });
      if (all.length > 12) c.appendChild(el('div', 'hint', `还有 ${all.length - 12} 条…`));
    }
    return c;
  }

  window.UNITUI2 = { renderUnit, applyRelayNow };
})();
