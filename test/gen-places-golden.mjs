// 지역 찾기 정답 만들기(0.7.1 J3) — 앱 Places.find 가 웹 findPlace 와 같은지 앱 단위 시험(PlacesTest)이 이 정답으로 본다.
// 사용: node test/gen-places-golden.mjs <옛 정답 파일> [출력 파일(기본: 표준 출력)]
//   옛 정답의 물음(q)을 그대로 다시 묻고, 아래 MORE 를 뒤에 더한다(이미 있는 물음은 건너뜀). 옛 결과와 달라진 물음은 표준 오류에 적는다.
import { readFileSync, writeFileSync } from 'node:fs';
import { areaKey, findPlace, placesVersion } from '../collector/places.mjs';

// 0.8.1 B1: '제N동' ↔ 'N동'(번개장터 동네 이름은 '제'를 붙여 온다 — 0.8.0 QA 1차 실제 이름 10개 + 표가 '제'인 곳 + '제'가 원래 이름인 동)
const MORE = [
  '강서구 등촌제2동', '강서구 화곡제2동', '광진구 중곡제3동', '금정구 장전제1동', '동대문구 답십리제1동', '동작구 상도제1동',
  '부산진구 부전제2동', '사하구 장림제2동', '중랑구 상봉제1동', '해운대구 좌제1동',
  '등촌제2동', '서울특별시 강서구 등촌제2동', '상도제1동', '서울 동작구 상도제3동', '신길제1동', '서울특별시 영등포구 신길제1동',
  '강동구 상일1동', '상일1동', '강동구 상일제1동', '부산진구 가야1동', '부산진구 가야제1동',
  '홍제1동', '서대문구 홍제1동', '연제구 거제1동', '거제1동', '홍제동', '거제동', '제1동', '제동', '1동',
];

const [src, dst] = process.argv.slice(2);
if (!src) { console.error('사용: node test/gen-places-golden.mjs <옛 정답 파일> [출력 파일]'); process.exit(2); }
const old = JSON.parse(readFileSync(src, 'utf8'));
const pick = (p) => (p ? { lat: p.lat, lng: p.lng, name: p.name, level: p.level } : null);
const seen = new Set();
const cases = [];
let changed = 0;
for (const c of old.cases) {
  seen.add(c.q);
  const p = pick(findPlace(c.q));
  if (JSON.stringify(p) !== JSON.stringify(c.p || null)) { changed++; console.error(`바뀜: ${JSON.stringify(c.q)} ${JSON.stringify(c.p)} → ${JSON.stringify(p)}`); }
  cases.push({ q: c.q, key: areaKey(c.q), p });
}
for (const q of MORE) if (!seen.has(q)) { seen.add(q); cases.push({ q, key: areaKey(q), p: pick(findPlace(q)) }); }
const json = JSON.stringify({ about: old.about, v: placesVersion(), made: 'junggo-dash test/gen-places-golden.mjs', cases }, null, 1);
if (dst) writeFileSync(dst, json + '\n'); else process.stdout.write(json + '\n');
console.error(`정답 ${cases.length}건 · 옛 정답과 달라진 것 ${changed}건`);
