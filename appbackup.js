/* appbackup.js — 备份与恢复界面 */
(function () {
  const A = window.APP;
  const el = A.el;
  const toast = A.toast;
  const stage = A.stage;

  function renderBackup() {
    const b = A.cur;

    /* 概览 */
    const c = el('div', 'card');
    const h = el('h3', '', '备份与恢复');
    h.appendChild(el('span', 'tag', '全部数据'));
    c.appendChild(h);

    const all = BACKUP.build();
    const st = all.stats;
    const stRow = el('div', 'stat-row');
    const one = (label, v) => {
      const d = el('div', 'stat');
      d.appendChild(el('b', '', String(v)));
      d.appendChild(el('span', '', label));
      return d;
    };
    stRow.appendChild(one('本书', st.books));
    stRow.appendChild(one('单元', st.units));
    stRow.appendChild(one('定稿', st.done));
    c.appendChild(stRow);
    c.appendChild(el('div', 'hint', '当前数据大小约 ' + BACKUP.sizeText(all)));

    /* 导出 */
    const exp = el('button', 'primary-btn wide', '⤓ 导出全部数据');
    exp.onclick = () => {
      const obj = BACKUP.build();
      BACKUP.download(obj, `长篇工坊-全部数据-${BACKUP.stamp()}.json`);
      toast('已导出，检查「文件」App 的下载目录');
    };
    c.appendChild(exp);
    c.appendChild(el('div', 'hint',
      '导出的是一个 JSON 文件，包含：所有书的正文、大纲、交棒单、硬事实表、伏笔账、时间线，以及接口配置。\n'
      + '在 iPad 上会存到「文件 → 下载」。建议定期导一份。'));
    stage.appendChild(c);

    /* 导入 */
    const ic = el('div', 'card');
    const ih = el('h3', '', '导入');
    ih.appendChild(el('span', 'tag', '从备份文件恢复'));
    ic.appendChild(ih);

    const pick = el('button', 'ghost-btn wide', '⤒ 选择备份文件');
    pick.onclick = () => openPicker();
    ic.appendChild(pick);

    const paste = el('button', 'ghost-btn wide', '⌨ 粘贴 JSON 文本');
    paste.onclick = () => openPaste();
    ic.appendChild(paste);

    ic.appendChild(el('div', 'hint',
      '两种方式：选文件（从「文件」App 里挑 .json）或直接粘贴文本（适合从备忘录/聊天记录里恢复）。'));
    stage.appendChild(ic);

    /* 危险区 */
    const dc = el('div', 'card');
    const dh = el('h3', '', '清空');
    dh.appendChild(el('span', 'tag', '不可撤销'));
    dc.appendChild(dh);
    dc.appendChild(el('div', 'hint', '删除本机所有书和配置。清空前必须先导出一份。'));
    const clr = el('button', 'mini danger-t', '清空全部数据');
    clr.onclick = () => {
      const v = prompt('这会删除全部书籍和配置，无法撤销。\n\n请输入「确认清空」四个字：');
      if (v !== '确认清空') { toast('已取消'); return; }
      Object.values(BACKUP.KEYS).forEach(k => localStorage.removeItem(k));
      toast('已清空，正在重载…');
      setTimeout(() => location.replace(location.pathname + '?cleared=' + Date.now()), 600);
    };
    dc.appendChild(clr);
    stage.appendChild(dc);
  }

  /* ---------- 选文件 ---------- */
  function openPicker() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) { inp.remove(); return; }
      const rd = new FileReader();
      rd.onload = () => {
        inp.remove();
        let obj = null;
        try { obj = JSON.parse(rd.result); }
        catch (e) { alert('文件解析失败：不是有效的 JSON'); return; }
        showConfirm(obj, f.name);
      };
      rd.onerror = () => { alert('读取文件失败'); inp.remove(); };
      rd.readAsText(f);
    };
    inp.click();
  }

  /* ---------- 粘贴 ---------- */
  function openPaste() {
    A.sheet(`<h2>粘贴备份 JSON<button class="close">×</button></h2>
      <div class="field"><label>把备份文件的内容整段粘进来</label>
      <textarea id="pasteBox" rows="10" placeholder='{"format":"longform-studio-backup", ...}'></textarea></div>
      <div class="sheet-acts"><button class="primary-btn" id="pasteOk">解析</button></div>`,
      (root) => {
        root.querySelector('#pasteOk').onclick = () => {
          const txt = root.querySelector('#pasteBox').value.trim();
          if (!txt) { toast('还没粘贴内容'); return; }
          let obj = null;
          try { obj = JSON.parse(txt); }
          catch (e) { alert('解析失败：格式不对\n\n' + e.message.slice(0, 120)); return; }
          A.closeSheet();
          showConfirm(obj, '粘贴的文本');
        };
      });
  }

  /* ---------- 确认导入 ---------- */
  function showConfirm(obj, sourceName) {
    const v = BACKUP.validate(obj);
    if (!v.ok) { alert('无法导入：' + v.msg); return; }

    /* 统计备份内容 */
    let books = [];
    if (obj.format === 'longform-studio-backup') books = (obj.data && obj.data.books) || [];
    else if (obj.data && obj.data.books) books = obj.data.books;
    else if (obj.id && obj.units) books = [obj];

    const unitN = books.reduce((a, b) => a + ((b.units || []).length), 0);
    const local = JSON.parse(localStorage.getItem(BACKUP.KEYS.books) || '[]');
    const localIds = new Set(local.map(b => b.id));
    const dupN = books.filter(b => localIds.has(b.id)).length;

    let html = `<h2>确认导入<button class="close">×</button></h2>`;
    html += `<div class="kv"><span>来源</span><b>${sourceName}</b></div>`;
    if (obj.exportedAt) html += `<div class="kv"><span>备份时间</span><b>${new Date(obj.exportedAt).toLocaleString('zh-CN')}</b></div>`;
    html += `<div class="kv"><span>备份内容</span><b>${books.length} 本 · ${unitN} 个单元</b></div>`;
    html += `<div class="kv"><span>本机现有</span><b>${local.length} 本</b></div>`;
    if (dupN) html += `<div class="kv"><span>其中重名/重复</span><b class="warn-txt">${dupN} 本</b></div>`;
    if (v.warn) html += `<div class="cap-tip thin">${v.warn}</div>`;

    html += `<div class="hint" style="margin-top:14px">选一种方式：</div>`;
    html += `<div class="menu-list">
      <button class="menu-item" data-mode="merge">⊕ 合并 —— 保留本机已有的，重复的取较新的一份<br><span class="sub">最安全，推荐</span></button>
      <button class="menu-item danger" data-mode="replace">⇄ 覆盖 —— 清空本机书库，只用备份里的<br><span class="sub">会丢掉本机独有的书（配置会保留）</span></button>
    </div>`;

    A.sheet(html, (root) => {
      root.querySelectorAll('[data-mode]').forEach(btn => {
        btn.onclick = () => {
          const mode = btn.dataset.mode;
          let res = null;
          try {
            res = BACKUP.apply(obj, mode);
          } catch (e) {
            alert('导入失败：' + e.message);
            return;
          }
          A.closeSheet();
          showResult(res);
        };
      });
    });
  }

  function showResult(res) {
    let html = `<h2>导入完成<button class="close">×</button></h2>`;
    if (res.mode === 'merge') {
      html += `<div class="kv"><span>新增</span><b>${res.added} 本</b></div>`;
      html += `<div class="kv"><span>更新</span><b>${res.updated} 本</b></div>`;
    } else {
      html += `<div class="kv"><span>已覆盖</span><b>${res.replaced} 本</b></div>`;
    }
    html += `<div class="kv"><span>现在共</span><b>${res.books} 本</b></div>`;
    if (res.cfgImported) html += `<div class="cap-tip ok">接口配置也一并恢复了</div>`;
    html += `<div class="sheet-acts"><button class="primary-btn" id="doneBtn">重新载入</button></div>`;
    A.sheet(html, (root) => {
      root.querySelector('#doneBtn').onclick = () => {
        location.replace(location.pathname + '?imported=' + Date.now());
      };
    });
  }

  window.BACKUPUI = { renderBackup };
})();
