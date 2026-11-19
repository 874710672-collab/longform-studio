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

  /* ================= 分卷 ================= */

  /* ================= 级与卷 ================= */

  /* 从总纲里解析【三级推进】→ 3 个级 */
  function parseStages(bookText) {
    const t = String(bookText || '');
    const m = t.match(/【三级推进】([\s\S]*?)(?=【|$)/);
    if (!m) return [];
    const body = m[1];
    const stages = [];
    const re = /第([一二三])级\s*[｜|]\s*([^\n]*)\n([\s\S]*?)(?=第[一二三]级\s*[｜|]|$)/g;
    let mm;
    const idxMap = { 一: 1, 二: 2, 三: 3 };
    while ((mm = re.exec(body))) {
      const n = idxMap[mm[1]];
      const name = (mm[2] || '').trim().replace(/[（(].*?[）)]/g, '').trim();
      const rest = mm[3];
      const goal = (rest.match(/目标\s*[：:]\s*([^\n]+)/) || [])[1] || '';
      const conflict = (rest.match(/矛盾\s*[：:]\s*([^\n]+)/) || [])[1] || '';
      const cover = (rest.match(/覆盖\s*[：:]\s*([^\n]+)/) || [])[1] || '';
      const rng = String(cover).match(/(\d+)\s*[-—~到至]\s*(\d+)/);
      stages.push({
        id: 's' + n,
        num: n,
        name: name || ('第' + mm[1] + '级'),
        goal: goal.trim(),
        conflict: conflict.trim(),
        fromVol: rng ? parseInt(rng[1], 10) : 0,
        toVol: rng ? parseInt(rng[2], 10) : 0
      });
    }
    stages.sort((a, b) => a.num - b.num);
    return stages;
  }

  /* 主线单元数 & 卷数 */
  function sizePlan(book) {
    const mainUnits = Math.max(8, Math.round((book.target || 380000) / 11000));
    const phases = Math.max(3, Math.min(8, Math.round(mainUnits / 9)));
    const perPhase = Math.max(3, Math.round(mainUnits / phases));
    return { mainUnits, phases, perPhase };
  }

  /* 综合计划：级 + 卷（用于 UI） */
  function volumePlan(book) {
    const { mainUnits, phases, perPhase } = sizePlan(book);
    const stages = (book.stages && book.stages.length) ? book.stages : parseStages(bookDoc(book, 'book'));
    const volumes = (book.volumes && book.volumes.length) ? book.volumes : [];
    return {
      stages, volumes, mainUnits, phases, perPhase,
      parsed: stages.length > 0,
      hasVolumes: volumes.length > 0,
      suggestSplit: mainUnits > 40
    };
  }

  /* 生成卷结构（一次生成全部卷） */
  async function genVolumes(book, onDelta, signal) {
    const P = LP.get();
    const { mainUnits, phases, perPhase } = sizePlan(book);
    const stages = (book.stages && book.stages.length) ? book.stages : parseStages(bookDoc(book, 'book'));
    if (!stages.length) throw new Error('总纲里没有解析出【三级推进】，先生成总纲');

    const stageText = stages.map(st =>
      `第${st.num}级｜${st.name}\n  目标：${st.goal}\n  矛盾：${st.conflict}\n  覆盖：第${st.fromVol}-${st.toVol}卷`
    ).join('\n');

    const user = [
      '请根据全书总纲和三级推进，生成「卷结构」。',
      '',
      '全书总纲：',
      bookDoc(book, 'book'),
      '',
      '三级推进（已确定，不许改）：',
      stageText,
      '',
      `规模：全书主线共 ${mainUnits} 格，分 ${phases} 卷，每卷约 ${perPhase} 格。`,
      '',
      '要求：严格按下面格式输出全部 ' + phases + ' 卷。每卷先写一行卷头，再写 3 行阶段，不要解释：',
      '',
      '卷N｜卷名｜所属级｜起止格｜本卷目标｜本卷矛盾',
      '  阶段1｜起止格｜阶段名｜阶段目标｜阶段阻力｜阶段说明',
      '  阶段2｜起止格｜阶段名｜阶段目标｜阶段阻力｜阶段说明',
      '  阶段3｜起止格｜阶段名｜阶段目标｜阶段阻力｜阶段说明',
      '',
      '格式说明：',
      '- 卷N：卷号，从 1 开始连续',
      '- 卷名：4-8 字，要有辨识度',
      '- 所属级：第1级/第2级/第3级（必须落在该级覆盖的卷号范围内）',
      '- 起止格：如"第1-17格"，必须连续覆盖第 1 格到第 ' + mainUnits + ' 格，不许有空隙或重叠',
      '- 本卷目标：这一卷主角要达成什么（一句话）',
      '- 本卷矛盾：这一卷的核心阻力（一句话）',
      '- 阶段N｜起止格｜阶段名：阶段要把本卷的格分成 3 段，首尾相接、覆盖本卷全部格子，不许有空隙',
      '- 阶段名：4-8 字，如"被逼入局""暗中蓄力""正面摊牌"',
      '- 阶段目标：这一阶段结束时主角达成什么，或者跌到了哪里（一句话，必须是具体状态，不许写"继续发展"）',
      '- 阶段阻力：这几格具体卡住主角的那个人或那件事（一句话，必须是具体障碍）',
      '- 阶段说明：这一段格子里人物在做什么、场面在哪（一句话，只作背景）',
      '',
      '【阶段的「目标」「阻力」与「本卷矛盾」的区别，务必分清】',
      '  · 本卷矛盾 = 整卷跟谁过不去（人物关系层面），如"主角 vs 王虎"',
      '  · 阶段目标 = 这几格结束时主角的具体处境（可以是变坏）',
      '  · 阶段阻力 = 这几格卡住主角的具体障碍（账本上的签名、不肯作证的证人、批不下来的条子）',
      '  ✗ 三个阶段的目标不许是同一件事的三种说法',
      '  ✗ 三个阶段的阻力不许全写成"主角 vs 某某"，必须是三个不同来源的具体障碍',
      '  ✗ 别把「本卷矛盾」换个说法抄成阶段阻力',
      '',
      '卷内三阶段必须体现「起 → 承/转 → 合」的节奏：',
      '  阶段1（前 1/3）：主角被卷进局面，处境变坏，还不能反击——此时阶段阻力要让他无法反抗；',
      '  阶段2（中间 1/3）：主角暗中准备、试探、付代价，蓄而不发——此时阶段阻力要让他付出代价；',
      '  阶段3（后 1/3）：矛盾摊到明面上，本卷目标达成或失败收尾——此时阶段阻力要被正面撞破。',
      '如果本卷格数 ≥ 22 格，可以分 4 段，格式同上。',
      '',
      '硬性要求：',
      '1. 每卷的格数尽量均衡（约 ' + perPhase + ' 格），可按剧情需要浮动，但总和必须等于 ' + mainUnits + ' 格',
      '2. 卷的归属级必须符合三级推进的卷号范围',
      '3. 每卷目标必须是具体的动作结果，不许写"继续发展"这类空话',
      '4. 每卷必须有 3 行阶段（格数 ≥22 的卷可为 4 行），阶段格号必须刚好覆盖本卷',
      '5. 三个阶段不许写成同一件事的三种说法，必须是三种不同的处境'
    ];

    /* 审核意见：让「重新生成全部卷」也能按意见改 */
    const fb = feedbackOf(book.steps.spine);
    if (fb) {
      user.push('', '【上一版卷结构的问题，这一版必须改掉】', fb);
      user.push('');
      user.push('注意：上面的意见优先于其他要求。如果意见指出某一卷有问题，'
        + '只重做那一卷；如果意见涉及整本书的分卷节奏，就整体调整。'
        + '不要因为改一卷而丢掉其他卷已经正确的内容。');
    }

    return API.chat({ messages: API.buildMessages(P.system, user.join('\n')), onDelta, signal });
  }

  /* 只重新生成某一卷的结构（卷名/格范围/目标/矛盾/三阶段） */
  async function genOneVolume(book, vol, onDelta, signal) {
    const P = LP.get();
    const { mainUnits, perPhase } = sizePlan(book);
    const stages = (book.stages && book.stages.length) ? book.stages : parseStages(bookDoc(book, 'book'));
    if (!stages.length) throw new Error('总纲里没有解析出【三级推进】，先生成总纲');

    const stagesOfVol = stages.filter(st =>
      (!st.fromVol || !st.toVol) ? true : (vol.vol >= st.fromVol && vol.vol <= st.toVol));
    const stageText = (stagesOfVol.length ? stagesOfVol : stages).map(st =>
      `第${st.num}级｜${st.name}\n  目标：${st.goal}\n  矛盾：${st.conflict}`
    ).join('\n');

    /* 前后邻卷：给模型看边界，避免它把范围吃掉或超出 */
    const sorted = (book.volumes || []).slice().sort((a, b) => a.vol - b.vol);
    const i = sorted.findIndex(v => v.vol === vol.vol);
    const prevV = i > 0 ? sorted[i - 1] : null;
    const nextV = i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null;

    const neighbour = [];
    if (prevV) neighbour.push(`上一卷：卷${prevV.vol}「${prevV.name}」覆盖第 ${prevV.fromStep}-${prevV.toStep} 格`);
    if (nextV) neighbour.push(`下一卷：卷${nextV.vol}「${nextV.name}」覆盖第 ${nextV.fromStep}-${nextV.toStep} 格`);
    const lo = prevV ? prevV.toStep + 1 : 1;
    const hi = Math.max(nextV ? nextV.toStep : mainUnits, vol.toStep);
    const curLen = vol.toStep - vol.fromStep + 1;

    const user = [
      `请重新生成「卷${vol.vol}」这一卷的卷结构。本次只输出这一卷，不要输出其他任何卷。`,
      '',
      '全书总纲：',
      bookDoc(book, 'book'),
      '',
      '所属级（不许改）：',
      stageText,
      '',
      `规模：全书主线共 ${mainUnits} 格，每卷约 ${perPhase} 格。`,
      neighbour.length ? '相邻卷（用于确定边界，不许改动它们）：\n' + neighbour.join('\n') : '',
      '',
      `【这一卷的格范围规则】：`,
      `  起点不能早于第 ${lo} 格${prevV ? '（上一卷「' + prevV.name + '」占用到第' + prevV.toStep + '格）' : ''}；`,
      `  格数建议保持在 ${curLen} 格左右（当前 ${curLen} 格），可按剧情需要浮动，但不要大幅改动；`,
      `  如果你觉得这一卷确实需要更多格子，可以放宽，后面的卷会自动顺延；`,
      `  但不要超过 ${mainUnits} 格（全书总格数）。`,
      '',
      `当前版本（仅作参考，可以大改）：`,
      `卷${vol.vol}｜${vol.name}｜第${vol.stageNum}级｜第${vol.fromStep}-${vol.toStep}格｜${vol.goal}｜${vol.conflict}`,
      '',
      '要求：严格按下面格式输出，只输出 1 行卷头 + 3 行阶段，不要解释、不要输出其他卷：',
      '',
      '卷N｜卷名｜所属级｜起止格｜本卷目标｜本卷矛盾',
      '  阶段1｜起止格｜阶段名｜阶段目标｜阶段阻力｜阶段说明',
      '  阶段2｜起止格｜阶段名｜阶段目标｜阶段阻力｜阶段说明',
      '  阶段3｜起止格｜阶段名｜阶段目标｜阶段阻力｜阶段说明',
      '',
      '格式说明：',
      `- 卷N 必须是 ${vol.vol}`,
      '- 卷名：4-8 字，要有辨识度',
      `- 所属级：第${vol.stageNum}级（本卷已确定，不许改）`,
      `- 起止格：起点不早于第 ${lo} 格，格数约 ${curLen} 格（可小幅浮动）`,
      '- 本卷目标：这一卷主角要达成什么（一句话，具体动作结果）',
      '- 本卷矛盾：这一卷的核心阻力（一句话）',
      '- 阶段N｜起止格｜阶段名：把本卷的格分成 3 段，首尾相接、覆盖本卷全部格子',
      '- 阶段目标：这一阶段结束时主角达成什么，或者跌到了哪里',
      '- 阶段阻力：这几格具体卡住主角的那个人或那件事（具体障碍，不是"主角 vs 某某"）',
      '- 阶段说明：这一段格子里人物在做什么、场面在哪',
      '',
      '卷内三阶段必须体现「起 → 承/转 → 合」的节奏：',
      '  阶段1：主角被卷进局面，处境变坏，还不能反击——阻力让他无法反抗；',
      '  阶段2：主角暗中准备、试探、付代价，蓄而不发——阻力让他付出代价；',
      '  阶段3：矛盾摊到明面上，本卷目标达成或失败收尾——阻力被正面撞破。',
      '',
      '硬性要求：',
      `1. 起点不早于第 ${lo} 格，格数约 ${curLen} 格`,
      `2. 所属级必须是第${vol.stageNum}级`,
      '3. 每卷目标必须是具体的动作结果，不许写"继续发展"这类空话',
      '4. 必须有 3 行阶段，阶段格号必须刚好覆盖本卷',
      '5. 三个阶段不许写成同一件事的三种说法，必须是三种不同的处境',
      '6. 只输出这一卷，不许输出其他卷'
    ].filter(x => x !== '').join('\n');

    /* 审核意见：只作用于这一卷 */
    let text = user;
    const fb = feedbackOf(book.steps.spine);
    if (fb) {
      text += '\n\n【作者的要求，只针对本次重做的「卷' + vol.vol + '」，必须照改】\n' + fb;
      text += '\n（如果上面这段意见提到的是别的卷，忽略它，按正常标准重做本卷即可）';
    }

    return API.chat({ messages: API.buildMessages(P.system, text), onDelta, signal });
  }

  /* 解析生成的卷结构（含卷内三阶段） */
  function parseVolumes(text, stages) {
    const t = String(text || '');
    const vols = [];
    let cur = null;
    const numMap = { '一': 1, '二': 2, '三': 3, '1': 1, '2': 2, '3': 3 };

    t.split('\n').forEach(rawLine => {
      const line = rawLine.replace(/\s+$/, '');
      const s0 = line.trim().replace(/^[-·*]\s*/, '');
      if (!s0) return;

      /* —— 阶段行：阶段N｜起止格｜阶段名｜说明 —— */
      const ph = s0.match(/^阶段\s*([0-9一二三四五六七八九十]+)\s*[｜|]/);
      if (ph) {
        if (!cur) return;
        const f = s0.split(/[｜|]/).map(x => x.trim());
        const rM = String(f[1] || '').match(/(\d+)\s*[-—~到至]\s*(\d+)/);
        if (!rM) return;
        /* 兼容两种写法：
           新：阶段N｜起止格｜阶段名｜阶段目标｜阶段阻力｜阶段说明  (6 段)
           旧：阶段N｜起止格｜阶段名｜说明                        (4 段) */
        let name = f[2] || '', goal = '', block = '', note = '';
        if (f.length >= 6) {
          goal = f[3] || ''; block = f[4] || ''; note = f[5] || '';
        } else {
          note = f[3] || '';
        }
        cur.phases.push({
          no: cur.phases.length + 1,
          fromStep: parseInt(rM[1], 10),
          toStep: parseInt(rM[2], 10),
          name: name || ('阶段' + (cur.phases.length + 1)),
          goal, block, note
        });
        return;
      }

      /* —— 卷行：卷N｜卷名｜所属级｜起止格｜目标｜矛盾 —— */
      if (s0.indexOf('｜') < 0) return;
      const f = s0.split(/[｜|]/).map(x => x.trim());
      if (f.length < 6) return;
      const numM = String(f[0]).match(/\d+/);
      const rangeM = String(f[3] || '').match(/(\d+)\s*[-—~到至]\s*(\d+)/);
      const stageM = String(f[2] || '').match(/第?\s*([一二三1-3])\s*级/);
      if (!numM || !rangeM) return;
      cur = {
        id: 'v' + numM[0],
        vol: parseInt(numM[0], 10),
        name: f[1] || ('卷' + numM[0]),
        stageId: stageM ? ('s' + numMap[stageM[1]]) : '',
        stageNum: stageM ? numMap[stageM[1]] : 0,
        fromStep: parseInt(rangeM[1], 10),
        toStep: parseInt(rangeM[2], 10),
        goal: f[4] || '',
        conflict: f[5] || '',
        phases: []
      };
      vols.push(cur);
    });

    /* 阶段兜底：没有解析出阶段的卷，按三等分补齐 */
    vols.forEach(v => {
      if (!v.phases || !v.phases.length) v.phases = autoPhases(v);
      else v.phases = normalizePhases(v);
    });

    vols.sort((a, b) => a.vol - b.vol);
    return vols;
  }

  /* 按起止格三等分（格数 ≥22 时四等分） */
  function autoPhases(v) {
    const from = v.fromStep, to = v.toStep;
    const total = to - from + 1;
    const n = total >= 22 ? 4 : 3;
    const names = ['被逼入局', '暗中蓄力', '正面摊牌', '收束余波'];
    const out = [];
    let start = from;
    for (let i = 0; i < n; i++) {
      const remain = total - (start - from);
      const cnt = Math.round(remain / (n - i));
      const end = i === n - 1 ? to : Math.min(to, start + cnt - 1);
      out.push({
        no: i + 1, fromStep: start, toStep: end,
        name: names[i] || ('阶段' + (i + 1)), goal: '', block: '', note: ''
      });
      start = end + 1;
      if (start > to) break;
    }
    return out;
  }

  /* 规整阶段：补空隙、消重叠、强制覆盖本卷
     用法：normalizePhases({fromStep,toStep,phases}) 或 normalizePhases(from, to, phases) */
  function normalizePhases(a, b, c) {
    let from, to, list;
    if (Array.isArray(a)) {
      /* normalizePhases(phases, fromStep, toStep) */
      list = a; from = b; to = c;
    } else if (typeof a === 'number') {
      /* normalizePhases(fromStep, toStep, phases) */
      from = a; to = b; list = c;
    } else {
      /* normalizePhases(vol) */
      from = a && a.fromStep; to = a && a.toStep; list = (a && a.phases) || [];
    }
    from = Number(from); to = Number(to);
    list = Array.isArray(list) ? list : [];
    let arr = (list || [])
      .filter(p => p.fromStep && p.toStep)
      .map(p => Object.assign({}, p))
      .sort((a, b) => a.fromStep - b.fromStep);
    if (!arr.length || !Number.isFinite(from) || !Number.isFinite(to)) return autoPhases({ fromStep: from, toStep: to });

    arr[0].fromStep = from;
    arr[arr.length - 1].toStep = to;
    for (let i = 0; i < arr.length - 1; i++) {
      /* 相邻阶段首尾相接 */
      arr[i].toStep = Math.max(arr[i].fromStep, Math.min(arr[i].toStep, arr[i + 1].fromStep - 1));
      arr[i + 1].fromStep = arr[i].toStep + 1;
    }
    arr = arr.filter(p => p.toStep >= p.fromStep);
    arr.forEach((p, i) => { p.no = i + 1; });
    return arr.length ? arr : autoPhases({ fromStep: from, toStep: to });
  }

  /* 生成某一卷的推进表格子（fromStep~toStep） */
  async function genSpineRange(book, fromStep, toStep, onDelta, signal) {
    const P = LP.get();
    const target = book.target;
    const mainUnits = Math.max(8, Math.round(target / 11000));
    const sideUnits = Math.max(4, Math.round(mainUnits * 0.25));

    /* 范围说明：从 book.volumes 取 */
    let rangeBlock = '';
    const vols = book.volumes || [];
    const vol = vols.find(v => fromStep >= v.fromStep && fromStep <= v.toStep);
    if (vol) {
      const stage = (book.stages || []).find(st => st.id === vol.stageId);
      const phs = (vol.phases && vol.phases.length) ? vol.phases : autoPhases(vol);
      rangeBlock = `【本次生成的是「卷${vol.vol}　${vol.name}」】\n`
        + `本卷覆盖第 ${vol.fromStep}-${vol.toStep} 格\n`
        + `本卷目标：${vol.goal || '（未填）'}\n`
        + `本卷矛盾：${vol.conflict || '（未填）'}\n`
        + (stage ? `所属级：第${stage.num}级「${stage.name}」　级目标：${stage.goal}　级矛盾：${stage.conflict}\n` : '')
        + `\n【本卷分 ${phs.length} 个阶段，必须严格按此分段推进】\n`
        + phs.map(p2 => {
            let line = `阶段${p2.no}　第${p2.fromStep}-${p2.toStep}格｜${p2.name}`;
            if (p2.goal) line += `\n    目标：${p2.goal}`;
            if (p2.block) line += `\n    阻力：${p2.block}`;
            if (p2.note) line += `\n    背景：${p2.note}`;
            return line;
          }).join('\n')
        + `\n\n▶ 每一格的「推进了什么」必须服务它所属阶段的目标，并撞上该阶段写明的阻力：\n`
        + `  阶段1的格子：让主角被这个阻力压住，不能解决；\n`
        + `  阶段2的格子：主角为绕过阻力付出代价，仍不能解决；\n`
        + `  阶段3的格子：正面撞破阻力，本卷目标达成或失败。\n`
        + `▶ 不许把三个阶段写成同一件事的三种说法；阶段之间必须有明显的处境变化。\n`
        + `▶ 相邻阶段的交界处（如第${phs[0] ? phs[0].toStep : vol.fromStep}格）必须是明显的转折，不能平滑过渡。\n`
        + (vol.vol > 1 ? `这是全书的一部分，不要在第 1 格起重新编号，也不要提前解决后面几卷的问题。\n` : '');
    }
    /* —— 关键：明确「这是全书的第几格」，防止 AI 当成新开头重写 —— */
    if (fromStep > 1) {
      const prevCells = (book.spine || []).filter(c => c.step < fromStep).sort((a, b) => a.step - b.step);
      const doneCount = prevCells.length;
      const lastStep = prevCells.length ? prevCells[prevCells.length - 1].step : (fromStep - 1);

      rangeBlock = `【❗重要：这不是故事的开始❗】\n`
        + `全书主线共约 ${mainUnits} 格。目前第 1 格到第 ${lastStep} 格**已经写完**（共 ${doneCount} 格，属于前 ${Math.max(1, vol ? vol.vol - 1 : 1)} 卷）。\n`
        + `你现在要写的是全书的第 ${fromStep} 格到第 ${toStep} 格，也就是**故事进行到中后段**的部分。\n`
        + `绝对不要写主角的穿越/重生/醒来/初次登场——这些早已在第 1-17 格发生过了。\n`
        + `绝对不能从"故事开头"重新起笔，也不能让时间倒流回故事起点。\n\n`
        + rangeBlock;

      if (prevCells.length) {
        const tail = prevCells.slice(-4);
        rangeBlock += '\n【上一卷收束在哪里（必须从这里往下接）】\n'
          + tail.map(c => `第${c.step}格｜${c.title}\n  推进：${c.promote || ''}\n  谁改变：${c.change || ''}\n  不许碰：${c.mustNot || '无'}`).join('\n')
          + '\n'
          + `\n▶ 你写的第一格（第 ${fromStep} 格）必须紧接第 ${lastStep} 格结尾的局面：人物在哪、手里有什么、遇到什么新麻烦。\n`
          + `▶ 开篇不要交代身世背景，直接推进新的事件。\n`;
      }
    }
    /* 剩余格子的路标，避免打光后面的牌 */
    if (toStep < mainUnits) {
      const remainV = vols.filter(v => v.fromStep > toStep);
      if (remainV.length) {
        rangeBlock += '\n【后面还没到的卷（不许提前解决）】\n'
          + remainV.map(v => `卷${v.vol}　${v.name}（第${v.fromStep}-${v.toStep}格）：${v.conflict}`).join('\n')
          + '\n';
      }
    }

    const user = LP.fill(P.spine, {
      book: bookDoc(book, 'book'),
      cast: bookDoc(book, 'cast'),
      rangeBlock,
      fromStep, toStep,
      count: toStep - fromStep + 1,
      mainUnits, sideUnits,
      midTurn: Math.round(mainUnits * 0.5),
      lastTurn: Math.round(mainUnits * 0.75),
      feedback: feedbackOf(book.steps.spine)
    });
    return API.chat({ messages: API.buildMessages(P.system, user), onDelta, signal });
  }

  /* 把新生成的格子合并进 book.spine（按 step 覆盖或追加） */
  function mergeCells(book, newCells) {
    if (!book.spine) book.spine = [];
    const map = new Map(book.spine.map(c => [c.step, c]));
    let added = 0, updated = 0;
    newCells.forEach(nc => {
      const old = map.get(nc.step);
      if (old) {
        /* 保留原 id，只更新内容 */
        Object.assign(old, nc, { id: old.id });
        updated++;
      } else {
        map.set(nc.step, Object.assign({ id: GRID.newId(0), order: nc.step }, nc, { order: nc.step }));
        added++;
      }
    });
    book.spine = GRID.reindex([...map.values()]);
    return { added, updated };
  }

  /* 检测：新生成的格子是否像是「把故事开头又写了一遍」 */
  function detectRestart(book, newCells, fromStep) {
    if (fromStep <= 1) return null;
    const old = (book.spine || []).filter(c => c.step < fromStep);
    if (!old.length) return null;

    const norm = t => String(t || '').replace(/[\s\u3000，。、；：！？""''（）《》【】…—]/g, '');
    const bigrams = t => {
      const s0 = norm(t), set = new Set();
      for (let i = 0; i < s0.length - 1; i++) set.add(s0.slice(i, i + 2));
      return set;
    };
    const sim = (a, b) => {
      if (!a.size || !b.size) return 0;
      let n = 0;
      a.forEach(g => { if (b.has(g)) n++; });
      return n / Math.min(a.size, b.size);
    };

    /* 故事开头的各种特征（覆盖间接写法） */
    const openers = [
      /* A. 醒来 / 穿越 / 重生 */
      /醒来|睁开眼|睁眼|宿醉|酒醒|醒转|魂穿|重生|穿越|回到(了)?(过去|从前|二十|八零|八十)/,
      /前(一)?世|上一世|前世|原来的世界|原本的世界|另一个世界/,
      /* B. 时间错位 / 记忆错位 */
      /(年轻|变老)(了)?[一二三四五六七八九十两]+(十)?[十]?(岁|年)|年轻了[一二三四五六七八九十\d]+/,
      /记忆(断片|混乱|涌入|闪回)|脑子里(全是|涌进)|一时(分不清|不知)(是梦|真假|现实)/,
      /这是(哪|哪里|什么地方)|我(怎么|怎么会)(在|到)这/,
      /* C. 第一次登场 / 初见 */
      /第[一二三]次(见|进|来|入)|初见|头一回(见|进|来)/,
      /* D. 身世背景交代（后续卷不该有） */
      /(他|她)(出生|从小|小时候|自幼|十[五六七八九]岁那年)/,
      /* E. 环境全貌开场（新地点首次描写） */
      /(推开门|走出门)(看到|看见|望见)?(一)?(条|片|座)?.{0,12}(年代|年前|土路|旧路)/
    ];

    /* 更强的一招：新格子里若出现「时间倒流」类全局线索，直接判定 */
    const timelineBack = /(还是|仍是)\s*[一二三四五六七八九十两]+?[十]?\s*(岁|年)(前|的时候)|回到\s*[一二三四五六七八九十\d]+\s*(岁|年前)/;

    const hits = [];
    newCells.forEach(nc => {
      const text = (nc.title || '') + ' ' + (nc.promote || '') + ' ' + (nc.beats ? JSON.stringify(nc.beats) : '');
      /* 规则 A：开篇关键词命中 */
      if (openers.some(re => re.test(text)) || timelineBack.test(text)) {
        hits.push({ step: nc.step, title: nc.title, why: '内容像"故事开头"（醒来/穿越/重生/初见）' });
        return;
      }
      /* 规则 B：与前面已有格子高度重复 */
      const g1 = bigrams(text);
      let best = 0, bestStep = 0;
      old.forEach(oc => {
        const v = sim(g1, bigrams((oc.title || '') + ' ' + (oc.promote || '')));
        if (v > best) { best = v; bestStep = oc.step; }
      });
      if (best >= 0.62) {
        hits.push({ step: nc.step, title: nc.title, why: `与第${bestStep}格重复度 ${Math.round(best * 100)}%` });
      }
    });
    return hits.length ? hits : null;
  }

  async function genBookStep(book, key, onDelta, signal) {
    const P = LP.get();
    const target = book.target;
    const mainUnits = Math.max(8, Math.round(target / 11000));
    if (key === 'book') {
      /* 阶段数按体量算：每 8-12 个单元一段，30万→3段，60万→5-6段 */
      const phases = Math.max(3, Math.min(8, Math.round(mainUnits / 9)));
      const perPhase = Math.max(3, Math.round(mainUnits / phases));
      const user = LP.fill(P.book, {
        brief: briefText(book.brief), target,
        units: mainUnits,
        mainUnits, phases, perPhase,
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
        rangeBlock: '【本次生成全书所有格子】',
        fromStep: 1, toStep: mainUnits, count: mainUnits,
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
      const pTitle = (plan[i] && plan[i].title) || ('第' + (i + 1) + '节');
      if (u.steps.draft.parts[i]) {
        u.steps.draft.parts[i].title = pTitle;
        if (window.PARTVER) PARTVER.write(u.steps.draft.parts[i], String(r).trim(), '自动续写');
        else u.steps.draft.parts[i].body = String(r).trim();
      } else {
        u.steps.draft.parts[i] = { title: pTitle, body: String(r).trim(), versions: [], sel: -1 };
      }
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

  /* 从「出场配置」里解析出本篇新增的世界规则 */
  function parseNewWorldRules(text) {
    const rules = [];
    if (!text) return rules;
    const m = String(text).match(/【新增世界规则】([\s\S]*?)(?=【|$)/);
    if (!m) return rules;
    m[1].split('\n').forEach(line => {
      let s = line.trim();
      /* 去掉开头的列表符号 */
      s = s.replace(/^[-·*•]\s*/, '').trim();
      /* 去掉编号：支持 1. / 1、 / (1) / （1） / 一、 */
      let guard = 0;
      while (guard++ < 3) {
        const before = s;
        s = s.replace(/^[(（]\s*\d+\s*[)）]\s*/, '');
        s = s.replace(/^[(（]\s*[一二三四五六七八九十]+\s*[)）]\s*/, '');
        s = s.replace(/^\d+\s*[.、)．:：]\s*/, '');
        s = s.replace(/^[一二三四五六七八九十]+\s*[.、)．:：]\s*/, '');
        if (s === before) break;
      }
      s = s.replace(/^[-·*•]\s*/, '').trim();
      if (!s) return;
      /* 整行就是「无」 */
      if (/^[（(]?无[）)]?[。，、！!\s]*$/.test(s)) return;
      /* 去掉「规则：」这类前缀 */
      s = s.replace(/^(世界规则|新增规则|规则)\s*[：:]\s*/, '').trim();
      /* 成对去掉包裹的引号/书名号 */
      const pairs = [['「', '」'], ['『', '』'], ['"', '"'], ['‘', '’'], ['“', '”']];
      pairs.forEach(([a, b]) => {
        if (s.startsWith(a) && s.endsWith(b) && s.length > a.length + b.length) {
          s = s.slice(a.length, s.length - b.length).trim();
        }
      });
      /* 单边残留的引号也清掉 */
      s = s.replace(/^[「『“‘"']+/, '').replace(/[」』”’"']+$/, '').trim();
      if (s.length < 4) return;
      rules.push({ rule: s });
    });
    return rules;
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
        order: +head[1],
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
  /* 从文本里提取伏笔编号，规范化成 F01 形式 */
  function extractFsIds(text) {
    const t = String(text || '');
    const ids = new Set();
    /* 匹配 F1 / F01 / f01 / Ｆ01（全角） */
    const re = /[FfＦ]\s*(\d{1,3})/g;
    let m;
    while ((m = re.exec(t))) {
      const n = parseInt(m[1], 10);
      if (n > 0) ids.add('F' + String(n).padStart(2, '0'));
    }
    return [...ids];
  }

  /* 伏笔匹配（编号优先，描述兜底）
     返回 { matched: [...], byId: [...], byText: [...], unknownIds: [...], alreadyPaid: [...] }
  */
  function matchForeshadow(payText, openList, allList) {
    const t = String(payText || '').trim();
    const out = { matched: [], byId: [], byText: [], unknownIds: [], alreadyPaid: [] };
    if (!t || t === '无') return out;

    const all = allList || openList || [];
    const open = openList || [];
    const ids = extractFsIds(t);
    const used = new Set();

    /* 1. 编号优先 */
    ids.forEach(id => {
      const hit = open.find(f => f.id === id);
      if (hit) {
        out.byId.push(hit);
        used.add(hit.id);
        return;
      }
      /* 不 open 的：检查是不是已经收过了 */
      const paidOne = all.find(f => f.id === id);
      if (paidOne && paidOne.status === 'paid') out.alreadyPaid.push(id);
      else if (!paidOne) out.unknownIds.push(id);
    });

    /* 2. 描述兜底（跳过已被编号认领的） */
    const rest = open.filter(f => !used.has(f.id));
    if (rest.length) {
      fuzzyMatchForeshadow(t, rest).forEach(f => {
        out.byText.push(f);
        used.add(f.id);
      });
    }

    out.matched = out.byId.concat(out.byText);
    return out;
  }

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
      const mres = matchForeshadow(
        payText,
        book.foreshadow.filter(f => f.status === 'open'),
        book.foreshadow
      );
      /* 记录匹配情况，供界面提示 */
      u.payMatch = {
        byId: mres.byId.map(f => f.id),
        byText: mres.byText.map(f => f.id),
        alreadyPaid: mres.alreadyPaid,
        unknownIds: mres.unknownIds
      };
      const matched = mres.matched;
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
    parseCast, parseSpine, parseRelay, applyRelay, parseNewPeople, parseNewWorldRules, fuzzyMatchForeshadow, matchForeshadow, extractFsIds,
    progressAuditData, genAudit, parseStages, sizePlan, parseVolumes, volumePlan, genVolumes, genOneVolume, genSpineRange, autoPhases, normalizePhases, mergeCells, detectRestart,
    renumber, sortByOldIdx, markStale, clearStale, buildUnitsFromSpine, totalWords,
    syncUnitsWithSpine, unitHasContent,
    genCellFill, parseCellText, cellText,
    cellOfUnit: (book, u) => GRID.cellOf(book, u),
  };
})();
