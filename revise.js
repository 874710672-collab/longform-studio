/* revise.js — 修订模式：带原稿 + 意见，只改该改的地方
   与「重新生成」的区别：那个不带原稿，从头写一版 */
(function () {
  function briefBase(book) {
    return { brief: LEngine.briefText(book.brief), feedback: '' };
  }

  /* 全书层某环节的完整上下文（不含意见） */
  function bookContext(book, key) {
    const P = LP.get();
    const mainUnits = Math.max(8, Math.round(book.target / 11000));
    const sideUnits = Math.max(4, Math.round(mainUnits * 0.25));
    if (key === 'book') {
      const phases = Math.max(3, Math.min(8, Math.round(mainUnits / 9)));
      const perPhase = Math.max(3, Math.round(mainUnits / phases));
      return LP.fill(P.book, {
        brief: LEngine.briefText(book.brief), target: book.target,
        units: mainUnits, mainUnits, phases, perPhase, feedback: ''
      });
    }
    if (key === 'cast') {
      return LP.fill(P.cast, { book: LEngine.bookDoc(book, 'book'), feedback: '' });
    }
    return LP.fill(P.spine, {
      book: LEngine.bookDoc(book, 'book'),
      cast: LEngine.bookDoc(book, 'cast'),
      mainUnits, sideUnits,
      midTurn: Math.round(mainUnits * 0.5),
      lastTurn: Math.round(mainUnits * 0.75),
      feedback: ''
    });
  }

  /* 单元层某环节的完整上下文（不含意见） */
  function unitContext(book, u, key) {
    const P = LP.get();
    const t = LEngine.tierOf(u);
    const base = briefBase(book);

    if (key === 'topic') {
      return LP.fill(P[u.kind === 'side' ? 'sideTopic' : 'unitTopic'], Object.assign({}, base, {
        idx: u.idx + 1, unitTitle: u.title,
        book: LEngine.bookDoc(book, 'book'),
        spineAt: LEngine.spineAtBlock(book, u),
        prevBlock: LEngine.prevBlock(book, u),
        factsBlock: LEngine.factsBlock(book),
        fsBlock: LEngine.fsBlock(book),
        kindText: u.kind === 'side' ? '副线单元（非主角视角）' : '主线单元',
        tierName: t.name, words: t.words, parts: t.parts, beats: u.beats
      }));
    }
    if (key === 'setting') {
      return LP.fill(P.unitSetting, Object.assign({}, base, {
        idx: u.idx + 1,
        topic: LEngine.unitDoc(u, 'topic'),
        factsBlock: LEngine.factsBlock(book),
        prevBlock: LEngine.prevBlock(book, u),
        readerKnow: LEngine.readerKnowBlock(book)
      }));
    }
    if (key === 'outline') {
      return LP.fill(P.unitOutline, Object.assign({}, base, {
        idx: u.idx + 1,
        topic: LEngine.unitDoc(u, 'topic'),
        setting: LEngine.unitDoc(u, 'setting'),
        prevBlock: LEngine.prevBlock(book, u),
        fsBlock: LEngine.fsBlock(book),
        tierName: t.name, words: t.words, parts: t.parts,
        foreshadowRule: LEngine.foreshadowOutlineRule(LEngine.dueForeshadows(book, u)),
        prevHookRule: u.idx === 0
          ? '这是全书第一篇，最后一节的钩子要同时立起全书的悬念。'
          : '最后一节的钩子必须直接呼应上一篇交棒单里的「留给下一单元的开场画面」和「下一单元必须接住的」。'
      }));
    }
    if (key === 'polish') {
      return LP.fill(P.unitPolish, Object.assign({}, base, {
        idx: u.idx + 1, partIdx: '整篇', unitTitle: u.title,
        partTitle: u.title, partBody: LEngine.unitDoc(u, 'draft'),
        prevTail: '', nextHead: '',
        isFirst: '是', isLast: '是',
        partWords: t.words, words: t.words,
        lastRule: '7. 这是本篇最后一段：必须收住本篇的情绪，同时把读者推向下一篇，不许收得太满。'
      }));
    }
    if (key === 'relay') {
      return LP.fill(P.relay, Object.assign({}, base, {
        idx: u.idx + 1, unitTitle: u.title,
        doc: LEngine.unitDoc(u, 'polish') || LEngine.unitDoc(u, 'draft'),
        fsBlock: LEngine.fsBlock(book),
        spineAt: LEngine.spineAtBlock(book, u)
      }));
    }
    return '请重新生成这一环节的内容。';
  }

  /* 构造修订请求：system 里塞入"原稿 + 意见 + 只改该改的"规则 */
  async function chat(book, u, key, prevText, feedback, onDelta, signal, scope) {
    const P = LP.get();
    const rule = LP.fill(P.reviseRule, { prevText, feedback });
    const sys = P.system + '\n\n' + rule;
    const user = scope === 'book' ? bookContext(book, key) : unitContext(book, u, key);
    return API.chat({ messages: API.buildMessages(sys, user), onDelta, signal });
  }

  window.REVISE = { chat, bookContext, unitContext };
})();
