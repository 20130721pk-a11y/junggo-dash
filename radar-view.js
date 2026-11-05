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
      case 'caution': {
        // 0.8.2: 사유 목록(reasons)이 오면 누를 수 있는 배지(사기 의심 b-scam / 확인 필요 b-caution). 없으면(옛 묶음) 지금처럼 글만
        const r = reasonsOf(g);
        if (!r) return { cls: 'b-caution', text: '⚠ 확인 필요' };
        const kind = badgeKind(g);
        return { cls: kind === 'scam' ? 'b-scam' : 'b-caution', text: WHY[kind].badge, aria: WHY[kind].aria, why: kind };
      }
      default: return null; // 판정 보류 = 배지 없음
    }
  }

  /* ---------- 0.8.2 사기 의심·확인 필요 사유 (앱 Judge.CautionBadge·ReasonDialog, 묶음 grade.badge·reasons) ---------- */
  // 사유 글·갈래·순서는 앱이 정해 보내요(웹은 다시 줄 세우거나 지어내지 않음). 창의 고정 글(제목·머리 글·끝 글)은 묶음에 없어 앱 상수를 그대로 둬요.
  const WHY = {
    scam: { badge: '⚠ 사기 의심', aria: '사기 의심, 사유 보기', title: '사기 의심 이유' },
    check: { badge: '⚠ 확인 필요', aria: '확인 필요, 사유 보기', title: '확인 필요 이유' },
    head: '지금 최저가·꿀매·알림에서 뺐어요. 목록엔 남아요.',
    foot: '본 사실만 적었어요. 정상 판매자도 걸릴 수 있어요.', // 사기 의심만
    close: '닫기',
  };
  // 0.8.5 T6·T8 까닭 창 제목(앱 GapText.TITLE) — 줄 글·꼬리·머리 글은 묶음(gaps·gapHead)에서 그대로
  const GAP_TITLE = '이번 확인 · 마켓 상태';
  const REASON_GROUP = { seller: '판매자', text: '글', price: '가격' };
  const badgeKind = (g) => (g && g.badge === 'scam' ? 'scam' : 'check');
  // ⚠ 이고 사유가 하나라도 있으면 [{g, t, sub}] (글 없는 줄은 빼요), 아니면 null(= 옛 묶음 · why 한 줄)
  function reasonsOf(g) {
    if (!g || typeof g !== 'object' || g.k !== 'caution' || !Array.isArray(g.reasons)) return null;
    const out = g.reasons.filter((r) => r && typeof r === 'object' && str(r.t)).map((r) => ({ g: str(r.g), t: str(r.t), sub: str(r.sub) }));
    return out.length ? out : null;
  }
  // 사유 창 갈래 나눔: 갈래가 둘 이상이면 [{name, items}] (온 순서대로 이어진 갈래끼리), 하나면 [{name: '', items: 전부}]
  function reasonGroups(list) {
    const rs = arr(list);
    const names = new Set(rs.map((r) => r.g));
    if (names.size < 2) return rs.length ? [{ name: '', items: rs }] : [];
    const out = [];
    for (const r of rs) {
      const last = out[out.length - 1];
      if (last && last.g === r.g) last.items.push(r);
      else out.push({ g: r.g, name: REASON_GROUP[r.g] || '', items: [r] });
    }
    return out.map(({ name, items }) => ({ name, items }));
  }

  /* ---------- 같은 글 묶음 (앱 Pipeline.chipRows — 칩으로 먼저 거른 뒤 묶기, QA-1) ---------- */
  // 묶음 줄 = 앱이 같은 글로 묶은 대표 + dupRows(묶인 매물, 묶기 전 싼 순). 앱 결과 화면은 칩(마켓·변형·지역)으로 매물을 먼저 거른 뒤
  // 묶어서, 여러 마켓에 같이 올린 글이 마켓 칩마다 한 줄이에요. 웹도 줄을 풀어 거른 뒤 다시 묶어요: 남은 매물 중 첫째가 줄, 나머지는 그 줄의 같은 글.
  // dupRows 가 없는 묶음(앱 0.7.1.1 첫 판까지)은 대표 줄만 봐요.
  const membersOf = (l) => [l, ...arr(l && l.dupRows).filter((d) => d && typeof d === 'object')];
  function regroup(all, keep) {
    const out = [];
    for (const l of all) {
      const ms = membersOf(l);
      const kept = ms.filter(keep);
      if (!kept.length) continue;
      if (kept.length === ms.length) { out.push(l); continue; }
      const [head, ...rest] = kept;
      out.push({ ...head, dups: rest.length, dupRows: rest });
    }
    return out;
  }

  /* ---------- 변형·모델 칩 (앱 Pipeline.variantChips·chipCounts 와 같은 규칙) ---------- */
  // 묶음 매물의 variant = 앱 ModelSplit.of(제목) — 나누는 검색이면 모든 매물에 이름('기본'·'SUPER'·'Ti'… / 모델 이름), 아니면 모두 null.
  // 모델 물건(R12, 묶음 term 'model')에서 모델을 못 알아본 매물은 '모델 모름'(앱 Models.UNKNOWN) — 빈 값→'기본' 바꿈과 섞이지 않게 따로 봐요.
  // 칩: 이름 있는 변형·모델이 둘 이상일 때만, 묶기 전 매물이 많은 것부터(같으면 싼 순으로 먼저 나온 것), '모델 모름'은 늘 맨 뒤(디자인 G-2).
  // 칩 글 = '이름 건수'(대표 결정 2, 디자인 G-1) — 건수는 [variantCounts](칩 차례를 정한 수와 같음).
  const BASE_VARIANT = '기본';
  const UNKNOWN_MODEL = '모델 모름';
  const isUnknownModel = (v) => v === UNKNOWN_MODEL;
  const variantOf = (l) => str(l && l.variant) || BASE_VARIANT;
  // 묶기 전 매물 수: dupRows 가 있으면 그 수, 없으면(옛 묶음) dups
  const weightOf = (l) => (Array.isArray(l.dupRows) ? membersOf(l).length : 1 + Math.max(0, Number(l.dups) || 0));
  function variantCounts(list) {
    const all = arr(list).filter(Boolean);
    const weight = new Map();
    if (!all.some((l) => str(l.variant))) return weight;
    for (const l of all) {
      const v = variantOf(l);
      weight.set(v, (weight.get(v) || 0) + weightOf(l));
    }
    return weight;
  }
  function variantChips(list) {
    const weight = variantCounts(list);
    const order = [...weight.keys()];
    const chips = order.map((v, i) => ({ v, w: weight.get(v), i })).sort((a, b) => b.w - a.w || a.i - b.i).map((x) => x.v);
    const named = chips.filter((v) => !isUnknownModel(v));
    // 앱 결과 화면: 이름 있는 칩이 둘 이상일 때만 칩 줄(ResultsScreen namedChips >= 2)
    return named.length >= 2 ? named.concat(chips.filter(isUnknownModel)) : [];
  }

  /* ---------- 매물 보기 거르기 (계획서 5-2 ⑦, 디자인 W-C) ---------- */
  // area: all | near(가까운 동네만) | 3·5·10·20(km 안). withUnknown: 지역 모르는 매물도 함께 보기(기본 켬).
  // variant: 변형 칩 이름(없으면 전부) — 이 매물 줄의 칩([variantChips])에 없는 이름이면 거르지 않아요.
  // 거르기는 묶인 매물마다 하고 다시 묶어요([regroup]) — 앱 결과 화면과 같은 줄·건수.
  // counts = 마켓 단추 숫자: 그 마켓만 켰을 때의 줄 수(다른 거르기는 그대로) = 앱에서 그 마켓 칩을 눌렀을 때의 '매물 n건'.
  function filterListings(list, o) {
    o = o || {};
    const mk = o.mk || { j: true, d: true, b: true };
    const area = AREAS.includes(String(o.area)) ? String(o.area) : 'all';
    const withUnknown = o.withUnknown !== false;
    const q = str(o.q).trim().toLowerCase();
    const all = arr(list).filter(Boolean);
    const variant = str(o.variant) && variantChips(all).includes(str(o.variant)) ? str(o.variant) : '';
    const lim = Number(area);
    const placeOk = (l, wu) => {
      if (area === 'all') return true;
      if (isUnknown(l.place)) return wu;
      if (area === 'near') return l.place.near === true;
      // 거리를 알면 거리로, 모르면 가까운 동네 이름이면 넣어요(앱 Nearby.passes 와 같게)
      return Number.isFinite(l.place.km) ? l.place.km <= lim : l.place.near === true;
    };
    // 미개봉 / 중고 칩(앱 COND_NEW·COND_USED — 매물의 unopened 로): 'new' = 미개봉만, 'used' = 미개봉 아닌 것만
    const cond = o.cond === 'new' || o.cond === 'used' ? o.cond : '';
    const condOk = (l) => !cond || (cond === 'new') === !!l.unopened;
    const others = (l, wu) => (!variant || variantOf(l) === variant) && condOk(l) && (!q || str(l.title).toLowerCase().includes(q)) && placeOk(l, wu);
    const counts = { j: 0, d: 0, b: 0 };
    for (const m of Object.keys(counts)) counts[m] = regroup(all, (l) => l.m === m && others(l, withUnknown)).length;
    const rows = regroup(all, (l) => mk[l.m] !== false && others(l, withUnknown));
    // 지금 최저가를 고를 줄(싼 순): 앱 결과 화면처럼 칩(마켓·변형·지역)으로만 좁혀요 — '결과 안에서 찾기'는 웹에만 있는 찾기라 빼요
    const heroRows = q ? regroup(all, (l) => mk[l.m] !== false && (!variant || variantOf(l) === variant) && condOk(l) && placeOk(l, withUnknown)) : rows.slice();
    let unknown = 0, hiddenUnknown = 0;
    if (area !== 'all') {
      unknown = (withUnknown ? rows : regroup(all, (l) => mk[l.m] !== false && others(l, true))).filter((l) => isUnknown(l.place)).length;
      if (!withUnknown) hiddenUnknown = unknown;
    }
    const idx = new Map();
    all.forEach((l, i) => membersOf(l).forEach((x) => idx.set(x.key, i))); // 다시 묶은 줄은 원래 줄 자리
    const tie = (a, b) => (idx.get(a.key) ?? 0) - (idx.get(b.key) ?? 0);
    const price = (l) => (l.price > 0 ? l.price : Infinity);
    if (o.sort === 'seen') rows.sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0) || tie(a, b));
    else if (o.sort === 'near') rows.sort((a, b) => kmOf(a) - kmOf(b) || price(a) - price(b) || tie(a, b));
    else rows.sort((a, b) => price(a) - price(b) || tie(a, b));
    return { rows, counts, unknown, hiddenUnknown, area, withUnknown, variant, cond, heroRows };
  }

  /* ---------- 칩으로 좁힌 지금 최저가 (앱 CardCore.screenHero 와 같은 규칙) ---------- */
  // 판정은 하지 않아요: 매물마다 앱이 낸 grade.k(⚠ 여부)와 묶음 baseVariant(기준 변형)로 고르기만.
  // rows = filterListings 의 heroRows(싼 순). o = { name: 물건 이름, chip: 변형 칩, base: 묶음 baseVariant, market: 한 마켓만 켰을 때 그 코드 }.
  // 돌려주는 것: { hero, doubtful, line, cautionKey } — line 은 결과 화면 칸 위 한 줄 글(없으면 null), cautionKey = 첫 ⚠(기준 변형 안).
  // 모델 물건(o.term 'model', R12): '모델 모름' 칩이면 칸 없음 + 회색 한 줄(앱 CardCore.unknownChipLine, 디자인 G-3) —
  // 판정하지 않은 매물을 지금 최저가로 올리지 않아요. 기준 모델에 믿을 만한 매물이 없을 때 '· {모델} 최저'에 모름 매물을 쓰지 않아요.
  const unknownChipLine = (n) => `모델을 모르는 매물 ${n}건이에요 — 판정하지 않아서 지금 최저가로 올리지 않아요`;
  // R-1 후속: o.held = 묶음 held({ names, lines }) — 값이 섞여 판정 보류인 모델 칩·기준 모델이면 칸 없음 + 앱이 준 한 줄(앱 CardCore.heldBase)
  function screenHero(rows, o) {
    o = o || {};
    const all = arr(rows).filter(Boolean);
    // 0.8.6 J-1: 값이 섞여 전체 판정 보류(묶음 mixedAll = 앱이 낸 한 줄) — 칸 없이 그 줄(앱 CardCore.screenHero 와 같게, 칩과 상관없이)
    if (str(o.mixed)) return { hero: null, doubtful: 0, line: str(o.mixed), cautionKey: null };
    const model = o.term === 'model';
    if (model && isUnknownModel(str(o.chip))) return { hero: null, doubtful: 0, line: unknownChipLine(all.length), cautionKey: null };
    const split = o.base !== undefined ? !!str(o.base) : all.some((l) => str(l.variant));
    const want = split ? (str(o.chip) || str(o.base) || BASE_VARIANT) : '';
    const heldNames = model && o.held ? arr(o.held.names).map(str) : [];
    const hi = heldNames.indexOf(want);
    if (want && hi >= 0) return { hero: null, doubtful: 0, line: str(arr(o.held.lines)[hi]) || null, cautionKey: null };
    const isBase = (l) => !want || variantOf(l) === want;
    const kind = (l) => (l.grade && typeof l.grade === 'object' ? l.grade.k : null);
    const priced = (l) => Number(l.price) > 0;
    const inBase = all.filter(isBase);
    const hero = inBase.find((l) => priced(l) && kind(l) !== 'caution') || null;
    const before = hero ? inBase.slice(0, inBase.indexOf(hero)) : inBase;
    const cautions = before.filter((l) => kind(l) === 'caution');
    const doubtful = cautions.length;
    const other = hero ? null : all.find((l) => !isBase(l) && priced(l) && kind(l) != null && kind(l) !== 'caution' && !(model && (isUnknownModel(variantOf(l)) || heldNames.includes(variantOf(l))))) || null;
    const noBase = !hero && split ? other : null;
    let line = null;
    if (noBase) {
      const who = want === BASE_VARIANT ? `${BASE_VARIANT} ${str(o.name)}` : `${str(o.name)} ${want}`;
      const where = MARKET[o.market] ? `${MARKET[o.market]}에는 ` : '';
      line = [`${where}${who} 믿을 만한 매물이 아직 없어요`, doubtful > 0 ? `⚠ ${doubtful}건` : '', `${variantOf(noBase)} 최저 ${man(noBase.price)}`].filter(Boolean).join(' · ');
    } else if (!hero && doubtful > 0) line = `믿을 만한 매물이 아직 없어요 · ⚠ 확인 필요 ${doubtful}건(아래 목록에 있어요)`;
    else if (doubtful > 0) line = `⚠ 더 싸 보이는 확인 필요 매물 ${doubtful}건은 '지금 최저가'에서 뺐어요(아래 목록에 있어요)`;
    return { hero, doubtful, line, cautionKey: cautions.length ? cautions[0].key : null };
  }
  const kmOf = (l) => (l.place && !isUnknown(l.place) && Number.isFinite(l.place.km) ? l.place.km : Infinity);

  /* ---------- 그냥 검색 근처 밖 당근 줄 (0.8.6 W-1, 앱 ResultsScreen.rememberVisible allDaangn 과 같은 셈) ---------- */
  // 묶음 adhoc[].listings[].far = 근처 밖 당근 줄(앱이 낸 표시 — 웹은 거리를 다시 재지 않아요). adhoc[].nearby.nearOnly = 앱 기본 보기가 근처만인가
  // (없으면 근처만 — 0.7.1 결정 2 그대로). all = 웹 '전체 보기'를 켰나. 돌려주는 것: { nearOnly, has(실린 근처 밖 줄이 있나), hide(지금 빼나), rows }.
  // '가까운 동네만' 지역 칩은 filterListings 가 place.near 로 거르므로 근처 밖 줄은 거기서도 빠져요(앱 Nearby.passes 와 같게).
  function daangnFar(a, all) {
    const ls = arr(a && a.listings).filter(Boolean);
    const nb = a && a.nearby && typeof a.nearby === 'object' ? a.nearby : null;
    const nearOnly = !(nb && nb.nearOnly === false);
    const has = ls.some((l) => l.far === true);
    // all = 기본 보기 뒤집기(0.8.6 수집·매칭 — 앱 기본이 당근 전체면 뒤집었을 때 근처 밖을 숨김)
    const hide = nearOnly ? !all : !!all;
    return { nearOnly, has, hide, rows: hide && has ? regroup(ls, (l) => l.far !== true) : ls };
  }
  // 앱 CardCore.daangnNearLine 과 같은 글(묶음 nearby.lines 가 없을 때만 — 0.8.6 묶음은 앱 글을 실어요)
  function daangnNearLine(n, m, all) {
    if (n === m || n === 0) return null;
    if (!all && m === 0) return `내 동네 근처 당근은 없어요 · 당근 전체 ${n}건 보기`;
    if (!all) return `가까운 동네만 보는 중 · 당근 전체 ${n}건 보기`;
    if (m === 0) return `당근 ${n}건 · 내 동네 근처는 없어요`;
    return `당근 ${n}건 중 내 동네 근처 ${m}건 · 가까운 동네만 보기`;
  }

  /* ---------- 알림함 꼬리표 (앱 InboxScreen.kt:128-132 와 같은 규칙) ---------- */
  function inboxTags(i, now) {
    const t = [];
    const a = ago(i.t, now);
    if (a) t.push(a);
    if (i.delivered === false) t.push(i.level === 'digest' ? '요약에 담아요' : '조용한 시간 — 아침에');
    if (i.inApp) t.push('앱에서 봄');
    // 처리 꼬리표: 앱이 보낸 글(0.8.7 tag — '사기 같아요로 숨김' · '이 매물 아님 처리'), 옛 묶음은 hidden 만
    if (str(i.tag)) t.push(str(i.tag));
    else if (i.hidden) t.push('이 매물 아님 처리');
    return t;
  }

  /* ---------- 디자인 v2 (0.8.1): 선 아이콘 · 관심 매물 글 · 이모지 빼기 ---------- */
  // 알림함 줄 머리 아이콘(디자인 v2 README 7장): 종류 값으로 고름. 값은 index.html 아이콘 id(i-…) — v2 이름은 옆 주석
  const INBOX_ICON = {
    honey: 'drop', // honey(꿀골드)
    target: 'target', // target(brand-bright — signals '목표가 도달')
    lowest: 'trend', nday: 'trend', // trend-down
    drop: 'down', // arrow-down
    new: 'plus', caution: 'alert', watch: 'star',
    digest: 'list', system: 'gear', // list · settings
    web: 'up',
  };
  const inboxIcon = (kind) => INBOX_ICON[kind] || 'list';
  // 매물 쪽 ☆ 글(11/1 대표 결정 2 — 앱도 0.8.1 2단계에서 같은 글). 물건 쪽 '지켜보기 시작'·'그만 지켜보기'는 그대로
  const STAR = { add: '관심 매물에 넣기', remove: '관심 매물에서 빼기', sending: '보내는 중' };
  // 앱 WebBundle.noEmoji 와 같은 규칙: 그림 이모지(U+1F000 이상)·⚙(U+2699)·글꼴 바꿈표(U+FE0F)를 빼고 겹친 띄어쓰기를 하나로.
  // ⚠·★·▼ 글자는 그대로(디자인 v2 README 3장). 앱이 이미 빼서 보내니 웹은 옛 묶음 대비로만 써요(종류 값이 있을 때)
  function noEmoji(text) {
    let out = '';
    for (const ch of String(text == null ? '' : text)) {
      const cp = ch.codePointAt(0);
      if (!(cp >= 0x1F000 || cp === 0x2699 || cp === 0xFE0F)) out += ch;
    }
    return out.replace(/ {2,}/g, ' ').trim();
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
    badge, WHY, GAP_TITLE, REASON_GROUP, reasonsOf, reasonGroups, badgeKind, variantChips, variantCounts, filterListings, screenHero, unknownChipLine, isUnknownModel, UNKNOWN_MODEL, BASE_VARIANT, inboxTags, INBOX_ICON, inboxIcon, STAR, noEmoji, gaps, safeUrl, esc, csv, fetchRadar,
    daangnFar, daangnNearLine,
  };
})(typeof self !== 'undefined' ? self : globalThis);
