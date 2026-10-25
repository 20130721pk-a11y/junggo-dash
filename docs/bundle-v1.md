# 웹용 묶음 꼴 1 (`radar.enc`, 0.7.1)

앱이 확인을 마칠 때마다 만들어 잠가 올리고, 웹 2판(`index.html`)이 받아 **그대로** 그리는 묶음이에요.
바탕: 계획서 `web2-plan.md` 6-2·6-4·5-2, PRD `docs/product/prd-0.7.md` 3-4, 디자인 `web2-design.md` 8장·10-4.
칸 이름은 개발(웹)이 계획서 항목에 맞춰 붙인 **안**이에요 — 앱 담당이 다르게 정했으면 한쪽으로 맞춰요(웹 노트 '확인 필요').

## 놓는 곳·잠금

- 비공개 데이터 저장소(예: `junggo-dash-data`) `view` 가지 `radar.enc` 하나. 부모 없는 커밋으로 덮어써요.
- 상자 꼴은 지금과 같아요: `{ v:1, kdf:"PBKDF2-SHA256", iter, salt, iv, ct }`, 내용 = AES-256-GCM(gzip(JSON)), **용도 이름(AAD) `junggo-radar-view`** (`box.js` `LABEL.radar`).
- 열쇠는 앱이 지금 가진 대시보드 열쇠(지금 `view.enc`와 같은 소금) — 한 비밀번호로 새 보기·예전 보기가 같이 열려요.
- 시험용(디버그만): 잠그지 않은 같은 JSON을 `radar.json`으로 내보내면 웹이 `?src=./폴더`로 열어요.

## 머리 (맨 위)

| 칸 | 꼴 | 뜻 | 없으면 |
|---|---|---|---|
| `v` | 수 | 꼴 번호. 웹이 아는 번호는 `[1]` — 모르면 '앱과 웹 판이 맞지 않아요' | 판 다름 |
| `kind` | 글 | `"junggo-radar-view"` | 판 다름 |
| `made` | ms | 묶음을 만든 때 = 마지막 판정 | 판 다름 |
| `app` | 글 | 앱 판 `"0.7.1"` | 빈칸 |
| `device` | 글 | 사용자가 정한 기기 별명(기본 '내 안드로이드'). **제조사·모델 아님** | '내 안드로이드' |
| `uploads` | ms[] | 최근 7일 올린 시각(오래된 → 새것, `made` 포함) | 공백 목록 안 보임 |
| `everyMin` | 수 | 기대 확인 간격(분) — 늦음 선 = max(45, `everyMin`×2) | 45분 |
| `watchLabel` | 글 | '보통 · 와이파이 15분마다' 같은 감시 강도 글 | 안 보임 |
| `notifOn` | 참/거짓 | 폰 알림 켜짐(F5). `false`면 띠 | 띠 없음 |
| `stall` | {`title`,`text`} 또는 null | 백그라운드 멈춤 띠(앱 글 그대로) | 띠 없음 |
| `errors` | 수 | 오류 기록 건수(F14) | 0 |
| `base` | 글 또는 null | 거리 기준 이름(예 '정왕동'). 지역 거르기 옆 '기준: 정왕동(앱 설정)' | 기준 줄 없음 |
| `markets` | [시장] | 마켓별 수집 상태(아래) | 수집 상태 칸 비움 |
| `products` | [물건] | 저장검색마다(앱 홈 순서) | '앱에 지켜볼 물건이 아직 없어요' |
| `feed` | [새 꿀매] | 새로 뜬 꿀매 30개까지(새것 먼저) | '아직 새 꿀매가 없어요' |
| `watches` | [관심] | 관심 매물 | '앱에서 ★한 매물이 여기 보여요' |
| `inbox` | [알림] | 최근 7일·최대 100줄(앱 알림함 순서 그대로) | 빈 알림함 |
| `recent` | 글[] | 최근 검색어 10개(0.7.1 웹 화면엔 안 씀) | — |

**시장** `{ m, okAt, text, bad, banner }` — `m` = `j`·`d`·`b`, `okAt` = 마지막 성공(ms), `text` = 상태 글(앱 글 그대로, 예 '마켓이 잠시 막았어요 — 15:10에 다시 해요'), `bad` = 문제 있음, `banner` = 문제일 때 띠 제목(예 '당근 확인이 막힌 것 같아요').

## 물건

| 칸 | 꼴 | 뜻 (앱 원본) |
|---|---|---|
| `id` · `name` | 글 | 저장검색 id, 보이는 이름(`keywordLabel`) |
| `state` | 글 | `ok` 정상 · `allCaution` 모두 ⚠ · `rebase` 다시 내는 중 · `unknown` 판정 보류 · `empty` 빈 결과 · `pending` 확인 전 |
| `pct` | 수 | 꿀매 기준 % (카드 '꿀매 -15%') |
| `honey` · `caution` | 수 | 꿀매 수, 지금 최저가에서 뺀 ⚠ 수 |
| `focus` | 참/거짓 | 집중 감시 중 |
| `checkedAt` · `count` | ms · 수 | 마지막 확인, 매물 건수(카드 '3분 전 · 48건') |
| `lowKey` | 글 | 지금 최저가 매물 키(`ok`·`unknown`일 때). `listings` 안에 있어야 해요 |
| `baseVariant` | 글 또는 null | 지금 최저가를 고르는 기준 변형(저장검색에서 고른 변형, 없으면 `'기본'`). 변형을 가르지 않는 검색이면 null. 앱 0.7.1.1(10/20)부터. **모델 물건(`term: 'model'`)은 기준 모델** — 고른 모델, 없으면 앱이 붙잡아 둔 '매물 가장 많은 모델'(`'기본'`은 없음, R12) |
| `term` | `'variant'` · `'model'` · null | 갈래 말(R12, 디자인 G-19): `variant` = 다섯 갈래(그래픽카드·플스5·스위치·아이폰·갤럭시 S) — 글은 '변형', `model` = 앱이 넓은 검색어를 모델로 나눔 — 글은 '모델', null = 나누지 않음. 웹이 '변형'·'모델' 글을 스스로 고르지 않고 이 값을 따라요. 앱 0.7.5(R12)부터 |
| `modelSource` | `'auto'` · `'user'` · `'off'` · null | 모델 출처(R12): `auto` 제목 낱말로 자동 · `user` 물건 정하기에서 고친 목록 · `off` '나누지 않기'. 다섯 갈래·나누지 않는 물건은 null |
| `models` | [{`n`, `need`:[글], `u`?}] 또는 null | 모델 목록(R12, `term: 'model'` 일 때만): `n` 보이는 이름, `need` 제목에 모두 있어야 하는 말(앱 정규화), `u` 이 모델이 속한 넓은 모델 이름('크로스웨이브 맥스' 의 '크로스웨이브'). **웹은 이걸로 매물을 다시 매기지 않아요** — 매물 `variant` 를 그대로 써요(앱 = 웹). 물건 정하기 '모델' 칸·'+ 모델 직접 더하기' 건수 재료(4단계) |
| `change` | {`dir`:`down`/`up`, `text`:'▼ 3만'} 또는 null | 지금 최저가 바뀜(하루 지나면 앱이 null) |
| `facts` | [{`t`, `icon`?}] | 판단 재료 줄 조각('시세 120만 · 판매완료 기준 18건', '9일 만에 최저', {t:'목표가 이하', icon:'target'}). **그림 이모지 없이** |
| `stateCard` · `statePage` | 글 | 상태 글(카드용·물건 화면용). 모두 ⚠ '믿을 만한 매물이 아직 없어요 · ⚠ 3건' / '… · ⚠ 확인 필요 3건(아래 목록에 있어요)', 다시 내는 중, 빈 결과, 확인 전 글 |
| `cautionCard` · `cautionPage` · `cautionKey` | 글 · 글 · 키 | ⚠ 뺀 줄(카드 `HomeScreen.kt:549`, 물건 화면 `ResultsScreen.kt:252`)과 첫 ⚠ 매물 키 |
| `spark` | (원 또는 null)[30] | 30일 하루 최저(오래된 → 오늘) |
| `min30` | 글 | '30일 최저 95만' |
| `marketLows` | {j,d,b: 원} | 마켓별 최저(믿을 만한 것만) — 만원 글은 웹이 `manWon` 규칙으로 |
| `variantLows` | [[이름, 원]] | 변형별·모델별 최저('모델 모름'은 넣지 않음, R12) |
| `nearText` | 글 또는 null | '가까운 당근 최저 101만 · 택배 최저 98만(중고나라)' |
| `cut` | 아래 셋 중 하나 | 판정 기준 칸(시세 탭 RefCard) |
| `ledger` | 글[] | 장부 두 줄(빨리 팔리는 가격대, 어디가 싼가) |
| `conds` | 글[] | 조건 요약 조각(빼기 단어 포함) |
| `listings` | [매물] | 싼 순, ⚠ 포함, **결과 화면 매물 줄 전부**(앱 0.7.1.1 부터 — 그 전엔 100개). 물건마다 모은 매물 풀 상한(앱 `FullPool.MAX` 2,000)까지 |

`cut`: 변형 여럿 `{ head:'꿀매 기준 -15% · 변형마다 따로', rows:[{name:'SUPER', text:'시세 140만(판매완료 23건) → 119만 원 이하'}, {name:'Ti', text:'매물이 적어 판정 보류', hold:true}] }` — 모델 물건은 `head` 가 '꿀매 기준 -15% · 모델마다 따로', 모름 매물이 있으면 `unknown:'모델 모름 3건은 판정하지 않아요'`(줄을 하나 더 만들지 않고 모델 줄 맨 아래 한 줄, 디자인 4-6 · R12). '모델 모름' 줄은 `rows` 에 없어요 · 하나 `{ single:['시세 165만 · 판매완료 기준 14건', '꿀매 기준 -15% → 140만 2천 원 이하'] }` · 다시 내는 중 `{ rebase:'새 조건으로 시세를 다시 내는 중' }`.

## 매물

| 칸 | 꼴 | 뜻 |
|---|---|---|
| `key` | 글 | `"j:123"` (마켓 코드:번호) |
| `m` | 글 | `j` · `d` · `b` |
| `title` · `price` | 글 · 원 또는 null | null = 가격문의 |
| `url` · `thumb` | 글 · 글 또는 null | 원 매물 주소, 사진 주소 |
| `status` | 글 | `selling` · `reserved` |
| `firstSeen` · `updated` | ms | 처음 본 때, 올린(끌올) 때 |
| `grade` | {`k`, `d`, `why`} 또는 null | `k` = `honey`·`good`·`normal`·`caution`·`unknown`, `d` = 시세 대비 %(음수 = 쌈), `why` = 앱 이유 글. null = 다시 내는 중 |
| `variant` · `unopened` · `dups` | 글/null · 참/거짓 · 수 | 변형·모델(앱 `ModelSplit.of` — 나누는 검색이면 모든 매물에 이름, 다섯 갈래의 기본은 `'기본'`, 아니면 모두 null), 미개봉, 같은 글 수. **모델 물건에서 모델을 못 알아본 매물은 `'모델 모름'`**(앱 `Models.UNKNOWN`, 화면 글 그대로) — `'기본'`·null 과 섞으면 안 돼요(웹 `variantOf` 가 빈 값을 '기본'으로 바꾸는 곳, R12). 모름 매물은 `grade.k = 'unknown'`, `grade.why = '모델을 모르는 매물이라 판정하지 않았어요'` |
| `dupRows` | [매물] (없으면 칸 없음) | 이 줄에 같은 글로 묶인 매물(여러 마켓·다시 올린 글), 묶기 전 싼 순 — 매물과 같은 꼴(`dupRows` 는 다시 없음). 보이는 조건을 통과한 것만. 앱 0.7.1.1(10/20)부터 |
| `news` | 글 또는 null | '2번 내림 · 끌올 3번' |
| `star` | 참/거짓 | 앱에서 ★ |
| `place` | 아래 | 지역 |

`place` `{ name, near, km, rough, level, sgg, unknown, text }` — `name` 짧은 동네 이름(`Listing.region`), `near` 물건 동네와 겹침(참/거짓/null), `km` 기준점에서 거리(소수 첫째, **거르기·표시에 같이 씀**, 시·군·구 수준이면 null), `rough` 동 가운데 어림 '≈'(앱 `Loc.approx`: 중고나라·번개장터 참, 당근 거짓 — 번개장터는 0.7.6(R8)부터 상세의 동네 이름으로 채움, 못 부른 매물은 지역 모름), `level` 앱 `Loc.level`(`dong`·`sgg`·`city`·null), `sgg` 시·군·구 수준일 때 이름(앱 `Loc.place`), `unknown` = 지역 모름(앱 `Loc.unknown`), **`text` = 앱이 만든 지역 글(`Nearby.placeText`) — 있으면 웹은 이것만 그대로 씀(W2-16, 추천)**.
`text`가 없을 때 웹 글(앱 `Nearby.placeText`와 같은 규칙): `unknown` → '지역 모름' · 시·군·구 수준 → '정왕동 · 시흥시 쯤'(이름이 같으면 '시흥시 쯤') · km 있음 → '정왕동 · ≈2.3km'(10km 넘으면 정수, 앱 `Geo.label`) · km 없음 → '정왕동'.
거르기(앱 `Nearby.passes`와 같게): 전체면 다 · 지역 모름은 '함께 보기'일 때만 · 가까운 동네만 = `near` 참 · n km 안 = `km` 있으면 `km ≤ n`, 없으면 `near` 참.
거르기 칩(마켓·변형·지역)은 앱 결과 화면처럼 **묶인 매물마다 거른 뒤 다시 묶어요**(앱 `Pipeline.chipRows`) — 남은 매물 중 첫째가 줄. 그래서 같은 글이 여러 마켓에 있으면 마켓 단추마다 한 줄로 세요(QA-1). 변형 칩은 변형이 둘 이상일 때만, 묶기 전 매물이 많은 변형부터(앱 `Pipeline.variantChips`) — **'모델 모름' 칩은 건수와 상관없이 늘 맨 뒤**(R12, 디자인 G-2). 칩 글 건수는 같은 셈(앱 `Pipeline.chipCounts`, 디자인 G-1). `dupRows` 가 없는 옛 묶음은 대표 줄만 봐요.
칩을 고르면 지금 최저가 칸도 앱 결과 화면처럼 보이는 줄 기준으로 바꿔요(앱 `CardCore.screenHero`): 기준 변형(변형 칩 > `baseVariant`) 안에서 `grade.k` 가 `caution` 이 아니고 값이 있는 첫째, 그보다 싼 ⚠ 수, 칸 위 한 줄('⚠ 더 싸 보이는 … n건은 …' · '믿을 만한 매물이 아직 없어요 · ⚠ 확인 필요 n건…' · '{마켓}에는 기본 {이름} 믿을 만한 매물이 아직 없어요 · ⚠ n건 · {변형} 최저 {만원}'). 웹은 판정하지 않고 고르기만 해요. '결과 안에서 찾기'(웹에만 있음)는 지금 최저가를 바꾸지 않아요. 칩이 없으면 `lowKey`·`cautionPage` 그대로. **'모델 모름' 칩을 고르면 지금 최저가 칸 없음**, 칸 자리 한 줄 '모델을 모르는 매물 {n}건이에요 — 판정하지 않아서 지금 최저가로 올리지 않아요'(앱 `CardCore.unknownChipLine`, 디자인 G-3). 기준 모델에 믿을 만한 매물이 없을 때 '· {모델} 최저'에는 모름 매물을 쓰지 않고, 이름은 늘 '{이름} {기준 모델}'('비쎌 크로스웨이브 믿을 만한 매물이 아직 없어요 · …' — 넓은 검색어엔 '기본'이 없음).
**크기**: 물건마다 줄 수 상한 대신 잠근 묶음(radar.enc) 전체 상한 10MB(앱 `WebBundle.MAX_SEALED_CHARS`, 넘으면 앱이 올리지 않고 상태에 적음). GitHub 은 100MiB 넘는 파일을 막고(50MiB 넘으면 경고), 내용 API 는 1~100MB 파일을 raw 꼴로만 줘요 — 웹은 raw 로 받아요.
**좌표는 넣지 않아요**(G4). 웹은 지역 표를 받지 않고 거리를 다시 재지 않아요(W2-18).

## 새 꿀매 · 관심 · 알림

- 새 꿀매 `{ pid, key, at, fresh }` — `key`는 그 물건 `listings` 안의 매물, `at` 처음 본 때, `fresh` '새로' 알약.
- 관심 `{ pid, listing, since, sinceDir, diff, ended }` — `listing`은 매물과 같은 꼴, `since` '지켜본 뒤 -4만', `sinceDir` `down`·`up`·null, `diff` '같은 물건 최저보다 +23만', `ended` 끝남.
- 알림 `{ t, kind, level, title, text, pid, url, delivered, inApp, hidden }` — `kind` = 앱 알림함 종류(`honey`·`target`·`lowest`·`nday`·`drop`·`new`·`caution`·`watch`·`digest`·`system`), `level` = `urgent`·`normal`·`digest`. 꼬리표는 웹이 앱 `InboxScreen.kt:128-132`와 같은 규칙으로 붙여요('요약에 담아요' / '조용한 시간 — 아침에' / '앱에서 봄' / '이 매물 아님 처리').

## 넣지 않는 것 (W2-7)

판매자 번호, 위도·경도(거래·동 가운데·기준점), 매물 설명, 장부 전체, 본 매물 키, 숨긴 매물 키, 판매완료 목록, 토큰, 기기 제조사·모델.

---

## 꼴 1 더하기 (웹 조작 1판 · 앱 0.7.3, 10/20)

명령 길(`docs/command-v1.md`)과 웹 조작 화면에 쓰는 칸이에요. **꼴 번호는 그대로 1** — 칸을 더하기만 하고, 웹은 없는 칸을 비워서 그려요(옛 앱 묶음도 열림).
칸 이름은 웹 담당이 먼저 붙인 안이에요(디자인 10-2 · 기획 2-2). 앱 담당이 바꾸려면 이 표를 먼저 고쳐 주세요. 넣지 않는 것(W2-7)은 그대로예요 — 숨긴 매물 **키**는 넣지 않고 **수**만.

### 머리에 더함

| 칸 | 꼴 | 뜻 · 쓰는 곳 | 없으면 |
|---|---|---|---|
| `platform` | `"android"`·`"ios"` | 기기 종류 — 아이폰이면 명령 줄 뒤에 '앱을 열면 처리해요' | 안드로이드로 봄 |
| `cmds` | [결과 줄] | 명령 결과(최근 7일·50개, 새것 먼저) — 꼴은 `command-v1.md` 7장 | 모든 명령 '앱이 받기를 기다려요' |
| `cmdLock` | {`until`, `why`} 또는 null | 열 수 없는 이슈가 몰려 앱이 명령 받기를 멈춤(L-4) — 웹 맨 위 코랄 띠 | 띠 없음 |
| `cards` | [{`id`, `title`, `sub`, `keyword`, `category`}] | '+ 물건' 카드(앱 `Products.QUICK` 순서 그대로) | 카드 칸 대신 직접 쓰기만 |
| `prefs` | {`defaultPct`, `autoWatchN`, `intensity`, `quiet`:{`on`,`start`,`end`}, `digestOn`, `daangnHome`, `distanceBase`} | 설정 S1·S2·S3·S6·S7·S11 지금 값(명령 `prefs`·`home` 의 `base`) | 설정 칸을 회색 '앱이 값을 올린 뒤에 바꿀 수 있어요' |
| `intensityText` | {`save`, `normal`} 글 | 감시 강도 설명(앱 `SettingsScreen` 글 그대로) | 설명 없음 |
| `focusPlan` | {`ids`, `until`, `everyMin`} 또는 null | 집중 감시 계획(띠·설정 칸) | 집중 감시 없음 |
| `notifLine` | 글 | 알림 상태 한 줄(앱 `NotifCheck.line` 그대로) | '폰에서 확인해 주세요' |
| `battery` | {`exempt` 참/거짓, `lastBgAt` ms, `text` 글} | 확인이 끊기지 않게 칸(보기만) | 칸에 상태 없음 |
| `daangn` | {`hour`, `day`, `hourMax`, `dayMax`, `restUntil` ms/null, `text` 글/null} | 수집 상태 '당근 요청 최근 1시간 n번 · 오늘 n번' — `text` = 앱 설정 천천히 줄 그대로('당근이 잠시 요청을 막아 {내일 }HH:MM까지는 고른 동네만 찾아요(더 넓게는 안 찾아요)', 앱 `WebBundle.daangn`·`DaangnRules.slowLine`, 0.7.6 부터 — 그 전 앱은 칸이 없었음), 웹은 코랄로 | 줄 없음 |
| `bunjangDetail` | {`hour`, `day`, `hourMax`, `dayMax`, `restUntil` ms/null, `text`} (R8, 0.7.6) | 수집 상태 '번개장터 동네 요청 최근 1시간 n번 · 오늘 n번 (1시간 200번 · 하루 1,500번까지)' — `text` = 앱 설정 줄 그대로(쉬는 중이면 둘째 줄 '번개장터가 동네 요청을 잠시 막아 {내일 }HH:MM까지 쉬어요(검색은 계속해요)' — 쉼 끝이 한국 날짜로 다음 날이면 '내일 ', 앱 `Time.untilHhmm`; 웹은 둘째 줄부터 코랄). 숫자만, 번호·제목·동네 이름 없음 | 줄 없음 |
| `quota` | {`adhoc`:{`used`, `limit`, `times`[ms]}, `checkAllAt` ms/null, `daangn`:{`used`, `limit`}} | 앱이 센 웹 그냥 검색 1시간 횟수(보관 결과 빼고)·마지막 '지금 모두 확인' — 웹 셈과 다르면 앱 값. `daangn` = 웹발 당근 몫(L-5, 그냥 검색·지금 확인·추가·조건·동네 다시 모으기를 합친 1시간 요청 수 / 60 초안) — **웹은 그리지 않음**(앱 화면에 같은 글이 없어 앱 = 웹 기준으로 안 보임, 넘으면 결과 줄 `why` 로 알 수 있음) | 웹 셈만 |
| `adhoc` | [그냥 검색 결과] 최대 3개, 새것 먼저 | 아래 '그냥 검색 결과' | 그냥 검색 결과 화면은 진행 칸만 |
| `homeQueue` | {`done`, `total`, `ids`[pid]} 또는 null | 내 동네를 바꾼 뒤 다시 모으는 줄('새 동네로 다시 모으는 중 · 2/5') | 표시 없음 |
| `misfits` | 수 | 오판 사례 건수(S13) | 0 |
| `metrics` | 글[] | 지켜보는 숫자 줄(S14, 앱 글 그대로 — '꿀매 정밀도 92% (…)') | 칸 없음 |

### 물건에 더함

| 칸 | 꼴 | 뜻 |
|---|---|---|
| `cfg` | 아래 | 조건 원래 값(조건 창 E1~E16 채우기 · 명령 `edit` 의 `base`) |
| `cfgText` | {`targetPrice`, `bandMin`, `bandMax`, `priceMin`, `priceMax`} 글 | 조건 창 입력칸에 처음 넣을 글(앱 `wonInput` 그대로 — '120만'). 비었으면 '' |
| `confirmed` | 참/거짓 | 물건을 정했는지(카드 '물건 정하기' 알약 · 미확정 띠) — `cfg.confirmed` 와 같음 |
| `variantChoices` | 글[] | 조건 창 '변형' 칩에 쓸 변형(검색어가 변형을 가르고 2개 이상일 때만, 앱 조건 창과 같은 차례). 없으면 칸을 안 그림 |
| `pctPreview` | {"5".."45": 글} | 꿀매 기준 미리보기 글(앱 조건 창 Hint 그대로, 🍯 없이) — 5~45 모든 수. 웹은 계산하지 않고 고른 수의 글을 보여 줘요 |
| `identify` | 아래 | 물건 정하기 창 재료 |
| `dropped` | {`match` 수, `basic` 수} | 결과 화면 '제목이 검색어와 맞지 않는 n건은 뺐어요' · '고장·부품용·박스만·대여 글 n건은 뺐어요'(0 이면 줄 없음 — 앱과 같게) |
| `notes` | 글[] | 마켓 안내(앱 `s.notes` 그대로, 카드 첫 줄·결과 화면 장부 아래) |
| `merged` | 수 | '같은 글 n건을 한 줄로 묶었어요' 의 n(칩 없을 때) |

`cfg` = { `keyword`, `thresholdPct`, `targetPrice`, `variantPick`, `matchMode`, `category`, `excludeWords`[], `includeWords`[], `bandMin`, `bandMax`, `basicFilter`, `hiddenCount`, `priceMin`, `priceMax`, `regionWords`[], `maxKm`, `maxAgeDays`, `lowestAlert`, `confirmed`, `label` } — 값은 `SavedSearch` 그대로(원 단위 수·null). `hiddenCount` 만 키 대신 수.

`identify` = {
`cats`?: 쓰지 않음(카테고리 표는 웹이 앱 `Categories.ALL` 과 같은 표를 가짐 — 키·이름은 바뀌면 같이 고침),
`bands`: [{`lo`, `hi`, `from`, `to`, `n`, `mid`, `tags`}] — 가격대 묶음(앱 `Identify.priceBands`). 정하기 값은 `lo`·`hi`(명령 `identify` 의 `bandMin`·`bandMax`), 줄 글은 앱 시트와 같게 **`from ~ to`**(매물 대부분 가격, 앱 `Sheets.kt` '${manWon(from)} ~ ${manWon(to)}' — 10/20 앱 맞춤, 없으면 `lo ~ hi`) / '31건 · 중간 98만 · 본체 · 미개봉'(`tags` = 뒤쪽 글),
`pick`: {`index`, `withHigher`} 또는 null — 앱 시트가 처음 골라 두는 값(정해 둔 값 → 본체 추천 순),
`intro`: 글 — 가격대 위 안내 글(앱 시트 그대로),
`words`: [{`w`, `n`, `s` 0 그대로·1 빼기·2 꼭}] — 자주 나오는 말 칩과 처음 상태,
`keptEx` · `keptIn`: 글[] — 칩에 없는 예전 빼기·꼭 단어(정하기 때 그대로 붙임 — 앱 시트와 같게),
`previews`: { "<index>|<0 또는 1>": {`n`, `low`:{`price`,`title`} 또는 null, `doubt`} , "none": … } — 그 가격대(+ 더 비싼 묶음)·**처음 단어 상태**·지금 카테고리로 앱이 센 미리보기(`narrowCandidates` + `trustedLowest`). 웹은 고른 값이 이 열쇠와 맞을 때만 숫자를 보여 주고, 단어·카테고리를 바꾸면 '미리보기는 앱이 정한 뒤에 다시 세요'(웹은 판정하지 않음) }.
없으면 창에 '앱이 후보를 올린 뒤에 열 수 있어요 · 지금 확인'.

### 매물에 더함

| 칸 | 꼴 | 뜻 |
|---|---|---|
| `grade.ref` | {`med`, `label`} 또는 없음 | 이 매물을 판정한 시세(원)와 종류 이름('판매완료'·'30일 관측'…) — 지금 최저가 칸 시세 막대(시세의 절반 ~ 1.3배, 앱 `PriceBar`) |
| `sheet` | {`facts`: 글[], `words`: 글[]} 또는 없음 | 판단 창 재료 칸 줄들(앱 `ListingSheet` 글 그대로, 🎯 없이) · '이 말이 든 매물은 모두 빼기' 단어 칩. 크기 때문에 **물건마다 앞 100줄 + 새 꿀매·관심·알림함 매물**에만 넣어도 돼요 — 없으면 웹은 줄에 있는 것(가격·배지·이유·흥정·같은 글)만 보여 줘요 |

### 관심 · 알림에 더함

- 관심 `{ …, src: "star"|"share"|"auto", days, bumps, checkedAt, last: {text, t} 또는 null, events: [{t, text, price?}] 최대 10 }` — 출처 꼬리표·'3일째'·'끌올 2번'·'5분 전 확인'·'최근 · 가격 인하 2시간 전'·변화 기록 서랍.
- 알림 `{ …, id, read, key? }` — 안 읽음 점·탭 숫자·명령 `inboxRead`, 누르면 판단 창(그 물건 `listings` 에서 `key` 로 찾음). 웹 명령 줄은 종류 `web`(command-v1 6장 10).

### 그냥 검색 결과 (`adhoc[]`)

`{ q, at(모은 때 = 앱 cachedAt), cmd?(그 명령 id), count, lowKey, state, stateCard, statePage, cautionPage, cautionKey, baseVariant, term, modelSource, models, facts, cut, conds, notes, listings[], nearby: {total, near} 또는 null, ask: {v, n, b} 또는 null, dropped }` — 물건과 같은 꼴(매물 줄 = 앱 결과 화면 줄 전부)에 `nearby`('당근 31건 중 내 동네 근처 9건만 보여요' 의 31·9 — 앱 `CardCore` 줄), `ask`(변형 묻기 창 '이 검색은 {v} 매물이 훨씬 많아요({v} {n}건 · 기본 {b}건)')를 더함. `listings[].grade` 는 '시세 판정은 참고용'(판단 창 글).

## R12 모델 나누기 (앱 0.7.5, 10/22 — 앱 쪽 묶음까지, 웹 그리기는 4단계)

- 넓은 검색어('비쎌')는 앱이 제목 낱말로 모델을 나눠(`term: 'model'`) 모델마다 시세·꿀매를 따로 내요. 그래픽카드·플스5 등 다섯 갈래는 지금 '변형' 그대로(`term: 'variant'`).
- 묶음에 더한 칸: 물건·`adhoc` 의 `term`·`modelSource`·`models`, `cut.unknown`, 매물 `variant` 의 `'모델 모름'`. 묶음 꼴 번호(`v`)는 그대로 — 칸을 더하기만 했고 옛 웹은 모르는 칸을 무시해요.
- 웹이 지킬 것(앱 = 웹): 매물 모델은 `variant` 그대로(웹이 `models` 로 다시 매기지 않음) · '모델 모름' 칩은 맨 뒤 · 모름 칩을 고르면 지금 최저가 칸 없음 · 판정 이유·판단 재료·조건 요약 글은 앱 글 그대로(`grade.why`·`facts`·`sheet.facts`·`conds` — '모델 자동 2개'·'기준 모델 크로스웨이브'·'모델 안 나눔').
- 아직 없는 것(3단계 앱 화면과 함께): 물건 정하기 '모델' 칸 재료(`identify` 의 모델 후보·미리보기), 알림함 이행 줄의 '여는 곳', 조건 창 '지금 자동 기준 모델' 글.


## R12 4단계 더함 (앱 0.7.5 dev-r12, 10/22)

꼴 번호는 그대로 1 — 칸만 더함. 옛 묶음엔 없어서 웹은 비워 그려요.

| 자리 | 칸 | 꼴 | 뜻 |
|---|---|---|---|
| 물건 | `autoModel` | 글 또는 없음 | 모델 물건만 — 조건 창 '자동이면 매물이 가장 많은 모델(지금 X)이에요'의 X(고른 모델과 상관없는 자동 기준, 앱 `RadarCore.baseName(split, null, baseModel)`) |
| 물건 `identify` | `models` | 아래 | 물건 정하기 '모델' 칸 재료(넓은 검색어만 — 앱 `ModelEdit.start`가 null 이면 없음) |
| 매물 `sheet.facts` | 끝 줄 | 글 | 저장한 물건의 '모델 모름' 매물이면 `SheetCore.UNKNOWN_HINT` '물건 정하기 › 모델에서 모델 낱말을 더할 수 있어요'(앱 판단 시트와 같은 자리) |
| 알림 | `open` | `'identifyModels'` 또는 없음 | 누르면 그 물건(`pid`)의 물건 정하기 '모델' 칸을 연다 — 앱 `SearchAlerts.opensModels`(이행 줄이고 물건이 아직 있을 때) |

`identify.models` = { `src` `'auto'`·`'user'`, `off` 참/거짓, `defs` 처음 목록[{`n`,`need`,`u`?}], `auto` '자동으로 되돌리기' 목록, `pinned` 기준 모델(고른 → 붙잡은) 또는 null, `cands` 추천 칩 재료[{`n` 이름, `c` 건수, `mid` 중간값}](B-5, 앱 `Models.suggest` — 웹은 이미 더한 모델을 빼고 8개, 앱 `ModelEdit.chips`),
`items` 후보 매물 싼 순 [[제목, 값 또는 null, 표시]] — 표시 비트 1 = 앞 매물과 같은 글(앱 `Dedup.group`이 빼는 것, 판매자 정보는 싣지 않고 앱이 표시만), 2 = 처음 단어 상태(`identify.words` 의 s)로 빠지는 매물 }.
웹은 판정하지 않고 앱 `ModelEdit`(rows·rename·merge·remove·add·matchCount)·`Models.assign/hits/userModel`을 `radar-cmd.js`로 옮긴 같은 셈으로 줄·건수를 내요 — 앱이 만든 `test/fixtures/app-models.json` 20경우와 같음(`test/radar-models.test.mjs`).
가격대를 고르면 그 범위 + 허수 저가(중간값 10% 아래)를 빼고 셉니다(앱 `Pipeline.narrowCandidates`). 단어 칩을 바꾸면 줄은 처음 단어 상태 그대로예요(미리보기와 같이 '앱이 정한 뒤 다시 세요' 쪽).

**R10(10/22)**: 그래픽카드 번호 검색어('4080' 등 물건 카드 검색어)는 계열 이름(rtx·gtx·rx·지포스·geforce·라데온·radeon)을 검색어 낱말로 봐서 `identify.words`(자주 나오는 말)·`sheet.words`(이 말 빼기)에 나오지 않아요(앱 `Identify.keywordParts`). 웹은 앱이 준 낱말을 그대로 그려서 따로 고칠 곳이 없어요.

- (B-6, 10/25) 사람이 더한 모델의 `need` 에는 붙은 영문·숫자 덩어리('v12'·'m1')가 한 낱말로 들어올 수 있어요. 맞추기는 덩어리가 제목에 차례대로(사이는 없거나 띄어쓰기·'-'), 숫자로 끝나면 소수점·단위가 바로 붙지 않을 때만 — `radar-cmd.js` `gluedHit` = 앱 `Models.gluedHit`.

## R-1 후속 더함 (앱 0.7.5 dev-r12, 10/25 — 값이 섞인 사람 모델은 판정 보류)

대표 결정 10/25 안 b. 사람이 더한 모델 중 값이 고르지 않은 모델(자동 나눔과 같은 값 고르기 — 그 모델 시세 절반 아래를 뺀 뒤 아래 1/4 값이 위 1/4 값의 55% 미만, 값 있는 매물 5건 이상일 때만)은 그 모델만 판정 보류예요. 그 모델 매물은 목록·건수엔 남고 꿀매·지금 최저가·최저가 갱신·목표가·꿀매 알림에서 빠져요('모델 모름'과 같은 결). 자동 나눔·다섯 갈래에는 없어요. 꼴 번호는 그대로 1.

| 자리 | 칸 | 꼴 | 뜻 |
|---|---|---|---|
| 물건 | `held` | 아래 또는 null | 값이 섞여 판정 보류인 사람 모델(앱 `Snapshot.heldModels`) — 없으면 null |
| 물건 | `state`·`stateCard`·`statePage` | | 기준 모델이 보류면 `state` `'unknown'`, `lowKey` null, 상태 글 = `held.lines` 의 그 모델 줄('지금 최저가 · v8 · 값이 섞여 판정 보류') |
| 물건 `cut.rows[]` | `text`·`hold` | | 보류 모델 줄은 `text` '값이 섞여 판정 보류', `hold` 참('매물이 적어 판정 보류' 자리) |
| 매물 | `grade` | | 보류 모델 매물은 `k` `'unknown'`, `why` '{모델} 값이 섞여 판정 보류' |
| 물건 `identify.models` | `hint` | 글 | 값이 섞인 모델 줄 아래 한 줄(앱 `Models.MIXED_HINT` '값이 섞여 판정 보류 — 더 좁은 모델로 나눠 주세요' — 예시가 없을 때, 글은 디자인 확정 10/25) |
| 물건 `identify.models` | `hintEx` | 글 | 예시가 있을 때의 꼴(R12 마무리 10/25, 앱 `Models.mixedHint("{예시}")` '값이 섞여 판정 보류 — 더 좁은 모델로 나눠 주세요(예: {예시})') — 웹 `narrowWord` 답을 `{예시}` 자리에 |

`held` = { `names` 보류 모델 이름[](모델 목록 차례), `chip` 결과 화면 모델 칩 아래 한 줄('m1·m3 값이 섞여 판정 보류 — 더 좁은 모델로 나눠 주세요(예: m1 프로·m3 프로)' — 예시는 앱이 그 모델 매물 제목에서 찾은 것(스냅숏 `heldHints`, 둘까지), 없으면 '… 더 좁은 모델로 나눠 주세요' · 이름 있는 모델 칩이 둘 이상 보일 때만), `lines` 그 모델이 기준(모델 칩·기준 모델)일 때 지금 최저가 칸 자리 한 줄[](`names` 와 같은 차례) }.
웹은 판정하지 않고 이 글을 그대로 그려요: 칩으로 좁힌 지금 최저가(`radar-view.js` `screenHero`, 앱 `CardCore.heldBase`)는 고른 칩·기준 모델이 `held.names` 에 있으면 칸 없이 `held.lines` 줄, 다른 모델 최저에 보류 모델 매물을 쓰지 않아요.
물건 정하기 '모델' 줄은 웹이 줄을 다시 세므로 `radar-cmd.js` `tightOk`·`mixedModel`(= 앱 `Models.tight`·`Models.mixed`)로 줄마다 `held` 를 내고 `hint` 를 그 줄 아래에 그려요(R12 마무리: 보류 줄은 `narrowWord`(= 앱 `Models.narrowWord`)로 예시 `ex` 를 내고, 있으면 `hintEx` 의 `{예시}` 자리에 — `app-models.json` `narrow` 와 같은 답, 거르는 낱말 목록 `NOT_MODEL`·`NOT_MODEL_PART`·`NARROW_SKIP` 도 앱과 견줌) — 앱이 만든 `test/fixtures/app-models.json` 의 `mixed`·`tightCases`·`heldBundle`·줄 `held` 와 같은 답(`test/radar-models.test.mjs`).
