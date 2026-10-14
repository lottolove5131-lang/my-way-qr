(async function () {
  const $ = s => document.querySelector(s);
  const el = (tag, attrs, html) => { const e = document.createElement(tag); Object.assign(e, attrs || {}); if (html !== undefined) e.innerHTML = html; return e; };
  const J = f => fetch('data/' + f).then(r => r.json());
  const [menu, pmodel, oeval, pmiss] = await Promise.all([J('menu.json'), J('profile_model.json'), J('order_eval.json').catch(() => null), J('profile_eval_miss.json').catch(() => null)]);
  const finalEval = await J('final_eval.json').catch(() => null);
  const predict = MWQ.makeProfileModel(pmodel);
  const matchOrder = MWQ.makeOrderMatcher(menu);
  const byId = Object.fromEntries(menu.items.map(x => [x.id, x]));

  const LAB = {
    big_text: ['🔠', '큰 글씨·큰 버튼'], high_contrast: ['🌓', '선명한 색(고대비)'], easy_words: ['🙂', '쉬운 말과 그림'],
    voice_guide: ['🔊', '소리로 읽어 주기'], voice_order: ['🎤', '말로 주문하기'], low_layout: ['♿', '화면 낮게'],
    more_time: ['⏳', '시간 제한 없이'], simple_steps: ['👣', '단계 줄이기'],
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  function showTab(t) {
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + t));
    window.scrollTo({ top: 0 });
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function listen(btn, onText) {
    if (!SR) { alert('이 브라우저는 음성 인식을 지원하지 않아요. 크롬에서 열거나 글로 적어 주세요.'); return; }
    const r = new SR(); r.lang = 'ko-KR'; r.interimResults = false; r.maxAlternatives = 1;
    btn.classList.add('rec');
    r.onresult = e => onText(e.results[0][0].transcript);
    r.onend = () => btn.classList.remove('rec');
    r.onerror = () => btn.classList.remove('rec');
    r.start();
  }
  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR'; u.rate = 0.92;
    speechSynthesis.speak(u);
  }

  const mine = { scale: 1 };
  MWQ.FLAG.forEach(f => mine[f] = false);
  try { const saved = MWQ.decodeProfile(localStorage.getItem('mwq')); if (saved) Object.assign(mine, saved); } catch (e) {}

  const EXAMPLES = ['눈이 침침해서 글씨가 안 보여요', '손이 떨려서 화면 누르기가 힘들어요', '휠체어라 화면이 너무 높아요', '한국말이 아직 어려워요', '뒷사람 눈치 보여서 급해져요', '메뉴가 너무 많아서 헷갈려', '우리 엄마가 글을 잘 못 읽으세요'];
  EXAMPLES.forEach(t => $('#needChips').append(el('button', { onclick: () => { $('#needText').value = t; runNeed(); } }, esc(t))));
  $('#needMic').onclick = () => listen($('#needMic'), t => { $('#needText').value = t; runNeed(); });
  $('#needGo').onclick = runNeed;

  function barsHTML(probs, onSet) {
    return probs.slice().sort((a, b) => b.p - a.p).map(x => `<div class="bar ${onSet.has(x.label) ? 'on' : ''}"><b>${LAB[x.label][0]} ${LAB[x.label][1]}</b><span class="t"><i style="width:${Math.round(x.p * 100)}%"></i></span><span>${Math.round(x.p * 100)}%</span></div>`).join('');
  }
  function runNeed() {
    const t = $('#needText').value.trim();
    if (!t) return;
    const probs = MWQ.predictMulti(predict, t);
    const picked = MWQ.pickLabels(probs, 0.5);
    const on = new Set(picked.map(x => x.label));
    on.forEach(l => mine[l] = true);
    if (on.has('big_text') && mine.scale < 1.6) mine.scale = 1.6;
    const box = $('#needOut'); box.hidden = false;
    box.innerHTML = `<h3>AI 추천: ${[...on].map(l => LAB[l][1]).join(', ')}</h3><p class="hint">추천은 오른쪽 설정에 켜 두었어요. 맞지 않으면 끄면 됩니다.</p><div class="bars">${barsHTML(probs, on)}</div>`;
    renderMine();
  }

  const SIZES = [1, 1.3, 1.6, 2];
  function renderMine() {
    const sz = $('#sizes'); sz.innerHTML = '';
    SIZES.forEach(s => sz.append(el('button', { className: mine.scale === s ? 'sel' : '', style: `font-size:${Math.round(13 * s)}px`, onclick: () => { mine.scale = s; if (s >= 1.6) mine.big_text = true; renderMine(); } }, '따뜻한 커피 한 잔 주세요')));
    const tg = $('#toggles'); tg.innerHTML = '';
    MWQ.FLAG.forEach(f => tg.append(el('button', { className: mine[f] ? 'on' : '', onclick: () => { mine[f] = !mine[f]; renderMine(); } }, `<span>${LAB[f][0]}</span>${LAB[f][1]}`)));
    const code = MWQ.encodeProfile(mine);
    try { localStorage.setItem('mwq', code); } catch (e) {}
    const q = qrcode(2, 'M'); q.addData(code); q.make();
    $('#qr').innerHTML = q.createImgTag(6, 8);
    $('#qrCode').textContent = code;
    const on = MWQ.FLAG.filter(f => mine[f]);
    $('#qrSum').innerHTML = (on.length ? on.map(f => `<li>${LAB[f][0]} ${LAB[f][1]}</li>`).join('') : '<li>아직 켠 설정이 없어요</li>') + `<li>글자 ${mine.scale}배</li>`;
  }
  $('#qrSave').onclick = () => {
    const img = $('#qr img'); if (!img) return;
    const c = document.createElement('canvas'); c.width = 600; c.height = 720;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 720);
    const i2 = new Image(); i2.onload = () => {
      g.imageSmoothingEnabled = false; g.drawImage(i2, 60, 60, 480, 480);
      g.fillStyle = '#0f6b5c'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText('내 방식 QR', 300, 610);
      g.fillStyle = '#5d6672'; g.font = '24px sans-serif'; g.fillText('키오스크에 보여 주세요', 300, 660);
      const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = '내방식QR.png'; a.click();
    };
    i2.src = img.src;
  };
  $('#qrTry').onclick = () => { showTab('kiosk'); applyProfile(Object.assign({}, mine), '내가 만든 QR'); };
  renderMine();

  const kiosk = $('#kiosk');
  let prof = null, cat = '전체', cart = [], timer = 90, tick = null, focusId = null;
  const CATS = ['전체', ...new Set(menu.items.map(x => x.cat))];
  const PRESETS = [
    { name: '김 할머니(78)', note: '노안·처음 써 봄', p: { big_text: 1, easy_words: 1, voice_guide: 1, more_time: 1, simple_steps: 1, scale: 1.6 } },
    { name: '박 씨(45)', note: '저시력', p: { big_text: 1, high_contrast: 1, voice_guide: 1, more_time: 1, scale: 2 } },
    { name: '이 씨(33)', note: '휠체어 이용', p: { low_layout: 1, scale: 1.3 } },
    { name: '민준(19)', note: '느린 학습자', p: { easy_words: 1, simple_steps: 1, more_time: 1, scale: 1.3 } },
    { name: '최 씨(61)', note: '손떨림', p: { voice_order: 1, big_text: 1, more_time: 1, scale: 1.6 } },
    { name: '응우옌(27)', note: '한국어 초보', p: { easy_words: 1, voice_order: 1, scale: 1.3 } },
  ];
  PRESETS.forEach(pr => $('#presets').append(el('button', { onclick: () => applyProfile(normalize(pr.p), pr.name + ' · ' + pr.note) }, `<b>${esc(pr.name)}</b>${esc(pr.note)}`)));
  function normalize(p) { const o = { scale: p.scale || 1 }; MWQ.FLAG.forEach(f => o[f] = !!p[f]); return MWQ.decodeProfile(MWQ.encodeProfile(o)); }
  function log(t) { $('#klog').prepend(el('div', {}, esc(t))); }

  $('#useMine').onclick = () => applyProfile(Object.assign({}, mine), '내가 만든 QR');
  $('#resetK').onclick = () => { resetKiosk(); log('원래 화면으로 돌아왔어요. 설정은 남기지 않았어요.'); };

  function applyProfile(p, who) {
    prof = p; cart = []; cat = '전체'; focusId = null;
    $('#kModal').hidden = true; $('#kHeard').innerHTML = '';
    kiosk.style.setProperty('--scale', p.big_text ? Math.max(p.scale, 1.6) : p.scale);
    kiosk.classList.toggle('p-big', !!p.big_text || p.scale >= 1.6);
    kiosk.classList.toggle('p-contrast', !!p.high_contrast);
    kiosk.classList.toggle('p-easy', !!p.easy_words);
    kiosk.classList.toggle('p-low', !!p.low_layout);
    kiosk.classList.toggle('p-simple', !!p.simple_steps);
    $('#kVoice').hidden = !p.voice_order;
    $('#applied').innerHTML = MWQ.FLAG.filter(f => p[f]).map(f => `<span>${LAB[f][0]} ${LAB[f][1]}</span>`).join('') + `<span>글자 ${p.scale}배</span>`;
    log(`QR 인식: ${who} → 설정 ${MWQ.FLAG.filter(f => p[f]).length}개 적용 (${MWQ.encodeProfile(p)})`);
    startTimer();
    renderKiosk();
    if (p.voice_guide) speak(`어서 오세요. ${p.voice_order ? '가운데 초록 단추를 누르고 말로 주문하셔도 돼요. ' : ''}메뉴를 한 번 누르면 이름을 읽어 드리고, 한 번 더 누르면 담아요.`);
    else if (p.voice_order) speak('초록 단추를 누르고 드실 것을 말씀해 주세요.');
  }
  function resetKiosk() {
    prof = null; cart = []; cat = '전체';
    $('#kModal').hidden = true;
    kiosk.style.setProperty('--scale', 1);
    ['p-big', 'p-contrast', 'p-easy', 'p-low', 'p-simple'].forEach(c => kiosk.classList.remove(c));
    $('#kVoice').hidden = true; $('#applied').innerHTML = ''; $('#kHeard').innerHTML = '';
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    startTimer(); renderKiosk();
  }
  function startTimer() {
    clearInterval(tick); timer = 90;
    if (prof && prof.more_time) { $('#kTimer').textContent = '⏳ 시간 제한 없음 · 천천히 고르세요'; return; }
    $('#kTimer').textContent = `남은 시간 ${timer}초`;
    tick = setInterval(() => {
      timer--; $('#kTimer').textContent = `남은 시간 ${timer}초`;
      if (timer <= 0) { clearInterval(tick); cart = []; log('시간 초과로 처음 화면으로 돌아갔어요(일반 키오스크).'); startTimer(); renderKiosk(); }
    }, 1000);
  }
  const nm = it => prof && prof.easy_words ? `${it.easy_name}` : it.name;
  const optName = o => prof && prof.easy_words ? (menu.options.find(x => x.name === o) || {}).easy || o : o;

  function renderKiosk() {
    const cats = $('#kCats'); cats.innerHTML = '';
    CATS.forEach(c => cats.append(el('button', { className: c === cat ? 'on' : '', onclick: () => { cat = c; renderKiosk(); } }, c)));
    const g = $('#kGrid'); g.innerHTML = '';
    let list = menu.items.filter(x => cat === '전체' || x.cat === cat);
    if (prof && prof.simple_steps) list = menu.items;
    list.forEach(it => {
      const b = el('button', { className: 'k-item' + (focusId === it.id ? ' focus' : '') },
        `<div class="ph">${it.emoji || '☕'}</div><div class="nm">${esc(nm(it))}</div><div class="ds">${esc(it.easy_desc)}</div><div class="pr">${it.price.toLocaleString()}원</div>`);
      b.onclick = () => {
        if (prof && prof.voice_guide && focusId !== it.id) {
          focusId = it.id; renderKiosk();
          speak(`${it.easy_name}. ${it.easy_desc} ${it.price}원. 담으려면 한 번 더 누르세요.`); return;
        }
        focusId = null; openItem(it);
      };
      g.append(b);
    });
    renderCart();
  }
  function renderCart() {
    const c = $('#kCart');
    const total = cart.reduce((s, x) => s + x.price * x.qty, 0);
    c.innerHTML = `<div class="lines">${cart.length ? cart.map(x => `${esc(nm(byId[x.id]))} ${x.qty}잔${x.options.length ? ' · ' + x.options.map(optName).map(esc).join(', ') : ''}`).join('<br>') : (prof && prof.easy_words ? '아직 고른 것이 없어요' : '장바구니가 비었습니다')}</div><button class="pay">${total ? total.toLocaleString() + '원 ' : ''}${prof && prof.easy_words ? '돈 내기' : '결제하기'}</button>`;
    c.querySelector('.pay').onclick = pay;
  }
  function optPrice(o) { const m = /([+-]\d+)/.exec(o); return m ? parseInt(m[1], 10) : 0; }
  function addCart(it, qty, options) {
    cart.push({ id: it.id, qty, options, price: it.price + options.reduce((s, o) => s + optPrice(o), 0) });
    renderCart();
    const msg = `${it.easy_name} ${qty}잔${options.length ? ', ' + options.map(o => (menu.options.find(x => x.name === o) || {}).easy || o).join(', ') : ''} 담았어요.`;
    log('담음: ' + msg);
    if (prof && (prof.voice_guide || prof.voice_order)) speak(msg + ' 다 고르셨으면 아래 빨간 단추를 누르세요.');
  }
  function openItem(it, preset) {
    const simple = prof && prof.simple_steps;
    let qty = preset ? preset.qty : 1;
    const sel = new Set(preset ? preset.options : []);
    const shown = simple ? ['사이즈 업(+500)', '테이크아웃', '매장 이용'] : menu.options.map(o => o.name);
    const m = $('#kModal'); m.hidden = false;
    const draw = () => {
      m.innerHTML = `<div class="k-sheet"><h3>${it.emoji || ''} ${esc(nm(it))}</h3>${prof && prof.easy_words ? `<p>${esc(it.easy_desc)}</p>` : ''}
        <div class="k-qty"><button data-q="-1">−</button><b>${qty}잔</b><button data-q="1">+</button></div>
        <div class="k-opts">${shown.map(o => `<button data-o="${esc(o)}" class="${sel.has(o) ? 'on' : ''}">${esc(optName(o))}</button>`).join('')}</div>
        <div class="k-actions"><button data-x="1">${prof && prof.easy_words ? '안 살래요' : '취소'}</button><button class="go" data-a="1">${simple ? '이대로 담기' : '담기'}</button></div></div>`;
      m.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { qty = Math.max(1, Math.min(9, qty + +b.dataset.q)); draw(); });
      m.querySelectorAll('[data-o]').forEach(b => b.onclick = () => {
        const o = b.dataset.o;
        if (sel.has(o)) sel.delete(o); else { sel.add(o); if (o === '테이크아웃') sel.delete('매장 이용'); if (o === '매장 이용') sel.delete('테이크아웃'); }
        if (prof && prof.voice_guide) speak(optName(o) + (sel.has(o) ? ' 골랐어요' : ' 뺐어요'));
        draw();
      });
      m.querySelector('[data-x]').onclick = () => { m.hidden = true; };
      m.querySelector('[data-a]').onclick = () => { m.hidden = true; addCart(it, qty, [...sel]); };
    };
    draw();
    if (prof && prof.voice_guide) speak(`${it.easy_name}. 몇 잔인지와 원하는 것을 고르고 담기를 누르세요.`);
  }
  function pay() {
    if (!cart.length) { if (prof && prof.voice_guide) speak('아직 고른 것이 없어요.'); return; }
    const total = cart.reduce((s, x) => s + x.price * x.qty, 0);
    const d = el('div', { className: 'done' }, `<div><div style="font-size:3em">✅</div><p><b>${total.toLocaleString()}원</b> 주문이 들어갔어요(체험용 · 실제 결제 없음).</p><p>${prof ? '내 방식 설정은 이 키오스크에 남기지 않고 지웠어요.<br>다음 손님은 원래 화면으로 시작합니다.' : ''}</p></div>`);
    kiosk.append(d);
    if (prof && (prof.voice_guide || prof.voice_order)) speak(`${total}원 주문이 들어갔어요. 설정은 지웠어요. 안녕히 가세요.`);
    log(`주문 완료 ${total}원 → 설정 삭제`);
    setTimeout(() => { d.remove(); resetKiosk(); }, 4200);
  }

  function handleSpoken(text) {
    const r = matchOrder(text);
    const H = $('#kHeard');
    log(`들은 말: 「${text}」 → ${r.item ? byId[r.item].easy_name : '?'} (확신 ${Math.round(r.conf * 100)}%)`);
    if (r.ambiguous || !r.item) {
      const alts = r.alternatives.filter(a => a.s > 0.5).slice(0, r.ambiguous ? 2 : 3);
      if (!alts.length) { H.innerHTML = '잘 못 알아들었어요. 다시 말씀해 주세요.'; speak('잘 못 알아들었어요. 다시 말씀해 주세요.'); return; }
      H.innerHTML = `<b>「${esc(text)}」</b><br>어느 것인가요?<div class="ask">${alts.map(a => `<button data-id="${a.id}">${byId[a.id].emoji} ${esc(byId[a.id].easy_name)}</button>`).join('')}</div>`;
      H.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { H.innerHTML = ''; openItem(byId[b.dataset.id], { qty: r.qty, options: r.options }); });
      speak('어느 것인가요? ' + alts.map(a => byId[a.id].easy_name).join(', 아니면 '));
      return;
    }
    const it = byId[r.item];
    H.innerHTML = `<b>「${esc(text)}」</b><br>${it.emoji} ${esc(it.easy_name)} ${r.qty}잔${r.options.length ? ' · ' + r.options.map(optName).map(esc).join(', ') : ''} — 맞으면 담기를 눌러 주세요.`;
    openItem(it, { qty: r.qty, options: r.options });
    speak(`${it.easy_name} ${r.qty}잔${r.options.length ? ', ' + r.options.map(optName).join(', ') : ''} 맞나요? 맞으면 담기를 눌러 주세요.`);
  }
  $('#kMic').onclick = () => listen($('#kMic'), handleSpoken);
  $('#kSayGo').onclick = () => { const t = $('#kSay').value.trim(); if (t) { handleSpoken(t); $('#kSay').value = ''; } };
  $('#kSay').onkeydown = e => { if (e.key === 'Enter') $('#kSayGo').click(); };

  let stream = null, scanning = false;
  $('#scanBtn').onclick = async () => {
    $('#scan').hidden = false; $('#scanMsg').textContent = 'QR을 카메라에 보여 주세요';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = $('#scanVideo'); v.srcObject = stream; await v.play(); scanning = true; scanLoop();
    } catch (e) { $('#scanMsg').textContent = '카메라를 쓸 수 없어요. 「① 탭에서 만든 내 QR 쓰기」나 예시 손님을 눌러 보세요.'; }
  };
  function stopScan() { scanning = false; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; $('#scan').hidden = true; }
  $('#scanClose').onclick = stopScan;
  function scanLoop() {
    if (!scanning) return;
    const v = $('#scanVideo'), c = $('#scanCanvas');
    if (v.videoWidth) {
      c.width = v.videoWidth; c.height = v.videoHeight;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(v, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      const code = jsQR(d.data, d.width, d.height);
      if (code) {
        const p = MWQ.decodeProfile(code.data);
        if (p) { stopScan(); applyProfile(p, '카메라 QR'); return; }
        $('#scanMsg').textContent = '내 방식 QR이 아니에요.';
      }
    }
    requestAnimationFrame(scanLoop);
  }
  renderKiosk(); startTimer();

  $('#aiNeed').oninput = e => {
    const t = e.target.value.trim();
    if (!t) { $('#aiNeedOut').innerHTML = ''; return; }
    const pr = MWQ.predictMulti(predict, t); const on = new Set(MWQ.pickLabels(pr, 0.5).map(x => x.label));
    $('#aiNeedOut').innerHTML = barsHTML(pr, on);
  };
  $('#aiOrder').oninput = e => {
    const t = e.target.value.trim();
    if (!t) { $('#aiOrderOut').innerHTML = ''; return; }
    const r = matchOrder(t);
    $('#aiOrderOut').innerHTML = `<div>${r.ambiguous || !r.item ? '<b>되묻기</b> → ' + r.alternatives.slice(0, 2).map(a => esc(byId[a.id].name)).join(' / ') : `<span class="k">메뉴: ${esc(byId[r.item].name)}</span>`} <span class="k">${r.qty}잔</span>${r.options.map(o => `<span class="k">${esc(o)}</span>`).join('')}</div><div class="hint">후보 점수: ${r.alternatives.map(a => esc(byId[a.id].name) + ' ' + a.s).join(' · ')}</div>`;
  };
  $('#aiMenu').innerHTML = '<tr><th>원래 이름</th><th>쉬운 이름·설명</th><th>부르는 말(일부)</th></tr>' + menu.items.map(x => `<tr><td>${esc(x.name)}</td><td>${x.emoji} <b>${esc(x.easy_name)}</b><br>${esc(x.easy_desc)}</td><td>${esc([...x.aliases.slice(0, 3), ...(x.aliases2 || []).slice(0, 3)].join(', '))}</td></tr>`).join('');

  const ev = pmodel.eval;
  const fe = finalEval;
  const pct = x => Math.round(x * 1000) / 10 + '%';
  const pv = fe ? fe.profile : { n: ev.n_test, any_hit: ev.any_hit, exact: ev.exact, n_train: ev.n_train };
  $('#evalBody').innerHTML = `
  <div class="card"><h2>① 내 말 → 화면 설정 추천</h2>
    <div class="big-num">${pct(pv.any_hit)}</div><p>시험 ${pv.n}문장 중 필요한 설정을 하나 이상 맞힌 비율</p>
    <div class="kv"><span>설정 조합 완전 일치</span><b>${pct(pv.exact)}</b><span>학습 / 시험</span><b>${pv.n_train} / ${pv.n}문장</b><span>학습 문장 만든 AI</span><b>Gemini 2.5 Flash</b><span>시험 문장 만든 AI</span><b>Gemma 4 (다른 모델)</b></div>
    <p class="hint">완전 일치가 낮으므로 AI는 「추천」만 하고, 사람이 켜고 끈 뒤 저장합니다.</p></div>
  <div class="card"><h2>② 말로 한 주문 이해</h2>
    ${fe ? `<div class="big-num">${pct(fe.item_acc)}</div><p>처음 보는 시험 주문 ${fe.n}문장에서 되묻지 않고 메뉴를 바로 맞힌 비율</p>
    <div class="kv"><span>되묻지 않고 다른 메뉴를 제시</span><b>${fe.wrong_without_asking}건</b><span>되물은 주문</span><b>${fe.asked_back}건</b><span>후보 3개 안에 정답</span><b>${pct(fe.top3)}</b><span>수량 정확도</span><b>${pct(fe.qty_acc)}</b><span>옵션 완전 일치</span><b>${pct(fe.opt_exact)}</b>${Object.entries(fe.by_style).map(([k, v]) => `<span>${esc(k)}</span><b>${v}</b>`).join('')}</div>` : '<p>최종 시험 준비 중</p>'}
    <p class="hint">${fe ? esc(fe.note) + ' ' : ''}개발 중 규칙을 고칠 때 쓴 문장(${oeval ? oeval.res.n : '-'}개)은 최종 점수에 넣지 않았습니다. 어떤 주문이든 담기 전에 화면과 소리로 한 번 더 확인합니다.</p></div>
  <div class="card"><h2>③ 일반 키오스크와 비교(같은 주문, 단계 수)</h2>
    <table><tr><th>과제</th><th>일반</th><th>내 방식</th></tr>
    <tr><td>시원한 커피 2잔, 크게, 가져가기</td><td>메뉴 누르기 → 수량 + → 옵션 2개 → 담기 → 결제 (6번 누름, 메뉴 찾기 별도)</td><td>QR 보여 주기 → 말하기 단추 → 「아아 두 잔 크게 포장」 → 담기 → 결제 (3번 누름)</td></tr>
    <tr><td>시간 제한</td><td>90초 뒤 처음으로</td><td>제한 없음</td></tr>
    <tr><td>글자 크기</td><td>13px 고정</td><td>QR에 저장한 배율(최대 2배)</td></tr></table>
    <p class="hint">누름 횟수는 이 시제품 화면 기준입니다.</p></div>
  <div class="card"><h2>한계와 다음 단계</h2><ul class="limit">
    <li>시험 문장은 AI가 만든 합성 데이터입니다. 실제 고령층·장애인 사용자 시험은 아직 하지 않았습니다.</li>
    <li>음성 인식은 브라우저(크롬) 기능에 기대고 있어 소음이 큰 매장에서는 정확도가 떨어질 수 있습니다.</li>
    <li>실제 키오스크에 넣으려면 제조사가 「QR 설정 읽기 → 화면 모드 바꾸기」 기능을 받아들여야 합니다. QR 형식은 설정 8개와 글자 배율뿐이라 표준으로 만들기 쉽습니다.</li>
    <li>다음 단계: 복지관·주민센터와 함께 실제 사용자 시험, 무인민원발급기·병원 수납기로 확장.</li></ul></div>`;
})();
