// 페이지 끝까지 시험 (헤드리스 크롬, 네트워크 없이 가짜 사이트 응답)
//   npm i --no-save playwright && node test/page.e2e.mjs [스크린샷 폴더]
// 잠금 → 열기 → 목록 → 관심/숨기기 → 기억한 열쇠로 다시 열기 → 새 검색 → 보낼 요청 → 수집기가 반영 → 페이지 반영
// → 폰 앱이 올린 당근 합치기 → 토큰으로 바로 보내기 → 휴대폰 크기 → 이 기기에서 잠그기
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { run } = await import(`${REPO}/collector/run.mjs`);
const { keyring, open, seal, LABEL } = await import(`${REPO}/collector/seal.mjs`);
const OUT = process.argv[2] || path.join(os.tmpdir(), 'junggo-e2e-shots');
fs.mkdirSync(OUT, { recursive: true });

const PW = 'e2e-password-777';
const NOW = Date.now();
const kst = (ms) => { const d = new Date(ms + 9 * 3600e3); const p = (n) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`; };
let seq = 1000;
function fake(issues = []) {
  return async (url, init = {}) => {
    const u = new URL(url);
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.pathname === '/robots.txt') return new Response('', { status: 404 });
    if (u.host === 'api.github.com') return json(issues);
    if (u.host === 'search-api.joongna.com') {
      const b = JSON.parse(init.body);
      const sold = b.saleYn === 'SALE_Y';
      const items = [];
      for (let i = 0; i < (sold ? 6 : 40); i++) {
        const price = 300000 + ((i * 37) % 23) * 10000;
        items.push({ seq: (sold ? 9000 : 100) + i, title: `${b.searchWord} ${['풀박스', '단품', 'S급', '급처', '케이스 포함'][i % 5]} ${i}`, price, state: sold ? 3 : 0, sortDate: kst(NOW - (i + 1) * 3600e3), locationNames: [i % 3 ? '서울 강남구 역삼동' : '경기도 시흥시 정왕동'], wishCount: i % 4, chatCount: i % 3, storeSeq: i % 7 === 0 ? 77 : 1000 + i, certifySellerFlag: i % 6 === 0, objectType: 'product' });
      }
      return json({ meta: { code: 0 }, data: { items, totalSize: items.length } });
    }
    if (u.host === 'api.bunjang.co.kr' && u.pathname.startsWith('/api/search/')) {
      const q = u.searchParams.get('q');
      const data = [];
      for (let i = 0; i < 30; i++) data.push({ type: 'PRODUCT', pid: String(5000 + i), name: `${q} 번개 ${i}`, price: String(280000 + ((i * 53) % 31) * 10000), status: i % 9 ? 'SELLING' : 'RESERVED', updatedAt: new Date(NOW - (i + 2) * 1800e3).toISOString(), favoriteCount: i % 5, buntalkCount: i % 2, ad: i === 3, care: i % 4 === 0, shop: { uid: 300 + (i % 11), isOfficialSeller: i === 5 } });
      return json({ data: { responses: { mainGrid: { searchResponse: { data, nextCursor: null, totalCount: data.length } } } } });
    }
    if (u.host === 'api.bunjang.co.kr') return json({ data: { product: { geo: { lat: 37.34, lon: 126.73, address: '경기도 시흥시 정왕동' }, geoLabel: '정왕동', condition: 'USED', trade: { inPerson: true, freeShipping: false }, description: `설명 ${seq++}` } } });
    return new Response('x', { status: 599 });
  };
}

// 사이트 폴더: index.html, box.js, testdata/
const site = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-site-'));
fs.copyFileSync(`${REPO}/index.html`, `${site}/index.html`);
fs.copyFileSync(`${REPO}/box.js`, `${site}/box.js`);
const data = `${site}/testdata`;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-work-'));
const env = { DASH_PASSWORD: PW, GITHUB_REPOSITORY: 'me/junggo-dash', GITHUB_REPOSITORY_OWNER: 'me', GITHUB_TOKEN: 't',
  INIT_SEARCHES: JSON.stringify({ searches: [{ id: 's_e2e00001', keyword: '플스5', createdAt: 1 }, { id: 's_e2e00002', keyword: '5070', createdAt: 2 }], config: { area: '경기도 시흥시' } }) };
await run({ prevDir: path.join(work, 'none'), outDir: data, workDir: work, env, fetchImpl: fake(), log: () => {} });

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.enc': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(site, p === '/' ? 'index.html' : p);
  if (!f.startsWith(site) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html?src=./testdata`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errors.push(`console: ${m.text()}`); });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const check = (cond, msg) => { if (!cond) throw new Error(`실패: ${msg}`); console.log(`ok - ${msg}`); };

await page.goto(base);
await page.waitForSelector('#lock:not([hidden])', { timeout: 10000 });
check(await page.isVisible('#lock'), '처음에는 잠금 화면');
await page.screenshot({ path: `${OUT}/1-lock.png` });
await page.fill('#lockPw', 'wrong-password');
await page.click('#lockBtn');
await page.waitForSelector('#lockError:not([hidden])', { timeout: 15000 });
check(true, '틀린 비밀번호는 안내');
await page.fill('#lockPw', PW);
await page.click('#lockBtn');
await page.waitForSelector('#view:not([hidden])', { timeout: 15000 });
const rows = await page.$$eval('#list > li.item', (l) => l.length);
check(rows > 10, `목록이 보인다 (${rows}줄)`);
check((await page.textContent('#vKeyword')).trim() === '플스5', '첫 검색 열림');
check(await page.isVisible('#refreshBtn'), '지금 모으기 단추');
check((await page.getAttribute('#refreshBtn', 'href')).startsWith('https://github.com/20130721pk-a11y/junggo-dash/issues/new?'), '지금 모으기 → GitHub 이슈');
check(/마지막 수집/.test(await page.textContent('#refreshStatus')), '마지막 수집 표시');
check(/폰 앱/.test(await page.textContent('#notices')), '당근은 폰 앱을 기다린다고 알림');
await page.screenshot({ path: `${OUT}/2-open.png` });

// 관심 1개, 숨기기 1개
await page.click('#list > li.item:nth-child(1) button[data-act="star"]');
await page.click('#list > li.item:nth-child(2) button[data-act="hide"]');
await page.waitForTimeout(500);
const starCnt = await page.textContent('#cntStar');
check(starCnt.trim() === '1', '관심 1');
// 다시 열면 기억한 열쇠로 바로 열린다
await page.reload();
await page.waitForSelector('#view:not([hidden])', { timeout: 15000 });
check(!(await page.isVisible('#lock')), '기억한 열쇠로 바로 열림');
check((await page.textContent('#cntStar')).trim() === '1' && (await page.textContent('#cntHidden')).trim() === '1', '관심·숨김이 이 기기에 남음');

// 새 검색 → 보낼 요청
await page.click('#newSearch');
check(await page.isChecked('#dPfD'), '새 검색은 당근도 켜져 있다');
await page.fill('#dKeyword', '아이패드 미니');
await page.fill('#dMax', '50만');
await page.click('#dSubmit');
await page.waitForSelector('#sendBar:not([hidden])', { timeout: 5000 });
check((await page.textContent('#vKeyword')).trim() === '아이패드 미니', '새 검색이 열림');
check(!(await page.isVisible('#refreshBtn')), '보낼 변경이 있으면 지금 모으기 대신 보내기');
await page.waitForTimeout(700); check(await page.evaluate(() => { const r = document.getElementById('sendBar').getBoundingClientRect(); return r.top >= 60 && r.bottom <= window.innerHeight; }), '보내기 줄이 화면에 보임'); check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'sendLink'), '보내기 단추에 초점');
await page.screenshot({ path: `${OUT}/3-pending.png` });
const href = await page.getAttribute('#sendLink', 'href');
const q = new URL(href).searchParams;
check(q.get('title') === '꿀매 레이더: 검색 저장', '이슈 제목');
const body = q.get('body');
check(!body.includes('아이패드'), '이슈 본문에 검색어가 그대로 없다');
const box = JSON.parse(/```junggo\n([\s\S]*?)\n```/.exec(body)[1]);
const payload = open(box, keyring(PW), LABEL.edit);
check(payload.searches.map((s) => s.keyword).join('|') === '플스5|5070|아이패드 미니' && payload.searches[2].maxPrice === 500000, '잠긴 요청 내용이 맞다');
check(href.length < 8000, `이슈 주소 길이 ${href.length}`);

// 수집기가 그 이슈를 반영
const prev2 = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-prev-'));
fs.cpSync(data, prev2, { recursive: true });
await run({ prevDir: prev2, outDir: data, workDir: work, env: { ...env, INIT_SEARCHES: '' }, fetchImpl: fake([{ number: 1, title: '꿀매 레이더: 검색 저장', body, user: { login: 'me' } }]), now: () => Date.now() + 3600e3, log: () => {} });
await page.reload();
await page.waitForSelector('#view:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(300);
check(await page.isHidden('#sendBar'), '반영되면 보낼 요청 줄이 사라짐');
const names = await page.$$eval('#savedList .saved-name', (l) => l.map((x) => x.textContent));
check(names.join('|') === '플스5|5070|아이패드 미니', `왼쪽 목록 ${names.join(', ')}`);
await page.screenshot({ path: `${OUT}/4-applied.png`, fullPage: false });

// 폰 앱이 할 일을 받아 당근을 모아 올린 것처럼 (앱과 같은 잠금·같은 모양)
const djob = open(JSON.parse(fs.readFileSync(`${data}/djob.enc`, 'utf8')), keyring(PW), LABEL.djob);
check(!djob.idle && djob.cfg.searches.length === 3 && djob.code.startsWith('async function junggoCollect('), '폰 앱이 할 일: 당근 검색 3개 + 수집기');
const viewBox = JSON.parse(fs.readFileSync(`${data}/view.enc`, 'utf8'));
const dAt = Date.now() + 3600e3 + 60e3;
const dT = Math.floor((dAt - 30 * 60e3) / 1000);
const dResults = {};
for (const sq of djob.cfg.searches) {
  dResults[sq.id] = {
    pf: { daangn: { st: 'ok', raw: 2, n: 2, regions: [{ id: '1613', name: '시흥시', fullName: '경기도 시흥시', q: '경기도 시흥시', anchors: 3, geo: { names: ['정왕동', '배곧동'], centers: [[37.34, 126.73]] } }] } },
    items: [
      ['d', `${sq.id}a`, `${sq.keyword} 당근 직거래`, 410000, 's', '정왕동', dT, dT, 0, 0, 0, 1, { lat: 37.341, lng: 126.731, sn: '정왕역 앞 직거래' }],
      ['d', `${sq.id}b`, `${sq.keyword} 당근 먼 곳`, 390000, 's', '역삼동', dT, dT, 0, 0, 0, 0, { lat: 37.5, lng: 127.03 }],
    ],
  };
}
const dres = { v: 1, job: djob.id, ck: djob.ck, at: dAt, startedAt: dAt - 60e3, by: 'app', app: '0.2.0', device: 'Galaxy Test', ok: true, result: { __junggo: 'v1', part: 'd', at: dAt, results: dResults, homes: { '': { q: '경기도 시흥시', lat: 37.38, lng: 126.8 } } } };
const dresDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-dres-'));
fs.writeFileSync(`${dresDir}/dres.enc`, JSON.stringify(seal(dres, keyring(PW)(viewBox.salt, viewBox.iter), viewBox.salt, LABEL.dres, viewBox.iter)));
const prev3 = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-prev-'));
fs.cpSync(data, prev3, { recursive: true });
await run({ prevDir: prev3, outDir: data, workDir: work, dresDir, env: { ...env, INIT_SEARCHES: '', GITHUB_EVENT_NAME: 'repository_dispatch' }, fetchImpl: fake(), now: () => dAt + 60e3, log: () => {} });
await page.reload();
await page.waitForSelector('#view:not([hidden])', { timeout: 15000 });
await page.click('#savedList li:nth-child(1) .saved-item');
await page.waitForTimeout(300);
check(/당근\s*2/.test(await page.textContent('#pfToggles .p-daangn')), '당근 매물 2건이 합쳐졌다');
check(/당근 방금|당근 \d+분 전/.test(await page.textContent('#refreshStatus')), '상태 줄에 당근 모은 시각');
check(/폰 앱이 모은 결과/.test(await page.textContent('#notices')), '당근은 폰 앱이 모았다고 안내');
check((await page.textContent('#list')).includes('플스5 당근 직거래'), '목록에 당근 매물');
await page.screenshot({ path: `${OUT}/4b-daangn.png`, fullPage: false });

// 토큰: GitHub 화면을 거치지 않고 바로 보낸다 (GitHub API 는 가짜로)
const TOK = `github_pat_${'A1b2C3'.repeat(14)}`;
const posted = [];
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
await page.route('https://api.github.com/**', async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const okAuth = req.headers().authorization === `Bearer ${TOK}`;
  if (req.method() === 'GET' && u.pathname === '/repos/20130721pk-a11y/junggo-dash') return route.fulfill({ status: okAuth ? 200 : 401, headers: cors, contentType: 'application/json', body: '{}' });
  if (req.method() === 'POST' && u.pathname === '/repos/20130721pk-a11y/junggo-dash/issues' && okAuth) {
    posted.push(JSON.parse(req.postData()));
    return route.fulfill({ status: 201, headers: cors, contentType: 'application/json', body: `{"number":${posted.length + 10}}` });
  }
  return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{}' });
});
await page.click('#homeBtn');
await page.fill('#tokInput', 'not-a-token');
await page.click('#homeSave');
await page.waitForSelector('#homeError:not([hidden])');
check(true, '토큰 모양이 아니면 알려준다');
await page.fill('#tokInput', TOK);
await page.click('#homeSave');
await page.waitForFunction(() => !document.getElementById('homeDialog').open, null, { timeout: 5000 });
const stored = await page.evaluate(() => localStorage.getItem('jd.tok') || '');
check(stored.length > 0 && !stored.includes('github_pat_'), '토큰은 이 기기에 잠가서 저장');
await page.click('#newSearch');
await page.fill('#dKeyword', '닌텐도 스위치');
await page.click('#dSubmit');
await page.waitForSelector('#sendBar:not([hidden])', { timeout: 5000 });
check(/곧 GitHub에 보내요/.test(await page.textContent('#sendText')), '토큰이 있으면 곧 보낸다고 알림');
await page.waitForFunction(() => document.getElementById('sendText').textContent.includes('반영을 기다리는'), null, { timeout: 15000 });
check(posted.length === 1 && posted[0].title === '꿀매 레이더: 검색 저장', 'GitHub 화면 없이 바로 보냄');
const sentBox = JSON.parse(/```junggo\n([\s\S]*?)\n```/.exec(posted[0].body)[1]);
const sent = open(sentBox, keyring(PW), LABEL.edit);
check(sent.searches.map((x) => x.keyword).join('|') === '플스5|5070|아이패드 미니|닌텐도 스위치', '보낸 내용 (잠김) 이 맞다');
check(!posted[0].body.includes('닌텐도'), '보낸 이슈 본문에 검색어가 그대로 없다');
const prev4 = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-prev-'));
fs.cpSync(data, prev4, { recursive: true });
await run({ prevDir: prev4, outDir: data, workDir: work, env: { ...env, INIT_SEARCHES: '' }, fetchImpl: fake([{ number: 11, title: posted[0].title, body: posted[0].body, user: { login: 'me' } }]), now: () => dAt + 2 * 3600e3, log: () => {} });
await page.reload();
await page.waitForSelector('#view:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(300);
check(await page.isHidden('#sendBar'), '반영되면 보내기 줄이 사라짐 (토큰)');
await page.click('#refreshBtn');
await page.waitForTimeout(800);
check(posted.length === 2 && posted[1].title === '꿀매 레이더: 지금 모으기', '지금 모으기도 바로 보냄');

// 휴대폰 크기
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#savedList li:nth-child(1) .saved-item');
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(overflow <= 0, `휴대폰에서 가로로 넘치지 않음 (${overflow})`);
await page.screenshot({ path: `${OUT}/5-mobile.png` });

// 설정 → 이 기기에서 잠그기
await page.setViewportSize({ width: 1280, height: 900 });
await page.click('#homeBtn');
await page.click('#homeClear');
await page.waitForSelector('#lock:not([hidden])');
check(true, '이 기기에서 잠그기 → 잠금 화면');
await page.reload();
await page.waitForSelector('#lock:not([hidden])');
check(true, '잠근 뒤 다시 열면 비밀번호를 묻는다');

check(errors.length === 0, `콘솔 오류 없음 ${errors.join(' / ')}`);
await browser.close();
server.close();
console.log('모두 통과');
