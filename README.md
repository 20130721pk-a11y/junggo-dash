# 꿀매 레이더 (GitHub 판)

중고나라·번개장터 매물을 저장한 검색별로 모아 보는 개인용 매물판.

- 페이지: https://20130721pk-a11y.github.io/junggo-dash/
- GitHub Actions 가 **한 시간마다**(매시 17분쯤) 매물을 모아 `data` 가지에 올린다.
- 검색어와 모은 매물은 **비밀번호로 잠가서** 올린다. 저장소와 페이지는 공개지만, 비밀번호 없이는 무엇을 찾는지도 보이지 않는다.
- 당근은 GitHub 서버(해외)에서 검색 결과가 나오지 않아 빠진다. 당근 매물은 꿀매 레이더 앱에서 본다.

## 처음 한 번

1. 저장소 **Settings → Secrets and variables → Actions → New repository secret**: 이름 `DASH_PASSWORD`, 값은 페이지 비밀번호(10자 이상).
2. 저장소 **Settings → Pages**: Source 를 *Deploy from a branch*, Branch 를 `main` / `(root)` 로.
3. 페이지를 열고 비밀번호를 넣는다.

## 쓰는 법

- **검색 만들기·고치기·지우기, 가까운 지역 바꾸기**: 페이지에서 바꾸면 위에 'GitHub에 보내기' 줄이 나온다 → 누르면 GitHub 의 새 이슈 화면이 열리고 내용(잠긴 글)이 채워져 있다 → 초록색 **Create**(화면에 따라 **Submit new issue**) → 1~3분 뒤 반영되고 바로 매물을 모은다. 이슈는 저절로 닫힌다.
- **지금 모으기**: 위의 '지금 모으기' → 같은 방식(새 이슈 → Create).
- 요청 이슈는 저장소 주인이 연 것만, 제목이 `꿀매 레이더` 로 시작하는 것만 받는다. 이슈 알림이 귀찮으면 저장소 위의 **Watch → Custom** 에서 Issues 를 끈다.
- 숨김·관심·메모·"새 매물" 기준 시각은 **그 기기의 브라우저에만** 저장된다(폰과 PC 가 따로).
- '이 기기에서 기억하기'를 켜면 그 브라우저에 열쇠를 남겨 다음부터 비밀번호를 묻지 않는다. 설정의 '이 기기에서 잠그기'로 지운다.

## 구조

| 파일 | 내용 |
|---|---|
| `index.html`, `box.js` | 페이지 (GitHub Pages). `box.js` 는 잠그기/열기(WebCrypto) |
| `.github/workflows/collect.yml` | 한 시간마다 · 요청 이슈 · 손으로 실행 |
| `collector/run.mjs` | 지난 데이터 열기 → 요청 반영 → 모으기 → 잠가서 쓰기 |
| `collector/close.mjs` | 처리한 요청 이슈 닫기 |
| `collector/seal.mjs` | 잠그기/열기 (Node). `box.js` 와 형식이 같아야 한다 |
| `collector/refresh.mjs` | 결과 만들기(새 매물·가격 변동·시세 흐름) + 수집기. 빌드 결과물 — 원본은 `collector/src/` |
| `collector/src/collect.js` | 수집기 원본 (브라우저와 Node 양쪽에서 돈다) |

`data` 가지(실행할 때마다 한 커밋으로 덮어씀):

- `view.enc` — 페이지가 여는 것 (검색 목록, 검색별 매물·시세 흐름, 지난 실행 요약)
- `state.enc` — 수집기만 쓰는 것 (검색, 지난 결과, 본 매물 장부, 번개장터 상세 캐시, 반영한 요청)
- `status.json` — 잠그지 않은 요약 (시각, 성공 여부, 건수만 — 검색어·매물 없음)

잠그는 방식: PBKDF2-SHA256(60만 번) 으로 비밀번호에서 열쇠를 만들고 AES-256-GCM 으로 gzip 한 JSON 을 잠근다. 용도 이름(`junggo-view`/`junggo-state`/`junggo-edit`)을 추가 인증 데이터로 넣어 바꿔치기를 막는다.

Actions 로그는 공개라서 검색어·매물 제목은 찍지 않는다(건수만).

## 비밀번호를 바꾸려면

지난 데이터는 예전 비밀번호로 잠겨 있다. `DASH_PASSWORD` 만 바꾸면 수집기가 지난 데이터를 열지 못해 멈춘다(지난 데이터는 그대로 둔다).
처음부터 다시 하려면 `data` 가지를 지우고 비밀번호를 바꾼 뒤 페이지에서 검색을 다시 만든다.

## 고칠 때

```sh
node --test collector/test/*.test.mjs          # 수집기 (네트워크 없이)
npm i --no-save playwright && node test/page.e2e.mjs   # 페이지 (헤드리스 크롬)

# 수집기(collect.js)를 고쳤으면
npm install --prefix /tmp/terser terser@5.31.6
TERSER_DIR=/tmp/terser node collector/src/minify.mjs
node collector/src/build.mjs
```

- 수집기에 `\u` 이스케이프나 보이지 않는 글자를 쓰지 말 것 (`build.mjs` 가 막는다).
- 페이지의 `condKey`·`collectKey`·`CATEGORIES`·`BUY_WORDS` 와 `collector/src/refresh.src.mjs` 의 것이 같아야 한다.
- 사이트마다 `robots.txt` 를 먼저 보고, 검색 경로를 막아 두었으면 그 마켓은 부르지 않는다. 요청에는 `junggo-dash/1.0` 이름을 밝힌다.
- 공개 저장소의 예약 실행은 60일 동안 저장소에 활동이 없으면 GitHub 가 멈춘다. `data` 가지에 매시간 커밋하므로 보통은 괜찮지만, 멈췄다면 Actions 탭에서 다시 켠다.
