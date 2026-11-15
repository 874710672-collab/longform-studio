/* app.js — 长篇工坊界面与流程控制 */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;
    return n;
  };
  const stage = $('#stage');
  const els = {
    project: $('#tbProject'), sub: $('#tbSub'), steps: $('#steps'),
    dockInfo: $('#dockInfo'), bGen: $('#btnGen'), bRegen: $('#btnRegen'), bRevise: $('#btnRevise'),
    bApprove: $('#btnApprove'), bStop: $('#btnStop'), bUnits: $('#btnUnits')
  };

  let cur = Books.current();
  if (cur) cur = Books.migrateBook(cur);
  const app = { streamEl: null };
  let busy = null;
  let view = 'home';           // home | book | units | unit | settings
  let curStep = 'book';        // 全书层当前工序
  let curUnitStep = 'topic';   // 单元层当前工序

  /* ---------- 工具 ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._h);
    toast._h = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function sheet(html, onMount) {
    const s = $('#sheet');
    $('#sheetBody').innerHTML = html;
    s.hidden = false;
    s.classList.remove('hide');
    if (onMount) onMount($('#sheetBody'));
    const close = $('.close', $('#sheetBody'));
    if (close) close.onclick = closeSheet;
    s.onclick = (e) => { if (e.target === s) closeSheet(); };
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheet').classList.add('hide'); }
  function fmtTime(ts) {
    const d = new Date(ts);
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  function persist() {
    if (!cur) return;
    if (!Books.save(cur)) toast('保存失败：存储可能已满，请先导出备份');
  }
  function curUnit() { return cur ? Books.curUnit(cur) : null; }
  function docOf(step) { const v = step.versions[step.sel]; return v ? v.text : ''; }

  function setStream(txt) {
    if (app.streamEl) { app.streamEl.textContent = txt; app.streamEl.classList.add('streaming'); }
  }
  function endStream() {
    if (app.streamEl) app.streamEl.classList.remove('streaming');
    app.streamEl = null;
  }

  /* ---------- 顶部 ---------- */
  function renderTop() {
    if (view === 'home' || !cur) {
      els.project.textContent = '长篇工坊';
      els.sub.textContent = '选择或新建一本书';
      els.bUnits.hidden = true;
      return;
    }
    els.project.textContent = cur.title;
    const u = curUnit();
    if (view === 'unit' && u) {
      const t = LEngine.tierOf(u);
      els.sub.textContent = `第${u.idx + 1}篇 · ${u.kind === 'side' ? '副线' : '主线'} · ${t.name}档 约${t.words}字`;
    } else if (view === 'units') {
      els.sub.textContent = `共 ${cur.units.length} 篇 · 目标 ${(cur.target / 10000).toFixed(0)} 万字 · 规划 ${(LEngine.totalWords(cur) / 10000).toFixed(1)} 万字`;
    } else {
      els.sub.textContent = '全书层 · ' + (LT.BOOK_STEP_NAME[curStep] || '');
    }
    els.bUnits.hidden = false;
  }

  /* ---------- 步骤条 ---------- */
  function renderSteps() {
    els.steps.innerHTML = '';
    if (view === 'home' || view === 'settings' || !cur) { els.steps.hidden = true; return; }
    els.steps.hidden = false;

    if (view === 'units') {
      els.steps.hidden = true;
      return;
    }

    if (view === 'book') {
      LT.BOOK_STEPS.forEach((k, i) => {
        const s = cur.steps[k];
        const cls = 'step-chip ' + (curStep === k ? 'cur ' : '') + (s.status === 'done' ? 'ok' : (s.versions.length ? '' : 'lock'));
        const c = el('button', cls);
        c.appendChild(el('span', 'dot'));
        c.appendChild(el('span', '', (i + 1) + ' ' + LT.BOOK_STEP_NAME[k]));
        c.onclick = () => {
          if (busy) { toast('正在生成，先等一下'); return; }
          curStep = k; persist(); render();
        };
        els.steps.appendChild(c);
      });
      /* 第四格：单元列表 */
      const c = el('button', 'step-chip');
      c.appendChild(el('span', 'dot'));
      c.appendChild(el('span', '', '4 单元列表 →'));
      c.onclick = () => { if (busy) return; view = 'units'; render(); };
      els.steps.appendChild(c);
      return;
    }

    if (view === 'unit') {
      const u = curUnit();
      if (!u) return;
      const list = LT.UNIT_STEPS;
      list.forEach((k, i) => {
        const s = u.steps[k];
        const cls = 'step-chip ' + (curUnitStep === k ? 'cur ' : '') + (s.status === 'done' ? 'ok' : (docOf(s) ? '' : 'lock'));
        const c = el('button', cls);
        c.appendChild(el('span', 'dot'));
        c.appendChild(el('span', '', (i + 1) + ' ' + LT.UNIT_STEP_NAME[k]));
        c.onclick = () => {
          if (busy) { toast('正在生成，先等一下'); return; }
          curUnitStep = k; render();
        };
        els.steps.appendChild(c);
      });
    }
  }

  /* ---------- 主渲染 ---------- */
  function render() {
    if (cur) Books.migrateBook(cur);
    renderTop();
    renderSteps();
    $('#btnExport').hidden = !(cur && view !== 'home');
    $('#dock').classList.toggle('empty', !cur || view === 'home' || view === 'units');
    stage.innerHTML = '';
    if (view === 'home') { renderHome(); updateDock(); return; }
    if (view === 'settings') { renderSettings(); updateDock(); return; }
    if (!cur) { view = 'home'; renderHome(); return; }
    if (view === 'units') { UNITUI.renderUnitList(); updateDock(); return; }
    if (view === 'book') { BOOKUI.renderBook(); updateDock(); return; }
    if (view === 'unit') { UNITUI2.renderUnit(); updateDock(); return; }
  }

  /* ---------- 底栏 ---------- */
  function updateDock() {
    const hide = () => ['bRevise', 'bRegen', 'bGen', 'bApprove'].forEach(k => els[k].hidden = true);
    if (!cur || view === 'home' || view === 'units' || view === 'settings') { hide(); els.dockInfo.textContent = ''; return; }

    const isUnit = view === 'unit';
    const u = curUnit();
    const k = isUnit ? curUnitStep : curStep;
    const s = isUnit ? (u ? u.steps[k] : null) : cur.steps[k];
    if (!s) { hide(); return; }

    const isDraft = isUnit && k === 'draft';
    const has = isDraft ? !!(s.parts && s.parts[s.partIdx || 0]) : !!docOf(s);
    const fb = (s.feedback || '').trim();
    const bz = !!busy;

    els.bGen.hidden = bz || has;
    els.bRevise.hidden = bz || !has;
    els.bRegen.hidden = bz || !has;
    els.bApprove.hidden = bz || !has;

    els.bGen.textContent = isDraft ? '写这一节' : '生成';
    els.bRevise.textContent = isDraft ? '✎ 按意见改本节' : '✎ 按意见改';
    els.bRevise.classList.toggle('need-fb', !fb);
    els.bRevise.title = fb ? '带上原稿 + 意见，只改提到的地方' : '先在右边写审核意见';
    els.bRegen.textContent = isDraft ? '↻ 重写本节' : '↻ 重新生成';

    if (isUnit) {
      const order = LT.UNIT_STEPS;
      const i = order.indexOf(k);
      const last = i === order.length - 1;
      els.bApprove.textContent = last
        ? (k === 'relay' ? '完成 · 这篇定稿了' : '完成 · 本篇定稿')
        : '通过 · 进入' + LT.UNIT_STEP_NAME[order[i + 1]];
    } else {
      const i = LT.BOOK_STEPS.indexOf(k);
      els.bApprove.textContent = i === LT.BOOK_STEPS.length - 1 ? '通过 · 去建单元列表' : '通过 · 进入' + LT.BOOK_STEP_NAME[LT.BOOK_STEPS[i + 1]];
    }

    if (bz) {
      els.dockInfo.textContent = busy.label + ' · 已生成 ' + LEngine.cw(busy.text || '') + ' 字';
    } else if (isDraft) {
      const written = (s.parts || []).filter(Boolean).length;
      const total = LEngine.outlinePlan(LEngine.unitDoc(u, 'outline')).length || LEngine.tierOf(u).parts;
      const w = (s.parts || []).filter(Boolean).reduce((a, p) => a + LEngine.cw(p.body), 0);
      els.dockInfo.textContent = `已写 ${written}/${total} 节 · ${w} 字（目标 ${LEngine.tierOf(u).words}）`;
    } else {
      const n = LEngine.cw(docOf(s));
      els.dockInfo.textContent = has
        ? `已生成 ${n} 字 · ${s.status === 'done' ? '已通过' : (fb ? '待按意见修改' : '待审核')}`
        : (s.feedback ? '有意见未生成' : '点「生成」开始');
    }
  }

  /* ---------- 首页：书库 ---------- */
  function renderHome() {
    view = 'home';
    renderTop();
    const list = Books.all();
    const head = el('div', 'card');
    const h = el('h3', '', '我的长篇');
    h.appendChild(el('span', 'tag', list.length ? '共 ' + list.length + ' 本' : '还没有'));
    head.appendChild(h);
    const nb = el('button', 'primary-btn wide', '＋ 新建长篇');
    nb.onclick = createBook;
    head.appendChild(nb);
    stage.appendChild(head);

    if (!list.length) {
      const c = el('div', 'card');
      c.appendChild(el('div', 'empty-tip', '一本书 = 一条主线 + 30 个左右的短篇单元。\n先从「全书总纲」开始，它会带你往下走。'));
      stage.appendChild(c);
      return;
    }

    const pl = el('div', 'plist');
    list.forEach(b => {
      const it = el('div', 'pitem');
      it.appendChild(el('div', 'pt', b.title));
      const done = b.units.filter(u => u.steps.polish.status === 'done').length;
      const stale = b.units.filter(u => u.stale).length;
      const meta = el('div', 'pm');
      meta.appendChild(el('span', '', `${b.units.length} 篇 · 定稿 ${done}`));
      meta.appendChild(el('span', '', `目标 ${(b.target / 10000).toFixed(0)} 万`));
      if (stale) meta.appendChild(el('span', 'warn-txt', `待重跑 ${stale}`));
      meta.appendChild(el('span', '', fmtTime(b.updatedAt)));
      it.appendChild(meta);
      const acts = el('div', 'pa');
      const open = el('button', 'mini on', '打开');
      open.onclick = () => openBook(b.id);
      const del = el('button', 'mini', '删除');
      del.onclick = () => {
        if (!confirm('删除《' + b.title + '》？正文会一起删掉，建议先导出。')) return;
        Books.remove(b.id);
        if (cur && cur.id === b.id) cur = null;
        render();
      };
      acts.appendChild(open); acts.appendChild(del);
      it.appendChild(acts);
      pl.appendChild(it);
    });
    stage.appendChild(pl);
  }

  function createBook() {
    const b = Books.newBook();
    Books.save(b);
    Books.setCurrent(b.id);
    cur = b;
    curStep = 'book';
    view = 'book';
    render();
  }

  function openBook(id) {
    Books.setCurrent(id);
    cur = Books.get(id);
    if (!cur) { toast('这本书不见了'); return; }
    const u = Books.curUnit(cur);
    if (u) { view = 'unit'; curUnitStep = nextUnitStep(u); }
    else view = 'book';
    render();
  }

  function nextUnitStep(u) {
    const order = LT.UNIT_STEPS;
    for (const k of order) {
      if (!docOf(u.steps[k]) && !(k === 'draft' && (u.steps.draft.parts || []).some(Boolean))) return k;
    }
    return order[order.length - 1];
  }

  /* ---------- 设置 ---------- */
  function renderSettings() {
    const cfg = Store.cfg();
    const c = el('div', 'card');
    const h = el('h3', '', '接口设置');
    h.appendChild(el('span', 'tag', '与短篇工坊共用同一份配置'));
    c.appendChild(h);
    const mk = (label, val, ph, type) => {
      const f = el('div', 'field');
      f.appendChild(el('label', '', label));
      const i = el('input');
      i.type = type || 'text';
      i.value = val || '';
      i.placeholder = ph || '';
      i.oninput = () => { i.dataset.v = i.value; };
      i.dataset.v = val || '';
      i.dataset.k = label;
      f.appendChild(i);
      return f;
    };
    const fUrl = mk('Base URL', cfg.baseUrl, 'https://api.deepseek.com/v1');
    const fKey = mk('API Key', cfg.apiKey, 'sk-…', 'password');
    const fModel = mk('模型', cfg.model, 'deepseek-chat');
    c.appendChild(fUrl); c.appendChild(fKey); c.appendChild(fModel);

    const tf = el('div', 'field');
    tf.appendChild(el('label', '', '温度'));
    const ti = el('input'); ti.type = 'range'; ti.min = '0'; ti.max = '1.5'; ti.step = '0.1'; ti.value = String(cfg.temperature);
    const tv = el('span', 'words', String(cfg.temperature));
    ti.oninput = () => { tv.textContent = ti.value; ti.dataset.v = ti.value; };
    ti.dataset.v = ti.value;
    tf.appendChild(ti); tf.appendChild(tv);
    c.appendChild(tf);

    const mtf = el('div', 'field');
    mtf.appendChild(el('label', '', '单次输出上限（max_tokens）'));
    const mti = el('input'); mti.type = 'number'; mti.value = String(cfg.maxTokens || 32000);
    mti.oninput = () => { mti.dataset.v = mti.value; };
    mti.dataset.v = mti.value;
    mtf.appendChild(mti);
    c.appendChild(mtf);
    c.appendChild(el('div', 'hint', '模型名带 seed/doubao 才会自动关深度思考；其他模型不加该参数。'));

    const acts = el('div', 'sheet-acts');
    const save = el('button', 'primary-btn', '保存');
    save.onclick = () => {
      const inputs = c.querySelectorAll('[data-v]');
      const patch = {
        baseUrl: fUrl.querySelector('input').value.trim(),
        apiKey: fKey.querySelector('input').value.trim(),
        model: fModel.querySelector('input').value.trim(),
        temperature: parseFloat(ti.value),
        maxTokens: parseInt(mti.value, 10) || 32000
      };
      Store.setCfg(patch);
      toast('已保存');
      view = cur ? (cur.units.length ? 'units' : 'book') : 'home';
      render();
    };
    const test = el('button', 'ghost-btn', '测试连接');
    test.onclick = async () => {
      test.disabled = true; test.textContent = '测试中…';
      try {
        Store.setCfg({
          baseUrl: fUrl.querySelector('input').value.trim(),
          apiKey: fKey.querySelector('input').value.trim(),
          model: fModel.querySelector('input').value.trim()
        });
        const r = await API.testConn();
        toast('连接正常：' + String(r).slice(0, 20));
      } catch (e) {
        alert('连接失败：' + e.message);
      }
      test.disabled = false; test.textContent = '测试连接';
    };
    acts.appendChild(save); acts.appendChild(test);
    c.appendChild(acts);
    stage.appendChild(c);
  }

  /* ---------- 事件绑定 ---------- */
  $('#btnHome').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    view = 'home'; render();
  };
  $('#btnUnits').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    if (!cur) return;
    view = 'units'; render();
  };
  $('#btnSet').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    view = 'settings'; render();
  };
  $('#btnStop').onclick = () => {
    if (busy && busy.ctrl) { busy.ctrl.abort(); toast('已停止'); }
  };

  window.APP = {
    el, $, toast, sheet, closeSheet, persist, render, renderTop, updateDock,
    stage,
    get cur() { return cur; },
    get busy() { return busy; },
    setBusy(b) { busy = b; updateDock(); },
    get app() { return app; },
    get view() { return view; },
    setView(v) { view = v; },
    get curStep() { return curStep; },
    setCurStep(k) { curStep = k; },
    get curUnitStep() { return curUnitStep; },
    setCurUnitStep(k) { curUnitStep = k; },
    curUnit, docOf, setStream, endStream, persist, fmtTime, openBook, nextUnitStep
  };

  /* 启动渲染 */
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
