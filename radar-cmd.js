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
        return CATEGORIES.some((x) => x[0] === s.category) && numOrNull(s.bandMin) && numOrNull(s.bandMax) && wordsArr(s.excludeWords) && wordsArr(s.includeWords) &&
          (s.models == null || modelsOk(s.models)) ? '' : 'identify';
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

  /* ---------- 물건 정하기 '모델' 칸 (앱 data/ModelEdit.kt · Models.assign/hits/userModel 그대로 옮김 — R12 4단계, 비교 시험) ---------- */
  // 재료 = 묶음 identify.models { src, off, defs, auto, pinned, items:[[제목, 값, 표시]] } — 표시 1 = 같은 글(앱 Dedup.group 이 빼는 것),
  // 2 = 처음 단어 상태로 빠지는 매물. 판정은 하지 않고 '어느 모델 낱말이 든 제목인가'만 앱과 같은 규칙으로 세요.
  const UNKNOWN_MODEL = '모델 모름';
  const M_ALIASES = [
    ['아이폰', 'iphone'], ['아이패드', 'ipad'], ['맥북', 'macbook'], ['아이맥', 'imac'],
    ['에어팟', 'airpods', 'airpod'], ['애플워치', 'applewatch'], ['애플', 'apple'],
    ['갤럭시', 'galaxy'], ['갤탭', '갤럭시탭', 'galaxytab'], ['버즈', 'buds'],
    ['프로', 'pro'], ['맥스', 'max'], ['플러스', 'plus'], ['미니', 'mini'],
    ['울트라', 'ultra'], ['에어', 'air'], ['닌텐도', 'nintendo'], ['스위치', 'switch'],
    ['플레이스테이션', '플스', 'playstation'],
    ['ps5', '플스5', '플레이스테이션5', 'playstation5'],
    ['ps4', '플스4', '플레이스테이션4', 'playstation4'],
    ['다이슨', 'dyson'], ['소니', 'sony'], ['캐논', 'canon'], ['니콘', 'nikon'],
    ['후지필름', '후지', 'fujifilm'], ['라이카', 'leica'], ['로지텍', 'logitech'],
    ['레노버', 'lenovo'], ['삼성', 'samsung'], ['엘지', 'lg'], ['샤오미', 'xiaomi'],
    ['나이키', 'nike'], ['아디다스', 'adidas'], ['뉴발란스', 'newbalance'],
    ['스타벅스', 'starbucks'], ['레고', 'lego'], ['기가', 'gb'], ['테라', 'tb'],
    ['디오스', 'dios'],
  ];
  const M_INDEX = new Map();
  for (const g of M_ALIASES) { const n = g.map(norm); for (const w of n) M_INDEX.set(w, n); }
  const aliasesOf = (w) => { const n = norm(w); return M_INDEX.get(n) || [n]; };
  // 앱 Identify.tokens: 소문자, 한글/영문/숫자 덩어리
  const tokens = (t) => String(t == null ? '' : t).normalize('NFC').toLowerCase().split(/[^0-9a-z가-힣]+/).flatMap((x) => x.match(/[0-9]+|[a-z]+|[가-힣]+/g) || []);
  // 앱 Identify.STOP·useful·keywordParts(Matcher.groupsOf)
  const STOP_WORDS = new Set(['판매', '판매합니다', '판매해요', '판매중', '팝니다', '팔아요', '팔께요', '팔게요', '급처', '급매', '처분', '삽니다',
    '택포', '택배', '택배비', '직거래', '무료배송', '반값택배', '편의점', '포함', '가능', '불가', '문의', '네고',
    '정품', '상태', '좋음', '좋아요', '최상', '깨끗', '깨끗합니다', '깔끔', '급', '가격', '원', '만원', '개', '제품', '상품',
    'gb', 'tb', 'mb', 'cm', 'mm', 'kg', '인치']);
  function groupsOf(kw) {
    const out = [];
    for (const w of String(kw || '').split(/\s+/)) {
      const n = norm(w);
      if (!n) continue;
      const parts = M_INDEX.has(n) ? [n] : (n.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]+|[^가-힣ㄱ-ㅎㅏ-ㅣ]+/g) || []);
      for (const q of parts) if (q) out.push(M_INDEX.get(q) || [q]);
    }
    return out;
  }
  const keywordParts = (kw) => alts(kw).flatMap((a) => groupsOf(a).flat()).concat(alts(kw).map(norm));
  const usefulWord = (w, parts) => !(w.length < 2 || STOP_WORDS.has(w) || (/^[0-9]+$/.test(w) && w.length < 3) || parts.some((q) => q.includes(w)));
  // 앱 Models.GLUE_PREFIX·unglue(B-2, 10/24): 붙여 쓴 상표 앞말을 떼어 본다 — '맥북프로' = '맥북' '프로'. 나머지가 한글 두 글자 이상일 때만,
  // 같은 말 묶음에 든 말('갤럭시탭'·'애플워치')은 통째로. 앱과 같은 목록이어야 한다(앱 = 웹).
  const GLUE_PREFIX = ['아이폰', '아이패드', '맥북', '아이맥', '에어팟', '애플워치', '애플', '갤럭시탭', '갤탭', '갤럭시', '닌텐도', '플레이스테이션',
    '다이슨', '소니', '캐논', '니콘', '후지필름', '라이카', '로지텍', '레노버', '삼성', '엘지', '샤오미', '나이키', '아디다스', '뉴발란스',
    '스타벅스', '레고', '디오스', '로보락', '비쎌'].sort((a, b) => b.length - a.length);
  function unglue(tok) {
    if (tok.length < 4 || !/^[가-힣]+$/.test(tok) || aliasesOf(tok).length > 1) return [tok];
    const p = GLUE_PREFIX.find((x) => tok.startsWith(x) && tok.length - x.length >= 2);
    return p ? [p, tok.slice(p.length)] : [tok];
  }
  // 앱 Models.hits: 낱말이 같거나(같은 말 묶음), 한글 세 글자 이상이면 붙여 쓴 제목 안에 있어도
  // 제목은 한 번만 쪼갠다(앱 Models.Title, 0.7.5 QA B-4 — 모델 줄을 셀 때 낱말마다 제목을 다시 쪼개면 넓은 검색어에서 느렸다). 셈 결과는 같다.
  const T_CACHE = new Map();
  function titleParts(title) {
    const k = String(title == null ? '' : title);
    let p = T_CACHE.get(k);
    if (!p) {
      if (T_CACHE.size > 5000) T_CACHE.clear();
      const toks = tokens(k).flatMap(unglue);
      const low = k.normalize('NFC').toLowerCase();
      const spans = [...low.matchAll(RUN_RE)].map((m) => [m.index, m.index + m[0].length]);
      p = { toks: new Set(toks), heads: new Set(toks.map((t) => aliasesOf(t)[0])), glued: norm(k), low, spans };
      T_CACHE.set(k, p);
    }
    return p;
  }
  const RUN_RE = /[0-9]+|[a-z]+|[가-힣]+/g;
  // 앱 Models.isGlued: 영문·숫자(또는 한글·숫자)가 붙은 한 덩어리 말('v12'·'m1'·'s24'·'플스5', B-6)
  const isGlued = (w) => /[0-9]/.test(w) && /[^0-9]/.test(w) && /^[0-9a-z가-힣]+$/.test(w);
  // 앱 Models.UNIT_AFTER: 숫자 바로 뒤에 붙으면 단위('v 12개월'·'s10인치')
  const UNIT_AFTER = ['개월', '인치', '분', '시간', '년', '일', '개', '회', '번', '원', '만원', '천원', '기가', '테라', '와트', '미터', '키로', '센치'];
  // 앱 Models.gluedHit: 덩어리가 차례대로, 사이는 없거나 띄어쓰기·'-' 둘까지 · 숫자로 끝나면 소수점·단위가 바로 붙으면 아님
  function gluedHit(t, parts) {
    const n = parts.length, sp = t.spans;
    if (!n || sp.length < n) return false;
    const run = (i) => t.low.slice(sp[i][0], sp[i][1]);
    outer: for (let i = 0; i + n <= sp.length; i++) {
      for (let j = 0; j < n; j++) {
        const r = run(i + j), p = parts[j];
        const same = r === p || aliasesOf(r)[0] === aliasesOf(p)[0] ||
          (j === 0 && p.length >= 2 && /^[가-힣]+$/.test(p) && /^[가-힣]+$/.test(r) && r.endsWith(p));
        if (!same) continue outer;
        if (j > 0) {
          const g = t.low.slice(sp[i + j - 1][1], sp[i + j][0]);
          if (g.length > 2 || !/^[ -]*$/.test(g)) continue outer;
        }
      }
      if (/^[0-9]+$/.test(parts[n - 1])) {
        const rest = t.low.slice(sp[i + n - 1][1]);
        if (/^\.[0-9]/.test(rest)) continue;
        if (UNIT_AFTER.some((u) => rest.startsWith(u))) continue;
      }
      return true;
    }
    return false;
  }
  function hits(title, w) {
    const group = aliasesOf(w);
    const t = titleParts(title);
    // 예전: toks.some((x) => group.includes(x) || aliasesOf(x)[0] === group[0]) 와 같은 셈
    if (t.heads.has(group[0]) || group.some((g) => t.toks.has(g))) return true;
    if (group.some((g) => g.length >= 3 && /^[가-힣]+$/.test(g) && t.glued.includes(g))) return true;
    return group.some((g) => isGlued(g) && gluedHit(t, g.match(/[0-9]+|[a-z]+|[가-힣]+/g)));
  }
  // 앱 Models.implies: 낱말 a 가 있는 제목이면 늘 b 도 있나(같은 말 묶음, 또는 붙은 말 갈래 's24fe' → 's24')
  function implies(a, b) {
    if (a === b || aliasesOf(a)[0] === aliasesOf(b)[0]) return true;
    if (!isGlued(a) || !isGlued(b)) return false;
    const ra = a.match(/[0-9]+|[a-z]+|[가-힣]+/g), rb = b.match(/[0-9]+|[a-z]+|[가-힣]+/g);
    if (ra.length <= rb.length || rb.some((r, i) => ra[i] !== r)) return false;
    return !/^[0-9]+$/.test(rb[rb.length - 1]) || !/^[0-9]+$/.test(ra[rb.length]);
  }
  const moreSpecific = (x, h) => h.need.every((b) => x.need.some((a) => implies(a, b))) && !x.need.every((a) => h.need.some((b) => implies(b, a)));
  // 앱 Models.assign: 맞는 모델이 하나면 그 이름, 좁은·넓은 모델이 같이 맞으면 좁은 쪽, 서로 다른 모델 둘 이상이거나 없으면 '모델 모름'(같은 이름 둘 = 합친 모델)
  function assignModel(defs, title) {
    const hit = defs.filter((d) => d.need.every((w) => hits(title, w)));
    if (!hit.length) return UNKNOWN_MODEL;
    // 좁은 쪽: u 로 이어진 모델, 또는 낱말을 더 품은 모델('에어랩 코안다' ⊃ '에어랩', 's24fe' ⊃ 's24' — 앱 Models.moreSpecific, B-7)
    const narrow = [...new Set(hit.filter((h) => !hit.some((x) => x.u === h.n || (x.n !== h.n && moreSpecific(x, h)))).map((h) => h.n))];
    return narrow.length === 1 ? narrow[0] : UNKNOWN_MODEL;
  }
  // 앱 Models.userWords(B-6): 붙은 덩어리('v12')는 need 하나, 영문 두 글자 이하 + 띄우고 숫자('v 12'·'m-1')도 붙은 말, 나머지는 낱말마다
  function userWords(text) {
    const low = String(text == null ? '' : text).normalize('NFC').toLowerCase();
    const chunks = [];
    let prevEnd = -1, prev = '', runs = 0;
    for (const m of low.matchAll(RUN_RE)) {
      const r = m[0];
      const gap = prevEnd < 0 ? null : low.slice(prevEnd, m.index);
      const join = gap != null && (gap === '' ||
        (runs === 1 && (gap === ' ' || gap === '-') && prev.length <= 2 && /^[a-z]+$/.test(prev) && /^[0-9]+$/.test(r)));
      if (join) { chunks[chunks.length - 1] += r; runs++; } else { chunks.push(r); runs = 1; }
      prevEnd = m.index + r.length;
      prev = r;
    }
    return [...new Set(chunks.map((c) => aliasesOf(c)[0]))];
  }
  const userModel = (name) => ({ n: String(name == null ? '' : name).trim(), need: userWords(name) });
  const cleanDefs = (defs) => arr(defs).filter((d) => isObj(d) && str(d.n) && Array.isArray(d.need) && d.need.length).map((d) => ({ n: d.n, need: d.need.map(String), ...(str(d.u) ? { u: d.u } : {}) }));
  const modelNames = (defs) => [...new Set(arr(defs).map((d) => d.n))];
  const canSplitModels = (defs) => modelNames(defs).length >= 2;
  function renameModel(defs, old, nw) {
    const n = String(nw == null ? '' : nw).trim();
    if (!n || n === old || n === UNKNOWN_MODEL || defs.some((d) => d.n === n)) return defs;
    return defs.map((d) => (d.n === old ? { ...d, n } : d.u === old ? { ...d, u: n } : d));
  }
  function mergeModel(defs, from, into) {
    if (from === into || !defs.some((d) => d.n === into)) return defs;
    return defs.map((d) => { if (d.n === from) { const { u, ...rest } = d; return { ...rest, n: into }; } return d.u === from ? { ...d, u: into } : d; });
  }
  const removeModel = (defs, name) => defs.filter((d) => d.n !== name).map((d) => { if (d.u === name) { const { u, ...rest } = d; return rest; } return d; });
  // m = 묶음 identify.models(있으면 겹치는 모델을 좁은·넓은 모델로 잇기 — 앱 ModelEdit.add(…, items) · nest, B-7)
  function addModel(defs, text, m) {
    const d = userModel(text);
    if (!d.n || !d.need.length || d.n === UNKNOWN_MODEL || defs.some((x) => x.n === d.n)) return defs;
    const out = defs.concat([d]);
    return m && mItems(m).length ? nestModel(out, d.n, m) : out;
  }
  const NEST_PCT = 80;
  // 앱 ModelEdit.nest: 매물 = 후보 매물 같은 글 한 번(앱 Dedup.group)
  function nestModel(defs, name, m) {
    const uniq = mItems(m).filter((l) => !l.dup);
    const ids = (n) => { const ds = defs.filter((d) => d.n === n); const s = new Set(); uniq.forEach((l, i) => { if (ds.some((d) => d.need.every((w) => hits(l.title, w)))) s.add(i); }); return s; };
    const top = modelNames(defs).filter((n) => !defs.some((d) => d.n === n && d.u != null));
    if (!top.includes(name)) return defs;
    const mine = ids(name);
    if (!mine.size) return defs;
    let parent = null, parentBoth = 0;
    const kids = [];
    for (const o of top) {
      if (o === name) continue;
      const other = ids(o);
      let both = 0; for (const i of other) if (mine.has(i)) both++;
      if (!both) continue;
      if (both * 100 >= mine.size * NEST_PCT && other.size > mine.size && both > parentBoth) { parent = o; parentBoth = both; }
      else if (both * 100 >= other.size * NEST_PCT && mine.size > other.size && !defs.some((d) => d.u === o)) kids.push(o);
    }
    if (parent != null && !defs.some((d) => d.u === name)) return defs.map((d) => (d.n === name ? { ...d, u: parent } : d));
    if (kids.length) return defs.map((d) => (kids.includes(d.n) ? { ...d, u: name } : d));
    return defs;
  }
  // 묶음 매물 줄 → { title, price, dup, outWords }
  const mItems = (m) => arr(m && m.items).filter(Array.isArray).map((x) => ({ title: str(x[0]), price: Number.isFinite(x[1]) ? x[1] : null, dup: !!((x[2] | 0) & 1), outWords: !!((x[2] | 0) & 2) }));
  // 더하기 창 '지금 매물 n건이 이 말을 가져요'(앱 ModelEdit.matchCount — 같은 글은 한 번)
  function matchCount(m, text) {
    const d = userModel(text);
    if (!d.need.length) return 0;
    return mItems(m).filter((l) => !l.dup && d.need.every((w) => hits(l.title, w))).length;
  }
  const medianOf = (ls) => {
    const p = ls.map((l) => l.price).filter((v) => v > 0).sort((a, b) => a - b);
    if (!p.length) return 0;
    const n = p.length;
    return n % 2 ? p[(n - 1) / 2] : Math.floor((p[n / 2 - 1] + p[n / 2]) / 2);
  };
  // 앱 Noise.dropLowballs(시세 없이 — Stats 4건 이상일 때 중간값의 10% 아래 값)
  function dropLowballs(ls) {
    const p = ls.map((l) => l.price).filter((v) => v > 0).sort((a, b) => a - b);
    if (p.length < 4) return ls;
    const n = p.length, med = n % 2 ? p[(n - 1) / 2] : Math.trunc((p[n / 2 - 1] + p[n / 2]) / 2);
    const floor = Math.trunc(med * 0.10);
    return floor <= 0 ? ls : ls.filter((l) => !(l.price >= 1 && l.price < floor));
  }
  // 앱 Models.pickBase: 붙잡은 모델이 목록에 있으면 그대로, 아니면 매물 가장 많은 모델(같으면 싼 순으로 먼저 나온 것)
  function pickBaseModel(defs, uniq, pinned) {
    const names = modelNames(defs);
    if (pinned && names.includes(pinned)) return pinned;
    const counts = new Map();
    for (const l of uniq) {
      if (!(l.price > 0)) continue;
      const v = assignModel(defs, l.title);
      if (v !== UNKNOWN_MODEL) counts.set(v, (counts.get(v) || 0) + 1);
    }
    let best = null, bn = -1;
    for (const [k, v] of counts) if (v > bn) { best = k; bn = v; }
    return best || names[0] || null;
  }
  function coWords(ls, parts, need, names) {
    const nameWords = new Set(names.flatMap(tokens).map((t) => aliasesOf(t)[0]));
    const counts = new Map(), spelled = new Map();
    for (const l of ls) {
      const seen = new Set();
      for (const w of tokens(l.title)) {
        if (!usefulWord(w, parts)) continue;
        const head = aliasesOf(w)[0];
        if (need.has(head) || nameWords.has(head)) continue;
        if (!spelled.has(head)) spelled.set(head, new Map());
        spelled.get(head).set(w, (spelled.get(head).get(w) || 0) + 1);
        if (!seen.has(head)) { seen.add(head); counts.set(head, (counts.get(head) || 0) + 1); }
      }
    }
    return [...counts].filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, 2)
      .map(([head]) => { let best = head, bn = -1; for (const [w, v] of spelled.get(head) || []) if (v > bn) { best = w; bn = v; } return best; });
  }
  // 모델 줄(앱 ModelEdit.rows): band = { lo, hi } 고른 가격대(없으면 null) — 매물 = 처음 단어 상태 → 가격대 → 허수 저가 → 같은 글 한 번
  function modelRows(keyword, defs, m, band, pinned) {
    if (!canSplitModels(defs)) return { rows: [], unknown: 0 };
    const inBand = (v) => !(v > 0) || ((band.lo == null || v >= band.lo) && (band.hi == null || v <= band.hi));
    const narrowed = dropLowballs(mItems(m).filter((l) => !l.outWords && (!band || inBand(l.price))));
    const uniq = narrowed.filter((l) => !l.dup);
    const by = new Map();
    for (const l of uniq) { const v = assignModel(defs, l.title); if (!by.has(v)) by.set(v, []); by.get(v).push(l); }
    const base = pickBaseModel(defs, uniq, pinned);
    const parts = keywordParts(keyword);
    const order = modelNames(defs);
    const rows = order.map((n) => {
      const ls = by.get(n) || [];
      const need = new Set(defs.filter((d) => d.n === n).flatMap((d) => d.need));
      return { n, c: ls.length, mid: medianOf(ls), w: coWords(ls, parts, need, order), base: n === base };
    });
    const sorted = rows.map((r, i) => [r, i]).sort((a, b) => b[0].c - a[0].c || a[1] - b[1]).map((x) => x[0]);
    return { rows: sorted, unknown: (by.get(UNKNOWN_MODEL) || []).length };
  }
  // 명령 identify 의 set.models 검사(앱 WebCmd.modelsOk 와 같은 값)
  const MODELS_MAX = 20, MODEL_TEXT_MAX = 40;
  const mText = (v) => typeof v === 'string' && v.trim() !== '' && v.length <= MODEL_TEXT_MAX;
  function modelsOk(v) {
    if (!isObj(v) || !boolOk(v.off) || !boolOk(v.user) || !Array.isArray(v.defs) || v.defs.length > MODELS_MAX) return false;
    for (const d of v.defs) {
      if (!isObj(d) || !mText(d.n) || !Array.isArray(d.need) || d.need.length < 1 || d.need.length > 5 || !d.need.every(mText)) return false;
      if (d.u != null && !mText(d.u)) return false;
    }
    if (v.renamed != null) {
      if (!isObj(v.renamed) || Object.keys(v.renamed).length > MODELS_MAX) return false;
      for (const k of Object.keys(v.renamed)) if (!k.trim() || k.length > MODEL_TEXT_MAX || !mText(v.renamed[k])) return false;
    }
    return true;
  }
  // 추천 칩(B-5 — 앱 ModelEdit.chips): 묶음 identify.models.cands(앱 Models.suggest)에서 이미 더한 것(같은 이름·같은 낱말)을 빼고 8개
  const CHIP_MAX = 8;
  function modelChips(cands, defs) {
    const ds = arr(defs);
    const names = new Set(ds.map((d) => String(d.n).toLowerCase()));
    const needs = new Set(ds.map((d) => [...new Set(d.need)].sort().join('\u0001')));
    return arr(cands).filter((c) => isObj(c) && str(c.n) && Number.isFinite(c.c))
      .filter((c) => !names.has(c.n.toLowerCase()) && !needs.has([...new Set(userModel(c.n).need)].sort().join('\u0001')))
      .slice(0, CHIP_MAX);
  }
  // 앱 ModelEdit.intro(B-8): 사람이 고친 목록 · 자동으로 둘 이상 나눔 · 나누지 않음
  const modelIntro = (user, defs) => (user ? MODEL_TEXT.user : canSplitModels(defs) ? MODEL_TEXT.intro : MODEL_TEXT.introNone);
  const MODEL_TEXT = {
    intro: '제목 낱말로 자동으로 나눴어요. 고치면 앱이 다시 바꾸지 않아요.',
    introNone: '자동으로 나누지 않았어요. 추천을 누르거나 직접 더하면 모델마다 따로 판정해요.',
    chipLabel: '추천',
    user: '직접 고친 목록이에요.',
    revert: '자동으로 되돌리기',
    off: '한 시세로 판정해요. 값이 다른 모델이 섞이면 싼 모델이 꿀매로 떠요.',
    two: '모델이 둘 이상이어야 나눠요',
    unknown: (n) => `${UNKNOWN_MODEL} ${n}건 — 판정하지 않아요`,
    add: '+ 모델 직접 더하기',
    remove: '이 모델 지우기(매물은 모델 모름으로)',
    renameHint: '화면에 보이는 이름만 바꿔요(나누는 낱말은 그대로)',
    addHint: '제목에 이 말이 있으면 이 모델로 봐요(예: 크로스웨이브)',
    count: (n) => `지금 매물 ${n}건이 이 말을 가져요`,
    mergeHint: (from) => `'${from}' 매물을 고른 모델로 봐요`,
    introModels: '모델이 나뉜 물건은 가장 싼 무리(부품·소모품 같은)만 빼요. 위쪽은 자르지 않아요.',
    introSplit: '가격이 무리 지어 갈라져요. 찾는 물건의 무리를 고르면 다른 무리는 시세에서도 빠져요.',
  };

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
    UNKNOWN_MODEL, MODEL_TEXT, tokens, aliasesOf, unglue, hits, assignModel, userModel, cleanDefs, modelNames, canSplitModels, renameModel, mergeModel, removeModel, addModel,
    matchCount, modelRows, modelsOk, modelChips, modelIntro, CHIP_MAX, isGlued,
  };
})(typeof self !== 'undefined' ? self : globalThis);
