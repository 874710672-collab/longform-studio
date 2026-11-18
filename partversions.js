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

  /* 当前显示的正文：始终读 body（sel 只表示"当前对应哪一版"，不参与取文本） */
  function currentBody(part) {
    if (!part) return '';
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
    /* 新内容和某一历史版相同，就把 sel 指过去，不再新增 */
    const sameIdx = part.versions.findIndex(v => normText(v.text) === normText(part.body));
    part.sel = sameIdx >= 0 ? sameIdx : -1;
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
  /* 切到某一版：只把 body 换成那一版的文本，sel 记录当前对应哪一版。
     不产生新版本，来回切换多少次都不会增加。 */
  function pick(part, i) {
    if (!part || !Array.isArray(part.versions)) return false;
    if (i === -1) {
      part.sel = -1;
      return true;
    }
    const v = part.versions[i];
    if (!v) return false;
    part.body = v.text || '';
    part.sel = i;
    return true;
  }

  /* 去重：内容完全相同的版本只保留一条（保留最新的位置） */
  function dedupe(part) {
    if (!part || !Array.isArray(part.versions) || part.versions.length < 2) return 0;
    const seen = new Map();   // text -> 最后出现的索引
    part.versions.forEach((v, i) => { seen.set(normText(v.text), i); });
    if (seen.size === part.versions.length) return 0;
    const before = part.versions.length;
    const keep = [];
    const added = new Set();
    part.versions.forEach((v, i) => {
      const key = normText(v.text);
      /* 只保留最后一次出现的那份 */
      if (seen.get(key) === i && !added.has(key)) {
        keep.push(v);
        added.add(key);
      }
    });
    part.versions = keep;
    /* sel 位置可能失效 */
    if (part.sel >= keep.length) part.sel = -1;
    /* 如果当前 body 和某一版相同，把 sel 指到那一版 */
    const sameIdx = keep.findIndex(v => normText(v.text) === normText(part.body));
    if (sameIdx >= 0) part.sel = sameIdx;
    else if (part.sel === -1 && sameIdx < 0) part.sel = -1;
    return before - keep.length;
  }

  function normText(t) {
    return String(t == null ? '' : t).replace(/\s+/g, '').trim();
  }

  /* 全书去重：返回总清除数 */
  function dedupeBook(book) {
    let n = 0;
    (book.units || []).forEach(u => {
      const parts = (u.steps && u.steps.draft && u.steps.draft.parts) || [];
      parts.forEach(p => { n += dedupe(p); });
    });
    return n;
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

  window.PARTVER = { ensure, currentBody, snapshot, write, count, needsTrim, removeVersion, pick, totalOver, dedupe, dedupeBook, SOFT_LIMIT };
})();
