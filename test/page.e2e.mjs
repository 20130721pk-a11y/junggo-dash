// 페이지 끝까지 시험 (헤드리스 크롬, 네트워크 없이 가짜 사이트 응답)
//   npm i --no-save playwright && node test/page.e2e.mjs [스크린샷 폴더]
// 잠금 → 열기 → 목록 → 관심/숨기기 → 기억한 열쇠로 다시 열기 → 새 검색 → 보낼 요청 → 수집기가 반영 → 페이지 반영
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { run } = await import(`${REPO}/collector/run.mjs`);
const { keyring, open, LABEL } = await import(`${REPO}/collector/seal.mjs`);
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
