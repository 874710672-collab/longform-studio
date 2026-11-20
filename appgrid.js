/* appgrid.js — 主线推进表的表格编辑器
   一格一张卡，可增删改、上下移动；每格有稳定 id，单元跟着 id 走。 */
(function () {
  const A = window.APP;
  const el = A.el;
  const toast = A.toast;
  const stage = A.stage;

  function cur() { return A.cur; }

  const SIZE_TO_TIER = { 小: 's', 中: 'm', 大: 'l' };

  function renderGrid() {
    const b = cur();
    if (!b) { A.setView('home'); A.render(); return; }

    b.spine = GRID.reindex(b.spine || []);
    const cells = b.spine;

    /* 顶部 */
    const top = el('div', 'card');
    const h = el('h3', '', '主线推进表');
    h.appendChild(el('span', 'tag', cells.length ? cells.length + ' 格' : '空'));
    top.appendChild(h);
    top.appendChild(el('div', 'hint',
      '每格对应一个短篇单元。改完点右上角「同步到单元列表」。格号会自动重排，单元跟着格子走，不会错位。'));

    const bar = el('div', 'list-acts');
    const addBtn = el('button', 'mini on', '＋ 新增格子');
    addBtn.onclick = () => addCell(b);
    const syncBtn = el('button', 'mini', '⇄ 同步到单元列表');
    syncBtn.onclick = () => doSync(b);
    const back = el('button', 'mini', '◈ 全书层');
    back.onclick = () => { A.setView('book'); A.render(); };
    bar.appendChild(addBtn); bar.appendChild(syncBtn); bar.appendChild(back);
    top.appendChild(bar);
    stage.appendChild(top);

    renderGridBody(b);
  }

  /* 只渲染卡片列表部分（供全书层的推进表那一环复用） */
  function renderGridBody(b) {
    b.spine = GRID.reindex(b.spine || []);
    const cells = b.spine;

    if (!cells.length) {
      const c = el('div', 'card');
      c.appendChild(el('div', 'empty-tip', '还没有格子。点「＋ 新增格子」手动建，或回到全书层用 AI 生成一整份推进表。'));
      stage.appendChild(c);
      return;
    }

    /* 统计：孤儿单元 */
    const orphans = (b.units || []).filter(u => u.kind === 'main' && u.orphan);
    if (orphans.length) {
      const oc = el('div', 'card stale-card');
      oc.appendChild(el('div', 'stale-t', `有 ${orphans.length} 个单元失去了对应格子`));
      oc.appendChild(el('div', 'hint', '格子被删掉了，但这些单元已经有内容，所以保留着。你可以把它们转成副线，或者删掉。'));
      orphans.forEach(u => {
        const row = el('div', 'kv');
        row.appendChild(el('span', '', `第${u.idx + 1}篇 ${u.title}`));
        const act = el('button', 'mini', '转为副线');
        act.onclick = () => {
          u.kind = 'side';
          u.orphan = false;
          u.gridId = '';
          u.spineAt = -1;
          Books.pushHistory(b, '孤儿转副线', u.title);
          A.persist(); A.render();
          toast('已转为副线单元');
        };
        row.appendChild(act);
        oc.appendChild(row);
      });
      stage.appendChild(oc);
    }

    /* 格子列表 */
    const list = el('div', 'grid-list');
    cells.forEach((c, i) => list.appendChild(cellCard(b, c, i, cells.length)));
    stage.appendChild(list);

    /* 底部再加一个新增 */
    const bot = el('div', 'card');
    const add2 = el('button', 'ghost-btn wide', '＋ 在末尾新增一格');
    add2.onclick = () => addCell(b);
    bot.appendChild(add2);
    stage.appendChild(bot);
  }

  function cellCard(b, c, i, total) {
    const u = GRID.unitOfCell(b, c);
    const hasContent = u && LEngine.unitHasContent(u);

    const card = el('div', 'grid-card' + (u ? '' : ' no-unit'));
    /* 供「⌖ 定位」用：第几格 + 是否已完成 */
    card.dataset.step = String(c.step);
    if (u && LEngine.unitHasContent(u)) card.dataset.done = '1';
    const head = el('div', 'gc-head');
    head.appendChild(el('span', 'gc-n', '第' + c.step + '格'));
    const title = el('div', 'gc-title', c.title || '（未命名）');
    head.appendChild(title);
    if (u) {
      head.appendChild(el('span', 'gc-badge' + (hasContent ? ' has' : ''), '第' + (u.idx + 1) + '篇'));
    } else {
      head.appendChild(el('span', 'gc-badge none', '未建单元'));
    }
    card.appendChild(head);

    /* 摘要 */
    if (c.promote) card.appendChild(el('div', 'gc-promote', c.promote));
    else if (c.rough) card.appendChild(el('div', 'gc-rough', '大意：' + c.rough));
    const meta = el('div', 'gc-meta');
    meta.appendChild(el('span', 'badge', c.size || '中'));
    meta.appendChild(el('span', 'badge', (c.beats || 5) + ' 事件'));
    if (c.mustNot) meta.appendChild(el('span', 'badge thin', '不许碰：' + c.mustNot.slice(0, 12)));
    card.appendChild(meta);

    /* 操作 */
    const ops = el('div', 'gc-ops');
    const ed = el('button', 'mini', '编辑');
    ed.onclick = () => editCell(b, c);
    const up = el('button', 'mini', '↑');
    up.disabled = i === 0;
    up.onclick = () => moveCell(b, c, -1);
    const down = el('button', 'mini', '↓');
    down.disabled = i === total - 1;
    down.onclick = () => moveCell(b, c, 1);
    const ins = el('button', 'mini', '插入');
    ins.onclick = () => insertAfter(b, c);
    const del = el('button', 'mini danger-t', '删除');
    del.onclick = () => delCell(b, c);
    ops.appendChild(ed); ops.appendChild(up); ops.appendChild(down);
    ops.appendChild(ins); ops.appendChild(del);
    card.appendChild(ops);

    if (u && hasContent) {
      card.appendChild(el('div', 'gc-note', '这一篇已经有内容，改格子不会动它的正文和大纲'));
    }
    return card;
  }

  /* ---------- 编辑 ---------- */
  function editCell(b, c) {
    b.spine = GRID.reindex(b.spine);
    const total = b.spine.length;

    let html = `<h2>编辑第 ${c.step} 格<button class="close">×</button></h2>`;

    /* 位置 */
    html += `<div class="field"><label>位置（改这里可以调整格号顺序）</label>`;
    html += `<div class="pos-row">`;
    html += `<span class="pos-lbl">第</span>`;
    html += `<input type="number" id="posInput" min="1" max="${total}" value="${c.step}">`;
    html += `<span class="pos-lbl">格（共 ${total} 格）</span>`;
    html += `<button class="mini" id="posEnd">移到最后</button>`;
    html += `</div></div>`;

    /* AI 补全区 */
    html += `<div class="ai-fill-box">
      <div class="af-head">
        <span class="af-title">✦ 让 AI 补全这一格</span>
        <span class="af-hint">写个大概意思就行，它会参考前后格</span>
      </div>
      <textarea id="roughIn" rows="2" placeholder="例：主角想进殡仪馆，被门卫拦下，只能在外面等">${esc(c.rough || '')}</textarea>
      <div class="af-acts">
        <button class="primary-btn mini" id="aiFill">✦ 补全</button>
        <span class="af-status" id="afStatus"></span>
      </div>
    </div>`;

    const f = (label, key, val, area, ph) => {
      html += `<div class="field"><label>${label}</label>`;
      if (area) html += `<textarea data-k="${key}" id="fk_${key}" rows="3" placeholder="${ph || ''}">${esc(val || '')}</textarea>`;
      else html += `<input data-k="${key}" id="fk_${key}" value="${esc(val || '')}" placeholder="${ph || ''}">`;
      html += '</div>';
    };
    f('标题', 'title', c.title, false, '这一格发生什么');
    f('推进了什么', 'promote', c.promote, true, '必须让主角的处境变得更坏或更难');
    f('谁因此改变', 'change', c.change, false, '谁、变成什么样');
    f('不许碰', 'mustNot', c.mustNot, false, '后面几格的内容，这一格不许解决');

    html += `<div class="grid2">
      <div class="field"><label>建议规模</label><select data-k="size" id="fk_size">
        ${['小', '中', '大'].map(s => `<option value="${s}"${(c.size || '中') === s ? ' selected' : ''}>${s}</option>`).join('')}
      </select></div>
      <div class="field"><label>建议 beat 数</label><input type="number" data-k="beats" id="fk_beats" min="1" max="20" value="${c.beats || 5}"></div>
    </div>`;
    html += `<div class="sheet-acts"><button class="primary-btn" id="saveCell">保存</button></div>`;

    A.sheet(html, (root) => {
      const posIn = root.querySelector('#posInput');
      root.querySelector('#posEnd').onclick = () => { posIn.value = total; };

      /* ---- AI 补全 ---- */
      const roughIn = root.querySelector('#roughIn');
      const fillBtn = root.querySelector('#aiFill');
      const status = root.querySelector('#afStatus');

      fillBtn.onclick = async () => {
        const rough = roughIn.value.trim();
        const mine = {
          title: root.querySelector('#fk_title').value.trim(),
          promote: root.querySelector('#fk_promote').value.trim(),
          change: root.querySelector('#fk_change').value.trim(),
          mustNot: root.querySelector('#fk_mustNot').value.trim()
        };
        fillBtn.disabled = true;
        status.textContent = '生成中…';
        try {
          /* 先把界面上的内容写回格子，作为"已有内容"给 AI 参考 */
          Object.assign(c, mine);
          const r = await LEngine.genCellFill(b, c.id, rough, () => {});
          const p = LEngine.parseCellText(r.text, c.step);

          /* 回填表单（不直接落库，等用户点保存） */
          root.querySelector('#fk_title').value = p.title || c.title;
          if (p.promote) root.querySelector('#fk_promote').value = p.promote;
          if (p.change) root.querySelector('#fk_change').value = p.change;
          if (p.mustNot) root.querySelector('#fk_mustNot').value = p.mustNot;
          root.querySelector('#fk_size').value = p.size || '中';
          root.querySelector('#fk_beats').value = p.beats || 5;
          /* 记住大意，下次打开还在 */
          c.rough = rough;

          status.textContent = p.adjusted ? '已补全（和前后格有冲突，已调整）' : '已补全，检查后点保存';
        } catch (e) {
          if (e.name !== 'AbortError') status.textContent = '失败：' + e.message;
          else status.textContent = '已取消';
        }
        fillBtn.disabled = false;
      };

      /* ---- 保存 ---- */
      root.querySelector('#saveCell').onclick = () => {
        root.querySelectorAll('[data-k]').forEach(inp => {
          const k = inp.dataset.k;
          c[k] = k === 'beats' ? (parseInt(inp.value, 10) || 5) : inp.value.trim();
        });
        c.rough = roughIn.value.trim();

        const target = Math.max(1, Math.min(total, parseInt(posIn.value, 10) || c.step));
        if (target !== c.step) {
          const oldStep = c.step;
          moveToPosition(b, c, target);
          LEngine.syncUnitsWithSpine(b);
          Books.pushHistory(b, '调整格位', `${c.title}：第${oldStep}格 → 第${target}格`);
          A.persist(); A.closeSheet(); A.render();
          toast(`已移到第 ${target} 格，单元顺序已同步`);
          return;
        }

        Books.pushHistory(b, '编辑格子', `第${c.step}格 ${c.title}`);
        A.persist(); A.closeSheet(); A.render();
        toast('已保存');
      };
    });
  }

  /* 把某一格移动到指定序号（1 起） */
  function moveToPosition(b, cell, target) {
    const list = GRID.reindex(b.spine);
    const from = list.findIndex(x => x.id === cell.id);
    if (from < 0) return;
    const [item] = list.splice(from, 1);
    const to = Math.max(1, Math.min(list.length + 1, target)) - 1;
    list.splice(to, 0, item);
    list.forEach((x, i) => { x.order = i + 1; });
    b.spine = GRID.reindex(list);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- 增删移 ---------- */
  function addCell(b) {
    const list = [...(b.spine || [])];
    list.push({
      id: GRID.newId(0), order: list.length + 1,
      title: '新格子', promote: '', change: '', mustNot: '',
      size: '中', beats: 5, step: 0
    });
    b.spine = GRID.reindex(list);
    LEngine.syncUnitsWithSpine(b);
    Books.pushHistory(b, '新增格子', '末尾');
    A.persist(); A.render();
    toast('已新增一格，对应单元也建好了');
  }

  function insertAfter(b, c) {
    const list = [...b.spine];
    const idx = list.findIndex(x => x.id === c.id);
    const nc = {
      id: GRID.newId(0), order: c.order + 0.5,
      title: '新格子', promote: '', change: '', mustNot: '',
      size: '中', beats: 5, step: 0
    };
    list.splice(idx + 1, 0, nc);
    b.spine = GRID.reindex(list);
    LEngine.syncUnitsWithSpine(b);
    Books.pushHistory(b, '插入格子', '在' + c.step + '格后');
    A.persist(); A.render();
    toast('已在后面插入一格，单元已同步');
  }

  function moveCell(b, c, dir) {
    const list = GRID.reindex(b.spine);
    const i = list.findIndex(x => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    /* 交换 order */
    const tmp = list[i].order;
    list[i].order = list[j].order;
    list[j].order = tmp;
    b.spine = GRID.reindex(list);
    LEngine.syncUnitsWithSpine(b);
    A.persist(); A.render();
    toast('已移动，单元顺序已同步');
  }

  function delCell(b, c) {
    const u = GRID.unitOfCell(b, c);
    const hasContent = u && LEngine.unitHasContent(u);
    const msg = hasContent
      ? `第${c.step}格「${c.title}」对应的第${u.idx + 1}篇已经有内容。\n\n删除后这一格会消失，但单元会保留并标为「孤立」，你可以之后转成副线或删掉。\n\n确定删除？`
      : `删除第${c.step}格「${c.title}」？\n\n它对应的单元还没写内容，会一起删掉。`;
    if (!confirm(msg)) return;

    b.spine = b.spine.filter(x => x.id !== c.id);
    b.spine = GRID.reindex(b.spine);

    if (u && !hasContent) {
      b.units = b.units.filter(x => x.id !== u.id);
      LEngine.renumber(b);
    } else if (u) {
      u.orphan = true;
      u.gridId = '';
    }
    LEngine.syncUnitsWithSpine(b);
    Books.pushHistory(b, '删除格子', `第${c.step}格 ${c.title}${hasContent ? '（单元保留）' : ''}`);
    A.persist(); A.render();
    toast(hasContent ? '格子已删，单元保留为孤立' : '已删除');
  }

  /* ---------- 同步 ---------- */
  function doSync(b) {
    const before = (b.units || []).length;
    const report = LEngine.syncUnitsWithSpine(b);
    Books.pushHistory(b, '同步推进表',
      `更新 ${report.updated} · 新增 ${report.added} · 孤立 ${report.orphaned}`);
    A.persist();
    A.setView('units');
    A.render();
    const parts = [];
    if (report.added) parts.push('新增 ' + report.added);
    if (report.updated) parts.push('更新 ' + report.updated);
    if (report.orphaned) parts.push('孤立 ' + report.orphaned);
    toast(parts.length ? '已同步：' + parts.join(' · ') : '没有变化');
  }

  window.GRIDUI = { renderGrid, renderGridBody, cellCard };
})();
