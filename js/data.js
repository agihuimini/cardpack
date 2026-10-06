// cardpack — 본 게임 데이터 (v0.2). 등급·마감·마모·데모 카드 20장·능력 계산은 js/cards.js 공용 모듈을 쓴다.
// 모든 수치는 초기값. 밸런스 조정은 이 파일에서 한다.
(function (root) {
  // 브라우저: js/cards.js가 전역(lexical)으로 선언한 값을 그대로 참조 / Node: require
  const C = (typeof module !== 'undefined' && module.exports) ? require('./cards.js')
    : { R, F, W, POOL, EVENT_DEF, r1, fmt, pick, abOf, abText, baseOf, contributions, applyPrices };

  const START_MONEY = 50;
  const MAX_PACKS = 5;          // 하루 구매 가능 팩 (묶음·낱개 합산)
  const STORAGE_MAX = 100;      // 카드 보관함
  const SHOWCASE_BASE = 6;      // 진열장 기본 칸
  const SHOWCASE_MAX = 10;
  const BAG_MAX = 10;           // 가방 칸
  const BAZAAR_EVERY = 3;
  const SINGLE_BONUS = 0.1;     // 낱개 구매: 골드 이상 확률 ×1.1
  const BUNDLE_MULT = 2;        // 완성 컬렉션 묶음 판매 = 개별 합계 ×2
  const EVENT_CHANCE = 0.0005;  // 카드 1장당 이벤트 카드 판정 (팩 boost 배)
  const INTEREST_CAP = 30;
  const QUOTA_CAP_DISCOUNT = 0.5;

  function quota(day) {
    return Math.ceil(40 * Math.pow(1.3, day - 1));
  }

  // 바자회 판매 프리미엄 (등급별, 일반 ×1 → 레전드 ×3)
  const BAZAAR_PREMIUM = { common: 1, bronze: 1.1, silver: 1.2, gold: 1.4, plat: 1.6, diamond: 1.8, rare: 2, epic: 2.4, legend: 3, event: 3 };

  // 팩: boost = 골드 이상 확률 배수 (데모와 같은 방식). bundle = 5팩 묶음 가격, single = 낱개 가격
  const PACKS = {
    basic:    { name: '기본팩', bundle: 10, single: 3, boost: 1 },
    advanced: { name: '고급팩', bundle: 30, single: 9, boost: 2, showAt: 150, unlock: 'pack_advanced' },
    premium:  { name: '프리미엄팩', bundle: 80, single: 24, boost: 4, showAt: 400, unlock: 'pack_premium' },
    special:  { name: '바자회 특수팩', single: [14, 22], boost: 2, specials: 1, bazaar: true, stock: 2 },
    special2: { name: '바자회 프리미엄 특수팩', single: [45, 60], boost: 4, specials: 2, bazaar: true, stock: 1, unlock: 'pack_special2' },
  };

  // 카드 풀: 데모 20장(과일/행성/동물/무기) + 20장(보석/날씨/탈것/악기) = 컬렉션 8개 × 5장
  const EXTRA = [
    { id: 'ring',     name: '반지',     art: '💍', tag: '보석', ab: { t: 'tagAll', tag: '보석', add: 2 } },
    { id: 'gem',      name: '보석',     art: '💎', tag: '보석', ab: { t: 'highMul', mult: 1.2 } },
    { id: 'orb',      name: '수정구',   art: '🔮', tag: '보석', ab: { t: 'adjMul', mult: 1.3 } },
    { id: 'coin',     name: '금화',     art: '🪙', tag: '보석', ab: { t: 'lowAdd', add: 1 } },
    { id: 'necklace', name: '목걸이',   art: '📿', tag: '보석', ab: { t: 'perTag', tag: '보석', add: 2 } },
    { id: 'sun',      name: '해',       art: '☀️', tag: '날씨', ab: { t: 'allAdd', add: 1 } },
    { id: 'rain',     name: '비',       art: '🌧️', tag: '날씨', ab: { t: 'adjAdd', add: 1 } },
    { id: 'storm',    name: '번개',     art: '⛈️', tag: '날씨', ab: { t: 'adjMul', mult: 1.4 } },
    { id: 'rainbow',  name: '무지개',   art: '🌈', tag: '날씨', ab: { t: 'sameRarity', add: 2 } },
    { id: 'snow',     name: '눈',       art: '❄️', tag: '날씨', ab: { t: 'dupe', add: 3 } },
    { id: 'bike',     name: '자전거',   art: '🚲', tag: '탈것', ab: { t: 'lowAdd', add: 1 } },
    { id: 'car',      name: '자동차',   art: '🚗', tag: '탈것', ab: { t: 'tagAll', tag: '탈것', add: 2 } },
    { id: 'train',    name: '기차',     art: '🚂', tag: '탈것', ab: { t: 'perTag', tag: '탈것', add: 2 } },
    { id: 'plane',    name: '비행기',   art: '✈️', tag: '탈것', ab: { t: 'tagMult', tag: '탈것', need: 3, mult: 1.8 } },
    { id: 'rocket',   name: '로켓',     art: '🚀', tag: '탈것', ab: { t: 'highMul', mult: 1.25 } },
    { id: 'drum',     name: '북',       art: '🥁', tag: '악기', ab: { t: 'adjAdd', add: 2 } },
    { id: 'guitar',   name: '기타',     art: '🎸', tag: '악기', ab: { t: 'dupe', add: 2 } },
    { id: 'piano',    name: '피아노',   art: '🎹', tag: '악기', ab: { t: 'tagMult', tag: '악기', need: 3, mult: 1.6 } },
    { id: 'trumpet',  name: '트럼펫',   art: '🎺', tag: '악기', ab: { t: 'adjMul', mult: 1.3 } },
    { id: 'violin',   name: '바이올린', art: '🎻', tag: '악기', ab: { t: 'sameRarity', add: 1 } },
  ];
  // 바자회 특수카드 (바자회 특수팩·단품·상인으로만 등장). 5장을 모으면 '바자회' 컬렉션
  const SPECIALS = [
    { id: 'tent',    name: '서커스 천막', art: '🎪', tag: '바자회', ab: { t: 'allAdd', add: 2 } },
    { id: 'mask',    name: '가면',        art: '🎭', tag: '바자회', ab: { t: 'highMul', mult: 1.3 } },
    { id: 'lamp',    name: '요술 램프',   art: '🪔', tag: '바자회', ab: { t: 'adjMul', mult: 1.6 } },
    { id: 'charm',   name: '부적',        art: '🧿', tag: '바자회', ab: { t: 'lowAdd', add: 2 } },
    { id: 'balloon', name: '풍선',        art: '🎈', tag: '바자회', ab: { t: 'perTag', tag: '바자회', add: 5 } },
  ];
  // 이벤트 카드: 한 판에 각 1장만 등장 (게임 오버 시 초기화)
  const EVENTS = [
    C.EVENT_DEF,
    { id: 'trophy', name: '우승 트로피', art: '🏆', tag: '이벤트', ab: { t: 'highMul', mult: 1.5 } },
    { id: 'comet',  name: '혜성',       art: '☄️', tag: '이벤트', ab: { t: 'adjMul', mult: 1.5 } },
  ];

  const NORMAL = C.POOL.concat(EXTRA);
  const DEFS = {};
  for (const d of NORMAL.concat(SPECIALS, EVENTS)) DEFS[d.id] = d;
  const TAGS = ['과일', '행성', '동물', '무기', '보석', '날씨', '탈것', '악기', '바자회'];

  // 효과(mod) 키
  //  hi: 골드 이상 확률 +%   single: 낱개 보너스 +   finish: 마감(반짝이 이상) 확률 +%   wear: 마모 추가 굴림(좋은 쪽)
  //  all: 모든 카드 가치 +%   tag:{태그} 태그 카드 가치 +%   sell: 판매가 +%   bazaar: 바자회 프리미엄 +
  //  disc: 팩 가격 -%   maxPacks: 하루 팩 +N   quota: 할당량 -%   morning: 아침 +원   interest: 아침 이자 %
  const COLLECTIONS = {
    '과일':  { eff: { all: 0.15 },     desc: '모든 카드 가치 +15%' },
    '행성':  { eff: { hi: 0.25 },      desc: '골드 이상 확률 +25%' },
    '동물':  { eff: { wear: 1 },       desc: '마모 2번 굴려 좋은 쪽' },
    '무기':  { eff: { sell: 0.15 },    desc: '판매가 +15%' },
    '보석':  { eff: { finish: 0.75 },  desc: '마감 확률 +75%' },
    '날씨':  { eff: { morning: 15 },   desc: '아침 +15원' },
    '탈것':  { eff: { disc: 0.2 },     desc: '팩 가격 -20%' },
    '악기':  { eff: { bazaar: 0.5 },   desc: '바자회 프리미엄 +0.5' },
    '바자회':{ eff: { maxPacks: 1 },   desc: '하루 팩 구매 +1' },
  };

  // 아이템. kind: once(가방, [사용]) / perm(진열장, 상시) / shelf(구매 즉시 진열장 칸 +1)
  // 1회용 지속: packs = 다음 N팩, days = N일(오늘 포함), instant = 즉시
  const ITEMS = {
    lucky:    { name: '행운 부적',     kind: 'once', price: 12, packs: 3, eff: { hi: 0.3 },      desc: '다음 3팩 골드 이상 확률 +30%' },
    glitter:  { name: '반짝이 스프레이', kind: 'once', price: 12, packs: 2, eff: { finish: 2 }, desc: '다음 2팩 마감 확률 ×3' },
    sleeve:   { name: '카드 슬리브',   kind: 'once', price: 10, packs: 3, eff: { wear: 1 },      desc: '다음 3팩 마모 2번 굴려 좋은 쪽' },
    promo:    { name: '판매 촉진',     kind: 'once', price: 15, days: 2, eff: { sell: 0.2 },     desc: '2일간 판매가 ×1.2' },
    taxcut:   { name: '세금 감면',     kind: 'once', price: 15, days: 1, eff: { quota: 0.2 },    desc: '오늘 할당량 -20%' },
    cart:     { name: '보조 장바구니', kind: 'once', price: 10, days: 1, eff: { maxPacks: 2 },   desc: '오늘 팩 구매 +2' },
    freepack: { name: '덤 기본팩',     kind: 'once', price: 6, instant: 'freepack',             desc: '즉시 기본팩 1개 (하루 한도 무관)' },

    loupe:    { name: '감정사 돋보기', kind: 'perm', price: 40, eff: { wear: 1 },    desc: '마모 2번 굴려 좋은 쪽' },
    polish:   { name: '광택제',       kind: 'perm', price: 40, eff: { finish: 0.5 }, desc: '마감 확률 +50%' },
    clover:   { name: '네잎클로버',   kind: 'perm', price: 45, eff: { hi: 0.15 },    desc: '골드 이상 확률 +15%' },
    solo:     { name: '낱개 전문가',  kind: 'perm', price: 30, eff: { single: 0.2 }, desc: '낱개 보너스 ×1.1 → ×1.3' },
    regular:  { name: '단골 카드',    kind: 'perm', price: 30, eff: { disc: 0.15 },  desc: '팩 가격 -15%' },
    piggy:    { name: '저금통',       kind: 'perm', price: 35, eff: { interest: 0.05 }, desc: '아침 이자 5% (최대 ' + INTEREST_CAP + ')' },
    haggle:   { name: '흥정 수완',    kind: 'perm', price: 30, eff: { bazaar: 0.3 }, desc: '바자회 프리미엄 +0.3' },
    bigcart:  { name: '큰 장바구니',  kind: 'perm', price: 60, eff: { maxPacks: 1 }, desc: '하루 팩 구매 +1' },
    appraisal:{ name: '감정서',       kind: 'perm', price: 40, eff: { all: 0.1 },    desc: '모든 카드 가치 +10%', unlock: 'item_appraisal' },
    glove:    { name: '황금 장갑',    kind: 'once', price: 15, packs: 1, eff: { hi: 1.5 }, desc: '다음 1팩 골드 이상 확률 +150%', unlock: 'item_glove' },

    // 바자회 아이템 코너 전용
    shelf:    { name: '진열장 확장',  kind: 'shelf', price: 35, desc: '진열장 칸 +1 (최대 ' + SHOWCASE_MAX + ')', bazaarOnly: true },
    tape:     { name: '포장 테이프',  kind: 'once', price: 14, packs: 5, eff: { wear: 2 }, desc: '다음 5팩 마모 3번 굴려 좋은 쪽', bazaarOnly: true },
    pass:     { name: '황금 거래증',  kind: 'perm', price: 45, eff: { bazaar: 0.5 }, desc: '바자회 프리미엄 +0.5', bazaarOnly: true },
    magnet:   { name: '희귀 자석',    kind: 'once', price: 20, packs: 2, eff: { hi: 0.8 }, desc: '다음 2팩 골드 이상 확률 +80%', bazaarOnly: true },
  };
  // 컬렉션 첫 완성 시 해금되는 '애호가' 아이템
  for (const t of TAGS) {
    ITEMS['fan_' + t] = { name: t + ' 애호가', kind: 'perm', price: 35, eff: { tag: { [t]: 0.5 } }, desc: t + ' 카드 가치 +50%', unlock: 'item_fan_' + t };
  }

  const UNLOCKS = [
    { id: 'pack_advanced', name: '고급팩 상시 등장', cond: '5일 생존', check: m => m.bestDays >= 5 },
    { id: 'item_glove', name: '아이템: 황금 장갑', cond: '7일 생존', check: m => m.bestDays >= 7 },
    { id: 'pack_premium', name: '프리미엄팩 상시 등장', cond: '10일 생존', check: m => m.bestDays >= 10 },
    { id: 'item_appraisal', name: '아이템: 감정서', cond: '앨범 수집률 30%', check: m => m.albumRate >= 0.3 },
    { id: 'pack_special2', name: '바자회: 프리미엄 특수팩', cond: '앨범 수집률 60%', check: m => m.albumRate >= 0.6 },
    ...TAGS.map(t => ({ id: 'item_fan_' + t, name: '아이템: ' + t + ' 애호가', cond: t + ' 컬렉션 첫 완성', check: m => m.collectionsDone.includes(t) })),
  ];

  const NPC_NAMES = ['김씨', '박 할머니', '떠돌이 J', '최 사장', '수상한 남자', '꼬마 민지', '노점상 이씨', '고물상 한씨'];
  const NPC_TYPES = ['collector', 'peddler', 'trader']; // 수집가(보관함 카드 매입) / 행상인(카드 판매) / 교환상(2장 → 상위 1장)

  const D = {
    C, START_MONEY, MAX_PACKS, STORAGE_MAX, SHOWCASE_BASE, SHOWCASE_MAX, BAG_MAX, BAZAAR_EVERY, SINGLE_BONUS, BUNDLE_MULT,
    EVENT_CHANCE, INTEREST_CAP, QUOTA_CAP_DISCOUNT, quota, BAZAAR_PREMIUM, PACKS, NORMAL, SPECIALS, EVENTS, DEFS, TAGS,
    COLLECTIONS, ITEMS, UNLOCKS, NPC_NAMES, NPC_TYPES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = D;
  else root.CPData = D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
