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
    /* 历史数据里可能有重复锚点（旧版本每应用一次就加一条），打开时顺手清掉 */
    dedupeAnchors(b);
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
    const baudit = el('button', 'mini', '◎ 进度对账');
    baudit.onclick = () => { A.setView('audit'); A.render(); };
    nav.appendChild(back); nav.appendChild(bunits); nav.appendChild(baudit);
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
    wc.appendChild(el('div', 'hint', '写死的硬规则，每个单元生成时都会带上，模型不能违反。'));

    const wbar = el('div', 'list-acts');
    const wadd = el('button', 'mini on', '＋ 新增规则');
    wadd.onclick = () => editWorldRule(b, -1);
    wbar.appendChild(wadd);
    wc.appendChild(wbar);

    if (!worldN) wc.appendChild(el('div', 'empty-tip', '还没有世界规则。点「＋ 新增规则」手动加，或从人物总表里生成。'));
    else (f.world || []).forEach((w, i) => {
      const row = el('div', 'fact-item');
      const line = el('div', 'fi-line');
      line.appendChild(el('span', '', typeof w === 'string' ? w : w.rule));
      row.appendChild(line);
      const ops = el('div', 'fi-ops');
      const ed = el('button', 'mini', '编辑');
      ed.onclick = () => editWorldRule(b, i);
      const del = el('button', 'mini danger-t', '删');
      del.onclick = () => {
        const txt = typeof w === 'string' ? w : w.rule;
        if (!confirm(`删除这条规则？\n\n「${txt}」\n\n已经写好的正文不会变，但后面生成的单元不再受它约束。`)) return;
        b.facts.world.splice(i, 1);
        Books.pushHistory(b, '删除世界规则', txt.slice(0, 30));
        A.persist(); A.render();
        toast('已删除');
      };
      ops.appendChild(ed); ops.appendChild(del);
      row.appendChild(ops);
      wc.appendChild(row);
    });
    stage.appendChild(wc);

    /* 伏笔 */
    const fc = el('div', 'card');
    const fh = el('h3', '', '伏笔账');
    fh.appendChild(el('span', 'tag', (b.foreshadow || []).length + ' 条 · 待收 ' + openFs));
    fc.appendChild(fh);
    const fsbar = el('div', 'list-acts');
    const fsadd = el('button', 'mini on', '＋ 新增伏笔');
    fsadd.onclick = () => editForeshadow(b, null);
    fsbar.appendChild(fsadd);
    fc.appendChild(fsbar);

    if (!(b.foreshadow || []).length) {
      fc.appendChild(el('div', 'empty-tip', '还没有伏笔。写完交棒单并「应用到事实表」后会自动记录，也可以点上面手动加。'));
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
        const ed = el('button', 'mini', '编辑');
        ed.onclick = () => editForeshadow(b, x);
        ops.appendChild(ed);
        if (x.status === 'open') {
          const mk = el('button', 'mini', '标记已收');
          mk.onclick = () => {
            x.status = 'paid';
            x.paidAt = x.paidAt || 0;
            A.persist(); A.render();
            toast('已标记为回收');
          };
          ops.appendChild(mk);
        } else {
          const re = el('button', 'mini', '改回待收');
          re.onclick = () => {
            x.status = 'open';
            x.paidAt = null;
            A.persist(); A.render();
            toast('已改回待收');
          };
          ops.appendChild(re);
        }
        const del = el('button', 'mini danger-t', '删');
        del.onclick = () => {
          if (!confirm(`删除伏笔 ${x.id}？\n\n「${x.desc}」\n\n删除后不再追踪这条线。`)) return;
          b.foreshadow = b.foreshadow.filter(y => y.id !== x.id);
          Books.pushHistory(b, '删除伏笔', x.id);
          A.persist(); A.render();
          toast('已删除');
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
    const anchors = (f.anchors || []).slice().sort((x, y) => x.unit - y.unit);
    ah.appendChild(el('span', 'tag', anchors.length + ' 个锚点'));
    ac.appendChild(ah);
    ac.appendChild(el('div', 'hint',
      '每写完一篇，交棒单里的「时间地点」会记成一个锚点。用来看故事的时钟走到哪了——同一个单元只保留一条。'));
    if (!anchors.length) {
      ac.appendChild(el('div', 'empty-tip', '还没有时间锚点。生成交棒单并「应用到事实表」后会自动记录。'));
    } else {
      const tl = el('div', 'timeline');
      anchors.forEach((a, i) => {
        const row = el('div', 'tl-row' + (i === anchors.length - 1 ? ' latest' : ''));
        const dot = el('span', 'tl-dot');
        row.appendChild(dot);
        const body = el('div', 'tl-body');
        const head = el('div', 'tl-head');
        head.appendChild(el('b', '', '第' + a.unit + '篇'));
        head.appendChild(el('span', 'sub', a.event || ''));
        body.appendChild(head);
        body.appendChild(el('div', 'tl-time', a.time));
        row.appendChild(body);
        const del = el('button', 'tl-del', '×');
        del.onclick = () => {
          b.facts.anchors = b.facts.anchors.filter(x => x.unit !== a.unit);
          A.persist(); A.render();
          toast('已删除这条时间锚点');
        };
        row.appendChild(del);
        tl.appendChild(row);
      });
      ac.appendChild(tl);
    }
    stage.appendChild(ac);
  }

  /* 时间线锚点去重：每个单元只保留一条 */
  function dedupeAnchors(b) {
    const list = (b.facts && b.facts.anchors) || [];
    if (!list.length) return 0;
    const seen = new Map();
    list.forEach(a => { if (!seen.has(a.unit)) seen.set(a.unit, a); });
    if (seen.size === list.length) return 0;
    const removed = list.length - seen.size;
    b.facts.anchors = [...seen.values()].sort((x, y) => x.unit - y.unit);
    A.persist();
    return removed;
  }

  /* ---------- 编辑 / 新增世界规则 ---------- */
  function editWorldRule(b, idx) {
    if (!b.facts.world) b.facts.world = [];
    const isNew = idx < 0;
    const old = isNew ? '' : (typeof b.facts.world[idx] === 'string' ? b.facts.world[idx] : b.facts.world[idx].rule);

    let html = `<h2>${isNew ? '新增世界规则' : '编辑世界规则'}<button class="close">×</button></h2>`;
    html += `<div class="hint">写对剧情有硬约束的规则，一句话一条。不要写常识。</div>`;
    html += `<div class="field"><label>规则内容</label>
      <textarea id="wrText" rows="3" placeholder="例：遗物超过七年无人认领会被销毁">${esc(old)}</textarea></div>`;
    html += `<div class="sheet-acts"><button class="primary-btn" id="saveWr">保存</button></div>`;

    A.sheet(html, (root) => {
      const ta = root.querySelector('#wrText');
      ta.focus();
      root.querySelector('#saveWr').onclick = () => {
        const val = ta.value.trim();
        if (!val) { toast('规则不能为空'); return; }
        if (isNew) {
          b.facts.world.push({ rule: val });
          Books.pushHistory(b, '新增世界规则', val.slice(0, 30));
          toast('已添加');
        } else {
          b.facts.world[idx] = { rule: val };
          Books.pushHistory(b, '编辑世界规则', val.slice(0, 30));
          toast('已保存');
        }
        A.persist(); A.closeSheet(); A.render();
      };
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- 编辑 / 新增伏笔 ---------- */
  function editForeshadow(b, fs) {
    if (!b.foreshadow) b.foreshadow = [];
    const isNew = !fs;
    const units = (b.units || []).length;
    const curNo = (b.units || []).filter(u => LEngine.docOf(u.steps.relay)).length || 1;

    let html = `<h2>${isNew ? '新增伏笔' : '编辑伏笔 ' + fs.id}<button class="close">×</button></h2>`;
    html += `<div class="hint">描述要具体，方便后面回收时对得上。计划回收篇号是提醒，逾期会标红。</div>`;

    html += `<div class="field"><label>伏笔描述</label>
      <textarea id="fsDesc" rows="3" placeholder="例：城墙下有一道暗门">${esc(fs ? fs.desc : '')}</textarea></div>`;

    html += `<div class="grid2">
      <div class="field"><label>埋于第几篇</label>
        <input type="number" id="fsPlant" min="1" value="${fs ? (fs.plant || curNo) : curNo}"></div>
      <div class="field"><label>计划第几篇回收</label>
        <input type="number" id="fsPlan" min="1" value="${fs ? (fs.planPay || curNo + 3) : curNo + 3}"></div>
    </div>`;

    if (!isNew) {
      html += `<div class="field"><label>状态</label><select id="fsStatus">
        <option value="open"${fs.status === 'open' ? ' selected' : ''}>待收</option>
        <option value="paid"${fs.status === 'paid' ? ' selected' : ''}>已收</option>
      </select></div>`;
    }

    html += `<div class="sheet-acts"><button class="primary-btn" id="saveFs">保存</button></div>`;

    A.sheet(html, (root) => {
      const desc = root.querySelector('#fsDesc');
      desc.focus();
      root.querySelector('#saveFs').onclick = () => {
        const d = desc.value.trim();
        if (!d) { toast('描述不能为空'); return; }
        const plant = parseInt(root.querySelector('#fsPlant').value, 10) || curNo;
        const plan = parseInt(root.querySelector('#fsPlan').value, 10) || (curNo + 3);
        const statusEl = root.querySelector('#fsStatus');
        const status = statusEl ? statusEl.value : 'open';

        if (isNew) {
          b.fsSeq = (b.fsSeq || 0) + 1;
          const id = 'F' + String(b.fsSeq).padStart(2, '0');
          b.foreshadow.push({
            id, desc: d, plant, planPay: plan,
            paidAt: null, status: 'open', unitId: ''
          });
          Books.pushHistory(b, '新增伏笔', id + ' ' + d.slice(0, 20));
          toast('已添加伏笔 ' + id);
        } else {
          fs.desc = d;
          fs.plant = plant;
          fs.planPay = plan;
          fs.status = status;
          if (status === 'paid' && !fs.paidAt) fs.paidAt = curNo;
          if (status === 'open') fs.paidAt = null;
          Books.pushHistory(b, '编辑伏笔', fs.id);
          toast('已保存');
        }
        A.persist(); A.closeSheet(); A.render();
      };
    });
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
