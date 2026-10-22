// R12 4단계 — 웹 물건 정하기 '모델' 칸 셈(radar-cmd.js)이 앱 ModelEdit 와 같은 답인지(앱 = 웹, AC-11).
// fixtures/app-models.json = 앱 WebBundleModel4Test.writesModelEditCasesForTheWeb 가 만든 묶음 + 고치기 차례마다 앱 줄·건수.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(`${REPO}/radar-cmd.js`);
const C = globalThis.RadarCmd;
const app = JSON.parse(fs.readFileSync(path.join(REPO, 'test/fixtures/app-models.json'), 'utf8'));
const p = app.product;
const m = p.identify.models;
const kw = p.cfg.keyword;

const bandOf = (k) => {
  if (k === 'none') return null;
  const [i, h] = k.split('|').map(Number);
  const set = C.identifySet(p, { category: p.cfg.category, band: i, withHigher: !!h, words: {} });
  return { lo: set.bandMin, hi: set.bandMax };
};
const strip = (r) => ({ unknown: r.unknown, rows: r.rows.map((x) => ({ n: x.n, c: x.c, mid: x.mid, w: x.w, base: x.base })) });

test('앱 = 웹: 고치기 차례마다 모델 줄(이름·건수·중간값·함께 낱말·기준)·모름 수', () => {
  const d0 = C.cleanDefs(m.defs);
  const ops = { rename: C.renameModel, merge: C.mergeModel, remove: C.removeModel, add: C.addModel };
  let n = 0;
  for (const c of app.cases) {
    const defs = c.op ? ops[c.op[0]](d0, ...c.op.slice(1)) : d0;
    assert.deepEqual(defs, C.cleanDefs(c.defs), `${c.name} 목록`);
    for (const [k, want] of Object.entries(c.bands)) {
      assert.deepEqual(strip(C.modelRows(kw, defs, m, bandOf(k), m.pinned)), want, `${c.name} · 가격대 ${k}`);
      n++;
    }
  }
  assert.equal(n, 20, `견준 경우 ${n}`); // 차례 5 × 가격대 4(고르지 않음 · 0|0 · 0|1 · 1|0)
  assert.ok(app.cases.find((c) => c.name === 'start').bands.none.rows.length >= 2);
});

test('앱 = 웹: 더하기 창 건수(matchCount)·직접 더한 모델 꼴(userModel)', () => {
  for (const [t, want] of Object.entries(app.matchCount)) assert.equal(C.matchCount(m, t), want, t);
  const names = ['크로스웨이브 맥스', 'Crosswave MAX 3.0', '  스팟클린  '];
  names.forEach((t, i) => assert.deepEqual(C.userModel(t), app.userModel[i], t));
});

const chk = (o) => C.validate({ v: 1, kind: 'junggo-radar-cmd', from: 'web', id: 'c_mgy3k2a1_7f2kq', at: 1790000000000, type: 'identify', pid: 'b', ...o });
test('고치기 거절·명령 검사(앱 WebCmd.modelsOk 와 같은 값)', () => {
  const d0 = C.cleanDefs(m.defs);
  const [a, b] = C.modelNames(d0);
  assert.deepEqual(C.renameModel(d0, a, ' '), d0);
  assert.deepEqual(C.renameModel(d0, a, b), d0);
  assert.deepEqual(C.renameModel(d0, a, C.UNKNOWN_MODEL), d0);
  assert.deepEqual(C.addModel(d0, a), d0);
  assert.deepEqual(C.mergeModel(d0, a, '없는 모델'), d0);
  const ok = { defs: d0, off: false, user: true, renamed: { [a]: '새 이름' } };
  assert.ok(C.modelsOk(ok));
  assert.equal(chk({ set: { category: '', bandMin: null, bandMax: null, excludeWords: [], includeWords: [], models: ok } }), '');
  assert.equal(chk({ set: { category: '', bandMin: null, bandMax: null, excludeWords: [], includeWords: [] } }), '', 'models 없음 = 예전 꼴');
  assert.ok(!C.modelsOk({ ...ok, defs: [{ n: 'x', need: [] }] }));
  assert.ok(!C.modelsOk({ ...ok, off: 'no' }));
  assert.ok(!C.modelsOk({ ...ok, defs: Array.from({ length: 21 }, (_, i) => ({ n: 'm' + i, need: ['m' + i] })) }));
  assert.equal(chk({ set: { category: '', bandMin: null, bandMax: null, excludeWords: [], includeWords: [], models: { defs: 'x' } } }), 'identify');
});
