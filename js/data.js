// cardpack — 정적 데이터 (카드, 팩, 아이템, NPC, 해금)
// 모든 수치는 초기값. 밸런스 조정은 이 파일에서 한다.
(function (root) {
  const RARITIES = ['C', 'B', 'A', 'S', 'SS'];
  const BASE_VALUE = { C: 1, B: 2, A: 5, S: 15, SS: 60 };
  const BAZAAR_PREMIUM = { C: 1, B: 1.2, A: 1.5, S: 2, SS: 3 };

  const START_MONEY = 50;
  const BASE_SLOTS = 5;
  const BASE_MAX_PACKS = 5;
  const BAZAAR_EVERY = 3;
  const QUOTA_CAP_DISCOUNT = 0.5; // 할당량 감소 효과 합계 상한

  function quota(day) {
    return Math.ceil(40 * Math.pow(1.3, day - 1));
  }

  // 팩: odds 순서는 RARITIES와 같음
  const PACKS = {
    basic:   { name: '기본팩', price: 10, cards: 9, odds: [55, 28, 13, 3.5, 0.5] },
    silver:  { name: '실버팩', price: 30, cards: 9, odds: [35, 33, 22, 8, 2], showAt: 150, unlock: 'pack_silver' },
    gold:    { name: '골드팩', price: 80, cards: 9, odds: [15, 30, 33, 17, 5], showAt: 400, unlock: 'pack_gold' },
    special: { name: '바자회 특수팩', price: [50, 70], cards: 9, specials: 1, odds: [35, 33, 22, 8, 2], bazaar: true, stock: 2 },
    premium: { name: '프리미엄 특수팩', price: [110, 140], cards: 9, specials: 2, odds: [15, 30, 33, 17, 5], bazaar: true, stock: 1, unlock: 'pack_premium' },
  };

  // 효과(mod) 키
  //  pct:{C,B,A,S,SS}  희귀도별 가치 +%     all: 모든 카드 가치 +%
  //  setPct:{set}      세트 카드 가치 +%    extra: 팩당 카드 +N
  //  up: 희귀도 상승 확률   perPack: 팩 개봉 시 +돈   maxPacks: 하루 팩 구매 +N
  //  disc: 팩 가격 -%   quota: 할당량 -%   morning: 아침 +돈
  //  interest: 아침 이자 % (상한 interestCap)   bazaar: 바자회 프리미엄 +N
  //  sell: 판매가 ×(1+N)   slots: 보관 +N   heldMult: 보관 카드 가치 +%
  //  wild: 모든 세트에 +1장으로 계산

  const SETS = {
    fruit:  { name: '과일', t1: { pct: { C: 1.0 } },          t2: { pct: { C: 3.0, B: 1.0 } },     t1d: 'C 가치 +100%', t2d: 'C 가치 +300%, B +100%' },
    animal: { name: '동물', t1: { extra: 1 },                  t2: { extra: 3 },                    t1d: '팩당 카드 +1장', t2d: '팩당 카드 +3장' },
    gem:    { name: '보석', t1: { pct: { S: 0.5, SS: 0.5 } }, t2: { pct: { S: 1.5, SS: 1.5 } },     t1d: 'S·SS 가치 +50%', t2d: 'S·SS 가치 +150%' },
    weather:{ name: '날씨', t1: { up: 0.08 },                  t2: { up: 0.2 },                     t1d: '희귀도 상승 +8%', t2d: '희귀도 상승 +20%' },
    food:   { name: '음식', t1: { morning: 15 },               t2: { morning: 60 },                 t1d: '아침 +15', t2d: '아침 +60' },
    vehicle:{ name: '탈것', t1: { disc: 0.15 },                t2: { disc: 0.35, maxPacks: 1 },     t1d: '팩 가격 -15%', t2d: '팩 가격 -35%, 하루 팩 +1' },
    space:  { name: '우주', t1: { all: 0.25 },                 t2: { all: 0.75 },                   t1d: '모든 가치 +25%', t2d: '모든 가치 +75%' },
    music:  { name: '악기', t1: { bazaar: 0.5 },               t2: { bazaar: 1.0, sell: 0.5 },      t1d: '바자회 프리미엄 +0.5', t2d: '바자회 프리미엄 +1.0, 판매가 +50%' },
  };
  // 세트 2단계(5장)는 공통으로 보관 카드 가치 +50%
  const SET_T2_HELD = 0.5;

  // [id, 이름, 세트, 희귀도, 효과, 설명]
  const CARD_ROWS = [
    ['apple', '사과', 'fruit', 'C', { pct: { C: 0.25 } }, 'C 가치 +25%'],
    ['banana', '바나나', 'fruit', 'B', { pct: { C: 0.4 } }, 'C 가치 +40%'],
    ['grape', '포도', 'fruit', 'A', { pct: { B: 0.5 } }, 'B 가치 +50%'],
    ['mango', '망고', 'fruit', 'S', { pct: { C: 1, B: 1 } }, 'C·B 가치 +100%'],
    ['goldapple', '황금사과', 'fruit', 'SS', { all: 0.25 }, '모든 가치 +25%'],

    ['cat', '고양이', 'animal', 'C', { perPack: 1 }, '팩 개봉 시 +1'],
    ['dog', '강아지', 'animal', 'B', { perPack: 2 }, '팩 개봉 시 +2'],
    ['fox', '여우', 'animal', 'A', { maxPacks: 1 }, '하루 팩 구매 +1'],
    ['lion', '사자', 'animal', 'S', { extra: 1 }, '팩당 카드 +1장'],
    ['dragon', '용', 'animal', 'SS', { extra: 1, perPack: 3 }, '팩당 카드 +1장, 팩 개봉 시 +3'],

    ['pebble', '자갈', 'gem', 'C', { pct: { A: 0.1 } }, 'A 가치 +10%'],
    ['crystal', '수정', 'gem', 'B', { pct: { A: 0.25 } }, 'A 가치 +25%'],
    ['ruby', '루비', 'gem', 'A', { pct: { S: 0.3 } }, 'S 가치 +30%'],
    ['sapphire', '사파이어', 'gem', 'S', { pct: { S: 0.6 } }, 'S 가치 +60%'],
    ['diamond', '다이아몬드', 'gem', 'SS', { pct: { SS: 0.5 } }, 'SS 가치 +50%'],

    ['cloud', '구름', 'weather', 'C', { up: 0.01 }, '희귀도 상승 +1%'],
    ['rain', '비', 'weather', 'B', { up: 0.02 }, '희귀도 상승 +2%'],
    ['thunder', '번개', 'weather', 'A', { up: 0.04 }, '희귀도 상승 +4%'],
    ['aurora', '오로라', 'weather', 'S', { up: 0.07 }, '희귀도 상승 +7%'],
    ['eclipse', '일식', 'weather', 'SS', { up: 0.08 }, '희귀도 상승 +8%'],

    ['riceball', '주먹밥', 'food', 'C', { morning: 2 }, '아침 +2'],
    ['ramen', '라면', 'food', 'B', { morning: 4 }, '아침 +4'],
    ['gimbap', '김밥', 'food', 'A', { morning: 8 }, '아침 +8'],
    ['bulgogi', '불고기', 'food', 'S', { morning: 20 }, '아침 +20'],
    ['feast', '만찬', 'food', 'SS', { interest: 0.1 }, '아침 이자 10% (최대 50)'],

    ['bike', '자전거', 'vehicle', 'C', { disc: 0.03 }, '팩 가격 -3%'],
    ['scooter', '스쿠터', 'vehicle', 'B', { disc: 0.05 }, '팩 가격 -5%'],
    ['car', '자동차', 'vehicle', 'A', { disc: 0.08 }, '팩 가격 -8%'],
    ['train', '기차', 'vehicle', 'S', { disc: 0.15 }, '팩 가격 -15%'],
    ['rocket', '로켓', 'vehicle', 'SS', { disc: 0.2, maxPacks: 1 }, '팩 가격 -20%, 하루 팩 +1'],

    ['meteor', '운석', 'space', 'C', { all: 0.03 }, '모든 가치 +3%'],
    ['moon', '달', 'space', 'B', { all: 0.06 }, '모든 가치 +6%'],
    ['mars', '화성', 'space', 'A', { all: 0.12 }, '모든 가치 +12%'],
    ['saturn', '토성', 'space', 'S', { all: 0.25 }, '모든 가치 +25%'],
    ['blackhole', '블랙홀', 'space', 'SS', { all: 0.35 }, '모든 가치 +35%'],

    ['castanet', '캐스터네츠', 'music', 'C', { bazaar: 0.1 }, '바자회 프리미엄 +0.1'],
    ['recorder', '리코더', 'music', 'B', { quota: 0.03 }, '할당량 -3%'],
    ['guitar', '기타', 'music', 'A', { quota: 0.06 }, '할당량 -6%'],
    ['violin', '바이올린', 'music', 'S', { bazaar: 0.5 }, '바자회 프리미엄 +0.5'],
    ['piano', '그랜드피아노', 'music', 'SS', { quota: 0.15 }, '할당량 -15%'],
  ];

  // 바자회 전용 특수카드 (팩 일반 추첨에는 안 나옴)
  const SPECIAL_ROWS = [
    ['goose', '황금 거위', null, 'S', { morning: 12 }, '아침 +12'],
    ['copier', '복사기', null, 'A', { extra: 1 }, '팩당 카드 +1장'],
    ['hat', '마법 모자', null, 'S', { up: 0.08 }, '희귀도 상승 +8%'],
    ['fairy', '세금 요정', null, 'A', { quota: 0.1 }, '할당량 -10%'],
    ['bigshot', '큰손', null, 'S', { sell: 0.25 }, '판매가 +25%'],
    ['rainbow', '무지개 카드', null, 'SS', { wild: 1 }, '모든 세트에 1장으로 계산'],
  ];

  const CARDS = {};
  for (const [id, name, set, rarity, eff, desc] of CARD_ROWS) CARDS[id] = { id, name, set, rarity, eff, desc, special: false };
  for (const [id, name, set, rarity, eff, desc] of SPECIAL_ROWS) CARDS[id] = { id, name, set, rarity, eff, desc, special: true };
  const NORMAL_IDS = CARD_ROWS.map(r => r[0]);
  const SPECIAL_IDS = SPECIAL_ROWS.map(r => r[0]);
  const BY_RARITY = {};
  for (const r of RARITIES) BY_RARITY[r] = NORMAL_IDS.filter(id => CARDS[id].rarity === r);

  // 아이템: once = 그날만, perm = 이번 판 내내
  const ITEMS = {
    charm:    { name: '행운의 부적', kind: 'once', price: 12, eff: { up: 0.1 }, desc: '오늘 희귀도 상승 +10%' },
    magnifier:{ name: '돋보기', kind: 'once', price: 15, eff: { extra: 1 }, desc: '오늘 팩당 카드 +1장' },
    coupon:   { name: '할인 쿠폰', kind: 'once', price: 8, eff: { disc: 0.3 }, desc: '오늘 팩 가격 -30%' },
    survey:   { name: '시장 조사', kind: 'once', price: 14, eff: { all: 0.3 }, desc: '오늘 모든 가치 +30%' },
    cart:     { name: '보조 장바구니', kind: 'once', price: 10, eff: { maxPacks: 2 }, desc: '오늘 팩 구매 +2' },
    taxcut:   { name: '세금 감면', kind: 'once', price: 15, eff: { quota: 0.15 }, desc: '오늘 할당량 -15%' },
    flash:    { name: '반짝 세일', kind: 'once', price: 10, eff: { pct: { C: 1, B: 1 } }, desc: '오늘 C·B 가치 +100%' },

    binder:   { name: '보관함 확장', kind: 'perm', price: 45, eff: { slots: 1 }, desc: '보관 슬롯 +1', stack: true },
    bigcart:  { name: '큰 장바구니', kind: 'perm', price: 60, eff: { maxPacks: 1 }, desc: '하루 팩 구매 +1' },
    piggy:    { name: '저금통', kind: 'perm', price: 35, eff: { interest: 0.05 }, desc: '아침 이자 5% (최대 50)' },
    license:  { name: '감정사 자격증', kind: 'perm', price: 40, eff: { all: 0.1 }, desc: '모든 가치 +10%' },
    clover:   { name: '네잎클로버', kind: 'perm', price: 40, eff: { up: 0.05 }, desc: '희귀도 상승 +5%' },
    regular:  { name: '단골 카드', kind: 'perm', price: 30, eff: { disc: 0.1 }, desc: '팩 가격 -10%' },
    haggle:   { name: '흥정 수완', kind: 'perm', price: 30, eff: { bazaar: 0.3 }, desc: '바자회 프리미엄 +0.3' },

    // 해금 아이템
    goldticket:{ name: '골든 티켓', kind: 'perm', price: 70, eff: { pct: { SS: 0.5 } }, desc: 'SS 가치 +50%', unlock: 'item_goldticket' },
    map:      { name: '탐험가 지도', kind: 'perm', price: 70, eff: { extra: 1 }, desc: '팩당 카드 +1장', unlock: 'item_map' },
  };
  for (const s of Object.keys(SETS)) {
    ITEMS['set_' + s] = { name: SETS[s].name + ' 컬렉션 북', kind: 'perm', price: 40, eff: { setPct: { [s]: 1.0 } }, desc: SETS[s].name + ' 세트 카드 가치 +100%', unlock: 'item_set_' + s };
  }
  const INTEREST_CAP = 50;

  // 해금 목록 (메타 진행). check(meta) → true면 해금
  const UNLOCKS = [
    { id: 'pack_silver', name: '실버팩 상시 등장', cond: '5일 생존', check: m => m.bestDays >= 5 },
    { id: 'item_goldticket', name: '아이템: 골든 티켓', cond: '7일 생존', check: m => m.bestDays >= 7 },
    { id: 'pack_gold', name: '골드팩 상시 등장', cond: '10일 생존', check: m => m.bestDays >= 10 },
    { id: 'item_map', name: '아이템: 탐험가 지도', cond: '앨범 수집률 30%', check: m => m.albumRate >= 0.3 },
    { id: 'pack_premium', name: '바자회: 프리미엄 특수팩', cond: '앨범 수집률 60%', check: m => m.albumRate >= 0.6 },
    ...Object.keys(SETS).map(s => ({ id: 'item_set_' + s, name: '아이템: ' + SETS[s].name + ' 컬렉션 북', cond: SETS[s].name + ' 세트 5장 모두 수집(보관)', check: m => m.setsCollected.includes(s) })),
  ];

  const NPC_NAMES = ['김씨', '박 할머니', '떠돌이 J', '최 사장', '수상한 남자', '꼬마 민지', '노점상 이씨', '고물상 한씨'];
  // collector: 특정 세트를 비싸게 매입 / peddler: 카드 판매 / trader: 2장→상위 1장 / fortune: 돈 내면 오늘 희귀도 상승
  const NPC_TYPES = ['collector', 'peddler', 'trader', 'fortune'];

  const D = {
    RARITIES, BASE_VALUE, BAZAAR_PREMIUM, START_MONEY, BASE_SLOTS, BASE_MAX_PACKS, BAZAAR_EVERY, QUOTA_CAP_DISCOUNT,
    quota, PACKS, SETS, SET_T2_HELD, CARDS, NORMAL_IDS, SPECIAL_IDS, BY_RARITY, ITEMS, INTEREST_CAP, UNLOCKS, NPC_NAMES, NPC_TYPES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = D;
  else root.CPData = D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
