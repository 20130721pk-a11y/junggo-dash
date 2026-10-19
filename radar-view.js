// 꿀매 레이더 웹 2판 — 판정 없는 보기 도우미(순수 함수). 페이지(index.html)와 시험(test/radar-view.test.mjs)이 같이 써요.
//   웹은 앱이 만든 묶음(docs/bundle-v1.md)을 그대로 그려요. 여기서 만드는 글은 'n분 전'·시각·늦음·도구 글뿐이에요.
//   판정·거리 재기·지역 표는 없어요(W2-18).
(function (root) {
  'use strict';

  const KIND = 'junggo-radar-view';
  const KNOWN = [1]; // 웹이 아는 묶음 꼴 번호
  const LABEL = 'junggo-radar-view'; // 잠금 용도 이름(AAD) — 앱 DashBox 와 같아야 해요
  const TOKEN_LABEL = 'junggo-radar-token'; // 이 기기에 잠가 두는 읽기 토큰
  const LATE_MIN = 45; // 늦음 선 아래 끝(초안, 계획서 6-4)
  const DAY_MS = 24 * 3600e3;
  const GAP_DAYS = 7;
  const MARKET = { j: '중고나라', d: '당근', b: '번개장터' };
  const MARK = { j: '중', d: '당', b: '번' };
  const AREAS = ['all', 'near', '3', '5', '10', '20']; // 앱 거리 칩(Geo.KM_CHOICES)과 같은 값
  const TZ = 'Asia/Seoul';

  /* ---------- 묶음 확인 ---------- */
  // 판 다름(꼴 번호·종류·만든 때)을 먼저 가려요. 칸이 조금 빠진 건 그리면서 비워요.
  function check(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return 'version';
    if (b.kind !== KIND || !KNOWN.includes(b.v)) return 'version';
    if (!Number.isFinite(b.made) || b.made <= 0) return 'version';
    return '';
  }
  const arr = (x) => (Array.isArray(x) ? x : []);
  const str = (x) => (typeof x === 'string' ? x : '');

  /* ---------- 늦음 (계획서 6-4) ---------- */
  function lateLineMin(b) {
    const every = Number(b && b.everyMin);
    return Math.max(LATE_MIN, Number.isFinite(every) && every > 0 ? every * 2 : 0);
  }
  // fresh = 정상, late = 늦음 선 넘음, day = 24시간 넘음
  function liveState(b, now) {
    const line = lateLineMin(b);
    const age = Math.max(0, now - b.made);
    const day = age > DAY_MS;
    const late = day || age > line * 60e3;
    return { age, line, late, day, level: day ? 'day' : late ? 'late' : 'fresh' };
  }

  /* ---------- 글 (앱 Common.kt 와 같은 규칙) ---------- */
  const nf = new Intl.NumberFormat('ko-KR');
  // wonText: 850000 → "850,000원", 없으면 "가격문의"
  const won = (n) => (n == null || !(n > 0) ? '가격문의' : nf.format(n) + '원');
  // manWon: 23,000 → "2.3만", 950,000 → "95만", 3,500 → "3,500원"
  function man(v) {
    if (!Number.isFinite(v)) return '';
    if (v < 10000) return nf.format(v) + '원';
    const m = v / 10000;
    if (m >= 10) return Math.trunc(m) + '만';
    const one = Math.round(m * 10) / 10;
    return (one % 1 === 0 ? String(Math.trunc(one)) : String(one)) + '만';
  }
  // agoText: "방금", "3분 전", "2시간 전", "어제", "3일 전", "2개월 전"
  function ago(then, now) {
    if (!(then > 0)) return '';
    const s = Math.floor((now - then) / 1000);
    if (s < 60) return '방금';
    if (s < 3600) return `${Math.floor(s / 60)}분 전`;
    if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
    if (s < 86400 * 2) return '어제';
    if (s < 86400 * 30) return `${Math.floor(s / 86400)}일 전`;
    return `${Math.floor(s / (86400 * 30))}개월 전`;
  }
  // 한국 시각 조각
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function parts(ms) {
    const o = {};
    for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value;
    return { y: +o.year, mo: +o.month, d: +o.day, hh: o.hour, mm: o.minute, ymd: `${o.year}-${o.month}-${o.day}` };
  }
  // 오늘이면 '14:32', 아니면 '10월 18일 11:40'
  function clock(ms, now) {
    const a = parts(ms), n = parts(now);
    return a.ymd === n.ymd ? `${a.hh}:${a.mm}` : `${a.mo}월 ${a.d}일 ${a.hh}:${a.mm}`;
  }
  // 알림함 날짜 묶음: '오늘' · '어제' · '10월 17일'
  function dayLabel(ms, now) {
    const a = parts(ms), n = parts(now), y = parts(now - DAY_MS);
    if (a.ymd === n.ymd) return '오늘';
    if (a.ymd === y.ymd) return '어제';
    return `${a.mo}월 ${a.d}일`;
  }
  // '5시간 30분', '55분', '2일 3시간'
  function dur(ms) {
    const m = Math.max(0, Math.round(ms / 60e3));
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
    if (d) return h ? `${d}일 ${h}시간` : `${d}일`;
    if (h) return mi ? `${h}시간 ${mi}분` : `${h}시간`;
    return `${mi}분`;
  }

  /* ---------- 지역 (앱이 낸 값 그대로, Geo.label 과 같은 글) ---------- */
  const kmLabel = (km) => (km < 10 ? (Math.round(km * 10) / 10).toFixed(1) + 'km' : Math.round(km) + 'km');
  // 지역 모름 = 앱이 unknown 이라고 준 것, 칸이 없으면 '가까운지도 거리도 모름'(앱 Nearby.Loc.unknown 과 같은 뜻)
  const isUnknown = (p) => !p || p.unknown === true || (p.unknown !== false && p.near == null && !Number.isFinite(p.km) && !str(p.name));
  const SGG = ['sigungu', 'sgg', 'city'];
  // 앱이 만든 지역 글(text)이 있으면 그대로(W2-16). 없을 때만 앱 Nearby.placeText 와 같은 규칙으로 맞춰요
  function placeText(p) {
    if (p && str(p.text)) return str(p.text);
    if (isUnknown(p)) return '지역 모름';
    const name = str(p.name);
    if (SGG.includes(p.level) && !Number.isFinite(p.km)) {
      const sg = str(p.sgg) || name;
      return name && sg !== name ? `${name} · ${sg} 쯤` : `${sg} 쯤`;
    }
    if (Number.isFinite(p.km)) return `${name ? name + ' · ' : ''}${p.rough ? '≈' : ''}${kmLabel(p.km)}`;
    return name || '지역 모름';
  }

  /* ---------- 등급 배지 (앱 GradeBadge 와 같은 글, 🍯 대신 선 아이콘) ---------- */
  function badge(g, compact) {
    if (!g || typeof g !== 'object') return null;
    const d = Number.isFinite(g.d) ? g.d : null;
    switch (g.k) {
      case 'honey': return { cls: 'b-honey', text: compact ? `${d}%` : `꿀매 ${d}%`, icon: 'drop', aria: `꿀매, 시세보다 ${d == null ? '' : -d + '% '}쌈` };
      case 'good': return { cls: 'b-good', text: `시세 ${d}%` };
      case 'normal': return (d || 0) >= 25 ? { cls: 'b-high', text: `비쌈 +${d}%` } : { cls: 'b-fair', text: `보통 +${d}%` };
      case 'caution': return { cls: 'b-caution', text: '⚠ 확인 필요' };
      default: return null; // 판정 보류 = 배지 없음
    }
  }

  /* ---------- 매물 보기 거르기 (계획서 5-2 ⑦, 디자인 W-C) ---------- */
  // area: all | near(가까운 동네만) | 3·5·10·20(km 안). withUnknown: 지역 모르는 매물도 함께 보기(기본 켬).
  function filterListings(list, o) {
    o = o || {};
    const mk = o.mk || { j: true, d: true, b: true };
    const area = AREAS.includes(String(o.area)) ? String(o.area) : 'all';
    const withUnknown = o.withUnknown !== false;
    const q = str(o.q).trim().toLowerCase();
    const all = arr(list);
    const counts = { j: 0, d: 0, b: 0 };
    for (const l of all) if (counts[l.m] != null) counts[l.m]++;
    let rows = all.filter((l) => mk[l.m] !== false);
    if (q) rows = rows.filter((l) => str(l.title).toLowerCase().includes(q));
    let unknown = 0, hiddenUnknown = 0;
    if (area !== 'all') {
      const lim = Number(area);
      rows = rows.filter((l) => {
        if (isUnknown(l.place)) {
          unknown++;
          if (!withUnknown) hiddenUnknown++;
          return withUnknown;
        }
        if (area === 'near') return l.place.near === true;
        // 거리를 알면 거리로, 모르면 가까운 동네 이름이면 넣어요(앱 Nearby.passes 와 같게)
        return Number.isFinite(l.place.km) ? l.place.km <= lim : l.place.near === true;
      });
    }
    const idx = new Map(all.map((l, i) => [l, i]));
    const tie = (a, b) => idx.get(a) - idx.get(b);
    const price = (l) => (l.price > 0 ? l.price : Infinity);
    if (o.sort === 'seen') rows.sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0) || tie(a, b));
    else if (o.sort === 'near') rows.sort((a, b) => kmOf(a) - kmOf(b) || price(a) - price(b) || tie(a, b));
    else rows.sort((a, b) => price(a) - price(b) || tie(a, b));
    return { rows, counts, unknown, hiddenUnknown, area, withUnknown };
  }
  const kmOf = (l) => (l.place && !isUnknown(l.place) && Number.isFinite(l.place.km) ? l.place.km : Infinity);

  /* ---------- 알림함 꼬리표 (앱 InboxScreen.kt:128-132 와 같은 규칙) ---------- */
  function inboxTags(i, now) {
    const t = [];
    const a = ago(i.t, now);
    if (a) t.push(a);
    if (i.delivered === false) t.push(i.level === 'digest' ? '요약에 담아요' : '조용한 시간 — 아침에');
    if (i.inApp) t.push('앱에서 봄');
    if (i.hidden) t.push('이 매물 아님 처리');
    return t;
  }

  /* ---------- 최근 7일 올림 공백 (계획서 6-5 ①) ---------- */
  function gaps(b, now) {
    const line = lateLineMin(b) * 60e3;
    const from = now - GAP_DAYS * DAY_MS;
    const ts = [...new Set(arr(b.uploads).concat([b.made]).filter((t) => Number.isFinite(t) && t <= now))].sort((x, y) => x - y);
    const out = [];
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] - ts[i - 1] > line && ts[i] >= from) out.push({ from: ts[i - 1], to: ts[i], ms: ts[i] - ts[i - 1], open: false });
    }
    const last = ts[ts.length - 1];
    if (last != null && now - last > line) out.push({ from: last, to: now, ms: now - last, open: true });
    return out.reverse(); // 새것 먼저
  }

  /* ---------- 안전한 주소 (원 매물·사진은 https 만) ---------- */
  function safeUrl(u) {
    const s = str(u);
    return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- CSV (보이는 매물만, 엑셀이 식으로 읽지 않게) ---------- */
  function csv(rows, now) {
    const cell = (v) => {
      let s = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['제목', '가격(원)', '마켓', '판정', '판정 이유', '지역', '처음 본 때', '원 매물'];
    const lines = [head.map(cell).join(',')];
    for (const l of arr(rows)) {
      const b = badge(l.grade, false);
      lines.push([l.title, l.price > 0 ? l.price : '', MARKET[l.m] || '', b ? b.text : '', l.grade ? l.grade.why : '', placeText(l.place), l.firstSeen ? clock(l.firstSeen, now) : '', safeUrl(l.url)].map(cell).join(','));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /* ---------- 받기 (비공개 데이터 저장소, 읽기 토큰) ---------- */
  const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  const ghHeaders = (tok, raw) => ({ Authorization: `Bearer ${tok}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
  // 결과: { ok:true, box } | { ok:false, why: 'missing'(아직 안 올림) | 'token'(막힘) | 'rate' | 'bad'(상자 아님) | 'net' | 'repo'(이름 틀림) }
  async function fetchRadar(o) {
    const f = o.fetchImpl || fetch;
    if (!REPO_RE.test(str(o.repo))) return { ok: false, why: 'repo' };
    if (!str(o.token)) return { ok: false, why: 'token', status: 0 };
    let r;
    try {
      r = await f(`https://api.github.com/repos/${o.repo}/contents/radar.enc?ref=view`, { headers: ghHeaders(o.token, true), cache: 'no-store' });
    } catch {
      return { ok: false, why: 'net' };
    }
    if (r.ok) {
      try {
        const box = JSON.parse(await r.text());
        return isBoxLike(box) ? { ok: true, box } : { ok: false, why: 'bad' };
      } catch {
        return { ok: false, why: 'bad' };
      }
    }
    if (r.status === 401) return { ok: false, why: 'token', status: 401 };
    if (r.status === 403 || r.status === 429) {
      const left = r.headers && r.headers.get ? r.headers.get('x-ratelimit-remaining') : null;
      return left === '0' || r.status === 429 ? { ok: false, why: 'rate', status: r.status } : { ok: false, why: 'token', status: 403 };
    }
    if (r.status === 404) {
      // 파일·가지가 없는지, 토큰이 저장소를 못 보는지 가려요
      try {
        const p = await f(`https://api.github.com/repos/${o.repo}`, { headers: ghHeaders(o.token, false), cache: 'no-store' });
        if (p.ok) return { ok: false, why: 'missing', status: 404 };
        if (p.status === 401) return { ok: false, why: 'token', status: 401 };
        return { ok: false, why: 'token', status: 404 };
      } catch {
        return { ok: false, why: 'net' };
      }
    }
    return { ok: false, why: 'net', status: r.status };
  }
  const isBoxLike = (b) => !!(b && b.v === 1 && b.kdf === 'PBKDF2-SHA256' && typeof b.salt === 'string' && typeof b.iv === 'string' && typeof b.ct === 'string');

  root.RadarView = {
    KIND, KNOWN, LABEL, TOKEN_LABEL, LATE_MIN, MARKET, MARK, AREAS, REPO_RE,
    check, arr, str, lateLineMin, liveState, won, man, ago, clock, dayLabel, dur, kmLabel, isUnknown, placeText,
    badge, filterListings, inboxTags, gaps, safeUrl, esc, csv, fetchRadar,
  };
})(typeof self !== 'undefined' ? self : globalThis);
