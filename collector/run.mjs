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
// 환경 변수: DASH_PASSWORD(저장소 Secret), GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_REPOSITORY_OWNER,
//            INIT_SEARCHES(처음 한 번만 쓰는 검색 목록, 저장소 Variable — 없어도 된다)
// 로그는 공개되므로 검색어·매물 제목은 찍지 않는다(건수만).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildResults, collectKey, condKey, collectorInfo, effectiveSearches, slim, CATEGORIES, ROUND } from './refresh.mjs';
import { ITER, LABEL, isBox, keyring, newSalt, open, seal } from './seal.mjs';

// GitHub 서버가 모으는 마켓. 당근은 폰 앱이 모아 올린다
export const MARKETS = ['joongna', 'bunjang'];
export const ALL_MARKETS = ['joongna', 'daangn', 'bunjang'];
const NAME = { joongna: '중고나라', daangn: '당근', bunjang: '번개장터' };
// 폰 앱이 당근에서 부르는 경로 (앱이 robots.txt 의 일반(*) 규칙으로 하나씩 본다)
export const D_PATHS = ['/kr/search/buy-sell/', '/kr/buy-sell/', '/kr/regions/', '/kr/api/v1/regions/keyword'];
// 당근만 합치러 돈 실행(폰 앱의 알림)에서는 중고나라·번개장터를 이만큼 안에 모았으면 다시 모으지 않는다
const JB_REUSE_MS = 45 * 60 * 1000;
// 폰 앱이 이보다 오래 당근을 올리지 않았으면 페이지에 알린다
export const D_STALE_MS = 3 * 3600 * 1000;
// 수집기가 부르는 주소 (robots.txt 로 허용 여부를 먼저 본다)
const ENDPOINTS = {
  joongna: [{ origin: 'https://search-api.joongna.com', path: '/v3/search/all' }],
  bunjang: [{ origin: 'https://api.bunjang.co.kr', path: '/api/search/v8/web/search' }, { origin: 'https://api.bunjang.co.kr', path: '/api/pms/v3/products-detail/' }],
};
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
export function cleanConfig(raw, prev = {}) {
  const c = { area: typeof prev.area === 'string' ? prev.area : '', maxAgeDays: num(prev.maxAgeDays) ?? 30 };
  if (raw && typeof raw === 'object') {
    if (typeof raw.area === 'string') c.area = raw.area.replace(/\s+/g, ' ').trim().slice(0, 40);
    const a = num(raw.maxAgeDays);
    if (a != null && a >= 0 && a <= 365) c.maxAgeDays = Math.round(a);
  }
  return c;
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
async function marketAllowed(fetchImpl, market) {
  const seen = new Map();
  for (const { origin, path: p } of ENDPOINTS[market]) {
    if (!seen.has(origin)) {
      let r = null;
      try {
        const res = await fetchImpl(`${origin}/robots.txt`, { signal: AbortSignal.timeout(10000) });
        r = { status: res.status, text: res.status === 200 ? await res.text() : '' };
      } catch {
        r = { status: 0, text: '' };
      }
      seen.set(origin, r);
    }
    const r = seen.get(origin);
    if (r.status === 0 || r.status >= 500) return { ok: false, why: `${NAME[market]}에 연결하지 못했어요` };
    if (r.status === 200 && !robotsAllows(r.text, p)) return { ok: false, why: `${NAME[market]}가 자동 수집을 막아 두어(robots.txt) 모으지 않았어요` };
  }
  return { ok: true };
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
export async function runCollector(cfg, { fetchImpl, store }) {
  const { fnSrc } = collectorInfo('jb');
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

export async function run({ prevDir, outDir, workDir, dresDir = '', env = process.env, fetchImpl = globalThis.fetch, now = Date.now, log = console.log }) {
  for (const d of [outDir, workDir]) fs.mkdirSync(d, { recursive: true });
  const startedAt = now();
  const prevState = readJson(path.join(prevDir, 'state.enc'));
  const prevView = readJson(path.join(prevDir, 'view.enc'));
  const requests = [];
  const finish = (status, files) => {
    for (const [name, v] of Object.entries(files)) if (v) writeJson(path.join(outDir, name), v);
    writeJson(path.join(outDir, 'status.json'), { v: 1, at: now(), ...status });
    writeJson(path.join(workDir, 'close.json'), requests);
    log(`[꿀매 레이더] ${status.ok ? '완료' : '실패'} · ${status.message || ''} · 검색 ${status.searches ?? '-'}개 · 매물 ${status.items ?? '-'}건 · 새 매물 ${status.fresh ?? '-'}건 · ${((now() - startedAt) / 1000).toFixed(1)}초`);
    return status;
  };
  // 지난 데이터를 그대로 둘 때 (비밀번호 문제 등)
  const keepOld = (message) => finish({ ok: false, message }, { 'state.enc': prevState, 'view.enc': prevView });

  const password = env.DASH_PASSWORD;
  if (!password) return keepOld('GitHub 저장소 설정(Secrets)에 DASH_PASSWORD 가 없어요');
  const keyFor = keyring(password);

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
  const key = keyFor(state.salt, ITER);

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
        applyEdit(state, open(box, keyFor, LABEL.edit), startedAt);
        requests.push({ number: it.number, kind: 'edit', ok: true });
      } catch (e) {
        const wrong = /unable to authenticate|auth/i.test(String(e && e.message));
        requests.push({ number: it.number, kind: 'edit', ok: false, note: wrong ? '비밀번호가 GitHub 설정(DASH_PASSWORD)과 달라 반영하지 못했어요.' : '요청을 반영하지 못했어요. 페이지에서 다시 보내 주세요.' });
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
  const area = state.config.area;
  const person = {
    uid: '', base: '', doc: null, defaults: area ? [{ q: area }] : [], home: null,
    searchDocs: wrap(state.searches), prev: wrap(state.docs), ledgers: wrap(state.ledgers), active: ids,
  };
  const eff = effectiveSearches([person]);
  const collected = {};
  const partErr = {};
  const carry = {};
  const partAt = {};

  // ---- 중고나라·번개장터 (GitHub 서버가 모은다) ----
  const jbWanted = eff.some((s) => s.platforms.some((m) => MARKETS.includes(m)));
  // 폰 앱의 당근 알림으로 돈 실행이고, 중고나라·번개장터를 조금 전에 지금 조건 그대로 모았으면 이번엔 다시 모으지 않는다
  const jbSame = ids.every((id) => {
    const s = state.searches[id];
    if (!(s.platforms || []).some((m) => MARKETS.includes(m))) return true;
    const d = state.docs[id];
    return !!(d && d.ckey === collectKey(s));
  });
  const reuseJb = jbWanted && env.GITHUB_EVENT_NAME === 'repository_dispatch' && !requests.length && jbSame
    && state.jbAt && startedAt - state.jbAt < JB_REUSE_MS;
  const ua = `junggo-dash/1.0 (+https://github.com/${env.GITHUB_REPOSITORY || 'junggo-dash'}; personal use, hourly)`;
  const mfetch = marketFetch(fetchImpl, ua);
  const allowed = {};
  const skipped = {};
  let jobs = [];
  if (reuseJb) {
    carry.jb = {};
  } else {
    for (const m of MARKETS) if (eff.some((s) => s.platforms.includes(m))) allowed[m] = await marketAllowed(mfetch, m);
    for (const s of eff) {
      for (const m of s.platforms) if (allowed[m] && !allowed[m].ok) (skipped[s.id] = skipped[s.id] || {})[m] = allowed[m].why;
    }
    jobs = eff.map((s) => ({ ...s, platforms: s.platforms.filter((m) => allowed[m] && allowed[m].ok) })).filter((s) => s.platforms.length);
  }
  if (jobs.length) {
    const cfg = { part: 'jb', maxAgeDays: state.config.maxAgeDays, plain: true, budgetMs: 6 * 60 * 1000, searches: jobs.map((s) => slim(s, 'jb', {})) };
    try {
      collected.jb = await runCollector(cfg, { fetchImpl: mfetch, store: state.ls });
      state.jbAt = startedAt;
      partAt.jb = startedAt;
    } catch (e) {
      partErr.jb = `모으는 중 오류가 났어요: ${String((e && e.message) || e).slice(0, 80)}`;
    }
  }

  // ---- 당근 (폰 앱이 모아 올린 것) ----
  const dWanted = eff.some((s) => s.platforms.includes('daangn'));
  const dCk = Object.fromEntries(eff.filter((s) => s.platforms.includes('daangn')).map((s) => [s.id, dKey(s, area)]));
  const dPrev = state.daangn && typeof state.daangn === 'object' ? state.daangn : {};
  const got = readDres(dresDir, keyFor);
  let dNote = '';
  if (got.error) dNote = got.error;
  // 새로 올렸는지는 폰이 적은 시각(raw)이 지난번과 다른지로 본다. 폰 시계가 빠를 수 있어 보여주는 시각(at)은 이번 실행 시각을 넘지 않게
  const lastRaw = Number.isFinite(dPrev.raw) ? dPrev.raw : dPrev.at || 0;
  const fresh = got.dres && Number(got.dres.at) !== lastRaw ? got.dres : null;
  let d = { ...dPrev };
  if (fresh) {
    const raw = Number(fresh.at);
    d = { at: Math.min(raw, startedAt), raw, job: String(fresh.job || ''), device: String(fresh.device || '').slice(0, 40), app: String(fresh.app || '').slice(0, 20), ok: !!fresh.ok, error: fresh.ok ? '' : String(fresh.error || '폰 앱이 당근을 모으지 못했어요').slice(0, 160) };
    if (fresh.ok && fresh.result && fresh.result.__junggo === 'v1' && fresh.result.part === 'd' && fresh.result.results && typeof fresh.result.results === 'object') {
      // 폰이 모은 뒤 조건(검색어·지역 등)이 바뀐 검색은 합치지 않는다 → 다음에 폰이 새 조건으로 모을 때까지 지난 매물을 이어 보여준다
      const ck = fresh.ck && typeof fresh.ck === 'object' ? fresh.ck : {};
      const results = {};
      for (const [sid, r] of Object.entries(fresh.result.results)) if (dCk[sid] && ck[sid] === dCk[sid]) results[sid] = r;
      collected.d = { ...fresh.result, results };
      partAt.d = d.at;
      const h = fresh.result.homes && fresh.result.homes[''];
      if (h && Number.isFinite(h.lat) && Number.isFinite(h.lng)) state.home = { q: String(h.q || ''), lat: h.lat, lng: h.lng };
    }
  }
  if (dWanted) {
    if (!area) partErr.d = "'설정'에서 가까운 지역(예: 경기도 시흥시)을 정하면 폰 앱이 당근을 모아요";
    else if (d.at && !d.ok) partErr.d = d.error;
    else {
      // 지난 당근 매물은 그 매물을 모은 조건(검색·지역 지문 dk)이 지금과 같을 때만 이어 보여준다
      carry.d = {
        st: 'wait',
        note: d.at ? '검색 조건이나 가까운 지역이 바뀌었어요. 폰 앱이 새 조건으로 모으면 보여요' : '폰 앱(꿀매 레이더)이 아직 당근을 올리지 않았어요',
        ok: (id, old) => !!(collected.d && collected.d.results && collected.d.results[id]) || !!(old && old.pf && old.pf.daangn && old.pf.daangn.dk && old.pf.daangn.dk === dCk[id]),
      };
    }
  }
  state.daangn = d;
  const home = state.home && area && state.home.q === area ? state.home : null;

  const built = buildResults({
    searches: wrap(state.searches), prev: wrap(state.docs), ledgers: wrap(state.ledgers), collected,
    now: startedAt, maxAgeDays: state.config.maxAgeDays, home, keyOf: (id) => id, skipped, partErr, carry, partAt,
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

  // 폰 앱이 할 일 (다음에 앱이 받아 간다)
  const djob = daangnJob({ eff, area, maxAgeDays: state.config.maxAgeDays, now: startedAt, ck: dCk });

  // 요약 (검색어 없이)
  const sums = Object.values(built.summary);
  const items = sums.reduce((a, s) => a + s.n, 0);
  const freshN = sums.reduce((a, s) => a + s.new, 0);
  const markets = {};
  for (const m of MARKETS) {
    if (!(m in allowed)) continue;
    const bad = !allowed[m].ok || Object.values(state.docs).some((x) => x && x.pf && x.pf[m] && x.pf[m].st === 'error');
    markets[m] = !allowed[m].ok ? 'blocked' : bad ? 'error' : 'ok';
  }
  const dStatus = !dWanted ? 'none' : !area ? 'noarea' : !d.at ? 'wait' : !d.ok ? 'error' : startedAt - d.at > D_STALE_MS ? 'stale' : 'ok';
  if (dWanted) markets.daangn = dStatus;
  const failedAll = jobs.length > 0 && !collected.jb;
  const errNames = MARKETS.filter((m) => markets[m] && markets[m] !== 'ok').map((m) => NAME[m]);
  let message = failedAll ? (partErr.jb || '매물을 모으지 못했어요') : errNames.length ? `일부 마켓을 불러오지 못했어요 (${errNames.join(', ')})` : '';
  if (!ids.length) message = '저장한 검색이 없어요';
  const refresh = {
    status: failedAll ? 'failed' : 'done', by: 'github', startedAt, finishedAt: now(), message, summary: built.summary,
    jbAt: state.jbAt || 0, reusedJb: !!reuseJb,
    ...(dWanted ? { daangn: { st: dStatus, at: d.at || 0, device: d.device || '', app: d.app || '', error: d.ok === false ? d.error || '' : '', note: dNote } } : {}),
    ...(collected.jb && collected.jb.bd ? { bd: collected.jb.bd } : {}),
    ...(requestError ? { requestError } : {}),
  };
  const view = {
    v: 1, at: now(),
    searches: ids.map((id) => ({ id, ...state.searches[id] })),
    results: viewResults(state.docs),
    refresh, config: state.config, applied: (state.applied || []).slice(-KEEP_APPLIED),
  };
  return finish(
    { ok: !failedAll, message: requestError ? `${message ? `${message} · ` : ''}요청 이슈를 읽지 못했어요` : message, searches: ids.length, items, fresh: freshN, markets, requests: requests.length, bootstrapped, reusedJb: !!reuseJb, daangnAt: d.at || 0 },
    {
      'state.enc': seal(state, key, state.salt, LABEL.state),
      'view.enc': seal(view, key, state.salt, LABEL.view),
      'djob.enc': seal(djob, key, state.salt, LABEL.djob),
    },
  );
}

// ---------- 당근 (폰 앱) ----------
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
// 당근을 다시 모아야 하는 조건 지문 (검색 조건 + 가까운 지역). 앱이 할 일과 함께 받아 결과에 그대로 돌려준다
export const dKey = (s, area) => sha256(`${collectKey(s)}|${area || ''}`).slice(0, 16);

// 폰 앱이 할 일: 수집기(당근 부분) 코드 + 조건. 앱은 이걸 열어 당근 사이트에서 그대로 돌린다
export function daangnJob({ eff, area, maxAgeDays, now, ck }) {
  const want = eff.filter((s) => s.platforms.includes('daangn'));
  const base = { v: 1, at: now };
  if (!want.length) return { ...base, id: 'idle-none', idle: true, reason: '당근으로 찾을 검색이 없어요. 대시보드에서 검색의 마켓에 당근을 켜 주세요' };
  if (!area) return { ...base, id: 'idle-area', idle: true, reason: "대시보드 '설정'에서 가까운 지역(예: 경기도 시흥시)을 정하면 당근을 모아요" };
  const regionDefs = {};
  const cfg = { part: 'd', maxAgeDays, plain: true, budgetMs: 150000 };
  if (want.length > ROUND.d) cfg.dAnchors = 3;
  const searches = want.map((s) => slim(s, 'd', regionDefs));
  if (Object.keys(regionDefs).length) cfg.regions = regionDefs;
  cfg.homes = [{ k: '', q: area }];
  cfg.searches = searches;
  const { fnSrc } = collectorInfo('d');
  return {
    ...base,
    id: sha256(`${fnSrc}\n${JSON.stringify(cfg)}`).slice(0, 16),
    start: 'https://www.daangn.com/robots.txt',
    robots: { origin: 'https://www.daangn.com', paths: D_PATHS },
    code: fnSrc, cfg, ck, everyMin: 60, timeoutMs: 240000,
  };
}

// 폰 앱이 올린 결과 (없거나 열 수 없으면 dres 없이)
function readDres(dir, keyFor) {
  if (!dir) return {};
  const box = readJson(path.join(dir, 'dres.enc'));
  if (!box) return {};
  try {
    const dres = open(box, keyFor, LABEL.dres);
    if (!dres || dres.v !== 1 || !Number.isFinite(Number(dres.at))) return { error: '폰 앱이 올린 당근 결과 형식이 달라요. 앱을 새 버전으로 바꿔 주세요' };
    return { dres };
  } catch {
    return { error: '폰 앱이 올린 당근 결과를 열지 못했어요. 앱에 넣은 비밀번호가 대시보드 비밀번호와 같은지 확인해 주세요' };
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
