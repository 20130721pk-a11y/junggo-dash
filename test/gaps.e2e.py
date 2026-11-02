#!/usr/bin/env python3
"""0.8.5 '화면 판' T6·T8 화면 시험 — 못 받은 마켓·당근 0건 표시 · 까닭 창 · 결과 맨 위 줄 · 수집 상태 사람 말 ·
머리 줄 넘침 · 알림 '모름' 띠 · 판정 기준 줄(0.8.4 T9) (헤드리스 크로미움, 네트워크 없이).

    python3 test/gaps.e2e.py [스크린샷 폴더]

시험 자료: test/fixtures/app-gaps.json 의 bundle = 앱 dev-085 WebBundleGap085Test.writesGapCasesForTheWeb 가 만든 묶음
(지어낸 매물 — A 번개장터 못 받음 · B 당근 쉬는 중 + 번개장터 못 받음 · C 당근 0건 · W 세 마켓 다 · 일부만 · 정상,
그냥 검색 '4080' = 당근 내 동네 안 정함 + 지켜보는 물건 시세 빌림). 웹은 글을 만들지 않으니 화면 글 = 묶음 글인지 본다.
옛 묶음(gaps·tone·notifBanner 없음)은 같은 묶음에서 칸을 지워 예전처럼 그리는지 본다.
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
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'junggo-gaps-shots')
os.makedirs(OUT, exist_ok=True)
B = json.load(open(os.path.join(REPO, 'test/fixtures/app-gaps.json'), encoding='utf-8'))['bundle']
OK = []


def check(cond, msg):
    if not cond:
        raise AssertionError('실패: ' + msg)
    OK.append(msg)
    print('ok -', msg)


def old(b):
    o = copy.deepcopy(b)
    o.pop('notifBanner', None)
    for p in o['products']:
        for k in ('gaps', 'gapHead', 'gapLabel', 'info'):
            p.pop(k, None)
        p['notes'] = ['번개장터: 사이트에 연결하지 못했어요'] if p['id'] == 'a' else []
    for a in o['adhoc']:
        a.pop('gaps', None)
    for m in o['markets']:
        m.pop('tone', None)
        m.pop('bannerSub', None)
        m['text'] = m.get('banner') and '12시간째 연결이 안 돼요' or ('이상 없어요' if m['m'] == 'j' else '연결이 안 돼요')
    return o


P = {p['id']: p for p in B['products']}
check(set(P) == {'a', 'b', 'c', 'w', 'p', 'ok'}, '시험 자료: 물건 여섯')

site = tempfile.mkdtemp(prefix='jd-gaps-')
for f in ('index.html', 'box.js', 'radar-view.js', 'radar-cmd.js', 'radar-ui.js'):
    shutil.copy(os.path.join(REPO, f), os.path.join(site, f))
for d, b in (('new', B), ('old', old(B))):
    os.makedirs(os.path.join(site, d))
    json.dump(b, open(os.path.join(site, d, 'radar.json'), 'w', encoding='utf-8'), ensure_ascii=False)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=site))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ROOT = 'http://127.0.0.1:%d/index.html?src=./' % srv.server_address[1]
AT = dt.datetime.fromtimestamp((B['made'] + 3 * 60e3) / 1000, tz=dt.timezone.utc)


def card(page, pid):
    return page.locator('article.card').filter(has=page.locator(f'[data-open="{pid}"]'))


with sync_playwright() as pw:
    br = pw.chromium.launch()
    for w, h, big in ((1280, 900, False), (360, 760, False), (360, 760, True)):
        tag = f'[{w}{" 1.3배" if big else ""}] '
        ctx = br.new_context(viewport={'width': w, 'height': h})
        ctx.add_init_script("sessionStorage.setItem('jd.adhocq', '4080')")
        page = ctx.new_page()
        page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        page.route('**/fonts.gstatic.com/**', lambda r: r.abort())
        page.clock.set_fixed_time(AT)
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(ROOT + 'new#')
        page.wait_for_selector('article.card')
        if big:
            page.evaluate("() => document.documentElement.style.fontSize = '130%'")
            page.wait_for_timeout(100)

        # ---------- 홈 카드 마켓 줄 ----------
        for pid in ('a', 'b', 'c', 'w'):
            p = P[pid]
            btn = card(page, pid).locator('button.gaprow')
            check(btn.count() == 1, tag + f'{pid}: 표시가 있으면 마켓 줄 전체가 단추')
            marks = btn.locator('.gmark').all_inner_texts()
            want = [g['short'] for g in p['gaps'] if g.get('short')]
            check(marks == want, tag + f'{pid}: 짧은 표시 = 묶음 short 그대로 {marks}')
            check(btn.get_attribute('aria-label') == p['gapLabel'] + ', 까닭 보기' and btn.get_attribute('aria-haspopup') == 'dialog',
                  tag + f'{pid}: 화면 읽기 = 앱 gapLabel + 까닭 보기')
            bb = btn.bounding_box()
            check(bb['height'] >= 48, tag + f'{pid}: 누름 칸 높이 48 이상 ({bb["height"]:.0f})')
            check(btn.evaluate('e => e.scrollWidth <= e.clientWidth + 1'), tag + f'{pid}: 마켓 줄이 넘치지 않음')
            check(len(btn.evaluate("e => [...new Set([...e.querySelectorAll('.mlow')].map(x => Math.round(x.getBoundingClientRect().top)))]")) == 1,
                  tag + f'{pid}: 마켓 줄 한 줄')
        check(card(page, 'c').locator('.gmark').inner_text() == '0건', tag + 'C: 진짜 0건만 0건')
        check(card(page, 'p').locator('button.gaprow').count() == 0 and card(page, 'p').locator('.lines .mlow').count() == 3,
              tag + '일부만 받음: 단추 아님 · 가격 그대로')
        check(card(page, 'ok').locator('button.gaprow').count() == 0, tag + '정상: 단추 없음')
        check(page.locator('article.card .gmark').evaluate_all("es => es.every(e => getComputedStyle(e).textDecorationLine.includes('underline') && getComputedStyle(e).color === 'rgb(166, 172, 186)')"),
              tag + '표시는 회색(Ink2) 밑줄 — 꿀골드·코랄 아님')

        # 머리 줄(디자인 3-1): 확인 글 한 줄 · 넘침 없음
        whens = page.locator('article.card .card-head .when')
        rows1 = whens.evaluate_all("es => es.map(e => [e.getBoundingClientRect().height, parseFloat(getComputedStyle(e).lineHeight), e.scrollWidth <= e.clientWidth + 1])")
        check(all(r[0] <= r[1] * 1.5 and r[2] for r in rows1), tag + f'머리 줄 확인 글은 한 줄({len(rows1)}장)')
        heads = page.locator('article.card .card-head').evaluate_all("es => es.every(h => h.scrollWidth <= h.clientWidth + 1)")
        check(heads, tag + '머리 줄이 카드 밖으로 넘치지 않음')
        # (검색 칸은 360·1.3배에서 원래부터 34px 넘쳐요 — 0.8.5 밖, 노트에 적음. 여기선 카드만 봐요)
        check(page.locator('article.card').evaluate_all('es => es.every(e => e.getBoundingClientRect().right <= innerWidth + 1)'), tag + '카드가 화면 밖으로 넘치지 않음')
        if w == 360:
            card(page, 'b').screenshot(path=os.path.join(OUT, f'card-b-360{"-large" if big else ""}.png'))
            card(page, 'w').screenshot(path=os.path.join(OUT, f'card-w-360{"-large" if big else ""}.png'))

        # ---------- 까닭 창 ----------
        b = P['b']
        card(page, 'b').locator('button.gaprow').click()
        page.wait_for_selector('.gapdlg')
        dlg = page.locator('.gapdlg')
        check(dlg.get_attribute('role') == 'dialog' and dlg.get_attribute('aria-modal') == 'true', tag + '까닭 창 role=dialog · aria-modal')
        check(page.locator('#' + dlg.get_attribute('aria-labelledby')).inner_text() == '이번 확인 · 마켓 상태', tag + "제목 '이번 확인 · 마켓 상태'")
        check(page.locator('.gapdlg .whead').inner_text() == b['gapHead'], tag + '머리 글 = gapHead')
        check(page.locator('.gapdlg .rt1').all_inner_texts() == [g['line'] for g in b['gaps']], tag + '줄 글 = gaps[].line 차례 그대로')
        check(page.locator('.gapdlg .rsub').all_inner_texts() == [g['sub'] for g in b['gaps']], tag + "꼬리 = gaps[].sub('내일 HH:MM에 다시 해요 · 지난 당근 매물은 그대로 둬요')")
        check(page.locator('.gapdlg li').evaluate_all('es => es.map(e => e.getAttribute("aria-label"))') == [g['speech'] for g in b['gaps']], tag + '줄마다 화면 읽기 = speech')
        check(page.evaluate('document.activeElement.id') == 'gapClose', tag + '열면 [닫기]에 초점')
        page.keyboard.press('Tab')
        check(page.evaluate('document.activeElement.id') == 'gapClose', tag + 'Tab 이 창 안에서 돌아요')
        if w == 360:
            page.screenshot(path=os.path.join(OUT, f'dialog-b-360{"-large" if big else ""}.png'))
        page.keyboard.press('Escape')
        check(page.locator('.gapdlg').count() == 0, tag + 'Esc 로 닫힘')
        check(page.evaluate("document.activeElement.dataset.act === 'gap' && document.activeElement.dataset.pid === 'b'"), tag + '닫으면 마켓 줄로 초점')
        card(page, 'w').locator('button.gaprow').click()
        page.wait_for_selector('.gapdlg')
        check(page.locator('.gapdlg .whead').count() == 0 and page.locator('.gapdlg .rt1').count() == 3, tag + 'W: 머리 글 없음 · 세 마켓')
        box = page.locator('.gapdlg').bounding_box()
        check(box['height'] <= h - 16, tag + f'W: 창이 화면 안({box["height"]:.0f})')
        if w == 360:
            page.screenshot(path=os.path.join(OUT, f'dialog-w-360{"-large" if big else ""}.png'))
        page.locator('#gapClose').click()
        check(page.locator('.gapdlg').count() == 0, tag + '[닫기]로 닫힘')

        # ---------- 띠: 알림 '모름' · 막힘 둘째 줄 ----------
        bans = page.locator('.banner').all_inner_texts()
        check(any(B['notifBanner'] in t and '알림 설정에서 확인해 주세요' in t for t in bans), tag + "알림 '모름' 띠 = 앱 notifBanner")
        check(not any('폰 알림이 꺼져 있어요' in t for t in bans), tag + "'모름'을 '꺼져 있어요'로 그리지 않음")
        bj = [m for m in B['markets'] if m.get('banner')][0]
        check(any(bj['banner'] in t and bj['bannerSub'] in t for t in bans), tag + '막힘 띠 둘째 줄 = bannerSub')

        # ---------- 물건 화면 맨 위 줄 ----------
        page.click('[data-open="b"]')
        page.wait_for_selector('.sumline')
        if big:
            page.evaluate("() => document.documentElement.style.fontSize = '130%'")
        top = page.locator('.gaptop')
        check(top.count() == 1, tag + '물건 화면 맨 위 줄')
        check(top.locator('.gl').all_inner_texts() == [g['line'] for g in b['gaps']] and top.locator('.gs').all_inner_texts() == [g['sub'] for g in b['gaps']],
              tag + '맨 위 줄 = 까닭 창과 같은 글')
        check(page.evaluate("() => { const t = document.querySelector('.gaptop'), c = document.querySelector('.mchip'); return !!c && !!(t.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING); }"),
              tag + '맨 위 줄은 마켓 칩 위')
        check(top.get_attribute('role') == 'status', tag + "맨 위 줄 '조용히 알림'(role=status)")
        if w == 360:
            page.screenshot(path=os.path.join(OUT, f'results-b-360{"-large" if big else ""}.png'))
        page.goto(ROOT + 'new#p=ok')
        page.wait_for_selector('.sumline')
        check(page.locator('.gaptop').count() == 0, tag + '정상 물건엔 맨 위 줄 없음')

        # ---------- 그냥 검색: ① + 판정 기준 줄 ----------
        a = B['adhoc'][0]
        page.goto(ROOT + 'new#adhoc')
        page.wait_for_selector('.sumline')
        check(page.locator('.gaptop .gl').all_inner_texts() == [g['line'] for g in a['gaps']] and page.locator('.gaptop .gs').all_inner_texts() == [g['sub'] for g in a['gaps']],
              tag + "그냥 검색 맨 위 줄 '당근 내 동네를 정하지 않았어요'")
        page.click('[data-act="ptab"][data-t="price"]')
        page.wait_for_selector('.box-label')
        check(page.locator('.basis').inner_text() == a['cut']['basis'], tag + "시세 탭 '지켜보는 … 시세로 판정해요'(0.8.4 T9)")
        check(page.evaluate("() => { const l = document.querySelector('.box-label'), s = document.querySelector('.basis'); return l.nextElementSibling === s; }"),
              tag + "판정 기준 줄은 '꿀매 판정 기준' 바로 아래")

        # ---------- 설정 수집 상태 ----------
        page.goto(ROOT + 'new#settings')
        page.wait_for_selector('#s-status')
        st = page.locator('#s-status .mstat')
        check(st.count() == 3, tag + '수집 상태 마켓 셋')
        check(st.locator('p').all_inner_texts() == [m['text'] for m in B['markets']], tag + '상태 말 = markets[].text(사람 말)')
        cls = st.locator('p').evaluate_all('es => es.map(e => e.className)')
        check(cls == [{'ok': 'muted', 'warn': 'ink2', 'bad': 'bad'}[m['tone']] for m in B['markets']], tag + f'색 = tone {cls}')
        check(st.evaluate_all("es => es.every(e => { const n = e.querySelector('.mlow span:not(.mk):not(.sr)'); return n && n.getBoundingClientRect().height < 30; })"),
              tag + '마켓 이름 한 줄(번개장터 줄바꿈 없음)')
        check(not any('성공 ' in t for t in st.all_inner_texts()), tag + "'성공 {때}' 앞붙임 없음")
        if w == 360:
            page.locator('#s-status').screenshot(path=os.path.join(OUT, f'settings-360{"-large" if big else ""}.png'))

        # ---------- 옛 묶음 ----------
        page.goto(ROOT + 'old#')
        page.wait_for_selector('article.card')
        check(page.locator('button.gaprow').count() == 0, tag + '옛 묶음: 단추 없음')
        check('번개장터: 사이트에 연결하지 못했어요' in card(page, 'a').inner_text(), tag + '옛 묶음: 카드 날 글 줄 그대로')
        check(any('폰 알림이 꺼져 있어요' in t for t in page.locator('.banner').all_inner_texts()), tag + '옛 묶음: 알림 띠는 예전 글(notifOn=false)')
        page.goto(ROOT + 'old#settings')
        page.wait_for_selector('#s-status')
        check(page.locator('#s-status .mstat').count() == 0 and '성공 ' in page.locator('#s-status').inner_text(), tag + "옛 묶음: 수집 상태 '성공 {때}' 꼴")

        check(not errs, tag + f'페이지 오류 없음 {errs}')
        ctx.close()
    br.close()
srv.shutdown()
print(f'\n{len(OK)}개 확인 통과 · 스크린샷 {OUT}')
