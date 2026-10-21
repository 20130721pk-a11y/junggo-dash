// 웹 조작 1판 명령 도우미 시험 (node --test test/*.test.mjs) — 꼴(docs/command-v1.md)·잠금·문턱·상태·카드 제안·조건 창 바꾼 칸
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(`${REPO}/box.js`);
await import(`${REPO}/radar-cmd.js`);
const C = globalThis.RadarCmd;
const BOX = globalThis.JunggoBox;
const { open: openNode, seal: sealNode, deriveKey: deriveNode } = await import(`${REPO}/collector/seal.mjs`);
const FX = await import('./fixtures/make-cmds.mjs');
const M = 60e3, H = 3600e3;
const NOW = FX.AT;

test('웹 → 앱 자료 파일이 만드는 스크립트와 같은 명령이에요(열어서 같음)', () => {
  const file = JSON.parse(fs.readFileSync(path.join(REPO, 'test/fixtures/web-cmds.json'), 'utf8'));
  assert.equal(file.label, 'junggo-radar-cmd');
  assert.equal(file.title, '꿀매 레이더 명령');
  const plains = FX.plains();
  assert.equal(file.items.length, plains.length);
  const key = deriveNode(file.password, file.salt, file.iter);
  file.items.forEach((it, i) => {
    // 앱 DashBox 와 같은 셈의 다른 구현(수집기 seal.mjs)으로 열어요 — 앱이 열 수 있다는 뜻
    const got = openNode(it.box, () => key, 'junggo-radar-cmd');
    assert.deepEqual(got, it.plain);
    assert.deepEqual(got, plains[i]);
    assert.equal(C.validate(got, NOW), '', it.type);
    assert.equal(it.box.salt, file.salt);
    assert.equal(it.box.iter, file.iter);
  });
});

test('자료에 명령 종류 21개가 모두 있어요', () => {
  const types = new Set(FX.plains().map((p) => p.type));
  assert.deepEqual([...types].sort(), [...C.TYPES].sort());
});

test('용도 이름이 다르면 못 열어요(묶음·토큰 상자로 바꿔치기 막기)', async () => {
  const key = await BOX.deriveKey('pw-시험', FX.SALT, 100000);
  const c = C.make('check', {}, NOW);
  const box = await C.seal(c, key, FX.SALT, 100000);
  await assert.rejects(() => BOX.open(box, key, 'junggo-radar-view'));
  assert.deepEqual(await C.open(box, key), c);
  const nodeBox = sealNode(c, deriveNode('pw-시험', FX.SALT, 100000), FX.SALT, 'junggo-radar-view', 100000);
  await assert.rejects(() => C.open(nodeBox, key));
});

test('명령 열쇠는 꺼낼 수 없고(메모리에만) 같은 비밀번호면 같은 상자를 열어요', async () => {
  const k = await C.deriveCmdKey('pw-시험', FX.SALT, 100000);
  assert.equal(k.extractable, false);
  await assert.rejects(() => crypto.subtle.exportKey('raw', k));
  const c = C.make('adhoc', { q: '에어팟' }, NOW);
  const box = await C.seal(c, k, FX.SALT, 100000);
  assert.deepEqual(openNode(box, () => deriveNode('pw-시험', FX.SALT, 100000), 'junggo-radar-cmd'), c);
  await assert.rejects(() => C.deriveCmdKey('', FX.SALT, 100000));
});

test('id 꼴 · 보낸 시각 범위', () => {
  const id = C.newId(NOW);
  assert.match(id, C.ID_RE);
  assert.ok(id.startsWith('c_' + NOW.toString(36) + '_'));
  const c = C.make('check', {}, NOW);
  assert.equal(C.validate(c, NOW + 6 * 24 * H), '');
  assert.equal(C.validate(c, NOW + 8 * 24 * H), 'at'); // 7일 넘음
  assert.equal(C.validate({ ...c, at: NOW + 11 * M }, NOW), 'at'); // 시계가 10분 넘게 앞
  assert.equal(C.validate({ ...c, id: 'x' }, NOW), 'id');
  assert.equal(C.validate({ ...c, kind: 'junggo-radar-view' }, NOW), 'head');
  assert.equal(C.validate({ ...c, v: 2 }, NOW), 'head');
  assert.equal(C.validate({ ...c, type: 'eval' }, NOW), 'type');
});

test('정해진 칸만 — 틀린 명령은 만들지 않아요(L-12)', () => {
  const bad = [
    ['add', { q: '  ' }], ['add', { q: '4080', card: 'gpu:40800' }], ['add', { q: '4080', card: 'http://x' }],
    ['edit', { pid: 's_1', set: { hiddenKeys: [] }, base: { hiddenKeys: [] } }],
    ['edit', { pid: 's_1', set: { thresholdPct: 20 }, base: {} }],
    ['edit', { pid: 's_1', set: {}, base: {} }],
    ['edit', { pid: 's_1', set: { maxKm: 7 }, base: { maxKm: null } }],
    ['edit', { pid: 's_1', set: { category: 'cars' }, base: { category: '' } }],
    ['focus', { op: 'start', ids: ['a', 'b', 'c'], hours: 1, everyMin: 5 }],
    ['focus', { op: 'start', ids: ['a'], hours: 4, everyMin: 5 }],
    ['star', { key: 'x:1', on: true }], ['star', { key: 'j:1' }],
    ['hide', { pid: 's_1', key: 'j 1' }],
    ['share', { url: 'https://evil.example/daangn.com' }], ['share', { url: 'http://m.bunjang.co.kr/products/1' }],
    ['share', { url: 'https://m.bunjang.co.kr.evil.com/products/1' }], ['share', { url: 'https://daangn.page.link/abc' }],
    ['inboxRead', { ids: [] }], ['recent', { op: 'del' }], ['recent', { op: 'restore' }],
    ['prefs', { set: { defaultPct: 50 }, base: { defaultPct: 15 } }],
    ['prefs', { set: { quiet: { on: true, start: 1 } }, base: { quiet: null } }],
    ['home', { set: { other: 'x' }, base: { other: '' } }],
    ['nope', {}],
  ];
  for (const [t, f] of bad) assert.throws(() => C.make(t, f, NOW), /명령 꼴/, `${t} ${JSON.stringify(f)}`);
});

test('share 는 3사 호스트와 정확히 같을 때만(L-6)', () => {
  assert.equal(C.shareOk('https://web.joongna.com/product/123'), true);
  assert.equal(C.shareOk('https://www.daangn.com/kr/buy-sell/x-1/'), true);
  assert.equal(C.shareOk('https://m.bunjang.co.kr/products/1'), true);
  assert.equal(C.shareOk('https://WEB.JOONGNA.COM/product/1'), true);
  assert.equal(C.shareOk('https://user:pw@web.joongna.com/product/1'), false);
  assert.equal(C.shareOk('https://web.joongna.com:8443/product/1'), false);
  assert.equal(C.shareOk('https://joongna.com.evil.io/'), false);
  assert.equal(C.shareOk('javascript:alert(1)'), false);
  assert.equal(C.shareOk(''), false);
});

test('카드 제안 = 앱 Products.suggest (그래픽카드 4자리 번호 · 플스5)', () => {
  const s = (k) => { const c = C.suggest(k); return c ? `${c.id}|${c.title}` : null; };
  assert.equal(s('4080'), 'gpu:4080|RTX 4080');
  assert.equal(s('RTX 4080'), 'gpu:4080|RTX 4080');
  assert.equal(s('rtx-4080'), 'gpu:4080|RTX 4080');
  assert.equal(s('지포스 4080'), 'gpu:4080|RTX 4080');
  assert.equal(s('9070'), 'gpu:9070|RX 9070');
  assert.equal(s('1660'), 'gpu:1660|GTX 1660');
  assert.equal(s('5090'), 'gpu:5090|RTX 5090');
  assert.equal(s('5500'), 'gpu:5500|RX 5500');
  assert.equal(s('2080'), 'gpu:2080|RTX 2080');
  assert.equal(s('4070 ti super'), null); // 앱 GPU_NUM 은 번호만 — 시안 예와 다름(노트 '확인 필요')
  assert.equal(s('4080s'), null);
  assert.equal(s('40800'), null);
  assert.equal(s('플스5'), 'console:ps5|플레이스테이션 5');
  assert.equal(s('PS5'), 'console:ps5|플레이스테이션 5');
  assert.equal(s('플레이스테이션 5'), 'console:ps5|플레이스테이션 5');
  assert.equal(s('ps5 프로'), null); // 변형을 정한 검색어는 카드로 안 감(Variants.splits)
  assert.equal(s('ps5 슬림'), null);
  assert.equal(s('플스5, ps5'), 'console:ps5|플레이스테이션 5');
  assert.equal(s('에어팟 프로2'), null);
  assert.equal(s(' , 4080'), 'gpu:4080|RTX 4080'); // 빈 표기는 버리고 첫 표기
  assert.equal(s(''), null);
  assert.equal(C.suggest('4080').sub, '그래픽카드 · 완본체·노트북 빼고 · 변형(SUPER·Ti·XT) 따로');
  assert.deepEqual(C.QUICK.map((c) => c.title), ['RTX 4080', 'RTX 5070', 'RTX 5080', 'RX 9070', '플레이스테이션 5']);
});

test("'+ 물건' 지켜보는 카드 = 앱 Products.watching · 확인 창 글 = 앱 StopWatch (0.7.2 R5)", () => {
  const P = (id, keyword) => ({ id, name: keyword, cfg: { keyword } });
  const list = [P('a', '4080'), P('b', 'rtx 4080'), P('c', '4080, 4080s'), P('d', '4080 super'), P('e', '플스5 디지털'), P('f', '5070 ti'), P('g', '에어팟 프로2')];
  assert.deepEqual(C.watchingCard('gpu:4080', list).map((p) => p.id), ['a', 'b', 'c']);
  assert.deepEqual(C.watchingCard('console:ps5', list), []);
  assert.deepEqual(C.watchingCard('gpu:5070', list), []);
  assert.deepEqual(C.watchingCard('console:ps5', [P('p', 'PS5'), P('q', 'ps5 프로')]).map((p) => p.id), ['p']);
  assert.deepEqual(C.watchingCard('gpu:4080', [{ id: 'x' }, null, 'y']), []); // cfg 없는 옛 묶음
  for (const c of C.QUICK) assert.deepEqual(C.watchingCard(c.id, [P('x', c.keyword)]).map((p) => p.id), ['x'], c.id);
  // 앱 Release072Test.r5_dialogTexts 와 같은 글
  assert.equal(C.STOP.title('RTX 4080'), "'RTX 4080' 그만 지켜볼까요?");
  assert.equal(C.STOP.body, '지금 최저가·매물 장부·가격 기록이 지워지고 되돌릴 수 없어요. 다시 추가하면 처음부터 모아요.');
  assert.equal(C.STOP.focus, '집중 감시도 함께 꺼져요.');
  assert.deepEqual([C.STOP.cancel, C.STOP.ok], ['취소', '지우기']);
  assert.equal(C.STOP.pickTitle('RTX 4080', 2), "'RTX 4080' 카드로 지켜보는 물건이 2개예요");
  assert.equal(C.STOP.cardLine, '지켜보는 중 · 누르면 그만');
  assert.equal(C.STOP.cardSpeech('RTX 4080'), 'RTX 4080, 지켜보는 중, 누르면 그만 지켜보기');
});

const P0 = {
  id: 's_4080', name: 'RTX 4080',
  cfg: { keyword: '4080', thresholdPct: 15, targetPrice: 1200000, variantPick: '', matchMode: 'title', category: 'pc', excludeWords: ['본체', '노트북'], includeWords: [],
    bandMin: 850000, bandMax: null, basicFilter: true, hiddenCount: 2, priceMin: null, priceMax: null, regionWords: [], maxKm: null, maxAgeDays: null, lowestAlert: true, confirmed: true, label: 'RTX 4080' },
  cfgText: { targetPrice: '120만', bandMin: '85만', bandMax: '', priceMin: '', priceMax: '' },
};

test('조건 창: 처음 값은 앱 조건 창과 같은 글, 바꾼 칸만 + 바꾸기 전 값(기획 2-5)', () => {
  const init = C.editInit(P0);
  assert.equal(init.excludeWords, '본체, 노트북');
  assert.equal(init.targetPrice, '120만');
  assert.equal(init.maxAgeDays, 30);
  assert.equal(init.customPct, false);
  assert.deepEqual(C.editDiff(P0, init), { set: {}, base: {}, changed: [] });
  const f = { ...init, thresholdPct: 20, targetPrice: '110만', excludeWords: '본체, 노트북 ', maxAgeDays: 60, keyword: '   ' };
  const d = C.editDiff(P0, f);
  assert.deepEqual(d.set, { thresholdPct: 20, targetPrice: '110만', maxAgeDays: 60 });
  assert.deepEqual(d.base, { thresholdPct: 15, targetPrice: 1200000, maxAgeDays: null });
  assert.deepEqual(C.changedLabels(['bandMin', 'bandMax', 'thresholdPct']), ['물건 가격대', '꿀매 기준']);
  // 만든 명령이 꼴에 맞음
  assert.equal(C.validate(C.make('edit', { pid: P0.id, ...d }, NOW), NOW), '');
  assert.equal(C.editInit({ id: 'x' }), null);
});

test('물건 정하기: 고른 값 → identify 칸(앱 시트와 같은 셈), 미리보기는 앱이 센 것만', () => {
  const p = { ...P0, cfg: { ...P0.cfg, bandMin: null, bandMax: null, category: 'game' }, identify: {
    bands: [{ lo: 10000, hi: 90000, n: 22, mid: 40000, tags: '게임 · 타이틀' }, { lo: 350000, hi: 520000, n: 31, mid: 410000, tags: '디스크 · 슬림' }],
    pick: { index: 1, withHigher: false }, words: [{ w: '게임', n: 22, s: 1 }, { w: '디스크', n: 31, s: 0 }], keptEx: ['타이어'], keptIn: [],
    previews: { '1|0': { n: 26, low: { price: 410000, title: '플스5 디스크' }, doubt: 2 }, '1|1': { n: 29, low: null, doubt: 0 } } } };
  const sel = { category: 'game', band: 1, withHigher: false, words: { 게임: 1, 디스크: 0 } };
  assert.deepEqual(C.identifySet(p, sel), { category: 'game', bandMin: 350000, bandMax: 520000, excludeWords: ['타이어', '게임'], includeWords: [] });
  assert.deepEqual(C.identifySet(p, { ...sel, withHigher: true }).bandMax, null);
  assert.equal(C.identifyPreview(p, sel).pv.n, 26);
  assert.equal(C.identifyPreview(p, { ...sel, withHigher: true }).pv.low, null);
  assert.equal(C.identifyPreview(p, { ...sel, words: { 게임: 0, 디스크: 0 } }).kind, 'words');
  assert.equal(C.identifyPreview(p, { ...sel, category: 'pc' }).kind, 'category');
  assert.equal(C.identifyPreview(p, { ...sel, band: 0 }).kind, 'none');
  // 가격대를 고르지 않고 추천도 없으면 예전 값 그대로(앱 keepOld)
  const q = { ...P0, identify: { bands: [], pick: null, words: [], keptEx: [], keptIn: [] } };
  assert.deepEqual(C.identifySet(q, { category: 'pc', band: null, words: {} }), { category: 'pc', bandMin: 850000, bandMax: null, excludeWords: [], includeWords: [] });
});

test('상태: 결과 줄 > 취소 > 이슈 닫힘(하는 중) > 보냄, 그 자리 한 줄 글(디자인 5-1)', () => {
  const rec = { id: 'c_x1y2z3_aaaaa', n: 3, type: 'edit', pid: 's_4080', at: NOW, fields: ['keyword'] };
  assert.equal(C.stateOf(rec, { cmds: [] }, null).st, 'sent');
  assert.equal(C.stateOf(rec, { cmds: [] }, { state: 'closed', reason: 'completed' }).st, 'running');
  assert.equal(C.stateOf({ ...rec, cancel: true }, { cmds: [] }, null).st, 'cancel');
  const b = (state, extra) => ({ cmds: [{ id: rec.id, state, ...extra }] });
  assert.equal(C.stateOf(rec, b('running'), null).st, 'running');
  assert.equal(C.stateOf({ ...rec, cancel: true }, b('done'), null).st, 'done'); // 앱이 먼저 받았으면 결과가 이김
  assert.equal(C.lineOf(rec, { st: 'sent' }).text, '보냈어요 · 앱이 받기를 기다려요');
  assert.equal(C.lineOf(rec, { st: 'sent' }, { appOff: true }).text, '보냈어요 · 앱이 켜지면 처리해요');
  assert.equal(C.lineOf(rec, { st: 'running' }).text, '새 조건으로 다시 모아 시세를 내는 중…');
  assert.equal(C.lineOf({ ...rec, type: 'adhoc' }, { st: 'running' }).text, '앱이 하는 중 · 세 마켓에서 모으는 중');
  assert.equal(C.lineOf({ ...rec, type: 'star' }, { st: 'running' }).text, '앱이 하는 중');
  assert.equal(C.lineOf(rec, { st: 'done', row: {} }).text, '끝났어요');
  assert.equal(C.lineOf(rec, { st: 'done', row: { why: '이미 지켜보는 물건이에요' } }).text, '끝났어요 — 이미 지켜보는 물건이에요');
  const st = C.lineOf(rec, { st: 'stale', row: {} });
  assert.equal(`${st.lead} — ${st.text}`, '못 했어요 — 너무 오래돼 하지 않았어요');
  const cf = C.lineOf(rec, { st: 'conflict', row: { applied: ['thresholdPct'], why: '일부만 바꿨어요 — 목표가는 앱에서 먼저 바뀌었어요' } });
  assert.equal(`${cf.lead} — ${cf.text}`, '일부만 바꿨어요 — 목표가는 앱에서 먼저 바뀌었어요');
  const cf2 = C.lineOf(rec, { st: 'conflict', row: { applied: [] } });
  assert.equal(`${cf2.lead} — ${cf2.text}`, '못 했어요 — 앱에서 먼저 바뀌었어요 — 새로 고친 뒤 다시 해 주세요');
  const fl = C.lineOf(rec, { st: 'failed', row: { why: '1시간에 6번까지예요' } });
  assert.equal(`${fl.lead} — ${fl.text}`, '못 했어요 — 1시간에 6번까지예요');
});

test('화면 이름(what) — command-v1 7장 규칙', () => {
  const w = (t, f, n) => C.what({ type: t, ...f }, n);
  assert.equal(w('edit', { pid: 'a' }, { product: 'RTX 4080' }), 'RTX 4080 조건 바꾸기');
  assert.equal(w('add', { q: '4080', card: 'gpu:4080' }, { card: 'RTX 4080' }), 'RTX 4080 추가');
  assert.equal(w('add', { q: '에어팟 프로2, airpods' }), '에어팟 프로2 추가');
  assert.equal(w('check', {}), '지금 모두 확인');
  assert.equal(w('check', { pid: 'a' }, { product: '플스5' }), '플스5 지금 확인');
  assert.equal(w('adhoc', { q: '4080 super' }), "그냥 검색 '4080 super'");
  assert.equal(w('star', { on: true }, { title: '이엠텍 RTX 4080 미라클 블랙 몬스터 화이트' }), '★ 지켜보기 · 이엠텍 RTX 4080 미라클 블랙 …');
  assert.equal(w('hide', {}, { title: '짧은 제목' }), '이 매물 아님 · 짧은 제목');
  assert.equal(w('move', { dir: 'down' }, { product: 'A' }), 'A 아래로');
  assert.equal(w('focus', { op: 'stop' }), '집중 감시 멈추기');
  assert.equal(w('recent', { op: 'clear' }), '최근 검색 모두 지우기');
});

test('그냥 검색 1시간 6번 — 앱이 센 값 + 웹이 그 뒤 보낸 것, 보관 결과·실패는 안 셈', () => {
  const made = NOW - 5 * M;
  const bundle = { made, quota: { adhoc: { used: 2, limit: 6, times: [NOW - 50 * M, NOW - 20 * M] } }, cmds: [{ id: 'c_cached_bbbbb', cached: true, state: 'done' }] };
  const sent = [
    { id: 'c_old000_aaaaa', type: 'adhoc', at: NOW - 30 * M }, // 묶음 전 — 앱 셈에 이미 들어감
    { id: 'c_new001_aaaaa', type: 'adhoc', at: NOW - 2 * M },
    { id: 'c_cached_bbbbb', type: 'adhoc', at: NOW - 1 * M },
  ];
  const u = C.adhocUse(bundle, sent, NOW);
  assert.equal(u.used, 3);
  assert.equal(u.full, false);
  const full = C.adhocUse({ made, quota: { adhoc: { used: 6, limit: 6, times: [NOW - 50 * M, NOW - 40 * M, NOW - 30 * M, NOW - 20 * M, NOW - 10 * M, NOW - 6 * M] } } }, [], NOW);
  assert.equal(full.full, true);
  assert.equal(full.waitMin, 10); // 가장 옛 것(50분 전)이 1시간에서 빠질 때까지
  assert.equal(C.adhocUse(null, [], NOW).limit, 6);
});

test('지금 모두 확인 30분 · 30분 안 같은 검색어는 묶음 결과로(보내지 않음)', () => {
  assert.equal(C.checkAllWait({ quota: { checkAllAt: NOW - 10 * M } }, [], NOW), 20);
  assert.equal(C.checkAllWait({ quota: { checkAllAt: NOW - 31 * M } }, [], NOW), 0);
  assert.equal(C.checkAllWait({}, [{ type: 'check', all: true, at: NOW - 29 * M }], NOW), 1);
  const b = { adhoc: [{ q: '4080 Super', at: NOW - 29 * M }, { q: '에어팟', at: NOW - 31 * M }] };
  assert.ok(C.adhocCached(b, '4080super', NOW));
  assert.equal(C.adhocCached(b, '에어팟', NOW), null);
  assert.equal(C.adhocCached(b, '', NOW), null);
});

test('보낸 기록: 7일 넘은 것·이상한 것은 버리고, 검색어·제목은 안 남겨요', () => {
  const c = C.make('adhoc', { q: '비밀 검색어' }, NOW);
  const r = C.slim(c, 12);
  assert.deepEqual(Object.keys(r).sort(), ['at', 'id', 'n', 'type']);
  assert.ok(!JSON.stringify(r).includes('비밀'));
  const e = C.slim(C.make('edit', { pid: 's_1', set: { keyword: '4080s' }, base: { keyword: '4080' } }, NOW), 3);
  assert.deepEqual(e.fields, ['keyword']);
  assert.ok(!JSON.stringify(e).includes('4080s'));
  assert.equal(C.pruneSent([r, { ...r, at: NOW - 8 * 24 * H }, { id: 'bad' }, null], NOW + M).length, 1);
});

test('시세 탭 숫자 = 앱 PriceView (중앙·사분위·눈금 끝·마켓별)', () => {
  assert.equal(C.quant([10, 20, 30, 40], 0.5), 25);
  assert.equal(C.quant([10, 20, 30, 40], 0.25), 17); // 10 + 10*0.75 = 17.5 → 버림
  assert.equal(C.quant([7], 0.9), 7);
  assert.equal(C.niceCeil(1234567), 1500000);
  assert.equal(C.niceCeil(2000000), 2000000);
  assert.equal(C.niceCeil(0), 10000);
  const rows = [['j', 900000], ['j', 1000000], ['d', 950000], ['b', 1200000], ['b', 0], ['d', null]].map(([m, price], i) => ({ key: `${m}:${i}`, m, price }));
  const s = C.priceStats(rows);
  assert.equal(s.count, 4);
  assert.equal(s.median, 975000);
  assert.equal(s.minL.key, 'j:0');
  assert.equal(s.maxL.key, 'b:3');
  assert.deepEqual(s.dists.map((d) => [d.m, d.count]), [['j', 2], ['d', 1], ['b', 1]]);
  assert.equal(C.priceStats(rows.slice(0, 3)), null); // 4건 미만
  const bar = C.priceBar(980000, { med: 1200000, label: '판매완료' });
  assert.deepEqual([bar.lo, bar.hi], [600000, 1560000]);
  assert.ok(Math.abs(bar.item - (380000 / 960000)) < 1e-9);
  assert.equal(C.priceBar(1, null), null);
});

function fakeFetch(handler) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    const r = handler(url, init);
    return new Response(r.body == null ? '' : JSON.stringify(r.body), { status: r.status, headers: r.headers || {} });
  };
  f.calls = calls;
  return f;
}

test('이슈 만들기·닫기·보기 — 제목 고정, 몸통은 상자만, 403 = 읽기만 토큰', async () => {
  const ok = fakeFetch(() => ({ status: 201, body: { number: 41 } }));
  const r = await C.createIssue({ repo: 'me/junggo-dash-data', token: 't', body: '{"v":1}', fetchImpl: ok });
  assert.deepEqual(r, { ok: true, number: 41 });
  const sent = JSON.parse(ok.calls[0].init.body);
  assert.deepEqual(sent, { title: '꿀매 레이더 명령', body: '{"v":1}' });
  assert.equal(ok.calls[0].url, 'https://api.github.com/repos/me/junggo-dash-data/issues');
  assert.equal(ok.calls[0].init.headers.Authorization, 'Bearer t');
  const ro = fakeFetch(() => ({ status: 403, body: { message: 'Resource not accessible by personal access token' } }));
  assert.equal((await C.createIssue({ repo: 'me/r', token: 't', body: 'x', fetchImpl: ro })).why, 'readonly');
  const rate = fakeFetch(() => ({ status: 403, headers: { 'x-ratelimit-remaining': '0' } }));
  assert.equal((await C.createIssue({ repo: 'me/r', token: 't', body: 'x', fetchImpl: rate })).why, 'rate');
  const bad = fakeFetch(() => ({ status: 401 }));
  assert.equal((await C.createIssue({ repo: 'me/r', token: 't', body: 'x', fetchImpl: bad })).why, 'token');
  assert.equal((await C.createIssue({ repo: 'bad repo', token: 't', body: 'x', fetchImpl: ok })).why, 'repo');
  const cl = fakeFetch(() => ({ status: 200, body: {} }));
  assert.deepEqual(await C.closeIssue({ repo: 'me/r', token: 't', number: 41, fetchImpl: cl }), { ok: true });
  assert.deepEqual(JSON.parse(cl.calls[0].init.body), { state: 'closed', state_reason: 'not_planned' });
  assert.equal(cl.calls[0].init.method, 'PATCH');
  const g = fakeFetch(() => ({ status: 200, body: { state: 'closed', state_reason: 'completed' } }));
  assert.deepEqual(await C.getIssue({ repo: 'me/r', token: 't', number: 41, fetchImpl: g }), { ok: true, state: 'closed', reason: 'completed' });
});

test('앱 → 웹 자료(test/fixtures/app-cmds.json)가 있으면 앱이 잠근 명령을 웹이 열고, 새 칸을 읽어요', async (t) => {
  const f = path.join(REPO, 'test/fixtures/app-cmds.json');
  if (!fs.existsSync(f)) { t.skip('앱 담당이 아직 올리지 않음'); return; }
  const a = JSON.parse(fs.readFileSync(f, 'utf8'));
  const key = await BOX.deriveKey(a.password, a.salt, a.iter);
  for (const it of a.boxes) {
    const got = await C.open(it.box, key);
    assert.deepEqual(got, it.plain);
    assert.equal(C.validate(got, got.at), '');
  }
  if (a.bundle) {
    for (const p of a.bundle.products || []) if (p.cfg) assert.ok(C.editInit(p), p.id);
    for (const r of a.bundle.cmds || []) assert.ok(['running', 'queued', 'done', 'failed', 'conflict', 'stale'].includes(r.state));
  }
});
