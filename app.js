/* app.js — 长篇工坊界面与流程控制 */
window.APP_VERSION = 'v39-aifill';
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
    bApprove: $('#btnApprove'), bStop: $('#btnStop'), bUnits: $('#btnUnits'),
    bBook: $('#btnBook'), bFacts: $('#btnFacts'), bAudit: $('#btnAudit'), bFb: $('#btnFb')
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
    /* 弹窗打开时把悬浮意见窗收起来，避免遮挡 */
    if (window.FBFLOAT && FBFLOAT.isShowing && FBFLOAT.isShowing()) {
      window.__fbWasShowing = true;
      FBFLOAT.hide();
    }
    const s = $('#sheet');
    $('#sheetBody').innerHTML = html;
    s.hidden = false;
    s.classList.remove('hide');
    if (onMount) onMount($('#sheetBody'));
    const close = $('.close', $('#sheetBody'));
    if (close) close.onclick = closeSheet;
    s.onclick = (e) => { if (e.target === s) closeSheet(); };
  }
  function closeSheet() {
    $('#sheet').hidden = true; $('#sheet').classList.add('hide');
    /* 弹窗关闭后恢复之前开着的悬浮意见窗 */
    if (window.__fbWasShowing && window.FBFLOAT) {
      window.__fbWasShowing = false;
      FBFLOAT.show();
    }
  }
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
      els.sub.textContent = '选择或新建一本书 · ' + (window.APP_VERSION || '');
      els.bUnits.hidden = true;
      if (els.bBook) els.bBook.hidden = true;
      if (els.bFacts) els.bFacts.hidden = true;
      if (els.bAudit) els.bAudit.hidden = true;
      return;
    }
    els.project.textContent = cur.title;
    const u = curUnit();
    if (view === 'unit' && u) {
      const t = LEngine.tierOf(u);
      els.sub.textContent = `第${u.idx + 1}篇 · ${u.kind === 'side' ? '副线' : '主线'} · ${t.name}档 约${t.words}字`;
    } else if (view === 'grid') {
      els.sub.textContent = `主线推进表 · ${(cur.spine || []).length} 格（可编辑）`;
    } else if (view === 'backup') {
      const n = (cur ? 0 : 0);
      els.sub.textContent = '备份与恢复 · 全部数据';
    } else if (view === 'audit') {
      const dn = cur.units.filter(u => LEngine.docOf(u.steps.relay)).length;
      els.sub.textContent = `进度对账 · 已完成 ${dn} 篇`;
    } else if (view === 'facts') {
      const pn = ((cur.facts && cur.facts.people) || []).length;
      const fn = (cur.foreshadow || []).filter(x => x.status === 'open').length;
      els.sub.textContent = `硬事实表 · ${pn} 人 · ${fn} 条待收伏笔`;
    } else if (view === 'units') {
      els.sub.textContent = `共 ${cur.units.length} 篇 · 目标 ${(cur.target / 10000).toFixed(0)} 万字 · 规划 ${(LEngine.totalWords(cur) / 10000).toFixed(1)} 万字`;
    } else {
      els.sub.textContent = '全书层 · ' + (LT.BOOK_STEP_NAME[curStep] || '');
    }
    els.bUnits.hidden = false;
    if (els.bBook) els.bBook.hidden = false;
    if (els.bFacts) els.bFacts.hidden = false;
    if (els.bAudit) els.bAudit.hidden = false;
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
        const cls = 'step-chip ' + (curUnitStep === k ? 'cur ' : '')
          + (s.status === 'stale' ? 'stale-step' : (s.status === 'done' ? 'ok' : (docOf(s) || (k === 'draft' && (s.parts || []).some(Boolean)) ? '' : 'lock')));
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
    syncCur();
    /* 先隐藏悬浮意见窗，需要它的页面会在渲染中重新绑定 */
    if (window.FBFLOAT) FBFLOAT.hide();
    if (cur) Books.migrateBook(cur);
    renderTop();
    renderSteps();
    $('#btnExport').hidden = !(cur && view !== 'home');
    $('#dock').classList.toggle('empty', !cur || view === 'home' || view === 'units' || view === 'facts' || view === 'audit' || view === 'backup' || view === 'grid');
    stage.innerHTML = '';
    if (view === 'home') { renderHome(); updateDock(); return; }
    if (view === 'settings') { renderSettings(); updateDock(); return; }
    if (view === 'backup') { BACKUPUI.renderBackup(); updateDock(); return; }
    if (!cur) { view = 'home'; renderHome(); return; }
    if (view === 'units') { UNITUI.renderUnitList(); updateDock(); return; }
    if (view === 'facts') { FACTSUI.renderFacts(); updateDock(); return; }
    if (view === 'audit') { AUDITUI.renderAudit(); updateDock(); return; }
    if (view === 'grid') { GRIDUI.renderGrid(); updateDock(); return; }
    if (view === 'book') { BOOKUI.renderBook(); updateDock(); return; }
    if (view === 'unit') { UNITUI2.renderUnit(); updateDock(); return; }
  }

  /* ---------- 底栏 ---------- */
  function updateDock() {
    const hide = () => ['bRevise', 'bRegen', 'bGen', 'bApprove', 'bFb'].forEach(k => { if (els[k]) els[k].hidden = true; });
    if (!cur || view === 'home' || view === 'units' || view === 'settings' || view === 'facts' || view === 'audit' || view === 'backup' || view === 'grid') { hide(); els.dockInfo.textContent = ''; return; }

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

    /* 「意见」唤回按钮：只有在有可写意见的环节、且窗口被关掉时才显示 */
    if (els.bFb) {
      const canFb = !!s && (has || !!fb || (s.versions && s.versions.length));
      const needShow = window.FBFLOAT && FBFLOAT.hasTarget() && !FBFLOAT.isShowing();
      els.bFb.hidden = !(canFb && needShow);
    }

    els.bGen.textContent = isDraft ? '写这一节' : '生成';
    els.bRevise.textContent = isDraft ? '✎ 改本节' : '✎ 改原稿';
    els.bRevise.classList.toggle('need-fb', !fb);
    els.bRevise.title = fb
      ? '带原稿 + 意见：只改你提到的地方，其它段落保持不动'
      : '先在右边写审核意见';
    els.bRegen.textContent = fb
      ? (isDraft ? '↻ 重写本节' : '↻ 按意见重写')
      : (isDraft ? '↻ 重写本节' : '↻ 重新生成');
    els.bRegen.title = fb
      ? '带意见但不带原稿：从头再写一版，可能和你原来的不一样'
      : '不带任何东西，重新生成一版';

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
    const bkBtn = el('button', 'ghost-btn wide', '⤓ 备份与恢复');
    bkBtn.onclick = () => { view = 'backup'; render(); };
    head.appendChild(bkBtn);
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

  /* 内存里的 cur 与 localStorage 里的当前书脱节时，重新对齐。
     （页面恢复、外部改存储、多标签页等场景） */
  function syncCur() {
    const id = Books.currentId();
    if (!id) return false;
    if (!cur || cur.id !== id) {
      const b = Books.get(id);
      if (b) { cur = b; return true; }
    }
    return false;
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
    mtf.appendChild(mti);
    c.appendChild(mtf);

    /* 两个开关 */
    const sw = (label, hint, checked, key) => {
      const row = el('div', 'switch-row');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!checked; cb.dataset.sw = key;
      const lb = el('label', '', label);
      const box = el('span', 'sw-box');
      box.appendChild(cb);
      row.appendChild(box); row.appendChild(lb);
      const wrap = el('div', '');
      wrap.appendChild(row);
      if (hint) wrap.appendChild(el('div', 'hint', hint));
      return wrap;
    };
    c.appendChild(sw('流式输出', '边写边显示。关掉后要等整段生成完才出现。', cfg.stream !== false, 'stream'));
    c.appendChild(sw('关闭深度思考', '豆包 seed 系列默认开启深度思考。勾上会传 thinking.type=disabled，长文生成快很多。', cfg.noThinking !== false, 'noThinking'));
    c.appendChild(el('div', 'hint', '模型名带 doubao-seed / seed- 才会自动传关闭参数；glm-5-3 起官方不支持关闭，会自动跳过。'));

    const acts = el('div', 'sheet-acts');
    const save = el('button', 'primary-btn', '保存');
    save.onclick = () => {
      const patch = {
        baseUrl: fUrl.querySelector('input').value.trim(),
        apiKey: fKey.querySelector('input').value.trim(),
        model: fModel.querySelector('input').value.trim(),
        temperature: parseFloat(ti.value),
        maxTokens: parseInt(mti.value, 10) || 32000
      };
      c.querySelectorAll('[data-sw]').forEach(cb => { patch[cb.dataset.sw] = cb.checked; });
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

    /* 版本信息 + 强制更新 */
    const vc = el('div', 'card');
    vc.appendChild(el('h3', '', '版本'));
    const ver = window.APP_VERSION || '未知';
    vc.appendChild(el('div', 'kv')).appendChild(el('b', '', ver));
    vc.appendChild(el('div', 'hint', '如果功能没生效，说明设备还在用旧缓存。点下面按钮强制清缓存重载。'));
    const fb = el('button', 'primary-btn wide', '强制清缓存并重载');
    fb.onclick = async () => {
      fb.disabled = true; fb.textContent = '清理中…';
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
          const rs = await navigator.serviceWorker.getRegistrations();
          for (const r of rs) await r.unregister();
        }
        if (window.caches) {
          const ks = await caches.keys();
          for (const k of ks) await caches.delete(k);
        }
      } catch (e) {}
      location.replace(location.pathname + '?fresh=' + Date.now());
    };
    vc.appendChild(fb);

    const bk = el('button', 'ghost-btn wide', '⤓ 备份与恢复');
    bk.onclick = () => { view = 'backup'; render(); };
    vc.appendChild(bk);
    stage.appendChild(vc);
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
  $('#btnBook').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    if (!cur) return;
    view = 'book';
    /* 优先进入「有内容但还没通过」的那一环，其次第一个没做完的 */
    const order = LT.BOOK_STEPS;
    const withContent = order.find(k => {
      const s = cur.steps[k];
      return docOf(s) && s.status !== 'done';
    });
    const lastWithContent = [...order].reverse().find(k => docOf(cur.steps[k]));
    const firstEmpty = order.find(k => !docOf(cur.steps[k]));
    curStep = withContent || lastWithContent || firstEmpty || order[0];
    render();
  };
  $('#btnAudit').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    if (!cur) return;
    view = 'audit'; render();
  };
  $('#btnFacts').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    if (!cur) return;
    view = 'facts'; render();
  };
  $('#btnSet').onclick = () => {
    if (busy) { toast('正在生成，先等一下'); return; }
    view = 'settings'; render();
  };
  $('#btnFb').onclick = () => {
    if (window.FBFLOAT) {
      FBFLOAT.init();
      FBFLOAT.show();
    }
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
    curUnit, docOf, setStream, endStream, persist, fmtTime, openBook, nextUnitStep, syncCur
  };

  /* 启动渲染 */
  render();
  /* 不再注册 Service Worker：它会把旧 JS 缓存住，导致更新后功能不生效。
     GitHub Pages 本身就够快，离线能力不值得为此牺牲更新可靠性。 */
  if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
    navigator.serviceWorker.getRegistrations().then(rs => {
      rs.forEach(r => r.unregister());
    }).catch(() => {});
  }
})();
