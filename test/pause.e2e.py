#!/usr/bin/env python3
"""잠시 끄기(R7, 앱 0.8.0) 웹 화면 시험 — control.e2e.py 와 같은 가짜 GitHub·사이트 폴더(그 파일 앞부분을 그대로 씀).

    python3 test/pause.e2e.py [스크린샷 폴더]

보는 것: ⋯ '잠시 끄기'(그만 지켜보기 바로 위) · 확인 창 없이 6초 '되돌리기' 토스트 → 되돌리면 안 보냄 · 6초 뒤 pause{pid,on:true}
· '끄는 중' 알약 · 앱이 끄면 '잠시 끈 물건 n' 회색 카드(가격·꿀매·민트 없음) · 끈 물건 메뉴 두 줄 · 다시 켜기 → pause{on:false}
· '다시 잡는 중' 두 줄 · 물건 화면 띠·조건 끔·지금 확인 없음·아님 없음 · 옆 목록 '잠시 꺼 둠' · 모두 끄면 머리 '모두 잠시 꺼 둠'·켜 둔 물건 0 글
· 이슈 제목·몸통에 물건 이름 0 · 콘텐츠 보안 정책 오류 0 · 좁은 폭.
"""
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
_src = open(os.path.join(HERE, 'control.e2e.py'), encoding='utf-8').read()
_cut = _src.index("WORDS = (")
sys.argv = [sys.argv[0], sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'junggo-pause-shots')]
exec(compile(_src[:_cut], 'control.e2e.py(앞부분)', 'exec'))  # noqa: S102 — 같은 저장소의 시험 도구(가짜 GitHub·사이트 폴더)

DAY = 86400e3


def paused(p, at):
    """앱 WebBundle 이 끈 물건을 싣는 꼴(state 'paused' + pausedAt, 등급·꿀매·지금 최저가 없음)."""
    p.update(state='paused', pausedAt=at, honey=0, lowKey=None, change=None, facts=[], ledger=[], stateCard=None, statePage=None,
             cautionCard=None, cautionKey=None, focus=False)
    for l in p.get('listings', []):
        l['grade'] = None
        l.pop('sheet', None)


def rebase(p):
    t = '다시 켰어요 · 세 마켓을 다시 모아 기준을 잡는 중이에요'
    p.update(state='rebase', pausedAt=None, honey=0, lowKey=None, stateCard=t, statePage=t, stateSub='이번 확인은 알림 없이 기준만 잡아요', cut={'rebase': t})
    for l in p.get('listings', []):
        l['grade'] = None


with sync_playwright() as pw_:
    browser = pw_.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1360, 'height': 900}, locale='ko-KR', timezone_id='Asia/Seoul')
    b0 = json.loads(json.dumps(BASE_BUNDLE))
    b0['focusPlan'] = None
    for p in b0['products']:
        p['focus'] = False
    paused(next(p for p in b0['products'] if p['id'] == 's_5080'), MADE - DAY)  # 어제 끈 물건
    gh = FakeGitHub(b0)
    page = new_page(ctx, gh)
    connect(page)

    # ---------- 1. 홈: 끈 물건 묶음 ----------
    ht = page.inner_text('#page')
    check('잠시 끈 물건 1' in ht and '확인·알림을 멈췄어요 · 기록은 그대로예요' in ht, "켜 둔 카드 아래 '잠시 끈 물건 1' + 부제(디자인 4-3)")
    off = page.locator('.card.paused')
    check(off.count() == 1, '끈 카드 하나(.card.paused)')
    ot = off.inner_text()
    check('잠시 꺼 둠 · 어제부터 · 기록은 그대로' in ot and '다시 켜기' in ot, "끈 카드 둘째 줄 '잠시 꺼 둠 · 어제부터 · 기록은 그대로' + 다시 켜기")
    check(off.locator('.price, .badge, .pill.honey, .low').count() == 0, '끈 카드엔 가격·배지·꿀매 알약 없음(꿀골드·민트 약속)')
    check(off.get_attribute('aria-label') == 'RTX 5080, 잠시 꺼 둠, 어제부터', '끈 카드 화면 읽기 이름')
    bg = page.evaluate("() => getComputedStyle(document.querySelector('.card.paused')).backgroundColor")
    check(bg in ('rgba(0, 0, 0, 0)', 'transparent'), '끈 카드 바탕 없음(CSS .card.paused)')
    # 섹션 순서: 켜 둔 카드들 → 끈 묶음
    order = page.evaluate("() => [...document.querySelectorAll('.card')].map(c => c.classList.contains('paused'))")
    check(order[-1] is True and order.count(True) == 1, '끈 카드는 켜 둔 카드 뒤')
    shot(page, 'p01-home')

    # ---------- 2. 끈 물건 메뉴 두 줄 ----------
    page.click('#menu-s_5080')
    page.wait_for_selector('.menu')
    check(page.locator('.menu button').all_inner_texts() == ['다시 켜기', '그만 지켜보기'], '끈 물건 ⋯ = 다시 켜기 · 그만 지켜보기 두 줄(디자인 4-1)')
    page.click('[data-act="menuClose"]')

    # ---------- 3. 켜 둔 물건 잠시 끄기 → 되돌리기 ----------
    page.click('#menu-s_4080')
    page.wait_for_selector('.menu')
    items = page.locator('.menu button').all_inner_texts()
    check(items[-2:] == ['잠시 끄기', '그만 지켜보기'], "'잠시 끄기'는 '그만 지켜보기' 바로 위")
    check('coral' not in (page.locator('.menu button:has-text("잠시 끄기")').get_attribute('class') or ''), "'잠시 끄기'는 코랄 아님")
    page.click('.menu button:has-text("잠시 끄기")')
    page.wait_for_timeout(100)
    check(page.locator('#dE, .dialog').count() == 0, '확인 창 없음(10/25 대표 결정)')
    tt = page.inner_text('#toast')
    check("'RTX 4080' 잠시 끌게요" in tt and '되돌리기' in tt, "토스트 ''RTX 4080' 잠시 끌게요' + 되돌리기")
    check('끄는 중' in page.locator('.card').nth(0).inner_text(), "카드는 제자리 + '끄는 중' 알약")
    check(gh.last() == 0, '6초 전엔 보내지 않음')
    page.click('#toast [data-act="toast"]')
    page.clock.run_for(7000)
    page.wait_for_timeout(200)
    check(gh.last() == 0 and '끄는 중' not in page.locator('.card').nth(0).inner_text(), '되돌리기 → 보내지 않음 · 알약 사라짐')

    # ---------- 4. 다시 잠시 끄기 → 6초 뒤 pause on ----------
    page.click('#menu-s_4080')
    page.click('.menu button:has-text("잠시 끄기")')
    page.clock.run_for(6500)
    cmd_pw(page)
    page.wait_for_timeout(600)
    check(gh.last() == 1, '6초 뒤 명령 하나(첫 명령은 비밀번호)')
    c1 = gh.plain(1)
    check(c1['type'] == 'pause' and c1['pid'] == 's_4080' and c1['on'] is True, 'pause{pid, on:true}')
    check(all(w not in gh.issues[1]['title'] + gh.issues[1]['body'] for w in ('4080', 'RTX')), '이슈 제목·몸통에 물건 이름 0')
    ct = page.locator('.card').nth(0).inner_text()
    check('끄는 중' in ct and '잠시 끄기' in ct, "'끄는 중' + 그 자리 한 줄 'RTX 4080 잠시 끄기 · 보냈어요'")

    def do_pause(c, row, b):
        if c['type'] == 'pause':
            p = next(x for x in b['products'] if x['id'] == c['pid'])
            if c['on']:
                paused(p, MADE + 6 * 60e3)
                row['what'] = p['name'] + ' 잠시 끄기'
            else:
                rebase(p)
                row['what'] = p['name'] + ' 다시 켜기'
    gh.app_round(do_pause)
    refresh(page)
    ht = page.inner_text('#page')
    check('잠시 끈 물건 2' in ht and page.locator('.card.paused').count() == 2, "앱이 끄면 '잠시 끈 물건 2'로 옮김")
    check('잠시 꺼 둠 · 오늘부터 · 기록은 그대로' in page.locator('.card.paused').nth(0).inner_text(), "오늘 끈 물건 '오늘부터'")
    shot(page, 'p02-paused')

    # ---------- 5. 물건 화면(끈 물건) ----------
    page.goto(BASE + '#p=s_5080')
    page.wait_for_selector('.pv-head')
    pt = page.inner_text('#page')
    check('잠시 끈 물건이에요' in pt and '어제부터 확인·알림을 멈췄어요 · 아래는 끌 때 결과예요' in pt and '다시 켜기 ›' in pt, '물건 화면 맨 위 띠(디자인 4-4)')
    edit = page.locator('.pv-head [data-act="edit"]')
    check(edit.is_disabled() and edit.get_attribute('title') == '다시 켠 뒤에 바꿀 수 있어요', "'조건' 끔 · 까닭 '다시 켠 뒤에 바꿀 수 있어요'")
    check(page.locator('.pv-head [data-act="check"]').count() == 0 and page.locator('.pv-head [data-act="resume"]').count() == 1, "'지금 확인' 자리에 '다시 켜기'")
    check(page.locator('.notbtn').count() == 0, "끈 물건 매물 줄에 '아님' 없음(숨김 키 = 조건)")
    check('지금 최저가' not in page.inner_text('.pv section') or page.locator('.hero').count() == 0, '지금 최저가 칸 없음')
    side = page.locator('.plist button').all_inner_texts()
    check('잠시 꺼 둠' in side[-1] and '잠시 꺼 둠' in side[-2], "옆 목록: 끈 물건은 맨 아래 '잠시 꺼 둠 · {날짜}부터'")
    shot(page, 'p03-product')

    # ---------- 6. 다시 켜기 → 다시 잡는 중 ----------
    page.click('.banner [data-act="resume"]')
    page.wait_for_timeout(600)
    c2 = gh.plain(gh.last())
    check(c2['type'] == 'pause' and c2['pid'] == 's_5080' and c2['on'] is False, '다시 켜기 = pause{pid, on:false}(바로 보냄)')
    check('켜는 중' in page.inner_text('.pv-head'), "머리 '켜는 중' 알약")
    gh.app_round(do_pause)
    refresh(page)
    page.goto(BASE)
    page.wait_for_selector('.cards')
    card = page.locator('.card', has_text='RTX 5080').first.inner_text()
    check('다시 켰어요 · 세 마켓을 다시 모아 기준을 잡는 중이에요' in card and '이번 확인은 알림 없이 기준만 잡아요' in card, "다시 켠 뒤 '다시 잡는 중' 두 줄(보라)")
    check(page.locator('.card.paused').count() == 1, '다시 켠 물건은 켜 둔 목록으로')

    # ---------- 7. 모두 끔 ----------
    for p in gh.bundle['products']:
        paused(p, MADE - 3 * DAY)
    gh.bundle['feed'] = []
    gh.reseal()
    refresh(page)
    page.wait_for_timeout(200)
    check('모두 잠시 꺼 둠' in page.inner_text('#live'), "머리 '모두 잠시 꺼 둠'(민트 '감시 중' 아님)")
    check(page.locator('#live .dot.gray').count() == 1, '머리 점 회색')
    check('켜 둔 물건이 없어요. 아래에서 다시 켤 수 있어요.' in page.inner_text('#page'), "켜 둔 물건 0 글")
    shot(page, 'p04-all-paused')

    # ---------- 8. 좁은 폭 ----------
    page.set_viewport_size({'width': 360, 'height': 780})
    page.wait_for_timeout(200)
    sw = page.evaluate('() => document.documentElement.scrollWidth')
    check(sw <= 360, '좁은 폭(360)에서 가로 넘침 없음')
    shot(page, 'p05-narrow')

    bad = [e for e in errors if 'Content Security Policy' in e or 'pageerror' in e]
    check(not bad, '콘텐츠 보안 정책·페이지 오류 0 ' + json.dumps(bad, ensure_ascii=False)[:200])
    browser.close()

print('\n%d개 확인 통과 · 스크린샷 %s' % (len(OK), OUT))
