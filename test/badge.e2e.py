#!/usr/bin/env python3
"""0.8.2 '⚠ 사기 의심'·'⚠ 확인 필요' 배지와 사유 창 화면 시험 (헤드리스 크로미움, 네트워크 없이).

    python3 test/badge.e2e.py [스크린샷 폴더]

시험 자료: test/fixtures/app-badge.json 의 bundle = 앱 dev-082(867edc4) WebBundle.build 가 만든 묶음
(WebBundleBadgeTest 의 매물 + 갈래 섞인 매물 둘 — 지어낸 매물). 잠그지 않은 디버그 꼴(?src=)로 열어요(명령은 안 보냄).
옛 묶음(grade.badge·reasons 없음)은 같은 묶음에서 두 칸을 지워 봐요 — 지금처럼 why 한 줄이어야 해요.
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
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'junggo-badge-shots')
os.makedirs(OUT, exist_ok=True)
B = json.load(open(os.path.join(REPO, 'test/fixtures/app-badge.json'), encoding='utf-8'))['bundle']
OK = []


def check(cond, msg):
    if not cond:
        raise AssertionError('실패: ' + msg)
    OK.append(msg)
    print('ok -', msg)


def strip(b):
    o = copy.deepcopy(b)
    for p in o['products']:
        for l in p['listings']:
            for x in [l] + l.get('dupRows', []):
                g = x.get('grade') or {}
                g.pop('badge', None)
                g.pop('reasons', None)
    return o


site = tempfile.mkdtemp(prefix='jd-badge-')
for f in ('index.html', 'box.js', 'radar-view.js', 'radar-cmd.js', 'radar-ui.js'):
    shutil.copy(os.path.join(REPO, f), os.path.join(site, f))
for d, b in (('new', B), ('old', strip(B))):
    os.makedirs(os.path.join(site, d))
    json.dump(b, open(os.path.join(site, d, 'radar.json'), 'w', encoding='utf-8'), ensure_ascii=False)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=site))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ROOT = 'http://127.0.0.1:%d/index.html?src=./' % srv.server_address[1]
AT = dt.datetime.fromtimestamp((B['made'] + 3 * 60e3) / 1000, tz=dt.timezone.utc)
PID = B['products'][0]['id']
SCAM, MIX, CHECK2, CHECK1 = 'j:233702091', 'j:k1', 'b:h1', 'b:m1'
HEAD = '지금 최저가·꿀매·알림에서 뺐어요. 목록엔 남아요.'
FOOT = '본 사실만 적었어요. 정상 판매자도 걸릴 수 있어요.'
F14 = ['안심거래·후기가 없어요', '등록 계좌가 없어요', '동네를 안 적었어요', '고가 전자제품만 3개 팔아요']


def row(page, key):
    return page.locator(f'li.row[data-key="{key}"]')


def vis_badge(scope, key):
    """보이는 쪽 배지(넓은 화면 = .rb, 좁은 화면 = .compact)."""
    bs = scope.locator(f'button.bwhy[data-key="{key}"]')
    for i in range(bs.count()):
        if bs.nth(i).is_visible():
            return bs.nth(i)
    raise AssertionError('보이는 배지 없음 ' + key)


def why_texts(page):
    return page.locator('.whydlg .rwlist .rt1').all_inner_texts()


with sync_playwright() as pw:
    br = pw.chromium.launch()
    for w, h in ((1280, 900), (390, 844)):
        ctx = br.new_context(viewport={'width': w, 'height': h})
        page = ctx.new_page()
        page.clock.set_fixed_time(AT)
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(ROOT + 'new#p=' + PID)
        page.wait_for_selector('.rows .row')
        page.wait_for_timeout(200)
        tag = f'[{w}] '

        # ---------- 목록: 배지만, 이유 글 줄 없음 ----------
        check(page.locator('.row .rs.why').count() == 0, tag + '사유가 온 ⚠ 줄엔 이유 글 줄(.rs.why)이 없어요')
        for key, kind, cls in ((SCAM, '사기 의심', 'b-scam'), (MIX, '사기 의심', 'b-scam'), (CHECK2, '확인 필요', 'b-caution'), (CHECK1, '확인 필요', 'b-caution')):
            b = vis_badge(page, key)
            check(b.inner_text().strip() == '⚠ ' + kind, tag + f'{key} 배지 글 「⚠ {kind}」')
            check(cls in b.get_attribute('class'), tag + f'{key} 배지 꼴 {cls}')
            check(b.get_attribute('aria-label') == f'{kind}, 사유 보기', tag + f'{key} 화면 읽기 「{kind}, 사유 보기」')
        check(page.locator('button.bwhy.b-caution.b-scam').count() == 0, tag + '두 꼴이 겹치지 않아요')
        check(page.locator('.row:not(:has(.bwhy)) button.bwhy').count() == 0 and page.locator('.b-honey button, button.b-honey, button.b-good, button.b-fair, button.b-high').count() == 0,
              tag + '⚠ 아닌 배지는 누를 수 없어요(단추 아님)')
        sh = page.evaluate("""() => { const b = getComputedStyle(document.querySelector('.b-scam')); return [b.color, b.boxShadow]; }""")
        check(sh[0] == 'rgb(242, 243, 246)' and '98, 106, 120' in sh[1], tag + '사기 의심 = 글 ink · 안쪽 테두리 line-strong(코랄 아님)')
        plain = page.locator('li.row:not(:has(.bwhy))').first
        hs = [row(page, SCAM).bounding_box()['height'], plain.bounding_box()['height']]
        # 넓은 화면은 줄 높이가 같고, 좁은 화면은 ⚠ 줄이 더 크지 않아요(보통 줄은 판정 글 .rs 가 한 줄 더 있음 — 소식·같은 글·변형이 없으면 ⚠ 줄엔 .rs 가 없어요)
        check(abs(hs[0] - hs[1]) < 1 if w > 900 else hs[0] <= hs[1], tag + f'⚠ 줄이 보통 줄보다 크지 않아요 {hs}')
        if w == 1280:
            page.screenshot(path=os.path.join(OUT, 'list-1280.png'), full_page=True)

        # ---------- 배지 누름 = 사유 창(판단 창은 안 열림) ----------
        b = vis_badge(page, SCAM)
        b.click()
        page.wait_for_selector('.whydlg')
        check(page.locator('.drawer').count() == 0, tag + '배지를 누르면 판단 창은 안 열려요')
        dlg = page.locator('.whydlg')
        check(dlg.get_attribute('role') == 'dialog' and dlg.get_attribute('aria-modal') == 'true', tag + '사유 창 role=dialog · aria-modal')
        check(page.locator('#' + dlg.get_attribute('aria-labelledby')).inner_text() == '사기 의심 이유', tag + '창 제목 「사기 의심 이유」(제목 연결)')
        check(page.locator('.whydlg .whead').inner_text() == HEAD, tag + '머리 글')
        check(why_texts(page) == F14, tag + '대표 예시 233702091 사유 4줄 한 줄씩, 온 순서 그대로')
        check(page.locator('.whydlg .wgname').count() == 0, tag + '한 갈래(판매자)뿐이면 갈래 이름 없음')
        check(page.locator('.whydlg .wfoot').inner_text() == FOOT, tag + '사기 의심만 끝 글')
        check(page.evaluate('document.activeElement.id') == 'whyClose', tag + '열면 [닫기]에 초점')
        page.keyboard.press('Tab')
        check(page.evaluate('document.activeElement.id') == 'whyClose', tag + 'Tab 이 창 안에서 돌아요')
        if w == 390:
            page.screenshot(path=os.path.join(OUT, 'why-390.png'))
        page.keyboard.press('Escape')
        page.wait_for_selector('.whydlg', state='detached')
        check(page.evaluate("document.activeElement.dataset.key") == SCAM and page.evaluate("document.activeElement.dataset.act") == 'why', tag + 'Esc 로 닫히고 초점은 배지로')

        # 갈래 둘(글 + 가격) · 꼬리
        vis_badge(page, MIX).click()
        page.wait_for_selector('.whydlg')
        check(page.locator('.whydlg .wgname').all_inner_texts() == ['글', '가격'], tag + '갈래가 둘 이상이면 갈래 이름 「글」「가격」')
        check(why_texts(page) == ['외부 메신저로 연락하래요', '가격을 따로 묻게 해요(미끼 의심)', '시세의 절반도 안 돼요'], tag + 'k1 사유 3줄')
        check(page.locator('.whydlg .rsub').all_inner_texts() == ['미끼·사기·다른 물건일 수 있어요'], tag + "' — ' 꼬리는 회색 줄")
        check(page.locator('.whydlg .wgname').first.evaluate('e => e.tagName') == 'H3', tag + '갈래 이름은 제목(heading)')
        # 바깥 누르기로 닫힘
        page.mouse.click(5, h - 5)
        page.wait_for_selector('.whydlg', state='detached')
        check(page.locator('.drawer').count() == 0, tag + '바깥을 누르면 사유 창만 닫혀요')

        # 확인 필요 · 한 갈래(가격) · 꼬리 둘 · 끝 글 없음
        vis_badge(page, CHECK2).click()
        page.wait_for_selector('.whydlg')
        check(page.locator('#dWhy').inner_text() == '확인 필요 이유', tag + '창 제목 「확인 필요 이유」')
        check(page.locator('.whydlg .wgname').count() == 0 and len(why_texts(page)) == 2, tag + 'h1 가격 갈래 2줄 · 갈래 이름 없음')
        check(page.locator('.whydlg .rsub').count() == 2, tag + 'h1 꼬리 둘')
        check(page.locator('.whydlg .wfoot').count() == 0, tag + '확인 필요엔 끝 글 없음')
        page.locator('#whyClose').click()
        page.wait_for_selector('.whydlg', state='detached')

        # 누름 칸: 배지 바로 아래 18px(보이는 배지 밖)를 눌러도 사유 창
        bb = vis_badge(page, CHECK1).bounding_box()
        page.mouse.click(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2 + 18)
        page.wait_for_timeout(100)
        check(page.locator('.whydlg').count() == 1 and page.locator('.drawer').count() == 0, tag + '배지 위아래 늘린 칸(44px 이상)을 눌러도 사유 창, 판단 창은 안 열림')
        check(why_texts(page) == ['가격을 따로 묻게 해요(미끼 의심)'], tag + 'm1 사유 1줄')
        page.keyboard.press('Escape')
        page.wait_for_selector('.whydlg', state='detached')

        # 키보드: 배지에서 Enter = 사유 창(줄 판단 창 아님)
        vis_badge(page, SCAM).focus()
        page.keyboard.press('Enter')
        page.wait_for_selector('.whydlg')
        check(page.locator('.drawer').count() == 0, tag + '배지에서 Enter = 사유 창(판단 창 안 열림)')
        page.keyboard.press('Escape')
        page.wait_for_selector('.whydlg', state='detached')

        # ---------- 줄 누름 = 판단 창(사유 목록) · 그 안 배지 = 같은 사유 창 ----------
        row(page, SCAM).locator('.rt').click()
        page.wait_for_selector('.drawer')
        check(page.locator('.drawer .rlist li').all_inner_texts() == F14, tag + '판단 창은 사유를 목록으로(4줄)')
        check(page.locator('.drawer .wgname').count() == 0, tag + '판단 창엔 갈래 이름 없음')
        check(page.locator('.drawer .price-row + p.facts').count() == 0, tag + '판단 창에 이유 한 문단(why)은 없어요')
        db = page.locator('.drawer button.bwhy')
        check(db.count() == 1 and db.inner_text().strip() == '⚠ 사기 의심', tag + '판단 창 배지도 단추')
        db.click()
        page.wait_for_selector('.whydlg')
        check(page.locator('.drawer').count() == 1 and why_texts(page) == F14, tag + '판단 창 위에 같은 사유 창')
        z = page.evaluate("[getComputedStyle(document.querySelector('.wscrim')).zIndex, getComputedStyle(document.querySelector('.drawer')).zIndex]")
        check(int(z[0]) > int(z[1]), tag + '사유 창이 판단 창 위에')
        page.locator('#whyClose').click()
        page.wait_for_selector('.whydlg', state='detached')
        check(page.locator('.drawer').count() == 1, tag + '[닫기]는 사유 창만 닫아요(판단 창 그대로)')
        check(page.evaluate("document.activeElement.closest('.drawer') !== null && document.activeElement.dataset.act === 'why'"), tag + '닫으면 판단 창 안 배지로 초점')
        # 판단 창 사유 꼬리
        page.keyboard.press('Escape')
        page.wait_for_selector('.drawer', state='detached')
        row(page, CHECK2).locator('.rt').click()
        page.wait_for_selector('.drawer')
        check(page.locator('.drawer .rlist .rsub').count() == 2, tag + '판단 창 꼬리도 회색 줄')
        page.keyboard.press('Escape')

        check(page.evaluate('document.documentElement.scrollWidth') <= w, tag + '가로로 밀리지 않아요')

        # ---------- 옛 묶음(badge·reasons 없음) = 지금 그대로 ----------
        page.goto(ROOT + 'old#p=' + PID)
        page.wait_for_selector('.rows .row')
        page.wait_for_timeout(200)
        check(page.locator('button.bwhy').count() == 0, tag + '옛 묶음: 배지는 단추가 아니에요')
        check(page.locator('.b-scam').count() == 0, tag + '옛 묶음: 사기 의심 꼴 없음')
        check(row(page, SCAM).locator('.rs.why').inner_text() == B['products'][0]['listings'][[l['key'] for l in B['products'][0]['listings']].index(SCAM)]['grade']['why'],
              tag + '옛 묶음: ⚠ 줄은 why 한 줄 그대로')
        check(page.locator('.row .rs.why').count() == 4, tag + '옛 묶음: ⚠ 넷 모두 why 줄')
        row(page, SCAM).locator('.rt').click()
        page.wait_for_selector('.drawer')
        check(page.locator('.drawer .rlist').count() == 0 and page.locator('.drawer .price-row + p.facts').count() == 1, tag + '옛 묶음: 판단 창은 why 한 문단')
        check(not errs, tag + '스크립트 오류 없음 ' + '; '.join(errs))
        ctx.close()
    br.close()
print(f'{len(OK)} 통과 · 스크린샷 {OUT}')
