// 꿀매 레이더 웹 — 화면(웹 조작 1판). 보기는 웹 2판 그대로(앱이 판정한 묶음을 그림), 조작은 잠근 명령을 보내고 앱이 처리한 결과가
// 다음 묶음으로 오면 바뀌어요(디자인 결정 2: 그때까지 옛 값 + '바꾸는 중'). 꼴: docs/bundle-v1.md · docs/command-v1.md
// 콘텐츠 보안 정책(L-2)을 지키려고 페이지 안 스크립트·onerror 없이 이 파일 하나로 둬요.
(function () {
  'use strict';
  const RV = window.RadarView, BOX = window.JunggoBox, C = window.RadarCmd;
  const { esc, won, man, ago, clock, placeText, MARKET, MARK } = RV;
  const $ = (s) => document.querySelector(s);
  const now = () => Date.now();
  const arr = RV.arr, str = RV.str;

  // ---------- 어디서 받나 ----------
  // GitHub 판: 비공개 데이터 저장소(기본 <주인>/junggo-dash-data)의 view 가지 radar.enc 를 웹 토큰으로 받아요.
  // 시험용: ?src=./폴더 → 그 폴더의 radar.json(잠그지 않은 디버그 묶음) 또는 radar.enc — 이때는 명령을 보내지 않아요
  const OWNER = location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : '20130721pk-a11y';
  const DEFAULT_REPO = `${OWNER}/junggo-dash-data`;
  const LOCAL_SRC = (() => {
    const s = new URLSearchParams(location.search).get('src') || '';
    return /^\.\/[\w./-]*$/.test(s) && !s.includes('..') ? s.replace(/\/$/, '') : '';
  })();
  const PULL_MS = 5 * 60e3; // 창이 열려 있으면 5분마다 (초안)

  // ---------- 이 기기 저장 ----------
  const store = (kind) => ({
    get(k) { try { const v = window[kind].getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
    set(k, v) { try { window[kind].setItem(k, JSON.stringify(v)); } catch { /* 못 해도 이번엔 돼요 */ } },
    del(k) { try { window[kind].removeItem(k); } catch { /* 그대로 */ } },
  });
  const LS = store('localStorage'), SS = store('sessionStorage');
  const K_KEY = 'jd.key', K_TOK = 'jd.rtok', K_CMDS = 'jd.cmds';
  const SS_PLAIN = 'jd.plain', SS_ADHOC = 'jd.adhocq';

  // ---------- 상태 ----------
  const S = {
    phase: 'loading', // loading | lock | first | version | token | ready
    bundle: null, box: null, key: null, salt: '', token: '', repo: '', lastCt: '', pulledAt: 0, level: '',
    needToken: false, lockErr: '', busy: false,
    tab: 'home', pid: '', ptab: 'list', mkSel: '', cond: '', area: 'all', withUnknown: true, sort: 'low', q: '', variant: '', vpid: '', allDaangn: false,
    searchText: '', adhocQ: SS.get(SS_ADHOC) || '', adhocSwap: '',
    dlg: null, opener: null, menu: null, toast: null,
    sent: [], iss: {}, plain: SS.get(SS_PLAIN) || {}, cmdKey: null, ro: false, pend: null, pollUntil: 0, lastSt: {}, doneSeen: {}, dismissed: {},
    recentHidden: new Set(), readLocal: new Set(), readAll: 0,
  };

  // ---------- 작은 도우미 ----------
  const ico = (id, cls) => `<svg class="ico ${cls || ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const mkMark = (m, sm) => MARK[m] ? `<span class="mk mk-${m} ${sm ? 'sm' : ''}" aria-hidden="true">${MARK[m]}</span><span class="sr">${MARKET[m]}</span>` : '';
  function thumb(l, size) {
    const src = RV.safeUrl(l && l.thumb);
    const img = src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
    const m = l && MARK[l.m] ? `<span class="mk mk-${l.m}">${MARK[l.m]}</span>` : '';
    return `<span class="thumb ${size || ''} ${src ? 'has-img' : ''}" aria-hidden="true">${img}${m}</span>`;
  }
  const ext = (l) => { const u = RV.safeUrl(l && l.url); return u ? `href="${esc(u)}" target="_blank" rel="noopener noreferrer"` : ''; };
  const B = () => S.bundle;
  const live = () => RV.liveState(B(), now());
  const late = () => !!S.bundle && live().late;
  const day = () => !!S.bundle && live().day;
  const prods = () => arr(B() && B().products);
  const prod = (id) => prods().find((p) => p.id === id);
  const listOf = (p) => arr(p && p.listings);
  const findL = (p, key) => listOf(p).find((l) => l.key === key);
  const isIos = () => B() && B().platform === 'ios';
  const confirmedOf = (p) => (p && typeof p.confirmed === 'boolean' ? p.confirmed : p && p.cfg ? p.cfg.confirmed !== false : true);
  function anyListing(key) {
    for (const p of prods()) { const l = findL(p, key); if (l) return { l, p }; }
    for (const a of arr(B() && B().adhoc)) { const l = arr(a.listings).find((x) => x.key === key); if (l) return { l, p: null, adhoc: a }; }
    for (const w of arr(B() && B().watches)) if (w && w.listing && w.listing.key === key) return { l: w.listing, p: prod(w.pid) };
    for (const i of arr(B() && B().inbox)) if (i && i.listing && i.listing.key === key) return { l: i.listing, p: prod(i.pid) };
    return null;
  }
  function badge(g, compact) {
    const b = RV.badge(g, compact);
    if (!b) return '';
    const then = late() && g.k === 'honey' ? ' <span class="then">그때 기준</span>' : '';
    return `<span class="badge ${b.cls}"${b.aria ? ` aria-label="${esc(b.aria)}"` : ''}>${b.icon ? ico(b.icon) : ''}${esc(b.text)}</span>${then}`;
  }
  function spark(vals, h, w) {
    vals = arr(vals);
    const pts = vals.map((v, i) => [i, v]).filter((p) => Number.isFinite(p[1]));
    if (pts.length < 2) return '';
    const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
    const span = Math.max(hi - lo, 1), n = Math.max(vals.length - 1, 1);
    const X = (i) => (w * i / n).toFixed(1), Y = (v) => (h - 4 - (h - 8) * ((v - lo) / span)).toFixed(1);
    const d = pts.map((p, k) => (k ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ');
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="최근 30일 최저가 추이, 가장 낮은 값 ${esc(man(lo))}, 오늘 ${esc(man(last[1]))}">
      <path d="${d}" fill="none" stroke="#A98BF7" stroke-opacity=".85" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${X(last[0])}" cy="${Y(last[1])}" r="3" fill="#F2F3F6"/></svg>`;
  }
  const mlows = (o, big) => ['j', 'd', 'b'].filter((m) => o && Number.isFinite(o[m])).map((m) => `<span class="mlow"${big ? ' style="font-size:.9375rem"' : ''}>${mkMark(m, !big)}${esc(man(o[m]))}</span>`).join('');
  const vlows = (a) => arr(a).filter((x) => Array.isArray(x) && Number.isFinite(x[1])).map(([v, n]) => `<span class="pill">${esc(v)} ${esc(man(n))}</span>`).join('');
  const facts = (a) => arr(a).map((f) => (f && f.icon ? `${ico(f.icon === 'target' ? 'target' : 'trend')} ${esc(f.t)}` : esc(f && f.t))).join(' · ');
  const soldMaybe = (txt) => (day() ? ` · <span class="sold-maybe">${txt || '팔렸을 수 있어요'}</span>` : '');
  const dis = (on) => (on ? ' disabled' : '');

  // ---------- 토스트 (6초, 되돌리기 단추) ----------
  function toast(text, act) {
    S.toast = { text, act: act || null, until: now() + C.TOAST_MS };
    renderToast();
    clearTimeout(toast.h);
    toast.h = setTimeout(() => { S.toast = null; renderToast(); }, C.TOAST_MS);
  }
  function renderToast() {
    const el = $('#toast');
    if (!S.toast) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `<span>${esc(S.toast.text)}</span>${S.toast.act ? `<button class="btn btn-text btn-sm" data-act="toast">${esc(S.toast.act.label)}</button>` : ''}`;
  }

  /* =====================================================================
   * 명령 (docs/command-v1.md)
   * ===================================================================== */
  function loadSent() { S.sent = C.pruneSent(LS.get(K_CMDS), now()); }
  function saveSent() { S.sent = C.pruneSent(S.sent, now()); LS.set(K_CMDS, S.sent); }
  function savePlain() {
    const keep = {};
    for (const r of S.sent) if (S.plain[r.id]) keep[r.id] = S.plain[r.id];
    S.plain = keep; SS.set(SS_PLAIN, keep);
  }
  const stOf = (r) => C.stateOf(r, B(), S.iss[r.n]);
  const visRecs = () => S.sent.filter((r) => !S.dismissed[r.id] && !C.QUIET.includes(r.type));
  function openRecs() { return S.sent.filter((r) => !C.QUIET.includes(r.type) && C.isOpen(stOf(r).st)); }
  const locked = () => S.ro || LOCAL_SRC || openRecs().length >= C.OPEN_MAX || !!(B() && B().cmdLock && B().cmdLock.until > now());
  function lockWhy() {
    if (LOCAL_SRC) return '시험 묶음(?src=)이라 명령을 보낼 수 없어요';
    if (S.ro) return "지금 토큰은 읽기만 돼요 — 웹에서 바꾸려면 '읽기 + 이슈 쓰기' 토큰으로 바꿔 주세요";
    if (B() && B().cmdLock && B().cmdLock.until > now()) return '앱이 명령 받기를 잠시 멈췄어요';
    return '앱이 아직 앞 명령을 못 받았어요';
  }
  const lk = () => (locked() ? ` disabled title="${esc(lockWhy())}"` : '');
  function namesFor(r) {
    const pl = S.plain[r.id] || {};
    const p = r.pid ? prod(r.pid) : null;
    const hit = r.key ? anyListing(r.key) : null;
    const card = pl.card ? (arr(B() && B().cards).find((c) => c.id === pl.card) || C.QUICK.find((c) => c.id === pl.card)) : null;
    return { product: p ? p.name : '', title: hit ? hit.l.title : '', q: pl.q || '', card: card ? card.title : '', word: pl.word || '' };
  }
  function whatOf(r) {
    const s = stOf(r);
    if (s.row && str(s.row.what)) return s.row.what;
    return C.what({ ...r, ...(S.plain[r.id] || {}) }, namesFor(r));
  }
  // 그 자리 한 줄에 보일 기록: 열린 것 · 못 한 것(닫기 전) · 끝난 지 30초 안
  function showRec(r) {
    if (!r || S.dismissed[r.id] || C.QUIET.includes(r.type)) return false;
    const st = stOf(r).st;
    if (st === 'cancel') return false;
    if (st === 'done') { const seen = S.doneSeen[r.id] || 0; return now() - seen < C.DONE_FOLD_MS; }
    return true;
  }
  function lastRec(pred) {
    for (let i = S.sent.length - 1; i >= 0; i--) { const r = S.sent[i]; if (pred(r) && showRec(r)) return r; }
    return null;
  }
  function cmdLine(r, o) {
    if (!r) return '';
    o = o || {};
    const s = stOf(r);
    const L = C.lineOf(r, s, { appOff: late() });
    if (!L) return '';
    const role = L.cls === 'bad' ? 'alert' : 'status';
    const agoT = s.st === 'sent' ? ` · ${esc(ago(r.at, now()))}` : s.st === 'done' ? ' · 방금' : '';
    const ios = isIos() && s.st === 'sent' ? '<span class="ios"> · 앱을 열면 처리해요</span>' : '';
    const acts = [];
    if (L.cancel && r.n) acts.push(`<button class="btn btn-text gray btn-sm" data-act="cancel" data-id="${esc(r.id)}">취소</button>`);
    if (L.reopen && r.pid && prod(r.pid)) acts.push(`<button class="btn btn-text btn-sm" data-act="edit" data-pid="${esc(r.pid)}" data-reopen="${esc(r.id)}">새 값으로 조건 열기</button>`);
    if (L.retry && S.plain[r.id]) acts.push(`<button class="btn btn-text btn-sm" data-act="retry" data-id="${esc(r.id)}">다시 보내기</button>`);
    if (C.isBad(s.st)) acts.push(`<button class="btn btn-text gray btn-sm" data-act="dismiss" data-id="${esc(r.id)}">닫기</button>`);
    const label = o.label ? `<span class="muted">${esc(whatOf(r))} · </span>` : '';
    const body = L.lead ? `<b>${esc(L.lead)}</b> — ${esc(L.text)}` : esc(L.text);
    return `<div class="cmd ${L.cls}${o.boxed ? ' boxed' : ''}" role="${role}" data-cmd="${esc(r.id)}">${ico(L.icon)}${label}<span>${body}<span class="ago">${agoT}</span>${ios}</span>${acts.length ? `<span class="acts">${acts.join('')}</span>` : ''}</div>`;
  }
  const pendingPid = (pid, types) => S.sent.some((r) => r.pid === pid && (!types || types.includes(r.type)) && C.isOpen(stOf(r).st));
  const chgPill = '<span class="chg-pill">바꾸는 중</span>';

  // 탭마다 한 번 비밀번호(L-1) → 열쇠는 메모리에만
  async function ensureKey() {
    if (S.cmdKey) return true;
    return false;
  }
  async function send(type, fields, o) {
    o = o || {};
    if (S.phase !== 'ready' || !S.box) return null;
    if (LOCAL_SRC || S.ro) { toast(lockWhy()); render(); return null; }
    if (!C.QUIET.includes(type) && openRecs().length >= C.OPEN_MAX) { toast('앱이 아직 앞 명령을 못 받았어요'); return null; }
    if (!(await ensureKey())) {
      S.pend = { type, fields, o };
      openDlg({ kind: 'pw' });
      return null;
    }
    let c;
    try { c = C.make(type, fields, now()); } catch { toast('보내지 못했어요 — 새로고침한 뒤 다시 해 주세요'); return null; }
    // 그냥 검색은 대기 1개: 앞 것이 아직 안 받혔으면 닫고 바꿔요(command-v1 8장)
    if (type === 'adhoc') {
      for (const r of S.sent) {
        if (r.type === 'adhoc' && r.n && stOf(r).st === 'sent') {
          const prevQ = (S.plain[r.id] || {}).q || '';
          await cancel(r, true);
          if (prevQ && prevQ !== fields.q) S.adhocSwap = `'${prevQ}' 검색을 '${fields.q}'로 바꿨어요`;
        }
      }
    }
    let box;
    try { box = await C.seal(c, S.cmdKey, S.box.salt, S.box.iter || BOX.ITER); } catch { toast('잠그지 못했어요 — 비밀번호를 다시 넣어 주세요'); S.cmdKey = null; return null; }
    const res = await C.createIssue({ repo: S.repo, token: S.token, body: JSON.stringify(box) });
    if (!res.ok) {
      if (res.why === 'readonly') { S.ro = true; const rt = LS.get(K_TOK); if (rt) LS.set(K_TOK, { ...rt, ro: true }); render(); return null; }
      if (res.why === 'token') { S.bundle = null; setPhase('token'); return null; }
      toast(res.why === 'rate' ? 'GitHub 요청 한도에 걸렸어요 — 몇 분 뒤 다시 해 주세요' : '보내지 못했어요 — 인터넷 연결을 확인해 주세요');
      return null;
    }
    const rec = C.slim(c, res.number);
    S.sent.push(rec); saveSent();
    S.lastSt[rec.id] = 'sent';
    const pl = {};
    for (const k of ['q', 'card', 'word', 'pid', 'key', 'set', 'base', 'variantPick', 'on', 'op', 'dir', 'ids', 'hours', 'everyMin', 'url', 'all']) if (c[k] !== undefined) pl[k] = c[k];
    S.plain[rec.id] = { type, ...pl }; savePlain();
    S.pollUntil = now() + C.POLL_FOR_MS;
    if (!o.quiet) render();
    return rec;
  }
  async function cancel(r, quiet) {
    if (!r || !r.n) return;
    const res = await C.closeIssue({ repo: S.repo, token: S.token, number: r.n });
    if (res.ok) { r.cancel = true; r.cancelSent = true; saveSent(); }
    else if (!quiet) toast('취소하지 못했어요 — 앱이 이미 받았을 수 있어요');
    if (!quiet) render();
  }
  async function retry(r) {
    const pl = S.plain[r.id];
    if (!pl) return;
    const { type, ...fields } = pl;
    S.dismissed[r.id] = true;
    await send(type, fields);
  }
  async function refreshIssues() {
    if (!S.token || LOCAL_SRC) return;
    const open = S.sent.filter((r) => r.n && !r.cancel && stOf(r).st === 'sent').slice(-10);
    await Promise.all(open.map(async (r) => {
      const g = await C.getIssue({ repo: S.repo, token: S.token, number: r.n });
      if (g.ok) S.iss[r.n] = { state: g.state, reason: g.reason };
    }));
  }
  // 묶음이 바뀐 뒤: 끝난 명령을 처음 본 때 · 토스트(디자인 결정 2 — 모으기 끝나면 토스트만)
  function afterBundle() {
    for (const r of S.sent) {
      const st = stOf(r).st;
      const was = S.lastSt[r.id];
      if (st === 'done' && !S.doneSeen[r.id]) S.doneSeen[r.id] = was ? now() : now() - C.DONE_FOLD_MS; // 처음 열 때 이미 끝난 것은 접어 둠
      if (was && was !== st && st === 'done' && (r.type === 'add' || r.type === 'saveAdhoc')) {
        const row = stOf(r).row;
        const p = row && row.pid ? prod(row.pid) : null;
        if (p && !confirmedOf(p)) toast(`${p.name} 을 모았어요 · 물건 정하기`, { label: '물건 정하기', run: () => openIdentify(p.id) });
      }
      S.lastSt[r.id] = st;
    }
  }

  /* =====================================================================
   * 머리 · 띠
   * ===================================================================== */
  function renderHead() {
    const el = $('#live');
    let dot = 'gray', long = '—', short = '—';
    if (S.phase === 'loading') { long = short = '불러오는 중…'; }
    else if (S.phase === 'ready') {
      const b = B(), st = live(), t = now();
      const when = `마지막 판정 ${clock(b.made, t)}(${ago(b.made, t)})`;
      const dev = esc(str(b.device) || '내 안드로이드');
      if (b.stall) { dot = 'coral'; long = `확인 멈춤 · ${when} · ${dev}`; short = '멈춤'; }
      else if (st.late) { long = `${when} · ${dev}`; short = esc(ago(b.made, t)); }
      else { dot = ''; long = `감시 중 · ${when} · ${dev}`; short = `감시 중 · ${esc(ago(b.made, t))}`; }
    }
    // 명령 알약(디자인 5-1 ①): 상한 > 못 함 > 하는 중 > 기다림
    let pill = '';
    if (S.phase === 'ready') {
      const rs = visRecs().map((r) => stOf(r).st);
      const open = openRecs().length;
      const bad = rs.filter(C.isBad).length, run = rs.filter((x) => x === 'running').length, wait = rs.filter((x) => x === 'sent').length;
      if (open >= C.OPEN_MAX) pill = `<button class="cmdpill bad" data-act="cmds">${ico('alert')}앱이 아직 앞 명령을 못 받았어요</button>`;
      else if (bad) pill = `<button class="cmdpill bad" data-act="cmds">${ico('alert')}못 한 명령 ${bad}개</button>`;
      else if (run) pill = `<button class="cmdpill run" data-act="cmds">${ico('refresh')}앱이 하는 중 ${run}개</button>`;
      else if (wait) pill = `<button class="cmdpill" data-act="cmds">${ico('clock')}명령 ${wait}개 기다리는 중</button>`;
    }
    $('#cmdPill').innerHTML = pill;
    el.innerHTML = `<span class="dot ${dot}" aria-hidden="true"></span><span class="sr">${dot === '' ? '감시 중' : dot === 'coral' ? '확인 멈춤' : '늦음'}</span><span class="live-long">${long}</span><span class="live-short">${short}</span>`;
    const ready = S.phase === 'ready';
    $('#tabs').hidden = !ready;
    const cur = S.tab === 'product' || S.tab === 'adhoc' ? 'home' : S.tab;
    document.querySelectorAll('.tab').forEach((x) => {
      if (x.dataset.go === cur) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current');
    });
    const unread = ready ? inboxUnread() : 0;
    $('#inboxCnt').hidden = !unread;
    $('#inboxCnt').textContent = unread > 99 ? '99+' : String(unread);
    $('#oldView').hidden = S.phase === 'lock' || S.phase === 'loading';
    const out = [];
    const ban = (title, sub, btn, cls, icon) => `<div class="banner ${cls || ''}" role="status">${ico(icon || 'alert')}<div><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>${btn || ''}</div>`;
    if (ready) {
      const b = B(), st = live(), t = now();
      const waiting = S.sent.filter((r) => !C.QUIET.includes(r.type) && stOf(r).st === 'sent');
      if (st.late) {
        if (waiting.length) {
          // 앱 꺼짐 띠(디자인 5-1): 늦음 띠와 합쳐 하나로
          const list = waiting.slice(-3).reverse().map((r) => `<li>${esc(whatOf(r))} · 보냄 · ${esc(ago(r.at, t))}</li>`).join('');
          out.push(`<div class="banner" role="status">${ico('alert')}<div><b>폰이 ${esc(RV.dur(st.age))}째 결과를 안 올렸어요</b><span>보낸 명령은 앱이 켜지면 처리해요${isIos() ? ' · 아이폰은 앱을 열면 처리해요' : ''}</span><ul>${list}</ul></div><button class="btn btn-text btn-sm" data-act="cmds">모두 보기</button></div>`);
        } else {
          const head = `폰이 ${clock(b.made, t)} 뒤로 결과를 올리지 않았어요(${ago(b.made, t)}). 아래는 그때 기준이에요.`;
          out.push(ban(esc(head), st.day ? '하루가 넘어 팔린 매물이 섞여 있을 수 있어요.' : '폰이 켜져 있는지, 앱의 결과 올리기가 켜져 있는지 확인해 주세요.'));
        }
      }
      if (S.ro) out.push(ban('지금 토큰은 읽기만 돼요', "웹에서 바꾸려면 '읽기 + 이슈 쓰기' 토큰으로 바꿔 주세요. 보기는 그대로 돼요.", '<button class="btn btn-sm" data-act="retok">토큰 바꾸기</button>', '', 'key'));
      if (b.cmdLock && b.cmdLock.until > t) out.push(ban('앱이 웹 명령 받기를 잠시 멈췄어요', esc(str(b.cmdLock.why) || '열 수 없는 명령이 많이 왔어요 — GitHub 에서 웹 토큰을 지우고 새로 만들어 주세요')));
      if (b.stall && typeof b.stall === 'object') out.push(ban(esc(b.stall.title), esc(b.stall.text)));
      if (b.notifOn === false) out.push(ban('폰 알림이 꺼져 있어요 — 꿀매가 떠도 폰이 울리지 않아요. 폰 설정에서 켜 주세요'));
      for (const m of arr(b.markets)) {
        if (m && m.bad) out.push(ban(esc(m.banner || `${MARKET[m.m] || ''} 확인이 막힌 것 같아요`), esc(m.text), '<button class="btn btn-sm" data-go="settings">수집 상태 보기</button>'));
      }
      const fp = b.focusPlan;
      if ((S.tab === 'home') && fp && arr(fp.ids).length && fp.until > t) {
        const names = arr(fp.ids).map((id) => (prod(id) || {}).name).filter(Boolean).join(' · ');
        out.push(ban(`집중 감시 중 · ${esc(names)}`, `${esc(fp.everyMin)}분마다 확인해요 · ${esc(clock(fp.until, t))}까지 · 누르면 설정`, '<button class="btn btn-text btn-sm" data-go="settings">설정</button>', 'brand', 'target'));
      }
    }
    $('#banners').innerHTML = out.join('');
  }

  /* =====================================================================
   * 홈 (C-1)
   * ===================================================================== */
  function recentList() {
    return arr(B() && B().recent).filter((q) => typeof q === 'string' && q.trim() && !S.recentHidden.has(q) && !S.recentHidden.has('*')).slice(0, 10);
  }
  function searchBlock(activeQ) {
    const t = now();
    const u = C.adhocUse(B(), S.sent, t);
    const cached = S.searchText.trim() && C.adhocCached(B(), S.searchText, t);
    const chips = recentList();
    return `<form class="searchrow" role="search" id="searchForm">
        <label class="search">${ico('search')}<span class="sr">세 마켓 한 번에 찾기</span><input type="search" id="q" autocomplete="off" placeholder="세 마켓 한 번에 찾기 (쉼표로 여러 표기)" value="${esc(S.searchText)}"></label>
        <button class="btn btn-fill" type="submit" id="qGo"${dis(!S.searchText.trim() || (u.full && !cached))}${locked() && !cached ? ` title="${esc(lockWhy())}"` : ''}>찾기</button>
      </form>
      <div class="recent">${chips.length ? '<span class="lbl">최근</span>' : ''}
        ${chips.map((c) => `<span class="rchip${c === activeQ ? ' on' : ''}"><button class="rq" data-act="recentGo" data-q="${esc(c)}">${esc(c)}</button><button class="x" data-act="recentDel" data-q="${esc(c)}" aria-label="'${esc(c)}' 검색 기록 지우기">${ico('x')}</button></span>`).join('')}
        ${chips.length ? `<button class="btn btn-text gray btn-sm" data-act="recentClear"${lk()}>지우기</button>` : ''}
        <span class="quota${u.full ? ' full' : ''}" id="quota">${u.full ? `1시간에 ${u.limit}번까지예요 — ${u.waitMin}분 뒤에` : `이번 1시간 ${u.used}/${u.limit}번`}</span>
      </div>
      <p class="under" id="qUnder"${cached ? '' : ' hidden'}>30분 안에 찾은 검색어라 모아 둔 결과로 바로 보여 드려요(횟수에 안 세요)</p>`;
  }
  function homeQueueText(p) {
    const hq = B() && B().homeQueue;
    if (!hq || !arr(hq.ids).includes(p.id)) return '';
    return `<p class="note brand">${ico('refresh')}새 동네로 다시 모으는 중 · ${esc(hq.done)}/${esc(hq.total)}</p>`;
  }
  function cardHTML(p, i, n) {
    const t = now();
    const removing = S.sent.find((r) => r.type === 'remove' && r.pid === p.id && ['sent', 'running', 'done'].includes(stOf(r).st));
    if (removing) {
      return `<article class="card ghost" aria-label="${esc(p.name)} 지우는 중"><div class="card-head"><span class="chip-name">${esc(p.name)}</span><span class="pill line">지우는 중</span></div>${cmdLine(removing) || '<div class="cmd" role="status">' + ico('clock') + '<span>지우는 중 · 보냈어요</span></div>'}</article>`;
    }
    const when = !(p.checkedAt > 0) ? '아직 확인 전' : late() ? `${clock(p.checkedAt, t)} 확인` : ago(p.checkedAt, t);
    const pend = pendingPid(p.id, ['edit', 'identify', 'unhideAll', 'excludeWord']);
    const head = `<div class="card-head">
      <span class="chip-name">${esc(p.name)}</span>
      ${Number.isFinite(p.pct) ? `<span class="pill">꿀매 -${esc(p.pct)}%</span>` : ''}${pend ? chgPill : ''}
      ${p.honey > 0 ? `<span class="pill honey">${ico('drop')}꿀매 ${esc(p.honey)}</span>` : ''}
      ${p.focus ? `<span class="pill brand" title="집중 감시 중">${ico('target')}<span class="sr">집중 감시 중</span></span>` : ''}
      <span class="when">${esc(when)} · ${esc(p.count || 0)}건</span>
      <button class="iconbtn" aria-haspopup="menu" aria-label="${esc(p.name)} 메뉴" data-act="menu" data-pid="${esc(p.id)}" data-i="${i}" data-n="${n}" id="menu-${esc(p.id)}">${ico('more')}</button></div>`;
    const rec = lastRec((r) => r.pid === p.id && ['edit', 'identify', 'check', 'move', 'unhideAll', 'excludeWord'].includes(r.type));
    let body = '';
    const low = (p.state === 'ok' || p.state === 'unknown') ? findL(p, p.lowKey) : null;
    if (p.state === 'allCaution') body = `<p class="state-text ink2">${esc(p.stateCard)}</p>`;
    else if (p.state === 'rebase') body = `<p class="state-text" style="color:var(--brand-bright)">${esc(p.stateCard)}</p>`;
    else if (!low) body = `<p class="state-text muted">${esc(p.stateCard || '조건에 맞는 매물이 없어요')}</p>`;
    else {
      body = `<div class="low" data-act="sheet" data-pid="${esc(p.id)}" data-key="${esc(low.key)}" tabindex="0" role="button" aria-label="지금 최저가 ${esc(low.title)} 판단 보기">${thumb(low)}<div style="min-width:0">
          <p class="ltitle">${esc(low.title)}</p>
          <div class="price-row"><span class="price">${esc(won(low.price))}</span>${badge(low.grade, true)}${p.change && !late() ? `<span class="chg ${p.change.dir === 'up' ? 'up' : 'down'}">${esc(p.change.text)}</span>` : ''}</div>
          <p class="meta" style="margin:2px 0 0">${esc(MARKET[low.m])} · ${esc(placeText(low.place))} · ${esc(ago(low.updated, t))}${soldMaybe()}</p>
        </div></div>
        ${arr(p.facts).length ? `<p class="facts">${facts(p.facts)}</p>` : ''}
        ${spark(p.spark, 28, 300) ? `<div style="height:28px">${spark(p.spark, 28, 300)}</div>` : ''}
        ${mlows(p.marketLows) ? `<div class="lines">${mlows(p.marketLows)}</div>` : ''}
        ${vlows(p.variantLows) ? `<div class="lines">${vlows(p.variantLows)}</div>` : ''}
        ${p.cautionCard ? `<button class="note link" data-act="jump" data-pid="${esc(p.id)}" data-key="${esc(p.cautionKey || '')}">${esc(p.cautionCard)}</button>` : ''}
        ${p.nearText ? `<p class="facts">${esc(p.nearText)}</p>` : ''}`;
    }
    const note = arr(p.notes)[0] ? `<p class="facts">${esc(p.notes[0])}</p>` : '';
    const idPill = !confirmedOf(p) ? `<button class="pill brand" data-act="identify" data-pid="${esc(p.id)}"${lk()}>물건 정하기</button>` : '<span></span>';
    return `<article class="card ${p.honey > 0 ? 'has-honey' : ''}" aria-label="${esc(p.name)}">${head}${cmdLine(rec, { label: true })}${homeQueueText(p)}${body}${note}
      <div class="card-foot">${idPill}<button class="btn btn-text btn-sm" data-open="${esc(p.id)}">결과 전체 보기 ›</button></div></article>`;
  }
  // 웹에서 추가했는데 앱이 아직 만들지 않은 물건 — 자리 카드(점선)
  function ghostCards() {
    return S.sent.filter((r) => r.type === 'add' && showRec(r)).map((r) => {
      const s = stOf(r);
      if (s.row && s.row.pid && prod(s.row.pid)) return '';
      if (C.isBad(s.st) || s.st === 'done') {
        if (s.st === 'done' && !(s.row && s.row.why)) return '';
      }
      const n = namesFor(r);
      const name = n.card || C.firstAlt(n.q) || '새 물건';
      return `<article class="card ghost" aria-label="${esc(name)} 추가 보냄"><div class="card-head"><span class="chip-name">${esc(name)}</span><span class="pill line">웹에서 추가</span></div>
        ${cmdLine(r)}<p class="facts">앱이 만들면 세 마켓을 모은 뒤 여기에 지금 최저가가 보여요</p></article>`;
    }).join('');
  }
  function renderHome() {
    const b = B(), t = now();
    const feed = arr(b.feed).map((f) => {
      const p = prod(f.pid), l = findL(p, f.key);
      if (!p || !l) return '';
      const fresh = f.fresh && !late();
      return `<div class="feed-row ${fresh ? 'fresh' : ''}" data-act="sheet" data-pid="${esc(p.id)}" data-key="${esc(l.key)}" tabindex="0" role="button">${thumb(l)}
        <div style="min-width:0"><div class="top-line"><span class="chip-name">${esc(p.name)}</span>${fresh ? '<span class="pill">새로</span>' : ''}<span class="meta">${esc(ago(f.at, t))}</span></div>
        <p class="ltitle" style="margin-top:6px;font-weight:600">${esc(l.title)}</p>
        <div class="price-row" style="margin-top:4px"><span class="price" style="font-size:1rem">${esc(won(l.price))}</span>${badge(l.grade, true)}</div>
        <p class="meta" style="margin:3px 0 0">${esc(l.grade ? l.grade.why : '')} · ${esc(MARKET[l.m])}</p></div></div>`;
    }).join('');
    const ps = prods();
    const ghosts = ghostCards();
    const wait = C.checkAllWait(b, S.sent, t);
    const allRec = lastRec((r) => r.type === 'check' && r.all);
    const cards = ps.length || ghosts ? `<div class="cards">${ps.map((p, i) => cardHTML(p, i, ps.length)).join('')}${ghosts}</div>`
      : `<div class="empty-home"><h2 class="sec-title">지켜볼 물건이 아직 없어요</h2><p class="sec-sub">물건을 추가하면 레이더가 세 마켓의 최저가를 계속 지켜보다가 진짜 꿀매가 뜨면 알려 드려요.</p>
         <button class="btn btn-fill" data-act="add"${lk()}>${ico('plus')}물건 추가하기</button></div>`;
    return `${searchBlock('')}
      <div class="home ${day() ? 'stale-day' : ''}">
      <section aria-labelledby="hTitle">
        <div class="home-head"><div class="grow"><h1 class="sec-title" id="hTitle">${late() ? '그때 최저가' : '지금 최저가'}</h1>
        <p class="sec-sub">같은 물건 · 3사 최저가 · 뜨면 바로</p></div>
        <button class="btn" data-act="checkAll"${locked() || wait > 0 ? ` disabled title="${esc(wait > 0 ? `${wait}분 뒤에 다시 할 수 있어요` : lockWhy())}"` : ''}>${ico('refresh')}지금 모두 확인</button>
        <button class="btn btn-fill" data-act="add"${lk()}>${ico('plus')}물건</button></div>
        ${wait > 0 ? `<p class="under" style="text-align:right">${esc(wait)}분 뒤에 다시 할 수 있어요</p>` : ''}
        ${allRec ? cmdLine(allRec, { boxed: true, label: true }) : ''}
        ${cards}
      </section>
      <aside aria-labelledby="fTitle">
        <h2 class="sec-title" id="fTitle">새로 뜬 꿀매</h2>
        <p class="sec-sub" style="margin-bottom:12px">꿀매 기준을 넘은 매물이 처음 보인 순서예요(3일)</p>
        <div class="feed">${feed || '<p class="muted">아직 새 꿀매가 없어요. 레이더가 계속 지켜보고 있어요.</p>'}</div>
      </aside></div>`;
  }

  /* =====================================================================
   * 결과 화면 공통 (C-2 · C-3)
   * ===================================================================== */
  const AREA_LABEL = { all: '전체', near: '가까운 동네만', 3: '3km 안', 5: '5km 안', 10: '10km 안', 20: '20km 안' };
  const SORT_LABEL = { low: '싼 순', seen: '처음 본 순', near: '가까운 순' };
  function variantFor(id) {
    if (S.vpid !== id) { S.vpid = id; S.variant = ''; S.cond = ''; S.mkSel = ''; S.allDaangn = false; }
    return S.variant;
  }
  const mkObj = () => (S.mkSel ? { j: S.mkSel === 'j', d: S.mkSel === 'd', b: S.mkSel === 'b' } : { j: true, d: true, b: true });
  function visibleRows(list, id) {
    const b = B();
    return RV.filterListings(list, { mk: mkObj(), area: b.base ? S.area : 'all', withUnknown: S.withUnknown, q: S.q, sort: S.sort, variant: variantFor(id), cond: S.cond });
  }
  function marketChips() {
    return `<div class="chiprow" role="radiogroup" aria-label="마켓"><button class="mchip all" role="radio" aria-checked="${!S.mkSel}" data-act="mk" data-m="">전체</button>${['j', 'd', 'b'].map((m) => `<button class="mchip ${m}" role="radio" aria-checked="${S.mkSel === m}" data-act="mk" data-m="${m}"><span class="mk mk-${m}" aria-hidden="true">${MARK[m]}</span>${MARKET[m]}</button>`).join('')}</div>`;
  }
  function chipRows(all, f) {
    const vchips = RV.variantChips(all);
    const anyNew = all.some((l) => l && l.unopened);
    let out = '';
    if (vchips.length >= 2 || anyNew) {
      out += `<div class="chiprow">${vchips.length >= 2 ? vchips.map((v) => `<button class="cchip" aria-pressed="${v === f.variant}" data-act="variant" data-v="${esc(v)}">${esc(v)}</button>`).join('') + '<span class="gap"></span>' : ''}
        <button class="cchip" aria-pressed="${S.cond === 'new'}" data-act="cond" data-c="new">미개봉</button><button class="cchip" aria-pressed="${S.cond === 'used'}" data-act="cond" data-c="used">중고</button></div>`;
    }
    if (B().base) {
      out += `<div class="chiprow" role="radiogroup" aria-label="지역">${RV.AREAS.map((a) => `<button class="cchip" role="radio" aria-checked="${S.area === a}" data-act="area" data-a="${a}">${AREA_LABEL[a]}</button>`).join('')}
        ${S.area !== 'all' ? `<span class="gap"></span><button class="cchip" aria-pressed="${S.withUnknown}" data-act="withUnknown">지역 모르는 매물도 함께 보기</button>` : ''}</div>`;
    } else if (all.some((l) => l && l.m === 'j')) {
      out += '<p class="info">설정에서 내 동네를 정하면 가까운 중고나라 매물을 볼 수 있어요</p>';
    }
    return out;
  }
  function toolsRight(ns) {
    return `<span class="webonly">웹만</span><label class="sel"><span class="sr">정렬</span><select id="fSort">${['low', 'seen', 'near'].map((s) => `<option value="${s}"${S.sort === s ? ' selected' : ''}>${SORT_LABEL[s]}</option>`).join('')}</select></label>
      <label class="sr" for="fQ">결과 안에서 찾기</label><input class="find" id="fQ" type="search" placeholder="결과 안에서 찾기" value="${esc(S.q)}"><button class="btn btn-sm" data-act="csv" data-ns="${esc(ns)}">CSV</button>`;
  }
  // 매물 줄(웹 2판 줄 + ☆·아님 단추) — 줄 누름 = 판단 창, ↗ = 원 매물
  function rowHTML(l, ctx) {
    const t = now(), g = l.grade, p = ctx.p;
    const hideRec = p ? lastHide(p.id, l.key) : null;
    if (hideRec) {
      const st = stOf(hideRec).st;
      if (hideRec.type === 'hide' && st !== 'failed' && st !== 'stale' && st !== 'conflict') {
        return `<li class="folded" role="status">이 매물은 빼고 볼게요${st === 'sent' ? '<span class="muted"> · 보냈어요</span>' : st === 'running' ? '<span class="muted"> · 앱이 하는 중</span>' : ''}<button class="btn btn-text" data-act="unhideRow" data-id="${esc(hideRec.id)}" data-pid="${esc(p.id)}" data-key="${esc(l.key)}"${lk()}>되돌리기</button></li>`;
      }
    }
    const unhiding = p && S.sent.some((r) => r.type === 'unhide' && r.pid === p.id && r.key === l.key && C.isOpen(stOf(r).st));
    const sub = g && g.k === 'caution' ? `<p class="rs why">${esc(g.why)}</p>`
      : `<p class="rs">${[g ? g.why : (p && p.state === 'rebase' && p.cut && p.cut.rebase) || '', l.news, l.dups > 0 ? `같은 글 ${l.dups}건` : '', ctx.vtag && l.variant && l.variant !== ctx.base ? `변형 ${l.variant}` : ''].filter(Boolean).map(esc).join(' · ')}</p>`;
    const where = placeText(l.place);
    const unknown = RV.isUnknown(l.place);
    const sub2 = ctx.sub2 || sub;
    const bdg = ctx.ended ? '<span class="badge b-plain">끝남</span>' : badge(g, false);
    const starOn = !!(l.star || ctx.star);
    const starPend = S.sent.some((r) => r.type === 'star' && r.key === l.key && C.isOpen(stOf(r).st));
    const actions = ctx.noActs ? '' : `<span class="ra">
        <button class="iconbtn ${starPend ? 'pending' : starOn ? 'on' : ''}" data-act="star" data-key="${esc(l.key)}" data-pid="${esc(p ? p.id : '')}" data-on="${starOn ? 0 : 1}" aria-pressed="${starOn}" aria-label="${esc(l.title)} ${starOn ? '지켜보는 중' : '지켜보기'}"${lk()}>${ico('star', starOn && !starPend ? 'fill' : '')}</button>
        ${p ? `<button class="notbtn" data-act="hide" data-key="${esc(l.key)}" data-pid="${esc(p.id)}" aria-label="${esc(l.title)} 이 매물 아님"${lk()}>${ico('eyeoff')}아님</button>` : ''}
        <a class="iconbtn" ${ext(l)} aria-label="${esc(l.title)} 원 매물 새 창에서 열기" data-act="opened" data-key="${esc(l.key)}" data-pid="${esc(p ? p.id : '')}">${ico('ext')}</a></span>`;
    return `<li class="row" id="r-${esc(l.key)}" tabindex="0" data-act="sheet" data-key="${esc(l.key)}" data-pid="${esc(p ? p.id : '')}" data-adhoc="${ctx.adhoc ? 1 : ''}">
      ${thumb(l, 'sm')}
      <div class="rmain" style="min-width:0"><p class="rt"${ctx.ended ? ' style="color:var(--ink3)"' : ''}>${starOn ? ico('star', 'fill') + '<span class="sr">관심 매물 </span>' : ''}${esc(l.title)}</p>${unhiding ? '<p class="rs">되돌리는 중 · 다음 확인 뒤 다시 보여요</p>' : sub2}
        <div class="compact"><span class="rp2">${esc(won(l.price))}</span>${bdg}<span class="meta">${esc(MARKET[l.m])} · ${esc(where)} · ${esc(ago(l.firstSeen, t))}${soldMaybe()}</span></div></div>
      <span class="rb">${bdg}</span>
      <span class="rp">${esc(won(l.price))}</span>
      <span class="rm">${mkMark(l.m, true)}${esc(MARKET[l.m])}</span>
      <span class="rw ${unknown ? 'unknown' : ''}" ${l.place && l.place.rough && !unknown ? 'title="판매 동네 가운데까지 어림 거리예요"' : ''}>${esc(where)}</span>
      <span class="rn">${esc(ago(l.firstSeen, t))}</span>
      ${actions}
    </li>`;
  }
  function lastHide(pid, key) {
    for (let i = S.sent.length - 1; i >= 0; i--) {
      const r = S.sent[i];
      if (r.pid === pid && r.key === key && (r.type === 'hide' || r.type === 'unhide')) {
        if (r.type === 'unhide') return null;
        if (stOf(r).st === 'cancel') return null;
        return r;
      }
    }
    return null;
  }
  function heroBox(x, low, label, cautionLine, cautionKey) {
    const t = now(), p = x.p;
    const isLowKey = !!low && p && low.key === p.lowKey;
    const target = isLowKey ? arr(p.facts).find((f) => f && f.icon === 'target') : null;
    const starOn = !!low.star;
    const starPend = S.sent.some((r) => r.type === 'star' && r.key === low.key && C.isOpen(stOf(r).st));
    const pend = p && (pendingPid(p.id, ['edit', 'identify', 'unhideAll', 'excludeWord']) || S.sent.some((r) => r.type === 'hide' && r.pid === p.id && C.isOpen(stOf(r).st)));
    const bar = C.priceBar(low.price, low.grade && low.grade.ref);
    const rbar = bar ? `<div class="rbar" role="img" aria-label="시세 막대: 이 매물 ${esc(man(low.price))}, 시세의 절반 ${esc(man(bar.lo))}, ${esc(bar.label)} 시세 ${esc(man(bar.med))}">
        <span class="tick" style="left:0%">시세의 절반 ${esc(won(bar.lo))}</span><span class="tick" style="left:${(bar.medFrac * 100).toFixed(1)}%">${esc(bar.label)} 시세 ${esc(won(bar.med))}</span><span class="me" style="left:${(bar.item * 100).toFixed(1)}%"></span></div>` : '';
    return `${cautionLine ? `<button class="note link" style="margin:0 0 8px" data-act="jump" data-pid="${esc(p ? p.id : '')}" data-key="${esc(cautionKey || '')}">${esc(cautionLine)}</button>` : ''}
      <section class="box" aria-label="${esc(label)}"><p class="box-label">${esc(label)}${pend ? chgPill : ''}</p>
      <div class="hero">${thumb(low, 'lg')}<div style="min-width:0" data-act="sheet" data-key="${esc(low.key)}" data-pid="${esc(p ? p.id : '')}" data-adhoc="${x.adhoc ? 1 : ''}" class="hclick">
          <p class="ltitle">${esc(low.title)}</p>
          <div class="price-row" style="margin-top:6px"><span class="price">${esc(won(low.price))}</span>${badge(low.grade, false)}${isLowKey && p.change && !late() ? `<span class="chg ${p.change.dir === 'up' ? 'up' : 'down'}">${esc(p.change.text)}</span>` : ''}</div>
          <p class="meta" style="margin:4px 0 0">${esc(MARKET[low.m])} · ${esc(placeText(low.place))} · 올린 때 ${esc(ago(low.updated, t))} · 처음 본 때 ${esc(ago(low.firstSeen, t))}</p>
          ${low.grade && low.grade.why ? `<p class="note" style="margin-top:8px">${esc(low.grade.why)}</p>` : ''}
          ${target ? `<p class="note">${ico('target')}${esc(target.t)}</p>` : ''}
          ${rbar}
        </div>
        <div class="hstar"><button class="iconbtn ${starPend ? 'pending' : starOn ? 'on' : ''}" data-act="star" data-key="${esc(low.key)}" data-pid="${esc(p ? p.id : '')}" data-on="${starOn ? 0 : 1}" aria-pressed="${starOn}" aria-label="${starOn ? '지켜보는 중' : '지켜보기'}"${lk()}>${ico('star', starOn && !starPend ? 'fill' : '')}</button></div></div>
      <div class="hero-bottom"><span class="meta">${day() ? '<span class="sold-maybe">하루가 넘었어요 — 팔렸을 수 있어요</span>' : '원 매물에서 사요 — 거래는 마켓 앱에서'}</span>
        <a class="btn btn-sm" ${ext(low)} data-act="opened" data-key="${esc(low.key)}" data-pid="${esc(p ? p.id : '')}">원 매물 열기 ${ico('ext')}<span class="sr">새 창에서 열려요</span></a></div></section>`;
  }
  // x = { id, p(저장한 물건)|null, a(그냥 검색)|null, name, src(물건 꼴) }
  function listTab(x) {
    const src = x.src, all = listOf(src), b = B();
    const f = visibleRows(all, x.id);
    const label = late() ? '그때 최저가' : '지금 최저가';
    const chipped = !!S.mkSel || !!f.variant || f.area !== 'all' || !!f.cond;
    const picked = chipped && src.state !== 'rebase' && src.state !== 'pending'
      ? RV.screenHero(f.heroRows, { name: x.name, chip: f.variant, base: src.baseVariant, market: S.mkSel })
      : null;
    const low = picked ? picked.hero : (src.state === 'ok' || src.state === 'unknown') ? findL(src, src.lowKey) : null;
    const cautionLine = picked ? picked.line : src.cautionPage;
    const cautionKey = picked ? picked.cautionKey : src.cautionKey;
    let hero;
    if (low) hero = heroBox(x, low, label, cautionLine, cautionKey);
    else if (picked) hero = `<section class="box"><p class="box-label">${label}</p>${picked.line ? `<p class="note" style="font-size:.9375rem">${esc(picked.line)}</p>` : `<p class="muted" style="margin:0">${esc(f.heroRows.length ? '믿을 만한 매물이 아직 없어요' : '조건에 맞는 매물이 없어요.')}</p>`}</section>`;
    else if (src.state === 'allCaution') hero = `<section class="box"><p class="box-label">${label}</p><p class="note" style="font-size:.9375rem">${esc(src.statePage)}</p></section>`;
    else if (src.state === 'rebase') hero = `<p class="info brand">${esc(src.statePage)}</p>`;
    else hero = `<section class="box"><p class="box-label">${label}</p><p class="muted" style="margin:0">${esc(src.statePage || '조건에 맞는 매물이 없어요.')}</p></section>`;

    const p = x.p, cfg = p && p.cfg;
    const dropped = (x.p || x.a || {}).dropped || {};
    const areaOn = b.base && f.area !== 'all';
    const lines = [];
    // 그냥 검색 당근 근처 줄(앱 CardCore.daangnNearLine)
    if (x.a && x.a.nearby && x.a.nearby.total > x.a.nearby.near) {
      const nb = x.a.nearby;
      lines.push(`<button class="info brand link" data-act="allDaangn">${S.allDaangn ? `당근 ${esc(nb.total)}건 모두 보는 중 · 근처만 보기` : `당근 ${esc(nb.total)}건 중 내 동네 근처 ${esc(nb.near)}건만 보여요 · 전체 보기`}</button>`);
    }
    if (x.a && x.a.ask) lines.push(`<p class="info">이 검색은 ${esc(x.a.ask.v)} 매물이 훨씬 많아요(${esc(x.a.ask.n)}건 · 기본 ${esc(x.a.ask.b)}건) · ${esc(x.a.ask.v)} 칩을 누르면 ${esc(x.a.ask.v)} 최저가를 봐요</p>`);
    if (f.hiddenUnknown) lines.push(`<p class="info">지역 모름 ${esc(f.hiddenUnknown)}건은 숨겼어요 — '지역 모르는 매물도 함께 보기'를 켜면 보여요</p>`);
    let right;
    if (x.a) right = `<button class="btn btn-text btn-sm" data-act="saveAdhoc"${lk()}>+ 지켜보기</button>`;
    else if (p && confirmedOf(p)) right = `<button class="btn btn-text btn-sm" data-act="identify" data-pid="${esc(p.id)}"${lk()}>물건 다시 정하기</button>`;
    else right = '<span class="muted" style="font-size:.75rem">레이더가 지켜보는 중</span>';
    const sumN = `${f.variant ? esc(f.variant) + ' ' : ''}매물 ${f.rows.length}건 · ${SORT_LABEL[S.sort] || '싼 순'}${areaOn ? ` <span class="muted">· ${AREA_LABEL[f.area]}${S.withUnknown && f.unknown ? `(지역 모름 ${f.unknown}건 포함)` : ''} · 기준 ${esc(b.base)}</span>` : ''}`;
    const sum = `<div class="sumline" role="status"><span class="n">${sumN}</span><span class="right">${right}${toolsRight(x.id)}</span></div>`;
    const band = p && !confirmedOf(p) ? `<div class="idband" data-act="identify" data-pid="${esc(p.id)}" role="button" tabindex="0"><div><b>어떤 물건인지 정해 주세요</b><span>다른 물건이 섞이면 최저가·시세가 틀려요</span></div><span class="go">물건 정하기 ›</span></div>` : '';
    // 검색어 확인·기본 거르기 줄(앱 MatchLine·BasicLine) — 저장한 물건은 단추가 조건 고치기 명령
    const info2 = [];
    const mm = cfg ? cfg.matchMode : 'title';
    const pendMatch = p && S.sent.some((r) => r.type === 'edit' && r.pid === p.id && arr(r.fields).includes('matchMode') && C.isOpen(stOf(r).st));
    const pendBasic = p && S.sent.some((r) => r.type === 'edit' && r.pid === p.id && arr(r.fields).includes('basicFilter') && C.isOpen(stOf(r).st));
    if (mm !== 'content' && dropped.match > 0) info2.push(`<p class="info">제목이 검색어와 맞지 않는 ${esc(dropped.match)}건은 뺐어요${p ? (pendMatch ? chgPill : `<button class="btn btn-text" data-act="matchMode" data-pid="${esc(p.id)}" data-v="content"${lk()}>내용까지 보기</button>`) : ''}</p>`);
    else if (mm === 'content') info2.push(`<p class="info">당근 설명·사이트 검색 결과까지 보는 중${p ? (pendMatch ? chgPill : `<button class="btn btn-text" data-act="matchMode" data-pid="${esc(p.id)}" data-v="title"${lk()}>제목만</button>`) : ''}</p>`);
    const bf = cfg ? cfg.basicFilter !== false : true;
    if (bf && dropped.basic > 0) info2.push(`<p class="info">고장·부품용·박스만·대여 글 ${esc(dropped.basic)}건은 뺐어요${p ? (pendBasic ? chgPill : `<button class="btn btn-text" data-act="basic" data-pid="${esc(p.id)}" data-v="0"${lk()}>보이기</button>`) : ''}</p>`);
    else if (!bf) info2.push(`<p class="info">고장·부품용·박스만·대여 글도 보는 중${p ? (pendBasic ? chgPill : `<button class="btn btn-text" data-act="basic" data-pid="${esc(p.id)}" data-v="1"${lk()}>다시 빼기</button>`) : ''}</p>`);
    const conds = arr(src.conds).length ? `<ul class="conds" aria-label="조건 요약">${src.conds.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '';
    const merged = Number(src.merged) > 0 ? `<p class="info">같은 글 ${esc(src.merged)}건을 한 줄로 묶었어요(여러 마켓·다시 올린 글)</p>` : '';
    const ledger = arr(src.ledger).length || arr(src.notes).length ? `<div class="ledger">${arr(src.ledger).map((l) => `<p class="note">${esc(l)}</p>`).join('')}${arr(src.notes).map((n) => `<p class="meta">${esc(n)}</p>`).join('')}</div>` : '';
    const rowsShown = low ? f.rows.filter((l) => l.key !== low.key) : f.rows;
    const ctx = { p: x.p, adhoc: !!x.a, base: src.baseVariant || '기본', vtag: true };
    const rows = f.rows.length ? `<ul class="rows" style="margin-top:16px">${rowsShown.map((l) => rowHTML(l, ctx)).join('')}</ul>`
      : (all.length ? `<p class="empty">거르기에 맞는 매물이 없어요 — <button class="btn btn-text" data-act="clearF">거르기 풀기</button></p>` : `<p class="empty">${esc(src.statePage || '조건에 맞는 매물이 없어요.')}</p>`);
    return `${marketChips()}${chipRows(all, f)}${lines.join('')}${sum}${band}${info2.join('')}${conds}${merged}${ledger}${hero}${rows}
      <p class="foot-hint">줄 끝 ☆ 로 지켜보기 · '아님'으로 이 매물 빼기</p>
      <p class="foot">거리: 당근은 거래 위치까지, 중고나라는 판매 동네 가운데까지 어림(≈)이에요. 번개장터는 지금 동네를 몰라 '지역 모름'이에요.</p>`;
  }
  function priceTab(x) {
    const src = x.src;
    const c = src.cut || {};
    let cut = '';
    if (c.rebase) cut = `<p class="ref-big">${esc(c.rebase)}</p>`;
    else if (Array.isArray(c.rows)) cut = `<p class="ref-big">${esc(c.head)}</p>${c.rows.map((r) => `<div class="vcut ${r.hold ? 'hold' : ''}"><b>${esc(r.name)}</b><span>${esc(r.text)}</span></div>`).join('')}`;
    else if (Array.isArray(c.single)) cut = `<p class="ref-big">${esc(c.single[0])}</p>${c.single[1] ? `<p class="meta" style="margin:3px 0 0;color:var(--ink2)">${esc(c.single[1])}</p>` : ''}`;
    const sp = spark(src.spark, 120, 800);
    const judge = `<section class="box"><p class="box-label">꿀매 판정 기준</p>${cut}
      <p class="hint">기준가 순서: 판매완료(중고나라 90일) → 사라진 매물 → 30일 관측 → 지금 올라온 가격 · 5건 이상일 때만 써요</p>
      ${sp ? `<p class="box-label plain" style="margin-top:12px">최근 30일 최저가</p><div class="trend">${sp}</div><p class="meta" style="margin:4px 0 0">${esc(src.min30)}</p>` : (x.p && src.state !== 'empty' && src.state !== 'pending' ? '<p class="meta" style="margin:10px 0 0">추이 선은 하루 넘게 지켜본 뒤부터 그려요</p>' : '')}</section>`;
    const f = visibleRows(listOf(src), x.id);
    const s = C.priceStats(f.rows);
    if (!s) return `${judge}<p class="empty">시세를 내기엔 매물이 적어요. 검색 결과가 4건 이상일 때 분포를 보여드려요.</p>`;
    const pos = (v) => Math.min(100, Math.max(0, v / s.max * 100)).toFixed(1);
    const dist = s.dists.map((d) => `<div class="drow"><span class="lab">${mkMark(d.m)}${esc(d.count)}건</span><div class="dtrack"><span class="q" style="left:${pos(d.q1)}%;width:${(pos(d.q3) - pos(d.q1)).toFixed(1)}%"></span><span class="md" style="left:${pos(d.median)}%"></span>${d.dots.map((v) => `<span class="pt" style="left:${pos(v)}%;background:var(--mk-${d.m})"></span>`).join('')}</div></div>`).join('');
    return `${judge}
      <div class="sum3"><div class="box"><p class="box-label">시세 · 보통(중간값)</p><p class="big">${esc(won(s.median))}</p><p class="hint">매물 절반이 ${esc(man(s.q1))}–${esc(man(s.q3))} 사이 · ${esc(s.count)}건 기준</p></div>
        <div class="box"><p class="box-label plain">최저가</p><p class="big">${esc(won(s.minL && s.minL.price))}</p><p class="hint">${esc(MARKET[s.minL && s.minL.m] || '')}</p></div>
        <div class="box"><p class="box-label plain">가장 비싼 매물</p><p class="big">${esc(won(s.maxL && s.maxL.price))}</p><p class="hint">${esc(MARKET[s.maxL && s.maxL.m] || '')}</p></div></div>
      <section class="box" style="margin-top:12px"><p class="box-label">마켓별 분포</p><div class="dist">${dist}</div>
        <div class="axis"><span>0</span><span>${esc(man(Math.round(s.max / 2)))}</span><span>${esc(man(s.max))}</span></div>
        <p class="hint">점 하나가 매물 하나예요. 굵은 선은 마켓별 중앙값, 옅은 띠는 매물 절반이 몰린 가격대예요. 너무 비싼 매물은 그래프에서 뺐어요.</p></section>`;
  }

  /* ---------- 저장한 물건 결과 화면 ---------- */
  function renderProduct() {
    const p = prod(S.pid) || prods()[0];
    if (!p) return renderHome();
    S.pid = p.id;
    const t = now();
    const side = prods().map((q) => {
      let s = '';
      const lq = findL(q, q.lowKey);
      if ((q.state === 'ok' || q.state === 'unknown') && lq) s = man(lq.price) || '가격문의';
      else if (q.state === 'allCaution') s = '⚠ ' + (q.caution || listOf(q).length);
      else if (q.state === 'rebase') s = '다시 내는 중';
      else if (q.state === 'pending') s = '확인 전';
      else s = '없음';
      return `<button data-pick="${esc(q.id)}" aria-current="${q.id === p.id}">
        <span class="pn">${esc(q.name)}</span>
        <span class="ph">${q.honey > 0 ? `<span class="pill honey">${ico('drop')}${esc(q.honey)}</span>` : ''}</span>
        <span class="ps">${esc(s)}<span class="pm"> · ${esc(q.checkedAt > 0 ? ago(q.checkedAt, t) : '아직 확인 전')}${confirmedOf(q) ? '' : ' · 미확정'}</span></span></button>`;
    }).join('');
    const x = { id: p.id, p, a: null, name: p.name, src: p };
    const rec = lastRec((r) => r.pid === p.id && ['edit', 'identify', 'check', 'unhideAll', 'excludeWord', 'move'].includes(r.type));
    let conflictBox = '';
    if (rec && stOf(rec).st === 'conflict') {
      const row = stOf(rec).row || {};
      const cf = row.conflict || {};
      const now1 = Object.keys(cf).map((k) => `${C.FIELD_LABEL[k] || k}${cfVal(k, cf[k])}`).join(' · ');
      conflictBox = now1 ? `<p class="info" style="color:var(--ink2)">지금 앱 값: ${esc(now1)}</p>` : '';
    }
    const ptab = S.ptab === 'price' ? 'price' : 'list';
    return `<div class="pv ${day() ? 'stale-day' : ''}">
      <nav class="plist" aria-label="물건 목록">${side}</nav>
      <section style="min-width:0">
        ${cmdLine(rec, { boxed: true, label: true })}${conflictBox}
        <div class="pv-head"><h1>${esc(p.name)}</h1>${p.honey > 0 ? `<span class="pill honey">${ico('drop')}꿀매 ${esc(p.honey)}</span>` : ''}
          <div class="acts"><button class="btn btn-sm" data-act="edit" data-pid="${esc(p.id)}"${lk() || (p.cfg ? '' : ' disabled title="앱이 조건 값을 올린 뒤에 바꿀 수 있어요"')}>조건</button>
            <button class="btn btn-sm" data-act="check" data-pid="${esc(p.id)}"${lk()}>${ico('refresh')}지금 확인</button>
            <button class="iconbtn" aria-haspopup="menu" aria-label="${esc(p.name)} 메뉴" data-act="menu" data-pid="${esc(p.id)}" id="menu-p-${esc(p.id)}">${ico('more')}</button></div></div>
        <div class="subtabs" role="tablist"><button role="tab" aria-selected="${ptab === 'list'}" data-act="ptab" data-t="list">목록</button><button role="tab" aria-selected="${ptab === 'price'}" data-act="ptab" data-t="price">시세</button></div>
        ${ptab === 'price' ? priceTab(x) : listTab(x)}
      </section></div>`;
  }
  const cfVal = (k, v) => {
    if (v == null || v === '') return ' 없음';
    if (['targetPrice', 'bandMin', 'bandMax', 'priceMin', 'priceMax'].includes(k) && Number.isFinite(v)) return ` ${man(v)}`;
    if (k === 'thresholdPct' || k === 'defaultPct') return ` -${v}%`;
    if (Array.isArray(v)) return ` ${v.join(', ') || '없음'}`;
    if (typeof v === 'boolean') return v ? ' 켬' : ' 끔';
    if (typeof v === 'object') return v.on ? ` ${v.start}~${v.end}시` : ' 끔';
    return ` ${v}`;
  };

  /* ---------- 그냥 검색 결과 화면 (C-3) ---------- */
  function adhocEntry() {
    const q = S.adhocQ;
    const t = now();
    const rec = lastAdhocRec(q);
    const all = arr(B() && B().adhoc);
    if (rec) { const byCmd = all.find((a) => a && a.cmd === rec.id); if (byCmd) return byCmd; }
    const n = C.norm(q);
    return all.find((a) => a && C.norm(a.q) === n && (!rec || a.at >= rec.at - C.ADHOC_CACHE_MS) && (rec || t - a.at <= C.ADHOC_CACHE_MS * 2)) || null;
  }
  function lastAdhocRec(q) {
    for (let i = S.sent.length - 1; i >= 0; i--) {
      const r = S.sent[i];
      if (r.type === 'adhoc' && (S.plain[r.id] || {}).q === q && stOf(r).st !== 'cancel') return r;
    }
    return null;
  }
  function renderAdhoc() {
    const q = S.adhocQ;
    const rec = lastAdhocRec(q);
    const a = adhocEntry();
    const st = rec ? stOf(rec).st : '';
    let body;
    const waiting = rec && (st === 'sent' || st === 'running' || (st === 'done' && !a));
    if (rec && (waiting || C.isBad(st)) && !(a && a.cmd === rec.id)) {
      const n = st === 'running' ? 3 : st === 'done' ? 4 : S.iss[rec.n] && S.iss[rec.n].state === 'closed' ? 3 : 2;
      const labels = ['보냈어요', '앱이 받음', '세 마켓에서 모으는 중', '결과'];
      const L = C.lineOf(rec, stOf(rec), {});
      body = `<div class="steps" role="status" aria-label="그냥 검색 진행">${labels.map((l, i) => {
          const k = i + 1; const cls = C.isBad(st) ? (k === 1 ? 'done' : '') : k < n ? 'done' : k === n ? 'now' : '';
          return `<span class="step ${cls}"><span class="n">${cls === 'done' ? ico('check') : k}</span>${l}</span>`;
        }).join('')}
        <div class="steps-foot">${C.isBad(st) ? `<span class="cmd bad" role="alert" style="min-height:0"><b>${esc(L.lead)}</b>&nbsp;— ${esc(L.text)}</span>` : `<span>앱이 앞에 있으면 1~2분, 백그라운드면 15분쯤 걸려요${isIos() ? ' · 아이폰은 앱을 열면 처리해요' : ''}${late() ? ' · 폰이 결과를 한동안 안 올렸어요 — 켜지면 처리해요' : ''}</span>`}
          ${st === 'sent' ? `<button class="btn btn-text gray btn-sm" data-act="cancel" data-id="${esc(rec.id)}">취소</button>` : ''}${C.isBad(st) && S.plain[rec.id] ? `<button class="btn btn-text btn-sm" data-act="retry" data-id="${esc(rec.id)}">다시 보내기</button>` : ''}</div></div>
        ${S.adhocSwap ? `<p class="info" style="margin-top:10px">${esc(S.adhocSwap)}</p>` : ''}
        <div class="skels">${'<div class="skel" style="height:64px"></div>'.repeat(4)}</div>`;
    } else if (a) {
      const t = now();
      const agoT = ago(a.at, t);
      const x = { id: 'adhoc:' + C.norm(q), p: null, a, name: q, src: a };
      body = `<p class="info">${agoT === '방금' ? '방금 모아 둔 결과예요' : `${esc(agoT)}에 모아 둔 결과예요`}<button class="btn btn-text" data-act="adhocAgain"${lk() || dis(C.adhocUse(B(), S.sent, t).full)}>다시 모으기</button></p>
        ${cmdLine(lastRec((r) => r.type === 'saveAdhoc' && (S.plain[r.id] || {}).q === q), { boxed: true, label: true })}
        ${saveAdhocDone(q)}
        <div class="subtabs" role="tablist"><button role="tab" aria-selected="${S.ptab !== 'price'}" data-act="ptab" data-t="list">목록</button><button role="tab" aria-selected="${S.ptab === 'price'}" data-act="ptab" data-t="price">시세</button></div>
        ${S.ptab === 'price' ? priceTab(x) : listTab(x)}`;
    } else {
      body = `<p class="empty">아직 결과가 없어요 — 위에서 다시 찾아 주세요.</p>`;
    }
    return `${searchBlock(q)}<div class="pv solo" style="margin-top:18px"><section style="min-width:0">
      <div class="pv-head"><button class="back" data-go="home">${ico('left')}홈</button><h1>'${esc(q)}'</h1><span class="meta">그냥 검색 · 저장 안 함</span></div>
      <div style="height:12px"></div>${body}</section></div>`;
  }
  function saveAdhocDone(q) {
    const r = lastRec((x) => x.type === 'saveAdhoc' && (S.plain[x.id] || {}).q === q && stOf(x).st === 'done');
    if (!r) return '';
    const row = stOf(r).row || {};
    const p = row.pid ? prod(row.pid) : null;
    return p ? `<p class="info brand">홈에 ${esc(p.name)} 카드가 생겼어요${!confirmedOf(p) ? ` · <button class="btn btn-text" data-act="identify" data-pid="${esc(p.id)}">물건 정하기 ›</button>` : ''}</p>` : '';
  }

  /* =====================================================================
   * 관심 매물 (C-10) · 알림함 (C-12)
   * ===================================================================== */
  const SRC_LABEL = { star: '★', share: '공유', auto: '자동' };
  function renderWatch() {
    const t = now();
    const ws = arr(B().watches).filter((w) => w && w.listing);
    const rowOf = (w) => {
      const p = prod(w.pid), l = w.listing;
      const tags = [];
      if (p) tags.push(`<span class="chip-name" style="padding:1px 7px">${esc(p.name)}</span>`);
      if (w.since) tags.push(`<span class="${w.sinceDir === 'down' ? 'since-down' : w.sinceDir === 'up' ? 'since-up' : ''}">${w.sinceDir === 'down' ? '▼ ' : w.sinceDir === 'up' ? '▲ ' : ''}${esc(w.since)}</span>`);
      if (w.diff) tags.push(esc(w.diff));
      if (Number.isFinite(w.days)) tags.push(`${esc(w.days)}일째`);
      if (w.bumps > 0) tags.push(`끌올 ${esc(w.bumps)}번`);
      if (w.checkedAt > 0) tags.push(`${esc(ago(w.checkedAt, t))} 확인`);
      if (w.last && w.last.text) tags.push(`최근 · ${esc(w.last.text)} ${esc(ago(w.last.t, t))}`);
      const pend = S.sent.some((r) => (r.type === 'watch' || r.type === 'star') && r.key === l.key && C.isOpen(stOf(r).st));
      const auto = w.src === 'auto';
      const acts = w.ended ? '' : auto
        ? `<button class="btn btn-text btn-sm" data-act="watchPin" data-key="${esc(l.key)}"${lk()}>★로 고정</button><button class="btn btn-text gray btn-sm" data-act="watchOff" data-key="${esc(l.key)}"${lk()}>그만 보기</button>`
        : `<button class="iconbtn ${pend ? 'pending' : 'on'}" data-act="star" data-key="${esc(l.key)}" data-pid="${esc(w.pid || '')}" data-on="0" aria-label="${esc(l.title)} 지켜보는 중 — 누르면 빼기"${lk()}>${ico('star', pend ? '' : 'fill')}</button>`;
      return `<div class="wrow">${thumb(l, 'sm')}<div style="min-width:0;cursor:pointer" data-act="watchlog" data-key="${esc(l.key)}" tabindex="0" role="button">
          <p class="ltitle"${w.ended ? ' style="color:var(--ink3)"' : ''}><span class="pill" style="margin-right:6px">${esc(SRC_LABEL[w.src] || '★')}</span>${esc(l.title)}</p><div class="tags">${tags.map((x) => `<span>${x}</span>`).join('')}</div></div>
        <div class="wacts">${w.ended ? '<span class="badge b-plain">끝남</span>' : ''}<b class="num">${esc(won(l.price))}</b>${pend ? chgPill : ''}${acts}</div></div>`;
    };
    const alive = ws.filter((w) => !w.ended), ended = ws.filter((w) => w.ended);
    const shareRec = lastRec((r) => r.type === 'share');
    return `<section class="${day() ? 'stale-day' : ''}" style="max-width:960px"><h1 class="sec-title">관심 매물</h1>
      <p class="sec-sub">찜한 매물의 가격·상태가 바뀌면 알려 드려요 · 마켓 앱에서 '공유 → 꿀매 레이더'로도 넣어요</p>
      <form class="searchrow" id="shareForm" style="margin-top:14px"><label class="search" style="height:40px">${ico('ext')}<span class="sr">매물 주소</span><input id="shareUrl" autocomplete="off" placeholder="마켓 매물 주소 붙여 넣기"></label><button class="btn" type="submit" style="height:40px"${lk()}>넣기</button></form>
      <p class="under" id="shareErr">중고나라·당근·번개장터 매물 주소만 넣을 수 있어요 <span class="webonly">웹만</span></p>
      ${cmdLine(shareRec, { boxed: true, label: true })}
      ${alive.length ? `<div class="wlist">${alive.map(rowOf).join('')}</div>` : '<p class="empty">★한 매물이 여기 보여요</p>'}
      <h2 class="sec-title" style="margin-top:24px;font-size:1rem">끝난 매물</h2><p class="sec-sub">판매완료·삭제된 매물은 마지막 가격과 함께 7일 보여 드려요</p>
      ${ended.length ? `<div class="wlist">${ended.map(rowOf).join('')}</div>` : ''}</section>`;
  }
  const INBOX_ICON = { honey: 'drop', target: 'target', lowest: 'trend', nday: 'trend', drop: 'down', new: 'plus', caution: 'alert', watch: 'star', digest: 'list', system: 'gear', web: 'up' };
  const isRead = (i) => !!i.read || S.readLocal.has(i.id) || (S.readAll && i.t <= S.readAll);
  const inboxUnread = () => arr(B() && B().inbox).filter((i) => i && typeof i.read === 'boolean' && !isRead(i)).length;
  function renderInbox() {
    const t = now();
    const items = arr(B().inbox).slice(0, 100);
    let html = '', last = '';
    for (const i of items) {
      const d = RV.dayLabel(i.t, t);
      if (d !== last) { html += `<p class="day">${esc(d)}</p>`; last = d; }
      const unread = typeof i.read === 'boolean' && !isRead(i);
      html += `<div class="irow ${i.kind === 'honey' ? 'honey' : ''}${unread ? ' unread' : ''}" data-act="inboxOpen" data-id="${esc(i.id || '')}" data-key="${esc(i.key || (i.listing && i.listing.key) || '')}" tabindex="0" role="button">${ico(INBOX_ICON[i.kind] || 'list')}<div style="min-width:0">
        <p class="it">${unread ? '<span class="ud" aria-hidden="true"></span><span class="sr">안 읽음 </span>' : ''}${esc(i.title)}</p>${i.text ? `<p class="ib">${esc(i.text)}</p>` : ''}<p class="ig">${RV.inboxTags(i, t).map(esc).join(' · ')}</p></div></div>`;
    }
    const canRead = items.some((i) => typeof i.read === 'boolean' && !isRead(i));
    return `<section style="max-width:820px"><div class="titlebar"><div style="flex:1"><h1 class="sec-title">알림함</h1><p class="sec-sub">지난 알림을 다시 봐요 · 밤사이·요약 소식도 여기 모여요</p></div>
        <button class="btn btn-text" data-act="readAll"${lk() || dis(!canRead)}>모두 읽음</button></div>
      ${phoneBox('알림은 폰으로만 와요', '웹은 알림을 띄우지 않아요')}
      <div class="inbox">${html || '<p class="empty">최근 7일 알림이 없어요</p>'}</div></section>`;
  }
  const phoneBox = (title, nowText) => `<div class="phone">${ico('phone')}<div class="t"><b>${esc(title)}</b>${nowText ? `<span>${esc(nowText)}</span>` : ''}</div><span class="tag">폰에서 해 주세요</span></div>`;

  /* =====================================================================
   * 설정 (C-13)
   * ===================================================================== */
  function prefRec(field) { return lastRec((r) => r.type === 'prefs' && arr(r.fields).includes(field)); }
  const prefPending = (field) => S.sent.some((r) => r.type === 'prefs' && arr(r.fields).includes(field) && C.isOpen(stOf(r).st));
  function renderSettings() {
    const b = B(), t = now();
    const pr = b.prefs && typeof b.prefs === 'object' ? b.prefs : null;
    const noP = pr ? '' : ' disabled title="앱이 값을 올린 뒤에 바꿀 수 있어요"';
    const L = (x) => (pr ? lk() : noP);
    // S1
    const pct = pr ? pr.defaultPct : null;
    const custom = pr && !C.PCT_PRESETS.includes(pct);
    const s1Pend = prefPending('defaultPct');
    const s1 = `<section class="sbox" id="s-defaultPct"><h3>새 물건의 꿀매 기준</h3><p class="d">시세보다 이만큼 이상 싸면 꿀매로 알려요. 물건마다 '조건'에서 따로 바꿀 수 있어요.</p>
      <div class="chiprow" role="radiogroup" aria-label="새 물건의 꿀매 기준">${C.PCT_PRESETS.map((p) => `<button class="cchip" role="radio" aria-checked="${pct === p}" data-act="prefPct" data-v="${p}"${L()}>${p === 15 ? '-15% 기본' : p === 30 ? '-30% 급매만' : `-${p}%`}</button>`).join('')}
        <button class="cchip" role="radio" aria-checked="${!!custom || S.pctCustomOpen === true}" data-act="prefPctCustom"${L()}>${custom ? `직접 -${pct}%` : '직접 입력'}</button>${s1Pend ? chgPill : ''}</div>
      ${S.pctCustomOpen ? `<div class="frow" style="margin-top:8px"><span class="meta">시세보다 -</span><input class="field" id="prefPctIn" inputmode="numeric" style="max-width:90px" value="${esc(custom ? pct : '')}"><span class="meta">% 이상 싸면 꿀매 (5~45)</span><button class="btn btn-sm" data-act="prefPctSave"${L()}>바꾸기</button></div><p class="conf-note" id="prefPctErr" hidden>5~45 사이로 적어 주세요(50% 넘게 싸면 '확인 필요'로 봐요)</p>` : ''}
      ${cmdLine(prefRec('defaultPct'))}</section>`;
    // S2
    const an = pr ? pr.autoWatchN : null;
    const s2 = `<section class="sbox"><h3>자주 본 매물 자동으로 지켜보기</h3><p class="d">앱에서 같은 매물을 이만큼 열면 관심 매물로 넣어요(30일 동안 다시 안 열면 빠져요).</p>
      <div class="chiprow" role="radiogroup" aria-label="자주 본 매물 자동으로 지켜보기">${[0, 1, 2, 3, 4, 5].map((n) => `<button class="cchip" role="radio" aria-checked="${an === n}" data-act="prefAuto" data-v="${n}"${L()}>${n === 0 ? '끄기' : n === 2 ? '2번 기본' : `${n}번`}</button>`).join('')}${prefPending('autoWatchN') ? chgPill : ''}</div>${cmdLine(prefRec('autoWatchN'))}</section>`;
    // S3·S4
    const inten = pr ? pr.intensity : null;
    const fp = b.focusPlan && arr(b.focusPlan.ids).length && b.focusPlan.until > t ? b.focusPlan : null;
    const itext = b.intensityText || {};
    const iHint = inten === 'save' ? (itext.save || '와이파이 30분·데이터 1시간마다 확인해요. 여러 쪽까지 보는 확인은 2시간·6시간마다.') : (itext.normal || '와이파이 15분·데이터 30분마다 확인해요. 여러 쪽까지 보는 확인은 1시간·3시간마다.');
    const focusRec = lastRec((r) => r.type === 'focus');
    const fpick = S.focusPick;
    const s3 = `<section class="sbox"><h3>감시 강도</h3><p class="d">자주 확인할수록 꿀매를 빨리 잡지만 배터리·데이터를 더 써요.</p>
      <div class="chiprow"><span role="radiogroup" aria-label="감시 강도" class="chiprow" style="margin:0">${[['save', '절약'], ['normal', '보통']].map(([v, l]) => `<button class="cchip" role="radio" aria-checked="${inten === v}" data-act="prefInten" data-v="${v}"${L()}>${l}</button>`).join('')}</span>
        <button class="cchip" aria-pressed="${!!fp}" data-act="focusPick"${lk()}>${ico('target')}${fp ? '집중 감시 중' : '＋ 집중 감시'}</button>${prefPending('intensity') ? chgPill : ''}</div>
      <p class="hint">${esc(iHint)}</p>${cmdLine(prefRec('intensity'))}
      ${fp ? `<div class="focusbox">${ico('target')}<div style="flex:1"><b style="font-size:.8125rem">${esc(arr(fp.ids).map((id) => (prod(id) || {}).name).filter(Boolean).join(' · '))}</b><div class="meta" style="font-size:.75rem">${esc(fp.everyMin)}분마다 · ${esc(clock(fp.until, t))}까지</div></div><button class="btn btn-text coral btn-sm" data-act="focusStop"${lk()}>멈추기</button></div>` : ''}
      ${fpick ? `<div class="fpick"><p class="flabel" style="margin-top:0">물건 (${C.FOCUS_MAX}개까지)</p>
          ${prods().length ? `<div class="chiprow">${prods().map((p) => `<button class="cchip" aria-pressed="${fpick.ids.includes(p.id)}" data-act="focusId" data-pid="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>` : '<p class="hint">먼저 홈에서 물건을 추가해 주세요.</p>'}
          <p class="flabel">얼마 동안</p><div class="chiprow" role="radiogroup">${C.FOCUS_HOURS.map((h) => `<button class="cchip" role="radio" aria-checked="${fpick.hours === h}" data-act="focusH" data-v="${h}">${h}시간</button>`).join('')}</div>
          <p class="flabel">얼마나 자주</p><div class="chiprow" role="radiogroup">${C.FOCUS_EVERY.map((m) => `<button class="cchip" role="radio" aria-checked="${fpick.every === m}" data-act="focusE" data-v="${m}">${m}분마다</button>`).join('')}</div>
          <p class="hint">화면이 꺼져도 정한 시간 동안 이 물건만 자주 확인해요(알림 표시줄에 '집중 감시 중'). 꿀매·최저가 갱신은 조용한 시간에도 바로 알려요. 배터리를 조금 더 써요.</p>
          <p class="hint">폰이 배터리 최적화 예외가 아니면 폰에서 알림을 한 번 눌러야 켜져요 <span class="webonly">웹만</span></p>
          <button class="btn btn-fill" style="margin-top:10px" data-act="focusGo"${lk() || dis(!fpick.ids.length)}>${fp ? '이대로 다시 시작' : '집중 감시 시작'}</button></div>` : ''}
      ${cmdLine(focusRec)}</section>`;
    // S5·S6·S7·S8
    const qt = pr && pr.quiet ? pr.quiet : null;
    const s5 = `<section class="sbox">${phoneBox('알림 상태', str(b.notifLine) || (b.notifOn === false ? '알림이 꺼져 있어요' : '폰에서 확인해 주세요'))}
      <h3 style="margin-top:14px">알림</h3><p class="d">꿀매·목표가는 밤에도 바로, 최저가 갱신은 기준가 이하일 때만 폰으로(조용한 시간엔 아침에), 가격 인하·새 매물은 하루 요약에만.</p>
      <div class="swrow" style="margin-top:4px"><div class="t"><b>조용한 시간(${qt ? `${esc(qt.start)}시~${esc(qt.end)}시` : '1시~7시'})</b><span>보통 알림을 아침으로 미뤄요</span></div><button class="sw" role="switch" aria-checked="${!!(qt && qt.on)}" aria-label="조용한 시간" data-act="prefQuietOn"${L()}></button>${prefPending('quiet') ? chgPill : ''}</div>
      ${qt && qt.on ? `<div class="chiprow" role="radiogroup" style="margin-top:8px" aria-label="조용한 시간">${C.QUIET_CHOICES.map(([a, z]) => `<button class="cchip" role="radio" aria-checked="${qt.start === a && qt.end === z}" data-act="prefQuiet" data-a="${a}" data-z="${z}"${L()}>${a}~${z}시</button>`).join('')}</div>` : ''}
      ${cmdLine(prefRec('quiet'))}
      <div class="swrow"><div class="t"><b>하루 요약</b><span>아침 8시·저녁 8시에 물건별 최저가와 그동안의 소식</span></div><button class="sw" role="switch" aria-checked="${!!(pr && pr.digestOn)}" aria-label="하루 요약" data-act="prefDigest"${L()}></button>${prefPending('digestOn') ? chgPill : ''}</div>
      ${cmdLine(prefRec('digestOn'))}
      <div style="margin-top:12px">${phoneBox('알림 소리·진동 고르기', '')}</div></section>`;
    // S9
    const bt = b.battery || null;
    const s9 = `<section class="sbox"><h3>확인이 끊기지 않게</h3><p class="d">폰이 배터리를 아끼려고 백그라운드 확인을 멈추면 꿀매를 놓쳐요. 배터리 최적화 예외를 켜 두세요.</p>
      ${phoneBox('배터리 최적화 예외', bt ? [bt.exempt ? '예외로 켜져 있어요' : '아직 최적화 대상이에요', bt.lastBgAt > 0 ? `마지막 백그라운드 확인 ${ago(bt.lastBgAt, t)}` : '백그라운드 확인 전이에요', str(bt.text)].filter(Boolean).join(' · ') : '')}</section>`;
    // S10 수집 상태
    const st = live();
    const mk = arr(b.markets).filter((m) => MARKET[m.m]).map((m) => `<div class="mlow">${mkMark(m.m)}${esc(MARKET[m.m])} <span class="${m.bad ? 'bad' : 'ink2'}" style="font-weight:400">${m.okAt > 0 ? `성공 ${esc(ago(m.okAt, t))}` : '아직 기록 없음'}${m.text ? ' · ' + esc(m.text) : ''}</span></div>`).join('');
    const dq = b.daangn;
    const u = C.adhocUse(b, S.sent, t);
    const gaps = RV.gaps(b, t).slice(0, 5).map((g) => `<div class="gap-row"><span>${esc(clock(g.from, t))} ~ ${g.open ? '지금' : esc(clock(g.to, t))} · ${esc(RV.dur(g.ms))}</span><span class="mark">PC를 껐던 때?</span></div>`).join('');
    const s10 = `<section class="sbox" id="s-status"><h3>수집 상태</h3><p class="d">마켓마다 마지막으로 잘 받은 때예요. 막히면 알림으로 알려요.</p>
      <div style="display:grid;gap:4px;font-size:.8125rem">${mk || '<p class="muted">마켓 상태가 묶음에 없어요</p>'}</div>
      <p class="hint">당근은 이 폰에서만 모아요(다른 곳에서 대신 모으지 않아요).${dq ? `\n당근 요청 최근 1시간 ${dq.hour}번 · 오늘 ${dq.day}번 (1시간 ${(dq.hourMax || 150).toLocaleString('ko-KR')}번 · 하루 ${(dq.dayMax || 3000).toLocaleString('ko-KR')}번까지, 이 폰 전체)${dq.text ? '\n' + dq.text : ''}` : ''}\n이번 1시간 웹 그냥 검색 ${u.used}/${u.limit}번 <span class="webonly">웹만</span></p>
      <ul class="kv" style="margin-top:8px"><li>기기 <b>${esc(str(b.device) || '내 안드로이드')}</b></li><li>앱 <b>${esc(str(b.app) || '—')}</b></li>${b.watchLabel ? `<li>감시 강도 <b>${esc(b.watchLabel)}</b></li>` : ''}<li>늦음 기준 <b>${st.line}분</b></li><li>마지막 올림 <b>${esc(clock(b.made, t))}</b></li></ul>
      ${gaps ? `<p class="flabel">최근 7일 올림 공백 <span class="muted" style="font-weight:400">(7일 나란히 보는 동안만)</span></p>${gaps}` : ''}</section>`;
    // S11
    const home = pr ? str(pr.daangnHome) : '';
    const base = pr ? str(pr.distanceBase) : '';
    const s11 = `<section class="sbox"><div class="titlebar"><div style="flex:1"><h3>${home ? `당근 내 동네 · ${esc(home)}` : '당근 내 동네를 정해 주세요'}</h3><p class="d" style="margin-bottom:0">${home ? (base ? `동네를 따로 적지 않은 물건은 이 근처 당근 매물만 · 거리는 ${esc(base)} 에서` : '동네를 따로 적지 않은 물건은 이 근처 당근 매물만 봐요') : '정하지 않으면 당근은 전국 최신 매물이 섞여 와요'}</p></div><button class="btn btn-sm" data-act="homeDlg"${L()}>${home ? '바꾸기' : '정하기'}</button></div>
      ${cmdLine(lastRec((r) => r.type === 'home'))}</section>`;
    const s12 = `<section class="sbox"><h3>웹 대시보드 연결</h3><p class="d">PC에서 넓게 보는 보조 화면이에요. 이 폰이 당근을 모아 대시보드에 올려요.</p>${phoneBox('연결 · 결과 올리기', `마지막 올림 ${clock(b.made, t)} · ${str(b.device) || '내 안드로이드'}`)}</section>`;
    const s13 = `<section class="sbox"><h3>오판 사례 ${esc(Number(b.misfits) || 0)}건</h3><p class="d">'이 매물 아님'을 누른 매물이에요. 규칙 시험에 넣어 쓸수록 정확해져요.</p><p class="hint" style="margin:0">내보내기는 폰에서 해 주세요</p></section>`;
    const s14 = arr(b.metrics).length ? `<section class="sbox"><h3>지켜보는 숫자</h3><p class="hint" style="margin:6px 0 0;color:var(--ink2)">${arr(b.metrics).map(esc).join('\n')}</p></section>` : '';
    const s15 = `<section class="sbox"><h3>오류 기록 ${esc(Number(b.errors) || 0)}건</h3><p class="d">확인하다 생긴 문제를 단계·종류만 남겨요(검색어·매물 제목은 남기지 않아요). 고칠 때 보내 주세요.</p><p class="hint" style="margin:0">내보내기는 폰에서 해 주세요</p></section>`;
    const me = `<section class="sbox"><h3>이 브라우저 <span class="webonly">웹만</span></h3><p class="d">${LOCAL_SRC ? '시험 묶음(?src=)을 보는 중이에요' : `웹 토큰 · ${S.ro ? '읽기만(예전 토큰)' : '읽기 + 이슈 쓰기'} · 명령 비밀번호 ${S.cmdKey ? '이 탭에서 넣었어요(탭을 닫으면 잊어요)' : '아직 안 넣었어요(명령을 보낼 때 한 번)'}`}</p>
      <div class="titlebar" style="gap:8px"><button class="btn btn-sm" data-act="retok">토큰 바꾸기</button><button class="btn btn-sm" data-act="forget">이 기기에서 잊기</button></div></section>`;
    return `<section style="max-width:760px"><h1 class="sec-title" style="margin-bottom:12px">설정</h1><div class="settings">
      ${s1}${s2}${s3}${s5}${s9}${s10}${s11}${s12}${s13}${s14}${s15}${me}
      <p class="meta" style="text-align:center">꿀매 레이더 ${esc(str(b.app) || '')} · 같은 물건 · 3사 최저가 · 뜨면 바로<br>지역 표: 통계청 SGIS 행정동 경계(공공누리 제1유형)를 가공한 vuski/admdongkor 자료, CC BY 4.0. 거리는 앱이 재요.</p>
    </div></section>`;
  }

  /* =====================================================================
   * 창 (C-4 ~ C-9, C-11, C-15, C-16, 비밀번호)
   * ===================================================================== */
  function openDlg(d, opener) {
    S.dlg = d;
    S.opener = opener || (document.activeElement && document.activeElement.id) || null;
    S.menu = null;
    renderLayer(true);
  }
  function closeDlg() {
    const d = S.dlg;
    if (d && d.kind === 'edit' && C.editDiff(prod(d.pid), S.form || {}).changed.length && !d.askClose) {
      d.askClose = true; renderLayer(); return;
    }
    S.dlg = null; S.form = null;
    if (d && d.kind === 'pw') S.pend = null;
    renderLayer();
    const back = S.opener && document.getElementById(S.opener);
    if (back) back.focus();
  }
  const dlgShell = (cls, labelId, head, body, foot, role) => `<div class="scrim" data-act="scrim"><div class="dialog ${cls}" role="${role || 'dialog'}" aria-modal="true" aria-labelledby="${labelId}">
      <div class="dhead">${head}</div><div class="dbody">${body}</div>${foot ? `<div class="dfoot">${foot}</div>` : ''}</div></div>`;
  const xBtn = '<button class="iconbtn" data-act="close" aria-label="닫기">' + '<svg class="ico" aria-hidden="true"><use href="#i-x"/></svg></button>';

  function dlgPw() {
    const d = S.dlg;
    return dlgShell('sm', 'dPw', `<div style="flex:1"><h2 id="dPw">${ico('key')} 명령을 보내려면 비밀번호를 한 번 넣어 주세요</h2><p class="desc">이 탭을 닫으면 잊어요. 보기용으로 기억한 열쇠로는 명령을 잠그지 않아요(웹 토큰이 새도 앱을 조작하지 못하게).</p></div>${xBtn}`,
      `<form id="pwForm"><label class="sr" for="cmdPw">비밀번호</label><input class="field" id="cmdPw" type="password" autocomplete="current-password" placeholder="비밀번호">
        <p class="conf-note" id="cmdPwErr"${d.err ? '' : ' hidden'}>${esc(d.err || '')}</p></form>`,
      `<span class="grow"></span><button class="btn btn-text gray" data-act="close">취소</button><button class="btn btn-fill" data-act="pwGo"${dis(d.busy)}>${d.busy ? '확인하는 중…' : '확인'}</button>`);
  }
  function dlgAdd() {
    const d = S.dlg;
    const cards = arr(B().cards).length ? B().cards : C.QUICK;
    const have = new Set(prods().map((p) => (p.cfg ? str(p.cfg.keyword) : '')).filter(Boolean));
    const sug = C.suggest(d.text || '');
    const tooMany = (d.text || '').split(/[,，]/).filter((x) => x.trim()).length > 3;
    return dlgShell('', 'dA', `<div style="flex:1"><h2 id="dA">어떤 물건을 지켜볼까요?</h2><p class="desc">세 마켓에서 같은 물건의 최저가를 계속 지켜보다가, 진짜 꿀매가 뜨면 바로 알려 드려요.</p></div>${xBtn}`,
      `<p class="flabel">물건 카드</p><p class="desc" style="margin:-2px 0 10px">같은 말(4080 = RTX4080 = 지포스 4080)·카테고리·빼기 단어(완본체·노트북)가 들어간 채로 시작해요</p>
        <div class="qcards">${cards.map((c) => { const on = have.has(c.keyword); return `<button class="qcard" data-act="addCard" data-card="${esc(c.id)}"${on ? ' disabled' : lk()}><b>${esc(c.title)}</b><span>${on ? '지켜보는 중' : esc(C.familyOf(c))}</span></button>`; }).join('')}</div>
        <p class="flabel" style="margin-top:20px">직접 쓰기</p><p class="desc" style="margin:-2px 0 8px">모델명이나 물건 이름(예: 4070 ti super, 에어팟 프로2). 쉼표로 여러 표기를 함께 찾아요(3개까지).</p>
        <form id="addForm"><label class="sr" for="addText">지켜볼 물건</label><input class="field" id="addText" autocomplete="off" placeholder="지켜볼 물건" value="${esc(d.text || '')}"></form>
        <p class="hint" id="addMany"${tooMany ? '' : ' hidden'}>3개까지만 찾아요 — 4번째부터는 빼요</p>
        <div id="addSug">${sugHTML(sug, d.useCard !== false)}</div>
        <button class="btn btn-fill btn-wide" style="margin-top:14px" data-act="addGo" id="addGo"${locked() ? lk() : dis(!(d.text || '').trim())}>지켜보기 시작</button>
        <p class="hint">추가하면 세 마켓을 모은 뒤 '어떤 물건인지'(가격대·빼기 단어)를 정해요. 본체로 보이는 가격대는 미리 골라 둬요.</p>
        <p class="hint" style="color:var(--ink2)">꿀매 기준·목표가는 물건 카드의 '조건'에서 바꿔요</p>`, '');
  }
  const sugHTML = (sug, on) => (sug ? `<button class="suggest" data-act="addSugToggle" aria-pressed="${on}"><span class="mark">${on ? '✓' : '○'}</span><span><b>'${esc(sug.title)}' 카드로 시작</b><span>${esc(sug.sub)}</span></span></button>` : '');
  function dlgIdentify() {
    const d = S.dlg, p = prod(d.pid);
    if (!p) return '';
    const id = p.identify && typeof p.identify === 'object' ? p.identify : null;
    const kw = p.cfg ? C.firstAlt(p.cfg.keyword) || p.name : p.name;
    const head = `<div style="flex:1"><h2 id="dI">'${esc(kw)}' 어떤 물건을 찾으세요?</h2><p class="desc">최저가는 같은 물건끼리 비교해야 맞아요. 고른 대로 엉뚱한 물건을 빼고 시세도 그 물건으로 다시 내요.</p></div>${xBtn}`;
    if (!id) {
      return dlgShell('lg', 'dI', head, `<p class="ink2">앱이 후보를 올린 뒤에 열 수 있어요.</p>`, `<span class="grow"></span><button class="btn btn-text gray" data-act="close">닫기</button><button class="btn" data-act="check" data-pid="${esc(p.id)}"${lk()}>${ico('refresh')}지금 확인</button>`);
    }
    const sel = d.sel;
    const bands = arr(id.bands);
    const bandHtml = bands.length >= 2 ? `<p class="flabel">가격대</p><p class="desc" style="margin:-2px 0 9px">${esc(str(id.intro) || "본체로 보이는 가격대를 골라 뒀어요. 맞으면 아래 '이대로 정하기'만 누르세요.")}</p>
      <div role="radiogroup" aria-label="가격대">${bands.map((b, i) => `<button class="band" role="radio" aria-checked="${sel.band === i}" data-act="idBand" data-i="${i}"><span><b>${esc(man(Number.isFinite(b.from) ? b.from : b.lo))} ~ ${esc(man(Number.isFinite(b.to) ? b.to : b.hi))}</b><span>${esc(b.n)}건  ·  중간 ${esc(man(b.mid))}${b.tags ? '  ·  ' + esc(b.tags) : ''}</span></span><span class="pick">${sel.band === i ? '고름' : ''}</span></button>`).join('')}</div>
      ${sel.band != null && sel.band < bands.length - 1 ? `<div class="chiprow" style="margin-top:2px"><button class="cchip" aria-pressed="${!!sel.withHigher}" data-act="idHigher">더 비싼 묶음도 함께</button><span class="desc" style="margin:0">프로·Ti 같은 비싼 변형이면</span></div>` : ''}` : '';
    const words = arr(id.words);
    const wordHtml = words.length ? `<p class="flabel">자주 나오는 말</p><p class="desc" style="margin:-2px 0 9px">한 번 누르면 빼기, 한 번 더 누르면 꼭 들어갈 말, 또 누르면 원래대로.</p>
      <div class="chiprow">${words.map((w) => { const s = sel.words[w.w] | 0; return `<button class="cchip${s === 1 ? ' ex' : s === 2 ? ' in' : ''}" data-act="idWord" data-w="${esc(w.w)}" aria-label="${esc(w.w)} ${esc(w.n)}건 · ${s === 1 ? '빼기' : s === 2 ? '꼭 들어갈 말' : '그대로'}">${s === 1 ? '− ' : s === 2 ? '+ ' : ''}${esc(w.w)} <span class="c">${esc(w.n)}</span></button>`; }).join('')}</div>` : '';
    const pv = C.identifyPreview(p, sel);
    let prev;
    if (pv.kind === 'ok') {
      const v = pv.pv;
      prev = v.n > 0 ? `<div class="l">이대로면 매물 ${esc(v.n)}건</div>${v.low ? `<div style="margin-top:4px"><span class="l">지금 최저 </span><b style="font-size:.9375rem">${esc(won(v.low.price))}</b></div><div class="meta" style="font-size:.75rem">${esc(v.low.title)}</div>` : `<div class="meta">믿을 만한 매물 없음${v.doubt ? ` · ⚠ ${esc(v.doubt)}건` : ''}</div>`}${v.low && v.doubt ? `<div class="meta" style="font-size:.6875rem">더 싸 보이는 ⚠ 확인 필요 ${esc(v.doubt)}건은 뺐어요</div>` : ''}`
        : '<div class="l">조건에 맞는 매물이 없어요</div>';
    } else if (pv.kind === 'category') prev = '<div class="meta">카테고리는 정한 뒤 그 안에서 다시 모아요</div>';
    else prev = '<div class="meta">미리보기는 앱이 정한 뒤에 다시 세요(웹은 판정하지 않아요)</div>';
    return dlgShell('lg', 'dI', head,
      `<p class="flabel">카테고리</p><p class="desc" style="margin:-2px 0 9px">세 마켓 모두 이 안에서만 찾아요. 품번 숫자가 겹치는 다른 물건이 빠져요.</p>
        <div class="chiprow" role="radiogroup" aria-label="카테고리">${C.CATEGORIES.map(([k, l]) => `<button class="cchip" role="radio" aria-checked="${sel.category === k}" data-act="idCat" data-k="${esc(k)}">${esc(l)}</button>`).join('')}</div>
        ${bandHtml}${wordHtml}<div class="preview">${prev}</div>`,
      `<button class="btn btn-text gray" data-act="close">나중에</button><span class="grow"></span><button class="btn btn-fill" data-act="idGo"${lk()}>이대로 정하기</button>`);
  }
  function openIdentify(pid) {
    const p = prod(pid);
    if (!p) return;
    const id = p.identify && typeof p.identify === 'object' ? p.identify : {};
    const pick = id.pick && typeof id.pick === 'object' ? id.pick : null;
    const words = {};
    for (const w of arr(id.words)) if (w && str(w.w)) words[w.w] = w.s | 0;
    openDlg({ kind: 'identify', pid, sel: { category: p.cfg ? str(p.cfg.category) : '', band: pick ? pick.index : null, withHigher: pick ? !!pick.withHigher : false, words } });
  }
  function dlgVariant() {
    const a = adhocEntry();
    const ask = a && a.ask;
    if (!ask) return '';
    return dlgShell('sm', 'dV', '<h2 id="dV">어느 쪽을 지켜볼까요?</h2>',
      `<p class="ink2" style="margin:4px 0 0">이 검색은 ${esc(ask.v)} 매물이 훨씬 많아요(${esc(ask.v)} ${esc(ask.n)}건 · 기본 ${esc(ask.b)}건). 고른 쪽의 지금 최저가를 지켜봐요.</p>
       <div class="vbtns"><button class="btn btn-text" data-act="saveV" data-v="${esc(ask.v)}">${esc(ask.v)}만</button><button class="btn btn-text" data-act="saveV" data-v="기본">기본만</button><button class="btn btn-text" data-act="saveV" data-v="">둘 다(지금 최저가는 기본, ${esc(ask.v)} 는 변형별 줄)</button></div>`,
      '<span class="grow"></span><button class="btn btn-text gray" data-act="close">취소</button>');
  }
  function dlgDelete() {
    const p = prod(S.dlg.pid);
    if (!p) return '';
    return dlgShell('sm', 'dD', `<h2 id="dD">'${esc(p.name)}' 그만 지켜볼까요?</h2>`,
      '<p id="dDd" class="ink2" style="margin:4px 0 0">최저가·장부·이력이 지워져요.</p>',
      `<span class="grow"></span><button class="btn btn-text gray" data-act="close" id="delCancel">취소</button><button class="btn btn-text coral" data-act="delGo"${lk()}>지우기</button>`, 'alertdialog');
  }
  const chipsRadio = (name, list, cur, act) => `<div class="chiprow" role="radiogroup" aria-label="${esc(name)}">${list.map(([v, l]) => `<button class="cchip" role="radio" aria-checked="${cur === v}" data-act="${act}" data-v="${esc(v === null ? 'null' : v)}">${esc(l)}</button>`).join('')}</div>`;
  function dlgEdit() {
    const d = S.dlg, p = prod(d.pid);
    if (!p || !p.cfg) return '';
    const f = S.form;
    const diff = C.editDiff(p, f);
    const ch = (k) => (diff.changed.includes(k) ? '<span class="chgdot" aria-hidden="true"></span>' : '');
    const chs = (k) => (diff.changed.includes(k) ? '<span class="sr">(바꿈)</span>' : '');
    const conf = d.conflict || {};
    const cfNote = (k) => (k in conf ? `<p class="conf-note" role="alert">앱에서 먼저 바뀌었어요 — 지금 값으로 다시 골라 주세요</p>` : '');
    const cfCls = (k) => (k in conf ? ' conflict' : '');
    const lab = (k, text) => `<p class="flabel" data-f="${k}">${ch(k)}${esc(text)}${chs(k)}</p>`;
    const field = (k, ph, extra) => `<input class="field${cfCls(k)}" data-field="${k}" id="e-${k}" placeholder="${esc(ph)}" value="${esc(f[k])}" autocomplete="off"${extra || ''}>`;
    const pctOk = !f.customPct || (Number.isInteger(+f.thresholdPct) && +f.thresholdPct >= C.PCT_MIN && +f.thresholdPct <= C.PCT_MAX && /^\d+$/.test(String(f.thresholdPct)));
    const pv = p.pctPreview && typeof p.pctPreview === 'object' ? p.pctPreview[String(f.thresholdPct)] : null;
    const vc = arr(p.variantChoices);
    const homeName = B().prefs && str(B().prefs.daangnHome) ? C.firstAlt(B().prefs.daangnHome) : '';
    const latest = clock(B().made, now());
    const top = cmdLine(lastRec((r) => r.type === 'edit' && r.pid === p.id && stOf(r).st !== 'conflict'), { boxed: true, label: true });
    return dlgShell('lg', 'dE', `<div style="flex:1"><h2 id="dE">'${esc(p.name)}' 조건</h2><p class="desc">앱이 ${esc(latest)} 에 올린 값이에요 <span class="webonly">웹만</span></p></div>${xBtn}`,
      `${top}${late() ? `<div class="banner" style="margin:6px 0 0;padding:8px 12px">${ico('alert')}<div><b style="font-size:.8125rem">폰이 ${esc(ago(B().made, now()))} 값을 올렸어요</b><span>그 사이 앱에서 바꿨다면 겹칠 수 있어요</span></div></div>` : ''}
        ${lab('thresholdPct', '꿀매 기준')}<div class="chiprow" role="radiogroup" aria-label="꿀매 기준">${C.PCT_PRESETS.map((v) => `<button class="cchip" role="radio" aria-checked="${!f.customPct && +f.thresholdPct === v}" data-act="ePct" data-v="${v}">${v === 15 ? '-15% 기본' : v === 30 ? '-30% 급매만' : `-${v}%`}</button>`).join('')}<button class="cchip" role="radio" aria-checked="${!!f.customPct}" data-act="ePctCustom">직접 입력</button></div>
        ${f.customPct ? `<div class="frow" style="margin-top:8px"><span class="meta">시세보다 -</span>${field('thresholdPct', '15', ' inputmode="numeric" style="max-width:90px"')}<span class="meta">% 이상 싸면 꿀매 (5~45)</span></div>${pctOk ? '' : `<p class="conf-note">5~45 사이로 적어 주세요(50% 넘게 싸면 '확인 필요'로 봐요)</p>`}` : ''}
        ${cfNote('thresholdPct')}<p class="hint" id="pctHint">${esc(pv || `시세보다 ${f.thresholdPct}% 이상 싼 같은 물건을 꿀매로 알려요(시세는 매물이 5건 넘게 모이면 내요)`)}</p>
        ${lab('targetPrice', '목표가')}<div class="frow">${field('targetPrice', '예: 120만 (비우면 없음)')}<span class="meta">이하면 바로 알림</span></div>${cfNote('targetPrice')}
        ${vc.length >= 2 ? `${lab('variantPick', '변형')}${chipsRadio('변형', [['', '전부(따로 보기)'], ...vc.map((v) => [v, `${v} 만`])], f.variantPick, 'eVar')}<p class="hint">전부 = 변형마다 시세·최저가를 따로 보여 줘요. 하나만 고르면 그 변형만 지켜봐요.</p>${cfNote('variantPick')}` : ''}
        ${lab('keyword', '검색어')}${field('keyword', '예: 4080, 4080s')}<p class="hint">쉼표로 나누면 여러 표기를 함께 찾아요(3개까지). 띄어쓰기·대소문자는 상관없고 플스5=PS5 같은 같은 말도 알아봐요.</p>${cfNote('keyword')}
        ${lab('matchMode', '검색어 확인')}${chipsRadio('검색어 확인', [['title', '제목에 있어야'], ['content', '제목·내용']], f.matchMode, 'eMatch')}<p class="hint">${f.matchMode === 'content' ? '당근 설명·사이트 검색 결과까지 봐요. 제목에 검색어가 없어도 남아서 엉뚱한 매물이 섞일 수 있어요.' : "제목에 검색어가 없거나, 모델 번호를 비교로만 쓴 매물('RX 9070 XT (5070급)')은 빼요. 최저가·시세가 엉뚱한 매물에 흔들리지 않아요."}</p>${cfNote('matchMode')}
        ${lab('category', '카테고리')}${chipsRadio('카테고리', C.CATEGORIES, f.category, 'eCat')}<p class="hint">고르면 세 마켓 모두 그 안에서만 찾아요. 4080·5070 같은 숫자 모델명은 품번이 겹치는 다른 물건이 빠져요.</p>${cfNote('category')}
        ${lab('excludeWords', '빼고 볼 단어')}${field('excludeWords', '예: 본체, 노트북, 케이스')}<p class="hint">제목에 하나라도 들어가면 목록·최저가·딜에서 빼요. 쉼표로 나눠 적어요.</p>${cfNote('excludeWords')}
        ${lab('includeWords', '꼭 들어갈 단어')}${field('includeWords', '예: 미개봉, 정품')}<p class="hint">적으면 그 단어가 든 매물만. 비우면 거르지 않아요.</p>${cfNote('includeWords')}
        ${lab('bandMin', '물건 가격대')}<div class="frow">${field('bandMin', '최소 (예: 30만)')}<span class="meta">~</span>${field('bandMax', '최대')}</div><p class="hint">이 범위 밖 가격은 다른 물건(게임 vs 본체 같은)으로 보고 시세에서도 빼요. '물건 정하기'의 가격대가 여기 들어가요. 35 라고만 써도 35만으로 알아들어요.</p>${cfNote('bandMin')}${cfNote('bandMax')}
        <div class="swrow"><div class="t"><b>${ch('basicFilter')}기본 거르기${chs('basicFilter')}</b><span>고장·부품용·박스만·대여·구매대행·사기 경고 글을 빼요</span></div><button class="sw" role="switch" aria-checked="${!!f.basicFilter}" aria-label="기본 거르기" data-act="eSw" data-k="basicFilter"></button></div>${cfNote('basicFilter')}
        ${p.cfg.hiddenCount > 0 ? `<div class="info" style="margin-top:8px"><span style="flex:1;font-weight:400">'이 매물 아님'으로 숨긴 매물 ${esc(p.cfg.hiddenCount)}개</span>${S.sent.some((r) => r.type === 'unhideAll' && r.pid === p.id && C.isOpen(stOf(r).st)) ? chgPill : `<button class="btn btn-text" data-act="unhideAll" data-pid="${esc(p.id)}"${lk()}>모두 다시 보기</button>`}</div>` : ''}
        ${lab('priceMin', '예산')}<div class="frow">${field('priceMin', '최소 (예: 5만)')}<span class="meta">~</span>${field('priceMax', '최대 (예: 90만)')}</div><p class="hint">보이는 목록·최저가·알림만 걸러요(시세는 그대로). 5만, 1.5만처럼 적어도 돼요. 35 라고만 써도 35만으로 알아들어요.</p>${cfNote('priceMin')}${cfNote('priceMax')}
        ${lab('regionWords', '당근 동네')}${field('regionWords', homeName ? `비우면 내 동네(${homeName})` : '예: 시흥시, 정왕동')}<p class="hint">시·군·구(시흥시)나 동(정왕동)으로 적어요. 비우면 내 동네${homeName ? `(${esc(homeName)})` : ''}를 써요. 중고나라·번개장터는 지역으로 거르지 않아요.</p>${cfNote('regionWords')}
        ${lab('maxKm', '당근 거리')}${chipsRadio('당근 거리', C.KM_CHOICES.map((k) => [k, k == null ? '가까운 동네' : `${k}km 안`]), f.maxKm, 'eKm')}<p class="hint">거리 기준(설정 → 당근 내 동네)에서, 없으면 고른 동네 가운데에서 거래 장소까지 직선 거리예요. '가까운 동네'는 당근이 알려 준 근처 동네 이름으로 봐요.</p>${cfNote('maxKm')}
        ${lab('maxAgeDays', '기간')}${chipsRadio('기간', C.PERIODS.map((v) => [v, v === 0 ? '전체' : `${v}일`]), f.maxAgeDays, 'eAge')}<p class="hint">올리거나 끌올한 지 이 기간 안의 매물만 모으고 보여줘요.</p>${cfNote('maxAgeDays')}
        <div class="swrow"><div class="t"><b>${ch('lowestAlert')}최저가 갱신 알림${chs('lowestAlert')}</b><span>지금 최저가보다 싼 매물이 뜨면 알려요</span></div><button class="sw" role="switch" aria-checked="${!!f.lowestAlert}" aria-label="최저가 갱신 알림" data-act="eSw" data-k="lowestAlert"></button></div>${cfNote('lowestAlert')}`,
      d.askClose
        ? `<span class="meta" style="color:var(--ink)">바꾼 것을 버릴까요?</span><span class="grow"></span><button class="btn btn-text gray" data-act="eKeep">계속 고치기</button><button class="btn btn-text coral" data-act="eDiscard">버리기</button>`
        : `<span class="meta" id="eCount">바꾼 칸 ${diff.changed.length}개 <span class="webonly">웹만</span></span><span class="grow"></span><button class="btn btn-text gray" data-act="close">취소</button><button class="btn btn-fill" data-act="eSave" id="eSave"${locked() ? lk() : dis(!diff.changed.length || !pctOk)}>저장</button>`);
  }
  function openEdit(pid, reopenId) {
    const p = prod(pid);
    if (!p || !p.cfg) return;
    S.form = C.editInit(p);
    let conflict = {};
    const r = reopenId ? S.sent.find((x) => x.id === reopenId) : lastRec((x) => x.type === 'edit' && x.pid === pid);
    if (r && stOf(r).st === 'conflict') { conflict = (stOf(r).row || {}).conflict || {}; S.dismissed[r.id] = true; }
    openDlg({ kind: 'edit', pid, conflict });
  }
  function dlgHome() {
    const d = S.dlg;
    const pr = B().prefs || {};
    const n = (d.home || '').split(/[,，]/).filter((x) => x.trim()).length;
    return dlgShell('sm', 'dH', `<div style="flex:1"><h2 id="dH">당근 내 동네</h2></div>${xBtn}`,
      `<label class="sr" for="homeIn">당근 내 동네</label><input class="field" id="homeIn" data-hfield="home" placeholder="예: 시흥시, 정왕동" value="${esc(d.home)}" autocomplete="off">
       <p class="hint">시·군·구(시흥시, 성남시 분당구)로 적으면 그 안의 동네 전체, 동(정왕동)으로 적으면 당근이 알려 주는 근처 동네까지 봐요. 쉼표로 이웃 도시도 함께 적을 수 있어요(5곳까지, 첫째가 내 동네, 예: 시흥시, 인천 남동구). 곳이 많아도 당근에 묻는 횟수는 늘리지 않아요(빠른 확인은 첫째 곳만).</p>
       <p class="conf-note" id="homeMany"${n > C.HOME_MAX ? '' : ' hidden'}>내 동네는 5곳까지예요. 하나를 빼고 더해 주세요</p>
       <p class="flabel">거리 기준 (선택)</p><input class="field" id="baseIn" data-hfield="base" placeholder="예: 정왕동 (비우면 고른 동네 가운데)" value="${esc(d.base)}" autocomplete="off">
       <p class="hint">당근 매물까지 몇 km 인지 여기서 재요. 큰 시는 가운데에서 재면 동네마다 몇 km 씩 틀어지니 사는 동을 적어 두세요. 물건마다 '조건 → 당근 거리'에서 3·5·10·20km 안만 볼 수 있어요.</p>`,
      `${str(pr.daangnHome) ? '<button class="btn btn-text coral" data-act="homeClear">지우기</button>' : ''}<span class="grow"></span><button class="btn btn-text gray" data-act="close">취소</button><button class="btn btn-fill" data-act="homeGo" id="homeGo"${locked() ? lk() : dis(n > C.HOME_MAX || (d.home.trim() === str(pr.daangnHome).trim() && d.base.trim() === str(pr.distanceBase).trim()))}>저장</button>`);
  }
  // 판단 창 (C-7)
  function drawerSheet() {
    const d = S.dlg;
    const hit = anyListing(d.key);
    if (!hit) return '';
    const l = hit.l, p = d.pid ? prod(d.pid) : hit.p;
    const t = now();
    const sheet = l.sheet && typeof l.sheet === 'object' ? l.sheet : {};
    const factsL = arr(sheet.facts).length ? arr(sheet.facts) : [l.news ? `흥정 신호 · ${l.news}` : '', l.dups > 0 ? `같은 글 ${l.dups}개 더` : ''].filter(Boolean);
    const starOn = !!l.star;
    const starPend = S.sent.some((r) => r.type === 'star' && r.key === l.key && C.isOpen(stOf(r).st));
    const words = arr(sheet.words);
    const exPend = (w) => p && S.sent.some((r) => r.type === 'excludeWord' && r.pid === p.id && (S.plain[r.id] || {}).word === w && C.isOpen(stOf(r).st));
    const isAdhoc = !!hit.adhoc || d.adhoc;
    const hidden = p && lastHide(p.id, l.key);
    return `<div class="scrim clear" data-act="scrim"></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dL"><div class="dhead"><h2 id="dL" class="sr">판단 창</h2><span style="flex:1"></span>${xBtn}</div>
      <div class="dbody"><div class="sheet-head">${thumb(l, 'lg')}<div style="min-width:0"><p class="ltitle" style="white-space:normal;font-size:1rem">${esc(l.title)}</p><p class="facts sheet-meta">${mkMark(l.m, true)} ${esc([MARKET[l.m], l.variant ? `변형 ${l.variant}` : '', placeText(l.place), ago(l.firstSeen, t)].filter(Boolean).join(' · '))}</p></div></div>
        <div class="price-row" style="margin-top:14px"><span class="price" style="font-size:1.75rem">${esc(won(l.price))}</span>${badge(l.grade, false)}</div>
        ${l.grade && l.grade.why ? `<p class="facts" style="color:var(--ink2)">${esc(l.grade.why)}</p>` : ''}
        ${factsL.length ? `<div class="facts-box">${factsL.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
        <div class="sheet-acts"><a class="btn btn-fill" ${ext(l)} data-act="opened" data-key="${esc(l.key)}" data-pid="${esc(p ? p.id : '')}">${esc(MARKET[l.m] || '원 매물')}에서 열기 ${ico('ext')}<span class="sr">새 창에서 열려요</span></a>
          <button class="btn" data-act="star" data-key="${esc(l.key)}" data-pid="${esc(p ? p.id : '')}" data-on="${starOn ? 0 : 1}" aria-pressed="${starOn}"${lk()}>${starPend ? `<span class="iconbtn pending" style="width:20px;height:20px">${ico('star')}</span> 보내는 중` : starOn ? `${ico('star', 'fill')} 지켜보는 중` : `${ico('star')} 지켜보기`}</button>
          ${p ? (hidden ? `<span class="chg-pill">이 매물은 빼고 볼게요</span>` : `<button class="btn" style="color:var(--ink2)" data-act="hide" data-key="${esc(l.key)}" data-pid="${esc(p.id)}"${lk()}>${ico('eyeoff')} 이 매물 아님</button>`) : ''}</div>
        ${p ? '<p class="hint">이 매물 아님 = 이 물건의 최저가·시세·알림에서 빼요(오판 사례로 남겨 규칙을 고쳐요)</p>' : ''}
        ${p && words.length ? `<p class="flabel" style="margin-top:20px">이 말이 든 매물은 모두 빼기</p><p class="desc" style="margin:0">찾는 물건이 아닌 걸 가르는 말을 누르세요 · '빼고 볼 단어'에 들어가요</p>
          <div class="wchips">${words.map((w) => exPend(w) ? `<span class="cchip ex">− ${esc(w)} ${chgPill}</span>` : `<button class="cchip" data-act="exWord" data-w="${esc(w)}" data-pid="${esc(p.id)}" data-key="${esc(l.key)}"${lk()}>${esc(w)}</button>`).join('')}</div>` : ''}
        ${isAdhoc ? '<p class="hint" style="margin-top:16px">저장한 물건에서 연 매물이 아니라 시세 판정은 참고용이에요</p>' : ''}
      </div></aside>`;
  }
  // 변화 기록 (C-11)
  function drawerWatch() {
    const w = arr(B().watches).find((x) => x && x.listing && x.listing.key === S.dlg.key);
    if (!w) return '';
    const l = w.listing, t = now();
    const ev = arr(w.events);
    const from = Number.isFinite(w.addedPrice) ? w.addedPrice : null;
    return `<div class="scrim clear" data-act="scrim"></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dW"><div class="dhead"><h2 id="dW" style="font-size:1rem;flex:1">${esc(l.title)}</h2>${xBtn}</div>
      <div class="dbody">${from != null ? `<p class="ink2">지켜볼 때 ${esc(won(from))} → 지금 ${esc(won(l.price))}</p>` : (w.since ? `<p class="ink2">지켜본 뒤 ${esc(w.since)} · 지금 ${esc(won(l.price))}</p>` : '')}
        <p class="flabel">변화 기록</p>${ev.length ? `<ul class="cmdlist">${ev.map((e) => `<li><span class="muted">${ico('clock')}</span><div><div class="w">${esc(e.text)}</div><div class="s"><span class="muted">${esc(clock(e.t, t))}</span></div></div></li>`).join('')}</ul>` : '<p class="hint">아직 바뀐 게 없어요</p>'}
        <div class="sheet-acts"><a class="btn btn-fill" ${ext(l)} data-act="opened" data-key="${esc(l.key)}" data-pid="${esc(w.pid || '')}">${esc(MARKET[l.m] || '원 매물')}에서 열기 ${ico('ext')}</a>
          ${w.src === 'auto' && !w.ended ? `<button class="btn" data-act="watchPin" data-key="${esc(l.key)}"${lk()}>★로 고정</button><button class="btn" data-act="watchOff" data-key="${esc(l.key)}"${lk()}>그만 보기</button>` : ''}</div></div></aside>`;
  }
  // 명령 목록 (C-16)
  function drawerCmds() {
    const L = S.sent.filter((r) => !C.QUIET.includes(r.type) && stOf(r).st !== 'cancel').slice().reverse().slice(0, 50);
    const t = now();
    const rows = L.map((r) => {
      const s = stOf(r), line = C.lineOf(r, s, { appOff: late() });
      if (!line) return '';
      const color = line.cls === 'bad' ? 'var(--coral)' : line.cls === 'run' ? 'var(--brand-bright)' : 'var(--ink2)';
      const acts = [];
      if (line.cancel && r.n) acts.push(`<button class="btn btn-text gray btn-sm" data-act="cancel" data-id="${esc(r.id)}">취소</button>`);
      if (line.reopen && r.pid && prod(r.pid)) acts.push(`<button class="btn btn-text btn-sm" data-act="edit" data-pid="${esc(r.pid)}" data-reopen="${esc(r.id)}">새 값으로 조건 열기</button>`);
      if (line.retry && S.plain[r.id]) acts.push(`<button class="btn btn-text btn-sm" data-act="retry" data-id="${esc(r.id)}">다시 보내기</button>`);
      if (C.isBad(s.st) && !S.dismissed[r.id]) acts.push(`<button class="btn btn-text gray btn-sm" data-act="dismiss" data-id="${esc(r.id)}">닫기</button>`);
      return `<li><span style="color:${color}">${ico(line.icon)}</span><div><div class="w">${esc(whatOf(r))}</div><div class="s ${line.cls}">${line.lead ? `<b>${esc(line.lead)}</b> — ` : ''}${esc(line.text)} <span class="muted">· ${esc(clock(r.at, t))}</span>${isIos() && s.st === 'sent' ? '<span class="muted"> · 앱을 열면 처리해요</span>' : ''}</div>${acts.length ? `<div class="cacts">${acts.join('')}</div>` : ''}</div></li>`;
    }).join('');
    return `<div class="scrim clear" data-act="scrim"></div><aside class="drawer sm" role="dialog" aria-modal="true" aria-labelledby="dC"><div class="dhead"><div style="flex:1"><h2 id="dC">보낸 명령</h2><p class="desc">최근 7일 · 앱이 처리한 결과가 묶음으로 와요${isIos() ? ' · 아이폰은 앱을 열면 처리해요' : ''}</p></div>${xBtn}</div>
      <div class="dbody">${rows ? `<ul class="cmdlist">${rows}</ul>` : '<p class="empty">보낸 명령이 없어요</p>'}</div></aside>`;
  }
  // 카드 ⋯ 메뉴 — 앱과 같은 6줄·같은 순서
  function menuHTML() {
    const m = S.menu, p = prod(m.pid);
    if (!p) return '';
    const i = prods().indexOf(p), n = prods().length;
    const fp = B().focusPlan;
    const focused = fp && arr(fp.ids).includes(p.id) && fp.until > now();
    const L = lk();
    return `<div class="menu-scrim" data-act="menuClose"></div><div class="menu" role="menu" aria-label="${esc(p.name)} 메뉴" style="top:${m.top}px;left:${m.left}px">
      <button role="menuitem" data-act="edit" data-pid="${esc(p.id)}"${L || (p.cfg ? '' : ' disabled')}>조건 · 꿀매 기준 · 목표가</button>
      <button role="menuitem" data-act="identify" data-pid="${esc(p.id)}"${L}>물건 다시 정하기</button>
      <button role="menuitem" data-act="${focused ? 'focusStop' : 'focusOne'}" data-pid="${esc(p.id)}"${L}>${focused ? '집중 감시 끄기' : '집중 감시 1시간 (5분마다)'}</button>
      <button role="menuitem" data-act="move" data-pid="${esc(p.id)}" data-dir="up"${L || dis(i <= 0)}>위로</button>
      <button role="menuitem" data-act="move" data-pid="${esc(p.id)}" data-dir="down"${L || dis(i >= n - 1)}>아래로</button>
      <button role="menuitem" class="coral" data-act="delete" data-pid="${esc(p.id)}"${L}>그만 지켜보기</button></div>`;
  }
  function renderLayer(focusFirst) {
    const el = $('#layer');
    const body = el.querySelector('.dbody');
    const keep = body ? body.scrollTop : 0;
    let html = '';
    if (S.menu) html = menuHTML();
    else if (S.dlg) {
      const fn = { pw: dlgPw, add: dlgAdd, identify: dlgIdentify, variant: dlgVariant, edit: dlgEdit, delete: dlgDelete, home: dlgHome, sheet: drawerSheet, watchlog: drawerWatch, cmds: drawerCmds }[S.dlg.kind];
      html = fn ? fn() : '';
      if (!html) S.dlg = null;
    }
    el.innerHTML = html;
    const nb = el.querySelector('.dbody');
    if (nb && !focusFirst) nb.scrollTop = keep;
    if (focusFirst) {
      const first = S.dlg && S.dlg.kind === 'delete' ? $('#delCancel')
        : el.querySelector('.dialog input, .drawer input') || el.querySelector('.menu button:not([disabled])') || el.querySelector('.dialog button, .drawer button, .dialog a, .drawer a');
      if (first) first.focus();
    }
  }

  /* =====================================================================
   * 특수 화면 (잠금 · 첫 연결 C-17)
   * ===================================================================== */
  function renderSpecial() {
    const p = S.phase;
    if (p === 'lock') {
      const tokbox = S.needToken ? `<div class="tokbox">
          <p class="ink2">처음 한 번만: 데이터 저장소와 <b>웹 토큰</b>을 넣어 주세요. 토큰은 이 기기에 비밀번호로 잠가 둬요.</p>
          <dl class="perm"><dt>저장소</dt><dd>junggo-dash-data 하나만</dd><dt>Contents</dt><dd>읽기 (Read-only)</dd><dt>Issues</dt><dd>읽기와 쓰기 (Read and write) <span class="pill brand">명령 보내기용</span></dd><dt>기한</dt><dd>90일 (초안)</dd></dl>
          <p class="hint" style="margin:0 0 10px">Issues 쓰기는 앱에 명령을 보내는 데만 써요. 명령은 비밀번호로 잠가 보내서, 토큰만으로는 물건·조건을 바꿀 수 없어요. 묶음 파일은 이 토큰으로 못 바꿔요. 새면 GitHub 에서 그 토큰만 지우면 끝이에요.</p>
          <label class="field-l" for="lkRepo">데이터 저장소(주인/이름)</label><input id="lkRepo" type="text" autocomplete="off" spellcheck="false" value="${esc(S.repo || DEFAULT_REPO)}">
          <label class="field-l" for="lkTok">웹 토큰</label><input id="lkTok" type="password" autocomplete="off" placeholder="github_pat_…">
        </div>` : '';
      return `<form class="center" id="lockForm" aria-labelledby="lk"><h1 id="lk">${ico('lock')} 잠긴 레이더예요</h1>
        <p>앱이 판정한 결과가 이 비밀번호로 잠겨 있어요. 비밀번호는 이 기기 밖으로 나가지 않아요.</p>
        <label class="sr" for="pw">비밀번호</label><input id="pw" type="password" placeholder="비밀번호" autocomplete="current-password">
        ${tokbox}
        <p class="err" id="pwErr" ${S.lockErr ? '' : 'hidden'}>${esc(S.lockErr)}</p>
        <label class="chk"><input type="checkbox" id="remember" checked> 이 기기에서 기억하기 <span class="muted">(보기만 — 명령은 탭마다 비밀번호를 한 번 더 물어요)</span></label>
        <div class="row-actions"><button class="btn btn-fill" id="unlock" type="submit"${S.busy ? ' disabled' : ''}>${S.busy ? '여는 중…' : '열기'}</button></div></form>`;
    }
    if (p === 'loading') return `<div class="home"><section><div class="skel" style="width:140px;height:22px;margin-bottom:16px"></div>
      <div class="cards">${'<div class="skel skel-card"></div>'.repeat(4)}</div></section>
      <aside><div class="skel" style="width:120px;height:22px;margin-bottom:16px"></div>${'<div class="skel" style="height:84px;margin-bottom:8px;border-radius:16px"></div>'.repeat(2)}</aside></div>`;
    if (p === 'first') return `<section class="center"><h1>앱이 아직 결과를 올리지 않았어요</h1>
      <p>앱 설정 › 웹 대시보드 연결에서 '결과 올리기'를 켜 주세요. 켜면 다음 확인이 끝날 때 여기에 보여요.</p>
      <div class="row-actions"><a class="btn" href="./old.html${esc(location.search)}" target="_blank" rel="noopener">예전 보기</a></div></section>`;
    if (p === 'version') return `<section class="center"><h1>앱과 웹 판이 맞지 않아요</h1>
      <p>웹을 새로고침해 주세요. 그래도 같으면 앱을 새 판으로 올려 주세요.</p>
      <div class="row-actions"><button class="btn btn-fill" data-act="reload">${ico('refresh')} 새로고침</button></div></section>`;
    if (p === 'token') return `<section class="center"><h1 style="color:var(--coral)">웹 토큰이 막혔어요</h1>
      <p>설정에서 다시 넣어 주세요. 토큰 기한이 지났거나 권한이 바뀌었을 수 있어요.</p>
      <div class="row-actions"><button class="btn btn-fill" data-act="retok">토큰 다시 넣기</button></div></section>`;
    return null;
  }

  /* =====================================================================
   * 그리기
   * ===================================================================== */
  function render(o) {
    o = o || {};
    renderHead();
    const page = $('#page');
    const sp = renderSpecial();
    if (sp) { page.innerHTML = sp; $('#layer').innerHTML = ''; const pw = $('#pw'); if (pw) pw.focus(); return; }
    S.level = live().level;
    // 입력 중인 칸(검색창·결과 안에서 찾기)의 초점·커서를 지켜요
    const a = document.activeElement;
    const keepId = a && a.id && page.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT') ? a.id : '';
    const sel = keepId && a.tagName === 'INPUT' && a.type !== 'checkbox' ? [a.selectionStart, a.selectionEnd] : null;
    page.innerHTML = S.tab === 'product' ? renderProduct()
      : S.tab === 'adhoc' ? renderAdhoc()
      : S.tab === 'watch' ? renderWatch()
      : S.tab === 'inbox' ? renderInbox()
      : S.tab === 'settings' ? renderSettings()
      : renderHome();
    if (keepId) { const n = document.getElementById(keepId); if (n) { n.focus(); if (sel && n.setSelectionRange) try { n.setSelectionRange(sel[0], sel[1]); } catch { /* 검색 칸 */ } } }
    // 창에 입력 중이면 창은 그대로(뒤에서 묶음이 와도 친 글이 날아가지 않게)
    const typing = o.bg && S.dlg && ['edit', 'add', 'pw', 'home'].includes(S.dlg.kind);
    if (!typing) renderLayer();
  }
  function setPhase(p) { S.phase = p; render(); }

  // ---------- 주소(#) ↔ 보기 ----------
  function fromHash() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (h.startsWith('p=')) { S.tab = 'product'; S.pid = h.slice(2); }
    else if (h === 'adhoc') S.tab = S.adhocQ ? 'adhoc' : 'home';
    else if (h === 'watch' || h === 'inbox' || h === 'settings') S.tab = h;
    else if (h === 'status') S.tab = 'settings';
    else S.tab = 'home';
  }
  function go(tab, pid) {
    // 홈 탭을 한 번 더 누르면 결과 화면을 닫고 홈으로(앱 MainScreen 과 같게)
    const h = tab === 'product' ? '#p=' + encodeURIComponent(pid) : tab === 'home' ? '#' : '#' + tab;
    S.menu = null;
    if (location.hash === h || (h === '#' && !location.hash)) { fromHash(); render(); window.scrollTo(0, 0); }
    else location.hash = h;
  }
  window.addEventListener('hashchange', () => { fromHash(); if (S.phase === 'ready') { S.dlg = null; render(); window.scrollTo(0, 0); } });

  // ---------- 받기 · 열기 ----------
  async function getJson(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    try { return await r.json(); } catch { return null; }
  }
  function show(bundle, bg) {
    if (RV.check(bundle)) { S.bundle = null; setPhase('version'); return; }
    S.bundle = bundle;
    S.phase = 'ready';
    afterBundle();
    render({ bg });
  }
  async function openBox(box, key) { return BOX.open(box, key, RV.LABEL); }
  async function remember(box, key, on) {
    if (on) LS.set(K_KEY, { salt: box.salt, raw: await BOX.exportKey(key) });
    else LS.del(K_KEY);
  }
  async function saveToken(box, key) {
    const sealed = await BOX.seal({ t: S.token }, key, box.salt, RV.TOKEN_LABEL, box.iter);
    LS.set(K_TOK, { salt: box.salt, iter: box.iter || BOX.ITER, repo: S.repo, box: sealed, ro: false });
  }
  async function pull(first) {
    S.pulledAt = now();
    if (LOCAL_SRC) {
      const plain = await getJson(`${LOCAL_SRC}/radar.json?t=${now()}`);
      if (plain) { show(plain, !first); return; }
      const box = await getJson(`${LOCAL_SRC}/radar.enc?t=${now()}`);
      if (!box) { if (first || !S.bundle) setPhase('first'); return; }
      return gotBox(box, first);
    }
    const res = await RV.fetchRadar({ repo: S.repo, token: S.token });
    if (!res.ok) {
      if (res.why === 'token') { S.bundle = null; setPhase('token'); return; }
      if (res.why === 'missing') { if (!S.bundle) setPhase('first'); return; }
      if (res.why === 'bad') { S.bundle = null; setPhase('version'); return; }
      if (!S.bundle) { S.lockErr = res.why === 'rate' ? 'GitHub 요청 한도에 걸렸어요 — 몇 분 뒤 다시 열어 주세요.' : '데이터를 받지 못했어요 — 인터넷 연결을 확인해 주세요.'; S.needToken = false; setPhase('lock'); }
      return;
    }
    return gotBox(res.box, first);
  }
  async function gotBox(box, first) {
    S.box = box;
    if (S.bundle && box.ct === S.lastCt) { afterBundle(); render({ bg: true }); return; }
    if (S.key && box.salt === S.salt) {
      try { const v = await openBox(box, S.key); S.lastCt = box.ct; show(v, !first); return; } catch { /* 열쇠가 바뀜 → 비밀번호 */ }
    }
    if (!S.key) {
      const k = LS.get(K_KEY);
      if (k && k.salt === box.salt && typeof k.raw === 'string') {
        try { const key = await BOX.importKey(k.raw); const v = await openBox(box, key); S.key = key; S.salt = box.salt; S.lastCt = box.ct; show(v, !first); return; } catch { LS.del(K_KEY); }
      }
    }
    S.key = null; S.cmdKey = null; S.bundle = null; S.needToken = false; S.lockErr = first ? '' : '앱의 잠금 열쇠가 바뀌었어요 — 비밀번호를 다시 넣어 주세요.';
    setPhase('lock');
  }

  async function unlock() {
    if (S.busy) return;
    const pw = $('#pw').value;
    const keep = $('#remember').checked;
    const tokIn = $('#lkTok') ? $('#lkTok').value.trim() : '';
    const repoIn = $('#lkRepo') ? $('#lkRepo').value.trim() : '';
    const fail = (msg) => { S.busy = false; S.lockErr = msg; setPhase('lock'); };
    if (!pw) return fail('비밀번호를 적어 주세요.');
    if (S.needToken && !tokIn) return fail('웹 토큰을 넣어 주세요.');
    if (S.needToken && !RV.REPO_RE.test(repoIn)) return fail("데이터 저장소는 '주인/이름' 꼴로 적어 주세요.");
    S.busy = true; S.lockErr = ''; render();
    try {
      let key = null;
      if (LOCAL_SRC) {
        const box = S.box || await getJson(`${LOCAL_SRC}/radar.enc?t=${now()}`);
        if (!box || !BOX.isBox(box)) return fail('잠근 묶음이 없어요.');
        key = await BOX.deriveKey(pw, box.salt, box.iter);
        let v;
        try { v = await openBox(box, key); } catch { return fail('비밀번호가 맞지 않아요'); }
        S.key = key; S.salt = box.salt; S.lastCt = box.ct; S.box = box;
        await remember(box, key, keep);
        S.busy = false; show(v); return;
      }
      const rt = LS.get(K_TOK);
      if (S.needToken) { S.token = tokIn; S.repo = repoIn; S.ro = false; }
      else if (!S.token && rt && rt.box) {
        key = await BOX.deriveKey(pw, rt.salt, rt.iter);
        try { const o = await BOX.open(rt.box, key, RV.TOKEN_LABEL); S.token = str(o && o.t); S.repo = rt.repo || DEFAULT_REPO; S.ro = !!rt.ro; } catch { return fail('비밀번호가 맞지 않아요'); }
      } else if (!S.token) { S.needToken = true; return fail('웹 토큰을 넣어 주세요.'); }
      const res = await RV.fetchRadar({ repo: S.repo, token: S.token });
      if (!res.ok) {
        if (res.why === 'token') { S.needToken = true; return fail(res.status === 401 ? '토큰이 맞지 않거나 기한이 지났어요.' : '이 토큰으로는 이 데이터 저장소를 볼 수 없어요 — 토큰을 만들 때 저장소를 골랐는지, 이름이 맞는지 확인해 주세요.'); }
        if (res.why === 'missing') { S.busy = false; setPhase('first'); return; }
        if (res.why === 'bad') { S.busy = false; setPhase('version'); return; }
        if (res.why === 'repo') { S.needToken = true; return fail("데이터 저장소는 '주인/이름' 꼴로 적어 주세요."); }
        return fail(res.why === 'rate' ? 'GitHub 요청 한도에 걸렸어요 — 몇 분 뒤 다시 해 주세요.' : '데이터를 받지 못했어요 — 인터넷 연결을 확인해 주세요.');
      }
      const box = res.box;
      if (!key || (rt && rt.salt !== box.salt) || S.needToken) key = await BOX.deriveKey(pw, box.salt, box.iter);
      let v;
      try { v = await openBox(box, key); } catch { return fail('비밀번호가 맞지 않아요'); }
      S.key = key; S.salt = box.salt; S.lastCt = box.ct; S.box = box; S.needToken = false;
      const wasRo = S.ro;
      await saveToken(box, key);
      if (wasRo) { const t2 = LS.get(K_TOK); if (t2) LS.set(K_TOK, { ...t2, ro: true }); }
      await remember(box, key, keep);
      S.busy = false; show(v);
    } catch {
      fail('열지 못했어요 — 새로고침한 뒤 다시 해 주세요.');
    }
  }
  // 명령 비밀번호(탭마다 한 번): 지금 묶음 상자로 맞는지 보고, 꺼낼 수 없는 열쇠를 메모리에만
  async function pwGo() {
    const d = S.dlg;
    if (!d || d.busy) return;
    const pw = $('#cmdPw') ? $('#cmdPw').value : '';
    if (!pw) { d.err = '비밀번호를 적어 주세요.'; renderLayer(); return; }
    d.busy = true; d.err = ''; renderLayer();
    try {
      const k = await C.deriveCmdKey(pw, S.box.salt, S.box.iter || BOX.ITER);
      await BOX.open(S.box, k, RV.LABEL); // 맞는 비밀번호인지
      S.cmdKey = k;
      const pend = S.pend;
      S.pend = null; S.dlg = null;
      renderLayer();
      if (pend) await send(pend.type, pend.fields, pend.o);
      else render();
    } catch {
      d.busy = false; d.err = '비밀번호가 맞지 않아요'; renderLayer();
      const i = $('#cmdPw'); if (i) i.focus();
    }
  }

  async function boot() {
    if (location.search) $('#oldView').href = './old.html' + location.search;
    loadSent();
    fromHash();
    render();
    if (LOCAL_SRC) { await pull(true); return; }
    const rt = LS.get(K_TOK);
    if (rt && rt.repo) S.repo = rt.repo;
    if (rt) S.ro = !!rt.ro;
    const k = LS.get(K_KEY);
    if (rt && rt.box && k && k.salt === rt.salt && typeof k.raw === 'string') {
      try {
        const key = await BOX.importKey(k.raw);
        const o = await BOX.open(rt.box, key, RV.TOKEN_LABEL);
        S.token = str(o && o.t); S.key = key; S.salt = k.salt;
        await pull(true);
        if (S.sent.some((r) => r.at > now() - C.POLL_FOR_MS)) S.pollUntil = now() + C.POLL_FOR_MS;
        return;
      } catch { /* 비밀번호로 */ }
    }
    S.needToken = !(rt && rt.box);
    setPhase('lock');
  }

  /* =====================================================================
   * 동작
   * ===================================================================== */
  function csvSave(ns) {
    let rows = [], name = '';
    if (ns.startsWith('adhoc:')) { const a = adhocEntry(); if (!a) return; rows = visibleRows(listOf(a), ns).rows; name = S.adhocQ; }
    else { const p = prod(ns); if (!p) return; rows = visibleRows(listOf(p), p.id).rows; name = p.name; }
    const blob = new Blob([RV.csv(rows, now())], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `꿀매레이더-${str(name).replace(/[\\/:*?"<>|]/g, '_')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function doSearch(q) {
    q = str(q).trim();
    if (!q) return;
    const t = now();
    S.searchText = q;
    S.adhocQ = q; SS.set(SS_ADHOC, q); S.adhocSwap = '';
    S.ptab = 'list';
    if (C.adhocCached(B(), q, t)) { go('adhoc'); return; } // 30분 안 같은 검색어 — 보내지 않음
    if (C.adhocUse(B(), S.sent, t).full) { toast(`1시간에 ${C.ADHOC_PER_HOUR}번까지예요`); render(); return; }
    go('adhoc');
    await send('adhoc', { q });
  }
  function recentDelLater(q) {
    S.recentHidden.add(q);
    render();
    const h = setTimeout(() => { if (S.recentHidden.has(q)) send('recent', q === '*' ? { op: 'clear' } : { op: 'del', q }, { quiet: true }); }, C.TOAST_MS);
    toast(q === '*' ? '최근 검색을 지웠어요' : `'${q}' 검색 기록을 지웠어요`, { label: '되돌리기', run: () => { clearTimeout(h); S.recentHidden.delete(q); render(); } });
  }
  function setPref(field, value) {
    const pr = B().prefs || {};
    send('prefs', { set: { [field]: value }, base: { [field]: pr[field] === undefined ? null : pr[field] } });
  }
  function menuAt(btn, pid) {
    const r = btn.getBoundingClientRect();
    const narrow = window.innerWidth < 760;
    const left = narrow ? 16 : Math.max(8, Math.min(window.innerWidth - 248, r.right - 240));
    const top = narrow ? Math.max(8, window.innerHeight - 280) : Math.min(window.innerHeight - 260, r.bottom + 4);
    S.menu = { pid, top: Math.round(top), left: Math.round(left) };
    S.opener = btn.id || null;
    renderLayer(true);
  }

  document.addEventListener('submit', (e) => {
    const id = e.target.id;
    if (id === 'lockForm') { e.preventDefault(); unlock(); }
    else if (id === 'searchForm') { e.preventDefault(); doSearch($('#q').value); }
    else if (id === 'pwForm') { e.preventDefault(); pwGo(); }
    else if (id === 'addForm') { e.preventDefault(); const b = $('#addGo'); if (b && !b.disabled) b.click(); }
    else if (id === 'shareForm') {
      e.preventDefault();
      const u = $('#shareUrl').value.trim();
      if (!C.shareOk(u)) { const er = $('#shareErr'); er.classList.add('bad'); er.focus && er.focus(); return; }
      send('share', { url: u }).then((r) => { if (r) { const i = $('#shareUrl'); if (i) i.value = ''; } });
    }
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-go],[data-open],[data-pick]');
    if (!t) return;
    if (t.disabled) return;
    const a = t.dataset.act;
    if (t.dataset.go) { e.preventDefault(); S.dlg = null; go(t.dataset.go); return; }
    if (t.dataset.open) { e.preventDefault(); S.dlg = null; go('product', t.dataset.open); return; }
    if (t.dataset.pick) { e.preventDefault(); S.q = ''; go('product', t.dataset.pick); return; }
    const pid = t.dataset.pid, key = t.dataset.key;
    switch (a) {
      // 창·메뉴
      case 'scrim': if (e.target === t) closeDlg(); return;
      case 'close': closeDlg(); return;
      case 'menuClose': S.menu = null; renderLayer(); return;
      case 'menu': e.stopPropagation(); menuAt(t, pid); return;
      case 'toast': { const tt = S.toast; S.toast = null; renderToast(); if (tt && tt.act) tt.act.run(); return; }
      case 'cmds': openDlg({ kind: 'cmds' }); return;
      case 'reload': location.reload(); return;
      case 'retok': S.needToken = true; S.lockErr = ''; S.dlg = null; setPhase('lock'); return;
      case 'forget': LS.del(K_KEY); LS.del(K_TOK); LS.del(K_CMDS); SS.del(SS_PLAIN); SS.del(SS_ADHOC); S.sent = []; S.plain = {}; S.key = null; S.cmdKey = null; S.token = ''; S.bundle = null; S.needToken = true; setPhase('lock'); return;
      // 명령 상태
      case 'cancel': { const r = S.sent.find((x) => x.id === t.dataset.id); if (r) cancel(r); return; }
      case 'retry': { const r = S.sent.find((x) => x.id === t.dataset.id); if (r) retry(r); return; }
      case 'dismiss': S.dismissed[t.dataset.id] = true; render(); return;
      // 홈
      case 'recentGo': doSearch(t.dataset.q); return;
      case 'recentDel': recentDelLater(t.dataset.q); return;
      case 'recentClear': recentDelLater('*'); return;
      case 'checkAll': send('check', {}); return;
      case 'add': openDlg({ kind: 'add', text: '', useCard: true }); return;
      case 'addCard': {
        const cards = arr(B().cards).length ? B().cards : C.QUICK;
        const c = cards.find((x) => x.id === t.dataset.card);
        if (!c) return;
        S.dlg = null; renderLayer();
        send('add', { q: c.keyword, card: /^(gpu:[0-9]{4}|console:ps5)$/.test(c.id) ? c.id : undefined });
        return;
      }
      case 'addSugToggle': S.dlg.useCard = S.dlg.useCard === false; $('#addSug').innerHTML = sugHTML(C.suggest(S.dlg.text || ''), S.dlg.useCard !== false); return;
      case 'addGo': {
        const text = (S.dlg.text || '').trim();
        if (!text) return;
        const sug = C.suggest(text);
        const card = sug && S.dlg.useCard !== false ? sug.id : undefined;
        S.dlg = null; renderLayer();
        send('add', { q: text, card });
        return;
      }
      case 'identify': S.menu = null; openIdentify(pid); return;
      case 'idCat': S.dlg.sel.category = t.dataset.k; renderLayer(); return;
      case 'idBand': { const i = +t.dataset.i; S.dlg.sel.band = S.dlg.sel.band === i ? null : i; if (S.dlg.sel.band == null) S.dlg.sel.withHigher = false; renderLayer(); return; }
      case 'idHigher': S.dlg.sel.withHigher = !S.dlg.sel.withHigher; renderLayer(); return;
      case 'idWord': { const w = t.dataset.w; const s = S.dlg.sel.words[w] | 0; S.dlg.sel.words[w] = (s + 1) % 3; renderLayer(); return; }
      case 'idGo': {
        const p = prod(S.dlg.pid);
        if (!p) return;
        const set = C.identifySet(p, S.dlg.sel);
        S.dlg = null; renderLayer();
        send('identify', { pid: p.id, set });
        return;
      }
      case 'edit': S.menu = null; openEdit(pid, t.dataset.reopen); return;
      case 'ePct': S.form.customPct = false; S.form.thresholdPct = +t.dataset.v; renderLayer(); return;
      case 'ePctCustom': S.form.customPct = true; renderLayer(); { const i = $('#e-thresholdPct'); if (i) i.focus(); } return;
      case 'eVar': S.form.variantPick = t.dataset.v; renderLayer(); return;
      case 'eMatch': S.form.matchMode = t.dataset.v; renderLayer(); return;
      case 'eCat': S.form.category = t.dataset.v; renderLayer(); return;
      case 'eKm': S.form.maxKm = t.dataset.v === 'null' ? null : +t.dataset.v; renderLayer(); return;
      case 'eAge': S.form.maxAgeDays = +t.dataset.v; renderLayer(); return;
      case 'eSw': S.form[t.dataset.k] = !S.form[t.dataset.k]; renderLayer(); return;
      case 'eKeep': S.dlg.askClose = false; renderLayer(); return;
      case 'eDiscard': S.dlg = null; S.form = null; renderLayer(); return;
      case 'eSave': {
        const p = prod(S.dlg.pid);
        const d = C.editDiff(p, S.form);
        if (!d.changed.length) return;
        S.dlg = null; S.form = null; renderLayer();
        send('edit', { pid: p.id, set: d.set, base: d.base });
        return;
      }
      case 'unhideAll': send('unhideAll', { pid }); return;
      case 'delete': S.menu = null; openDlg({ kind: 'delete', pid }); return;
      case 'delGo': { const p = S.dlg.pid; S.dlg = null; renderLayer(); send('remove', { pid: p }); return; }
      case 'move': S.menu = null; renderLayer(); send('move', { pid, dir: t.dataset.dir }); return;
      case 'focusOne': S.menu = null; renderLayer(); send('focus', { op: 'start', ids: [pid], hours: 1, everyMin: 5 }); return;
      case 'focusStop': S.menu = null; renderLayer(); send('focus', { op: 'stop' }); return;
      case 'check': S.dlg = null; send('check', { pid }); return;
      case 'jump': {
        e.preventDefault();
        S.area = 'all'; S.q = ''; S.mkSel = ''; S.variant = ''; S.cond = ''; S.ptab = 'list';
        go('product', pid);
        setTimeout(() => {
          const r = key && document.getElementById('r-' + key);
          if (!r) return;
          r.scrollIntoView({ block: 'center' }); r.classList.add('flash'); r.focus({ preventScroll: true });
          setTimeout(() => r.classList.remove('flash'), 1500);
        }, 0);
        return;
      }
      // 결과 화면 칩
      case 'ptab': S.ptab = t.dataset.t; render(); return;
      case 'mk': S.mkSel = S.mkSel === t.dataset.m ? '' : t.dataset.m; render(); return;
      case 'variant': S.variant = S.variant === t.dataset.v ? '' : t.dataset.v; render(); return;
      case 'cond': S.cond = S.cond === t.dataset.c ? '' : t.dataset.c; render(); return;
      case 'area': S.area = t.dataset.a; render(); return;
      case 'withUnknown': S.withUnknown = !S.withUnknown; render(); return;
      case 'allDaangn': S.allDaangn = !S.allDaangn; render(); return;
      case 'clearF': S.area = 'all'; S.q = ''; S.mkSel = ''; S.variant = ''; S.cond = ''; render(); return;
      case 'csv': csvSave(t.dataset.ns); toast('보이는 매물을 CSV로 저장했어요'); return;
      case 'matchMode': send('edit', { pid, set: { matchMode: t.dataset.v }, base: { matchMode: (prod(pid).cfg || {}).matchMode || 'title' } }); return;
      case 'basic': send('edit', { pid, set: { basicFilter: t.dataset.v === '1' }, base: { basicFilter: (prod(pid).cfg || {}).basicFilter !== false } }); return;
      // 매물
      case 'star': e.stopPropagation(); send('star', { key, pid: pid || undefined, on: t.dataset.on === '1' }); return;
      case 'hide': {
        e.stopPropagation();
        send('hide', { pid, key }).then((r) => {
          if (!r) return;
          toast('이 매물은 빼고 볼게요', { label: '되돌리기', run: () => unhideRec(r, pid, key) });
        });
        return;
      }
      case 'unhideRow': { e.stopPropagation(); const r = S.sent.find((x) => x.id === t.dataset.id); unhideRec(r, pid, key); return; }
      case 'opened': {
        e.stopPropagation();
        // 연 횟수 셈(앱 noteOpened) — 비밀번호를 아직 안 넣었으면 묻지 않고 건너뜀(작은 명령)
        if (S.cmdKey && !locked()) send('opened', { key, pid: pid || undefined }, { quiet: true });
        return; // 링크는 그대로 새 창
      }
      case 'sheet': {
        if (e.target.closest('a,button') && e.target.closest('a,button') !== t) return;
        openDlg({ kind: 'sheet', key, pid: pid || '', adhoc: t.dataset.adhoc === '1' }, t.id || null);
        return;
      }
      case 'exWord': send('excludeWord', { pid, word: t.dataset.w, key: key || undefined }); return;
      // 그냥 검색
      case 'adhocAgain': send('adhoc', { q: S.adhocQ }); return;
      case 'saveAdhoc': { const a2 = adhocEntry(); if (a2 && a2.ask) openDlg({ kind: 'variant' }); else send('saveAdhoc', { q: S.adhocQ, variantPick: '' }); return; }
      case 'saveV': S.dlg = null; renderLayer(); send('saveAdhoc', { q: S.adhocQ, variantPick: t.dataset.v }); return;
      // 관심 매물 · 알림함
      case 'watchPin': send('watch', { key, op: 'pin' }); return;
      case 'watchOff': send('watch', { key, op: 'remove' }); return;
      case 'watchlog': openDlg({ kind: 'watchlog', key }); return;
      case 'inboxOpen': {
        const it = arr(B().inbox).find((x) => x && x.id === t.dataset.id);
        if (it && typeof it.read === 'boolean' && !isRead(it)) { S.readLocal.add(it.id); send('inboxRead', { ids: [it.id] }, { quiet: true }); render(); }
        if (key && anyListing(key)) openDlg({ kind: 'sheet', key, pid: it ? it.pid || '' : '' });
        return;
      }
      case 'readAll': S.readAll = now(); send('inboxRead', { all: true }, { quiet: true }); render(); return;
      // 설정
      case 'prefPct': S.pctCustomOpen = false; setPref('defaultPct', +t.dataset.v); return;
      case 'prefPctCustom': S.pctCustomOpen = true; render(); { const i = $('#prefPctIn'); if (i) i.focus(); } return;
      case 'prefPctSave': {
        const v = ($('#prefPctIn') || {}).value || '';
        if (!/^\d+$/.test(v) || +v < C.PCT_MIN || +v > C.PCT_MAX) { $('#prefPctErr').hidden = false; return; }
        S.pctCustomOpen = false; setPref('defaultPct', +v); return;
      }
      case 'prefAuto': setPref('autoWatchN', +t.dataset.v); return;
      case 'prefInten': setPref('intensity', t.dataset.v); return;
      case 'prefQuietOn': { const q = (B().prefs || {}).quiet || { on: true, start: 1, end: 7 }; setPref('quiet', { on: !q.on, start: q.start, end: q.end }); return; }
      case 'prefQuiet': setPref('quiet', { on: true, start: +t.dataset.a, end: +t.dataset.z }); return;
      case 'prefDigest': setPref('digestOn', !(B().prefs || {}).digestOn); return;
      case 'focusPick': {
        const fp = B().focusPlan;
        S.focusPick = S.focusPick ? null : { ids: fp && fp.until > now() ? arr(fp.ids).slice(0, C.FOCUS_MAX) : [], hours: 1, every: fp && fp.everyMin === 10 ? 10 : 5 };
        render(); return;
      }
      case 'focusId': {
        const ids = S.focusPick.ids;
        const i = ids.indexOf(pid);
        if (i >= 0) ids.splice(i, 1); else if (ids.length < C.FOCUS_MAX) ids.push(pid);
        render(); return;
      }
      case 'focusH': S.focusPick.hours = +t.dataset.v; render(); return;
      case 'focusE': S.focusPick.every = +t.dataset.v; render(); return;
      case 'focusGo': { const f = S.focusPick; S.focusPick = null; send('focus', { op: 'start', ids: f.ids, hours: f.hours, everyMin: f.every }); return; }
      case 'homeDlg': { const pr = B().prefs || {}; openDlg({ kind: 'home', home: str(pr.daangnHome), base: str(pr.distanceBase) }); return; }
      case 'homeClear': S.dlg.home = ''; S.dlg.base = ''; renderLayer(); return;
      case 'homeGo': {
        const pr = B().prefs || {};
        const set = {}, base = {};
        if (S.dlg.home.trim() !== str(pr.daangnHome).trim()) { set.daangnHome = S.dlg.home.trim(); base.daangnHome = str(pr.daangnHome); }
        if (S.dlg.base.trim() !== str(pr.distanceBase).trim()) { set.distanceBase = S.dlg.base.trim(); base.distanceBase = str(pr.distanceBase); }
        if (!Object.keys(set).length) return;
        S.dlg = null; renderLayer();
        send('home', { set, base });
        return;
      }
      case 'pwGo': pwGo(); return;
      default:
    }
  });
  async function unhideRec(r, pid, key) {
    if (!r) return;
    const st = stOf(r).st;
    if (st === 'sent' && r.n) { await cancel(r); return; } // 앱이 받기 전 = 취소
    send('unhide', { pid, key });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (S.menu) { S.menu = null; renderLayer(); const b = S.opener && document.getElementById(S.opener); if (b) b.focus(); return; }
      if (S.dlg) { e.preventDefault(); closeDlg(); return; }
    }
    // 창 안에서만 Tab 이 돌아요
    if (e.key === 'Tab' && (S.dlg || S.menu)) {
      const box = $('#layer .dialog') || $('#layer .drawer') || $('#layer .menu');
      if (box) {
        const f = [...box.querySelectorAll('button:not([disabled]),a[href],input,select,[tabindex="0"]')];
        if (f.length) {
          const i = f.indexOf(document.activeElement);
          if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
        }
      }
    }
    if (S.menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const items = [...document.querySelectorAll('#layer .menu button:not([disabled])')];
      const i = items.indexOf(document.activeElement);
      const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      if (items[n]) { e.preventDefault(); items[n].focus(); }
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target.closest('[data-act="sheet"],[data-act="watchlog"],[data-act="inboxOpen"],[data-act="identify"].idband');
    if (t && t === e.target && t.tagName !== 'BUTTON' && t.tagName !== 'A') { e.preventDefault(); t.click(); }
  });
  document.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'fSort') { S.sort = e.target.value; render(); }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'fQ') { S.q = el.value; render(); return; }
    if (el.id === 'q') {
      S.searchText = el.value;
      const cached = el.value.trim() && C.adhocCached(B(), el.value, now());
      const u = C.adhocUse(B(), S.sent, now());
      $('#qUnder').hidden = !cached;
      $('#qGo').disabled = !el.value.trim() || (u.full && !cached);
      return;
    }
    if (el.id === 'addText' && S.dlg && S.dlg.kind === 'add') {
      S.dlg.text = el.value;
      $('#addSug').innerHTML = sugHTML(C.suggest(el.value), S.dlg.useCard !== false);
      $('#addMany').hidden = el.value.split(/[,，]/).filter((x) => x.trim()).length <= 3;
      const b = $('#addGo'); if (!locked()) b.disabled = !el.value.trim();
      return;
    }
    if (el.dataset.field && S.dlg && S.dlg.kind === 'edit') {
      S.form[el.dataset.field] = el.value;
      const p = prod(S.dlg.pid);
      const diff = C.editDiff(p, S.form);
      // 바꾼 칸 점·수·저장 단추만 고쳐 그려요(친 글·초점은 그대로)
      document.querySelectorAll('#layer .flabel[data-f]').forEach((n) => {
        const on = diff.changed.includes(n.dataset.f);
        const dot = n.querySelector('.chgdot');
        if (on && !dot) n.insertAdjacentHTML('afterbegin', '<span class="chgdot" aria-hidden="true"></span>');
        if (!on && dot) dot.remove();
      });
      const cnt = $('#eCount'); if (cnt) cnt.innerHTML = `바꾼 칸 ${diff.changed.length}개 <span class="webonly">웹만</span>`;
      const pctOk = !S.form.customPct || (/^\d+$/.test(String(S.form.thresholdPct)) && +S.form.thresholdPct >= C.PCT_MIN && +S.form.thresholdPct <= C.PCT_MAX);
      const sv = $('#eSave'); if (sv && !locked()) sv.disabled = !diff.changed.length || !pctOk;
      if (el.dataset.field === 'thresholdPct') { const pv = p.pctPreview && p.pctPreview[String(el.value)]; const h = $('#pctHint'); if (h) h.textContent = pv || `시세보다 ${el.value}% 이상 싼 같은 물건을 꿀매로 알려요(시세는 매물이 5건 넘게 모이면 내요)`; }
      return;
    }
    if (el.dataset.hfield && S.dlg && S.dlg.kind === 'home') {
      S.dlg[el.dataset.hfield] = el.value;
      const pr = B().prefs || {};
      const n = S.dlg.home.split(/[,，]/).filter((x) => x.trim()).length;
      $('#homeMany').hidden = n <= C.HOME_MAX;
      const b = $('#homeGo'); if (!locked()) b.disabled = n > C.HOME_MAX || (S.dlg.home.trim() === str(pr.daangnHome).trim() && S.dlg.base.trim() === str(pr.distanceBase).trim());
    }
  });
  // 사진을 못 받으면 빈 사진 칸(페이지 안 onerror 없이 — 콘텐츠 보안 정책)
  document.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.closest('.thumb')) { t.parentElement.classList.remove('has-img'); t.remove(); } }, true);

  // 5분마다(창을 보고 있을 때만) + 창을 다시 볼 때. 명령을 보낸 뒤엔 20초마다·10분까지 이슈 상태 + 묶음
  setInterval(() => { if ((S.phase === 'ready' || S.phase === 'first') && S.token + LOCAL_SRC && document.visibilityState === 'visible') pull(false); }, PULL_MS);
  setInterval(async () => {
    if (S.phase !== 'ready' || now() > S.pollUntil || document.visibilityState !== 'visible') return;
    await refreshIssues();
    await pull(false);
  }, C.POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.phase === 'ready' && now() - S.pulledAt > 30e3) pull(false);
  });
  setInterval(() => { if (S.phase !== 'ready') return; if (live().level !== S.level) render({ bg: true }); else renderHead(); }, 60e3);
  // 끝난 줄 30초 뒤 접기
  setInterval(() => { if (S.phase === 'ready' && Object.values(S.doneSeen).some((t) => now() - t < C.DONE_FOLD_MS + 6e3 && now() - t > C.DONE_FOLD_MS)) render({ bg: true }); }, 5e3);
  // 시험용 손잡이(화면 시험이 시계·폴링을 앞당길 때만 씀 — 비밀은 없음)
  window.__radarTest = { pull: () => pull(false), refresh: () => refreshIssues().then(() => pull(false)), state: () => ({ tab: S.tab, sent: S.sent.length, ro: S.ro, hasKey: !!S.cmdKey }) };
  boot();
})();
