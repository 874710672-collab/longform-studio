/* lcastparse.js — 人物总表解析（容错版）
   兼容多种排法：
     A) 主要人物｜林默｜男｜27｜遗物整理师｜…     （第一列是固定标签）
     B) 主角｜林青禾｜女｜24｜年轻食摊摊主｜…     （第一列是角色定位）
     C) 林默｜男｜27｜遗物整理师｜…               （没有第一列标签）
   判断依据：第二列像不像「男/女」，以及第一列是否为人名。
*/
(function () {
  /* 常见的「角色定位」词，出现即视为标签列而非人名 */
  const ROLE_TAGS = [
    '主要人物', '主角', '配角', '反派', '核心阻力', '阻力', '对立面',
    '邻里', '邻里支柱', '邻居', '熟客', '熟客常客', '常客', '老客',
    '同行', '同行伙伴', '伙伴', '盟友', '帮手', '同伴', '搭档',
    '引路人', '隐藏引路人', '导师', '师父', '恩人',
    '家人', '亲属', '父亲', '母亲', '儿子', '女儿', '兄弟', '姐妹',
    '恋人', '前任', '配偶', '情敌', '竞争者', '对手',
    '关键人物', '重要人物', '次要人物', '路人', '龙套', '其他'
  ];

  function isRoleTag(s) {
    const t = String(s || '').trim();
    if (!t) return false;
    if (ROLE_TAGS.indexOf(t) >= 0) return true;
    /* 「隐藏引路人」这种带前缀的也算 */
    return ROLE_TAGS.some(r => r.length >= 2 && t.indexOf(r) >= 0 && t.length <= 8);
  }

  function isGender(s) {
    const t = String(s || '').trim();
    return t === '男' || t === '女' || /^(男|女)性?$/.test(t);
  }

  /* 从一堆字段里找出「姓名列」的起始下标 */
  function detectOffset(f) {
    /* 情况 A/B：第一列是标签，第二列是姓名，第三列是性别 */
    if (isRoleTag(f[0]) && !isGender(f[0])) return 1;
    /* 情况 C：第一列就是姓名，第二列是性别 */
    if (isGender(f[1])) return 0;
    /* 兜底：如果第二列也是人名的样子，仍按「第一列是标签」处理 */
    if (isRoleTag(f[0])) return 1;
    return 0;
  }

  function parseCast(text) {
    const people = [], world = [];
    if (!text) return { people, world };

    String(text).split('\n').forEach(line => {
      const s = line.trim().replace(/^[-·*]\s*/, '');
      if (!s) return;
      const hasSep = s.indexOf('｜') >= 0 || s.indexOf('|') >= 0;
      if (!hasSep) return;

      const f = s.split(/[｜|]/).map(x => x.trim());
      if (!f.length) return;

      /* 世界规则 */
      if (isRoleTag(f[0]) && /规则/.test(f[0])) {
        if (f[1]) world.push({ rule: f.slice(1).join('｜') });
        return;
      }
      if (f[0] === '世界规则' && f[1]) { world.push({ rule: f.slice(1).join('｜') }); return; }

      const off = detectOffset(f);
      const name = f[off];
      if (!name || name.length > 8) return;
      /* 名字里不该有空格或标点 */
      if (/[\s，。、；：]/.test(name)) return;
      /* 至少要有性别或身份才有意义 */
      if (f.length - off < 3) return;

      const genderRaw = f[off + 1] || '';
      people.push({
        name,
        roleTag: off === 1 ? f[0] : '',          // 保留「主角/核心阻力」这类定位
        gender: /女/.test(genderRaw) ? '女' : (/男/.test(genderRaw) ? '男' : ''),
        age: String(f[off + 2] || '').replace(/岁/, '').trim(),
        role: f[off + 3] || '',
        goal: f[off + 4] || '',
        want: f[off + 5] || '',
        flaw: f[off + 6] || '',
        voice: f[off + 7] || '',
        firstUnit: parseInt(String(f[off + 8] || '1').match(/\d+/), 10) || 1
      });
    });

    return { people, world };
  }

  window.CASTPARSE = { parseCast, isRoleTag, isGender, detectOffset };
})();
