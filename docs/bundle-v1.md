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
| `change` | {`dir`:`down`/`up`, `text`:'▼ 3만'} 또는 null | 지금 최저가 바뀜(하루 지나면 앱이 null) |
| `facts` | [{`t`, `icon`?}] | 판단 재료 줄 조각('시세 120만 · 판매완료 기준 18건', '9일 만에 최저', {t:'목표가 이하', icon:'target'}). **그림 이모지 없이** |
| `stateCard` · `statePage` | 글 | 상태 글(카드용·물건 화면용). 모두 ⚠ '믿을 만한 매물이 아직 없어요 · ⚠ 3건' / '… · ⚠ 확인 필요 3건(아래 목록에 있어요)', 다시 내는 중, 빈 결과, 확인 전 글 |
| `cautionCard` · `cautionPage` · `cautionKey` | 글 · 글 · 키 | ⚠ 뺀 줄(카드 `HomeScreen.kt:549`, 물건 화면 `ResultsScreen.kt:252`)과 첫 ⚠ 매물 키 |
| `spark` | (원 또는 null)[30] | 30일 하루 최저(오래된 → 오늘) |
| `min30` | 글 | '30일 최저 95만' |
| `marketLows` | {j,d,b: 원} | 마켓별 최저(믿을 만한 것만) — 만원 글은 웹이 `manWon` 규칙으로 |
| `variantLows` | [[이름, 원]] | 변형별 최저 |
| `nearText` | 글 또는 null | '가까운 당근 최저 101만 · 택배 최저 98만(중고나라)' |
| `cut` | 아래 셋 중 하나 | 판정 기준 칸(시세 탭 RefCard) |
| `ledger` | 글[] | 장부 두 줄(빨리 팔리는 가격대, 어디가 싼가) |
| `conds` | 글[] | 조건 요약 조각(빼기 단어 포함) |
| `listings` | [매물] | 싼 순, 최대 100개, ⚠ 포함 |

`cut`: 변형 여럿 `{ head:'꿀매 기준 -15% · 변형마다 따로', rows:[{name:'SUPER', text:'시세 140만(판매완료 23건) → 119만 원 이하'}, {name:'Ti', text:'매물이 적어 판정 보류', hold:true}] }` · 하나 `{ single:['시세 165만 · 판매완료 기준 14건', '꿀매 기준 -15% → 140만 2천 원 이하'] }` · 다시 내는 중 `{ rebase:'새 조건으로 시세를 다시 내는 중' }`.

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
| `variant` · `unopened` · `dups` | 글/null · 참/거짓 · 수 | 변형(앱 `Variants.of` — 변형을 가르는 검색이면 모든 매물에 이름, 기본은 `'기본'`, 아니면 모두 null), 미개봉, 같은 글 수 |
| `dupRows` | [매물] (없으면 칸 없음) | 이 줄에 같은 글로 묶인 매물(여러 마켓·다시 올린 글), 묶기 전 싼 순 — 매물과 같은 꼴(`dupRows` 는 다시 없음). 보이는 조건을 통과한 것만. 앱 0.7.1.1(10/20)부터 |
| `news` | 글 또는 null | '2번 내림 · 끌올 3번' |
| `star` | 참/거짓 | 앱에서 ★ |
| `place` | 아래 | 지역 |

`place` `{ name, near, km, rough, level, sgg, unknown, text }` — `name` 짧은 동네 이름(`Listing.region`), `near` 물건 동네와 겹침(참/거짓/null), `km` 기준점에서 거리(소수 첫째, **거르기·표시에 같이 씀**, 시·군·구 수준이면 null), `rough` 동 가운데 어림 '≈'(앱 `Loc.approx`: 중고나라 참, 당근 거짓), `level` 앱 `Loc.level`(`dong`·`sgg`·`city`·null), `sgg` 시·군·구 수준일 때 이름(앱 `Loc.place`), `unknown` = 지역 모름(앱 `Loc.unknown`), **`text` = 앱이 만든 지역 글(`Nearby.placeText`) — 있으면 웹은 이것만 그대로 씀(W2-16, 추천)**.
`text`가 없을 때 웹 글(앱 `Nearby.placeText`와 같은 규칙): `unknown` → '지역 모름' · 시·군·구 수준 → '정왕동 · 시흥시 쯤'(이름이 같으면 '시흥시 쯤') · km 있음 → '정왕동 · ≈2.3km'(10km 넘으면 정수, 앱 `Geo.label`) · km 없음 → '정왕동'.
거르기(앱 `Nearby.passes`와 같게): 전체면 다 · 지역 모름은 '함께 보기'일 때만 · 가까운 동네만 = `near` 참 · n km 안 = `km` 있으면 `km ≤ n`, 없으면 `near` 참.
거르기 칩(마켓·변형·지역)은 앱 결과 화면처럼 **묶인 매물마다 거른 뒤 다시 묶어요**(앱 `Pipeline.chipRows`) — 남은 매물 중 첫째가 줄. 그래서 같은 글이 여러 마켓에 있으면 마켓 단추마다 한 줄로 세요(QA-1). 변형 칩은 변형이 둘 이상일 때만, 묶기 전 매물이 많은 변형부터(앱 `Pipeline.variantChips`). `dupRows` 가 없는 옛 묶음은 대표 줄만 봐요.
**좌표는 넣지 않아요**(G4). 웹은 지역 표를 받지 않고 거리를 다시 재지 않아요(W2-18).

## 새 꿀매 · 관심 · 알림

- 새 꿀매 `{ pid, key, at, fresh }` — `key`는 그 물건 `listings` 안의 매물, `at` 처음 본 때, `fresh` '새로' 알약.
- 관심 `{ pid, listing, since, sinceDir, diff, ended }` — `listing`은 매물과 같은 꼴, `since` '지켜본 뒤 -4만', `sinceDir` `down`·`up`·null, `diff` '같은 물건 최저보다 +23만', `ended` 끝남.
- 알림 `{ t, kind, level, title, text, pid, url, delivered, inApp, hidden }` — `kind` = 앱 알림함 종류(`honey`·`target`·`lowest`·`nday`·`drop`·`new`·`caution`·`watch`·`digest`·`system`), `level` = `urgent`·`normal`·`digest`. 꼬리표는 웹이 앱 `InboxScreen.kt:128-132`와 같은 규칙으로 붙여요('요약에 담아요' / '조용한 시간 — 아침에' / '앱에서 봄' / '이 매물 아님 처리').

## 넣지 않는 것 (W2-7)

판매자 번호, 위도·경도(거래·동 가운데·기준점), 매물 설명, 장부 전체, 본 매물 키, 숨긴 매물 키, 판매완료 목록, 토큰, 기기 제조사·모델.
