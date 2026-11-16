/* lrelaycheck.js — 交棒单具体性检查（不花 token）
   目的：拦住"看起来合规、实际没信息量"的交棒单。
   核心判断：这一条能不能被下一篇"检查"？ */
(function () {
  /* 抽象词：出现这些词且没有具体实体，基本就是套话 */
  const VAGUE = [
    '继续', '进一步', '逐渐', '开始', '慢慢', '不断', '越来越',
    '心理变化', '内心', '情绪', '感情', '关系', '态度',
    '调查', '探寻', '寻找真相', '推进', '发展', '展开',
    '事情', '状况', '局面', '形势', '问题', '矛盾',
    '各种', '一些', '某种', '某些', '相关', '有关'
  ];

  /* 具体信号：人名、物品量词、地点、数字、身体部位、动作动词 */
  const CONCRETE_HINTS = [
    /第?\d+[篇节章个天年月日岁次元块枚张]/,
    /(手里|身上|口袋|背包|箱|柜|抽屉|信封|照片|钥匙|手机|录音|名单|账本|合同|信|刀|枪|药|石|钱|铜钱|纸条|文件|证件)/,
    /* 动作：尽量穷举高频词，避免"蹲/码/靠/扶"这类漏网 */
    /(站|坐|蹲|跪|躺|趴|靠|扶|抱|扛|背|走|跑|冲|退|停|转身|回头|低头|抬头|弯腰|抬手|伸手|握|抓|攥|捏|摸|碰|敲|拍|推|拉|拽|拖|扔|丢|摔|砸|撕|烧|折|插|拔|开|关|锁|撬|翻|掀|盖|塞|藏|取|放|摆|码|堆|递|接|递给|给|还|拿|带|捡|拾|扫|擦|洗|切|咬|喝|吃|抽|点|按|踩|踢|撞|跳|爬|钻|逃|追|拦|挡|扶起|抱起|按在|压|绑|捆|裹|包|拆|缝|钉|画|写|抄|数|算|看|盯|望|瞥|瞪|听|问|喊|叫|吼|骂|哭|笑|叹|咳|吐|晕|醒|睡|坐起|摘下|换上|脱下)/,
    /(门口|走廊|地下|楼|房间|屋里|屋外|车里|车内|医院|银行|学校|殡仪馆|办公室|街上|街角|桥|码头|车站|城墙|城根|墙根|院子|阳台|天台|电梯|楼梯|厨房|卧室|客厅|门后|窗|桌上|床上|地上|角落|尽头|站台|门口|柜台)/,
    /(死|杀|伤|血|绑|抓|囚|锁|醒|昏|失忆|怀孕|结婚|离婚|辞职|开除|逮捕|开庭|住院|出院|失踪|逃走)/,
    /(知道|不知道|以为|发现|没告诉|瞒|骗|误会|认出|认出|忘记|想起)/
  ];

  function isVague(text) {
    const s = String(text || '').trim();
    if (!s) return true;
    if (s.length < 6) return true;
    let hasConcrete = CONCRETE_HINTS.some(re => re.test(s));
    const vagueHits = VAGUE.filter(w => s.indexOf(w) >= 0);
    /* 全是抽象词且没有任何具体信号 → 判为虚 */
    return !hasConcrete && vagueHits.length > 0;
  }

  /* 名字是否是事实表里登记过的人 */
  function findNames(text, people) {
    const s = String(text || '');
    return (people || []).filter(p => p.name && s.indexOf(p.name) >= 0).map(p => p.name);
  }

  /* 主检查：返回 { level: 'ok'|'warn'|'bad', issues: [...] } */
  function checkRelay(book, relayText) {
    const r = (window.LEngine && LEngine.parseRelay) ? LEngine.parseRelay(relayText) : null;
    const issues = [];
    if (!r) return { level: 'bad', issues: [{ level: 'error', msg: '交棒单格式没解析出来，检查【】标记是否完整' }] };

    const people = (book.facts && book.facts.people) || [];
    const names = people.map(p => p.name).filter(Boolean);

    /* 1. 必须接住的 */
    if (!r.must || !r.must.length) {
      issues.push({ level: 'error', msg: '「下一单元必须接住的」是空的——这是最关键的栏目，空了下一篇接不住' });
    } else {
      if (r.must.length > 3) {
        issues.push({ level: 'warn', msg: `「必须接住的」有 ${r.must.length} 条，超过 3 条等于没有约束` });
      }
      r.must.forEach((m, i) => {
        if (isVague(m)) {
          issues.push({ level: 'warn', msg: `第 ${i + 1} 条太虚：「${m.slice(0, 24)}」——要写成能被下一篇直接检查的事实` });
        } else {
          const hasKnownName = findNames(m, people).length > 0;
          const hasAnyName = /[\u4e00-\u9fa5]{2,3}(?=[不没把将又会也还就都曾在从向对给让和跟])/.test(m)
            || /(他|她|主角|对方)/.test(m);
          if (!hasKnownName && !hasAnyName && !/\d/.test(m)) {
            issues.push({ level: 'warn', msg: `第 ${i + 1} 条没有具体人名或数字：「${m.slice(0, 24)}」` });
          }
        }
      });
    }

    /* 2. 开场画面 */
    const op = r.opening || '';
    if (!op) {
      issues.push({ level: 'error', msg: '缺「留给下一单元的开场画面」' });
    } else if (isVague(op)) {
      issues.push({ level: 'warn', msg: `开场画面是空话：「${op.slice(0, 24)}」——要一个具体动作` });
    } else if (!CONCRETE_HINTS[2].test(op) && !CONCRETE_HINTS[3].test(op)) {
      issues.push({ level: 'warn', msg: `开场画面缺少动作或场景：「${op.slice(0, 24)}」` });
    }

    /* 3. 状态变化 */
    if (!r.changes || !r.changes.length) {
      issues.push({ level: 'warn', msg: '「状态变化」是空的——上一篇结束时的处境没记下来' });
    } else {
      r.changes.forEach(c => {
        if (names.length && names.indexOf(c.name) < 0) {
          issues.push({ level: 'warn', msg: `「${c.name}」不在人物硬事实表里，确认是不是写错了名字` });
        }
        if (isVague(c.what)) {
          issues.push({ level: 'warn', msg: `「${c.name}」的状态变化太抽象：「${c.what.slice(0, 20)}」` });
        }
      });
    }

    /* 4. 伏笔描述 */
    (r.plants || []).forEach(p => {
      if (isVague(p.desc)) {
        issues.push({ level: 'warn', msg: `伏笔描述太虚：「${p.desc.slice(0, 20)}」——后面回收会匹配不上` });
      }
      const n = String(p.planPay).match(/\d+/);
      if (!n) issues.push({ level: 'warn', msg: `伏笔「${p.desc.slice(0, 16)}」没写计划第几篇回收` });
    });

    const errors = issues.filter(x => x.level === 'error').length;
    const warns = issues.filter(x => x.level === 'warn').length;
    return {
      level: errors ? 'bad' : (warns ? 'warn' : 'ok'),
      issues, errors, warns,
      summary: errors ? `有 ${errors} 处硬伤` : (warns ? `${warns} 处可以更具体` : '够结实')
    };
  }

  window.RELAYCHECK = { checkRelay, isVague };
})();
