/* appmaterials.js — 构成要素素材悬浮框
   · 按钮在底栏「✎ 改本节」左边
   · 不写正文，只列【场景】【动作】【对话】【心理】【叙述交代】【议论/抒情】
   · 悬浮框宽 = 审核意见框(290px) × 1.7 ≈ 493px，高 = 半个横屏 iPad 屏高 ≈ 410px
   · 不可删除，可折叠、可编辑；可多次生成，版本记为「素材1」「素材2」…
*/
(function () {
  const A = window.APP;
  const el = A.el;
  const toast = A.toast;

  const W = Math.round(290 * 1.7);   /* 493 */
  const H = 410;                      /* 半个横屏 iPad 屏高 */

  const POS_KEY = 'll_media_pos_v1';
  const OPEN_KEY = 'll_media_open_v1';

  let box = null;      /* 悬浮框根节点 */
  let mounted = false; /* 事件是否已绑定 */

  /* 当前单元/节的上下文 */
  let curBook = null, curUnit = null, curIdx = 0;
  /* 当前查看的是「素材」还是「AI稿」 */
  let viewMode = 'mat';
  let aiSel = 0;

  /* ---------------- 存储 ---------------- */
  /* 素材存在 part.materials = [{ text, at }]，不放进 versions，避免和正文稿混在一起 */
  function matOf(u, idx) {
    const d = u && u.steps && u.steps.draft;
    if (!d) return null;
    const parts = d.parts || [];
    if (!parts[idx]) parts[idx] = { title: '', body: '', versions: [], sel: -1 };
    const p = parts[idx];
    if (!Array.isArray(p.materials)) p.materials = [];
    if (typeof p.matSel !== 'number') p.matSel = p.materials.length - 1;
    return p;
  }

  function curMat() {
    const p = matOf(curUnit, curIdx);
    if (!p) return '';
    const m = p.materials[p.matSel];
    return m ? m.text : '';
  }

  /* ---------------- 位置持久化 ---------------- */
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

  /* ---------------- 构建 DOM ---------------- */
  function build() {
    box = el('div', 'mat-float');
    box.id = 'matFloat';

    const head = el('div', 'mat-head');
    head.appendChild(el('span', 'mat-grip', '⠿'));
    const title = el('span', 'mat-title', '构成要素 · 素材1');
    title.id = 'matTitle';
    head.appendChild(title);
    const ver = el('button', 'mat-ver', '素材 1/1');
    ver.id = 'matVer';
    head.appendChild(ver);
    const aiBtn = el('button', 'mat-ai', 'AI稿 0/0');
    aiBtn.id = 'matAi';
    aiBtn.title = '切换查看 AI 生成的稿子';
    head.appendChild(aiBtn);
    const fold = el('button', 'mat-fold', '▾');
    fold.id = 'matFold';
    fold.title = '折叠/展开';
    head.appendChild(fold);
    const del = el('button', 'mat-del', '×');
    del.id = 'matDel';
    del.title = '删除素材';
    head.appendChild(del);
    box.appendChild(head);

    const bodyWrap = el('div', 'mat-body-wrap');
    const ta = el('textarea');
    ta.className = 'mat-ta';
    ta.id = 'matTa';
    ta.placeholder = '这里是生成出来的构成要素，可以直接编辑。\n\n也可以用底栏「✦ 生成要素」再出一版，保留在「素材 N」里切换。';
    bodyWrap.appendChild(ta);

    const foot = el('div', 'mat-foot');
    const saveTip = el('span', 'mat-tip', '编辑即自动保存');
    foot.appendChild(saveTip);
    const copy = el('button', 'mini', '复制');
    copy.id = 'matCopy';
    foot.appendChild(copy);
    bodyWrap.appendChild(foot);

    box.appendChild(bodyWrap);
    document.body.appendChild(box);
    return box;
  }

  /* ---------------- 渲染内容 ---------------- */
  function paint() {
    if (!box) return;
    const p = curMatHolder();
    const ta = box.querySelector('#matTa');
    const title = box.querySelector('#matTitle');
    const ver = box.querySelector('#matVer');

    if (!p || !p.materials.length) {
      ta.value = '';
      ta.disabled = true;
      title.textContent = '构成要素';
      ver.textContent = '素材 0/0';
      return;
    }
    ta.disabled = false;
    const aiIdx = aiList();
    const aiTotal = aiIdx.length;
    const aiCur = aiIdx.indexOf(aiSel);

    if (viewMode === 'ai' && aiTotal) {
      /* 显示 AI 稿 */
      ta.value = aiText(aiIdx[aiSel]) || '';
      ta.readOnly = true;
      title.textContent = '构成要素 · AI稿' + (aiSel + 1);
    } else {
      ta.value = p.materials[p.matSel] ? p.materials[p.matSel].text : '';
      ta.readOnly = false;
      title.textContent = '构成要素 · 素材' + (p.matSel + 1);
    }
    ver.textContent = '素材 ' + (p.matSel + 1) + '/' + p.materials.length;
    ver.classList.toggle('multi', p.materials.length > 1);
    ver.classList.toggle('off', viewMode === 'ai');
    ver.classList.toggle('on', viewMode !== 'ai');

    const aiBtn = box.querySelector('#matAi');
    if (aiBtn) {
      aiBtn.textContent = 'AI稿 ' + (aiTotal ? (aiCur >= 0 ? aiCur + 1 : aiSel + 1) : 0) + '/' + aiTotal;
      aiBtn.classList.toggle('multi', aiTotal > 1);
      aiBtn.classList.toggle('off', viewMode !== 'ai');
      aiBtn.classList.toggle('on', viewMode === 'ai');
      aiBtn.disabled = aiTotal === 0;
    }
  }

  /* 这一节里所有 AI 稿的索引（versions 中非人工的） */
  function aiList() {
    const p = curMatHolder();
    if (!p || !p.versions) return [];
    const out = [];
    p.versions.forEach((v, i) => {
      if (!v.manual && String(v.text || '').trim()) out.push(i);
    });
    return out;
  }
  function aiText(i) {
    const p = curMatHolder();
    return (p && p.versions && p.versions[i]) ? p.versions[i].text : '';
  }

  function curMatHolder() {
    /* 实时从当前书里取，避免 render 后对象被替换导致读到旧引用 */
    let u = curUnit;
    try {
      if (window.APP && APP.cur && curUnit) {
        const fresh = (APP.cur.units || []).find(x => x.id === curUnit.id);
        if (fresh) u = fresh;
      }
    } catch (e) {}
    return matOf(u, curIdx);
  }

  /* ---------------- 显示 / 隐藏 ---------------- */
  function show() {
    if (!box) build();
    bindOnce();
    if (curMatHolder() && curMatHolder().materials.length) {
      box.hidden = false;
      const saved = loadPos();
      if (saved) applyPos(box, saved.x, saved.y);
      else requestAnimationFrame(() => {
        applyPos(box, window.innerWidth - W - 14, Math.round(window.innerHeight * 0.16));
      });
      localStorage.setItem(OPEN_KEY, '1');
      paint();
    } else {
      box.hidden = true;
    }
    if (window.APP && APP.updateDock) APP.updateDock();
  }

  /* 隐藏框但不改变"用户是否开着"的记忆（切换环节时用） */
  function hide(silent) {
    if (box) box.hidden = true;
    if (!silent) localStorage.setItem(OPEN_KEY, '0');
  }

  function isShowing() { return !!(box && !box.hidden); }

  /* ---------------- 折叠 ---------------- */
  function toggleFold() {
    if (!box) return;
    box.classList.toggle('collapsed');
    const fold = box.querySelector('#matFold');
    fold.textContent = box.classList.contains('collapsed') ? '▸' : '▾';
    localStorage.setItem(OPEN_KEY + '_fold', box.classList.contains('collapsed') ? '1' : '0');
  }

  /* AI 稿版本菜单 */
  function openAiMenu(list) {
    if (!box) return;
    const old = box.querySelector('.mat-menu');
    if (old) old.remove();

    const p = curMatHolder();
    const menu = el('div', 'mat-menu');
    list.forEach((vi, k) => {
      const v = p.versions[vi];
      const b = el('button', 'mat-menu-item' + (k === aiSel ? ' on' : ''),
        'AI稿' + (k + 1) + ' · ' + fmtTime(v.at));
      b.onclick = () => {
        aiSel = k;
        viewMode = 'ai';
        paint();
        menu.remove();
        toast('已切到 AI稿' + (k + 1));
      };
      menu.appendChild(b);
    });
    box.appendChild(menu);
    const close = (e) => {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  /* ---------------- 删除当前素材 ---------------- */
  function deleteCurrent() {
    const p = curMatHolder();
    if (!p || !p.materials.length) { toast('没有可删除的素材'); return; }

    const idx = p.matSel;
    const m = p.materials[idx];
    const preview = String(m && m.text || '').slice(0, 40).replace(/\n/g, ' ');

    const host = document.createElement('div');
    host.className = 'mat-confirm-back';
    host.innerHTML =
      '<div class="mat-confirm-card">'
      + '<h2>删除素材' + (idx + 1) + '<button class="close">×</button></h2>'
      + '<div class="hint">删除后无法恢复。</div>'
      + '<div class="mat-preview">' + escHtml(preview) + (preview.length >= 40 ? '…' : '') + '</div>'
      + '<div class="sheet-acts"><button class="ghost-btn" id="delNo">取消</button>'
      + '<button class="primary-btn" id="delYes">确认删除</button></div>'
      + '</div>';
    document.body.appendChild(host);

    const closeIt = () => host.remove();
    host.querySelector('.close').onclick = closeIt;
    host.querySelector('#delNo').onclick = closeIt;
    host.onclick = (e) => { if (e.target === host) closeIt(); };
    host.querySelector('#delYes').onclick = () => {
      p.materials.splice(idx, 1);
      p.matSel = Math.min(idx, p.materials.length - 1);
      if (!p.materials.length) p.matSel = -1;
      A.persist();
      paint();
      if (!p.materials.length) hide(true);
      closeIt();
      toast('已删除素材' + (idx + 1));
    };
  }

  function escHtml(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------------- 版本切换 ---------------- */
  function switchVersion() {
    const p = curMatHolder();
    if (!p || p.materials.length < 2) return;
    const n = p.materials.length;
    /* 循环切换 + 弹小菜单 */
    const menu = el('div', 'mat-menu');
    p.materials.forEach((m, i) => {
      const b = el('button', 'mat-menu-item' + (i === p.matSel ? ' on' : ''),
        '素材' + (i + 1) + ' · ' + fmtTime(m.at));
      b.onclick = () => {
        p.matSel = i;
        A.persist();
        paint();
        menu.remove();
        toast('已切到素材' + (i + 1));
      };
      menu.appendChild(b);
    });
    box.appendChild(menu);
    const close = (e) => {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const z = n => String(n).padStart(2, '0');
    return z(d.getMonth() + 1) + '/' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  /* ---------------- 事件绑定（只做一次） ---------------- */
  function bindOnce() {
    if (!box || mounted) return;
    mounted = true;

    const head = box.querySelector('.mat-head');
    const ta = box.querySelector('#matTa');

    /* 拖动 */
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const onDown = (ev) => {
      if (ev.target.closest('button')) return;
      const pt = ev.touches ? ev.touches[0] : ev;
      dragging = true;
      box.classList.add('dragging');
      sx = pt.clientX; sy = pt.clientY;
      const r = box.getBoundingClientRect();
      ox = r.left; oy = r.top;
      ev.preventDefault();
    };
    const onMove = (ev) => {
      if (!dragging) return;
      const pt = ev.touches ? ev.touches[0] : ev;
      applyPos(box, ox + (pt.clientX - sx), oy + (pt.clientY - sy));
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

    /* 折叠 */
    box.querySelector('#matFold').onclick = toggleFold;

    /* 删除当前素材（二次确认）；AI 稿模式下不允许删 */
    box.querySelector('#matDel').onclick = () => {
      if (viewMode === 'ai') { toast('AI稿请到「稿 N」里管理'); return; }
      deleteCurrent();
    };

    /* 素材按钮：当前在 AI 稿模式就切回素材；否则弹版本菜单 */
    box.querySelector('#matVer').onclick = () => {
      if (viewMode === 'ai') {
        viewMode = 'mat';
        paint();
        return;
      }
      switchVersion();
    };

    /* AI稿按钮：切到 AI 稿模式 / 弹 AI 版本菜单 */
    box.querySelector('#matAi').onclick = () => {
      const list = aiList();
      if (!list.length) { toast('还没有 AI 稿'); return; }
      if (viewMode !== 'ai') {
        viewMode = 'ai';
        aiSel = list.length - 1;
        paint();
        return;
      }
      if (list.length < 2) return;
      openAiMenu(list);
    };

    /* 复制 */
    box.querySelector('#matCopy').onclick = () => {
      const t = ta.value || '';
      if (!t.trim()) { toast('还是空的'); return; }
      if (window.BOOKUI && BOOKUI.copyText) BOOKUI.copyText(t);
      else navigator.clipboard && navigator.clipboard.writeText(t);
      toast('已复制 ' + t.length + ' 字');
    };

    /* 编辑即保存 */
    let timer = null;
    ta.addEventListener('input', () => {
      if (viewMode === 'ai') return;   /* AI 稿只读 */
      clearTimeout(timer);
      timer = setTimeout(() => {
        const p = curMatHolder();
        if (!p || !p.materials[p.matSel]) return;
        p.materials[p.matSel].text = ta.value;
        A.persist();
      }, 400);
    });

    /* 恢复折叠状态 */
    if (localStorage.getItem(OPEN_KEY + '_fold') === '1') {
      box.classList.add('collapsed');
      box.querySelector('#matFold').textContent = '▸';
    }
  }

  /* ---------------- 对外：绑定当前单元/节 ----------------
     只在「分节正文」环节调用；离开该环节必须调用 detach() */
  function attach(book, unit, partIdx) {
    curBook = book; curUnit = unit; curIdx = partIdx || 0;
    viewMode = 'mat'; aiSel = 0;
    if (!box) build();
    bindOnce();
    paint();
    /* 有素材且上次是开着的 → 自动显示 */
    const p = curMatHolder();
    if (p && p.materials.length && localStorage.getItem(OPEN_KEY) !== '0') {
      box.hidden = false;
      const saved = loadPos();
      if (saved) applyPos(box, saved.x, saved.y);
      else requestAnimationFrame(() => applyPos(box, window.innerWidth - W - 14, Math.round(window.innerHeight * 0.16)));
    } else if (box) {
      box.hidden = true;
    }
  }

  /* 离开「分节正文」环节：隐藏并断开上下文 */
  function detach() {
    if (box) box.hidden = true;
    curBook = null; curUnit = null; curIdx = 0;
  }

  /* ---------------- 对外：生成一版要素 ---------------- */
  async function generate() {
    if (A.busy) { toast('正在生成，先等一下'); return; }
    /* 先把正文编辑框里没存的内容落盘 */
    if (window.__flushPartEdit) { try { window.__flushPartEdit(); } catch (e) {} }
    const book = curBook || A.cur;
    const unit = curUnit || A.curUnit();
    if (!book || !unit) { toast('没有打开的单元'); return; }

    const ctrl = new AbortController();
    A.setBusy({ ctrl, label: '正在拆解构成要素', text: '', mode: 'elements' });
    A.render();
    A.setStream('');
    try {
      const out = await LEngine.genPartElements(book, unit, curIdx, (d, full) => {
        A.setBusy(Object.assign({}, A.busy, { text: full }));
        A.setStream(full);
        A.updateDock();
      }, ctrl.signal);
      if (!out || !String(out).trim()) throw new Error('返回为空，可能被截断了');

      const p = matOf(unit, curIdx);
      p.materials.push({ text: String(out).trim(), at: Date.now() });
      p.matSel = p.materials.length - 1;
      const n = p.materials.length;

      /* 多出一份空白手写稿，标为「人工」 */
      if (LEngine.ensureManualDraft) LEngine.ensureManualDraft(book, unit, curIdx);

      A.setBusy(null);
      localStorage.setItem(OPEN_KEY, '1');
      /* 刚生成完：强制展开，让用户马上能看到新素材 */
      localStorage.setItem(OPEN_KEY + '_fold', '0');
      if (box) {
        box.classList.remove('collapsed');
        const f = box.querySelector('#matFold');
        if (f) f.textContent = '▾';
      }
      A.persist();
      A.render();
      show();
      paint();
      toast('素材' + n + ' 已生成，并新建了一版空白手写稿');
    } catch (e) {
      A.setBusy(null);
      A.endStream();
      A.render();
      if (e.name !== 'AbortError') alert('生成失败：' + e.message);
    }
  }

  /* 新建一版空白手写稿（追加到 versions 末尾，标 manual） */


  window.MATFLOAT = {
    show, hide, isShowing, attach, detach, generate, paint,
    toggleFold, curMatHolder,
    W, H
  };
})();
