// cardpack — 게임 로직 (DOM/저장소 없음, 브라우저와 Node 양쪽에서 동작)
// 모든 액션은 state/meta를 직접 바꾸고 { ok, msg } 를 돌려준다.
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.CPData;
  const { RARITIES, BASE_VALUE, BAZAAR_PREMIUM, PACKS, SETS, CARDS, ITEMS } = D;

  const r2 = x => Math.round(x * 100) / 100;
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
  const randInt = (lo, hi, rng) => lo + Math.floor(rng() * (hi - lo + 1));
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function weighted(weights, rng) {
    const total = weights.reduce((s, w) => s + w, 0);
    let x = rng() * total;
    for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return i; }
    return weights.length - 1;
  }

  // ---------- 메타 (앨범/기록/해금) ----------
  function newMeta() {
    return { album: {}, records: [], bestDays: 0, unlocks: [], setsCollected: [], albumRate: 0, games: 0 };
  }
  function markSeen(meta, id) { if (!meta.album[id]) meta.album[id] = 1; }
  function markCollected(meta, id) { meta.album[id] = 2; }
  // 앨범 수집률·세트 완성 갱신 후 새로 해금된 항목 이름 목록을 돌려준다
  function refreshMeta(meta) {
    const all = Object.keys(CARDS);
    meta.albumRate = all.filter(id => meta.album[id] === 2).length / all.length;
    meta.setsCollected = Object.keys(SETS).filter(s => all.filter(id => CARDS[id].set === s).every(id => meta.album[id] === 2));
    const fresh = [];
    for (const u of D.UNLOCKS) {
      if (!meta.unlocks.includes(u.id) && u.check(meta)) { meta.unlocks.push(u.id); fresh.push(u.name); }
    }
    return fresh;
  }
  const unlocked = (meta, id) => !id || meta.unlocks.includes(id);

  // ---------- 효과 집계 ----------
  function emptyMods() {
    return { pct: { C: 0, B: 0, A: 0, S: 0, SS: 0 }, all: 0, setPct: {}, extra: 0, up: 0, perPack: 0, maxPacks: 0, disc: 0,
      quota: 0, morning: 0, interest: 0, bazaar: 0, sell: 0, slots: 0, heldMult: 0, wild: 0 };
  }
  function addEff(m, eff, times = 1) {
    for (const k in eff) {
      if (k === 'pct') for (const r in eff.pct) m.pct[r] += eff.pct[r] * times;
      else if (k === 'setPct') for (const s in eff.setPct) m.setPct[s] = (m.setPct[s] || 0) + eff.setPct[s] * times;
      else m[k] += eff[k] * times;
    }
  }
  function setCounts(state) {
    const counts = {};
    const wild = state.held.filter(id => CARDS[id].eff.wild).length;
    for (const s in SETS) counts[s] = new Set(state.held.filter(id => CARDS[id].set === s)).size + wild;
    return counts;
  }
  function setTiers(state) {
    const counts = setCounts(state), tiers = {};
    for (const s in SETS) tiers[s] = counts[s] >= 5 ? 2 : counts[s] >= 3 ? 1 : 0;
    return { counts, tiers };
  }
  function mods(state) {
    const m = emptyMods();
    for (const id of state.held) addEff(m, CARDS[id].eff);
    for (const id of state.perm) addEff(m, ITEMS[id].eff);
    for (const id of state.today) addEff(m, ITEMS[id].eff);
    if (state.todayEff) addEff(m, state.todayEff);
    const { tiers } = setTiers(state);
    for (const s in tiers) {
      if (tiers[s] === 1) addEff(m, SETS[s].t1);
      if (tiers[s] === 2) { addEff(m, SETS[s].t2); m.heldMult += D.SET_T2_HELD; }
    }
    m.quota = Math.min(m.quota, D.QUOTA_CAP_DISCOUNT);
    m.disc = Math.min(m.disc, 0.6);
    m.up = Math.min(m.up, 0.6);
    return m;
  }

  const isBazaar = state => state.day % D.BAZAAR_EVERY === 0;
  const slotCount = (state, m = mods(state)) => D.BASE_SLOTS + m.slots;
  const maxPacks = (state, m = mods(state)) => D.BASE_MAX_PACKS + m.maxPacks;
  const quotaToday = (state, m = mods(state)) => Math.ceil(D.quota(state.day) * (1 - m.quota));

  // 카드 1장의 현재 판매가
  function cardValue(state, id, opt = {}, m = mods(state)) {
    const c = CARDS[id];
    let v = BASE_VALUE[c.rarity] * (1 + m.all + m.pct[c.rarity] + (c.set && !opt.noSet ? (m.setPct[c.set] || 0) : 0));
    v *= 1 + m.sell;
    if (isBazaar(state) && !opt.noBazaar) v *= BAZAAR_PREMIUM[c.rarity] + m.bazaar;
    if (opt.held) v *= 1 + m.heldMult;
    return r2(v);
  }

  function addMoney(state, x) {
    state.money = r2(state.money + x);
    if (state.money > state.shop.peak) state.shop.peak = state.money;
  }
  function log(state, msg) { state.log.unshift('[' + state.day + '일] ' + msg); if (state.log.length > 40) state.log.length = 40; }

  // ---------- 새 게임 / 아침 ----------
  function newGame(meta, rng = Math.random) {
    meta.games++;
    const state = {
      v: 1, day: 1, money: D.START_MONEY, held: [], opened: [], unopened: [], perm: [], today: [], todayEff: null,
      packsBought: 0, shop: null, over: false, survived: 0, log: [],
      stats: { packs: 0, cards: 0, earned: 0, spent: 0 },
    };
    startDay(state, meta, rng);
    return state;
  }

  function startDay(state, meta, rng = Math.random) {
    state.today = []; state.todayEff = null; state.packsBought = 0;
    state.shop = { peak: state.money };
    const m = mods(state);
    const income = r2(m.morning + Math.min(state.money * m.interest, D.INTEREST_CAP));
    if (income > 0) { addMoney(state, income); log(state, '아침 수입 +' + income); }
    if (isBazaar(state)) genBazaar(state, meta, rng); else genMart(state, meta, rng);
  }

  function itemPool(state, meta, kind) {
    return Object.keys(ITEMS).filter(id => {
      const it = ITEMS[id];
      return it.kind === kind && unlocked(meta, it.unlock) && (it.stack || !state.perm.includes(id));
    });
  }
  function genMart(state, meta, rng) {
    state.shop.type = 'mart';
    const once = shuffle(itemPool(state, meta, 'once'), rng);
    const perm = shuffle(itemPool(state, meta, 'perm'), rng);
    const items = [once.shift(), perm.shift()].filter(Boolean);
    const rest = shuffle(once.concat(perm), rng);
    if (rest.length) items.push(rest[0]);
    state.shop.items = items;
  }
  function genBazaar(state, meta, rng) {
    const sh = state.shop;
    sh.type = 'bazaar';
    sh.items = [];
    sh.stock = {};
    sh.prices = {};
    for (const k of ['special', 'premium']) {
      if (!unlocked(meta, PACKS[k].unlock)) continue;
      sh.stock[k] = PACKS[k].stock;
      sh.prices[k] = randInt(PACKS[k].price[0], PACKS[k].price[1], rng);
    }
    sh.singles = shuffle(D.SPECIAL_IDS, rng).slice(0, 2).map(id => ({ id, price: Math.round(BASE_VALUE[CARDS[id].rarity] * (1.5 + rng() * 0.7)) }));
    sh.singles.forEach(s => markSeen(meta, s.id));
    const names = shuffle(D.NPC_NAMES, rng);
    sh.npcs = shuffle(D.NPC_TYPES, rng).slice(0, 3).map((type, i) => {
      const n = { type, name: names[i] };
      if (type === 'collector') { n.set = pick(Object.keys(SETS), rng); n.mult = 1.5; n.left = 3; }
      if (type === 'peddler') {
        n.offers = [0, 1, 2].map(() => {
          const id = pick(D.BY_RARITY[RARITIES[weighted([0, 30, 40, 22, 8], rng)]], rng);
          markSeen(meta, id);
          return { id, price: Math.round(BASE_VALUE[CARDS[id].rarity] * (0.9 + rng() * 0.5)) };
        });
      }
      if (type === 'trader') { n.rarity = pick(['C', 'B', 'A', 'S'], rng); n.left = 2; }
      if (type === 'fortune') { n.price = 20; n.used = false; }
      return n;
    });
  }

  // ---------- 상점 ----------
  function packPrice(state, key, m = mods(state)) {
    const base = PACKS[key].bazaar ? state.shop.prices[key] : PACKS[key].price;
    return Math.max(1, Math.round(base * (1 - m.disc)));
  }
  function availablePacks(state, meta) {
    const list = [];
    for (const key of ['basic', 'silver', 'gold']) {
      const p = PACKS[key];
      if (key === 'basic' || meta.unlocks.includes(p.unlock) || state.shop.peak >= p.showAt) list.push(key);
    }
    if (state.shop.type === 'bazaar') for (const k in state.shop.stock) list.push(k);
    return list;
  }
  function buyPack(state, meta, key) {
    if (state.over) return { ok: false };
    const m = mods(state);
    if (!availablePacks(state, meta).includes(key)) return { ok: false, msg: '지금은 살 수 없는 팩입니다.' };
    if (state.packsBought >= maxPacks(state, m)) return { ok: false, msg: '오늘은 더 이상 팩을 살 수 없습니다.' };
    if (PACKS[key].bazaar && state.shop.stock[key] <= 0) return { ok: false, msg: '품절입니다.' };
    const price = packPrice(state, key, m);
    if (state.money < price) return { ok: false, msg: '돈이 부족합니다.' };
    addMoney(state, -price);
    state.stats.spent += price;
    state.packsBought++;
    if (PACKS[key].bazaar) state.shop.stock[key]--;
    state.unopened.push(key);
    return { ok: true, msg: PACKS[key].name + ' 구매 (-' + price + ')' };
  }
  function buyItem(state, meta, idx) {
    const id = state.shop.items && state.shop.items[idx];
    if (!id || state.over) return { ok: false };
    const it = ITEMS[id];
    if (state.money < it.price) return { ok: false, msg: '돈이 부족합니다.' };
    addMoney(state, -it.price);
    state.stats.spent += it.price;
    (it.kind === 'perm' ? state.perm : state.today).push(id);
    state.shop.items.splice(idx, 1);
    log(state, it.name + ' 구매');
    return { ok: true, msg: it.name + ' 구매 (-' + it.price + ')' };
  }

  // ---------- 개봉 ----------
  function drawPack(state, key, rng, m = mods(state)) {
    const p = PACKS[key];
    const n = p.cards + m.extra;
    const out = [];
    for (let i = 0; i < n; i++) {
      if (i < (p.specials || 0)) { out.push(pick(D.SPECIAL_IDS, rng)); continue; }
      let ri = weighted(p.odds, rng);
      if (ri < RARITIES.length - 1 && rng() < m.up) ri++;
      out.push(pick(D.BY_RARITY[RARITIES[ri]], rng));
    }
    return out;
  }
  // 지금 효과 기준 팩 1개의 판매 기대가치 (희귀도 상승 효과는 무시한 근사치)
  function packEV(state, key, m = mods(state)) {
    const p = PACKS[key];
    const tot = p.odds.reduce((a, b) => a + b, 0);
    let perCard = 0;
    RARITIES.forEach((r, i) => { perCard += p.odds[i] / tot * cardValue(state, D.BY_RARITY[r][0], { noSet: true }, m); });
    const sp = D.SPECIAL_IDS.reduce((s, id) => s + cardValue(state, id, {}, m), 0) / D.SPECIAL_IDS.length;
    return r2(perCard * (p.cards - (p.specials || 0) + m.extra) + (p.specials || 0) * sp);
  }

  function openPack(state, meta, rng = Math.random) {
    if (!state.unopened.length) return { ok: false, msg: '열 팩이 없습니다.' };
    const key = state.unopened.shift();
    const m = mods(state);
    const cards = drawPack(state, key, rng, m);
    cards.forEach(id => markSeen(meta, id));
    state.opened.push(...cards);
    sortOpened(state);
    state.stats.packs++;
    state.stats.cards += cards.length;
    if (m.perPack) addMoney(state, m.perPack);
    const best = cards.reduce((b, id) => RARITIES.indexOf(CARDS[id].rarity) > RARITIES.indexOf(CARDS[b].rarity) ? id : b, cards[0]);
    log(state, PACKS[key].name + ' 개봉: ' + cards.length + '장, 최고 ' + CARDS[best].rarity + ' ' + CARDS[best].name);
    return { ok: true, cards };
  }

  // 개봉 카드는 희귀도 높은 순으로 정렬해 둔다
  function sortOpened(state) {
    state.opened.sort((a, b) => RARITIES.indexOf(CARDS[b].rarity) - RARITIES.indexOf(CARDS[a].rarity));
  }

  // ---------- 판매/보관 ----------
  function sell(state, value) { addMoney(state, value); state.stats.earned += value; }
  function sellOpened(state, meta, idx) {
    const id = state.opened[idx];
    if (!id) return { ok: false };
    const v = cardValue(state, id);
    state.opened.splice(idx, 1);
    sell(state, v);
    return { ok: true, msg: CARDS[id].name + ' 판매 +' + v };
  }
  function sellAllOpened(state) {
    const m = mods(state);
    let total = 0;
    for (const id of state.opened) total += cardValue(state, id, {}, m);
    total = r2(total);
    const n = state.opened.length;
    state.opened = [];
    sell(state, total);
    return { ok: true, msg: n + '장 판매 +' + total };
  }
  function keepOpened(state, meta, idx) {
    const id = state.opened[idx];
    if (!id) return { ok: false };
    if (state.held.length >= slotCount(state)) return { ok: false, msg: '보관함이 가득 찼습니다.' };
    state.opened.splice(idx, 1);
    state.held.push(id);
    markCollected(meta, id);
    const fresh = refreshMeta(meta);
    return { ok: true, msg: CARDS[id].name + ' 보관', unlocked: fresh };
  }
  function sellHeld(state, meta, idx) {
    const id = state.held[idx];
    if (!id) return { ok: false };
    const v = cardValue(state, id, { held: true });
    state.held.splice(idx, 1);
    sell(state, v);
    // 보관 슬롯이 줄어든 효과는 없음 (슬롯 아이템은 영구)
    return { ok: true, msg: CARDS[id].name + ' 판매 +' + v };
  }
  function releaseHeld(state, meta, idx) { // 보관 → 개봉 영역으로 되돌리기 (판매/교환용)
    const id = state.held[idx];
    if (!id) return { ok: false };
    state.held.splice(idx, 1);
    state.opened.push(id);
    return { ok: true };
  }

  // ---------- 바자회 ----------
  function buySingle(state, meta, idx) {
    const s = state.shop.singles && state.shop.singles[idx];
    if (!s) return { ok: false };
    if (state.money < s.price) return { ok: false, msg: '돈이 부족합니다.' };
    addMoney(state, -s.price);
    state.stats.spent += s.price;
    state.shop.singles.splice(idx, 1);
    state.opened.push(s.id);
    return { ok: true, msg: CARDS[s.id].name + ' 구매 (-' + s.price + ')' };
  }
  function collectorPrice(state, npc, id) {
    return r2(cardValue(state, id) * npc.mult);
  }
  // npc 행동. arg: collector=opened idx, peddler=offer idx, trader/fortune=없음
  function npcAction(state, meta, ni, arg, rng = Math.random) {
    const npc = state.shop.npcs && state.shop.npcs[ni];
    if (!npc || state.over) return { ok: false };
    if (npc.type === 'collector') {
      const id = state.opened[arg];
      if (!id || CARDS[id].set !== npc.set) return { ok: false, msg: SETS[npc.set].name + ' 세트 카드만 삽니다.' };
      if (npc.left <= 0) return { ok: false, msg: '더 이상 사지 않습니다.' };
      const v = collectorPrice(state, npc, id);
      state.opened.splice(arg, 1);
      npc.left--;
      sell(state, v);
      return { ok: true, msg: npc.name + '에게 ' + CARDS[id].name + ' 판매 +' + v };
    }
    if (npc.type === 'peddler') {
      const o = npc.offers[arg];
      if (!o) return { ok: false };
      if (state.money < o.price) return { ok: false, msg: '돈이 부족합니다.' };
      addMoney(state, -o.price);
      state.stats.spent += o.price;
      npc.offers.splice(arg, 1);
      state.opened.push(o.id);
      return { ok: true, msg: npc.name + '에게서 ' + CARDS[o.id].name + ' 구매 (-' + o.price + ')' };
    }
    if (npc.type === 'trader') {
      if (npc.left <= 0) return { ok: false, msg: '오늘 교환은 끝났습니다.' };
      const idxs = [];
      state.opened.forEach((id, i) => { if (CARDS[id].rarity === npc.rarity && !CARDS[id].special && idxs.length < 2) idxs.push(i); });
      if (idxs.length < 2) return { ok: false, msg: '개봉 카드 중 ' + npc.rarity + ' 카드 2장이 필요합니다.' };
      const given = idxs.map(i => state.opened[i]);
      state.opened = state.opened.filter((_, i) => !idxs.includes(i));
      const next = RARITIES[RARITIES.indexOf(npc.rarity) + 1];
      const got = pick(D.BY_RARITY[next], rng);
      markSeen(meta, got);
      state.opened.push(got);
      npc.left--;
      return { ok: true, msg: given.map(id => CARDS[id].name).join('+') + ' → ' + next + ' ' + CARDS[got].name };
    }
    if (npc.type === 'fortune') {
      if (npc.used) return { ok: false, msg: '오늘 점은 이미 봤습니다.' };
      if (state.money < npc.price) return { ok: false, msg: '돈이 부족합니다.' };
      addMoney(state, -npc.price);
      state.stats.spent += npc.price;
      npc.used = true;
      state.todayEff = { up: 0.15 };
      return { ok: true, msg: '점괘: 오늘 희귀도 상승 +15%' };
    }
    return { ok: false };
  }

  // ---------- 할당량 지불 ----------
  function heldTotal(state, m = mods(state)) {
    return r2(state.held.reduce((s, id) => s + cardValue(state, id, { held: true }, m), 0));
  }
  function totalAssets(state) { return r2(state.money + heldTotal(state)); }

  function pay(state, meta, rng = Math.random) {
    if (state.over) return { ok: false };
    if (state.unopened.length) return { ok: false, msg: '아직 열지 않은 팩이 있습니다.' };
    let msgs = [];
    if (state.opened.length) msgs.push(sellAllOpened(state).msg);
    const m = mods(state);
    const q = quotaToday(state, m);
    if (state.money >= q) {
      addMoney(state, -q);
      state.survived = state.day;
      if (state.day > meta.bestDays) meta.bestDays = state.day;
      log(state, '할당량 ' + q + ' 지불, 남은 돈 ' + state.money);
      const fresh = refreshMeta(meta);
      state.day++;
      startDay(state, meta, rng);
      return { ok: true, msg: msgs.concat('할당량 ' + q + ' 지불 완료').join(' / '), unlocked: fresh };
    }
    if (state.money + heldTotal(state, m) >= q) {
      return { ok: false, needSell: true, msg: msgs.concat('돈이 ' + r2(q - state.money) + ' 부족합니다. 보관 카드를 팔아 주세요.').join(' / ') };
    }
    return gameOver(state, meta, msgs.concat('할당량 ' + q + '을(를) 낼 수 없습니다.').join(' / '));
  }
  function gameOver(state, meta, msg) {
    state.over = true;
    const rec = { days: state.survived, assets: totalAssets(state), date: new Date().toISOString().slice(0, 10) };
    meta.records.push(rec);
    meta.records.sort((a, b) => b.days - a.days || b.assets - a.assets);
    meta.records.length = Math.min(meta.records.length, 10);
    log(state, '게임 오버 — ' + state.survived + '일 생존');
    return { ok: false, gameOver: true, msg, record: rec, unlocked: refreshMeta(meta) };
  }

  const G = {
    newMeta, refreshMeta, markSeen, newGame, startDay, mods, setTiers, isBazaar, slotCount, maxPacks, quotaToday,
    cardValue, packPrice, packEV, availablePacks, buyPack, buyItem, openPack, drawPack, sellOpened, sellAllOpened, keepOpened, sellHeld,
    releaseHeld, buySingle, npcAction, collectorPrice, pay, heldTotal, totalAssets, gameOver, r2,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.CPGame = G;
})(typeof globalThis !== 'undefined' ? globalThis : this);
