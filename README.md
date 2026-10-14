# 꿀매 레이더 (GitHub 판)

중고나라·당근·번개장터 매물을 저장한 검색별로 모아 보는 개인용 매물판.

- 페이지: https://20130721pk-a11y.github.io/junggo-dash/
- GitHub Actions 가 **한 시간마다** 중고나라·번개장터를 모아 `data` 가지에 올린다. GitHub 의 정각 실행(schedule)은 바쁘면 늦거나 아예 빠져서(2026-10-13: 06시~16시에 한 번만 돎),
  '매물 모으기'가 끝날 때마다 **다음 수집 시계**(`timer.yml`)를 '중고나라·번개장터를 모은 지 한 시간 뒤'로 맞춘다. 시계는 그 시각까지 기다렸다가 '매물 모으기'를 부른다(시계는 늘 하나 — 새로 맞추면 기다리던 것은 취소).
  정각 실행(매시 17분·47분)은 시계가 끊겼을 때 다시 잇는 예비. 45분 안에 모았으면 정각 실행·폰 앱 알림 때는 다시 모으지 않는다.
- **당근은 폰의 꿀매 레이더 앱이 모아 올린다.** GitHub 서버(해외)에서는 당근 검색 결과가 0건이라서다.
  앱이 `data` 가지의 `djob.enc`(할 일: 수집기 코드 + 조건, 잠김)를 받아 폰에서 돌리고, 결과를 잠가 `daangn` 가지(`dres.enc`)에 올린 뒤
  `repository_dispatch`(daangn)로 알리면 Actions 가 바로 합친다. 당근 robots.txt 는 AI 에이전트만 막고 일반 프로그램(`*`)에는 검색 경로를 열어 두었다 —
  앱은 robots.txt 를 보고 막혀 있으면 모으지 않는다. Claude 같은 AI 에이전트가 대신 당근을 모으지는 않는다.
- 검색어와 모은 매물은 **비밀번호로 잠가서** 올린다. 저장소와 페이지는 공개지만, 비밀번호 없이는 무엇을 찾는지도 보이지 않는다.

## 처음 한 번

1. 저장소 **Settings → Secrets and variables → Actions → New repository secret**: 이름 `DASH_PASSWORD`, 값은 페이지 비밀번호(10자 이상).
2. 저장소 **Settings → Pages**: Source 를 *Deploy from a branch*, Branch 를 `main` / `(root)` 로.
3. 페이지를 열고 비밀번호를 넣는다. 검색을 만들고 '설정'에서 가까운 지역(예: 경기도 시흥시, 5곳까지)과 거리 기준(선택, 예: 경기도 시흥시 정왕동)을 정한다(당근은 이 지역들에서 찾는다).
4. 폰 앱용 GitHub 토큰(fine-grained): **Only select repositories → junggo-dash**, 권한 **Contents: Read and write**(daangn 가지 덮어쓰기 + repository_dispatch).
5. 폰에 꿀매 레이더 앱(0.2.0 이상)을 깔고 **대시보드** 탭에서 저장소·토큰·대시보드 비밀번호를 넣고 '연결하고 지금 모으기'.
6. (선택) 페이지용 토큰을 따로: 같은 저장소, 권한 **Issues: Read and write** 만. 페이지 '설정'의 GitHub 토큰 칸에 넣으면 검색을 바꿀 때 GitHub 화면을 거치지 않고 바로 보낸다.
   페이지 토큰은 브라우저(`<주인>.github.io` 출처)에 남으므로 Contents 쓰기 권한이 있는 앱 토큰은 넣지 않는다 — 그 권한이면 main 에 코드를 올려 Actions 의 `DASH_PASSWORD` 까지 닿을 수 있다.

## 쓰는 법

- **검색 만들기·고치기·지우기, 가까운 지역·거리 기준 바꾸기**: 페이지에서 바꾸면 위에 노란 줄이 나온다.
  - 페이지에 토큰을 넣어 두었으면: 창을 다 닫고 6초 뒤 저절로 이슈를 만들어 보낸다(GitHub API). 1~3분 뒤 반영되고 바로 매물을 모은다.
  - 토큰이 없으면: 'GitHub에 보내기' → GitHub 의 새 이슈 화면(내용이 채워져 있음) → 초록색 **Create**(화면에 따라 **Submit new issue**).
  - 이슈는 다 반영하면 저절로 닫힌다. 토큰은 그 브라우저 localStorage 에 비밀번호 열쇠로 잠가 둔다(`jd.tok`).
- **지금 모으기**: 위의 '지금 모으기' → 같은 방식.
- **당근**: 앱이 15분마다(기본은 와이파이에서만) 할 일을 확인해, 검색 조건·지역이 바뀌었으면 바로, 아니면 한 시간마다 모아 올린다(앱 0.2.3 이상. 0.2.2 까지는 한 시간마다만 확인). 앱을 열 때도 한 번 확인한다. 앱의 대시보드 탭에서 '지금 모으기'로 바로 할 수도 있다. 3시간 넘게 안 올라오면 페이지가 알린다.
  검색을 고치면 그 검색의 당근 매물은 폰이 새 조건으로 다시 모을 때까지 비어 보인다(옛 조건으로 모은 매물을 섞지 않으려고).
  당근만 합치러 돈 실행은 45분 안에 모은 중고나라·번개장터를 다시 모으지 않는다.
- **가까운 지역·거리** ('설정'):
  - 가까운 지역은 5곳까지(첫 지역 = 내 동네). 판매 지역이 이 가운데 하나면 '근처'가 붙는다. 당근은 폰 앱이 지역마다 찾는데, 지역이 여럿이면 지역마다 기준 동네를 줄여
    한 검색에 당근을 8번 안팎으로만 부른다(하나: 1+5곳, 둘: 1+3곳씩, 셋·넷: 1+1곳씩). 설정 창에 지난 수집 때 거리 기준 둘레의 시·군·구를 추천한다(가장 가까운 동네까지 거리).
  - 거리 기준(비우면 첫 지역의 가운데)에서 매물까지 직선거리를 잰다: 당근·번개장터는 거래 좌표, 중고나라는 판매 지역 동 가운데(대략 — 페이지에 '≈').
    거리를 잰 위치(ll)를 적어 두고 실행할 때마다 다시 재므로, 거리 기준만 바꾸면 매물을 다시 모으지 않는다(당근도 다시 기다리지 않는다). 가까운 지역을 바꾸면 당근은 폰이 새 지역으로 다시 모을 때까지 기다린다.
  - 페이지의 '지역' 거르기: 전체 / 가까운 지역만 / 5·10·20·30km 안. 거리를 모르는 매물은 가까운 지역 매물만 넣고, 판매 지역을 안 적은 매물은 '지역 모르는 매물도'를 켰을 때만 보인다(그 기기에서 기억).
- 요청 이슈는 저장소 주인이 연 것만, 제목이 `꿀매 레이더` 로 시작하는 것만 받는다. 요청 이슈를 연 사람(주인)은 이슈가 닫힐 때 GitHub 알림을 받을 수 있다. 메일이 귀찮으면 GitHub 오른쪽 위 프로필 → **Settings → Notifications** 의 *Participating, @mentions and custom* 에서 Email 을 끈다(모든 저장소에 적용).
- 숨김·관심·메모·"새 매물" 기준 시각은 **그 기기의 브라우저에만** 저장된다(폰과 PC 가 따로).
- '이 기기에서 기억하기'를 켜면 그 브라우저에 열쇠를 남겨 다음부터 비밀번호를 묻지 않는다. 설정의 '이 기기에서 잠그기'로 지운다.

## 구조

| 파일 | 내용 |
|---|---|
| `index.html`, `box.js` | 페이지 (GitHub Pages). `box.js` 는 잠그기/열기(WebCrypto) |
| `.github/workflows/collect.yml` | 시계 · 요청 이슈 · 폰 앱의 당근 알림(repository_dispatch) · 손으로 실행 · 정각 실행(예비). 끝날 때마다 다음 수집 시계를 맞춘다 |
| `.github/workflows/timer.yml` | 다음 수집 시계: 정한 시각까지 기다렸다가 '매물 모으기'를 부른다 (GITHUB_TOKEN 으로 부른 workflow_dispatch 는 새 실행을 만든다) |
| `collector/run.mjs` | 지난 데이터 열기 → 요청 반영 → 모으기 + 폰 앱 당근 합치기 → 잠가서 쓰기 + 폰 앱 할 일(djob) |
| `collector/close.mjs` | 처리한 요청 이슈 닫기 |
| `collector/seal.mjs` | 잠그기/열기 (Node). `box.js` 와 형식이 같아야 한다 |
| `collector/places.mjs`, `collector/places.json` | 지역 이름 → 가운데 좌표 (중고나라 대략 거리·거리 기준·둘레 지역 추천). 표는 2026-07-01 행정구역의 읍·면·동, 시·군·구 경계 무게 중심 — 아래 '지역 표' |
| `collector/refresh.mjs` | 결과 만들기(새 매물·가격 변동·시세 흐름) + 수집기. 빌드 결과물 — 원본은 `collector/src/` |
| `collector/src/collect.js` | 수집기 원본 (브라우저와 Node 양쪽에서 돈다) |

`data` 가지(실행할 때마다 한 커밋으로 덮어씀):

- `view.enc` — 페이지가 여는 것 (검색 목록, 검색별 매물·시세 흐름, 지난 실행 요약, 설정, `places`: 찾은 거리 기준·둘레 시·군·구)
- `state.enc` — 수집기만 쓰는 것 (검색, 지난 결과, 본 매물 장부, 번개장터 상세 캐시, 반영한 요청)
- `status.json` — 잠그지 않은 요약 (시각, 성공 여부, 건수만 — 검색어·매물 없음). `daangn` 에 당근 건수 요약: 당근을 켠 검색 수(`searches`), 매물을 보여주는 검색(`shown`)·폰을 기다리는 검색(`waiting`)·오류(`errors`) 수, 당근 매물 수(`items`), 마지막으로 올린 쪽(`by`: 지금 모으기 `manual` / 백그라운드 `auto`), 이번에 새 폰 결과를 합쳤으면 `upload`(폰이 모은 검색 수·합친 수·조건이 바뀌어 안 합친 수)
- `djob.enc` — 폰 앱이 할 당근 수집 (수집기 당근 부분 코드, 조건, 조건 지문 ck). 당근 검색이 없거나 지역이 없으면 `idle`

`daangn` 가지(폰 앱이 올릴 때마다 한 커밋으로 덮어씀): `dres.enc` — 앱이 모은 당근 결과(잠김). 앱이 모은 뒤 조건이 바뀐 검색(ck 다름)은 합치지 않는다.

잠그는 방식: PBKDF2-SHA256(60만 번) 으로 비밀번호에서 열쇠를 만들고 AES-256-GCM 으로 gzip 한 JSON 을 잠근다. 용도 이름(`junggo-view`/`junggo-state`/`junggo-edit`/`junggo-djob`/`junggo-dres`, 페이지 토큰은 `junggo-token`)을 추가 인증 데이터로 넣어 바꿔치기를 막는다. 앱(Kotlin)도 같은 형식이다 — 앱 CI 가 이 저장소의 `seal.mjs` 로 앱이 잠근 상자를 열어 본다.

Actions 로그는 공개라서 검색어·매물 제목은 찍지 않는다(건수만).

## 비밀번호를 바꾸려면 (공용 비밀번호)

비밀번호는 두 가지다.

- `DASH_PASSWORD`: 수집기 안쪽 기록(`state.enc` — 검색·장부·시세 흐름)을 잠그는 비밀번호. **한 번 정하면 바꾸지 않는다.**
  바꾸면 수집기가 지난 기록을 열지 못해 멈춘다(지난 데이터는 그대로 둔다). 처음부터 다시 하려면 `data` 가지를 지우고 바꾼 뒤 검색을 다시 만든다.
- `DASH_SHARE_PASSWORD`(선택): 보는 사람이 쓰는 **공용 비밀번호**. 있으면 페이지가 여는 `view.enc` 와 앱이 받는 `djob.enc` 를 이 비밀번호로 잠그고,
  페이지가 보낸 요청·앱이 올린 결과도 이 비밀번호 열쇠로 연다(정하기 전에 잠근 것은 `DASH_PASSWORD` 열쇠로도 열어 본다).
  **언제든 바꿔도 검색·기록은 그대로**다. 바꾸면 다음 실행부터 예전 비밀번호를 기억한 기기는 잠금 화면이 뜨고, 앱은 대시보드 탭에서 새 비밀번호(또는 연결 코드)를 다시 넣는다.
  다른 사람에게 보여 주다 끊고 싶을 때도 이것만 바꾸면 된다.

저장소 **Settings → Secrets and variables → Actions → New repository secret**(있으면 연필 → Update)에서 넣고, 다음 수집(매시 17분이나 47분쯤)이나 '지금 모으기' 뒤부터 적용된다.

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
- 시·도 이름 맞추기(`PROV_ALIAS`·`areaKey`)는 `collector/src/collect.js` 와 `collector/places.mjs` 가 같아야 한다 (2026-07 광주·전남 통합처럼 이름이 바뀌면 둘 다).
- 페이지의 `condKey`·`collectKey`·`CATEGORIES`·`BUY_WORDS` 와 `collector/src/refresh.src.mjs` 의 것이 같아야 한다.
- 사이트마다 `robots.txt` 를 먼저 보고, 검색 경로를 막아 두었으면 그 마켓은 부르지 않는다. 요청에는 `junggo-dash/1.0` 이름을 밝힌다.
- 공개 저장소의 예약 실행은 60일 동안 저장소에 활동이 없으면 GitHub 가 멈춘다(예비인 정각 실행만 해당 — 시계는 그대로 돈다).
- 시계가 끊겼으면(Actions 탭에 '다음 수집 시계'가 돌고 있지 않으면) Actions → 매물 모으기 → Run workflow 를 한 번 누르면 다시 이어진다.

## 지역 표 (`collector/places.json`)

읍·면·동, 시·군·구 경계의 무게 중심(위도·경도 소수 셋째 자리, 약 100m). 행정구역이 바뀌면(새 동·구) 다시 만든다 — 표에 없는 동은 그 시·군·구 가운데로 어림한다.

> 본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다. 중심점 계산: 꿀매 레이더(`collector/src/places_build.py`).

```sh
# vuski/admdongkor 의 parquet/simplified/ 에서 같은 날짜의 sgg_<날짜>_light.parquet, emd_<날짜>_light.parquet 를 받아
pip install pyarrow shapely
python3 -I collector/src/places_build.py sgg_20260701_light.parquet emd_20260701_light.parquet collector/places.json
node --test collector/test/*.test.mjs   # '지역 표' 시험으로 확인
```
