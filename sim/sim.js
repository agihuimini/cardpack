// 밸런스 시뮬레이션 (v0.2): node sim/sim.js [판수]
// 봇 2종으로 생존 일수 분포와 날짜별 생존률을 출력한다. 게임 로직(js/game.js)을 그대로 쓴다.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const G = require('../js/game.js');
const D = G.D;

// basic: 기본팩 묶음만 사고 전부 판매 / smart: 살 수 있는 가장 좋은 팩, 아이템 구매·사용, 컬렉션용 카드 보관
function playDay(s, meta, bot) {
  const m0 = G.mods(s);
  if (bot === 'smart') {
    for (let i = s.shop.items.length - 1; i >= 0; i--) {
      const it = D.ITEMS[s.shop.items[i]];
      if (s.money - it.price >= 100) G.buyItem(s, meta, i);
    }
    while (s.bag.length) G.useItem(s, 0);
  }
  const order = bot === 'smart' ? ['premium', 'advanced', 'basic'] : ['basic'];
  for (const k of order) {
    if (!G.availablePacks(s, meta).includes(k)) continue;
    while (G.buyPack(s, meta, k, 'bundle').ok);
    while (G.buyPack(s, meta, k, 'single').ok);
  }
  if (bot === 'smart' && s.shop.type === 'bazaar') for (const k in s.shop.stock) while (G.buyPack(s, meta, k, 'single').ok);
  while (s.unopened.length) {
    const r = G.startOpening(s, meta, 0);
    const kept = [];
    if (bot === 'smart') {
      const have = new Set(s.storage.map(c => c.d));
      r.cards.forEach((c, i) => { if (!have.has(c.d) && s.storage.length + kept.length < D.STORAGE_MAX && !D.EVENTS.some(e => e.id === c.d)) { have.add(c.d); kept.push(i); } });
    }
    G.finishOpening(s, meta, kept);
  }
  for (;;) {
    const res = G.pay(s, meta);
    if (res.ok || res.gameOver) return res;
    const cheap = s.storage.slice().sort((a, b) => a.p - b.p)[0];
    G.sellStored(s, cheap.u);
  }
}

function run(bot, N, seed) {
  Math.random = mulberry32(seed);
  const dist = {}, moneyByDay = {};
  for (let g = 0; g < N; g++) {
    const meta = G.newMeta();
    const s = G.newGame(meta);
    while (!s.over && s.day < 80) {
      playDay(s, meta, bot);
      if (!s.over) (moneyByDay[s.day - 1] = moneyByDay[s.day - 1] || []).push(s.money);
    }
    dist[s.survived] = (dist[s.survived] || 0) + 1;
  }
  const sorted = [];
  Object.keys(dist).map(Number).sort((a, b) => a - b).forEach(d => { for (let i = 0; i < dist[d]; i++) sorted.push(d); });
  const alive = d => sorted.filter(x => x >= d).length / N;
  console.log(`\n[${bot}] ${N}판 생존 중앙값 ${sorted[N >> 1]}일, 평균 ${(sorted.reduce((a, b) => a + b, 0) / N).toFixed(1)}일, 최고 ${sorted[N - 1]}일`);
  for (const d of [1, 2, 3, 5, 7, 10, 15, 20, 25]) {
    const ms = (moneyByDay[d] || []).sort((a, b) => a - b);
    console.log(`  ${String(d).padStart(2)}일 지불 성공 ${(alive(d) * 100).toFixed(1).padStart(5)}%  할당량 ${String(D.quota(d)).padStart(7)}  지불 후 돈 중앙값 ${ms.length ? Math.round(ms[ms.length >> 1]) : '-'}`);
  }
}

const N = Number(process.argv[2] || 500);
run('basic', N, 1);
run('smart', N, 2);
