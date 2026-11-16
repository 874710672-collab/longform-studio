/* lcheck.js — 长篇跨单元一致性检查（不花 token） */
(function () {
  const CLICHE = ['不禁', '不由得', '心中一颤', '宛如', '仿佛', '嘴角勾起', '与此同时', '心中暗想', '若有所思'];

  /* 单节正文检查 */
  function checkText(book, u, text) {
    const issues = [];
    if (!text) return issues;
    const people = (book.facts && book.facts.people) || [];
    const names = people.map(p => p.name).filter(Boolean);

    /* 1. 人名误写：同姓不同字 */
    if (names.length) {
      const surnameMap = {};
      names.forEach(n => { if (n.length >= 2) (surnameMap[n[0]] = surnameMap[n[0]] || []).push(n); });
      const seen = new Set();
      const re = /[\u4e00-\u9fa5]{2,3}/g;
      let m;
      while ((m = re.exec(text))) {
        const cand = m[0];
        if (names.includes(cand) || seen.has(cand)) continue;
        const sib = surnameMap[cand[0]];
        if (sib && sib.length && cand.length === sib[0].length) {
          const cnt = text.split(cand).length - 1;
          if (cnt >= 2) { seen.add(cand); issues.push({ level: 'warn', msg: `「${cand}」不在人物硬事实表里（表里有 ${sib.join('、')}），确认是否写错` }); }
        }
      }
    }

    /* 2. 性别/人称：人名之后、同一句之内跟着错误性别的代词 */
    people.forEach(p => {
      if (!p.gender || !p.name) return;
      const wrong = p.gender === '男' ? '她' : '他';
      const sents = text.split(/[。！？\n]/);
      for (let i = 0; i < sents.length; i++) {
        const s = sents[i];
        const at = s.indexOf(p.name);
        if (at < 0) continue;
        const rest = s.slice(at + p.name.length);
        const wrongAt = rest.indexOf(wrong);
        if (wrongAt < 0) continue;
        /* 代词前面若紧跟着另一个人的名字或介词短语把主语转走了，不算误报 */
        const before = rest.slice(0, wrongAt);
        const others = people.filter(x => x.name !== p.name && before.indexOf(x.name) >= 0);
        if (others.length) continue;
        /* 代词后面若紧跟另一个人的动作对象（"他后面""他身上"），也跳过 */
        if (/^.{0,3}(后面|身后|旁边|身上|面前)/.test(rest.slice(wrongAt + 1))) continue;
        issues.push({
          level: 'error',
          msg: `人称可能写错：「${p.name}」设定为${p.gender}性，这里用了「${wrong}」—— …${(p.name + rest.slice(Math.max(0, wrongAt - 12), wrongAt + 4)).trim()}…`
        });
        break;
      }
    });

    /* 3. 年龄冲突 */
    people.forEach(p => {
      if (!p.age) return;
      const a = parseInt(p.age, 10);
      if (!a) return;
      const ages = [...text.matchAll(/(\d{1,2})\s*岁/g)].map(x => +x[1]);
      const bad = ages.filter(x => Math.abs(x - a) > 3);
      if (bad.length && p.role) issues.push({ level: 'warn', msg: `文中出现 ${[...new Set(bad)].join('、')} 岁，硬事实表里「${p.name}」是 ${a} 岁` });
    });

    /* 4. 重复段落 */
    const paras = text.split(/\n+/).map(x => x.trim()).filter(x => x.length > 15);
    const seenP = new Map();
    paras.forEach(p => {
      const key = p.slice(0, 30);
      if (seenP.has(key)) issues.push({ level: 'error', msg: '疑似重复段落：「' + p.slice(0, 20) + '…」' });
      else seenP.set(key, 1);
    });

    /* 5. AI 套话 */
    const found = CLICHE.filter(w => text.includes(w));
    if (found.length) issues.push({ level: 'warn', msg: 'AI 套话：' + found.join('、') });

    /* 6. 超长段 */
    paras.forEach(p => { if (p.length > 180) issues.push({ level: 'warn', msg: '超长段落（' + p.length + ' 字），建议拆开' }); });

    return issues;
  }

  /* 单元定稿后与硬事实表的交叉核对 */
  function checkUnitAgainstFacts(book, u) {
    const issues = [];
    const text = (window.LEngine.unitDoc(u, 'polish') || window.LEngine.unitDoc(u, 'draft') || '');
    if (!text) return issues;

    /* 已死/已离场人物又出现了 */
    ((book.facts && book.facts.people) || []).forEach(p => {
      if (p.status && /死|亡|离场|退场|入狱/.test(p.status) && text.includes(p.name)) {
        issues.push({ level: 'warn', msg: `「${p.name}」状态是「${p.status}」，但本篇里又出现了——确认是否回忆/梦境，否则是硬伤` });
      }
    });

    /* 伏笔过期：计划回收篇已过 2 篇以上，才算真过期（留一个缓冲） */
    (book.foreshadow || []).forEach(f => {
      if (f.status !== 'open' || !f.planPay) return;
      const late = (u.idx + 1) - f.planPay;
      if (late >= 2) {
        issues.push({
          level: 'error',
          msg: `伏笔 ${f.id}「${f.desc}」计划第 ${f.planPay} 篇回收，已逾期 ${late} 篇`
        });
      } else if (late === 1) {
        issues.push({
          level: 'warn',
          msg: `伏笔 ${f.id}「${f.desc}」上一篇就该收了，确认是否已回收（没收到交棒单里）`
        });
      }
    });

    /* 计划本篇回收的伏笔，正文里有没有出现关键词 */
    (u.pays || []).forEach(id => {
      const f = (book.foreshadow || []).find(x => x.id === id);
      if (f && f.desc) {
        const key = f.desc.slice(0, 3);
        if (key && text.indexOf(key) < 0) issues.push({ level: 'warn', msg: `本篇计划回收伏笔 ${id}「${f.desc}」，但正文里没找到相关字样` });
      }
    });

    return issues;
  }

  /* 全书伏笔体检：返回分组结果，供事实表页面用 */
  function auditForeshadow(book) {
    /* 当前进度 = 已完成单元（生成了交棒单）的最大编号，而不是规划总数。
       取 units.length 会把"还没写的单元"算成"已经走过的路"。 */
    const cur = (book.units || []).reduce((mx, u) => {
      const done = (window.LEngine && LEngine.unitDoc) ? LEngine.unitDoc(u, 'relay') : '';
      return done && done.trim() ? Math.max(mx, u.idx + 1) : mx;
    }, 0);
    const list = (book.foreshadow || []).map(f => {
      let state = 'ok';
      let note = '';
      if (f.status === 'paid') { state = 'paid'; note = '第 ' + (f.paidAt || '?') + ' 篇已收'; }
      else if (!f.planPay) { state = 'nodate'; note = '没写计划回收篇'; }
      else if (cur - f.planPay >= 2) { state = 'overdue'; note = `逾期 ${cur - f.planPay} 篇`; }
      else if (cur - f.planPay === 1) { state = 'due'; note = '上一篇就该收'; }
      else { note = `还剩 ${f.planPay - cur + 1} 篇`; }
      return Object.assign({}, f, { state, note });
    });
    const order = { overdue: 0, due: 1, nodate: 2, ok: 3, paid: 4 };
    list.sort((a, b) => order[a.state] - order[b.state] || (a.planPay || 0) - (b.planPay || 0));
    return {
      list,
      overdue: list.filter(x => x.state === 'overdue').length,
      due: list.filter(x => x.state === 'due').length,
      open: list.filter(x => x.status === 'open').length,
      paid: list.filter(x => x.status === 'paid').length
    };
  }

  window.LCHECK = { checkText, checkUnitAgainstFacts, auditForeshadow };
})();
