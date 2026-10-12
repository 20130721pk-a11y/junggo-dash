// 중고 통합검색 수집기 — Claude 데스크톱 앱 내장 브라우저의 사이트 탭에서 실행한다.
//   part "jb": web.joongna.com 탭에서 실행 (중고나라 + 번개장터)
//   part "d" : www.daangn.com 탭에서 실행 (당근)
// 마지막 줄의 __CONFIG__ 를 {"part":"jb","maxAgeDays":30,"searches":[...]} JSON 으로 바꿔서 javascript_tool 로 보낸다.
// 결과는 문자열 하나: {"__junggo":"v1","part":..,"at":..,"results":{검색ID:{pf:{..},items:[..]}}} (보통 gzip+base64 로 줄여서)
// 매물 하나 = [마켓, ID, 제목, 가격, 상태, 지역, 갱신시각(초), 등록시각(초), 찜, 채팅, 광고, 가까움 1|0|null]
async function junggoCollect(cfg) {
  const T0 = Date.now();
  const TIMEOUT = 15000;
  // javascript_tool 은 45초에 끊기므로 그 전에 모은 만큼 돌려준다
  const DEADLINE = T0 + (cfg.budgetMs || 36000);
  const late = () => Date.now() > DEADLINE;
  const MAX_AGE = Number.isFinite(cfg.maxAgeDays) ? cfg.maxAgeDays : 30;
  const oldestOf = (days) => (days > 0 ? Math.floor(T0 / 1000) - days * 86400 : 0);
  const OLDEST = oldestOf(MAX_AGE);
  // 검색마다 기간(maxAgeDays)을 따로 정할 수 있다 (0 = 기간 제한 없음)
  const tooOld = (t, s) => {
    const o = s && Number.isFinite(s.maxAgeDays) ? oldestOf(s.maxAgeDays) : OLDEST;
    return !!(o && t && t < o);
  };
  // 판매완료 매물은 최근 90일 것만 (팔린 가격 참고용)
  const SOLD_OLDEST = oldestOf(90);
  const LATE_MSG = '시간이 모자라 일부만 모았어요';
  // 검색어를 쉼표로 나눠 적으면 여러 표기로 각각 찾아 합친다 (3개까지)
  const altsOf = (s) => String(s.keyword || '').split(',').map((w) => w.trim()).filter(Boolean).slice(0, 3);
  // 지역 이름 맞춰 보기: 띄어쓰기와 첫 낱말의 시·도 꼬리(특별시·광역시·특별자치시·특별자치도·도)를 빼고 비교한다
  //   "서울 강남구" ↔ "서울특별시 강남구 역삼동", "경기 시흥시" ↔ "경기도 시흥시 정왕동", "시흥시" ↔ "경기도 시흥시 정왕동"
  const areaKey = (v) => String(v || '').trim().split(/\s+/).map((w, i) => (i === 0 ? w.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, '') : w)).join('');
  // 조건의 기본값은 보내지 않는다(판매중, 제목·내용, 그 사이트의 마켓 전부). 지역은 cfg.regions 에 한 번만 적고 ID 로 가리킨다.
  const MY = (typeof PART === 'string' ? PART : cfg.part) === 'd' ? ['daangn'] : ['joongna', 'bunjang'];
  for (const s of cfg.searches || []) {
    s.status = s.status || 'selling';
    s.match = s.match || 'content';
    s.platforms = s.platforms || MY;
    if (Array.isArray(s.regions)) s.regions = s.regions.map((r) => (typeof r === 'string' && cfg.regions ? cfg.regions[r] : r)).filter(Boolean);
  }

  async function getText(url, init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      let res;
      try {
        res = await fetch(url, Object.assign({}, init, { signal: ctrl.signal }));
      } catch (e) {
        throw new Error(e && e.name === 'AbortError' ? '15초 안에 응답이 없어요' : '사이트에 연결하지 못했어요');
      }
      if (res.status === 403 || res.status === 429) throw new Error(`사이트가 요청을 막았어요 (HTTP ${res.status})`);
      if (!res.ok) throw new Error(`사이트 오류 (HTTP ${res.status})`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }
  async function getJSON(url, init) {
    const t = await getText(url, init);
    try {
      return JSON.parse(t);
    } catch {
      throw new Error('응답 형식이 바뀌어 읽지 못했어요');
    }
  }

  const num = (v) => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const sec = (ms) => (ms ? Math.floor(ms / 1000) : 0);
  const iso = (s) => {
    const t = s ? Date.parse(s) : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  const kst = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(s || '').trim());
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +(m[6] || 0)) : iso(s);
  };
  const has = (v) => v != null && v !== '' && Number.isFinite(Number(v));

  // ---- 조건 적용 (제목 일치·빼는 단어·가격·상태) ----
  // \u 로 시작하는 이스케이프는 옮겨 적다 글자로 바뀌기 쉬워(설치 지문이 틀어짐) 쓰지 않는다
  const STRIP = /[\s\[\]\(\)\{\}<>"'`_\-\/|·•ㆍ,!?~*+=:;]+/g;
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
  const split = (w) => w.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]+|[^가-힣ㄱ-ㅎㅏ-ㅣ]+/g) || [];
  function groupsOf(keyword) {
    const out = [];
    for (const word of String(keyword || '').split(/\s+/)) {
      const n = norm(word);
      if (!n) continue;
      const parts = AIDX.has(n) ? [n] : split(n);
      for (const p of parts) if (p) out.push(AIDX.get(p) || [p]);
    }
    return out;
  }
  // 검색어 확인 방식: title = 제목에 모두 / content = 제목+내용 / none = 확인 안 함
  // content 에서 내용을 직접 보는 건 검색 결과에 설명을 주는 당근뿐이다. 중고나라·번개장터는 사이트 검색 결과를
  // 그대로 쓴다 (2026-10-10 확인: 중고나라 검색은 제목 낱말 위주, 번개장터는 제목에 없는 매물도 일부 섞여 온다).
  function makeFilter(s, platform, sold) {
    const mode = s.match || (s.strict === false ? 'none' : 'title');
    const check = mode === 'title' || (mode === 'content' && platform === 'daangn');
    // 검색어 표기마다 낱말 묶음. 표기 하나라도 다 맞으면 통과
    const kws = check ? altsOf(s).map(groupsOf).filter((g) => g.length) : [];
    const ex = (s.exclude || []).map(norm).filter(Boolean);
    const allow = sold || s.status === 'all' ? null : s.status === 'reserved' ? ['s', 'r'] : ['s'];
    const min = has(s.minPrice) ? Number(s.minPrice) : null;
    const max = has(s.maxPrice) ? Number(s.maxPrice) : null;
    return (it, extra) => {
      if (sold ? it[6] && it[6] < SOLD_OLDEST : tooOld(it[6], s)) return false;
      if (allow && !allow.includes(it[4])) return false;
      if (min != null && (it[3] == null || it[3] < min)) return false;
      if (max != null && (it[3] == null || it[3] > max)) return false;
      const t = norm(it[2]);
      if (kws.length) {
        const hay = mode === 'content' && extra ? t + norm(extra) : t;
        if (!kws.some((groups) => groups.every((alts) => alts.some((a) => hay.includes(a))))) return false;
      }
      if (ex.some((w) => t.includes(w))) return false;
      return true;
    };
  }
  // 검색어 표기가 여럿이면 표기마다 따로 찾아 합친다
  const eachKeyword = (fn) => async (s) => {
    const kws = altsOf(s);
    if (kws.length <= 1) return fn(s);
    const outs = [];
    for (const kw of kws) outs.push(await fn(Object.assign({}, s, { keyword: kw })));
    const r = { items: dedupe(outs.flatMap((o) => o.items)), partial: outs.flatMap((o) => o.partial || []) };
    r.total = outs.some((o) => o.total != null) ? outs.reduce((a, o) => a + (o.total || 0), 0) : null;
    if (outs.some((o) => o.texts)) {
      r.texts = new Map();
      for (const o of outs) if (o.texts) for (const [k, v] of o.texts) if (!r.texts.has(k)) r.texts.set(k, v);
    }
    if (outs[0].regions) r.regions = outs[0].regions;
    if (outs.some((o) => o.sold)) r.sold = dedupe(outs.flatMap((o) => o.sold || []));
    return r;
  };
  const cut = (s, n) => {
    s = String(s == null ? '' : s).trim();
    return s.length > n ? s.slice(0, n) : s;
  };
  function dedupe(items) {
    const seen = new Set();
    return items.filter((it) => {
      const k = it[0] + it[1];
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // ---- 번개장터 ----
  // 최신순(끌올 포함)으로 60건씩 넘기다가, 기간(기본 30일)을 넘거나 시간이 모자라면 멈춘다
  async function bunjang(s) {
    const items = [];
    const partial = [];
    let total = null;
    let cursor = null;
    for (let page = 0; page < (cfg.bPages || 15); page++) {
      if (page && late()) { partial.push(LATE_MSG); break; }
      const p = new URLSearchParams({ policyKey: 'pw.product.keyword', q: s.keyword, sort: 'latest' });
      if (has(s.minPrice)) p.set('minPrice', String(s.minPrice));
      if (has(s.maxPrice)) p.set('maxPrice', String(s.maxPrice));
      if (s.status === 'reserved') p.set('status', 'RESERVED');
      else if (s.status === 'all') p.set('status', 'RESERVED,SOLD_OUT');
      if (s.excludeProShop) p.set('shopType', 'NORMAL');
      // 카테고리 번호는 도우미가 정해서 보낸다 (번개장터 categoryId, 2026-10-10 확인: 610 가전제품 등)
      if (s.cat && s.cat.b) p.set('categoryId', String(s.cat.b));
      if (cursor) p.set('cursor', cursor);
      const j = await getJSON('https://api.bunjang.co.kr/api/search/v8/web/search?' + p, { credentials: 'omit' });
      const sr = j && j.data && j.data.responses && j.data.responses.mainGrid && j.data.responses.mainGrid.searchResponse;
      if (!sr || !Array.isArray(sr.data)) throw new Error(j && j.reason ? '검색 오류: ' + cut(j.reason, 60) : '응답 형식이 바뀌어 읽지 못했어요');
      if (total == null && Number.isFinite(sr.totalCount)) total = sr.totalCount;
      for (const r of sr.data) {
        if (!r || r.type !== 'PRODUCT' || r.pid == null) continue;
        const st = { SELLING: 's', RESERVED: 'r', SOLD_OUT: 'x' }[r.status] || 'o';
        // 13번째 칸: 덧붙임 정보. f = O 공식셀러, K 번개케어 / s = 판매자 번호
        const x = {};
        const f = (r.shop && r.shop.isOfficialSeller ? 'O' : '') + (r.care ? 'K' : '');
        if (f) x.f = f;
        if (r.shop && r.shop.uid != null) x.s = String(r.shop.uid);
        // 검색 결과에는 지역이 없다 → 상세 정보로 나중에 채운다(bunjangDetails). 그 전엔 가까움을 모름(null)
        items.push(['b', String(r.pid), cut(r.name, 90), num(r.price), st, '', sec(iso(r.updatedAt)), 0, num(r.favoriteCount) || 0, num(r.buntalkCount) || 0, r.ad ? 1 : 0, null, x]);
      }
      cursor = sr.nextCursor;
      const last = sr.data.filter((r) => r && r.type === 'PRODUCT').pop();
      if (!cursor || !sr.data.length || (last && tooOld(sec(iso(last.updatedAt)), s))) break;
    }
    return { items: dedupe(items), total, partial };
  }

  // 번개장터 상세 정보(동네·좌표·직거래·상품 상태·설명)는 매물마다 따로 불러야 해서, 처음 보는 매물만 불러
  // 이 사이트(web.joongna.com) localStorage 에 모아 둔다 (2026-10-10 확인: products-detail v3, 40건 0.8초)
  const BD_KEY = 'junggo.bd';
  async function bunjangDetails(byId) {
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(BD_KEY) || '{}') || {}; } catch { cache = {}; }
    const nowSec = Math.floor(Date.now() / 1000);
    for (const [k, v] of Object.entries(cache)) if (!Array.isArray(v) || nowSec - v[0] > 45 * 86400) delete cache[k];
    const want = [];
    const seen = new Set();
    for (const { items } of byId) for (const it of items) if (it[0] === 'b' && !seen.has(it[1])) { seen.add(it[1]); if (!cache[it[1]]) want.push(it[1]); }
    let i = 0;
    let got = 0;
    const max = cfg.bdMax || 300;
    async function one() {
      while (i < want.length && i < max && !late()) {
        const pid = want[i++];
        try {
          const j = await getJSON(`https://api.bunjang.co.kr/api/pms/v3/products-detail/${pid}?viewerUid=-1`, { credentials: 'omit' });
          const p = j && j.data && (j.data.product || j.data);
          if (!p) continue;
          const g = p.geo || {};
          const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
          const tr = p.trade || {};
          // [저장 초, 위도, 경도, 동네, 주소, 상품 상태, 직거래 1/0, 무료배송 1/0, 설명 앞부분]
          cache[pid] = [nowSec, r3(g.lat), r3(g.lon), cut(p.geoLabel || '', 20), cut(g.address || '', 40), String(p.condition || ''),
            tr.inPerson === true ? 1 : tr.inPerson === false ? 0 : null, tr.freeShipping ? 1 : 0, cut(String(p.description || '').replace(/\s+/g, ' '), 60)];
          got++;
        } catch {
          // 한 건 실패는 건너뛴다 (다음 새로고침에 다시)
        }
      }
    }
    await Promise.all([one(), one(), one(), one(), one(), one()]);
    try { localStorage.setItem(BD_KEY, JSON.stringify(cache)); } catch { /* 저장 공간이 모자라면 이번만 쓴다 */ }
    for (const { s, items } of byId) {
      const home = areaKey(s.homeArea);
      for (const it of items) {
        const d = it[0] === 'b' && cache[it[1]];
        if (!d) continue;
        const x = it[12] || (it[12] = {});
        if (d[3]) it[5] = cut(d[3], 12);
        if (home && d[4]) it[11] = areaKey(d[4]).includes(home) ? 1 : 0;
        if (d[1] != null && d[2] != null) { x.lat = d[1]; x.lng = d[2]; }
        const f = (x.f || '') + (d[5] === 'NEW' ? 'N' : '') + (d[6] === 1 ? 'I' : '') + (d[7] === 1 ? 'F' : '');
        if (f) x.f = f;
        if (d[8]) x.sn = d[8];
      }
    }
    return { asked: want.length, got, left: Math.max(0, want.length - got) };
  }

  // ---- 중고나라 ----
  // 최신순 100건씩 넘기다가 기간을 넘으면 멈춘다. 판매자가 적은 지역(예: "경기도 시흥시 정왕동")으로 가까움을 본다.
  async function joongnaPage(s, page, saleYn) {
    const body = {
      osType: 2, firstQuantity: 100, quantity: 100, jnPayYn: 'ALL',
      // 카테고리는 한 개만 된다 (여러 개를 넣으면 0건, 2026-10-10 확인)
      categoryFilter: [s.cat && s.cat.j ? { categoryDepth: 1, categorySeq: Number(s.cat.j) } : { categoryDepth: 0, categorySeq: 0 }],
      priceFilter: { minPrice: has(s.minPrice) ? Number(s.minPrice) : 0, maxPrice: has(s.maxPrice) ? Number(s.maxPrice) : 100000000 },
      sort: 'RECENT_SORT', saleYn, parcelFeeYn: 'ALL', page,
      searchWord: s.keyword, adjustSearchKeyword: true, keywordSource: 'INPUT_KEYWORD', registPeriod: 'ALL',
    };
    const j = await getJSON('https://search-api.joongna.com/v3/search/all', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit',
    });
    if (j && j.meta && j.meta.code !== 0) throw new Error(cut(j.meta.message || `검색 오류 (코드 ${j.meta.code})`, 80));
    const d = j && j.data;
    if (!d || !Array.isArray(d.items)) throw new Error('응답 형식이 바뀌어 읽지 못했어요');
    return d;
  }
  function joongnaItem(r, home) {
    const st = { 0: 's', 1: 'r', 3: 'x' }[r.state] || 'o';
    const locs = Array.isArray(r.locationNames) ? r.locationNames.map((x) => String(x || '').trim()).filter(Boolean) : [];
    let loc = r.mainLocationName || '';
    if (!loc && locs[0]) loc = locs[0].split(/\s+/).pop();
    const near = !home || !locs.length ? null : locs.some((x) => areaKey(x).includes(home)) ? 1 : 0;
    // 13번째 칸: 덧붙임 정보. f = P 중고나라페이, C 인증셀러 / s = 판매자(가게) 번호
    const x = {};
    const f = (r.jnPayBadgeFlag ? 'P' : '') + (r.certifySellerFlag ? 'C' : '');
    if (f) x.f = f;
    if (r.storeSeq != null) x.s = String(r.storeSeq);
    return ['j', String(r.seq), cut(r.title, 90), num(r.price), st, cut(loc, 12), sec(kst(r.sortDate)), 0, num(r.wishCount) || 0, num(r.chatCount) || 0, 0, near, x];
  }
  async function joongna(s) {
    const items = [];
    const partial = [];
    const home = areaKey(s.homeArea);
    let total = null;
    for (let page = 0; page < (cfg.jPages || 8); page++) {
      if (page && late()) { partial.push(LATE_MSG); break; }
      const d = await joongnaPage(s, page, s.status === 'selling' ? 'SALE_N' : 'SALE_Y');
      if (total == null && Number.isFinite(d.totalSize)) total = d.totalSize;
      for (const r of d.items) if (r && r.seq != null && (!r.objectType || r.objectType === 'product')) items.push(joongnaItem(r, home));
      const last = d.items[d.items.length - 1];
      if (d.items.length < 100 || (last && tooOld(sec(kst(last.sortDate)), s))) break;
    }
    // 팔린 가격 참고: 판매완료까지 포함해 최신순으로 넘기며 판매완료(state 3)만 모은다. 판매완료 글은 올린 날짜대로 섞여 있어
    // 앞쪽에는 드물다 (2026-10-10 인덕션: 100건당 1→9→27건) → 최근 90일까지 5쪽 안에서
    const sold = [];
    if (cfg.sold !== false && s.status !== 'all') {
      for (let page = 0; page < (cfg.soldPages || 5); page++) {
        if (late()) break;
        let d;
        try { d = await joongnaPage(s, page, 'SALE_Y'); } catch { break; }
        for (const r of d.items) if (r && r.seq != null && r.state === 3 && (!r.objectType || r.objectType === 'product')) sold.push(joongnaItem(r, home));
        const last = d.items[d.items.length - 1];
        if (d.items.length < 100 || (last && sec(kst(last.sortDate)) < SOLD_OLDEST)) break;
      }
    }
    return { items: dedupe(items), total, partial, sold: dedupe(sold) };
  }

  // ---- 당근 ----
  // 시·군·구 이름(예: 시흥시, 경기도 시흥시, 성남시 분당구)이면 그 지역 전체, 아니면 동 이름으로 찾는다.
  let cityListP = null;
  async function loadCities() {
    const list = [];
    try {
      const j = await getJSON('/kr/regions/?_data=routes/kr.regions._index', { credentials: 'include' });
      for (const a of (j && j.allRegions) || []) {
        for (const b of a.childrenRegion || []) {
          if (b && b.regionId != null && b.regionName) list.push({ id: String(b.regionId), name: String(b.regionName), top: String(a.regionName || '') });
        }
      }
    } catch {
      // 목록을 못 받으면 동 이름 찾기로 넘어간다
    }
    return list;
  }
  // 시·군·구 찾기. "시흥시", "경기 시흥시", "분당구", "분당", "성남 분당구", "부산 중구" 를 알아듣는다.
  // 당근 목록에서 구가 있는 시는 "성남시 분당구" 처럼 구마다 따로라, 시 이름만 적으면("성남시") 그 시의 구들(3곳까지)을 돌려준다.
  async function daangnCities(q) {
    const key = String(q || '').replace(/\s+/g, '');
    if (!key) return [];
    if (!cityListP) cityListP = loadCities();
    const cityList = await cityListP;
    const short = (t) => t.replace(/(특별자치도|특별자치시|특별시|광역시|도)$/, '');
    const trim = (t) => t.replace(/[시군구]$/, '');
    const one = (c) => ({ id: c.id, name: c.name, fullName: `${c.top} ${c.name}`.trim() });
    for (const c of cityList) {
      const name = c.name.replace(/\s+/g, '');
      const ws = c.name.trim().split(/\s+/);
      const forms = [name, c.top.replace(/\s+/g, '') + name, short(c.top) + name, trim(name)];
      if (ws.length > 1) {
        const last = ws[ws.length - 1];
        forms.push(last, trim(last), trim(ws[0]) + last, short(c.top) + last);
      }
      if (forms.includes(key)) return [one(c)];
    }
    const many = cityList.filter((c) => {
      const ws = c.name.trim().split(/\s+/);
      return ws.length > 1 && (trim(ws[0]) === trim(key) || short(c.top) + trim(ws[0]) === trim(key));
    });
    return many.slice(0, 3).map(one);
  }
  async function daangnRegion(q) {
    const city = (await daangnCities(q))[0];
    if (city) return city;
    const words = String(q || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const j = await getJSON('/kr/api/v1/regions/keyword?' + new URLSearchParams({ keyword: words[words.length - 1] }), { credentials: 'include' });
    const list = (j && Array.isArray(j.locations) ? j.locations : []).map((l) => ({
      id: String(l.id), name: String(l.name), fullName: [l.name1, l.name2, l.name3 || l.name].filter(Boolean).join(' '),
    }));
    return list.find((l) => words.every((w) => l.fullName.includes(w))) || list[0] || null;
  }
  async function daangnLoad(params) {
    const q = new URLSearchParams(params);
    q.set('_data', 'routes/kr.search.buy-sell._index');
    return getJSON('/kr/search/buy-sell/?' + q, { credentials: 'include' });
  }
  let warmP = null;
  // 당근 요청은 한꺼번에 많이 보내면 당근이 결과를 비워서 준다(2026-10-10 확인) → 모든 검색을 통틀어 3개씩만 동시에
  let dFree = 3;
  const dQueue = [];
  async function dLimit(fn) {
    if (dFree <= 0) await new Promise((res) => dQueue.push(res));
    dFree--;
    try {
      return await fn();
    } finally {
      dFree++;
      const nextUp = dQueue.shift();
      if (nextUp) nextUp();
    }
  }
  let dBlocked = false;
  async function daangnQuery(region, s) {
    const p = new URLSearchParams();
    if (region) p.set('in', `${region.name}-${region.id}`);
    p.set('q', s.keyword);
    if (s.status === 'selling') p.set('only_on_sale', 'true');
    if (has(s.minPrice) || has(s.maxPrice)) p.set('price', `${has(s.minPrice) ? s.minPrice : ''}__${has(s.maxPrice) ? s.maxPrice : ''}`);
    if (s.cat && s.cat.d) p.set('category_id', String(s.cat.d));
    let d = await dLimit(() => daangnLoad(p));
    if (!d || !Array.isArray(d.buySellArticles)) throw new Error('응답 형식이 바뀌어 읽지 못했어요');
    if (d.buySellArticles.length === 0) {
      // 쿠키가 없으면 0건이 온다 → 목록 페이지를 한 번 열고 다시 (여러 검색이 동시에 와도 한 번만 연다)
      if (!warmP) warmP = getText('/kr/buy-sell/', { credentials: 'include' }).catch(() => '');
      await warmP;
      d = await dLimit(() => daangnLoad(p));
      if (!d || !Array.isArray(d.buySellArticles)) throw new Error('응답 형식이 바뀌어 읽지 못했어요');
    }
    return d;
  }
  // 당근 웹 검색은 기준 동네 근처 + 전국 최신 매물을 섞어 270건 안팎만 준다. 기준 동네를 여러 곳으로 바꿔 가며
  // 부르면 그 지역 매물이 2~3배 더 잡힌다(2026-10-10 시흥시 실측). 기준 동네 목록은 설정(anchors)에 둔다.
  async function daangn(s) {
    const asked0 = Array.isArray(s.regions) ? s.regions.filter((r) => r && (r.q || r.name || r.id)) : [];
    // 구가 있는 시 이름("성남시")은 그 시의 구들로 나눠 찾는다 (구마다 기준 동네는 2곳만)
    const asked = [];
    for (const r of asked0) {
      if (r.id) { asked.push(r); continue; }
      const cs = await daangnCities(r.q || r.name);
      if (cs.length > 1) for (const c of cs) asked.push({ ...c, q: r.q || r.name, few: true });
      else asked.push(r);
    }
    const targets = asked.length ? asked.slice(0, 4) : [null];
    const items = [];
    const texts = new Map();
    const regions = [];
    const problems = [];
    for (const r of targets) {
      try {
        let region = null;
        if (r) {
          region = r.id ? { id: String(r.id), name: r.name || r.q, fullName: r.fullName || r.name || r.q } : await daangnRegion(r.q || r.name);
          if (!region) throw new Error(`'${r.q || r.name}' 동네를 찾지 못했어요`);
        }
        const first = await daangnQuery(region, s);
        const sr = first.searchRegion;
        const nb = (first.nearbyRegions || []).filter(Boolean);
        // 시·군·구로 찾았으면 그 안의 동이 "가까운 동네", 동으로 찾았으면 당근이 알려준 근처 동네.
        // 가까움 판단(동 이름 + 기준 동네 중심과의 거리)은 도우미(refresh.mjs build)가 한다 → 여기서는 재료만 넘긴다.
        const isCity = !!region && nb.some((x) => String(x.name2Id) === String(region.id));
        const nearList = isCity ? nb.filter((x) => String(x.name2Id) === String(region.id)) : nb;
        const nearNames = new Set(nearList.map((x) => x.name).filter(Boolean));
        let anchors = [];
        if (region && Array.isArray(r.anchors)) anchors = r.anchors.map(String).filter((a) => /-\d+$/.test(a));
        else if (isCity) {
          const k = Math.min(nearList.length, r && r.few ? 2 : cfg.dAnchors || 5);
          for (let i = 0; i < k; i++) {
            const x = nearList[Math.floor((i * nearList.length) / k)];
            anchors.push(`${x.name}-${x.id}`);
          }
        }
        const pages = [first];
        const more = await Promise.all(anchors.map(async (a) => {
          if (dBlocked || late() || !first.buySellArticles.length) return null;
          try {
            const i = a.lastIndexOf('-');
            const d = await daangnQuery({ name: a.slice(0, i), id: a.slice(i + 1) }, s);
            // 처음엔 나오던 검색이 빈 결과로 오거나 기준 동네를 무시하면 당근이 잠시 막은 것 → 이번엔 더 부르지 않는다
            const got = d.searchRegion && String(d.searchRegion.id);
            if (!d.buySellArticles.length || (got && got !== a.slice(i + 1))) { dBlocked = true; return null; }
            return d;
          } catch {
            return null;
          }
        }));
        for (const d of more) if (d) pages.push(d);
        if (first.buySellArticles.length && pages.length < anchors.length + 1) {
          problems.push(`${region ? region.name : '기본 동네'}: ${dBlocked ? '당근이 잠시 요청을 막아' : '시간이 모자라'} 기준 동네 ${anchors.length + 1}곳 중 ${pages.length}곳으로만 찾았어요`);
        }
        // 각 기준 동네(검색 결과의 searchRegion)도 가까운 동네이고, 그 중심 좌표로 거리를 잰다
        const centers = [];
        for (const d of pages) {
          if (d.searchRegion && d.searchRegion.name) nearNames.add(String(d.searchRegion.name));
          const c = d.regionCenterCoordinate;
          if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) centers.push([Math.round(c.lat * 1e4) / 1e4, Math.round(c.lng * 1e4) / 1e4]);
        }
        const geo = { names: [...nearNames], centers };
        if (region) regions.push({ id: String(region.id), name: String(region.name || ''), fullName: String(region.fullName || region.name || ''), q: r.q || r.name || '', anchors: pages.length, geo });
        else if (sr) regions.push({ id: String(sr.id), name: String(sr.name || ''), fullName: String(sr.fullName || sr.name || ''), q: '', anchors: 1, geo });
        for (const d of pages) {
          for (const a of d.buySellArticles) {
            if (!a || !a.href) continue;
            const m = /-([0-9a-z]+)\/?$/i.exec(String(a.href));
            if (!m) continue;
            const st = { Ongoing: 's', Reserved: 'r', Closed: 'x' }[a.status] || 'o';
            const created = iso(a.createdAt);
            const boosted = iso(a.boostedAt);
            const loc = a.region && a.region.name ? String(a.region.name) : '';
            // 13번째 칸: 덧붙임 정보. lat/lng = 거래 좌표(가까움·거리 계산용), sn = 설명 앞부분. 12번째 칸은 동 이름으로만 본 가까움
            const c = Array.isArray(a.tradingCoordinates) ? a.tradingCoordinates[0] : a.tradingCoordinates;
            const x = {};
            if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) { x.lat = Math.round(c.latitude * 1e4) / 1e4; x.lng = Math.round(c.longitude * 1e4) / 1e4; }
            if (a.content) x.sn = cut(String(a.content).replace(/\s+/g, ' '), 60);
            items.push(['d', m[1], cut(a.title, 90), num(a.price), st, cut(loc, 12), sec(boosted || created), sec(created), 0, 0, 0, nearNames.has(loc) ? 1 : 0, x]);
            if (a.content && !texts.has('d' + m[1])) texts.set('d' + m[1], String(a.content).slice(0, 2000));
          }
        }
      } catch (e) {
        problems.push(`${r ? r.q || r.name : '기본 동네'}: ${e.message}`);
      }
    }
    if (problems.length === targets.length && !items.length) throw new Error(problems.join(' / '));
    return { items: dedupe(items), texts, total: null, regions, partial: problems };
  }

  // 거리 기준이 되는 "내 동네" 중심 좌표 (당근 탭에서만). 같이 쓰는 사람마다 다르다.
  // cfg.homes = [{k: 사람 구분, q: 동네 이름}] → {k: {q,id,name,fullName,lat,lng} 또는 {q,error}}
  // 찾은 좌표는 동네 이름별로 이 사이트 localStorage 에 기억해 둔다(60곳까지)
  async function homePoint(q, cache) {
    const c = cache[q];
    if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) return c;
    const region = await daangnRegion(q);
    if (!region) return { q, error: `'${q}' 동네를 찾지 못했어요` };
    const d = await daangnQuery(region, { keyword: '의자', status: 'selling' });
    const g = d && d.regionCenterCoordinate;
    if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lng)) return { q, error: '동네 위치를 알 수 없어요' };
    const out = { q, id: String(region.id), name: String(region.name || ''), fullName: String(region.fullName || ''), lat: Math.round(g.lat * 1e4) / 1e4, lng: Math.round(g.lng * 1e4) / 1e4 };
    cache[q] = out;
    return out;
  }
  async function homePoints(list) {
    const KEY = 'junggo.homes';
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { cache = {}; }
    const out = {};
    for (const h of list) {
      const q = String((h && h.q) || '').trim();
      if (!q) continue;
      try { out[h.k] = await homePoint(q, cache); } catch (e) { out[h.k] = { q, error: cut(e && e.message ? e.message : String(e), 80) }; }
    }
    const keys = Object.keys(cache);
    for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete cache[k];
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* 다음에 다시 찾는다 */ }
    return out;
  }

  // PART 는 압축할 때 'jb' 또는 'd' 로 고정되어, 쓰지 않는 마켓 코드는 빠진다.
  const IS_D = (typeof PART === 'string' ? PART : cfg.part) === 'd';
  const ADAPTERS = IS_D ? { daangn: eachKeyword(daangn) } : { joongna: eachKeyword(joongna), bunjang: eachKeyword(bunjang) };
  const results = {};
  const list = cfg.searches || [];
  let next = 0;
  // 검색 3개씩 동시에, 한 검색 안의 마켓도 동시에 부른다 (마켓 안의 쪽 넘김만 차례로)
  async function worker() {
    while (next < list.length) {
      const s = list[next++];
      const names = Object.keys(ADAPTERS).filter((name) => (s.platforms || []).includes(name));
      let sold = [];
      const outs = await Promise.all(names.map(async (name) => {
        try {
          const r = await ADAPTERS[name](s);
          const keep = makeFilter(s, name);
          const kept = r.items.filter((it) => keep(it, r.texts ? r.texts.get(it[0] + it[1]) : ''));
          const info = { st: 'ok', raw: r.items.length, n: kept.length };
          if (r.total != null) info.total = r.total;
          if (r.regions) info.regions = r.regions;
          if (r.partial && r.partial.length) info.partial = r.partial;
          if (r.sold) {
            const keepSold = makeFilter(s, name, true);
            const ks = r.sold.filter((it) => keepSold(it, ''));
            info.sold = ks.length;
            sold = sold.concat(ks);
          }
          return [name, info, kept];
        } catch (e) {
          return [name, { st: 'error', error: cut(e && e.message ? e.message : String(e), 120) }, []];
        }
      }));
      const pf = {};
      let items = [];
      for (const [name, info, kept] of outs) {
        pf[name] = info;
        items = items.concat(kept);
      }
      results[s.id] = { pf, items };
      if (sold.length) results[s.id].sold = sold;
    }
  }
  const extra = {};
  const homesP = IS_D && Array.isArray(cfg.homes) && cfg.homes.length ? homePoints(cfg.homes).catch(() => null) : null;
  await Promise.all([worker(), worker(), worker()]);
  if (!IS_D) {
    // 번개장터 매물의 동네·좌표·직거래·상품 상태를 채운다 (남은 시간 안에서)
    const byId = list.filter((s) => results[s.id]).map((s) => ({ s, items: results[s.id].items }));
    try { extra.bd = await bunjangDetails(byId); } catch (e) { extra.bd = { error: cut(e && e.message ? e.message : String(e), 80) }; }
  }
  if (homesP) { const hs = await homesP; if (hs) extra.homes = hs; }
  const out = JSON.stringify({ __junggo: 'v1', part: cfg.part, at: Date.now(), ms: Date.now() - T0, results, ...extra });
  // 결과가 수백 KB 라 gzip+base64 로 줄여 돌려준다 (Claude 가 읽는 양이 줄어 새로고침이 빨라진다)
  try {
    if (typeof CompressionStream !== 'function' || cfg.plain) return out;
    const gz = new Uint8Array(await new Response(new Blob([out]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let bin = '';
    for (let i = 0; i < gz.length; i += 0x8000) bin += String.fromCharCode.apply(null, gz.subarray(i, i + 0x8000));
    return 'JUNGGOZ1:' + btoa(bin);
  } catch {
    return out;
  }
}
await junggoCollect(__CONFIG__);
