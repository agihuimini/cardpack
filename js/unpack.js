// cardpack — 팩 개봉 연출 엔진 공용 모듈 (demo/unpack.html에서 분리)
// 페이지가 전역으로 제공해야 하는 것:
//   변수  state, cards, slots, busy, tearAt
//   함수  rollPack() (팩 9장 생성), renderPack() (팩 그리기), renderBar() (하단 바), sell(all) (판매)
// 필요한 DOM: #stage #table #bar #fx #flash #modal #holder #info #mFlip #mReset #mClose

const TIER_FX = [ // amp, shake ms, flip s, flash opacity, fade ms, glow, flash color
  null,
  {amp:'3px', sd:650,  fd:1.0, fo:.55, fade:700,  gc:'#ffd76a', fc:'#fff3c4'},
  {amp:'5px', sd:950,  fd:1.4, fo:.78, fade:1000, gc:'#9fe3ff', fc:'#d8f4ff'},
  {amp:'8px', sd:1250, fd:1.8, fo:.93, fade:1400, gc:'#ff6bd6', fc:'#ffd0f0'},
  {amp:'11px',sd:1600, fd:2.3, fo:1,   fade:2100, gc:'#fff2a0', fc:'#fff6c8'},
];

let skipFns = [], fast = false;
function wait(ms) {
  if (fast) ms = Math.min(ms, 120);
  return new Promise(res => { const t = setTimeout(res, ms); skipFns.push(() => { clearTimeout(t); res(); }); });
}
function skip() { fast = true; const f = skipFns; skipFns = []; f.forEach(fn => fn()); }
function fxTier(c) {
  let t = c.r.tier;
  if (c.f.id === 'fullholo' || c.f.id === 'black') t = Math.max(t, 1);
  return t;
}

// ---------- render ----------
function cardEl(c) {
  const el = document.createElement('div');
  el.className = `card r-${c.r.id} f-${c.f.id}`;
  // 마모: 7등급 이상은 깨끗, 그 아래로 갈수록 흠집이 진해짐
  el.style.setProperty('--wo', (c.w.g >= 7 ? 0 : (7 - c.w.g) / 6 * .8).toFixed(2));
  el.innerHTML = `
    ${c.r.id === 'event' ? '<div class="halo"></div>' : ''}${c.r.tier >= 2 ? '<div class="leak"></div>' : ''}
    <div class="inner">
      <div class="face back"><span>CARDPACK</span></div>
      <div class="face front">
        <div class="frame">
          <div class="cbg"></div>
          <div class="top"><span>${c.def.name}</span>${c.r.mark ? `<span class="mk">${c.r.mark}</span>` : ''}</div>
          <div class="art"><span>${c.def.art}</span></div>
          <div class="desc">${abText(abOf(c))}</div>
          <div class="meta"><span>${c.r.name}${c.f.id !== 'base' ? ' · ' + c.f.name : ''}</span><span>${c.w.short} ${c.w.g}</span></div>
        </div>
        <div class="wear"></div><div class="holo"></div><div class="glare"></div>
        <button class="zoom" title="자세히 보기">🔍</button>
      </div>
    </div>`;
  return el;
}
function bindTilt(card) {
  card.addEventListener('pointermove', e => {
    if (!card.closest('.flipped')) return;
    const b = card.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
    card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    card.style.setProperty('--h', (px * 360).toFixed(0));
    card.style.setProperty('--ry', ((px - .5) * 24).toFixed(1) + 'deg');
    card.style.setProperty('--rx', ((.5 - py) * 24).toFixed(1) + 'deg');
  });
  card.addEventListener('pointerleave', () => {
    ['--mx','--my'].forEach(p => card.style.setProperty(p, '50%'));
    card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg');
  });
}

// 팩 찢기: 클릭 = 바로 개봉 / 드래그 = 진행도만큼 찢어짐, 덜 찢고 놓으면 다시 봉인 / 빠르게 잡아떼면 시원하게 찢어짐
const TEAR_DONE = .65;   // 이만큼 찢고 놓으면 개봉
const FLICK_V = 1.1;     // px/ms, 이보다 빠르게 떼면 "확 잡아뗌"
function bindPackDrag(pack) {
  const top = pack.querySelector('.top');
  let d = null;
  const setP = p => {
    pack.style.setProperty('--p', p.toFixed(3));
    top.style.transform = p ? `rotate(${-p * 32}deg) translate(${-p * 6}px,${-p * 18}px)` : '';
    pack.style.transform = p ? `rotate(${-p * 2.5}deg) translateX(${(Math.random() - .5) * p * 3}px)` : '';
  };
  pack.addEventListener('pointerdown', e => {
    if (state !== 'pack') return;
    const now = performance.now();
    d = {x: e.clientX, y: e.clientY, p: 0, lx: e.clientX, lt: now, v: 0, moved: false};
    try { pack.setPointerCapture(e.pointerId); } catch {}
  });
  pack.addEventListener('pointermove', e => {
    if (!d) return;
    const dx = Math.abs(e.clientX - d.x);
    if (!d.moved && dx < 6) return;
    d.moved = true; pack.classList.add('dragging');
    const now = performance.now();
    const v = Math.abs(e.clientX - d.lx) / Math.max(1, now - d.lt);
    d.v = d.v * .5 + v * .5; d.lx = e.clientX; d.lt = now;
    d.p = Math.min(1, dx / (pack.getBoundingClientRect().width * 1.15));
    setP(d.p);
    if (d.p >= 1) { const hard = d.v > FLICK_V; d = null; pack.classList.remove('dragging'); tearPack(hard); }
  });
  const end = () => {
    if (!d) return;
    const {p, v, moved} = d; d = null;
    pack.classList.remove('dragging');
    if (!moved) { tearPack(false); return; }
    if (v > FLICK_V && p > .15) tearPack(true);
    else if (p >= TEAR_DONE) tearPack(false);
    else setP(0); // 다시 봉인 (top에 스프링 transition)
  };
  pack.addEventListener('pointerup', end);
  pack.addEventListener('pointercancel', end);
}

async function tearPack(hard) {
  if (state !== 'pack') return;
  state = 'tearing'; fast = false; tearAt = performance.now(); renderBar();
  const pack = $('#pack'), top = pack.querySelector('.top');
  top.style.transform = ''; pack.style.transform = '';
  pack.style.setProperty('--p', 1);
  pack.classList.add('torn');
  if (hard) {
    pack.classList.add('hard');
    const b = pack.getBoundingClientRect();
    burst(b.left + b.width / 2, b.top + 20, {n: 40, colors: ['#ffffff','#fff3b0','#ffd0f0'], speed: 7, life: 40, size: 2});
    miniQuake();
  }
  cards = rollPack();
  await wait(hard ? 280 : 450);
  // 다이아 이상 카드가 들어 있으면 개봉 직후 이펙트
  const maxT = Math.max(...cards.map(c => c.r.tier));
  if (maxT >= 2) await hype(pack, maxT);
  pack.classList.add('gone');
  openMask = cards.map(() => false); curContribs = [];
  const t = $('#table');
  t.classList.add('fan');
  slots = cards.map((c, i) => {
    const s = document.createElement('div');
    s.className = 'slot init' + (c.r.tier >= 2 ? ` leaky lk-${c.r.id}` : '');
    const k = i - 4;
    s.style.cssText = `--i:${i};--k:${k};--k2:${k * k};--gx:${((i < 5 ? i : i - 5) - (i < 5 ? 2 : 1.5)) * 160}px;--gy:${i < 5 ? -140 : 120}px`;
    s.innerHTML = `<div class="shaker"></div><div class="tag"></div><div class="keep-badge">보관</div>`;
    const card = cardEl(c);
    s.querySelector('.shaker').appendChild(card);
    bindTilt(card);
    card.addEventListener('click', e => onCardClick(e, i));
    card.querySelector('.zoom').addEventListener('click', e => { e.stopPropagation(); openInspect(i); });
    card.addEventListener('dblclick', e => { e.preventDefault(); if (s.classList.contains('flipped')) openInspect(i); });
    t.appendChild(s);
    return s;
  });
  void t.offsetWidth;
  slots.forEach((s, i) => { s.style.transitionDelay = i * 55 + 'ms'; s.classList.remove('init'); });
  await wait(600 + 9 * 55);
  slots.forEach(s => s.style.transitionDelay = '');
  fast = false; skipFns = [];
  state = 'reveal'; renderBar();
}

// ---------- fx: particles / fireworks / strobe ----------
const fxc = $('#fx'), fx2 = fxc.getContext('2d');
let parts = [], fxRunning = false;
function burst(x, y, {n = 70, colors = ['#fff'], speed = 6, life = 70, size = 2.4, gravity = .08}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (.35 + Math.random() * .75);
    parts.push({x, y, px: x, py: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, size: size * (.6 + Math.random() * .8),
      c: colors[Math.floor(Math.random() * colors.length)], g: gravity});
  }
  if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxLoop); }
}
function fxLoop() {
  if (fxc.width !== innerWidth || fxc.height !== innerHeight) { fxc.width = innerWidth; fxc.height = innerHeight; }
  fx2.clearRect(0, 0, fxc.width, fxc.height);
  fx2.globalCompositeOperation = 'lighter';
  parts = parts.filter(p => p.life > 0);
  for (const p of parts) {
    p.px = p.x; p.py = p.y;
    p.vx *= .985; p.vy = p.vy * .985 + p.g;
    p.x += p.vx; p.y += p.vy; p.life--;
    const a = p.life / p.max;
    fx2.strokeStyle = p.c; fx2.globalAlpha = a; fx2.lineWidth = p.size; fx2.lineCap = 'round';
    fx2.beginPath(); fx2.moveTo(p.px - p.vx * 2, p.py - p.vy * 2); fx2.lineTo(p.x, p.y); fx2.stroke();
  }
  fx2.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(fxLoop); else { fxRunning = false; fx2.clearRect(0, 0, fxc.width, fxc.height); }
}
function miniQuake() { const st = $('#stage'); st.classList.remove('quake'); void st.offsetWidth; st.classList.add('quake'); }
function pulse(opacity, color, fade) {
  const el = $('#flash');
  el.style.setProperty('--fc', color);
  el.style.transition = 'none'; el.style.opacity = opacity; void el.offsetWidth;
  el.style.transition = `opacity ${fade}ms ease-out`; el.style.opacity = 0;
}
const HYPE = { // 개봉 직후 이펙트 (최고 등급 tier 기준)
  2: {dur: 1100, bursts: 3,  strobe: 0, rumble: false, ha: '2px', colors: ['#9fe3ff','#ffffff','#c9f0ff','#ffd0f0']},
  3: {dur: 1900, bursts: 8,  strobe: 4, rumble: true,  ha: '4px', colors: ['#ff6bd6','#ffd76a','#9b5cff','#ff4d4d','#ffffff']},
  4: {dur: 2700, bursts: 14, strobe: 7, rumble: true,  ha: '6px', colors: ['#ffd76a','#fff2a0','#ff7773','#83fff7','#d875ff','#a8ff5f','#ffffff']},
};
async function hype(pack, tier) {
  const h = HYPE[tier], fx = TIER_FX[tier];
  pack.style.setProperty('--hc', fx.gc); pack.style.setProperty('--ha', h.ha);
  pack.classList.add('hype');
  pulse(.7, fx.fc, 500);
  const st = $('#stage');
  if (h.rumble) st.classList.add('rumble');
  const timers = [];
  for (let i = 0; i < h.bursts; i++) {
    timers.push(setTimeout(() => {
      burst(innerWidth * (.12 + Math.random() * .76), innerHeight * (.12 + Math.random() * .45),
        {n: 60 + tier * 15, colors: h.colors, speed: 4 + tier, life: 60 + tier * 8});
    }, (h.dur * .85) * i / h.bursts));
  }
  for (let i = 0; i < h.strobe; i++) timers.push(setTimeout(() => pulse(.55, i % 2 ? '#ffffff' : fx.fc, 140), 250 + i * (h.dur * .7 / h.strobe)));
  skipFns.push(() => timers.forEach(clearTimeout));
  await wait(h.dur);
  timers.forEach(clearTimeout);
  st.classList.remove('rumble');
  pack.classList.remove('hype');
  pulse(fx.fo, fx.fc, fast ? 200 : fx.fade);
}

function flash(tier) {
  const fx = TIER_FX[tier], el = $('#flash');
  el.style.setProperty('--fc', fx.fc);
  el.style.transition = 'none'; el.style.opacity = fx.fo; void el.offsetWidth;
  el.style.transition = `opacity ${fast ? 200 : fx.fade}ms ease-out`; el.style.opacity = 0;
  if (tier >= 3) { const st = $('#stage'); st.classList.remove('quake'); void st.offsetWidth; st.classList.add('quake'); }
}

async function flipOne(i) {
  const s = slots[i];
  if (s.classList.contains('flipped') || s.dataset.flipping) return;
  s.dataset.flipping = 1;
  const tier = fxTier(cards[i]);
  const inner = s.querySelector('.inner');
  if (tier === 0) {
    inner.style.setProperty('--fd', '.5s');
    s.classList.add('flipped');
    await wait(500);
  } else {
    const fx = TIER_FX[tier], sh = s.querySelector('.shaker');
    sh.style.setProperty('--amp', fx.amp); sh.style.setProperty('--sd', fx.sd + 'ms'); sh.style.setProperty('--gc', fx.gc);
    if (!fast) { sh.classList.add('shake'); await wait(fx.sd); sh.classList.remove('shake'); }
    const fd = fast ? .3 : fx.fd;
    inner.style.setProperty('--fd', fd + 's');
    s.classList.add('flipped');
    await wait(fd * 500);
    flash(tier);
    await wait(fd * 500 + (fast ? 0 : 250));
  }
  delete s.dataset.flipping;
}

// ---------- 계산 연출 (발라트로식) ----------
// 카드가 공개될 때마다 공개된 카드들 사이의 능력을 다시 계산하고, 새로 생기거나 바뀐 기여만 순서대로 보여줌:
// 능력을 가진 카드가 들썩 → 대상 카드 위에 +N(파랑) / ×N(빨강)이 떠오르고 → 대상 가격표가 떨리며 갱신
let openMask = [], curContribs = [];
function setTag(i, price, kind) {
  const tag = slots[i].querySelector('.tag');
  tag.textContent = fmt(price);
  if (kind) {
    tag.classList.remove('bump', 'add', 'mul'); void tag.offsetWidth; tag.classList.add('bump', kind);
    clearTimeout(tag._t); tag._t = setTimeout(() => tag.classList.remove('bump', 'add', 'mul'), 450);
  }
}
function popAt(i, text, kind) {
  const p = document.createElement('div');
  p.className = `pop ${kind}`; p.textContent = text;
  slots[i].appendChild(p);
  setTimeout(() => p.remove(), 950);
}
function jiggle(i) { const sh = slots[i].querySelector('.shaker'); sh.classList.remove('jiggle'); void sh.offsetWidth; sh.classList.add('jiggle'); }
async function score(newIdx) {
  newIdx.forEach(i => openMask[i] = true);
  const prev = new Map(curContribs.map(k => [k.key, k]));
  const next = contributions(cards, openMask);
  const disp = cards.map(c => ({base: baseOf(c), add: 0, mul: 1}));
  for (const k of curContribs) { if (k.kind === 'add') disp[k.t].add += k.val; else disp[k.t].mul *= k.val; }
  const price = i => r1((disp[i].base + disp[i].add) * disp[i].mul);
  newIdx.forEach(i => setTag(i, price(i), null));
  if (!fast) await wait(newIdx.length > 1 ? 300 : 200);
  const evs = [];
  for (const k of next) {
    const o = prev.get(k.key);
    if (!o) evs.push({...k, d: k.val});
    else if (o.val !== k.val) evs.push({...k, d: k.kind === 'add' ? k.val - o.val : k.val / o.val});
  }
  evs.sort((a, b) => a.s - b.s || a.t - b.t);
  const step = newIdx.length > 1 ? 170 : 260;
  let lastS = -1;
  for (const e of evs) {
    if (e.s !== lastS) { lastS = e.s; if (!fast) { jiggle(e.s); await wait(150); } }
    if (e.kind === 'add') disp[e.t].add += e.d; else disp[e.t].mul *= e.d;
    if (!fast) popAt(e.t, e.kind === 'add' ? `+${r1(e.d)}` : `×${r1(e.d)}`, e.kind);
    setTag(e.t, price(e.t), fast ? null : e.kind);
    if (!fast) await wait(step);
  }
  curContribs = next;
  applyPrices(cards, next);
  cards.forEach((c, i) => { if (openMask[i]) setTag(i, c.price, null); });
}

async function run(task) {
  if (busy) return;
  busy = true; fast = false; renderBar();
  await task();
  busy = false; fast = false; skipFns = [];
  if (slots.every(s => s.classList.contains('flipped'))) await settle(); else renderBar();
}

function onCardClick(e, i) {
  if (busy) { skip(); return; }
  if (state === 'reveal') {
    if (slots[i].classList.contains('flipped')) openInspect(i);
    else run(async () => { await flipOne(i); await score([i]); });
  } else if (state === 'settle') {
    slots[i].classList.toggle('kept'); renderBar();
  }
}

function flipAll() {
  run(async () => {
    const pending = slots.map((s, i) => i).filter(i => !slots[i].classList.contains('flipped'));
    const low = pending.filter(i => fxTier(cards[i]) === 0);
    const high = pending.filter(i => fxTier(cards[i]) > 0).sort((a, b) => fxTier(cards[a]) - fxTier(cards[b]));
    // 연출 스킵으로 wait가 일찍 끝나도, 예약된 낮은 등급 뒤집기가 모두 끝난 뒤 정산으로 넘어가도록 기다린다
    const lowDone = low.map((i, n) => new Promise(res => setTimeout(() => flipOne(i).then(res), n * 70)));
    if (low.length) { await wait(low.length * 70 + 550); await Promise.all(lowDone); await score(low); }
    for (const i of high) { await flipOne(i); await score([i]); }
  });
}

async function settle() {
  state = 'settling'; renderBar();
  applyPrices(cards, curContribs); // 9장 공개 시점의 결과로 가격 확정
  cards.forEach((c, i) => setTag(i, c.price, null));
  await wait(500);
  const t = $('#table'); t.classList.remove('fan'); t.classList.add('grid');
  await wait(600);
  state = 'settle'; renderBar();
}

// ---------- inspect modal ----------
let insp = null;
function openInspect(i) {
  const c = cards[i];
  const holder = $('#holder');
  holder.innerHTML = '';
  const el = cardEl(c);
  el.classList.add('inspect', 'flipped');
  el.querySelector('.zoom').remove();
  holder.appendChild(el);
  insp = {el, rx: 0, ry: 0, drag: null};
  applyInsp(false);
  const locked = openMask.every(Boolean);
  $('#info').innerHTML = `<b>${c.def.art} ${c.def.name}</b> · ${c.def.tag} · ${c.r.name}${c.r.mark ? ` (${c.r.mark})` : ''} · ${c.f.name} · ${c.w.name} (${c.w.g})<br>` +
    `기본가 ${c.r.base} × 마감 ${c.f.mult} × 마모 ${c.w.mult} = ${fmt(c.base)}${c.notes.length ? ' → ' + c.notes.join(', ') : ''} → <b>${fmt(c.price)}</b>` +
    (locked ? ' (확정)' : ' (현재 · 9장 모두 공개 시 확정)') +
    `<br>${abText(abOf(c))}${c.def.ab && c.r.ap > 1 ? ` <span style="opacity:.7">(${c.r.name} 등급 보정: 기본 「${abText(c.def.ab)}」)</span>` : ''}<br>드래그해서 돌려보기 · 휠로 확대`;
  $('#modal').classList.add('open');
}
function applyInsp(anim) {
  const {el, rx, ry} = insp;
  el.style.transition = anim ? 'transform .6s cubic-bezier(.3,.7,.2,1)' : 'none';
  el.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(${insp.z || 1})`;
  const n = ((ry % 360) + 540) % 360 - 180; // -180..180
  const facing = Math.max(-90, Math.min(90, n));
  el.style.setProperty('--mx', (50 + facing / 90 * 50).toFixed(1) + '%');
  el.style.setProperty('--my', (50 - rx / 60 * 50).toFixed(1) + '%');
  el.style.setProperty('--h', ((ry + rx) * 2).toFixed(0));
}
const holder = $('#holder');
holder.addEventListener('pointerdown', e => { if (!insp) return; insp.drag = {x: e.clientX, y: e.clientY}; holder.setPointerCapture(e.pointerId); });
holder.addEventListener('pointermove', e => {
  if (!insp || !insp.drag) return;
  insp.ry += (e.clientX - insp.drag.x) * .6;
  insp.rx = Math.max(-60, Math.min(60, insp.rx - (e.clientY - insp.drag.y) * .5));
  insp.drag = {x: e.clientX, y: e.clientY};
  applyInsp(false);
});
holder.addEventListener('pointerup', () => { if (insp) insp.drag = null; });
holder.addEventListener('wheel', e => { if (!insp) return; e.preventDefault(); insp.z = Math.max(.6, Math.min(1.6, (insp.z || 1) - e.deltaY * .001)); applyInsp(false); }, {passive: false});
$('#mFlip').onclick = () => { insp.ry += 180; applyInsp(true); };
$('#mReset').onclick = () => { insp.rx = 0; insp.ry = Math.round(insp.ry / 360) * 360; insp.z = 1; applyInsp(true); };
$('#mClose').onclick = () => { $('#modal').classList.remove('open'); insp = null; };
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#mClose').click(); });

// 개봉 이펙트 스킵 (팩을 놓는 순간의 click은 무시)
$('#stage').addEventListener('click', () => { if (state === 'tearing' && performance.now() - tearAt > 300) skip(); });
function fit() {
  const st = $('#stage');
  const s = Math.min(1, (st.clientWidth - 16) / 820, (st.clientHeight - 10) / 540);
  $('#table').style.transform = `scale(${s})`;
}
addEventListener('resize', fit);
fit();
