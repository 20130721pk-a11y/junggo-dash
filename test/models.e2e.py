#!/usr/bin/env python3
"""R12 모델 나누기 웹 화면 시험 (헤드리스 크로미움, 가짜 GitHub) — 앱이 만든 묶음을 그대로 그려 앱과 같은 글인지 봐요.

    python3 test/models.e2e.py [스크린샷 폴더]

시험 자료: test/fixtures/app-models.json 의 bundle = 앱 WebBundleModel4Test.writesModelEditCasesForTheWeb 가 만든 묶음
(비쎌 청소기 — 크로스웨이브·스팟클린 자동 모델, 모델 모름 4건, 알림함 이행 줄 하나). 웹이 스스로 판정하지 않고 묶음 글·값을 그대로
그리는지, 물건 정하기 '모델' 칸이 앱과 같은 셈(radar-cmd.js)으로 줄을 내고 identify 명령에 models 를 싣는지 봐요.
"""
import datetime as dt
import functools
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'junggo-models-shots')
os.makedirs(OUT, exist_ok=True)
APP = json.load(open(os.path.join(REPO, 'test/fixtures/app-models.json'), encoding='utf-8'))
BUNDLE = APP['bundle']
MADE = BUNDLE['made']
PW = 'e2e-모델-비밀번호-1022'
TOKEN = 'e2e-rw-token'
OWNER_REPO = 'me/junggo-dash-data'
SALT = 'ZTJlLW1vZGVscy1zYWx0IQ=='
OK = []


def check(cond, msg):
    if not cond:
        raise AssertionError('실패: ' + msg)
    OK.append(msg)
    print('ok -', msg)


site = tempfile.mkdtemp(prefix='jdm-site-')
for f in ('index.html', 'box.js', 'radar-view.js', 'radar-cmd.js', 'radar-ui.js'):
    shutil.copy(os.path.join(REPO, f), os.path.join(site, f))
tools = tempfile.mkdtemp(prefix='jdm-tools-')
HELPER = os.path.join(tools, 'box.mjs')
open(HELPER, 'w').write("""
import { seal, open, deriveKey } from '%s/collector/seal.mjs';
import fs from 'node:fs';
const [mode, label, pw, salt] = process.argv.slice(2);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const key = deriveKey(pw, salt, 100000);
if (mode === 'seal') process.stdout.write(JSON.stringify(seal(input, key, salt, label, 100000)));
else { try { process.stdout.write(JSON.stringify(open(input, () => key, label))); } catch { process.stdout.write('null'); } }
""" % REPO.replace('\\', '/'))


def node(mode, label, obj):
    out = subprocess.run(['node', HELPER, mode, label, PW, SALT], input=json.dumps(obj, ensure_ascii=False), capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=site))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]


class FakeGitHub:
    def __init__(self, bundle):
        self.box = json.dumps(node('seal', 'junggo-radar-view', bundle))
        self.issues = {}
        self.next = 1

    def handle(self, route):
        req = route.request
        path = req.url.split('api.github.com', 1)[1].split('?')[0]
        H = {'access-control-allow-origin': '*', 'content-type': 'application/json'}
        if req.headers.get('authorization', '') != 'Bearer ' + TOKEN:
            return route.fulfill(status=401, body='{}', headers=H)
        if path == f'/repos/{OWNER_REPO}/contents/radar.enc':
            return route.fulfill(status=200, body=self.box, headers=H)
        if path == f'/repos/{OWNER_REPO}':
            return route.fulfill(status=200, body='{"private":true}', headers=H)
        if path == f'/repos/{OWNER_REPO}/issues' and req.method == 'POST':
            n = self.next
            self.next += 1
            self.issues[n] = json.loads(req.post_data)
            return route.fulfill(status=201, body=json.dumps({'number': n}), headers=H)
        m = re.match(rf'^/repos/{OWNER_REPO}/issues/(\d+)$', path)
        if m and int(m.group(1)) in self.issues:
            return route.fulfill(status=200, body=json.dumps({'state': 'open', 'state_reason': None}), headers=H)
        return route.fulfill(status=404, body='{}', headers=H)

    def plain(self, n):
        return node('open', 'junggo-radar-cmd', json.loads(self.issues[n]['body']))


errors = []
P = BUNDLE['products'][0]

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1360, 'height': 900}, locale='ko-KR', timezone_id='Asia/Seoul')
    gh = FakeGitHub(BUNDLE)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: %s' % e))
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.route('**/fonts.gstatic.com/**', lambda r: r.abort())
    page.route('https://api.github.com/**', gh.handle)
    page.clock.install(time=dt.datetime.fromtimestamp((MADE + 5 * 60e3) / 1000, tz=dt.timezone.utc))
    page.goto(BASE)
    page.wait_for_selector('#lockForm')
    page.fill('#lkRepo', OWNER_REPO)
    page.fill('#pw', PW)
    page.fill('#lkTok', TOKEN)
    page.click('#unlock')
    page.wait_for_selector('.cards')

    # ---------- 홈 카드: '{모델} 기준' 알약(G-9) ----------
    card = page.locator('.card').nth(0)
    check(f"{P['baseVariant']} 기준" in card.locator('.card-head').inner_text(), "홈 카드 머리 '크로스웨이브 기준' 알약(앱 HomeScreen Pill)")
    shot = lambda n: page.screenshot(path=os.path.join(OUT, n + '.png'), full_page=True)
    shot('m01-home')

    # ---------- 물건 화면: 모델 칩 · 자동 줄 · 지금 최저가 이름표 · 꼬리표 ----------
    page.click(f'[data-open="{P["id"]}"]')
    page.wait_for_selector('.sumline')
    chips = page.locator('[data-act="variant"]').all_inner_texts()
    check(chips == APP['chips'] and chips[-1].startswith('모델 모름 '), f"모델 칩 = 앱 결과 화면 칩 글('이름 건수' · 많은 순 · 모름 맨 뒤) — {chips}")
    body = page.inner_text('main')
    check('모델을 제목 낱말로 자동으로 나눴어요' in body and page.locator('[data-act="identifyModels"]').count() == 1, "자동 줄 + '고치기'(앱 AutoSplitLine)")
    check(page.locator('.box-label').first.inner_text().startswith('지금 최저가 · 크로스웨이브'), "이름표 '지금 최저가 · 크로스웨이브'(G-6)")
    rows = page.locator('.rows .row .rs').all_inner_texts()
    check(sum(1 for r in rows if '모델 모름' in r) == 4, "'모델 모름' 꼬리표 4줄(기준과 상관없이 늘 — G-4)")
    check(any(r.endswith('스팟클린') for r in rows) and not any('변형 ' in r for r in rows), "기준 아닌 모델 꼬리표는 이름만('변형 X' 아님)")
    tails = page.evaluate("() => [...document.querySelectorAll('.rows .row')].map(r => [r.dataset.key, r.querySelector('.rs').textContent])")
    byKey = {l['key']: l for l in P['listings']}
    check(all(not t.endswith(' · 크로스웨이브') and t != '크로스웨이브' for k, t in tails if byKey[k]['variant'] == '크로스웨이브'), '기준 모델(크로스웨이브) 줄엔 모델 꼬리표 없음(앱 variantTag)')
    check('모델 자동 2개' in page.inner_text('.conds'), "조건 요약 '모델 자동 2개'(앱 글 그대로)")
    shot('m02-product')

    # 모름 칩: 지금 최저가 없음 + 회색 한 줄(G-3)
    page.click('[data-act="variant"][data-v="모델 모름"]')
    page.wait_for_timeout(80)
    box = page.locator('section.box').first.inner_text()
    check('모델을 모르는 매물 4건이에요 — 판정하지 않아서 지금 최저가로 올리지 않아요' in box and '원 매물 열기' not in box, '모름 칩 = 지금 최저가 칸 없음 + 앱 unknownChipLine 글(G-3)')
    shot('m03-unknown-chip')
    page.click('[data-act="variant"][data-v="모델 모름"]')
    # 스팟클린 칩: 이름표가 그 모델
    page.click('[data-act="variant"][data-v="스팟클린"]')
    page.wait_for_timeout(80)
    check(page.locator('.box-label').first.inner_text().startswith('지금 최저가 · 스팟클린'), "모델 칩을 고르면 이름표가 그 모델")
    page.click('[data-act="variant"][data-v="스팟클린"]')

    # 판단 창: 모름 매물 머리 · 이유 · 재료 둘째 줄
    page.locator('.rows .row:has-text("모델 모름")').first.click()
    page.wait_for_selector('.drawer')
    dr = page.inner_text('.drawer')
    check(' · 모델 모름 · ' in page.inner_text('.sheet-meta') and '변형' not in page.inner_text('.sheet-meta'), "판단 창 머리 '… · 모델 모름 · …'(앱 ListingSheet)")
    check('모델을 모르는 매물이라 판정하지 않았어요' in dr, '판단 창 이유 = 앱 UNKNOWN_REASON')
    check('제목에 모델 이름이 없어서 시세와 비교하지 않았어요' in dr and '물건 정하기 › 모델에서 모델 낱말을 더할 수 있어요' in dr, '재료 칸 = UNKNOWN_FACT + UNKNOWN_HINT(앱 같은 글)')
    page.keyboard.press('Escape')
    page.locator('.rows .row:has-text("스팟클린")').first.click()
    page.wait_for_selector('.drawer')
    check(' · 모델 스팟클린 · ' in page.inner_text('.sheet-meta'), "판단 창 머리 '모델 스팟클린'")
    page.keyboard.press('Escape')

    # ---------- 시세 탭: 머리 · 모름 한 줄 · 모델 섞임 ----------
    page.click('[data-act="ptab"][data-t="price"]')
    page.wait_for_timeout(80)
    pt = page.inner_text('main')
    check('꿀매 기준 -15% · 모델마다 따로' in pt and '모델 모름 4건은 판정하지 않아요' in pt, "시세 탭 '모델마다 따로' + 모름 한 줄(cut.unknown)")
    check('시세 · 보통(중간값) · 모델 섞임' in pt and '모델 칩을 고르면 그 모델만 봐요' in pt, "분포 이름 '모델 섞임' + 안내(G-12)")
    shot('m04-price')
    page.click('[data-act="ptab"][data-t="list"]')

    # ---------- 조건 창: 기준 모델 ----------
    page.click(f'[data-act="menu"][data-pid="{P["id"]}"]') if page.locator(f'[data-act="menu"][data-pid="{P["id"]}"]').count() else None
    page.evaluate("() => { const b = document.querySelector('[data-act=\"edit\"]'); if (b) b.click(); }")
    page.wait_for_selector('#dE')
    lay = page.inner_text('#layer')
    check('기준 모델' in lay and '자동(매물 많은 모델)' in lay and '크로스웨이브 기준' in lay and '스팟클린 기준' in lay, "조건 창 '기준 모델' · '자동(매물 많은 모델)' · '{모델} 기준'(G-13)")
    check('꿀매 알림은 모든 모델에서 와요.' in lay and '자동이면 매물이 가장 많은 모델(지금 크로스웨이브)이에요.' in lay, '조건 창 안내 두 줄(대표 결정 4, autoModel)')
    page.click('[data-act="close"]')
    page.wait_for_timeout(50)

    # ---------- 물건 정하기 '모델' 칸 ----------
    page.click('[data-act="identifyModels"]')
    page.wait_for_selector('#dI')
    page.wait_for_selector('#idModels', state='attached')
    lay = page.inner_text('#layer')
    want = APP['cases'][0]['bands']['none']
    names = page.locator('.mrow .mt b').all_inner_texts()
    check(names == [r['n'] for r in want['rows']], f"모델 줄 = 앱 ModelEdit.rows 차례 {names}")
    subs = page.locator('.mrow .mt span').all_inner_texts()
    check(subs[0].startswith(f"{want['rows'][0]['c']}건 · 중간 29만"), f"줄 둘째 글 '{subs[0]}'(건수·중간값·함께 낱말)")
    check(page.locator('.mrow .mbase').count() == 1, "'기준' 표시 하나")
    check(f"모델 모름 {want['unknown']}건 — 판정하지 않아요" in lay, '모름 한 줄 = 앱 글')
    check('제목 낱말로 자동으로 나눴어요. 고치면 앱이 다시 바꾸지 않아요.' in lay, '자동 안내 글')
    check('모델이 나뉜 물건은 가장 싼 무리(부품·소모품 같은)만 빼요' in lay and page.locator('[data-act="idHigher"]').count() == 0, '가격대 안내 = 모델 글 · \'더 비싼 묶음도 함께\' 숨김(G-16)')
    page.click('.band >> nth=1')
    check(page.locator('.band[aria-checked="true"]').count() == 1, '가격대 고르면 그 무리(위쪽 전부 — 맨 위 무리라 하나)')
    want1 = APP['cases'][0]['bands']['1|0']
    check(page.locator('.mrow .mt span').first.inner_text().startswith(f"{want1['rows'][0]['c']}건"), '가격대를 고르면 모델 줄 건수가 그 무리로(앱과 같은 값)')
    page.click('.band >> nth=1')
    shot('m05-identify')

    # 이름 바꾸기 → 합치기 화면 → 더하기(실시간 건수)
    first = names[0]
    page.click(f'[data-act="mMenu"][data-n="{first}"]')
    check('이 모델 지우기(매물은 모델 모름으로)' in page.inner_text('.mmenu'), '⋯ 메뉴 세 항목(앱 글)')
    page.click(f'.mmenu [data-act="mRename"]')
    page.wait_for_selector('#dM')
    page.fill('#mText', '크로스')
    page.click('[data-act="mOk"]')
    page.wait_for_selector('#dI')
    check(page.locator('.mrow .mt b').all_inner_texts()[0] == '크로스' and '직접 고친 목록이에요.' in page.inner_text('#layer') and page.locator('[data-act="mRevert"]').count() == 1, "이름 바꾸기 → '직접 고친 목록이에요. · 자동으로 되돌리기'")
    page.click('[data-act="mAdd"]')
    page.wait_for_selector('#dM')
    page.fill('#mText', 'crosswave max')
    check(page.inner_text('#mCount') == f"지금 매물 {APP['matchCount']['crosswave max']}건이 이 말을 가져요", '더하기 창 실시간 건수 = 앱 matchCount')
    page.click('[data-act="mOk"]')
    page.wait_for_selector('#dI')
    check('crosswave max' in page.locator('.mrow .mt b').all_inner_texts(), '직접 더한 모델 줄')
    check('모델 3개' in page.inner_text('.preview'), "미리보기 한 줄 '모델 3개 · …'(고친 뒤)")
    page.click('[data-act="idGo"]')
    page.wait_for_selector('#cmdPw')
    page.fill('#cmdPw', PW)
    page.click('[data-act="pwGo"]')
    page.wait_for_timeout(700)
    c = gh.plain(max(gh.issues))
    ms = c['set'].get('models')
    check(c['type'] == 'identify' and ms and ms['user'] is True and ms['off'] is False and ms['renamed'] == {first: '크로스'}, 'identify{set.models} = 고친 목록 · user · renamed(앱 ModelEdit.Choice 꼴)')
    check([d['n'] for d in ms['defs']] == ['크로스', '스팟클린', 'crosswave max'] and ms['defs'][2]['need'] == ['crosswave', '맥스'], f"defs = 앱 userModel 꼴(need 정규화) {ms['defs']}")

    # 손대지 않고 정하면 models 를 보내지 않음(앱이 자동 목록을 계속 바꿀 수 있게)
    page.evaluate("() => { location.hash = '#'; }")
    page.wait_for_timeout(100)
    page.click(f'[data-open="{P["id"]}"]')
    page.wait_for_selector('.sumline')
    page.click('[data-act="identifyModels"]')
    page.wait_for_selector('#idModels', state='attached')
    page.click('[data-act="idGo"]')
    page.wait_for_timeout(700)
    c2 = gh.plain(max(gh.issues))
    check(c2['type'] == 'identify' and 'models' not in c2['set'], '모델 칸을 안 고치면 models 없음(앱 시트와 같음)')

    # ---------- 알림함 이행 줄 → 물건 정하기 '모델' 칸 ----------
    page.evaluate("() => { location.hash = '#inbox'; }")
    page.wait_for_selector('.irow')
    page.click('.irow')
    page.wait_for_selector('#idModels', state='attached')
    check('모델' in page.inner_text('#layer') and page.locator('.mrow').count() >= 2, "알림함 이행 줄 누름 → 그 물건 물건 정하기 '모델' 칸(open 'identifyModels', G-18)")
    shot('m06-inbox-open')

    check(not errors, '페이지 오류 없음 ' + '; '.join(errors))
    browser.close()

print(f'\n{len(OK)}개 확인 통과 · 스크린샷 {OUT}')
