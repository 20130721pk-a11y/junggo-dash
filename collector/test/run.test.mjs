// 수집 실행 시험 (네트워크 없이, 가짜 사이트 응답): node --test collector/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, payloadOf, robotsAllows, cleanSearch, D_PATHS } from '../run.mjs';
import { keyring, open, seal, LABEL } from '../seal.mjs';

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
          ...extra.filter((x) => x.m === 'j').map((x) => ({ seq: x.id, title: `${body.searchWord} ${x.t}`, price: x.p, state: 0, sortDate: kst(REAL0 - 600e3), locationNames: [x.loc || '부산 해운대구'], objectType: 'product' })),
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

const dirs = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-')); return { prev: path.join(d, 'prev'), out: path.join(d, 'out'), work: path.join(d, 'work'), dres: path.join(d, 'dres') }; };
const openJob = (d, pw = PW) => open(readOut(d, 'djob.enc'), keyring(pw), LABEL.djob);
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

test('첫 실행: 처음 검색 목록으로 모으고 잠가 둔다 (당근은 폰 앱을 기다린다)', async () => {
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
  assert.deepEqual(v.searches[0].platforms, ['joongna', 'daangn', 'bunjang']);
  const r = v.results.s_aaaa1111;
  assert.equal(r.pf.joongna.st, 'ok');
  assert.equal(r.pf.bunjang.st, 'ok');
  assert.equal(r.pf.daangn.st, 'wait', '당근은 폰 앱이 올릴 때까지 기다린다');
  assert.match(r.pf.daangn.note, /폰 앱/);
  assert.equal(v.refresh.daangn.st, 'wait');
  assert.equal(st.markets.daangn, 'wait');
  assert.ok(!log.some((x) => x.host.includes('daangn')), 'GitHub 에서는 당근을 부르지 않는다');
  // 폰 앱이 할 일
  const job = openJob(d);
  assert.equal(job.idle, undefined);
  assert.ok(job.code.startsWith('async function junggoCollect('));
  assert.equal(job.cfg.part, 'd');
  assert.deepEqual(job.cfg.searches.map((x) => x.id), ['s_aaaa1111'], '당근을 켠 검색만');
  assert.deepEqual(job.cfg.homes, [{ k: '', q: '경기도 시흥시' }]);
  assert.deepEqual(job.cfg.searches[0].regions, [{ q: '경기도 시흥시' }]);
  assert.deepEqual(job.robots.paths, D_PATHS);
  assert.deepEqual(Object.keys(job.ck), ['s_aaaa1111']);
  assert.ok(!fs.readFileSync(path.join(d.out, 'djob.enc'), 'utf8').includes('테스트'), '할 일도 잠겨 있다');
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
  const st = await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, env: env(), fetchImpl: fakeSites({ issues, extra: [{ m: 'j', id: 103, t: '새로 올림', p: 480000 }, { m: 'j', id: 104, t: '마포 매물', p: 490000, loc: '서울특별시 마포구 합정동' }, { m: 'b', id: 203, t: '방금 올림', p: 470000 }] }), now: () => Date.now() + 3600e3, log: quiet });
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
  assert.deepEqual(fresh, ['b:203', 'j:103', 'j:104']);
  assert.equal(v.refresh.summary.s_aaaa1111.new, 3);
  assert.equal(r.items.find((t) => t[1] === '104')[11], 1, "'서울 마포구' 는 '서울특별시 마포구 합정동' 과 맞는다");
  assert.equal(r.items.find((t) => t[1] === '101')[11], 0, '시흥시 매물은 이제 가깝지 않다');
  assert.ok(v.results.s_cccc3333, '새 검색도 모았다');
  assert.equal(r.hist.length >= 1, true);
  assert.equal(r.pf.daangn.st, 'wait');
  assert.deepEqual(openJob(d).cfg.homes, [{ k: '', q: '서울 마포구' }], '바뀐 지역으로 할 일을 다시 만든다');
  first = d;
});

// 폰 앱이 올린 당근 결과 (앱과 같은 모양)
const sec = (ms) => Math.floor(ms / 1000);
function dresOf(job, { at, ok = true, ck = job.ck, error, items } = {}) {
  const t = sec(at - 20 * 60e3);
  const result = {
    __junggo: 'v1', part: 'd', at,
    results: {
      s_aaaa1111: {
        pf: { daangn: { st: 'ok', raw: 3, n: 3, regions: [{ id: '1', name: '마포구', fullName: '서울 마포구', q: '서울 마포구', anchors: 2, geo: { names: ['합정동', '망원동'], centers: [[37.55, 126.91]] } }] } },
        items: items || [
          ['d', 'aa1', '테스트 물건 팝니다', 300000, 's', '합정동', t, t, 0, 0, 0, 1, { lat: 37.551, lng: 126.912, sn: '거의 새것' }],
          ['d', 'aa2', '테스트 물건 급처', 250000, 's', '신천동', t, t, 0, 0, 0, 0, { lat: 37.51, lng: 127.1 }],
          ['d', 'aa3', '테스트 물건 삽니다', 200000, 's', '망원동', t, t, 0, 0, 0, 1, {}],
        ],
      },
    },
    homes: { '': { q: '서울 마포구', id: '1', name: '마포구', fullName: '서울 마포구', lat: 37.56, lng: 126.9 } },
  };
  return { v: 1, job: job.id, ck, at, startedAt: at - 60e3, by: 'app', app: '0.2.0', device: 'Test Phone', ok, ...(ok ? { result } : { error, blocked: '/kr/search/buy-sell/' }) };
}
function writeDres(d, obj, pw = PW) {
  const box = readOut({ out: d.prevOut }, 'view.enc');
  const key = keyring(pw)(box.salt, box.iter);
  fs.mkdirSync(d.dres, { recursive: true });
  fs.writeFileSync(path.join(d.dres, 'dres.enc'), JSON.stringify(seal(obj, key, box.salt, LABEL.dres, box.iter)));
}

test('폰 앱이 올린 당근을 합친다 (중고나라·번개장터는 조금 전 것을 그대로)', async () => {
  const job = openJob(first);
  const d = dirs();
  fs.cpSync(first.out, d.prev, { recursive: true });
  d.prevOut = first.out;
  const t0 = Date.now() + 3600e3 + 10 * 60e3;
  writeDres(d, dresOf(job, { at: t0 - 2 * 60e3 }));
  const log = [];
  const st = await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, dresDir: d.dres, env: env({ GITHUB_EVENT_NAME: 'repository_dispatch' }), fetchImpl: fakeSites({ log }), now: () => t0, log: quiet });
  assert.equal(st.ok, true);
  assert.equal(st.reusedJb, true, '45분 안에 모은 중고나라·번개장터는 다시 모으지 않는다');
  assert.ok(!log.some((x) => x.host === 'search-api.joongna.com' || x.host === 'api.bunjang.co.kr'));
  const v = openView(d);
  const r = v.results.s_aaaa1111;
  assert.equal(r.pf.daangn.st, 'ok');
  assert.equal(r.pf.joongna.st, 'ok', '중고나라는 지난 안내 그대로 (오류 아님)');
  assert.ok(r.items.some((t) => t[0] === 'j'), '중고나라 매물은 이어 보여준다');
  const dd = r.items.filter((t) => t[0] === 'd');
  assert.deepEqual(dd.map((t) => t[1]).sort(), ['aa1', 'aa2'], '구매글(삽니다)은 뺀다');
  assert.equal(dd.find((t) => t[1] === 'aa1')[11], 1, '기준 동네 안');
  assert.equal(dd.find((t) => t[1] === 'aa2')[11], 0, '이름만 비슷한 먼 동네는 가깝지 않다');
  assert.ok(dd.find((t) => t[1] === 'aa1')[13].km < 2, '내 동네에서 거리');
  assert.equal(dd.find((t) => t[1] === 'aa1')[13].sn, '거의 새것');
  assert.equal(v.refresh.daangn.st, 'ok');
  assert.equal(v.refresh.daangn.device, 'Test Phone');
  assert.equal(v.refresh.daangn.at, t0 - 2 * 60e3);
  assert.equal(st.markets.daangn, 'ok');
  first = d;

  // 같은 결과로 다시 돌면(폰이 아직 새로 안 올림) 오류 없이 그대로 이어 보여준다
  const d2 = dirs();
  fs.cpSync(d.out, d2.prev, { recursive: true });
  fs.cpSync(d.dres, d2.dres, { recursive: true });
  const st2 = await run({ prevDir: d2.prev, outDir: d2.out, workDir: d2.work, dresDir: d2.dres, env: env(), fetchImpl: fakeSites(), now: () => t0 + 3600e3, log: quiet });
  assert.equal(st2.reusedJb, false, '정각 실행은 중고나라·번개장터를 모은다');
  const v2 = openView(d2);
  const r2 = v2.results.s_aaaa1111;
  assert.equal(r2.pf.daangn.st, 'ok');
  assert.deepEqual(r2.items.filter((t) => t[0] === 'd').map((t) => t[1]).sort(), ['aa1', 'aa2']);
  assert.equal(v2.refresh.summary.s_aaaa1111.new, 0, '이어 보여주는 당근 매물은 다시 새 매물로 세지 않는다');
  const firstSeen = (rr) => Object.fromEntries(rr.items.filter((t) => t[0] === 'd').map((t) => [t[1], t[12]]));
  assert.deepEqual(firstSeen(r2), firstSeen(r), '처음 본 시각은 그대로');
  assert.equal(v.refresh.summary.s_aaaa1111.new, 2, '처음 합칠 때 최근에 올라온 당근 매물은 새 매물');

  // 세 시간 넘게 안 올리면 늦어진다고 알린다
  const d3 = dirs();
  fs.cpSync(d2.out, d3.prev, { recursive: true });
  const st3 = await run({ prevDir: d3.prev, outDir: d3.out, workDir: d3.work, dresDir: d2.dres, env: env(), fetchImpl: fakeSites(), now: () => t0 + 4 * 3600e3, log: quiet });
  assert.equal(st3.markets.daangn, 'stale');
  assert.equal(openView(d3).refresh.daangn.st, 'stale');
});

test('폰 앱이 robots.txt 때문에 못 모았다고 올리면 알리고 지난 당근 매물을 이어 보여준다', async () => {
  const job = openJob(first);
  const d = dirs();
  fs.cpSync(first.out, d.prev, { recursive: true });
  d.prevOut = first.out;
  const t0 = Date.now() + 5 * 3600e3;
  writeDres(d, dresOf(job, { at: t0 - 60e3, ok: false, error: '당근이 자동 수집을 막아 두어(robots.txt /kr/search/buy-sell/) 모으지 않았어요' }));
  const st = await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, dresDir: d.dres, env: env(), fetchImpl: fakeSites(), now: () => t0, log: quiet });
  assert.equal(st.markets.daangn, 'error');
  const v = openView(d);
  const r = v.results.s_aaaa1111;
  assert.equal(r.pf.daangn.st, 'error');
  assert.match(r.pf.daangn.error, /robots/);
  assert.equal(r.pf.daangn.carried, 2);
  assert.equal(v.refresh.daangn.st, 'error');
});

test('폰 앱이 모은 뒤 조건이 바뀐 검색은 그 결과를 합치지 않는다', async () => {
  const job = openJob(first);
  const d = dirs();
  fs.cpSync(first.out, d.prev, { recursive: true });
  d.prevOut = first.out;
  const t0 = Date.now() + 6 * 3600e3;
  writeDres(d, dresOf(job, { at: t0 - 60e3, ck: { s_aaaa1111: 'old-conditions' }, items: [['d', 'zz9', '테스트 물건 옛 조건', 1000, 's', '합정동', sec(t0), sec(t0), 0, 0, 0, 1, {}]] }));
  await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, dresDir: d.dres, env: env(), fetchImpl: fakeSites(), now: () => t0, log: quiet });
  const r = openView(d).results.s_aaaa1111;
  assert.ok(!r.items.some((t) => t[1] === 'zz9'));
});

test('검색어를 바꾼 뒤 폰이 아직 새로 안 모았으면 예전 검색어의 당근 매물을 보여주지 않는다', async () => {
  // first = 당근 aa1·aa2 를 합친 뒤의 상태. 페이지에서 검색어를 바꾼 요청만 처리하고 폰은 아직 안 올림
  const box = JSON.parse(fs.readFileSync(path.join(first.out, 'view.enc'), 'utf8'));
  const key = await Box.deriveKey(PW, box.salt, box.iter);
  const v0 = openView(first);
  const searches = v0.searches.map((x) => (x.id === 's_aaaa1111' ? { ...x, keyword: '바꾼 검색어' } : x));
  const payload = await Box.seal({ v: 1, id: 'p_kwchange', at: Date.now(), searches }, key, box.salt, Box.LABEL.edit, box.iter);
  const issues = [{ number: 21, title: '꿀매 레이더: 검색 저장', body: `\`\`\`junggo\n${JSON.stringify(payload)}\n\`\`\``, user: { login: 'me' } }];
  const d = dirs();
  fs.cpSync(first.out, d.prev, { recursive: true });
  await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, env: env(), fetchImpl: fakeSites({ issues }), now: () => Date.now() + 7 * 3600e3, log: quiet });
  const r = openView(d).results.s_aaaa1111;
  assert.equal(r.items.filter((t) => t[0] === 'd').length, 0, '예전 검색어로 모은 당근 매물은 빼고');
  assert.equal(r.pf.daangn.st, 'wait');
  assert.match(r.pf.daangn.note, /조건/);
});

test('폰 시계가 빨라도 같은 결과를 다시 합치지 않고, 늦어지면 알린다', async () => {
  const job = openJob(first);
  const d = dirs();
  fs.cpSync(first.out, d.prev, { recursive: true });
  d.prevOut = first.out;
  const t0 = Date.now() + 8 * 3600e3;
  writeDres(d, dresOf(job, { at: t0 + 2 * 3600e3 })); // 폰 시계가 두 시간 빠름
  await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, dresDir: d.dres, env: env(), fetchImpl: fakeSites(), now: () => t0, log: quiet });
  const v = openView(d);
  assert.equal(v.refresh.daangn.at, t0, '보여주는 시각은 실행 시각을 넘지 않는다');
  const d2 = dirs();
  fs.cpSync(d.out, d2.prev, { recursive: true });
  const st2 = await run({ prevDir: d2.prev, outDir: d2.out, workDir: d2.work, dresDir: d.dres, env: env(), fetchImpl: fakeSites(), now: () => t0 + 4 * 3600e3, log: quiet });
  assert.equal(st2.markets.daangn, 'stale', '같은 결과는 새로 올린 것이 아니다');
  assert.equal(openView(d2).refresh.daangn.at, t0);
});

test('당근만 합치러 돈 실행은 중고나라·번개장터의 지난 오류 안내를 그대로 둔다', async () => {
  const d = dirs();
  fs.cpSync(first.out, d.prev, { recursive: true });
  const t0 = Date.now() + 9 * 3600e3;
  await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, env: env(), fetchImpl: fakeSites({ robotsBunjang: 'deny' }), now: () => t0, log: quiet });
  assert.equal(openView(d).results.s_aaaa1111.pf.bunjang.st, 'error');
  const d2 = dirs();
  fs.cpSync(d.out, d2.prev, { recursive: true });
  const st = await run({ prevDir: d2.prev, outDir: d2.out, workDir: d2.work, env: env({ GITHUB_EVENT_NAME: 'repository_dispatch' }), fetchImpl: fakeSites(), now: () => t0 + 10 * 60e3, log: quiet });
  assert.equal(st.reusedJb, true);
  const r = openView(d2).results.s_aaaa1111;
  assert.equal(r.pf.bunjang.st, 'error', "오류를 '기다리는 중'으로 바꾸지 않는다");
  assert.match(r.pf.bunjang.error, /robots/);
});

test('당근 할 일: 당근 검색이 없거나 지역을 정하지 않았으면 쉰다', async () => {
  const d = dirs();
  const init = JSON.stringify({ searches: [{ id: 's_dddd4444', keyword: '당근 없는 검색', platforms: ['joongna'], createdAt: 1 }], config: { area: '' } });
  await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, env: env({ INIT_SEARCHES: init }), fetchImpl: fakeSites(), log: quiet });
  assert.equal(openJob(d).idle, true);
  const d2 = dirs();
  const init2 = JSON.stringify({ searches: [{ id: 's_eeee5555', keyword: '당근 검색', platforms: ['daangn'], createdAt: 1 }], config: { area: '' } });
  const st = await run({ prevDir: d2.prev, outDir: d2.out, workDir: d2.work, env: env({ INIT_SEARCHES: init2 }), fetchImpl: fakeSites(), log: quiet });
  const job = openJob(d2);
  assert.equal(job.idle, true);
  assert.match(job.reason, /가까운 지역/);
  assert.equal(st.markets.daangn, 'noarea');
  const pfd = openView(d2).results.s_eeee5555.pf.daangn;
  assert.equal(pfd.st, 'wait', '지역을 안 정한 것은 오류가 아니다');
  assert.equal(pfd.need, 'area');
  assert.match(pfd.note, /가까운 지역/);
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

test('한 번만: 당근을 고를 수 없던 때 만든 검색(중고나라·번개장터)은 당근을 켠다', async () => {
  // 예전 버전이 만든 상태: 마이그레이션 표시가 없다
  const d0 = dirs();
  const init = JSON.stringify({ searches: [
    { id: 's_old00001', keyword: '옛 검색', platforms: ['joongna', 'bunjang'], createdAt: 1 },
    { id: 's_old00002', keyword: '번개만', platforms: ['bunjang'], createdAt: 2 },
  ], config: { area: '경기도 시흥시' } });
  await run({ prevDir: d0.prev, outDir: d0.out, workDir: d0.work, env: env({ INIT_SEARCHES: init }), fetchImpl: fakeSites(), log: quiet });
  // 처음 만든 상태에는 표시가 이미 있다 → 지우고 예전 상태처럼 만든다
  const box = readOut(d0, 'state.enc');
  const key = keyring(PW)(box.salt, box.iter);
  const st0 = open(box, () => key, LABEL.state);
  assert.ok(st0.mig && st0.mig.daangnOn, '새로 시작하면 표시만 남긴다');
  assert.deepEqual(st0.searches.s_old00001.platforms, ['joongna', 'bunjang'], '새로 시작한 상태의 검색은 그대로');
  delete st0.mig;
  fs.mkdirSync(d0.prev, { recursive: true });
  fs.writeFileSync(path.join(d0.prev, 'state.enc'), JSON.stringify(seal(st0, key, box.salt, LABEL.state, box.iter)));
  fs.copyFileSync(path.join(d0.out, 'view.enc'), path.join(d0.prev, 'view.enc'));
  const d1 = { ...dirs(), prev: d0.prev };
  const hist0 = openView(d0).results.s_old00001.hist.length;
  await run({ prevDir: d1.prev, outDir: d1.out, workDir: d1.work, env: env(), fetchImpl: fakeSites(), now: () => Date.now() + 3 * 3600e3, log: quiet });
  const v = openView(d1);
  assert.equal(v.results.s_old00001.hist.length, hist0 + 1, '시세 흐름을 지우지 않고 이어 쌓는다');
  assert.deepEqual(v.searches.find((x) => x.id === 's_old00001').platforms, ['joongna', 'daangn', 'bunjang']);
  assert.deepEqual(v.searches.find((x) => x.id === 's_old00002').platforms, ['bunjang'], '직접 고른 것은 그대로');
  assert.deepEqual(Object.keys(openJob(d1).ck), ['s_old00001'], '폰 앱 할 일에 들어간다');
  // 다음 실행부터는 다시 켜지 않는다 (사용자가 끈 것을 존중)
  const st1 = open(readOut(d1, 'state.enc'), () => key, LABEL.state);
  st1.searches.s_old00001.platforms = ['joongna', 'bunjang'];
  const d2 = dirs();
  fs.mkdirSync(d2.prev, { recursive: true });
  fs.writeFileSync(path.join(d2.prev, 'state.enc'), JSON.stringify(seal(st1, key, box.salt, LABEL.state, box.iter)));
  await run({ prevDir: d2.prev, outDir: d2.out, workDir: d2.work, env: env(), fetchImpl: fakeSites(), log: quiet });
  assert.deepEqual(openView(d2).searches.find((x) => x.id === 's_old00001').platforms, ['joongna', 'bunjang']);
});

test('공용 비밀번호(DASH_SHARE_PASSWORD): 보는 쪽은 공용 비밀번호로 잠그고, 안쪽 기록은 DASH_PASSWORD 그대로', async () => {
  const SHARE = 'share-공용-2026';
  const job0 = openJob(first);
  const d = dirs();
  fs.cpSync(first.out, d.prev, { recursive: true });
  d.prevOut = first.out;
  const t0 = Date.now() + 3600e3 + 10 * 60e3;
  // 공용 비밀번호를 정하기 전에 폰 앱이 DASH_PASSWORD 열쇠로 올린 결과
  writeDres(d, dresOf(job0, { at: t0 - 2 * 60e3 }));
  const st = await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, dresDir: d.dres, env: env({ DASH_SHARE_PASSWORD: SHARE, GITHUB_EVENT_NAME: 'repository_dispatch' }), fetchImpl: fakeSites(), now: () => t0, log: quiet });
  assert.equal(st.ok, true);
  assert.throws(() => openView(d));
  const v = openView(d, SHARE);
  assert.equal(v.results.s_aaaa1111.pf.daangn.st, 'ok', '정하기 전에 올린 당근 결과도 합친다');
  assert.ok(openJob(d, SHARE).id, '당근 할 일도 공용 비밀번호로 잠근다');
  assert.throws(() => openJob(d));
  assert.ok(open(readOut(d, 'state.enc'), keyring(PW), LABEL.state).searches, '안쪽 기록은 DASH_PASSWORD 로 그대로');

  // 공용 비밀번호를 다시 바꿔도(잘못 넣었다 고쳐도) 검색·기록은 그대로 이어진다
  const SHARE2 = 'another-share-pw';
  const d2 = dirs();
  fs.cpSync(d.out, d2.prev, { recursive: true });
  const st2 = await run({ prevDir: d2.prev, outDir: d2.out, workDir: d2.work, env: env({ DASH_SHARE_PASSWORD: SHARE2 }), fetchImpl: fakeSites(), now: () => t0 + 3600e3, log: quiet });
  assert.equal(st2.ok, true);
  assert.equal(openView(d2, SHARE2).searches.length, v.searches.length);
  assert.throws(() => openView(d2, SHARE));

  // 페이지가 공용 비밀번호 열쇠로 보낸 요청을 반영한다
  const vb = readOut(d2, 'view.enc');
  const k2 = await Box.deriveKey(SHARE2, vb.salt, vb.iter);
  const searches = [...openView(d2, SHARE2).searches, { id: 's_dddd4444', keyword: '공용으로 추가', platforms: ['joongna'], createdAt: 4 }];
  const payload = await Box.seal({ v: 1, id: 'p_share01', at: Date.now(), searches, config: { area: '경기도 시흥시' } }, k2, vb.salt, Box.LABEL.edit, vb.iter);
  const issues = [{ number: 21, title: '꿀매 레이더: 검색 저장', body: `페이지에서 보낸 요청\n\n\`\`\`junggo\n${JSON.stringify(payload)}\n\`\`\`\n`, user: { login: 'me' } }];
  const d3 = dirs();
  fs.cpSync(d2.out, d3.prev, { recursive: true });
  const st3 = await run({ prevDir: d3.prev, outDir: d3.out, workDir: d3.work, env: env({ DASH_SHARE_PASSWORD: SHARE2 }), fetchImpl: fakeSites({ issues }), now: () => t0 + 2 * 3600e3, log: quiet });
  assert.equal(st3.ok, true);
  assert.ok(openView(d3, SHARE2).searches.some((x) => x.keyword === '공용으로 추가'));
  const close = JSON.parse(fs.readFileSync(path.join(d3.work, 'close.json'), 'utf8'));
  assert.deepEqual(close.map((c) => [c.number, c.ok]), [[21, true]]);
});

// 폰 앱이 할 일(job)의 검색마다 당근 매물 하나씩 모아 올린 결과 (앱 0.2.3 처럼 trigger 를 적는다)
function dresAll(job, { at, trigger = 'auto', ids = Object.keys(job.ck) } = {}) {
  const t = sec(at - 20 * 60e3);
  const results = {};
  ids.forEach((id, i) => {
    results[id] = {
      pf: { daangn: { st: 'ok', raw: 1, n: 1, regions: [{ id: '1613', name: '시흥시', fullName: '경기도 시흥시', q: '경기도 시흥시', anchors: 3, geo: { names: ['정왕동'], centers: [[37.34, 126.73]] } }] } },
      items: [['d', `k${i}x${String(at).slice(-5)}`, `당근 매물 ${i}`, 300000 + i, 's', '정왕동', t, t, 0, 0, 0, 1, {}]],
    };
  });
  const result = { __junggo: 'v1', part: 'd', at, results, homes: { '': { q: '경기도 시흥시', id: '1613', name: '시흥시', fullName: '경기도 시흥시', lat: 37.38, lng: 126.8 } } };
  return { v: 1, job: job.id, ck: job.ck, at, startedAt: at - 60e3, by: 'app', app: '0.2.3', device: 'Test Phone', trigger, ok: true, result };
}
// 지난 실행 결과(prevOut)를 이어받는 다음 실행
async function nextRun(prevOut, { at, dres, envx = {}, issues = [], log = [] } = {}) {
  const d = dirs();
  fs.cpSync(prevOut, d.prev, { recursive: true });
  if (dres) { d.prevOut = prevOut; writeDres(d, dres); }
  const st = await run({ prevDir: d.prev, outDir: d.out, workDir: d.work, dresDir: dres ? d.dres : '', env: env(envx), fetchImpl: fakeSites({ issues, log }), now: () => at, log: quiet });
  return { d, st, status: readOut(d, 'status.json'), v: openView(d) };
}
// 페이지처럼 검색 목록을 바꿔 보내는 요청 이슈
async function editIssue(prevOut, change, number = 31) {
  const box = readOut({ out: prevOut }, 'view.enc');
  const key = await Box.deriveKey(PW, box.salt, box.iter);
  const searches = change(open(box, keyring(PW), LABEL.view).searches);
  const payload = await Box.seal({ v: 1, id: `p_edit${number}`, at: Date.now(), searches }, key, box.salt, Box.LABEL.edit, box.iter);
  return [{ number, title: '꿀매 레이더: 검색 저장', body: `\`\`\`junggo\n${JSON.stringify(payload)}\n\`\`\``, user: { login: 'me' } }];
}

test('당근을 기다리는 까닭을 새 검색/조건 바뀜으로 나눠 알리고, status.json 에 당근 건수를 남긴다', async () => {
  const T = Date.now() + 20 * 3600e3;
  const d0 = dirs();
  await run({ prevDir: d0.prev, outDir: d0.out, workDir: d0.work, env: env({ INIT_SEARCHES: INIT }), fetchImpl: fakeSites(), now: () => T, log: quiet });
  const s0 = readOut(d0, 'status.json');
  assert.deepEqual(s0.daangn, { searches: 1, shown: 0, waiting: 1, errors: 0, items: 0, by: '' }, '폰이 아직 안 올림');
  assert.ok(!JSON.stringify(s0).includes('테스트'), 'status.json 에는 검색어가 없다');

  // 폰이 '지금 모으기'로 올림 → 합친다
  const job0 = openJob(d0);
  const r1 = await nextRun(d0.out, { at: T + 10 * 60e3, dres: dresAll(job0, { at: T + 8 * 60e3, trigger: 'manual' }), envx: { GITHUB_EVENT_NAME: 'repository_dispatch' } });
  assert.deepEqual(r1.status.daangn, { searches: 1, shown: 1, waiting: 0, errors: 0, items: 1, by: 'manual', upload: { searches: 1, merged: 1, changed: 0 } });
  assert.equal(r1.v.refresh.daangn.by, 'manual');

  // 페이지에서 검색어를 바꾸고 당근 검색을 하나 더 만든다 (폰은 아직 안 모음)
  const issues = await editIssue(r1.d.out, (list) => [
    ...list.map((x) => (x.id === 's_aaaa1111' ? { ...x, keyword: '바꾼 물건' } : x)),
    { id: 's_ffff6666', keyword: '새 당근 검색', platforms: ['daangn'], createdAt: 9 },
  ]);
  const r2 = await nextRun(r1.d.out, { at: T + 20 * 60e3, issues });
  const pa = r2.v.results.s_aaaa1111.pf.daangn;
  const pf = r2.v.results.s_ffff6666.pf.daangn;
  assert.equal(pa.st, 'wait');
  assert.equal(pa.why, 'changed');
  assert.match(pa.note, /조건이나 가까운 지역이 바뀌었어요/);
  assert.equal(pf.st, 'wait');
  assert.equal(pf.why, 'new');
  assert.match(pf.note, /아직 이 검색으로 당근을 모으지 않았어요/);
  assert.equal(r2.v.results.s_aaaa1111.items.filter((t) => t[0] === 'd').length, 0, '옛 검색어로 모은 당근 매물은 빼고');
  assert.deepEqual(r2.status.daangn, { searches: 2, shown: 0, waiting: 2, errors: 0, items: 0, by: 'manual' });

  // 폰이 새로 안 올린 채 정각 실행이 한 번 더 돌아도 까닭은 그대로
  const r3 = await nextRun(r2.d.out, { at: T + 2 * 3600e3, envx: { GITHUB_EVENT_NAME: 'schedule' } });
  assert.equal(r3.v.results.s_aaaa1111.pf.daangn.why, 'changed');
  assert.equal(r3.v.results.s_ffff6666.pf.daangn.why, 'new');

  // 폰이 바뀌기 전의 할 일(job0)로 모은 결과가 늦게 올라오면: 합치지 않고 '조건 바뀜'으로 센다
  const r4 = await nextRun(r3.d.out, { at: T + 2 * 3600e3 + 5 * 60e3, dres: dresAll(job0, { at: T + 2 * 3600e3 + 4 * 60e3 }), envx: { GITHUB_EVENT_NAME: 'repository_dispatch' } });
  assert.deepEqual(r4.status.daangn.upload, { searches: 1, merged: 0, changed: 1 });
  assert.equal(r4.status.daangn.shown, 0);
  assert.equal(r4.v.results.s_aaaa1111.pf.daangn.why, 'changed');
  assert.equal(r4.status.daangn.by, 'auto');

  // 폰이 새 할 일로 모으면 둘 다 붙는다
  const job4 = openJob(r4.d);
  assert.deepEqual(Object.keys(job4.ck).sort(), ['s_aaaa1111', 's_ffff6666']);
  assert.notEqual(job4.id, job0.id, '조건이 바뀌면 할 일 ID 도 바뀐다 (앱이 바로 다시 모으는 기준)');
  const r5 = await nextRun(r4.d.out, { at: T + 2 * 3600e3 + 20 * 60e3, dres: dresAll(job4, { at: T + 2 * 3600e3 + 19 * 60e3 }), envx: { GITHUB_EVENT_NAME: 'repository_dispatch' } });
  assert.deepEqual(r5.status.daangn, { searches: 2, shown: 2, waiting: 0, errors: 0, items: 2, by: 'auto', upload: { searches: 2, merged: 2, changed: 0 } });
  assert.equal(r5.v.results.s_aaaa1111.pf.daangn.why, undefined);
  assert.equal(r5.v.results.s_ffff6666.items.filter((t) => t[0] === 'd').length, 1);
});

test('정각 실행도 45분 안에 모은 중고나라·번개장터는 다시 모으지 않는다 (17분·47분 두 번 걸어 둠)', async () => {
  const T = Date.now() + 30 * 3600e3;
  const d0 = dirs();
  await run({ prevDir: d0.prev, outDir: d0.out, workDir: d0.work, env: env({ INIT_SEARCHES: INIT }), fetchImpl: fakeSites(), now: () => T, log: quiet });
  const log1 = [];
  const r1 = await nextRun(d0.out, { at: T + 30 * 60e3, envx: { GITHUB_EVENT_NAME: 'schedule' }, log: log1 });
  assert.equal(r1.st.reusedJb, true, '30분 전에 모았으면 이번 정각 실행은 건너뛴다');
  assert.ok(!log1.some((x) => x.host === 'search-api.joongna.com' || x.host === 'api.bunjang.co.kr'));
  assert.equal(r1.v.results.s_aaaa1111.pf.joongna.st, 'ok', '지난 매물을 그대로 보여준다');
  assert.ok(r1.v.results.s_aaaa1111.items.some((t) => t[0] === 'j'));
  const log2 = [];
  const r2 = await nextRun(r1.d.out, { at: T + 50 * 60e3, envx: { GITHUB_EVENT_NAME: 'schedule' }, log: log2 });
  assert.equal(r2.st.reusedJb, false, '45분이 지났으면 모은다');
  assert.ok(log2.some((x) => x.host === 'search-api.joongna.com'));
  const r3 = await nextRun(r2.d.out, { at: T + 60 * 60e3, envx: { GITHUB_EVENT_NAME: 'workflow_dispatch' } });
  assert.equal(r3.st.reusedJb, false, '손으로 돌린 실행은 늘 모은다');
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
  assert.deepEqual(s.platforms, ['daangn']);
  assert.deepEqual(cleanSearch({ id: 's_abcd1235', keyword: 'y', platforms: ['nope'] }).platforms, ['joongna', 'daangn', 'bunjang']);
  assert.equal(s.category, '');
  assert.deepEqual(s.exclude, ['x']);
});
