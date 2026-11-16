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
    const spine = GRID.reindex(book.spine || []);
    if (u.kind === 'side') {
      const plan = book.units.filter(x => x.kind === 'side').map(x => `第${x.idx + 1}篇｜${x.title}`);
      return '本单元是副线单元，不占主线推进表的格子。\n' + (plan.length > 1 ? '已计划的副线：\n' + plan.join('\n') : '');
    }
    /* 优先按 gridId 精确匹配 */
    const g = (u.gridId ? spine.find(s => s.id === u.gridId) : null)
      || spine.find(s => s.step === u.spineAt);
    if (!g) {
      if (u.orphan) {
        return '【注意】这一篇原本对应的格子已经从推进表里删掉了，现在没有对应的主线格子。请按单元立意里的要求自行处理，或回到推进表重新分配。';
      }
      return '（主线推进表为空，请先生成）';
    }
    const gi = spine.indexOf(g);
    const prev = spine[gi - 1];
    const next = spine[gi + 1];
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

  /* 从大纲里解析出「每一节负责回收哪些伏笔」 */
  function outlineFsPlan(outlineText, book) {
    const parts = splitParts(outlineText);
    const open = (book.foreshadow || []).filter(f => f.status === 'open');
    return parts.map(p => {
      const m = p.body.match(/本节回收的伏笔[：:]\s*([^\n]*)/);
      if (!m) return [];
      const line = m[1].trim();
      if (!line || line === '无' || line.indexOf('无') === 0) return [];
      /* 先按 F01 这样的编号找 */
      const ids = line.match(/F\d+/g) || [];
      if (ids.length) return open.filter(f => ids.indexOf(f.id) >= 0);
      /* 没有编号就按描述模糊找 */
      return fuzzyMatchForeshadow(line, open);
    });
  }

  /* 本篇「应该回收」的伏笔：计划回收篇号 <= 本篇编号，且未收 */
  function dueForeshadows(book, u) {
    const no = u.idx + 1;
    return (book.foreshadow || []).filter(f =>
      f.status === 'open' && f.planPay && f.planPay <= no
    );
  }

  /* 本节要回收的伏笔，单独列一段给正文 */
  function thisPartFsBlock(fsPlan, idx) {
    const list = (fsPlan && fsPlan[idx]) || [];
    if (!list.length) return '';
    return '【本节必须回收的伏笔】\n' + list.map(f =>
      `${f.id}｜${f.desc}｜第 ${f.plant} 篇埋下`
    ).join('\n');
  }

  /* 大纲阶段的伏笔约束 */
  function foreshadowOutlineRule(due) {
    if (!due.length) {
      return '本篇没有到期的伏笔。大纲里「本节回收的伏笔」一律写「无」，不要硬塞。';
    }
    const list = due.map(f => `${f.id}「${f.desc}」`).join('、');
    return `本篇有 ${due.length} 条伏笔到期必须回收：${list}。`
      + '把它们分配到具体某一节（可以同一节，也可以分几节），并在那一节的「本节回收的伏笔」里写明编号。'
      + '回收不等于一句话带过——要在 beat 里写出"通过什么事件、谁知道了什么"，让读者真的看见这件事被揭开。';
  }

  /* 正文阶段的伏笔约束 */
  function draftFsRule(partFs, due) {
    if (partFs.length) {
      return '本节负责回收 ' + partFs.map(f => `${f.id}「${f.desc}」`).join('、')
        + '。必须写出具体的事件让读者看到这件事被揭开，不能只是提一句。';
    }
    if (due.length) {
      return '本节不负责回收伏笔，但不要把 ' + due.map(f => f.id).join('、')
        + ' 的内容提前说破。';
    }
    return '本节没有伏笔任务，正常推进即可。';
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
        fsBlock: fsBlock(book),
        tierName: t.name, words: t.words, parts: t.parts,
        foreshadowRule: foreshadowOutlineRule(dueForeshadows(book, u)),
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
    const fsPlan = outlineFsPlan(unitDoc(u, 'outline'), book);
    const user = LP.fill(P.unitDraft, {
      idx: u.idx + 1,
      topic: unitDoc(u, 'topic'),
      setting: unitDoc(u, 'setting'),
      outline: unitDoc(u, 'outline'),
      prevBlock: prevBlock(book, u),
      prevParts: prevParts.slice(-3000) || '（本篇还没有前文，这是第一节）',
      brief: briefText(book.brief),
      fsBlock: fsBlock(book),
      thisPartFs: thisPartFsBlock(fsPlan, idx),
      fsDutyRule: draftFsRule(fsPlan[idx] || [], dueForeshadows(book, u)),
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
  /* 人物总表解析：委托给容错解析器（lcastparse.js） */
  function parseCast(text) {
    if (window.CASTPARSE && window.CASTPARSE.parseCast) {
      return window.CASTPARSE.parseCast(text);
    }
    return { people: [], world: [] };
  }

  /* 从「出场配置」里解析出本篇新增人物 */
  function parseNewPeople(text) {
    const added = [];
    if (!text) return added;
    const m = String(text).match(/【新增人物】([\s\S]*?)(?=【|$)/);
    if (!m) return added;
    m[1].split('\n').forEach(line => {
      const s = line.trim().replace(/^[-·\d.、]\s*/, '');
      if (!s || s === '无' || s.indexOf('｜') < 0) return;
      const f = s.split(/[｜|]/);
      const name = (f[0] || '').trim();
      if (!name || name.length > 6) return;
      added.push({
        name,
        gender: /女/.test(f[1] || '') ? '女' : (/男/.test(f[1] || '') ? '男' : ''),
        age: (f[2] || '').replace(/岁/, '').trim(),
        role: (f[3] || '').trim(),
        rel: (f[4] || '').trim(),
        voice: (f[5] || '').trim()
      });
    });
    return added;
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

  /* 伏笔回收的模糊匹配 */
  function fuzzyMatchForeshadow(payText, openList) {
    const norm = (x) => String(x || '').replace(/[的了吗呢吧啊，。、；：！？【】「」“”‘’\s]/g, '');
    const hay = norm(payText);
    if (!hay) return [];

    /* 中文二元组 */
    function bigrams(t) {
      const out = new Set();
      for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
      return out;
    }

    return openList.filter(f => {
      const desc = norm(f.desc);
      if (!desc || desc.length < 2) return false;

      /* a) 完整描述出现在文本里 */
      if (hay.indexOf(desc) >= 0) return true;

      /* b) 前 4 字或后 4 字 */
      if (desc.length >= 4) {
        if (hay.indexOf(desc.slice(0, 4)) >= 0) return true;
        if (hay.indexOf(desc.slice(-4)) >= 0) return true;
      }

      /* c) 二元组重合率 ≥ 40% */
      const a = bigrams(desc);
      if (!a.size) return false;
      let hit = 0;
      a.forEach(g => { if (hay.indexOf(g) >= 0) hit++; });
      if (hit / a.size >= 0.4) return true;

      /* d) 单字重合率：处理"分开了"的同义改写（来过/曾来过，这边城/边城）
         去掉常见虚词后，剩余实字有 70% 以上出现在文本里 */
      const STOP = '的了着过吗呢吧啊和与及或是在有就都也还又很更最这那一个些曾已经曾被把让给向从对为以所之其此该';
      const solid = desc.split('').filter(c => STOP.indexOf(c) < 0);
      if (solid.length >= 4) {
        const sHit = solid.filter(c => hay.indexOf(c) >= 0).length;
        if (sHit / solid.length >= 0.7) return true;
      }

      return false;
    });
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
      /* 去重：优先按单元 id，兼容老数据（没有 unitId）时按「埋下篇 + 描述」 */
      const dup = book.foreshadow.some(f =>
        (f.unitId === u.id || (f.unitId === undefined && f.plant === u.idx + 1))
        && String(f.desc).trim() === String(p.desc).trim()
      );
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

    /* 2. 回收伏笔：模糊匹配
       单纯取前 4 个字太脆——模型换个说法就匹配不上。
       改成：字符级重叠度 + 关键词命中，两者任一达标即视为回收。 */
    const payText = r.pays || '';
    if (payText && payText !== '无') {
      const matched = fuzzyMatchForeshadow(payText, book.foreshadow.filter(f => f.status === 'open'));
      matched.forEach(f => {
        f.status = 'paid';
        f.paidAt = u.idx + 1;
        f.payNote = payText.slice(0, 40);
        if (u.pays.indexOf(f.id) < 0) u.pays.push(f.id);
        changed.pays++;
      });
    }

    /* 3. 人物状态 */
    r.changes.forEach(c => {
      const p = (book.facts.people || []).find(x => x.name === c.name);
      if (p) { p.status = c.what; changed.states++; }
    });

    /* 4. 时间轴锚点：同一单元只保留一条，重复应用时覆盖 */
    if (r.timePlace) {
      book.facts.anchors = book.facts.anchors || [];
      const rec = {
        unit: u.idx + 1,
        time: r.timePlace,
        event: (r.solved || '').slice(0, 60)
      };
      const i = book.facts.anchors.findIndex(a => a.unit === rec.unit);
      if (i >= 0) book.facts.anchors[i] = rec;
      else book.facts.anchors.push(rec);
      book.facts.anchors.sort((x, y) => x.unit - y.unit);
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

  /* ================= 进度对账 ================= */

  /* 收集已完成的单元摘要 */
  function doneSummaries(book) {
    return (book.units || []).filter(u => {
      const r = unitDoc(u, 'relay');
      return r && r.trim();
    }).map(u => {
      const r = unitDoc(u, 'relay');
      const p = parseRelay(r);
      const title = u.title;
      const solved = p.solved || '';
      const must = (p.must || []).slice(0, 2).join('；');
      return `第${u.idx + 1}篇《${title}》${u.spineAt > 0 ? '（计划对应第' + u.spineAt + '格）' : '（副线）'}\n  本篇完成：${solved || '（未记录）'}${must ? '\n  交棒要点：' + must : ''}`;
    }).join('\n');
  }

  function todoSummaries(book) {
    const doneMax = Math.max(0, ...((book.units || []).filter(u => unitDoc(u, 'relay')).map(u => u.idx + 1)));
    return (book.spine || []).filter(c => {
      const u = (book.units || []).find(x => x.kind === 'main' && x.spineAt === c.step);
      return !u || u.idx + 1 > doneMax;
    }).map(c => `第${c.step}格｜${c.title}｜${c.promote || ''}`).join('\n');
  }

  function spinePlain(book) {
    return (book.spine || []).map(c =>
      `第${c.step}格｜${c.title}\n  推进：${c.promote || ''}\n  不许碰：${c.mustNot || '无'}`
    ).join('\n');
  }

  /* 生成对账单（用 book.steps.audit 存版本） */
  function progressAuditData(book) {
    const done = doneSummaries(book);
    const doneCount = (book.units || []).filter(u => unitDoc(u, 'relay')).length;
    /* 计划进度 = 已完成单元里，对应主线格子的最大编号 */
    const doneUnits = (book.units || []).filter(u => unitDoc(u, 'relay'));
    const planned = doneUnits.reduce((mx, u) => Math.max(mx, u.spineAt > 0 ? u.spineAt : 0), 0);
    return { done, todo: todoSummaries(book), spine: spinePlain(book), planned, doneCount };
  }

  async function genAudit(book, onDelta, signal) {
    const P = LP.get();
    const d = progressAuditData(book);
    if (!d.done) throw new Error('还没有写完的单元，没法对账');
    const user = LP.fill(P.progressAudit, {
      book: bookDoc(book, 'book'),
      spine: d.spine || '（推进表为空）',
      done: d.done,
      todo: d.todo || '（没有剩余格子）',
      planned: d.planned
    });
    return API.chat({ messages: API.buildMessages(P.system, user), onDelta, signal });
  }

  /* ================= 单格补全 ================= */

  /* 拼一格的可读描述 */
  function cellText(c) {
    if (!c) return '（无）';
    const L = [`第${c.step}格｜${c.title || '（未命名）'}`];
    if (c.promote) L.push('  推进：' + c.promote);
    if (c.change) L.push('  谁因此改变：' + c.change);
    if (c.mustNot) L.push('  不许碰：' + c.mustNot);
    L.push(`  规模：${c.size || '中'}｜事件数：${c.beats || 5}`);
    return L.join('\n');
  }

  /* 生成单格的完整内容 */
  async function genCellFill(book, cellId, rough, onDelta, signal) {
    const P = LP.get();
    const cells = GRID.reindex(book.spine || []);
    const idx = cells.findIndex(c => c.id === cellId);
    if (idx < 0) throw new Error('找不到这一格');
    const cell = cells[idx];
    const prev = idx > 0 ? cells[idx - 1] : null;
    const next = idx < cells.length - 1 ? cells[idx + 1] : null;

    /* 已有内容（用于"保留我写的部分"） */
    const cur = [];
    if (cell.promote) cur.push('已写的推进：' + cell.promote);
    if (cell.change) cur.push('已写的改变：' + cell.change);
    if (cell.mustNot) cur.push('已写的不许碰：' + cell.mustNot);
    const curFill = cur.length ? '\n（作者已经写了下面这些，请在此基础上补全，不要推倒重来）\n' + cur.join('\n') : '';

    const cast = (book.facts && book.facts.people || []).slice(0, 8)
      .map(p => [p.name, p.gender, p.age ? p.age + '岁' : '', p.role].filter(Boolean).join('｜'))
      .join('\n');

    const user = LP.fill(P.cellFill, {
      book: bookDoc(book, 'book') || '（还没有全书总纲）',
      cast: cast || '（还没有人物）',
      prevCell: prev ? cellText(prev) : '（这是第一格，没有前一格）',
      nextCell: next ? cellText(next) : '（这是最后一格，没有后一格，不许碰写「无」）',
      rough: (rough || '').trim() || '（作者没写大意，请根据前后文自行设计）',
      curFill,
      step: cell.step,
      feedback: feedbackOf({ feedback: '' })
    });

    const out = await API.chat({
      messages: API.buildMessages(P.system, user), onDelta, signal
    });
    return { text: String(out || '').trim(), cell, prev, next, idx };
  }

  /* 把 AI 返回的单格文本解析成字段 */
  function parseCellText(text, fallbackStep) {
    const t = String(text || '');
    const grab = (label) => {
      const m = t.match(new RegExp('[-·]\\s*' + label + '\\s*[：:]\\s*([^\\n]+)'));
      return m ? m[1].trim() : '';
    };
    const head = t.match(/第\s*(\d+)\s*格\s*[｜|]\s*(.+)/m);
    const sizeM = t.match(/建议规模\s*[：:]\s*(小|中|大)/);
    const beatM = t.match(/建议\s*beat\s*数\s*[：:]\s*(\d+)/i);
    return {
      step: head ? +head[1] : fallbackStep,
      title: head ? head[2].trim().replace(/（已调整）$/, '') : '',
      promote: grab('推进了什么'),
      change: grab('谁因此改变'),
      mustNot: grab('不许碰'),
      size: sizeM ? sizeM[1] : '中',
      beats: beatM ? +beatM[1] : 5,
      adjusted: /（已调整）/.test(head ? head[2] : '')
    };
  }

  /* ================= 单元列表：重排与依赖闭包 ================= */

  /* 判断一个主线单元是否已经有内容（有内容就不能随便覆盖结构） */
  function unitHasContent(u) {
    if (!u || !u.steps) return false;
    if ((u.steps.draft && (u.steps.draft.parts || []).some(Boolean))) return true;
    const keys = ['topic', 'setting', 'outline', 'polish', 'relay'];
    return keys.some(k => {
      const st = u.steps[k];
      return st && st.versions && st.versions.length > 0;
    });
  }

  /* 按推进表同步单元列表：
     - 格号匹配上的：更新标题 / 档位 / 事件数
     - 已完成的（有任何内容）：只更新标题，不动档位和事件数，避免把写好的内容搞乱
     - 新推进表里没有的格：移除对应单元（若有内容则保留并标 stale）
     - 新出现的格：新增单元
  */
  /* 按 gridId 同步单元列表（稳定 ID 模型）
     - 格子在、单元在：更新标题；有内容的保护结构
     - 格子在、单元不在：新增单元
     - 格子不在、单元在：标孤儿（不删，内容不丢）
  */
  function syncUnitsWithSpine(book) {
    const cells = GRID.reindex(book.spine || []);
    book.spine = cells;
    const sizeToTier = { 小: 's', 中: 'm', 大: 'l' };
    const report = { updated: 0, added: 0, orphaned: 0, relinked: 0, keptDone: 0, touched: false };

    const cellIds = new Set(cells.map(c => c.id));
    const mains = (book.units || []).filter(u => u.kind === 'main');

    /* ===== 第一步：先把失联单元重连回来，避免后面误判"单元不在" ===== */
    const claimed = new Set();
    mains.forEach(u => {
      if (u.gridId && cellIds.has(u.gridId)) claimed.add(u.gridId);
    });

    /* (a) 网格 id 已经对的，直接认领 */
    mains.forEach(u => {
      if (u.gridId && cellIds.has(u.gridId)) {
        const c = cells.find(x => x.id === u.gridId);
        u.spineAt = c.step;
        u.orphan = false;
      }
    });

    /* (b) 失联的按标题 / 序号重连 */
    mains.forEach(u => {
      if (u.gridId && cellIds.has(u.gridId)) return;

      const byTitle = cells.filter(c => !claimed.has(c.id) && c.title === u.title);
      if (byTitle.length === 1) {
        u.gridId = byTitle[0].id;
        u.spineAt = byTitle[0].step;
        u.orphan = false;
        claimed.add(byTitle[0].id);
        report.relinked++;
        report.touched = true;
        return;
      }
      const byStep = cells.find(c => c.step === u.spineAt && !claimed.has(c.id));
      if (byStep) {
        u.gridId = byStep.id;
        u.orphan = false;
        claimed.add(byStep.id);
        report.relinked++;
        report.touched = true;
      }
    });

    /* ===== 第二步：逐格处理（此时重连已完成） ===== */
    cells.forEach(c => {
      const tier = sizeToTier[c.size] || 'm';
      const beats = c.beats || 5;
      let u = (book.units || []).find(x => x.kind === 'main' && x.gridId === c.id);

      if (!u) {
        const nu = Books.newUnit(book.id, (book.units || []).length, {
          kind: 'main', tier, beats, title: c.title, spineAt: c.step
        });
        nu.gridId = c.id;
        nu.orphan = false;
        if (book.activeDraftId) nu.draftId = book.activeDraftId;
        book.units.push(nu);
        report.added++;
        report.touched = true;
        return;
      }

      let changed = false;
      if (u.title !== c.title) { u.title = c.title; changed = true; }

      if (unitHasContent(u)) {
        u.spineDirty = (u.tier !== tier || u.beats !== beats);
        if (u.spineDirty) report.keptDone++;
      } else {
        if (u.tier !== tier) { u.tier = tier; changed = true; }
        if (u.beats !== beats) { u.beats = beats; changed = true; }
        u.spineDirty = false;
      }
      u.spineAt = c.step;
      u.orphan = false;
      if (changed) { report.updated++; report.touched = true; }
    });

    /* ===== 第三步：仍然接不上的 → 孤儿 ===== */
    (book.units || []).forEach(u => {
      if (u.kind === 'side') return;
      if (!u.gridId || !cellIds.has(u.gridId)) {
        if (!u.orphan) { u.orphan = true; report.orphaned++; report.touched = true; }
      }
    });

    /* ===== 第四步：主线单元按格号排序，篇号与格号对齐 ===== */
    const cellOrder = new Map(cells.map((c, i) => [c.id, i]));
    const sortedMains = (book.units || []).filter(u => u.kind === 'main').sort((a, b) => {
      const ai = a.gridId && cellOrder.has(a.gridId) ? cellOrder.get(a.gridId) : 9999;
      const bi = b.gridId && cellOrder.has(b.gridId) ? cellOrder.get(b.gridId) : 9999;
      if (ai !== bi) return ai - bi;
      return (a.idx || 0) - (b.idx || 0);
    });
    const sides = (book.units || []).filter(u => u.kind !== 'main');
    book.units = sortedMains.concat(sides);
    renumber(book);

    return report;
  }




  /* 只按当前数组顺序重新编号，不再自己排序（排序由调用方决定） */
  function renumber(book) {
    (book.units || []).forEach((u, i) => { u.idx = i; });
  }

  /* 需要按旧 idx 稳定排序的场景单独用这个 */
  function sortByOldIdx(book) {
    book.units.sort((a, b) => a.idx - b.idx);
    renumber(book);
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
    dueForeshadows, foreshadowOutlineRule, draftFsRule, outlineFsPlan,
    genBookStep, genUnitStep, genPart, autoDraft, joinDraft, splitForPolish, polishInChunks,
    parseCast, parseSpine, parseRelay, applyRelay, parseNewPeople, fuzzyMatchForeshadow,
    progressAuditData, genAudit,
    renumber, sortByOldIdx, markStale, clearStale, buildUnitsFromSpine, totalWords,
    syncUnitsWithSpine, unitHasContent,
    genCellFill, parseCellText, cellText,
    cellOfUnit: (book, u) => GRID.cellOf(book, u),
  };
})();
