// 꿀매 레이더 웹 조작 1판 — 명령 도우미(순수 함수 + GitHub 이슈 부르기). 꼴은 docs/command-v1.md.
//   페이지(index.html)와 시험(test/radar-cmd.test.mjs)이 같이 써요. 판정은 하지 않아요 — 찾기·판정은 늘 앱.
//   잠금은 box.js(JunggoBox) 그대로, 용도 이름만 'junggo-radar-cmd'.
(function (root) {
  'use strict';

  const LABEL = 'junggo-radar-cmd';
  const KIND = 'junggo-radar-cmd';
  const TITLE = '꿀매 레이더 명령';
  const V = 1;
  const M = 60e3, H = 3600e3, D = 24 * H;

  // 웹 쪽 문턱 (command-v1 8장 · 기획 2-5·2-7 초안)
  const OPEN_MAX = 20;
  const ADHOC_PER_HOUR = 6;
  const ADHOC_CACHE_MS = 30 * M;
  const CHECK_ALL_MS = 30 * M;
  const POLL_MS = 20e3;
  const POLL_FOR_MS = 10 * M;
  const TOAST_MS = 6e3;
  const DONE_FOLD_MS = 30e3;
  const KEEP_MS = 7 * D;
  const STALE_MS = 6 * H; // 대표 결정(10/20): 늦은 그냥 검색·지금 확인·집중 감시 켜기

  const TYPES = ['add', 'edit', 'identify', 'remove', 'move', 'focus', 'check', 'adhoc', 'saveAdhoc', 'star', 'hide', 'unhide', 'unhideAll',
    'excludeWord', 'watch', 'share', 'opened', 'inboxRead', 'recent', 'prefs', 'home'];
  // 화면에 상태 줄을 안 그리는 작은 명령(머리 알약에도 안 셈)
  const QUIET = ['opened', 'inboxRead'];
  // 다시 모으는 명령 — '앱이 하는 중 · 세 마켓에서 모으는 중'
  const GATHER = ['add', 'adhoc', 'check', 'saveAdhoc', 'home'];

  const EDIT_FIELDS = ['thresholdPct', 'targetPrice', 'variantPick', 'keyword', 'matchMode', 'category', 'excludeWords', 'includeWords',
    'bandMin', 'bandMax', 'basicFilter', 'priceMin', 'priceMax', 'regionWords', 'maxKm', 'maxAgeDays', 'lowestAlert'];
  const TEXT_FIELDS = ['keyword', 'excludeWords', 'includeWords', 'regionWords', 'targetPrice', 'bandMin', 'bandMax', 'priceMin', 'priceMax'];
  const REFETCH_FIELDS = ['keyword', 'category', 'maxAgeDays', 'regionWords'];
  const PREF_FIELDS = ['defaultPct', 'autoWatchN', 'intensity', 'quiet', 'digestOn'];
  const HOME_FIELDS = ['daangnHome', 'distanceBase'];
  const FIELD_LABEL = {
    keyword: '검색어', thresholdPct: '꿀매 기준', targetPrice: '목표가', variantPick: '변형', matchMode: '검색어 확인', category: '카테고리',
    excludeWords: '빼고 볼 단어', includeWords: '꼭 들어갈 단어', bandMin: '물건 가격대', bandMax: '물건 가격대', basicFilter: '기본 거르기',
    priceMin: '예산', priceMax: '예산', regionWords: '당근 동네', maxKm: '당근 거리', maxAgeDays: '기간', lowestAlert: '최저가 갱신 알림',
    defaultPct: '새 물건의 꿀매 기준', autoWatchN: '자주 본 매물 자동으로 지켜보기', intensity: '감시 강도', quiet: '조용한 시간', digestOn: '하루 요약',
    daangnHome: '당근 내 동네', distanceBase: '거리 기준',
  };

  // 앱 Categories.ALL 과 같은 표(키·이름) — 바뀌면 같이 고쳐요
  const CATEGORIES = [['', '전체'], ['appliance', '가전'], ['phone', '휴대폰'], ['tablet', '태블릿'], ['pc', '컴퓨터·PC부품'], ['game', '게임기·게임'],
    ['furniture', '가구·인테리어'], ['living', '생활·주방'], ['leisure', '캠핑·레저'], ['sports', '스포츠']];
  const PCT_PRESETS = [10, 15, 20, 30]; // 앱 Judge.PRESETS
  const PCT_MIN = 5, PCT_MAX = 45;
  // 앱 Geo.KM_CHOICES · Periods · Cadence 와 같은 값
  const KM_CHOICES = [null, 3, 5, 10, 20];
  const PERIODS = [30, 60, 90, 0];
  const QUIET_CHOICES = [[1, 7], [0, 7], [23, 7], [0, 8]];
  const FOCUS_HOURS = [1, 2, 3];
  const FOCUS_EVERY = [5, 10];
  const FOCUS_MAX = 2;
  const HOME_MAX = 5;

  // 원격 share 는 이 호스트와 정확히 같을 때만 (L-6, command-v1 5장)
  const SHARE_HOSTS = ['web.joongna.com', 'm.joongna.com', 'www.daangn.com', 'daangn.com', 'm.bunjang.co.kr', 'bunjang.co.kr', 'www.bunjang.co.kr'];

  const str = (x) => (typeof x === 'string' ? x : '');
  const arr = (x) => (Array.isArray(x) ? x : []);
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

  /* ---------- id ---------- */
  const ID_RE = /^c_[0-9a-z]{6,12}_[0-9a-z]{5}$/;
  function newId(now, rand) {
    const r = rand || ((n) => {
      const a = new Uint8Array(n);
      (root.crypto || globalThis.crypto).getRandomValues(a);
      return Array.from(a, (b) => '0123456789abcdefghijklmnopqrstuvwxyz'[b % 36]).join('');
    });
    return `c_${Math.floor(now).toString(36)}_${r(5)}`;
  }

  /* ---------- 명령 만들기 · 검사 (command-v1 3·4장) ---------- */
  const keyOk = (k) => /^[jdb]:[^\s]{1,80}$/.test(str(k));
  const pidOk = (p) => /^[\w.:-]{1,80}$/.test(str(p));
  const textOk = (s, max) => typeof s === 'string' && s.length <= (max || 200);
  const boolOk = (b) => typeof b === 'boolean';
  const intIn = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  const numOrNull = (n) => n === null || (Number.isInteger(n) && n >= 0);
  const wordsArr = (a) => Array.isArray(a) && a.length <= 50 && a.every((w) => textOk(w, 40));

  function checkSetEdit(set, base) {
    if (!isObj(set) || !isObj(base)) return 'set';
    const keys = Object.keys(set);
    if (!keys.length) return 'set';
    for (const k of keys) {
      if (!EDIT_FIELDS.includes(k)) return 'field';
      const v = set[k];
      if (TEXT_FIELDS.includes(k)) { if (!textOk(v, 300)) return 'value'; }
      else if (k === 'thresholdPct') { if (!Number.isInteger(v)) return 'value'; }
      else if (k === 'variantPick') { if (!textOk(v, 30)) return 'value'; }
      else if (k === 'matchMode') { if (v !== 'title' && v !== 'content') return 'value'; }
      else if (k === 'category') { if (!CATEGORIES.some((c) => c[0] === v)) return 'value'; }
      else if (k === 'basicFilter' || k === 'lowestAlert') { if (!boolOk(v)) return 'value'; }
      else if (k === 'maxKm') { if (!KM_CHOICES.includes(v)) return 'value'; }
      else if (k === 'maxAgeDays') { if (!PERIODS.includes(v)) return 'value'; }
      if (!(k in base)) return 'base';
    }
    return '';
  }
  function checkSetPrefs(set, base) {
    if (!isObj(set) || !isObj(base) || !Object.keys(set).length) return 'set';
    for (const k of Object.keys(set)) {
      const v = set[k];
      if (!PREF_FIELDS.includes(k)) return 'field';
      if (k === 'defaultPct' && !intIn(v, PCT_MIN, PCT_MAX)) return 'value';
      if (k === 'autoWatchN' && !intIn(v, 0, 5)) return 'value';
      if (k === 'intensity' && v !== 'save' && v !== 'normal') return 'value';
      if (k === 'quiet' && !(isObj(v) && boolOk(v.on) && intIn(v.start, 0, 23) && intIn(v.end, 0, 23))) return 'value';
      if (k === 'digestOn' && !boolOk(v)) return 'value';
      if (!(k in base)) return 'base';
    }
    return '';
  }

  // 종류마다 칸 검사. '' = 맞음, 아니면 까닭(시험·개발용 — 화면엔 안 씀)
  function checkFields(c) {
    switch (c.type) {
      case 'add': return textOk(c.q, 200) && c.q.trim() && (c.card == null || /^(gpu:[0-9]{4}|console:ps5)$/.test(str(c.card))) ? '' : 'add';
      case 'edit': return pidOk(c.pid) ? checkSetEdit(c.set, c.base) : 'pid';
      case 'identify': {
        const s = c.set;
        if (!pidOk(c.pid) || !isObj(s)) return 'identify';
        return CATEGORIES.some((x) => x[0] === s.category) && numOrNull(s.bandMin) && numOrNull(s.bandMax) && wordsArr(s.excludeWords) && wordsArr(s.includeWords) ? '' : 'identify';
      }
      case 'remove': case 'unhideAll': return pidOk(c.pid) ? '' : 'pid';
      case 'move': return pidOk(c.pid) && (c.dir === 'up' || c.dir === 'down') ? '' : 'move';
      case 'focus':
        if (c.op === 'stop') return '';
        return c.op === 'start' && Array.isArray(c.ids) && c.ids.length >= 1 && c.ids.length <= FOCUS_MAX && c.ids.every(pidOk) && FOCUS_HOURS.includes(c.hours) && FOCUS_EVERY.includes(c.everyMin) ? '' : 'focus';
      case 'check': return c.pid == null || pidOk(c.pid) ? '' : 'pid';
      case 'adhoc': return textOk(c.q, 200) && c.q.trim() ? '' : 'q';
      case 'saveAdhoc': return textOk(c.q, 200) && c.q.trim() && textOk(c.variantPick, 30) ? '' : 'saveAdhoc';
      case 'star': return keyOk(c.key) && boolOk(c.on) && (c.pid == null || pidOk(c.pid)) ? '' : 'star';
      case 'hide': case 'unhide': return pidOk(c.pid) && keyOk(c.key) ? '' : 'hide';
      case 'excludeWord': return pidOk(c.pid) && textOk(c.word, 40) && c.word.trim() && (c.key == null || keyOk(c.key)) ? '' : 'word';
      case 'watch': return keyOk(c.key) && (c.op === 'pin' || c.op === 'remove') ? '' : 'watch';
      case 'share': return shareOk(c.url) ? '' : 'url';
      case 'opened': return keyOk(c.key) && (c.pid == null || pidOk(c.pid)) ? '' : 'opened';
      case 'inboxRead': return c.all === true || (Array.isArray(c.ids) && c.ids.length >= 1 && c.ids.length <= 200 && c.ids.every((x) => textOk(x, 80))) ? '' : 'inbox';
      case 'recent': return c.op === 'clear' || (c.op === 'del' && textOk(c.q, 200) && c.q.trim()) ? '' : 'recent';
      case 'prefs': return checkSetPrefs(c.set, c.base);
      case 'home': {
        const s = c.set, b = c.base;
        if (!isObj(s) || !isObj(b) || !Object.keys(s).length) return 'home';
        for (const k of Object.keys(s)) if (!HOME_FIELDS.includes(k) || !textOk(s[k], 200) || !(k in b)) return 'home';
        return '';
      }
      default: return 'type';
    }
  }

  // 열린 내용 전체 검사(앱이 하는 3장 검사와 같은 뜻 — 웹은 보내기 전에, 시험은 꼴 확인에)
  function validate(c, now) {
    if (!isObj(c)) return 'object';
    if (c.v !== V || c.kind !== KIND || c.from !== 'web') return 'head';
    if (!ID_RE.test(str(c.id))) return 'id';
    if (!Number.isFinite(c.at)) return 'at';
    if (now != null && (c.at < now - KEEP_MS || c.at > now + 10 * M)) return 'at';
    if (!TYPES.includes(c.type)) return 'type';
    return checkFields(c);
  }

  // 화면이 주는 칸으로 열린 내용을 만들어요. 틀리면 오류(웹 코드 잘못 — 보내지 않음)
  function make(type, fields, now, rand) {
    const c = { v: V, kind: KIND, id: newId(now, rand), at: Math.floor(now), from: 'web', type };
    for (const [k, val] of Object.entries(fields || {})) if (val !== undefined) c[k] = val;
    const why = validate(c, now);
    if (why) throw new Error('명령 꼴이 맞지 않아요: ' + why);
    return c;
  }

  /* ---------- 잠그기 (box.js) ---------- */
  async function seal(c, key, salt, iter) {
    const BOX = root.JunggoBox;
    return BOX.seal(c, key, salt, LABEL, iter);
  }
  async function open(box, key) {
    return root.JunggoBox.open(box, key, LABEL);
  }
  // 탭마다 한 번 받은 비밀번호 → 꺼낼 수 없는 열쇠(메모리에만, L-1)
  async function deriveCmdKey(password, salt, iter) {
    if (!password) throw new Error('비밀번호를 적어 주세요');
    const enc = new TextEncoder();
    const subtle = (root.crypto || globalThis.crypto).subtle;
    const b64d = (b) => Uint8Array.from(atob(String(b)), (ch) => ch.charCodeAt(0));
    const base = await subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt: b64d(salt), iterations: iter || 600000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /* ---------- GitHub 이슈 (command-v1 1장) ---------- */
  const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  const ghHeaders = (tok) => ({ Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' });
  // why: 'readonly'(Issues 쓰기 없음 — 403) | 'token'(401) | 'rate' | 'net' | 'repo'
  function failOf(r) {
    if (r.status === 401) return 'token';
    if (r.status === 429) return 'rate';
    if (r.status === 403) {
      const left = r.headers && r.headers.get ? r.headers.get('x-ratelimit-remaining') : null;
      const retry = r.headers && r.headers.get ? r.headers.get('retry-after') : null;
      return left === '0' || retry ? 'rate' : 'readonly';
    }
    if (r.status === 404) return 'readonly'; // 토큰이 이슈를 못 봄(읽기만 토큰은 404 를 줄 수 있음 — 판단)
    return 'net';
  }
  async function createIssue(o) {
    const f = o.fetchImpl || fetch;
    if (!REPO_RE.test(str(o.repo))) return { ok: false, why: 'repo' };
    let r;
    try {
      r = await f(`https://api.github.com/repos/${o.repo}/issues`, { method: 'POST', headers: ghHeaders(o.token), body: JSON.stringify({ title: TITLE, body: o.body }), cache: 'no-store' });
    } catch { return { ok: false, why: 'net' }; }
    if (r.status === 201 || r.ok) {
      try { const j = await r.json(); return Number.isInteger(j.number) ? { ok: true, number: j.number } : { ok: false, why: 'net' }; } catch { return { ok: false, why: 'net' }; }
    }
    return { ok: false, why: failOf(r), status: r.status };
  }
  async function closeIssue(o) {
    const f = o.fetchImpl || fetch;
    if (!REPO_RE.test(str(o.repo)) || !Number.isInteger(o.number)) return { ok: false, why: 'repo' };
    let r;
    try {
      r = await f(`https://api.github.com/repos/${o.repo}/issues/${o.number}`, { method: 'PATCH', headers: ghHeaders(o.token), body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }), cache: 'no-store' });
    } catch { return { ok: false, why: 'net' }; }
    return r.ok ? { ok: true } : { ok: false, why: failOf(r), status: r.status };
  }
  async function getIssue(o) {
    const f = o.fetchImpl || fetch;
    if (!REPO_RE.test(str(o.repo)) || !Number.isInteger(o.number)) return { ok: false, why: 'repo' };
    let r;
    try {
      r = await f(`https://api.github.com/repos/${o.repo}/issues/${o.number}`, { headers: ghHeaders(o.token), cache: 'no-store' });
    } catch { return { ok: false, why: 'net' }; }
    if (!r.ok) return { ok: false, why: failOf(r), status: r.status };
    try { const j = await r.json(); return { ok: true, state: j.state === 'closed' ? 'closed' : 'open', reason: str(j.state_reason) }; } catch { return { ok: false, why: 'net' }; }
  }

  /* ---------- 보낸 기록 (이 브라우저, 검색어·제목 없이) ---------- */
  // 기록 = { id, n, type, pid?, key?, at, cancel? } — 7일 지난 것은 버려요
  function pruneSent(list, now) {
    return arr(list).filter((r) => isObj(r) && ID_RE.test(str(r.id)) && Number.isFinite(r.at) && r.at > now - KEEP_MS && TYPES.includes(r.type));
  }
  const slim = (c, n) => {
    const r = { id: c.id, n, type: c.type, at: c.at };
    if (c.pid) r.pid = c.pid;
    if (c.key) r.key = c.key;
    if (c.type === 'star') r.on = c.on;
    if (c.type === 'focus') r.op = c.op;
    if (c.type === 'move') r.dir = c.dir;
    if (c.type === 'watch') r.op = c.op;
    if (c.type === 'recent') r.op = c.op;
    if (c.type === 'edit' || c.type === 'prefs' || c.type === 'home') r.fields = Object.keys(c.set || {});
    if (c.type === 'check' && !c.pid) r.all = true;
    return r;
  };

  /* ---------- 상태 (command-v1 7장 · 디자인 5-1) ---------- */
  // 돌려주는 st: sent | running | done | failed | conflict | stale | cancel
  function stateOf(rec, bundle, issue) {
    const row = arr(bundle && bundle.cmds).find((x) => x && x.id === rec.id);
    if (row) {
      const s = str(row.state);
      if (s === 'running' || s === 'queued') return { st: 'running', row };
      if (['done', 'failed', 'conflict', 'stale'].includes(s)) return { st: s, row };
    }
    if (rec.cancel) return { st: 'cancel', row: null };
    // 앱이 이슈를 닫았는데 결과 묶음이 아직 안 옴 → 앱이 받음(하는 중)
    if (issue && issue.state === 'closed') return { st: issue.reason === 'not_planned' && rec.cancelSent ? 'cancel' : 'running', row: null };
    return { st: 'sent', row: null };
  }
  const isOpen = (st) => st === 'sent' || st === 'running';
  const isBad = (st) => st === 'failed' || st === 'conflict' || st === 'stale';

  // 그 자리 한 줄 글 (디자인 5-1 표)
  function lineOf(rec, s, o) {
    o = o || {};
    const t = s.st;
    if (t === 'sent') return { cls: '', icon: 'clock', text: o.appOff ? '보냈어요 · 앱이 켜지면 처리해요' : '보냈어요 · 앱이 받기를 기다려요', cancel: true };
    if (t === 'running') {
      let text = '앱이 하는 중';
      if (GATHER.includes(rec.type)) text = '앱이 하는 중 · 세 마켓에서 모으는 중';
      if ((rec.type === 'edit' && arr(rec.fields).some((f) => REFETCH_FIELDS.includes(f))) || rec.type === 'identify') text = '새 조건으로 다시 모아 시세를 내는 중…';
      return { cls: 'run', icon: 'refresh', text };
    }
    if (t === 'done') return { cls: '', icon: 'check', text: s.row && str(s.row.why) ? `끝났어요 — ${s.row.why}` : '끝났어요' };
    if (t === 'stale') return { cls: 'bad', icon: 'alert', lead: '못 했어요', text: '너무 오래돼 하지 않았어요', retry: true };
    if (t === 'conflict') {
      const applied = arr(s.row && s.row.applied);
      const why = str(s.row && s.row.why) || '앱에서 먼저 바뀌었어요 — 새로 고친 뒤 다시 해 주세요';
      return { cls: 'bad', icon: 'alert', lead: applied.length ? '일부만 바꿨어요' : '못 했어요', text: applied.length ? why.replace(/^일부만 바꿨어요 — /, '') : why.replace(/^못 했어요 — /, ''), reopen: true };
    }
    if (t === 'failed') return { cls: 'bad', icon: 'alert', lead: '못 했어요', text: str(s.row && s.row.why) || '앱이 하지 못했어요', retry: true };
    return null;
  }

  /* ---------- 화면 이름 (command-v1 7장 what 규칙) ---------- */
  const cut20 = (s) => { s = str(s); return s.length > 20 ? s.slice(0, 20) + '…' : s; };
  function what(c, names) {
    names = names || {};
    const P = str(names.product) || '물건';
    const T = cut20(names.title) || '매물';
    switch (c.type) {
      case 'add': return `${str(names.product) || str(names.card) || firstAlt(c.q) || '물건'} 추가`;
      case 'edit': return `${P} 조건 바꾸기`;
      case 'identify': return `${P} 물건 정하기`;
      case 'remove': return `${P} 그만 지켜보기`;
      case 'move': return `${P} ${c.dir === 'up' ? '위로' : '아래로'}`;
      case 'focus': return c.op === 'stop' ? '집중 감시 멈추기' : '집중 감시 시작';
      case 'check': return c.pid ? `${P} 지금 확인` : '지금 모두 확인';
      case 'adhoc': return `그냥 검색 '${str(names.q) || str(c.q)}'`;
      case 'saveAdhoc': return `'${str(names.q) || str(c.q)}' 지켜보기`;
      case 'star': return `${c.on === false ? '★ 빼기' : '★ 지켜보기'} · ${T}`;
      case 'hide': return `이 매물 아님 · ${T}`;
      case 'unhide': return `되돌리기 · ${T}`;
      case 'unhideAll': return `${P} 숨긴 매물 모두 다시 보기`;
      case 'excludeWord': return `${P} '${str(names.word) || str(c.word)}' 빼기`;
      case 'watch': return `${c.op === 'pin' ? '★로 고정' : '그만 보기'} · ${T}`;
      case 'share': return '관심 매물 넣기(주소)';
      case 'opened': return `열어 봄 · ${T}`;
      case 'inboxRead': return '알림 읽음';
      case 'recent': return c.op === 'clear' ? '최근 검색 모두 지우기' : '최근 검색 지우기';
      case 'prefs': return '설정 바꾸기';
      case 'home': return '당근 내 동네 바꾸기';
      default: return '명령';
    }
  }

  /* ---------- 문턱 (command-v1 8장) ---------- */
  // 웹 그냥 검색 1시간 횟수 = 앱이 센 값과 웹이 그 뒤 보낸 것 중 큰 쪽. 보관 결과(cached)는 안 셈
  function adhocUse(bundle, sent, now) {
    const q = bundle && isObj(bundle.quota) && isObj(bundle.quota.adhoc) ? bundle.quota.adhoc : null;
    const limit = q && Number.isInteger(q.limit) && q.limit > 0 ? q.limit : ADHOC_PER_HOUR;
    const appTimes = q ? arr(q.times).filter((t) => Number.isFinite(t) && t > now - H) : [];
    const cmds = arr(bundle && bundle.cmds);
    const mine = arr(sent).filter((r) => r.type === 'adhoc' && !r.cancel && r.at > now - H && r.at > (bundle ? bundle.made || 0 : 0))
      .filter((r) => { const row = cmds.find((x) => x && x.id === r.id); return !(row && (row.cached || row.state === 'failed' || row.state === 'stale')); })
      .map((r) => r.at);
    const appUsed = q && Number.isInteger(q.used) ? Math.max(q.used, appTimes.length) : appTimes.length;
    const times = appTimes.concat(mine).sort((a, b) => a - b);
    const used = Math.max(appUsed + mine.length, times.length);
    const full = used >= limit;
    const oldest = times.length ? times[Math.max(0, times.length - limit)] : null;
    const waitMin = full && oldest ? Math.max(1, Math.ceil((oldest + H - now) / M)) : 0;
    return { used: Math.min(used, 99), limit, full, waitMin };
  }
  function checkAllWait(bundle, sent, now) {
    const app = bundle && bundle.quota && Number.isFinite(bundle.quota.checkAllAt) ? bundle.quota.checkAllAt : 0;
    const mine = arr(sent).filter((r) => r.type === 'check' && r.all && !r.cancel).map((r) => r.at);
    const last = Math.max(app, ...mine, 0);
    const left = last + CHECK_ALL_MS - now;
    return left > 0 ? Math.ceil(left / M) : 0;
  }
  // 30분 안 같은 검색어의 그냥 검색 결과(묶음 adhoc) — 있으면 보내지 않고 바로 보여 줘요
  function adhocCached(bundle, q, now) {
    const n = norm(q);
    if (!n) return null;
    return arr(bundle && bundle.adhoc).find((a) => a && norm(a.q) === n && Number.isFinite(a.at) && now - a.at <= ADHOC_CACHE_MS) || null;
  }

  /* ---------- 카드 제안 (앱 Products.suggest 그대로 옮김 — 비교 시험) ---------- */
  const STRIP = /[\s\[\](){}<>"'`_\-/|·•ㆍ,!?~*+=:;]+/g;
  const norm = (s) => String(s == null ? '' : s).normalize('NFC').toLowerCase().replace(STRIP, '');
  const alts = (k) => String(k == null ? '' : k).split(/[,，]/).map((x) => x.trim()).filter(Boolean).slice(0, 3);
  const firstAlt = (k) => alts(k)[0] || '';
  const GPU_NUM = /^(?:rtx|gtx|rx|지포스|라데온|geforce|radeon)?([0-9]{4})$/;
  const PS5_KEY = /^(?:ps5|플스5|플레이스테이션5|playstation5)(프로|pro|슬림|slim|디지털|digital|디스크|disc)?$/;
  const GPU_SUB = '그래픽카드 · 완본체·노트북 빼고 · 변형(SUPER·Ti·XT) 따로';
  const PS5_SUB = '게임기 · 게임·주변기기는 가격대로 빼고 · 기본·디지털·슬림·프로 따로';
  function gpuName(num) {
    const a = +num[0], b = +num[1];
    if (a === 1) return `GTX ${num}`;
    if (a >= 2 && a <= 4) return `RTX ${num}`;
    if (a === 5 && b <= 4) return `RTX ${num}`;
    return `RX ${num}`;
  }
  const gpuCard = (num) => ({ id: `gpu:${num}`, title: gpuName(num), sub: GPU_SUB, keyword: num, category: 'pc', family: '그래픽카드' });
  const ps5Card = () => ({ id: 'console:ps5', title: '플레이스테이션 5', sub: PS5_SUB, keyword: '플스5', category: 'game', family: '게임기' });
  function suggest(keyword) {
    const first = firstAlt(keyword);
    if (!first) return null;
    const n = norm(first);
    const g = GPU_NUM.exec(n);
    if (g) return gpuCard(g[1]);
    const p = PS5_KEY.exec(n);
    if (p && !p[1]) return ps5Card();
    return null;
  }
  // 이 카드로 지켜보는 물건(앱 Products.watching, 0.7.2 R5): 검색어(cfg.keyword)가 이 카드와 맞는(suggest) 것 전부
  const watchingCard = (cardId, products) => arr(products).filter((p) => isObj(p) && isObj(p.cfg) && (suggest(str(p.cfg.keyword)) || {}).id === cardId);
  // '그만 지켜보기' 확인 창 글 — 앱 data/StopWatch.kt 와 같은 글(홈 ⋯ 와 '+ 물건' 창이 같은 창)
  const STOP = {
    title: (name) => `'${name}' 그만 지켜볼까요?`,
    body: '지금 최저가·매물 장부·가격 기록이 지워지고 되돌릴 수 없어요. 다시 추가하면 처음부터 모아요.',
    focus: '집중 감시도 함께 꺼져요.',
    cancel: '취소', ok: '지우기',
    pickTitle: (card, n) => `'${card}' 카드로 지켜보는 물건이 ${n}개예요`,
    cardLine: '지켜보는 중 · 누르면 그만',
    cardSpeech: (title) => `${title}, 지켜보는 중, 누르면 그만 지켜보기`,
  };
  // 앱 Products.QUICK — 묶음 cards 가 없을 때만 씀(옛 앱)
  const QUICK = [gpuCard('4080'), gpuCard('5070'), gpuCard('5080'), gpuCard('9070'), ps5Card()];
  const familyOf = (c) => (str(c && c.category) === 'game' ? '게임기' : str(c && c.category) === 'pc' ? '그래픽카드' : str(c && c.family));

  /* ---------- share 주소 검사 (L-6) ---------- */
  function shareOk(u) {
    let url;
    try { url = new URL(str(u).trim()); } catch { return false; }
    return url.protocol === 'https:' && SHARE_HOSTS.includes(url.hostname.toLowerCase()) && !url.username && !url.password && (url.port === '' || url.port === '443') && str(u).length <= 500;
  }

  /* ---------- 조건 창: 바꾼 칸만 (command-v1 4장 edit 칸) ---------- */
  const joinWords = (a) => arr(a).join(', ');
  // 조건 창 처음 값(앱 SearchEditDialog 의 처음 값과 같은 글)
  function editInit(p) {
    const c = isObj(p && p.cfg) ? p.cfg : null;
    if (!c) return null;
    const t = isObj(p.cfgText) ? p.cfgText : {};
    const pct = Number.isInteger(c.thresholdPct) ? c.thresholdPct : 15;
    return {
      thresholdPct: pct, customPct: !PCT_PRESETS.includes(pct),
      targetPrice: str(t.targetPrice), variantPick: str(c.variantPick), keyword: str(c.keyword), matchMode: c.matchMode === 'content' ? 'content' : 'title',
      category: str(c.category), excludeWords: joinWords(c.excludeWords), includeWords: joinWords(c.includeWords),
      bandMin: str(t.bandMin), bandMax: str(t.bandMax), basicFilter: c.basicFilter !== false, priceMin: str(t.priceMin), priceMax: str(t.priceMax),
      regionWords: joinWords(c.regionWords), maxKm: KM_CHOICES.includes(c.maxKm) ? c.maxKm : null,
      maxAgeDays: c.maxAgeDays == null ? 30 : c.maxAgeDays, lowestAlert: c.lowestAlert !== false,
    };
  }
  // form = 화면 값(editInit 꼴). 바꾼 칸만 set, base 는 묶음 cfg 원래 값
  function editDiff(p, form) {
    const init = editInit(p);
    if (!init) return { set: {}, base: {}, changed: [] };
    const c = p.cfg;
    const set = {}, base = {};
    for (const k of EDIT_FIELDS) {
      let a = init[k], b = form[k];
      if (k === 'thresholdPct') { b = Number.parseInt(b, 10); if (!Number.isInteger(b)) continue; }
      if (TEXT_FIELDS.includes(k)) { a = str(a); b = str(b); if (a.trim() === b.trim()) continue; }
      else if (a === b) continue;
      set[k] = b;
      base[k] = k === 'maxAgeDays' ? (c.maxAgeDays === undefined ? null : c.maxAgeDays) : (c[k] === undefined ? null : c[k]);
    }
    // 앱 조건 창 저장: 검색어를 비우면 그대로(keyword.trim().ifEmpty { 원래 }) — 웹도 바꾼 칸으로 안 봐요
    if ('keyword' in set && !str(set.keyword).trim()) { delete set.keyword; delete base.keyword; }
    return { set, base, changed: Object.keys(set) };
  }
  function changedLabels(fields) {
    return [...new Set(arr(fields).map((f) => FIELD_LABEL[f] || f))];
  }

  /* ---------- 물건 정하기: 고른 값 → identify set (앱 IdentifySheet 와 같은 셈) ---------- */
  // sel = { category, band: index|null, withHigher, words: {w: 0|1|2} }
  function identifySet(p, sel) {
    const id = isObj(p && p.identify) ? p.identify : {};
    const bands = arr(id.bands);
    const c = isObj(p && p.cfg) ? p.cfg : {};
    const pick = isObj(id.pick) ? id.pick : null;
    const keepOld = sel.band == null && !pick && (c.bandMin != null || c.bandMax != null);
    const b = sel.band != null ? bands[sel.band] : null;
    const bandMin = b ? (Number.isInteger(b.lo) ? b.lo : null) : keepOld ? (c.bandMin ?? null) : null;
    const bandMax = b ? (sel.withHigher ? null : (Number.isInteger(b.hi) ? b.hi : null)) : keepOld ? (c.bandMax ?? null) : null;
    const ws = isObj(sel.words) ? sel.words : {};
    const ex = arr(id.keptEx).concat(Object.keys(ws).filter((w) => ws[w] === 1));
    const inc = arr(id.keptIn).concat(Object.keys(ws).filter((w) => ws[w] === 2));
    return { category: str(sel.category), bandMin, bandMax, excludeWords: ex, includeWords: inc };
  }
  // 앱이 센 미리보기 중 고른 값과 맞는 것(단어·카테고리를 바꾸면 없음 — 웹은 판정하지 않아요)
  function identifyPreview(p, sel) {
    const id = isObj(p && p.identify) ? p.identify : {};
    const pv = isObj(id.previews) ? id.previews : {};
    const c = isObj(p && p.cfg) ? p.cfg : {};
    if (str(sel.category) !== str(c.category)) return { kind: 'category' };
    const words0 = {};
    for (const w of arr(id.words)) if (w && str(w.w)) words0[w.w] = w.s | 0;
    const ws = isObj(sel.words) ? sel.words : {};
    if (Object.keys(words0).some((w) => (ws[w] | 0) !== words0[w])) return { kind: 'words' };
    const k = sel.band == null ? 'none' : `${sel.band}|${sel.withHigher ? 1 : 0}`;
    return isObj(pv[k]) ? { kind: 'ok', pv: pv[k] } : { kind: 'none' };
  }

  /* ---------- 시세 탭 숫자 (앱 PriceView 그대로 옮김 — 웹 안, 판정 아님) ---------- */
  function quant(sorted, p) {
    if (!sorted.length) return 0;
    if (sorted.length === 1) return sorted[0];
    const pos = p * (sorted.length - 1);
    const lo = Math.trunc(pos);
    const hi = Math.min(lo + 1, sorted.length - 1);
    const f = pos - lo;
    return Math.trunc(sorted[lo] + (sorted[hi] - sorted[lo]) * f);
  }
  function niceCeil(v) {
    if (v <= 0) return 10000;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    for (const st of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) { const cand = st * mag; if (cand >= v) return Math.trunc(cand); }
    return Math.trunc(10 * mag);
  }
  const sample = (a, n) => (a.length <= n ? a : Array.from({ length: n }, (_, i) => a[Math.trunc(i * a.length / n)]));
  // rows = 보이는 매물 줄(칩으로 거른 뒤, 앱 s.results 와 같은 줄)
  function priceStats(rows) {
    const priced = arr(rows).filter((l) => l && Number(l.price) > 0);
    const all = priced.map((l) => l.price).sort((a, b) => a - b);
    if (all.length < 4) return null;
    const median = quant(all, 0.5), q1 = quant(all, 0.25), q3 = quant(all, 0.75);
    const max = niceCeil(Math.max(quant(all, 0.95), median * 2, 10000));
    let minL = null, maxL = null;
    for (const l of priced) { if (!minL || l.price < minL.price) minL = l; if (!maxL || l.price > maxL.price) maxL = l; }
    const dists = ['j', 'd', 'b'].map((m) => {
      const ps = priced.filter((l) => l.m === m).map((l) => l.price).sort((a, b) => a - b);
      return ps.length ? { m, count: ps.length, dots: sample(ps.filter((x) => x <= max), 55), median: quant(ps, 0.5), q1: quant(ps, 0.25), q3: quant(ps, 0.75) } : null;
    }).filter(Boolean);
    return { median, q1, q3, count: all.length, max, minL, maxL, dists };
  }
  // 시세 막대(앱 PriceBar): 시세의 절반 ~ 1.3배
  function priceBar(price, ref) {
    if (!isObj(ref) || !(ref.med > 0)) return null;
    const med = ref.med, lo = Math.trunc(med * 0.5), hi = Math.trunc(med * 1.3);
    const span = Math.max(hi - lo, 1);
    const clamp = (x) => Math.min(1, Math.max(0, x));
    return { lo, med, hi, item: clamp(((price > 0 ? price : lo) - lo) / span), medFrac: clamp((med - lo) / span), label: str(ref.label) };
  }

  root.RadarCmd = {
    LABEL, KIND, TITLE, V, TYPES, QUIET, GATHER, EDIT_FIELDS, TEXT_FIELDS, REFETCH_FIELDS, PREF_FIELDS, HOME_FIELDS, FIELD_LABEL,
    CATEGORIES, PCT_PRESETS, PCT_MIN, PCT_MAX, KM_CHOICES, PERIODS, QUIET_CHOICES, FOCUS_HOURS, FOCUS_EVERY, FOCUS_MAX, HOME_MAX, SHARE_HOSTS,
    OPEN_MAX, ADHOC_PER_HOUR, ADHOC_CACHE_MS, CHECK_ALL_MS, POLL_MS, POLL_FOR_MS, TOAST_MS, DONE_FOLD_MS, KEEP_MS, STALE_MS, ID_RE, QUICK,
    newId, validate, make, seal, open, deriveCmdKey, createIssue, closeIssue, getIssue, pruneSent, slim, stateOf, isOpen, isBad, lineOf, what, cut20,
    adhocUse, checkAllWait, adhocCached, norm, alts, firstAlt, suggest, watchingCard, STOP, gpuName, familyOf, shareOk, editInit, editDiff, changedLabels,
    identifySet, identifyPreview, quant, niceCeil, priceStats, priceBar,
  };
})(typeof self !== 'undefined' ? self : globalThis);
