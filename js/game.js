// cardpack — 게임 로직 v0.2 (DOM/저장소 없음, 브라우저와 Node 양쪽에서 동작)
// 모든 액션은 state/meta를 직접 바꾸고 { ok, msg } 를 돌려준다. 난수는 Math.random (시뮬레이션은 시드로 교체).
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.CPData;
  const C = D.C;
  const { DEFS, PACKS, ITEMS, COLLECTIONS } = D;
  const RBY = {}, FBY = {}, WBY = {};
  C.R.forEach(r => RBY[r.id] = r); C.F.forEach(f => FBY[f.id] = f); C.W.forEach(w => WBY[w.g] = w);

  const r1 = C.r1;
  const r2 = x => Math.round(x * 100) / 100;
  const rnd = () => Math.random();
  const pickOne = arr => arr[Math.floor(rnd() * arr.length)];
  const randInt = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ---------- 카드 직렬화 ----------
  // 저장 형식 {u, d, r, f, w, bm, p}  ↔  연출 엔진 형식 {def, r, f, w, bm}
  const hydrate = s => ({ def: DEFS[s.d], r: RBY[s.r], f: FBY[s.f], w: WBY[s.w], bm: s.bm, u: s.u, price: s.p });
  const cardLabel = s => (RBY[s.r].mark ? '[' + RBY[s.r].mark + '] ' : '') + DEFS[s.d].name;

  // ---------- 메타 (앨범/기록/해금) ----------
  function newMeta() {
    return { album: {}, records: [], bestDays: 0, unlocks: [], collectionsDone: [], albumRate: 0, games: 0 };
  }
  function albumEntry(meta, d) { return meta.album[d] || (meta.album[d] = { s: 0, fin: [], bestW: 0 }); }
  function markSeen(meta, d) { const a = albumEntry(meta, d); if (!a.s) a.s = 1; }
  function markCollected(meta, s) {
    const a = albumEntry(meta, s.d);
    a.s = 2;
    if (!a.fin.includes(s.f)) a.fin.push(s.f);
    if (s.w > a.bestW) a.bestW = s.w;
  }
  function refreshMeta(meta) {
    const all = D.NORMAL.concat(D.SPECIALS, D.EVENTS).map(d => d.id);
    meta.albumRate = all.filter(id => meta.album[id] && meta.album[id].s === 2).length / all.length;
    const fresh = [];
    for (const u of D.UNLOCKS) {
      if (!meta.unlocks.includes(u.id) && u.check(meta)) { meta.unlocks.push(u.id); fresh.push(u.name); }
    }
    return fresh;
  }
  const unlocked = (meta, id) => !id || meta.unlocks.includes(id);

  // ---------- 효과 집계 ----------
  function emptyMods() {
    return { hi: 0, single: 0, finish: 0, wear: 0, all: 0, tag: {}, sell: 0, bazaar: 0, disc: 0, maxPacks: 0, quota: 0, morning: 0, interest: 0 };
  }
  function addEff(m, eff) {
    for (const k in eff) {
      if (k === 'tag') for (const t in eff.tag) m.tag[t] = (m.tag[t] || 0) + eff.tag[t];
      else m[k] += eff[k];
    }
  }
  function completeCollections(state) {
    const have = new Set(state.storage.map(s => s.d));
    return D.TAGS.filter(t => DEFS_BY_TAG[t].every(id => have.has(id)));
  }
  const DEFS_BY_TAG = {};
  for (const t of D.TAGS) DEFS_BY_TAG[t] = D.NORMAL.concat(D.SPECIALS).filter(d => d.tag === t).map(d => d.id);

  function mods(state) {
    const m = emptyMods();
    for (const id of state.showcase) addEff(m, ITEMS[id].eff);
    for (const e of state.effects) addEff(m, ITEMS[e.id].eff);
    for (const t of completeCollections(state)) addEff(m, COLLECTIONS[t].eff);
    m.quota = Math.min(m.quota, D.QUOTA_CAP_DISCOUNT);
    m.disc = Math.min(m.disc, 0.6);
    return m;
  }

  const isBazaar = state => state.day % D.BAZAAR_EVERY === 0;
  const maxPacks = (state, m = mods(state)) => D.MAX_PACKS + m.maxPacks;
  const quotaToday = (state, m = mods(state)) => Math.ceil(D.quota(state.day) * (1 - m.quota));
  const showcaseSlots = state => Math.min(D.SHOWCASE_MAX, D.SHOWCASE_BASE + state.shelves);
  // 확정 가격 × 판매 시점 배율 (판매 촉진, 바자회 프리미엄)
  function saleMult(state, rid, m = mods(state)) {
    return (1 + m.sell) * (isBazaar(state) ? D.BAZAAR_PREMIUM[rid] + m.bazaar : 1);
  }
  const saleValue = (state, s, m) => r2(s.p * saleMult(state, s.r, m));

  function addMoney(state, x) {
    state.money = r2(state.money + x);
    if (state.money > state.peak) state.peak = state.money;
  }
  function log(state, msg) { state.log.unshift('[' + state.day + '일] ' + msg); if (state.log.length > 50) state.log.length = 50; }

  // ---------- 새 게임 / 아침 ----------
  function newGame(meta) {
    meta.games++;
    const state = {
      v: 2, day: 1, money: D.START_MONEY, peak: D.START_MONEY, storage: [], bag: [], showcase: [], shelves: 0, effects: [],
      unopened: [], opening: null, packsBought: 0, shop: null, over: false, survived: 0, eventsSeen: [], nextUid: 1, log: [],
      stats: { packs: 0, cards: 0, earned: 0, best: null },
    };
    startDay(state, meta);
    return state;
  }

  function startDay(state, meta) {
    state.packsBought = 0;
    state.peak = state.money;
    // N일 지속 효과 차감
    state.effects = state.effects.filter(e => !('days' in e) || --e.days > 0);
    const m = mods(state);
    const income = r2(m.morning + Math.min(state.money * m.interest, D.INTEREST_CAP));
    if (income > 0) { addMoney(state, income); log(state, '아침 수입 +' + income); }
    state.shop = isBazaar(state) ? genBazaar(state, meta) : genMart(state, meta);
  }

  function itemPool(state, meta, kinds, bazaar) {
    return Object.keys(ITEMS).filter(id => {
      const it = ITEMS[id];
      if (!kinds.includes(it.kind) || !unlocked(meta, it.unlock)) return false;
      if (!!it.bazaarOnly !== !!bazaar) return false;
      return it.kind !== 'perm' || !state.showcase.includes(id);
    });
  }
  function genMart(state, meta) {
    const once = shuffle(itemPool(state, meta, ['once']));
    const perm = shuffle(itemPool(state, meta, ['perm']));
    const items = [once.shift(), perm.shift()].filter(Boolean);
    const rest = shuffle(once.concat(perm));
    if (rest.length) items.push(rest[0]);
    return { type: 'mart', items };
  }
  function genBazaar(state, meta) {
    const sh = { type: 'bazaar', stock: {}, prices: {} };
    for (const k of ['special', 'special2']) {
      if (!unlocked(meta, PACKS[k].unlock)) continue;
      sh.stock[k] = PACKS[k].stock;
      sh.prices[k] = randInt(PACKS[k].single[0], PACKS[k].single[1]);
    }
    // 아이템 코너: 바자회 전용 아이템 + 일반 아이템 섞어 3개
    const only = shuffle(itemPool(state, meta, ['once', 'perm', 'shelf'], true)).filter(id => ITEMS[id].kind !== 'shelf' || showcaseSlots(state) < D.SHOWCASE_MAX);
    const normal = shuffle(itemPool(state, meta, ['once', 'perm']));
    sh.items = only.slice(0, 2).concat(normal.slice(0, 1));
    // 카드 코너
    const m = mods(state);
    sh.singles = shuffle(D.SPECIALS).slice(0, 2).map(d => {
      const s = makeCard(state, d.id, rollGrade(2, 1, [3, 4, 5, 6]), m);
      markSeen(meta, s.d);
      return { card: s, price: Math.max(1, Math.round(s.p * 1.3)) };
    });
    const names = shuffle(D.NPC_NAMES);
    sh.npcs = D.NPC_TYPES.map((type, i) => {
      const n = { type, name: names[i] };
      if (type === 'collector') { n.tag = pickOne(D.TAGS.slice(0, 8)); n.mult = 1.5; n.left = 3; }
      if (type === 'peddler') {
        n.offers = [0, 1, 2].map(() => {
          const s = makeCard(state, pickOne(D.NORMAL).id, rollGrade(2, 1, [2, 3, 4, 5, 6, 7]), m);
          markSeen(meta, s.d);
          return { card: s, price: Math.max(1, Math.round(s.p * (1 + rnd() * 0.4))) };
        });
      }
      if (type === 'trader') { n.left = 2; }
      return n;
    });
    return sh;
  }

  // ---------- 굴림 ----------
  // 골드 이상 확률 = 기본 × boost × hiMult, 늘어난 만큼 일반에서 차감 (데모 방식)
  function rollGrade(boost, hiMult, onlyIdx) {
    let list = C.R.filter(x => x.p > 0);
    if (onlyIdx) list = onlyIdx.map(i => C.R[i]);
    const k = boost * hiMult;
    const rare = list.filter(x => x.tier >= 1).reduce((s, x) => s + x.p, 0);
    return C.pick(list, x => x.tier >= 1 ? x.p * k : x.id === 'common' ? Math.max(1, x.p - rare * (k - 1)) : x.p).id;
  }
  function rollFinish(m) { return C.pick(C.F, f => f.id === 'base' ? f.p : f.p * (1 + m.finish)).id; }
  function rollWear(m) {
    let g = C.pick(C.W).g;
    for (let i = 0; i < m.wear; i++) g = Math.max(g, C.pick(C.W).g);
    return g;
  }
  function makeCard(state, d, r, m, f, w) {
    const s = { u: state.nextUid++, d, r, f: f || rollFinish(m), w: w || rollWear(m), bm: r2(1 + m.all + (m.tag[DEFS[d].tag] || 0)) };
    s.p = C.baseOf(hydrate(s));
    return s;
  }
  // 팩 9장 생성 + 9장 전부 공개 기준 확정 가격 계산
  function rollPack(state, key, single, m) {
    const p = PACKS[key];
    const hiMult = (1 + m.hi) * (single ? 1 + D.SINGLE_BONUS + m.single : 1);
    const out = [];
    const specialSlots = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, p.specials || 0);
    for (let i = 0; i < 9; i++) {
      const left = D.EVENTS.filter(e => !state.eventsSeen.includes(e.id));
      if (left.length && rnd() < D.EVENT_CHANCE * p.boost) {
        const e = pickOne(left);
        state.eventsSeen.push(e.id);
        out.push(makeCard(state, e.id, 'event', m));
        continue;
      }
      const def = specialSlots.includes(i) ? pickOne(D.SPECIALS) : pickOne(D.NORMAL);
      out.push(makeCard(state, def.id, rollGrade(p.boost, hiMult), m));
    }
    settlePrices(out);
    return out;
  }
  function settlePrices(list) {
    const h = list.map(hydrate);
    C.applyPrices(h, C.contributions(h, h.map(() => true)));
    h.forEach((c, i) => { list[i].p = c.price; list[i].notes = c.notes; });
  }

  // ---------- 상점 ----------
  function packPrice(state, key, kind, m = mods(state)) {
    const p = PACKS[key];
    const base = p.bazaar ? state.shop.prices[key] : p[kind];
    return Math.max(1, Math.round(base * (1 - m.disc)));
  }
  function availablePacks(state, meta) {
    const list = [];
    for (const key of ['basic', 'advanced', 'premium']) {
      const p = PACKS[key];
      if (key === 'basic' || meta.unlocks.includes(p.unlock) || state.peak >= p.showAt) list.push(key);
    }
    if (state.shop.type === 'bazaar') for (const k in state.shop.stock) list.push(k);
    return list;
  }
  const busy = state => state.over ? '게임이 끝났습니다.' : state.opening ? '개봉 중에는 상점을 이용할 수 없습니다.' : null;

  function buyPack(state, meta, key, kind) {
    const b = busy(state); if (b) return { ok: false, msg: b };
    const p = PACKS[key];
    if (!availablePacks(state, meta).includes(key)) return { ok: false, msg: '지금은 살 수 없는 팩입니다.' };
    if (p.bazaar) kind = 'single';
    if (kind !== 'bundle' && kind !== 'single') return { ok: false };
    const n = kind === 'bundle' ? 5 : 1;
    const m = mods(state);
    if (state.packsBought + n > maxPacks(state, m)) return { ok: false, msg: `오늘은 ${maxPacks(state, m) - state.packsBought}팩만 더 살 수 있습니다.` };
    if (p.bazaar && state.shop.stock[key] <= 0) return { ok: false, msg: '품절입니다.' };
    const price = packPrice(state, key, kind, m);
    if (state.money < price) return { ok: false, msg: '돈이 부족합니다.' };
    addMoney(state, -price);
    state.packsBought += n;
    if (p.bazaar) state.shop.stock[key]--;
    for (let i = 0; i < n; i++) state.unopened.push({ k: key, single: kind === 'single' });
    return { ok: true, msg: `${p.name} ${kind === 'bundle' ? '5팩 묶음' : '낱개'} 구매 (-${price})` };
  }

  function buyItem(state, meta, idx) {
    const b = busy(state); if (b) return { ok: false, msg: b };
    const id = state.shop.items[idx];
    if (!id) return { ok: false };
    const it = ITEMS[id];
    if (state.money < it.price) return { ok: false, msg: '돈이 부족합니다.' };
    if (it.kind === 'once' && state.bag.length >= D.BAG_MAX) return { ok: false, msg: '가방이 가득 찼습니다.' };
    if (it.kind === 'perm' && state.showcase.length >= showcaseSlots(state)) return { ok: false, msg: '진열장이 가득 찼습니다. 진열품을 팔아 자리를 비우세요.' };
    if (it.kind === 'shelf' && showcaseSlots(state) >= D.SHOWCASE_MAX) return { ok: false, msg: '진열장은 최대 ' + D.SHOWCASE_MAX + '칸입니다.' };
    addMoney(state, -it.price);
    if (it.kind === 'once') state.bag.push(id);
    else if (it.kind === 'perm') state.showcase.push(id);
    else state.shelves++;
    state.shop.items.splice(idx, 1);
    log(state, it.name + ' 구매');
    return { ok: true, msg: it.name + ' 구매 (-' + it.price + ')' + (it.kind === 'once' ? ' → 가방' : it.kind === 'perm' ? ' → 진열장' : '') };
  }
  function useItem(state, idx) {
    if (state.over) return { ok: false };
    const id = state.bag[idx];
    if (!id) return { ok: false };
    const it = ITEMS[id];
    if (it.instant === 'freepack') {
      state.unopened.push({ k: 'basic', single: false });
    } else if (it.packs) state.effects.push({ id, packs: it.packs });
    else if (it.days) state.effects.push({ id, days: it.days });
    state.bag.splice(idx, 1);
    log(state, it.name + ' 사용');
    return { ok: true, msg: it.name + ' 사용: ' + it.desc };
  }
  function sellShowcase(state, idx) {
    const b = busy(state); if (b) return { ok: false, msg: b };
    const id = state.showcase[idx];
    if (!id) return { ok: false };
    const v = Math.floor(ITEMS[id].price / 2);
    state.showcase.splice(idx, 1);
    addMoney(state, v);
    return { ok: true, msg: ITEMS[id].name + ' 처분 +' + v };
  }

  // ---------- 개봉 ----------
  function startOpening(state, meta, idx = 0) {
    if (state.over) return { ok: false };
    if (state.opening) return { ok: false, msg: '이미 개봉 중인 팩이 있습니다.' };
    const pk = state.unopened[idx];
    if (!pk) return { ok: false, msg: '열 팩이 없습니다.' };
    state.unopened.splice(idx, 1);
    const m = mods(state);
    const cards = rollPack(state, pk.k, pk.single, m);
    // 다음 N팩 효과 차감
    state.effects = state.effects.filter(e => !('packs' in e) || --e.packs > 0);
    state.opening = { k: pk.k, single: pk.single, cards };
    cards.forEach(s => markSeen(meta, s.d));
    state.stats.packs++;
    state.stats.cards += cards.length;
    return { ok: true, cards };
  }
  // 정산 후 판매: kept = 판매에서 제외(보관)할 카드 인덱스
  function finishOpening(state, meta, kept = []) {
    const op = state.opening;
    if (!op) return { ok: false };
    if (state.storage.length + kept.length > D.STORAGE_MAX) return { ok: false, msg: '보관함이 가득 찼습니다.' };
    const m = mods(state);
    let sum = 0;
    op.cards.forEach((s, i) => {
      const clean = { u: s.u, d: s.d, r: s.r, f: s.f, w: s.w, bm: s.bm, p: s.p };
      if (!state.stats.best || s.p > state.stats.best.p) state.stats.best = clean;
      if (kept.includes(i)) { state.storage.push(clean); markCollected(meta, clean); }
      else sum += saleValue(state, s, m);
    });
    sum = r2(sum);
    addMoney(state, sum);
    state.stats.earned += sum;
    state.opening = null;
    const before = meta.collectionsDone.slice();
    for (const t of completeCollections(state)) if (!meta.collectionsDone.includes(t)) meta.collectionsDone.push(t);
    const fresh = refreshMeta(meta);
    const newCol = meta.collectionsDone.filter(t => !before.includes(t));
    log(state, `${PACKS[op.k].name} 정산: ${op.cards.length - kept.length}장 판매 +${sum}${kept.length ? `, ${kept.length}장 보관` : ''}`);
    return { ok: true, sum, msg: `+${sum}원${kept.length ? ` · ${kept.length}장 보관` : ''}`, unlocked: fresh, newCollections: newCol };
  }

  // ---------- 보관함 ----------
  function sellStored(state, uid) {
    if (state.opening) return { ok: false, msg: '개봉 중에는 보관함 카드를 팔 수 없습니다.' };
    const i = state.storage.findIndex(s => s.u === uid);
    if (i < 0) return { ok: false };
    const s = state.storage[i];
    const v = saleValue(state, s);
    state.storage.splice(i, 1);
    addMoney(state, v);
    state.stats.earned += v;
    return { ok: true, msg: cardLabel(s) + ' 판매 +' + v };
  }
  // 완성된 컬렉션 묶음: 카드 종류별로 가장 싼 1장씩
  function bundleCards(state, tag) {
    const ids = DEFS_BY_TAG[tag];
    const picks = ids.map(id => state.storage.filter(s => s.d === id).sort((a, b) => a.p - b.p)[0]);
    return picks.every(Boolean) ? picks : null;
  }
  function bundleValue(state, tag, m = mods(state)) {
    const picks = bundleCards(state, tag);
    return picks ? r2(picks.reduce((s, c) => s + saleValue(state, c, m), 0) * D.BUNDLE_MULT) : 0;
  }
  function sellBundle(state, tag) {
    if (state.opening) return { ok: false, msg: '개봉 중에는 팔 수 없습니다.' };
    const picks = bundleCards(state, tag);
    if (!picks) return { ok: false, msg: '컬렉션이 완성되지 않았습니다.' };
    const v = bundleValue(state, tag);
    state.storage = state.storage.filter(s => !picks.includes(s));
    addMoney(state, v);
    state.stats.earned += v;
    log(state, tag + ' 컬렉션 묶음 판매 +' + v);
    return { ok: true, msg: tag + ' 컬렉션 묶음 판매 +' + v + ' (개별 합계 ×' + D.BUNDLE_MULT + ')' };
  }
  function storageValue(state, m = mods(state)) {
    return r2(state.storage.reduce((s, c) => s + saleValue(state, c, m), 0));
  }

  // ---------- 바자회 카드 코너 ----------
  function buySingle(state, meta, idx) {
    const b = busy(state); if (b) return { ok: false, msg: b };
    const o = state.shop.singles && state.shop.singles[idx];
    if (!o) return { ok: false };
    if (state.money < o.price) return { ok: false, msg: '돈이 부족합니다.' };
    if (state.storage.length >= D.STORAGE_MAX) return { ok: false, msg: '보관함이 가득 찼습니다.' };
    addMoney(state, -o.price);
    state.shop.singles.splice(idx, 1);
    state.storage.push(o.card); markCollected(meta, o.card);
    refreshMeta(meta);
    return { ok: true, msg: cardLabel(o.card) + ' 구매 (-' + o.price + ') → 보관함' };
  }
  function collectorPrice(state, npc, s) { return r2(saleValue(state, s) * npc.mult); }
  // collector: arg = 보관함 uid / peddler: arg = 진열 idx / trader: arg = 등급 id
  function npcAction(state, meta, ni, arg) {
    const b = busy(state); if (b) return { ok: false, msg: b };
    const npc = state.shop.npcs && state.shop.npcs[ni];
    if (!npc) return { ok: false };
    if (npc.type === 'collector') {
      const i = state.storage.findIndex(s => s.u === arg);
      const s = state.storage[i];
      if (!s || DEFS[s.d].tag !== npc.tag) return { ok: false, msg: npc.tag + ' 카드만 삽니다.' };
      if (npc.left <= 0) return { ok: false, msg: '더 이상 사지 않습니다.' };
      const v = collectorPrice(state, npc, s);
      state.storage.splice(i, 1);
      npc.left--;
      addMoney(state, v);
      state.stats.earned += v;
      return { ok: true, msg: npc.name + '에게 ' + cardLabel(s) + ' 판매 +' + v };
    }
    if (npc.type === 'peddler') {
      const o = npc.offers[arg];
      if (!o) return { ok: false };
      if (state.money < o.price) return { ok: false, msg: '돈이 부족합니다.' };
      if (state.storage.length >= D.STORAGE_MAX) return { ok: false, msg: '보관함이 가득 찼습니다.' };
      addMoney(state, -o.price);
      npc.offers.splice(arg, 1);
      state.storage.push(o.card); markCollected(meta, o.card);
      refreshMeta(meta);
      return { ok: true, msg: npc.name + '에게서 ' + cardLabel(o.card) + ' 구매 (-' + o.price + ') → 보관함' };
    }
    if (npc.type === 'trader') {
      if (npc.left <= 0) return { ok: false, msg: '오늘 교환은 끝났습니다.' };
      const ri = C.R.findIndex(r => r.id === arg);
      if (ri < 0 || ri >= 8) return { ok: false, msg: '레전드·이벤트는 교환할 수 없습니다.' };
      const given = state.storage.filter(s => s.r === arg).sort((a, b) => a.p - b.p).slice(0, 2);
      if (given.length < 2) return { ok: false, msg: C.R[ri].name + ' 카드 2장이 필요합니다.' };
      state.storage = state.storage.filter(s => !given.includes(s));
      const got = makeCard(state, pickOne(D.NORMAL).id, C.R[ri + 1].id, mods(state));
      state.storage.push(got); markCollected(meta, got);
      refreshMeta(meta);
      npc.left--;
      return { ok: true, msg: given.map(cardLabel).join(' + ') + ' → ' + cardLabel(got) + ' (' + got.p + '원)' };
    }
    return { ok: false };
  }

  // ---------- 할당량 지불 ----------
  function totalAssets(state) { return r2(state.money + storageValue(state)); }
  function pay(state, meta) {
    if (state.over) return { ok: false };
    if (state.opening) return { ok: false, msg: '개봉 중인 팩을 먼저 정산하세요.' };
    const m = mods(state);
    const q = quotaToday(state, m);
    if (state.money >= q) {
      addMoney(state, -q);
      state.survived = state.day;
      if (state.day > meta.bestDays) meta.bestDays = state.day;
      log(state, '할당량 ' + q + ' 지불, 남은 돈 ' + state.money);
      const fresh = refreshMeta(meta);
      state.day++;
      startDay(state, meta);
      return { ok: true, msg: '할당량 ' + q + ' 지불 완료', unlocked: fresh };
    }
    if (state.money + storageValue(state, m) >= q) {
      return { ok: false, needSell: true, msg: '돈이 ' + r2(q - state.money) + '원 부족합니다. 보관함 카드를 팔아 주세요.' };
    }
    return gameOver(state, meta, '할당량 ' + q + '원을 낼 수 없습니다.');
  }
  function gameOver(state, meta, msg) {
    state.over = true;
    const rec = { days: state.survived, assets: totalAssets(state), date: new Date().toLocaleDateString('sv-SE') };
    meta.records.push(rec);
    meta.records.sort((a, b) => b.days - a.days || b.assets - a.assets);
    meta.records.length = Math.min(meta.records.length, 10);
    log(state, '게임 오버 — ' + state.survived + '일 생존');
    return { ok: false, gameOver: true, msg, record: rec, unlocked: refreshMeta(meta) };
  }

  const G = {
    D, newMeta, refreshMeta, markSeen, newGame, startDay, mods, isBazaar, maxPacks, quotaToday, showcaseSlots, saleMult, saleValue,
    hydrate, cardLabel, completeCollections, DEFS_BY_TAG, packPrice, availablePacks, buyPack, buyItem, useItem, sellShowcase,
    startOpening, finishOpening, sellStored, bundleCards, bundleValue, sellBundle, storageValue, buySingle, npcAction, collectorPrice,
    pay, totalAssets, gameOver, rollPack, r2,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.CPGame = G;
})(typeof globalThis !== 'undefined' ? globalThis : this);
