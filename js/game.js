// cardpack — 게임 로직 v0.3 (DOM/저장소 없음, 브라우저와 Node 양쪽에서 동작)
// 모든 액션은 state/meta를 직접 바꾸고 { ok, msg } 를 돌려준다. 난수는 Math.random (시뮬레이션은 시드로 교체).
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.CPData;
  const C = D.C;
  const { DEFS, PACKS, ITEMS, UPGRADES } = D;
  const RBY = {}, FBY = {}, WBY = {};
  C.R.forEach(r => RBY[r.id] = r); C.F.forEach(f => FBY[f.id] = f); C.W.forEach(w => WBY[w.g] = w);

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
  // 저장 형식 {u, d, r, f, w, bm, p, n(능력 내역)}  ↔  연출 엔진 형식 {def, r, f, w, bm}
  const hydrate = s => ({ def: DEFS[s.d], r: RBY[s.r], f: FBY[s.f], w: WBY[s.w], bm: s.bm, u: s.u, price: s.p });
  // 자세히 보기용 (base·notes·price 포함)
  const inspectable = s => Object.assign(hydrate(s), { base: C.baseOf(hydrate(s)), notes: s.n || [], price: s.p });
  const cardLabel = s => (RBY[s.r].mark ? '[' + RBY[s.r].mark + '] ' : '') + DEFS[s.d].name;
  const isEvent = id => DEFS[id].tag === '이벤트';

  // ---------- 메타 (앨범/기록/해금) ----------
  function newMeta() {
    return { album: {}, records: [], bestDays: 0, unlocks: [], albumRate: 0, games: 0, contests: 0 };
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
    meta.albumRate = D.DESIGNATED.filter(id => meta.album[id] && meta.album[id].s === 2).length / D.DESIGNATED.length;
    const fresh = [];
    for (const u of D.UNLOCKS) {
      if (!meta.unlocks.includes(u.id) && u.check(meta)) { meta.unlocks.push(u.id); fresh.push(u.name); }
    }
    return fresh;
  }
  const unlocked = (meta, id) => !id || meta.unlocks.includes(id);

  // ---------- 일정 ----------
  const dow = state => D.dayOfWeek(state.day);
  const isTourney = state => dow(state) === D.TOURNEY_DAY;
  const isBazaar = state => state.phase === 'bazaar';
  const bazaarAfterToday = state => D.BAZAAR_DAYS.includes(dow(state));

  // ---------- 도감 ----------
  // binder.des: 지정카드 {카드id: 카드} / binder.free: 일반카드(임시) 칸 배열 (빈 칸 = null)
  function allBinder(state) {
    return Object.values(state.binder.des).concat(state.binder.free.filter(Boolean));
  }
  function findCard(state, uid) {
    for (const id in state.binder.des) if (state.binder.des[id].u === uid) return { loc: 'des', key: id, card: state.binder.des[id] };
    const i = state.binder.free.findIndex(c => c && c.u === uid);
    return i >= 0 ? { loc: 'free', key: i, card: state.binder.free[i] } : null;
  }
  function removeCard(state, f) {
    if (f.loc === 'des') delete state.binder.des[f.key]; else state.binder.free[f.key] = null;
  }
  const freeRoom = state => state.binder.free.filter(c => !c).length;
  function putFree(state, card) {
    const i = state.binder.free.indexOf(null);
    if (i < 0) return false;
    state.binder.free[i] = card;
    return true;
  }
  const completedRows = state => D.ROWS.filter(r => r.ids.every(id => state.binder.des[id]));
  const scoreMult = state => r2(Math.pow(D.ROW_MULT, completedRows(state).length));

  // 임시칸 카드를 지정칸에 넣기 (이미 있으면 서로 교체)
  function placeDesignated(state, uid) {
    if (state.opening) return { ok: false, msg: '개봉 중에는 도감을 정리할 수 없습니다.' };
    const f = findCard(state, uid);
    if (!f || f.loc !== 'free') return { ok: false };
    const id = f.card.d;
    const before = completedRows(state).length;
    const old = state.binder.des[id];
    state.binder.des[id] = f.card;
    state.binder.free[f.key] = old || null;
    const after = completedRows(state).length;
    return { ok: true, msg: cardLabel(f.card) + (old ? ' ↔ 지정칸 교체' : ' → 지정칸') + (after > before ? ` · 🎉 가로줄 완성! 전체 점수 ×${scoreMult(state)}` : '') };
  }
  function unplace(state, uid) {
    if (state.opening) return { ok: false, msg: '개봉 중에는 도감을 정리할 수 없습니다.' };
    const f = findCard(state, uid);
    if (!f || f.loc !== 'des') return { ok: false };
    if (!freeRoom(state)) return { ok: false, msg: '일반카드 칸이 가득 찼습니다.' };
    delete state.binder.des[f.key];
    putFree(state, f.card);
    return { ok: true, msg: cardLabel(f.card) + ' → 일반카드 칸' };
  }
  // 빈 지정칸을 임시칸 카드로 채움 (같은 카드가 여러 장이면 비싼 것 우선)
  function autoArrange(state) {
    if (state.opening) return { ok: false };
    const before = completedRows(state).length;
    let n = 0;
    const cands = state.binder.free.map((c, i) => c && { c, i }).filter(Boolean).sort((a, b) => b.c.p - a.c.p);
    for (const { c, i } of cands) {
      if (!state.binder.des[c.d]) { state.binder.des[c.d] = c; state.binder.free[i] = null; n++; }
    }
    const rows = completedRows(state).length - before;
    return { ok: true, msg: n ? `${n}장을 지정칸에 넣었습니다${rows ? ` · 🎉 가로줄 ${rows}줄 완성! 전체 점수 ×${scoreMult(state)}` : ''}` : '넣을 카드가 없습니다.' };
  }

  // ---------- 효과 집계 ----------
  function emptyMods() {
    return { hi: 0, tagHi: {}, single: 0, finish: 0, wear: 0, all: 0, tag: {}, sell: 0, bazaar: 0, disc: 0, maxPacks: 0, quota: 0, morning: 0, interest: 0 };
  }
  function addEff(m, eff) {
    for (const k in eff) {
      if (k === 'tag' || k === 'tagHi') for (const t in eff[k]) m[k][t] = (m[k][t] || 0) + eff[k][t];
      else m[k] += eff[k];
    }
  }
  function mods(state) {
    const m = emptyMods();
    for (const id of state.showcase) addEff(m, UPGRADES[id].eff);
    for (const e of state.effects) addEff(m, ITEMS[e.id].eff);
    for (const t in state.luck) m.tagHi[t] = (m.tagHi[t] || 0) + state.luck[t] * D.LUCK_STEP;
    m.quota = Math.min(m.quota, D.QUOTA_CAP_DISCOUNT);
    m.disc = Math.min(m.disc, 0.6);
    return m;
  }

  const maxPacks = (state, m = mods(state)) => D.MAX_PACKS + m.maxPacks;
  const quotaToday = (state, m = mods(state)) => Math.ceil(D.quota(state.day) * (1 - m.quota));
  const showcaseSlots = state => Math.min(D.SHOWCASE_MAX, D.SHOWCASE_BASE + state.shelves);
  // 확정 가격 × 판매 시점 배율 (도감 가로줄, 판매 촉진, 바자회 프리미엄)
  function saleMult(state, rid, m = mods(state)) {
    return scoreMult(state) * (1 + m.sell) * (isBazaar(state) ? D.BAZAAR_PREMIUM[rid] + m.bazaar : 1);
  }
  const saleValue = (state, s, m) => r2(s.p * saleMult(state, s.r, m));

  function addMoney(state, x) {
    state.money = r2(state.money + x);
    if (state.money > state.peak) state.peak = state.money;
  }
  function log(state, msg) { state.log.unshift('[' + state.day + '일] ' + msg); if (state.log.length > 60) state.log.length = 60; }

  // ---------- 새 게임 / 하루 ----------
  function newGame(meta) {
    meta.games++;
    const state = {
      v: 3, day: 1, phase: 'day', money: D.START_MONEY, peak: D.START_MONEY,
      binder: { des: {}, free: Array(D.FREE_SLOTS).fill(null) },
      bag: [], showcase: [], shelves: 0, ups: {}, luck: {}, effects: [], vault: [],
      unopened: [], opening: null, packsBought: 0, shop: null, contest: null, over: false, survived: 0, eventsSeen: [], nextUid: 1, log: [],
      stats: { packs: 0, cards: 0, earned: 0, best: null },
    };
    startDay(state, meta);
    return state;
  }

  function startDay(state, meta) {
    state.phase = 'day';
    state.packsBought = 0;
    state.peak = state.money;
    state.effects = state.effects.filter(e => !('days' in e) || --e.days > 0);
    const m = mods(state);
    const income = r2(m.morning + Math.min(state.money * m.interest, D.INTEREST_CAP));
    if (income > 0) { addMoney(state, income); log(state, '아침 수입 +' + income); }
    state.contest = null;
    if (isTourney(state)) {
      const w = D.weekOf(state.day);
      state.contest = { week: w, target: D.TOURNEY.target(w), score: 0, opened: 0, packs: D.TOURNEY.packs };
      for (let i = 0; i < D.TOURNEY.packs; i++) state.unopened.unshift({ k: 'contest', single: false });
      log(state, `${w}주차 카드 언팩 대회! 대회팩 ${D.TOURNEY.packs}개 정산 합계 ${state.contest.target}점 이상이면 통과`);
    }
    state.shop = genMart(state, meta);
  }
  function nextDay(state, meta) {
    state.day++;
    startDay(state, meta);
  }

  function itemPool(meta, bazaar) {
    return Object.keys(ITEMS).filter(id => unlocked(meta, ITEMS[id].unlock) && (!ITEMS[id].bazaarOnly || bazaar));
  }
  function genMart(state, meta) {
    const themes = isTourney(state) ? [] : shuffle(D.THEME_PACKS).slice(0, 3);
    const stock = {};
    themes.forEach(k => stock[k] = 2);
    return { type: 'mart', items: shuffle(itemPool(meta, false)).slice(0, 3), themes, stock, prices: {} };
  }
  function upgradePool(state, meta) {
    const out = [];
    for (const id of ['fin_sparkle', 'fin_fullholo', 'fin_black', 'halo']) {
      const u = UPGRADES[id];
      if (!state.ups[id] && (!u.req || state.ups[u.req])) out.push(id);
    }
    const perms = Object.keys(UPGRADES).filter(id => UPGRADES[id].kind === 'perm' && unlocked(meta, UPGRADES[id].unlock) && !state.showcase.includes(id));
    out.push(...shuffle(perms).slice(0, 4));
    if (showcaseSlots(state) < D.SHOWCASE_MAX) out.push('shelf');
    out.push(...shuffle(D.TAGS.filter(t => (state.luck[t] || 0) < D.LUCK_MAX)).slice(0, 3).map(t => 'luck_' + t));
    return out;
  }
  function genBazaar(state, meta) {
    const sh = { type: 'bazaar', stock: {}, prices: {}, themes: [] };
    for (const k of ['special', 'special2']) {
      if (!unlocked(meta, PACKS[k].unlock)) continue;
      sh.stock[k] = PACKS[k].stock;
      sh.prices[k] = randInt(PACKS[k].single[0], PACKS[k].single[1]);
    }
    sh.items = shuffle(itemPool(meta, true).filter(id => ITEMS[id].bazaarOnly)).concat(shuffle(itemPool(meta, false)).slice(0, 1));
    sh.ups = upgradePool(state, meta);
    const m = mods(state);
    sh.singles = shuffle(D.SPECIALS).slice(0, 2).map(d => {
      const s = makeCard(state, d.id, rollGrade(2, 1, ['silver', 'gold', 'plat', 'diamond']), m);
      markSeen(meta, s.d);
      return { card: s, price: Math.max(1, Math.round(s.p * 1.3)) };
    });
    const names = shuffle(D.NPC_NAMES);
    sh.npcs = D.NPC_TYPES.map((type, i) => {
      const n = { type, name: names[i] };
      if (type === 'collector') { n.tag = pickOne(D.TAGS); n.mult = 1.5; n.left = 3; }
      if (type === 'peddler') {
        n.offers = [0, 1, 2].map(() => {
          const s = makeCard(state, pickOne(D.NORMAL).id, rollGrade(2, 1, ['bronze', 'silver', 'gold', 'plat', 'diamond', 'rare']), m);
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
  // 골드 이상 확률 = 기본 × boost × hiMult, 늘어난 만큼 일반에서 차감 (데모 방식). allowed = 등장 등급 제한
  function rollGrade(boost, hiMult, allowed) {
    const list = C.R.filter(x => (allowed ? allowed.includes(x.id) : D.GRADE_P[x.id] > 0));
    const P = x => D.GRADE_P[x.id] || 0.001;
    const k = boost * hiMult;
    const rare = list.filter(x => x.tier >= 1).reduce((s, x) => s + P(x), 0);
    return C.pick(list, x => x.tier >= 1 ? P(x) * k : x.id === 'common' ? Math.max(1, P(x) - rare * (k - 1)) : P(x)).id;
  }
  function rollFinish(state, m) {
    const ok = { base: true, sparkle: state.ups.fin_sparkle, fullholo: state.ups.fin_fullholo, black: state.ups.fin_black };
    return C.pick(C.F.filter(f => ok[f.id]), f => f.id === 'base' ? D.FINISH_P.base : D.FINISH_P[f.id] * (1 + m.finish)).id;
  }
  function rollWear(m) {
    let g = C.pick(C.W).g;
    for (let i = 0; i < m.wear; i++) g = Math.max(g, C.pick(C.W).g);
    return g;
  }
  function makeCard(state, d, r, m, f) {
    const s = { u: state.nextUid++, d, r, f: f || rollFinish(state, m), w: rollWear(m), bm: r2(1 + m.all + (m.tag[DEFS[d].tag] || 0)) };
    s.p = C.baseOf(hydrate(s));
    return s;
  }
  // 팩 생성 + 전부 공개 기준 확정 가격 계산
  function rollPack(state, key, single, m) {
    const p = PACKS[key];
    const hiBase = (1 + m.hi) * (single ? 1 + D.SINGLE_BONUS + m.single : 1);
    const out = [];
    const specialSlots = shuffle([...Array(D.PACK_SIZE).keys()]).slice(0, p.specials || 0);
    for (let i = 0; i < D.PACK_SIZE; i++) {
      const left = D.EVENTS.filter(e => !state.eventsSeen.includes(e.id));
      if (state.ups.halo && left.length && !p.grades && rnd() < D.EVENT_CHANCE * p.boost) {
        const e = pickOne(left);
        state.eventsSeen.push(e.id);
        out.push(makeCard(state, e.id, 'event', m));
        continue;
      }
      const def = specialSlots.includes(i) ? pickOne(D.SPECIALS) : DEFS[pickOne(p.pool || D.NORMAL.map(d => d.id))];
      const hi = hiBase * (1 + (m.tagHi[def.tag] || 0));
      out.push(makeCard(state, def.id, rollGrade(p.boost, hi, p.grades), m));
    }
    settlePrices(out);
    return out;
  }
  function settlePrices(list) {
    const h = list.map(hydrate);
    C.applyPrices(h, C.contributions(h, h.map(() => true)));
    h.forEach((c, i) => { list[i].p = c.price; list[i].n = c.notes; });
  }

  // ---------- 상점 ----------
  function packPrice(state, key, kind, m = mods(state)) {
    const p = PACKS[key];
    const base = p.bazaar ? state.shop.prices[key] : p[kind];
    return Math.max(1, Math.round(base * (1 - m.disc)));
  }
  function availablePacks(state, meta) {
    if (isTourney(state)) return [];
    if (isBazaar(state)) return Object.keys(state.shop.stock);
    const list = [];
    for (const key of ['basic', 'advanced', 'premium']) {
      const p = PACKS[key];
      if (key === 'basic' || meta.unlocks.includes(p.unlock) || state.peak >= p.showAt) list.push(key);
    }
    return list.concat(state.shop.themes);
  }
  const busy = state => state.over ? '게임이 끝났습니다.' : state.opening ? '개봉 중에는 상점을 이용할 수 없습니다.' : null;

  function buyPack(state, meta, key, kind) {
    const b = busy(state); if (b) return { ok: false, msg: b };
    const p = PACKS[key];
    if (!p || !availablePacks(state, meta).includes(key)) return { ok: false, msg: isTourney(state) ? '대회 날에는 팩을 팔지 않습니다.' : '지금은 살 수 없는 팩입니다.' };
    if (p.bazaar || p.theme) kind = 'single';
    if (kind !== 'bundle' && kind !== 'single') return { ok: false };
    const n = kind === 'bundle' ? 5 : 1;
    const m = mods(state);
    if (!p.bazaar && state.packsBought + n > maxPacks(state, m)) return { ok: false, msg: `오늘은 ${maxPacks(state, m) - state.packsBought}팩만 더 살 수 있습니다.` };
    if (state.shop.stock[key] !== undefined && state.shop.stock[key] <= 0) return { ok: false, msg: '품절입니다.' };
    const price = packPrice(state, key, kind, m);
    if (state.money < price) return { ok: false, msg: '돈이 부족합니다.' };
    addMoney(state, -price);
    if (!p.bazaar) state.packsBought += n;
    if (state.shop.stock[key] !== undefined) state.shop.stock[key]--;
    for (let i = 0; i < n; i++) state.unopened.push({ k: key, single: kind === 'single' });
    return { ok: true, msg: `${p.name} ${kind === 'bundle' ? '5팩 묶음' : '낱개'} 구매 (-${price})` };
  }

  function buyItem(state, meta, idx) {
    const b = busy(state); if (b) return { ok: false, msg: b };
    const id = state.shop.items[idx];
    if (!id) return { ok: false };
    const it = ITEMS[id];
    if (state.money < it.price) return { ok: false, msg: '돈이 부족합니다.' };
    if (state.bag.length >= D.BAG_MAX) return { ok: false, msg: '가방이 가득 찼습니다.' };
    addMoney(state, -it.price);
    state.bag.push(id);
    state.shop.items.splice(idx, 1);
    log(state, it.name + ' 구매');
    return { ok: true, msg: it.name + ' 구매 (-' + it.price + ') → 가방' };
  }
  function upgradePrice(state, id) {
    const u = UPGRADES[id];
    return u.kind === 'luck' ? D.luckPrice(state.luck[u.tag] || 0) : u.price;
  }
  function buyUpgrade(state, meta, idx) {
    const b = busy(state); if (b) return { ok: false, msg: b };
    if (!isBazaar(state)) return { ok: false, msg: '업그레이드는 바자회에서만 살 수 있습니다.' };
    const id = state.shop.ups[idx];
    if (!id) return { ok: false };
    const u = UPGRADES[id], price = upgradePrice(state, id);
    if (state.money < price) return { ok: false, msg: '돈이 부족합니다.' };
    if (u.kind === 'perm' && state.showcase.length >= showcaseSlots(state)) return { ok: false, msg: '진열장이 가득 찼습니다. 진열품을 처분해 자리를 비우세요.' };
    if (u.kind === 'shelf' && showcaseSlots(state) >= D.SHOWCASE_MAX) return { ok: false, msg: '진열장은 최대 ' + D.SHOWCASE_MAX + '칸입니다.' };
    addMoney(state, -price);
    let note = '';
    if (u.kind === 'unlock') { state.ups[id] = true; note = ' (이번 판 해금)'; }
    else if (u.kind === 'perm') { state.showcase.push(id); note = ' → 진열장'; }
    else if (u.kind === 'shelf') state.shelves++;
    else if (u.kind === 'luck') { state.luck[u.tag] = (state.luck[u.tag] || 0) + 1; note = ' Lv' + state.luck[u.tag]; }
    // 같은 바자회에서 다음 단계가 이어서 나오도록 목록 갱신
    state.shop.ups.splice(idx, 1);
    if (u.kind === 'luck' && state.luck[u.tag] < D.LUCK_MAX) state.shop.ups.splice(idx, 0, id);
    if (u.kind === 'unlock') {
      const next = Object.keys(UPGRADES).find(k => UPGRADES[k].req === id && !state.ups[k]);
      if (next) state.shop.ups.splice(idx, 0, next);
    }
    if (u.kind === 'shelf' && showcaseSlots(state) < D.SHOWCASE_MAX) state.shop.ups.splice(idx, 0, id);
    log(state, u.name + ' 업그레이드' + note);
    return { ok: true, msg: u.name + note + ' (-' + price + ')' };
  }
  function useItem(state, idx) {
    if (state.over) return { ok: false };
    const id = state.bag[idx];
    if (!id) return { ok: false };
    const it = ITEMS[id];
    if (it.instant === 'freepack') state.unopened.push({ k: 'basic', single: false });
    else if (it.packs) state.effects.push({ id, packs: it.packs });
    else if (it.days) state.effects.push({ id, days: it.days });
    state.bag.splice(idx, 1);
    log(state, it.name + ' 사용');
    return { ok: true, msg: it.name + ' 사용: ' + it.desc };
  }
  function sellShowcase(state, idx) {
    const b = busy(state); if (b) return { ok: false, msg: b };
    const id = state.showcase[idx];
    if (!id) return { ok: false };
    const v = Math.floor(UPGRADES[id].price / 2);
    state.showcase.splice(idx, 1);
    addMoney(state, v);
    return { ok: true, msg: UPGRADES[id].name + ' 처분 +' + v };
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
    state.effects = state.effects.filter(e => !('packs' in e) || --e.packs > 0);
    state.opening = { k: pk.k, single: pk.single, cards };
    return { ok: true, cards };
  }
  // 개봉할 차례의 팩을 뜯지 않고 도감 팩보관함에 통째로 보관 (안의 카드는 이미 정해진 그대로)
  function keepSealed(state) {
    const op = state.opening;
    if (!op) return { ok: false };
    if (op.k === 'contest') return { ok: false, msg: '대회팩은 보관할 수 없습니다.' };
    state.vault = state.vault || [];
    if (state.vault.length >= D.VAULT_MAX) return { ok: false, msg: '팩보관함이 가득 찼습니다 (' + D.VAULT_MAX + '칸).' };
    state.vault.push({ k: op.k, single: op.single, cards: op.cards, day: state.day });
    state.opening = null;
    log(state, PACKS[op.k].name + ' 팩째로 보관');
    return { ok: true, msg: PACKS[op.k].name + '을(를) 뜯지 않고 도감 팩보관함에 보관했습니다' };
  }
  function openVault(state, meta, idx) {
    if (state.over) return { ok: false };
    if (state.opening) return { ok: false, msg: '이미 개봉 중인 팩이 있습니다.' };
    const v = (state.vault || [])[idx];
    if (!v) return { ok: false };
    state.vault.splice(idx, 1);
    state.opening = { k: v.k, single: v.single, cards: v.cards };
    return { ok: true, cards: v.cards };
  }
  // 정산 후 판매: kept = 판매에서 제외할 카드 인덱스 → 도감 일반카드(임시) 칸으로
  function finishOpening(state, meta, kept = []) {
    const op = state.opening;
    if (!op) return { ok: false };
    if (kept.length > freeRoom(state)) return { ok: false, msg: '도감 일반카드 칸이 부족합니다.' };
    const m = mods(state);
    op.cards.forEach(s => markSeen(meta, s.d));
    state.stats.packs++;
    state.stats.cards += op.cards.length;
    let sum = 0;
    const packScore = r2(op.cards.reduce((s, c) => s + c.p, 0) * scoreMult(state));
    op.cards.forEach((s, i) => {
      const clean = { u: s.u, d: s.d, r: s.r, f: s.f, w: s.w, bm: s.bm, p: s.p, n: s.n };
      if (!state.stats.best || s.p > state.stats.best.p) state.stats.best = clean;
      if (kept.includes(i)) { putFree(state, clean); markCollected(meta, clean); }
      else sum += saleValue(state, s, m);
    });
    sum = r2(sum);
    addMoney(state, sum);
    state.stats.earned += sum;
    state.opening = null;
    let contestNote = '';
    if (op.k === 'contest' && state.contest) {
      state.contest.score = r2(state.contest.score + packScore);
      state.contest.opened++;
      contestNote = ` · 대회 점수 +${packScore} (합계 ${state.contest.score}/${state.contest.target})`;
    }
    const fresh = refreshMeta(meta);
    log(state, `${PACKS[op.k].name} 정산: ${op.cards.length - kept.length}장 판매 +${sum}${kept.length ? `, ${kept.length}장 도감` : ''}${contestNote}`);
    return { ok: true, sum, packScore, msg: `+${sum}원${kept.length ? ` · ${kept.length}장 도감(임시칸)` : ''}${contestNote}`, unlocked: fresh };
  }

  // ---------- 도감 카드 판매 ----------
  function sellCard(state, uid) {
    if (state.opening) return { ok: false, msg: '개봉 중에는 도감 카드를 팔 수 없습니다.' };
    const f = findCard(state, uid);
    if (!f) return { ok: false };
    const v = saleValue(state, f.card);
    removeCard(state, f);
    addMoney(state, v);
    state.stats.earned += v;
    return { ok: true, msg: cardLabel(f.card) + ' 판매 +' + v };
  }
  function binderValue(state, m = mods(state)) {
    return r2(allBinder(state).reduce((s, c) => s + saleValue(state, c, m), 0));
  }

  // ---------- 바자회 카드 코너 ----------
  function buySingle(state, meta, idx) {
    const b = busy(state); if (b) return { ok: false, msg: b };
    const o = state.shop.singles && state.shop.singles[idx];
    if (!o) return { ok: false };
    if (state.money < o.price) return { ok: false, msg: '돈이 부족합니다.' };
    if (!freeRoom(state)) return { ok: false, msg: '도감 일반카드 칸이 가득 찼습니다.' };
    addMoney(state, -o.price);
    state.shop.singles.splice(idx, 1);
    putFree(state, o.card); markCollected(meta, o.card);
    refreshMeta(meta);
    return { ok: true, msg: cardLabel(o.card) + ' 구매 (-' + o.price + ') → 도감' };
  }
  function collectorPrice(state, npc, s) { return r2(saleValue(state, s) * npc.mult); }
  // collector: arg = 도감 카드 uid / peddler: arg = 진열 번호 / trader: arg = 등급 id
  function npcAction(state, meta, ni, arg) {
    const b = busy(state); if (b) return { ok: false, msg: b };
    const npc = state.shop.npcs && state.shop.npcs[ni];
    if (!npc) return { ok: false };
    if (npc.type === 'collector') {
      const f = findCard(state, arg);
      if (!f || DEFS[f.card.d].tag !== npc.tag) return { ok: false, msg: npc.tag + ' 카드만 삽니다.' };
      if (npc.left <= 0) return { ok: false, msg: '더 이상 사지 않습니다.' };
      const v = collectorPrice(state, npc, f.card);
      removeCard(state, f);
      npc.left--;
      addMoney(state, v);
      state.stats.earned += v;
      return { ok: true, msg: npc.name + '에게 ' + cardLabel(f.card) + ' 판매 +' + v };
    }
    if (npc.type === 'peddler') {
      const o = npc.offers[arg];
      if (!o) return { ok: false };
      if (state.money < o.price) return { ok: false, msg: '돈이 부족합니다.' };
      if (!freeRoom(state)) return { ok: false, msg: '도감 일반카드 칸이 가득 찼습니다.' };
      addMoney(state, -o.price);
      npc.offers.splice(arg, 1);
      putFree(state, o.card); markCollected(meta, o.card);
      refreshMeta(meta);
      return { ok: true, msg: npc.name + '에게서 ' + cardLabel(o.card) + ' 구매 (-' + o.price + ') → 도감' };
    }
    if (npc.type === 'trader') {
      if (npc.left <= 0) return { ok: false, msg: '오늘 교환은 끝났습니다.' };
      const ri = C.R.findIndex(r => r.id === arg);
      if (ri < 0 || ri >= 8) return { ok: false, msg: '레전드·이벤트는 교환할 수 없습니다.' };
      // 일반카드 칸의 싼 카드부터 2장 사용
      const given = state.binder.free.filter(c => c && c.r === arg).sort((a, b) => a.p - b.p).slice(0, 2);
      if (given.length < 2) return { ok: false, msg: '일반카드 칸에 ' + C.R[ri].name + ' 카드 2장이 필요합니다.' };
      given.forEach(c => removeCard(state, findCard(state, c.u)));
      const got = makeCard(state, pickOne(D.NORMAL).id, C.R[ri + 1].id, mods(state));
      putFree(state, got); markCollected(meta, got);
      refreshMeta(meta);
      npc.left--;
      return { ok: true, msg: given.map(cardLabel).join(' + ') + ' → ' + cardLabel(got) + ' (' + got.p + '원)' };
    }
    return { ok: false };
  }

  // ---------- 할당량 / 바자회 / 대회 ----------
  function totalAssets(state) { return r2(state.money + binderValue(state)); }
  function survive(state, meta) {
    state.survived = state.day;
    if (state.day > meta.bestDays) meta.bestDays = state.day;
  }
  function pay(state, meta) {
    if (state.over) return { ok: false };
    if (state.opening) return { ok: false, msg: '개봉 중인 팩을 먼저 정산하세요.' };
    if (isBazaar(state)) return leaveBazaar(state, meta);
    if (isTourney(state)) return finishContest(state, meta);
    const m = mods(state);
    const q = quotaToday(state, m);
    if (state.money >= q) {
      addMoney(state, -q);
      survive(state, meta);
      log(state, '할당량 ' + q + ' 지불, 남은 돈 ' + state.money);
      const fresh = refreshMeta(meta);
      if (bazaarAfterToday(state)) {
        state.phase = 'bazaar';
        state.shop = genBazaar(state, meta);
        log(state, '바자회가 열렸습니다');
        return { ok: true, msg: '할당량 ' + q + ' 지불 완료 · 🎪 바자회가 열렸습니다', unlocked: fresh };
      }
      nextDay(state, meta);
      return { ok: true, msg: '할당량 ' + q + ' 지불 완료', unlocked: fresh };
    }
    if (state.money + binderValue(state, m) >= q) {
      return { ok: false, needSell: true, msg: '돈이 ' + r2(q - state.money) + '원 부족합니다. 도감 카드를 팔아 주세요.' };
    }
    return gameOver(state, meta, '할당량 ' + q + '원을 낼 수 없습니다.');
  }
  function leaveBazaar(state, meta) {
    if (state.opening) return { ok: false, msg: '개봉 중인 팩을 먼저 정산하세요.' };
    nextDay(state, meta);
    return { ok: true, msg: '바자회를 마치고 다음 날로' };
  }
  function finishContest(state, meta) {
    const c = state.contest;
    if (!c) return { ok: false };
    if (state.unopened.some(p => p.k === 'contest')) return { ok: false, msg: '대회팩을 모두 열어야 결과가 나옵니다.' };
    if (c.score >= c.target) {
      const prize = Math.round(c.target * D.TOURNEY.prize);
      addMoney(state, prize);
      survive(state, meta);
      meta.contests++;
      log(state, `${c.week}주차 대회 통과! ${c.score}/${c.target}점, 상금 +${prize}`);
      const fresh = refreshMeta(meta);
      nextDay(state, meta);
      return { ok: true, msg: `🏆 ${c.week}주차 카드 언팩 대회 통과! (${c.score}/${c.target}점) 상금 +${prize}원`, unlocked: fresh };
    }
    return gameOver(state, meta, `카드 언팩 대회 탈락 (${c.score}/${c.target}점)`);
  }
  function gameOver(state, meta, msg) {
    state.over = true;
    const rec = { days: state.survived, assets: totalAssets(state), date: new Date().toLocaleDateString('sv-SE') };
    meta.records.push(rec);
    meta.records.sort((a, b) => b.days - a.days || b.assets - a.assets);
    meta.records.length = Math.min(meta.records.length, 10);
    log(state, '게임 오버 — ' + msg);
    return { ok: false, gameOver: true, msg, record: rec, unlocked: refreshMeta(meta) };
  }

  const G = {
    D, newMeta, refreshMeta, markSeen, newGame, startDay, mods, dow, isTourney, isBazaar, bazaarAfterToday, maxPacks, quotaToday,
    showcaseSlots, saleMult, saleValue, scoreMult, completedRows, hydrate, inspectable, cardLabel, isEvent, allBinder, findCard, freeRoom,
    placeDesignated, unplace, autoArrange, packPrice, availablePacks, buyPack, buyItem, upgradePrice, buyUpgrade, useItem, sellShowcase,
    startOpening, keepSealed, openVault, finishOpening, sellCard, binderValue, buySingle, npcAction, collectorPrice, pay, leaveBazaar, finishContest,
    totalAssets, gameOver, rollPack, r2,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.CPGame = G;
})(typeof globalThis !== 'undefined' ? globalThis : this);
