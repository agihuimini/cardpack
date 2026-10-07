// cardpack — 본 게임 데이터 (v0.3). 등급·마감·마모 정의와 능력 계산은 js/cards.js 공용 모듈을 쓴다.
// 모든 수치는 초기값. 밸런스 조정은 이 파일에서 한다.
(function (root) {
  // 브라우저: js/cards.js가 전역(lexical)으로 선언한 값을 그대로 참조 / Node: require
  const C = (typeof module !== 'undefined' && module.exports) ? require('./cards.js')
    : { R, F, W, POOL, EVENT_DEF, r1, fmt, pick, abOf, abText, baseOf, contributions, applyPrices };

  const PACK_SIZE = 7;          // 팩 1개 = 7장
  const START_MONEY = 50;
  const MAX_PACKS = 5;          // 하루 구매 가능 팩 (묶음·낱개·특수팩 합산, 바자회 특수팩 제외)
  const SHOWCASE_BASE = 6;      // 진열장 기본 칸
  const SHOWCASE_MAX = 10;
  const BAG_MAX = 10;
  const SINGLE_BONUS = 0.1;     // 낱개 구매: 골드 이상 확률 ×1.1
  const ROW_MULT = 1.1;         // 도감 지정 가로줄 1줄 완성마다 전체 점수 ×1.1
  const EVENT_CHANCE = 0.0003;  // 카드 1장당 이벤트 카드 판정 (팩 boost 배, '후광' 업그레이드 필요)
  const INTEREST_CAP = 30;
  const QUOTA_CAP_DISCOUNT = 0.5;

  // 일정: 1주 = 7일. 3·6일차는 플레이를 마치고(할당량 지불 후) 바자회, 7일차는 카드 언팩 대회
  const WEEK = 7;
  const BAZAAR_DAYS = [3, 6];
  const TOURNEY_DAY = 7;
  const dayOfWeek = day => (day - 1) % WEEK + 1;
  const weekOf = day => Math.floor((day - 1) / WEEK) + 1;

  function quota(day) {
    return Math.ceil(40 * Math.pow(1.3, day - 1));
  }
  // 대회: 대회팩 3개 정산 합계(× 전체 점수 배율)가 목표 이상이면 통과, 아니면 게임 오버
  const TOURNEY = { packs: 3, target: week => Math.ceil(150 * Math.pow(2.2, week - 1)), prize: 0.5 };

  // 본 게임 등급 확률 (데모보다 골드 이상을 크게 낮춤). 순서는 cards.js의 R과 같음, 이벤트는 별도 판정
  const GRADE_P = { common: 50, bronze: 28, silver: 17, gold: 3.5, plat: 1, diamond: 0.35, rare: 0.12, epic: 0.025, legend: 0.005, event: 0 };
  // 마감 확률 (반짝이 이상은 업그레이드로 해금해야 등장)
  const FINISH_P = { base: 96, sparkle: 3, fullholo: 0.8, black: 0.2 };

  // 바자회 판매 프리미엄 (등급별, 일반 ×1 → 레전드 ×3)
  const BAZAAR_PREMIUM = { common: 1, bronze: 1.1, silver: 1.2, gold: 1.4, plat: 1.6, diamond: 1.8, rare: 2, epic: 2.4, legend: 3, event: 3 };

  // 카드 풀: 데모 20장(과일/행성/동물/무기, js/cards.js) + 20장(보석/날씨/탈것/악기)
  const EXTRA = [
    { id: 'ring',     name: '반지',     art: '💍', tag: '보석', ab: { t: 'tagAll', tag: '보석', add: 2 } },
    { id: 'gem',      name: '보석',     art: '💎', tag: '보석', ab: { t: 'highMul', mult: 1.2 } },
    { id: 'orb',      name: '수정구',   art: '🔮', tag: '보석', ab: { t: 'adjMul', mult: 1.3 } },
    { id: 'coin',     name: '금화',     art: '🪙', tag: '보석', ab: { t: 'lowAdd', add: 1 } },
    { id: 'necklace', name: '목걸이',   art: '📿', tag: '보석', ab: { t: 'lastTag', tag: '보석', mult: 1.5 } },
    { id: 'sun',      name: '해',       art: '☀️', tag: '날씨', ab: { t: 'firstAll', add: 1 } },
    { id: 'rain',     name: '비',       art: '🌧️', tag: '날씨', ab: { t: 'adjAdd', add: 1 } },
    { id: 'storm',    name: '번개',     art: '⛈️', tag: '날씨', ab: { t: 'adjMul', mult: 1.4 } },
    { id: 'rainbow',  name: '무지개',   art: '🌈', tag: '날씨', ab: { t: 'sameRarity', add: 2 } },
    { id: 'snow',     name: '눈',       art: '❄️', tag: '날씨', ab: { t: 'dupe', add: 3 } },
    { id: 'bike',     name: '자전거',   art: '🚲', tag: '탈것', ab: { t: 'lowAdd', add: 1 } },
    { id: 'car',      name: '자동차',   art: '🚗', tag: '탈것', ab: { t: 'tagAll', tag: '탈것', add: 2 } },
    { id: 'train',    name: '기차',     art: '🚂', tag: '탈것', ab: { t: 'edgeSelf', mult: 2 } },
    { id: 'plane',    name: '비행기',   art: '✈️', tag: '탈것', ab: { t: 'tagMult', tag: '탈것', need: 3, mult: 1.8 } },
    { id: 'rocket',   name: '로켓',     art: '🚀', tag: '탈것', ab: { t: 'firstAll', add: 2 } },
    { id: 'drum',     name: '북',       art: '🥁', tag: '악기', ab: { t: 'adjAdd', add: 2 } },
    { id: 'guitar',   name: '기타',     art: '🎸', tag: '악기', ab: { t: 'dupe', add: 2 } },
    { id: 'piano',    name: '피아노',   art: '🎹', tag: '악기', ab: { t: 'tagMult', tag: '악기', need: 3, mult: 1.6 } },
    { id: 'trumpet',  name: '트럼펫',   art: '🎺', tag: '악기', ab: { t: 'lastAll', mult: 1.2 } },
    { id: 'violin',   name: '바이올린', art: '🎻', tag: '악기', ab: { t: 'edgeSelf', mult: 1.5 } },
  ];
  // 바자회 특수카드 (바자회 특수팩·단품·상인으로만 등장)
  const SPECIALS = [
    { id: 'tent',    name: '서커스 천막', art: '🎪', tag: '바자회', ab: { t: 'allAdd', add: 2 } },
    { id: 'mask',    name: '가면',        art: '🎭', tag: '바자회', ab: { t: 'highMul', mult: 1.3 } },
    { id: 'lamp',    name: '요술 램프',   art: '🪔', tag: '바자회', ab: { t: 'adjMul', mult: 1.6 } },
    { id: 'charm',   name: '부적',        art: '🧿', tag: '바자회', ab: { t: 'lastAll', mult: 1.3 } },
    { id: 'balloon', name: '풍선',        art: '🎈', tag: '바자회', ab: { t: 'firstAll', add: 3 } },
  ];
  // 이벤트 카드(후광): '후광' 업그레이드 후 등장, 한 판에 각 1장 (게임 오버 시 초기화)
  const EVENTS = [
    C.EVENT_DEF,
    { id: 'trophy', name: '우승 트로피', art: '🏆', tag: '이벤트', ab: { t: 'highMul', mult: 1.5 } },
    { id: 'comet',  name: '혜성',       art: '☄️', tag: '이벤트', ab: { t: 'adjMul', mult: 1.5 } },
  ];

  const NORMAL = C.POOL.concat(EXTRA);
  const DEFS = {};
  for (const d of NORMAL.concat(SPECIALS, EVENTS)) DEFS[d.id] = d;
  const TAGS = ['과일', '행성', '동물', '무기', '보석', '날씨', '탈것', '악기'];
  const GOLD_UP = ['gold', 'plat', 'diamond', 'rare', 'epic', 'legend'];

  // 팩. boost = 골드 이상 확률 배수. pool = 등장 카드 제한, grades = 등장 등급 제한
  // theme: 상점에 날마다 랜덤으로 3종 등장하는 특수 팩 (낱개만, 재고 2)
  const PACKS = {
    basic:    { name: '기본팩', bundle: 10, single: 3, boost: 1 },
    advanced: { name: '고급팩', bundle: 30, single: 9, boost: 2, showAt: 150, unlock: 'pack_advanced' },
    premium:  { name: '프리미엄팩', bundle: 80, single: 24, boost: 4, showAt: 400, unlock: 'pack_premium' },
    series1:  { name: '팩 1탄', theme: true, single: 4, boost: 1, pool: C.POOL.map(d => d.id), desc: '과일·행성·동물·무기만' },
    series2:  { name: '팩 2탄', theme: true, single: 4, boost: 1, pool: EXTRA.map(d => d.id), desc: '보석·날씨·탈것·악기만' },
    gradeC:   { name: 'C등급 팩 모음', theme: true, single: 5, boost: 1, grades: ['bronze'], desc: '전부 브론즈(C)' },
    gradeB:   { name: 'B등급 팩 모음', theme: true, single: 9, boost: 1, grades: ['silver'], desc: '전부 실버(B)' },
    gradeA:   { name: 'A등급 이상 팩 모음', theme: true, single: 30, boost: 1, grades: GOLD_UP, desc: '전부 골드(A) 이상' },
    contest:  { name: '대회팩', boost: 2, contest: true },
    special:  { name: '바자회 특수팩', single: [14, 22], boost: 2, specials: 1, bazaar: true, stock: 2, desc: '특수카드 1장 포함' },
    special2: { name: '바자회 프리미엄 특수팩', single: [45, 60], boost: 4, specials: 2, bazaar: true, stock: 1, unlock: 'pack_special2', desc: '특수카드 2장 포함' },
  };
  for (const t of TAGS) {
    PACKS['tag_' + t] = { name: t + ' 팩 모음', theme: true, single: 6, boost: 1, pool: NORMAL.filter(d => d.tag === t).map(d => d.id), desc: t + ' 카드만' };
  }
  // 특수 팩 가격 ≈ 시뮬레이션 기대 판매가의 30% (분류 팩은 분류 능력이 몰려 발동해 기대가가 큼)
  const THEME_PRICE = { series1: 14, series2: 12, gradeC: 14, gradeB: 15, gradeA: 42,
    tag_과일: 30, tag_행성: 67, tag_동물: 32, tag_무기: 26, tag_보석: 20, tag_날씨: 12, tag_탈것: 56, tag_악기: 18 };
  for (const k in THEME_PRICE) PACKS[k].single = THEME_PRICE[k];
  const THEME_PACKS = Object.keys(PACKS).filter(k => PACKS[k].theme);

  // 도감 지정카드 배열: 페이지당 3줄 × 4칸. 가로줄(4장)을 모두 채우면 전체 점수 ×1.1 (줄마다 곱)
  const ROWS = [
    { name: '과수원',       ids: ['apple', 'orange', 'grape', 'banana'] },
    { name: '여름날',       ids: ['melon', 'sun', 'rain', 'rainbow'] },
    { name: '태양계 안쪽',  ids: ['mercury', 'venus', 'earth', 'mars'] },
    { name: '우주 탐사',    ids: ['jupiter', 'rocket', 'plane', 'comet'] },
    { name: '반려동물',     ids: ['cat', 'dog', 'fox', 'panda'] },
    { name: '겨울 여행',    ids: ['snow', 'train', 'car', 'bike'] },
    { name: '기사의 무장',  ids: ['sword', 'bow', 'shield', 'axe'] },
    { name: '대장간',       ids: ['hammer', 'coin', 'gem', 'orb'] },
    { name: '보물 상자',    ids: ['ring', 'necklace', 'crown', 'trophy'] },
    { name: '밴드 공연',    ids: ['drum', 'guitar', 'piano', 'trumpet'] },
    { name: '축제의 밤',    ids: ['violin', 'tent', 'mask', 'balloon'] },
    { name: '폭풍의 바다',  ids: ['whale', 'storm', 'lamp', 'charm'] },
  ];
  const ROWS_PER_PAGE = 3;
  const DESIGNATED = ROWS.flatMap(r => r.ids);   // 지정카드 번호 순서 (No.001 ~ No.048)
  const FREE_SLOTS = 32;                          // 일반카드(임시) 칸
  const FREE_PER_PAGE = 8;
  const VAULT_MAX = 12;                           // 도감 팩보관함: 뜯지 않은 팩을 통째로 보관

  // 효과(mod) 키
  //  hi: 골드 이상 확률 +%   tagHi:{분류} 그 분류 카드 골드 이상 확률 +%   single: 낱개 보너스 +
  //  finish: 마감 확률 +%    wear: 마모 추가 굴림(좋은 쪽)   all: 모든 카드 가치 +%   tag:{분류} 분류 카드 가치 +%
  //  sell: 판매가 +%   bazaar: 바자회 프리미엄 +   disc: 팩 가격 -%   maxPacks: 하루 팩 +N
  //  quota: 할당량 -%   morning: 아침 +원   interest: 아침 이자 %

  // 1회용 아이템 (왼쪽 '아이템 상점', → 가방, [사용]으로 발동). packs = 다음 N팩, days = N일(오늘 포함), instant = 즉시
  const ITEMS = {
    lucky:    { name: '행운 부적',      price: 12, packs: 3, eff: { hi: 0.5 },      desc: '다음 3팩 골드 이상 확률 +50%' },
    glitter:  { name: '반짝이 스프레이', price: 12, packs: 2, eff: { finish: 2 },   desc: '다음 2팩 마감 확률 ×3 (해금된 마감만)' },
    sleeve:   { name: '카드 슬리브',    price: 10, packs: 3, eff: { wear: 1 },      desc: '다음 3팩 마모 2번 굴려 좋은 쪽' },
    promo:    { name: '판매 촉진',      price: 15, days: 2, eff: { sell: 0.2 },     desc: '2일간 판매가 ×1.2' },
    taxcut:   { name: '세금 감면',      price: 15, days: 1, eff: { quota: 0.2 },    desc: '오늘 할당량 -20%' },
    cart:     { name: '보조 장바구니',  price: 10, days: 1, eff: { maxPacks: 2 },   desc: '오늘 팩 구매 +2' },
    freepack: { name: '덤 기본팩',      price: 6, instant: 'freepack',              desc: '즉시 기본팩 1개 (하루 한도 무관)' },
    glove:    { name: '황금 장갑',      price: 15, packs: 1, eff: { hi: 2 },        desc: '다음 1팩 골드 이상 확률 +200%', unlock: 'item_glove' },
    tape:     { name: '포장 테이프',    price: 14, packs: 5, eff: { wear: 2 },      desc: '다음 5팩 마모 3번 굴려 좋은 쪽', bazaarOnly: true },
    magnet:   { name: '희귀 자석',      price: 20, packs: 2, eff: { hi: 1 },        desc: '다음 2팩 골드 이상 확률 +100%', bazaarOnly: true },
  };

  // 업그레이드 (오른쪽 '업그레이드 상점', 바자회에서만 구매)
  //  kind: perm = 진열장 영구 아이템 / unlock = 이번 판 해금 / luck = 분류별 상위 등급 확률 (Lv1~3) / shelf = 진열장 칸 +1
  const UPGRADES = {
    fin_sparkle:  { name: '반짝이 배경 해금',   kind: 'unlock', price: 25, desc: '이번 판에서 반짝이 배경(×2) 카드가 나오기 시작' },
    fin_fullholo: { name: '전체 홀로그램 해금', kind: 'unlock', price: 45, req: 'fin_sparkle', desc: '전체 홀로그램(×5) 카드 등장' },
    fin_black:    { name: '블랙 해금',          kind: 'unlock', price: 80, req: 'fin_fullholo', desc: '블랙(×12) 카드 등장' },
    halo:         { name: '후광 해금',          kind: 'unlock', price: 60, desc: '이벤트 카드(후광, 한 판에 각 1장) 등장' },
    loupe:     { name: '감정사 돋보기', kind: 'perm', price: 40, eff: { wear: 1 },    desc: '마모 2번 굴려 좋은 쪽' },
    polish:    { name: '광택제',       kind: 'perm', price: 40, eff: { finish: 0.5 }, desc: '마감 확률 +50% (해금된 마감만)' },
    clover:    { name: '네잎클로버',   kind: 'perm', price: 45, eff: { hi: 0.25 },    desc: '골드 이상 확률 +25%' },
    solo:      { name: '낱개 전문가',  kind: 'perm', price: 30, eff: { single: 0.2 }, desc: '낱개 보너스 ×1.1 → ×1.3' },
    regular:   { name: '단골 카드',    kind: 'perm', price: 30, eff: { disc: 0.15 },  desc: '팩 가격 -15%' },
    piggy:     { name: '저금통',       kind: 'perm', price: 35, eff: { interest: 0.05 }, desc: '아침 이자 5% (최대 ' + INTEREST_CAP + ')' },
    haggle:    { name: '흥정 수완',    kind: 'perm', price: 30, eff: { bazaar: 0.3 }, desc: '바자회 프리미엄 +0.3' },
    bigcart:   { name: '큰 장바구니',  kind: 'perm', price: 60, eff: { maxPacks: 1 }, desc: '하루 팩 구매 +1' },
    appraisal: { name: '감정서',       kind: 'perm', price: 40, eff: { all: 0.1 },    desc: '모든 카드 가치 +10%', unlock: 'item_appraisal' },
    shelf:     { name: '진열장 확장',  kind: 'shelf', price: 35, desc: '진열장 칸 +1 (최대 ' + SHOWCASE_MAX + ')' },
  };
  const LUCK_MAX = 3, LUCK_STEP = 0.5;
  const luckPrice = lv => 20 * (lv + 1); // 다음 레벨 가격 (Lv0→1: 20, 1→2: 40, 2→3: 60)
  for (const t of TAGS) {
    UPGRADES['luck_' + t] = { name: t + ' 행운', kind: 'luck', tag: t, desc: t + ' 카드의 골드 이상 확률 +' + LUCK_STEP * 100 + '% (레벨당, 최대 Lv' + LUCK_MAX + ')' };
  }

  const UNLOCKS = [
    { id: 'pack_advanced', name: '고급팩 상시 등장', cond: '5일 생존', check: m => m.bestDays >= 5 },
    { id: 'item_glove', name: '아이템: 황금 장갑', cond: '첫 대회 통과', check: m => m.bestDays >= 7 },
    { id: 'pack_premium', name: '프리미엄팩 상시 등장', cond: '10일 생존', check: m => m.bestDays >= 10 },
    { id: 'item_appraisal', name: '업그레이드: 감정서', cond: '앨범 수집률 30%', check: m => m.albumRate >= 0.3 },
    { id: 'pack_special2', name: '바자회: 프리미엄 특수팩', cond: '앨범 수집률 60%', check: m => m.albumRate >= 0.6 },
  ];

  const NPC_NAMES = ['김씨', '박 할머니', '떠돌이 J', '최 사장', '수상한 남자', '꼬마 민지', '노점상 이씨', '고물상 한씨'];
  const NPC_TYPES = ['collector', 'peddler', 'trader']; // 수집가(도감 카드 매입) / 행상인(카드 판매) / 교환상(2장 → 상위 1장)

  const D = {
    C, PACK_SIZE, START_MONEY, MAX_PACKS, SHOWCASE_BASE, SHOWCASE_MAX, BAG_MAX, SINGLE_BONUS, ROW_MULT, EVENT_CHANCE, INTEREST_CAP,
    QUOTA_CAP_DISCOUNT, WEEK, BAZAAR_DAYS, TOURNEY_DAY, dayOfWeek, weekOf, quota, TOURNEY, GRADE_P, FINISH_P, BAZAAR_PREMIUM,
    NORMAL, SPECIALS, EVENTS, DEFS, TAGS, GOLD_UP, PACKS, THEME_PACKS, ROWS, ROWS_PER_PAGE, DESIGNATED, FREE_SLOTS, FREE_PER_PAGE, VAULT_MAX,
    ITEMS, UPGRADES, LUCK_MAX, LUCK_STEP, luckPrice, UNLOCKS, NPC_NAMES, NPC_TYPES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = D;
  else root.CPData = D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
