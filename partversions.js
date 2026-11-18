/* partversions.js — 分节正文的每节版本管理（方案 A）
   在不破坏现有 parts[i].body 的前提下，加一个 versions 数组。
   规则：写新内容前把旧的 body 存进 versions；超过 5 份提示用户清理。 */
(function () {

  const SOFT_LIMIT = 5;   // 超过这个数提示清理

  const MAX_KEEP = 30;    // 硬上限，绝对不超过（防意外）

  function ensure(part) {
    if (!part) return null;
    if (!Array.isArray(part.versions)) part.versions = [];
    if (typeof part.sel !== 'number') part.sel = 0;
    return part;
  }

  /* 当前显示的正文：优先用 sel 指向的版本 */
  function currentBody(part) {
    if (!part) return '';
    if (Array.isArray(part.versions) && part.versions.length) {
      const v = part.versions[part.sel];
      if (v) return v.text || '';
    }
    return part.body || '';
  }

  /* 把当前 body 存成一份版本（在写入新内容之前调用） */
  function snapshot(part, note) {
    if (!part) return;
    ensure(part);
    const cur = part.body || '';
    if (!cur.trim()) return;       // 空的不存
    /* 如果和最后一份相同，不重复存 */
    const last = part.versions[part.versions.length - 1];
    if (last && last.text === cur) return;
    part.versions.push({ text: cur, at: Date.now(), note: note || '' });
    /* 硬上限：超出时丢最旧的 */
    while (part.versions.length > MAX_KEEP) part.versions.shift();
  }

  /* 写入新正文：先存旧的，再替换 */
  function write(part, newBody, note) {
    if (!part) return;
    ensure(part);
    snapshot(part, note);
    part.body = String(newBody || '');
    /* 写完后 sel 指向"当前"—— 用一个哨兵表示 */
    part.sel = -1;
  }

  /* 版本数（不含当前） */
  function count(part) {
    if (!part || !Array.isArray(part.versions)) return 0;
    return part.versions.length;
  }

  /* 是否需要提示清理 */
  function needsTrim(part) {
    return count(part) > SOFT_LIMIT;
  }

  /* 删除某一版 */
  function removeVersion(part, i) {
    if (!part || !Array.isArray(part.versions)) return false;
    if (i < 0 || i >= part.versions.length) return false;
    part.versions.splice(i, 1);
    if (part.sel >= part.versions.length) part.sel = part.versions.length - 1;
    if (part.sel < -1) part.sel = -1;
    return true;
  }

  /* 切到某一版：把它的文本变成当前 body，旧的当前内容仍留在 versions 里 */
  function pick(part, i) {
    if (!part || !Array.isArray(part.versions)) return false;
    const v = part.versions[i];
    if (!v) return false;
    /* 当前内容如果和要切换的不同，先存起来 */
    const cur = part.body || '';
    const last = part.versions[part.versions.length - 1];
    if (cur.trim() && (!last || last.text !== cur)) {
      part.versions.push({ text: cur, at: Date.now(), note: '切换前' });
      while (part.versions.length > MAX_KEEP) part.versions.shift();
    }
    part.body = v.text;
    part.sel = -1;
    return true;
  }

  /* 全部次数统计（用于提示） */
  function totalOver(book) {
    let n = 0;
    (book.units || []).forEach(u => {
      const parts = (u.steps && u.steps.draft && u.steps.draft.parts) || [];
      parts.forEach(p => { if (needsTrim(p)) n++; });
    });
    return n;
  }

  window.PARTVER = { ensure, currentBody, snapshot, write, count, needsTrim, removeVersion, pick, totalOver, SOFT_LIMIT };
})();
