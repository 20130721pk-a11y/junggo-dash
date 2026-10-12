// 수집 실행 시험 (네트워크 없이, 가짜 사이트 응답): node --test collector/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, payloadOf, robotsAllows, cleanSearch } from '../run.mjs';
import { keyring, open, LABEL } from '../seal.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
new Function('self', fs.readFileSync(path.join(here, '..', '..', 'box.js'), 'utf8'))(globalThis);
const Box = globalThis.JunggoBox;

const PW = 'test-password-123';
const REAL0 = Date.now();
const kst = (ms) => { const d = new Date(ms + 9 * 3600e3); const p = (n) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`; };

// 가짜 사이트: extra 에 매물을 더 넣으면 다음 실행에서 새 매물이 된다
function fakeSites({ extra = [], robotsBunjang = 404, issues = [], log = [] } = {}) {
  return async (url, init = {}) => {
    const u = new URL(url);
    const headers = new Headers(init.headers || {});
    log.push({ host: u.host, path: u.pathname, ua: headers.get('user-agent'), auth: headers.get('authorization') });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.pathname === '/robots.txt') {
      if (u.host === 'api.bunjang.co.kr' && robotsBunjang === 'deny') return new Response('User-agent: *\nDisallow: /api/\n', { status: 200 });
      return new Response('not found', { status: 404 });
    }
    if (u.host === 'api.github.com') return json(issues);
    if (u.host === 'search-api.joongna.com') {
      const body = JSON.parse(init.body);
      const sold = body.saleYn === 'SALE_Y';
      const items = sold
        ? [{ seq: 900, title: `${body.searchWord} 팔린 것`, price: 400000, state: 3, sortDate: kst(REAL0 - 5 * 86400e3), locationNames: ['서울 강남구'], objectType: 'product' }]
        : [
          { seq: 101, title: `${body.searchWord} 판매합니다`, price: 500000, state: 0, sortDate: kst(REAL0 - 3 * 3600e3), locationNames: ['경기도 시흥시 정왕동'], wishCount: 2, chatCount: 1, storeSeq: 7, certifySellerFlag: true, objectType: 'product' },
          { seq: 102, title: `${body.searchWord} 삽니다`, price: 450000, state: 0, sortDate: kst(REAL0 - 4 * 3600e3), locationNames: ['서울 마포구'], objectType: 'product' },
          ...extra.filter((x) => x.m === 'j').map((x) => ({ seq: x.id, title: `${body.searchWord} ${x.t}`, price: x.p, state: 0, sortDate: kst(REAL0 - 600e3), locationNames: ['부산 해운대구'], objectType: 'product' })),
        ];
      return json({ meta: { code: 0 }, data: { items, totalSize: items.length } });
    }
    if (u.host === 'api.bunjang.co.kr' && u.pathname.startsWith('/api/search/')) {
      const q = u.searchParams.get('q');
      const data = [
        { type: 'PRODUCT', pid: '201', name: `${q} 깨끗해요`, price: '520000', status: 'SELLING', updatedAt: new Date(REAL0 - 2 * 3600e3).toISOString(), favoriteCount: 3, buntalkCount: 0, ad: false, care: true, shop: { uid: 55, isOfficialSeller: false } },
        ...extra.filter((x) => x.m === 'b').map((x) => ({ type: 'PRODUCT', pid: String(x.id), name: `${q} ${x.t}`, price: String(x.p), status: 'SELLING', updatedAt: new Date(REAL0 - 600e3).toISOString(), shop: { uid: 56 } })),
      ];
      return json({ data: { responses: { mainGrid: { searchResponse: { data, nextCursor: null, totalCount: data.length } } } } });
    }
    if (u.host === 'api.bunjang.co.kr' && u.pathname.startsWith('/api/pms/v3/products-detail/')) {
      return json({ data: { product: { geo: { lat: 37.345, lon: 126.735, address: '경기도 시흥시 정왕동' }, geoLabel: '정왕동', condition: 'NEW', trade: { inPerson: true, freeShipping: false }, description: '상태 좋아요' } } });
    }
    return new Response('no route', { status: 599 });
  };
}

const dirs = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-')); return { prev: path.join(d, 'prev'), out: path.join(d, 'out'), work: path.join(d, 'work') }; };
const readOut = (d, f) => JSON.parse(fs.readFileSync(path.join(d.out, f), 'utf8'));
const openView = (d, pw = PW) => open(readOut(d, 'view.enc'), keyring(pw), LABEL.view);
const INIT = JSON.stringify({
  searches: [
    { id: 's_aaaa1111', keyword: '테스트 물건', platforms: ['joongna', 'daangn', 'bunjang'], createdAt: 1 },
    { id: 's_bbbb2222', keyword: '다른 물건', platforms: ['bunjang'], maxPrice: 600000, createdAt: 2 },
  ],
  config: { area: '경기도 시흥시', maxAgeDays: 30 },
});
const env = (extra = {}) => ({ DASH_PASSWORD: PW, GITHUB_REPOSITORY: 'me/junggo-dash', GITHUB_REPOSITORY_OWNER: 'me', GITHUB_TOKEN: 'tok', ...extra });
const quiet = () => {};

let first; // 첫 실행 결과 폴더 (다음 시험이 이어 쓴다)

test('첫 실행: 처음 검색 목록으로 모으고 잠가 둔다 (당근은 빠짐)', async () => {
  const d = dirs();
  const log = [];
  const st = await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, env: env({ INIT_SEARCHES: INIT }), fetchImpl: fakeSites({ log }), log: quiet });
  assert.equal(st.ok, true);
  assert.equal(st.searches, 2);
  assert.equal(st.bootstrapped, true);
  const status = readOut(d, 'status.json');
  assert.ok(!JSON.stringify(status).includes('테스트 물건'), 'status.json 에 검색어가 없다');
  assert.ok(!fs.readFileSync(path.join(d.out, 'view.enc'), 'utf8').includes('테스트'), '잠근 파일에 글자가 그대로 없다');
  const v = openView(d);
  assert.deepEqual(v.searches.map((s) => s.id), ['s_aaaa1111', 's_bbbb2222']);
  assert.deepEqual(v.searches[0].platforms, ['joongna', 'bunjang']);
  const r = v.results.s_aaaa1111;
  assert.equal(r.pf.joongna.st, 'ok');
  assert.equal(r.pf.bunjang.st, 'ok');
  assert.ok(!r.pf.daangn, '당근 자리는 없다');
  const titles = r.items.map((t) => t[2]);
  assert.ok(titles.some((t) => t.includes('판매합니다')));
  assert.ok(!titles.some((t) => t.includes('삽니다')), '구매글은 뺀다');
  const near = r.items.find((t) => t[0] === 'j' && t[1] === '101');
  assert.equal(near[11], 1, '시흥시 매물은 가까움');
  const bj = r.items.find((t) => t[0] === 'b');
  assert.ok(bj[13] && bj[13].f.includes('K') && bj[13].f.includes('N'), '번개케어·새상품 표시');
  assert.equal(r.sold.length, 1, '판매완료(중고나라)');
  assert.equal(v.results.s_bbbb2222.items.length, 1, '두 번째 검색은 번개장터만 (60만원 이하)');
  assert.ok(log.filter((x) => x.host !== 'api.github.com').every((x) => x.ua && x.ua.startsWith('junggo-dash/')), '사이트에는 우리 이름을 밝힌다');
  assert.ok(log.some((x) => x.host === 'api.github.com' && x.auth === 'Bearer tok'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d.work, 'close.json'), 'utf8')), []);
  first = d;
});

test('페이지가 보낸 요청: 검색 바꾸기 + 새로고침 요청을 반영하고, 새로 올라온 매물은 새 매물로', async () => {
  const v1 = openView(first);
  // 페이지처럼: 같은 salt 로 열쇠를 만들고 전체 목록을 보낸다
  const box = JSON.parse(fs.readFileSync(path.join(first.out, 'view.enc'), 'utf8'));
  const key = await Box.deriveKey(PW, box.salt, box.iter);
  const searches = [...v1.searches, { id: 's_cccc3333', keyword: '세 번째', platforms: ['joongna'], exclude: ['케이스'], createdAt: 3 }];
  const payload = await Box.seal({ v: 1, id: 'p_test01', at: Date.now(), searches, config: { area: '서울 마포구' } }, key, box.salt, Box.LABEL.edit, box.iter);
  const issues = [
    { number: 7, title: '꿀매 레이더: 검색 저장', body: `페이지에서 보낸 요청\n\n\`\`\`junggo\n${JSON.stringify(payload)}\n\`\`\`\n`, user: { login: 'me' } },
    { number: 8, title: '꿀매 레이더: 지금 모으기', body: '새로고침', user: { login: 'me' } },
    { number: 9, title: '꿀매 레이더: 검색 저장', body: '```junggo\n{"v":1,"kdf":"PBKDF2-SHA256","iter":600000,"salt":"AAAAAAAAAAAAAAAAAAAAAA==","iv":"AAAAAAAAAAAAAAAA","ct":"AAAAAAAAAAAAAAAAAAAAAAAA"}\n```', user: { login: 'me' } },
    { number: 10, title: '꿀매 레이더: 검색 저장', body: 'x', user: { login: 'someone-else' } },
    { number: 11, title: '다른 이슈', body: 'x', user: { login: 'me' } },
  ];
  const d = dirs();
  fs.cpSync(first.out, d.prev, { recursive: true });
  const st = await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, env: env(), fetchImpl: fakeSites({ issues, extra: [{ m: 'j', id: 103, t: '새로 올림', p: 480000 }, { m: 'b', id: 203, t: '방금 올림', p: 470000 }] }), now: () => Date.now() + 3600e3, log: quiet });
  assert.equal(st.ok, true);
  const close = JSON.parse(fs.readFileSync(path.join(d.work, 'close.json'), 'utf8'));
  assert.deepEqual(close.map((c) => [c.number, c.kind, c.ok]), [[7, 'edit', true], [8, 'refresh', true], [9, 'edit', false]]);
  assert.match(close[2].note, /비밀번호|반영/);
  const v = openView(d);
  assert.deepEqual(v.searches.map((s) => s.id), ['s_aaaa1111', 's_bbbb2222', 's_cccc3333']);
  assert.equal(v.config.area, '서울 마포구');
  assert.ok(v.applied.includes('p_test01'));
  const r = v.results.s_aaaa1111;
  const fresh = r.items.filter((t) => t[12] > 0).map((t) => `${t[0]}:${t[1]}`).sort();
  assert.deepEqual(fresh, ['b:203', 'j:103']);
  assert.equal(v.refresh.summary.s_aaaa1111.new, 2);
  assert.ok(v.results.s_cccc3333, '새 검색도 모았다');
  assert.equal(r.hist.length >= 1, true);
  first = d;
});

test('비밀번호가 없거나 다르면 지난 데이터를 그대로 둔다', async () => {
  for (const [e, re] of [[{ DASH_PASSWORD: '' }, /DASH_PASSWORD/], [{ DASH_PASSWORD: 'wrong-password' }, /비밀번호와 달라/]]) {
    const d = dirs();
    fs.cpSync(first.out, d.prev, { recursive: true });
    const st = await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, env: env(e), fetchImpl: fakeSites(), log: quiet });
    assert.equal(st.ok, false);
    assert.match(st.message, re);
    assert.deepEqual(readOut(d, 'state.enc'), JSON.parse(fs.readFileSync(path.join(d.prev, 'state.enc'), 'utf8')));
    assert.deepEqual(readOut(d, 'view.enc'), JSON.parse(fs.readFileSync(path.join(d.prev, 'view.enc'), 'utf8')));
  }
});

test('robots.txt 가 막으면 그 마켓은 부르지 않고 지난 매물을 이어 보여준다', async () => {
  const d = dirs();
  fs.cpSync(first.out, d.prev, { recursive: true });
  const log = [];
  const st = await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, env: env(), fetchImpl: fakeSites({ robotsBunjang: 'deny', log }), log: quiet });
  assert.equal(st.markets.bunjang, 'blocked');
  assert.ok(!log.some((x) => x.host === 'api.bunjang.co.kr' && x.path !== '/robots.txt'), '번개장터 검색은 부르지 않았다');
  const r = openView(d).results.s_aaaa1111;
  assert.equal(r.pf.bunjang.st, 'error');
  assert.match(r.pf.bunjang.error, /robots/);
  assert.ok(r.pf.bunjang.carried >= 1);
});

test('페이지 쪽(box.js)과 수집기 쪽(seal.mjs)이 서로 연다', async () => {
  const box = JSON.parse(fs.readFileSync(path.join(first.out, 'view.enc'), 'utf8'));
  const key = await Box.deriveKey(PW, box.salt, box.iter);
  const v = await Box.open(box, key, Box.LABEL.view);
  assert.ok(Array.isArray(v.searches));
  await assert.rejects(Box.open(box, key, Box.LABEL.edit), '용도가 다르면 열리지 않는다');
  const raw = await Box.exportKey(key);
  const again = await Box.importKey(raw);
  assert.deepEqual(await Box.open(box, again, Box.LABEL.view), v);
});

test('작은 도우미들', () => {
  assert.equal(payloadOf('없음'), null);
  assert.equal(payloadOf('```junggo\n{nope}\n```'), 'bad');
  assert.equal(robotsAllows('User-agent: *\nDisallow: /api/\nAllow: /api/search/', '/api/search/v8'), true);
  assert.equal(robotsAllows('User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /', '/x'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', '/x'), false);
  assert.equal(cleanSearch({ id: 'bad id', keyword: 'x' }), null);
  const s = cleanSearch({ id: 's_abcd1234', keyword: '  a   b ', minPrice: 9, maxPrice: 3, platforms: ['daangn'], category: '__proto__', exclude: ['', 'x', 'x'] });
  assert.equal(s.keyword, 'a b');
  assert.deepEqual([s.minPrice, s.maxPrice], [3, 9]);
  assert.deepEqual(s.platforms, ['joongna', 'bunjang']);
  assert.equal(s.category, '');
  assert.deepEqual(s.exclude, ['x']);
});
