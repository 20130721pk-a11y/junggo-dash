#!/usr/bin/env python3
"""0.8.7 앱 = 웹 조작 화면 시험 — 웹 명령 넷(헤드리스 크로미움, 가짜 GitHub — 실제 데이터 저장소에 명령을 올리지 않아요, L-11).

    python3 test/webcmd087.e2e.py [스크린샷 폴더]

시험 자료: test/fixtures/radar-bundle.control.json(make-control.mjs, 가짜 매물)에 그냥 검색 판단 창 빼기 단어 재료(sheet.words —
앱 fix-087-webcmd 묶음이 Identify.titleWords 로 실음)를 더해 써요. '앱'은 시험 안 흉내(app_round)가 명령을 열어 결과 줄을 넣고,
앱이 처리한 뒤 묶음처럼 그 매물 줄을 빼요 — 앱 쪽 진짜 처리(숨김·사기 기록·되돌리기)는 앱 시험(ktest WebCmd087Test)·에뮬레이터 검증 몫.
보는 것:
 1) 저장한 물건 판단 창 '사기 같아요' — 앱 글·안내 · scam{pid,key}(시세 대비 % 같은 판정 값은 안 보냄) · 줄 접힘·토스트 ·
    앱이 받기 전 되돌리기 = 이슈 닫기(취소) · 앱이 처리한 뒤 되돌리기 = unscam{ref = 그 명령 id, key}
 2) 그냥 검색 줄 '아님' = adhocHide{q,key,on:true} · 접힘 · 앱 결과 뒤 줄 빠짐 · 되돌리기 = adhocHide on:false
 3) 그냥 검색 판단 창 '이 매물 아님'·'사기 같아요'(scam{q,key})·빼기 단어 칩(adhocWord{q,word,key}) · '바꾸는 중'
 4) 잠시 끈 물건 판단 창엔 '사기 같아요' 없음 · 이슈 제목·몸통에 검색어·제목 0 · 페이지 오류 0.
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
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'junggo-webcmd087-shots')
os.makedirs(OUT, exist_ok=True)
subprocess.check_call(['node', os.path.join(REPO, 'test/fixtures/make-control.mjs')], stdout=subprocess.DEVNULL)
BASE_BUNDLE = json.load(open(os.path.join(REPO, 'test/fixtures/radar-bundle.control.json'), encoding='utf-8'))
MADE = BASE_BUNDLE['made']
PW = 'e2e-조작-비밀번호-0720'
TOKEN = 'e2e-rw-token'
OWNER_REPO = 'me/junggo-dash-data'
SALT = 'ZTJlLWNvbnRyb2wtc2FsdA=='
Q = BASE_BUNDLE['adhoc'][0]['q']
OK = []

# 앱 묶음처럼 그냥 검색 줄에 판단 창 재료(앱 Identify.titleWords(제목, 검색어) — 여기선 지어낸 말 둘)
for l in BASE_BUNDLE['adhoc'][0]['listings']:
    l['sheet'] = {'facts': ['시세 140만 · 판매완료 기준'], 'words': ['급처', '새제품']}
for p in BASE_BUNDLE['products']:
    for l in p['listings']:
        l.setdefault('sheet', {'facts': [], 'words': ['급처']})


def check(cond, msg):
    if not cond:
        raise AssertionError('실패: ' + msg)
    OK.append(msg)
    print('ok -', msg)


site = tempfile.mkdtemp(prefix='jdw-site-')
for f in ('index.html', 'old.html', 'box.js', 'radar-view.js', 'radar-cmd.js', 'radar-ui.js'):
    shutil.copy(os.path.join(REPO, f), os.path.join(site, f))
tools = tempfile.mkdtemp(prefix='jdw-tools-')
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
        self.bundle = json.loads(json.dumps(bundle))
        self.issues = {}
        self.next = 1
        self.reseal()

    def reseal(self):
        self.box = json.dumps(node('seal', 'junggo-radar-view', self.bundle))

    def handle(self, route):
        req = route.request
        path = urlparse(req.url).path
        H = {'access-control-allow-origin': '*', 'content-type': 'application/json'}
        if req.headers.get('authorization', '') != 'Bearer ' + TOKEN:
            return route.fulfill(status=401, body='{}', headers=H)
        if path == f'/repos/{OWNER_REPO}/contents/radar.enc':
            return route.fulfill(status=200, body=self.box, headers=H)
        if path == f'/repos/{OWNER_REPO}':
            return route.fulfill(status=200, body='{"private":true}', headers=H)
        if path == f'/repos/{OWNER_REPO}/issues' and req.method == 'POST':
            b = json.loads(req.post_data)
            n = self.next
            self.next += 1
            self.issues[n] = {'title': b.get('title'), 'body': b.get('body'), 'state': 'open', 'state_reason': None}
            return route.fulfill(status=201, body=json.dumps({'number': n}), headers=H)
        m = re.match(rf'^/repos/{OWNER_REPO}/issues/(\d+)$', path)
        if m:
            it = self.issues.get(int(m.group(1)))
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

    # 앱 흉내: 열린 이슈를 열어 결과 줄을 넣고 닫음 + 앱이 한 일을 묶음에(숨김 = 그 줄 빠짐, 되돌리기 = 줄 돌아옴)
    def app_round(self, at):
        rows = self.bundle.setdefault('cmds', [])
        for n in sorted(self.issues):
            it = self.issues[n]
            if it['state'] != 'open':
                continue
            c = self.plain(n)
            row = {'id': c['id'], 'n': n, 'type': c['type'], 'state': 'done', 'at': c['at'], 'doneAt': at}
            for k in ('pid', 'key'):
                if k in c:
                    row[k] = c[k]
            if c['type'] in ('scam', 'adhocHide') and c.get('on', True):
                src = next(p for p in self.bundle['products'] if p['id'] == c['pid']) if c.get('pid') else self.bundle['adhoc'][0]
                self.gone = getattr(self, 'gone', {})
                for i, l in enumerate(src['listings']):
                    if l['key'] == c['key']:
                        self.gone[c['key']] = (src, i, src['listings'].pop(i))
                        break
                if 'count' in src:
                    src['count'] = len(src['listings'])
            if c['type'] == 'unscam' or (c['type'] == 'adhocHide' and c.get('on') is False):
                g = getattr(self, 'gone', {}).pop(c['key'], None)
                if g:
                    g[0]['listings'].insert(g[1], g[2])
            rows.insert(0, row)
            it['state'] = 'closed'
            it['state_reason'] = 'completed'
        self.bundle['made'] = at
        self.reseal()


errors = []


def refresh(page):
    page.evaluate('() => window.__radarTest.refresh()')
    page.wait_for_timeout(300)


def shot(page, name):
    page.screenshot(path=os.path.join(OUT, name + '.png'), full_page=True)


def no_words(gh, n, words):
    it = gh.issues[n]
    return all(w not in it['title'] and w not in it['body'] for w in words)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1360, 'height': 900}, locale='ko-KR', timezone_id='Asia/Seoul')
    gh = FakeGitHub(BASE_BUNDLE)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: %s' % e))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
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

    # ---------- 1. 저장한 물건 판단 창 '사기 같아요' ----------
    page.goto(BASE + '#p=s_4080')
    page.wait_for_selector('.rows .row')
    row = page.locator('.rows .row').nth(1)
    K = row.get_attribute('data-key')
    title = page.locator(f'.rows .row[data-key="{K}"] .rt').inner_text()
    row.locator('.rt').click()
    page.wait_for_selector('.drawer')
    d = page.inner_text('.drawer')
    check('사기 같아요' in d and '이 매물 아님' in d, "판단 창: '이 매물 아님' + '사기 같아요'(앱 ListingSheet 와 같은 때)")
    check('사기 같아요 = 물건은 맞는데 믿기 어려울 때 · 숨기고 판매자 숫자만 남겨요(이름·번호는 안 남겨요)' in d, '안내 글 = 앱 SCAM_HINT')
    check(page.locator('.drawer [data-act="scam"]').get_attribute('aria-label') == '사기 같아요, 숨기고 판매자 숫자 남기기', '화면 읽기 = 앱 SCAM_CLICK')
    shot(page, '01-sheet-scam')
    page.click('.drawer [data-act="scam"]')
    page.wait_for_selector('#cmdPw')
    page.fill('#cmdPw', PW)
    page.click('[data-act="pwGo"]')
    page.wait_for_timeout(700)
    n1 = gh.last()
    c1 = gh.plain(n1)
    check(c1['type'] == 'scam' and c1['pid'] == 's_4080' and c1['key'] == K and 'q' not in c1 and set(c1) == {'v', 'kind', 'id', 'at', 'from', 'type', 'pid', 'key'},
          "'사기 같아요' = scam{pid,key}만 — 시세 대비 %는 앱이 냄(웹 값 안 보냄)")
    check(no_words(gh, n1, [title[:6], '4080']), '이슈 제목·몸통에 제목·검색어 없음(잠근 상자만)')
    check(page.locator('.drawer').count() == 0, '누르면 판단 창이 닫힘(앱 onDismiss 와 같음)')
    fold = page.locator('.rows .folded')
    check(fold.count() == 1 and '숨기고 판매자 숫자를 남겼어요' in fold.inner_text() and '보냈어요' in fold.inner_text(), '줄이 접혀 앱 결과를 기다림(첫 명령은 비밀번호 창 뒤라 토스트 없이 — 이 매물 아님과 같음)')
    fold.locator('[data-act="unhideRow"]').click()
    page.wait_for_timeout(500)
    check(gh.issues[n1]['state'] == 'closed' and gh.issues[n1]['state_reason'] == 'not_planned' and gh.issues[n1].get('closed_by') == 'web', '앱이 받기 전 되돌리기 = 이슈 닫기(취소)')
    check(page.locator('.rows .folded').count() == 0 and page.locator(f'.rows .row[data-key="{K}"]').count() == 1, '취소하면 줄이 돌아옴')

    # 다시 보내고 앱이 처리 → 줄이 빠지고, 그 뒤 되돌리기 = unscam{ref,key}
    page.locator(f'.rows .row[data-key="{K}"] .rt').click()
    page.wait_for_selector('.drawer')
    page.click('.drawer [data-act="scam"]')
    page.wait_for_timeout(700)
    n2 = gh.last()
    id2 = gh.plain(n2)['id']
    check('숨기고 판매자 숫자를 남겼어요' in page.inner_text('#toast') and '되돌리기' in page.inner_text('#toast'), '토스트 = 앱 SCAM_SNACK + 되돌리기')
    gh.app_round(MADE + 6 * 60e3)
    refresh(page)
    check(page.locator(f'.rows .row[data-key="{K}"]').count() == 0 and page.locator('.rows .folded').count() == 0, '앱이 처리한 묶음 = 그 줄이 빠짐(웹은 앱 결과만 그림)')
    page.click('#toast [data-act="toast"]')
    page.wait_for_timeout(600)
    n3 = gh.last()
    c3 = gh.plain(n3)
    check(n3 == n2 + 1 and c3['type'] == 'unscam' and c3['ref'] == id2 and c3['key'] == K and 'pid' not in c3, "앱이 처리한 뒤 '되돌리기' = unscam{ref = 그 사기 같아요 명령 id, key} — 앱이 그 명령이 남긴 기록 시각으로 기록을 지움")
    gh.app_round(MADE + 7 * 60e3)
    refresh(page)
    check(page.locator(f'.rows .row[data-key="{K}"]').count() == 1, '되돌리기를 앱이 처리하면 줄이 돌아옴')

    # ---------- 2. 그냥 검색 줄 '아님' ----------
    page.goto(BASE + '#')
    page.wait_for_selector('#q')
    page.fill('#q', Q)
    page.click('#qGo')
    page.wait_for_selector('.pv-head')
    arows = page.locator('.rows .row')
    check(arows.count() >= 2 and page.locator('.rows .row .notbtn[data-act="aHide"]').count() == arows.count(), "그냥 검색 줄마다 '아님'(앱 결과 화면 밀어서 숨기기와 같음)")
    A = arows.nth(0).get_attribute('data-key')
    arows.nth(0).locator('.notbtn').click()
    page.wait_for_timeout(700)
    n4 = gh.last()
    c4 = gh.plain(n4)
    check(c4['type'] == 'adhocHide' and c4['q'] == Q and c4['key'] == A and c4['on'] is True and 'pid' not in c4, "그냥 검색 '아님' = adhocHide{q,key,on:true}")
    check(page.locator('.rows .folded').count() == 1 and '이 매물은 빼고 볼게요' in page.inner_text('.rows .folded') and '이 매물은 빼고 볼게요' in page.inner_text('#toast'), '접힘 + 토스트(앱 스낵바 글)')
    check('바꾸는 중' in page.inner_text('#page'), "지금 최저가 칸 '바꾸는 중'(앱이 다시 셀 때까지)")
    shot(page, '02-adhoc-hide')
    gh.app_round(MADE + 8 * 60e3)
    refresh(page)
    check(page.locator(f'.rows .row[data-key="{A}"]').count() == 0 and page.locator('.rows .folded').count() == 0, '앱 결과 = 그 줄이 빠짐')
    page.click('#toast [data-act="toast"]')
    page.wait_for_timeout(600)
    c5 = gh.plain(gh.last())
    check(c5['type'] == 'adhocHide' and c5['on'] is False and c5['key'] == A and c5['q'] == Q, '되돌리기(앱이 받은 뒤) = adhocHide{on:false}')
    gh.app_round(MADE + 9 * 60e3)
    refresh(page)

    # ---------- 3. 그냥 검색 판단 창: 이 매물 아님 · 사기 같아요 · 빼기 단어 ----------
    B = page.locator('.rows .row').nth(1).get_attribute('data-key')
    page.locator(f'.rows .row[data-key="{B}"] .rt').click()
    page.wait_for_selector('.drawer')
    d2 = page.inner_text('.drawer')
    check('이 매물 아님' in d2 and '사기 같아요' in d2 and '이 말이 든 매물은 모두 빼기' in d2 and '참고용이에요' not in d2,
          "그냥 검색 판단 창 = 앱 결과 화면 시트(이 매물 아님 · 사기 같아요 · 빼기 단어, '참고용' 줄 없음)")
    check(page.locator('.drawer [data-act="aWord"]').count() == 2, '빼기 단어 칩 = 묶음 sheet.words')
    page.click('.drawer [data-act="aWord"][data-w="급처"]')
    page.wait_for_timeout(700)
    c6 = gh.plain(gh.last())
    check(c6['type'] == 'adhocWord' and c6['q'] == Q and c6['word'] == '급처' and c6['key'] == B, "빼기 단어 = adhocWord{q,word,key}")
    check(page.locator('.drawer .cchip.ex').count() == 1 and '바꾸는 중' in page.inner_text('.drawer .cchip.ex'), "누른 칩 '− 급처 바꾸는 중'")
    shot(page, '03-adhoc-sheet')
    page.click('.drawer [data-act="scam"]')
    page.wait_for_timeout(700)
    c7 = gh.plain(gh.last())
    check(c7['type'] == 'scam' and c7['q'] == Q and c7['key'] == B and 'pid' not in c7, "그냥 검색 '사기 같아요' = scam{q,key}")
    check(page.locator('.rows .folded').count() == 1 and '숨기고 판매자 숫자를 남겼어요' in page.inner_text('.rows .folded'), '그냥 검색 줄도 접힘')

    # ---------- 4. 잠시 끈 물건: '사기 같아요' 없음 ----------
    paused = next((p['id'] for p in gh.bundle['products'] if p.get('state') == 'paused' and p['listings']), None)
    if paused:
        page.goto(BASE + '#p=' + paused)
        page.wait_for_selector('.rows .row')
        page.locator('.rows .row .rt').first.click()
        page.wait_for_selector('.drawer')
        check(page.locator('.drawer [data-act="scam"]').count() == 0 and page.locator('.drawer [data-act="hide"]').count() == 0, "잠시 끈 물건 판단 창엔 '이 매물 아님'·'사기 같아요' 없음(앱 off 와 같음)")
    else:
        b2 = json.loads(json.dumps(gh.bundle))
        b2['products'][0]['state'] = 'paused'  # 앱 묶음 잠시 끈 물건(state 'paused' · pausedAt)
        b2['products'][0]['pausedAt'] = MADE - 3600e3
        gh.bundle = b2
        gh.reseal()
        refresh(page)
        page.goto(BASE + '#p=s_4080')
        page.wait_for_selector('.rows .row')
        page.locator('.rows .row .rt').first.click()
        page.wait_for_selector('.drawer')
        check(page.locator('.drawer [data-act="scam"]').count() == 0 and page.locator('.drawer [data-act="hide"]').count() == 0, "잠시 끈 물건 판단 창엔 '이 매물 아님'·'사기 같아요' 없음(앱 off 와 같음)")
    check(not errors, '페이지 오류 0 ' + '; '.join(errors[:3]))
    browser.close()

print(f'\n{len(OK)}개 통과')
