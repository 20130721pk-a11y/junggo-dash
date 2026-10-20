// 웹 조작 1판 시험 묶음 = 웹 2판 시험 묶음(make-sample.mjs) + 꼴 1 더하기 칸(docs/bundle-v1.md 맨 아래).
//   node test/fixtures/make-control.mjs  →  test/fixtures/radar-bundle.control.json
// 매물·가격·동네는 모두 지어낸 것. 칸 꼴은 앱 담당이 실을 꼴의 '안' — 앱 → 웹 자료(app-cmds.json)가 오면 그걸로 같이 시험해요.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sample, MADE } from './make-sample.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const M = 60e3, H = 3600e3;
const at = (ms) => MADE - ms;

export function control() {
  const b = sample();
  b.app = '0.7.3';
  b.platform = 'android';
  b.cmds = [];
  b.cmdLock = null;
  b.cards = [
    { id: 'gpu:4080', title: 'RTX 4080', sub: '그래픽카드 · 완본체·노트북 빼고 · 변형(SUPER·Ti·XT) 따로', keyword: '4080', category: 'pc' },
    { id: 'gpu:5070', title: 'RTX 5070', sub: '그래픽카드 · 완본체·노트북 빼고 · 변형(SUPER·Ti·XT) 따로', keyword: '5070', category: 'pc' },
    { id: 'gpu:5080', title: 'RTX 5080', sub: '그래픽카드 · 완본체·노트북 빼고 · 변형(SUPER·Ti·XT) 따로', keyword: '5080', category: 'pc' },
    { id: 'gpu:9070', title: 'RX 9070', sub: '그래픽카드 · 완본체·노트북 빼고 · 변형(SUPER·Ti·XT) 따로', keyword: '9070', category: 'pc' },
    { id: 'console:ps5', title: '플레이스테이션 5', sub: '게임기 · 게임·주변기기는 가격대로 빼고 · 기본·디지털·슬림·프로 따로', keyword: '플스5', category: 'game' },
  ];
  b.prefs = { defaultPct: 15, autoWatchN: 2, intensity: 'normal', quiet: { on: true, start: 1, end: 7 }, digestOn: true, daangnHome: '정왕동', distanceBase: '정왕동' };
  b.intensityText = { save: '와이파이 30분·데이터 1시간마다 확인해요. 여러 쪽까지 보는 확인은 2시간·6시간마다.', normal: '와이파이 15분·데이터 30분마다 확인해요. 여러 쪽까지 보는 확인은 1시간·3시간마다.' };
  b.focusPlan = { ids: ['s_4080'], until: MADE + 68 * M, everyMin: 5 };
  b.notifLine = '알림이 켜져 있어요';
  b.battery = { exempt: true, lastBgAt: at(12 * M), text: '와이파이 15분·데이터 30분마다' };
  b.daangn = { hour: 23, day: 410, hourMax: 150, dayMax: 3000, restUntil: null };
  b.quota = { adhoc: { used: 2, limit: 6, times: [at(40 * M), at(20 * M)] }, checkAllAt: null };
  b.homeQueue = null;
  b.misfits = 12;
  b.metrics = ["꿀매 정밀도 92% ('이 매물 아님'이 안 눌린 꿀매 알림)", '알림 지연 중간 6분 (올라온 때 → 알림)'];
  b.recent = ['4080 super', '에어팟 프로2', '플스5 디지털'];

  const p4080 = b.products.find((p) => p.id === 's_4080');
  p4080.cfg = { keyword: '4080', thresholdPct: 15, targetPrice: 1050000, variantPick: '', matchMode: 'title', category: 'pc', excludeWords: ['본체', '컴퓨터', '데스크탑', 'pc', '노트북', '랩탑'], includeWords: [],
    bandMin: 850000, bandMax: null, basicFilter: true, hiddenCount: 2, priceMin: null, priceMax: null, regionWords: [], maxKm: null, maxAgeDays: null, lowestAlert: true, confirmed: true, label: 'RTX 4080' };
  p4080.cfgText = { targetPrice: '105만', bandMin: '85만', bandMax: '', priceMin: '', priceMax: '' };
  p4080.confirmed = true;
  p4080.variantChoices = ['기본', 'SUPER'];
  p4080.pctPreview = {};
  for (let pct = 5; pct <= 45; pct++) {
    const cut = (med) => Math.round(med * (100 - pct) / 100 / 1000) * 1000;
    const kr = (n) => { const m = Math.floor(n / 10000), r = Math.round((n % 10000) / 1000); return r ? `${m}만 ${r}천 원` : `${m}만 원`; };
    p4080.pctPreview[String(pct)] = `기본 · 시세 120만 기준 → ${kr(cut(1200000))} 이하가 꿀매\nSUPER · 시세 140만 기준 → ${kr(cut(1400000))} 이하가 꿀매\n지금 ${pct >= 18 ? 1 : 2}건 (변형마다 따로 · 판매완료 기준)`;
  }
  p4080.dropped = { match: 7, basic: 3 };
  p4080.notes = ['당근은 내 동네(정왕동) 근처만 모아요'];
  p4080.merged = 2;
  p4080.identify = {
    bands: [{ lo: 850000, hi: 1350000, n: 10, mid: 1080000, tags: '본체' }, { lo: 1500000, hi: 1700000, n: 2, mid: 1630000, tags: '화이트' }],
    pick: { index: 0, withHigher: true }, intro: "본체로 보이는 가격대를 골라 뒀어요. 맞으면 아래 '이대로 정하기'만 누르세요.",
    words: [{ w: '화이트', n: 4, s: 0 }, { w: '풀박스', n: 3, s: 0 }, { w: '수냉', n: 1, s: 0 }], keptEx: ['본체', '컴퓨터', '데스크탑', 'pc', '노트북', '랩탑'], keptIn: [],
    previews: { '0|1': { n: 12, low: { price: 980000, title: '기가바이트 RTX 4080 윈드포스 V2 16G' }, doubt: 2 }, '0|0': { n: 10, low: { price: 980000, title: '기가바이트 RTX 4080 윈드포스 V2 16G' }, doubt: 2 }, '1|0': { n: 2, low: { price: 1580000, title: 'RTX 4080 SUPER ROG STRIX 화이트 미개봉' }, doubt: 0 }, none: { n: 14, low: { price: 980000, title: '기가바이트 RTX 4080 윈드포스 V2 16G' }, doubt: 2 } },
  };
  for (const l of p4080.listings) {
    if (l.grade && l.grade.k !== 'unknown') l.grade.ref = { med: l.variant === 'SUPER' ? 1400000 : 1200000, label: '판매완료' };
  }
  p4080.listings[2].sheet = { facts: ['시세 120만 · 판매완료 기준 18건', '꿀매 기준 -15% → 102만 원 이하', '30일 최저 98만 대비 같음', '9일 만에 가장 싼 값이에요', '목표가(105만) 이하예요', '흥정 신호 · 2번 내림'], words: ['기가바이트', '윈드포스', 'V2', '16G'] };

  const ps5 = b.products.find((p) => p.id === 's_ps5');
  ps5.cfg = { keyword: '플스5', thresholdPct: 15, targetPrice: null, variantPick: '', matchMode: 'title', category: 'game', excludeWords: ['타이어', '미쉐린'], includeWords: [],
    bandMin: null, bandMax: null, basicFilter: true, hiddenCount: 0, priceMin: null, priceMax: null, regionWords: [], maxKm: null, maxAgeDays: null, lowestAlert: true, confirmed: false, label: '플레이스테이션 5' };
  ps5.cfgText = { targetPrice: '', bandMin: '', bandMax: '', priceMin: '', priceMax: '' };
  ps5.confirmed = false;
  ps5.variantChoices = ['기본', '슬림 디지털', '프로'];
  ps5.identify = {
    bands: [{ lo: 10000, hi: 90000, n: 22, mid: 40000, tags: '게임 · 타이틀' }, { lo: 350000, hi: 520000, n: 31, mid: 410000, tags: '디스크 · 슬림' }, { lo: 700000, hi: 950000, n: 9, mid: 820000, tags: '프로' }],
    pick: { index: 1, withHigher: false }, intro: "본체로 보이는 가격대를 골라 뒀어요. 맞으면 아래 '이대로 정하기'만 누르세요.",
    words: [{ w: '디스크', n: 31, s: 0 }, { w: '게임', n: 22, s: 0 }, { w: '타이틀', n: 9, s: 0 }, { w: '미개봉', n: 7, s: 0 }], keptEx: ['타이어', '미쉐린'], keptIn: [],
    previews: { '1|0': { n: 26, low: { price: 460000, title: '플레이스테이션5 슬림 디지털 + 듀얼센스' }, doubt: 2 }, '1|1': { n: 35, low: { price: 460000, title: '플레이스테이션5 슬림 디지털 + 듀얼센스' }, doubt: 2 } },
  };
  for (const p of b.products) {
    if (!p.cfg) {
      p.cfg = { keyword: p.name, thresholdPct: p.pct || 15, targetPrice: null, variantPick: '', matchMode: 'title', category: '', excludeWords: [], includeWords: [], bandMin: null, bandMax: null, basicFilter: true, hiddenCount: 0,
        priceMin: null, priceMax: null, regionWords: [], maxKm: null, maxAgeDays: null, lowestAlert: true, confirmed: true, label: '' };
      p.cfgText = { targetPrice: '', bandMin: '', bandMax: '', priceMin: '', priceMax: '' };
      p.confirmed = true;
    }
  }
  b.inbox.forEach((i, k) => { i.id = `n_${k + 1}`; i.read = k >= 3; if (i.url && k < 2) i.key = p4080.listings[2].key; });
  const w0 = b.watches[0];
  Object.assign(w0, { src: 'star', days: 3, bumps: 2, checkedAt: at(5 * M), last: { text: '가격 인하', t: at(2 * H) }, events: [{ t: at(3 * 24 * H), text: '지켜보기 시작 · 125만' }, { t: at(2 * H), text: '가격 인하 · 125만 → 121만' }] });
  Object.assign(b.watches[1], { src: 'share', days: 7, bumps: 0, checkedAt: at(1 * H), last: null, events: [] });
  b.watches.push({ pid: 's_4080', listing: { ...p4080.listings[5], star: false }, since: '그대로', sinceDir: null, diff: '지금 같은 물건 최저가보다 17만 비쌈', ended: false, src: 'auto', days: 1, bumps: 0, checkedAt: at(12 * M), last: null, events: [] });

  // 그냥 검색 결과 하나('4080 super', 14:12 에 모음 = 묶음 20분 전 — 시험 시계 +5분이면 25분 전이라 30분 안)
  const sup = p4080.listings.filter((l) => l.variant === 'SUPER' || l.m === 'd').map((l) => ({ ...l, star: false }));
  b.adhoc = [{ q: '4080 super', at: at(20 * M), cmd: null, count: sup.length, lowKey: sup.find((l) => l.grade && l.grade.k !== 'caution').key, state: 'ok', stateCard: null, statePage: null,
    cautionPage: null, cautionKey: null, baseVariant: 'SUPER', facts: [], cut: { single: ['시세 140만 · 판매완료 기준 23건', '꿀매 기준 -15% → 119만 원 이하'] }, conds: ['RTX 4080 카드 조건', '30일', '당근 정왕동'], notes: [], listings: sup,
    nearby: { total: 8, near: 3 }, ask: { v: 'SUPER', n: 6, b: 4 }, dropped: { match: 1, basic: 0 } }];
  return b;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(DIR, 'radar-bundle.control.json'), JSON.stringify(control(), null, 1) + '\n');
  console.log('radar-bundle.control.json');
}
