/* autofit.js — textarea 安全自适应高度
   背景：在 iOS/iPadOS 上，把 style.height 先设 'auto' 再读 scrollHeight，
   会让外层滚动容器瞬间塌缩，Safari 立即修正 scrollTop → 页面"跳上去"。
   做法：
   1) 优先让 CSS 的 field-sizing: content 处理（iPadOS 18+），JS 直接跳过；
   2) 老系统用"同一帧内先还原再改"的方式测量，不产生中间态；
   3) 每次调整后强制还原外层滚动容器的 scrollTop。
*/
(function () {
  /* 判断浏览器是否支持 field-sizing: content */
  const supportsFieldSizing = (() => {
    try {
      return CSS.supports('field-sizing', 'content');
    } catch (e) { return false; }
  })();

  /* 找到该元素所在的可滚动祖先（就是 #stage 之类） */
  function scrollParent(node) {
    let p = node && node.parentElement;
    while (p) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight) return p;
      p = p.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  /* 安全测高：不改中间态 */
  function measure(el) {
    const prevH = el.style.height;
    const prevMin = el.style.minHeight;
    let need = 0;
    try {
      /* 用 min-height 塌到最小，读完立刻还原，浏览器只提交最终样式 */
      el.style.minHeight = '0px';
      el.style.height = '0px';
      need = el.scrollHeight;
    } catch (e) { /* ignore */ }
    el.style.height = prevH;
    el.style.minHeight = prevMin;
    return need;
  }

  /* 应用高度：只有变化明显时才改，避免每键触发重排 */
  function apply(el, opts) {
    const o = opts || {};
    const min = o.min || 280;
    if (supportsFieldSizing && !o.force) return;   /* CSS 已接管 */

    const need = measure(el);
    const target = Math.max(min, need + 2);
    const cur = el.offsetHeight;
    if (Math.abs(cur - target) > 4) {
      el.style.height = target + 'px';
    }
    el.style.overflow = 'hidden';
  }

  /* 绑定：输入时自适应，并锁定外层滚动位置 */
  function attach(el, opts) {
    const o = opts || {};
    const min = o.min || 280;

    /* 已经由 CSS 接管时，只负责滚动锁定 */
    const doFit = () => {
      if (supportsFieldSizing && !o.force) return;
      const sp = scrollParent(el);
      const y = sp ? sp.scrollTop : 0;
      apply(el, o);
      if (sp && sp !== document.documentElement) sp.scrollTop = y;
    };

    /* 初次 */
    requestAnimationFrame(() => {
      if (supportsFieldSizing && !o.force) {
        el.style.minHeight = min + 'px';
        el.style.overflow = 'hidden';
      } else {
        apply(el, o);
      }
    });

    let raf = 0;
    el.addEventListener('input', () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { raf = 0; doFit(); });
    });
    el.addEventListener('paste', () => setTimeout(doFit, 0));

    return { fit: doFit, supportsFieldSizing };
  }

  window.AUTOFIT = { attach, apply, measure, supportsFieldSizing };
})();
