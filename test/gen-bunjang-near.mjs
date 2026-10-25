// 번개장터 '내 주변' 위치 규칙 정답 만들기(R8 BJ7) — 앱 Nearby.bunjang 이 웹과 같은지 앱 단위 시험이 이 정답으로 본다.
// 규칙은 collector/run.mjs:590-618(dongNear·가까움·locate)과 collector/src/collect.js bunjangDetails(동네 이름 자르기·짧은 이름·inHomes)를
// 그대로 옮긴 것이다. 아래 RULE_LINES 가 run.mjs 에 글자 그대로 남아 있는지 먼저 보고, 바뀌었으면 멈춘다(옮긴 규칙이 낡지 않게).
// 사용: node test/gen-bunjang-near.mjs [출력 파일(기본: 표준 출력)]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { areaKey, findPlace, kmBetween, placesVersion } from '../collector/places.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const run = readFileSync(join(here, '../collector/run.mjs'), 'utf8');
const RULE_LINES = [
  "for (const a of areas) { const p = findPlace(`${a} ${label}`); if (p && p.level === 'dong') return p; }",
  "t[11] = t[11] === 1 || dongNear(label) || areas.some((a) => areaKey(label).includes(areaKey(a))) ? 1 : 0;",
  "if (t[0] === 'b' && Array.isArray(x.ar)) for (const n of x.ar.slice(0, 1)) { consider(dongNear(n)); if (!best) consider(findPlace(n)); }",
  'const homeQ = state.config.home || area;',
];
for (const l of RULE_LINES) if (!run.includes(l)) { console.error('run.mjs 규칙이 바뀌었어요 — 이 파일을 다시 맞춰 주세요:\n' + l); process.exit(1); }

// collect.js 와 같게
const cut = (s, n) => { s = String(s == null ? '' : s).trim(); return s.length > n ? s.slice(0, n) : s; };
const cleanLabel = (raw) => cut(String(raw || '').replace(/\s+/g, ' '), 30);
const inHomes = (homes, v) => { const k = areaKey(v); return !!k && homes.some((h) => k.includes(h)); };

function one(homes, distanceBase, raw) {
  const areas = homes.filter((a) => String(a).trim());
  const label = cleanLabel(raw);
  const homeQ = distanceBase.trim() || areas[0] || '';
  const hp = homeQ ? findPlace(homeQ) : null;
  const home = hp ? { lat: hp.lat, lng: hp.lng } : null;
  const out = { homes, distanceBase, raw, label, name: label ? cut(label.split(' ').pop(), 12) : null, near: null, level: null, km: null, sgg: null };
  if (!label) return out;
  const dongNear = (lb) => {
    for (const a of areas) { const p = findPlace(`${a} ${lb}`); if (p && p.level === 'dong') return p; }
    return null;
  };
  const keys = areas.map(areaKey).filter(Boolean);
  if (areas.length) out.near = !!(inHomes(keys, label) || dongNear(label) || areas.some((a) => areaKey(label).includes(areaKey(a))));
  const p = dongNear(label) || findPlace(label);
  if (!p) return out;
  out.level = p.level;
  if (p.level !== 'dong') { out.sgg = p.name.includes(' ') ? p.name.slice(p.name.indexOf(' ') + 1) : p.name; return out; }
  if (home) out.km = Math.round(kmBetween([p.lat, p.lng], [home.lat, home.lng]) * 10) / 10;
  return out;
}

const HOMES = [[], ['경기도 시흥시'], ['시흥시'], ['정왕동'], ['경기도 시흥시', '서울특별시 강남구'], ['서울특별시 강남구'], ['인천광역시 연수구']];
const BASES = ['', '경기도 시흥시 정왕동', '서울특별시 강남구'];
const LABELS = [
  '정왕동', '배곧동', '중앙동', '역삼동', '', '   ', '  정왕동 ', '정왕  동', '경기도 시흥시 정왕동', '경기 시흥시 배곧동', '시흥시', '경기도 시흥시',
  '신사동', '역삼1동', '서울 강남구 역삼동', '서울특별시 강남구', '정왕1동', '없는동', '은행동', '대야동', '신천동', '능곡동', '송도동', '송도1동',
  '수원시', '부산광역시 해운대구 우동', '우동', '연수동', '가'.repeat(40), '경기도 시흥시 정왕동 1234-5 어딘가 아주 긴 주소 이름',
];
const cases = [];
for (const h of HOMES) for (const b of BASES) for (const l of LABELS) cases.push(one(h, b, l));
const json = JSON.stringify({ about: '웹 collector/run.mjs:590-618 + collect.js bunjangDetails 규칙 결과(R8 BJ7 정답). 앱 Nearby.bunjang·BunjangGeo.clean 이 같아야 한다.', v: placesVersion(), made: 'junggo-dash test/gen-bunjang-near.mjs', cases }, null, 1);
if (process.argv[2]) writeFileSync(process.argv[2], json + '\n'); else process.stdout.write(json + '\n');
console.error(`정답 ${cases.length}건`);
