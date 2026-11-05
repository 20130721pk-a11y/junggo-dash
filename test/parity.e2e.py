#!/usr/bin/env python3
"""0.8.7 화면 시험 — 앱 = 웹 정보 양(11/5 대표 '웹과 앱에서 표기되는 정보양이 달라') (헤드리스 크로미움, 네트워크 없이).

    python3 test/parity.e2e.py [스크린샷 폴더]

시험 자료: test/fixtures/app-parity.json = 앱 fix-087-parity WebBundleParity087Test 가 앱 함수로 만든 묶음(지어낸 매물 — 140줄 · 미개봉 ·
가게 · 다른 마켓 같은 글 · 흥정 신호 · SUPER 변형 · 알림함 '사기 같아요'·물건 줄 밖 매물 · 관심 매물 변화 기록 · 사기 같아요 기록 4건).
보는 것(앱 화면과 같은 것만):
 홈 카드 변형 알약 다섯 개까지·누르면 판단 창 · 결과 줄 아래 글 = 앱 ListingRow(이유 글 없음 · 미개봉 · 가게 · 'X에도' · '흥정 신호 · …') ·
 101번째 넘은 줄도 판단 창 재료 · 판단 창 머리 때 = 올린 때 · 지금 최저가 칸에 '처음 본 때' 없음 · 알림함 30일 줄·'사기 같아요로 숨김'·물건 줄 밖 매물 판단 창 ·
 관심 매물 변화 기록 머리 '지켜볼 때 → 지금'·새것부터·메모 · 설정 '사기 같아요 기록 n건' · 페이지 오류 0.
"""
import datetime as dt
import functools
import http.server
import json
import os
import shutil
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'junggo-parity-shots')
os.makedirs(OUT, exist_ok=True)
B = json.load(open(os.path.join(REPO, 'test/fixtures/app-parity.json'), encoding='utf-8'))['bundle']
OK = []


def check(cond, msg):
    if not cond:
        raise AssertionError('실패: ' + msg)
    OK.append(msg)
    print('ok -', msg)


P = B['products'][0]
L = P['listings']
check(len(L) >= 140 and all('sheet' in l for l in L), f"시험 자료: 줄 {len(L)} · 모두 판단 창 재료")

site = tempfile.mkdtemp(prefix='jd-parity-')
for f in ('index.html', 'box.js', 'radar-view.js', 'radar-cmd.js', 'radar-ui.js'):
    shutil.copy(os.path.join(REPO, f), os.path.join(site, f))
os.makedirs(os.path.join(site, 'b'))
json.dump(B, open(os.path.join(site, 'b', 'radar.json'), 'w', encoding='utf-8'), ensure_ascii=False)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=site))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ROOT = 'http://127.0.0.1:%d/index.html?src=./b' % srv.server_address[1]
AT = dt.datetime.fromtimestamp((B['made'] + 3 * 60e3) / 1000, tz=dt.timezone.utc)


def row(page, key):
    return page.locator(f'.rows .row[data-key="{key}"]')


with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 1280, 'height': 900}, locale='ko-KR', timezone_id='Asia/Seoul')
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.route('**/fonts.gstatic.com/**', lambda r: r.abort())
    page.clock.install(time=AT)
    page.goto(ROOT)
    page.wait_for_selector('.cards')

    # ---------- 홈 카드 ----------
    pills = page.locator('.card .lines button.pill[data-act="sheet"]')
    check(1 <= pills.count() <= 5 and pills.count() == min(5, len(P['variantLows'])), f'변형 알약 {pills.count()}개(앱처럼 다섯 개까지) · 누르는 단추')
    pills.first.click()
    page.wait_for_selector('aside.drawer')
    check(page.locator('aside.drawer .facts-box span').count() >= 2, '변형 알약 → 그 매물 판단 창(재료 줄)')
    page.keyboard.press('Escape')
    page.wait_for_timeout(100)
    page.screenshot(path=os.path.join(OUT, 'p1-home.png'), full_page=True)

    # ---------- 결과 줄 ----------
    page.click(f'[data-open="{P["id"]}"]')
    page.wait_for_selector('.rows .row')
    page.wait_for_timeout(100)
    by = {l['key']: l for l in L}
    normal = next(l for l in L if l['grade'] and l['grade']['k'] == 'normal' and l['key'] != P['lowKey'])
    rs = row(page, normal['key']).locator('.rs').all_inner_texts()
    check(not any(normal['grade']['why'] in t for t in rs), '보통 줄: 판정 이유 글 없음(앱 결과 줄과 같게)')
    check('미개봉' in ' '.join(row(page, 'j:new1').locator('.rs').all_inner_texts()), "미개봉 줄: '미개봉' 꼬리표")
    check('가게' in ' '.join(row(page, 'b:shop1').locator('.rs').all_inner_texts()), "가게 줄: '가게' 꼬리표")
    dup = next(l for l in L if l.get('dupText'))
    check(dup['dupText'] in ' '.join(row(page, dup['key']).locator('.rs').all_inner_texts()), f"같은 글 줄: '{dup['dupText']}'(앱 글)")
    hag = row(page, 'j:m5').locator('.rs.hag')
    check(hag.count() == 1 and hag.inner_text() == by['j:m5']['haggle'], f"흥정 신호 줄: '{by['j:m5']['haggle']}'")
    ago_col = row(page, normal['key']).locator('.rn').inner_text()
    check(ago_col != '', f"줄 때 칸 = 올린 때('{ago_col}')")
    hero = page.inner_text('section.box[aria-label^="지금 최저가"]')
    check('처음 본 때' not in hero and '올린 때' not in hero, "지금 최저가 칸: '마켓 · 동네 · n분 전'(앱 HeroCard)")
    page.screenshot(path=os.path.join(OUT, 'p2-rows.png'), full_page=False)

    # 101번째 넘은 줄도 판단 창 재료가 앱과 같게
    far = L[130]
    row(page, far['key']).click()
    page.wait_for_selector('aside.drawer')
    fx = page.locator('aside.drawer .facts-box span').all_inner_texts()
    check(fx == far['sheet']['facts'], f"131번째 줄 판단 창 재료 = 앱 SheetCore 글 {len(fx)}줄")
    page.keyboard.press('Escape')
    page.wait_for_timeout(100)

    # ---------- 알림함 ----------
    page.click('.tab[data-go="inbox"]')
    page.wait_for_selector('.irow')
    rows = page.locator('.irow').all_inner_texts()
    check(len(rows) == 2, '알림함 2줄(20일 전 줄도 — 앱 30일)')
    check('사기 같아요로 숨김' in rows[0], "처리 꼬리표 '사기 같아요로 숨김'")
    page.locator('.irow').first.click()
    page.wait_for_selector('aside.drawer')
    check('팔린 매물' in page.inner_text('aside.drawer'), '물건 줄 밖 매물도 판단 창(앱 알림함처럼)')
    page.keyboard.press('Escape')
    page.wait_for_timeout(100)

    # ---------- 관심 매물 ----------
    page.click('.tab[data-go="watch"]')
    page.wait_for_selector('.wrow')
    page.locator('.wrow [data-act="watchlog"]').first.click()
    page.wait_for_selector('aside.drawer')
    dw = page.inner_text('aside.drawer')
    check('지켜볼 때 1,050,000원 → 지금 1,009,000원' in dw, "변화 기록 머리 '지켜볼 때 → 지금'")
    ws = page.locator('aside.drawer .cmdlist li .w').all_inner_texts()
    check(ws[:2] == ['가격 인하 · 1,020,000원', '지켜보기 시작 · 1,050,000원'], f'변화 기록 새것부터 · 종류 · 가격 {ws[:2]}')
    check('105만 → 102만' in dw, '변화 기록 메모 줄')
    check(page.locator('aside.drawer [data-act="watchOff"]').count() == 1, "직접 넣은 관심 매물도 '그만 보기'(앱 WatchSheet)")
    page.keyboard.press('Escape')
    page.wait_for_timeout(100)

    # ---------- 설정 ----------
    page.click('.tab[data-go="settings"]')
    page.wait_for_selector('.settings')
    check('사기 같아요 기록 4건' in page.inner_text('.settings'), "설정 '사기 같아요 기록 4건'")
    check('앱이 판정한 결과를 대시보드에 올려요' in page.inner_text('.settings'), '웹 대시보드 연결 글 = 앱 글')

    check(not errs, '페이지 오류 0' + (f' ({errs})' if errs else ''))
    br.close()

print(f'\n{len(OK)}개 확인 통과 · 스크린샷 {OUT}')
