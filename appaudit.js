/* appaudit.js — 进度对账单 + 交棒单体检 + 伏笔体检视图 */
(function () {
  const A = window.APP;
  const el = A.el;
  const toast = A.toast;
  const stage = A.stage;

  function cur() { return A.cur; }

  /* ---------- 对账单页面 ---------- */
  function renderAudit() {
    const b = cur();
    if (!b) { A.setView('home'); A.render(); return; }

    const d = LEngine.progressAuditData(b);

    const top = el('div', 'card');
    const h = el('h3', '', '进度对账');
    h.appendChild(el('span', 'tag', d.doneCount ? `已完成 ${d.doneCount} 篇` : '还没写完的单元'));
    top.appendChild(h);
    top.appendChild(el('div', 'hint', '每跑完 5-6 篇做一次。检查主线有没有跑偏、牌有没有被提前打光、伏笔有没有欠账。'));

    const nav = el('div', 'list-acts');
    const bback = el('button', 'mini', '◉ 事实表');
    bback.onclick = () => { A.setView('facts'); A.render(); };
    const bunits = el('button', 'mini', '▤ 单元列表');
    bunits.onclick = () => { A.setView('units'); A.render(); };
    nav.appendChild(bback); nav.appendChild(bunits);
    top.appendChild(nav);

    if (d.doneCount) {
      const gen = el('button', 'primary-btn wide', A.busy ? '对账中…' : '生成对账单');
      gen.disabled = !!A.busy;
      gen.onclick = () => genNow(b);
      top.appendChild(gen);
    } else {
      top.appendChild(el('div', 'cap-tip thin', '至少要写完一篇（生成交棒单）才能对账。'));
    }
    stage.appendChild(top);

    const s = b.steps.audit;
    if (s && s.versions && s.versions.length) {
      const box = el('div', 'card');
      const bh = el('h3', '', '对账结果');
      bh.appendChild(el('span', 'tag', '稿 ' + (s.sel + 1) + '/' + s.versions.length));
      box.appendChild(bh);
      if (s.versions.length > 1) {
        const vt = el('div', 'vers');
        s.versions.forEach((v, i) => {
          const t = el('button', 'ver-tab' + (i === s.sel ? ' on' : ''), '稿 ' + (i + 1));
          t.onclick = () => { s.sel = i; A.persist(); A.render(); };
          vt.appendChild(t);
        });
        box.appendChild(vt);
      }
      const pre = el('div', 'doc');
      pre.textContent = A.docOf(s) || (A.busy ? '' : '');
      box.appendChild(pre);
      if (!A.busy) {
        const ops = el('div', 'doc-ops');
        const cp = el('button', 'mini', '复制');
        cp.onclick = () => BOOKUI.copyText(A.docOf(s));
        ops.appendChild(cp);
        box.appendChild(ops);
      }
      stage.appendChild(box);
      A.app.streamEl = pre;
    }

    stage.appendChild(foreshadowPanel(b));
  }

  async function genNow(b) {
    if (A.busy) return;
    const s = b.steps.audit;
    const ctrl = new AbortController();
    A.setBusy({ ctrl, label: '正在对账', text: '' });
    A.render();
    A.setStream('');
    try {
      const out = await LEngine.genAudit(b, (d, full) => {
        A.setBusy(Object.assign({}, A.busy, { text: full }));
        A.setStream(full); A.updateDock();
      }, ctrl.signal);
      if (!out || !String(out).trim()) throw new Error('返回为空');
      s.versions.push({ text: String(out).trim(), at: Date.now() });
      s.sel = s.versions.length - 1;
      s.status = 'ready';
      Books.save(b);
      A.setBusy(null); A.render();
      toast('对账完成');
    } catch (e) {
      A.setBusy(null); A.endStream(); A.render();
      if (e.name !== 'AbortError') alert('对账失败：' + e.message);
    }
  }

  /* ---------- 伏笔体检面板 ---------- */
  function foreshadowPanel(b) {
    const c = el('div', 'card');
    const audit = LCHECK.auditForeshadow(b);
    const h = el('h3', '', '伏笔体检');
    h.appendChild(el('span', 'tag',
      `${audit.open} 条待收${audit.overdue ? ' · ' + audit.overdue + ' 条逾期' : ''}${audit.due ? ' · ' + audit.due + ' 条到期' : ''}`));
    c.appendChild(h);

    if (!audit.list.length) {
      c.appendChild(el('div', 'hint', '还没有伏笔。'));
      return c;
    }

    const bar = el('div', 'stat-row');
    const st = (label, v, cls) => {
      const d = el('div', 'stat' + (cls ? ' ' + cls : ''));
      d.appendChild(el('b', '', String(v)));
      d.appendChild(el('span', '', label));
      return d;
    };
    bar.appendChild(st('逾期', audit.overdue, audit.overdue ? 'bad-stat' : ''));
    bar.appendChild(st('到期', audit.due, audit.due ? 'warn-stat' : ''));
    bar.appendChild(st('待收', audit.open, ''));
    bar.appendChild(st('已收', audit.paid, ''));
    c.appendChild(bar);

    audit.list.slice(0, 20).forEach(f => {
      const row = el('div', 'fact-item fs-' + f.state);
      const line = el('div', 'fi-line');
      line.appendChild(el('b', '', f.id));
      const badgeCls = {
        overdue: 'badge dense', due: 'badge thin', ok: 'badge ok',
        paid: 'badge', nodate: 'badge thin'
      }[f.state] || 'badge';
      line.appendChild(el('span', badgeCls, f.note));
      line.appendChild(el('span', '', f.desc));
      row.appendChild(line);
      row.appendChild(el('div', 'sub', `第 ${f.plant} 篇埋 · 计划第 ${f.planPay || '?'} 篇收`));
      if (f.status === 'open') {
        const ops = el('div', 'fi-ops');
        const mk = el('button', 'mini', '标记已收');
        mk.onclick = () => {
          f.status = 'paid';
          f.paidAt = (b.units.filter(u => LEngine.unitDoc(u, 'relay')).length) || 0;
          A.persist(); A.render();
        };
        ops.appendChild(mk);
        const ed = el('button', 'mini', '改计划');
        ed.onclick = () => {
          const v = prompt('计划第几篇回收？', String(f.planPay || ''));
          const n = parseInt(v, 10);
          if (n) { f.planPay = n; A.persist(); A.render(); toast('已改为第 ' + n + ' 篇'); }
        };
        ops.appendChild(ed);
        row.appendChild(ops);
      }
      c.appendChild(row);
    });
    if (audit.list.length > 20) c.appendChild(el('div', 'hint', `还有 ${audit.list.length - 20} 条…`));
    return c;
  }

  /* ---------- 交棒单体检（单元页侧栏） ---------- */
  function relayCheckPanel(b, u, text) {
    const c = el('div', 'card');
    const r = RELAYCHECK.checkRelay(b, text);
    const h = el('h3', '', '交棒单体检');
    h.appendChild(el('span', 'tag' + (r.level === 'ok' ? '' : ' warn-txt'), r.summary));
    c.appendChild(h);

    if (r.level === 'ok') {
      c.appendChild(el('div', 'cap-tip ok', '这一份够结实：条目具体、能被下一篇检查。'));
      return c;
    }

    const list = el('div', 'issue-list');
    r.issues.forEach(i => {
      list.appendChild(el('div', 'issue-row ' + (i.level === 'error' ? 'dense' : 'thin'), i.msg));
    });
    c.appendChild(list);

    const btn = el('button', 'ghost-btn wide', '把这些问题写进审核意见');
    btn.onclick = () => {
      const curFb = (u.steps.relay.feedback || '').trim();
      const add = r.issues.map(i => '· ' + i.msg).join('\n');
      u.steps.relay.feedback = curFb ? curFb + '\n' + add : '请修掉下面这些问题：\n' + add;
      A.persist(); A.render();
      toast('已写入审核意见，点「按意见改」重生成');
    };
    c.appendChild(btn);
    return c;
  }

  window.AUDITUI = { renderAudit, foreshadowPanel, relayCheckPanel };
})();
