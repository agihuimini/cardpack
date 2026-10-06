// cardpack — 본 게임 화면 (v0.3)
// 개봉 화면은 js/unpack.js(데모와 같은 엔진)를 쓴다. 엔진이 요구하는 전역 훅:
//   변수 state, cards, slots, busy, tearAt / 함수 rollPack, renderPack, renderBar, sell
const GM = window.CPGame, DT = window.CPData, SV = window.CPStore;
window.QUICK_FLIP_ALL = true; // [모두 뒤집기]는 고등급 지연 연출 없이 한꺼번에

// ---------- 연출 엔진 훅 (전역) ----------
let state = 'idle', cards = [], slots = [], busy = false, tearAt = 0;

let game = null;
let meta = Object.assign(GM.newMeta(), SV.loadMeta() || {});
GM.refreshMeta(meta);
let screen = 'menu', msg = '', keptBefore = new Set(), showSettle = false;
let bookPage = 0, bookTurn = '', selUid = null;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = n => (Math.round(n * 10) / 10).toLocaleString('ko-KR') + '원';
const btn = (label, act, arg, disabled, cls) =>
  `<button data-act="${act}"${arg !== undefined ? ` data-arg="${esc(arg)}"` : ''}${disabled ? ' disabled' : ''}${cls ? ` class="${cls}"` : ''}>${label}</button>`;
const RNAME = {}; R.forEach(r => RNAME[r.id] = r);
const DES_PAGES = Math.ceil(DT.ROWS.length / DT.ROWS_PER_PAGE);
const FREE_PAGES = Math.ceil(DT.FREE_SLOTS / DT.FREE_PER_PAGE);

function persist() {
  SV.saveMeta(meta);
  if (game && !game.over) SV.saveGame(game); else SV.clearGame();
}
function say(res) {
  if (!res) return;
  const parts = [];
  if (res.msg) parts.push(res.msg);
  if (res.unlocked && res.unlocked.length) parts.push('🔓 해금: ' + res.unlocked.join(', '));
  if (parts.length) msg = parts.join('\n');
}

// ---------- 개봉 화면 ----------
function rollPack() { return game.opening.cards.map(GM.hydrate); }
function renderPack() {
  const t = $('#table');
  t.className = '';
  const op = game.opening;
  t.innerHTML = `<div id="pack"><div class="beam"></div><div class="top"></div><div class="rip"></div><span class="grip">✂ 드래그해서 찢기</span>
    <div class="body">CARDPACK<small>${DT.PACKS[op.k].name}${op.single ? ' 낱개' : ''} · ${op.cards.length}장</small></div></div>`;
  bindPackDrag($('#pack'));
  $('#settleList').innerHTML = '';
  keptBefore = new Set();
  state = 'pack'; renderBar();
}
function updateOpeningHeader() {
  const m = GM.mods(game);
  const c = game.contest;
  $('#oTitle').textContent = `${game.day}일차 · ${game.opening ? DT.PACKS[game.opening.k].name + ' 개봉' : '정산 완료'}`;
  $('#oStat').innerHTML = `<span>소지금 <b>${won(game.money)}</b></span>` +
    (c ? `<span>대회 <b>${c.score}</b>/${c.target}점</span>` : GM.isBazaar(game) ? '<span>🎪 바자회 시세</span>' : `<span>할당량 <b>${won(GM.quotaToday(game, m))}</b></span>`) +
    `<span>도감 임시칸 <b>${GM.freeRoom(game)}</b>칸 남음</span><span>미개봉 <b>${game.unopened.length}</b></span>`;
}
function showOpening() {
  $('#opening').hidden = false;
  document.body.style.overflow = 'hidden';
  updateOpeningHeader();
  fit();
  renderPack();
}
function closeOpening() {
  $('#opening').hidden = true;
  document.body.style.overflow = '';
  state = 'idle';
  render();
}
function keptIdx() { return slots.map((s, i) => s.classList.contains('kept') ? i : -1).filter(i => i >= 0); }

function renderBar() {
  const b = $('#bar');
  const n = cards.length;
  if (state === 'pack') b.innerHTML = `<span class="hint">팩을 클릭하거나, 잡고 옆으로 드래그해서 찢으세요 · 덜 찢고 놓으면 다시 봉인 · 빠르게 잡아떼면 확!</span>`;
  else if (state === 'tearing') b.innerHTML = `<span class="hint">… (클릭하면 스킵)</span>`;
  else if (state === 'settling') b.innerHTML = `<span class="hint">…</span>`;
  else if (state === 'reveal') {
    b.innerHTML = `<button class="primary" id="all" ${busy ? 'disabled' : ''}>모두 뒤집기</button>
      <span class="hint">${busy ? '연출 중 · 카드를 클릭하면 스킵' : '카드를 클릭하면 한 장씩 뒤집힘 · 뒤집힌 카드 클릭/🔍 = 자세히 보기'}</span>`;
    if (!busy) $('#all').onclick = flipAll;
  } else if (state === 'settle') {
    // 도감 임시칸이 가득 차면 판매 제외 불가: 방금 켠 표시는 되돌린다
    const room = GM.freeRoom(game);
    let warn = '';
    let kept = keptIdx();
    if (kept.length > room) {
      kept.filter(i => !keptBefore.has(i)).forEach(i => slots[i].classList.remove('kept'));
      kept = keptIdx();
      warn = ` <b style="color:var(--bad)">도감 일반카드 칸이 부족해 더 제외할 수 없습니다 (${room}칸 남음)</b>`;
    }
    keptBefore = new Set(kept);
    const m = GM.mods(game);
    const val = i => cards[i].price * GM.saleMult(game, cards[i].r.id, m);
    const all = cards.reduce((s, c, i) => s + val(i), 0);
    const part = cards.reduce((s, c, i) => s + (kept.includes(i) ? 0 : val(i)), 0);
    const multNote = GM.saleMult(game, 'common', m) !== 1 || GM.isBazaar(game) ? ' (판매 배율 적용)' : '';
    const contest = game.opening && game.opening.k === 'contest' ? ` · 대회 점수 +${GM.r2(cards.reduce((s, c) => s + c.price, 0) * GM.scoreMult(game))}` : '';
    b.innerHTML = `<span class="hint">가격 확정${contest} · 카드를 클릭하면 판매 제외(→ 도감)${multNote}${warn}</span>
      <button id="showList">${showSettle ? '정산 내역 닫기' : '정산 내역'}</button>
      <button id="sellAll">일괄 판매 (${n}장 · ${won(all)})</button>
      <button class="primary" id="sellPart" ${kept.length ? '' : 'disabled'}>선택 제외 후 판매 (${n - kept.length}장 · ${won(part)}, ${kept.length}장 도감)</button>`;
    $('#sellAll').onclick = () => sell(true);
    $('#sellPart').onclick = () => sell(false);
    $('#showList').onclick = () => { showSettle = !showSettle; renderBar(); };
    renderSettleList(kept);
  }
}
function renderSettleList(kept) {
  if (!showSettle) { $('#settleList').innerHTML = ''; return; }
  $('#settleList').innerHTML = '<b>정산 내역</b><br>' + cards.map((c, i) =>
    `${i + 1}. ${c.def.art} ${esc(c.def.name)}${c.r.mark ? ' ' + c.r.mark : ''} <b>${won(c.price)}</b>${c.notes.length ? ' <span style="opacity:.75">(' + esc(c.notes.join(', ')) + ')</span>' : ''}${kept.includes(i) ? ' <span style="color:#2bb673">도감</span>' : ''}`).join('<br>');
}
function sell(all) {
  const kept = all ? [] : keptIdx();
  const res = GM.finishOpening(game, meta, kept);
  if (!res.ok) { $('#bar').insertAdjacentHTML('afterbegin', `<b style="color:var(--bad)">${esc(res.msg || '판매 실패')}</b>`); return; }
  say(res);
  persist();
  state = 'done';
  $('#settleList').innerHTML = '';
  updateOpeningHeader();
  const b = $('#bar');
  b.innerHTML = `<span>${esc(res.msg)}</span>
    ${game.unopened.length ? `<button class="primary" id="nextPack">다음 팩 열기 (남은 ${game.unopened.length})</button>` : ''}<button id="toShop">${game.contest ? '대회장으로' : GM.isBazaar(game) ? '바자회로' : '상점으로'}</button>`;
  if (game.unopened.length) $('#nextPack').onclick = () => { const r = GM.startOpening(game, meta, 0); persist(); if (r.ok) { updateOpeningHeader(); renderPack(); } };
  $('#toShop').onclick = closeOpening;
}

// ---------- 공통 조각 ----------
function effectsText(m) {
  const out = [], pct = x => Math.round(x * 100) + '%';
  if (m.hi) out.push('골드 이상 확률 +' + pct(m.hi));
  for (const t in m.tagHi) if (m.tagHi[t]) out.push(t + ' 골드 이상 +' + pct(m.tagHi[t]));
  if (m.single) out.push('낱개 보너스 +' + pct(m.single));
  if (m.finish) out.push('마감 확률 +' + pct(m.finish));
  if (m.wear) out.push('마모 ' + (m.wear + 1) + '번 굴림');
  if (m.all) out.push('모든 가치 +' + pct(m.all));
  if (m.sell) out.push('판매가 +' + pct(m.sell));
  if (m.bazaar) out.push('바자회 프리미엄 +' + m.bazaar);
  if (m.disc) out.push('팩 가격 -' + pct(m.disc));
  if (m.maxPacks) out.push('하루 팩 +' + m.maxPacks);
  if (m.quota) out.push('할당량 -' + pct(m.quota));
  if (m.morning) out.push('아침 +' + m.morning + '원');
  if (m.interest) out.push('아침 이자 ' + pct(m.interest));
  return out.length ? out.join(' · ') : '없음';
}
function mini(s, extra) {
  const r = RNAME[s.r], def = DT.DEFS[s.d], f = F.find(x => x.id === s.f), w = W.find(x => x.g === s.w);
  return `<div class="mini g-${s.r} f-${s.f}"><div class="in"><b>${def.art} ${esc(def.name)}</b> <span class="muted">${r.name}${r.mark ? ' ' + r.mark : ''}</span><br>
    <span class="muted">${def.tag} · ${f.name} · ${w.short} ${w.g}</span>
    <div class="p"><span>${won(s.p)}</span><span>${extra || ''}</span></div></div></div>`;
}
const nextBazaarText = g => {
  const d = GM.dow(g);
  const next = DT.BAZAAR_DAYS.find(x => x >= d);
  return `${g.day + (next ? next - d : DT.WEEK - d + DT.BAZAAR_DAYS[0])}일차 마감 후`;
};

// ---------- 메뉴/기록/앨범/해금 ----------
function renderMenu() {
  const saved = SV.loadGame();
  const best = meta.records[0];
  return `<div class="narrow"><h1>CARDPACK <span class="muted">목업 v0.3</span></h1>
    <div class="box big-cta">
      ${btn('새 게임', 'new', undefined, false, 'big primary')}
      ${btn(saved ? `이어하기 (${saved.day}일차, ${won(saved.money)})` : '이어하기 (저장 없음)', 'continue', undefined, !saved, 'big')}
      ${btn('기록', 'go', 'records')} ${btn('카드 앨범', 'go', 'album')} ${btn('해금', 'go', 'unlocks')}
      <a href="demo/unpack.html">개봉 연출 데모 →</a>
    </div>
    <p class="muted">최고 기록: ${best ? best.days + '일 생존 (총자산 ' + won(best.assets) + ')' : '없음'} · 플레이 ${meta.games}판 · 대회 통과 ${meta.contests}회 · 앨범 수집률 ${Math.round(meta.albumRate * 100)}%</p>
    ${msg ? `<div class="msg">${esc(msg)}</div>` : ''}
    <h2>규칙 요약</h2>
    <div class="box">매일 팩을 사서(하루 최대 ${DT.MAX_PACKS}팩) <b>한 팩(${DT.PACK_SIZE}장)씩</b> 개봉합니다. 모두 공개되면 카드 능력까지 반영해 가격이 확정되고,
    일괄 판매하거나 원하는 카드를 판매에서 제외해 <b>도감</b>에 넣습니다. 하루 끝에 <b>할당량</b>을 못 내면 게임 오버.<br>
    <b>1주 = 7일</b>: 3·6일차는 마감 후 <b>바자회</b>(업그레이드는 바자회에서만), 7일차는 <b>카드 언팩 대회</b> — 대회팩 ${DT.TOURNEY.packs}개 점수 합계가 목표에 못 미치면 탈락.<br>
    도감 지정카드 페이지에서 가로줄 4장을 채우면 줄마다 <b>전체 점수 ×${DT.ROW_MULT}</b>.</div></div>`;
}
function renderRecords() {
  const rows = meta.records.map((r, i) => `<tr><td>${i + 1}</td><td>${r.days}일</td><td>${won(r.assets)}</td><td>${r.date}</td></tr>`).join('');
  return `<div class="narrow"><h1>기록</h1>${btn('← 메뉴', 'go', 'menu')}
    <div class="wrap"><table><tr><th>#</th><th>생존</th><th>총자산</th><th>날짜</th></tr>${rows || '<tr><td colspan="4">아직 기록이 없습니다.</td></tr>'}</table></div>
    <p class="muted">순위: 생존 일수 → 동률이면 총자산(돈 + 도감 카드 가치)</p></div>`;
}
function renderAlbum() {
  const label = ['미발견', '목격', '수집'];
  let html = `<div class="narrow"><h1>카드 앨범</h1>${btn('← 메뉴', 'go', 'menu')}
    <p>수집률 ${Math.round(meta.albumRate * 100)}% <span class="muted">· 모든 판에 걸친 기록 · 목격 = 개봉·진열에서 봄, 수집 = 도감에 넣은 적 있음</span></p>`;
  for (const row of DT.ROWS) {
    html += `<h2>${esc(row.name)}</h2><div class="alb">` + row.ids.map(id => {
      const a = meta.album[id] || { s: 0, fin: [], bestW: 0 }, d = DT.DEFS[id];
      const fins = a.fin.map(f => F.find(x => x.id === f).name).join(', ');
      const bw = a.bestW ? W.find(w => w.g === a.bestW) : null;
      return `<div class="s${a.s}">No.${String(DT.DESIGNATED.indexOf(id) + 1).padStart(3, '0')} ${a.s ? d.art + ' ' + esc(d.name) : '???'}<br><span class="muted">${label[a.s]}${a.s === 2 ? `<br>마감: ${fins}<br>최고 마모: ${bw.short} ${bw.g}` : ''}</span></div>`;
    }).join('') + '</div>';
  }
  return html + '</div>';
}
function renderUnlocks() {
  const rows = DT.UNLOCKS.map(u => `<tr><td>${meta.unlocks.includes(u.id) ? '🔓' : '🔒'}</td><td>${esc(u.name)}</td><td>${esc(u.cond)}</td></tr>`).join('');
  return `<div class="narrow"><h1>해금</h1>${btn('← 메뉴', 'go', 'menu')}
    <div class="wrap"><table><tr><th></th><th>내용</th><th>조건</th></tr>${rows}</table></div>
    <p class="muted">최고 생존 ${meta.bestDays}일 · 앨범 ${Math.round(meta.albumRate * 100)}%</p></div>`;
}

// ---------- 좌측 배너: 아이템 상점 + 가방 ----------
function renderLeft() {
  const sh = game.shop;
  const items = sh.items.map((id, i) => {
    const it = DT.ITEMS[id];
    return `<div class="sitem"><b>${esc(it.name)}</b>${it.bazaarOnly ? ' <span class="pill">바자회 한정</span>' : ''}<small>${esc(it.desc)}</small>${btn(won(it.price), 'buyItem', i, game.money < it.price)}</div>`;
  }).join('') || '<p class="muted">품절</p>';
  const effs = game.effects.map(e => `<li>${esc(DT.ITEMS[e.id].name)} <span class="muted">${'packs' in e ? '남은 ' + e.packs + '팩' : '남은 ' + e.days + '일'}</span></li>`).join('');
  return `<aside class="banner left"><div class="ribbon">🧪 아이템 상점</div>
    <p class="muted">${GM.isBazaar(game) ? '바자회 아이템' : '매일 바뀌는 1회용 아이템'}</p>${items}
    <div class="ribbon sub">🎒 가방 ${game.bag.length}/${DT.BAG_MAX}</div>
    ${game.bag.map((id, i) => `<div class="sitem"><b>${esc(DT.ITEMS[id].name)}</b><small>${esc(DT.ITEMS[id].desc)}</small>${btn('사용', 'useItem', i)}</div>`).join('') || '<p class="muted">비어 있음</p>'}
    ${effs ? `<div class="muted" style="margin-top:6px">사용 중</div><ul class="effs">${effs}</ul>` : ''}</aside>`;
}

// ---------- 우측 배너: 업그레이드 상점 + 보유 현황 ----------
function renderRight() {
  const sh = game.shop;
  let shop;
  if (GM.isBazaar(game)) {
    shop = sh.ups.map((id, i) => {
      const u = DT.UPGRADES[id], price = GM.upgradePrice(game, id);
      const lv = u.kind === 'luck' ? ` <span class="pill">Lv${game.luck[u.tag] || 0}→${(game.luck[u.tag] || 0) + 1}</span>` : '';
      const kind = { unlock: '해금', perm: '진열장', luck: '확률', shelf: '진열장 칸' }[u.kind];
      return `<div class="sitem"><b>${esc(u.name)}</b>${lv} <span class="pill">${kind}</span><small>${esc(u.desc)}</small>${btn(won(price), 'buyUpgrade', i, game.money < price)}</div>`;
    }).join('') || '<p class="muted">품절</p>';
  } else {
    shop = `<div class="locked">🔒 업그레이드는 <b>바자회</b>에서만 살 수 있습니다<br><span class="muted">다음 바자회: ${nextBazaarText(game)}</span></div>`;
  }
  const unl = ['fin_sparkle', 'fin_fullholo', 'fin_black', 'halo'].map(id => `<span class="pill${game.ups[id] ? ' on' : ''}">${DT.UPGRADES[id].name.replace(' 해금', '')}</span>`).join(' ');
  const luck = DT.TAGS.filter(t => game.luck[t]).map(t => `${t} Lv${game.luck[t]}`).join(' · ') || '없음';
  const slotsN = GM.showcaseSlots(game);
  const show = game.showcase.map((id, i) => `<div class="sitem"><b>${esc(DT.UPGRADES[id].name)}</b><small>${esc(DT.UPGRADES[id].desc)}</small>${btn('처분 +' + Math.floor(DT.UPGRADES[id].price / 2), 'sellShowcase', i)}</div>`).join('');
  return `<aside class="banner right"><div class="ribbon">⬆️ 업그레이드 상점</div>${shop}
    <div class="ribbon sub">특수효과 해금</div><div>${unl}</div>
    <div class="ribbon sub">분류 행운</div><div class="muted">${luck}</div>
    <div class="ribbon sub">🏛️ 진열장 ${game.showcase.length}/${slotsN}</div>${show || '<p class="muted">비어 있음</p>'}</aside>`;
}

// ---------- 가운데: 팩 / 바자회 / 대회 ----------
function renderPacks(m) {
  const left = GM.maxPacks(game, m) - game.packsBought;
  const avail = GM.availablePacks(game, meta);
  const base = ['basic', 'advanced', 'premium'].filter(k => avail.includes(k)).map(k => {
    const p = DT.PACKS[k];
    const pb = GM.packPrice(game, k, 'bundle', m), ps = GM.packPrice(game, k, 'single', m);
    return `<tr><td>${p.name} <span class="muted">골드 이상 ×${p.boost}</span></td>
      <td>${btn(won(pb) + ' (5팩)', 'buyPack', k + ':bundle', game.money < pb || left < 5)}</td>
      <td>${btn(won(ps), 'buyPack', k + ':single', game.money < ps || left < 1)}</td></tr>`;
  }).join('');
  const themes = game.shop.themes.map(k => {
    const p = DT.PACKS[k], price = GM.packPrice(game, k, 'single', m), st = game.shop.stock[k];
    return `<div class="tpack"><div class="tp-name">${esc(p.name)}</div><small>${esc(p.desc)} · ${p.pool ? p.pool.length + '종' : '전 카드'}</small>
      ${btn(`${won(price)} <span class="muted">남은 ${st}</span>`, 'buyPack', k + ':single', game.money < price || left < 1 || st <= 0)}</div>`;
  }).join('');
  return `<h2>📦 팩 <small>오늘 ${game.packsBought}/${GM.maxPacks(game, m)}팩 구매 · ${DT.PACK_SIZE}장 들이</small></h2>
    <div class="box"><div class="wrap"><table><tr><th>팩</th><th>5팩 묶음 (할인)</th><th>낱개 (골드 이상 ×${(1 + DT.SINGLE_BONUS + m.single).toFixed(1)})</th></tr>${base}</table></div>
    ${themes ? `<div class="muted" style="margin:8px 0 4px">✨ 오늘의 특수 팩 (랜덤 등장, 낱개만)</div><div class="tpacks">${themes}</div>` : ''}</div>`;
}
function renderBazaarCorner(m) {
  const sh = game.shop;
  const specials = Object.keys(sh.stock).map(k => {
    const p = DT.PACKS[k], price = GM.packPrice(game, k, 'single', m);
    return `<div class="tpack"><div class="tp-name">${esc(p.name)}</div><small>${esc(p.desc)}</small>${btn(`${won(price)} <span class="muted">남은 ${sh.stock[k]}</span>`, 'buyPack', k + ':single', game.money < price || sh.stock[k] <= 0)}</div>`;
  }).join('');
  let html = `<div class="corner"><h3>🃏 카드 코너 <span class="muted">→ 도감 일반카드 칸</span></h3><div class="tpacks">${specials}</div>
    <div class="muted" style="margin-top:8px">특수카드 단품</div><div class="minis">${sh.singles.length ? sh.singles.map((o, i) => mini(o.card, btn('구매 ' + won(o.price), 'buySingle', i, game.money < o.price))).join('') : '<span class="muted">품절</span>'}</div>`;
  sh.npcs.forEach((n, ni) => { html += `<div class="box">${renderNpc(n, ni)}</div>`; });
  return html + '</div>';
}
function renderNpc(n, ni) {
  if (n.type === 'collector') {
    return `<b>${esc(n.name)}</b> <span class="pill">수집가</span> "${n.tag} 카드를 바자회 시세의 ${n.mult}배에 사겠소." 남은 매입 ${n.left}장<br><span class="muted">도감에서 ${n.tag} 카드를 고르면 [수집가] 버튼이 생깁니다.</span>`;
  }
  if (n.type === 'peddler') {
    return `<b>${esc(n.name)}</b> <span class="pill">행상인</span> "좋은 물건 있어요."<div class="minis" style="margin-top:6px">` +
      (n.offers.length ? n.offers.map((o, i) => mini(o.card, btn('구매 ' + won(o.price), 'npc', ni + ':' + i, game.money < o.price))).join('') : '<span class="muted">다 팔렸습니다</span>') + '</div>';
  }
  if (n.type === 'trader') {
    const counts = {};
    game.binder.free.forEach(s => { if (s) counts[s.r] = (counts[s.r] || 0) + 1; });
    const opts = R.slice(0, 8).filter(r => counts[r.id] >= 2);
    return `<b>${esc(n.name)}</b> <span class="pill">교환상</span> "같은 등급 2장을 주면 한 등급 위 카드 1장을 주지." 남은 교환 ${n.left}회 <span class="muted">(도감 일반카드 칸에서)</span><div class="row" style="margin-top:6px">` +
      (opts.length ? `<select id="tradeSel">${opts.map(r => `<option value="${r.id}">${r.name} 2장 → ${R[R.indexOf(r) + 1].name}</option>`).join('')}</select>${btn('교환', 'trade', ni, n.left <= 0)}`
        : '<span class="muted">일반카드 칸에 같은 등급 카드가 2장 이상 없습니다</span>') + '</div>';
  }
  return '';
}

// ---------- 도감 (책) ----------
function binderCard(s) {
  const wrap = document.createElement('div');
  wrap.className = 'flipped bcard';
  const el = cardEl(GM.hydrate(s));
  wrap.appendChild(el);
  bindTilt(el);
  return wrap;
}
function renderBook() {
  const total = DES_PAGES + FREE_PAGES;
  bookPage = Math.max(0, Math.min(total - 1, bookPage));
  const isDes = bookPage < DES_PAGES;
  const done = GM.completedRows(game).map(r => r.name);
  let body = '';
  if (isDes) {
    const rows = DT.ROWS.slice(bookPage * DT.ROWS_PER_PAGE, (bookPage + 1) * DT.ROWS_PER_PAGE);
    body = rows.map(row => `<div class="brow${done.includes(row.name) ? ' done' : ''}"><div class="rlabel">${esc(row.name)}${done.includes(row.name) ? ` <b>✓ ×${DT.ROW_MULT}</b>` : ''}</div><div class="bcells">` +
      row.ids.map(id => {
        const no = String(DT.DESIGNATED.indexOf(id) + 1).padStart(3, '0');
        const s = game.binder.des[id], seen = meta.album[id] && meta.album[id].s;
        return `<div class="bslot${s ? ' has' : ''}${s && s.u === selUid ? ' sel' : ''}" data-uid="${s ? s.u : ''}"><span class="no">No.${no}</span><span class="ghost">${seen ? DT.DEFS[id].art + '<br>' + esc(DT.DEFS[id].name) : '???'}</span></div>`;
      }).join('') + '</div></div>').join('');
  } else {
    const p = bookPage - DES_PAGES;
    const cells = [];
    for (let i = p * DT.FREE_PER_PAGE; i < Math.min(DT.FREE_SLOTS, (p + 1) * DT.FREE_PER_PAGE); i++) {
      const s = game.binder.free[i];
      cells.push(`<div class="bslot free${s ? ' has' : ''}${s && s.u === selUid ? ' sel' : ''}" data-uid="${s ? s.u : ''}"><span class="no">${i + 1}</span><span class="ghost">빈 칸</span></div>`);
    }
    body = `<div class="bcells free">${cells.join('')}</div>`;
  }
  const title = isDes ? `지정카드 ${bookPage + 1}/${DES_PAGES}` : `일반카드 ${bookPage - DES_PAGES + 1}/${FREE_PAGES}`;
  const tabs = [...Array(total).keys()].map(i => `<button class="tab${i === bookPage ? ' on' : ''}" data-act="page" data-arg="${i}">${i < DES_PAGES ? '지정' + (i + 1) : '일반' + (i - DES_PAGES + 1)}</button>`).join('');
  return `<h2>📖 도감 <small>지정카드 ${Object.keys(game.binder.des).length}/${DT.DESIGNATED.length} · 일반카드 ${DT.FREE_SLOTS - GM.freeRoom(game)}/${DT.FREE_SLOTS} · 완성 가로줄 ${done.length}줄 → 전체 점수 ×${GM.scoreMult(game)}</small></h2>
    <div class="book">
      <button class="turn" data-act="turn" data-arg="-1" ${bookPage === 0 ? 'disabled' : ''}>◀</button>
      <div class="pagewrap"><div class="page ${isDes ? 'des' : 'freep'} ${bookTurn}" id="page"><div class="ptitle">${title}</div>${body}</div></div>
      <button class="turn" data-act="turn" data-arg="1" ${bookPage === total - 1 ? 'disabled' : ''}>▶</button>
    </div>
    <div class="tabs">${tabs}${btn('임시칸 → 지정칸 자동 정리', 'arrange')}</div>
    ${renderSelected()}`;
}
function renderSelected() {
  if (!selUid) return '<p class="muted">도감의 카드를 누르면 지정칸 넣기·판매 등을 할 수 있습니다.</p>';
  const f = GM.findCard(game, selUid);
  if (!f) { selUid = null; return ''; }
  const s = f.card, m = GM.mods(game);
  const has = game.binder.des[s.d];
  const col = GM.isBazaar(game) && game.shop.npcs.find(n => n.type === 'collector' && n.left > 0 && n.tag === DT.DEFS[s.d].tag);
  const colIdx = col ? game.shop.npcs.indexOf(col) : -1;
  return `<div class="box selbar"><b>${DT.DEFS[s.d].art} ${esc(GM.cardLabel(s))}</b> <span class="muted">${RNAME[s.r].name} · 확정 ${won(s.p)} · ${f.loc === 'des' ? '지정칸' : '일반카드 칸'}</span>
    <div class="row" style="margin-top:6px">
      ${f.loc === 'free' ? btn(has ? '지정칸 카드와 교체' : '지정칸에 넣기', 'place', s.u) : btn('일반카드 칸으로 빼기', 'unplace', s.u)}
      ${btn('판매 ' + won(GM.saleValue(game, s, m)), 'sellCard', s.u)}
      ${col ? btn('수집가에게 ' + won(GM.collectorPrice(game, col, s)), 'npc', colIdx + ':' + s.u) : ''}
      ${btn('🔍 자세히', 'inspect', s.u)} ${btn('선택 해제', 'deselect')}</div></div>`;
}
// 렌더 후 도감 칸에 실제 카드(연출 엔진의 카드 모양)를 끼워 넣는다
function mountBookCards() {
  document.querySelectorAll('.bslot.has').forEach(el => {
    const f = GM.findCard(game, +el.dataset.uid);
    if (f) el.appendChild(binderCard(f.card));
  });
}

function renderGame() {
  const m = GM.mods(game);
  const bazaar = GM.isBazaar(game), tour = GM.isTourney(game), c = game.contest;
  const week = DT.weekOf(game.day), dw = GM.dow(game);
  const kind = bazaar ? '🎪 바자회' : tour ? '🏆 카드 언팩 대회' : '🛒 마트';
  let html = `<div class="topbar"><span><b>${game.day}일차</b> <span class="muted">${week}주차 ${dw}/7</span> ${kind}</span>
    <span>💰 <b>${won(game.money)}</b></span>
    ${tour ? `<span>대회 <b>${c.score}</b>/${c.target}점</span>` : bazaar ? '<span class="muted">할당량 지불 완료</span>' : `<span>오늘 할당량 <b>${won(GM.quotaToday(game, m))}</b></span>`}
    <span>전체 점수 ×${GM.scoreMult(game)}</span>
    <span class="sp">${btn('메뉴', 'go', 'menu')}</span></div>`;
  if (msg) html += `<div class="msg">${esc(msg)}</div>`;
  if (game.over) {
    return html + `<div class="narrow"><div class="over"><h2>게임 오버</h2><p>${esc(game.log[0] || '')}</p><p><b>${game.survived}일</b> 생존 · 총자산 ${won(GM.totalAssets(game))} · 개봉 ${game.stats.packs}팩 / ${game.stats.cards}장
      ${game.stats.best ? ' · 최고 카드 ' + esc(GM.cardLabel(game.stats.best)) + ' ' + won(game.stats.best.p) : ''}</p>
      ${btn('새 게임', 'new', undefined, false, 'big primary')} ${btn('기록 보기', 'go', 'records')} ${btn('메뉴', 'go', 'menu')}</div>${renderLog()}</div>`;
  }
  let main = '';
  // 미개봉 팩
  const counts = {};
  game.unopened.forEach(p => { const k = DT.PACKS[p.k].name + (p.single ? ' 낱개' : ''); counts[k] = (counts[k] || 0) + 1; });
  if (tour) {
    main += `<div class="contest"><h2>🏆 ${c.week}주차 카드 언팩 대회</h2>
      <p>대회팩 ${c.packs}개를 열어 <b>정산 합계(× 전체 점수 배율)</b>가 <b>${c.target}점</b> 이상이면 통과, 못 미치면 탈락(게임 오버). 통과 상금 ${won(Math.round(c.target * DT.TOURNEY.prize))}. 오늘은 할당량이 없고 팩을 팔지 않습니다.</p>
      <div class="meter"><div style="width:${Math.min(100, c.score / c.target * 100)}%"></div><span>${c.score} / ${c.target}점 · ${c.opened}/${c.packs}팩</span></div></div>`;
  }
  main += `<h2>${bazaar ? '🎪 바자회 — 오늘 마감 후' : '📭 미개봉 팩'} <small>한 번에 1팩씩 · 개봉 중에는 상점 이용 불가</small></h2><div class="box big-cta">
    ${game.unopened.length ? Object.entries(counts).map(([k, n]) => `${k} ×${n}`).join(', ') + ' ' + btn('팩 열기 →', 'open', 0, false, 'big primary') : '<span class="muted">열 팩이 없습니다.</span>'}</div>`;
  if (bazaar) main += renderBazaarCorner(m);
  else if (!tour) main += renderPacks(m);
  main += renderBook();
  main += `<div class="box" style="margin-top:10px"><b>현재 효과</b>: ${effectsText(m)}</div>`;
  // 하루 마무리
  if (bazaar) {
    main += `<h2>🌙 바자회 마치기</h2><div class="box">바자회에서 파는 카드는 등급별 프리미엄(일반 ×1 → 레전드 ×3)이 붙습니다.<br><br>${btn('바자회 마치고 다음 날로 →', 'pay', undefined, false, 'big')}</div>`;
  } else if (tour) {
    const left = game.unopened.filter(p => p.k === 'contest').length;
    main += `<h2>🏁 대회 결과</h2><div class="box">${btn(left ? `대회팩 ${left}개를 먼저 여세요` : '대회 결과 확인 →', 'pay', undefined, left > 0, 'big primary')}</div>`;
  } else {
    const q = GM.quotaToday(game, m), sv = GM.binderValue(game, m), short = q - game.money;
    main += `<h2>💸 할당량 지불</h2><div class="box">
      소지금 ${won(game.money)} − 할당량 ${won(q)} = <b>${won(game.money - q)}</b>
      ${game.unopened.length ? `<br><span class="muted">미개봉 팩 ${game.unopened.length}개는 다음 날로 넘어갑니다.</span>` : ''}
      ${short > 0 ? `<br><b style="color:var(--bad)">${won(short)} 부족</b> ${short <= sv ? '— 도감 카드를 팔면 낼 수 있습니다' : '— 도감 카드를 다 팔아도 부족 (지불하면 게임 오버)'}` : ''}
      ${GM.bazaarAfterToday(game) ? '<br>🎪 오늘 마감 후 바자회가 열립니다.' : ''}
      <br><br>${btn(`할당량 ${won(q)} 지불하고 마감 →`, 'pay', undefined, false, 'big')}</div>`;
  }
  main += renderLog();
  return html + `<div class="layout">${renderLeft()}<main>${main}</main>${renderRight()}</div>`;
}
function renderLog() {
  return `<h2>기록</h2><div class="log">${game.log.map(esc).join('<br>')}</div>`;
}

function render() {
  const y = window.scrollY;
  const app = $('#app');
  if (screen === 'game' && game) app.innerHTML = renderGame();
  else if (screen === 'records') app.innerHTML = renderRecords();
  else if (screen === 'album') app.innerHTML = renderAlbum();
  else if (screen === 'unlocks') app.innerHTML = renderUnlocks();
  else app.innerHTML = renderMenu();
  if (screen === 'game' && game && !game.over) mountBookCards();
  bookTurn = '';
  window.scrollTo(0, y);
}

// ---------- 입력 ----------
const actions = {
  new() { game = GM.newGame(meta); msg = '새 게임 시작! 시작자금 ' + won(DT.START_MONEY) + '.'; screen = 'game'; bookPage = 0; selUid = null; window.scrollTo(0, 0); },
  continue() {
    const saved = SV.loadGame();
    if (!saved) { msg = '저장된 게임이 없습니다.'; return; }
    game = saved; msg = game.day + '일차 이어하기'; screen = 'game'; selUid = null;
    if (game.opening) { msg += ' — 개봉 중이던 팩을 다시 엽니다'; setTimeout(showOpening, 0); }
  },
  go(arg) { screen = arg; if (arg !== 'game') msg = ''; window.scrollTo(0, 0); },
  buyPack(arg) { const [k, kind] = arg.split(':'); say(GM.buyPack(game, meta, k, kind)); },
  buyItem(i) { say(GM.buyItem(game, meta, +i)); },
  buyUpgrade(i) { say(GM.buyUpgrade(game, meta, +i)); },
  useItem(i) { say(GM.useItem(game, +i)); },
  sellShowcase(i) { say(GM.sellShowcase(game, +i)); },
  buySingle(i) { say(GM.buySingle(game, meta, +i)); },
  npc(arg) { const [ni, a] = arg.split(':').map(Number); say(GM.npcAction(game, meta, ni, a)); if (selUid && !GM.findCard(game, selUid)) selUid = null; },
  trade(ni) { const sel = $('#tradeSel'); say(GM.npcAction(game, meta, +ni, sel && sel.value)); },
  turn(d) { const np = bookPage + +d; bookTurn = +d > 0 ? 'in-next' : 'in-prev'; bookPage = np; },
  page(i) { bookTurn = +i > bookPage ? 'in-next' : +i < bookPage ? 'in-prev' : ''; bookPage = +i; },
  select(u) { selUid = +u === selUid ? null : +u; },
  deselect() { selUid = null; },
  place(u) { say(GM.placeDesignated(game, +u)); selUid = null; },
  unplace(u) { say(GM.unplace(game, +u)); selUid = null; },
  arrange() { say(GM.autoArrange(game)); },
  sellCard(u) { say(GM.sellCard(game, +u)); selUid = null; },
  inspect(u) { const f = GM.findCard(game, +u); if (f) inspectCard(GM.inspectable(f.card), true); },
  open(i) {
    const r = GM.startOpening(game, meta, +i);
    if (!r.ok) { say(r); return; }
    msg = '';
    setTimeout(showOpening, 0);
  },
  pay() {
    const r = GM.pay(game, meta);
    say(r);
    if (r.ok) {
      selUid = null;
      const head = GM.isBazaar(game) ? '' : '\n☀️ ' + game.day + '일차 아침 (자동 저장)' + (GM.isTourney(game) ? ' — 오늘은 카드 언팩 대회!' : '');
      msg = r.msg + head + (r.unlocked && r.unlocked.length ? '\n🔓 해금: ' + r.unlocked.join(', ') : '');
    }
    window.scrollTo(0, 0);
  },
};

$('#app').addEventListener('click', e => {
  const zoom = e.target.closest('.bslot .zoom');
  if (zoom) { e.stopPropagation(); actions.inspect(zoom.closest('.bslot').dataset.uid); return; }
  const slotEl = e.target.closest('.bslot.has');
  const b = e.target.closest('button[data-act]');
  if (slotEl && !b) { actions.select(slotEl.dataset.uid); render(); return; }
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.act];
  if (!fn) return;
  fn(b.dataset.arg);
  persist();
  render();
});

render();
window.__cp = { get game() { return game; }, get meta() { return meta; } }; // 디버그·테스트용
