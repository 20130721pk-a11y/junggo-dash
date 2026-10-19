// 웹 2판 보기 도우미 시험 (node --test test/*.test.mjs) — 판정 없음, 묶음 글을 그대로 쓰는지·거르기·늦음·받기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(`${REPO}/radar-view.js`);
await import(`${REPO}/box.js`);
const RV = globalThis.RadarView;
const BOX = globalThis.JunggoBox;
const { sample, MADE } = await import('./fixtures/make-sample.mjs');
const { seal: sealNode, deriveKey: deriveNode, open: openNode } = await import(`${REPO}/collector/seal.mjs`);
const M = 60e3, H = 3600e3;

test('시험 자료 파일이 만드는 스크립트와 같아요(고친 뒤 다시 만들었는지)', () => {
  const file = JSON.parse(fs.readFileSync(path.join(REPO, 'test/fixtures/radar-bundle.sample.json'), 'utf8'));
  assert.deepEqual(file, sample());
});

test('꼴 번호·종류·만든 때가 다르면 판 다름', () => {
  const b = sample();
  assert.equal(RV.check(b), '');
  assert.equal(RV.check({ ...b, v: 99 }), 'version');
  assert.equal(RV.check({ ...b, v: 2 }), 'version');
  assert.equal(RV.check({ ...b, kind: 'junggo-view' }), 'version');
  assert.equal(RV.check({ ...b, made: 0 }), 'version');
  assert.equal(RV.check(null), 'version');
  assert.equal(RV.check([]), 'version');
});

test('늦음 선 = 45분과 기대 간격×2 중 큰 것 (W2-8)', () => {
  const b = sample();
  assert.equal(RV.lateLineMin(b), 45); // 보통 15분
  assert.equal(RV.lateLineMin({ ...b, everyMin: 55 }), 110); // 절약·데이터
  assert.equal(RV.lateLineMin({ ...b, everyMin: undefined }), 45);
  assert.equal(RV.liveState(b, MADE + 44 * M).level, 'fresh');
  assert.equal(RV.liveState(b, MADE + 46 * M).level, 'late'); // 46분 전(보통) → 띠
  assert.equal(RV.liveState({ ...b, everyMin: 55 }, MADE + 100 * M).level, 'fresh'); // 절약 100분 전 → 정상
  assert.equal(RV.liveState(b, MADE + 25 * H).level, 'day'); // 25시간 → 흐림
  assert.equal(RV.liveState(b, MADE + 25 * H).late, true);
});

test('글 규칙이 앱과 같아요 (wonText·manWon·agoText·Geo.label)', () => {
  assert.equal(RV.won(980000), '980,000원');
  assert.equal(RV.won(null), '가격문의');
  assert.equal(RV.won(0), '가격문의');
  assert.equal(RV.man(950000), '95만');
  assert.equal(RV.man(1010000), '101만');
  assert.equal(RV.man(23000), '2.3만');
  assert.equal(RV.man(20000), '2만');
  assert.equal(RV.man(3500), '3,500원');
  const now = MADE;
  assert.equal(RV.ago(now - 30e3, now), '방금');
  assert.equal(RV.ago(now - 3 * M, now), '3분 전');
  assert.equal(RV.ago(now - 2 * H, now), '2시간 전');
  assert.equal(RV.ago(now - 30 * H, now), '어제');
  assert.equal(RV.ago(now - 72 * H, now), '3일 전');
  assert.equal(RV.ago(0, now), '');
  assert.equal(RV.kmLabel(2.3), '2.3km');
  assert.equal(RV.kmLabel(2), '2.0km'); // 앱 Double 글자 그대로
  assert.equal(RV.kmLabel(12.4), '12km');
  assert.equal(RV.kmLabel(9.96), '10.0km');
});

test('시각은 한국 시각으로', () => {
  assert.equal(RV.clock(MADE, MADE + M), '14:32');
  assert.equal(RV.clock(MADE - 13 * H, MADE), '01:32'); // 같은 날은 시각만
  assert.equal(RV.clock(MADE - 15 * H, MADE), '10월 18일 23:32');
  assert.equal(RV.dayLabel(MADE - 2 * H, MADE), '오늘');
  assert.equal(RV.dayLabel(MADE - 26 * H, MADE), '어제');
  assert.equal(RV.dayLabel(MADE - 50 * H, MADE), '10월 17일');
  assert.equal(RV.dur(330 * M), '5시간 30분');
  assert.equal(RV.dur(55 * M), '55분');
  assert.equal(RV.dur(26 * H), '1일 2시간');
});

test('지역 글: ≈ 어림·당근 거리·시·군·구·지역 모름 (W2-16)', () => {
  assert.equal(RV.placeText({ name: '정왕동', km: 2.3, rough: true, level: 'dong', unknown: false }), '정왕동 · ≈2.3km');
  assert.equal(RV.placeText({ name: '배곧동', km: 1.2, rough: false, level: 'dong', unknown: false }), '배곧동 · 1.2km');
  assert.equal(RV.placeText({ name: '시흥시', km: null, rough: true, level: 'sigungu', unknown: false }), '시흥시 쯤');
  assert.equal(RV.placeText({ name: '정왕동', sgg: '시흥시', km: null, level: 'sgg', unknown: false }), '정왕동 · 시흥시 쯤');
  // 앱이 만든 글이 있으면 그대로
  assert.equal(RV.placeText({ name: '정왕동', km: 2.3, rough: true, text: '정왕동 · ≈2.3km' }), '정왕동 · ≈2.3km');
  assert.equal(RV.placeText({ unknown: true, text: '지역 모름' }), '지역 모름');
  // 칸이 빠진 옛 꼴: 가까운지도 거리도 모르고 이름도 없으면 지역 모름
  assert.equal(RV.placeText({ near: null, km: null }), '지역 모름');
  assert.equal(RV.isUnknown({ name: '정왕동', near: false, km: null }), false);
  assert.equal(RV.placeText({ name: '정왕동', km: null, rough: false, level: 'dong', unknown: false }), '정왕동');
  assert.equal(RV.placeText({ name: null, km: null, unknown: true }), '지역 모름');
  assert.equal(RV.placeText({ name: '정왕동', unknown: true }), '지역 모름');
  assert.equal(RV.placeText(null), '지역 모름');
  assert.equal(RV.placeText(undefined), '지역 모름');
});

test('등급 배지 글이 앱 GradeBadge 와 같고, 빨강 시세보다 많이 쌈은 없어요 (W2-2)', () => {
  assert.deepEqual(RV.badge({ k: 'honey', d: -18 }, false).text, '꿀매 -18%');
  assert.deepEqual(RV.badge({ k: 'honey', d: -18 }, true).text, '-18%');
  assert.equal(RV.badge({ k: 'good', d: -8 }).text, '시세 -8%');
  assert.equal(RV.badge({ k: 'normal', d: 6 }).text, '보통 +6%');
  assert.equal(RV.badge({ k: 'normal', d: 25 }).text, '비쌈 +25%');
  assert.equal(RV.badge({ k: 'normal', d: 31 }).cls, 'b-high');
  assert.equal(RV.badge({ k: 'caution', d: -43 }).text, '⚠ 확인 필요');
  assert.equal(RV.badge({ k: 'caution', d: -43 }).cls, 'b-caution');
  assert.equal(RV.badge({ k: 'unknown', d: null }), null);
  assert.equal(RV.badge(null), null);
});

test('지역 거르기: 5km·가까운 동네만·함께 보기 (J5·W2-17)', () => {
  const p = sample().products[0];
  const keys = (r) => r.rows.map((l) => l.title);
  const all = RV.filterListings(p.listings, {});
  assert.equal(all.rows.length, 13);
  assert.deepEqual(all.counts, { j: 6, d: 3, b: 4 });
  // 5km 안 + 함께 보기(기본 켬): ≈2.3·1.2·0.8·4.1·1.9 + 지역 모름 5건, ≈5.6·12km·시흥시 쯤은 빠짐
  const in5 = RV.filterListings(p.listings, { area: '5' });
  assert.equal(in5.withUnknown, true);
  assert.equal(in5.unknown, 5);
  assert.equal(in5.hiddenUnknown, 0);
  assert.equal(in5.rows.length, 10);
  assert.ok(!keys(in5).some((t) => t.includes('프로아트') || t.includes('게이밍 OC 16G') || t.includes('수냉')));
  // 함께 보기 끄면 지역 모름이 숨고 건수가 보임
  const in5off = RV.filterListings(p.listings, { area: '5', withUnknown: false });
  assert.equal(in5off.rows.length, 5);
  assert.equal(in5off.hiddenUnknown, 5);
  assert.ok(in5off.rows.every((l) => !RV.isUnknown(l.place) && l.place.km <= 5));
  // 가까운 동네만: near 참만(+ 지역 모름은 함께 보기일 때)
  const near = RV.filterListings(p.listings, { area: 'near', withUnknown: false });
  assert.deepEqual(near.rows.map((l) => l.place.name), ['정왕동', '배곧동', '정왕동', '월곶동']);
  // 3km 안
  const in3 = RV.filterListings(p.listings, { area: '3', withUnknown: false });
  assert.deepEqual(in3.rows.map((l) => l.place.km), [2.3, 1.2, 0.8, 1.9]);
  // 거리를 모르는 매물: 가까운 동네 이름이면 km 거르기에도 들어가요(앱 Nearby.passes)
  const nearNoKm = [{ m: 'd', title: 'x', price: 1, place: { name: '정왕동', near: true, km: null, unknown: false } }, { m: 'd', title: 'y', price: 2, place: { name: '먼동', near: false, km: null, unknown: false } }];
  assert.deepEqual(RV.filterListings(nearNoKm, { area: '5' }).rows.map((l) => l.title), ['x']);
  // 모르는 거르기 값은 전체
  assert.equal(RV.filterListings(p.listings, { area: '7' }).rows.length, 13);
});

test('마켓 토글·찾기·정렬', () => {
  const p = sample().products[0];
  const noB = RV.filterListings(p.listings, { mk: { j: true, d: true, b: false } });
  assert.equal(noB.rows.length, 9);
  assert.deepEqual(noB.counts, { j: 6, d: 3, b: 4 }); // 건수는 끄기 전 그대로
  assert.equal(RV.filterListings(p.listings, { q: 'super' }).rows.length, 4);
  const near = RV.filterListings(p.listings, { sort: 'near' }).rows;
  assert.equal(near[0].place.km, 0.8);
  assert.ok(RV.isUnknown(near[near.length - 1].place));
  const seen = RV.filterListings(p.listings, { sort: 'seen' }).rows;
  assert.ok(seen[0].firstSeen >= seen[1].firstSeen);
  const low = RV.filterListings(p.listings, {}).rows.map((l) => l.price);
  assert.deepEqual(low, [...low].sort((a, b) => a - b));
  // 가격문의는 싼 순 맨 뒤
  const withAsk = [{ m: 'j', title: 'a', price: null, place: null }, { m: 'j', title: 'b', price: 5, place: null }];
  assert.deepEqual(RV.filterListings(withAsk, {}).rows.map((l) => l.title), ['b', 'a']);
});

test('알림함 꼬리표가 앱과 같아요 (W2-4)', () => {
  const b = sample();
  const now = MADE;
  const tags = b.inbox.map((i) => RV.inboxTags(i, now).join(' · '));
  assert.deepEqual(tags, [
    '55분 전 · 요약에 담아요',
    '2시간 전',
    '2시간 전 · 앱에서 봄',
    '5시간 전',
    '6시간 전',
    '12시간 전 · 조용한 시간 — 아침에',
    '어제',
    '어제 · 요약에 담아요',
  ]);
  assert.deepEqual(RV.inboxTags({ t: now, hidden: true }, now), ['방금', '이 매물 아님 처리']);
});

test('최근 7일 올림 공백 (계획서 6-5 ①)', () => {
  const b = sample();
  const g = RV.gaps(b, MADE + 3 * M);
  assert.equal(g.length, 2);
  assert.equal(RV.clock(g[0].from, MADE), '10월 18일 02:10');
  assert.equal(RV.clock(g[0].to, MADE), '10월 18일 07:40');
  assert.equal(RV.dur(g[0].ms), '5시간 30분');
  assert.equal(RV.dur(g[1].ms), '55분');
  // 늦으면 마지막 올림부터 지금까지가 열린 공백으로
  const g2 = RV.gaps(b, MADE + 2 * H);
  assert.equal(g2.length, 3);
  assert.equal(g2[0].open, true);
  assert.equal(RV.dur(g2[0].ms), '2시간');
  // 절약(55분)이면 55분 공백은 늦음이 아님
  assert.equal(RV.gaps({ ...b, everyMin: 55 }, MADE).length, 1);
});

test('주소는 https 만, 글은 HTML 로 새지 않게', () => {
  assert.equal(RV.safeUrl('https://web.joongna.com/product/1'), 'https://web.joongna.com/product/1');
  assert.equal(RV.safeUrl('javascript:alert(1)'), '');
  assert.equal(RV.safeUrl('http://x.com'), '');
  assert.equal(RV.safeUrl('https://x.com/"onerror=1'), '');
  assert.equal(RV.esc('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
});

test('CSV: 보이는 매물만, 식으로 읽히지 않게', () => {
  const rows = [{ m: 'j', title: '=HYPERLINK("x")', price: 1000, grade: { k: 'caution', d: -60, why: '시세의 절반도 안 돼요, 확인' }, place: null, firstSeen: MADE, url: 'https://web.joongna.com/product/1' }];
  const c = RV.csv(rows, MADE);
  assert.ok(c.startsWith('﻿제목,'));
  assert.ok(c.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(c.includes('⚠ 확인 필요'));
  assert.ok(c.includes('"시세의 절반도 안 돼요, 확인"'));
  assert.ok(c.includes('지역 모름'));
});

// ---------- 받기: 가짜 GitHub ----------
function fakeGh(map) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, auth: init && init.headers && init.headers.Authorization, accept: init && init.headers && init.headers.Accept });
    const h = map(url);
    if (h instanceof Error) throw h;
    const [status, body, headers] = h;
    return { ok: status >= 200 && status < 300, status, headers: { get: (k) => (headers || {})[k.toLowerCase()] ?? null }, text: async () => body };
  };
  f.calls = calls;
  return f;
}
const BOXJSON = JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iter: 600000, salt: 'c2FsdHNhbHRzYWx0c2FsdA==', iv: 'aXZpdml2aXZpdml2', ct: 'Y3Q=' });

test('받기: 비공개 저장소 view 가지 radar.enc 를 읽기 토큰으로 (B1)', async () => {
  const f = fakeGh(() => [200, BOXJSON]);
  const r = await RV.fetchRadar({ repo: 'me/junggo-dash-data', token: 'tok-x', fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.box.v, 1);
  assert.equal(f.calls[0].url, 'https://api.github.com/repos/me/junggo-dash-data/contents/radar.enc?ref=view');
  assert.equal(f.calls[0].auth, 'Bearer tok-x');
  assert.equal(f.calls[0].accept, 'application/vnd.github.raw+json');
});

test('받기: 401·403·404·한도·네트워크·상자 아님 (W2-8)', async () => {
  const cases = [
    [() => [401, '{}'], 'token'],
    [() => [403, '{}', { 'x-ratelimit-remaining': '10' }], 'token'],
    [() => [403, '{}', { 'x-ratelimit-remaining': '0' }], 'rate'],
    [() => [429, '{}'], 'rate'],
    [(u) => (u.includes('/contents/') ? [404, '{}'] : [200, '{}']), 'missing'], // 저장소는 보이는데 파일·가지 없음 = 아직 안 올림
    [(u) => (u.includes('/contents/') ? [404, '{}'] : [404, '{}']), 'token'], // 저장소를 못 봄 = 토큰 권한
    [() => new Error('offline'), 'net'],
    [() => [500, '{}'], 'net'],
    [() => [200, '{"hello":1}'], 'bad'],
    [() => [200, 'not json'], 'bad'],
  ];
  for (const [h, why] of cases) {
    const r = await RV.fetchRadar({ repo: 'me/d', token: 't', fetchImpl: fakeGh(h) });
    assert.equal(r.ok, false);
    assert.equal(r.why, why, `${why}`);
  }
  assert.equal((await RV.fetchRadar({ repo: 'bad name', token: 't', fetchImpl: fakeGh(() => [200, BOXJSON]) })).why, 'repo');
  assert.equal((await RV.fetchRadar({ repo: 'me/d', token: '', fetchImpl: fakeGh(() => [200, BOXJSON]) })).why, 'token');
});

test('잠금 짝: 수집기(Node)가 junggo-radar-view 로 잠근 상자를 box.js 가 열고, 다른 용도 이름으론 안 열려요 (W2-10)', async () => {
  const salt = 'MDEyMzQ1Njc4OWFiY2RlZg==';
  const b = sample();
  const nodeKey = deriveNode('pw-한글-1', salt, 100000);
  const box = sealNode(b, nodeKey, salt, RV.LABEL, 100000);
  const key = await BOX.deriveKey('pw-한글-1', salt, 100000);
  const opened = await BOX.open(box, key, RV.LABEL);
  assert.deepEqual(opened, b);
  await assert.rejects(() => BOX.open(box, key, 'junggo-view'));
  // 거꾸로: 페이지가 잠근 읽기 토큰 상자는 그 용도 이름으로만
  const tok = await BOX.seal({ t: 'tok' }, key, salt, RV.TOKEN_LABEL, 100000);
  assert.deepEqual(openNode(tok, () => nodeKey, RV.TOKEN_LABEL), { t: 'tok' });
  assert.throws(() => openNode(tok, () => nodeKey, RV.LABEL));
});

test('시험 묶음에 안 보내는 칸이 없어요 (W2-7 — 웹 쪽 자료 확인)', () => {
  const banned = /"(seller|sellerId|storeSeq|uid|lat|lng|lon|latitude|longitude|content|description|token|model|manufacturer)"\s*:/;
  const text = fs.readFileSync(path.join(REPO, 'test/fixtures/radar-bundle.sample.json'), 'utf8');
  assert.equal(banned.test(text), false);
});

test('웹은 지역 표를 받지 않아요 (W2-18)', () => {
  const page = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const view = fs.readFileSync(path.join(REPO, 'radar-view.js'), 'utf8');
  for (const s of [page, view]) {
    assert.equal(/places\.(json|mjs)|findPlace|haversine/i.test(s), false);
  }
});

test('새 화면 글에 중앙값·평균·서두르세요·실시간·앱 판정 전 값·시세보다 많이 쌈이 없어요 (W2-5)', () => {
  const page = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const view = fs.readFileSync(path.join(REPO, 'radar-view.js'), 'utf8');
  for (const w of ['중앙값', '평균', '서두르세요', '실시간', '앱 판정 전 값', '시세보다 많이 쌈']) {
    assert.equal(page.includes(w), false, w);
    assert.equal(view.includes(w), false, w);
  }
});
