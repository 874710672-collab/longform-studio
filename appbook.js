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

    /* 简报 */
    stage.appendChild(briefCard(b));

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
    nav.appendChild(bf); nav.appendChild(bu);
    body.appendChild(nav);
    return c;
  }

  function versionTabs(s, onPick) {
    const vt = el('div', 'vers');
    s.versions.forEach((v, i) => {
      const t = el('button', 'ver-tab' + (i === s.sel ? ' on' : ''), '稿 ' + (i + 1));
      t.onclick = () => { s.sel = i; A.persist(); onPick(); };
      vt.appendChild(t);
    });
    return vt;
  }

  function feedbackCard(s, key) {
    const c = el('div', 'card');
    const h = el('h3', '', '审核意见');
    h.appendChild(el('span', 'tag', '写在这里，再点「按意见改」'));
    c.appendChild(h);
    const ta = el('textarea');
    ta.className = 'fb-area';
    ta.rows = 6;
    ta.placeholder = '例：反派动机太弱，要写成他当年被主角父亲救过一次…';
    ta.value = s.feedback || '';
    ta.oninput = () => { s.feedback = ta.value; A.persist(); A.updateDock(); };
    c.appendChild(ta);
    return c;
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

  window.BOOKUI = { renderBook, feedbackCard, versionTabs, toggleEdit, copyText };
})();
