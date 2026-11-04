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

test('앱 묶음: 기본 줄 count 그대로 + 근처 밖 당근 줄은 far:true 로 따로', () => {
  const far = A.listings.filter((l) => l.far === true);
  assert.equal(A.count, A.listings.length - far.length);
  assert.deepEqual(keys(far), ['d:f1', 'd:f2', 'd:f3', 'd:f4', 'd:f5']);
  assert.ok(far.every((l) => l.m === 'd' && l.place && l.place.near !== true));
  assert.equal(A.nearby.total, 7);
  assert.equal(A.nearby.near, 2);
  assert.equal(A.nearby.far, 5);
  assert.equal(A.nearby.nearOnly, true);
  assert.equal(A.nearby.lines.length, 2);
});

test('근처만(기본)엔 far 줄을 빼고, 전체 보기면 넣어요', () => {
  const off = RV.daangnFar(A, false);
  assert.equal(off.nearOnly, true);
  assert.equal(off.has, true);
  assert.equal(off.hide, true);
  assert.equal(off.rows.length, A.count);
  assert.ok(off.rows.every((l) => l.far !== true));
  const on = RV.daangnFar(A, true);
  assert.equal(on.hide, false);
  assert.equal(on.rows.length, A.listings.length);
  // 전체 보기의 지금 최저가는 근처 밖 더 싼 당근(앱 ResultsScreen allDaangn 과 같은 고르기 — 판정은 앱이 낸 grade.k 그대로)
  const f = RV.filterListings(on.rows, {});
  const h = RV.screenHero(f.heroRows, { name: '씰리', base: A.baseVariant });
  const fOff = RV.filterListings(off.rows, {});
  const hOff = RV.screenHero(fOff.heroRows, { name: '씰리', base: A.baseVariant });
  assert.equal(hOff.hero && hOff.hero.key, A.lowKey || null);
  assert.ok(h.hero);
  assert.ok(Number(h.hero.price) <= Number(hOff.hero ? hOff.hero.price : Infinity));
});

test("'가까운 동네만' 지역 칩은 far 줄을 빼요(place.near — 앱 Nearby.passes 와 같게)", () => {
  const on = RV.daangnFar(A, true);
  const f = RV.filterListings(on.rows, { area: 'near', withUnknown: false });
  assert.ok(f.rows.every((l) => l.far !== true));
});

test('앱 기본 보기가 전체(nearOnly false)면 처음부터 far 줄을 보여요', () => {
  const a = { ...A, nearby: { ...A.nearby, nearOnly: false } };
  const r = RV.daangnFar(a, false);
  assert.equal(r.nearOnly, false);
  assert.equal(r.hide, false);
  assert.equal(r.rows.length, A.listings.length);
});

test('옛 묶음(far 줄·nearOnly 없음)은 근처만 그대로 · 줄 글은 앱 CardCore 글', () => {
  const old = { ...A, listings: A.listings.filter((l) => !l.far), nearby: { total: 7, near: 2 } };
  const r = RV.daangnFar(old, true);
  assert.equal(r.nearOnly, true);
  assert.equal(r.has, false);
  assert.equal(r.rows.length, A.count);
  assert.equal(RV.daangnNearLine(7, 2, false), A.nearby.lines[0]);
  assert.equal(RV.daangnNearLine(7, 2, true), A.nearby.lines[1]);
  assert.equal(RV.daangnNearLine(3, 3, false), null);
  assert.equal(RV.daangnNearLine(4, 0, false), '내 동네 근처 당근은 없어요 · 당근 전체 4건 보기');
});
