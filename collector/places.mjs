// 지역 이름 → 중심 좌표. 중고나라 매물의 대략 거리(판매 지역 동 가운데까지), 거리 기준 동네, 주변 지역 추천에 쓴다.
// GitHub Actions(collector/run.mjs)에서만 쓴다 — 페이지·폰 앱은 이 표를 받지 않는다.
//
// 표: places.json — 2026-07-01 행정구역의 읍·면·동, 시·군·구 경계 무게 중심 (위도, 경도, 소수 셋째 자리 ≈ 100m).
//   출처: 통계청 SGIS 행정동 경계(공공누리 제1유형)를 vuski/admdongkor 가 가공한 것(CC BY 4.0) — places.json 의 about.
//   다시 만들기: collector/src/places_build.py (README '지역 표' 참고)
//   { sido: {줄임: 정식 이름}, p: {줄임: {"시흥시": [위도, 경도, {동: [위도, 경도]}], "수원시": [위도, 경도, ["장안구", …]], "수원시 장안구": […]}} }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'places.json');

// 시·도 이름 맞추기: 꼬리(특별시·광역시·특별자치시·특별자치도·도)를 떼고 줄임말·옛 이름을 하나로.
// 2026-07 광주광역시 + 전라남도 → 전남광주통합특별시 (사이트마다 옛 이름·새 이름이 섞여 있을 수 있어 하나로 본다)
// 수집기(collector/src/collect.js)의 PROV_ALIAS·areaKey 와 같아야 한다.
export const PROV_ALIAS = {
  충청북: '충북', 충청남: '충남', 전라북: '전북', 경상북: '경북', 경상남: '경남',
  전라남: '전남광주', 전남: '전남광주', 광주: '전남광주', 전남광주통합: '전남광주', 광주전남: '전남광주',
  서울시: '서울', 부산시: '부산', 대구시: '대구', 인천시: '인천', 대전시: '대전', 울산시: '울산', 세종시: '세종',
};
export const provWord = (w) => { const s = String(w || '').replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, ''); return PROV_ALIAS[s] || s; };
// 지역 이름 비교용 열쇠: "경기도 시흥시 정왕동" → "경기시흥시정왕동", "광주광역시 북구" → "전남광주북구", "시흥시" → "시흥시"
export const areaKey = (v) => String(v || '').trim().split(/\s+/).filter(Boolean).map((w, i) => (i === 0 ? provWord(w) : w)).join('');
// 두 지역이 겹치는지 (한쪽 열쇠가 다른 쪽을 품으면): "경기도 안산시" ⊃ "안산시 단원구"
export const sameArea = (a, b) => { const x = areaKey(a); const y = areaKey(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };

// 직선거리(km) — 좁은 범위라 평면으로 어림 (refresh.mjs 의 kmBetween 과 같다)
export function kmBetween(a, b) {
  const x = (a[1] - b[1]) * Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180) * 111.32;
  const y = (a[0] - b[0]) * 110.57;
  return Math.sqrt(x * x + y * y);
}

// 행정동 이름 → 같이 쓰는 법정동 이름: 정왕1동·정왕본동 → 정왕동, 화수1·화평동 → 화수동·화평동, 신길제1동 → 신길동
// (판매 지역은 법정동 이름일 때가 많다. 행정동 여럿으로 나뉜 동은 그 가운데들의 평균으로 어림)
function basesOf(name) {
  const out = [];
  for (let part of String(name).split('·')) {
    if (!/[동읍면가리]$/.test(part)) part += '동';
    const b = part.replace(/(제?\d+가?|본)동$/, '동');
    if (b !== name && b.length > 2 && !out.includes(b)) out.push(b);
  }
  return out;
}

let IDX = null;
function index() {
  if (IDX) return IDX;
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const munis = [];
  for (const [prov, list] of Object.entries(raw.p)) {
    const byKey = {};
    for (const [key, v] of Object.entries(list)) {
      const m = { prov, key, flat: key.replace(/\s+/g, ''), name: `${raw.sido[prov] || prov} ${key}`, lat: v[0], lng: v[1], dongs: null, bases: null, kids: null };
      if (Array.isArray(v[2])) m.kidKeys = v[2].map((k) => `${key} ${k}`);
      else {
        m.dongs = new Map(Object.entries(v[2] || {}));
        m.bases = new Map();
        for (const [d, ll] of m.dongs) for (const b of basesOf(d)) { if (!m.bases.has(b)) m.bases.set(b, []); m.bases.get(b).push(ll); }
      }
      byKey[key] = m;
      munis.push(m);
    }
    for (const m of Object.values(byKey)) if (m.kidKeys) m.kids = m.kidKeys.map((k) => byKey[k]).filter(Boolean);
  }
  IDX = { munis, provs: new Set(Object.keys(raw.p)), sido: raw.sido, v: raw.v };
  return IDX;
}
export const placesVersion = () => index().v;

const r3 = (v) => Math.round(v * 1000) / 1000;
// 시·군·구 m 안의 읍·면·동 w → { lat, lng, name } (구가 있는 시는 구마다 찾아본다)
function dongIn(m, w) {
  if (m.kids) {
    for (const k of m.kids) { const d = dongIn(k, w); if (d) return d; }
    return null;
  }
  const ll = m.dongs.get(w);
  if (ll) return { lat: ll[0], lng: ll[1], name: `${m.name} ${w}` };
  const many = m.bases.get(w);
  if (many && many.length) {
    return { lat: r3(many.reduce((a, x) => a + x[0], 0) / many.length), lng: r3(many.reduce((a, x) => a + x[1], 0) / many.length), name: `${m.name} ${w}` };
  }
  return null;
}
// 낱말들 가운데 읍·면·동 이름을 앞에서부터 찾는다. 여러 시·군·구에 같은 이름이 있으면 모른다(null)
function dongSearch(pool, words) {
  for (const w of words) {
    if (!/[동읍면가리]$/.test(w)) continue;
    const hits = [];
    for (const m of pool) { const d = dongIn(m, w); if (d) hits.push(d); }
    if (hits.length === 1) return { ...hits[0], level: 'dong' };
    if (hits.length > 1) return null;
  }
  return null;
}
const muniPlace = (m) => ({ lat: m.lat, lng: m.lng, name: m.name, level: m.kids ? 'city' : 'sgg' });

function find(t) {
  const I = index();
  let words = t.split(' ');
  const p0 = provWord(words[0]);
  const prov = I.provs.has(p0) && words.length > 1 ? p0 : '';
  if (prov) words = words.slice(1);
  else if (I.provs.has(p0)) return null; // 시·도만 적으면 너무 넓다
  const inProv = (m) => !prov || m.prov === prov;
  // 시·군·구: 앞 두 낱말("안산시 단원구") 또는 한 낱말("시흥시", 붙여 쓴 "수원시장안구", 꼬리 없이 "시흥")
  const muniOf = (pool) => {
    for (const n of [2, 1]) {
      if (words.length < n) continue;
      const key = words.slice(0, n).join('');
      let hits = pool.filter((m) => m.flat === key);
      if (!hits.length && n === 1 && key.length >= 2) hits = pool.filter((m) => m.flat !== key && m.flat.replace(/[시군구]$/, '') === key);
      if (hits.length) return { hits, rest: words.slice(n) };
    }
    return null;
  };
  let got = muniOf(I.munis.filter(inProv));
  // 그 시·도에 없는 시·군·구(옛 이름: 경상북도 군위군 → 대구 군위군)는 전국에서 하나뿐일 때만
  if (!got && prov) { const g = muniOf(I.munis); if (g && g.hits.length === 1) got = g; }
  if (got) {
    const { hits, rest } = got;
    if (rest.length) {
      const d = dongSearch(hits, rest);
      if (d) return d;
    }
    return hits.length === 1 ? muniPlace(hits[0]) : null;
  }
  // 시·군·구 없이 읍·면·동만 (예: "정왕동", 옛 이름 "인천광역시 중구 신포동" → 지금의 제물포구 신포동). 구가 있는 시의 묶음은 빼고 찾는다
  return dongSearch(I.munis.filter((m) => inProv(m) && !m.kids), words);
}

// 지역 이름 → { lat, lng, name(정식 이름), level: 'dong' | 'sgg'(시·군·구) | 'city'(구가 있는 시 전체) } 또는 null
const CACHE = new Map();
export function findPlace(text) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (!CACHE.has(t)) {
    if (CACHE.size > 20000) CACHE.clear();
    CACHE.set(t, find(t));
  }
  return CACHE.get(t);
}

// 기준점 둘레의 시·군·구 (가까운 지역 추천). 거리 = 기준점에서 그 시·군·구의 가장 가까운 읍·면·동 가운데까지.
// skip: 이미 고른 지역 이름들 (겹치는 곳은 빼고)
export function nearbyAreas(at, { maxKm = 15, limit = 8, skip = [] } = {}) {
  if (!at || !Number.isFinite(at.lat) || !Number.isFinite(at.lng)) return [];
  const p = [at.lat, at.lng];
  const out = [];
  for (const m of index().munis) {
    if (m.kids) continue;
    let best = kmBetween(p, [m.lat, m.lng]);
    for (const ll of m.dongs.values()) best = Math.min(best, kmBetween(p, ll));
    if (best > maxKm || skip.some((s) => sameArea(s, m.name))) continue;
    out.push({ q: m.name, km: Math.round(best * 10) / 10 });
  }
  return out.sort((a, b) => a.km - b.km).slice(0, limit);
}
