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
const strip = (r) => ({ unknown: r.unknown, rows: r.rows.map((x) => ({ n: x.n, c: x.c, mid: x.mid, w: x.w, base: x.base, held: x.held })) });

test('앱 = 웹: 고치기 차례마다 모델 줄(이름·건수·중간값·함께 낱말·기준·보류)·모름 수', () => {
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

test('붙여 쓴 상표 앞말 떼기(B-2) — 앱 ModelsB1Test.gluedBrandPrefixIsSplit 와 같은 답', () => {
  assert.deepEqual(C.unglue('맥북프로'), ['맥북', '프로']);
  assert.deepEqual(C.unglue('에어팟맥스'), ['에어팟', '맥스']);
  assert.deepEqual(C.unglue('다이슨무선청소기'), ['다이슨', '무선청소기']);
  assert.deepEqual(C.unglue('갤럭시탭'), ['갤럭시탭']);
  assert.deepEqual(C.unglue('애플워치'), ['애플워치']);
  assert.deepEqual(C.unglue('빔프로젝터'), ['빔프로젝터']);
  assert.equal(C.hits('맥북프로 m1 16gb', '프로'), true);
  assert.equal(C.hits('에어팟맥스 실버', 'max'), true);
  assert.equal(C.hits('빔프로젝터', '프로'), false);
  const defs = [{ n: '프로', need: ['프로'] }, { n: '에어', need: ['에어'] }];
  assert.equal(C.assignModel(defs, '맥북프로 14인치'), '프로');
  assert.equal(C.assignModel(defs, '맥북 프로 14인치'), '프로');
});

test('직접 더한 영문·숫자 모델은 한 덩어리로(B-6) — 앱 ModelsB6Test 와 같은 답', () => {
  assert.deepEqual(C.userModel('v12').need, ['v12']);
  assert.deepEqual(C.userModel('v 12').need, ['v12']);
  assert.deepEqual(C.userModel('m-1').need, ['m1']);
  assert.deepEqual(C.userModel('크로스웨이브 맥스').need, ['크로스웨이브', '맥스']);
  assert.equal(C.userModel('pro 14').need.length, 2);
  const add = (...ns) => ns.reduce((d, n) => C.addModel(d, n), []);
  const dyson = add('v8', 'v10', 'v12', 'v15');
  assert.equal(C.assignModel(dyson, '깨끗하게 세척한 다이슨 V6 무선 청소기(12분 사용)'), C.UNKNOWN_MODEL);
  assert.equal(C.assignModel(dyson, '다이슨 v8 12개월 사용'), 'v8');
  const mac = add('m1', 'm2', 'm3', 'm4');
  assert.equal(C.assignModel(mac, '맥북 프로 14인치 M5 32GB 1TB 실버'), C.UNKNOWN_MODEL);
  assert.equal(C.assignModel(mac, '맥북 파워 어댑터 67와트와 c to c 케이블(2m)'), C.UNKNOWN_MODEL);
  assert.equal(C.assignModel(add('s7', 's8', 's9', 's10'), '갤럭시 탭 S6 Lite 10.4인치 64기가'), C.UNKNOWN_MODEL);
  for (const t of ['다이슨 V12 디텍트 슬림', '다이슨 v 12 디텍트', '다이슨 v-12', '다이슨v12 무선', '다이슨 V12s 디텍트 슬림 서브마린', '다이슨(V12)']) assert.ok(C.hits(t, 'v12'), t);
  for (const t of ['맥북 에어 M1 8기가', '맥북프로 m1pro 14인치', '맥북 M1 프로 16', '맥북에어m1']) assert.ok(C.hits(t, 'm1'), t);
  for (const t of ['다이슨 v120', '로봇 dv12', '다이슨 v6 12분', '다이슨 v 12개월 사용', '다이슨 v12.5', 'v / 12']) assert.ok(!C.hits(t, 'v12'), t);
  assert.ok(!C.hits('맥북 m11', 'm1'));
  assert.ok(!C.hits('갤럭시탭 s 10.4인치', 's10'));
  assert.ok(!C.hits('갤럭시탭 s10인치', 's10'));
});

test('앱 = 웹: 붙은 영문·숫자 모델 맞추기·모델 글 → need·추천 칩·안내 글(B-5·B-6·B-8, 앱 WebBundleModel4Test 가 만든 답)', () => {
  let n = 0;
  for (const [t, w, want] of app.glued) { assert.equal(C.hits(t, w), want, `${t} / ${w}`); n++; }
  assert.ok(n >= 150, `견준 경우 ${n}`);
  for (const [t, want] of Object.entries(app.userWords)) assert.deepEqual(C.userModel(t).need, want, t);
  const cc = app.chipCase;
  assert.deepEqual(C.modelChips(cc.cands, C.cleanDefs(cc.defs)).map((c) => c.n), cc.want);
  assert.deepEqual(C.modelChips(cc.cands, []).map((c) => c.n), cc.wantEmpty);
  assert.equal(C.modelIntro(false, []), app.intro.none);
  assert.equal(C.modelIntro(true, C.cleanDefs(cc.defs)), app.intro.user);
  assert.equal(C.modelIntro(false, C.cleanDefs(cc.defs)), app.intro.auto);
  assert.equal(C.MODEL_TEXT.chipLabel, app.intro.chipLabel);
  // 앱이 묶음에 실은 칩 재료(Models.suggest)
  assert.ok(Array.isArray(m.cands) && m.cands.every((c) => typeof c.n === 'string' && Number.isFinite(c.c) && Number.isFinite(c.mid)));
});

test('앱 = 웹: 겹치는 모델 잇기(nest)·낱말을 더 품은 모델이 좁은 쪽(B-7)', () => {
  const d0 = C.cleanDefs(m.defs);
  for (const [t, want] of Object.entries(app.nest)) assert.deepEqual(C.addModel(d0, t, m), C.cleanDefs(want), t);
  assert.ok(Object.values(app.nest).some((ds) => ds.some((d) => d.u)), '이어진 경우가 하나는 있어야');
  const sd = C.cleanDefs(app.specDefs);
  for (const [t, want] of app.assignCases) assert.equal(C.assignModel(sd, t), want, t);
});

test('앱 = 웹: 값이 섞인 사람 모델은 판정 보류(R-1 후속) — 값 고르기·모델 줄 held·화면 묶음 held 한 줄', async () => {
  for (const [ps, want] of app.tightCases) assert.equal(C.tightOk(ps), want, JSON.stringify(ps));
  const mx = app.mixed;
  const rows = C.modelRows('다이슨', C.cleanDefs(mx.defs), { items: mx.items }, null, null).rows;
  assert.deepEqual(rows.filter((r) => r.held).map((r) => r.n), mx.held);
  assert.deepEqual(mx.held, ['v8']);
  assert.equal(mx.hint, '값이 섞여 판정 보류 — 더 좁혀 주세요');
  // v8 매물 제목엔 좁힐 말이 없어 예시 없이(앱 hint 그대로)
  assert.deepEqual(rows.map((r) => (r.held ? (r.ex ? mx.hint + r.ex : mx.hint) : null)), mx.hints);
  await import(`${REPO}/radar-view.js`);
  const RV = globalThis.RadarView;
  const hp = app.heldBundle.products[0];
  assert.deepEqual(hp.held.names, ['v8']);
  const ls = RV.filterListings(hp.listings, {}).heroRows;
  const o = { name: hp.name, base: hp.baseVariant, term: hp.term, held: hp.held };
  // 기준 모델(v8)이 보류 → 칸 없음 + 앱이 준 한 줄(앱 statePage 와 같은 글)
  const h = RV.screenHero(ls, o);
  assert.equal(h.hero, null);
  assert.equal(h.line, hp.statePage);
  assert.equal(h.line, '지금 최저가 · v8 · 값이 섞여 판정 보류');
  // v10 칩 → v10 안의 지금 최저가(앱 결과 화면과 같은 매물)
  const h10 = RV.screenHero(RV.filterListings(hp.listings, { variant: 'v10' }).heroRows, { ...o, chip: 'v10' });
  assert.equal(h10.hero && h10.hero.price, 150000);
  // 보류 모델 매물의 판정 이유는 앱 글 그대로
  assert.ok(hp.listings.filter((l) => l.variant === 'v8' && l.price > 0).every((l) => l.grade.k === 'unknown' && l.grade.why === 'v8 값이 섞여 판정 보류'));
});

test('앱 = 웹: 보류 모델을 좁힐 예시(R12 마무리) — narrowWord·모델 줄 글·거르는 낱말 목록', () => {
  const nw = app.narrow;
  assert.deepEqual([...C.NOT_MODEL].sort(), [...nw.notModel].sort());
  assert.deepEqual(C.NOT_MODEL_PART, nw.notModelPart);
  assert.deepEqual(C.NARROW_SKIP, nw.narrowSkip);
  for (const c of nw.cases) {
    const ls = c.items.map(([title, price]) => ({ title, price }));
    assert.equal(C.narrowWord(c.model, ls, c.kw, c.need, c.names), c.want, `${c.model} ${ls.length}건`);
  }
  assert.ok(nw.cases.some((c) => c.want === 'm1 에어') && nw.cases.some((c) => c.want === 'm1 프로') && nw.cases.some((c) => c.want === null));
  const rows = C.modelRows('맥북', C.cleanDefs(nw.defs), { items: nw.items }, null, null).rows;
  const text = (r) => (r.held ? (r.ex ? nw.hintEx.replace('{예시}', () => r.ex) : '값이 섞여 판정 보류 — 더 좁혀 주세요') : null);
  for (const r of rows) assert.equal(text(r), nw.hints[r.n], r.n);
  assert.equal(nw.hints.m1, '값이 섞여 판정 보류 — 더 좁혀 주세요(예: m1 에어)');
  assert.equal(nw.hints.m2, null);
});
