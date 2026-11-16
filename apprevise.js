/* apprevise.js — 修订与重生成按钮逻辑
   三个动作：
     ✎ 按意见改原稿  —— 带原稿 + 意见，只改提到的地方
     ↻ 按意见重生成  —— 带意见，但不带原稿，从头写
     （无意见时）↻ 重新生成 —— 什么都不带，重写一版
*/
(function () {
  const A = window.APP;
  function cur() { return A.cur; }

  /* 通用：跑一次生成，把结果存成新版本 */
  async function run({ label, key, scope, u, producer, after }) {
    const b = cur();
    if (!b || A.busy) return;
    const ctrl = new AbortController();
    A.setBusy({ ctrl, label, text: '', key });
    A.render();
    A.setStream('');
    try {
      const out = await producer(ctrl.signal, (d, full) => {
        A.setBusy(Object.assign({}, A.busy, { text: full }));
        A.setStream(full); A.updateDock();
      });
      if (!out || !String(out).trim()) throw new Error('返回为空，可能被截断了');
      const s = scope === 'book' ? b.steps[key] : u.steps[key];
      s.versions.push({ text: String(out).trim(), at: Date.now() });
      s.sel = s.versions.length - 1;
      s.status = 'ready';
      if (after) after(s);
      Books.save(b);
      A.setBusy(null); A.render();
      A.toast('完成，旧稿保留在「稿 N」里');
    } catch (e) {
      A.setBusy(null); A.endStream(); A.render();
      if (e.name !== 'AbortError') alert('失败：' + e.message);
    }
  }

  /* 当前环节的说明文字 */
  function ctxOf() {
    const b = cur();
    if (!b) return null;
    if (A.view === 'book') {
      return { b, scope: 'book', key: A.curStep, u: null, step: b.steps[A.curStep] };
    }
    if (A.view === 'unit') {
      const u = A.curUnit();
      if (!u) return null;
      const key = A.curUnitStep;
      return { b, scope: 'unit', key, u, step: u.steps[key] };
    }
    return null;
  }

  /* ---------- 按意见改原稿 ---------- */
  async function reviseKeep(text) {
    const c = ctxOf();
    if (!c) return;
    const fb = (c.step.feedback || '').trim();
    if (!fb) { A.toast('先在右边写审核意见'); return; }
    if (!A.docOf(c.step)) { A.toast('还没有原稿，先点「生成」'); return; }

    await run({
      label: '正在按意见改（保留原稿结构）',
      key: c.key, scope: c.scope, u: c.u,
      producer: (signal, onDelta) => REVISE.chat(
        c.b, c.u, c.key, A.docOf(c.step), fb, onDelta, signal, c.scope
      )
    });
  }

  /* ---------- 按意见重生成（不带原稿） ---------- */
  async function reviseFresh() {
    const c = ctxOf();
    if (!c) return;
    const fb = (c.step.feedback || '').trim();
    if (!fb) { A.toast('先在右边写审核意见'); return; }

    await run({
      label: '正在按意见重写',
      key: c.key, scope: c.scope, u: c.u,
      producer: (signal, onDelta) => c.scope === 'book'
        ? LEngine.genBookStep(c.b, c.key, onDelta, signal)
        : LEngine.genUnitStep(c.b, c.u, c.key, onDelta, signal)
    });
  }

  /* ---------- 无意见重写 ---------- */
  async function regen() {
    const c = ctxOf();
    if (!c) return;
    await run({
      label: '正在重新生成',
      key: c.key, scope: c.scope, u: c.u,
      producer: (signal, onDelta) => c.scope === 'book'
        ? LEngine.genBookStep(c.b, c.key, onDelta, signal)
        : LEngine.genUnitStep(c.b, c.u, c.key, onDelta, signal)
    });
  }

  /* ---------- 单节正文的三种动作 ---------- */
  async function partReviseKeep(b, u, idx) {
    const d = u.steps.draft;
    const fb = (d.feedback || '').trim();
    if (!fb) { A.toast('先在右边写审核意见'); return; }
    const prev = d.parts[idx] && d.parts[idx].body;
    if (!prev) { A.toast('这一节还没有正文'); return; }

    const ctrl = new AbortController();
    A.setBusy({ ctrl, label: '正在按意见改本节（保留原稿）', text: '', mode: 'unit-draft', partIdx: idx });
    A.render();
    try {
      const sys = LP.get().system + '\n\n' + LP.fill(LP.get().reviseRule, { prevText: prev, feedback: fb });
      const user = REVISE.unitContext(b, u, 'draft');
      const out = await API.chat({
        messages: API.buildMessages(sys, user),
        onDelta: (dl, full) => {
          A.setBusy(Object.assign({}, A.busy, { text: full }));
          A.setStream(full); A.updateDock();
        },
        signal: ctrl.signal
      });
      d.parts[idx] = Object.assign({}, d.parts[idx], {
        body: String(out).trim(),
        issues: LCHECK.checkText(b, u, String(out))
      });
      Books.save(b);
      A.setBusy(null); A.render();
      A.toast('本节已按意见修改，其它节没动');
    } catch (e) {
      A.setBusy(null); A.endStream(); A.render();
      if (e.name !== 'AbortError') alert('失败：' + e.message);
    }
  }

  async function partReviseFresh(b, u, idx) {
    const d = u.steps.draft;
    const fb = (d.feedback || '').trim();
    if (!fb) { A.toast('先在右边写审核意见'); return; }
    const ctrl = new AbortController();
    A.setBusy({ ctrl, label: '正在按意见重写本节', text: '', mode: 'unit-draft', partIdx: idx });
    A.render();
    try {
      const out = await LEngine.genPart(b, u, idx, (dl, full) => {
        A.setBusy(Object.assign({}, A.busy, { text: full }));
        A.setStream(full); A.updateDock();
      }, ctrl.signal);
      const plan = LEngine.outlinePlan(LEngine.unitDoc(u, 'outline'));
      d.parts[idx] = {
        title: (plan[idx] && plan[idx].title) || ('第' + (idx + 1) + '节'),
        body: String(out).trim(),
        issues: LCHECK.checkText(b, u, String(out))
      };
      Books.save(b);
      A.setBusy(null); A.render();
      A.toast('本节已按意见重写');
    } catch (e) {
      A.setBusy(null); A.endStream(); A.render();
      if (e.name !== 'AbortError') alert('失败：' + e.message);
    }
  }

  window.REVISEUI = { reviseKeep, reviseFresh, regen, partReviseKeep, partReviseFresh };
})();
