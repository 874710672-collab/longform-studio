/* appdraft.js — 草稿本悬浮窗
   · 顶栏「✎ 草稿」唤出
   · 可拖动、可折叠、可编辑，宽高与素材框一致（493 × 410）
   · 内容按"书"分开存，切书各自独立；自动保存
*/
(function () {
  const A = window.APP;
  const el = A.el;
  const toast = A.toast;

  const W = 493;
  const H = 410;

  const POS_KEY = 'll_draft_pos_v1';
  const OPEN_KEY = 'll_draft_open_v1';
  const FOLD_KEY = 'll_draft_fold_v1';

  let box = null;
  let mounted = false;

  /* 草稿内容存在 book.draftPad（每个书一份） */
  function book() { return A.cur; }

  function textOf(b) {
    if (!b) return '';
    if (typeof b.draftPad !== 'string') b.draftPad = '';
    return b.draftPad;
  }

  function loadPos() {
    try {
      const s = localStorage.getItem(POS_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }
  function savePos(x, y) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x, y })); } catch (e) {}
  }
  function applyPos(node, x, y) {
    const maxX = Math.max(6, window.innerWidth - node.offsetWidth - 6);
    const maxY = Math.max(6, window.innerHeight - node.offsetHeight - 6);
    node.style.left = Math.min(Math.max(6, x), maxX) + 'px';
    node.style.top = Math.min(Math.max(6, y), maxY) + 'px';
  }

  function build() {
    box = el('div', 'draft-float');
    box.id = 'draftFloat';

    const head = el('div', 'draft-head');
    head.appendChild(el('span', 'draft-grip', '⠿'));
    head.appendChild(el('span', 'draft-title', '草稿本'));
    const cnt = el('span', 'draft-count', '0 字');
    cnt.id = 'draftCount';
    head.appendChild(cnt);
    const fold = el('button', 'draft-fold', '▾');
    fold.id = 'draftFold';
    fold.title = '折叠/展开';
    head.appendChild(fold);
    const clr = el('button', 'draft-clear', '清空');
    clr.id = 'draftClear';
    clr.title = '清空当前这本书的草稿';
    head.appendChild(clr);
    box.appendChild(head);

    const wrap = el('div', 'draft-body-wrap');
    const ta = el('textarea');
    ta.className = 'draft-ta';
    ta.id = 'draftTa';
    ta.placeholder = '随手记：灵感、对白、待办、卡住的地方…\n\n自动保存，按书分开存。';
    wrap.appendChild(ta);

    const foot = el('div', 'draft-foot');
    const tip = el('span', 'draft-tip', '自动保存');
    foot.appendChild(tip);
    const copy = el('button', 'mini', '复制');
    copy.id = 'draftCopy';
    foot.appendChild(copy);
    const insert = el('button', 'mini', '插到正文');
    insert.id = 'draftInsert';
    insert.title = '把全文追加到当前节的正文末尾';
    foot.appendChild(insert);
    wrap.appendChild(foot);

    box.appendChild(wrap);
    document.body.appendChild(box);
  }

  function paint() {
    if (!box) return;
    const b = book();
    const ta = box.querySelector('#draftTa');
    const cnt = box.querySelector('#draftCount');
    const t = textOf(b);
    if (ta.value !== t) ta.value = t;
    cnt.textContent = t.replace(/\s/g, '').length + ' 字';
    box.classList.toggle('no-book', !b);
    ta.disabled = !b;
  }

  function show() {
    if (!box) build();
    bindOnce();
    box.hidden = false;
    const saved = loadPos();
    if (saved) applyPos(box, saved.x, saved.y);
    else requestAnimationFrame(() => applyPos(box, Math.round(window.innerWidth * 0.5 - W / 2), 120));
    localStorage.setItem(OPEN_KEY, '1');
    paint();
  }

  function hide() {
    if (box) box.hidden = true;
    localStorage.setItem(OPEN_KEY, '0');
  }

  function toggle() {
    if (isShowing()) hide();
    else show();
  }

  function isShowing() { return !!(box && !box.hidden); }

  function toggleFold() {
    if (!box) return;
    box.classList.toggle('collapsed');
    box.querySelector('#draftFold').textContent = box.classList.contains('collapsed') ? '▸' : '▾';
    localStorage.setItem(FOLD_KEY, box.classList.contains('collapsed') ? '1' : '0');
  }

  function bindOnce() {
    if (!box || mounted) return;
    mounted = true;

    const head = box.querySelector('.draft-head');
    const ta = box.querySelector('#draftTa');

    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const onDown = (ev) => {
      if (ev.target.closest('button')) return;
      const p = ev.touches ? ev.touches[0] : ev;
      dragging = true;
      box.classList.add('dragging');
      sx = p.clientX; sy = p.clientY;
      const r = box.getBoundingClientRect();
      ox = r.left; oy = r.top;
      ev.preventDefault();
    };
    const onMove = (ev) => {
      if (!dragging) return;
      const p = ev.touches ? ev.touches[0] : ev;
      applyPos(box, ox + (p.clientX - sx), oy + (p.clientY - sy));
      ev.preventDefault();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      box.classList.remove('dragging');
      const r = box.getBoundingClientRect();
      savePos(r.left, r.top);
    };
    head.addEventListener('mousedown', onDown);
    head.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);

    box.querySelector('#draftFold').onclick = toggleFold;

    box.querySelector('#draftClear').onclick = () => {
      const b = book();
      if (!b) return;
      if (!String(b.draftPad || '').trim()) { toast('已经是空的'); return; }
      if (!confirm('清空这本书的草稿？\n\n清空后无法恢复。')) return;
      b.draftPad = '';
      A.persist();
      paint();
      toast('已清空');
    };

    box.querySelector('#draftCopy').onclick = () => {
      const t = ta.value || '';
      if (!t.trim()) { toast('还是空的'); return; }
      if (window.BOOKUI && BOOKUI.copyText) BOOKUI.copyText(t);
      else navigator.clipboard && navigator.clipboard.writeText(t);
      toast('已复制 ' + t.length + ' 字');
    };

    box.querySelector('#draftInsert').onclick = () => {
      const t = ta.value || '';
      if (!t.trim()) { toast('草稿是空的'); return; }
      const b = book();
      if (!b || A.view !== 'unit' || A.curUnitStep !== 'draft') {
        toast('只在「分节正文」环节可用');
        return;
      }
      const u = A.curUnit();
      const d = u && u.steps && u.steps.draft;
      if (!d) { toast('没有打开的节'); return; }
      const idx = d.partIdx || 0;
      const parts = d.parts || (d.parts = []);
      if (!parts[idx]) parts[idx] = { title: '', body: '', versions: [], sel: -1 };
      const p = parts[idx];
      p.body = (p.body || '') + (p.body ? '\n\n' : '') + t;
      if (p.sel >= 0 && p.versions[p.sel]) p.versions[p.sel].text = p.body;
      A.persist();
      A.render();
      toast('已追加到第 ' + (idx + 1) + ' 节正文末尾');
    };

    let timer = null;
    ta.addEventListener('input', () => {
      const b = book();
      if (!b) return;
      b.draftPad = ta.value;
      box.querySelector('#draftCount').textContent = ta.value.replace(/\s/g, '').length + ' 字';
      clearTimeout(timer);
      timer = setTimeout(() => { A.persist(); }, 400);
    });

    if (localStorage.getItem(FOLD_KEY) === '1') {
      box.classList.add('collapsed');
      box.querySelector('#draftFold').textContent = '▸';
    }
  }

  /* 页面渲染时刷新内容（换书/切页） */
  function sync() {
    if (box && !box.hidden) paint();
  }

  window.DRAFTFLOAT = { show, hide, toggle, isShowing, sync };
})();
