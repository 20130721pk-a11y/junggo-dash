// 꿀매 레이더 — GitHub Actions 에서 한 시간마다 중고나라·번개장터 매물을 모아 잠근 파일로 남긴다.
//
//   node collector/run.mjs <지난 데이터 폴더> <새 데이터 폴더> <작업 폴더> [당근 폴더]
//
// 지난 데이터 폴더(data 가지에서 받은 것): state.enc(검색·지난 결과·장부, 잠김), view.enc, status.json
// 새 데이터 폴더(data 가지에 올릴 것): state.enc, view.enc(페이지가 여는 것, 잠김), status.json(잠그지 않은 요약 — 검색어·매물 없음),
//   djob.enc(폰 앱이 할 당근 수집: 수집기 코드 + 조건, 잠김)
// 작업 폴더: close.json (처리한 요청 이슈 → collector/close.mjs 가 닫는다)
// 당근 폴더(daangn 가지에서 받은 것, 없어도 된다): dres.enc — 폰 앱(꿀매 레이더)이 모아 올린 당근 결과(잠김).
//   당근은 GitHub 서버(해외)에서 검색되지 않아 사용자의 폰이 모은다. 당근 robots.txt 는 AI 에이전트만 막고 일반 프로그램(*)은
//   검색 경로를 허용한다 → 앱이 robots.txt 를 보고, 막혀 있으면 모으지 않고 그 사실만 올린다.
//
// 환경 변수: DASH_PASSWORD(저장소 Secret), DASH_SHARE_PASSWORD(선택, 보는 사람용 공용 비밀번호 Secret), GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_REPOSITORY_OWNER,
//            INIT_SEARCHES(처음 한 번만 쓰는 검색 목록, 저장소 Variable — 없어도 된다)
// 로그는 공개되므로 검색어·매물 제목은 찍지 않는다(건수만).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildResults, collectKey, condKey, collectorInfo, effectiveSearches, slim, CATEGORIES, ROUND } from './refresh.mjs';
import { ITER, LABEL, isBox, keyring, newSalt, open, seal } from './seal.mjs';
import { areaKey, findPlace, kmBetween, nearbyAreas } from './places.mjs';

// GitHub 서버가 모으는 마켓. 당근은 폰 앱이 모아 올린다
export const MARKETS = ['joongna', 'bunjang'];
export const ALL_MARKETS = ['joongna', 'daangn', 'bunjang'];
const NAME = { joongna: '중고나라', daangn: '당근', bunjang: '번개장터' };
// 폰 앱이 당근에서 부르는 경로 (앱이 robots.txt 의 일반(*) 규칙으로 하나씩 본다)
export const D_PATHS = ['/kr/search/buy-sell/', '/kr/buy-sell/', '/kr/regions/', '/kr/api/v1/regions/keyword'];
// 당근만 합치러 돈 실행(폰 앱의 알림)과 정각 실행(매시 17분·47분 — GitHub 가 정각 실행을 자주 빠뜨려 두 번 걸어 둔다)에서는
// 중고나라·번개장터를 이만큼 안에 모았으면 다시 모으지 않는다 → 실제로 모으는 건 한 시간에 한 번쯤
const JB_REUSE_MS = 45 * 60 * 1000;
const REUSE_EVENTS = ['repository_dispatch', 'schedule'];
// 폰 앱이 이보다 오래 당근을 올리지 않았으면 페이지에 알린다
export const D_STALE_MS = 3 * 3600 * 1000;
// 당근을 기다리는 까닭 (페이지가 뒤에 '바로 보려면 앱에서 지금 모으기' 안내를 붙인다)
export const D_NOTE = {
  new: '폰 앱이 아직 이 검색으로 당근을 모으지 않았어요. 앱이 다음에 모으면 보여요.',
  changed: '검색 조건이나 가까운 지역이 바뀌었어요. 폰 앱이 새 조건으로 다시 모으면 보여요.',
};
// 수집기가 부르는 주소 (robots.txt 로 허용 여부를 먼저 본다). 번개장터 상세(products-detail)는 W0 부터 부르지 않는다
const ENDPOINTS = {
  joongna: [{ origin: 'https://search-api.joongna.com', path: '/v3/search/all' }],
  bunjang: [{ origin: 'https://api.bunjang.co.kr', path: '/api/search/v8/web/search' }],
};
// 번개장터 상세(판매자 좌표·주소·설명)는 GitHub 서버에서 모으지 않는다 (PRD 0.7 W0·LG-3, 법·리스크 R1)
export const BD_MAX = 0;
// 같은 마켓의 다음 쪽을 부르기 전에 쉬는 시간 (PRD 0.7 F12·LG-5, 초안 값)
export const PAGE_GAP_MS = 700;
// 수집기가 상세 정보를 모아 두던 곳 (state.ls 안, collect.js 의 BD_KEY)
const BD_KEY = 'junggo.bd';
export const TITLE_PREFIX = '꿀매 레이더';
const MAX_SEARCHES = 50;
const KEEP_APPLIED = 50;
const STATUSES = ['selling', 'reserved', 'all'];

// ---------- 검색 조건 정리 (페이지에서 온 값은 믿지 않고 형식을 맞춘다) ----------
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function words(list, max = 30, len = 40) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const w of list) {
    const t = String(w == null ? '' : w).replace(/\s+/g, ' ').trim().slice(0, len);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
function price(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), 1e10);
}
export function cleanSearch(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '');
  if (!/^s_[0-9a-z]{4,32}$/.test(id)) return null;
  const keyword = String(raw.keyword || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!keyword) return null;
  let minPrice = price(raw.minPrice);
  let maxPrice = price(raw.maxPrice);
  if (minPrice != null && maxPrice != null && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  const pf = Array.isArray(raw.platforms) ? raw.platforms : ALL_MARKETS;
  const s = {
    keyword, exclude: words(raw.exclude), include: words(raw.include), minPrice, maxPrice,
    status: STATUSES.includes(raw.status) ? raw.status : 'selling',
    platforms: ALL_MARKETS.filter((p) => pf.includes(p)),
    regions: [],
    match: raw.match === 'title' ? 'title' : 'content',
    excludeProShop: raw.excludeProShop === true,
    category: Object.prototype.hasOwnProperty.call(CATEGORIES, raw.category) ? raw.category : '',
    noBuy: raw.noBuy !== false,
    createdAt: num(raw.createdAt) || now,
    updatedAt: num(raw.updatedAt) || now,
  };
  if (!s.platforms.length) s.platforms = ALL_MARKETS.slice();
  const age = num(raw.maxAgeDays);
  if (age != null && age >= 0 && age <= 365) s.maxAgeDays = Math.round(age);
  return { id, ...s };
}
// 가까운 지역은 5곳까지 (당근은 지역이 늘수록 지역마다 덜 꼼꼼히 찾는다 — collect.js 의 dCalls)
export const MAX_AREAS = 5;
const placeText = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 40) : '');
function areaList(list) {
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    const t = placeText(v);
    if (t && !out.some((x) => areaKey(x) === areaKey(t))) out.push(t);
    if (out.length >= MAX_AREAS) break;
  }
  return out;
}
// 설정: areas = 가까운 지역들(판매 지역이 여기면 '근처', 당근은 폰 앱이 이 지역들에서 찾는다), home = 거리 기준(비우면 첫 지역),
//       area = areas[0] (지역 하나만 알던 예전 페이지·기록과 맞추려고 같이 둔다), maxAgeDays
export function cleanConfig(raw, prev = {}) {
  const p = prev && typeof prev === 'object' ? prev : {};
  let areas = areaList(Array.isArray(p.areas) ? p.areas : [p.area]);
  let home = placeText(p.home);
  let maxAgeDays = num(p.maxAgeDays) ?? 30;
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.areas)) areas = areaList(raw.areas);
    // 예전 페이지(지역 하나만 아는 판)가 보낸 요청: 첫 지역만 바꾸고 이웃 지역은 그대로 (지우면 다 지운다)
    else if (typeof raw.area === 'string') { const a = placeText(raw.area); areas = a ? areaList([a, ...areas.slice(1)]) : []; }
    if (typeof raw.home === 'string') home = placeText(raw.home);
    const a = num(raw.maxAgeDays);
    if (a != null && a >= 0 && a <= 365) maxAgeDays = Math.round(a);
  }
  return { area: areas[0] || '', areas, home, maxAgeDays };
}
// 검색 목록 통째로 바꾸기 (페이지는 언제나 전체 목록을 보낸다)
export function applyEdit(state, payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object' || payload.v !== 1) throw new Error('요청 형식이 아니에요');
  if (Array.isArray(payload.searches)) {
    const list = payload.searches.map((s) => cleanSearch(s, now)).filter(Boolean).slice(0, MAX_SEARCHES);
    const next = {};
    for (const { id, ...doc } of list) next[id] = doc;
    state.searches = next;
  }
  if (payload.config) state.config = cleanConfig(payload.config, state.config);
  if (typeof payload.id === 'string' && /^[0-9a-z_-]{4,40}$/i.test(payload.id)) {
    state.applied = [...(state.applied || []).filter((x) => x !== payload.id), payload.id].slice(-KEEP_APPLIED);
  }
}

// ---------- 사이트 요청 ----------
export function marketFetch(baseFetch, ua) {
  return (url, init = {}) => {
    const { credentials: _c, ...rest } = init || {};
    const headers = new Headers(rest.headers || {});
    headers.set('User-Agent', ua);
    return baseFetch(url, { ...rest, headers });
  };
}
// robots.txt 의 User-agent: * 묶음에서 경로에 가장 길게 맞는 규칙 (Allow 우선)
export function robotsAllows(txt, p) {
  const groups = [];
  let cur = null;
  let agentLine = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(raw.replace(/#.*/, '').trim());
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !agentLine) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      agentLine = true;
    } else {
      agentLine = false;
      if (cur && (key === 'allow' || key === 'disallow') && val) cur.rules.push({ allow: key === 'allow', p: val });
    }
  }
  let best = null;
  for (const g of groups.filter((x) => x.agents.includes('*'))) {
    for (const r of g.rules) {
      const prefix = r.p.replace(/\*.*$/, '').replace(/\$$/, '');
      if (!p.startsWith(prefix)) continue;
      if (!best || prefix.length > best.len || (prefix.length === best.len && r.allow)) best = { allow: r.allow, len: prefix.length };
    }
  }
  return best ? best.allow : true;
}
// robots.txt 응답 읽기 (PRD 0.7 F11·LG-2): 2xx = 읽고 따른다 / 404·410 = 없음(허용) /
// 그 밖(401·403·429·5xx·연결 실패 등) = '확인 못 함' → 이번 실행에서는 그 마켓을 부르지 않고 다음 실행에 다시 본다(기억하지 않는다)
export function robotsVerdict(status, text, p) {
  if (status >= 200 && status < 300) return robotsAllows(text, p) ? 'allow' : 'deny';
  if (status === 404 || status === 410) return 'allow';
  return 'unknown';
}
async function marketAllowed(fetchImpl, market) {
  const seen = new Map();
  for (const { origin, path: p } of ENDPOINTS[market]) {
    if (!seen.has(origin)) {
      let r = null;
      try {
        const res = await fetchImpl(`${origin}/robots.txt`, { signal: AbortSignal.timeout(10000) });
        r = { status: res.status, text: res.status >= 200 && res.status < 300 ? await res.text() : '' };
      } catch {
        r = { status: 0, text: '' };
      }
      seen.set(origin, r);
    }
    const r = seen.get(origin);
    const v = robotsVerdict(r.status, r.text, p);
    if (v === 'unknown') return { ok: false, kind: 'unchecked', why: `${NAME[market]}의 robots.txt를 확인하지 못해 이번엔 건너뛰었어요 (${r.status ? `HTTP ${r.status}` : '연결 실패'}). 다음 수집 때 다시 봐요` };
    if (v === 'deny') return { ok: false, kind: 'robots', why: `${NAME[market]}가 자동 수집을 막아 두어(robots.txt) 모으지 않았어요` };
  }
  return { ok: true };
}

// 사이트가 403·429 로 막으면 그 마켓을 이만큼 쉰다 (PRD 0.7 F12·LG-5, 초안 값)
export const REST_MS = 3 * 3600 * 1000;
const hhmm = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16); // 한국 시각
export const restWhy = (market, until) => `${NAME[market]}가 잠시 막았어요 — ${hhmm(until)}에 다시 해요`;

// 마켓 요청 문지기: 마켓마다 부른 수를 세고(status.json·로그에 건수만 — 주소·검색어는 남기지 않는다),
// 검색·상세 요청에 403·429 가 오면 그 마켓은 이번 실행에서 더 부르지 않는다(사이트에 보내지 않고 429 로 바로 돌려준다).
const HOST_MARKET = { 'search-api.joongna.com': 'joongna', 'api.bunjang.co.kr': 'bunjang' };
export function marketGate(baseFetch) {
  const calls = { robots: 0, joongna: 0, bunjang: 0, bunjangDetail: 0 };
  // 막힌 마켓 → 처음 받은 상태 번호
  const hit = {};
  const fetch = async (url, init) => {
    let u = null;
    try { u = new URL(String(url)); } catch { /* 이상한 주소는 세지 않는다 */ }
    const m = u && HOST_MARKET[u.host];
    if (u && u.pathname === '/robots.txt') { calls.robots++; return baseFetch(url, init); }
    if (m && hit[m]) return new Response('', { status: 429 });
    if (m === 'bunjang' && u.pathname.startsWith('/api/pms/')) calls.bunjangDetail++;
    else if (m) calls[m]++;
    const res = await baseFetch(url, init);
    if (m && (res.status === 403 || res.status === 429) && !hit[m]) hit[m] = res.status;
    return res;
  };
  return { fetch, calls, hit };
}

// 예전에 모아 둔 번개장터 상세 값을 지운다: 상세 캐시(state.ls), 저장된 매물 줄의 동네·가까움·설명 앞부분·위치·거리·상세 표시(N 새상품 I 직거래 F 무료배송).
// 상세를 끈 뒤 새로 모은 번개장터 매물과 같은 꼴이 된다. 몇 줄을 고쳤는지 돌려준다
export function scrubBunjangDetails(state) {
  let rows = 0;
  if (state.ls && Object.prototype.hasOwnProperty.call(state.ls, BD_KEY)) delete state.ls[BD_KEY];
  for (const doc of Object.values(state.docs || {})) {
    if (!doc || !Array.isArray(doc.items)) continue;
    for (const row of doc.items) {
      if (!Array.isArray(row) || row[0] !== 'b') continue;
      let changed = false;
      if (row[5]) { row[5] = ''; changed = true; }
      if (row[11] != null) { row[11] = null; changed = true; }
      const e = row[13];
      if (e && typeof e === 'object' && !Array.isArray(e)) {
        for (const k of ['sn', 'll', 'ap', 'km']) if (k in e) { delete e[k]; changed = true; }
        if (typeof e.f === 'string' && /[NIF]/.test(e.f)) { e.f = e.f.replace(/[NIF]/g, ''); if (!e.f) delete e.f; changed = true; }
        if (!Object.keys(e).length) row.length = 13;
      }
      if (changed) rows++;
    }
  }
  return rows;
}

// 브라우저용 수집기(collect.js)를 Node 에서 그대로 돌린다: fetch·localStorage 만 바꿔 끼운다
function storageShim(store) {
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
}
// (당근 부분 'd' 는 폰 앱이 돌린다 — 여기서는 시험할 때만)
export async function runCollector(cfg, { fetchImpl, store }) {
  const { fnSrc } = collectorInfo(cfg.part === 'd' ? 'd' : 'jb');
  const g = globalThis;
  const had = { fetch: Object.getOwnPropertyDescriptor(g, 'fetch'), localStorage: Object.getOwnPropertyDescriptor(g, 'localStorage') };
  Object.defineProperty(g, 'fetch', { value: fetchImpl, configurable: true, writable: true });
  Object.defineProperty(g, 'localStorage', { value: storageShim(store), configurable: true, writable: true });
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('cfg', `${fnSrc}\nreturn await junggoCollect(cfg);`);
    const out = await fn(cfg);
    const r = typeof out === 'string' ? JSON.parse(out) : out;
    if (!r || r.__junggo !== 'v1') throw new Error('수집기 결과 형식이 달라요');
    return r;
  } finally {
    for (const [k, d] of Object.entries(had)) {
      if (d) Object.defineProperty(g, k, d);
      else delete g[k];
    }
  }
}

// ---------- 요청 이슈 (페이지가 만든 것) ----------
export function payloadOf(body) {
  const m = /```junggo[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(String(body || ''));
  if (!m) return null;
  try {
    const box = JSON.parse(m[1].trim());
    return isBox(box) ? box : 'bad';
  } catch {
    return 'bad';
  }
}
async function listRequests({ fetchImpl, token, repo, owner }) {
  if (!token || !repo || !owner) return [];
  const url = `https://api.github.com/repos/${repo}/issues?state=open&creator=${encodeURIComponent(owner)}&sort=created&direction=asc&per_page=50`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!res.ok) throw new Error(`이슈 목록을 읽지 못했어요 (HTTP ${res.status})`);
  const list = await res.json();
  return (Array.isArray(list) ? list : [])
    .filter((i) => i && !i.pull_request && i.user && i.user.login === owner && String(i.title || '').startsWith(TITLE_PREFIX))
    .map((i) => ({ number: i.number, title: String(i.title), body: String(i.body || '') }));
}

// ---------- 결과 묶기 ----------
function viewResults(docs) {
  const out = {};
  for (const [id, d] of Object.entries(docs)) {
    if (id.includes('~')) continue;
    const items = [];
    for (const c of ['j', 'd', 'b']) { const p = docs[`${id}~${c}`]; if (p && Array.isArray(p.items)) items.push(...p.items); }
    const s = docs[`${id}~s`];
    out[id] = { ...d, items, sold: s && Array.isArray(s.items) ? s.items : [] };
  }
  return out;
}
const wrap = (obj) => Object.fromEntries(Object.entries(obj || {}).map(([k, data]) => [k, { data }]));
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v));

export async function run({ prevDir, outDir, workDir, dresDir = '', env = process.env, fetchImpl = globalThis.fetch, now = Date.now, log = console.log, pageGapMs = PAGE_GAP_MS }) {
  for (const d of [outDir, workDir]) fs.mkdirSync(d, { recursive: true });
  const startedAt = now();
  const prevState = readJson(path.join(prevDir, 'state.enc'));
  const prevView = readJson(path.join(prevDir, 'view.enc'));
  const requests = [];
  const finish = (status, files) => {
    for (const [name, v] of Object.entries(files)) if (v) writeJson(path.join(outDir, name), v);
    writeJson(path.join(outDir, 'status.json'), { v: 1, at: now(), ...status });
    writeJson(path.join(workDir, 'close.json'), requests);
    const dn = status.daangn;
    const dLog = dn ? ` · 당근 ${dn.shown}/${dn.searches}개 검색 ${dn.items}건${dn.waiting ? ` (폰 기다림 ${dn.waiting})` : ''}${dn.upload ? ` · 폰 결과 합침 ${dn.upload.merged}/${dn.upload.searches}` : ''}` : '';
    const c = status.calls;
    const cLog = c ? ` · 부른 수 robots ${c.robots} · 중고나라 ${c.joongna} · 번개장터 ${c.bunjang} · 번개장터 상세 ${c.bunjangDetail}` : '';
    log(`[꿀매 레이더] ${status.ok ? '완료' : '실패'} · ${status.message || ''} · 검색 ${status.searches ?? '-'}개 · 매물 ${status.items ?? '-'}건 · 새 매물 ${status.fresh ?? '-'}건${dLog}${cLog} · ${((now() - startedAt) / 1000).toFixed(1)}초`);
    return status;
  };
  // 지난 데이터를 그대로 둘 때 (비밀번호 문제 등)
  const keepOld = (message) => finish({ ok: false, message }, { 'state.enc': prevState, 'view.enc': prevView });

  const password = env.DASH_PASSWORD;
  if (!password) return keepOld('GitHub 저장소 설정(Secrets)에 DASH_PASSWORD 가 없어요');
  const keyFor = keyring(password);
  // 보는 사람(페이지·앱)이 쓰는 비밀번호: DASH_SHARE_PASSWORD(공용 비밀번호)가 있으면 그것, 없으면 DASH_PASSWORD.
  // state.enc(수집기 안쪽)는 늘 DASH_PASSWORD 로 잠가서, 공용 비밀번호를 바꾸거나 잘못 넣어도 검색·기록은 그대로 남는다.
  const sharePassword = env.DASH_SHARE_PASSWORD || password;
  const shareFor = sharePassword === password ? keyFor : keyring(sharePassword);
  // 페이지가 보낸 요청·폰 앱이 올린 결과: 공용 비밀번호 열쇠로, 안 되면(공용 비밀번호를 정하기 전에 잠근 것) DASH_PASSWORD 열쇠로
  const openShared = (box, label) => {
    try {
      return open(box, shareFor, label);
    } catch (e) {
      if (shareFor === keyFor) throw e;
      return open(box, keyFor, label);
    }
  };

  let state;
  if (prevState) {
    try {
      state = open(prevState, keyFor, LABEL.state);
    } catch {
      return keepOld('DASH_PASSWORD 가 지난 데이터를 잠근 비밀번호와 달라 열 수 없어요. 예전 비밀번호로 되돌려 주세요');
    }
  } else {
    state = { v: 1, salt: newSalt(), created: startedAt, searches: {}, config: cleanConfig(null), docs: {}, ledgers: {}, ls: {}, applied: [] };
  }
  for (const k of ['searches', 'docs', 'ledgers', 'ls']) if (!state[k] || typeof state[k] !== 'object') state[k] = {};
  state.config = cleanConfig(state.config);
  // 번개장터 상세를 끈 뒤(W0): 예전에 모아 둔 상세 값은 이번 저장에서 빠진다 (이어 보여주는 지난 매물 포함)
  if (BD_MAX === 0) scrubBunjangDetails(state);
  const key = keyFor(state.salt, ITER);
  const viewKey = shareFor(state.salt, ITER);

  // 처음 한 번: 저장소 Variable 로 넣어 둔 검색 목록
  let bootstrapped = false;
  if (!Object.keys(state.searches).length && env.INIT_SEARCHES) {
    try {
      applyEdit(state, { v: 1, ...JSON.parse(env.INIT_SEARCHES) }, startedAt);
      bootstrapped = Object.keys(state.searches).length > 0;
    } catch {
      log('[꿀매 레이더] INIT_SEARCHES 를 읽지 못했어요');
    }
  }

  // 페이지에서 보낸 요청 (오래된 것부터)
  let requestError = '';
  try {
    for (const it of await listRequests({ fetchImpl, token: env.GITHUB_TOKEN, repo: env.GITHUB_REPOSITORY, owner: env.GITHUB_REPOSITORY_OWNER })) {
      const box = payloadOf(it.body);
      if (!box) { requests.push({ number: it.number, kind: 'refresh', ok: true }); continue; }
      if (box === 'bad') { requests.push({ number: it.number, kind: 'edit', ok: false, note: '요청 내용을 읽지 못했어요. 페이지에서 다시 보내 주세요.' }); continue; }
      try {
        applyEdit(state, openShared(box, LABEL.edit), startedAt);
        requests.push({ number: it.number, kind: 'edit', ok: true });
      } catch (e) {
        const wrong = /unable to authenticate|auth/i.test(String(e && e.message));
        requests.push({ number: it.number, kind: 'edit', ok: false, note: wrong ? '대시보드 비밀번호가 바뀌어 반영하지 못했어요. 페이지를 새로 열어 새 비밀번호로 연 뒤 다시 보내 주세요.' : '요청을 반영하지 못했어요. 페이지에서 다시 보내 주세요.' });
      }
    }
  } catch (e) {
    requestError = String((e && e.message) || e).slice(0, 120);
  }

  // 한 번만: 당근을 고를 수 없던 때(2026-10-13 전) 만든 검색은 당근을 켠다. 그때는 중고나라·번개장터 둘이 기본이었다.
  // (끄고 싶으면 페이지에서 그 검색의 마켓에서 당근을 끄면 된다 — 다시 켜지 않는다)
  if (!state.mig || typeof state.mig !== 'object') state.mig = {};
  if (!state.mig.daangnOn) {
    if (prevState) {
      for (const [id, s] of Object.entries(state.searches)) {
        const pf = Array.isArray(s.platforms) ? s.platforms : [];
        if (!(pf.length === 2 && pf.includes('joongna') && pf.includes('bunjang'))) continue;
        s.platforms = ALL_MARKETS.slice();
        // 조건 지문도 같이 바꿔 둔다 — 안 그러면 시세 흐름이 처음부터 다시 쌓이고 이번 새 매물 표시가 빠진다
        const doc = state.docs[id];
        if (doc) { doc.ckey = collectKey(s); doc.condKey = condKey(s); }
      }
    }
    state.mig.daangnOn = startedAt;
  }

  // 모으기
  const ids = Object.keys(state.searches).sort((a, b) => ((state.searches[a].createdAt || 0) - (state.searches[b].createdAt || 0)) || (a < b ? -1 : 1));
  // 가까운 지역들 (첫 번째가 내 동네). 당근은 폰 앱이 이 지역들에서 찾고, 중고나라·번개장터는 판매 지역이 이 가운데 하나면 '근처'
  const areas = state.config.areas;
  const area = areas[0] || '';
  const person = {
    uid: '', base: '', doc: null, defaults: areas.map((q) => ({ q })), home: null,
    searchDocs: wrap(state.searches), prev: wrap(state.docs), ledgers: wrap(state.ledgers), active: ids,
  };
  const eff = effectiveSearches([person]);
  const collected = {};
  const partErr = {};
  const carry = {};
  const partAt = {};

  // ---- 중고나라·번개장터 (GitHub 서버가 모은다) ----
  const jbWanted = eff.some((s) => s.platforms.some((m) => MARKETS.includes(m)));
  // 폰 앱의 당근 알림이나 정각 실행으로 돈 실행이고, 중고나라·번개장터를 조금 전에 지금 조건 그대로 모았으면 이번엔 다시 모으지 않는다
  const jbSame = ids.every((id) => {
    const s = state.searches[id];
    if (!(s.platforms || []).some((m) => MARKETS.includes(m))) return true;
    const d = state.docs[id];
    return !!(d && d.ckey === collectKey(s));
  });
  const reuseJb = jbWanted && REUSE_EVENTS.includes(env.GITHUB_EVENT_NAME) && !requests.length && jbSame
    && state.jbAt && startedAt - state.jbAt < JB_REUSE_MS;
  const ua = `junggo-dash/1.0 (+https://github.com/${env.GITHUB_REPOSITORY || 'junggo-dash'}; personal use, hourly)`;
  const counter = marketGate(marketFetch(fetchImpl, ua));
  const mfetch = counter.fetch;
  const allowed = {};
  const skipped = {};
  let jobs = [];
  // 쉬는 마켓 {마켓: {until, status}} — 지난 시각은 지운다
  if (!state.rest || typeof state.rest !== 'object') state.rest = {};
  for (const [m, r] of Object.entries(state.rest)) if (!MARKETS.includes(m) || !r || !(r.until > startedAt)) delete state.rest[m];
  if (reuseJb) {
    carry.jb = {};
  } else {
    for (const m of MARKETS) {
      if (!eff.some((s) => s.platforms.includes(m))) continue;
      const r = state.rest[m];
      // 쉬는 동안은 robots.txt 도 부르지 않는다
      allowed[m] = r ? { ok: false, kind: 'rest', why: restWhy(m, r.until) } : await marketAllowed(mfetch, m);
    }
    for (const s of eff) {
      for (const m of s.platforms) if (allowed[m] && !allowed[m].ok) (skipped[s.id] = skipped[s.id] || {})[m] = allowed[m].why;
    }
    jobs = eff.map((s) => ({ ...s, platforms: s.platforms.filter((m) => allowed[m] && allowed[m].ok) })).filter((s) => s.platforms.length);
  }
  if (jobs.length) {
    const cfg = { part: 'jb', maxAgeDays: state.config.maxAgeDays, plain: true, budgetMs: 6 * 60 * 1000, bdMax: BD_MAX, pageGapMs, searches: jobs.map((s) => slim(s, 'jb', {})) };
    try {
      collected.jb = await runCollector(cfg, { fetchImpl: mfetch, store: state.ls });
      state.jbAt = startedAt;
      partAt.jb = startedAt;
    } catch (e) {
      partErr.jb = `모으는 중 오류가 났어요: ${String((e && e.message) || e).slice(0, 80)}`;
    }
    // 이번에 403·429 를 받은 마켓은 REST_MS 동안 쉰다. 그 때문에 못 모은 검색은 쉬는 안내로 (지난 매물은 이어 보여준다)
    for (const m of MARKETS) {
      if (!counter.hit[m]) continue;
      state.rest[m] = { until: startedAt + REST_MS, status: counter.hit[m] };
      const why = restWhy(m, state.rest[m].until);
      for (const r of Object.values((collected.jb && collected.jb.results) || {})) {
        const info = r && r.pf && r.pf[m];
        if (info && info.st === 'error') info.error = why;
      }
    }
  }

  // ---- 당근 (폰 앱이 모아 올린 것) ----
  const dWanted = eff.some((s) => s.platforms.includes('daangn'));
  const dCk = Object.fromEntries(eff.filter((s) => s.platforms.includes('daangn')).map((s) => [s.id, dKey(s, dSig(areas))]));
  const dPrev = state.daangn && typeof state.daangn === 'object' ? state.daangn : {};
  const got = readDres(dresDir, openShared);
  let dNote = '';
  if (got.error) dNote = got.error;
  // 새로 올렸는지는 폰이 적은 시각(raw)이 지난번과 다른지로 본다. 폰 시계가 빠를 수 있어 보여주는 시각(at)은 이번 실행 시각을 넘지 않게
  const lastRaw = Number.isFinite(dPrev.raw) ? dPrev.raw : dPrev.at || 0;
  const fresh = got.dres && Number(got.dres.at) !== lastRaw ? got.dres : null;
  let d = { ...dPrev };
  // 이번에 새로 받은 폰 결과를 얼마나 합쳤는지 (status.json 요약용 — 건수만)
  let dUp = null;
  // 폰이 모은 뒤 조건이 바뀌어 이번에 합치지 않은 검색
  const dChanged = new Set();
  if (fresh) {
    const raw = Number(fresh.at);
    d = {
      at: Math.min(raw, startedAt), raw, job: String(fresh.job || ''), device: String(fresh.device || '').slice(0, 40), app: String(fresh.app || '').slice(0, 20),
      // 앱 0.2.3 부터: 사용자가 '지금 모으기'를 눌렀는지(manual) 백그라운드 작업이 모았는지(auto)
      by: ['manual', 'auto'].includes(fresh.trigger) ? fresh.trigger : '',
      ok: !!fresh.ok, error: fresh.ok ? '' : String(fresh.error || '폰 앱이 당근을 모으지 못했어요').slice(0, 160),
    };
    if (fresh.ok && fresh.result && fresh.result.__junggo === 'v1' && fresh.result.part === 'd' && fresh.result.results && typeof fresh.result.results === 'object') {
      // 폰이 모은 뒤 조건(검색어·지역 등)이 바뀐 검색은 합치지 않는다 → 다음에 폰이 새 조건으로 모을 때까지 지난 매물을 이어 보여준다
      const ck = fresh.ck && typeof fresh.ck === 'object' ? fresh.ck : {};
      const results = {};
      for (const [sid, r] of Object.entries(fresh.result.results)) {
        if (dCk[sid] && ck[sid] === dCk[sid]) results[sid] = r;
        else if (dCk[sid]) dChanged.add(sid);
      }
      dUp = { searches: Object.keys(fresh.result.results).length, merged: Object.keys(results).length, changed: dChanged.size };
      collected.d = { ...fresh.result, results };
      partAt.d = d.at;
      const h = fresh.result.homes && fresh.result.homes[''];
      if (h && Number.isFinite(h.lat) && Number.isFinite(h.lng)) state.home = { q: String(h.q || ''), lat: h.lat, lng: h.lng, name: String(h.fullName || h.name || '').slice(0, 60) };
    }
  }
  if (dWanted) {
    // 지역을 아직 안 정한 것은 오류가 아니라 처음 설정이 남은 것 → '기다림'으로 알린다(페이지가 설정 열기 단추를 붙인다)
    if (!areas.length) carry.d = { st: 'wait', need: 'area', note: "당근을 찾을 동네가 아직 없어요. '설정'에서 가까운 지역(예: 경기도 시흥시)을 정해 주세요", ok: () => false };
    else if (d.at && !d.ok) partErr.d = d.error;
    else {
      // 지난 당근 매물은 그 매물을 모은 조건(검색·지역 지문 dk)이 지금과 같을 때만 이어 보여준다
      // (기다리는 까닭은 아래 buildResults 뒤에 검색마다 '새 검색' / '조건이 바뀜'으로 나눠 적는다)
      carry.d = {
        st: 'wait',
        note: d.at ? D_NOTE.changed : '폰 앱(꿀매 레이더)이 아직 당근을 올리지 않았어요',
        ok: (id, old) => !!(collected.d && collected.d.results && collected.d.results[id]) || !!(old && old.pf && old.pf.daangn && old.pf.daangn.dk && old.pf.daangn.dk === dCk[id]),
      };
    }
  }
  state.daangn = d;

  // 거리 기준: 설정의 거리 기준(home, 예: 경기도 시흥시 정왕동) → 비었으면 첫 지역.
  // 지역 표(places.json)로 가운데를 찾고, 표에 없는 이름이면 폰 앱이 당근에서 찾아 준 가운데를 쓴다
  const homeQ = state.config.home || area;
  let home = null;
  if (homeQ) {
    const p = findPlace(homeQ);
    if (p) home = { q: homeQ, lat: p.lat, lng: p.lng, name: p.name, level: p.level };
    else if (state.home && state.home.q === homeQ && Number.isFinite(state.home.lat) && Number.isFinite(state.home.lng)) home = { q: homeQ, lat: state.home.lat, lng: state.home.lng, name: state.home.name || homeQ, level: 'daangn' };
  }
  // 좌표가 없는 새 매물의 대략 위치 (거리 '≈'): 중고나라·번개장터는 판매 지역 이름의 동 가운데(여럿이면 거리 기준에서 가장 가까운 곳),
  // 당근은 가까운 동네(근처)인데 거래 좌표가 없으면 가까운 지역들 안에서 그 동 이름으로 찾는다
  const locate = (t, x) => {
    let best = null;
    let bestKm = Infinity;
    const consider = (p) => {
      if (!p) return;
      const k = home ? kmBetween([p.lat, p.lng], [home.lat, home.lng]) : 0;
      if (!best || k < bestKm) { best = p; bestKm = k; }
    };
    if (Array.isArray(x.ar)) for (const n of x.ar.slice(0, 3)) consider(findPlace(n));
    else if (t[0] === 'd' && t[11] === 1 && t[5]) for (const a of areas) { const p = findPlace(`${a} ${t[5]}`); if (p && p.level === 'dong') consider(p); }
    return best ? [best.lat, best.lng] : null;
  };

  const prevDocs = state.docs;
  const built = buildResults({
    searches: wrap(state.searches), prev: wrap(state.docs), ledgers: wrap(state.ledgers), collected,
    now: startedAt, maxAgeDays: state.config.maxAgeDays, home, locate, keyOf: (id) => id, skipped, partErr, carry, partAt,
  });
  state.docs = built.docs;
  state.ledgers = built.ledgerDocs;
  // 이번에 합친 당근 매물이 어떤 조건(검색·지역)으로 모은 것인지 적어 둔다 → 조건이 바뀌면 이어 보여주지 않는다
  if (collected.d && collected.d.results) {
    for (const id of Object.keys(collected.d.results)) {
      const pfd = state.docs[id] && state.docs[id].pf && state.docs[id].pf.daangn;
      if (pfd && pfd.st === 'ok') pfd.dk = dCk[id];
    }
  }
  // 당근 요약(건수만) + 기다리는 검색은 까닭을 나눠 알린다:
  //   new     = 이 검색으로는 폰이 아직 당근을 모은 적이 없다 (새 검색, 당근을 막 켬)
  //   changed = 폰이 모은 뒤 검색 조건이나 가까운 지역이 바뀌었다 (다음에 폰이 새 조건으로 모으면 보인다)
  const dSum = { searches: 0, shown: 0, waiting: 0, errors: 0, items: 0 };
  for (const id of Object.keys(dCk)) {
    const doc = state.docs[id];
    const pfd = doc && doc.pf && doc.pf.daangn;
    if (!pfd) continue;
    dSum.searches++;
    if (pfd.st === 'ok') {
      dSum.shown++;
      dSum.items += (doc.parts && doc.parts.d) || 0;
    } else if (pfd.st === 'error') {
      dSum.errors++;
    } else if (pfd.st === 'wait') {
      dSum.waiting++;
      if (pfd.need || !d.at) continue;
      const was = prevDocs[id] && prevDocs[id].pf && prevDocs[id].pf.daangn;
      const why = dChanged.has(id) || (was && (was.dk || was.why === 'changed')) ? 'changed' : 'new';
      pfd.why = why;
      pfd.note = D_NOTE[why];
    }
  }

  // 폰 앱이 할 일 (다음에 앱이 받아 간다)
  const djob = daangnJob({ eff, areas, homeQ, maxAgeDays: state.config.maxAgeDays, now: startedAt, ck: dCk });

  // 요약 (검색어 없이)
  const sums = Object.values(built.summary);
  const items = sums.reduce((a, s) => a + s.n, 0);
  const freshN = sums.reduce((a, s) => a + s.new, 0);
  const markets = {};
  for (const m of MARKETS) {
    if (!(m in allowed)) continue;
    const bad = !allowed[m].ok || Object.values(state.docs).some((x) => x && x.pf && x.pf[m] && x.pf[m].st === 'error');
    // blocked = robots.txt 가 막음, unchecked = robots.txt 를 확인하지 못해 건너뜀, rest = 사이트가 막아(403·429) 쉬는 중
    markets[m] = !allowed[m].ok ? ({ unchecked: 'unchecked', rest: 'rest' }[allowed[m].kind] || 'blocked') : counter.hit[m] ? 'rest' : bad ? 'error' : 'ok';
  }
  const dStatus = !dWanted ? 'none' : !area ? 'noarea' : !d.at ? 'wait' : !d.ok ? 'error' : startedAt - d.at > D_STALE_MS ? 'stale' : 'ok';
  if (dWanted) markets.daangn = dStatus;
  const failedAll = jobs.length > 0 && !collected.jb;
  const errNames = MARKETS.filter((m) => markets[m] && markets[m] !== 'ok').map((m) => NAME[m]);
  let message = failedAll ? (partErr.jb || '매물을 모으지 못했어요') : errNames.length ? `일부 마켓을 불러오지 못했어요 (${errNames.join(', ')})` : '';
  if (!ids.length) message = '저장한 검색이 없어요';
  const refresh = {
    status: failedAll ? 'failed' : 'done', by: 'github', startedAt, finishedAt: now(), message, summary: built.summary,
    jbAt: state.jbAt || 0, reusedJb: !!reuseJb, calls: { ...counter.calls },
    ...(dWanted ? { daangn: { st: dStatus, at: d.at || 0, device: d.device || '', app: d.app || '', by: d.by || '', error: d.ok === false ? d.error || '' : '', note: dNote } } : {}),
    ...(collected.jb && collected.jb.bd ? { bd: collected.jb.bd } : {}),
    ...(requestError ? { requestError } : {}),
  };
  const view = {
    v: 1, at: now(),
    searches: ids.map((id) => ({ id, ...state.searches[id] })),
    results: viewResults(state.docs),
    refresh, config: state.config, applied: (state.applied || []).slice(-KEEP_APPLIED),
    // 설정 창의 안내: 거리 기준으로 찾은 곳(이름·정밀도), 둘레의 시·군·구(가까운 지역 추천 — 이미 고른 곳은 빼고)
    places: {
      home: home ? { q: home.q, name: home.name, level: home.level } : null,
      near: home ? nearbyAreas(home, { skip: areas }) : [],
    },
  };
  return finish(
    {
      ok: !failedAll, message: requestError ? `${message ? `${message} · ` : ''}요청 이슈를 읽지 못했어요` : message, searches: ids.length, items, fresh: freshN, markets, requests: requests.length, bootstrapped, reusedJb: !!reuseJb, daangnAt: d.at || 0,
      // 이번 실행에서 사이트를 부른 수 (건수만): robots.txt, 중고나라 검색, 번개장터 검색, 번개장터 상세(W0 부터 0이어야 한다)
      calls: { ...counter.calls },
      // 사이트가 막아(403·429) 쉬는 마켓과 다시 할 시각 (없으면 빈 칸)
      rest: Object.fromEntries(Object.entries(state.rest).map(([m, r]) => [m, r.until])),
      // 중고나라·번개장터를 마지막으로 모은 시각 — 워크플로가 이 시각 한 시간 뒤로 다음 수집 시계(timer.yml)를 맞춘다
      jbAt: state.jbAt || 0,
      // 당근 요약 (건수만 — 비밀번호 없이도 당근이 붙었는지 볼 수 있게): 당근을 켠 검색 수, 그중 매물을 보여주는 수·기다리는 수·오류 수, 당근 매물 수,
      // 이번에 새로 받은 폰 결과를 합쳤으면 upload = { 폰이 모은 검색 수, 합친 수, 조건이 바뀌어 안 합친 수 }
      ...(dWanted ? { daangn: { ...dSum, by: d.by || '', ...(dUp ? { upload: dUp } : {}) } } : {}),
    },
    {
      'state.enc': seal(state, key, state.salt, LABEL.state),
      'view.enc': seal(view, viewKey, state.salt, LABEL.view),
      'djob.enc': seal(djob, viewKey, state.salt, LABEL.djob),
    },
  );
}

// ---------- 당근 (폰 앱) ----------
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
// 당근을 다시 모아야 하는 조건 지문 (검색 조건 + 가까운 지역들). 앱이 할 일과 함께 받아 결과에 그대로 돌려준다
// 지역이 하나면 그 이름 그대로 넣어 예전(지역 하나일 때) 지문과 같게 한다. 거리 기준(home)은 넣지 않는다 — 거리는 합칠 때 다시 잰다
export const dSig = (areas) => (areas.length <= 1 ? areas[0] || '' : areas.join(' + '));
export const dKey = (s, sig) => sha256(`${collectKey(s)}|${sig || ''}`).slice(0, 16);

// 폰 앱이 할 일: 수집기(당근 부분) 코드 + 조건. 앱은 이걸 열어 당근 사이트에서 그대로 돌린다
export function daangnJob({ eff, areas, homeQ, maxAgeDays, now, ck }) {
  const want = eff.filter((s) => s.platforms.includes('daangn'));
  const base = { v: 1, at: now };
  if (!want.length) return { ...base, id: 'idle-none', idle: true, reason: '당근으로 찾을 검색이 없어요. 대시보드에서 검색의 마켓에 당근을 켜 주세요' };
  if (!areas.length) return { ...base, id: 'idle-area', idle: true, reason: "대시보드 '설정'에서 가까운 지역(예: 경기도 시흥시)을 정하면 당근을 모아요" };
  const regionDefs = {};
  // 지역이 여럿이면 지역마다 기준 동네를 줄이고(collect.js 의 dCalls) 시간을 조금 더 준다
  const cfg = { part: 'd', maxAgeDays, plain: true, budgetMs: areas.length > 1 ? 210000 : 150000 };
  if (want.length > ROUND.d) { cfg.dAnchors = 3; if (areas.length > 1) cfg.dCalls = 5; }
  const searches = want.map((s) => slim(s, 'd', regionDefs));
  if (Object.keys(regionDefs).length) cfg.regions = regionDefs;
  // 거리 기준 동네의 가운데 (표에 없는 이름일 때만 쓰인다)
  cfg.homes = [{ k: '', q: homeQ || areas[0] }];
  cfg.searches = searches;
  const { fnSrc } = collectorInfo('d');
  return {
    ...base,
    id: sha256(`${fnSrc}\n${JSON.stringify(cfg)}`).slice(0, 16),
    start: 'https://www.daangn.com/robots.txt',
    robots: { origin: 'https://www.daangn.com', paths: D_PATHS },
    code: fnSrc, cfg, ck, everyMin: 60, timeoutMs: cfg.budgetMs + 90000,
  };
}

// 폰 앱이 올린 결과 (없거나 열 수 없으면 dres 없이)
function readDres(dir, openBox) {
  if (!dir) return {};
  const box = readJson(path.join(dir, 'dres.enc'));
  if (!box) return {};
  try {
    const dres = openBox(box, LABEL.dres);
    if (!dres || dres.v !== 1 || !Number.isFinite(Number(dres.at))) return { error: '폰 앱이 올린 당근 결과 형식이 달라요. 앱을 새 버전으로 바꿔 주세요' };
    return { dres };
  } catch {
    return { error: '폰 앱이 올린 당근 결과를 열지 못했어요. 대시보드 비밀번호가 바뀌었다면 앱의 대시보드 화면에서 새 비밀번호(또는 연결 코드)를 다시 넣어 주세요' };
  }
}

const isMain = (() => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  const [prevDir = 'prev', outDir = 'out', workDir = 'work', dresDir = ''] = process.argv.slice(2);
  run({ prevDir, outDir, workDir, dresDir }).catch((e) => {
    console.error('[꿀매 레이더] 예상하지 못한 오류:', String((e && e.stack) || e).split('\n').slice(0, 4).join(' | '));
    process.exit(1);
  });
}
