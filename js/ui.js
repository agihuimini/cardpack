// cardpack — 본 게임 화면 (v0.3)
// 개봉 화면은 js/unpack.js(데모와 같은 엔진)를 쓴다. 엔진이 요구하는 전역 훅:
//   변수 state, cards, slots, busy, tearAt / 함수 rollPack, renderPack, renderBar, sell
const GM = window.CPGame, DT = window.CPData, SV = window.CPStore;
window.QUICK_FLIP_ALL = true; // [모두 뒤집기]는 고등급 지연 연출 없이 한꺼번에
window.STACK_REVEAL = true;   // 뜯으면 뒷면 뭉치 → 한 장씩 뒤집고 넘기기 (데모는 부채꼴 그대로)

// ---------- 연출 엔진 훅 (전역) ----------
let state = 'idle', cards = [], slots = [], busy = false, tearAt = 0;

let game = null;
let meta = Object.assign(GM.newMeta(), SV.loadMeta() || {});
GM.refreshMeta(meta);
let screen = 'menu', msg = '', keptBefore = new Set(), showSettle = false;
let bookPage = 0, bookTurn = '', selUid = null, bookOpen = false, ksel = 0, settingsBack = 'menu';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = n => (Math.round(n * 10) / 10).toLocaleString('ko-KR') + '원';
const btn = (label, act, arg, disabled, cls) =>
  `<button data-act="${act}"${arg !== undefined ? ` data-arg="${esc(arg)}"` : ''}${disabled ? ' disabled' : ''}${cls ? ` class="${cls}"` : ''}>${label}</button>`;
const RNAME = {}; R.forEach(r => RNAME[r.id] = r);
const DES_PAGES = Math.ceil(DT.ROWS.length / DT.ROWS_PER_PAGE);
const FREE_PAGES = Math.ceil(DT.FREE_SLOTS / DT.FREE_PER_PAGE);
const VAULT_PAGE = DES_PAGES + FREE_PAGES; // 도감 마지막 페이지 = 팩보관함

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
  const look = packLook(op.k);
  t.innerHTML = `<div id="pack" class="${look.cls}" style="--hue:${look.hue}"><div class="beam"></div><div class="top"></div><div class="rip"></div><span class="grip">✂ 오른쪽으로 끌어 찢기</span>
    <div class="body">CARDPACK<small>${DT.PACKS[op.k].name}${op.single ? ' 낱개' : ''} · ${op.cards.length}장</small></div></div>`;
  bindPackDrag($('#pack'));
  $('#settleList').innerHTML = '';
  keptBefore = new Set();
  ksel = 0;
  packInfo(false);
  state = 'pack'; renderBar();
  renderRemain();
}
// 개봉 화면 왼쪽 아래: 아직 열 수 있는 남은 팩 (없으면 점선 가상 팩)
function renderRemain() {
  const list = game.unopened;
  const thumbs = list.slice(0, 10).map(pk => { const l = packLook(pk.k); return `<div class="pk mini ${l.cls}" style="--hue:${l.hue}" title="${esc(DT.PACKS[pk.k].name)}"><div class="pk-top"></div></div>`; }).join('');
  $('#remainPacks').innerHTML = list.length
    ? `<div class="rp-label">남은 팩 ${list.length}</div><div class="rp-row">${thumbs}${list.length > 10 ? `<span class="rp-more">+${list.length - 10}</span>` : ''}</div>`
    : `<div class="rp-label">남은 팩 0</div><div class="rp-row"><div class="pk mini ghost"><span>남은 팩<br>없음</span></div></div>`;
}
// 팩째로 보관 (W 키, [보관] 버튼, 팩을 왼쪽으로 끌기)
function afterKeep() {
  const r = GM.keepSealed(game);
  if (!r.ok) { const p = $('#pack'); if (p) p.style.transform = ''; flashBar(r.msg); return; }
  persist();
  msg = r.msg;
  if (game.unopened.length) { GM.startOpening(game, meta, 0); persist(); updateOpeningHeader(); renderPack(); flashBar('📦 ' + r.msg, true); }
  else closeOpening();
}
window.PACK_DRAG_LEFT = afterKeep;
// 개봉 차례의 팩 바꾸기 (←/→)
function cycle(dir) {
  if (state !== 'pack' || !game.unopened.length) return;
  GM.cyclePack(game, dir);
  persist(); updateOpeningHeader(); renderPack();
}
// 팩 자세히 보기 (E)
function packInfo(show) {
  const el = $('#packInfo');
  if (!show) { el.hidden = true; return; }
  const op = game.opening, p = DT.PACKS[op.k];
  const odds = GM.packOdds(game, op.k, op.single);
  const fin = ['sparkle', 'fullholo', 'black'].filter(f => game.ups['fin_' + f]).map(f => F.find(x => x.id === f).name);
  el.innerHTML = `<div class="pibox"><div class="pk ${packLook(op.k).cls}" style="--hue:${packLook(op.k).hue}"><div class="pk-top"></div><div class="pk-body"><span class="pk-logo">CARDPACK</span><b>${esc(p.name)}</b></div></div>
    <div><h3>${esc(p.name)}${op.single ? ' (낱개)' : ''}</h3>
    <p class="muted">${op.cards.length}장 · ${p.desc ? esc(p.desc) + ' · ' : ''}골드 이상 ×${p.boost}${op.single ? ' · 낱개 보너스 적용' : ''}${p.specials ? ' · 특수카드 ' + p.specials + '장' : ''}</p>
    <table>${odds.map(o => `<tr><td>${o.name}</td><td>${o.pct < 0.1 ? o.pct.toFixed(3) : o.pct.toFixed(1)}%</td></tr>`).join('')}</table>
    <p class="muted">마감: 기본${fin.length ? ' · ' + fin.join(' · ') : ' (반짝이 이상은 바자회 업그레이드로 해금)'}${game.ups.halo ? ' · 이벤트 카드 등장 가능' : ''}<br>안의 카드는 이미 정해져 있습니다. 분류 행운은 표에 포함되지 않습니다.</p>
    <p class="muted">E / Esc 닫기</p></div></div>`;
  el.hidden = false;
}
function updateOpeningHeader() {
  const m = GM.mods(game);
  const c = game.contest;
  $('#oTitle').textContent = `${game.day}일차 · ${game.opening ? DT.PACKS[game.opening.k].name + ' 개봉' : '정산 완료'}`;
  $('#oStat').innerHTML = `<span>소지금 <b>${won(game.money)}</b></span>` +
    (c ? `<span>대회 <b>${c.score}</b>/${c.target}점</span>` : GM.isBazaar(game) ? '<span>🎪 바자회 시세</span>' : `<span>할당량 <b>${won(GM.quotaToday(game, m))}</b></span>`) +
    `<span>도감 일반카드란 <b>${GM.freeRoom(game)}</b>칸 남음</span><span>팩보관함 <b>${(game.vault || []).length}</b>/${DT.VAULT_MAX}</span>`;
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
  $('#table').innerHTML = ''; slots = []; cards = [];
  $('#settleList').innerHTML = '';
  packInfo(false);
  document.body.style.overflow = '';
  state = 'idle';
  render();
}
function flashBar(text, good) {
  const b = $('#bar');
  b.querySelectorAll('.barmsg').forEach(e => e.remove());
  b.insertAdjacentHTML('afterbegin', `<b class="barmsg" style="color:${good ? 'var(--good)' : 'var(--bad)'}">${esc(text)}</b>`);
}
const doneArr = () => (game.opening && game.opening.done) || [];
const liveIdx = () => cards.map((c, i) => i).filter(i => !doneArr()[i]);
function keptIdx() { return slots.map((s, i) => s.classList.contains('kept') && !doneArr()[i] ? i : -1).filter(i => i >= 0); }
// 키보드 선택 표시
function markSel() {
  slots.forEach((s, i) => s.classList.toggle('ksel', (state === 'settle' || (state === 'reveal' && !window.STACK_REVEAL)) && i === ksel));
}

function renderBar() {
  const b = $('#bar');
  if (state === 'pack') {
    const canKeep = game.opening && game.opening.k !== 'contest';
    const v = (game.vault || []).length;
    b.innerHTML = `<span class="hint">클릭 또는 → 끌기 = 찢기${canKeep ? ' · ← 끌기 = 팩보관함' : ''} · <kbd>Q</kbd> 개봉${canKeep ? ' <kbd>W</kbd> 보관' : ''} <kbd>E</kbd> 자세히${game.unopened.length ? ' <kbd>←</kbd><kbd>→</kbd> 팩 선택' : ''}</span>
      ${game.unopened.length ? '<button id="prevPack">◀ 이전 팩</button><button id="nextSel">다음 팩 ▶</button>' : ''}
      <button id="pkInfo">자세히 (E)</button>
      ${canKeep ? `<button id="keepSealed" ${v >= DT.VAULT_MAX ? 'disabled' : ''}>📦 팩째로 보관 (W · ${v}/${DT.VAULT_MAX})</button>` : ''}`;
    if (canKeep) $('#keepSealed').onclick = afterKeep;
    $('#pkInfo').onclick = () => packInfo($('#packInfo').hidden);
    if (game.unopened.length) { $('#prevPack').onclick = () => cycle(-1); $('#nextSel').onclick = () => cycle(1); }
  }
  else if (state === 'tearing') b.innerHTML = `<span class="hint">… (클릭하면 스킵)</span>`;
  else if (state === 'settling') b.innerHTML = `<span class="hint">…</span>`;
  else if (state === 'reveal') {
    const first = slots.length && !slots[0].classList.contains('flipped');
    b.innerHTML = `<button class="primary" id="all" ${busy ? 'disabled' : ''}>모두 펼치기 (Space)</button>
      <span class="hint">${busy ? '연출 중 · 카드를 클릭하면 스킵' : first ? '카드 뭉치를 클릭하면 뒤집힘 · <kbd>Enter</kbd>' : '맨 위 카드를 클릭하거나 옆으로 끌어 넘기기 · <kbd>Enter</kbd> 넘기기 · 살짝 끌면 다음 카드의 기운이 보일 수도…'}</span>`;
    if (!busy) $('#all').onclick = flipAll;
    markSel();
  } else if (state === 'settle') {
    const live = liveIdx();
    if (!live.includes(ksel)) ksel = live[0] ?? 0;
    // 도감 일반카드란이 가득 차면 판매 제외 불가: 방금 켠 표시는 되돌린다
    const room = GM.freeRoom(game);
    let warn = '';
    let kept = keptIdx();
    if (kept.length > room) {
      kept.filter(i => !keptBefore.has(i)).forEach(i => slots[i].classList.remove('kept'));
      kept = keptIdx();
      warn = ` <b style="color:var(--bad)">도감 일반카드란이 부족해 더 제외할 수 없습니다 (${room}칸 남음)</b>`;
    }
    keptBefore = new Set(kept);
    const m = GM.mods(game);
    const val = i => cards[i].price * GM.saleMult(game, cards[i].r.id, m);
    const all = live.reduce((s, i) => s + val(i), 0);
    const part = live.reduce((s, i) => s + (kept.includes(i) ? 0 : val(i)), 0);
    const multNote = GM.saleMult(game, 'common', m) !== 1 || GM.isBazaar(game) ? ' (판매 배율 적용)' : '';
    const contest = game.opening && game.opening.k === 'contest' ? ` · 대회 점수 +${GM.r2(cards.reduce((s, c) => s + c.price, 0) * GM.scoreMult(game))}` : '';
    b.innerHTML = `<span class="hint">가격 확정${contest}${multNote} · 카드를 끌어서 ← 위 지정카드란 / ← 아래 일반카드란 / → 판매 · <kbd>←↑↓→</kbd> 선택 <kbd>Q</kbd> 지정 <kbd>W</kbd> 일반 <kbd>E</kbd> 상세 <kbd>R</kbd> 판매${warn}</span>
      <button id="showList">${showSettle ? '정산 내역 닫기' : '정산 내역'}</button>
      <button id="sellAll">일괄 판매 (${live.length}장 · ${won(all)}) Space</button>
      <button class="primary" id="sellPart" ${kept.length ? '' : 'disabled'}>선택 제외 후 판매 (${live.length - kept.length}장 · ${won(part)}, ${kept.length}장 도감)</button>`;
    $('#sellAll').onclick = () => sell(true);
    $('#sellPart').onclick = () => sell(false);
    $('#showList').onclick = () => { showSettle = !showSettle; renderBar(); };
    renderSettleList(kept);
    markSel();
  }
}
function renderSettleList(kept) {
  if (!showSettle) { $('#settleList').innerHTML = ''; return; }
  const dn = doneArr(), label = { des: '지정카드란', free: '일반카드란', sell: '판매함' };
  $('#settleList').innerHTML = '<b>정산 내역</b><br>' + cards.map((c, i) =>
    `${i + 1}. ${c.def.art} ${esc(c.def.name)}${c.r.mark ? ' ' + c.r.mark : ''} <b>${won(c.price)}</b>${c.notes.length ? ' <span style="opacity:.75">(' + esc(c.notes.join(', ')) + ')</span>' : ''}${dn[i] ? ` <span style="color:#8fb0ff">${label[dn[i]]}</span>` : kept.includes(i) ? ' <span style="color:#2bb673">도감</span>' : ''}`).join('<br>');
}
// 판매 전 확인 (설정에서 끌 수 있음)
function confirmSell(text) {
  if (!meta.settings || meta.settings.confirmSell === false) return Promise.resolve(true);
  return new Promise(res => {
    const box = $('#confirm');
    $('#cMsg').textContent = text;
    box.hidden = false;
    const done = v => { box.hidden = true; $('#cOk').onclick = $('#cNo').onclick = null; confirmResolve = null; res(v); };
    confirmResolve = done;
    $('#cOk').onclick = () => done(true);
    $('#cNo').onclick = () => done(false);
    $('#cOk').focus();
  });
}
let confirmResolve = null;
async function sell(all) {
  const kept = all ? [] : keptIdx();
  const live = liveIdx();
  const m = GM.mods(game);
  const total = live.filter(i => !kept.includes(i)).reduce((s, i) => s + cards[i].price * GM.saleMult(game, cards[i].r.id, m), 0);
  if (!(await confirmSell(`${live.length - kept.length}장을 ${won(total)}에 판매할까요?${kept.length ? ` (${kept.length}장은 도감 일반카드란으로)` : ''}`))) return;
  const res = GM.finishOpening(game, meta, kept);
  if (!res.ok) { flashBar(res.msg || '판매 실패'); return; }
  showDone(res);
}
// 카드 1장 처리: where = des / free / sell
async function dispose(i, where) {
  if (state !== 'settle' || doneArr()[i]) return;
  if (where === 'sell' && !(await confirmSell(`${cards[i].def.name}을(를) ${won(cards[i].price * GM.saleMult(game, cards[i].r.id))}에 판매할까요?`))) { snapBack(i); return; }
  const r = GM.disposeCard(game, meta, i, where);
  if (!r.ok) { snapBack(i); flashBar(r.msg); return; }
  const s = slots[i];
  s.classList.remove('kept', 'ksel');
  s.style.translate = '';
  s.classList.add(where === 'sell' ? 'out-right' : where === 'des' ? 'out-up' : 'out-down');
  persist();
  updateOpeningHeader();
  if (r.finish) { showDone(r.finish, r.msg); return; }
  const live = liveIdx();
  ksel = live.find(x => x > i) ?? live[0];
  renderBar();
  flashBar(r.msg, true);
}
function snapBack(i) { const s = slots[i]; if (s) { s.style.translate = ''; s.style.zIndex = ''; } }
function showDone(res, extra) {
  say(res);
  persist();
  // 남은 팩이 없으면(마지막 팩) 카드 잔상 없이 개봉 모드를 끝내고 상점으로
  if (!game.unopened.length) {
    msg = (extra ? extra + ' · ' : '') + res.msg + (res.unlocked && res.unlocked.length ? '\n🔓 해금: ' + res.unlocked.join(', ') : '');
    state = 'done';
    setTimeout(closeOpening, 380); // 마지막으로 끌어낸 카드가 빠져나가는 애니메이션만 보여 주고 닫음
    return;
  }
  state = 'done';
  $('#settleList').innerHTML = '';
  updateOpeningHeader();
  renderRemain();
  const b = $('#bar');
  b.innerHTML = `<span>${extra ? esc(extra) + ' · ' : ''}${esc(res.msg)}</span>
    ${game.unopened.length ? `<button class="primary" id="nextPack">다음 팩 열기 (Enter · 남은 ${game.unopened.length})</button>` : ''}<button id="toShop">${game.contest ? '대회장으로' : GM.isBazaar(game) ? '바자회로' : '상점으로'} (Esc)</button>`;
  if (game.unopened.length) $('#nextPack').onclick = nextPack;
  $('#toShop').onclick = closeOpening;
}
function nextPack() { const r = GM.startOpening(game, meta, 0); persist(); if (r.ok) { updateOpeningHeader(); renderPack(); } }

// 정산 단계: 카드를 끌어서 도감(왼쪽 위 지정 / 왼쪽 아래 일반) 또는 판매(오른쪽)
let cdrag = null, justDragged = false;
function dropZone(x, y) {
  const r = $('#stage').getBoundingClientRect();
  const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
  if (fx < 0.2) return fy < 0.5 ? 'des' : 'free';
  if (fx > 0.8) return 'sell';
  return null;
}
$('#table').addEventListener('pointerdown', e => {
  if (state !== 'settle' || e.target.closest('.zoom')) return;
  const s = e.target.closest('.slot');
  if (!s) return;
  const i = slots.indexOf(s);
  if (i < 0 || doneArr()[i]) return;
  cdrag = { i, s, x: e.clientX, y: e.clientY, moved: false, scale: $('#table').getBoundingClientRect().width / 820 };
});
addEventListener('pointermove', e => {
  if (!cdrag) return;
  const dx = e.clientX - cdrag.x, dy = e.clientY - cdrag.y;
  if (!cdrag.moved && Math.hypot(dx, dy) < 8) return;
  cdrag.moved = true;
  cdrag.s.classList.add('cd');
  cdrag.s.style.translate = `${dx / cdrag.scale}px ${dy / cdrag.scale}px 120px`;
  cdrag.s.style.zIndex = 50;
  $('#opening').classList.add('carddrag');
  const z = dropZone(e.clientX, e.clientY);
  document.querySelectorAll('.dz').forEach(el => el.classList.toggle('hot', el.dataset.z === z));
});
addEventListener('pointerup', e => {
  if (!cdrag) return;
  const d = cdrag; cdrag = null;
  d.s.classList.remove('cd');
  $('#opening').classList.remove('carddrag');
  document.querySelectorAll('.dz').forEach(el => el.classList.remove('hot'));
  if (!d.moved) return;
  justDragged = true; setTimeout(() => justDragged = false, 50);
  const z = dropZone(e.clientX, e.clientY);
  d.s.style.zIndex = '';
  if (z) dispose(d.i, z); else snapBack(d.i);
});
// 끌기 직후의 click은 카드 선택(보관 표시) 토글로 처리하지 않음
$('#table').addEventListener('click', e => { if (justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);

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
  const item = (label, act, arg, sub, disabled, cls) =>
    `<button class="mitem${cls ? ' ' + cls : ''}" data-act="${act}"${arg !== undefined ? ` data-arg="${arg}"` : ''}${disabled ? ' disabled' : ''}><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</button>`;
  return `<div class="title">
    <div class="logo"><div class="pk pk-basic"><div class="pk-top"></div><div class="pk-body"><span class="pk-logo">CARDPACK</span></div></div>
      <div><h1>CARDPACK</h1><p class="muted">랜덤 카드팩 개봉 로그라이크 · 목업 v0.3.3</p></div></div>
    ${msg ? `<div class="msg">${esc(msg)}</div>` : ''}
    <nav class="menu">
      ${item('새로하기', 'new', undefined, '', false, 'primary')}
      ${item('이어하기', 'continue', undefined, saved ? `${saved.day}일차 · ${won(saved.money)}` : '저장된 게임 없음', !saved)}
      ${item('기록', 'go', 'records', best ? `최고 ${best.days}일 생존` : '')}
      ${item('앨범', 'go', 'album', `수집률 ${Math.round(meta.albumRate * 100)}%`)}
      ${item('해금', 'go', 'unlocks', `${meta.unlocks.length}/${DT.UNLOCKS.length}`)}
      ${item('게임 방법', 'go', 'howto')}
      ${item('설정', 'settings', undefined, meta.settings && meta.settings.confirmSell === false ? '판매 확인 끔' : '판매 확인 켬')}
      ${item('제작자', 'go', 'credits')}
    </nav>
    <p class="muted foot">플레이 ${meta.games}판 · 대회 통과 ${meta.contests}회 · <a href="demo/unpack.html">개봉 연출 데모</a></p></div>`;
}
function renderHowto() {
  return `<div class="narrow"><h1>게임 방법</h1>${btn('← 메뉴', 'go', 'menu')}
    <div class="box" style="margin-top:10px;line-height:1.7">매일 팩을 사서(하루 최대 ${DT.MAX_PACKS}팩) <b>한 팩(${DT.PACK_SIZE}장)씩</b> 개봉합니다. 모두 공개되면 카드 능력까지 반영해 가격이 확정되고,
    일괄 판매하거나 원하는 카드를 판매에서 제외해 <b>도감</b>에 넣습니다. 하루 끝에 <b>할당량</b>을 못 내면 게임 오버.<br>
    <b>1주 = 7일</b>: 3·6일차는 마감 후 <b>바자회</b>(업그레이드는 바자회에서만), 7일차는 <b>카드 언팩 대회</b> — 대회팩 ${DT.TOURNEY.packs}개 점수 합계가 목표에 못 미치면 탈락.<br>
    도감 지정카드 페이지에서 가로줄 4장을 채우면 줄마다 <b>전체 점수 ×${DT.ROW_MULT}</b>. 팩은 뜯지 않고 <b>팩보관함</b>에 보관할 수도 있습니다.</div></div>`;
}
function renderSettings() {
  const on = !meta.settings || meta.settings.confirmSell !== false;
  return `<div class="narrow"><h1>설정</h1>${btn(settingsBack === 'game' ? '← 게임으로' : '← 메뉴', 'go', settingsBack)}
    <div class="box setrow" style="margin-top:12px"><div><b>판매 전 확인</b><br><span class="muted">카드를 팔 때(오른쪽으로 끌기, R 키, 일괄 판매) 확인 창을 띄웁니다.</span></div>
      <button class="switch${on ? ' on' : ''}" data-act="toggleConfirm" aria-pressed="${on}"><span></span>${on ? '켬' : '끔'}</button></div>
    <h2>키보드</h2><div class="box keys">
      <p><b>상점</b> <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd>… 팩 구매(팩에 표시된 키) · <kbd>B</kbd> 도감 열기/닫기</p>
      <p><b>개봉 전</b> <kbd>←</kbd><kbd>→</kbd> 팩 선택 · <kbd>Q</kbd> 개봉 · <kbd>W</kbd> 팩보관함 · <kbd>E</kbd> 팩 자세히</p>
      <p><b>카드 뭉치</b> <kbd>Enter</kbd>/<kbd>→</kbd> 뒤집기·한 장씩 넘기기 · <kbd>Space</kbd> 모두 펼치기 · 마우스로 맨 위 카드를 끌어도 넘어감</p>
      <p><b>정산</b> <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> 카드 선택 · <kbd>Enter</kbd>/<kbd>E</kbd> 상세보기 · <kbd>Q</kbd> 지정카드란 · <kbd>W</kbd> 일반카드란 · <kbd>R</kbd> 판매 · <kbd>Space</kbd> 일괄 판매</p>
      <p><b>정산 후</b> <kbd>Enter</kbd> 다음 팩 · <kbd>Esc</kbd> 상점으로 · <b>상세보기·도감·확인 창</b> <kbd>Esc</kbd> 닫기</p></div></div>`;
}
function renderCredits() {
  return `<div class="narrow"><h1>제작자</h1>${btn('← 메뉴', 'go', 'menu')}
    <div class="credits">
      <dl><dt>기획</dt><dd>agihuimini</dd>
      <dt>개발</dt><dd>Claude Code (Claude Opus 5.5)</dd>
      <dt>참고작</dt><dd>Balatro · CloverPit · 헌터×헌터 G.I. 바인더</dd>
      <dt>연출 레퍼런스</dt><dd>3D Card Animation (Framer) · Pokémon Cards CSS Holographic (simeydotme) · canigetyourholograph</dd>
      <dt>버전</dt><dd>목업 v0.3.3 · <a href="https://github.com/agihuimini/cardpack" target="_blank" rel="noopener">GitHub</a></dd></dl>
      <p class="muted">카드 그림은 이모지로 대신한 목업입니다.</p>
    </div></div>`;
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
// ---------- 카드팩 이미지 ----------
const TAG_HUE = { 과일: 350, 행성: 220, 동물: 30, 무기: 0, 보석: 175, 날씨: 200, 탈것: 120, 악기: 280 };
function packLook(k) {
  if (k.startsWith('tag_')) return { cls: 'pk-tag', hue: TAG_HUE[k.slice(4)] };
  return { cls: 'pk-' + k, hue: 0 };
}
// 팩 이미지 버튼. 누르면 act(arg) 실행 (구매 → 바로 개봉, 또는 미개봉 팩 개봉)
// 상점 팩 단축키: 진열 순서대로 Q W E R, 그 뒤는 A S D F Z X C V
const HOTKEYS = 'QWERASDFZXCV'.split('');
let HOT = [];
function packImg(k, o) {
  const p = DT.PACKS[k], look = packLook(k);
  let key = '';
  if (o.hot && HOT.length < HOTKEYS.length) { key = HOTKEYS[HOT.length]; HOT.push({ key, act: o.act, arg: String(o.arg), disabled: !!o.disabled }); }
  return `<button class="pkbtn" data-act="${o.act}" data-arg="${esc(o.arg)}"${o.disabled ? ' disabled' : ''} title="${esc(o.why || p.desc || p.name)}">
    <div class="pk ${look.cls}${o.bundle ? ' bundle' : ''}" style="--hue:${look.hue}">
      <div class="pk-top"></div>
      <div class="pk-body"><span class="pk-logo">CARDPACK</span><b>${esc(p.name)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>
      ${o.bundle ? '<span class="pk-x">×5</span>' : ''}${o.badge ? `<span class="pk-badge">${o.badge}</span>` : ''}${key ? `<kbd class="pk-key">${key}</kbd>` : ''}
    </div>
    <div class="pk-price">${o.price}</div></button>`;
}
function renderPacks(m) {
  const left = GM.maxPacks(game, m) - game.packsBought;
  const avail = GM.availablePacks(game, meta);
  const why = (price, need) => game.money < price ? '돈이 부족합니다' : left < need ? `오늘은 ${left}팩만 더 살 수 있습니다` : '';
  const tiles = [];
  for (const k of ['basic', 'advanced', 'premium'].filter(k => avail.includes(k))) {
    const p = DT.PACKS[k];
    const ps = GM.packPrice(game, k, 'single', m), pb = GM.packPrice(game, k, 'bundle', m);
    tiles.push(packImg(k, { hot: true, act: 'buyPack', arg: k + ':single', price: won(ps), sub: `낱개 · 골드↑ ×${p.boost}`, disabled: !!why(ps, 1), why: why(ps, 1) || `낱개 구매 (골드 이상 확률 ×${(1 + DT.SINGLE_BONUS + m.single).toFixed(1)})` }));
    tiles.push(packImg(k, { hot: true, act: 'buyPack', arg: k + ':bundle', bundle: true, price: won(pb) + ' · 5팩', sub: '5팩 묶음 할인', disabled: !!why(pb, 5), why: why(pb, 5) || '5팩 묶음 (할인)' }));
  }
  const themes = game.shop.themes.map(k => {
    const p = DT.PACKS[k], price = GM.packPrice(game, k, 'single', m), st = game.shop.stock[k];
    const w = st <= 0 ? '품절' : why(price, 1);
    return packImg(k, { hot: true, act: 'buyPack', arg: k + ':single', price: won(price), sub: p.desc, badge: '남은 ' + st, disabled: !!w, why: w || p.desc });
  }).join('');
  return `<h2>📦 카드팩 진열대 <small>팩을 누르거나 단축키(<kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd>…)로 구매하고 바로 개봉 · <kbd>B</kbd> 도감 · 오늘 ${game.packsBought}/${GM.maxPacks(game, m)}팩 · ${DT.PACK_SIZE}장 들이</small></h2>
    <div class="shelf">${tiles.join('')}</div>
    ${themes ? `<h2>✨ 오늘의 특수 팩 <small>랜덤 등장 · 낱개만 · 재고 2</small></h2><div class="shelf special">${themes}</div>` : ''}`;
}
function renderUnopened() {
  const resume = game.opening ? packImg(game.opening.k, { act: 'resume', arg: 0, price: '이어서 열기', sub: '개봉 중' }) : '';
  if (!game.unopened.length && !resume) return '';
  const tiles = resume + game.unopened.map((pk, i) => packImg(pk.k, { act: 'open', arg: i, price: '열기', sub: pk.k === 'contest' ? '대회용' : pk.single ? '낱개' : '묶음' })).join('');
  return `<h2>📭 미개봉 팩 <small>누르면 개봉 · 한 번에 1팩씩</small></h2><div class="shelf">${tiles}</div>`;
}
function renderBazaarCorner(m) {
  const sh = game.shop;
  const specials = Object.keys(sh.stock).map(k => {
    const p = DT.PACKS[k], price = GM.packPrice(game, k, 'single', m);
    const w = sh.stock[k] <= 0 ? '품절' : game.money < price ? '돈이 부족합니다' : '';
    return packImg(k, { hot: true, act: 'buyPack', arg: k + ':single', price: won(price), sub: p.desc, badge: '남은 ' + sh.stock[k], disabled: !!w, why: w || p.desc });
  }).join('');
  let html = `<div class="corner"><h3>🃏 카드 코너 <span class="muted">→ 도감 일반카드 칸</span></h3><div class="shelf">${specials}</div>
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
  const total = DES_PAGES + FREE_PAGES + 1;
  bookPage = Math.max(0, Math.min(total - 1, bookPage));
  const isDes = bookPage < DES_PAGES, isVault = bookPage === VAULT_PAGE;
  const vault = game.vault || [];
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
  } else if (isVault) {
    const tiles = vault.map((v, i) => packImg(v.k, { act: 'openVault', arg: i, price: '개봉', sub: (v.single ? '낱개' : '묶음') + ' · ' + v.day + '일차 보관' }));
    for (let i = vault.length; i < DT.VAULT_MAX; i++) tiles.push('<div class="vslot"><span>빈 칸</span></div>');
    body = `<p class="muted" style="margin:0 0 10px">뜯지 않고 보관한 팩. 안의 카드는 이미 정해져 있습니다. 누르면 바로 개봉.</p><div class="vgrid">${tiles.join('')}</div>`;
  } else {
    const p = bookPage - DES_PAGES;
    const cells = [];
    for (let i = p * DT.FREE_PER_PAGE; i < Math.min(DT.FREE_SLOTS, (p + 1) * DT.FREE_PER_PAGE); i++) {
      const s = game.binder.free[i];
      cells.push(`<div class="bslot free${s ? ' has' : ''}${s && s.u === selUid ? ' sel' : ''}" data-uid="${s ? s.u : ''}"><span class="no">${i + 1}</span><span class="ghost">빈 칸</span></div>`);
    }
    body = `<div class="bcells free">${cells.join('')}</div>`;
  }
  const title = isDes ? `지정카드 ${bookPage + 1}/${DES_PAGES}` : isVault ? `팩보관함 ${vault.length}/${DT.VAULT_MAX}` : `일반카드 ${bookPage - DES_PAGES + 1}/${FREE_PAGES}`;
  return `<div class="bmodal"><div class="bpanel">
    <div class="bhead"><div><b>📖 도감</b> <span class="muted">지정카드 ${Object.keys(game.binder.des).length}/${DT.DESIGNATED.length} · 일반카드 ${DT.FREE_SLOTS - GM.freeRoom(game)}/${DT.FREE_SLOTS} · 완성 가로줄 ${done.length}줄 → 전체 점수 ×${GM.scoreMult(game)}</span></div>
      <div class="bjump"><button class="tab${isDes ? ' on' : ''}" data-act="jump" data-arg="des">지정카드</button><button class="tab${!isDes && !isVault ? ' on' : ''}" data-act="jump" data-arg="free">일반카드</button><button class="tab${isVault ? ' on' : ''}" data-act="jump" data-arg="vault">팩보관함 ${vault.length}</button><button class="bclose" data-act="book" title="닫기">✕</button></div></div>
    <div class="book">
      <button class="turn" data-act="turn" data-arg="-1" ${bookPage === 0 ? 'disabled' : ''}>◀</button>
      <div class="pagewrap"><div class="page ${isDes ? 'des' : isVault ? 'vaultp' : 'freep'} ${bookTurn}" id="page"><div class="ptitle">${title}</div>${body}</div></div>
      <button class="turn" data-act="turn" data-arg="1" ${bookPage === total - 1 ? 'disabled' : ''}>▶</button>
    </div>
    <div class="tabs"><span class="muted">${title} · 페이지 ${bookPage + 1}/${total}</span>${btn('임시칸 → 지정칸 자동 정리', 'arrange')}</div>
    ${renderSelected()}</div></div>`;
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
  HOT = [];
  const m = GM.mods(game);
  const bazaar = GM.isBazaar(game), tour = GM.isTourney(game), c = game.contest;
  const week = DT.weekOf(game.day), dw = GM.dow(game);
  const kind = bazaar ? '🎪 바자회' : tour ? '🏆 카드 언팩 대회' : '🛒 마트';
  let html = `<div class="topbar"><span><b>${game.day}일차</b> <span class="muted">${week}주차 ${dw}/7</span> ${kind}</span>
    <span>💰 <b>${won(game.money)}</b></span>
    ${tour ? `<span>대회 <b>${c.score}</b>/${c.target}점</span>` : bazaar ? '<span class="muted">할당량 지불 완료</span>' : `<span>오늘 할당량 <b>${won(GM.quotaToday(game, m))}</b></span>`}
    <span>전체 점수 ×${GM.scoreMult(game)}</span>
    <span class="sp">${btn('⚙ 설정', 'settings')} ${btn('메뉴', 'go', 'menu')}</span></div>`;
  if (msg) html += `<div class="msg">${esc(msg)}</div>`;
  if (game.over) {
    return html + `<div class="narrow"><div class="over"><h2>게임 오버</h2><p>${esc(game.log[0] || '')}</p><p><b>${game.survived}일</b> 생존 · 총자산 ${won(GM.totalAssets(game))} · 개봉 ${game.stats.packs}팩 / ${game.stats.cards}장
      ${game.stats.best ? ' · 최고 카드 ' + esc(GM.cardLabel(game.stats.best)) + ' ' + won(game.stats.best.p) : ''}</p>
      ${btn('새 게임', 'new', undefined, false, 'big primary')} ${btn('기록 보기', 'go', 'records')} ${btn('메뉴', 'go', 'menu')}</div>${renderLog()}</div>`;
  }
  let main = '';
  if (tour) {
    main += `<div class="contest"><h2>🏆 ${c.week}주차 카드 언팩 대회</h2>
      <p>대회팩 ${c.packs}개를 열어 <b>정산 합계(× 전체 점수 배율)</b>가 <b>${c.target}점</b> 이상이면 통과, 못 미치면 탈락(게임 오버). 통과 상금 ${won(Math.round(c.target * DT.TOURNEY.prize))}. 오늘은 할당량이 없고 팩을 팔지 않습니다.</p>
      <div class="meter"><div style="width:${Math.min(100, c.score / c.target * 100)}%"></div><span>${c.score} / ${c.target}점 · ${c.opened}/${c.packs}팩</span></div></div>`;
  }
  if (bazaar) main += `<h2>🎪 바자회 <small>오늘 마감 후 · 업그레이드는 오른쪽 배너</small></h2>`;
  main += renderUnopened();
  if (bazaar) main += renderBazaarCorner(m);
  else if (!tour) main += renderPacks(m);
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
  const fab = `<button class="binder-fab" data-act="book">📖 도감<small>지정 ${Object.keys(game.binder.des).length}/${DT.DESIGNATED.length} · 임시 ${DT.FREE_SLOTS - GM.freeRoom(game)}/${DT.FREE_SLOTS} · 팩 ${(game.vault || []).length} · ×${GM.scoreMult(game)}</small></button>`;
  return html + `<div class="layout">${renderLeft()}<main>${main}</main>${renderRight()}</div>${fab}${bookOpen ? renderBook() : ''}`;
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
  else if (screen === 'howto') app.innerHTML = renderHowto();
  else if (screen === 'credits') app.innerHTML = renderCredits();
  else if (screen === 'settings') app.innerHTML = renderSettings();
  else app.innerHTML = renderMenu();
  if (screen === 'game' && game && !game.over && bookOpen) mountBookCards();
  document.body.style.overflow = bookOpen && screen === 'game' ? 'hidden' : $('#opening').hidden ? '' : 'hidden';
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
  go(arg) { screen = arg; bookOpen = false; if (arg !== 'game') msg = ''; window.scrollTo(0, 0); },
  // 팩을 사면 바로 개봉 (묶음이면 첫 팩부터, 나머지는 [다음 팩 열기]로 이어짐)
  buyPack(arg) {
    const [k, kind] = arg.split(':');
    const r = GM.buyPack(game, meta, k, kind);
    say(r);
    if (r.ok) actions.open(game.unopened.length - (kind === 'bundle' && !DT.PACKS[k].theme && !DT.PACKS[k].bazaar ? 5 : 1));
  },
  book() { bookOpen = !bookOpen; if (!bookOpen) selUid = null; },
  settings() { settingsBack = screen === 'game' && game && !game.over ? 'game' : 'menu'; screen = 'settings'; bookOpen = false; window.scrollTo(0, 0); },
  toggleConfirm() { meta.settings = meta.settings || {}; meta.settings.confirmSell = meta.settings.confirmSell === false; },
  resume() { if (game.opening) setTimeout(showOpening, 0); },
  openVault(i) {
    const r = GM.openVault(game, meta, +i);
    if (!r.ok) { say(r); return; }
    bookOpen = false; selUid = null; msg = '';
    setTimeout(showOpening, 0);
  },
  jump(where) { const np = where === 'des' ? 0 : where === 'vault' ? VAULT_PAGE : DES_PAGES; bookTurn = np > bookPage ? 'in-next' : np < bookPage ? 'in-prev' : ''; bookPage = np; },
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
  if (e.target.classList.contains('bmodal')) { bookOpen = false; selUid = null; render(); return; }
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

// ---------- 키보드 ----------
function moveSel(key) {
  const live = state === 'settle' ? liveIdx() : slots.map((x, i) => i).filter(i => !slots[i].classList.contains('flipped'));
  if (!live.length) return;
  const n = cards.length, top = Math.ceil(n / 2);
  let i = live.includes(ksel) ? ksel : live[0];
  if (key === 'ArrowRight') i = live.find(x => x > i) ?? live[0];
  if (key === 'ArrowLeft') i = [...live].reverse().find(x => x < i) ?? live[live.length - 1];
  if ((key === 'ArrowDown' || key === 'ArrowUp') && !window.STACK_REVEAL) {
    // 위 줄(0..top-1) ↔ 아래 줄: 같은 열 근처의 카드로
    const col = i < top ? i - (top - 1) / 2 : i - top - (n - top - 1) / 2;
    const rows = key === 'ArrowDown' ? live.filter(x => x >= top) : live.filter(x => x < top);
    if (rows.length) i = rows.reduce((b, x) => { const c = x < top ? x - (top - 1) / 2 : x - top - (n - top - 1) / 2; return Math.abs(c - col) < Math.abs((b < top ? b - (top - 1) / 2 : b - top - (n - top - 1) / 2) - col) ? x : b; }, rows[0]);
  }
  ksel = i;
  markSel();
}
addEventListener('keydown', e => {
  if (e.target.matches && e.target.matches('input, select, textarea')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const hit = () => e.preventDefault();
  // 판매 확인 창
  if (confirmResolve) { if (k === 'Enter') { hit(); confirmResolve(true); } else if (k === 'Escape') { hit(); confirmResolve(false); } return; }
  // 카드 상세보기
  if ($('#modal').classList.contains('open')) { if (['Escape', 'Enter', 'E'].includes(k)) { hit(); $('#mClose').click(); } return; }
  // 개봉 화면
  if (!$('#opening').hidden) {
    if (state === 'tearing' || busy) { if ([' ', 'Enter'].includes(k)) { hit(); skip(); } return; }
    if (state === 'pack') {
      if (!$('#packInfo').hidden) { if (['E', 'Escape'].includes(k)) { hit(); packInfo(false); } return; }
      if (k === 'ArrowRight') { hit(); cycle(1); }
      else if (k === 'ArrowLeft') { hit(); cycle(-1); }
      else if (k === 'Q' || k === 'Enter') { hit(); tearPack(false); }
      else if (k === 'W') { hit(); if (game.opening.k !== 'contest') afterKeep(); }
      else if (k === 'E') { hit(); packInfo(true); }
    } else if (state === 'reveal') {
      if (k === ' ') { hit(); flipAll(); }
      else if (k === 'Enter' || k === 'ArrowRight') { hit(); stackClick(); }
    } else if (state === 'settle') {
      if (k.startsWith('Arrow')) { hit(); moveSel(k); }
      else if (k === 'Enter' || k === 'E') { hit(); openInspect(ksel); }
      else if (k === 'Q') { hit(); dispose(ksel, 'des'); }
      else if (k === 'W') { hit(); dispose(ksel, 'free'); }
      else if (k === 'R') { hit(); dispose(ksel, 'sell'); }
      else if (k === ' ') { hit(); sell(true); }
    } else if (state === 'done') {
      if (k === 'Enter' && game.unopened.length) { hit(); nextPack(); }
      else if (k === 'Escape' || k === 'Enter') { hit(); closeOpening(); }
    }
    return;
  }
  if (screen !== 'game' || !game || game.over) return;
  // 도감
  if (bookOpen) {
    if (k === 'Escape' || k === 'B') { hit(); bookOpen = false; selUid = null; render(); }
    else if (k === 'ArrowRight' || k === 'ArrowLeft') { hit(); const d = k === 'ArrowRight' ? 1 : -1; const np = bookPage + d; if (np >= 0 && np <= VAULT_PAGE) { actions.turn(d); render(); } }
    return;
  }
  if (k === 'B') { hit(); actions.book(); render(); return; }
  // 상점 팩 단축키
  const h = HOT.find(x => x.key === k);
  if (h) { hit(); if (h.disabled) { msg = '지금은 살 수 없는 팩입니다 (' + k + ')'; render(); return; } actions[h.act](h.arg); persist(); render(); }
});

render();
window.__cp = { get game() { return game; }, get meta() { return meta; } }; // 디버그·테스트용
