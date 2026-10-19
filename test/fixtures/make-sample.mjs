// 시험용 가짜 묶음(꼴 1, docs/bundle-v1.md) 만들기 — 매물·가격·동네는 모두 지어낸 것(판매자 정보 없음).
//   node test/fixtures/make-sample.mjs  →  test/fixtures/radar-bundle.sample.json, radar-bundle.v99.json
// 만든 때(made)는 2026-10-19 14:32(한국)로 고정 — 시험은 브라우저 시계를 이 둘레로 맞춰요.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const MADE = Date.UTC(2026, 9, 19, 5, 32, 0);
const M = 60e3, H = 3600e3, D = 24 * H;
const at = (ms) => MADE - ms;
const url = (m, id) => (m === 'j' ? `https://web.joongna.com/product/${id}` : m === 'd' ? `https://www.daangn.com/kr/buy-sell/x-${id}/` : `https://m.bunjang.co.kr/products/${id}`);
const P = (name, km, rough, near, level = 'dong') => ({ name, near, km, rough, level, unknown: false });
const UNK = { name: null, near: null, km: null, rough: false, level: null, unknown: true };

let n = 1000;
function L(m, title, price, grade, place, o = {}) {
  const id = String(n++);
  return {
    key: `${m}:${id}`, m, title, price, url: url(m, id), thumb: null, status: 'selling',
    firstSeen: at(o.seen ?? 2 * H), updated: at(o.up ?? 2 * H),
    grade, variant: o.variant ?? null, unopened: !!o.unopened, dups: o.dups ?? 0, news: o.news ?? null, star: !!o.star,
    place: place ?? UNK,
  };
}
const g = (k, d, why) => ({ k, d, why });

const l4080 = [
  L('b', 'RTX 4080 SUPER 미개봉 새제품 급처합니다', 790000, g('caution', -43, '미개봉·새제품인데 시세보다 43% 싸요 — 미끼·사기 글이 아닌지 확인해 주세요'), UNK, { seen: 40 * M, up: 40 * M, variant: 'SUPER', unopened: true }),
  L('j', '4080 슈퍼 팝니다 카톡으로 연락주세요', 850000, g('caution', -39, '외부 메신저로 연락하래요'), P('은행동', 4.1, true, false), { seen: 3 * H, up: 1 * H, variant: 'SUPER' }),
  L('j', '기가바이트 RTX 4080 윈드포스 V2 16G', 980000, g('honey', -18, '시세 120만(판매완료) 대비 -18%'), P('정왕동', 2.3, true, true), { seen: 2 * H, up: 2 * H, news: '2번 내림' }),
  L('d', 'MSI 지포스 RTX 4080 벤투스 3X 16GB', 1010000, g('honey', -15, '시세 120만(판매완료) 대비 -15%'), P('배곧동', 1.2, false, true), { seen: 5 * H, up: 5 * H }),
  L('b', 'RTX 4080 이엠텍 미라클 화이트 팝니다', 1080000, g('good', -10, '시세 120만(판매완료) 대비 -10%'), UNK, { seen: 26 * H, up: 3 * H, news: '끌올 3번' }),
  L('j', 'ASUS TUF RTX 4080 OC 풀박스 상태 좋아요', 1120000, g('good', -6, '시세 120만(판매완료) 대비 -6%'), UNK, { seen: 2 * D, up: 26 * H }),
  L('d', '조텍 4080 트리니티 OC 직거래만', 1150000, g('good', -4, '시세 120만(판매완료) 대비 -4%'), P('정왕동', 0.8, false, true), { seen: 26 * H, up: 26 * H }),
  L('j', 'RTX 4080 SUPER 게이밍 OC 16G 풀박스', 1210000, g('good', -13, '시세 140만(판매완료) 대비 -13%'), P('상동', 12, true, false), { seen: 3 * D, up: 26 * H, star: true, news: '2번 내림', variant: 'SUPER' }),
  L('b', '갤럭시 RTX 4080 SUPER EX 게이머 화이트', 1260000, g('good', -10, '시세 140만(판매완료) 대비 -10%'), UNK, { seen: 2 * D, up: 2 * D, variant: 'SUPER' }),
  L('j', '4080 슈퍼 프로아트 OC 화이트 박스 있음', 1290000, g('good', -7, '시세 140만(판매완료) 대비 -7%'), P('대야동', 5.6, true, false), { seen: 4 * D, up: 26 * H, dups: 2, variant: 'SUPER' }),
  L('j', 'RTX 4080 수냉 커스텀 PC에서 분리했어요', 1350000, g('normal', 12, '시세 120만(판매완료) 대비 +12%'), P('시흥시', null, false, false, 'sgg'), { seen: 5 * D, up: 5 * D }),
  L('b', 'RTX 4080 SUPER ROG STRIX 화이트 미개봉', 1580000, g('normal', 12, '시세 140만(판매완료) 대비 +12%'), UNK, { seen: 6 * D, up: 2 * D, variant: 'SUPER', unopened: true }),
  L('d', 'ROG 스트릭스 4080 OC 화이트 에디션', 1690000, g('normal', 40, '시세 120만(판매완료) 대비 +40%'), P('월곶동', 1.9, false, true), { seen: 7 * D, up: 4 * D }),
];
const l5080 = [
  L('j', '5080 교환 원해요 4090이랑', 760000, g('caution', -53, '시세의 절반도 안 돼요 — 미끼·사기·다른 물건일 수 있어요'), P('정왕동', 2.3, true, true), { seen: 1 * H, up: 1 * H }),
  L('b', 'RTX 5080 미개봉 새상품 급처 (선입금)', 900000, g('caution', -45, '선입금·계약금 이야기가 있어요'), UNK, { seen: 55 * M, up: 55 * M, unopened: true }),
  L('j', 'RTX 5080 새제품 미개봉 택포', 1050000, g('caution', -36, '미개봉·새제품인데 시세보다 36% 싸요 — 미끼·사기 글이 아닌지 확인해 주세요'), UNK, { seen: 4 * H, up: 4 * H, unopened: true }),
];
const lps5 = [
  L('b', '플레이스테이션5 슬림 디지털 + 듀얼센스', 460000, null, UNK, { seen: 3 * H, up: 3 * H }),
  L('j', '플스5 디스크에디션 1218A 풀박스', 520000, null, P('정왕동', 2.3, true, true), { seen: 26 * H, up: 26 * H }),
  L('d', 'PS5 프로 2TB 미개봉', 890000, null, P('장곡동', 3.4, false, true), { seen: 2 * D, up: 26 * H }),
];
const l9070 = [
  L('j', 'RX 9070 XT 니트로+ 16G', 780000, g('unknown', null, '시세를 낼 매물이 아직 적어요(5건 미만)'), UNK, { seen: 1 * H, up: 1 * H }),
  L('d', '사파이어 9070XT 퓨어 화이트', 820000, g('unknown', null, '시세를 낼 매물이 아직 적어요(5건 미만)'), P('능곡동', 2.7, false, true), { seen: 26 * H, up: 26 * H }),
  L('b', '파워컬러 9070 XT 레드데빌', 850000, g('unknown', null, '시세를 낼 매물이 아직 적어요(5건 미만)'), UNK, { seen: 2 * D, up: 2 * D }),
];
// 변형: 앱 Variants.of 처럼 변형을 가르는 검색은 모든 매물에 이름 — 이름 없는 매물(기본)은 '기본'(앱 묶음 꼴 그대로)
for (const l of [...l4080, ...l5080]) if (l.variant == null) l.variant = '기본';
lps5[0].variant = '슬림 디지털'; lps5[1].variant = '기본'; lps5[2].variant = '프로';
for (const l of l9070) l.variant = 'XT';
// 같은 글 묶음(앱 dupRows): 9070 첫 줄은 번개장터에도 같은 제목·값 — 웹이 칩으로 거른 뒤 다시 묶어요(앱 Pipeline.chipRows, QA-1)
l9070[0].dups = 1;
l9070[0].dupRows = [{ ...l9070[0], key: 'b:1999', m: 'b', url: url('b', '1999'), dups: 0, dupRows: undefined, firstSeen: at(5 * H), updated: at(5 * H) }];
delete l9070[0].dupRows[0].dupRows;
const spark = [112, 111, null, 109, 108, 108, 106, 104, 103, 99, 95, 97, 99, 101, 103, 104, 104, 103, 102, null, 97, 101, 102, 101, 101, 100, 100, 99, 99, 98].map((v) => (v == null ? null : v * 10000));

const products = [
  {
    id: 's_4080', name: 'RTX 4080', state: 'ok', pct: 15, honey: 2, caution: 2, focus: true, checkedAt: at(3 * M), count: l4080.length,
    lowKey: l4080[2].key, change: { dir: 'down', text: '▼ 3만' },
    facts: [{ t: '시세 120만 · 판매완료 기준 18건' }, { t: '9일 만에 최저' }, { t: '목표가 이하', icon: 'target' }],
    cautionCard: '⚠ 더 싸 보이는 확인 필요 매물 2건(79만~)은 최저가에서 뺐어요',
    cautionPage: "⚠ 더 싸 보이는 확인 필요 매물 2건은 '지금 최저가'에서 뺐어요(아래 목록에 있어요)",
    cautionKey: l4080[0].key,
    spark, min30: '30일 최저 95만',
    marketLows: { j: 980000, d: 1010000, b: 1080000 }, variantLows: [['기본', 980000], ['SUPER', 1210000]],
    nearText: '가까운 당근 최저 101만 · 택배 최저 98만(중고나라)',
    cut: { head: '꿀매 기준 -15% · 변형마다 따로', rows: [{ name: 'SUPER', text: '시세 140만(판매완료 23건) → 119만 원 이하' }, { name: '기본', text: '시세 120만(판매완료 18건) → 102만 원 이하' }, { name: 'Ti', text: '매물이 적어 판정 보류', hold: true }] },
    ledger: ['시세 -10% 아래 매물 12건 중 8건이 하루 안에 안 보이게 됐어요(팔렸는지는 몰라요)', '이 물건은 중고나라가 보통(중간값) 4% 싸요(최근 30일)'],
    conds: ['그래픽카드', '30일', '빼기: 본체 · 노트북 · 완본체', '변형: 전부', '목표가 105만'],
    listings: l4080,
  },
  {
    id: 's_5080', name: 'RTX 5080', state: 'allCaution', pct: 15, honey: 0, caution: 3, checkedAt: at(3 * M), count: l5080.length,
    stateCard: '믿을 만한 매물이 아직 없어요 · ⚠ 3건', statePage: '믿을 만한 매물이 아직 없어요 · ⚠ 확인 필요 3건(아래 목록에 있어요)',
    cut: { single: ['시세 165만 · 판매완료 기준 14건', '꿀매 기준 -15% → 140만 2천 원 이하'] },
    conds: ['그래픽카드', '30일', '빼기: 본체 · 노트북 · 완본체'], listings: l5080,
  },
  {
    id: 's_ps5', name: '플레이스테이션 5', state: 'rebase', pct: 15, honey: 0, caution: 0, checkedAt: at(1 * M), count: lps5.length,
    stateCard: '새 조건으로 시세를 다시 내는 중 — 끝나면 지금 최저가·꿀매 판정을 다시 보여 드려요',
    statePage: '새 조건으로 시세를 다시 내는 중 — 끝나면 지금 최저가·꿀매 판정을 다시 보여 드려요',
    cut: { rebase: '새 조건으로 시세를 다시 내는 중' },
    conds: ['게임기', '30일', '35만 이상', '빼기: 타이어 · 미쉐린 · 미세린 · m.2 · nvme · 글래스 · 게임패드 · 조이스틱 · 레이싱휠 · vr2 · 리모트플레이어'],
    listings: lps5,
  },
  {
    id: 's_9070', name: 'RX 9070 XT', state: 'unknown', pct: 15, honey: 0, caution: 0, checkedAt: at(3 * M), count: l9070.length,
    lowKey: l9070[0].key, facts: [{ t: '시세를 낼 매물이 아직 적어요' }],
    marketLows: { j: 780000, d: 820000, b: 850000 },
    cut: { single: ['시세를 낼 매물이 아직 적어요'] }, conds: ['그래픽카드', '30일'], listings: l9070,
  },
  {
    id: 's_5070', name: 'RTX 5070', state: 'empty', pct: 20, honey: 0, caution: 0, checkedAt: at(3 * M), count: 0,
    stateCard: '조건에 맞는 매물이 없어요', statePage: '조건에 맞는 매물이 없어요.',
    cut: { single: ['시세 72만 · 판매완료 기준 9건', '꿀매 기준 -20% → 57만 6천 원 이하'] }, conds: ['그래픽카드', '30일', '60만 이하'], listings: [],
  },
  {
    id: 's_new', name: '아이패드 미니 7', state: 'pending', pct: 15, honey: 0, caution: 0, checkedAt: 0, count: 0,
    stateCard: '곧 세 마켓을 확인해요', statePage: '곧 세 마켓을 확인해요', cut: { single: ['시세를 낼 매물이 아직 적어요'] }, conds: ['태블릿'], listings: [],
  },
];

// 최근 7일 올림: 15분마다, 그 사이 두 번 비움(10/18 02:10~07:40, 10/17 23:55~10/18 00:50 한국)
const uploads = [];
const kst = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h - 9, mi);
for (let t = MADE - 7 * D + 30 * M; t <= MADE; t += 15 * M) {
  const off1 = t > kst(2026, 10, 18, 2, 10) && t < kst(2026, 10, 18, 7, 40);
  const off2 = t > kst(2026, 10, 17, 23, 55) && t < kst(2026, 10, 18, 0, 50);
  if (!off1 && !off2) uploads.push(t);
}
for (const t of [kst(2026, 10, 18, 2, 10), kst(2026, 10, 18, 7, 40), kst(2026, 10, 17, 23, 55), kst(2026, 10, 18, 0, 50)]) uploads.push(t);
uploads.sort((a, b) => a - b);
const keep = [...new Set(uploads)].filter((t) => t <= MADE);
if (keep[keep.length - 1] !== MADE) keep.push(MADE);

const bundle = {
  v: 1, kind: 'junggo-radar-view', made: MADE, app: '0.7.1', device: '내 안드로이드',
  uploads: keep, everyMin: 15, watchLabel: '보통 · 와이파이 15분마다', notifOn: true, stall: null, errors: 0, base: '정왕동',
  markets: [
    { m: 'j', okAt: at(4 * M), text: '이상 없어요', bad: false },
    { m: 'd', okAt: at(43 * M), text: '이상 없어요', bad: false },
    { m: 'b', okAt: at(4 * M), text: '이상 없어요', bad: false },
  ],
  products,
  feed: [
    { pid: 's_4080', key: l4080[2].key, at: at(2 * H), fresh: true },
    { pid: 's_4080', key: l4080[3].key, at: at(5 * H), fresh: false },
  ],
  watches: [
    { pid: 's_4080', listing: l4080[7], since: '지켜본 뒤 -4만', sinceDir: 'down', diff: '같은 물건 최저보다 +23만', ended: false },
    { pid: 's_ps5', listing: L('j', 'PS5 디스크 에디션 + 게임 3개', 550000, null, P('은행동', 4.1, true, false), { seen: 7 * D, up: 3 * D }), since: '지켜본 뒤 변동 없음', sinceDir: null, diff: '', ended: true },
  ],
  inbox: [
    { t: at(2 * H), kind: 'honey', level: 'urgent', title: '꿀매 · RTX 4080', text: '기가바이트 RTX 4080 윈드포스 V2 16G · 980,000원 · 시세 120만(판매완료) 대비 -18%', pid: 's_4080', url: l4080[2].url, delivered: true, inApp: false, hidden: false },
    { t: at(2 * H + M), kind: 'target', level: 'urgent', title: '목표가 이하 · RTX 4080', text: '기가바이트 RTX 4080 윈드포스 V2 16G · 98만 — 목표 105만', pid: 's_4080', url: l4080[2].url, delivered: true, inApp: true, hidden: false },
    { t: at(55 * M), kind: 'caution', level: 'digest', title: '확인 필요 · RTX 5080', text: 'RTX 5080 미개봉 새상품 급처 (선입금) · 900,000원 · 선입금·계약금 이야기가 있어요', pid: 's_5080', url: l5080[1].url, delivered: false, inApp: false, hidden: false },
    { t: at(5 * H), kind: 'drop', level: 'normal', title: '가격 인하 · RTX 4080', text: 'RTX 4080 SUPER 게이밍 OC 16G 풀박스 · 125만 → 121만', pid: 's_4080', url: l4080[7].url, delivered: true, inApp: false, hidden: false },
    { t: at(6 * H), kind: 'digest', level: 'normal', title: '하루 요약(아침)', text: '꿀매 1건 · 최저가 갱신 2건 · 확인 필요 3건', pid: null, url: null, delivered: true, inApp: false, hidden: false },
    { t: at(12 * H), kind: 'lowest', level: 'normal', title: '최저가 갱신 · RTX 4080', text: '101만 → 98만 · 9일 만에 최저', pid: 's_4080', url: null, delivered: false, inApp: false, hidden: false },
    { t: at(26 * H), kind: 'system', level: 'normal', title: '옛 물건 조건을 새 기준으로 바꿨어요(본체·노트북 빼기)', text: '조건 창에서 다시 지울 수 있어요', pid: null, url: null, delivered: true, inApp: false, hidden: false },
    { t: at(27 * H), kind: 'new', level: 'digest', title: '새 매물 · RX 9070 XT', text: '사파이어 9070XT 퓨어 화이트 · 820,000원', pid: 's_9070', url: l9070[1].url, delivered: false, inApp: false, hidden: false },
  ],
  recent: ['갤럭시 탭 s9', '닌텐도 스위치 2'],
};
// 묶음 꼴: 알림은 최근 것 먼저(앱 알림함 순서)
bundle.inbox.sort((a, b) => b.t - a.t);

export function sample() { return JSON.parse(JSON.stringify(bundle)); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(DIR, 'radar-bundle.sample.json'), JSON.stringify(bundle, null, 1) + '\n');
  fs.writeFileSync(path.join(DIR, 'radar-bundle.v99.json'), JSON.stringify({ ...bundle, v: 99 }) + '\n');
  console.log('ok', bundle.products.length, 'products', keep.length, 'uploads');
}
