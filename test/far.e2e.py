#!/usr/bin/env python3
"""0.8.6 화면 시험 — 그냥 검색 근처 밖 당근 줄(W-1) · 모두 ⚠ 인 마켓 자리(U-5) · 360px·1.3배 검색 칸(W-4) (헤드리스 크로미움, 네트워크 없이).

    python3 test/far.e2e.py [스크린샷 폴더]

시험 자료: test/fixtures/app-far.json 의 adhoc = 앱 fix-086-ui WebBundleFar086Test 가 앱 함수로 만든 그냥 검색 '씰리'
(지어낸 매물 — 중고나라 6 · 근처 당근 2 · 근처 밖 당근 5, 근처 밖 둘은 근처 것보다 쌈). 바탕 묶음은 app-gaps.json(0.8.5 시험 자료).
보는 것: 처음엔 근처 줄만(앱 기본 보기) · '전체 보기'를 누르면 근처 밖 5줄이 더해지고 지금 최저가가 더 싼 근처 밖 매물로 · 다시 누르면 근처만 ·
줄 글 = 앱 nearby.lines · 앱 기본이 전체(nearOnly false)면 처음부터 다 보이고 단추 없음 · 옛 묶음(far 없음)은 단추 없이 안내 ·
카드 마켓 줄 '확인 필요'(marketCaution) 회색·누르지 않음 · 360px·1.3배에서 검색 칸이 화면 안.
"""
import copy
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
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'junggo-far-shots')
os.makedirs(OUT, exist_ok=True)
G = json.load(open(os.path.join(REPO, 'test/fixtures/app-gaps.json'), encoding='utf-8'))['bundle']
A = json.load(open(os.path.join(REPO, 'test/fixtures/app-far.json'), encoding='utf-8'))['adhoc']
OK = []


def check(cond, msg):
    if not cond:
        raise AssertionError('실패: ' + msg)
    OK.append(msg)
    print('ok -', msg)


def bundle(nearOnly=True, old=False):
    b = copy.deepcopy(G)
    a = copy.deepcopy(A)
    a['at'] = b['made']
    a.pop('cmd', None)
    if not nearOnly:
        a['nearby']['nearOnly'] = False
    if old:
        a['listings'] = [l for l in a['listings'] if not l.get('far')]
        a['nearby'] = {'total': a['nearby']['total'], 'near': a['nearby']['near']}
    b['adhoc'] = [a]
    # U-5: '정상' 카드의 번개장터 자리를 모두 ⚠ 인 마켓으로(앱 GapText.cautionOnly 가 낸 꼴)
    for p in b['products']:
        if p['id'] == 'ok':
            p['marketLows'] = {k: v for k, v in p['marketLows'].items() if k != 'b'}
            p['marketCaution'] = {'b': '확인 필요'}
    return b


FAR = [l['key'] for l in A['listings'] if l.get('far')]
NEAR_N = A['count']
check(len(FAR) == 5 and NEAR_N == len(A['listings']) - 5, f'시험 자료: 기본 줄 {NEAR_N} · 근처 밖 {len(FAR)}')

site = tempfile.mkdtemp(prefix='jd-far-')
for f in ('index.html', 'box.js', 'radar-view.js', 'radar-cmd.js', 'radar-ui.js'):
    shutil.copy(os.path.join(REPO, f), os.path.join(site, f))
for d, b in (('near', bundle()), ('all', bundle(nearOnly=False)), ('old', bundle(old=True))):
    os.makedirs(os.path.join(site, d))
    json.dump(b, open(os.path.join(site, d, 'radar.json'), 'w', encoding='utf-8'), ensure_ascii=False)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=site))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ROOT = 'http://127.0.0.1:%d/index.html?src=./' % srv.server_address[1]
AT = dt.datetime.fromtimestamp((G['made'] + 3 * 60e3) / 1000, tz=dt.timezone.utc)


def open_page(br, d, w=1280, h=900, big=False):
    ctx = br.new_context(viewport={'width': w, 'height': h}, locale='ko-KR', timezone_id='Asia/Seoul')
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.route('**/fonts.gstatic.com/**', lambda r: r.abort())
    page.clock.install(time=AT)
    page.goto(ROOT + d)
    page.wait_for_selector('.cards')
    if big:
        page.evaluate("() => document.documentElement.style.fontSize = '130%'")
        page.wait_for_timeout(100)
    return page, errs


def search(page, q):
    page.fill('#q', q)
    page.click('#qGo')
    page.wait_for_selector('.pv-head')
    page.wait_for_timeout(200)


def row_keys(page):
    return page.locator('.rows .row').evaluate_all('es => es.map(e => e.dataset.key)')


def hero_key(page):
    h = page.locator('.hero .hclick')
    return h.get_attribute('data-key') if h.count() else None


with sync_playwright() as pw:
    br = pw.chromium.launch()

    # ---------- W-1 근처만(앱 기본) → 전체 보기 → 근처만 ----------
    page, errs = open_page(br, 'near')
    search(page, A['q'])
    k0, h0 = row_keys(page), hero_key(page)
    check(not any(k in FAR for k in k0) and h0 not in FAR, f'처음엔 근처 밖 당근 줄 없음(줄 {len(k0)} + 지금 최저가)')
    check(len(k0) + (1 if h0 else 0) == NEAR_N and h0 == A.get('lowKey'), f'처음 줄 = 앱 기본 줄 {NEAR_N} · 지금 최저가 = 앱 lowKey')
    btn = page.locator('[data-act="allDaangn"]')
    check(btn.count() == 1 and btn.inner_text() == A['nearby']['lines'][0] and btn.get_attribute('aria-pressed') == 'false', '근처 줄 단추 글 = 앱 nearby.lines[0]')
    page.screenshot(path=os.path.join(OUT, 'w1-near.png'), full_page=True)
    btn.click()
    page.wait_for_timeout(200)
    k1, h1 = row_keys(page), hero_key(page)
    shown = set(k1) | ({h1} if h1 else set())
    check(set(FAR) <= shown and len(shown) == len(A['listings']), f"'전체 보기' → 근처 밖 5줄이 더해짐(줄 {len(shown)} = 묶음 {len(A['listings'])})")
    check(h1 in FAR, f'지금 최저가가 더 싼 근처 밖 당근으로({h1})')
    btn = page.locator('[data-act="allDaangn"]')
    check(btn.inner_text() == A['nearby']['lines'][1] and btn.get_attribute('aria-pressed') == 'true', '단추 글 = 앱 nearby.lines[1]')
    check('매물 %d건' % len(shown) in page.inner_text('.sumline .n'), '줄 수 글도 바뀜')
    page.screenshot(path=os.path.join(OUT, 'w1-all.png'), full_page=True)
    # 시세 탭도 같은 줄(앱 T9)
    page.click('[data-act="ptab"][data-t="price"]')
    page.wait_for_timeout(150)
    page.click('[data-act="ptab"][data-t="list"]')
    page.wait_for_timeout(150)
    page.locator('[data-act="allDaangn"]').click()
    page.wait_for_timeout(200)
    check(row_keys(page) == k0 and hero_key(page) == h0, '다시 누르면 근처만으로 돌아옴')
    # '가까운 동네만' 칩(지역)은 근처 밖 줄을 빼요
    page.locator('[data-act="allDaangn"]').click()
    page.wait_for_timeout(150)
    if page.locator('[data-act="area"][data-a="near"]').count():
        page.click('[data-act="area"][data-a="near"]')
        page.wait_for_timeout(150)
        check(not any(k in FAR for k in row_keys(page)) and hero_key(page) not in FAR, "'가까운 동네만' 칩은 근처 밖 줄을 뺌")
    check(not errs, f'페이지 오류 없음 {errs}')
    page.close()

    # ---------- 앱 기본 보기가 전체(nearOnly false) ----------
    page, errs = open_page(br, 'all')
    search(page, A['q'])
    shown = set(row_keys(page)) | ({hero_key(page)} if hero_key(page) else set())
    check(set(FAR) <= shown and page.locator('[data-act="allDaangn"]').count() == 0, '앱 기본이 전체면 처음부터 근처 밖 줄 · 근처 줄 단추 없음')
    page.close()

    # ---------- 옛 묶음(far 없음) ----------
    page, errs = open_page(br, 'old')
    search(page, A['q'])
    check(page.locator('[data-act="allDaangn"]').count() == 0, '옛 묶음: 단추 없음(눌러도 바뀌지 않는 가짜 단추를 그리지 않음)')
    check('앱에서 전체 보기' in page.inner_text('#page'), "옛 묶음: '앱에서 전체 보기' 안내")
    page.close()

    # ---------- U-5 카드 마켓 줄 '확인 필요' ----------
    page, errs = open_page(br, 'near')
    card = page.locator('article.card').filter(has=page.locator('[data-open="ok"]'))
    lines = card.locator('.lines')
    check(lines.count() == 1 and card.locator('button.gaprow').count() == 0, "'확인 필요'만 있는 줄은 단추가 아님(까닭 표시가 아님)")
    t = lines.inner_text()
    check('확인 필요' in t, f'번개장터 자리 = 확인 필요 ({t!r})')
    col = card.locator('.lines .muted').evaluate("e => getComputedStyle(e).color")
    check(col != 'rgb(255, 194, 75)', '회색 글(꿀골드 아님)')
    card.screenshot(path=os.path.join(OUT, 'u5-card.png'))
    page.close()

    # ---------- W-4 360px · 1.3배 검색 칸 ----------
    for big in (False, True):
        page, errs = open_page(br, 'near', 360, 760, big)
        r = page.locator('.searchrow').evaluate('e => [e.getBoundingClientRect().right, e.scrollWidth, e.clientWidth]')
        sw = page.evaluate('() => document.documentElement.scrollWidth')
        tag = '360·1.3배' if big else '360'
        check(r[0] <= 361 and sw <= 361, f'{tag}: 검색 칸이 화면 안(오른쪽 {r[0]:.0f} · 쪽 너비 {sw})')
        page.screenshot(path=os.path.join(OUT, f'w4-{tag}.png'))
        page.close()
    br.close()

print(f'\n{len(OK)}개 확인 통과 · 스크린샷 {OUT}')
