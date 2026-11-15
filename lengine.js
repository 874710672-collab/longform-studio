/* lengine.js — 长篇引擎：上下文拼装、单元生成、交棒单解析、依赖闭包 */
(function () {
  const T = window.LT;

  function cw(s) {
    if (!s) return 0;
    const cn = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
    const en = (s.match(/[A-Za-z0-9]+/g) || []).length;
    return cn + en;
  }

  function briefText(b) {
    const L = [];
    if (b.genre) L.push('题材：' + b.genre);
    if (b.tags) L.push('标签：' + b.tags);
    if (b.idea) L.push('我的想法：' + b.idea);
    if (b.pov) L.push('人称视角：' + b.pov);
    if (b.style) L.push('文风要求：' + b.style);
    if (b.avoid) L.push('不要写的：' + b.avoid);
    return L.join('\n');
  }

  function docOf(step) {
    const s = step.versions[step.sel];
    return s ? s.text : '';
  }
  function bookDoc(book, k) { return book.steps[k] ? docOf(book.steps[k]) : ''; }
  function unitDoc(u, k) { return u.steps[k] ? docOf(u.steps[k]) : ''; }

  /* 全自动续写用：节拆分会话 */
  function splitParts(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const parts = [];
    let c = null;
    const isHead = (ln) => {
      const s = ln.trim();
      if (!s || s.length > 40) return false;
      return /^(第[一二三四五六七八九十百零\d]+[节章回]|[\d]+[、.．]\s|[一二三四五六七八九十]+[、.]\s?)/.test(s) || /^[\d]+$/.test(s);
    };
    for (const ln of lines) {
      if (isHead(ln) && (c === null || c.body.trim())) {
        if (c) parts.push(c);
        c = { title: ln.trim(), body: '' };
      } else {
        if (!c) c = { title: '', body: '' };
        c.body += ln + '\n';
      }
    }
    if (c) parts.push(c);
    return parts.filter(x => x.body.trim() || x.title).map((x, i) => ({ title: x.title || '第' + (i + 1) + '节', body: x.body.trim() }));
  }

  function outlinePlan(outlineText) {
    return splitParts(outlineText).map(p => {
      const m = p.body.match(/约\s*(\d+)\s*字/) || p.title.match(/(\d+)\s*字/);
      return { title: p.title, words: m ? +m[1] : 0 };
    });
  }

  /* ---------- 上下文块 ---------- */

  function factsBlock(book) {
    const f = book.facts || {};
    const L = [];
    if (f.people && f.people.length) {
      L.push('【人物硬事实】（只读，不许改）');
      f.people.forEach(p => {
        const bits = [p.name, p.gender === '男' || p.gender === '女' ? p.gender : '', p.age ? p.age + '岁' : '', p.role || '']
          .filter(Boolean).join('｜');
        L.push(bits + (p.voice ? '｜说话方式：' + p.voice : ''));
      });
    }
    if (f.world && f.world.length) {
      L.push('【世界规则】（只读）');
      f.world.forEach(w => L.push('- ' + (typeof w === 'string' ? w : w.rule)));
    }
    if (f.items && f.items.length) {
      L.push('【关键物品】（只读）');
      f.items.forEach(i => L.push('- ' + i.name + (i.desc ? '：' + i.desc : '') + (i.owner ? '（持有：' + i.owner + '）' : '')));
    }
    return L.join('\n');
  }

  function fsBlock(book) {
    const open = (book.foreshadow || []).filter(f => f.status === 'open');
    if (!open.length) return '【待回收伏笔】（无）';
    return '【待回收伏笔】（这些必须在本单元或之后的单元里收掉，不许遗忘）\n' + open.map(f =>
      `${f.id}｜${f.desc}｜第 ${f.plant} 篇埋下｜计划第 ${f.planPay} 篇回收`
    ).join('\n');
  }

  function spineBlocks(book) {
    const spine = book.spine || [];
    if (!spine.length) return { all: '', at: '' };
    const all = '【主线推进表】（节选，只给与本次相关的前后几格）\n' + spine.map(s =>
      `第${s.step}格｜${s.title}｜${s.promote || ''}`
    ).join('\n');
    return { all, at: '' };
  }

  function spineAtBlock(book, u) {
    const spine = book.spine || [];
    if (u.kind === 'side') {
      const plan = book.units.filter(x => x.kind === 'side').map(x => `第${x.idx + 1}篇｜${x.title}`);
      return '本单元是副线单元，不占主线推进表的格子。\n' + (plan.length > 1 ? '已计划的副线：\n' + plan.join('\n') : '');
    }
    const g = spine.find(s => s.step === u.spineAt) || spine[Math.min(u.spineAt, spine.length - 1)];
    if (!g) return '（主线推进表为空，请先生成）';
    const prev = spine.find(s => s.step === (g.step - 1));
    const next = spine.find(s => s.step === (g.step + 1));
    const L = [];
    if (prev) L.push(`【上一格】第${prev.step}格｜${prev.title}｜${prev.promote || ''}`);
    L.push(`【本单元对应的主线格子】第${g.step}格｜${g.title}`);
    if (g.promote) L.push('- 本格推进：' + g.promote);
    if (g.change) L.push('- 谁因此改变：' + g.change);
    if (g.mustNot) L.push('- 本格不许碰：' + g.mustNot);
    L.push(`- 建议规模：${g.size || '中'}｜建议 beat 数：${g.beats || 5}`);
    if (next) L.push(`【下一格，不许提前解决】第${next.step}格｜${next.title}｜${next.promote || ''}`);
    return L.join('\n');
  }

  /* 上一单元的交棒单：取「最近一个未 stale 且已定稿」的单元 */
  function prevUnitOf(book, u) {
    const list = book.units.filter(x => x.idx < u.idx);
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.stale) continue;
      const r = unitDoc(p, 'relay');
      if (r && r.trim()) return p;
    }
    return null;
  }

  function prevBlock(book, u) {
    const p = prevUnitOf(book, u);
    if (!p) return '【上一篇的交棒单】（这是第一篇，没有上一篇；如果是中途重跑，说明前面的单元还没定稿）';
    const relay = unitDoc(p, 'relay').trim();
    const L = ['【上一篇的交棒单】（这是硬约束，必须接住）', `—— 第${p.idx + 1}篇《${p.title}》 ——`, relay];

    /* 早前单元的一句话摘要：只取标题 + 交棒单里的「解决了什么」 */
    const earlier = book.units.filter(x => x.idx < p.idx && !x.stale && unitDoc(x, 'relay'));
    if (earlier.length) {
      L.push('【更早之前的单元（一句话摘要）】');
      earlier.slice(-12).forEach(x => {
        const r = unitDoc(x, 'relay');
        const solved = (r.match(/【本篇解决了什么】\s*([^\n【]+)/) || [])[1] || '';
        L.push(`第${x.idx + 1}篇《${x.title}》${solved ? '：' + solved.trim() : ''}`);
      });
    }

    /* 前 3 篇额外给原文尾部，让衔接更自然 */
    if (p.idx < 3) {
      const tail = (unitDoc(p, 'polish') || unitDoc(p, 'draft')).trim().slice(-800);
      if (tail) L.push('【上一篇结尾原文】（用于语感衔接，不要重复）\n' + tail);
    }
    return L.join('\n');
  }

  function readerKnowBlock(book) {
    if (!book.readerKnowledge || !book.readerKnowledge.length) return '';
    return '【读者已知而主角不知的信息】\n' + book.readerKnowledge.map(x => `第${x.unit + 1}篇：${x.info}`).join('\n');
  }

  function tierOf(u) {
    const t = T.TIERS[u.tier] || T.TIERS.m;
    return { name: t.name, min: t.min, max: t.max, parts: t.parts, words: Math.round((t.min + t.max) / 2) };
  }

  function feedbackOf(step) {
    const f = (step.feedback || '').trim();
    return f ? '作者的意见（必须照改）：\n' + f : '';
  }

  /* ================= 全书层生成 ================= */

  async function genBookStep(book, key, onDelta, signal) {
    const P = LP.get();
    const target = book.target;
    const mainUnits = Math.max(8, Math.round(target / 11000));
    if (key === 'book') {
      const user = LP.fill(P.book, {
        brief: briefText(book.brief), target,
        units: mainUnits,
        feedback: feedbackOf(book.steps.book)
      });
      return API.chat({ messages: API.buildMessages(P.system, user), onDelta, signal });
    }
    if (key === 'cast') {
      const user = LP.fill(P.cast, {
        book: bookDoc(book, 'book'),
        feedback: feedbackOf(book.steps.cast)
      });
      return API.chat({ messages: API.buildMessages(P.system, user), onDelta, signal });
    }
    if (key === 'spine') {
      const mainUnits = mainUnits;
      const sideUnits = Math.max(4, Math.round(mainUnits * 0.25));
      const user = LP.fill(P.spine, {
        book: bookDoc(book, 'book'),
        cast: bookDoc(book, 'cast'),
        mainUnits, sideUnits,
        midTurn: Math.round(mainUnits * 0.5),
        lastTurn: Math.round(mainUnits * 0.75),
        feedback: feedbackOf(book.steps.spine)
      });
      return API.chat({ messages: API.buildMessages(P.system, user), onDelta, signal });
    }
    throw new Error('未知的全书工序：' + key);
  }

  /* ================= 单元生成 ================= */

  async function genUnitStep(book, u, key, onDelta, signal) {
    const P = LP.get();
    const t = tierOf(u);
    const fb = feedbackOf(u.steps[key]);
    const base = { brief: briefText(book.brief), feedback: fb };

    if (key === 'topic') {
      const sp = spineBlocks(book);
      const user = LP.fill(P[u.kind === 'side' ? 'sideTopic' : 'unitTopic'], Object.assign({}, base, {
        idx: u.idx + 1, unitTitle: u.title,
        book: bookDoc(book, 'book'),
        spineAt: spineAtBlock(book, u),
        prevBlock: prevBlock(book, u),
        factsBlock: factsBlock(book),
        fsBlock: fsBlock(book),
        kindText: u.kind === 'side' ? '副线单元（非主角视角）' : '主线单元',
        tierName: t.name, words: t.words, parts: t.parts, beats: u.beats
      }));
      return API.chat({ messages: API.buildMessages(P.system, user), onDelta, signal });
    }

    if (key === 'setting') {
      const user = LP.fill(P.unitSetting, Object.assign({}, base, {
        idx: u.idx + 1,
        topic: unitDoc(u, 'topic'),
        factsBlock: factsBlock(book),
        prevBlock: prevBlock(book, u),
        readerKnow: readerKnowBlock(book)
      }));
      return API.chat({ messages: API.buildMessages(P.system, user), onDelta, signal });
    }

    if (key === 'outline') {
      const isFirst = u.idx === 0;
      const user = LP.fill(P.unitOutline, Object.assign({}, base, {
        idx: u.idx + 1,
        topic: unitDoc(u, 'topic'),
        setting: unitDoc(u, 'setting'),
        prevBlock: prevBlock(book, u),
        tierName: t.name, words: t.words, parts: t.parts,
        prevHookRule: isFirst
          ? '这是全书第一篇，最后一节的钩子要同时立起全书的悬念。'
          : '最后一节的钩子必须直接呼应上一篇交棒单里的「留给下一单元的开场画面」和「下一单元必须接住的」。'
      }));
      return API.chat({ messages: API.buildMessages(P.system, user), onDelta, signal });
    }

    if (key === 'polish') {
      const w = t.words;
      const user = LP.fill(P.unitPolish, Object.assign({}, base, {
        idx: u.idx + 1, partIdx: '整篇',
        unitTitle: u.title,
        partTitle: u.title,
        partBody: unitDoc(u, 'draft'),
        prevTail: '', nextHead: '',
        isFirst: '是', isLast: '是',
        partWords: w,
        words: w,
        lastRule: '7. 最后一节必须收住本篇的情绪，同时把读者推向下一篇，不许收得太满。'
      }));
      return API.chat({ messages: API.buildMessages(P.system, user), onDelta, signal });
    }

    if (key === 'relay') {
      const user = LP.fill(P.relay, Object.assign({}, base, {
        idx: u.idx + 1, unitTitle: u.title,
        doc: unitDoc(u, 'polish') || unitDoc(u, 'draft'),
        fsBlock: fsBlock(book),
        spineAt: spineAtBlock(book, u)
      }));
      return API.chat({ messages: API.buildMessages(P.system, user), onDelta, signal });
    }

    throw new Error('未知的单元工序：' + key);
  }

  /* ---------- 单节正文 ---------- */
  async function genPart(book, u, idx, onDelta, signal) {
    const P = LP.get();
    const t = tierOf(u);
    const plan = outlinePlan(unitDoc(u, 'outline'));
    const d = u.steps.draft;
    const parts = d.parts || [];
    const partTitle = (plan[idx] && plan[idx].title) || ('第' + (idx + 1) + '节');
    const partWords = (plan[idx] && plan[idx].words) || Math.round(t.words / Math.max(t.parts, plan.length || t.parts));
    const prevParts = parts.slice(0, idx).filter(Boolean).map(x => x.title + '\n' + x.body).join('\n\n');
    const user = LP.fill(P.unitDraft, {
      idx: u.idx + 1,
      topic: unitDoc(u, 'topic'),
      setting: unitDoc(u, 'setting'),
      outline: unitDoc(u, 'outline'),
      prevBlock: prevBlock(book, u),
      prevParts: prevParts.slice(-3000) || '（本篇还没有前文，这是第一节）',
      brief: briefText(book.brief),
      partTitle, partWords,
      feedback: feedbackOf(d)
    });
    return API.chat({ messages: API.buildMessages(P.system, user), onDelta, signal });
  }

  async function autoDraft(book, u, startIdx, hooks) {
    const plan = outlinePlan(unitDoc(u, 'outline'));
    const total = plan.length || tierOf(u).parts;
    u.steps.draft.parts = u.steps.draft.parts || [];
    for (let i = startIdx; i < total; i++) {
      if (hooks.cancelled && hooks.cancelled()) throw new Error('已停止');
      const r = await genPart(book, u, i, (d, full) => hooks.onDelta && hooks.onDelta(i, d, full), hooks.signal);
      u.steps.draft.parts[i] = { title: (plan[i] && plan[i].title) || ('第' + (i + 1) + '节'), body: String(r).trim() };
      u.steps.draft.partIdx = i;
      Books.save(book);
      hooks.onPartDone && hooks.onPartDone(i, u);
    }
    u.steps.draft.versions = [{ text: joinDraft(u), at: Date.now() }];
    u.steps.draft.sel = 0;
    u.steps.draft.status = 'ready';
    Books.save(book);
    return u;
  }

  function joinDraft(u) {
    return (u.steps.draft.parts || []).filter(Boolean).map(x => x.title + '\n' + x.body).join('\n\n').trim();
  }

  /* 分段润色（复用短篇思路，按节切块） */
  function splitForPolish(text) {
    const parts = splitParts(text);
    if (parts.length > 1) return parts;
    const blocks = [];
    let buf = '';
    String(text || '').split(/\n\n+/).forEach(para => {
      buf += (buf ? '\n\n' : '') + para;
      if (cw(buf) > 3500) { blocks.push({ title: '', body: buf }); buf = ''; }
    });
    if (buf.trim()) blocks.push({ title: '', body: buf });
    return blocks;
  }

  async function polishInChunks(book, u, hooks) {
    const P = LP.get();
    const t = tierOf(u);
    const full = window.__polishSource ? window.__polishSource() : (unitDoc(u, 'draft') || joinDraft(u));
    const parts = splitForPolish(full);
    const fb = (u.steps.polish.feedback || '').trim();
    const totalWords = cw(full);
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      if (hooks.cancelled && hooks.cancelled()) throw new Error('已停止');
      const part = parts[i];
      const ratio = cw(part.body) / Math.max(1, totalWords);
      const target = Math.max(200, Math.round(t.words * ratio));
      const prevTail = out.length ? out[out.length - 1].slice(-300) : '';
      const nextHead = i + 1 < parts.length ? (parts[i + 1].body || '').slice(0, 200) : '';
      const user = LP.fill(P.unitPolish, {
        idx: u.idx + 1,
        partIdx: i + 1,
        unitTitle: u.title,
        partTitle: part.title || ('第' + (i + 1) + '段'),
        partBody: part.body,
        prevTail, nextHead,
        isFirst: i === 0 ? '是（本篇第一段，开头必须抓人）' : '否',
        isLast: i === parts.length - 1 ? '是（本篇最后一段）' : '否',
        partWords: target,
        lastRule: i === parts.length - 1
          ? '7. 这是本篇最后一段：必须收住本篇的情绪，同时把读者推向下一篇，不许收得太满，不要升华。'
          : '',
        feedback: (i === 0 ? fb : '')
      });
      hooks.onProgress && hooks.onProgress(i, parts.length, '');
      const r = await API.chat({
        messages: API.buildMessages(P.system, user),
        onDelta: (d, acc) => hooks.onProgress && hooks.onProgress(i, parts.length, acc),
        signal: hooks.signal
      });
      out.push(String(r).trim());
    }
    return out.join('\n\n');
  }

  /* ================= 解析 ================= */

  /* 从人物总表解析出 facts.people */
  function parseCast(text) {
    const people = [], world = [];
    if (!text) return { people, world };
    text.split('\n').forEach(line => {
      const s = line.trim().replace(/^[-·*]\s*/, '');
      if (!s || s.indexOf('｜') < 0 && s.indexOf('|') < 0) return;
      const f = s.split(/[｜|]/).map(x => x.trim());
      if (f[0] === '世界规则' && f[1]) { world.push({ rule: f.slice(1).join('｜') }); return; }
      if (f[0] !== '主要人物' && f.length < 5) return;
      const off = f[0] === '主要人物' ? 1 : 0;
      const name = f[off];
      if (!name || name.length > 6) return;
      people.push({
        name,
        gender: /女/.test(f[off + 1] || '') ? '女' : (/男/.test(f[off + 1] || '') ? '男' : ''),
        age: (f[off + 2] || '').replace(/岁/, ''),
        role: f[off + 3] || '',
        goal: f[off + 4] || '',
        want: f[off + 5] || '',
        flaw: f[off + 6] || '',
        voice: f[off + 7] || '',
        firstUnit: parseInt(f[off + 8] || '1', 10) || 1
      });
    });
    return { people, world };
  }

  /* 从主线推进表解析格子 */
  function parseSpine(text) {
    if (!text) return [];
    const cells = [];
    const blocks = String(text).split(/(?=^第\s*\d+\s*格)/m).filter(b => /^第\s*\d+\s*格/.test(b.trim()));
    blocks.forEach(b => {
      const head = b.match(/^第\s*(\d+)\s*格\s*[｜|]\s*(.+)$/m);
      if (!head) return;
      const grab = (label) => {
        const m = b.match(new RegExp('[-·]\\s*' + label + '\\s*[：:]\\s*([^\\n]+)'));
        return m ? m[1].trim() : '';
      };
      const sizeM = (b.match(/建议规模\s*[：:]\s*(小|中|大)/) || [])[1];
      const beatM = (b.match(/建议\s*beat\s*数\s*[：:]\s*(\d+)/i) || [])[1];
      cells.push({
        step: +head[1],
        title: head[2].trim(),
        promote: grab('推进了什么'),
        change: grab('谁因此改变'),
        mustNot: grab('不许碰'),
        size: sizeM || '中',
        beats: beatM ? +beatM : 5
      });
    });
    return cells;
  }

  /* 解析交棒单 */
  function parseRelay(text) {
    const t = String(text || '');
    /* 取「【标记名】」到下一个【任何标记】之间的内容。
       不能用 [^\n]* 跳过本行——很多字段的内容就直接写在标记同一行的后面。 */
    const sec = (name) => {
      const m = t.match(new RegExp('【' + name + '】([\\s\\S]*?)(?=【|$)'));
      return m ? m[1].trim() : '';
    };

    const timePlace = sec('时间地点');
    const present = sec('在场人物');
    const changesRaw = sec('状态变化');
    const solvedRaw = sec('本篇解决了什么');
    const plantsRaw = sec('新埋的伏笔');
    const paysRaw = sec('回收的伏笔');
    const mustRaw = sec('下一单元必须接住的');
    const openingRaw = sec('留给下一单元的开场画面');

    const changes = changesRaw.split('\n').map(l => l.trim().replace(/^[-·\d.、]\s*/, '')).filter(Boolean)
      .map(l => { const f = l.split(/[｜|]/); return { name: (f[0] || '').trim(), what: (f[1] || '').trim() }; })
      .filter(x => x.name && x.what);

    const plants = plantsRaw.split('\n').map(l => l.trim().replace(/^[-·\d.、]\s*/, '')).filter(l => l && l !== '无' && l.indexOf('｜') > 0)
      .map(l => { const f = l.split(/[｜|]/); return { desc: (f[0] || '').trim(), planPay: (f[1] || '').trim() }; })
      .filter(x => x.desc);

    const must = mustRaw.split('\n').map(l => l.replace(/^\s*\d+[.、)]\s*/, '').trim()).filter(l => l && l !== '无');

    return {
      timePlace: timePlace.replace(/^[（(]|[）)]$/g, ''),
      present, changes,
      solved: solvedRaw.replace(/^[（(]|[）)]$/g, ''),
      plants, pays: paysRaw.replace(/^[（(]|[）)]$/g, ''),
      must: must.slice(0, 5),
      opening: openingRaw.replace(/^[（(]|[）)]$/g, '')
    };
  }

  /* 把交棒单回写进书：伏笔表 + 人物状态 + 读者知识 */
  function applyRelay(book, u, relayText) {
    const r = parseRelay(relayText);
    let changed = { plants: 0, pays: 0, states: 0 };

    /* 0. 交棒单文本本身入库，否则下一篇读不到 */
    if (u.steps && u.steps.relay && String(relayText || '').trim()) {
      const rs = u.steps.relay;
      const cur = rs.versions[rs.sel];
      if (cur && cur.text === String(relayText).trim()) {
        /* 已经是当前稿，不重复 push */
      } else {
        rs.versions.push({ text: String(relayText).trim(), at: Date.now() });
        rs.sel = rs.versions.length - 1;
      }
      rs.status = 'done';
    }

    /* 1. 新增伏笔（同一单元重复应用时不重复入库） */
    r.plants.forEach(p => {
      const dup = book.foreshadow.some(f => f.unitId === u.id && f.desc === p.desc);
      if (dup) return;
      book.fsSeq = (book.fsSeq || 0) + 1;
      const id = 'F' + String(book.fsSeq).padStart(2, '0');
      const planPayNum = (String(p.planPay).match(/\d+/) || [])[0];
      book.foreshadow.push({
        id, desc: p.desc,
        plant: u.idx + 1,
        planPay: planPayNum ? +planPayNum : u.idx + 1 + 5,
        paidAt: null, status: 'open', unitId: u.id
      });
      u.plants.push(id);
      changed.plants++;
    });

    /* 2. 回收伏笔：按关键词匹配 */
    const payText = r.pays || '';
    if (payText && payText !== '无') {
      book.foreshadow.forEach(f => {
        if (f.status !== 'open') return;
        const key = f.desc.slice(0, 4);
        if (key && payText.indexOf(key) >= 0) {
          f.status = 'paid'; f.paidAt = u.idx + 1;
          if (u.pays.indexOf(f.id) < 0) u.pays.push(f.id);
          changed.pays++;
        }
      });
    }

    /* 3. 人物状态 */
    r.changes.forEach(c => {
      const p = (book.facts.people || []).find(x => x.name === c.name);
      if (p) { p.status = c.what; changed.states++; }
    });

    /* 4. 时间轴锚点 */
    if (r.timePlace) {
      book.facts.anchors = book.facts.anchors || [];
      book.facts.anchors.push({ time: r.timePlace, event: (r.solved || '').slice(0, 60), unit: u.idx + 1 });
    }

    /* 5. 副线：记录读者知识 */
    if (u.kind === 'side') {
      const know = (unitDoc(u, 'topic').match(/【读者读完会比主角多知道什么】\s*([^\n【]+)/) || [])[1] || r.solved || '';
      if (know) book.readerKnowledge.push({ unit: u.idx, info: know.trim() });
    } else if (r.solved) {
      u.readerKnowledge = r.solved;
    }

    return { relay: r, changed };
  }

  /* ================= 单元列表：重排与依赖闭包 ================= */

  function renumber(book) {
    book.units.sort((a, b) => a.idx - b.idx);
    book.units.forEach((u, i) => { u.idx = i; });
  }

  /* 标记受影响：本单元 + 之后所有主线单元 */
  function markStale(book, fromIdx, reason) {
    let n = 0;
    book.units.forEach(u => {
      if (u.idx >= fromIdx) { u.stale = true; u.staleReason = reason || '上游结构变动'; n++; }
    });
    if (n) Books.pushHistory(book, '标记待重跑', `从第${fromIdx + 1}篇起共 ${n} 篇`);
    return n;
  }

  function clearStale(book, id) {
    const u = book.units.find(x => x.id === id);
    if (u) { u.stale = false; u.staleReason = ''; }
  }

  /* 由 spine 一次性建出单元列表（保留已存在且未 stale 的内容） */
  function buildUnitsFromSpine(book, keepExisting) {
    const spine = book.spine || [];
    const old = {};
    if (keepExisting) book.units.forEach(u => {
      if (u.kind === 'main') old[u.spineAt] = u;
    });
    const units = [];
    const sidePlan = (book.units || []).filter(u => u.kind === 'side');
    let idx = 0;
    spine.forEach(cell => {
      const tierBySize = { 小: 's', 中: 'm', 大: 'l' };
      const had = old[cell.step];
      const u = had || Books.newUnit(book.id, idx, {
        kind: 'main', tier: tierBySize[cell.size] || 'm', beats: cell.beats || 5,
        title: cell.title, spineAt: cell.step
      });
      u.spineAt = cell.step;
      u.title = had ? had.title : cell.title;
      if (!had) { u.tier = tierBySize[cell.size] || 'm'; u.beats = cell.beats || 5; }
      units.push(u);
      idx++;
      /* 副线插点：每 4 个主线单元后插一个已计划的副线 */
      if ((idx % 4 === 0) && sidePlan.length) {
        const s = sidePlan.shift();
        s.idx = idx;
        units.push(s);
        idx++;
      }
    });
    while (sidePlan.length) { const s = sidePlan.shift(); s.idx = idx++; units.push(s); }
    book.units = units;
    renumber(book);
    return book.units.length;
  }

  function totalWords(book) {
    return book.units.reduce((a, u) => a + tierOf(u).words, 0);
  }

  window.LEngine = {
    cw, briefText, docOf, bookDoc, unitDoc, splitParts, outlinePlan,
    factsBlock, fsBlock, spineAtBlock, prevBlock, prevUnitOf, readerKnowBlock, tierOf, feedbackOf,
    genBookStep, genUnitStep, genPart, autoDraft, joinDraft, splitForPolish, polishInChunks,
    parseCast, parseSpine, parseRelay, applyRelay,
    renumber, markStale, clearStale, buildUnitsFromSpine, totalWords
  };
})();
