(function (root) {
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

  function jamo(s) {
    let out = '';
    for (const ch of s) {
      const c = ch.charCodeAt(0) - 0xac00;
      if (c >= 0 && c < 11172) {
        out += CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)];
        const j = c % 28;
        if (j) out += JONG[j];
      } else out += ch;
    }
    return out;
  }

  function charWbNgrams(text, lo, hi) {
    const grams = [];
    const words = text.toLowerCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    for (const w0 of words) {
      const w = [...(' ' + w0 + ' ')];
      for (let n = lo; n <= hi; n++) {
        let off = 0;
        grams.push(w.slice(off, off + n).join(''));
        while (off + n < w.length) { off++; grams.push(w.slice(off, off + n).join('')); }
        if (off === 0) break;
      }
    }
    return grams;
  }

  function makeProfileModel(m) {
    const index = new Map(m.vocab.map((v, i) => [v, i]));
    return function predict(text) {
      const tf = new Map();
      for (const g of charWbNgrams(text, m.ngram[0], m.ngram[1])) {
        const k = index.get(g);
        if (k !== undefined) tf.set(k, (tf.get(k) || 0) + 1);
      }
      let norm = 0;
      const feats = [];
      for (const [k, c] of tf) {
        const v = (1 + Math.log(c)) * m.idf[k];
        feats.push([k, v]);
        norm += v * v;
      }
      norm = Math.sqrt(norm) || 1;
      return m.labels.map((lab, j) => {
        let z = m.b[j];
        for (const [k, v] of feats) z += m.W[j][k] * v / norm;
        return { label: lab, p: 1 / (1 + Math.exp(-z)) };
      });
    };
  }

  function splitClauses(text) {
    return text.split(/[,.!?…\n]+|(?<=[가-힣])(?:고|서|며|는데|지만|구요|고요)\s+|\s(?:그리고|그리구|또|근데|그래서)\s/).map(x => (x || '').trim()).filter(x => x && x.length >= 2);
  }

  function predictMulti(predict, text) {
    const parts = [text, ...splitClauses(text)];
    const all = parts.map(p => predict(p));
    return all[0].map((x, j) => ({ label: x.label, p: Math.max(...all.map(a => a[j].p)) }));
  }

  function pickLabels(probs, thr) {
    const on = probs.filter(x => x.p >= (thr || 0.5)).sort((a, b) => b.p - a.p);
    if (!on.length) on.push(probs.slice().sort((a, b) => b.p - a.p)[0]);
    return on;
  }

  const FLAG = ['big_text', 'high_contrast', 'easy_words', 'voice_guide', 'voice_order', 'low_layout', 'more_time', 'simple_steps', 'touch_assist'];

  function encodeProfile(p) {
    let bits = 0;
    FLAG.forEach((f, i) => { if (p[f]) bits |= 1 << i; });
    const scale = Math.round((p.scale || 1) * 10);
    return 'MWQ1.' + bits.toString(36) + '.' + scale.toString(36);
  }

  function decodeProfile(s) {
    const m = /^MWQ1\.([0-9a-z]+)\.([0-9a-z]+)$/.exec((s || '').trim());
    if (!m) return null;
    const bits = parseInt(m[1], 36);
    const p = { scale: parseInt(m[2], 36) / 10 };
    FLAG.forEach((f, i) => { p[f] = !!(bits & (1 << i)); });
    if (!(p.scale >= 1 && p.scale <= 3)) p.scale = 1;
    return p;
  }

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m || !n) return m || n;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  function bestWindow(hay, needle) {
    if (!needle.length) return 0;
    if (hay.includes(needle)) return 1;
    const L = needle.length;
    let best = 0;
    for (let w = Math.max(1, L - 2); w <= L + 2; w++) {
      for (let i = 0; i + w <= hay.length; i++) {
        const s = 1 - lev(hay.slice(i, i + w), needle) / Math.max(w, L);
        if (s > best) best = s;
      }
    }
    return best;
  }

  const clean = s => s.replace(/\([^)]*\)/g, '').replace(/[^0-9a-zA-Z가-힣]/g, '').toLowerCase();

  const COLD = ['아이스', '차가운', '차갑게', '시원한', '시원하게', '얼음', '아아', '아라', '찬거', '찬'];
  const HOT = ['뜨아', '따뜻한', '따뜻하게', '뜨거운', '뜨겁게', '핫', '따아', '뜨라', '데운', '따신', '뜨신'];
  const NUM = [['세', 3], ['셋', 3], ['석', 3], ['3', 3], ['두', 2], ['둘', 2], ['2', 2], ['한', 1], ['하나', 1], ['1', 1]];

  function makeOrderMatcher(menu) {
    const cands = [];
    for (const it of menu.items) {
      const names = [it.name, it.easy_name, ...(it.aliases || []), ...(it.aliases2 || [])];
      for (const n of names) {
        const c = clean(n);
        if (c.length >= 2) cands.push({ id: it.id, raw: n, j: jamo(c), len: c.length });
      }
    }
    const seen = {};
    for (const c of cands) (seen[c.j] = seen[c.j] || new Set()).add(c.id);
    for (let i = cands.length - 1; i >= 0; i--) if (seen[cands[i].j].size > 1) cands.splice(i, 1);
    const STOP = new Set(['아이스', '따뜻한', '시원한', '차가운', '커피', '음료', '우유커피', '티', '차', 'hot', '라떼', '아메리카노', '카페라떼', '스무디', '에이드']);
    const tokOwner = {};
    for (const it of menu.items) {
      for (const n of [it.name, it.easy_name]) {
        for (const tk of n.replace(/\([^)]*\)/g, ' ').split(/\s+/)) {
          const c = clean(tk);
          for (const k of [c, c.slice(0, 2)]) {
            if (k.length < 2 || STOP.has(k)) continue;
            (tokOwner[k] = tokOwner[k] || new Set()).add(it.id);
          }
        }
      }
    }
    for (const [k, owners] of Object.entries(tokOwner)) {
      if (owners.size === 1) cands.push({ id: [...owners][0], raw: k, j: jamo(k), len: Math.max(k.length, 4), key: true });
    }
    const temp = Object.fromEntries(menu.items.map(it => [it.id, it.temp]));
    const optC = [];
    const OPT_KEYS = { '사이즈 업': ['크게', '큰거', '큰걸로', '라지', '사이즈업', '큰사이즈'], '샷 추가': ['샷추가', '샷하나', '진하게'], '시럽 추가': ['시럽', '달게', '달달하게'], '얼음 적게': ['얼음적게', '얼음조금', '얼음빼', '얼음은적게', '얼음은조금'], '디카페인 변경': ['디카페인으로', '디카페인변경', '카페인빼'], '텀블러 사용': ['텀블러', '내컵', '개인컵', '제컵'], '테이크아웃': ['포장', '테이크아웃', '테잌아웃', '가져갈', '가지고갈', '들고갈'], '매장 이용': ['매장', '먹고갈', '마시고갈', '여기서먹', '여기서마'] };
    for (const o of menu.options) {
      const base = o.name.replace(/\([^)]*\)/g, '').trim();
      for (const k of OPT_KEYS[base] || []) optC.push({ name: o.name, j: jamo(k), len: 2, key: true });
    }
    for (const o of menu.options) for (const n of [o.name, o.easy, ...(o.aliases || [])]) {
      const c = clean(n);
      if (c.length >= 2) optC.push({ name: o.name, j: jamo(c), len: c.length });
    }

    return function match(text) {
      const t = clean(text);
      const tj = jamo(t);
      const score = {};
      for (const c of cands) {
        let s = c.len <= 2 || c.key ? (tj.includes(c.j) ? 1 : 0) : bestWindow(tj, c.j);
        if (!s) continue;
        s = s * (0.8 + 0.2 * Math.min(1, c.len / 6)) + 0.004 * Math.min(c.len, 10);
        if (s > (score[c.id] || 0)) score[c.id] = s;
      }
      const cold = COLD.some(w => t.includes(w));
      const hot = HOT.some(w => t.includes(w));
      for (const id in score) {
        if (cold && temp[id] === '차가움') score[id] += 0.06;
        if (hot && temp[id] === '따뜻함') score[id] += 0.06;
        if (cold && !hot && temp[id] === '따뜻함') score[id] -= 0.05;
        if (hot && !cold && temp[id] === '차가움') score[id] -= 0.05;
      }
      const decafOpt = /디카페인(으로|변경|바꿔)|카페인(빼|없는걸로)/.test(t);
      if (decafOpt && score.decaf_americano && Object.entries(score).some(([id, v]) => id !== 'decaf_americano' && v >= 0.85)) delete score.decaf_americano;
      const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
      let qty = 1;
      const qm = /(\d+|한|하나|두|둘|세|셋|석)\s*(잔|개|컵|게)/.exec(text.replace(/\s+/g, ''));
      if (qm) { const f = NUM.find(([k]) => k === qm[1]); qty = f ? f[1] : (parseInt(qm[1], 10) || 1); }
      const opts = [];
      for (const o of optC) {
        if (opts.includes(o.name)) continue;
        if (o.key ? tj.includes(o.j) : bestWindow(tj, o.j) >= (o.len <= 3 ? 0.99 : 0.86)) opts.push(o.name);
      }
      if (opts.includes('테이크아웃') && opts.includes('매장 이용')) opts.splice(opts.indexOf('매장 이용'), 1);
      if (opts.some(o => o.startsWith('디카페인')) && /디카페인|카페인없|카페인업/.test(t) && !decafOpt) opts.splice(opts.findIndex(o => o.startsWith('디카페인')), 1);
      const top = ranked[0], second = ranked[1];
      const conf = top ? top[1] : 0;
      const ambiguous = !!(top && second && top[1] - second[1] < 0.04 && second[1] > 0.55);
      return {
        item: conf >= 0.72 ? top[0] : null,
        conf: +conf.toFixed(3),
        ambiguous,
        alternatives: ranked.slice(0, 3).map(([id, s]) => ({ id, s: +s.toFixed(3) })),
        qty: Math.max(1, Math.min(9, qty)),
        options: opts,
      };
    };
  }

  const api = { splitClauses, predictMulti, jamo, charWbNgrams, makeProfileModel, pickLabels, encodeProfile, decodeProfile, makeOrderMatcher, FLAG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MWQ = api;
})(this);
