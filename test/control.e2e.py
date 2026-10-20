#!/usr/bin/env python3
"""웹 조작 1판 화면 시험 (헤드리스 크로미움, 가짜 GitHub — 실제 데이터 저장소에 명령을 올리지 않아요, L-11).

    pip install playwright && python3 -m playwright install chromium
    python3 test/control.e2e.py [스크린샷 폴더]

시험 자료: test/fixtures/radar-bundle.control.json (make-control.mjs, 가짜 매물). 가짜 GitHub 가
radar.enc 를 주고 이슈를 받아요. '앱'은 시험 안의 작은 흉내(app_round)가 명령 상자를 열어 결과 줄(cmds)을
묶음에 넣고 이슈를 닫아요 — 앱 쪽 진짜 처리는 앱 시험(ktest)·에뮬레이터 검증 몫이에요.
보는 것: 첫 연결 글 · 탭 · 비밀번호 탭마다 한 번 · 이슈 제목·몸통에 검색어 0 · 명령 꼴(command-v1) ·
그 자리 한 줄·머리 알약·명령 목록 · 조건 창 바꾼 칸만 + 충돌 · 그냥 검색 대기 1개·30분 안 보관 결과 ·
이 매물 아님 취소 · ★ · '+ 물건' 카드 제안 · 설정 · 읽기만 토큰 · 콘텐츠 보안 정책 오류 0 · 좁은 폭.
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
from urllib.parse import urlparse, parse_qs

from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'junggo-control-shots')
os.makedirs(OUT, exist_ok=True)
subprocess.check_call(['node', os.path.join(REPO, 'test/fixtures/make-control.mjs')], stdout=subprocess.DEVNULL)
BASE_BUNDLE = json.load(open(os.path.join(REPO, 'test/fixtures/radar-bundle.control.json'), encoding='utf-8'))
MADE = BASE_BUNDLE['made']
PW = 'e2e-조작-비밀번호-0720'
TOKEN = 'e2e-rw-token'
RO_TOKEN = 'e2e-ro-token'
OWNER_REPO = 'me/junggo-dash-data'
SALT = 'ZTJlLWNvbnRyb2wtc2FsdA=='
OK = []


def check(cond, msg):
    if not cond:
        raise AssertionError('실패: ' + msg)
    OK.append(msg)
    print('ok -', msg)


# ---------- 사이트 폴더 ----------
site = tempfile.mkdtemp(prefix='jdc-site-')
for f in ('index.html', 'old.html', 'box.js', 'radar-view.js', 'radar-cmd.js', 'radar-ui.js'):
    shutil.copy(os.path.join(REPO, f), os.path.join(site, f))
tools = tempfile.mkdtemp(prefix='jdc-tools-')
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


def node(mode, label, obj, pw=PW, salt=SALT):
    out = subprocess.run(['node', HELPER, mode, label, pw, salt], input=json.dumps(obj, ensure_ascii=False), capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=site))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]


# ---------- 가짜 GitHub ----------
class FakeGitHub:
    def __init__(self, bundle=None):
        self.bundle = json.loads(json.dumps(bundle or BASE_BUNDLE))
        self.box = None
        self.issues = {}
        self.next = 1
        self.calls = []
        self.reseal()

    def reseal(self):
        self.bundle['made'] = self.bundle.get('made', MADE)
        self.box = json.dumps(node('seal', 'junggo-radar-view', self.bundle))

    def handle(self, route):
        req = route.request
        u = urlparse(req.url)
        path = u.path
        auth = req.headers.get('authorization', '')
        self.calls.append((req.method, path, auth))
        H = {'access-control-allow-origin': '*', 'content-type': 'application/json'}
        tok = auth.replace('Bearer ', '')
        if tok not in (TOKEN, RO_TOKEN):
            return route.fulfill(status=401, body='{}', headers=H)
        if path == f'/repos/{OWNER_REPO}/contents/radar.enc':
            return route.fulfill(status=200, body=self.box, headers=H)
        if path == f'/repos/{OWNER_REPO}':
            return route.fulfill(status=200, body='{"private":true}', headers=H)
        if path == f'/repos/{OWNER_REPO}/issues' and req.method == 'POST':
            if tok == RO_TOKEN:
                return route.fulfill(status=403, body='{"message":"Resource not accessible by personal access token"}', headers=H)
            b = json.loads(req.post_data)
            n = self.next
            self.next += 1
            self.issues[n] = {'number': n, 'title': b.get('title'), 'body': b.get('body'), 'state': 'open', 'state_reason': None, 'labels': b.get('labels'), 'keys': sorted(b.keys())}
            return route.fulfill(status=201, body=json.dumps({'number': n}), headers=H)
        m = re.match(rf'^/repos/{OWNER_REPO}/issues/(\d+)$', path)
        if m:
            n = int(m.group(1))
            it = self.issues.get(n)
            if not it:
                return route.fulfill(status=404, body='{}', headers=H)
            if req.method == 'PATCH':
                b = json.loads(req.post_data)
                it['state'] = b.get('state', it['state'])
                it['state_reason'] = b.get('state_reason')
                it['closed_by'] = 'web'
            return route.fulfill(status=200, body=json.dumps({'state': it['state'], 'state_reason': it['state_reason']}), headers=H)
        return route.fulfill(status=404, body='{}', headers=H)

    def plain(self, n):
        return node('open', 'junggo-radar-cmd', json.loads(self.issues[n]['body']))

    def last(self):
        return max(self.issues) if self.issues else 0

    # 앱 흉내: 열린 이슈를 만든 순서대로 열어 결과 줄을 넣고 닫아요(command-v1 6장 꼴만 — 실제 처리는 앱)
    def app_round(self, decide=None, at=None):
        rows = self.bundle.setdefault('cmds', [])
        done = []
        for n in sorted(self.issues):
            it = self.issues[n]
            if it['state'] != 'open':
                continue
            c = self.plain(n)
            row = {'id': c['id'], 'n': n, 'type': c['type'], 'state': 'done', 'at': c['at'], 'doneAt': at or MADE + 6 * 60e3}
            for k in ('pid', 'key'):
                if k in c:
                    row[k] = c[k]
            if decide:
                decide(c, row, self.bundle)
            rows.insert(0, row)
            if row['state'] != 'running':
                it['state'] = 'closed'
                it['state_reason'] = 'completed' if row['state'] in ('done', 'conflict') else 'not_planned'
            done.append((c, row))
        self.bundle['made'] = at or MADE + 6 * 60e3
        self.reseal()
        return done


errors = []


def new_page(ctx, gh, minutes=5):
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: %s' % e))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.route('**/fonts.gstatic.com/**', lambda r: r.abort())
    page.route('https://api.github.com/**', gh.handle)
    page.clock.install(time=dt.datetime.fromtimestamp((MADE + minutes * 60e3) / 1000, tz=dt.timezone.utc))
    return page


def shot(page, name, full=True):
    page.screenshot(path=os.path.join(OUT, name + '.png'), full_page=full)


def text(page):
    return page.inner_text('body')


def refresh(page):
    page.evaluate('() => window.__radarTest.refresh()')
    page.wait_for_timeout(250)


def connect(page, token=TOKEN):
    page.goto(BASE)
    page.wait_for_selector('#lockForm')
    page.fill('#lkRepo', OWNER_REPO)
    page.fill('#pw', PW)
    page.fill('#lkTok', token)
    page.click('#unlock')
    page.wait_for_selector('.cards')


def cmd_pw(page, pw=PW):
    page.wait_for_selector('#cmdPw')
    page.fill('#cmdPw', pw)
    page.click('[data-act="pwGo"]')


WORDS = ('4080', '에어팟', '버즈', '5070', 'RTX', '플스', '기가바이트', '110만')

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1360, 'height': 900}, locale='ko-KR', timezone_id='Asia/Seoul')
    gh = FakeGitHub()
    page = new_page(ctx, gh)

    # ---------- 1. 첫 연결(C-17) · 탭 ----------
    page.goto(BASE)
    page.wait_for_selector('#lockForm')
    shot(page, '01-connect', False)
    lt = page.inner_text('#lockForm')
    check('웹 토큰' in lt and '웹 읽기 토큰' not in lt, "칸 이름 '웹 토큰'(예전 '웹 읽기 토큰' 아님)")
    check('junggo-dash-data 하나만' in lt and '읽기 (Read-only)' in lt and '읽기와 쓰기 (Read and write)' in lt and '90일' in lt, '권한 칸: 저장소 하나 · Contents 읽기 · Issues 읽기와 쓰기 · 기한 90일(L-10)')
    check('토큰만으로는 물건·조건을 바꿀 수 없어요' in lt, '권한 설명 글(디자인 5-12)')
    page.fill('#lkRepo', OWNER_REPO)
    page.fill('#pw', PW)
    page.fill('#lkTok', TOKEN)
    page.click('#unlock')
    page.wait_for_selector('.cards')
    tabs = page.locator('.tab').all_inner_texts()
    check([re.sub(r'\d+', '', t).strip() for t in tabs] == ['홈', '관심 매물', '알림함', '설정'], '탭 = 앱과 같게 홈 · 관심 매물 · 알림함 · 설정(결정 1)')
    check(page.inner_text('#inboxCnt') == '3', '알림함 탭 숫자 = 안 읽은 3')
    for w in ('물건·조건은 앱에서 바꿔요', '조건은 앱에서 바꿔요', '웹에선 보기만 해요', '물건은 앱에서 추가해요'):
        check(w not in text(page), "자물쇠 글 '%s' 없음" % w)
    check('집중 감시 중 · RTX 4080' in page.inner_text('#banners'), "맨 위 띠 '집중 감시 중 · RTX 4080'")
    shot(page, '02-home')

    # ---------- 2. 첫 명령: 비밀번호 탭마다 한 번(L-1) ----------
    page.click('[data-act="checkAll"]')
    page.wait_for_selector('#cmdPw')
    shot(page, '03-cmd-pw', False)
    check(gh.last() == 0, '비밀번호를 넣기 전엔 이슈 0')
    cmd_pw(page, 'wrong')
    page.wait_for_selector('#cmdPwErr:not([hidden])')
    check('비밀번호가 맞지 않아요' in page.inner_text('#cmdPwErr') and gh.last() == 0, '틀린 비밀번호 → 안내, 보내지 않음')
    cmd_pw(page)
    page.wait_for_timeout(600)
    check(gh.last() == 1, '맞는 비밀번호 → 이슈 1개')
    it = gh.issues[1]
    check(it['title'] == '꿀매 레이더 명령' and it['keys'] == ['body', 'title'], "이슈 제목 '꿀매 레이더 명령' 고정 · 이름표·담당자 없음")
    box = json.loads(it['body'])
    check(set(box) == {'v', 'kdf', 'iter', 'salt', 'iv', 'ct'} and box['salt'] == SALT, '몸통 = 잠근 상자만(묶음과 같은 소금)')
    c1 = gh.plain(1)
    check(c1['type'] == 'check' and 'pid' not in c1 and c1['kind'] == 'junggo-radar-cmd' and c1['from'] == 'web' and re.match(r'^c_[0-9a-z]{6,12}_[0-9a-z]{5}$', c1['id']), "'지금 모두 확인' = check(물건 없음) · 꼴 command-v1")
    check(node('open', 'junggo-radar-view', box) is None, '명령 상자는 묶음 용도 이름으로 못 엶')
    ht = page.inner_text('#page')
    check('보냈어요 · 앱이 받기를 기다려요' in ht and '지금 모두 확인' in ht, "그 자리 한 줄 '지금 모두 확인 · 보냈어요 · 앱이 받기를 기다려요'")
    check('명령 1개 기다리는 중' in page.inner_text('#cmdPill'), "머리 알약 '명령 1개 기다리는 중'")
    check(page.locator('[data-act="checkAll"][disabled]').count() == 1 and '30분 뒤에 다시 할 수 있어요' in ht, '지금 모두 확인 30분에 한 번 — 못 누름 + n분 뒤에')
    ls = page.evaluate('() => JSON.stringify(localStorage)')
    check(TOKEN not in ls and PW not in ls, 'localStorage 에 토큰·비밀번호 날 글 없음')
    shot(page, '04-sent')

    # ---------- 3. 앱이 처리 → 끝났어요 ----------
    gh.app_round()
    refresh(page)
    ht = page.inner_text('#page')
    check('끝났어요' in ht and gh.issues[1]['state'] == 'closed', "앱이 닫고 결과 줄 → '끝났어요'")
    check(page.inner_text('#cmdPill') == '', '열린 명령이 없으면 머리 알약 없음')

    # ---------- 4. 조건 창(C-8): 바꾼 칸만 + 바꾸기 전 값, 두 번째 명령은 비밀번호 안 물음 ----------
    page.click('#menu-s_4080')
    page.wait_for_selector('.menu')
    items = page.locator('.menu button').all_inner_texts()
    check(items == ['조건 · 꿀매 기준 · 목표가', '물건 다시 정하기', '집중 감시 끄기', '위로', '아래로', '그만 지켜보기'], '⋯ 메뉴 6줄 = 앱과 같은 글·순서(집중 감시 중이라 끄기)')
    check(page.locator('.menu button:has-text("위로")[disabled]').count() == 1, '맨 위 카드는 위로 못 누름(웹만)')
    page.click('.menu button:has-text("조건 · 꿀매 기준 · 목표가")')
    page.wait_for_selector('#dE')
    shot(page, '05-edit')
    check(page.locator('#eSave[disabled]').count() == 1 and '바꾼 칸 0개' in page.inner_text('#eCount'), '바꾼 게 없으면 저장 못 누름')
    check(page.input_value('#e-targetPrice') == '105만' and page.input_value('#e-excludeWords') == '본체, 컴퓨터, 데스크탑, pc, 노트북, 랩탑', '처음 값 = 앱 조건 창 글(cfgText·쉼표)')
    page.click('[data-act="ePct"][data-v="20"]')
    check('94만 원 이하가 꿀매' in page.inner_text('#pctHint') or '96만 원 이하가 꿀매' in page.inner_text('#pctHint'), '꿀매 기준 미리보기 = 앱이 실은 pctPreview 글')
    page.fill('#e-targetPrice', '110만')
    check('바꾼 칸 2개' in page.inner_text('#eCount') and page.locator('.flabel[data-f="thresholdPct"] .chgdot').count() == 1, '바꾼 칸 2개 · 칸 옆 점')
    page.click('#eSave')
    page.wait_for_timeout(600)
    check(page.locator('#cmdPw').count() == 0 and gh.last() == 2, '같은 탭 두 번째 명령은 비밀번호를 다시 묻지 않음')
    c2 = gh.plain(2)
    check(c2['type'] == 'edit' and c2['pid'] == 's_4080' and c2['set'] == {'thresholdPct': 20, 'targetPrice': '110만'} and c2['base'] == {'thresholdPct': 15, 'targetPrice': 1050000}, "edit = 바꾼 칸만(가격은 친 글 '110만' 그대로) + 바꾸기 전 값")
    card = page.locator('.card').nth(0).inner_text()
    check('바꾸는 중' in card and '꿀매 -15%' in card and '조건 바꾸기' in card, "카드는 옛 값(-15%) + '바꾸는 중' + 그 자리 한 줄(결정 2)")
    for w in WORDS:
        check(all(w not in gh.issues[n]['title'] and w not in gh.issues[n]['body'] for n in gh.issues), "이슈 제목·몸통에 '%s' 0 (AC-1·AC-19)" % w)

    # ---------- 5. 충돌(AC-8) ----------
    def conflict(c, row, b):
        if c['type'] == 'edit':
            row.update(state='conflict', why='일부만 바꿨어요 — 목표가는 앱에서 먼저 바뀌었어요', conflict={'targetPrice': 1200000}, applied=['thresholdPct'], what='RTX 4080 조건 바꾸기')
            pr = next(x for x in b['products'] if x['id'] == 's_4080')
            pr['pct'] = 20
            pr['cfg']['thresholdPct'] = 20
            pr['cfg']['targetPrice'] = 1200000
            pr['cfgText']['targetPrice'] = '120만'
    gh.app_round(conflict)
    refresh(page)
    page.goto(BASE + '#p=s_4080')
    page.wait_for_selector('.pv-head')
    pt = page.inner_text('#page')
    check('일부만 바꿨어요 — 목표가는 앱에서 먼저 바뀌었어요' in pt and '지금 앱 값: 목표가 120만' in pt, "결과 화면 머리 '일부만 바꿨어요 — 목표가는 …(지금 120만)'")
    check('못 한 명령 1개' in page.inner_text('#cmdPill'), "머리 알약 '못 한 명령 1개'(코랄)")
    shot(page, '06-conflict')
    page.click('[data-act="edit"][data-reopen]')
    page.wait_for_selector('#dE')
    check(page.locator('#e-targetPrice.conflict').count() == 1 and '앱에서 먼저 바뀌었어요 — 지금 값으로 다시 골라 주세요' in page.inner_text('#layer') and page.input_value('#e-targetPrice') == '120만', '새 값으로 조건 열기 → 그 칸 코랄 테두리 + 안내, 값은 앱 값')
    page.fill('#e-targetPrice', '115만')
    page.keyboard.press('Escape')
    check('바꾼 것을 버릴까요?' in page.inner_text('#layer'), "바꾼 칸이 있으면 닫을 때 '바꾼 것을 버릴까요?'(웹만)")
    page.click('[data-act="eDiscard"]')
    check(page.locator('#dE').count() == 0, '버리기 → 창 닫힘')

    # ---------- 6. 마켓 칩 하나 고르기 · 이 매물 아님 · 되돌리기(취소) · ★ ----------
    page.click('.mchip.d')
    check(page.locator('.mchip[aria-checked="true"]').count() == 1 and all('당근' in t for t in page.locator('.rows .row .rm').all_inner_texts()), '마켓 칩 하나 고르기 — 당근만')
    page.click('.mchip.d')
    row = page.locator('.rows .row').nth(2)
    rkey = row.get_attribute('data-key')
    row.locator('.notbtn').click()
    page.wait_for_timeout(600)
    n_hide = gh.last()
    ch = gh.plain(n_hide)
    check(ch['type'] == 'hide' and ch['key'] == rkey and ch['pid'] == 's_4080', '이 매물 아님 = hide{pid,key}')
    check(page.locator('.folded').count() == 1 and '이 매물은 빼고 볼게요' in page.inner_text('.folded') and '이 매물은 빼고 볼게요' in page.inner_text('#toast'), '줄이 접혀 한 줄 자리 + 토스트')
    check('바꾸는 중' in page.inner_text('section.box[aria-label="지금 최저가"]'), '지금 최저가 칸은 웹이 다시 고르지 않고 바꾸는 중만')
    page.click('#toast [data-act="toast"]')
    page.wait_for_timeout(500)
    check(gh.issues[n_hide]['state'] == 'closed' and gh.issues[n_hide]['state_reason'] == 'not_planned' and gh.issues[n_hide].get('closed_by') == 'web', '앱이 받기 전 되돌리기 = 이슈 닫기(취소)')
    check(page.locator('.folded').count() == 0, '취소하면 줄이 돌아옴')
    star = page.locator('.rows .row').nth(1).locator('[data-act="star"]')
    skey = page.locator('.rows .row').nth(1).get_attribute('data-key')
    star.click()
    page.wait_for_timeout(600)
    cs = gh.plain(gh.last())
    check(cs['type'] == 'star' and cs['key'] == skey and cs['on'] is True, '☆ = star{key,on:true}')
    check(page.locator(f'.row[data-key="{skey}"] .iconbtn.pending').count() == 1, '★ 는 앱 결과 전까지 점선 별(보내는 중)')
    shot(page, '07-row-actions')

    # 판단 창(C-7)
    page.locator('.hero .hclick').click()
    page.wait_for_selector('.drawer')
    dt_ = page.inner_text('.drawer')
    check('시세 120만 · 판매완료 기준 18건' in dt_ and '목표가(105만) 이하예요' in dt_ and '중고나라에서 열기' in dt_ and '이 매물 아님' in dt_, '판단 창: 재료 칸(sheet) · OO에서 열기 · 이 매물 아님')
    check(page.locator('.drawer [data-act="exWord"]').count() == 4, "'이 말이 든 매물은 모두 빼기' 단어 칩")
    page.click('.drawer [data-act="exWord"][data-w="윈드포스"]')
    page.wait_for_timeout(600)
    cw = gh.plain(gh.last())
    check(cw['type'] == 'excludeWord' and cw['word'] == '윈드포스', 'excludeWord{pid,word}')
    shot(page, '08-sheet')
    page.keyboard.press('Escape')

    # ---------- 7. 그냥 검색(C-3): 대기 1개 · 30분 안 보관 결과 ----------
    page.goto(BASE + '#')
    page.wait_for_selector('#q')
    page.fill('#q', '4080 super')
    check(page.locator('#qUnder:not([hidden])').count() == 1, "30분 안 같은 검색어 → '모아 둔 결과로 바로 보여 드려요'")
    before = gh.last()
    page.click('#qGo')
    page.wait_for_selector('.pv-head')
    at_ = page.inner_text('#page')
    check(gh.last() == before and '모아 둔 결과예요' in at_ and '당근 8건 중 내 동네 근처 3건만 보여요 · 전체 보기' in at_, '30분 안 검색어는 보내지 않고 묶음 adhoc 결과로(횟수 안 셈) + 당근 근처 줄')
    page.click('[data-act="saveAdhoc"]')
    page.wait_for_selector('#dV')
    check(page.locator('.vbtns button').all_inner_texts() == ['SUPER만', '기본만', '둘 다(지금 최저가는 기본, SUPER 는 변형별 줄)'], '변형 묻기 세 단추 = 앱 글')
    page.click('.vbtns button:has-text("SUPER만")')
    page.wait_for_timeout(600)
    cv = gh.plain(gh.last())
    check(cv['type'] == 'saveAdhoc' and cv['q'] == '4080 super' and cv['variantPick'] == 'SUPER', 'saveAdhoc{q, variantPick}')
    page.fill('#q', '에어팟 프로2')
    page.click('#qGo')
    page.wait_for_timeout(700)
    na = gh.last()
    check(gh.plain(na)['type'] == 'adhoc' and gh.plain(na)['q'] == '에어팟 프로2', '새 검색어 → adhoc{q}')
    check('보냈어요' in page.inner_text('.steps') and page.locator('.step.now').count() == 1, '진행 칸 네 단계(보냈어요 → 앱이 받음 …)')
    shot(page, '09-adhoc-wait')
    page.fill('#q', '버즈3 프로')
    page.click('#qGo')
    page.wait_for_timeout(900)
    nb = gh.last()
    check(gh.issues[na]['state'] == 'closed' and gh.issues[na]['state_reason'] == 'not_planned' and gh.plain(nb)['q'] == '버즈3 프로', '그냥 검색 대기 1개: 앞 이슈를 웹이 닫고 바꿈')
    check("'에어팟 프로2' 검색을 '버즈3 프로'로 바꿨어요" in page.inner_text('#page'), "'… 검색을 …로 바꿨어요' 줄")

    def adhoc(c, row, b):
        if c['type'] == 'adhoc':
            src = b['adhoc'][0]
            b['adhoc'].insert(0, {**src, 'q': c['q'], 'cmd': c['id'], 'at': MADE + 6 * 60e3, 'ask': None, 'nearby': None})
            q = b['quota']['adhoc']
            q['used'] += 1
            q['times'].append(c['at'])
        if c['type'] in ('saveAdhoc', 'star', 'excludeWord'):
            row['state'] = 'done'
    gh.app_round(adhoc)
    refresh(page)
    at2 = page.inner_text('#page')
    check('모아 둔 결과예요' in at2 and page.locator('.steps').count() == 0 and page.locator('.rows .row').count() >= 1, '앱 결과가 오면 진행 칸 → 결과 화면(같은 순서)')
    check('이번 1시간 3/6번' in page.inner_text('#quota'), "검색 횟수 '이번 1시간 n/6번' = 앱이 센 값(앞 2 + 이번 1 — 웹이 닫은 것·보관 결과는 안 셈)")
    shot(page, '10-adhoc-result')

    # ---------- 8. '+ 물건'(C-4) · 카드 제안 · 자리 카드 ----------
    page.goto(BASE + '#')
    page.wait_for_selector('.cards')
    page.click('.home-head [data-act="add"]')
    page.wait_for_selector('#dA')
    check(page.locator('.qcard').count() == 5 and page.locator('.qcard[disabled]').all_inner_texts() == ['RTX 4080\n지켜보는 중', '플레이스테이션 5\n지켜보는 중'], "카드 5개 · 지켜보는 카드(검색어 완전 일치 4080·플스5)는 회색 '지켜보는 중'")
    page.fill('#addText', '5070')
    check("'RTX 5070' 카드로 시작" in page.inner_text('#addSug'), "직접 쓰기 '5070' → 'RTX 5070' 카드로 시작(앱 Products.suggest)")
    page.fill('#addText', '4070 ti super')
    check(page.inner_text('#addSug').strip() == '', "'4070 ti super' → 제안 없음(앱 규칙 그대로)")
    page.fill('#addText', '에어팟 프로2, airpods pro 2, 에어팟2, 에어팟 4')
    check(page.locator('#addMany:not([hidden])').count() == 1, '쉼표 4개째 안내')
    page.fill('#addText', '5070')
    shot(page, '11-add', False)
    page.click('#addGo')
    page.wait_for_timeout(600)
    ca = gh.plain(gh.last())
    check(ca['type'] == 'add' and ca['q'] == '5070' and ca['card'] == 'gpu:5070', "add{q:'5070', card:'gpu:5070'}")
    check(page.locator('.card.ghost').count() == 1 and '웹에서 추가' in page.inner_text('.card.ghost'), '자리 카드(점선) + 그 자리 한 줄')

    # ---------- 8b. 물건 정하기(C-5): 가격대 줄 글 = 앱 시트 'from ~ to', 정하기 값 = lo·hi ----------
    page.click('.card:has-text("플레이스테이션 5") [data-act="identify"]')
    page.wait_for_selector('#dI')
    bands = page.locator('.band b').all_inner_texts()
    check(bands == ['2만 ~ 6만', '38만 ~ 49만', '78만 ~ 89만'], "가격대 줄 = 앱 시트 글 'from ~ to'(10/20 앱 맞춤)")
    check(page.locator('.band[aria-checked="true"]').count() == 1 and '고름' in page.inner_text('.band[aria-checked="true"]'), '앱이 미리 고른 가격대(pick)')
    check('이대로면 매물 26건' in page.inner_text('.preview') and '460,000원' in page.inner_text('.preview'), '미리보기 = 앱이 센 값(identify.previews)')
    page.click('[data-act="idWord"][data-w="게임"]')
    check('− 게임' in page.inner_text('[data-act="idWord"][data-w="게임"]') and '앱이 정한 뒤에 다시 세요' in page.inner_text('.preview'), '단어 칩 빼기 · 단어를 바꾸면 웹은 미리보기를 세지 않음(판정은 앱)')
    page.click('[data-act="idGo"]')
    page.wait_for_timeout(600)
    ci = gh.plain(gh.last())
    check(ci['type'] == 'identify' and ci['set'] == {'category': 'game', 'bandMin': 350000, 'bandMax': 520000, 'excludeWords': ['타이어', '미쉐린', '게임'], 'includeWords': []}, 'identify{set} = 고른 묶음 lo·hi + 예전 빼기 단어 + 칩')

    # ---------- 9. 그만 지켜보기(C-9) ----------
    page.click('#menu-s_9070')
    page.click('.menu button:has-text("그만 지켜보기")')
    page.wait_for_selector('#dD')
    check(page.evaluate('() => document.activeElement.id') == 'delCancel', "그만 지켜보기 창은 '취소'에 초점")
    check("'RX 9070 XT' 그만 지켜볼까요?" in page.inner_text('#layer') and '최저가·장부·이력이 지워져요.' in page.inner_text('#layer'), '확인 창 글 = 앱 글')
    page.click('[data-act="delGo"]')
    page.wait_for_timeout(600)
    check(gh.plain(gh.last()) | {} and gh.plain(gh.last())['type'] == 'remove', 'remove{pid}')
    check(any('지우는 중' in t for t in page.locator('.card.ghost').all_inner_texts()), "카드가 흐린 자리 카드 '지우는 중'")

    # ---------- 10. 명령 목록 서랍(C-16) ----------
    page.click('#cmdPill button')
    page.wait_for_selector('#dC')
    lst = page.inner_text('.drawer')
    check('RTX 4080 조건 바꾸기' in lst and "그냥 검색 '버즈3 프로'" in lst and 'RTX 5070 추가' in lst, '명령 목록: 무엇 · 상태 · 시각')
    shot(page, '12-cmds', False)
    page.keyboard.press('Escape')

    # ---------- 11. 관심 매물 · 알림함 ----------
    page.click('.tab[data-go="watch"]')
    page.wait_for_selector('.wrow')
    wt = page.inner_text('#page')
    check('3일째' in wt and '끌올 2번' in wt and '최근 · 가격 인하' in wt and '★로 고정' in wt and '그만 보기' in wt, '관심 매물: 출처·며칠째·끌올·최근 사건, 자동 줄만 ★로 고정·그만 보기')
    page.fill('#shareUrl', 'https://evil.example/m.bunjang.co.kr/products/1')
    n0 = gh.last()
    page.click('#shareForm button')
    page.wait_for_timeout(300)
    check(gh.last() == n0, '3사 호스트가 아닌 주소는 보내지 않음(L-6)')
    page.fill('#shareUrl', 'https://m.bunjang.co.kr/products/123456')
    page.click('#shareForm button')
    page.wait_for_timeout(600)
    check(gh.plain(gh.last())['type'] == 'share', 'share{url}')
    page.click('.tab[data-go="inbox"]')
    page.wait_for_selector('.irow')
    check(page.locator('.irow.unread').count() == 3 and '알림은 폰으로만 와요' in page.inner_text('#page'), '안 읽은 줄 점 · 폰에서 해 주세요 칸')
    page.click('[data-act="readAll"]')
    page.wait_for_timeout(600)
    check(page.locator('.irow.unread').count() == 0 and gh.plain(gh.last()) == {**gh.plain(gh.last()), 'type': 'inboxRead', 'all': True}, "'모두 읽음' → 바로 옅어지고 inboxRead{all}")
    check(page.inner_text('#cmdPill').find('알림') < 0, '알림 읽음은 머리 알약에 안 셈(작은 명령)')

    # ---------- 12. 설정(C-13) ----------
    page.click('.tab[data-go="settings"]')
    page.wait_for_selector('#s-defaultPct')
    st_ = page.inner_text('#page')
    check(st_.count('폰에서 해 주세요') >= 4 and '당근 요청 최근 1시간 23번 · 오늘 410번' in st_ and '당근 내 동네 · 정왕동' in st_, '폰에서 해 주세요 칸 · 수집 상태 · 내 동네')
    page.click('#s-defaultPct [data-act="prefPct"][data-v="20"]')
    page.wait_for_timeout(600)
    cp = gh.plain(gh.last())
    check(cp['type'] == 'prefs' and cp['set'] == {'defaultPct': 20} and cp['base'] == {'defaultPct': 15}, 'prefs{set,base} 설정 칸 하나')
    check('바꾸는 중' in page.inner_text('#s-defaultPct') and page.locator('#s-defaultPct [data-v="15"][aria-checked="true"]').count() == 1, "설정도 옛 값 + '바꾸는 중'")
    page.click('[data-act="homeDlg"]')
    page.fill('#homeIn', '정왕동, 배곧동, 은행동, 대야동, 신천동, 목감동')
    check(page.locator('#homeMany:not([hidden])').count() == 1 and page.locator('#homeGo[disabled]').count() == 1, '내 동네 6곳 → 5곳까지 안내 · 저장 못 누름')
    page.fill('#homeIn', '정왕동, 배곧동')
    page.click('#homeGo')
    page.wait_for_timeout(600)
    chh = gh.plain(gh.last())
    check(chh['type'] == 'home' and chh['set'] == {'daangnHome': '정왕동, 배곧동'} and chh['base'] == {'daangnHome': '정왕동'}, 'home{set,base}')
    shot(page, '13-settings')

    # ---------- 13. 다시 열면 비밀번호를 다시 물음(메모리 열쇠) · 보낸 기록엔 검색어 없음 ----------
    page.goto(BASE + '#')
    page.reload()
    page.wait_for_selector('.cards')
    rec = page.evaluate("() => localStorage.getItem('jd.cmds')")
    check(rec and all(w not in rec for w in ('에어팟', '버즈', '4080 super', '110만', '윈드포스')), '보낸 기록(이 브라우저)엔 검색어·조건 값 없음')
    check(page.evaluate('() => window.__radarTest.state().hasKey') is False, '새로고침하면 명령 열쇠는 잊음(탭마다 한 번)')
    page.click('#menu-s_4080')
    page.click('.menu button:has-text("아래로")')
    page.wait_for_selector('#cmdPw')
    check(True, '새로고침 뒤 첫 명령 → 비밀번호 창')
    cmd_pw(page)
    page.wait_for_timeout(600)
    check(gh.plain(gh.last())['type'] == 'move' and gh.plain(gh.last())['dir'] == 'down', 'move{pid,dir}')
    page.close()

    # ---------- 14. 앱 꺼짐 · 아이폰 ----------
    gh2 = FakeGitHub()
    gh2.bundle['platform'] = 'ios'
    gh2.reseal()
    ctx3 = browser.new_context(viewport={'width': 1280, 'height': 900}, locale='ko-KR', timezone_id='Asia/Seoul')
    page = new_page(ctx3, gh2, minutes=50)
    connect(page)
    page.click('[data-act="checkAll"]')
    cmd_pw(page)
    page.wait_for_timeout(700)
    b_ = page.inner_text('#banners')
    check('폰이' in b_ and '째 결과를 안 올렸어요' in b_ and '보낸 명령은 앱이 켜지면 처리해요' in b_ and '지금 모두 확인 · 보냄' in b_, '앱 꺼짐 띠 + 대기 명령 목록(디자인 5-1)')
    check('앱이 켜지면 처리해요' in page.inner_text('#page') and '앱을 열면 처리해요' in page.inner_text('#page'), "그 자리 한 줄 '앱이 켜지면 처리해요' + 아이폰 '앱을 열면 처리해요'")
    shot(page, '14-appoff')
    page.close()
    ctx3.close()

    # ---------- 15. 읽기만 토큰(403) ----------
    gh3 = FakeGitHub()
    ctx4 = browser.new_context(viewport={'width': 1280, 'height': 900}, locale='ko-KR', timezone_id='Asia/Seoul')
    page = new_page(ctx4, gh3)
    connect(page, RO_TOKEN)
    page.click('[data-act="checkAll"]')
    cmd_pw(page)
    page.wait_for_selector('text=지금 토큰은 읽기만 돼요')
    check(page.locator('.home-head [data-act="add"][disabled]').count() == 1 and gh3.last() == 0, "403 → '지금 토큰은 읽기만 돼요' 띠 + 명령 단추 못 누름")
    page.reload()
    page.wait_for_selector('.cards')
    check('지금 토큰은 읽기만 돼요' in page.inner_text('#banners'), '다시 열어도 읽기만 띠(토큰을 바꿀 때까지)')
    shot(page, '15-readonly', False)
    page.close()
    ctx4.close()

    # ---------- 16. 좁은 폭(390) ----------
    m = browser.new_context(viewport={'width': 390, 'height': 844}, locale='ko-KR', timezone_id='Asia/Seoul', device_scale_factor=2)
    gh4 = FakeGitHub()
    page = new_page(m, gh4)
    connect(page)
    shot(page, '16-mobile-home')
    check(page.evaluate('() => document.documentElement.scrollWidth') <= 390, '휴대폰 폭 가로 밀림 없음(홈)')
    page.goto(BASE + '#p=s_4080')
    page.wait_for_selector('.pv-head')
    check(page.evaluate('() => document.documentElement.scrollWidth') <= 390, '휴대폰 폭 가로 밀림 없음(결과 화면)')
    shot(page, '17-mobile-product')
    page.click('[data-act="edit"][data-pid="s_4080"]')
    page.wait_for_selector('#dE')
    shot(page, '18-mobile-edit', False)
    check(page.evaluate('() => document.documentElement.scrollWidth') <= 390, '휴대폰 폭 가로 밀림 없음(조건 창)')
    page.close()
    m.close()

    # ---------- 17. 앱이 만든 묶음(test/fixtures/app-cmds.json — 앱 web-control 가 만듦)으로 ----------
    app_f = os.path.join(REPO, 'test/fixtures/app-cmds.json')
    if os.path.exists(app_f):
        ab = json.load(open(app_f, encoding='utf-8'))['bundle']
        gh5 = FakeGitHub(ab)
        ctx5 = browser.new_context(viewport={'width': 1360, 'height': 900}, locale='ko-KR', timezone_id='Asia/Seoul')
        page = new_page(ctx5, gh5, minutes=(ab['made'] - MADE) / 60e3 + 2)
        connect(page)
        shot(page, '19-app-home')
        check(page.locator('.card').count() == len(ab['products']) and '물건 정하기' in page.inner_text('.card'), '앱 묶음: 홈 카드 · 미확정 알약')
        check(page.inner_text('#cmdPill') == '', '이 브라우저가 보내지 않은 명령 결과 줄(앱 묶음 cmds)은 머리 알약에 안 셈')
        page.goto(BASE + '#p=' + ab['products'][0]['id'])
        page.wait_for_selector('.pv-head')
        shot(page, '20-app-product')
        check(page.locator('.sumline').count() == 1, '앱 묶음: 결과 화면')
        page.click('.pv-head [data-act="edit"]')
        page.wait_for_selector('#dE')
        check(page.input_value('#e-keyword') == ab['products'][0]['cfg']['keyword'] and ab['products'][0]['pctPreview']['15'].split('\n')[0] in page.inner_text('#pctHint'), '앱 묶음: 조건 창 처음 값·꿀매 미리보기 = 앱 글')
        page.click('[data-act="close"]')
        page.click('.idband')
        page.wait_for_selector('#dI')
        shot(page, '21-app-identify', False)
        idf = ab['products'][0]['identify']
        check(page.locator('[data-act="idWord"]').count() == len(idf['words']) and (('이대로면 매물 %d건' % idf['previews']['none']['n']) in page.inner_text('.preview') if not idf['bands'] else True), '앱 묶음: 물건 정하기 단어 칩·미리보기(앱 값)')
        page.keyboard.press('Escape')
        for tab in ('watch', 'inbox', 'settings'):
            page.click('.tab[data-go="%s"]' % tab)
            page.wait_for_timeout(150)
        shot(page, '22-app-settings')
        check('당근 요청 최근 1시간' in page.inner_text('#page'), '앱 묶음: 설정·수집 상태')
        page.close()
        ctx5.close()
    browser.close()

srv.shutdown()
bad = [e for e in errors if 'Failed to load resource' not in e]
csp = [e for e in errors if 'Content Security Policy' in e]
if csp:
    print('\n'.join(csp))
    raise SystemExit('콘텐츠 보안 정책 위반 %d건' % len(csp))
OK.append('콘텐츠 보안 정책 위반 0')
if bad:
    print('\n'.join(bad))
    raise SystemExit('페이지 오류 %d건' % len(bad))
print('\n%d개 확인 통과 · 스크린샷 %s' % (len(OK), OUT))
