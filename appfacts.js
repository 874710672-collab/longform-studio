/* appfacts.js — 硬事实表查看与编辑：人物 / 世界规则 / 物品 / 时间线 / 伏笔 */
(function () {
  const A = window.APP;
  const el = A.el;
  const toast = A.toast;
  const stage = A.stage;

  function cur() { return A.cur; }

  function renderFacts() {
    const b = cur();
    if (!b) { A.setView('home'); A.render(); return; }
    const f = b.facts || {};

    /* 概览 */
    const top = el('div', 'card');
    const h = el('h3', '', '硬事实表');
    const peopleN = (f.people || []).length;
    const worldN = (f.world || []).length;
    const openFs = (b.foreshadow || []).filter(x => x.status === 'open').length;
    h.appendChild(el('span', 'tag', `${peopleN} 人 · ${worldN} 条规则 · ${openFs} 条待收伏笔`));
    top.appendChild(h);
    top.appendChild(el('div', 'hint', '这张表是所有单元共用的底座。只增不改——改了就前后对不上。'));

    const nav = el('div', 'list-acts');
    const back = el('button', 'mini', '◈ 全书层');
    back.onclick = () => { A.setView('book'); A.render(); };
    const bunits = el('button', 'mini', '▤ 单元列表');
    bunits.onclick = () => { A.setView('units'); A.render(); };
    nav.appendChild(back); nav.appendChild(bunits);
    top.appendChild(nav);
    stage.appendChild(top);

    /* 人物 */
    const pc = el('div', 'card');
    const ph = el('h3', '', '人物');
    ph.appendChild(el('span', 'tag', peopleN ? String(peopleN) : '空'));
    pc.appendChild(ph);

    if (!peopleN) {
      pc.appendChild(el('div', 'empty-tip', '还没有人物。回到「全书层 → 人物总表」生成并应用，或在本篇「出场配置」写入新人物。'));
    } else {
      (f.people || []).forEach((p, i) => {
        const row = el('div', 'fact-item');
        const line = el('div', 'fi-line');
        line.appendChild(el('b', '', p.name || '（无名）'));
        line.appendChild(el('span', 'g' + (p.gender === '男' ? 'm' : p.gender === '女' ? 'f' : ''), p.gender || '缺性别'));
        if (p.age) line.appendChild(el('span', 'sub', p.age + '岁'));
        if (p.role) line.appendChild(el('span', 'sub', p.role));
        if (p.firstUnit) line.appendChild(el('span', 'sub', '第' + p.firstUnit + '篇登场'));
        row.appendChild(line);
        if (p.voice) row.appendChild(el('div', 'fi-voice', '说话方式：' + p.voice));
        if (p.status) {
          const st = el('div', 'fi-status');
          st.appendChild(el('span', 'sub', '当前状态：'));
          st.appendChild(el('span', '', p.status));
          row.appendChild(st);
        }
        const ops = el('div', 'fi-ops');
        const ed = el('button', 'mini', '编辑');
        ed.onclick = () => editPerson(b, i);
        const del = el('button', 'mini danger-t', '删除');
        del.onclick = () => {
          if (!confirm(`从事实表删除「${p.name}」？\n\n已经写好的正文不会变，但后面生成的单元将不再知道这个人。`)) return;
          b.facts.people.splice(i, 1);
          Books.pushHistory(b, '删除人物', p.name || '');
          A.persist(); A.render();
          toast('已删除');
        };
        ops.appendChild(ed); ops.appendChild(del);
        row.appendChild(ops);
        pc.appendChild(row);
      });
    }
    stage.appendChild(pc);

    /* 世界规则 */
    const wc = el('div', 'card');
    const wh = el('h3', '', '世界规则');
    wh.appendChild(el('span', 'tag', worldN ? String(worldN) : '空'));
    wc.appendChild(wh);
    if (!worldN) wc.appendChild(el('div', 'hint', '还没有世界规则'));
    else (f.world || []).forEach((w, i) => {
      const row = el('div', 'fact-item');
      const line = el('div', 'fi-line');
      line.appendChild(el('span', '', typeof w === 'string' ? w : w.rule));
      const del = el('button', 'mini danger-t', '删');
      del.onclick = () => {
        b.facts.world.splice(i, 1);
        A.persist(); A.render();
      };
      row.appendChild(line);
      row.appendChild(del);
      wc.appendChild(row);
    });
    stage.appendChild(wc);

    /* 伏笔 */
    const fc = el('div', 'card');
    const fh = el('h3', '', '伏笔账');
    fh.appendChild(el('span', 'tag', (b.foreshadow || []).length + ' 条 · 待收 ' + openFs));
    fc.appendChild(fh);
    if (!(b.foreshadow || []).length) {
      fc.appendChild(el('div', 'hint', '还没有伏笔。写完交棒单并「应用到事实表」后会自动记录。'));
    } else {
      const sorted = [...(b.foreshadow || [])].sort((x, y) => {
        if (x.status !== y.status) return x.status === 'open' ? -1 : 1;
        return (x.planPay || 0) - (y.planPay || 0);
      });
      sorted.forEach(x => {
        const row = el('div', 'fact-item' + (x.status === 'paid' ? ' paid' : ''));
        const line = el('div', 'fi-line');
        line.appendChild(el('b', '', x.id));
        line.appendChild(el('span', x.status === 'open' ? 'badge ok' : 'badge', x.status === 'open' ? '待收' : '已收'));
        line.appendChild(el('span', '', x.desc));
        row.appendChild(line);
        const meta = el('div', 'sub', `第 ${x.plant} 篇埋 · 计划第 ${x.planPay} 篇收`);
        row.appendChild(meta);
        const ops = el('div', 'fi-ops');
        if (x.status === 'open') {
          const mk = el('button', 'mini', '标记已收');
          mk.onclick = () => {
            x.status = 'paid';
            x.paidAt = x.paidAt || 0;
            A.persist(); A.render();
            toast('已标记为回收');
          };
          ops.appendChild(mk);
        }
        const del = el('button', 'mini danger-t', '删');
        del.onclick = () => {
          b.foreshadow = b.foreshadow.filter(y => y.id !== x.id);
          A.persist(); A.render();
        };
        ops.appendChild(del);
        row.appendChild(ops);
        fc.appendChild(row);
      });
    }
    stage.appendChild(fc);

    /* 时间线 */
    const ac = el('div', 'card');
    const ah = el('h3', '', '时间线');
    ah.appendChild(el('span', 'tag', ((f.anchors || []).length) + ' 个锚点'));
    ac.appendChild(ah);
    if (!(f.anchors || []).length) ac.appendChild(el('div', 'hint', '还没有时间锚点'));
    else (f.anchors || []).slice().reverse().forEach(a => {
      const row = el('div', 'kv');
      row.appendChild(el('span', 'sub', '第' + a.unit + '篇'));
      row.appendChild(el('b', '', a.time));
      ac.appendChild(row);
    });
    stage.appendChild(ac);
  }

  /* ---------- 编辑人物 ---------- */
  function editPerson(b, i) {
    const p = b.facts.people[i];
    let html = `<h2>编辑人物<button class="close">×</button></h2>`;
    const field = (label, key, ph) =>
      `<div class="field"><label>${label}</label><input data-k="${key}" value="${(p[key] || '').replace(/"/g, '&quot;')}" placeholder="${ph || ''}"></div>`;
    html += field('姓名', 'name');
    html += `<div class="grid2">${field('性别（男/女）', 'gender')}${field('年龄', 'age')}</div>`;
    html += field('身份', 'role');
    html += field('说话方式（要可执行）', 'voice', '句子很短、先给结论、从不叫对方名字');
    html += `<div class="field"><label>当前状态（已死/已离场/…）</label><input data-k="status" value="${(p.status || '').replace(/"/g, '&quot;')}" placeholder="例如：已死、已离场、失忆"></div>`;
    html += `<div class="sheet-acts"><button class="primary-btn" id="saveP">保存</button></div>`;
    A.sheet(html, (root) => {
      root.querySelector('#saveP').onclick = () => {
        root.querySelectorAll('[data-k]').forEach(inp => {
          p[inp.dataset.k] = inp.value.trim();
        });
        if (p.gender && p.gender !== '男' && p.gender !== '女') {
          toast('性别请填「男」或「女」，否则人称检查会失效');
        }
        Books.pushHistory(b, '编辑人物', p.name);
        A.persist(); A.closeSheet(); A.render();
        toast('已保存');
      };
    });
  }

  window.FACTSUI = { renderFacts };
})();
