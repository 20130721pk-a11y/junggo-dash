# 웹 → 앱 명령 꼴 1 (`junggo-radar-cmd`, 웹 조작 1판 · 앱 0.7.3)

웹 화면에서 누른 단추를 **잠근 명령**으로 비공개 데이터 저장소의 이슈에 올리고, 폰 앱이 읽어 **앱 화면 단추와 같은 함수**로 처리한 뒤
이슈를 닫고 결과를 묶음(`radar.enc`)의 `cmds` 칸으로 바로 올려요. 찾기·판정은 늘 앱이 해요(당근은 폰에서만 — 팀 원칙 1).

- 바탕(대표 승인 10/20): 기획 「웹 = 앱 기능 계획」 2장·3장·대표 결정 1~7, 디자인 「웹 = 앱 기능 디자인」 5-1·10-2, 약관·리스크 「웹 → 앱 명령 길」 L-1~L-12 + 대표 결정(비밀번호는 탭마다 한 번 · 늦은 그냥 검색·지금 확인은 **6시간**).
- 웹 담당이 먼저 정한 꼴이에요. 앱 담당은 이 문서를 따르고, 바꿔야 하면 **이 문서를 먼저 고쳐** 두 쪽이 같이 바꿔요(웹 노트 '확인 필요'에 적기).
- 묶음에 더하는 칸은 `docs/bundle-v1.md` 맨 아래 '꼴 1 더하기 (웹 조작 1판)'.
- 숫자 중 근거 없는 것은 **(초안)** — 기획 초안 값 그대로예요.

---

## 1. 길

| 무엇 | 값 |
|---|---|
| 저장소 | 묶음을 받는 비공개 데이터 저장소(기본 `<주인>/junggo-dash-data`). 새 저장소 없음 |
| 이슈 제목 | **`꿀매 레이더 명령`** 고정 — 검색어·물건 이름·매물 제목을 넣지 않아요 |
| 이슈 몸통 | 잠근 상자 JSON **한 줄**(아래 2장). 그 밖의 글 없음 |
| 이름표·담당자·댓글 | 없음. 앱도 댓글을 달지 않아요(검색어가 이슈에 남지 않게) |
| 웹 토큰 | 그 저장소 하나 · Contents **읽기** · Issues **읽기와 쓰기** · 기한 90일(초안). 묶음 파일은 이 토큰으로 못 바꿔요 |
| 앱 토큰 | 지금 토큰에 그 저장소 Issues **읽기와 쓰기** 더함(대표가 GitHub 에서) |
| Actions | 이 길엔 없어요(AC-19). 데이터 저장소에 워크플로를 두지 않아요 |

GitHub REST(버전 머리 `X-GitHub-Api-Version: 2022-11-28`):

| 누가 | 무엇 | 요청 |
|---|---|---|
| 웹 | 명령 보내기 | `POST /repos/{repo}/issues` `{ "title": "꿀매 레이더 명령", "body": "<상자 한 줄>" }` → 201, 응답 `number` 를 기억 |
| 웹 | 취소(앱이 받기 전) · 그냥 검색 바꾸기 | `PATCH /repos/{repo}/issues/{number}` `{ "state": "closed", "state_reason": "not_planned" }` |
| 웹 | 상태 보기(보낸 뒤 20초마다·10분까지) | `GET /repos/{repo}/issues/{number}` — `state`·`state_reason` |
| 앱 | 열린 명령 읽기 | `GET /repos/{repo}/issues?state=open&sort=created&direction=asc&per_page=30` + `If-None-Match`(ETag, 304 는 한도에 안 셈) |
| 앱 | 닫기 | `PATCH …/issues/{number}` `{ "state": "closed", "state_reason": "completed" | "not_planned" }` |

---

## 2. 잠금

- 상자 꼴·셈은 묶음과 같아요(`box.js` · 앱 `DashBox`): `{ v:1, kdf:"PBKDF2-SHA256", iter, salt, iv, ct }`, 열쇠 = PBKDF2-HMAC-SHA256(비밀번호 UTF-8, salt, iter) 32바이트, 내용 = AES-256-GCM(gzip(JSON)), ct 끝 16바이트가 인증 태그.
- **용도 이름(AAD) = `junggo-radar-cmd`** (묶음 `junggo-radar-view`, 웹 토큰 `junggo-radar-token`, 예전 `junggo-view`·`junggo-djob`·`junggo-dres` 와 따로 — 다른 용도 상자를 바꿔치기 못 해요).
- **salt·iter = 지금 묶음 상자(`radar.enc`)의 salt·iter** 그대로(= 앱 대시보드 열쇠의 소금). 앱은 `salt` 가 자기 열쇠 소금과 다르면 '열 수 없음'으로 봐요.
- 웹은 명령을 보낼 때 **탭마다 한 번** 비밀번호를 받아 열쇠를 **메모리에만**(`extractable:false`) 둬요. 탭을 닫으면 버려요. 보기용 '기억하기' 열쇠로는 명령을 잠그지 않아요(L-1).

---

## 3. 열린 내용 (잠긴 안쪽)

```json
{ "v": 1, "kind": "junggo-radar-cmd", "id": "c_mgy3k2a1_7f2kq", "at": 1790000000000, "from": "web",
  "type": "edit", "pid": "s_abc123", "set": { "thresholdPct": 20 }, "base": { "thresholdPct": 15 } }
```

| 칸 | 꼴 | 뜻 |
|---|---|---|
| `v` | 1 | 꼴 번호. 앱이 모르는 번호면 `failed` '웹과 앱 판이 맞지 않아요 — 앱을 새 판으로 올려 주세요' |
| `kind` | `"junggo-radar-cmd"` | 다르면 열 수 없음 |
| `id` | 글 `^c_[0-9a-z]{6,12}_[0-9a-z]{5}$` | `c_` + 보낸 시각(ms) 36진 + `_` + 임의 5자. 같은 `id` 는 한 번만 처리(앱이 7일 기억) |
| `at` | ms | 웹이 보낸 시각. `now - 7일` 보다 옛것·`now + 10분` 보다 뒤는 열 수 없음(되풀이·시계 틀림) |
| `from` | `"web"` | 지금은 웹만 |
| `type` | 글 | 아래 4장 표의 값만(L-12). 모르는 값이면 `failed` '모르는 명령이에요 — 앱을 새 판으로 올려 주세요' |
| 그 밖 | 종류마다 | 4장 |

규칙(L-12): 명령엔 **정해진 값만** — 코드·스크립트·임의 주소 없음. 주소는 `share` 의 `url` 하나뿐이고 3사 호스트와 **정확히** 같을 때만(5장).

---

## 4. 명령 종류 (1판 = 폰 전용 6줄 빼고 앱 기능 전부)

'앱 함수'는 앱 화면 단추가 부르는 바로 그 길이에요(G-1 — 웹 전용 처리 길을 따로 만들지 않음). `pid` = 저장검색 id, `key` = 매물 키(`j:123`).
'오래됨'이 **6시간**인 것: 6시간 넘게 못 받았으면 하지 않고 `stale` '너무 오래돼 하지 않았어요'(대표 결정). 나머지는 늦어도 해요.

| type | 칸 | 앱 함수(같은 길) | 오래됨 | 결과 |
|---|---|---|---|---|
| `add` | `q` 검색어(친 글 그대로, 쉼표 3개까지는 앱이 자름), `card`? 물건 카드 id(`gpu:4080`·`console:ps5`) | `SearchViewModel.addProduct(q, card)` — 카드 id 는 `Products.gpu(번호)`·`Products.ps5()` 로 되살림 | — | 같은 검색어가 있으면 `done` '이미 지켜보는 물건이에요'. 만들면 `pid` 를 결과에 |
| `edit` | `pid`, `set`{칸: 새 값}, `base`{칸: 바꾸기 전 값} | 조건 창 저장과 같은 읽기(`parseWon`·`parseWords`·`Judge.clampPct`·기간 30 규칙) → 칸별 충돌 검사 → `Radar.update(old, new)` **한 번** | — | 6장 '충돌' |
| `identify` | `pid`, `set`{`category`, `bandMin`, `bandMax`, `excludeWords`[], `includeWords`[], `models`?} (숫자·목록 그대로). `models`(R12 4단계, '모델' 칸을 고쳤을 때만) = {`defs`[{`n`,`need`[1~5],`u`?}] 20개까지·글 40자, `off`, `user`, `renamed`{옛 이름: 새 이름}} — 앱 `ModelEdit.Choice`, 없으면 모델 칸 그대로 | 물건 확정 시트 '이대로 정하기'(`applyIdentity` 길 — confirmed=true, 카테고리가 바뀌면 다시 모음, `models` 는 `ModelEdit.apply`) | — | `done` |
| `remove` | `pid` | 그만 지켜보기(`Store.remove` + `Radar.forget`) | — | 이미 없으면 `done` '이미 지웠어요' |
| `pause` | `pid`, `on`(참 = 잠시 끄기 · 거짓 = 다시 켜기) | 홈 카드 ⋯ '잠시 끄기'·끈 카드 '다시 켜기'(앱 `Actions.pauseProduct`·`resumeProduct` — 0.8.0 R7). 다시 켜면 바로 전체 확인 한 번(알림 없이 기준만) | 다시 켜기만(앱 웹발 당근 몫에 셈) | 이미 그 상태면 `done` '이미 잠시 꺼 뒀어요'/'이미 켜 둔 물건이에요'. 끈 물건엔 `edit`·`identify`·`move`·`check`(pid)·`hide`·`unhide`·`unhideAll`·`excludeWord` 를 앱이 `failed` '잠시 끈 물건이에요 — 다시 켠 뒤에 해 주세요'로 막음(웹은 단추를 끔), `focus` 시작은 끈 물건을 빼고 |
| `move` | `pid`, `dir` `"up"`·`"down"` | 카드 ⋯ 위로/아래로(`Store.move`) | — | 맨 끝이면 `done`(그대로) |
| `focus` | `op` `"start"`: `ids`[pid, 2개까지], `hours` 1~3, `everyMin` 5·10 / `op` `"stop"` | 설정 집중 감시 시작·멈추기(`Prefs.setFocus` + `FocusService`) | start 만 6시간 | 안드로이드 12+ 백그라운드에서 못 켜면 '눌러서 켜기' 알림을 띄우고 `failed` '폰에서 알림을 눌러 주세요'(기획 2-8) |
| `check` | `pid`? (없으면 전부) | 하나 = 결과 화면 새로고침과 같게(30분 안 전체 확인이면 빠른 확인) · 전부 = 당겨서 새로고침(`Radar` 전체 확인) | 6시간 | 전부는 30분에 한 번(초안) — 30분 안 두 번째면 `failed` '30분에 한 번만 할 수 있어요' |
| `adhoc` | `q` | 검색창 그냥 검색(`collector.fetch` + `Products.adhocItem` + `filtered`, 30분 안 같은 검색어면 보관 결과) | 6시간 | 결과를 묶음 `adhoc` 에. 보관 결과로 답했으면 결과에 `cached:true`(웹 1시간 횟수에 안 셈). 웹 그냥 검색 **1시간 6번**(보관 결과 빼고, 앱이 셈) 넘으면 `failed` '1시간에 6번까지예요' |
| `saveAdhoc` | `q`, `variantPick` `""`(둘 다)·`"기본"`·변형 이름 | 그냥 검색 결과 '+ 지켜보기'(`saveCurrent(variantPick)`) — 그 검색어의 보관 결과로. 없으면 먼저 모음 | — | 만들면 `pid` 를 결과에 |
| `star` | `key`, `pid`?, `on` 참/거짓 | ★ 넣기 = `Store.watchListing(l, STAR, pid)` / 빼기 = `Store.removeWatch`. 매물을 풀·스냅숏에서 못 찾으면 키만으로(공유 넣기와 같은 꼴) | — | 이미 그 상태면 `done` |
| `hide` | `pid`, `key` | 이 매물 아님(`Radar.hide` — 숨김 키 + 오판 사례) | — | `done` |
| `unhide` | `pid`, `key` | 되돌리기 — 원격은 그 물건 숨김 키에서 **이 키만** 뺌(앱 '그 사이 바뀌었으면' 길, 기획 2-5) | — | 다음 확인 뒤 줄이 돌아와요 |
| `unhideAll` | `pid` | 조건 창 '모두 다시 보기' + 저장(hiddenKeys 비움) | — | `done` |
| `excludeWord` | `pid`, `word`, `key`? | 판단 화면 '이 말이 든 매물은 모두 빼기'(`excludeWord(word, from)`) | — | `done` |
| `watch` | `key`, `op` `"pin"`·`"remove"` | 관심 매물 '★로 고정'·'그만 보기' | — | `done` |
| `share` | `url` | 공유 받기와 같은 길로 관심 매물 넣기 — **단 5장 호스트 검사를 먼저**(L-6) | — | 호스트가 맞지 않으면 `failed` '중고나라·당근·번개장터 매물 주소만 넣을 수 있어요' |
| `opened` | `key`, `pid`? | 판단 화면 'OO 앱에서 열기'의 연 횟수 셈(`noteOpened`) | — | 결과 줄·알림함 줄 없음(조용히) |
| `inboxRead` | `ids`[알림 id] 또는 `all` 참 | 알림함 읽음 · 모두 읽음 | — | 결과 줄·알림함 줄 없음 |
| `recent` | `op` `"del"`(+`q`)·`"clear"` | 최근 검색 하나 지우기 · 지우기 | — | 결과 줄만. 되돌리기는 웹이 토스트 6초 동안 **보내지 않고 기다려서** 해요(되돌리기 명령 없음) |
| `prefs` | `set`, `base` (칸: `defaultPct` 5~45 · `autoWatchN` 0~5 · `intensity` `"save"`·`"normal"` · `quiet` {`on`,`start`,`end`} · `digestOn` 참/거짓) | 설정 화면 같은 칸 저장(`Prefs.set…`) | — | 칸별 충돌(6장) |
| `home` | `set`{`daangnHome` 글(쉼표, 5곳까지), `distanceBase` 글}, `base` 같은 칸 | 설정 '당근 내 동네' 저장 — 바뀐 물건을 1분 간격으로 하나씩 다시 모음(같은 줄 세우기) | — | 5곳 넘으면 `failed` '내 동네는 5곳까지예요. 하나를 빼고 더해 주세요' |

**`edit` 칸**(이름 = `SavedSearch` 칸 이름, 조건 창 17칸):

| 칸 | `set` 꼴 | `base` 꼴 |
|---|---|---|
| `keyword` · `excludeWords` · `includeWords` · `regionWords` | **친 글 그대로**(예 `"본체，노트북"`) — 앱 `parseWords`·`trim` 이 읽음 | 묶음 `cfg` 값(글 / 글 목록) |
| `targetPrice` · `bandMin` · `bandMax` · `priceMin` · `priceMax` | **친 글 그대로**(`"35"`, `"1.5만"`, `"500원"`, 빈 글 = 없음) — 앱 `WonInput.parse` 가 읽음(G-4) | 묶음 `cfg` 값(원 또는 null) |
| `thresholdPct` | 수(직접 입력도 친 수 그대로) — 앱 `Judge.clampPct` | 수 |
| `variantPick` | `""`(전부)·변형 이름 | 글 |
| `matchMode` | `"title"`·`"content"` | 글 |
| `category` | 카테고리 키(`""` = 전체) | 글 |
| `basicFilter` · `lowestAlert` | 참/거짓 | 참/거짓 |
| `maxKm` | null(가까운 동네)·3·5·10·20 | 수/null |
| `maxAgeDays` | 30·60·90·0(전체) — 앱이 '30 이고 원래 null 이면 null' 규칙 그대로 | 묶음 `cfg` 값(null = 기본 30일) |

웹은 **바꾼 칸만** 보내요(바뀐 게 없으면 저장을 못 눌러요). 결과 화면 '내용까지 보기/제목만'·'보이기/다시 빼기' 줄도 `edit`(`matchMode`·`basicFilter` 한 칸)이에요.

---

## 5. `share` 호스트 (L-6)

`url` 이 `https:` 이고 호스트가 아래와 **정확히** 같을 때만(글자 포함 검사 X). 웹도 보내기 전에 같은 검사를 해요.

`web.joongna.com` · `m.joongna.com` · `www.daangn.com` · `daangn.com` · `m.bunjang.co.kr` · `bunjang.co.kr` · `www.bunjang.co.kr`

(앱 공유 짧은 주소 `*.page.link` 등은 원격에선 받지 않아요 — 따라 열어야 해서. 확인 못 함: 3사가 쓰는 짧은 주소 호스트 전체 — 앱 담당이 `ShareParse` 의 실제 목록과 맞춰 이 줄을 고쳐 주세요.)

---

## 6. 처리 규칙 (앱)

1. **언제 읽나**: 앱을 열 때(앞으로 올 때) · 앞에 있는 동안 1분마다 · 백그라운드 15분 작업마다(감시 강도로 확인을 건너뛰는 차례에도 명령은 먼저) · 집중 감시 차례(기획 2-4). 아이폰판은 '열 때'가 기본(기획 2-9).
2. **고르기**: `pull_request` 칸이 있는 것 빼고, 제목이 정확히 `꿀매 레이더 명령`이고 만든 사람(`user.login`)이 저장소 주인인 것만. 만든 순서(번호 작은 것부터)로 **한 차례 10개까지**(L-4).
3. **열기**: 몸통이 상자가 아니거나 · salt 가 다르거나 · 열쇠가 틀리거나 · `kind`/`id`/`at` 이 3장 규칙에 어긋나면 → 처리하지 않고 `not_planned` 로 닫음(결과 줄 없음 — 열 수 없는 상자에선 `id` 를 믿을 수 없어서). **열 수 없는 이슈가 1시간에 5개를 넘으면** 명령 받기를 6시간(초안) 멈추고 알림함에 '웹 토큰이 샜을 수 있어요 — GitHub 에서 토큰을 지우고 새로 만들어 주세요' + 묶음 `cmdLock`(L-4). 403·429 면 `retry-after` 를 지켜요.
4. **되풀이**: 처리한 `id` 를 7일 기억 — 같은 `id` 면 처리하지 않고 닫음(결과 줄은 처음 것 그대로).
5. **순서**: 한 차례 안에서 만든 순서대로 **하나씩**. 같은 차례에 `adhoc` 가 여럿이면 **마지막 것만** 하고 앞의 것은 `failed` '새 검색으로 바꿨어요'(웹 대기 1개 규칙의 안전망).
6. **오래됨**: 4장 표 '6시간' 종류는 `now - at > 6시간` 이면 `stale`.
7. **처리 중 표시**: 다시 모으는 명령(`add`·`adhoc`·`check`·`saveAdhoc`, 다시 모으는 `edit`·`identify`, `home`)은 **시작할 때** 결과 줄 `running` 을 묶음에 바로 올리고(아래 9), 끝나면 마지막 상태로 바꿔요. 그 밖의 명령은 마지막 상태만.
8. **닫기**: `done`·`conflict` = `completed`, `failed`·`stale` = `not_planned`. 웹이 먼저 닫은 이슈(취소)는 읽지 않으니 처리하지 않아요. 앱이 이미 받아 처리하는 중에 웹이 닫았으면 그대로 처리하고 결과 줄을 올려요(웹은 결과 줄을 보고 '이미 앱이 받았어요').
9. **바로 올리기**: 명령을 처리한 차례는 묶음을 바로 올려요 — `ViewPolicy` 에 '명령' 까닭을 더해 10분 규칙을 건너뜀(실패 뒤 5분 쉼은 지킴, 기획 2-4·AC-16).
10. **알림함 한 줄**(L-1b): 처리한 명령마다(`opened`·`inboxRead` 빼고) 알림함에 한 줄 — 폰 알림은 띄우지 않음. 꼴: 종류 `web`, 제목 `웹에서: {what}`(7장), 글 = 결과 글('끝났어요' / '못 했어요 — {why}'). 대표가 모르는 명령을 알아챌 수 있게.
11. **당근**: 웹 명령도 앱의 같은 당근 줄을 타요 — 기기 1시간 150·하루 3,000·한 검색 10번·쉬는 중이면 안 부름·robots 확인이 그대로 걸려요. 웹이 따로 부르는 길은 없어요.

**충돌(`edit`·`prefs`·`home`)**: 칸마다 '지금 값 = `base`' 면 바꾸고, 다르면 그 칸만 빼고 나머지는 바꿔요(기획 2-5).
- 바꾼 칸이 있고 충돌 칸도 있으면 상태 `conflict`, `why` '일부만 바꿨어요 — {칸 이름}은 앱에서 먼저 바뀌었어요', `conflict`{칸: 지금 값}, `applied`[바꾼 칸].
- 모두 충돌이면 `conflict`, `why` '앱에서 먼저 바뀌었어요 — 새로 고친 뒤 다시 해 주세요', `applied` [].
- 비교: 글은 `trim` 뒤, 목록은 차례째 같음, 수·null 은 그대로, `quiet` 는 세 칸 모두.
- 칸 이름(앱·웹 같은 글): `keyword` 검색어 · `thresholdPct` 꿀매 기준 · `targetPrice` 목표가 · `variantPick` 변형 · `matchMode` 검색어 확인 · `category` 카테고리 · `excludeWords` 빼고 볼 단어 · `includeWords` 꼭 들어갈 단어 · `bandMin`/`bandMax` 물건 가격대 · `basicFilter` 기본 거르기 · `priceMin`/`priceMax` 예산 · `regionWords` 당근 동네 · `maxKm` 당근 거리 · `maxAgeDays` 기간 · `lowestAlert` 최저가 갱신 알림 · `defaultPct` 새 물건의 꿀매 기준 · `autoWatchN` 자주 본 매물 자동으로 지켜보기 · `intensity` 감시 강도 · `quiet` 조용한 시간 · `digestOn` 하루 요약 · `daangnHome` 당근 내 동네 · `distanceBase` 거리 기준.

---

## 7. 결과 줄 — 묶음 `cmds` (최근 7일 · 50개, 새것 먼저)

```json
{ "id": "c_mgy3k2a1_7f2kq", "n": 41, "type": "edit", "pid": "s_abc123", "state": "conflict",
  "what": "RTX 4080 조건 바꾸기", "why": "일부만 바꿨어요 — 목표가는 앱에서 먼저 바뀌었어요",
  "conflict": { "targetPrice": 1200000 }, "applied": ["thresholdPct"], "at": 1790000000000, "doneAt": 1790000060000 }
```

| 칸 | 뜻 |
|---|---|
| `id` · `type` · `pid`? · `key`? | 명령 그대로. `add`·`saveAdhoc` 은 만든(또는 이미 있던) 물건 `pid` |
| `n` | 이슈 번호(웹이 취소·상태를 맞출 때) |
| `state` | `running` 앱이 하는 중 · `done` 끝남 · `failed` 못 함 · `conflict` 충돌 · `stale` 너무 오래 (`queued` 는 쓰지 않아도 돼요 — 웹은 결과 줄이 없으면 '보냈어요 · 앱이 받기를 기다려요') |
| `what` | 화면에 쓸 이름(아래 규칙, 앱이 만든 글 — 물건이 지워져도 웹이 이름을 보여 줄 수 있게) |
| `why` | 앱 글 그대로(실패·충돌·'이미 …') |
| `conflict` · `applied` | 충돌 칸의 지금 값 · 바꾼 칸 |
| `cached` | `adhoc` 을 보관 결과로 답함(1시간 횟수에 안 셈) |
| `at` · `doneAt` | 명령의 `at` · 앱이 마지막 상태로 바꾼 때 |

**`what` 규칙**(웹이 결과 줄 전에 쓰는 글과 같게 — `{물건}` = 저장검색 이름, `{제목}` = 매물 제목 20자 + '…', `{q}` = 검색어):
`add` '{물건 또는 카드 이름 또는 q} 추가' · `edit` '{물건} 조건 바꾸기' · `identify` '{물건} 물건 정하기' · `remove` '{물건} 그만 지켜보기' · `pause` '{물건} 잠시 끄기'/'{물건} 다시 켜기' · `move` '{물건} 위로'/'{물건} 아래로' · `focus` '집중 감시 시작'/'집중 감시 멈추기' · `check` '{물건} 지금 확인'/'지금 모두 확인' · `adhoc` "그냥 검색 '{q}'" · `saveAdhoc` "'{q}' 지켜보기" · `star` '★ 지켜보기 · {제목}'/'★ 빼기 · {제목}' · `hide` '이 매물 아님 · {제목}' · `unhide` '되돌리기 · {제목}' · `unhideAll` '{물건} 숨긴 매물 모두 다시 보기' · `excludeWord` "{물건} '{word}' 빼기" · `watch` '★로 고정 · {제목}'/'그만 보기 · {제목}' · `share` '관심 매물 넣기(주소)' · `recent` '최근 검색 지우기'/'최근 검색 모두 지우기' · `prefs` '설정 바꾸기' · `home` '당근 내 동네 바꾸기'.

**자주 쓰는 `why`**(앱·웹 같은 글): '이미 지켜보는 물건이에요' · '이미 지웠어요' · '이 물건을 찾지 못했어요(앱에서 지운 것 같아요)' · '이 매물을 찾지 못했어요' · '너무 오래돼 하지 않았어요' · '1시간에 6번까지예요' · '30분에 한 번만 할 수 있어요' · '새 검색으로 바꿨어요' · '폰에서 알림을 눌러 주세요' · '중고나라·당근·번개장터 매물 주소만 넣을 수 있어요' · '내 동네는 5곳까지예요. 하나를 빼고 더해 주세요' · '모르는 명령이에요 — 앱을 새 판으로 올려 주세요'.

---

## 8. 웹 쪽 규칙 (앱은 웹을 믿지 않고 같은 셈을 해요)

| 무엇 | 값 |
|---|---|
| 열린 명령 상한 | 20개(초안). 넘으면 명령 단추를 못 누름 + '앱이 아직 앞 명령을 못 받았어요' |
| 그냥 검색 | 1시간 6번 · 한 번에 1개 대기(새로 보내면 앞 이슈를 웹이 닫음). 30분 안 같은 검색어는 묶음 `adhoc` 결과를 바로 보여 주고 보내지 않음(횟수에 안 셈) |
| 지금 모두 확인 | 30분에 한 번 |
| 최근 검색 지우기 | 토스트 6초 동안 기다렸다가 보냄(그 사이 되돌리기 = 안 보냄) |
| 이 매물 아님 | 바로 보냄. 앱이 받기 전 되돌리기 = 이슈 닫기(취소), 받은 뒤 = `unhide` |
| 보낸 기록 | 이 브라우저에 `{id, n, type, pid, key, at}` 만(검색어·제목 없음). 그냥 검색어는 탭 저장소(sessionStorage)에만 |
| 화면 값 | 앱 결과(다음 묶음)가 올 때까지 **옛 값 + '바꾸는 중'**(디자인 결정 2). 최근 검색 지우기·알림 읽음만 바로 숨김 |
| 확인 간격 | 보낸 뒤 20초마다·10분까지 이슈 상태 + 묶음 |

---

## 9. 상호 확인 자료 (시험)

- **웹 → 앱**: `test/fixtures/web-cmds.json` — 웹 코드(`radar-cmd.js`)가 시험 비밀번호·소금으로 잠근 명령 상자와 그 열린 내용 짝(종류마다 하나 이상). 앱 담당은 `DashBox.open(box, key, "junggo-radar-cmd")` 로 열어 `plain` 과 같은지, 각 명령을 같은 함수 입력으로 읽을 수 있는지 시험해요. 비밀번호·소금은 파일 안 `password`·`salt`(시험 전용 — 실제 값 아님). `node test/fixtures/make-cmds.mjs` 로 다시 만들어요.
- **앱 → 웹**: 앱 담당이 `test/fixtures/app-cmds.json` 을 만들어 웹 저장소 이 가지에 올려요 — 꼴: `{ "note", "password", "salt", "iter", "boxes": [{ "box": <앱 DashBox.seal 로 잠근 명령>, "plain": <열린 내용> }], "bundle": <cmds·cfg·pctPreview·identify 등 새 칸이 든 묶음 꼴 1 JSON> }`. 웹 시험(`test/radar-cmd.test.mjs`)이 파일이 있으면 ① 앱이 잠근 상자를 웹이 열 수 있는지 ② 묶음 새 칸을 웹이 읽어 조건 창·결과 줄을 그릴 수 있는지 봐요(없으면 건너뜀).
- 실제 데이터 저장소에 시험 명령을 올리지 않아요(L-11) — 시험은 가짜 GitHub(웹 화면 시험)와 위 파일만.
