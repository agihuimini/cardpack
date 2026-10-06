// cardpack — 카드 데이터·가격 계산 공용 모듈 (demo/unpack.html에서 분리)
// 브라우저에서는 일반 <script>로 읽어 전역으로 쓰고, Node(시뮬레이션)에서는 require로 쓴다.
// ---------- data ----------
// ap = 덧셈 능력 배수, mp = 배율 능력 강화 (×m → ×(1 + (m-1)×mp)). 등급이 높을수록 능력이 강해짐
const R = [
  {id:'common', name:'일반',     mark:'',       base:1,   p:40,  tier:0, ap:1,  mp:1},
  {id:'bronze', name:'브론즈',   mark:'C',      base:2,   p:25,  tier:0, ap:1.5,mp:1.2},
  {id:'silver', name:'실버',     mark:'B',      base:3,   p:17,  tier:0, ap:2,  mp:1.4},
  {id:'gold',   name:'골드',     mark:'A',      base:6,   p:10,  tier:1, ap:3,  mp:1.6},
  {id:'plat',   name:'플래티넘', mark:'P',      base:12,  p:4.5, tier:1, ap:5,  mp:2},
  {id:'diamond',name:'다이아',   mark:'◆',      base:25,  p:2,   tier:2, ap:8,  mp:2.4},
  {id:'rare',   name:'레어',     mark:'✪',      base:50,  p:1,   tier:2, ap:12, mp:3},
  {id:'epic',   name:'에픽',     mark:'Epic',   base:100, p:.4,  tier:3, ap:20, mp:4},
  {id:'legend', name:'레전드',   mark:'Legend', base:250, p:.1,  tier:3, ap:35, mp:6},
  {id:'event',  name:'이벤트',   mark:'?',      base:1000,p:0,   tier:4, ap:20, mp:8},
];
const F = [
  {id:'base',    name:'기본',          mult:1,  p:85},
  {id:'sparkle', name:'반짝이 배경',   mult:2,  p:10},
  {id:'fullholo',name:'전체 홀로그램', mult:5,  p:4},
  {id:'black',   name:'블랙',          mult:12, p:1},
];
const W = [ // grade, name, short, mult, p
  [10,'Factory New','FN',2,2],[9,'Mint','MT',1.5,5],[8,'Near Mint','NM',1.2,10],[7,'Excellent','EX',1,15],[6,'Good','GD',.9,18],
  [5,'Fine','FI',.8,18],[4,'Played','PL',.65,14],[3,'Worn','WN',.5,10],[2,'Damaged','DM',.35,6],[1,'Shattered','SH',.2,2],
].map(([g,name,short,mult,p])=>({g,name,short,mult,p}));
// 능력 종류 (팩 안에서만 발동, 공개된 카드끼리만 적용)
//  adjAdd/adjMul: 좌우 인접 카드 +N / ×N      tagAll: 같은 분류 카드 전부 +N (자신 포함)
//  tagMult: 같은 분류 N장 이상이면 그 분류 ×N  sameRarity: 같은 등급의 다른 카드 +N
//  dupe: 같은 카드가 더 있으면 1장당 자신 +N   perTag: 다른 같은 분류 카드 1장당 자신 +N
//  lowAdd: 일반·브론즈 카드 전부 +N            highMul: 골드 이상 카드 전부 ×N     allAdd: 모든 카드 +N
const POOL = [
  {id:'apple',  name:'사과',   art:'🍎', tag:'과일', ab:{t:'tagAll',tag:'과일',add:1}},
  {id:'orange', name:'귤',     art:'🍊', tag:'과일', ab:{t:'adjAdd',add:1}},
  {id:'grape',  name:'포도',   art:'🍇', tag:'과일', ab:{t:'dupe',add:2}},
  {id:'banana', name:'바나나', art:'🍌', tag:'과일', ab:{t:'perTag',tag:'과일',add:1}},
  {id:'melon',  name:'수박',   art:'🍉', tag:'과일', ab:{t:'tagMult',tag:'과일',need:3,mult:1.5}},
  {id:'mercury',name:'수성',   art:'🌑', tag:'행성', ab:{t:'adjMul',mult:1.2}},
  {id:'venus',  name:'금성',   art:'🟠', tag:'행성', ab:{t:'sameRarity',add:2}},
  {id:'earth',  name:'지구',   art:'🌍', tag:'행성', ab:{t:'tagAll',tag:'행성',add:2}},
  {id:'mars',   name:'화성',   art:'🔴', tag:'행성', ab:{t:'adjAdd',add:2}},
  {id:'jupiter',name:'목성',   art:'🪐', tag:'행성', ab:{t:'tagMult',tag:'행성',need:3,mult:2}},
  {id:'cat',    name:'고양이', art:'🐱', tag:'동물', ab:{t:'dupe',add:2}},
  {id:'dog',    name:'강아지', art:'🐶', tag:'동물', ab:{t:'tagAll',tag:'동물',add:1}},
  {id:'fox',    name:'여우',   art:'🦊', tag:'동물', ab:{t:'adjMul',mult:1.5}},
  {id:'panda',  name:'판다',   art:'🐼', tag:'동물', ab:{t:'lowAdd',add:1}},
  {id:'whale',  name:'고래',   art:'🐋', tag:'동물', ab:{t:'tagMult',tag:'동물',need:3,mult:1.5}},
  {id:'sword',  name:'검',     art:'🗡️', tag:'무기', ab:{t:'adjAdd',add:3}},
  {id:'bow',    name:'활',     art:'🏹', tag:'무기', ab:{t:'perTag',tag:'무기',add:2}},
  {id:'shield', name:'방패',   art:'🛡️', tag:'무기', ab:{t:'sameRarity',add:1}},
  {id:'axe',    name:'도끼',   art:'🪓', tag:'무기', ab:{t:'highMul',mult:1.3}},
  {id:'hammer', name:'망치',   art:'🔨', tag:'무기', ab:{t:'tagAll',tag:'무기',add:2}},
];
const EVENT_DEF = {id:'crown', name:'황금 왕관', art:'👑', tag:'이벤트', ab:{t:'allAdd',add:5}};
// ---------- helpers ----------
const $ = s => document.querySelector(s);
const r1 = n => Math.round(n * 10) / 10;
const fmt = n => (Number.isInteger(n) ? n : n.toFixed(1)) + '원';
function pick(list, weight = x => x.p) {
  const total = list.reduce((s, x) => s + weight(x), 0);
  let r = Math.random() * total;
  for (const x of list) { r -= weight(x); if (r <= 0) return x; }
  return list[list.length - 1];
}
// 카드 등급에 맞게 강화된 실제 능력
function abOf(c) {
  const a = c.def.ab; if (!a) return null;
  const o = {...a};
  if (a.add) o.add = Math.ceil(a.add * c.r.ap);
  if (a.mult) o.mult = r1(1 + (a.mult - 1) * c.r.mp);
  return o;
}
function abText(ab) {
  if (!ab) return '능력 없음';
  if (ab.t === 'adjAdd') return `좌우 인접 카드 +${ab.add}원`;
  if (ab.t === 'adjMul') return `좌우 인접 카드 ×${ab.mult}`;
  if (ab.t === 'tagAll') return `팩 내 ${ab.tag} 카드 전부 +${ab.add}원`;
  if (ab.t === 'tagMult') return `팩 내 ${ab.tag} ${ab.need}장 이상이면 ${ab.tag} 카드 ×${ab.mult}`;
  if (ab.t === 'sameRarity') return `같은 등급의 다른 카드 +${ab.add}원`;
  if (ab.t === 'dupe') return `같은 카드가 더 있으면 1장당 +${ab.add}원`;
  if (ab.t === 'perTag') return `다른 ${ab.tag} 카드 1장당 +${ab.add}원`;
  if (ab.t === 'lowAdd') return `일반·브론즈 카드 전부 +${ab.add}원`;
  if (ab.t === 'highMul') return `골드 이상 카드 전부 ×${ab.mult}`;
  if (ab.t === 'allAdd') return `팩 내 모든 카드 +${ab.add}원`;
}
// ---------- pricing ----------
// 공개된 카드들 사이의 능력 기여 목록. 가격 = (기본가 + Σ덧셈) × Π배율 (발라트로식: 덧셈 먼저, 배율 나중)
// 9장이 모두 공개된 시점의 결과가 확정 가격이 됨
const baseOf = c => r1(c.r.base * c.f.mult * c.w.mult * (c.bm || 1)); // bm: 본 게임의 태그 가치 보정 (데모는 없음 = 1)
function contributions(list, open) {
  const out = [];
  const idx = list.map((c, i) => i).filter(i => open[i]);
  const push = (s, t, kind, val) => { if (val && !(kind === 'mul' && val === 1)) out.push({s, t, kind, val, key: `${s}>${t}:${kind}`}); };
  for (const s of idx) {
    const a = abOf(list[s]); if (!a) continue;
    const src = list[s];
    if (a.t === 'adjAdd' || a.t === 'adjMul') [s - 1, s + 1].filter(t => open[t]).forEach(t => a.t === 'adjAdd' ? push(s, t, 'add', a.add) : push(s, t, 'mul', a.mult));
    if (a.t === 'tagAll') idx.filter(t => list[t].def.tag === a.tag).forEach(t => push(s, t, 'add', a.add));
    if (a.t === 'tagMult') { const g = idx.filter(t => list[t].def.tag === a.tag); if (g.length >= a.need) g.forEach(t => push(s, t, 'mul', a.mult)); }
    if (a.t === 'sameRarity') idx.filter(t => t !== s && list[t].r.id === src.r.id).forEach(t => push(s, t, 'add', a.add));
    if (a.t === 'dupe') push(s, s, 'add', a.add * idx.filter(t => t !== s && list[t].def.id === src.def.id).length);
    if (a.t === 'perTag') push(s, s, 'add', a.add * idx.filter(t => t !== s && list[t].def.tag === a.tag).length);
    if (a.t === 'lowAdd') idx.filter(t => list[t].r.tier === 0 && ['common','bronze'].includes(list[t].r.id)).forEach(t => push(s, t, 'add', a.add));
    if (a.t === 'highMul') idx.filter(t => list[t].r.tier >= 1).forEach(t => push(s, t, 'mul', a.mult));
    if (a.t === 'allAdd') idx.forEach(t => push(s, t, 'add', a.add));
  }
  return out;
}
function applyPrices(list, contribs) {
  list.forEach(c => { c.base = baseOf(c); c.add = 0; c.mul = 1; c.notes = []; });
  for (const k of contribs) {
    const c = list[k.t];
    if (k.kind === 'add') c.add += k.val; else c.mul *= k.val;
    c.notes.push(`${list[k.s].def.name} ${k.kind === 'add' ? '+' + k.val : '×' + k.val}`);
  }
  list.forEach(c => c.price = r1((c.base + c.add) * c.mul));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { R, F, W, POOL, EVENT_DEF, r1, fmt, pick, abOf, abText, baseOf, contributions, applyPrices };
}
