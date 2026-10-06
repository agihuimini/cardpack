// cardpack — 화면 (텍스트/박스/버튼 목업)
(function () {
  const D = window.CPData, G = window.CPGame, S = window.CPStore;
  const app = document.getElementById('app');

  let meta = Object.assign(G.newMeta(), S.loadMeta() || {});
  G.refreshMeta(meta);
  let state = null;
  let screen = 'menu';
  let msg = '';

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => (Math.round(n * 10) / 10).toLocaleString('ko-KR');
  const btn = (label, act, arg, disabled, cls) =>
    `<button data-act="${act}"${arg !== undefined ? ` data-arg="${arg}"` : ''}${disabled ? ' disabled' : ''}${cls ? ` class="${cls}"` : ''}>${label}</button>`;

  function persist() {
    S.saveMeta(meta);
    if (state && !state.over) S.saveGame(state); else S.clearGame();
  }
  function say(res) {
    if (!res) return;
    const parts = [];
    if (res.msg) parts.push(res.msg);
    if (res.unlocked && res.unlocked.length) parts.push('🔓 해금: ' + res.unlocked.join(', '));
    if (parts.length) msg = parts.join('\n');
  }

  // ---------- 효과 설명 ----------
  function modsText(m) {
    const out = [];
    const pct = x => Math.round(x * 100) + '%';
    if (m.all) out.push('모든 가치 +' + pct(m.all));
    for (const r of D.RARITIES) if (m.pct[r]) out.push(r + ' 가치 +' + pct(m.pct[r]));
    for (const s in m.setPct) if (m.setPct[s]) out.push(D.SETS[s].name + ' 세트 가치 +' + pct(m.setPct[s]));
    if (m.extra) out.push('팩당 카드 +' + m.extra);
    if (m.up) out.push('희귀도 상승 ' + pct(m.up));
    if (m.perPack) out.push('팩 개봉 시 +' + m.perPack);
    if (m.maxPacks) out.push('하루 팩 +' + m.maxPacks);
    if (m.disc) out.push('팩 가격 -' + pct(m.disc));
    if (m.quota) out.push('할당량 -' + pct(m.quota));
    if (m.morning) out.push('아침 +' + m.morning);
    if (m.interest) out.push('아침 이자 ' + pct(m.interest) + ' (최대 ' + D.INTEREST_CAP + ')');
    if (m.bazaar) out.push('바자회 프리미엄 +' + m.bazaar);
    if (m.sell) out.push('판매가 +' + pct(m.sell));
    if (m.slots) out.push('보관 슬롯 +' + m.slots);
    if (m.heldMult) out.push('보관 카드 가치 +' + pct(m.heldMult));
    return out.length ? out.join(' · ') : '없음';
  }

  function cardBox(id, value, buttons) {
    const c = D.CARDS[id];
    const setName = c.set ? D.SETS[c.set].name : '바자회 특수';
    return `<div class="card r-${c.rarity}"><div class="t">[${c.rarity}] ${esc(c.name)}</div>
      <div class="muted">${setName} · 가치 ${fmt(value)}</div><div class="e">보관 시: ${esc(c.desc)}</div>${buttons || ''}</div>`;
  }

  // ---------- 화면: 메뉴 ----------
  function renderMenu() {
    const saved = S.loadGame();
    const best = meta.records[0];
    return `<h1>cardpack <span class="muted">목업 v0.1</span></h1>
      <div class="box">
        ${btn('새 게임', 'new', undefined, false, 'big')}
        ${btn(saved ? `이어하기 (${saved.day}일차, 돈 ${fmt(saved.money)})` : '이어하기 (저장 없음)', 'continue', undefined, !saved, 'big')}
        ${btn('기록', 'go', 'records')} ${btn('앨범', 'go', 'album')} ${btn('해금', 'go', 'unlocks')}
      </div>
      <div class="muted">최고 기록: ${best ? best.days + '일 생존 (총자산 ' + fmt(best.assets) + ')' : '없음'} · 플레이 ${meta.games}판 · 앨범 수집률 ${Math.round(meta.albumRate * 100)}%</div>
      ${msg ? `<div class="msg">${esc(msg)}</div>` : ''}
      <h2>규칙 요약</h2>
      <div class="box">매일 팩을 사서(하루 최대 ${D.BASE_MAX_PACKS}개) 열고, 카드를 팔거나 보관한 뒤 그날의 <b>할당량</b>을 냅니다. 못 내면 게임 오버.<br>
      할당량 = ceil(40 × 1.3^(일수−1)). 3일마다 마트 대신 <b>바자회</b>가 열려 카드를 비싸게 팔 수 있습니다(C×1 B×1.2 A×1.5 S×2 SS×3).<br>
      보관한 카드는 패시브 효과를 주고, 같은 세트 3장/5장을 보관하면 세트 효과가 켜집니다.</div>`;
  }

  function renderRecords() {
    const rows = meta.records.map((r, i) => `<tr><td>${i + 1}</td><td>${r.days}일</td><td>${fmt(r.assets)}</td><td>${r.date}</td></tr>`).join('');
    return `<h1>기록</h1>${btn('← 메뉴', 'go', 'menu')}
      <div class="wrap"><table><tr><th>#</th><th>생존</th><th>총자산</th><th>날짜</th></tr>${rows || '<tr><td colspan="4">아직 기록이 없습니다.</td></tr>'}</table></div>
      <p class="muted">순위: 생존 일수 → 동률이면 총자산(돈 + 보관 카드 가치)</p>`;
  }

  function renderAlbum() {
    const label = ['미발견', '목격', '수집'];
    let html = `<h1>앨범</h1>${btn('← 메뉴', 'go', 'menu')}
      <p>수집률 ${Math.round(meta.albumRate * 100)}% · <span class="muted">목격 = 개봉/진열에서 봄, 수집 = 보관한 적 있음</span></p>`;
    const groups = Object.keys(D.SETS).map(s => [D.SETS[s].name + ' 세트 (3장: ' + D.SETS[s].t1d + ' / 5장: ' + D.SETS[s].t2d + ')', D.NORMAL_IDS.filter(id => D.CARDS[id].set === s)]);
    groups.push(['바자회 특수카드', D.SPECIAL_IDS]);
    for (const [title, ids] of groups) {
      html += `<h2>${esc(title)}</h2><div class="alb">` + ids.map(id => {
        const st = meta.album[id] || 0, c = D.CARDS[id];
        return `<div class="s${st}">[${c.rarity}] ${st ? esc(c.name) : '???'}<br><span class="muted">${label[st]}${st ? ' · ' + esc(c.desc) : ''}</span></div>`;
      }).join('') + '</div>';
    }
    return html;
  }

  function renderUnlocks() {
    const rows = D.UNLOCKS.map(u => `<tr><td>${meta.unlocks.includes(u.id) ? '🔓' : '🔒'}</td><td>${esc(u.name)}</td><td>${esc(u.cond)}</td></tr>`).join('');
    return `<h1>해금</h1>${btn('← 메뉴', 'go', 'menu')}
      <div class="wrap"><table><tr><th></th><th>내용</th><th>조건</th></tr>${rows}</table></div>
      <p class="muted">최고 생존 ${meta.bestDays}일 · 앨범 ${Math.round(meta.albumRate * 100)}% · 완성 세트 ${meta.setsCollected.map(s => D.SETS[s].name).join(', ') || '없음'}</p>`;
  }

  // ---------- 화면: 게임 ----------
  function renderShop(m) {
    const sh = state.shop;
    const left = G.maxPacks(state, m) - state.packsBought;
    let html = `<h2>${sh.type === 'bazaar' ? '🎪 바자회' : '🛒 마트'} <span class="muted">— 오늘 팩 ${state.packsBought}/${G.maxPacks(state, m)}개 구매</span></h2><div class="box"><div class="row">`;
    for (const k of G.availablePacks(state, meta)) {
      const p = D.PACKS[k], price = G.packPrice(state, k, m);
      const stock = p.bazaar ? ` 남은 ${sh.stock[k]}` : '';
      html += btn(`${p.name} ${price}원 <span class="muted">(${p.cards + m.extra}장${p.specials ? ', 특수 ' + p.specials : ''}, 기대 ≈${Math.round(G.packEV(state, k, m))}${stock})</span>`,
        'buyPack', k, state.money < price || left <= 0 || (p.bazaar && sh.stock[k] <= 0));
    }
    html += '</div>';
    if (sh.type === 'mart') {
      html += '<div class="muted" style="margin-top:6px">오늘의 아이템</div><div class="row">';
      html += sh.items.length ? sh.items.map((id, i) => {
        const it = D.ITEMS[id];
        return btn(`<span class="tag">${it.kind === 'perm' ? '영구' : '1회'}</span>${esc(it.name)} ${it.price}원 <span class="muted">${esc(it.desc)}</span>`, 'buyItem', i, state.money < it.price);
      }).join('') : '<span class="muted">품절</span>';
      html += '</div>';
    } else {
      html += '<div class="muted" style="margin-top:6px">특수카드 단품</div><div class="grid">';
      html += sh.singles.length ? sh.singles.map((s, i) => cardBox(s.id, G.cardValue(state, s.id, {}, m), btn('구매 ' + s.price + '원', 'buySingle', i, state.money < s.price))).join('') : '<span class="muted">품절</span>';
      html += '</div><div class="muted" style="margin-top:6px">상인</div>';
      sh.npcs.forEach((n, ni) => { html += `<div class="box">${renderNpc(n, ni, m)}</div>`; });
    }
    return html + '</div>';
  }

  function renderNpc(n, ni, m) {
    if (n.type === 'collector') {
      const elig = state.opened.map((id, i) => [id, i]).filter(([id]) => D.CARDS[id].set === n.set);
      return `<b>${esc(n.name)}</b> (수집가): "${D.SETS[n.set].name} 세트 카드를 바자회 시세의 ${n.mult}배에 사겠소." 남은 매입 ${n.left}장<div class="row">` +
        (elig.length ? elig.map(([id, i]) => btn(`${D.CARDS[id].name} → +${fmt(G.collectorPrice(state, n, id))}`, 'npc', ni + ':' + i, n.left <= 0)).join('') : '<span class="muted">개봉 카드 중 해당 세트 없음 (보관 카드는 \'꺼내기\' 후 판매)</span>') + '</div>';
    }
    if (n.type === 'peddler') {
      return `<b>${esc(n.name)}</b> (행상인): "좋은 물건 있어요."<div class="grid">` +
        (n.offers.length ? n.offers.map((o, i) => cardBox(o.id, G.cardValue(state, o.id, {}, m), btn('구매 ' + o.price + '원', 'npc', ni + ':' + i, state.money < o.price))).join('') : '<span class="muted">다 팔렸습니다</span>') + '</div>';
    }
    if (n.type === 'trader') {
      const next = D.RARITIES[D.RARITIES.indexOf(n.rarity) + 1];
      return `<b>${esc(n.name)}</b> (교환상): "${n.rarity} 카드 2장을 주면 ${next} 카드 1장(랜덤)을 주지." 남은 교환 ${n.left}회 ` + btn('교환하기', 'npc', ni + ':0', n.left <= 0);
    }
    if (n.type === 'fortune') {
      return `<b>${esc(n.name)}</b> (점쟁이): "${n.price}원이면 오늘의 운을 열어 드리죠." (오늘 희귀도 상승 +15%) ` + btn(n.used ? '이미 봄' : '점 보기 ' + n.price + '원', 'npc', ni + ':0', n.used || state.money < n.price);
    }
    return '';
  }

  function renderGame() {
    const m = G.mods(state);
    const q = G.quotaToday(state, m);
    const slots = G.slotCount(state, m);
    const bazaar = G.isBazaar(state);
    const openedTotal = state.opened.reduce((s, id) => s + G.cardValue(state, id, {}, m), 0);
    const heldTotal = G.heldTotal(state, m);
    const projected = state.money + openedTotal;

    let html = `<div class="bar"><span><b>${state.day}일차</b> ${bazaar ? '🎪 바자회' : '🛒 마트'}</span>
      <span>💰 <b>${fmt(state.money)}</b></span><span>오늘 할당량 <b>${q}</b>${m.quota ? ` <span class="muted">(원래 ${D.quota(state.day)})</span>` : ''}</span>
      <span class="muted">다음 바자회: ${bazaar ? '오늘' : (D.BAZAAR_EVERY - state.day % D.BAZAAR_EVERY) + '일 후'}</span>
      ${btn('메뉴', 'go', 'menu')}</div>`;
    if (msg) html += `<div class="msg">${esc(msg)}</div>`;

    if (state.over) {
      const rec = meta.records.find(r => r === state._rec) || { days: state.survived, assets: G.totalAssets(state) };
      return html + `<div class="over"><h2>게임 오버</h2><p><b>${state.survived}일</b> 생존 · 총자산 ${fmt(rec.assets)} · 개봉 ${state.stats.packs}팩 / ${state.stats.cards}장</p>
        ${btn('새 게임', 'new', undefined, false, 'big')} ${btn('기록 보기', 'go', 'records')} ${btn('메뉴', 'go', 'menu')}</div>` + renderLog();
    }

    html += renderShop(m);

    // 미개봉
    if (state.unopened.length) {
      const counts = {};
      state.unopened.forEach(k => counts[k] = (counts[k] || 0) + 1);
      html += `<h2>📦 미개봉 팩</h2><div class="box">${Object.entries(counts).map(([k, n]) => D.PACKS[k].name + ' ×' + n).join(', ')} &nbsp;
        ${btn('1개 열기', 'open')} ${btn('모두 열기', 'openAll')}</div>`;
    }

    // 개봉 카드
    html += `<h2>🃏 개봉한 카드 (${state.opened.length}장, 합계 ${fmt(openedTotal)}) ${state.opened.length ? btn('전부 판매', 'sellAll') : ''}</h2>`;
    html += state.opened.length ? '<div class="grid">' + state.opened.map((id, i) =>
      cardBox(id, G.cardValue(state, id, {}, m), btn('판매', 'sell', i) + btn('보관', 'keep', i, state.held.length >= slots))).join('') + '</div>'
      : '<div class="muted">팩을 사서 열어 보세요.</div>';

    // 보관함
    const { counts, tiers } = G.setTiers(state);
    html += `<h2>🗄️ 보관함 ${state.held.length}/${slots} <span class="muted">(보관 카드 가치 합계 ${fmt(heldTotal)})</span></h2><div class="grid">`;
    html += state.held.map((id, i) => cardBox(id, G.cardValue(state, id, { held: true }, m), btn('판매', 'sellHeld', i) + btn('꺼내기', 'release', i))).join('');
    for (let i = state.held.length; i < slots; i++) html += '<div class="slot-empty">빈 슬롯</div>';
    html += '</div>';
    const setLine = Object.keys(D.SETS).filter(s => counts[s] > 0).map(s =>
      `${D.SETS[s].name} ${Math.min(counts[s], 5)}/5${tiers[s] === 2 ? ' ✅✅ ' + D.SETS[s].t2d + ', 보관 가치 +50%' : tiers[s] === 1 ? ' ✅ ' + D.SETS[s].t1d : ''}`).join(' · ');
    html += `<div class="box"><b>세트</b>: ${setLine || '<span class="muted">없음 (같은 세트 3장 → 1단계, 5장 → 2단계)</span>'}<br>
      <b>현재 효과</b>: ${modsText(m)}<br>
      <b>보유 아이템</b>: ${state.perm.map(id => D.ITEMS[id].name).join(', ') || '없음'}${state.today.length ? ' / 오늘만: ' + state.today.map(id => D.ITEMS[id].name).join(', ') : ''}${state.todayEff ? ' / 점괘' : ''}</div>`;

    // 지불
    const short = q - projected;
    html += `<h2>💸 할당량 지불</h2><div class="box">
      개봉 카드를 모두 팔면 ${fmt(projected)} → 지불 후 ${fmt(projected - q)}
      ${short > 0 ? `<br><b style="color:#c33">${fmt(short)} 부족</b> ${short <= heldTotal ? '(보관 카드를 팔면 낼 수 있음)' : '(보관 카드를 다 팔아도 부족 → 지불하면 게임 오버)'}` : ''}
      <br>${btn(`할당량 ${q} 지불하고 다음 날로 →`, 'pay', undefined, state.unopened.length > 0, 'big')}
      ${state.unopened.length ? '<span class="muted">미개봉 팩을 먼저 여세요</span>' : '<span class="muted">남은 개봉 카드는 자동 판매됩니다</span>'}</div>`;
    return html + renderLog();
  }

  function renderLog() {
    return `<h2>기록</h2><div class="log">${state.log.map(esc).join('<br>')}</div>`;
  }

  function render() {
    const y = window.scrollY;
    if (screen === 'game' && state) app.innerHTML = renderGame();
    else if (screen === 'records') app.innerHTML = renderRecords();
    else if (screen === 'album') app.innerHTML = renderAlbum();
    else if (screen === 'unlocks') app.innerHTML = renderUnlocks();
    else app.innerHTML = renderMenu();
    window.scrollTo(0, y);
  }

  // ---------- 입력 ----------
  const actions = {
    new() { state = G.newGame(meta); msg = '새 게임 시작! 시작자금 ' + D.START_MONEY + '원.'; screen = 'game'; window.scrollTo(0, 0); },
    continue() {
      const saved = S.loadGame();
      if (!saved) { msg = '저장된 게임이 없습니다.'; return; }
      state = saved; msg = state.day + '일차 이어하기'; screen = 'game';
    },
    go(arg) { screen = arg; if (arg !== 'game') msg = ''; window.scrollTo(0, 0); },
    buyPack(k) { say(G.buyPack(state, meta, k)); },
    buyItem(i) { say(G.buyItem(state, meta, +i)); },
    buySingle(i) { say(G.buySingle(state, meta, +i)); },
    npc(arg) { const [ni, a] = arg.split(':').map(Number); say(G.npcAction(state, meta, ni, a)); },
    open() { const r = G.openPack(state, meta); msg = r.ok ? state.log[0].replace(/^\[\d+일\] /, '') : r.msg; },
    openAll() {
      const lines = [];
      while (state.unopened.length) { G.openPack(state, meta); lines.push(state.log[0].replace(/^\[\d+일\] /, '')); }
      msg = lines.join('\n');
    },
    sell(i) { say(G.sellOpened(state, meta, +i)); },
    sellAll() { say(G.sellAllOpened(state)); },
    keep(i) { say(G.keepOpened(state, meta, +i)); },
    sellHeld(i) { say(G.sellHeld(state, meta, +i)); },
    release(i) { G.releaseHeld(state, meta, +i); msg = '보관 카드를 개봉 영역으로 꺼냈습니다.'; },
    pay() {
      const r = G.pay(state, meta);
      say(r);
      if (r.ok) { msg = r.msg + '\n☀️ ' + state.day + '일차 아침 (자동 저장)' + (G.isBazaar(state) ? ' — 오늘은 바자회!' : '') + (r.unlocked && r.unlocked.length ? '\n🔓 해금: ' + r.unlocked.join(', ') : ''); window.scrollTo(0, 0); }
      if (r.gameOver) window.scrollTo(0, 0);
    },
  };

  app.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    const fn = actions[b.dataset.act];
    if (!fn) return;
    fn(b.dataset.arg);
    persist();
    render();
  });

  render();
  window.__cp = { get state() { return state; }, get meta() { return meta; } }; // 디버그용
})();
