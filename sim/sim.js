// 밸런스 시뮬레이션 (v0.3): node sim/sim.js [판수]
// 봇 2종으로 생존 일수 분포, 날짜별 생존률, 대회 통과율을 출력한다. 게임 로직(js/game.js)을 그대로 쓴다.
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

function openAll(s, meta, keep) {
  while (s.unopened.length) {
    const r = G.startOpening(s, meta, 0);
    const kept = [];
    if (keep) {
      const want = new Set(D.DESIGNATED.filter(id => !s.binder.des[id]));
      r.cards.forEach((c, i) => { if (want.has(c.d) && kept.length < G.freeRoom(s)) { want.delete(c.d); kept.push(i); } });
    }
    G.finishOpening(s, meta, kept);
    if (keep) G.autoArrange(s);
  }
}
// basic: 기본팩 묶음만 사고 전부 판매 / smart: 팩 선택·아이템·업그레이드·도감 채우기
function playDay(s, meta, bot) {
  const smart = bot === 'smart';
  if (smart) {
    for (let i = s.shop.items.length - 1; i >= 0; i--) if (s.money - D.ITEMS[s.shop.items[i]].price >= 60) G.buyItem(s, meta, i);
    while (s.bag.length) G.useItem(s, 0);
  }
  if (!G.isTourney(s)) {
    if (smart) {
      // 가격 대비 기대가가 큰 특수 팩 먼저, 그다음 묶음
      for (const k of s.shop.themes) while (s.money - G.packPrice(s, k, 'single') >= 30 && G.buyPack(s, meta, k, 'single').ok);
      for (const k of ['premium', 'advanced', 'basic']) if (G.availablePacks(s, meta).includes(k)) while (G.buyPack(s, meta, k, 'bundle').ok);
      for (const k of ['premium', 'advanced', 'basic']) if (G.availablePacks(s, meta).includes(k)) while (G.buyPack(s, meta, k, 'single').ok);
    } else {
      while (G.buyPack(s, meta, 'basic', 'bundle').ok);
      while (G.buyPack(s, meta, 'basic', 'single').ok);
    }
  }
  openAll(s, meta, smart);
  for (;;) {
    const res = G.pay(s, meta);
    if (res.gameOver) return res;
    if (res.ok) break;
    const cheap = G.allBinder(s).sort((a, b) => a.p - b.p)[0];
    if (!cheap) return G.gameOver(s, meta, 'stuck');
    G.sellCard(s, cheap.u);
  }
  if (G.isBazaar(s)) {
    if (smart) {
      for (let pass = 0; pass < 6; pass++) {
        for (let i = 0; i < s.shop.ups.length; i++) {
          if (s.money - G.upgradePrice(s, s.shop.ups[i]) >= 80 && G.buyUpgrade(s, meta, i).ok) break;
        }
      }
      for (const k in s.shop.stock) while (s.money > 80 && G.buyPack(s, meta, k, 'single').ok);
      openAll(s, meta, true);
    }
    G.pay(s, meta); // 바자회 마치기
  }
}

function run(bot, N, seed) {
  Math.random = mulberry32(seed);
  const dist = {}, moneyByDay = {};
  let contestTry = {}, contestPass = {};
  for (let g = 0; g < N; g++) {
    const meta = G.newMeta();
    const s = G.newGame(meta);
    while (!s.over && s.day < 60) {
      const day = s.day, w = D.weekOf(day), tour = G.isTourney(s);
      playDay(s, meta, bot);
      if (tour) { contestTry[w] = (contestTry[w] || 0) + 1; if (!s.over) contestPass[w] = (contestPass[w] || 0) + 1; }
      if (!s.over) (moneyByDay[day] = moneyByDay[day] || []).push(s.money);
    }
    dist[s.survived] = (dist[s.survived] || 0) + 1;
  }
  const sorted = [];
  Object.keys(dist).map(Number).sort((a, b) => a - b).forEach(d => { for (let i = 0; i < dist[d]; i++) sorted.push(d); });
  const alive = d => sorted.filter(x => x >= d).length / N;
  console.log(`\n[${bot}] ${N}판 생존 중앙값 ${sorted[N >> 1]}일, 평균 ${(sorted.reduce((a, b) => a + b, 0) / N).toFixed(1)}일, 최고 ${sorted[N - 1]}일`);
  for (const d of [1, 2, 3, 5, 6, 7, 10, 14, 21, 28]) {
    const ms = (moneyByDay[d] || []).sort((a, b) => a - b);
    const q = D.dayOfWeek(d) === D.TOURNEY_DAY ? `대회 ${D.TOURNEY.target(D.weekOf(d))}점` : `할당량 ${D.quota(d)}`;
    console.log(`  ${String(d).padStart(2)}일 통과 ${(alive(d) * 100).toFixed(1).padStart(5)}%  ${q.padEnd(12)} 통과 후 돈 중앙값 ${ms.length ? Math.round(ms[ms.length >> 1]) : '-'}`);
  }
  console.log('  대회 통과율: ' + Object.keys(contestTry).map(w => `${w}주 ${Math.round(100 * (contestPass[w] || 0) / contestTry[w])}%(${contestTry[w]}판)`).join(' · '));
}

const N = Number(process.argv[2] || 500);
run('basic', N, 1);
run('smart', N, 2);
