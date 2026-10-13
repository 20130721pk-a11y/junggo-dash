// 꿀매 레이더 수집 라이브러리 — 조건 지문, 결과 문서 만들기(새 매물·가격 변동·시세 흐름), 수집기(collect.js 압축본)
// 이 저장소(junggo-dash)에서는 GitHub Actions 의 collector/run.mjs 가 이 파일의 함수를 가져다 쓴다.
// 원본: collector/src/ — 고친 뒤 `node collector/src/build.mjs` 로 collector/refresh.mjs 를 다시 만든다.
// (아래 명령들은 예전에 Claude 대화가 claude.ai 대시보드를 새로고침할 때 쓰던 것이다. run.mjs 는 쓰지 않는다.)
//
// 데이터베이스는 ArtifactData list 의 out_dir 하나(W)로 받는다 → W/<collection>/<doc_id>.json
//   node refresh.mjs members W
//       → 같이 쓰는 사람(u/<id>)마다 더 받아야 할 컬렉션 경로(JSON 배열)를 출력한다. 경로마다 ArtifactData list 를 부른다.
//   node refresh.mjs prepare W
//       → 내장 브라우저에서 할 일 순서표 {"steps":[{n,do:"navigate",url}|{n,do:"javascript",what,chars}]} 를 출력하고
//         javascript 단계의 실행문을 W/steps/<n>.txt 에 쓴다.
//   node refresh.mjs step W <n>
//       → n 번째 javascript 단계의 실행문 원문만 출력한다. javascript_tool 의 text 로 글자 그대로 넘긴다.
//         실행문 = 수집기 함수 전문 + 조건 + SHA-256 자기 확인. 옮겨 적다 틀리면 실행하지 않고 틀림 표시(아래 MISMATCH)를 돌려준다.
//         (예전처럼 사이트 localStorage 에 코드를 넣어 두고 꺼내 쓰지 않는다 — 실행되는 코드가 늘 기록에 보이게)
//   node refresh.mjs build W <시작 시각 ms>
//       → 이 세션 대화 기록에서 수집 결과·문서 버전을 읽어 W/out/writes.json (ArtifactData batch writes) 를 만든다.
//   node refresh.mjs fail W <시작 시각 ms> "<이유>"
//       → meta/refresh 를 실패로 바꾸는 writes.json 을 만든다.
//   node refresh.mjs info
//       → 수집기 길이·SHA-256 (확인용)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const COLLECTOR = { jb: __COLLECT_JB__, d: __COLLECT_D__ };
const ORDER = ['joongna', 'daangn', 'bunjang'];
export const PART_OF = { joongna: 'jb', bunjang: 'jb', daangn: 'd' };
const CODE_OF = { joongna: 'j', daangn: 'd', bunjang: 'b' };
const SITE_OF = { jb: 'https://web.joongna.com/', d: 'https://www.daangn.com/kr/buy-sell/' };
const MAX_DOC_BYTES = 240000;
// 같이 쓰는 사람 한 명이 모을 수 있는 검색 수 (먼저 만든 것부터). 동춘님(주인) 검색은 제한 없음
export const MEMBER_MAX = 5;
// 수집기 한 번(javascript_tool 45초 안)에 넣는 검색 수. 넘으면 같은 탭에서 여러 번 나눠 실행한다
export const ROUND = { jb: 15, d: 8 };
const UID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const LEDGER_MAX = 5000;
const BATCH_BYTES = 900000;

function fnv(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) {
    x ^= str.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return (x >>> 0).toString(16);
}

export function matchMode(s) {
  return s.match || (s.strict === false ? 'none' : 'title');
}

// 검색별 카테고리 → 마켓별 카테고리 번호 (2026-10-10 각 사이트 검색 API로 확인).
// j: 중고나라 categoryFilter 의 categorySeq(categoryDepth 1, 한 개만 됨), b: 번개장터 categoryId, d: 당근 category_id
// 페이지(index.html)의 CATEGORIES 와 키가 같아야 한다.
export const CATEGORIES = {
  appliance: { label: '가전', j: 7, b: 610, d: 172 },
  phone: { label: '휴대폰', j: 6, b: 600700, d: 1 },
  tablet: { label: '태블릿', j: 6, b: 600710, d: 1 },
  pc: { label: '컴퓨터·노트북', j: 8, b: 600100, d: 1 },
  game: { label: '게임기·게임', j: 12, b: 600600, d: 2 },
  furniture: { label: '가구·인테리어', j: 10, b: 810, d: 8 },
  living: { label: '생활·주방', j: 11, b: 800, d: 7 },
  leisure: { label: '캠핑·레저', j: 17, b: 700, d: 3 },
  sports: { label: '스포츠', j: 16, b: 700, d: 3 },
};
const words = (list) => (Array.isArray(list) ? list.map((w) => String(w).trim()).filter(Boolean) : []);

// 페이지(index.html)의 condKey 와 똑같아야 한다. 새 조건은 기본값이 아닐 때만 덧붙여 예전 지문이 그대로 남게 한다.
export function condKey(s) {
  const a = [
    String(s.keyword || '').trim(), (s.exclude || []).slice(), s.minPrice ?? null, s.maxPrice ?? null,
    s.status || 'selling', ORDER.filter((p) => (s.platforms || []).includes(p)),
    (s.regions || []).map((r) => String(r.q || r.name || '').trim()), matchMode(s), !!s.excludeProShop,
  ];
  const x = {};
  if (s.category) x.c = String(s.category);
  if (words(s.include).length) x.i = words(s.include);
  if (s.noBuy === false) x.nb = 0;
  if (Number.isFinite(s.maxAgeDays)) x.a = s.maxAgeDays;
  if (Object.keys(x).length) a.push(x);
  return fnv(JSON.stringify(a));
}

// 다시 모아야 바뀌는 조건만으로 만든 지문 (빼는 단어·꼭 들어갈 단어·가격·상태는 모은 매물에서 다시 거를 수 있어 뺀다).
// 페이지(index.html)의 collectKey 와 똑같아야 한다. 기간은 정했을 때만 덧붙인다.
export function collectKey(s) {
  const a = [
    'c1', String(s.keyword || '').trim(), ORDER.filter((p) => (s.platforms || []).includes(p)),
    (s.regions || []).map((r) => String(r.q || r.name || '').trim()), matchMode(s), !!s.excludeProShop, String(s.category || ''),
  ];
  if (Number.isFinite(s.maxAgeDays)) a.push({ a: s.maxAgeDays });
  return fnv(JSON.stringify(a));
}
// 모은 매물에 적용한 조건 (페이지가 "조건을 좁히기만 했는지" 보고 새로고침 없이 바로 거른다)
export const condOf = (s) => ({ exclude: words(s.exclude), include: words(s.include), minPrice: s.minPrice ?? null, maxPrice: s.maxPrice ?? null, status: s.status || 'selling', noBuy: s.noBuy !== false });

// 구매글(삽니다·구합니다…)은 검색마다 따로 끄지 않으면(noBuy: false) 뺀다. 페이지(index.html)의 BUY_WORDS 와 같아야 한다
export const BUY_WORDS = ['삽니다', '구합니다', '구매합니다', '구해요', '구입합니다', '매입합니다', '고가매입', '삽니당', '구매희망', '구매원합니다'];

// ---- 파일 읽기 ----
function unwrap(obj) {
  if (obj && typeof obj === 'object' && obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data) && ('version' in obj || 'doc_id' in obj || 'id' in obj)) {
    return { data: obj.data, version: obj.version ?? null };
  }
  return { data: obj, version: null };
}

// 파일 경로 → 문서 ID. ArtifactData 는 ID 의 "~" 를 파일 이름에서 "@" 로 적는다(2026-10-10 확인).
const LISTED_IDS = new Map();
const idOfFile = (file, name) => LISTED_IDS.get(file) || name.replace(/@/g, '~');

// listed: 이 세션에서 ArtifactData list 로 받은 파일 경로(Map). 주어지면 목록에 없던 옛 파일은 무시한다.
export function readCollection(root, collection, listed) {
  const out = {};
  const folder = path.join(root, collection);
  if (!root || !fs.existsSync(folder)) return out;
  for (const f of fs.readdirSync(folder)) {
    if (!f.endsWith('.json')) continue;
    const file = path.resolve(folder, f);
    if (listed && !listed.has(file)) continue;
    try {
      out[idOfFile(file, f.slice(0, -5))] = { ...unwrap(JSON.parse(fs.readFileSync(file, 'utf8'))), file };
    } catch {
      // 읽을 수 없는 파일은 건너뛴다
    }
  }
  return out;
}

// ---- 대화 기록 ----
// Claude Code 대화 기록(.jsonl)들. 최근에 바뀐 것부터
function transcripts() {
  const roots = process.env.JUNGGO_PROJECTS_DIRS
    ? process.env.JUNGGO_PROJECTS_DIRS.split(path.delimiter).filter(Boolean)
    : [path.join(os.homedir(), '.claude', 'projects'), '/root/.claude/projects'];
  const out = [];
  const seen = new Set();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const proj of fs.readdirSync(root)) {
      const dir = path.join(root, proj);
      let files = [];
      try { files = fs.readdirSync(dir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const p = path.join(dir, f);
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        // 같은 파일이 두 경로(링크)로 보일 수 있어 실제 경로로 한 번만 센다
        let key = p;
        try { key = fs.realpathSync(p); } catch { /* 그대로 쓴다 */ }
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ p, m: st.mtimeMs });
      }
    }
  }
  return out.sort((a, b) => b.m - a.m);
}

// 이 새로고침의 대화 기록 찾기. PC 에서는 다른 대화가 동시에 열려 있을 수 있어 "가장 최근"만으로는 틀릴 수 있다 →
// 작업 폴더(W) 경로가 적힌 기록(이 대화에서 ArtifactData list 로 W 에 받았으므로)을 고른다. 못 찾으면 가장 최근 것.
export function findTranscript(root) {
  const list = transcripts();
  if (!list.length) return null;
  if (root) {
    const abs = path.resolve(root);
    const keys = [...new Set([abs, abs.replace(/\\/g, '/'), abs.replace(/\\/g, '\\\\'), String(root), String(root).replace(/\\/g, '/')])].filter((k) => k.length > 3);
    const recent = list.filter((t) => Date.now() - t.m < 12 * 3600e3).slice(0, 12);
    for (const t of recent) {
      let text = '';
      try { text = fs.readFileSync(t.p, 'utf8'); } catch { continue; }
      if (keys.some((k) => text.includes(k))) return t.p;
    }
  }
  return list[0].p;
}

function textsOf(content) {
  if (typeof content === 'string') return [content];
  if (Array.isArray(content)) return content.flatMap((c) => (c && typeof c.text === 'string' ? [c.text] : c && c.content ? textsOf(c.content) : []));
  return [];
}

function toolResultTexts(transcriptPath, needle) {
  const out = [];
  for (const line of fs.readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.includes(needle)) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const content = o && o.message && o.message.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) if (c && c.type === 'tool_result') out.push(...textsOf(c.content));
  }
  return out;
}

// 수집 결과는 JSON 문자열 리터럴 "{\"__junggo\":...}" 로 들어 있다 (browser_batch 결과 중간에 있어도 찾는다).
function parseLiteralAt(text, start) {
  let esc = false;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (esc) esc = false;
    else if (ch === '\\') esc = true;
    else if (ch === '"') {
      try {
        return JSON.parse(JSON.parse(text.slice(start, i + 1)));
      } catch {
        return null;
      }
    }
  }
  return null;
}

// 압축된 결과: JUNGGOZ1:<gzip 을 base64 로>
function parseZipAt(text, start) {
  const m = /^JUNGGOZ1:([A-Za-z0-9+/=]+)/.exec(text.slice(start, start + 4000000));
  if (!m) return null;
  try {
    return JSON.parse(zlib.gunzipSync(Buffer.from(m[1], 'base64')).toString('utf8'));
  } catch {
    return null;
  }
}

// 결과가 너무 크면 Claude Code 가 대화 기록 대신 <세션>/tool-results/ 파일에 저장한다 → 거기도 찾는다.
function savedResultTexts(transcriptPath, since) {
  const dir = path.join(path.dirname(transcriptPath), path.basename(transcriptPath, '.jsonl'), 'tool-results');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const file = path.join(dir, f);
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    if (!st.isFile() || st.mtimeMs < since - 60000) continue;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.includes('__junggo') && !raw.includes('JUNGGOZ1:')) continue;
    try { out.push(...textsOf(JSON.parse(raw))); } catch { out.push(raw); }
  }
  return out;
}

export function findCollected(transcriptPath, since) {
  const found = {};
  const seen = new Set();
  // 검색이 많으면 한 사이트에서 여러 번 나눠 모은다 → 같은 부분의 결과를 합친다 (같은 결과가 두 군데 있어도 한 번만)
  const keep = (r) => {
    if (!r || r.__junggo !== 'v1' || !(r.at >= since)) return;
    const sig = `${r.part}:${r.at}:${r.ms}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    const f = found[r.part];
    if (!f) { found[r.part] = { ...r, results: { ...(r.results || {}) } }; return; }
    Object.assign(f.results, r.results || {});
    f.at = Math.max(f.at, r.at);
    if (r.bd && !r.bd.error) f.bd = f.bd && !f.bd.error ? { asked: (f.bd.asked || 0) + (r.bd.asked || 0), got: (f.bd.got || 0) + (r.bd.got || 0), left: (f.bd.left || 0) + (r.bd.left || 0) } : r.bd;
    if (r.homes) f.homes = { ...(f.homes || {}), ...r.homes };
    if (r.home && !f.home) f.home = r.home;
  };
  const marker = '"{\\"__junggo\\"';
  const texts = [...toolResultTexts(transcriptPath, '__junggo'), ...toolResultTexts(transcriptPath, 'JUNGGOZ1:'), ...savedResultTexts(transcriptPath, since)];
  for (const text of texts) {
    for (let idx = text.indexOf(marker); idx >= 0; idx = text.indexOf(marker, idx + 1)) keep(parseLiteralAt(text, idx));
    for (let idx = text.indexOf('JUNGGOZ1:'); idx >= 0; idx = text.indexOf('JUNGGOZ1:', idx + 1)) keep(parseZipAt(text, idx));
  }
  return found;
}

// ArtifactData list(out_dir) 결과 줄: - "s_x"  25190 bytes  version 3  "/경로/s_x.json"
export function findVersions(transcriptPath) {
  const map = new Map();
  const re = /- "([^"]+)"\s+\d+ bytes\s+version (\d+)\s+"([^"]+\.json)"/g;
  for (const text of toolResultTexts(transcriptPath, 'bytes')) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      map.set(path.resolve(m[3]), Number(m[2]));
      LISTED_IDS.set(path.resolve(m[3]), m[1]);
    }
  }
  return map;
}

// ---- 수집 코드 ----
export function readConfig(root, listed) {
  return (readCollection(root, 'meta', listed).config || {}).data || {};
}

// 지역 이름의 시·도 + 시·군·구 부분 (예: "경기도 시흥시 정왕동" → "경기도 시흥시") — 중고나라 판매 지역과 맞춰 본다
function areaOf(fullName) {
  const w = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return w.length >= 2 ? w.slice(0, 2).join(' ') : '';
}

// 사람별 묶음. 동춘님(주인)은 맨 위 searches/results/ledger 와 meta/config(기본 동네·내 동네),
// 같이 쓰는 사람은 u/<id>/searches|results|ledger 와 u/<id> 문서(region {q}: 당근 기본 지역, home {q}: 내 동네).
export function peopleOf(root, listed) {
  const config = readConfig(root, listed);
  const qOf = (x) => (x && String(x.q || '').trim()) || '';
  const people = [{ uid: '', base: '', doc: null, defaults: Array.isArray(config.defaultRegions) ? config.defaultRegions : [], home: qOf(config.home) ? { q: qOf(config.home) } : null }];
  for (const [uid, entry] of Object.entries(readCollection(root, 'u', listed))) {
    if (!UID_RE.test(uid)) continue;
    const me = (entry && entry.data) || {};
    people.push({ uid, base: `u/${uid}/`, doc: entry, defaults: qOf(me.region) ? [{ q: qOf(me.region) }] : [], home: qOf(me.home) ? { q: qOf(me.home) } : null });
  }
  for (const p of people) {
    p.searchDocs = readCollection(root, `${p.base}searches`, listed);
    p.prev = readCollection(root, `${p.base}results`, listed);
    p.ledgers = readCollection(root, `${p.base}ledger`, listed);
    const ok = (id) => { const s = p.searchDocs[id].data; return !!(s && String(s.keyword || '').trim()); };
    let ids = Object.keys(p.searchDocs).filter(ok);
    ids.sort((a, b) => ((p.searchDocs[a].data.createdAt || 0) - (p.searchDocs[b].data.createdAt || 0)) || (a < b ? -1 : 1));
    // 같이 쓰는 사람은 먼저 만든 검색부터 MEMBER_MAX 개만 모은다
    if (p.uid) ids = ids.slice(0, MEMBER_MAX);
    p.active = ids;
  }
  return people;
}
// 수집기 안에서 쓰는 검색 구분자: 주인은 검색 ID 그대로, 같이 쓰는 사람은 "<사람 id>/<검색 ID>"
export const keyOf = (p, id) => (p.uid ? `${p.uid}/${id}` : id);
// 같이 쓰는 사람이 당근 동네를 하나도 정하지 않았으면 당근은 찾지 않는다(PC 위치로 동네가 정해지므로)
const NO_REGION_MSG = '당근 동네를 정하지 않아 당근은 찾지 않았어요. 내 설정에서 당근 기본 지역을 정해 주세요';
const hasOwnRegion = (s) => (s.regions || []).some((r) => r && (r.q || r.name || r.id));
const noRegion = (p, s) => !!p.uid && (s.platforms || []).includes('daangn') && !hasOwnRegion(s) && !p.defaults.length;

export function effectiveSearches(people) {
  const out = [];
  for (const p of people) {
    const defaults = p.defaults;
    // 검색 조건에 기본 동네와 같은 이름(예: "시흥시")을 적으면 설정의 정의(ID·기준 동네)를 그대로 쓴다
    const bare = (x) => String(x || '').replace(/\s+/g, '');
    const known = (r) => defaults.find((d) => d && d.id && [d.q, d.name, d.fullName].some((v) => v && bare(v) === bare(r.q || r.name)));
    for (const id of p.active) {
      const s = p.searchDocs[id].data;
      const own = (s.regions || []).filter((r) => r && (r.q || r.name || r.id));
      const regions = (own.length ? own : defaults).map((r0) => {
        const r = (!r0.id && known(r0)) || r0;
        if (!r.id) return { q: String(r.q || r.name).trim() };
        const o = { q: r.q || r.name, id: String(r.id), name: r.name || r.q, fullName: r.fullName || '' };
        if (Array.isArray(r.anchors) && r.anchors.length) o.anchors = r.anchors.map(String);
        return o;
      });
      let platforms = ORDER.filter((x) => (s.platforms || []).includes(x));
      if (noRegion(p, s)) platforms = platforms.filter((x) => x !== 'daangn');
      out.push({
        id: keyOf(p, id), keyword: String(s.keyword).trim(), exclude: s.exclude || [], minPrice: s.minPrice ?? null, maxPrice: s.maxPrice ?? null,
        status: s.status || 'selling', platforms,
        // 중고나라 가까움은 첫 동네 기준. 이름만 적은 동네(예: "안산시")는 그 이름으로 본다
        regions, homeArea: areaOf(regions[0] && regions[0].fullName) || (regions[0] && !regions[0].id ? regions[0].q : ''),
        match: matchMode(s), excludeProShop: !!s.excludeProShop,
        category: CATEGORIES[s.category] ? s.category : '',
        maxAgeDays: Number.isFinite(s.maxAgeDays) ? s.maxAgeDays : null,
      });
    }
  }
  return out;
}

const sha256Of = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// 수집기(브라우저에서 도는 코드) 함수 원문과 SHA-256
export function collectorInfo(part) {
  const src = COLLECTOR[part];
  const fnSrc = src.slice(0, src.lastIndexOf('\nawait junggoCollect('));
  return { fnSrc, sha256: sha256Of(fnSrc) };
}

// 브라우저가 "옮겨 적다 틀림"을 알릴 때 돌려주는 글자. 실행문 안에서는 둘로 나눠 적어 두어
// 대화 기록에서 이 글자를 찾으면 실행문(도우미 출력)이 아니라 실행 결과만 걸린다.
const MISMATCH = 'JUNGGO_COPY_' + 'MISMATCH';
const COPY_ERR = '수집 코드를 옮기다 틀린 곳이 생겨 실행하지 않았어요. 다시 눌러 주세요.';

// javascript_tool 의 text 로 글자 그대로 넘길 실행문.
// 수집기 함수 전문을 그대로 싣고(실행되는 코드가 늘 기록에 보이게), 함수와 조건(CFG)의 SHA-256 을
// 도우미가 계산한 값과 맞춰 본 뒤에만 실행한다. 옮겨 적다 한 글자라도 틀리면 실행하지 않는다.
// javascript_tool 은 REPL 처럼 마지막 식의 값을 돌려준다(맨 위 함수 선언 + await 식).
export function block(part, searches, maxAgeDays, regionDefs, homes, extra) {
  const { fnSrc, sha256 } = collectorInfo(part);
  const c = { part, maxAgeDays, ...(extra || {}) };
  if (regionDefs && Object.keys(regionDefs).length) c.regions = regionDefs;
  if (homes && homes.length) c.homes = homes;
  c.searches = searches;
  const cfg = JSON.stringify(c);
  const site = part === 'jb' ? '중고나라·번개장터' : '당근';
  const miss = (what) => `return "JUNGGO_COPY_" + "MISMATCH ${part} ${what}";`;
  return `${fnSrc}\nawait (async () => {\n`
    + `// 중고 통합검색 ${site} 수집기 실행. 위 junggoCollect 함수는 사용자 저장소 20130721pk-a11y/junggo-radar 의 dashboard-refresh/src/collect.js 를 압축한 것이다.\n`
    + '// 검색 결과를 읽어 돌려주기만 한다(로그인·글쓰기·구매·외부 전송 없음). 함수와 조건이 도우미가 낸 원문과 글자까지 같을 때만 실행한다.\n'
    + 'const sha256 = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");\n'
    + `const CFG = ${cfg};\n`
    + `if (await sha256(junggoCollect.toString()) !== ${JSON.stringify(sha256)}) ${miss('code')}\n`
    + `if (await sha256(JSON.stringify(CFG)) !== ${JSON.stringify(sha256Of(cfg))}) ${miss('cfg')}\n`
    + '// 예전 방식(사이트 저장소에 넣어 둔 수집기 코드)은 더 쓰지 않으므로 지운다\n'
    + 'try { for (const k of Object.keys(localStorage)) if (k.startsWith("junggo.c.")) localStorage.removeItem(k); } catch (e) {}\n'
    + 'return await junggoCollect(CFG);\n'
    + '})()';
}

// 사이트로 보내는 조건은 그 사이트에 필요한 것만, 기본값은 빼고 (Claude 가 옮겨 적는 양을 줄인다)
// 기본값: 판매중, 제목·내용, 그 사이트의 마켓 전부. 지역은 regionDefs 에 한 번만 두고 ID 로 가리킨다.
export function slim(s, part, regionDefs) {
  const o = { id: s.id, keyword: s.keyword };
  if (s.status !== 'selling') o.status = s.status;
  if (s.match !== 'content') o.match = s.match;
  const mine = s.platforms.filter((p) => PART_OF[p] === part);
  if (mine.length !== ORDER.filter((p) => PART_OF[p] === part).length) o.platforms = mine;
  if (s.exclude.length) o.exclude = s.exclude;
  if (s.minPrice != null) o.minPrice = s.minPrice;
  if (s.maxPrice != null) o.maxPrice = s.maxPrice;
  if (part === 'jb' && s.excludeProShop) o.excludeProShop = true;
  if (part === 'jb' && s.homeArea) o.homeArea = s.homeArea;
  if (s.category) {
    const c = CATEGORIES[s.category];
    o.cat = part === 'jb' ? { j: c.j, b: c.b } : { d: c.d };
  }
  if (s.maxAgeDays != null) o.maxAgeDays = s.maxAgeDays;
  if (part === 'd' && s.regions.length) {
    o.regions = s.regions.map((r) => {
      if (!r.id) return r;
      regionDefs[r.id] = r;
      return r.id;
    });
  }
  return o;
}

// 내장 브라우저에서 할 일: [{type:'navigate', url} | {type:'javascript', part, n(검색 수), text(실행문)}]
// 탭 ID 는 넣지 않는다(예약 작업이 preview_start 로 연 탭 T 에서 차례로 한다).
export function prepareSteps(root, listed) {
  const people = peopleOf(root, listed);
  const searches = effectiveSearches(people);
  const config = readConfig(root, listed);
  const maxAgeDays = Number.isFinite(config.maxAgeDays) ? config.maxAgeDays : 30;
  // 거리 기준 "내 동네"는 당근 탭에서 좌표를 찾는다 (사람마다)
  const homes = people.filter((p) => p.home).map((p) => ({ k: p.uid, q: p.home.q }));
  const steps = [];
  for (const part of ['jb', 'd']) {
    const all = searches.filter((s) => s.platforms.some((p) => PART_OF[p] === part));
    if (!all.length && !(part === 'd' && homes.length && searches.length)) continue;
    // 당근 검색이 많으면 기준 동네를 줄여 요청 수를 맞춘다 (당근이 한꺼번에 많이 부르면 막는다)
    const extra = part === 'd' && all.length > ROUND.d ? { dAnchors: 3 } : {};
    steps.push({ type: 'navigate', url: SITE_OF[part] });
    const rounds = Math.max(1, Math.ceil(all.length / ROUND[part]));
    for (let r = 0; r < rounds; r++) {
      const regionDefs = {};
      const mine = all.slice(r * ROUND[part], (r + 1) * ROUND[part]).map((s) => slim(s, part, regionDefs));
      const h = part === 'd' && r === 0 ? homes : null;
      steps.push({ type: 'javascript', part, n: mine.length, text: block(part, mine, maxAgeDays, regionDefs, h, extra) });
    }
  }
  return steps;
}

// 브라우저가 돌려준 틀림 표시 → 어느 부분(jb|d)이 옮겨 적다 틀렸는지
export function findMismatch(transcriptPath) {
  const out = new Set();
  const re = new RegExp(`${MISMATCH} (jb|d)\\b`, 'g');
  for (const text of toolResultTexts(transcriptPath, MISMATCH)) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) out.add(m[1]);
  }
  return [...out];
}

// ---- 조건 다시 적용 ----
const STRIP = /[\s​\[\]\(\)\{\}<>"'`_\-\/|·•ㆍ,!?~*+=:;]+/g;
const norm = (s) => String(s == null ? '' : s).normalize('NFC').toLowerCase().replace(STRIP, '');
const ALIASES = [
  ['아이폰', 'iphone'], ['아이패드', 'ipad'], ['맥북', 'macbook'], ['아이맥', 'imac'], ['에어팟', 'airpods', 'airpod'],
  ['애플워치', 'applewatch'], ['애플', 'apple'], ['갤럭시', 'galaxy'], ['갤탭', '갤럭시탭', 'galaxytab'], ['버즈', 'buds'],
  ['프로', 'pro'], ['맥스', 'max'], ['플러스', 'plus'], ['미니', 'mini'], ['울트라', 'ultra'], ['에어', 'air'],
  ['닌텐도', 'nintendo'], ['스위치', 'switch'], ['플레이스테이션', '플스', 'playstation'], ['ps5', '플스5', '플레이스테이션5'],
  ['ps4', '플스4', '플레이스테이션4'], ['다이슨', 'dyson'], ['소니', 'sony'], ['캐논', 'canon'], ['니콘', 'nikon'],
  ['후지필름', '후지', 'fujifilm'], ['라이카', 'leica'], ['로지텍', 'logitech'], ['레노버', 'lenovo'], ['삼성', 'samsung'],
  ['엘지', 'lg'], ['샤오미', 'xiaomi'], ['나이키', 'nike'], ['아디다스', 'adidas'], ['뉴발란스', 'newbalance'],
  ['스타벅스', 'starbucks'], ['레고', 'lego'], ['기가', 'gb'], ['테라', 'tb'], ['디오스', 'dios'],
];
const AIDX = new Map();
for (const g of ALIASES) {
  const n = g.map(norm);
  for (const w of n) AIDX.set(w, n);
}
// 검색어를 쉼표로 나눠 적으면 여러 표기 (수집기의 altsOf 와 같다)
export const altsOf = (s) => String(s.keyword || '').split(',').map((w) => w.trim()).filter(Boolean).slice(0, 3);
// 수집 뒤에 빼는 단어·가격·상태를 바꿨을 때를 위해 다시 거른다. 제목·내용 모드의 단어 확인은 수집기가 이미 했다.
// sold: 판매완료 매물(최근 90일, 상태는 보지 않음)
export function makeFilter(s, { now = Date.now(), maxAgeDays = 30, sold = false } = {}) {
  const days = sold ? 90 : Number.isFinite(s.maxAgeDays) ? s.maxAgeDays : maxAgeDays;
  const oldest = days > 0 ? Math.floor(now / 1000) - days * 86400 : 0;
  const kws = [];
  if (matchMode(s) === 'title') {
    for (const kw of altsOf(s)) {
      const groups = [];
      for (const word of kw.split(/\s+/)) {
        const n = norm(word);
        if (!n) continue;
        const parts = AIDX.has(n) ? [n] : n.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]+|[^가-힣ㄱ-ㅎㅏ-ㅣ]+/g) || [];
        for (const p of parts) if (p) groups.push(AIDX.get(p) || [p]);
      }
      if (groups.length) kws.push(groups);
    }
  }
  const ex = (s.exclude || []).map(norm).filter(Boolean);
  if (s.noBuy !== false) ex.push(...BUY_WORDS.map(norm));
  // 꼭 들어갈 단어: 제목에 하나라도 있어야 한다
  const inc = words(s.include).map(norm).filter(Boolean);
  const allow = sold || s.status === 'all' ? null : s.status === 'reserved' ? ['s', 'r'] : ['s'];
  const has = (v) => v != null && v !== '' && Number.isFinite(Number(v));
  const min = has(s.minPrice) ? Number(s.minPrice) : null;
  const max = has(s.maxPrice) ? Number(s.maxPrice) : null;
  return (t) => {
    if (oldest && t[6] && t[6] < oldest) return false;
    if (allow && !allow.includes(t[4])) return false;
    if (min != null && (t[3] == null || t[3] < min)) return false;
    if (max != null && (t[3] == null || t[3] > max)) return false;
    const title = norm(t[2]);
    if (kws.length && !kws.some((groups) => groups.every((alts) => alts.some((a) => title.includes(a))))) return false;
    if (ex.some((w) => title.includes(w))) return false;
    if (inc.length && !inc.some((w) => title.includes(w))) return false;
    return true;
  };
}

// ---- 결과 문서 만들기 ----
// 문서 하나는 256KiB 까지라, 검색마다 머리 문서 results/<id> 와 마켓별 매물 문서 results/<id>~j|d|b 로 나눈다.
export const partId = (id, code) => `${id}~${code}`;
const isPartId = (docId) => docId.includes('~');

function oldItemsOf(prev, id, codes = ['j', 'd', 'b']) {
  const out = [];
  const head = prev[id] && prev[id].data;
  if (head && Array.isArray(head.items) && codes.length === 3) out.push(...head.items); // 예전(v1) 문서는 머리 문서에 매물이 있다
  for (const c of codes) {
    const p = prev[partId(id, c)] && prev[partId(id, c)].data;
    if (p && Array.isArray(p.items)) out.push(...p.items);
  }
  return out.filter(Array.isArray);
}

function fitDoc(doc) {
  let bytes = Buffer.byteLength(JSON.stringify(doc));
  while (bytes > MAX_DOC_BYTES && doc.items.length) {
    const dropped = doc.items.splice(Math.max(0, doc.items.length - 40), 40);
    doc.trimmed = (doc.trimmed || 0) + dropped.length;
    bytes = Buffer.byteLength(JSON.stringify(doc));
  }
  return doc;
}

// 새 매물 = 처음 보는 매물이면서, 올린(끌올) 시각이 지난 새로고침 무렵 이후인 것.
// 당근처럼 할 때마다 조금씩 다른 매물을 주는 사이트에서 오래된 매물이 새 매물로 잡히지 않게 한다.
// 당근 가까움: 기준 지역의 동 이름이면서, 거래 좌표가 기준 동네 중심 가운데 한 곳에서 NEAR_KM 안(좌표가 없으면 이름만).
// 이름만 같은 다른 지역 동(서울 신천동, 성남 은행동 등)은 거리로 걸러진다.
const NEAR_KM = 6;
function kmBetween(a, b) {
  const x = (a[1] - b[1]) * Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180) * 111.32;
  const y = (a[0] - b[0]) * 110.57;
  return Math.sqrt(x * x + y * y);
}
// 수집기가 준 매물의 13번째 칸(덧붙임 정보). 예전 당근 수집기는 13·14번째 칸에 좌표 숫자를 줬다
export function extOf(t) {
  const x = t[12];
  if (x && typeof x === 'object' && !Array.isArray(x)) return x;
  if (typeof x === 'number' && typeof t[13] === 'number') return { lat: x, lng: t[13] };
  return {};
}
export function daangnNear(t, geo) {
  if (!geo || !Array.isArray(geo.names)) return t[11] === 1 ? 1 : 0;
  if (!geo.names.includes(t[5])) return 0;
  const x = extOf(t);
  if (x.lat == null || x.lng == null || !geo.centers || !geo.centers.length) return 1;
  return geo.centers.some((c) => kmBetween([x.lat, x.lng], c) <= NEAR_KM) ? 1 : 0;
}

// 가격이 바뀐 매물은 7일 동안 이전 가격을 함께 보여준다
const PRICE_KEEP = 7 * 86400;
// 시세 흐름: 새로고침마다 한 점, 2시간 안에 다시 하면 마지막 점을 바꾼다. 600점까지
const HIST_GAP = 2 * 3600;
const HIST_MAX = 600;
const shortId = (str) => fnv(str).slice(0, 6);

// 같은 글(제목·가격이 같은 글)은 한 번만 세서 중앙값 등을 낸다 (페이지의 "같은 글 묶기"와 같은 기준)
function priceStatsOf(rows) {
  const byKey = new Map();
  for (const t of rows) if (typeof t[3] === 'number' && t[3] > 0) byKey.set(`${norm(t[2])}|${t[3]}`, t[3]);
  const v = [...byKey.values()].sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => { const i = (v.length - 1) * p; const lo = Math.floor(i); const hi = Math.ceil(i); return Math.round(v[lo] + (v[hi] - v[lo]) * (i - lo)); };
  return { n: v.length, med: q(0.5), p25: q(0.25), p75: q(0.75) };
}

// partErr: 부분(jb|d)을 통째로 못 모은 까닭 (예: 실행문을 옮겨 적다 틀림) — 그 마켓의 오류 문구로 쓴다
// carry: 이번에 일부러 모으지 않은 부분 {jb|d: {st, note, ok(id, old)}} — 지난 매물을 오류 없이 이어 보여준다
//        (GitHub 판: 당근은 폰 앱이 올린 결과가 새로 없을 때, 중고나라·번개장터는 당근만 합치러 돈 실행일 때)
//        ok 가 false 를 주는 검색(예: 폰이 모은 뒤 조건·지역이 바뀜)은 지난 매물을 버리고 st·note 로 기다린다고 알린다
// partAt: 부분을 실제로 모은 시각 {jb|d: ms} (당근은 폰이 모은 시각) — 다음 번 새 매물 판단의 기준이 된다
export function buildResults({ searches, prev, ledgers = {}, collected, now = Date.now(), maxAgeDays = 30, home = null, keyOf = (id) => id, skipped = {}, partErr = {}, carry = {}, partAt = {} }) {
  const nowSec = Math.floor(now / 1000);
  const docs = {};
  const ledgerDocs = {};
  const summary = {};
  for (const [id, { data: s }] of Object.entries(searches)) {
    if (!s || !s.keyword) continue;
    const old = prev[id] && prev[id].data;
    const oldItems = oldItemsOf(prev, id);
    const key = condKey(s);
    const ckey = collectKey(s);
    // 새 매물 판단은 "다시 모아야 바뀌는 조건"이 그대로일 때만 (빼는 단어만 바꾼 건 그대로 본다)
    const sameCond = !!(old && (old.ckey ? old.ckey === ckey : old.condKey === key));
    const prevFetched = old && old.fetchedAt ? Math.floor(old.fetchedAt / 1000) : 0;
    // 부분마다 지난번에 실제로 모은 시각 (당근은 폰이 모은 시각이라 대시보드 실행 시각과 다르다)
    const prevOf = (part) => { const t = old && old.fetched && old.fetched[part]; return t ? Math.floor(t / 1000) : prevFetched; };
    const freshParts = new Set();
    // 장부: "j:123" → [처음 본 초, 마지막 본 초, 마지막 가격, (가격이 바뀌었으면) 이전 가격, 바뀐 초]
    const seen = {};
    const L = ledgers[id] && ledgers[id].data && ledgers[id].data.k;
    if (L && typeof L === 'object') for (const [k, v] of Object.entries(L)) if (Array.isArray(v)) seen[k] = v.slice();
    for (const t of oldItems) {
      const k = `${t[0]}:${t[1]}`;
      if (!seen[k]) seen[k] = [t[12] || 0, prevFetched, typeof t[3] === 'number' ? t[3] : null];
      else if (typeof seen[k][2] !== 'number' && typeof t[3] === 'number') seen[k][2] = t[3]; // 예전 장부에는 가격이 없다
    }
    const keep = makeFilter(s, { now, maxAgeDays });
    const pf = {};
    const byCode = {};
    let newCount = 0;
    for (const p of ORDER) {
      if (!(s.platforms || []).includes(p)) continue;
      const part = collected[PART_OF[p]];
      const res = part && part.results && part.results[keyOf(id)];
      const info = res && res.pf && res.pf[p];
      const code = CODE_OF[p];
      // { t: 매물 칸, x: 수집기의 덧붙임 정보(새로 모음) 또는 저장된 덧붙임 정보(이어 보여줌) }
      let mine;
      if (info && info.st === 'ok') {
        freshParts.add(PART_OF[p]);
        mine = res.items.filter((t) => t[0] === code && keep(t)).map((t) => ({ t, x: extOf(t) }));
        if (code === 'd') {
          // 여러 기준 지역이면 이름·중심을 합쳐서 본다. 저장할 때는 geo 를 뺀다(크기만 차지)
          const regs = Array.isArray(info.regions) ? info.regions : [];
          const geos = regs.map((r) => r && r.geo).filter(Boolean);
          const geo = geos.length ? { names: [...new Set(geos.flatMap((g) => g.names || []))], centers: geos.flatMap((g) => g.centers || []) } : null;
          mine = mine.map(({ t, x }) => { const u = t.slice(0, 12); u[11] = daangnNear(t, geo); return { t: u, x }; });
          pf[p] = { ...info, n: mine.length, regions: regs.map((r) => { const { geo: _g, ...rest } = r || {}; return rest; }) };
        } else pf[p] = { ...info, n: mine.length };
        delete pf[p].sold;
      } else if (carry[PART_OF[p]] && !(info && info.st === 'error') && !(skipped[id] && skipped[id][p])) {
        const c = carry[PART_OF[p]];
        const isD = PART_OF[p] === 'd';
        if (typeof c.ok === 'function' && !c.ok(id, old)) {
          // 지난 매물이 지금 조건과 맞지 않음 → 보여주지 않고 기다린다
          mine = [];
          pf[p] = { st: c.st || 'wait', ...(c.note ? { note: c.note } : {}), ...(c.need ? { need: c.need } : {}), n: 0 };
        } else {
          // 일부러 이번에 모으지 않음 → 지난 매물과 지난 안내를 그대로 (중고나라·번개장터는 지난 오류 안내도 그대로)
          mine = oldItems.filter((t) => t[0] === code && keep(t)).map((t) => {
            const x = t[13] && typeof t[13] === 'object' ? { ...t[13] } : {};
            delete x.pp; delete x.pc;
            return { t, x, kept: true };
          });
          const was = old && old.pf && old.pf[p];
          const keepWas = was && (isD ? was.st !== 'error' && was.st !== 'wait' : true);
          pf[p] = keepWas ? { ...was, n: mine.length } : { st: c.st || (isD ? 'wait' : 'ok'), ...(c.note ? { note: c.note } : {}), n: mine.length };
        }
      } else {
        mine = oldItems.filter((t) => t[0] === code && keep(t)).map((t) => {
          const x = t[13] && typeof t[13] === 'object' ? { ...t[13] } : {};
          delete x.pp; delete x.pc;
          return { t, x, kept: true };
        });
        const why = skipped[id] && skipped[id][p];
        pf[p] = { st: 'error', error: why || (info && info.error ? info.error : partErr[PART_OF[p]] || '이번 새로고침에서 모으지 못했어요'), carried: mine.length };
        if (why) pf[p].skip = 1;
      }
      const dup = new Set();
      byCode[code] = mine
        .filter(({ t }) => {
          const k = `${t[0]}:${t[1]}`;
          if (dup.has(k)) return false;
          dup.add(k);
          return true;
        })
        .map(({ t, x, kept }) => {
          const k = `${t[0]}:${t[1]}`;
          const was = seen[k];
          let fs0;
          if (was) fs0 = was[0] || 0;
          else if (old && sameCond && (t[6] || 0) >= prevOf(PART_OF[p]) - 3600) { fs0 = nowSec; newCount++; }
          else fs0 = 0;
          const price = typeof t[3] === 'number' ? t[3] : null;
          let pp = null;
          let pc = 0;
          if (was && price != null) {
            if (typeof was[2] === 'number' && was[2] !== price) { pp = was[2]; pc = nowSec; }
            else if (typeof was[3] === 'number' && was[4] && nowSec - was[4] < PRICE_KEEP && was[3] !== price) { pp = was[3]; pc = was[4]; }
          }
          seen[k] = pp != null ? [fs0, nowSec, price, pp, pc] : [fs0, nowSec, price];
          const near = t[11] === 1 ? 1 : t[11] === 0 ? 0 : null;
          const row = [t[0], String(t[1]), t[2], price, t[4], t[5] || '', t[6] || 0, t[7] || 0, t[8] || 0, t[9] || 0, t[10] ? 1 : 0, near, fs0];
          // 14번째 칸: 덧붙임 정보 (있을 때만)
          //   pp 이전 가격, pc 바뀐 시각(초), f 표시(P 중고나라페이 C 인증셀러 O 공식셀러 K 번개케어 N 새상품 I 직거래 F 무료배송),
          //   s 판매자(짧은 지문), sn 설명 앞부분, km 내 동네에서 거리
          const e = {};
          if (pp != null) { e.pp = pp; e.pc = pc; }
          if (x.f) e.f = String(x.f);
          if (x.s) e.s = kept ? String(x.s) : shortId(`${t[0]}:${x.s}`);
          if (x.sn) e.sn = String(x.sn);
          if (kept && x.km != null) e.km = x.km;
          else if (home && Number.isFinite(x.lat) && Number.isFinite(x.lng)) e.km = Math.round(kmBetween([x.lat, x.lng], [home.lat, home.lng]) * 10) / 10;
          if (Object.keys(e).length) row.push(e);
          return row;
        })
        .sort((a, b) => (b[6] || 0) - (a[6] || 0));
    }
    let total = 0;
    const parts = {};
    for (const [code, items] of Object.entries(byCode)) {
      const doc = fitDoc({ v: 2, fetchedAt: now, items });
      docs[partId(id, code)] = doc;
      parts[code] = doc.items.length;
      total += doc.items.length;
      if (doc.trimmed) {
        const p = ORDER.find((x) => CODE_OF[x] === code);
        pf[p].trimmed = doc.trimmed;
      }
    }
    // 판매완료(중고나라, 최근 90일): 팔린 가격 참고용. 모으지 못했으면 지난번 것을 이어 쓴다
    if ((s.platforms || []).includes('joongna')) {
      const jr = collected.jb && collected.jb.results && collected.jb.results[keyOf(id)];
      const keepSold = makeFilter(s, { now, sold: true });
      const fresh = jr && jr.pf && jr.pf.joongna && jr.pf.joongna.st === 'ok';
      const src = fresh ? (Array.isArray(jr.sold) ? jr.sold : []) : oldItemsOf(prev, id, ['s']);
      const dupS = new Set();
      const sold = src.filter((t) => t[0] === 'j' && keepSold(t) && !dupS.has(t[1]) && dupS.add(t[1]))
        .map((t) => [t[0], String(t[1]), t[2], typeof t[3] === 'number' ? t[3] : null, 'x', t[5] || '', t[6] || 0, 0, 0, 0, 0, null, 0])
        .sort((a, b) => (b[6] || 0) - (a[6] || 0));
      if (sold.length) {
        docs[partId(id, 's')] = fitDoc({ v: 2, fetchedAt: now, items: sold });
        parts.s = docs[partId(id, 's')].items.length;
      }
    }
    // 시세 흐름 한 점: [초, 건수, 중앙값, 25%, 75%, 중고나라·당근·번개장터 중앙값, 판매완료 중앙값]
    const all = Object.values(byCode).flat();
    const st = priceStatsOf(all);
    let hist = old && Array.isArray(old.hist) && old.ckey === ckey ? old.hist.filter(Array.isArray).slice() : [];
    if (st) {
      const med = (code) => { const x = priceStatsOf(byCode[code] || []); return x ? x.med : null; };
      const sx = docs[partId(id, 's')] ? priceStatsOf(docs[partId(id, 's')].items) : null;
      const point = [nowSec, st.n, st.med, st.p25, st.p75, med('j'), med('d'), med('b'), sx ? sx.med : null];
      if (hist.length && nowSec - hist[hist.length - 1][0] < HIST_GAP) hist[hist.length - 1] = point;
      else hist.push(point);
      if (hist.length > HIST_MAX) hist = hist.slice(-HIST_MAX);
    }
    const fetched = {};
    for (const part of ['jb', 'd']) {
      if (!(s.platforms || []).some((x) => PART_OF[x] === part)) continue;
      const t = freshParts.has(part) ? partAt[part] || now : (old && old.fetched && old.fetched[part]) || (old && old.fetchedAt) || 0;
      if (t) fetched[part] = t;
    }
    docs[id] = { v: 2, fetchedAt: now, fetched, condKey: key, ckey, cond: condOf(s), keyword: s.keyword, pf, parts, hist };
    let entries = Object.entries(seen).sort((a, b) => (b[1][1] || 0) - (a[1][1] || 0)).slice(0, LEDGER_MAX);
    let ledger = { v: 2, updatedAt: now, k: Object.fromEntries(entries) };
    while (Buffer.byteLength(JSON.stringify(ledger)) > MAX_DOC_BYTES && entries.length > 100) {
      entries = entries.slice(0, Math.floor(entries.length * 0.9));
      ledger = { v: 2, updatedAt: now, k: Object.fromEntries(entries) };
    }
    ledgerDocs[id] = ledger;
    summary[id] = { keyword: s.keyword, n: total, new: newCount, sold: parts.s || 0, errors: Object.entries(pf).filter(([, v]) => v.st === 'error' && !v.skip).map(([k]) => k) };
  }
  return { docs, ledgerDocs, summary };
}

// ArtifactData batch 는 한 번에 50개·1MiB 까지 → 크기를 보며 나눈다. meta/refresh 는 맨 마지막 묶음의 끝에 온다.
function writeOut(root, writes) {
  const wf = path.resolve(root, 'out', 'writes.json');
  fs.writeFileSync(wf, JSON.stringify(writes));
  const sizeOf = (w) => {
    try { return w.file_path ? fs.statSync(w.file_path).size + 300 : 300; } catch { return 300; }
  };
  const batches = [];
  let cur = [];
  let bytes = 0;
  for (const w of writes) {
    const n = sizeOf(w);
    if (cur.length && (cur.length >= 50 || bytes + n > BATCH_BYTES)) {
      batches.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(w);
    bytes += n;
  }
  if (cur.length) batches.push(cur);
  return { writesFile: wf, batches };
}

// 이 세션에서 list 로 받은 파일만 쓴다(같은 폴더에 남은 옛 파일 무시). 기록에서 하나도 못 찾으면 거르지 않는다.
function listedFiles(root, versions) {
  const prefix = path.resolve(root) + path.sep;
  const own = new Map([...versions].filter(([f]) => f.startsWith(prefix)));
  return own.size ? own : null;
}

// meta/refresh 를 끝난 상태로 바꾸는 쓰기. 요청 시각은 페이지가 써 둔 값을 그대로 둔다.
function metaWrite(root, versions, body) {
  const meta = readCollection(root, 'meta', listedFiles(root, versions)).refresh;
  const requestedAt = meta && meta.data && meta.data.requestedAt;
  const full = { ...body, requestedAt: requestedAt || body.startedAt };
  const rp = path.resolve(root, 'out', 'meta_refresh.json');
  fs.writeFileSync(rp, JSON.stringify(full));
  const w = { op: 'set', collection: 'meta', doc_id: 'refresh', file_path: rp };
  const v = meta ? meta.version ?? versions.get(meta.file) : null;
  if (v != null) w.if_version = v;
  return w;
}

function main() {
  const [cmd, root, ...rest] = process.argv.slice(2);
  if (cmd === 'info') {
    // 수집기 길이와 SHA-256 (확인용)
    const info = {};
    for (const part of ['jb', 'd']) { const { sha256, fnSrc } = collectorInfo(part); info[part] = { sha256, chars: fnSrc.length }; }
    process.stdout.write(JSON.stringify(info) + '\n');
    return;
  }
  if (cmd === 'members') {
    // 같이 쓰는 사람마다 검색·결과·장부 컬렉션을 더 받아야 한다
    const tp = process.env.JUNGGO_TRANSCRIPT || findTranscript(root);
    const listed = tp ? listedFiles(root, findVersions(tp)) : null;
    const ids = Object.keys(readCollection(root, 'u', listed)).filter((id) => UID_RE.test(id)).sort();
    process.stdout.write(JSON.stringify(ids.flatMap((id) => ['searches', 'results', 'ledger'].map((c) => `u/${id}/${c}`))) + '\n');
    return;
  }
  if (cmd === 'prepare') {
    // 순서표만 출력하고, 실행문은 단계마다 파일로 둔다 (Bash 출력 한도 때문에 `step` 으로 하나씩 꺼낸다)
    const tp = process.env.JUNGGO_TRANSCRIPT || findTranscript(root);
    const listed = tp ? listedFiles(root, findVersions(tp)) : null;
    const steps = prepareSteps(root, listed);
    const dir = path.join(root, 'steps');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const table = steps.map((s, i) => {
      const n = i + 1;
      if (s.type === 'navigate') return { n, do: 'navigate', url: s.url };
      fs.writeFileSync(path.join(dir, `${n}.txt`), s.text);
      return { n, do: 'javascript', what: `${s.part === 'jb' ? '중고나라·번개장터' : '당근'} 검색 ${s.n}개`, chars: s.text.length };
    });
    process.stdout.write(JSON.stringify({ steps: table }) + '\n');
    return;
  }
  if (cmd === 'step') {
    const n = Number(rest[0]);
    const file = path.join(root || '', 'steps', `${n}.txt`);
    if (!Number.isInteger(n) || n < 1 || !fs.existsSync(file)) {
      console.error(`${rest[0]} 번째 javascript 단계가 없어요. 먼저 prepare 를 실행하세요.`);
      process.exit(1);
    }
    process.stdout.write(fs.readFileSync(file, 'utf8') + '\n');
    return;
  }
  if (cmd === 'build' || cmd === 'fail') {
    const since = Number(rest[0]) || 0;
    const tp = process.env.JUNGGO_TRANSCRIPT || findTranscript(root);
    if (!tp) throw new Error('대화 기록 파일을 찾지 못했어요');
    const versions = findVersions(tp);
    fs.mkdirSync(path.join(root, 'out'), { recursive: true });
    const verOf = (entry) => (entry ? entry.version ?? versions.get(entry.file) ?? null : null);
    const writes = [];
    if (cmd === 'fail') {
      writes.push(metaWrite(root, versions, {
        status: 'failed', startedAt: since, finishedAt: Date.now(), by: 'claude',
        message: String(rest[1] || '매물을 모으지 못했어요').slice(0, 200),
      }));
      console.log(JSON.stringify(writeOut(root, writes), null, 1));
      return;
    }
    const listed = listedFiles(root, versions);
    const people = peopleOf(root, listed);
    const config = readConfig(root, listed);
    const maxAgeDays = Number.isFinite(config.maxAgeDays) ? config.maxAgeDays : 30;
    const collected = findCollected(tp, since);
    const parts = Object.keys(collected);
    // 옮겨 적다 틀려 끝내 못 모은 부분 (다시 해서 모았으면 빼고 본다)
    const copyMismatch = findMismatch(tp).filter((p) => !collected[p]);
    const partErr = Object.fromEntries(copyMismatch.map((p) => [p, COPY_ERR]));
    const missingVersion = [];
    const summary = {};
    const d = collected.d || {};
    // 내 동네 좌표: 당근 탭에서 찾은 것 (없으면 거리 표시 없음). 예전 수집기는 주인 것 하나만 home 으로 줬다
    const homeRaw = (uid) => (d.homes && d.homes[uid]) || (!uid && d.home) || null;
    const homeOf = (uid) => { const h = homeRaw(uid); return h && Number.isFinite(h.lat) && Number.isFinite(h.lng) ? h : null; };
    let fileNo = 0;
    const fileOf = (doc) => { const fp = path.resolve(root, 'out', `w${++fileNo}.json`); fs.writeFileSync(fp, JSON.stringify(doc)); return fp; };
    const people2 = { n: 0, searches: 0 };
    if (parts.length) {
      for (const p of people) {
        const searches = Object.fromEntries(p.active.map((id) => [id, p.searchDocs[id]]));
        const skipped = {};
        for (const id of p.active) if (noRegion(p, p.searchDocs[id].data)) skipped[id] = { daangn: NO_REGION_MSG };
        const built = buildResults({ searches, prev: p.prev, ledgers: p.ledgers, collected, maxAgeDays, home: homeOf(p.uid), keyOf: (id) => keyOf(p, id), skipped, partErr });
        for (const [id, v] of Object.entries(built.summary)) summary[keyOf(p, id)] = v;
        if (p.uid) { people2.n++; people2.searches += p.active.length; }
        // 쓰는 순서: 마켓별 매물 → 머리 문서 → 장부 (페이지는 머리 문서가 바뀔 때 새 목록을 본다)
        const ids = Object.keys(built.docs).sort((a, b) => Number(isPartId(b)) - Number(isPartId(a)));
        for (const id of ids) {
          const w = { op: 'set', collection: `${p.base}results`, doc_id: id, file_path: fileOf(built.docs[id]) };
          if (p.prev[id]) { const v = verOf(p.prev[id]); if (v != null) w.if_version = v; else missingVersion.push(`${p.base}results/${id}`); }
          writes.push(w);
        }
        for (const [id, doc] of Object.entries(built.ledgerDocs)) {
          const lw = { op: 'set', collection: `${p.base}ledger`, doc_id: id, file_path: fileOf(doc) };
          if (p.ledgers[id]) { const v = verOf(p.ledgers[id]); if (v != null) lw.if_version = v; else missingVersion.push(`${p.base}ledger/${id}`); }
          writes.push(lw);
        }
        // 지운 검색의 문서, 검색에서 뺀 마켓의 매물 문서는 지운다 (상한을 넘어 이번에 모으지 않은 검색의 문서는 그대로 둔다)
        for (const [coll, have, made] of [['results', p.prev, built.docs], ['ledger', p.ledgers, built.ledgerDocs]]) {
          for (const [id, entry] of Object.entries(have)) {
            if (made[id]) continue;
            const base = id.split('~')[0];
            if (p.searchDocs[base] && (!isPartId(id) || !searches[base])) continue;
            const v = verOf(entry);
            if (v != null) writes.push({ op: 'delete', collection: `${p.base}${coll}`, doc_id: id, if_version: v });
          }
        }
        // 같이 쓰는 사람의 내 동네를 찾았는지 그 사람 문서에 알려 준다 (바뀌었을 때만)
        if (p.uid && p.doc && p.home && d.homes) {
          const h = d.homes[p.uid];
          const now = h ? (h.error ? { q: p.home.q, ok: false, error: String(h.error).slice(0, 80) } : { q: p.home.q, ok: true, name: h.name || '', fullName: h.fullName || '' }) : null;
          const was = p.doc.data && p.doc.data.sys ? p.doc.data.sys.home : null;
          const v = verOf(p.doc);
          if (now && v != null && JSON.stringify(was || null) !== JSON.stringify(now)) writes.push({ op: 'update', collection: 'u', doc_id: p.uid, file_path: fileOf({ sys: { home: now } }), if_version: v });
        }
      }
    }
    const errors = Object.values(summary).flatMap((s) => s.errors);
    const h0 = homeRaw('');
    writes.push(metaWrite(root, versions, {
      status: parts.length ? 'done' : 'failed',
      startedAt: since, finishedAt: Date.now(), by: 'claude', summary,
      ...(h0 ? { home: h0 } : {}),
      ...(people2.n ? { people: people2 } : {}),
      ...(collected.jb && collected.jb.bd ? { bd: collected.jb.bd } : {}),
      message: parts.length
        ? (errors.length ? `일부 마켓을 불러오지 못했어요 (${[...new Set(errors)].join(', ')})` : '')
        : copyMismatch.length ? COPY_ERR : '매물을 모으지 못했어요. PC의 Claude 앱이 켜져 있는지 확인한 뒤 다시 눌러 주세요.',
    }));
    // 한 줄 요약: 주인 검색은 검색마다, 같이 쓰는 사람은 합쳐서
    const short = {};
    let mItems = 0;
    const mErr = new Set();
    for (const [id, v] of Object.entries(summary)) {
      if (id.includes('/')) { mItems += v.n; v.errors.forEach((e) => mErr.add(e)); continue; }
      short[id] = `${v.keyword} ${v.n}건 새${v.new}${v.sold ? ' 판매완료' + v.sold : ''}${v.errors.length ? ' 오류:' + v.errors.join(',') : ''}`;
    }
    if (people2.n) short.members = `같이 쓰는 사람 ${people2.n}명 검색 ${people2.searches}개 ${mItems}건${mErr.size ? ' 오류:' + [...mErr].join(',') : ''}`;
    console.log(JSON.stringify({ parts, copyMismatch, missingVersion, summary: short, ...writeOut(root, writes) }, null, 1));
    return;
  }
  console.log('사용법: node refresh.mjs members W | prepare W | step W <n> | build W <since> | fail W <since> "<이유>" | info');
}

// 직접 실행했을 때만 (테스트에서 import 할 때는 실행하지 않는다). 경로에 한글·공백·링크가 있어도 맞도록 실제 경로로 비교한다
// (Windows 는 드라이브 글자 대소문자가 다를 수 있어 대소문자를 무시한다)
const isMain = (() => {
  try {
    const a = fs.realpathSync(process.argv[1]);
    const b = fs.realpathSync(fileURLToPath(import.meta.url));
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch { return false; }
})();
if (isMain) main();
