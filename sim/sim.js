// 밸런스 시뮬레이션: node sim/sim.js [판수]
// 봇 2종(전부판매 / 탐욕)으로 생존 일수 분포와 날짜별 생존률을 출력한다.
const D = require('../js/data.js');
const G = require('../js/game.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const RANK = { C: 0, B: 1, A: 2, S: 3, SS: 4 };
const packEV = G.packEV;

const PERM_PRIORITY = ['bigcart', 'license', 'binder', 'regular', 'clover', 'map', 'goldticket', 'piggy', 'haggle'];

function playDay(state, meta, rng, bot) {
  // 아이템
  if (bot === 'greedy' && state.shop.type === 'mart') {
    for (const id of PERM_PRIORITY) {
      const idx = state.shop.items.indexOf(id);
      if (idx >= 0 && state.money - D.ITEMS[id].price >= 60) G.buyItem(state, meta, idx);
    }
  }
  // 팩 구매
  // 예산·구매 수 안에서 순이익 합이 최대인 조합을 완전탐색
  const opts = G.availablePacks(state, meta).filter(k => bot === 'greedy' || k === 'basic')
    .map(k => ({ k, price: G.packPrice(state, k), net: packEV(state, k) - G.packPrice(state, k), stock: D.PACKS[k].bazaar ? state.shop.stock[k] : 99 }))
    .filter(o => o.net > 0);
  let bestCombo = [], bestNet = 0;
  (function search(i, left, money, combo, net) {
    if (net > bestNet) { bestNet = net; bestCombo = combo.slice(); }
    if (i >= opts.length || left <= 0) return;
    const o = opts[i];
    for (let n = Math.min(left, o.stock, Math.floor(money / o.price)); n >= 0; n--) {
      for (let j = 0; j < n; j++) combo.push(o.k);
      search(i + 1, left - n, money - n * o.price, combo, net + n * o.net);
      combo.length -= n;
    }
  })(0, G.maxPacks(state) - state.packsBought, state.money, [], 0);
  for (const k of bestCombo) G.buyPack(state, meta, k);
  while (state.unopened.length) G.openPack(state, meta, rng);
  // 보관
  if (bot === 'greedy') {
    const cands = state.opened.map((id, i) => ({ id, i })).sort((a, b) => RANK[D.CARDS[b.id].rarity] - RANK[D.CARDS[a.id].rarity]);
    for (const c of cands) {
      const slots = G.slotCount(state);
      const r = RANK[D.CARDS[c.id].rarity];
      if (r < 2) break;
      if (state.held.length < slots) { G.keepOpened(state, meta, state.opened.indexOf(c.id)); continue; }
      // 가장 낮은 보관 카드보다 높으면 교체
      let low = 0;
      state.held.forEach((id, i) => { if (RANK[D.CARDS[id].rarity] < RANK[D.CARDS[state.held[low]].rarity]) low = i; });
      if (r > RANK[D.CARDS[state.held[low]].rarity]) { G.sellHeld(state, meta, low); G.keepOpened(state, meta, state.opened.indexOf(c.id)); }
    }
  }
  for (;;) {
    const res = G.pay(state, meta, rng);
    if (res.ok || res.gameOver) return res;
    if (res.needSell) {
      let low = 0;
      state.held.forEach((id, i) => { if (RANK[D.CARDS[id].rarity] < RANK[D.CARDS[state.held[low]].rarity]) low = i; });
      G.sellHeld(state, meta, low);
    } else throw new Error(res.msg);
  }
}

const probe = [];
function run(bot, games, seed, persistentMeta) {
  const rng = mulberry32(seed);
  const dist = {};
  const moneyByDay = {};
  let meta = G.newMeta();
  for (let g = 0; g < games; g++) {
    if (!persistentMeta) meta = G.newMeta();
    const state = G.newGame(meta, rng);
    while (!state.over && state.day < 60) {
      playDay(state, meta, rng, bot);
      if (!state.over) (moneyByDay[state.day - 1] = moneyByDay[state.day - 1] || []).push(state.money);
      if (!state.over && state.day === 11 && process.env.PROBE) probe.push({ m: G.mods(state), held: state.held.slice(), perm: state.perm.slice(), money: state.money });
    }
    dist[state.survived] = (dist[state.survived] || 0) + 1;
  }
  const days = Object.keys(dist).map(Number).sort((a, b) => a - b);
  const total = games;
  let alive = total;
  const lines = [];
  for (let d = 1; d <= days[days.length - 1]; d++) {
    alive -= dist[d - 1] || 0; // alive = survived >= d 인 판 수
    const ms = (moneyByDay[d] || []).sort((a, b) => a - b);
    const med = ms.length ? Math.round(ms[Math.floor(ms.length / 2)]) : '-';
    lines.push(`  ${String(d).padStart(2)}일 지불 성공: ${(100 * alive / total).toFixed(1).padStart(5)}% (지불 후 남은돈 중앙값 ${med}, 할당량 ${D.quota(d)})`);
  }
  const avg = days.reduce((s, d) => s + d * dist[d], 0) / total;
  const sorted = [];
  days.forEach(d => { for (let i = 0; i < dist[d]; i++) sorted.push(d); });
  console.log(`\n[${bot}${persistentMeta ? ' +해금 누적' : ''}] ${games}판 평균 생존 ${avg.toFixed(2)}일, 중앙값 ${sorted[Math.floor(games / 2)]}일, 최고 ${days[days.length - 1]}일`);
  console.log(lines.slice(0, 14).join('\n'));
  return meta;
}

const N = Number(process.argv[2] || 2000);
run('sellall', N, 1, false);
run('greedy', N, 2, false);
const meta = run('greedy', N, 3, true);
console.log('\n해금(누적 메타):', meta.unlocks.join(', '), ' 앨범', (meta.albumRate * 100).toFixed(0) + '%');

if (process.env.PROBE) {
  const avg = k => (probe.reduce((s, p) => s + (typeof k === 'function' ? k(p) : p.m[k]), 0) / probe.length).toFixed(2);
  console.log('\n[10일차 생존 판 평균 효과]', probe.length + '판');
  for (const k of ['all', 'extra', 'up', 'disc', 'bazaar', 'sell', 'heldMult', 'maxPacks', 'morning', 'interest', 'quota', 'slots']) console.log(' ', k, avg(k));
  console.log('  pctSS', avg(p => p.m.pct.SS), 'pctS', avg(p => p.m.pct.S));
  const cnt = {}; probe.forEach(p => p.held.forEach(id => cnt[id] = (cnt[id] || 0) + 1));
  console.log('  보관 상위', Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => D.CARDS[k].name + ':' + v).join(' '));
  const pc = {}; probe.forEach(p => p.perm.forEach(id => pc[id] = (pc[id] || 0) + 1));
  console.log('  아이템', Object.entries(pc).sort((a, b) => b[1] - a[1]).map(([k, v]) => D.ITEMS[k].name + ':' + v).join(' '));
}
