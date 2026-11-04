// 0.8.6 W-1 그냥 검색 근처 밖 당근 줄 시험 (node --test test/*.test.mjs)
// 자료: test/fixtures/app-far.json — 앱 WebBundleFar086Test 가 앱 함수로 만든 adhoc 한 건(지어낸 매물: 중고나라 6 · 근처 당근 2 · 근처 밖 당근 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(`${REPO}/radar-view.js`);
const RV = globalThis.RadarView;
const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'test/fixtures/app-far.json'), 'utf8'));
const A = FIX.adhoc;
const keys = (ls) => ls.map((l) => l.key);

test('앱 묶음(0.8.6 수집·매칭 기본 = 당근 전체): 기본 줄에 근처 밖 당근도 있고 far:true 표시만', () => {
  const far = A.listings.filter((l) => l.far === true);
  assert.equal(A.count, A.listings.length);
  assert.deepEqual(keys(far), ['d:f1', 'd:f2', 'd:f3', 'd:f4', 'd:f5']);
  assert.ok(far.every((l) => l.m === 'd' && l.place && l.place.near !== true));
  assert.equal(A.nearby.total, 7);
  assert.equal(A.nearby.near, 2);
  assert.equal(A.nearby.far, 5);
  assert.equal(A.nearby.nearOnly, false);
  assert.equal(A.nearby.lines.length, 2);
});

test('기본(전체)엔 far 줄을 보이고, 뒤집으면(가까운 동네만) 빼요 — 앱 ResultsScreen flipDaangn', () => {
  const off = RV.daangnFar(A, false);
  assert.equal(off.nearOnly, false);
  assert.equal(off.has, true);
  assert.equal(off.hide, false);
  assert.equal(off.rows.length, A.listings.length);
  const on = RV.daangnFar(A, true);
  assert.equal(on.hide, true);
  assert.ok(on.rows.every((l) => l.far !== true));
  // 기본(전체) 지금 최저가 = 묶음 lowKey(앱이 낸 것)
  const f = RV.filterListings(off.rows, {});
  const h = RV.screenHero(f.heroRows, { name: '씰리', base: A.baseVariant });
  assert.equal(h.hero && h.hero.key, A.lowKey || null);
});

test("'가까운 동네만' 지역 칩은 far 줄을 빼요(place.near — 앱 Nearby.passes 와 같게)", () => {
  const f = RV.filterListings(RV.daangnFar(A, false).rows, { area: 'near', withUnknown: false });
  assert.ok(f.rows.every((l) => l.far !== true));
});

test('앱 기본 보기가 근처만(nearOnly true, 옛 묶음)이면 처음엔 far 줄을 빼고 뒤집으면 넣어요', () => {
  const a = { ...A, nearby: { ...A.nearby, nearOnly: true } };
  assert.equal(RV.daangnFar(a, false).hide, true);
  assert.ok(RV.daangnFar(a, false).rows.every((l) => l.far !== true));
  assert.equal(RV.daangnFar(a, true).rows.length, A.listings.length);
});

test('줄 글은 앱 CardCore.daangnNearLine 그대로(묶음 lines = [가까운 동네만 보는 중, 전체 보는 중])', () => {
  assert.equal(RV.daangnNearLine(7, 2, false), A.nearby.lines[0]);
  assert.equal(RV.daangnNearLine(7, 2, true), A.nearby.lines[1]);
  assert.equal(RV.daangnNearLine(3, 3, false), null);
  assert.equal(RV.daangnNearLine(4, 0, false), '내 동네 근처 당근은 없어요 · 당근 전체 4건 보기');
  assert.equal(RV.daangnNearLine(7, 2, true), '당근 7건 중 내 동네 근처 2건 · 가까운 동네만 보기');
});

test('값이 섞여 전체 판정 보류(묶음 mixedAll)면 칩을 골라도 지금 최저가 칸 없이 그 한 줄(앱 CardCore.screenHero J-1)', () => {
  const line = '여러 물건 값이 섞여 판정 보류 — 모델까지 넣어 검색해 주세요';
  const rows = [
    { key: 'j:1', m: 'j', price: 30000, grade: { k: 'unknown', why: line } },
    { key: 'b:2', m: 'b', price: 900000, grade: { k: 'unknown', why: line } },
  ];
  const h = RV.screenHero(rows, { name: '씰리', market: 'j', mixed: line });
  assert.equal(h.hero, null);
  assert.equal(h.line, line);
  // 칸이 없는 옛 묶음은 예전 고르기 그대로
  assert.equal(RV.screenHero(rows, { name: '씰리' }).hero.key, 'j:1');
});
