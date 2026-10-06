// cardpack — 본 게임 화면 (v0.2)
// 개봉 화면은 js/unpack.js(데모와 같은 엔진)를 쓴다. 엔진이 요구하는 전역 훅:
//   변수 state, cards, slots, busy, tearAt / 함수 rollPack, renderPack, renderBar, sell
const GM = window.CPGame, DT = window.CPData, SV = window.CPStore;

// ---------- 연출 엔진 훅 (전역) ----------
let state = 'idle', cards = [], slots = [], busy = false, tearAt = 0;

let game = null;
let meta = Object.assign(GM.newMeta(), SV.loadMeta() || {});
GM.refreshMeta(meta);
let screen = 'menu', msg = '', keptBefore = new Set(), showSettle = false;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = n => (Math.round(n * 10) / 10).toLocaleString('ko-KR') + '원';
const btn = (label, act, arg, disabled, cls) =>
  `<button data-act="${act}"${arg !== undefined ? ` data-arg="${esc(arg)}"` : ''}${disabled ? ' disabled' : ''}${cls ? ` class="${cls}"` : ''}>${label}</button>`;
const RNAME = {}; R.forEach(r => RNAME[r.id] = r);

function persist() {
  SV.saveMeta(meta);
  if (game && !game.over) SV.saveGame(game); else SV.clearGame();
}
function say(res) {
  if (!res) return;
  const parts = [];
  if (res.msg) parts.push(res.msg);
  if (res.newCollections && res.newCollections.length) parts.push('🎉 컬렉션 완성: ' + res.newCollections.join(', '));
  if (res.unlocked && res.unlocked.length) parts.push('🔓 해금: ' + res.unlocked.join(', '));
  if (parts.length) msg = parts.join('\n');
}

// ---------- 개봉 화면 ----------
function rollPack() {
  return game.opening.cards.map(GM.hydrate);
}
function renderPack() {
  const t = $('#table');
  t.className = '';
  const op = game.opening;
  t.innerHTML = `<div id="pack"><div class="beam"></div><div class="top"></div><div class="rip"></div><span class="grip">✂ 드래그해서 찢기</span>
    <div class="body">CARDPACK<small>${DT.PACKS[op.k].name}${op.single ? ' 낱개' : ''} · 9장</small></div></div>`;
  bindPackDrag($('#pack'));
  $('#settleList').innerHTML = '';
  keptBefore = new Set();
  state = 'pack'; renderBar();
}
function updateOpeningHeader() {
  const m = GM.mods(game);
  $('#oTitle').textContent = `${game.day}일차 · ${game.opening ? DT.PACKS[game.opening.k].name + ' 개봉' : '정산 완료'}`;
  $('#oStat').innerHTML = `<span>소지금 <b>${won(game.money)}</b></span><span>할당량 <b>${won(GM.quotaToday(game, m))}</b></span>
    <span>보관함 <b>${game.storage.length}</b>/${DT.STORAGE_MAX}</span><span>미개봉 <b>${game.unopened.length}</b></span>`;
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
  if (state === 'pack') b.innerHTML = `<span class="hint">팩을 클릭하거나, 잡고 옆으로 드래그해서 찢으세요 · 덜 찢고 놓으면 다시 봉인 · 빠르게 잡아떼면 확!</span>`;
  else if (state === 'tearing') b.innerHTML = `<span class="hint">… (클릭하면 스킵)</span>`;
  else if (state === 'settling') b.innerHTML = `<span class="hint">…</span>`;
  else if (state === 'reveal') {
    b.innerHTML = `<button class="primary" id="all" ${busy ? 'disabled' : ''}>모두 뒤집기</button>
      <span class="hint">${busy ? '연출 중 · 카드를 클릭하면 스킵' : '카드를 클릭하면 한 장씩 뒤집힘 · 뒤집힌 카드 클릭/🔍 = 자세히 보기'}</span>`;
    if (!busy) $('#all').onclick = flipAll;
  } else if (state === 'settle') {
    // 보관함이 가득 차면 판매 제외(보관) 불가: 방금 켠 표시는 되돌린다
    const room = DT.STORAGE_MAX - game.storage.length;
    let warn = '';
    let kept = keptIdx();
    if (kept.length > room) {
      kept.filter(i => !keptBefore.has(i)).forEach(i => slots[i].classList.remove('kept'));
      kept = keptIdx();
      warn = ` <b style="color:var(--bad)">보관함이 가득 차서 더 제외할 수 없습니다 (${room}장 남음)</b>`;
    }
    keptBefore = new Set(kept);
    const m = GM.mods(game);
    const val = i => cards[i].price * GM.saleMult(game, cards[i].r.id, m);
    const all = cards.reduce((s, c, i) => s + val(i), 0);
    const part = cards.reduce((s, c, i) => s + (kept.includes(i) ? 0 : val(i)), 0);
    const multNote = GM.isBazaar(game) || m.sell ? ' (판매 배율 적용)' : '';
    b.innerHTML = `<span class="hint">가격 확정 · 카드를 클릭하면 판매 제외(보관)${multNote}${warn}</span>
      <button id="showList">${showSettle ? '정산 내역 닫기' : '정산 내역'}</button>
      <button id="sellAll">일괄 판매 (9장 · ${won(all)})</button>
      <button class="primary" id="sellPart" ${kept.length ? '' : 'disabled'}>선택 제외 후 판매 (${9 - kept.length}장 · ${won(part)}, ${kept.length}장 보관)</button>`;
    $('#sellAll').onclick = () => sell(true);
    $('#sellPart').onclick = () => sell(false);
    $('#showList').onclick = () => { showSettle = !showSettle; renderBar(); };
    renderSettleList(kept);
  }
}
// 정산 내역: 카드별 확정 가격과 적용된 능력
function renderSettleList(kept) {
  if (!showSettle) { $('#settleList').innerHTML = ''; return; }
  $('#settleList').innerHTML = '<b>정산 내역</b><br>' + cards.map((c, i) =>
    `${c.def.art} ${esc(c.def.name)}${c.r.mark ? ' ' + c.r.mark : ''} <b>${won(c.price)}</b>${c.notes.length ? ' <span style="opacity:.75">(' + esc(c.notes.join(', ')) + ')</span>' : ''}${kept.includes(i) ? ' <span style="color:#2bb673">보관</span>' : ''}`).join('<br>');
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
  b.innerHTML = `<span><b>${won(res.sum)}</b> 판매${kept.length ? ` · ${kept.length}장 보관` : ''}${res.newCollections.length ? ' · 🎉 컬렉션 완성: ' + res.newCollections.join(', ') : ''}</span>
    ${game.unopened.length ? `<button class="primary" id="nextPack">다음 팩 열기 (남은 ${game.unopened.length})</button>` : ''}<button id="toShop">상점으로</button>`;
  if (game.unopened.length) $('#nextPack').onclick = () => { const r = GM.startOpening(game, meta, 0); persist(); if (r.ok) { updateOpeningHeader(); renderPack(); } };
  $('#toShop').onclick = closeOpening;
}

// ---------- 메인 화면 ----------
function effectsText(m) {
  const out = [], pct = x => Math.round(x * 100) + '%';
  if (m.hi) out.push('골드 이상 확률 +' + pct(m.hi));
  if (m.single) out.push('낱개 보너스 +' + pct(m.single));
  if (m.finish) out.push('마감 확률 +' + pct(m.finish));
  if (m.wear) out.push('마모 ' + (m.wear + 1) + '번 굴림');
  if (m.all) out.push('모든 가치 +' + pct(m.all));
  for (const t in m.tag) if (m.tag[t]) out.push(t + ' 가치 +' + pct(m.tag[t]));
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

function renderMenu() {
  const saved = SV.loadGame();
  const best = meta.records[0];
  return `<h1>CARDPACK <span class="muted">목업 v0.2</span></h1>
    <div class="box big-cta">
      ${btn('새 게임', 'new', undefined, false, 'big primary')}
      ${btn(saved ? `이어하기 (${saved.day}일차, ${won(saved.money)})` : '이어하기 (저장 없음)', 'continue', undefined, !saved, 'big')}
      ${btn('기록', 'go', 'records')} ${btn('앨범', 'go', 'album')} ${btn('해금', 'go', 'unlocks')}
      <a href="demo/unpack.html">개봉 연출 데모 →</a>
    </div>
    <p class="muted">최고 기록: ${best ? best.days + '일 생존 (총자산 ' + won(best.assets) + ')' : '없음'} · 플레이 ${meta.games}판 · 앨범 수집률 ${Math.round(meta.albumRate * 100)}%</p>
    ${msg ? `<div class="msg">${esc(msg)}</div>` : ''}
    <h2>규칙 요약</h2>
    <div class="box">매일 상점에서 팩을 사고(하루 최대 ${DT.MAX_PACKS}팩, 5팩 묶음 또는 낱개) <b>한 팩씩</b> 개봉합니다. 9장이 모두 공개되면 카드 능력까지 반영해 가격이 확정되고,
    일괄 판매하거나 원하는 카드를 판매에서 제외해 <b>보관함</b>(100장)에 넣을 수 있습니다. 보관함에서 같은 컬렉션 5종을 모으면 컬렉션 효과가 켜집니다.<br>
    하루 끝에 <b>할당량</b>을 내지 못하면 게임 오버. 3일마다 마트 대신 <b>바자회</b>가 열려 고등급 카드를 비싸게 팔 수 있습니다.</div>`;
}

function renderRecords() {
  const rows = meta.records.map((r, i) => `<tr><td>${i + 1}</td><td>${r.days}일</td><td>${won(r.assets)}</td><td>${r.date}</td></tr>`).join('');
  return `<h1>기록</h1>${btn('← 메뉴', 'go', 'menu')}
    <div class="wrap"><table><tr><th>#</th><th>생존</th><th>총자산</th><th>날짜</th></tr>${rows || '<tr><td colspan="4">아직 기록이 없습니다.</td></tr>'}</table></div>
    <p class="muted">순위: 생존 일수 → 동률이면 총자산(돈 + 보관함 카드 가치)</p>`;
}

function renderAlbum() {
  const label = ['미발견', '목격', '수집'];
  let html = `<h1>앨범</h1>${btn('← 메뉴', 'go', 'menu')}
    <p>수집률 ${Math.round(meta.albumRate * 100)}% <span class="muted">· 목격 = 개봉·진열에서 봄, 수집 = 보관함에 넣은 적 있음</span></p>`;
  const groups = DT.TAGS.map(t => [t + ' 컬렉션 — ' + DT.COLLECTIONS[t].desc, GM.DEFS_BY_TAG[t]]);
  groups.push(['이벤트 카드 (한 판에 각 1장)', DT.EVENTS.map(e => e.id)]);
  for (const [title, ids] of groups) {
    html += `<h2>${esc(title)}</h2><div class="alb">` + ids.map(id => {
      const a = meta.album[id] || { s: 0, fin: [], bestW: 0 }, d = DT.DEFS[id];
      const fins = a.fin.map(f => F.find(x => x.id === f).name).join(', ');
      const bw = a.bestW ? W.find(w => w.g === a.bestW) : null;
      return `<div class="s${a.s}">${a.s ? d.art + ' ' + esc(d.name) : '???'}<br><span class="muted">${label[a.s]}${a.s === 2 ? `<br>마감: ${fins}<br>최고 마모: ${bw.short} ${bw.g}` : ''}</span></div>`;
    }).join('') + '</div>';
  }
  return html;
}

function renderUnlocks() {
  const rows = DT.UNLOCKS.map(u => `<tr><td>${meta.unlocks.includes(u.id) ? '🔓' : '🔒'}</td><td>${esc(u.name)}</td><td>${esc(u.cond)}</td></tr>`).join('');
  return `<h1>해금</h1>${btn('← 메뉴', 'go', 'menu')}
    <div class="wrap"><table><tr><th></th><th>내용</th><th>조건</th></tr>${rows}</table></div>
    <p class="muted">최고 생존 ${meta.bestDays}일 · 앨범 ${Math.round(meta.albumRate * 100)}% · 완성한 컬렉션 ${meta.collectionsDone.join(', ') || '없음'}</p>`;
}

function renderPacksShop(m) {
  const left = GM.maxPacks(game, m) - game.packsBought;
  const rows = GM.availablePacks(game, meta).map(k => {
    const p = DT.PACKS[k];
    if (p.bazaar) {
      const price = GM.packPrice(game, k, 'single', m);
      return `<tr><td>${p.name} <span class="muted">특수카드 ${p.specials}장 포함 · 남은 ${game.shop.stock[k]}</span></td><td>—</td>
        <td>${btn(won(price), 'buyPack', k + ':single', game.money < price || left < 1 || game.shop.stock[k] <= 0)}</td></tr>`;
    }
    const pb = GM.packPrice(game, k, 'bundle', m), ps = GM.packPrice(game, k, 'single', m);
    return `<tr><td>${p.name} <span class="muted">골드 이상 ×${p.boost}</span></td>
      <td>${btn(won(pb) + ' (5팩)', 'buyPack', k + ':bundle', game.money < pb || left < 5)}</td>
      <td>${btn(won(ps), 'buyPack', k + ':single', game.money < ps || left < 1)}</td></tr>`;
  }).join('');
  return `<div class="wrap"><table><tr><th>팩 <span class="muted">(오늘 ${game.packsBought}/${GM.maxPacks(game, m)}팩 구매)</span></th><th>5팩 묶음 (할인)</th><th>낱개 (골드 이상 확률 ×${(1 + DT.SINGLE_BONUS + m.single).toFixed(1)})</th></tr>${rows}</table></div>
    <p class="muted">고급팩: 보유금 ${DT.PACKS.advanced.showAt}원 이상이면 등장 · 프리미엄팩: ${DT.PACKS.premium.showAt}원 이상 (해금 시 상시)</p>`;
}
function itemBtn(id, i, act = 'buyItem') {
  const it = DT.ITEMS[id];
  const where = it.kind === 'once' ? '가방' : it.kind === 'perm' ? '진열장' : '즉시';
  return btn(`<span class="item"><span>${esc(it.name)} · ${won(it.price)} <span class="pill">${where}</span></span><small>${esc(it.desc)}</small></span>`, act, i, game.money < it.price);
}

function renderShop(m) {
  const sh = game.shop;
  let html = `<h2>${sh.type === 'bazaar' ? '🎪 바자회' : '🛒 마트'} <small>${sh.type === 'bazaar' ? '오늘 판매하는 카드는 등급별 프리미엄 적용 (일반 ×1 → 레전드 ×3)' : '아이템은 매일 바뀝니다'}</small></h2>`;
  html += `<div class="box">${renderPacksShop(m)}</div>`;
  if (sh.type === 'mart') {
    html += `<div class="box"><div class="muted" style="margin-bottom:6px">오늘의 아이템</div><div class="row">${sh.items.length ? sh.items.map((id, i) => itemBtn(id, i)).join('') : '<span class="muted">품절</span>'}</div></div>`;
    return html;
  }
  // 바자회: 카드 코너 / 아이템 코너 구분
  html += `<div class="cols"><div class="corner"><h3>🃏 카드 코너 <span class="muted">→ 보관함</span></h3>`;
  html += `<div class="muted">특수카드 단품</div><div class="minis">${sh.singles.length ? sh.singles.map((o, i) => mini(o.card, btn('구매 ' + won(o.price), 'buySingle', i, game.money < o.price))).join('') : '<span class="muted">품절</span>'}</div>`;
  sh.npcs.forEach((n, ni) => { html += `<div class="box">${renderNpc(n, ni)}</div>`; });
  html += `</div><div class="corner"><h3>🎁 아이템 코너 <span class="muted">→ 가방 / 진열장</span></h3><div class="row">${sh.items.length ? sh.items.map((id, i) => itemBtn(id, i)).join('') : '<span class="muted">품절</span>'}</div></div></div>`;
  return html;
}
function renderNpc(n, ni) {
  if (n.type === 'collector') {
    return `<b>${esc(n.name)}</b> <span class="pill">수집가</span> "${n.tag} 카드를 바자회 시세의 ${n.mult}배에 사겠소." 남은 매입 ${n.left}장<br><span class="muted">보관함의 ${n.tag} 카드에 [수집가] 버튼이 생깁니다.</span>`;
  }
  if (n.type === 'peddler') {
    return `<b>${esc(n.name)}</b> <span class="pill">행상인</span> "좋은 물건 있어요."<div class="minis" style="margin-top:6px">` +
      (n.offers.length ? n.offers.map((o, i) => mini(o.card, btn('구매 ' + won(o.price), 'npc', ni + ':' + i, game.money < o.price))).join('') : '<span class="muted">다 팔렸습니다</span>') + '</div>';
  }
  if (n.type === 'trader') {
    const counts = {};
    game.storage.forEach(s => counts[s.r] = (counts[s.r] || 0) + 1);
    const opts = R.slice(0, 8).filter(r => counts[r.id] >= 2);
    return `<b>${esc(n.name)}</b> <span class="pill">교환상</span> "같은 등급 2장을 주면 한 등급 위 카드 1장을 주지." 남은 교환 ${n.left}회<div class="row" style="margin-top:6px">` +
      (opts.length ? `<select id="tradeSel">${opts.map(r => `<option value="${r.id}">${r.name} 2장 → ${R[R.indexOf(r) + 1].name}</option>`).join('')}</select>${btn('교환', 'trade', ni, n.left <= 0)}`
        : '<span class="muted">보관함에 같은 등급 카드가 2장 이상 없습니다</span>') + '</div>';
  }
  return '';
}

function renderBag() {
  const effs = game.effects.map(e => `${DT.ITEMS[e.id].name} <span class="muted">(${'packs' in e ? '남은 ' + e.packs + '팩' : '남은 ' + e.days + '일'})</span>`).join(' · ');
  return `<h2>🎒 가방 <small>${game.bag.length}/${DT.BAG_MAX} · 1회용, [사용]으로 발동</small></h2><div class="box">
    <div class="row">${game.bag.length ? game.bag.map((id, i) => btn(`<span class="item"><span>${esc(DT.ITEMS[id].name)} · 사용</span><small>${esc(DT.ITEMS[id].desc)}</small></span>`, 'useItem', i)).join('') : '<span class="muted">비어 있음</span>'}</div>
    ${effs ? `<div style="margin-top:6px">사용 중: ${effs}</div>` : ''}</div>`;
}
function renderShowcase() {
  const slotsN = GM.showcaseSlots(game);
  let cells = game.showcase.map((id, i) => `<div class="box" style="margin:0"><b>${esc(DT.ITEMS[id].name)}</b><br><span class="muted">${esc(DT.ITEMS[id].desc)}</span><br>${btn('처분 +' + Math.floor(DT.ITEMS[id].price / 2), 'sellShowcase', i)}</div>`);
  for (let i = game.showcase.length; i < slotsN; i++) cells.push('<div class="box muted" style="margin:0;text-align:center">빈 칸</div>');
  return `<h2>🏛️ 진열장 <small>${game.showcase.length}/${slotsN}칸 (최대 ${DT.SHOWCASE_MAX}) · 영구 아이템, 상시 효과</small></h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px">${cells.join('')}</div>`;
}
function renderStorage(m) {
  const done = GM.completeCollections(game);
  const have = {};
  game.storage.forEach(s => have[s.d] = true);
  const colRows = DT.TAGS.map(t => {
    const n = GM.DEFS_BY_TAG[t].filter(id => have[id]).length;
    const ok = done.includes(t);
    return `<tr><td>${t}</td><td>${n}/5 ${ok ? '<span class="pill on">완성</span>' : ''}</td><td class="muted">${DT.COLLECTIONS[t].desc}</td>
      <td>${ok ? btn('묶음 판매 ' + won(GM.bundleValue(game, t, m)), 'sellBundle', t) : ''}</td></tr>`;
  }).join('');
  const col = game.shop.type === 'bazaar' && game.shop.npcs.find(n => n.type === 'collector' && n.left > 0);
  const colIdx = col ? game.shop.npcs.indexOf(col) : -1;
  const list = game.storage.slice().sort((a, b) => b.p - a.p);
  return `<h2>🗄️ 카드 보관함 <small>${game.storage.length}/${DT.STORAGE_MAX}장 · 판매 시 확정 가격 × 오늘 판매 배율 · 합계 ${won(GM.storageValue(game, m))}</small></h2>
    <div class="box"><div class="wrap"><table><tr><th>컬렉션</th><th>보유</th><th>완성 효과</th><th>묶음 판매 (×${DT.BUNDLE_MULT})</th></tr>${colRows}</table></div></div>
    <div class="minis">${list.length ? list.map(s => mini(s,
      btn('판매 ' + won(GM.saleValue(game, s, m)), 'sellStored', s.u) +
      (col && DT.DEFS[s.d].tag === col.tag ? btn('수집가 ' + won(GM.collectorPrice(game, col, s)), 'npc', colIdx + ':' + s.u) : ''))).join('')
      : '<span class="muted">비어 있음 · 정산 화면에서 카드를 클릭해 판매에서 제외하면 여기로 옵니다</span>'}</div>`;
}

function renderGame() {
  const m = GM.mods(game);
  const q = GM.quotaToday(game, m);
  const bazaar = GM.isBazaar(game);
  let html = `<div class="topbar"><span><b>${game.day}일차</b> ${bazaar ? '🎪 바자회' : '🛒 마트'}</span>
    <span>💰 <b>${won(game.money)}</b></span><span>오늘 할당량 <b>${won(q)}</b>${m.quota ? ` <span class="muted">(원래 ${DT.quota(game.day)})</span>` : ''}</span>
    <span class="muted">다음 바자회: ${bazaar ? '오늘' : (DT.BAZAAR_EVERY - game.day % DT.BAZAAR_EVERY) + '일 후'}</span>
    <span class="sp">${btn('메뉴', 'go', 'menu')}</span></div>`;
  if (msg) html += `<div class="msg">${esc(msg)}</div>`;
  if (game.over) {
    return html + `<div class="over"><h2>게임 오버</h2><p><b>${game.survived}일</b> 생존 · 총자산 ${won(GM.totalAssets(game))} · 개봉 ${game.stats.packs}팩 / ${game.stats.cards}장
      ${game.stats.best ? ' · 최고 카드 ' + esc(GM.cardLabel(game.stats.best)) + ' ' + won(game.stats.best.p) : ''}</p>
      ${btn('새 게임', 'new', undefined, false, 'big primary')} ${btn('기록 보기', 'go', 'records')} ${btn('메뉴', 'go', 'menu')}</div>` + renderLog();
  }
  // 미개봉 팩
  const counts = {};
  game.unopened.forEach(p => { const k = DT.PACKS[p.k].name + (p.single ? ' 낱개' : ''); counts[k] = (counts[k] || 0) + 1; });
  html += `<h2>📦 미개봉 팩 <small>한 번에 1팩씩 개봉 · 개봉 중에는 상점 이용 불가</small></h2><div class="box big-cta">
    ${game.unopened.length ? Object.entries(counts).map(([k, n]) => `${k} ×${n}`).join(', ') + ' ' + btn('팩 열기 →', 'open', 0, false, 'big primary') : '<span class="muted">팩을 사서 열어 보세요.</span>'}</div>`;
  html += renderShop(m);
  html += renderBag();
  html += renderShowcase();
  html += renderStorage(m);
  html += `<div class="box" style="margin-top:10px"><b>현재 효과</b>: ${effectsText(m)}</div>`;
  // 지불
  const sv = GM.storageValue(game, m);
  const short = q - game.money;
  html += `<h2>💸 할당량 지불</h2><div class="box">
    소지금 ${won(game.money)} − 할당량 ${won(q)} = <b>${won(game.money - q)}</b>
    ${game.unopened.length ? `<br><span class="muted">미개봉 팩 ${game.unopened.length}개는 다음 날로 넘어갑니다.</span>` : ''}
    ${short > 0 ? `<br><b style="color:var(--bad)">${won(short)} 부족</b> ${short <= sv ? '— 보관함 카드를 팔면 낼 수 있습니다' : '— 보관함을 다 팔아도 부족 (지불하면 게임 오버)'}` : ''}
    <br><br>${btn(`할당량 ${won(q)} 지불하고 다음 날로 →`, 'pay', undefined, false, 'big')}</div>`;
  return html + renderLog();
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
  window.scrollTo(0, y);
}

// ---------- 입력 ----------
const actions = {
  new() { game = GM.newGame(meta); msg = '새 게임 시작! 시작자금 ' + won(DT.START_MONEY) + '.'; screen = 'game'; window.scrollTo(0, 0); },
  continue() {
    const saved = SV.loadGame();
    if (!saved) { msg = '저장된 게임이 없습니다.'; return; }
    game = saved; msg = game.day + '일차 이어하기'; screen = 'game';
    if (game.opening) { msg += ' — 개봉 중이던 팩을 다시 엽니다'; setTimeout(showOpening, 0); }
  },
  go(arg) { screen = arg; if (arg !== 'game') msg = ''; window.scrollTo(0, 0); },
  buyPack(arg) { const [k, kind] = arg.split(':'); say(GM.buyPack(game, meta, k, kind)); },
  buyItem(i) { say(GM.buyItem(game, meta, +i)); },
  useItem(i) { say(GM.useItem(game, +i)); },
  sellShowcase(i) { say(GM.sellShowcase(game, +i)); },
  buySingle(i) { say(GM.buySingle(game, meta, +i)); },
  npc(arg) { const [ni, a] = arg.split(':').map(Number); say(GM.npcAction(game, meta, ni, a)); }, // 수집가: 보관함 uid, 행상인: 진열 번호
  trade(ni) { const sel = $('#tradeSel'); say(GM.npcAction(game, meta, +ni, sel && sel.value)); },
  sellStored(u) { say(GM.sellStored(game, +u)); },
  sellBundle(t) { say(GM.sellBundle(game, t)); },
  open(i) {
    const r = GM.startOpening(game, meta, +i);
    if (!r.ok) { say(r); return; }
    msg = '';
    setTimeout(showOpening, 0);
  },
  pay() {
    const r = GM.pay(game, meta);
    say(r);
    if (r.ok) { msg = r.msg + '\n☀️ ' + game.day + '일차 아침 (자동 저장)' + (GM.isBazaar(game) ? ' — 오늘은 바자회!' : '') + (r.unlocked && r.unlocked.length ? '\n🔓 해금: ' + r.unlocked.join(', ') : ''); }
    window.scrollTo(0, 0);
  },
};

$('#app').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.act];
  if (!fn) return;
  fn(b.dataset.arg);
  persist();
  render();
});

render();
window.__cp = { get game() { return game; }, get meta() { return meta; } }; // 디버그·테스트용
