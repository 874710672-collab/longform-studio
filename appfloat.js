/* appfloat.js — 审核意见悬浮窗（可拖动、可折叠、位置记忆） */
(function () {
  const A = window.APP;
  const els = () => ({
    box: document.getElementById('fbFloat'),
    head: document.getElementById('fbFloatHead'),
    body: document.getElementById('fbFloatBody'),
    ta: document.getElementById('fbFloatTa'),
    toggle: document.getElementById('fbFloatToggle')
  });

  let curStepRef = null;     // 当前绑定的 step 对象
  let dismissed = false;     // 用户是否主动关掉了
  let dragging = false;
  let pos = null;            // {x, y}
  const POS_KEY = 'll_fb_pos_v1';
  const OPEN_KEY = 'll_fb_open_v1';

  /* 读取记忆位置 */
  function loadPos() {
    try {
      const s = localStorage.getItem(POS_KEY);
      if (s) return JSON.parse(s);
    } catch (e) {}
    return null;
  }
  function savePos(p) {
    pos = p;
    try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (e) {}
  }

  /* 把窗口限制在可视区 */
  function clamp(x, y, box) {
    const maxX = window.innerWidth - box.offsetWidth - 8;
    const maxY = window.innerHeight - box.offsetHeight - 8;
    return {
      x: Math.max(8, Math.min(maxX, x)),
      y: Math.max(56, Math.min(maxY, y))
    };
  }

  function applyPos(box, x, y) {
    const p = clamp(x, y, box);
    box.style.left = p.x + 'px';
    box.style.top = p.y + 'px';
    box.style.right = 'auto';
    box.style.bottom = 'auto';
    savePos(p);
  }

  /* 绑定一个步骤的 feedback */
  function bind(step, label) {
    if (!step) { hide(); return; }
    lastStep = step;
    lastLabel = label || '审核意见';
    curStepRef = step;
    /* 用户主动关掉的，不在自动渲染时强行弹出 */
    if (dismissed) { notify(); return; }
    const e = els();
    if (!e.box) return;
    e.box.hidden = false;
    e.ta.value = step.feedback || '';
    const t = e.head.querySelector('.fb-float-title');
    if (t) t.textContent = lastLabel;
    notify();
  }

  /* 记录最近一次的绑定，用于"唤回" */
  let lastStep = null;
  let lastLabel = '';

  function hide() {
    const e = els();
    if (e.box) e.box.hidden = true;
    curStepRef = null;
    notify();
  }

  /* 用户主动关闭（点 ×）：隐藏但保留可唤回 */
  function close() {
    const e = els();
    if (e.box) e.box.hidden = true;
    curStepRef = null;
    dismissed = true;
    notify();
  }

  /* 唤回：重新显示并绑定上一次的 step */
  function show() {
    const e = els();
    if (!e.box) return;
    e.box.hidden = false;
    dismissed = false;
    if (lastStep) bind(lastStep, lastLabel);
    notify();
  }

  function isShowing() {
    const e = els();
    return !!(e.box && !e.box.hidden);
  }

  function hasTarget() { return !!lastStep; }

  /* 通知外部按钮状态变化 */
  function notify() {
    if (window.APP && window.APP.updateDock) {
      try { window.APP.updateDock(); } catch (e) {}
    }
  }

  /* 初始化 DOM 与事件（只做一次） */
  function init() {
    const e = els();
    if (!e.box) {
      /* DOM 由 index.html 提供，这里兜底创建 */
      build();
    }
    const { box, head, ta, toggle } = els();
    if (!box || box.dataset.ready) return;
    box.dataset.ready = '1';

    /* 恢复位置 */
    const saved = loadPos();
    if (saved) {
      applyPos(box, saved.x, saved.y);
    } else {
      /* 默认右下角 */
      requestAnimationFrame(() => {
        applyPos(box, window.innerWidth - box.offsetWidth - 12, window.innerHeight - box.offsetHeight - 90);
      });
    }

    /* 恢复展开状态 */
    const openSaved = localStorage.getItem(OPEN_KEY);
    if (openSaved === '0') collapse(true);

    /* 拖动 */
    let startX = 0, startY = 0, originX = 0, originY = 0;

    const onDown = (ev) => {
      if (ev.target === toggle || ev.target === close) return;
      const p = ev.touches ? ev.touches[0] : ev;
      dragging = true;
      box.classList.add('dragging');
      startX = p.clientX; startY = p.clientY;
      const r = box.getBoundingClientRect();
      originX = r.left; originY = r.top;
      ev.preventDefault();
    };
    const onMove = (ev) => {
      if (!dragging) return;
      const p = ev.touches ? ev.touches[0] : ev;
      const nx = originX + (p.clientX - startX);
      const ny = originY + (p.clientY - startY);
      applyPos(box, nx, ny);
      ev.preventDefault();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      box.classList.remove('dragging');
    };

    head.addEventListener('mousedown', onDown);
    head.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);

    /* 折叠 */
    if (toggle) toggle.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const collapsed = box.classList.contains('collapsed');
      collapse(!collapsed);
    });


    /* 输入即保存 */
    ta.addEventListener('input', () => {
      if (!curStepRef) return;
      curStepRef.feedback = ta.value;
      A.persist();
      A.updateDock();
    });

    /* 窗口尺寸变化时收进可视区 */
    window.addEventListener('resize', () => {
      if (!pos) return;
      applyPos(box, pos.x, pos.y);
    });
  }

  function collapse(on) {
    const { box, toggle } = els();
    if (!box) return;
    box.classList.toggle('collapsed', on);
    if (toggle) toggle.textContent = on ? '▴' : '▾';
    try { localStorage.setItem(OPEN_KEY, on ? '0' : '1'); } catch (e) {}
  }

  /* DOM 兜底构建 */
  function build() {
    const box = document.createElement('div');
    box.id = 'fbFloat';
    box.className = 'fb-float';
    box.hidden = true;
    box.innerHTML = `
      <div class="fb-float-head" id="fbFloatHead">
        <span class="fb-drag">⠿</span>
        <span class="fb-float-title">审核意见</span>
        <button class="fb-mini" id="fbFloatToggle">▾</button>
      </div>
      <div class="fb-float-body" id="fbFloatBody">
        <textarea id="fbFloatTa" placeholder="例：反派动机太弱，要写成他当年被主角父亲救过一次…"></textarea>
        <div class="fb-float-hint">写完后点底栏「✎ 改原稿」或「↻ 按意见重写」</div>
      </div>`;
    document.body.appendChild(box);
  }

  window.FBFLOAT = { init, bind, hide, close, show, collapse, isShowing, hasTarget };
})();
