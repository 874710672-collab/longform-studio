/* api.js — OpenAI 兼容接口调用，支持流式 */
(function () {
  /* 判断是不是「默认开深度思考」的模型（豆包 seed 系列等）。
     其他家的模型不传思考参数，避免服务端不认识该参数而报 400。 */
  function isThinkingModel(model) {
    const m = String(model || '').toLowerCase();
    if (/doubao-seed/.test(m)) return true;
    if (/^seed-/.test(m)) return true;
    if (/doubao.*(seed|2-[0-9])/.test(m)) return true;
    if (/glm-5/.test(m)) return true;
    return false;
  }

  /* glm-5-3-flash 起只支持 enabled，无法关闭，别传 disabled 会报错 */
  function cannotDisable(model) {
    const m = String(model || '').toLowerCase();
    return /glm-5-3/.test(m);
  }

  function buildMessages(system, user) {
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  async function chat({ messages, temperature, onDelta, signal, jsonMode, maxTokens }) {
    const cfg = Store.cfg();
    if (!cfg.apiKey) throw new Error('还没填 API Key，请去「设置」页填写');
    if (!cfg.baseUrl) throw new Error('还没填 Base URL，请去「设置」页填写');

    window.__lastTruncated = false;
    let base = cfg.baseUrl.trim().replace(/\/+$/, '');
    if (!/\/v\d+$/.test(base) && !/\/chat\/completions$/.test(base)) base += '/v1';
    const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';

    const body = {
      model: cfg.model,
      messages,
      temperature: typeof temperature === 'number' ? temperature : cfg.temperature,
      stream: !!cfg.stream
    };
    // 显式指定输出上限；不指定时很多模型会默认 4096/8192，长文会被截断
    const mt = maxTokens || cfg.maxTokens;
    if (mt) body.max_tokens = mt;
    // 只有确定支持「深度思考」开关的模型才传这些参数，其他家传了会 400
    if (cfg.noThinking !== false && isThinkingModel(cfg.model) && !cannotDisable(cfg.model)) {
      // 双保险：
      //  thinking.type=disabled —— 火山方舟官方推荐的关闭方式
      //  reasoning_effort=minimal —— 兼容仍按旧参数识别的模型（文档：minimal 即关闭思考）
      body.thinking = { type: 'disabled' };
      body.reasoning_effort = 'minimal';
    }
    if (jsonMode) body.response_format = { type: 'json_object' };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey
      },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      let t = '';
      try { t = await res.text(); } catch (e) {}
      let msg = t;
      try { const j = JSON.parse(t); msg = j.error?.message || j.message || t; } catch (e) {}
      throw new Error('接口错误 ' + res.status + '：' + (msg || '').slice(0, 300));
    }

    if (!body.stream || !res.body) {
      const j = await res.json();
      const fr = j.choices?.[0]?.finish_reason;
      if (fr === 'length') window.__lastTruncated = true;
      return j.choices?.[0]?.message?.content || '';
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder('utf-8');
    let buf = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const data = s.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const fr = j.choices?.[0]?.finish_reason;
          if (fr === 'length') window.__lastTruncated = true;
          const dl = j.choices?.[0]?.delta || {};
          const d = dl.content || '';           // 只取正文，忽略 reasoning_content
          if (d) { full += d; onDelta && onDelta(d, full); }
        } catch (e) { /* 分片不完整，忽略 */ }
      }
    }
    return full;
  }

  function testConn() {
    return chat({
      messages: [{ role: 'user', content: '回复两个字：可用' }],
      temperature: 0
    });
  }

  window.API = { chat, buildMessages, testConn, isThinkingModel };
})();
