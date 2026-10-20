#!/usr/bin/env python3
"""웹 2판 화면 시험 (헤드리스 크로미움, 네트워크 없이 가짜 GitHub).

    pip install playwright && python3 -m playwright install chromium
    python3 test/view2.e2e.py [스크린샷 폴더]

시험 자료: test/fixtures/radar-bundle.sample.json (가짜 매물). 묶음 만든 때 2026-10-19 14:32(한국)에
브라우저 시계를 맞춰 정상·늦음·하루 넘음을 봐요. 잠근 상자는 collector/seal.mjs 로 그 자리에서 만들어요.
"""
import datetime as dt
import functools
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'junggo-view2-shots')
os.makedirs(OUT, exist_ok=True)
SAMPLE = json.load(open(os.path.join(REPO, 'test/fixtures/radar-bundle.sample.json'), encoding='utf-8'))
MADE = SAMPLE['made']
PW = 'e2e-비밀번호-777'
TOKEN = 'e2e-read-token'
OK = []


def check(cond, msg):
    if not cond:
        raise AssertionError('실패: ' + msg)
    OK.append(msg)
    print('ok -', msg)


# ---------- 사이트 폴더 ----------
site = tempfile.mkdtemp(prefix='jd2-site-')
for f in ('index.html', 'old.html', 'box.js', 'radar-view.js', 'radar-cmd.js', 'radar-ui.js'):
    shutil.copy(os.path.join(REPO, f), os.path.join(site, f))
for d in ('plain', 'v99', 'sealed', 'empty'):
    os.makedirs(os.path.join(site, d))
json.dump(SAMPLE, open(os.path.join(site, 'plain/radar.json'), 'w', encoding='utf-8'), ensure_ascii=False)
json.dump({**SAMPLE, 'v': 99}, open(os.path.join(site, 'v99/radar.json'), 'w', encoding='utf-8'), ensure_ascii=False)
# 잠근 상자 (수집기와 같은 잠금 — 앱 DashBox 와 같은 꼴)
SEAL = """
import { seal, deriveKey } from '%s/collector/seal.mjs';
import fs from 'node:fs';
const b = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const salt = 'MDEyMzQ1Njc4OWFiY2RlZg==';
const key = deriveKey(process.argv[3], salt, 100000);
process.stdout.write(JSON.stringify(seal(b, key, salt, 'junggo-radar-view', 100000)));
""" % REPO.replace('\\', '/')
seal_js = os.path.join(site, 'seal-run.mjs')
open(seal_js, 'w').write(SEAL)
BOXTXT = subprocess.check_output(['node', seal_js, os.path.join(site, 'plain/radar.json'), PW], text=True)
open(os.path.join(site, 'sealed/radar.enc'), 'w').write(BOXTXT)
os.remove(seal_js)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


Handler = functools.partial(Quiet, directory=site)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]


def at(minutes):
    return dt.datetime.fromtimestamp((MADE + minutes * 60e3) / 1000, tz=dt.timezone.utc)


errors = []


def new_page(ctx, minutes=3, gh=None):
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: %s' % e))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text and 'ERR_NAME' not in m.text and '404' not in m.text else None)
    page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page.route('**/fonts.gstatic.com/**', lambda r: r.abort())
    page.clock.set_fixed_time(at(minutes))
    if gh:
        page.route('https://api.github.com/**', gh)
    return page


def shot(page, name, full=True):
    page.screenshot(path=os.path.join(OUT, name + '.png'), full_page=full)


def text(page):
    return page.inner_text('body')


def shown(page):
    # 결과 화면 '매물 n건'(앱 결과 화면과 같은 수 — 지금 최저가 칸 매물 포함, 줄 목록엔 빠짐)
    import re
    m = re.search(r'매물 (\d+)건', page.inner_text('.sumline .n'))
    return int(m.group(1)) if m else -1


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900}, locale='ko-KR', timezone_id='Asia/Seoul')

    # ---------- 1. 첫 화면 (정상) ----------
    page = new_page(ctx, 3)
    page.goto(BASE + '?src=./plain')
    page.wait_for_selector('.cards')
    shot(page, '01-home')
    body = text(page)
    check(page.locator('.card').count() == 6, '물건 카드 6장')
    c4080 = page.locator('.card').nth(0)
    ct = c4080.inner_text()
    check('980,000원' in ct and '꿀매 -18%' not in ct and '-18%' in ct, '4080 지금 최저가 = 묶음의 lowKey 매물(980,000원, 배지 -18%)')
    check('1,000원' not in ct, '4080 최저가가 교환글 1,000원이 아님')
    check('정왕동 · ≈2.3km' in ct, "중고나라 어림 거리 '정왕동 · ≈2.3km'")
    check('시세 120만 · 판매완료 기준 18건 · 9일 만에 최저' in ct and '목표가 이하' in ct, '판단 재료 줄 = 앱 글 그대로')
    check('⚠ 더 싸 보이는 확인 필요 매물 2건(79만~)은 최저가에서 뺐어요' in ct, '⚠ 뺀 줄(카드) = 앱 글')
    check('가까운 당근 최저 101만 · 택배 최저 98만(중고나라)' in ct, '가까운/택배 줄 = 앱 글')
    check('98만' in ct and '101만' in ct and '108만' in ct and 'SUPER 121만' in ct, '마켓별·변형별 최저(만원 글)')
    check('6분 전 · 13건' in ct, "카드 머리 'n분 전 · n건'(확인 3분 전 + 시계 3분 뒤)")
    c5080 = page.locator('.card').nth(1).inner_text()
    check('믿을 만한 매물이 아직 없어요 · ⚠ 3건' in c5080 and '원' not in c5080.replace('물건 화면', ''), '모두 ⚠ 카드: 앱 문장, 가격 0개 (W2-2)')
    check('새 조건으로 시세를 다시 내는 중' in page.locator('.card').nth(2).inner_text(), '다시 내는 중 카드')
    check('조건에 맞는 매물이 없어요' in page.locator('.card').nth(4).inner_text(), '빈 결과 카드')
    check('곧 세 마켓을 확인해요' in page.locator('.card').nth(5).inner_text(), '확인 전 카드')
    check(page.locator('.card.has-honey').count() == 1, '꿀골드 테두리는 꿀매 있는 카드 하나만')
    check(page.locator('.feed-row').count() == 2 and page.locator('.feed-row.fresh').count() == 1, '새로 뜬 꿀매 2줄, 새로 1줄')
    check('감시 중 · 마지막 판정 14:32(3분 전) · 내 안드로이드' in page.inner_text('#live'), "머리 '감시 중 · 마지막 판정 14:32(3분 전)'")
    check(page.locator('.dot:not(.gray):not(.coral)').count() == 1, '민트 점 하나')
    for w in ('중앙값', '평균', '서두르세요', '실시간', '앱 판정 전 값', '시세보다 많이 쌈'):
        check(w not in body, "새 화면에 '%s' 0 (W2-5)" % w)
    # 꿀골드는 꿀매 자리에만 (W2-15)
    honey_bg = page.evaluate("""() => [...document.querySelectorAll('*')].filter(e => {
        const s = getComputedStyle(e); return s.backgroundColor === 'rgb(255, 194, 75)';
      }).map(e => e.className.baseVal !== undefined ? 'svg' : e.className)""")
    check(all('b-honey' in c for c in honey_bg), '꿀골드 채움은 꿀매 배지에만')

    # ---------- 2. 물건 화면 4080 ----------
    page.click('.card >> nth=0 >> text=결과 전체 보기 ›')
    page.wait_for_selector('.pv')
    shot(page, '02-product-4080')
    pt = text(page)
    check('지금 최저가' in pt and '980,000원' in pt, '물건 화면 지금 최저가')
    check("⚠ 더 싸 보이는 확인 필요 매물 2건은 '지금 최저가'에서 뺐어요(아래 목록에 있어요)" in pt, '⚠ 뺀 줄(물건 화면) = 앱 글')
    page.click('[data-act="ptab"][data-t="price"]')
    vc = page.locator('.vcut').all_inner_texts()
    check(len(vc) == 3 and vc[0].startswith('SUPER') and 'Ti' in vc[2] and '매물이 적어 판정 보류' in vc[2], '변형별 기준 줄 3개, 순서·보류 그대로 — 시세 탭(앱 PriceView RefCard 자리) (W2-3)')
    check('시세 · 보통(중간값)' in text(page) and '매물 절반이' in text(page), "시세 탭 요약 칸 '시세 · 보통(중간값)'(디자인 결정 3)")
    page.click('[data-act="ptab"][data-t="list"]')
    check('이 물건은 중고나라가 보통(중간값) 4% 싸요(최근 30일)' in pt, "'보통(중간값)' 줄 = 앱 글")
    check(shown(page) == 13 and page.locator('.rows .row').count() == 12, '매물 13건 = 지금 최저가 1 + 줄 12(앱처럼 최저가는 줄에서 뺌)')
    cau = page.locator('.row:has(.b-caution)')
    check(cau.count() == 2, '회색 ⚠ 2줄')
    check(page.locator('.row:has(.b-caution) .rs.why').count() == 2, '⚠ 줄마다 이유 글')
    check('빼기: 본체 · 노트북 · 완본체' in pt, '조건 요약 칩')
    # ⚠ 뺀 줄 누르면 그 매물로
    page.click('button.note.link')
    page.wait_for_timeout(100)
    check(page.locator('.row.flash').count() == 1 and 'RTX 4080 SUPER 미개봉' in page.locator('.row.flash').inner_text(), '⚠ 뺀 줄 → 첫 ⚠ 매물로 가서 테두리')

    # 지역 거르기 (W2-17)
    page.click('[data-act="area"][data-a="5"]')
    page.wait_for_timeout(50)
    shot(page, '03-product-5km')
    s = page.inner_text('.sumline .n')
    check(shown(page) == 10 and '5km 안(지역 모름 5건 포함)' in s and '기준 정왕동' in s, '5km 안 + 함께 보기(기본 켬) 10건 (지역 칩 줄 — 앱처럼)')
    page.click('[data-act="withUnknown"]')
    page.wait_for_timeout(50)
    check(shown(page) == 5 and '지역 모름 5건은 숨겼어요' in text(page), '함께 보기 끄면 5건, 숨긴 수 줄')
    page.click('[data-act="withUnknown"]')
    check(shown(page) == 10, "'함께 보기' 다시 켜면 10건")
    page.click('[data-act="area"][data-a="near"]')
    page.click('[data-act="withUnknown"]')
    check(shown(page) == 4, '가까운 동네만 4건')
    page.click('[data-act="withUnknown"]')
    page.click('[data-act="area"][data-a="all"]')
    page.click('.mchip.b')
    check(shown(page) == 4 and page.locator('.mchip.b[aria-checked="true"]').count() == 1, '마켓 하나 고르기: 번개장터만 4건 (앱 = 웹, 대표 결정 6)')
    page.click('.mchip.j')
    check(shown(page) == 6 and page.locator('.mchip[aria-checked="true"]').count() == 1, '다른 마켓을 누르면 그 마켓 하나만(중고나라 6건)')
    page.click('.mchip.j')
    check(shown(page) == 13 and page.locator('.mchip.all[aria-checked="true"]').count() == 1, '고른 마켓을 다시 누르면 전체')
    check('중고나라' in page.inner_text('.mchip.j') and not any(ch.isdigit() for ch in page.inner_text('.mchip.j')), '마켓 칩에 건수 없음(결정 4)')
    page.fill('#fQ', 'super')
    check(shown(page) == 4, "찾기 'super' 4건")
    page.fill('#fQ', '없는말')
    check('거르기에 맞는 매물이 없어요' in text(page), '거르기 0건 안내')
    page.click('[data-act="clearF"]')
    check(shown(page) == 13, '거르기 풀기')
    hrefs = page.eval_on_selector_all('.row a[href]', 'els => els.map(e => [e.getAttribute("href"), e.target, e.rel])')
    check(all(h[0].startswith('https://') and h[1] == '_blank' and 'noopener' in h[2] for h in hrefs), '원 매물은 새 창(https, noopener)')
    with page.expect_download() as dl:
        page.click('[data-act="csv"]')
    csvtxt = open(dl.value.path(), encoding='utf-8-sig').read()
    check(csvtxt.count('\n') == 14 and '기가바이트 RTX 4080 윈드포스 V2 16G' in csvtxt, 'CSV 13줄 + 머리')

    # 변형 칩 (앱 결과 화면 변형 칩과 같은 거르기 — 0.7.1.1 앱 = 웹)
    check(page.locator('[data-act="variant"]').all_inner_texts() == ['SUPER', '기본'], '변형 칩 SUPER · 기본 (앱과 같은 순서)')
    check(page.locator('[data-act="cond"]').all_inner_texts() == ['미개봉', '중고'], '미개봉 · 중고 칩(앱 R5)')
    page.click('[data-act="variant"][data-v="SUPER"]')
    page.wait_for_timeout(50)
    shot(page, '03b-product-variant')
    check(shown(page) == 6 and 'SUPER 매물 6건' in page.inner_text('.sumline .n') and page.locator('[data-act="variant"][aria-pressed="true"]').count() == 1, "변형 'SUPER' 6건")
    hb = page.inner_text('#page')
    check(page.inner_text('.hero .price') == '1,210,000원' and '확인 필요 매물 2건은' in hb and '▼ 3만' not in hb, "SUPER 칩 → 지금 최저가 = SUPER 믿을 만한 첫째 121만 · ⚠ 2건 (앱 결과 화면과 같게)")
    page.click('.mchip.b')
    check(shown(page) == 3, 'SUPER + 번개장터만 3건')
    check(page.inner_text('.hero .price') == '1,260,000원' and '확인 필요 매물 1건은' in page.inner_text('#page'), 'SUPER + 번개장터만 → 지금 최저가 126만 · ⚠ 1건')
    page.click('.mchip.b')
    page.click('[data-act="variant"][data-v="SUPER"]')
    check(shown(page) == 13 and page.locator('[data-act="variant"][aria-pressed="true"]').count() == 0, '같은 칩 다시 누르면 풀림')
    check(page.inner_text('.hero .price') == '980,000원' and '▼ 3만' in page.inner_text('section.box[aria-label="지금 최저가"]'), '칩을 풀면 묶음 지금 최저가 그대로(▼ 3만)')
    page.click('[data-act="variant"][data-v="기본"]')
    check(shown(page) == 7, "변형 '기본' 7건")
    page.click('[data-act="cond"][data-c="new"]')
    page.click('[data-act="variant"][data-v="기본"]')
    check(shown(page) == 2, "미개봉만 2건(SUPER 미개봉 2) — 앱 COND_NEW")
    page.click('[data-act="cond"][data-c="new"]')

    # 다른 물건들
    page.click('[data-pick="s_5080"]')
    page.wait_for_timeout(50)
    shot(page, '04-product-5080')
    t5 = text(page)
    check('믿을 만한 매물이 아직 없어요 · ⚠ 확인 필요 3건(아래 목록에 있어요)' in t5, '모두 ⚠ 물건 화면 문장 (W2-2)')
    check(page.locator('.hero').count() == 0, '모두 ⚠ → 최저가 칸 가격 없음')
    check(page.locator('[data-act="variant"]').count() == 0 and shown(page) == 3, '변형이 하나면 칩 없음, 다른 물건으로 가면 변형 거르기 풀림')
    page.click('[data-pick="s_ps5"]')
    page.wait_for_timeout(50)
    shot(page, '05-product-ps5')
    tp = text(page)
    check('타이어 · 미쉐린 · 미세린 · m.2 · nvme · 글래스 · 게임패드 · 조이스틱 · 레이싱휠 · vr2 · 리모트플레이어' in tp, '플스5 빼기 단어 11개 (W2-6)')
    check(page.locator('.badge').count() == 0, '다시 내는 중 → 배지 없음')
    page.click('[data-pick="s_9070"]')
    page.wait_for_timeout(50)
    check(page.locator('.hero .badge').count() == 0 and '시세를 낼 매물이 아직 적어요(5건 미만)' in text(page), '판정 보류 → 배지 없음 + 이유 글')
    # 같은 글 묶음(dupRows): 앱처럼 마켓마다 센다(QA-1)
    check(shown(page) == 3, '같은 글 묶음: 전체 3건')
    page.click('.mchip.b')
    check(shown(page) == 2 and page.locator('.row a[href*="products/1999"]').count() + (1 if 'products/1999' in page.inner_html('section.box[aria-label="지금 최저가"]') else 0) == 1, '번개장터만: 같은 글의 번개장터 매물이 줄로(같은 글도 셈 — QA-1)')
    check(page.inner_text('.hero .price') == '780,000원' and '번개장터' in page.inner_text('.hero .meta'), '번개장터만 → 지금 최저가도 번개장터 매물')
    page.click('.mchip.b')

    # ---------- 3. 관심 · 알림함 · 수집 상태 ----------
    page.click('.tab[data-go="watch"]')
    page.wait_for_selector('.sec-title:has-text("관심 매물")')
    shot(page, '06-watch')
    tw = text(page)
    check('▼ 지켜본 뒤 -4만' in tw and '같은 물건 최저보다 +23만' in tw and '끝남' in tw, '관심 매물: 변동·차이·끝남')
    page.click('.tab[data-go="inbox"]')
    page.wait_for_selector('.irow')
    shot(page, '07-inbox')
    rows = page.locator('.irow').all_inner_texts()
    check(len(rows) == 8, '알림함 8줄 = 묶음 순서')
    check('요약에 담아요' in rows[0] and '앱에서 봄' in rows[2] and '조용한 시간 — 아침에' in rows[5], '알림함 꼬리표 (W2-4)')
    days = page.locator('.day').all_inner_texts()
    check(days == ['오늘', '어제'], "날짜 묶음 '오늘'·'어제'")
    check(page.locator('.irow.honey').count() == 1, '꿀매 줄만 꿀골드 아이콘')
    page.click('.tab[data-go="settings"]')
    page.wait_for_selector('#s-status')
    shot(page, '08-status')
    ts = text(page)
    check('늦음 기준 45분' in ts and '오류 기록 0건' in ts and '보통 · 와이파이 15분마다' in ts, '수집 상태: 앱 칸')
    gaps = page.locator('.gap-row').all_inner_texts()
    check(len(gaps) == 2 and '10월 18일 02:10 ~ 10월 18일 07:40 · 5시간 30분' in gaps[0], '7일 올림 공백 2개')
    check('CC BY 4.0' in ts, '지역 표 출처 표기')
    page.close()

    # ---------- 4. 늦음 · 하루 넘음 · 띠 (W2-8) ----------
    page = new_page(ctx, 46)
    page.goto(BASE + '?src=./plain')
    page.wait_for_selector('.cards')
    shot(page, '09-late')
    b = page.inner_text('#banners')
    check('폰이 14:32 뒤로 결과를 올리지 않았어요(46분 전). 아래는 그때 기준이에요.' in b, '46분 → 늦음 띠')
    check('그때 최저가' in text(page) and '그때 기준' in text(page), "'그때 최저가'·꿀매 '그때 기준'")
    check(page.locator('#live .dot.gray').count() == 1, '민트 → 회색')
    page.close()
    saver = {**SAMPLE, 'everyMin': 55}
    page = new_page(ctx, 100)
    page.route('**/plain/radar.json*', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(saver)))
    page.goto(BASE + '?src=./plain')
    page.wait_for_selector('.cards')
    check(page.inner_text('#banners') == '' and page.locator('#live .dot.gray').count() == 0, '절약·데이터 100분 전 → 정상')
    page.close()
    page = new_page(ctx, 25 * 60)
    page.goto(BASE + '?src=./plain')
    page.wait_for_selector('.cards')
    shot(page, '10-day')
    check(page.locator('.home.stale-day').count() == 1 and '팔렸을 수 있어요' in text(page), '25시간 → 흐림 + 팔렸을 수 있어요')
    page.close()
    flags = {**SAMPLE, 'notifOn': False, 'stall': {'title': '확인이 3시간째 멈췄어요', 'text': '폰이 배터리를 아끼려고 레이더를 멈춘 것 같아요 · 앱 설정에서 예외를 켜 주세요'},
             'markets': [{**SAMPLE['markets'][0]}, {'m': 'd', 'okAt': MADE - 43 * 60e3, 'text': '마켓이 잠시 막았어요 — 15:10에 다시 해요', 'bad': True, 'banner': '당근 확인이 막힌 것 같아요'}, {**SAMPLE['markets'][2]}]}
    page = new_page(ctx, 3)
    page.route('**/plain/radar.json*', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(flags)))
    page.goto(BASE + '?src=./plain')
    page.wait_for_selector('.cards')
    shot(page, '11-banners')
    b = page.inner_text('#banners')
    check('폰 알림이 꺼져 있어요' in b and '확인이 3시간째 멈췄어요' in b and '당근 확인이 막힌 것 같아요' in b, '알림 꺼짐(F5)·멈춤·마켓 막힘 띠')
    check(page.locator('#live .dot.coral').count() == 1, '멈춤 → 코랄 점')
    page.close()

    # ---------- 5. 판 다름 ----------
    page = new_page(ctx, 3)
    page.goto(BASE + '?src=./v99')
    page.wait_for_selector('text=앱과 웹 판이 맞지 않아요')
    shot(page, '12-version', False)
    check(True, '꼴 번호 99 → 판 다름 안내')
    page.close()

    # ---------- 6. 잠근 상자 (시험 폴더) ----------
    page = new_page(ctx, 3)
    page.goto(BASE + '?src=./sealed')
    page.wait_for_selector('#lockForm')
    check(page.locator('#lkTok').count() == 0, '시험 폴더 잠금: 토큰 칸 없음')
    page.fill('#pw', 'wrong')
    page.click('#unlock')
    page.wait_for_selector('#pwErr:not([hidden])')
    check('비밀번호가 맞지 않아요' in page.inner_text('#pwErr'), '틀린 비밀번호 → 안내')
    page.fill('#pw', PW)
    page.click('#unlock')
    page.wait_for_selector('.cards')
    check(True, 'junggo-radar-view 상자를 비밀번호로 열기 (W2-10 페이지 쪽)')
    page.reload()
    page.wait_for_selector('.cards')
    check(True, "'이 기기 기억' 열쇠로 다시 열기")
    page.close()

    # ---------- 7. GitHub 판: 처음 연결 → 기억 → 토큰 막힘 · 아직 안 올림 ----------
    gh_state = {'mode': 'ok', 'calls': []}

    def gh(route):
        req = route.request
        gh_state['calls'].append((req.url, req.headers.get('authorization', '')))
        auth = req.headers.get('authorization', '')
        if auth != 'Bearer ' + TOKEN or gh_state['mode'] == '401':
            return route.fulfill(status=401, body='{}', headers={'access-control-allow-origin': '*'})
        if '/contents/radar.enc' in req.url:
            if gh_state['mode'] == 'missing':
                return route.fulfill(status=404, body='{}', headers={'access-control-allow-origin': '*'})
            return route.fulfill(status=200, body=BOXTXT, headers={'access-control-allow-origin': '*', 'content-type': 'application/vnd.github.raw+json'})
        return route.fulfill(status=200, body='{"private":true}', headers={'access-control-allow-origin': '*'})

    ctx2 = browser.new_context(viewport={'width': 1280, 'height': 900}, locale='ko-KR', timezone_id='Asia/Seoul')
    page = new_page(ctx2, 3, gh)
    page.goto(BASE)
    page.wait_for_selector('#lockForm')
    shot(page, '13-lock-first', False)
    check(page.locator('#lkTok').count() == 1 and page.input_value('#lkRepo') == '20130721pk-a11y/junggo-dash-data', '처음: 저장소·토큰 칸(기본 junggo-dash-data)')
    page.fill('#pw', PW)
    page.fill('#lkTok', 'wrong-token')
    page.click('#unlock')
    page.wait_for_selector('#pwErr:not([hidden])')
    check('토큰이 맞지 않거나 기한이 지났어요' in page.inner_text('#pwErr'), '틀린 토큰 → 안내')
    page.fill('#pw', PW)
    page.fill('#lkTok', TOKEN)
    page.click('#unlock')
    page.wait_for_selector('.cards')
    check(any('/repos/20130721pk-a11y/junggo-dash-data/contents/radar.enc?ref=view' in u for u, _ in gh_state['calls']), 'view 가지 radar.enc 를 받음')
    stored = page.evaluate("() => localStorage.getItem('jd.rtok')")
    check(stored and TOKEN not in stored and 'junggo-dash-data' in stored, '토큰은 잠가서만 저장(이 기기, 날 글 없음)')
    check(TOKEN not in page.evaluate("() => JSON.stringify(localStorage)"), 'localStorage 어디에도 토큰 날 글 없음')
    page.reload()
    page.wait_for_selector('.cards')
    check(True, '다시 열면 비밀번호 없이(기억한 열쇠 → 잠근 토큰 → 받기)')
    gh_state['mode'] = '401'
    page.reload()
    page.wait_for_selector('text=웹 토큰이 막혔어요')
    shot(page, '14-token', False)
    check(True, '401 → 토큰 막힘 안내')
    page.click('[data-act="retok"]')
    page.wait_for_selector('#lkTok')
    check(True, "'토큰 다시 넣기' → 토큰 칸")
    gh_state['mode'] = 'missing'
    page.fill('#pw', PW)
    page.fill('#lkTok', TOKEN)
    page.click('#unlock')
    page.wait_for_selector('text=앱이 아직 결과를 올리지 않았어요')
    shot(page, '15-first', False)
    check(page.locator('a[href^="./old.html"]').count() >= 1, '아직 안 올림 → 예전 보기 단추')
    # 지역 표를 받지 않음 (W2-18)
    check(not any('places' in u for u, _ in gh_state['calls']), '지역 표 요청 0')
    page.close()
    ctx2.close()

    # ---------- 8. 좁은 폭 · 글자 크게 ----------
    m = browser.new_context(viewport={'width': 390, 'height': 844}, locale='ko-KR', timezone_id='Asia/Seoul', device_scale_factor=2)
    page = new_page(m, 3)
    page.goto(BASE + '?src=./plain')
    page.wait_for_selector('.cards')
    shot(page, '16-mobile-home')
    sw = page.evaluate('() => document.documentElement.scrollWidth')
    check(sw <= 390, '휴대폰 폭에서 가로 밀림 없음 (첫 화면)')
    check(page.evaluate("() => getComputedStyle(document.querySelector('.tabs')).position") == 'fixed', '좁은 폭: 탭이 아래 고정 막대')
    page.goto(BASE + '?src=./plain#p=s_4080')
    page.wait_for_selector('.pv')
    shot(page, '17-mobile-product')
    check(page.evaluate('() => document.documentElement.scrollWidth') <= 390, '휴대폰 폭에서 가로 밀림 없음 (물건 화면)')
    page.close()
    m.close()
    page = new_page(ctx, 3)
    page.goto(BASE + '?src=./plain#p=s_4080')
    page.wait_for_selector('.pv')
    page.evaluate("() => document.documentElement.style.fontSize = '200%'")
    page.wait_for_timeout(50)
    shot(page, '18-zoom200')
    check(page.evaluate('() => document.documentElement.scrollWidth') <= 1280, '글자 200%에서 가로 밀림 없음')
    page.close()
    browser.close()

srv.shutdown()
bad = [e for e in errors if 'Failed to load resource' not in e]
if bad:
    print('\n'.join(bad))
    raise SystemExit('페이지 오류 %d건' % len(bad))
print('\n%d개 확인 통과 · 스크린샷 %s' % (len(OK), OUT))
